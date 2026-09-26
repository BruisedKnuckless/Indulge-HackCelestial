import { Router } from 'express';
import VerificationRequest, { FINAL_VERIFICATION_STATUSES, OPEN_VERIFICATION_STATUSES } from '../models/VerificationRequest.js';
import InspectionProtocol from '../models/InspectionProtocol.js';
import Resource from '../models/Resource.js';
import Booking from '../models/Booking.js';
import { requireAuth, requireInspector } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { evidenceUploadMiddleware, storeEvidenceFile } from '../services/media.service.js';
import {
  loadAssignedInspection,
  startInspection,
  recordResult,
  addEvidence,
  removeEvidence,
  submitInspection,
  PUBLIC_DISCLAIMER,
} from '../services/verification/verification.service.js';
import { scoreInspection, submissionProblems } from '../services/verification/scoring.js';
import { custodyChain } from '../services/verification/custody.service.js';

/**
 * /api/verifications — listing inspections.
 *
 * Technician endpoints (requireInspector) only ever see inspections whose
 * assignedTechnician.id is the signed-in user; the technician id is always
 * req.user, never a value from the request. Reports are readable by the
 * listing owner, the assigned technician and — for return inspections — the
 * booking's parties. Admin actions live under /api/admin/inspections.
 */
const router = Router();

const RESOURCE_FIELDS = 'title category images media brand model declaredCondition specifications accessories totalQuantity unit location pricing';

/** Fields the field UI needs to show progress without the whole checklist. */
function progressOf(vr) {
  const params = vr.parameters || [];
  const done = params.filter((p) => p.result).length;
  const required = params.filter((p) => p.required);
  return {
    total: params.length,
    done,
    requiredTotal: required.length,
    requiredDone: required.filter((p) => p.result).length,
    evidence: (vr.evidence || []).length,
  };
}

async function baselineResults(vr) {
  if (vr.kind !== 'return' || !vr.baselineInspection) return null;
  const b = await VerificationRequest.findById(vr.baselineInspection)
    .select('inspectionId completedAt finalScore status parameters.id parameters.result parameters.observedValue parameters.note')
    .lean();
  if (!b) return null;
  return {
    inspectionId: b.inspectionId,
    completedAt: b.completedAt,
    finalScore: b.finalScore,
    status: b.status,
    results: Object.fromEntries(b.parameters.map((p) => [p.id, { result: p.result, observedValue: p.observedValue, note: p.note }])),
  };
}

/* ---------------------------- technician ---------------------------- */

/** GET /api/verifications — the signed-in technician's assigned inspections. */
router.get(
  '/',
  requireAuth,
  requireInspector,
  asyncHandler(async (req, res) => {
    const scope = req.query.scope || 'open';
    const filter = { 'assignedTechnician.id': req.user._id };
    if (scope === 'open') filter.status = { $in: OPEN_VERIFICATION_STATUSES };
    else if (scope === 'completed') filter.status = { $in: FINAL_VERIFICATION_STATUSES };

    const list = await VerificationRequest.find(filter)
      .sort(scope === 'completed' ? '-completedAt' : 'scheduledAt createdAt')
      .populate('resource', 'title images media location category')
      .lean();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const mine = { 'assignedTechnician.id': req.user._id };
    const [assigned, inProgress, completedToday, completed] = await Promise.all([
      VerificationRequest.countDocuments({ ...mine, status: { $in: ['assigned', 'scheduled'] } }),
      VerificationRequest.countDocuments({ ...mine, status: 'in_progress' }),
      VerificationRequest.countDocuments({ ...mine, status: { $in: FINAL_VERIFICATION_STATUSES }, completedAt: { $gte: startOfDay } }),
      VerificationRequest.countDocuments({ ...mine, status: { $in: FINAL_VERIFICATION_STATUSES } }),
    ]);

    res.json({
      inspections: list.map((vr) => ({
        _id: vr._id,
        inspectionId: vr.inspectionId,
        kind: vr.kind,
        status: vr.status,
        resourceName: vr.resourceName,
        inspectionCategory: vr.inspectionCategory,
        resource: vr.resource,
        location: vr.location,
        quantity: vr.quantity,
        scheduledAt: vr.scheduledAt,
        assignedAt: vr.assignedTechnician?.assignedAt,
        startedAt: vr.startedAt,
        completedAt: vr.completedAt,
        lastSavedAt: vr.lastSavedAt,
        finalScore: vr.finalScore,
        progress: progressOf(vr),
      })),
      stats: { assigned, inProgress, completedToday, completed },
    });
  })
);

/** GET /api/verifications/:id — one assigned inspection with its checklist. */
router.get(
  '/:id',
  requireAuth,
  requireInspector,
  asyncHandler(async (req, res) => {
    const vr = await loadAssignedInspection(req.params.id, req.user);
    const [resource, protocol, baseline] = await Promise.all([
      Resource.findById(vr.resource).select(RESOURCE_FIELDS).lean(),
      vr.protocol ? InspectionProtocol.findById(vr.protocol).select('protocolId version generator generation.mode generation.ai.status generation.modelVersion inspectionScope disclaimer categoryLabel summary').lean() : null,
      baselineResults(vr),
    ]);
    const body = vr.toObject();
    res.json({
      inspection: body,
      resource,
      protocol,
      baseline,
      progress: progressOf(body),
      problems: submissionProblems(body),
      preview: scoreInspection(body.parameters),
    });
  })
);

router.post(
  '/:id/start',
  requireAuth,
  requireInspector,
  asyncHandler(async (req, res) => {
    const vr = await loadAssignedInspection(req.params.id, req.user);
    await startInspection(vr, req.user);
    res.json({ inspection: vr });
  })
);

/** PATCH /api/verifications/:id/parameters/:parameterId — autosaved result. */
router.patch(
  '/:id/parameters/:parameterId',
  requireAuth,
  requireInspector,
  asyncHandler(async (req, res) => {
    const vr = await loadAssignedInspection(req.params.id, req.user);
    const { result, observedValue, note } = req.body || {};
    const parameter = await recordResult(vr, req.user, req.params.parameterId, { result, observedValue, note });
    res.json({ parameter, progress: progressOf(vr), savedAt: vr.lastSavedAt });
  })
);

/**
 * POST /api/verifications/:id/evidence — multipart `file` (photo/video) or a
 * JSON note/measurement. Always tied to one parameter and the signed-in
 * technician.
 */
router.post(
  '/:id/evidence',
  requireAuth,
  requireInspector,
  evidenceUploadMiddleware.single('file'),
  asyncHandler(async (req, res) => {
    const vr = await loadAssignedInspection(req.params.id, req.user);
    const { parameterId, text, value, unit } = req.body || {};
    let { type } = req.body || {};
    let url = null;
    if (req.file) {
      const stored = await storeEvidenceFile(req.file);
      url = stored.url;
      type = stored.type;
    } else if (type === 'photo' || type === 'video') {
      throw new HttpError(400, `Attach the ${type} file.`);
    }
    const evidence = await addEvidence(vr, req.user, { parameterId, type, url, text, value, unit });
    res.status(201).json({ evidence });
  })
);

router.delete(
  '/:id/evidence/:evidenceId',
  requireAuth,
  requireInspector,
  asyncHandler(async (req, res) => {
    const vr = await loadAssignedInspection(req.params.id, req.user);
    await removeEvidence(vr, req.user, req.params.evidenceId);
    res.json({ ok: true });
  })
);

/** POST /api/verifications/:id/submit — refuses (422) until every rule is met. */
router.post(
  '/:id/submit',
  requireAuth,
  requireInspector,
  asyncHandler(async (req, res) => {
    const vr = await loadAssignedInspection(req.params.id, req.user);
    const { problems } = await submitInspection(vr, req.user, { inspectorNotes: req.body?.inspectorNotes });
    if (problems) {
      return res.status(422).json({ error: problems[0].message, code: problems[0].code, problems });
    }
    res.json({ inspection: vr });
  })
);

/* ------------------------------ reports ------------------------------ */

/**
 * GET /api/verifications/:id/report — the full inspection report.
 * Assigned technician, listing owner, or (return inspections) a booking party.
 */
router.get(
  '/:id/report',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const filter = /^INS-\d+$/i.test(id) ? { inspectionId: id.toUpperCase() } : /^[a-f0-9]{24}$/i.test(id) ? { _id: id } : null;
    const vr = filter ? await VerificationRequest.findOne(filter).lean() : null;
    if (!vr) throw new HttpError(404, 'Inspection not found.');

    const me = String(req.user._id);
    let allowed = String(vr.assignedTechnician?.id) === me || String(vr.provider) === me;
    if (!allowed && vr.booking) {
      const b = await Booking.findById(vr.booking).select('seeker provider').lean();
      allowed = Boolean(b) && [String(b.seeker), String(b.provider)].includes(me);
    }
    if (!allowed) throw new HttpError(404, 'Inspection not found.');

    const [resource, protocol, baseline, custody] = await Promise.all([
      Resource.findById(vr.resource).select(RESOURCE_FIELDS).lean(),
      vr.protocol ? InspectionProtocol.findById(vr.protocol).select('protocolId version generator generation inspectionScope disclaimer categoryLabel claims').lean() : null,
      baselineResults(vr),
      custodyChain({ resource: vr.resource, ...(vr.booking ? { booking: vr.booking } : {}) }),
    ]);
    res.json({ inspection: vr, resource, protocol, baseline, custody, disclaimer: PUBLIC_DISCLAIMER });
  })
);

/**
 * GET /api/verifications/resource/:resourceId — the owner's view of every
 * inspection run on one of their listings.
 */
router.get(
  '/resource/:resourceId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.resourceId).select('owner').lean();
    if (!resource || String(resource.owner) !== String(req.user._id)) throw new HttpError(404, 'Listing not found.');
    const inspections = await VerificationRequest.find({ resource: resource._id })
      .select('inspectionId kind status finalScore conditionStatus completedAt createdAt assignedTechnician.name disputeStatus damageSummary booking')
      .sort('-createdAt')
      .lean();
    res.json({ inspections });
  })
);

/**
 * GET /api/verifications/booking/:bookingId — return inspections for a
 * booking, for either party to it.
 */
router.get(
  '/booking/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = /^[a-f0-9]{24}$/i.test(req.params.bookingId) ? await Booking.findById(req.params.bookingId).select('seeker provider').lean() : null;
    const me = String(req.user._id);
    if (!b || ![String(b.seeker), String(b.provider)].includes(me)) throw new HttpError(404, 'Booking not found.');
    const inspections = await VerificationRequest.find({ booking: b._id, kind: 'return' })
      .select('inspectionId status finalScore completedAt disputeStatus damageSummary resolution.decision resolution.amount')
      .lean();
    res.json({ inspections });
  })
);

export default router;
