/**
 * Train the delivery-conditions model.   Run: npm run train:delivery
 *
 * 1. Generate labelled synthetic listings (synth.js → policy.js labels).
 * 2. Hold out 20% for evaluation.
 * 3. Train one random forest per target: five classifiers (tier, fragility,
 *    check level, packaging, vehicle) and one regressor (crew). The advisory
 *    cost range is derived from the predicted plan (policy.costFor), not learnt.
 * 4. Report hold-out accuracy / MAE, plus agreement with the policy on the
 *    real seeded listings — text the generator never produced.
 * 5. Write model.json (loaded by predict.js) and metrics.json.
 *
 * Deterministic for a given SEED, so a retrain without policy or feature
 * changes produces the same model.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { trainForest, predictClass, predictValue } from './forest.js';
import { generate } from './synth.js';
import { featurize, FEATURE_VERSION } from './features.js';
import { label, inferItemClass, TIERS, FRAGILITY, CHECK_LEVELS, PACKAGING, VEHICLES } from './policy.js';
import { doesResourceRequireLogistics } from '../../models/Resource.js';
import { RESOURCES } from '../../seed/seedData.js';

const SEED = 42;
const SAMPLES = 12000;
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const CLASS_TARGETS = {
  tier: TIERS,
  fragility: FRAGILITY,
  checkLevel: CHECK_LEVELS,
  packaging: PACKAGING,
  vehicle: VEHICLES,
};
// Cost is not learnt: it is derived from the predicted plan (policy.costFor).
export const REG_TARGETS = {
  crew: { encode: (v) => v, decode: (v) => v },
};

const FOREST = { seed: SEED, nTrees: 50, maxDepth: 14, minLeaf: 3, featureFraction: 0.5, bins: 32 };

function main() {
  const t0 = Date.now();
  const rows = generate(SAMPLES, SEED);
  const split = Math.floor(rows.length * 0.8);
  const train = rows.slice(0, split);
  const test = rows.slice(split);
  const X = train.map((r) => featurize(r.resource, r.quantity));
  const Xt = test.map((r) => featurize(r.resource, r.quantity));

  const model = { version: FEATURE_VERSION, trainedAt: new Date().toISOString(), samples: SAMPLES, seed: SEED, classifiers: {}, regressors: {} };
  const metrics = { version: FEATURE_VERSION, samples: SAMPLES, holdout: test.length, classifiers: {}, regressors: {}, seedListings: {} };
  const trained = { classifiers: {}, regressors: {} };

  for (const [target, classes] of Object.entries(CLASS_TARGETS)) {
    const y = train.map((r) => classes.indexOf(r.labels[target]));
    const clf = trainForest(X, y, { ...FOREST, task: 'classification', nClasses: classes.length });
    const pred = Xt.map((x) => predictClass(clf, x).index);
    const acc = pred.filter((p, i) => classes[p] === test[i].labels[target]).length / test.length;
    metrics.classifiers[target] = { accuracy: Math.round(acc * 1000) / 1000 };
    model.classifiers[target] = { classes, forest: clf };
    trained.classifiers[target] = { classes, clf };
    console.log(`  ${target.padEnd(11)} accuracy ${(acc * 100).toFixed(1)}%`);
  }

  for (const [target, codec] of Object.entries(REG_TARGETS)) {
    const y = train.map((r) => codec.encode(r.labels[target]));
    const reg = trainForest(X, y, { ...FOREST, task: 'regression' });
    const pred = Xt.map((x) => codec.decode(predictValue(reg, x)));
    const mae = pred.reduce((s, p, i) => s + Math.abs(p - test[i].labels[target]), 0) / test.length;
    metrics.regressors[target] = { mae: Math.round(mae * 100) / 100 };
    model.regressors[target] = { forest: reg };
    trained.regressors[target] = { reg, codec };
    console.log(`  ${target.padEnd(11)} MAE ${mae.toFixed(2)}`);
  }

  // Real listings the generator never wrote: does the model agree with the
  // policy applied to their (keyword-recognised) item class?
  const physical = RESOURCES.filter((r) => doesResourceRequireLogistics(r));
  const agree = {};
  for (const r of physical) {
    const qty = r.totalQuantity || 1;
    const expected = label(inferItemClass(r), qty, r.pricing?.basePrice || 0);
    const x = featurize(r, qty);
    for (const [target, { classes, clf }] of Object.entries(trained.classifiers)) {
      agree[target] = (agree[target] || 0) + (classes[predictClass(clf, x).index] === expected[target] ? 1 : 0);
    }
    const crew = Math.round(predictValue(trained.regressors.crew.reg, x));
    agree.crew = (agree.crew || 0) + (Math.abs(crew - expected.crew) <= 1 ? 1 : 0);
  }
  for (const [k, v] of Object.entries(agree)) metrics.seedListings[k] = `${v}/${physical.length}`;
  console.log('  seed listings agreeing with policy:', metrics.seedListings);

  const modelPath = path.join(HERE, 'model.json');
  const json = JSON.stringify(model);
  writeFileSync(modelPath, json);
  writeFileSync(path.join(HERE, 'metrics.json'), JSON.stringify({ ...metrics, trainedAt: model.trainedAt }, null, 2) + '\n');
  console.log(`\n  model.json ${(json.length / 1024 / 1024).toFixed(2)} MB · trained in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
