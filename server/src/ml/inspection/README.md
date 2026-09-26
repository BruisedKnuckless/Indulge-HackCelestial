# Inspection protocol generator

Generates the **structured checklist an Indulge quality-verification technician
must physically inspect** for a product a provider has listed. It decides *what
to check*. It never verifies anything: every parameter is `pending_inspection`,
and results come only from the physical inspection and its evidence.

```
AI / rules   → generate what needs to be checked      (this module)
Technician   → physically verifies it                 (not built here)
Evidence     → proves what was observed               (not built here)
```

Scope: model and generation logic only. No routes, UI, technician features or
workflow are part of this module.

## Architecture

The architecture is a hybrid rule engine with optional LLM augmentation (Option E from the brief).

```
input ─► normalise ─► classify ─► attributes + claims ─► category baseline (+ conditional checks)
      ─► brand/model profiles ─► claim-vs-actual checks ─► de-duplicate
      ─► [optional] Claude adds product-specific checks ─► validate (safety, relevance, claims, duplicates)
      ─► finalise (priority, evidence, sampling) ─► ProtocolSchema ─► protocol JSON
```

| Stage | File | What it does |
|---|---|---|
| Input | `schema.js`, `normalize.js` | Zod-validated input; `fromResource()` adapts an Indulge listing |
| Classification | `classify.js` | Keyword scoring over `config/taxonomy.json`; explains the matched terms |
| Extraction | `extract.js` | Provider claims (`config/spec-rules.json`) and attributes (`config/attribute-rules.json`), each with its source |
| Baseline | `baseline.js` | Category template (with inheritance) and conditional checks; `templates/*.json` |
| Product-specific | `enrich.js` | Brand/model profiles (`config/brand-profiles.json`) and claim-vs-actual checks |
| AI (optional) | `ai.js`, `prompt.js` | Claude suggests extra checks as strict JSON; additive only |
| Validation | `validate.js`, `knowledge.js` | Duplicates, safety, relevance, unsupported claims, rules 5–10 |
| Orchestration | `generate.js` | Pipeline, fallback, versioning, final schema check |

### Why this architecture

- **No real training data exists yet.** The project has no inspection records, so
  there is nothing to train or fine-tune on. Nothing here is presented as a trained model.
- **Reliability and explainability come first.** The deterministic layers always
  produce a complete protocol, and every parameter carries `basis` and `reason`,
  recording which template, condition, claim, brand profile or AI suggestion
  produced it.
- **Product specificity comes from maintainable knowledge.** Brand/model profiles
  and claim rules are data, not code. The LLM adds depth where that knowledge runs out.
- **No large ML stack.** It is plain Node, runs where the API runs, and its only
  new dependency is `@anthropic-ai/sdk`, which is used only when AI is enabled.

## Input

Only `productName` is required. See `InputSchema` in `schema.js`.

```json
{
  "productName": "Dell Latitude 5420",
  "category": "Laptop",
  "brand": "Dell",
  "model": "Latitude 5420",
  "description": "Used for office work, well maintained.",
  "declaredCondition": "Excellent",
  "usageAge": "2 years",
  "intendedUse": "optional",
  "quantity": 1,
  "specifications": { "cpu": "Intel i5", "ram": "16GB", "storage": "512GB SSD" },
  "features": [],
  "accessories": [],
  "images": [],
  "listingCategory": "optional Indulge category",
  "sourceRef": { "type": "resource", "id": "…" }
}
```

Indulge listings have no brand, model or specification fields.
`generateForResource(resource)` maps title, description, highlights, tags,
quantity and images, and the claims are recovered from the text. The Resource
model is unchanged.

## Output

A protocol (`ProtocolSchema`) with metadata plus `parameters[]`. Each parameter
has the following fields:

| Field | Meaning |
|---|---|
| `id`, `title`, `description` | the check |
| `category` | physical · functional · specification · identity · safety · accessories · performance · cosmetic · documentation · other |
| `instructions[]`, `expectedResult` | how to check it and what "pass" looks like |
| `verificationType` | visual · functional_test · system_check · measurement · document_check · serial_check · comparison · manual_test |
| `claimedValue`, `verificationInstruction` | the provider's claim to compare with the observed value (claims only) |
| `required`, `weight` (1–5), `priority` | importance (`config/priorities.json`) |
| `requiresEvidenceOnFail` | photo/document evidence needed if it fails |
| `requiresQualifiedInspector` | specialist check (brakes, gas, output voltage, rigging) |
| `appliesTo` | every_unit · sample · lot (for multi-unit lots) |
| `generationSource` | baseline · ai_generated · baseline_plus_ai |
| `basis`, `reason` | why it was generated |
| `status` | always `pending_inspection` |

Protocol-level fields:

- `classification`, which records the method, matched terms and runner-up category.
- `attributes`, with the source of each value.
- `claims`.
- `inspectionScope`, which holds the sampling plan for lots.
- `imageHints`, which are hints only and never evidence.
- `validation`, which records merged duplicates, rejected AI checks, removed unsafe instructions and checks that were not applicable.
- `generation`, which records `modelName`, `modelVersion`, `promptVersion`, `templateVersion`, the knowledge versions, `generationTimestamp`, `mode` and the AI status.

**Confidence.** No numeric confidence is reported. The rules are deterministic,
and LLM token probabilities are not a validated confidence measure.
`generationSource`, `basis` and `reason` explain each parameter instead.
Classification reports a rule score and its margin over the runner-up, not a probability.

## Knowledge base

| File | Purpose |
|---|---|
| `config/taxonomy.json` | categories, keywords and parent categories |
| `config/parameters.json` | library of parameter definitions; aliases drive de-duplication |
| `templates/<category>.json` | mandatory and conditional checks, attribute defaults, irrelevant terms, lot sampling, `extends` |
| `config/spec-rules.json` | claim keys, aliases, text patterns, how each is verified |
| `config/attribute-rules.json` | attributes that switch conditional checks (battery, touchscreen, transmission, gas, …) |
| `config/brand-profiles.json` | brand/model knowledge (Apple Activation Lock, Dell diagnostics, Innova seat access, …) |
| `config/priorities.json` | weight scale with a justification for each level |
| `config/safety.json` | forbidden instructions and qualified-inspector triggers |

`knowledge.js` checks the whole knowledge base at load time. It checks that every
reference resolves, that no alias names two different checks, and that every
hand-written instruction passes the safety rules.

**Adding a category** takes two steps: add an entry in `taxonomy.json` and a
template in `templates/`. Use `extends` to inherit from a parent, such as
`electronics`. No code changes are needed.

## Generation rules

1. **Category baseline.** Every product gets its category's mandatory checks.
2. **Product-specific checks.** These come from brand/model profiles, claims and
   (optionally) the AI, all based on the actual listing.
3. **Claim checks.** Declared specifications become claim-vs-actual checks, from
   explicit specs first and from the listing text otherwise.
4. **Conditional checks.** These follow the attributes: a touchscreen laptop gets
   a touchscreen check, an automatic vehicle gets the gear test, and only
   battery-powered items get battery checks.
5. **No duplicates.** Duplicates are merged through aliases, containment and title
   overlap. Curated library checks are never merged with each other.
6. **Method.** Every parameter has a verification method.
7. **Expected result.** Every parameter has an expected result.
8. **Evidence.** Physical, cosmetic, safety and identity checks require evidence on failure.
9. **No irrelevant checks.** AI checks mentioning a template's irrelevant terms
   are rejected, with the reason recorded.
10. **Nothing is marked verified.**

**Safety.** Instructions that would require disassembly, bypassing a safeguard,
live electrical work, a flame near gas, unsafe driving or overloading a structure
are removed, wherever they came from. Negated warnings such as "do not open the
casing" are allowed. Specialist checks are marked `requiresQualifiedInspector`,
and their steps are limited to what is safe to observe.

## AI layer and fallback

`ai.js` calls Claude (`claude-opus-5`) through `@anthropic-ai/sdk` with a strict
JSON schema (`output_config.format`). The request includes up to 4 listing images
as hints, and uses server-side refusal fallback (`fallbacks: "default"`). The
prompt is in `prompt.js`, versioned by `PROMPT_VERSION`.

| Env | Default | |
|---|---|---|
| `INSPECTION_AI` | `auto` | `auto` = on when `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` is set; `on`; `off` |
| `INSPECTION_AI_MODEL` | `claude-opus-5` | |
| `INSPECTION_AI_TIMEOUT_MS` | `60000` | |
| `INSPECTION_AI_IMAGES` | `on` | send listing images as hints |

The AI layer only adds checks. Any failure (credentials, network, rate limit,
refusal, truncation, invalid JSON, schema mismatch) returns the full baseline
protocol, with `generation.mode = "baseline_only"` and the reason recorded in
`generation.ai`. The protocol is never empty. AI-suggested checks are capped at
weight 4, because only curated checks can be critical, and a claimed value is
kept only if it appears in the provider's input.

## Commands

```bash
cd server
npm run inspect:demo                       # 5 demo products → examples/output/*.json
npm run inspect:generate -- product.json   # one product (add --no-ai, --json)
npm run inspect:eval                       # evaluate on dataset/benchmark.jsonl (add --ai)
node src/ml/inspection/dataset/split.js records.jsonl [--write]
npm run verify                             # includes the generator's checks (offline, mock AI)
```

```js
import { generateInspectionProtocol, generateForResource } from './ml/inspection/generate.js';
const protocol = await generateInspectionProtocol(input);            // AI if configured
const baselineOnly = await generateInspectionProtocol(input, { ai: false });
```

## Training data, evaluation and what "trained" would mean

**There is no real training data today, so no model is trained.** The pieces for
training later are in place:

- **`dataset/record.schema.json`** is the record format. A record holds the input,
  the protocol and its versions, and the technician's labels: required checks,
  irrelevant checks, missing checks, and claim-vs-observed values with evidence
  references. It supports supervised training (input → parameter ids),
  fine-tuning (input → protocol), retrieval of similar past products, and
  evaluation.
- **`dataset/split.js`** splits records by `productKey` (brand|model), so the
  same product never appears in both training and test data. It refuses to
  produce a training split from fewer than 300 real records.
- **`evaluate.js`** measures category accuracy, parameter recall, relevance
  violations (a bounded stand-in for precision), claim coverage, redundancy,
  schema validity and unsafe instructions.
- **`dataset/benchmark.jsonl`** has 16 **hand-authored acceptance cases**
  covering all categories. They were written by the same author as the rules,
  so scores on them are optimistic. They show the pipeline behaves as designed,
  and are not evidence of real-world accuracy.

Once technician feedback exists, there are three ways to use it:

1. **Retrieval.** Pass similar past products and their final checklists to the
   AI layer as examples.
2. **Supervised model.** Learn which library parameters apply from the input,
   as a multi-label classifier (the delivery model's `forest.js` could be
   reused). Compare it with the rule baseline on the grouped test split.
3. **Knowledge updates.** Checks technicians repeatedly add become library
   parameters; checks they repeatedly mark irrelevant become template exclusions.
