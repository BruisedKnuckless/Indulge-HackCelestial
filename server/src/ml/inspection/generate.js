import { createHash } from 'node:crypto';
import { loadKnowledge } from './knowledge.js';
import { normalizeInput, fromResource } from './normalize.js';
import { classify } from './classify.js';
import { extractClaims, extractAttributes, applyClaimAttributes } from './extract.js';
import { resolveTemplate, selectBaseline } from './baseline.js';
import { matchProfiles, applyProfileAttributes, applyProfileParameters, applyClaims } from './enrich.js';
import { dedupeCandidates, mergeAiParameters, finalizeParameters } from './validate.js';
import { augmentWithAI } from './ai.js';
import { ProtocolSchema } from './schema.js';
import { MODEL_NAME, MODEL_VERSION, PROMPT_VERSION } from './version.js';

/**
 * Generate a structured inspection protocol for a product.
 *
 *   input ─► classify ─► attributes + claims ─► category baseline (+ conditional)
 *         ─► brand/model profile checks ─► claim-vs-actual checks ─► dedupe
 *         ─► [optional AI additions, validated] ─► finalise ─► schema check
 *
 * The deterministic layers alone always produce a complete protocol; the AI
 * layer can only add to it, and if it is unavailable or fails the protocol is
 * returned without it (generation.mode = 'baseline_only', generation.ai says
 * why). The protocol describes what to check — it never marks anything verified.
 *
 * @param {object} rawInput  see InputSchema in schema.js
 * @param {object} [options]
 * @param {object|false} [options.ai]  false to skip AI; or { client, model, mode, timeoutMs, images }
 * @param {Date} [options.now]
 */
export async function generateInspectionProtocol(rawInput, options = {}) {
  const knowledge = loadKnowledge();
  const input = normalizeInput(rawInput);

  const classification = classify(input, knowledge.taxonomy);
  const template = resolveTemplate(classification.category, knowledge);

  const claims = extractClaims(input, classification.category, knowledge.specRules);
  const { attributes, sources } = extractAttributes({
    input,
    claims,
    defaults: template.attributeDefaults,
    compiledRules: knowledge.compiled.attributes,
    specRules: knowledge.specRules,
  });

  const profiles = matchProfiles(input, classification.category, knowledge.profiles);
  applyProfileAttributes(profiles, attributes, sources);
  applyClaimAttributes(attributes, sources, claims, knowledge.specRules); // explicit claims outrank profiles

  const library = knowledge.library.parameters;
  const { candidates, skipped } = selectBaseline(template, attributes, sources, library);
  applyProfileParameters(profiles, candidates, library);
  applyClaims({
    claims,
    candidates,
    library,
    specRules: knowledge.specRules,
    priorities: knowledge.priorities,
    category: classification.category,
    declaredCondition: input.declaredCondition,
  });

  const mergeLog = [];
  dedupeCandidates(candidates, mergeLog);

  // Optional AI augmentation — additive only, never required.
  let ai = { status: 'disabled', reason: 'disabled by caller', parameters: [], imageObservations: [] };
  let aiFiltering = { rejected: [], removedInstructions: [] };
  if (options.ai !== false) {
    ai = await augmentWithAI(
      { input, classification, attributes, claims, baseline: [...candidates.values()] },
      options.ai || {}
    );
    if (ai.status === 'ok' && ai.parameters.length) {
      aiFiltering = mergeAiParameters({ aiParams: ai.parameters, candidates, template, knowledge, input, log: mergeLog });
    }
  }

  const removedInstructions = [...aiFiltering.removedInstructions];
  const { parameters, sampling } = finalizeParameters({ candidates, knowledge, template, attributes, removedInstructions });

  const now = (options.now || new Date()).toISOString();
  const aiUsed = ai.status === 'ok';
  const bySource = countBy(parameters, 'generationSource');
  const protocol = {
    protocolId: createHash('sha1')
      .update(JSON.stringify({ input, v: MODEL_VERSION, t: knowledge.templateVersion, now }))
      .digest('hex')
      .slice(0, 16),
    inspectionVersion: MODEL_VERSION,
    status: 'pending_inspection',
    disclaimer:
      'Generated inspection protocol: it lists what a technician must physically check. It does not verify the product; results come only from the physical inspection and its evidence.',
    productName: input.productName,
    productCategory: classification.category,
    categoryLabel: classification.label,
    product: {
      name: input.productName,
      brand: input.brand || null,
      model: input.model || null,
      quantity: attributes.quantity,
      declaredCondition: input.declaredCondition || null,
      usageAge: input.usageAge || null,
      sourceRef: input.sourceRef || null,
    },
    classification: { ...classification, template: template.templateId, templateChain: template.chain },
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([k, v]) => [k, { value: v, source: sources[k] || 'derived' }])
    ),
    claims,
    inspectionScope: sampling || { quantity: attributes.quantity, countAllUnits: attributes.quantity > 1, sampleSize: null, rule: 'Inspect every unit in full.' },
    parameters,
    summary: {
      total: parameters.length,
      required: parameters.filter((p) => p.required).length,
      critical: parameters.filter((p) => p.priority === 'critical').length,
      requiresQualifiedInspector: parameters.filter((p) => p.requiresQualifiedInspector).length,
      claimChecks: parameters.filter((p) => p.claimedValue !== undefined).length,
      bySource,
      byCategory: countBy(parameters, 'category'),
      brandProfiles: profiles.map((p) => p.id),
    },
    imageHints: (ai.imageObservations || []).map((o) => ({
      ...o,
      note: 'Hint from listing images only — not evidence. The physical inspection decides.',
    })),
    validation: {
      mergedDuplicates: mergeLog,
      rejectedAiParameters: aiFiltering.rejected,
      removedUnsafeInstructions: removedInstructions,
      notApplicable: skipped,
    },
    generation: {
      modelName: MODEL_NAME,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      templateVersion: knowledge.templateVersion,
      knowledgeVersions: {
        ...knowledge.versions,
        ...Object.fromEntries(Object.entries(template.versions).map(([k, v]) => [`template:${k}`, v])),
      },
      generationTimestamp: now,
      mode: aiUsed ? 'baseline_plus_ai' : 'baseline_only',
      ai: {
        status: ai.status,
        reason: ai.reason || null,
        llmModel: aiUsed ? ai.model : null,
        imagesUsed: Boolean(ai.imagesUsed),
        suggested: ai.parameters?.length || 0,
        accepted: bySource.ai_generated || 0,
        mergedIntoBaseline: bySource.baseline_plus_ai || 0,
        usage: ai.usage || null,
        confidenceNote:
          'No numeric confidence is reported: the rules are deterministic, and LLM token probabilities are not a validated confidence measure. generationSource and reason explain each parameter instead.',
      },
    },
  };

  return ProtocolSchema.parse(protocol);
}

/** Protocol for an Indulge listing (models/Resource.js). */
export function generateForResource(resource, options = {}) {
  return generateInspectionProtocol(fromResource(resource, options), options);
}

function countBy(items, key) {
  const out = {};
  for (const i of items) out[i[key]] = (out[i[key]] || 0) + 1;
  return out;
}
