/**
 * Grouped train / validation / test split for inspection training records.
 *
 *   node src/ml/inspection/dataset/split.js <records.jsonl> [--write]
 *
 * Records are grouped by productKey (brand|model) and each group is assigned to
 * one split by a stable hash, so the same product never appears in both
 * training and test data — no leakage through near-identical listings.
 * Benchmark records (source = benchmark) are never used for training.
 *
 * With --write, writes <name>.train.jsonl / .val.jsonl / .test.jsonl next to
 * the input. Refuses to produce a training split from fewer than
 * MIN_TRAINING_RECORDS technician/expert records: below that there is nothing
 * worth training on, and a model trained on it would be reported as trained
 * without being meaningfully so.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const MIN_TRAINING_RECORDS = 300;
export const RATIOS = { train: 0.7, val: 0.15, test: 0.15 };

export function splitFor(productKey) {
  const h = parseInt(createHash('sha1').update(String(productKey).toLowerCase()).digest('hex').slice(0, 8), 16) / 0xffffffff;
  if (h < RATIOS.train) return 'train';
  if (h < RATIOS.train + RATIOS.val) return 'val';
  return 'test';
}

export function splitRecords(records) {
  const out = { train: [], val: [], test: [], benchmark: [] };
  for (const r of records) {
    if (r.source === 'benchmark') out.benchmark.push(r);
    else out[splitFor(r.productKey)].push(r);
  }
  return out;
}

function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) throw new Error('Usage: node split.js <records.jsonl> [--write]');
  const records = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const s = splitRecords(records);
  const trainable = s.train.length + s.val.length + s.test.length;
  const groups = (arr) => new Set(arr.map((r) => r.productKey)).size;

  console.log(`\n${records.length} records → train ${s.train.length} (${groups(s.train)} products), val ${s.val.length} (${groups(s.val)}), test ${s.test.length} (${groups(s.test)}), benchmark-only ${s.benchmark.length}`);
  const leak = [...new Set(s.train.map((r) => r.productKey))].filter((k) => s.test.some((r) => r.productKey === k));
  console.log(`products in both train and test: ${leak.length}`);

  if (trainable < MIN_TRAINING_RECORDS) {
    console.log(
      `\nOnly ${trainable} technician/expert records — below the ${MIN_TRAINING_RECORDS} needed to train anything meaningful. ` +
        'Keep collecting inspection feedback; use the benchmark for evaluation only.\n'
    );
    return;
  }
  if (rest.includes('--write')) {
    const base = file.replace(/\.jsonl$/, '');
    for (const name of ['train', 'val', 'test']) {
      writeFileSync(`${base}.${name}.jsonl`, s[name].map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    console.log(`\nWrote ${path.basename(base)}.{train,val,test}.jsonl\n`);
  }
}

if (process.argv[1]?.endsWith('split.js')) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
