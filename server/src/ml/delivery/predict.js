import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { doesResourceRequireLogistics } from '../../models/Resource.js';
import { featurize, matchedWords, FEATURE_VERSION } from './features.js';
import { predictClass, predictValue } from './forest.js';
import { costFor, TIERS } from './policy.js';
import { LABELS, CHECKPOINTS, checklistFor, instructionsFor, driversFor } from './guidance.js';

/**
 * Delivery-conditions assessment for moving `quantity` units of a listing.
 *
 * The trained model (model.json, from train.js) predicts the handling plan.
 * Around it sit three deterministic layers, each documented where it applies:
 *   1. a gate — listings used on site (halls, parking, kitchens, staff) are
 *      never moved, so there is nothing to predict;
 *   2. consistency — independently trained targets are reconciled so the
 *      plan cannot contradict itself (e.g. a 6-person crew is professional);
 *   3. wording — labels, instructions and checklists (guidance.js), and the
 *      advisory cost, which is a formula of the plan (policy.costFor).
 */

const MODEL_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'model.json');
let model = null;

export function loadModel() {
  if (model) return model;
  const loaded = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
  if (loaded.version !== FEATURE_VERSION) {
    throw new Error(
      `Delivery model was trained for feature version ${loaded.version}, code is at ${FEATURE_VERSION}. ` +
        'Run `npm run train:delivery`.'
    );
  }
  model = loaded;
  return model;
}

export const modelInfo = () => {
  const m = loadModel();
  return { version: m.version, trainedAt: m.trainedAt, samples: m.samples };
};

const tierRank = (t) => TIERS.indexOf(t);

export function assessDelivery(resource, quantity) {
  const qty = Math.max(1, Math.round(Number(quantity) || resource.totalQuantity || 1));
  const base = { quantity: qty, labels: LABELS };

  // 1. Gate: used on site, never delivered.
  if (!doesResourceRequireLogistics(resource)) {
    return {
      ...base,
      requiresDelivery: false,
      summary: 'Used on site — nothing is transported, so no handlers or delivery checks are needed.',
    };
  }

  const m = loadModel();
  const x = featurize(resource, qty);
  const plan = {};
  const confidence = {};
  for (const [target, { classes, forest }] of Object.entries(m.classifiers)) {
    const { index, confidence: c } = predictClass(forest, x);
    plan[target] = classes[index];
    confidence[target] = Math.round(c * 100) / 100;
  }
  plan.crew = Math.min(14, Math.max(1, Math.round(predictValue(m.regressors.crew.forest, x))));

  // 2. Consistency between independently trained targets.
  const selfPropelled = resource.category === 'vehicle';
  if (selfPropelled) {
    Object.assign(plan, { tier: 'self_handled', crew: 1, packaging: 'none', vehicle: 'none' });
  } else {
    if (plan.crew >= 4 && tierRank(plan.tier) < tierRank('professional_handlers')) plan.tier = 'professional_handlers';
    if (plan.tier === 'self_handled') plan.crew = Math.min(plan.crew, 2);
    if (plan.tier !== 'self_handled' && plan.vehicle === 'none') plan.vehicle = 'two_wheeler';
    if (plan.fragility === 'high' && plan.checkLevel === 'count_only') plan.checkLevel = 'itemised_photo';
  }

  const cost = costFor({ ...plan, quantity: qty });
  const words = matchedWords(resource);
  const electrical = plan.checkLevel === 'itemised_photo_function_test' || plan.packaging === 'flight_cases';
  const checklist = checklistFor(plan, { quantity: qty, electrical, selfPropelled });
  const unitPrice = Number(resource.pricing?.basePrice) || 0;

  return {
    ...base,
    requiresDelivery: true,
    selfPropelled,
    plan,
    cost: { min: cost.costMin, max: cost.costMax, advisory: true },
    confidence: {
      overall: Math.round(Math.min(...Object.values(confidence)) * 100) / 100,
      ...confidence,
    },
    drivers: driversFor({ quantity: qty, unitPrice, words, plan }),
    instructions: instructionsFor(plan, { quantity: qty, title: resource.title, selfPropelled }),
    checkpoints: CHECKPOINTS.map((c) => ({ ...c, items: checklist })),
    model: { version: m.version, trainedAt: m.trainedAt },
  };
}
