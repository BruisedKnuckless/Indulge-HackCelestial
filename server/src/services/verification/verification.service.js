import crypto from 'crypto';
import VerificationRequest, {
  FINAL_VERIFICATION_STATUSES,
  OPEN_VERIFICATION_STATUSES,
  PARAMETER_RESULTS,
  EVIDENCE_TYPES,
} from '../../models/VerificationRequest.js';
import InspectionProtocol from '../../models/InspectionProtocol.js';
import Resource from '../../models/Resource.js';
import User from '../../models/User.js';
import Booking from '../../models/Booking.js';
import { generateForResource } from '../../ml/inspection/generate.js';
import { aiConfig } from '../../ml/inspection/ai.js';
import { env } from '../../config/env.js';
import { generateInspectionGuidelines } from './guideline.service.js';
import { generatePriceRecommendation } from './pricing-recommendation.service.js';
import { scoreInspection, submissionProblems, compareInspections } from './scoring.js';
import { recordCustody, ensureListingCreatedEvent } from './custody.service.js';
import { notify } from '../notification.service.js';
import { logger } from '../../utils/logger.js';
import { HttpError } from '../../middleware/error.middleware.js';

/**
 * Physical verification is optional, and it's the lister's choice among
 * three paths (Resource.verificationMethod):
 *
 *   indulge_technician  — Indulge arranges a technician; this file's existing
 *                          protocol → assign → inspect → score pipeline runs
 *                          exactly as before, plus a simulated fee.
 *   external_technician — the lister arranges their own; Indulge records
 *                          whatever they submit but never scores or vouches
 *                          for it. Status is 'externally_verified', a status
 *                          the Indulge-run pipeline can never produce.
 *   none                 — the default; the listing simply stays 'unverified'.
 */

/**
 * Listing inspections: protocol generation, technician execution, scoring,
 * return comparison and dispute resolution.
 *
 *   AI (ml/inspection) generates the protocol — what to check.
 *   The technician physically checks it and records evidence.
 *   This service is the only place results become a listing's verification
 *   status; nothing a client sends can set a score or a decision directly.
 */

/** Physical goods only: halls, parking, kitchen hours and crew are not inspected. */
export const INSPECTABLE_CATEGORIES = ['furniture', 'av_equipment', 'vehicle', 'other'];
export const isInspectable = (resource) => INSPECTABLE_CATEGORIES.includes(resource?.category);

export const PUBLIC_DISCLAIMER =
  'This badge records what an Indulge technician physically checked at the time of inspection. It is not a guarantee of future condition.';

const technicianName = (u) => u?.inspectorProfile?.displayName || u?.businessName || 'Indulge technician';
const newEvidenceId = () => `EV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/* ------------------------------------------------------------------ */
/* Protocol generation                                                  */
/* ------------------------------------------------------------------ */

/** Last-resort protocol from the category templates, used only if ml/inspection throws. */
async function templateFallbackProtocol(resource, err) {
  const { templateId, parameters } = await generateInspectionGuidelines({
    category: resource.category,
    resourceType: resource.category,
    resourceName: resource.title,
    description: resource.description,
    metadata: { totalQuantity: resource.totalQuantity, unit: resource.unit, pricing: resource.pricing },
  });
  return {
    protocolId: `tpl-${templateId}-${Date.now().toString(36)}`,
    productName: resource.title,
    productCategory: resource.category,
    categoryLabel: resource.category,
    parameters: parameters.map((p) => ({
      id: p.id,
      category: p.category,
      title: p.name,
      description: p.description,
      instructions: [p.description],
      expectedResult: 'No defect found.',
      verificationType: 'visual',
      required: p.required,
      requiresEvidenceOnFail: Boolean(p.evidenceRequired),
      weight: Math.max(1, Math.round((Number(p.weight) || 0.1) * 10)),
      priority: p.required ? 'high' : 'medium',
      appliesTo: 'every_unit',
      generationSource: 'baseline',
      basis: ['template'],
      reason: `Category template ${templateId} (protocol generator unavailable).`,
    })),
    generation: {
      mode: 'category_template_fallback',
      error: err?.message || String(err),
      generationTimestamp: new Date().toISOString(),
    },
    disclaimer:
      'Generated inspection protocol: it lists what a technician must physically check. It does not verify the product.',
    generator: 'category_template',
  };
}

/**
 * Generate and store the active protocol for a listing, superseding any
 * previous one. `ai: false` forces the deterministic baseline (seed, tests).
 */
export async function generateProtocolForResource(resource, { ai } = {}) {
  let out;
  try {
    out = await generateForResource(resource, ai === false ? { ai: false } : {});
    out.generator = 'ml_inspection';
  } catch (err) {
    logger.warn('Inspection protocol generator failed; using category template', {
      resourceId: String(resource._id),
      error: err.message,
    });
    out = await templateFallbackProtocol(resource, err);
  }

  const previous = await InspectionProtocol.findOne({ resource: resource._id, status: 'active' }).sort('-version');
  if (previous) {
    previous.status = 'superseded';
    await previous.save();
  }

  return InspectionProtocol.create({
    resource: resource._id,
    provider: resource.owner,
    protocolId: out.protocolId,
    version: (previous?.version || 0) + 1,
    productName: out.productName,
    productCategory: out.productCategory,
    categoryLabel: out.categoryLabel,
    input: out.product,
    claims: out.claims,
    attributes: out.attributes,
    classification: out.classification,
    inspectionScope: out.inspectionScope,
    parameters: out.parameters,
    summary: out.summary,
    validation: out.validation,
    generation: out.generation,
    generator: out.generator,
    disclaimer: out.disclaimer,
  });
}

/** Protocol parameters → blank inspection checklist. */
export function checklistFromProtocol(protocol) {
  return protocol.parameters.map((p) => ({
    id: p.id,
    name: p.title,
    description: p.description || '',
    category: p.category || 'other',
    instructions: p.instructions || [],
    expectedResult: p.expectedResult || '',
    verificationType: p.verificationType || 'visual',
    claimedValue: p.claimedValue ?? null,
    verificationInstruction: p.verificationInstruction ?? null,
    required: p.required !== false,
    requiresEvidenceOnFail: Boolean(p.requiresEvidenceOnFail),
    requiresQualifiedInspector: Boolean(p.requiresQualifiedInspector),
    weight: Number(p.weight) || 1,
    priority: p.priority || 'medium',
    appliesTo: p.appliesTo || 'every_unit',
    generationSource: p.generationSource || 'baseline',
    reason: p.reason || '',
  }));
}

/**
 * New listing → protocol → pending inspection (no technician until an admin
 * assigns one). Never throws: listing creation must not fail because of it.
 */
export async function createVerificationForResource(resource, user, { ai, requestedBy } = {}) {
  if (!isInspectable(resource)) return null;
  try {
    const protocol = await generateProtocolForResource(resource, { ai });
    const feeAmount = env.verificationFeeInr;
    const now = new Date();
    const vr = await VerificationRequest.create({
      kind: 'initial',
      resource: resource._id,
      provider: resource.owner || user?._id,
      requestedBy: requestedBy || user?._id || resource.owner || null,
      protocol: protocol._id,
      category: resource.category,
      inspectionCategory: protocol.productCategory,
      resourceName: resource.title,
      status: 'pending',
      generatedTemplateId: protocol.protocolId,
      parameters: checklistFromProtocol(protocol),
      location: { address: resource.location?.address || '', city: resource.location?.city || '' },
      quantity: resource.totalQuantity || 1,
      listedPrice: resource.pricing?.basePrice || 0,
      priceUnit: resource.pricing?.priceUnit || 'per_day',
      // Simulated, like every payment on Indulge — there is no gateway here,
      // the fee is charged the moment Indulge verification is requested.
      fee: { amount: feeAmount, currency: 'INR', status: feeAmount > 0 ? 'simulated_paid' : 'none', chargedAt: feeAmount > 0 ? now : null },
    });

    await Resource.findByIdAndUpdate(resource._id, {
      verificationMethod: 'indulge_technician',
      verificationStatus: 'pending',
      verificationId: vr._id,
    });

    const actor = { actorType: 'provider', actor: resource.owner, actorName: user?.businessName };
    await ensureListingCreatedEvent(resource, actor);
    await recordCustody({
      resource: resource._id,
      inspection: vr._id,
      event: 'verification_method_selected',
      ...actor,
      details: { method: 'indulge_technician', inspectionId: vr.inspectionId },
    });
    if (feeAmount > 0) {
      await recordCustody({
        resource: resource._id,
        inspection: vr._id,
        event: 'verification_fee_charged',
        ...actor,
        details: { inspectionId: vr.inspectionId, amount: feeAmount, currency: 'INR', status: 'simulated_paid' },
      });
    }
    await recordCustody({
      resource: resource._id,
      event: 'protocol_generated',
      actorType: 'system',
      details: {
        protocolId: protocol.protocolId,
        version: protocol.version,
        generator: protocol.generator,
        mode: protocol.generation?.mode,
        aiStatus: protocol.generation?.ai?.status || null,
        parameters: protocol.parameters.length,
      },
    });
    await recordCustody({
      resource: resource._id,
      inspection: vr._id,
      event: 'inspection_created',
      actorType: 'system',
      details: { inspectionId: vr.inspectionId, kind: 'initial' },
    });
    return vr;
  } catch (err) {
    logger.error('Inspection not created for listing', { resourceId: String(resource?._id), error: err.message });
    return null;
  }
}

/**
 * Lister-facing: request an Indulge technician for a listing that doesn't
 * already have one open. Used both right after creation (verificationMethod
 * chosen at listing time) and later, on a listing that started out
 * unverified or externally verified — "upgrading" to Indulge verification is
 * always allowed; it just can't run twice at once.
 */
export async function requestIndulgeVerification(resource, user) {
  if (!isInspectable(resource)) throw new HttpError(400, 'This listing is not a physical item, so it has no physical verification.');
  const open = await VerificationRequest.findOne({
    resource: resource._id,
    kind: 'initial',
    status: { $in: OPEN_VERIFICATION_STATUSES },
  });
  if (open) throw new HttpError(409, `${open.inspectionId} is already open for this listing.`);
  const vr = await createVerificationForResource(resource, user, { requestedBy: user._id });
  if (!vr) throw new HttpError(500, 'The verification request could not be created.');
  return vr;
}

/**
 * Lister-facing: create the (empty, awaiting-report) record for a listing
 * whose owner will arrange their own technician. Called when that method is
 * chosen, so the listing has a concrete, audited record from the moment of
 * choice — not only once a report is eventually submitted.
 */
export async function createExternalVerificationRecord(resource, user) {
  if (!isInspectable(resource)) return null;
  const vr = await VerificationRequest.create({
    kind: 'external',
    resource: resource._id,
    provider: resource.owner,
    requestedBy: user?._id || resource.owner,
    category: resource.category,
    resourceName: resource.title,
    status: 'pending',
    location: { address: resource.location?.address || '', city: resource.location?.city || '' },
    quantity: resource.totalQuantity || 1,
  });
  await Resource.findByIdAndUpdate(resource._id, {
    verificationMethod: 'external_technician',
    verificationStatus: 'unverified',
    verificationId: vr._id,
  });
  await ensureListingCreatedEvent(resource, { actor: resource.owner, actorName: user?.businessName });
  await recordCustody({
    resource: resource._id,
    inspection: vr._id,
    event: 'verification_method_selected',
    actorType: 'provider',
    actor: resource.owner,
    actorName: user?.businessName,
    details: { method: 'external_technician', inspectionId: vr.inspectionId },
  });
  return vr;
}

/**
 * Lister submits the report/evidence from a technician they arranged
 * themselves. This never runs Indulge's checklist and never scores anything
 * — Indulge is recording what was reported, not vouching for it. One call
 * both attaches whatever evidence came with it and finalises the record;
 * blocked once the listing has actually chosen the Indulge path, so an
 * external report can never silently downgrade or shadow a real Indulge
 * verification.
 */
export async function submitExternalVerification(resource, user, { technicianName, company, contact, note, evidence } = {}) {
  if (!isInspectable(resource)) throw new HttpError(400, 'This listing is not a physical item, so it has no physical verification.');
  if (resource.verificationMethod === 'indulge_technician') {
    throw new HttpError(409, 'This listing already uses Indulge technician verification.');
  }
  if (!String(technicianName || '').trim()) throw new HttpError(400, 'The technician or inspector’s name is required.');
  if (!String(note || '').trim()) throw new HttpError(400, 'Describe what the inspection found.');

  let vr = resource.verificationId
    ? await VerificationRequest.findOne({ _id: resource.verificationId, resource: resource._id, kind: 'external' })
    : null;
  if (!vr) vr = await VerificationRequest.findOne({ resource: resource._id, kind: 'external' }).sort('-createdAt');
  if (!vr) vr = await createExternalVerificationRecord(resource, user);
  if (vr.status === 'externally_verified') throw new HttpError(409, 'An external verification has already been submitted for this listing.');

  const evidenceItems = [];
  if (Array.isArray(evidence)) {
    for (const e of evidence) {
      if (!e?.type || !EVIDENCE_TYPES.includes(e.type)) continue;
      if ((e.type === 'photo' || e.type === 'video') && !e.url) continue;
      if (e.type === 'note' && !String(e.text || '').trim()) continue;
      if (e.type === 'measurement' && !String(e.value ?? '').trim()) continue;
      evidenceItems.push({
        evidenceId: newEvidenceId(),
        parameterId: 'external_report',
        type: e.type,
        url: e.url || null,
        text: String(e.text || '').slice(0, 2000),
        value: e.value != null ? String(e.value).slice(0, 100) : null,
        unit: e.unit ? String(e.unit).slice(0, 20) : null,
        technician: user._id,
        capturedAt: new Date(),
      });
    }
  }

  vr.externalTechnician = {
    name: String(technicianName).trim().slice(0, 120),
    company: company ? String(company).trim().slice(0, 120) : null,
    contact: contact ? String(contact).trim().slice(0, 80) : null,
  };
  vr.inspectorNotes = String(note).trim().slice(0, 4000);
  if (evidenceItems.length) vr.evidence.push(...evidenceItems);
  vr.status = 'externally_verified';
  vr.completedAt = new Date();
  await vr.save();

  await Resource.findByIdAndUpdate(resource._id, {
    verificationMethod: 'external_technician',
    verificationStatus: 'externally_verified',
    verificationId: vr._id,
    verifiedAt: vr.completedAt,
  });

  await recordCustody({
    resource: resource._id,
    inspection: vr._id,
    event: 'external_verification_submitted',
    actorType: 'provider',
    actor: resource.owner,
    actorName: user?.businessName,
    evidence: evidenceItems.map((e) => e.evidenceId),
    details: {
      inspectionId: vr.inspectionId,
      technicianName: vr.externalTechnician.name,
      company: vr.externalTechnician.company,
      evidenceCount: vr.evidence.length,
    },
  });
  return vr;
}

/**
 * A seeker asking the lister to get a listing Indulge-verified. This never
 * creates a verification record or charges a fee itself — only the listing's
 * own owner can do that (requestIndulgeVerification) — it just notifies them.
 */
export async function nudgeIndulgeVerification(resource, seeker) {
  if (!isInspectable(resource)) throw new HttpError(400, 'This listing is not a physical item, so it has no physical verification.');
  if (String(resource.owner) === String(seeker._id)) throw new HttpError(400, 'You already own this listing.');
  await notify({
    user: resource.owner,
    type: 'inspection_update',
    title: 'A seeker asked about Indulge verification',
    message: `${seeker.businessName} would like "${resource.title}" to be Indulge Verified before booking.`,
    dedupWindowMs: 6 * 3600 * 1000,
  }).catch(() => {});
}

/** Whether listing creation should wait for generation (only when no LLM call is involved). */
export const protocolGenerationIsSlow = () => aiConfig().enabled;

/* ------------------------------------------------------------------ */
/* Assignment                                                           */
/* ------------------------------------------------------------------ */

export async function assignTechnician(vr, technicianId, admin, { scheduledAt } = {}) {
  if (vr.kind === 'external') throw new HttpError(400, 'This is an externally-verified record; there is no Indulge technician to assign.');
  if (FINAL_VERIFICATION_STATUSES.includes(vr.status)) throw new HttpError(409, 'This inspection is already complete.');
  const tech = await User.findById(technicianId);
  if (!tech || tech.userType !== 'inspector') throw new HttpError(400, 'Choose an Indulge technician account.');
  if (tech.suspended) throw new HttpError(400, 'That technician account is suspended.');

  vr.assignedTechnician = {
    id: tech._id,
    name: technicianName(tech),
    badge: tech.inspectorProfile?.title || 'Field Technician',
    phone: tech.phone || null,
    assignedAt: new Date(),
    assignedBy: admin?._id || null,
  };
  if (scheduledAt) vr.scheduledAt = new Date(scheduledAt);
  if (vr.status === 'pending') vr.status = 'assigned';
  await vr.save();

  await recordCustody({
    resource: vr.resource,
    booking: vr.booking,
    inspection: vr._id,
    event: 'technician_assigned',
    actorType: admin ? 'admin' : 'system',
    actor: admin?._id,
    actorName: admin?.name || '',
    details: { inspectionId: vr.inspectionId, technician: vr.assignedTechnician.name, technicianId: String(tech._id) },
  });
  await notify({
    user: tech._id,
    type: 'inspection_update',
    title: `New inspection ${vr.inspectionId}`,
    message: `${vr.resourceName} has been assigned to you${vr.kind === 'return' ? ' (return inspection)' : ''}.`,
  }).catch(() => {});
  return vr;
}

/* ------------------------------------------------------------------ */
/* Technician execution                                                 */
/* ------------------------------------------------------------------ */

/**
 * Load an inspection for the signed-in technician. Anything not assigned to
 * them is reported as not found, so ids cannot be probed.
 */
export async function loadAssignedInspection(idOrCode, technician) {
  const filter = /^INS-\d+$/i.test(idOrCode)
    ? { inspectionId: idOrCode.toUpperCase() }
    : /^[a-f0-9]{24}$/i.test(idOrCode)
      ? { _id: idOrCode }
      : null;
  if (!filter) throw new HttpError(404, 'Inspection not found.');
  const vr = await VerificationRequest.findOne({ ...filter, 'assignedTechnician.id': technician._id });
  if (!vr) throw new HttpError(404, 'Inspection not found.');
  return vr;
}

function assertEditable(vr) {
  if (FINAL_VERIFICATION_STATUSES.includes(vr.status) || vr.status === 'submitted') {
    throw new HttpError(409, 'This inspection has been submitted and can no longer be changed.');
  }
}

// Every write from the field UI is a single atomic update. Technicians tap
// fast; a load-modify-save per tap would race (Mongoose versions array paths)
// and silently drop a result.
const EDITABLE = { status: { $nin: [...FINAL_VERIFICATION_STATUSES, 'submitted'] } };

async function refresh(vr) {
  const fresh = await VerificationRequest.findById(vr._id);
  vr.set(fresh.toObject());
  return vr;
}

export async function startInspection(vr, technician) {
  assertEditable(vr);
  const now = new Date();
  const res = await VerificationRequest.updateOne(
    { _id: vr._id, status: { $nin: [...FINAL_VERIFICATION_STATUSES, 'submitted', 'in_progress'] } },
    { $set: { status: 'in_progress', startedAt: vr.startedAt || now } }
  );
  if (res.modifiedCount) {
    if (vr.kind === 'initial') await Resource.findByIdAndUpdate(vr.resource, { verificationStatus: 'in_progress' });
    await recordCustody({
      resource: vr.resource,
      booking: vr.booking,
      inspection: vr._id,
      event: 'inspection_started',
      actorType: 'technician',
      actor: technician._id,
      actorName: technicianName(technician),
      details: { inspectionId: vr.inspectionId, kind: vr.kind },
    });
  }
  return refresh(vr);
}

/** Record (or change) one parameter's result. Autosaved from the field UI. */
export async function recordResult(vr, technician, parameterId, { result, observedValue, note }) {
  assertEditable(vr);
  if (!vr.parameters.some((p) => p.id === parameterId)) throw new HttpError(404, 'That check is not part of this inspection.');
  if (result !== undefined && result !== null && !PARAMETER_RESULTS.includes(result)) {
    throw new HttpError(400, `Result must be one of: ${PARAMETER_RESULTS.join(', ')}.`);
  }
  if (vr.status !== 'in_progress') await startInspection(vr, technician);

  const now = new Date();
  const set = { 'parameters.$.resultAt': now, 'parameters.$.resultBy': technician._id, lastSavedAt: now };
  if (result !== undefined) set['parameters.$.result'] = result;
  if (observedValue !== undefined) set['parameters.$.observedValue'] = String(observedValue ?? '').slice(0, 200);
  if (note !== undefined) set['parameters.$.note'] = String(note ?? '').slice(0, 2000);
  const res = await VerificationRequest.updateOne({ _id: vr._id, 'parameters.id': parameterId, ...EDITABLE }, { $set: set });
  if (!res.modifiedCount && !res.matchedCount) throw new HttpError(409, 'This inspection has been submitted and can no longer be changed.');
  await refresh(vr);
  return vr.parameters.find((p) => p.id === parameterId);
}

/** Attach photo / video / note / measurement evidence to one parameter. */
export async function addEvidence(vr, technician, { parameterId, type, url, text, value, unit }) {
  assertEditable(vr);
  if (!vr.parameters.some((p) => p.id === parameterId)) throw new HttpError(400, 'Evidence must belong to a check on this inspection.');
  if (!EVIDENCE_TYPES.includes(type)) throw new HttpError(400, `Evidence type must be one of: ${EVIDENCE_TYPES.join(', ')}.`);
  if ((type === 'photo' || type === 'video') && !url) throw new HttpError(400, `A ${type} file is required.`);
  if (type === 'note' && !String(text || '').trim()) throw new HttpError(400, 'A note cannot be empty.');
  if (type === 'measurement' && !String(value ?? '').trim()) throw new HttpError(400, 'A measurement needs a value.');
  if (vr.status !== 'in_progress') await startInspection(vr, technician);

  const item = {
    evidenceId: newEvidenceId(),
    parameterId,
    type,
    url: url || null,
    text: String(text || '').slice(0, 2000),
    value: value != null ? String(value).slice(0, 100) : null,
    unit: unit ? String(unit).slice(0, 20) : null,
    technician: technician._id,
    capturedAt: new Date(),
  };
  const res = await VerificationRequest.updateOne(
    { _id: vr._id, ...EDITABLE },
    { $push: { evidence: item }, $set: { lastSavedAt: new Date() } }
  );
  if (!res.modifiedCount) throw new HttpError(409, 'This inspection has been submitted and can no longer be changed.');
  await refresh(vr);

  await recordCustody({
    resource: vr.resource,
    booking: vr.booking,
    inspection: vr._id,
    event: 'evidence_captured',
    actorType: 'technician',
    actor: technician._id,
    actorName: technicianName(technician),
    evidence: [item.evidenceId],
    details: { inspectionId: vr.inspectionId, parameterId, type },
  });
  return item;
}

export async function removeEvidence(vr, technician, evidenceId) {
  assertEditable(vr);
  const item = vr.evidence.find((e) => e.evidenceId === evidenceId);
  if (!item) throw new HttpError(404, 'Evidence not found.');
  if (String(item.technician) !== String(technician._id)) {
    throw new HttpError(403, 'You can only remove evidence you captured.');
  }
  await VerificationRequest.updateOne(
    { _id: vr._id, ...EDITABLE },
    { $pull: { evidence: { evidenceId } }, $set: { lastSavedAt: new Date() } }
  );
  await refresh(vr);
}

/** The inspection a return inspection is compared against. */
async function loadBaseline(vr) {
  if (vr.kind !== 'return' || !vr.baselineInspection) return null;
  return VerificationRequest.findById(vr.baselineInspection).lean();
}

/**
 * Submit: enforce completeness and evidence rules, score, decide, and write
 * the outcome to the listing. Returns { vr } or { problems } (nothing saved).
 */
export async function submitInspection(vr, technician, { inspectorNotes } = {}) {
  assertEditable(vr);
  const problems = submissionProblems(vr);
  if (problems.length) return { problems };

  const outcome = scoreInspection(vr.parameters);
  vr.finalScore = outcome.score;
  vr.scoreBreakdown = outcome.breakdown;
  vr.decisionReasons = outcome.reasons;
  vr.conditionStatus = outcome.conditionStatus;
  vr.verificationLevel = outcome.verificationLevel;
  vr.status = outcome.status;
  vr.completedAt = new Date();
  if (inspectorNotes !== undefined) vr.inspectorNotes = String(inspectorNotes || '').slice(0, 4000);

  if (vr.kind === 'return') {
    const baseline = await loadBaseline(vr);
    const { comparison, damageSummary } = compareInspections(baseline, vr);
    vr.comparison = comparison;
    vr.damageSummary = damageSummary;
    vr.disputeStatus = damageSummary.damageDetected ? 'open' : 'none';
  }

  if (vr.kind === 'initial' && outcome.status !== 'rejected') {
    try {
      const rec = await generatePriceRecommendation({
        listedPrice: vr.listedPrice,
        category: vr.category,
        priceUnit: vr.priceUnit,
        conditionScore: outcome.score,
        quantity: vr.quantity,
        parameters: [],
        location: vr.location?.city,
      });
      vr.recommendedPrice = {
        basePrice: rec.recommendedPrice,
        lowerBound: rec.lowerBound,
        upperBound: rec.upperBound,
        score: rec.score,
        explanation: rec.explanation,
        generatedAt: new Date(),
      };
    } catch (err) {
      logger.warn('Price recommendation skipped', { error: err.message });
    }
  }
  await vr.save();

  // The listing shows the most recent physical inspection, initial or return.
  const resourceUpdate = {
    verificationStatus: vr.status,
    verificationId: vr._id,
    conditionScore: vr.finalScore,
    verifiedAt: vr.status === 'rejected' ? null : vr.completedAt,
  };
  if (vr.recommendedPrice?.basePrice != null) {
    resourceUpdate.recommendedPrice = {
      basePrice: vr.recommendedPrice.basePrice,
      lowerBound: vr.recommendedPrice.lowerBound,
      upperBound: vr.recommendedPrice.upperBound,
      score: vr.recommendedPrice.score,
      explanation: vr.recommendedPrice.explanation,
    };
  }
  await Resource.findByIdAndUpdate(vr.resource, resourceUpdate);

  const techActor = { actorType: 'technician', actor: technician._id, actorName: technicianName(technician) };
  await recordCustody({
    resource: vr.resource,
    booking: vr.booking,
    inspection: vr._id,
    event: vr.kind === 'return' ? 'return_inspection_submitted' : 'inspection_submitted',
    ...techActor,
    evidence: vr.evidence.map((e) => e.evidenceId),
    details: {
      inspectionId: vr.inspectionId,
      score: vr.finalScore,
      decision: outcome.decision,
      failed: outcome.breakdown.failedParameters,
      minor: outcome.breakdown.minorParameters,
    },
  });

  const label = { verified: 'Verified', conditionally_verified: 'Verified with issues', rejected: 'Failed' }[vr.status];
  await notify({
    user: vr.provider,
    type: 'inspection_update',
    title: `${vr.kind === 'return' ? 'Return inspection' : 'Inspection'} ${vr.inspectionId}: ${label}`,
    message: `${vr.resourceName} scored ${vr.finalScore}/100.`,
    relatedBooking: vr.booking || undefined,
  }).catch(() => {});

  if (vr.kind === 'return' && vr.damageSummary?.damageDetected) {
    await recordCustody({
      resource: vr.resource,
      booking: vr.booking,
      inspection: vr._id,
      event: 'damage_detected',
      ...techActor,
      evidence: vr.evidence
        .filter((e) => vr.comparison.some((c) => c.outcome === 'new_damage' && c.parameterId === e.parameterId))
        .map((e) => e.evidenceId),
      details: {
        newDamage: vr.comparison.filter((c) => c.outcome === 'new_damage').map((c) => c.parameterId),
        unitsLost: vr.damageSummary.unitsLost,
      },
    });
    const booking = vr.booking ? await Booking.findById(vr.booking).select('seeker').lean() : null;
    if (booking?.seeker) {
      await notify({
        user: booking.seeker,
        type: 'inspection_update',
        title: `Damage reported on ${vr.resourceName}`,
        message: `The return inspection ${vr.inspectionId} found new damage or missing units. Indulge will review it with both parties.`,
        relatedBooking: vr.booking,
      }).catch(() => {});
    }
  }

  return { vr };
}

/* ------------------------------------------------------------------ */
/* Return inspection and disputes                                       */
/* ------------------------------------------------------------------ */

/**
 * Create the return inspection for a booking: the same protocol as the
 * listing's latest completed initial inspection, compared against it on
 * submit. Idempotent per booking.
 */
export async function createReturnInspection(bookingId, { actorType = 'system', actor = null, actorName = '' } = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new HttpError(404, 'Booking not found.');
  const existing = await VerificationRequest.findOne({ booking: booking._id, kind: 'return' });
  if (existing) return { vr: existing, created: false };

  const resource = await Resource.findById(booking.resource);
  if (!resource) throw new HttpError(404, 'Listing not found.');
  if (!isInspectable(resource)) throw new HttpError(400, 'This listing is not a physical item, so it has no return inspection.');

  const baseline = await VerificationRequest.findOne({
    resource: resource._id,
    kind: 'initial',
    status: { $in: FINAL_VERIFICATION_STATUSES },
  }).sort('-completedAt');
  // A return inspection compares against a completed Indulge inspection —
  // without one (verificationMethod 'external_technician' or 'none') there is
  // nothing to compare, so this must not fabricate a checklist from scratch.
  if (!baseline) {
    throw new HttpError(400, 'This listing has no completed Indulge inspection to compare a return against.');
  }

  let protocol = await InspectionProtocol.findById(baseline.protocol);
  if (!protocol) protocol = await InspectionProtocol.findOne({ resource: resource._id, status: 'active' }).sort('-version');
  if (!protocol) protocol = await generateProtocolForResource(resource, { ai: false });

  const quantity = booking.requestedQuantity || 1;
  const vr = await VerificationRequest.create({
    kind: 'return',
    resource: resource._id,
    provider: resource.owner,
    booking: booking._id,
    baselineInspection: baseline?._id || null,
    protocol: protocol._id,
    category: resource.category,
    inspectionCategory: protocol.productCategory,
    resourceName: resource.title,
    status: 'pending',
    generatedTemplateId: protocol.protocolId,
    parameters: checklistFromProtocol(protocol),
    location: { address: resource.location?.address || '', city: resource.location?.city || '' },
    quantity,
    listedPrice: resource.pricing?.basePrice || 0,
    priceUnit: resource.pricing?.priceUnit || 'per_day',
  });

  await recordCustody({
    resource: resource._id,
    booking: booking._id,
    inspection: vr._id,
    event: 'return_inspection_created',
    actorType,
    actor,
    actorName,
    details: { inspectionId: vr.inspectionId, baseline: baseline?.inspectionId || null },
  });

  // The technician who did the baseline knows the item; an admin can reassign.
  const baselineTech = baseline?.assignedTechnician?.id ? await User.findById(baseline.assignedTechnician.id) : null;
  if (baselineTech?.userType === 'inspector' && !baselineTech.suspended) {
    await assignTechnician(vr, baselineTech._id, null);
  }
  return { vr, created: true };
}

/** Admin decision on an open damage dispute. Payments stay simulated. */
export async function resolveDispute(vr, admin, { decision, amount, note }) {
  if (vr.kind !== 'return') throw new HttpError(400, 'Only return inspections carry disputes.');
  if (vr.disputeStatus !== 'open') throw new HttpError(409, 'There is no open dispute on this inspection.');
  const allowed = ['seeker_liable', 'no_liability', 'shared', 'waived'];
  if (!allowed.includes(decision)) throw new HttpError(400, `Decision must be one of: ${allowed.join(', ')}.`);
  const amt = amount == null || amount === '' ? null : Number(amount);
  if (amt != null && (!Number.isFinite(amt) || amt < 0)) throw new HttpError(400, 'Amount must be a positive number.');
  if (!String(note || '').trim()) throw new HttpError(400, 'Record the reason for the decision.');

  vr.disputeStatus = 'resolved';
  vr.resolution = {
    decision,
    amount: amt,
    note: String(note).slice(0, 2000),
    resolvedBy: admin._id,
    resolvedAt: new Date(),
  };
  await vr.save();

  await recordCustody({
    resource: vr.resource,
    booking: vr.booking,
    inspection: vr._id,
    event: 'dispute_resolved',
    actorType: 'admin',
    actor: admin._id,
    actorName: admin.name,
    details: { inspectionId: vr.inspectionId, decision, amount: amt },
  });

  const booking = vr.booking ? await Booking.findById(vr.booking).select('seeker provider').lean() : null;
  for (const user of [booking?.seeker, booking?.provider || vr.provider].filter(Boolean)) {
    await notify({
      user,
      type: 'inspection_update',
      title: `Damage review closed — ${vr.inspectionId}`,
      message: `Decision: ${decision.replace('_', ' ')}${amt != null ? `, ₹${amt.toLocaleString('en-IN')}` : ''}. ${vr.resolution.note}`,
      relatedBooking: vr.booking || undefined,
      dedupWindowMs: 0,
    }).catch(() => {});
  }
  return vr;
}

/* ------------------------------------------------------------------ */
/* Read models                                                          */
/* ------------------------------------------------------------------ */

/** What a listing page may show publicly about its latest inspection. */
const EXTERNAL_DISCLAIMER =
  'Reported by a technician the lister arranged themselves. Indulge did not conduct or verify this inspection, and does not guarantee its accuracy.';
const NOT_VERIFIED_NOTICE = 'No physical inspection has been completed through Indulge for this listing.';

/**
 * What a listing page may show about its verification — always one of three
 * states (Indulge / external / not verified), never a silent absence, so a
 * seeker is never left guessing whether a listing was simply never checked.
 */
export async function publicVerificationSummary(resource) {
  const method = resource?.verificationMethod || 'none';
  const vr = resource?.verificationId ? await VerificationRequest.findById(resource.verificationId).lean() : null;

  if (method === 'external_technician' && vr?.kind === 'external') {
    const submitted = vr.status === 'externally_verified';
    return {
      method,
      inspectionId: vr.inspectionId,
      status: vr.status,
      decision: submitted ? 'EXTERNALLY_VERIFIED' : null,
      submittedAt: submitted ? vr.completedAt : null,
      technicianName: submitted ? vr.externalTechnician?.name : null,
      company: submitted ? vr.externalTechnician?.company : null,
      note: submitted ? vr.inspectorNotes : null,
      evidenceCount: vr.evidence?.length || 0,
      verifiedBy: null,
      disclaimer: EXTERNAL_DISCLAIMER,
    };
  }

  if (method === 'indulge_technician' && vr?.kind === 'initial') {
    const final = FINAL_VERIFICATION_STATUSES.includes(vr.status);
    const byId = new Map(vr.parameters.map((p) => [p.id, p.name]));
    return {
      method,
      inspectionId: vr.inspectionId,
      kind: vr.kind,
      status: vr.status,
      decision: final ? { verified: 'VERIFIED', conditionally_verified: 'VERIFIED_WITH_ISSUES', rejected: 'FAILED' }[vr.status] : null,
      score: final ? vr.finalScore : null,
      conditionStatus: final ? vr.conditionStatus : null,
      inspectedAt: final ? vr.completedAt : null,
      checks: vr.parameters.length,
      counts: final ? vr.scoreBreakdown?.counts || null : null,
      issues: final
        ? [
            ...(vr.scoreBreakdown?.failedParameters || []).map((id) => ({ name: byId.get(id) || id, result: 'fail' })),
            ...(vr.scoreBreakdown?.minorParameters || []).map((id) => ({ name: byId.get(id) || id, result: 'minor_issue' })),
          ]
        : [],
      verifiedBy: 'Indulge Inspection Team',
      disclaimer: PUBLIC_DISCLAIMER,
    };
  }

  return {
    method: 'none',
    status: 'unverified',
    decision: null,
    verifiedBy: null,
    disclaimer: NOT_VERIFIED_NOTICE,
  };
}

/**
 * Called when goods come back (returned_to_provider / return_completed):
 * opens the return inspection if the listing has a completed baseline to
 * compare against. Never throws — the return itself must still succeed.
 */
export async function openReturnInspectionIfInspected(bookingId, actor = {}) {
  try {
    const booking = await Booking.findById(bookingId).select('resource').lean();
    if (!booking) return null;
    const baseline = await VerificationRequest.exists({
      resource: booking.resource,
      kind: 'initial',
      status: { $in: FINAL_VERIFICATION_STATUSES },
    });
    if (!baseline) return null;
    const { vr } = await createReturnInspection(bookingId, actor);
    return vr;
  } catch (err) {
    logger.warn('Return inspection not opened', { bookingId: String(bookingId), error: err.message });
    return null;
  }
}
