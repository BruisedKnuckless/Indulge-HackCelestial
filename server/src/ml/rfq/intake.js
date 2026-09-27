import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildIntakeChain, createNugenChatModel } from './chain.js';
import { formatInstruction, OUTPUT_KEYS, PROMPT_VERSION } from './prompt.js';
import { groundOutput, toDraft } from './ground.js';
import { parseWithRules } from './rules.js';
import { indiaToday } from './resolve.js';
import { LEXICON } from './vocab.js';
import { logger } from '../../utils/logger.js';

/**
 * RFQ smart intake: free text → a draft for the Post Requirement form.
 *
 *   Nugen-aligned model (via LangChain) ─► grounding ─┐
 *   rule parser ─────────────────────────► grounding ─┴─► merge ─► draft
 *
 * The model's grounded fields win; the rule parser fills whatever the model
 * left out or had dropped. With Nugen off, unconfigured or failing, the draft
 * is the rule parser's alone. Never throws — the intake box always answers.
 * Nothing here posts anything: the seeker reviews the draft and posts it
 * through the normal route, which re-validates everything.
 */

const MODEL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'nugen-model.json');

let injectedModel = null;
/** verify.js only: route every intake through this chat model (null clears). */
export function setIntakeModelForTests(model) {
  injectedModel = model;
}

function recordedModel() {
  try {
    return JSON.parse(readFileSync(MODEL_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Which model the intake uses. The aligned model recorded by `npm run
 * rfq:align` (or NUGEN_RFQ_MODEL); before alignment has finished, the Nugen
 * base model, labelled as such so the UI never calls it aligned.
 */
export function intakeConfig(env = process.env) {
  const mode = String(env.RFQ_AI || 'auto').toLowerCase();
  const apiKey = env.NUGEN_API_KEY || '';
  const recorded = recordedModel();
  const model = env.NUGEN_RFQ_MODEL || recorded?.modelId || env.NUGEN_BASE_MODEL || 'llama-v3p2-3b-reasoning';
  const aligned = Boolean(env.NUGEN_RFQ_MODEL || recorded?.modelId);
  const timeoutMs = Number(env.RFQ_AI_TIMEOUT_MS) || 15000;
  const minConfidence = Number(env.RFQ_MIN_CONFIDENCE ?? 40);

  let enabled;
  let reason = null;
  if (mode === 'off') {
    enabled = false;
    reason = 'RFQ_AI is off';
  } else if (injectedModel) {
    enabled = true;
  } else if (!apiKey) {
    enabled = false;
    reason = 'NUGEN_API_KEY is not set';
  } else {
    enabled = true;
  }
  return { enabled, reason, mode, apiKey, model, aligned, timeoutMs, minConfidence };
}

function describeError(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 401 || status === 403) return 'Nugen rejected the API key';
  if (status === 404) return 'the Nugen model was not found or is not deployed';
  if (status === 422) return 'Nugen rejected the request';
  if (status === 429) return 'Nugen rate limit reached';
  if (status >= 500) return 'Nugen is unavailable';
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || /timed? ?out|abort/i.test(err?.message || '')) return 'Nugen timed out';
  if (err instanceof SyntaxError) return 'the model reply was not valid JSON';
  return 'the model call failed';
}

// Model output keys → the form fields they fill.
const FORM_FIELD = {
  category: 'category',
  title: 'title',
  quantity: 'quantity',
  unit: 'unit',
  minCapacity: 'minCapacity',
  budget: 'maxPrice',
  city: 'location',
  dateText: 'dates',
  startTime: 'dates',
  endTime: 'dates',
  urgency: 'urgency',
  notes: 'description',
};

export async function parseRequirementText(text, { today, env = process.env, model } = {}) {
  const request = String(text || '').trim();
  const day = today || indiaToday();
  const config = intakeConfig(env);

  const rules = groundOutput(parseWithRules(request), request);

  let modelFields = {};
  let dropped = [];
  let rawOutput = null;
  const ai = {
    status: config.enabled ? 'pending' : 'disabled',
    reason: config.reason,
    provider: 'nugen',
    model: config.enabled ? config.model : null,
    aligned: config.enabled ? config.aligned : false,
    confidenceScore: null,
    latencyMs: null,
    promptVersion: PROMPT_VERSION,
  };

  if (config.enabled) {
    const started = Date.now();
    try {
      const chatModel =
        model || injectedModel || createNugenChatModel({ model: config.model, apiKey: config.apiKey, timeoutMs: config.timeoutMs });
      const result = await buildIntakeChain(chatModel).invoke(
        { instruction: formatInstruction(request) },
        { signal: AbortSignal.timeout(config.timeoutMs + 1000) }
      );
      rawOutput = result.output;
      const grounded = groundOutput(result.output, request);
      modelFields = grounded.fields;
      dropped = grounded.dropped;
      ai.status = 'ok';
      ai.confidenceScore = result.confidenceScore;
      if (result.modelName) ai.model = result.modelName;
    } catch (err) {
      ai.status = 'failed';
      ai.reason = describeError(err);
      // describeError() only returns a short phrase for the UI; the raw
      // status/body is what actually explains a Nugen failure, so it goes to
      // the server log (never to the client — it may echo request details).
      logger.error('RFQ intake: Nugen call failed', {
        model: config.model,
        httpStatus: err?.status ?? err?.response?.status ?? null,
        errorType: err?.type || err?.code || err?.name || null,
        errorBody: err?.error ?? null,
        message: err?.message,
      });
    }
    ai.latencyMs = Date.now() - started;
  }

  // Merge: the model's grounded values first, the rules fill the gaps.
  const fields = {};
  const sources = {};
  for (const key of OUTPUT_KEYS) {
    if (modelFields[key] != null) {
      fields[key] = modelFields[key];
      sources[key] = 'nugen';
    } else if (rules.fields[key] != null) {
      fields[key] = rules.fields[key];
      sources[key] = 'rules';
    }
  }
  // The unit follows the category when nobody said otherwise.
  if (fields.category && (!fields.unit || sources.unit !== sources.category)) {
    const unit = modelFields.unit || LEXICON[fields.category].unit;
    fields.unit = unit;
    sources.unit = modelFields.unit ? 'nugen' : sources.category;
  }

  const draft = toDraft(fields, { today: day });

  // Per form field: who filled it, and what the seeker should double-check.
  const fieldSources = {};
  for (const [key, source] of Object.entries(sources)) {
    const formField = FORM_FIELD[key];
    if (formField === 'dates' && !draft.start) continue;
    fieldSources[formField] = fieldSources[formField] === 'nugen' ? 'nugen' : source;
  }
  const check = new Set(dropped.map((d) => FORM_FIELD[d.field]).filter((f) => !fieldSources[f]));
  if (fields.dateText && !draft.start) check.add('dates');
  if (ai.status === 'ok' && ai.confidenceScore != null && ai.confidenceScore < config.minConfidence) {
    for (const [field, source] of Object.entries(fieldSources)) if (source === 'nugen') check.add(field);
  }

  return {
    draft,
    fieldSources,
    check: [...check],
    dropped,
    ai,
    output: rawOutput,
    today: day,
  };
}
