/**
 * Score the RFQ intake variants.   Run: npm run rfq:eval
 *
 * Variants, on the same requests:
 * - rules      the rule parser alone (the baseline, and the fallback)
 * - base       the Nugen base model through the same LangChain chain
 * - aligned    the Nugen-aligned model (nugen-model.json)
 * - pipeline   what users get: aligned model + grounding + rules filling gaps
 *
 * Sets:
 * - test         150 synthetic requests from held-out templates. Rules share
 *                the generator's vocabulary, so they do well here by design.
 * - handwritten  30 hand-authored requests in phrasing no template or rule was
 *                written for (slang, items outside the lexicon, messy budgets).
 *                This is where alignment has to earn its place.
 *
 * Model variants need NUGEN_API_KEY; without it only rules are scored.
 * Writes metrics.json.   --limit N scores the first N of each set.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DATA_DIR, FILES } from './build-dataset.js';
import { buildIntakeChain, createNugenChatModel } from './chain.js';
import { formatInstruction, PROMPT_VERSION } from './prompt.js';
import { groundOutput } from './ground.js';
import { parseWithRules } from './rules.js';
import { parseRequirementText } from './intake.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = path.join(HERE, 'metrics.json');
const MODEL_FILE = path.join(HERE, 'nugen-model.json');

export const SCORED = ['category', 'quantity', 'unit', 'minCapacity', 'budget', 'city', 'dateText', 'startTime', 'endTime', 'urgency'];

const norm = (field, v) => (v == null ? null : field === 'dateText' ? String(v).toLowerCase().trim() : v);
const matches = (field, got, want) => norm(field, got) === norm(field, want);

const readJsonl = (file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

async function runModel(chain, text) {
  const started = Date.now();
  try {
    const res = await chain.invoke({ instruction: formatInstruction(text) });
    return { output: res.output, valid: true, confidence: res.confidenceScore, ms: Date.now() - started };
  } catch (err) {
    return { output: {}, valid: false, confidence: null, ms: Date.now() - started, error: err.message };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

function summarise(records, predictions) {
  const fields = Object.fromEntries(SCORED.map((f) => [f, 0]));
  let allCorrect = 0;
  let valid = 0;
  const confidences = [];
  const latencies = [];
  records.forEach((r, i) => {
    const p = predictions[i];
    let all = true;
    for (const f of SCORED) {
      if (matches(f, p.fields[f], r.gold[f])) fields[f]++;
      else all = false;
    }
    if (all) allCorrect++;
    if (p.valid !== false) valid++;
    if (p.confidence != null) confidences.push(p.confidence);
    if (p.ms != null) latencies.push(p.ms);
  });
  const n = records.length;
  const pct = (x) => Math.round((x / n) * 1000) / 10;
  latencies.sort((a, b) => a - b);
  return {
    n,
    fieldAccuracy: Object.fromEntries(SCORED.map((f) => [f, pct(fields[f])])),
    meanFieldAccuracy: Math.round((SCORED.reduce((s, f) => s + fields[f], 0) / (n * SCORED.length)) * 1000) / 10,
    allFieldsCorrect: pct(allCorrect),
    jsonValid: pct(valid),
    meanConfidence: confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10 : null,
    p50LatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
  };
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  const apiKey = process.env.NUGEN_API_KEY;
  const recorded = existsSync(MODEL_FILE) ? JSON.parse(readFileSync(MODEL_FILE, 'utf8')) : null;
  const baseModel = recorded?.baseModelId || process.env.NUGEN_BASE_MODEL || 'llama-v3p2-3b-reasoning';
  const alignedModel = process.env.NUGEN_RFQ_MODEL || recorded?.modelId || null;

  const sets = {
    test: readJsonl(path.join(DATA_DIR, FILES.test)).slice(0, limit),
    handwritten: readJsonl(path.join(DATA_DIR, 'rfq-intake-handwritten.jsonl')).slice(0, limit),
  };

  const variants = { rules: null };
  if (apiKey) {
    variants.base = buildIntakeChain(createNugenChatModel({ model: baseModel, apiKey, timeoutMs: 30000 }));
    if (alignedModel) variants.aligned = buildIntakeChain(createNugenChatModel({ model: alignedModel, apiKey, timeoutMs: 30000 }));
  } else {
    console.log('NUGEN_API_KEY not set: scoring the rule parser only.\n');
  }
  if (apiKey && !alignedModel) console.log('No aligned model yet (run npm run rfq:align): scoring rules and the base model.\n');

  const report = {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    datasetHash: recorded?.datasetHash || null,
    models: { base: apiKey ? baseModel : null, aligned: apiKey ? alignedModel : null },
    sets: {},
  };

  for (const [setName, records] of Object.entries(sets)) {
    report.sets[setName] = {};
    for (const [variant, chain] of Object.entries(variants)) {
      process.stdout.write(`  ${setName} · ${variant}…`);
      const predictions = chain
        ? await mapLimit(records, 4, async (r) => {
            const res = await runModel(chain, r.text);
            return { ...res, fields: groundOutput(res.output, r.text).fields };
          })
        : records.map((r) => ({ fields: groundOutput(parseWithRules(r.text), r.text).fields }));
      report.sets[setName][variant] = summarise(records, predictions);
      process.stdout.write(' done\n');
    }
    if (variants.aligned) {
      process.stdout.write(`  ${setName} · pipeline…`);
      const env = { ...process.env, NUGEN_RFQ_MODEL: alignedModel, RFQ_AI: 'on', RFQ_AI_TIMEOUT_MS: '30000' };
      const predictions = await mapLimit(records, 4, async (r) => {
        const res = await parseRequirementText(r.text, { env });
        // Score the merged fields, before they are turned into form values.
        const merged = { ...groundOutput(parseWithRules(r.text), r.text).fields, ...groundOutput(res.output || {}, r.text).fields };
        return { fields: merged, valid: res.ai.status === 'ok', confidence: res.ai.confidenceScore, ms: res.ai.latencyMs };
      });
      report.sets[setName].pipeline = summarise(records, predictions);
      process.stdout.write(' done\n');
    }
  }

  writeFileSync(METRICS_FILE, JSON.stringify(report, null, 2) + '\n');

  for (const [setName, byVariant] of Object.entries(report.sets)) {
    const names = Object.keys(byVariant);
    console.log(`\n${setName} (n=${byVariant.rules.n})`);
    console.log(`  ${'field'.padEnd(18)}${names.map((v) => v.padStart(10)).join('')}`);
    for (const f of SCORED) console.log(`  ${f.padEnd(18)}${names.map((v) => `${byVariant[v].fieldAccuracy[f]}%`.padStart(10)).join('')}`);
    const row = (label, key, unit = '%') =>
      console.log(`  ${label.padEnd(18)}${names.map((v) => (byVariant[v][key] == null ? '—' : `${byVariant[v][key]}${unit}`).padStart(10)).join('')}`);
    row('mean field acc.', 'meanFieldAccuracy');
    row('all fields right', 'allFieldsCorrect');
    row('JSON valid', 'jsonValid');
    row('mean confidence', 'meanConfidence', '');
    row('p50 latency', 'p50LatencyMs', 'ms');
  }
  console.log(`\nWrote ${path.relative(process.cwd(), METRICS_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
