# RFQ smart intake: a Nugen-aligned model, called through LangChain

A seeker types what they need the way they would message a supplier:

> Need 250 banquet chairs + PA system in Navi Mumbai, 12 Oct 6pm–11pm, budget 40k, urgent

and the Post Requirement form fills itself: category, quantity, budget, city,
date window, urgency. The seeker reviews the draft and posts it through the
normal route, which validates everything again (including availability).

## Pipeline

```
Base model (Nugen, e.g. qwen-v2p5-0p5b-instruct)
   │  npm run rfq:dataset   synthetic RFQs + domain guide + our benchmark
   │  npm run rfq:align     Nugen: documents → benchmark → alignment → deploy
   ▼
Indulge-RFQ (domain-aligned model, id in nugen-model.json)
   │  POST /api/requirements/parse
   ▼
LangChain chain (chain.js)
   ChatPromptTemplate ─► ChatOpenAI @ api.nugen.in/api/v3/inference ─► JSON parser
   ▼
ground.js   field-by-field validation; numbers must appear in the request,
            the city must be named, date words must be verbatim
   ▼
rules.js    fills anything the model left out or had dropped
   ▼
resolve.js  date words + times → a local window (the model never does date maths)
   ▼
draft + per-field source (nugen | rules) + fields to double-check + confidence_score
```

The model is small (0.5B–3B), so it only extracts. Everything that can be done
deterministically is: arithmetic, validation, fallback. This is the same shape
as the delivery forest (`ml/delivery`) and the Claude step in inspections.

## Files

| File | Role |
|---|---|
| `vocab.js` | Category lexicon, units, cities, urgency words. Source of truth for labels: `synth.js` writes with it, `rules.js` reads with it. |
| `prompt.js` | The prompt contract. Training pairs and inference use the same `formatInstruction()`. Bump `PROMPT_VERSION` when it changes. |
| `synth.js` | Seeded synthetic requests with gold JSON (Indian number styles, Hinglish, noise). 28 training templates, 12 held out. |
| `build-dataset.js` | `npm run rfq:dataset` → `data/` |
| `align.js` | `npm run rfq:align`: runs the Nugen alignment end to end; resumable. |
| `chain.js` | The LangChain pipeline. |
| `ground.js`, `rules.js`, `resolve.js` | The deterministic layers. |
| `intake.js` | `parseRequirementText()`: the orchestrator the route calls. Never throws. |
| `evaluate.js` | `npm run rfq:eval`: rules vs base vs aligned vs pipeline → `metrics.json`. |
| `nugen-model.json` | Written by `rfq:align`: the deployed aligned model id. |

## Data (`data/`)

- `rfq-intake-train.jsonl`: 900 `{instruction, response}` pairs (Nugen document)
- `rfq-intake-guide.md`: domain guide: categories, Indian money formats, city aliases, output contract (Nugen document)
- `rfq-intake-benchmark.json`: 40 held-out samples in Nugen's benchmark format
- `rfq-intake-test.jsonl`: 150 held-out synthetic requests
- `rfq-intake-handwritten.jsonl`: 30 **hand-authored** requests in phrasing no template or rule was written for. Keep it hand-written; never generate it.

There is no history of real free-text RFQs yet, so training data is synthetic.
Every live intake is logged as an `RfqIntake`, and those real phrasings are the
next alignment dataset.

## Running it

```bash
cd server
npm run rfq:dataset                     # deterministic; commit data/
NUGEN_API_KEY=... npm run rfq:align     # or put the key in server/.env
npm run rfq:eval                        # writes metrics.json
```

Configuration (server env):

| Variable | Default | |
|---|---|---|
| `NUGEN_API_KEY` | none | Without it the intake runs on the rule parser alone. |
| `NUGEN_BASE_MODEL` | `qwen-v2p5-0p5b-instruct` | Base to align; `rfq:align` lists what the account can align. |
| `NUGEN_RFQ_MODEL` | from `nugen-model.json` | Override the aligned model id. |
| `RFQ_AI` | `auto` | `auto` / `on` / `off`. |
| `RFQ_AI_TIMEOUT_MS` | `15000` | |
| `RFQ_MIN_CONFIDENCE` | `40` | Below this Nugen `confidence_score`, model-filled fields are flagged "Check". |

Before an aligned model exists, a configured key uses the Nugen base model, and
the UI says so. It never calls that model aligned.

## Results

`metrics.json` holds the latest `npm run rfq:eval`. Rules-only baseline, before alignment:

| | synthetic held-out (150) | hand-written (30) |
|---|---|---|
| mean field accuracy | 100% | 83.7% |
| all fields right | 100% | 26.7% |
| category | 100% | 56.7% |
| quantity | 100% | 43.3% |

The rules share the generator's vocabulary, so they are perfect on synthetic
requests by construction. The hand-written set is the honest test: that is
where the aligned model has to beat them.
