/**
 * Build the Nugen alignment dataset for the RFQ intake model.   Run: npm run rfq:dataset
 *
 * Writes to data/:
 * - rfq-intake-train.jsonl      {instruction, response} pairs → Nugen document
 * - rfq-intake-guide.md         the domain guide (categories, Indian units and
 *                               slang, output contract) → second Nugen document
 * - rfq-intake-benchmark.json   [{sample_num, instruction, response}] → Nugen benchmark
 * - rfq-intake-test.jsonl       held-out {id, text, gold} for evaluate.js
 * - manifest.json               counts, seeds and a hash of what was uploaded
 *
 * Training pairs use TRAIN_TEMPLATES; benchmark and test use HELDOUT_TEMPLATES
 * (and their own seeds), so no phrasing is shared between what the model is
 * aligned on and what it is scored on. Deterministic.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generate, TRAIN_TEMPLATES, HELDOUT_TEMPLATES } from './synth.js';
import { formatInstruction, OUTPUT_KEYS, PROMPT_VERSION, FEW_SHOT } from './prompt.js';
import { LEXICON, CITIES, URGENCY_WORDS } from './vocab.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(HERE, 'data');

export const FILES = {
  train: 'rfq-intake-train.jsonl',
  guide: 'rfq-intake-guide.md',
  benchmark: 'rfq-intake-benchmark.json',
  test: 'rfq-intake-test.jsonl',
  manifest: 'manifest.json',
};

const SIZES = { train: 900, benchmark: 40, test: 150 };
const SEEDS = { train: 7, benchmark: 1001, test: 2002 };

const responseOf = (gold) => JSON.stringify(Object.fromEntries(OUTPUT_KEYS.map((k) => [k, gold[k] ?? null])));

function guide() {
  const categories = Object.entries(LEXICON)
    .map(([cat, spec]) => {
      const items = spec.items.map(([s]) => s).join(', ');
      const unit = spec.unit === 'hour' ? ' Quantity counts hours.' : spec.unit === 'slot' ? ' Quantity counts parking slots (unit "slot").' : '';
      const capacity = spec.capacity ? ' A guest or seat count here is minCapacity.' : '';
      return `- **${cat}**: ${items}. Also: ${spec.keywords.join(', ')}.${unit}${capacity}`;
    })
    .join('\n');
  const cities = CITIES.map((c) => `- ${c.name}: ${c.aliases.join(', ')}`).join('\n');
  const examples = FEW_SHOT.map((e) => `Request: ${e.text}\nJSON: ${JSON.stringify(e.output)}`).join('\n\n');

  return `# Indulge RFQ intake: domain guide

Indulge is a B2B marketplace where Indian hospitality businesses (hotels, banquet
venues, caterers, event companies) rent idle resources from each other. A seeker
describes what they need in one message; the intake model turns it into the
fields of a Request for Quotation (RFQ).

## Output contract

Reply with one JSON object with exactly these keys: ${OUTPUT_KEYS.join(', ')}.
Use null for anything the request does not state. Never invent a value.

- category: the category of the FIRST thing asked for. A second item mentioned
  later ("+ PA system", "and 2 waiters") goes into notes, not the category.
- quantity: how many of the first item. For kitchens it is the number of hours.
  "a banquet hall" or "one tandoor" is 1.
- unit: "unit" by default, "hour" for kitchen time, "slot" for parking.
- minCapacity: only for venues (guests, pax, people) and vehicles (7 seater).
  "250 chairs for 300 guests" has no minCapacity.
- budget: rupees as a plain number.
- city: the canonical city name from the list below.
- dateText: the date words copied exactly as written. Never compute a date.
- startTime / endTime: 24-hour HH:MM. "6pm-11pm" is 18:00 and 23:00; an event can
  end after midnight ("8pm till 3am" ends at 03:00).
- urgency: high, medium or low.

## Categories

${categories}

## Money

Indians write amounts many ways. All of these are plain rupees in the JSON:
40k = 40000, 1.5 lakh = 1.5L = 1.5 lakhs = 150000, 2 crore = 20000000,
₹2,50,000 = Rs 250000 = INR 2,50,000 = 2,50,000/- = 250000.
Cue words: budget, under, max, within, around, up to, can spend.

## Cities and areas

${cities}

## Urgency

- high: ${URGENCY_WORDS.high.join(', ')}
- low: ${URGENCY_WORDS.low.join(', ')}
- anything else: medium

## Hinglish

"chahiye" = need, "ki zarurat hai" = is needed, "bhi" = also, "ko" = on (a date),
"urgent hai" = it is urgent.

## Worked examples

${examples}
`;
}

export function buildDataset() {
  mkdirSync(DATA_DIR, { recursive: true });

  const train = generate(SIZES.train, { seed: SEEDS.train, templates: TRAIN_TEMPLATES });
  const bench = generate(SIZES.benchmark, { seed: SEEDS.benchmark, templates: HELDOUT_TEMPLATES });
  const test = generate(SIZES.test, { seed: SEEDS.test, templates: HELDOUT_TEMPLATES });

  const trainJsonl = train.map((s) => JSON.stringify({ instruction: formatInstruction(s.text), response: responseOf(s.gold) })).join('\n') + '\n';
  const guideMd = guide();
  const benchmarkJson = JSON.stringify(
    bench.map((s, i) => ({ sample_num: i + 1, instruction: formatInstruction(s.text), response: responseOf(s.gold) })),
    null,
    2
  );
  const testJsonl = test.map((s) => JSON.stringify({ id: s.id, text: s.text, gold: s.gold })).join('\n') + '\n';

  const write = (name, body) => writeFileSync(path.join(DATA_DIR, name), body);
  write(FILES.train, trainJsonl);
  write(FILES.guide, guideMd);
  write(FILES.benchmark, benchmarkJson);
  write(FILES.test, testJsonl);

  const datasetHash = createHash('sha256').update(trainJsonl).update(guideMd).update(benchmarkJson).digest('hex').slice(0, 16);
  const manifest = {
    promptVersion: PROMPT_VERSION,
    datasetHash,
    sizes: SIZES,
    seeds: SEEDS,
    templates: { train: TRAIN_TEMPLATES.length, heldout: HELDOUT_TEMPLATES.length },
    files: FILES,
  };
  write(FILES.manifest, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = buildDataset();
  console.log(`RFQ intake dataset ${m.datasetHash} (${m.promptVersion})`);
  console.log(`  train ${m.sizes.train} pairs · benchmark ${m.sizes.benchmark} · test ${m.sizes.test}`);
  console.log(`  templates: ${m.templates.train} train, ${m.templates.heldout} held out`);
  console.log(`  → ${path.relative(process.cwd(), DATA_DIR)}/`);
}
