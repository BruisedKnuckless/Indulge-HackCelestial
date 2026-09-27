import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildIntakeChain, createNugenChatModel } from './chain.js';
import { callGemini, hasInjectedGeminiClient } from './gemini.js';
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
 *   Gemini (fallback, only if Nugen didn't answer) ──► grounding ─┤
 *   rule parser ──────────────────────────────────────► grounding ─┴─► merge ─► draft
 *
 * Nugen is the required integration (HackCelestial Task 2) and is always
 * tried first. Gemini only runs when Nugen is down, unconfigured, or its
 * reply fails grounding, and only if GEMINI_API_KEY is set — it exists so a
 * third-party outage on Nugen's side doesn't take the whole AI experience
 * down with it. It is never presented as the aligned model: `ai.provider`
 * says plainly which one actually answered, and the client is responsible
 * for labelling a Gemini-filled field as a fallback, not as Indulge-RFQ.
 * The rule parser is the final, always-available fallback. Never throws —
 * the intake box always answers. Nothing here posts anything: the seeker
 * reviews the draft and posts it through the normal route, which
 * re-validates everything.
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

/** Gemini fallback config. Off unless GEMINI_API_KEY is set (or RFQ_AI=off). */
export function geminiConfig(env = process.env) {
  const mode = String(env.RFQ_AI || 'auto').toLowerCase();
  const apiKey = env.GEMINI_API_KEY || '';
  return {
    enabled: mode !== 'off' && (hasInjectedGeminiClient() || Boolean(apiKey)),
    apiKey,
    model: env.GEMINI_MODEL || 'gemini-flash-latest',
    timeoutMs: Number(env.RFQ_AI_TIMEOUT_MS) || 15000,
  };
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
    provider: null,
    model: config.enabled ? config.model : null,
    aligned: config.enabled ? config.aligned : false,
    confidenceScore: null,
    latencyMs: null,
    promptVersion: PROMPT_VERSION,
    nugenReason: null, // set only when Gemini rescues a Nugen failure/absence
  };

  // 1. Nugen — the required integration, always tried first.
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
      ai.provider = 'nugen';
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

  // 2. Gemini — only if Nugen did not produce usable fields. A resilience
  // fallback, not a second primary path: it never claims to be the aligned
  // model, and is skipped entirely unless GEMINI_API_KEY is set.
  if (ai.status !== 'ok') {
    const gConfig = geminiConfig(env);
    if (gConfig.enabled) {
      const nugenReason = ai.reason;
      const started = Date.now();
      try {
        const result = await callGemini(request, { apiKey: gConfig.apiKey, model: gConfig.model, timeoutMs: gConfig.timeoutMs });
        rawOutput = result.output;
        const grounded = groundOutput(result.output, request);
        modelFields = grounded.fields;
        dropped = grounded.dropped;
        ai.status = 'ok';
        ai.provider = 'gemini';
        ai.model = gConfig.model;
        ai.aligned = false;
        ai.confidenceScore = null;
        ai.reason = null;
        ai.nugenReason = nugenReason;
      } catch (err) {
        // Gemini failing too isn't a second user-facing error — Nugen's own
        // status/reason (already set above) is what actually needs fixing.
        logger.error('RFQ intake: Gemini fallback call failed', {
          model: gConfig.model,
          httpStatus: err?.status ?? null,
          message: err?.message,
        });
      }
      ai.latencyMs = (ai.latencyMs || 0) + (Date.now() - started);
    }
  }

  // Merge: the AI provider's grounded values first, the rules fill the gaps.
  const fields = {};
  const sources = {};
  for (const key of OUTPUT_KEYS) {
    if (modelFields[key] != null) {
      fields[key] = modelFields[key];
      sources[key] = ai.provider;
    } else if (rules.fields[key] != null) {
      fields[key] = rules.fields[key];
      sources[key] = 'rules';
    }
  }
  // The unit follows the category when nobody said otherwise.
  if (fields.category && (!fields.unit || sources.unit !== sources.category)) {
    const unit = modelFields.unit || LEXICON[fields.category].unit;
    fields.unit = unit;
    sources.unit = modelFields.unit ? ai.provider : sources.category;
  }

  const draft = toDraft(fields, { today: day });

  // Per form field: who filled it, and what the seeker should double-check.
  const fieldSources = {};
  for (const [key, source] of Object.entries(sources)) {
    const formField = FORM_FIELD[key];
    if (formField === 'dates' && !draft.start) continue;
    // An AI source (nugen/gemini) is sticky over 'rules', since several keys
    // (dateText/startTime/endTime) can share one form field.
    fieldSources[formField] = fieldSources[formField] && fieldSources[formField] !== 'rules' ? fieldSources[formField] : source;
  }
  const check = new Set(dropped.map((d) => FORM_FIELD[d.field]).filter((f) => !fieldSources[f]));
  if (fields.dateText && !draft.start) check.add('dates');
  if (ai.status === 'ok' && ai.confidenceScore != null && ai.confidenceScore < config.minConfidence) {
    for (const [field, source] of Object.entries(fieldSources)) if (source === ai.provider) check.add(field);
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
