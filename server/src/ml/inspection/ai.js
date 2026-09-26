import { AiOutputSchema, AI_OUTPUT_JSON_SCHEMA } from './schema.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { DEFAULT_AI_MODEL } from './version.js';

/**
 * Optional LLM augmentation (Claude, via the Anthropic SDK).
 *
 * It only ever *adds* product-specific checks to a baseline that is already
 * complete on its own, and everything it returns is validated again
 * (validate.js). Any failure — no credentials, network, rate limit, refusal,
 * truncation, malformed JSON — returns { status: 'failed' } and the caller
 * falls back to the baseline protocol. It never throws.
 *
 * Configuration (environment):
 *   INSPECTION_AI            auto (default) | on | off
 *                            auto = use the model only if ANTHROPIC_API_KEY or
 *                            ANTHROPIC_AUTH_TOKEN is set
 *   INSPECTION_AI_MODEL      default claude-opus-5
 *   INSPECTION_AI_TIMEOUT_MS default 60000
 *   INSPECTION_AI_IMAGES     on (default) | off — send listing images as hints
 */

export function aiConfig(overrides = {}) {
  const mode = (overrides.mode ?? process.env.INSPECTION_AI ?? 'auto').toLowerCase();
  const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return {
    enabled: overrides.client ? mode !== 'off' : mode === 'on' || (mode === 'auto' && hasCredentials),
    mode,
    model: overrides.model || process.env.INSPECTION_AI_MODEL || DEFAULT_AI_MODEL,
    timeoutMs: Number(overrides.timeoutMs || process.env.INSPECTION_AI_TIMEOUT_MS || 60000),
    images: (overrides.images ?? process.env.INSPECTION_AI_IMAGES ?? 'on') !== 'off',
    client: overrides.client || null,
  };
}

let sdk = null;
async function loadSdk() {
  if (!sdk) sdk = (await import('@anthropic-ai/sdk')).default;
  return sdk;
}

function describeError(err, Anthropic) {
  if (!Anthropic) return err?.message || String(err);
  if (err instanceof Anthropic.AuthenticationError) return 'authentication failed';
  if (err instanceof Anthropic.RateLimitError) return 'rate limited';
  if (err instanceof Anthropic.BadRequestError) return `bad request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timed out';
  if (err instanceof Anthropic.APIConnectionError) return 'connection failed';
  if (err instanceof Anthropic.APIError) return `API error ${err.status}: ${err.message}`;
  return err?.message || String(err);
}

async function callModel({ client, cfg, context, withImages }) {
  const content = [];
  if (withImages) {
    for (const url of context.input.images.slice(0, 4)) content.push({ type: 'image', source: { type: 'url', url } });
  }
  content.push({ type: 'text', text: buildUserMessage(context) });

  const response = await client.beta.messages.create(
    {
      model: cfg.model,
      max_tokens: 16000,
      // Server-side fallback: if the model's safety classifiers decline the
      // request, the API re-runs it on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: AI_OUTPUT_JSON_SCHEMA } },
    },
    { timeout: cfg.timeoutMs, maxRetries: 1 }
  );

  if (response.stop_reason === 'refusal') throw Object.assign(new Error('model declined the request'), { code: 'refusal' });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('response truncated'), { code: 'truncated' });

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error('response was not valid JSON'), { code: 'invalid_json' });
  }
  const result = AiOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw Object.assign(new Error(`response failed schema validation: ${result.error.issues[0]?.message}`), { code: 'invalid_schema' });
  }
  return { output: result.data, model: response.model, usage: response.usage };
}

/**
 * @returns {Promise<{status: 'disabled'|'ok'|'failed', reason?: string, model: string,
 *   parameters: object[], imageObservations: object[], imagesUsed: boolean, inferredCategory?: string}>}
 */
export async function augmentWithAI(context, overrides = {}) {
  const cfg = aiConfig(overrides);
  const base = { model: cfg.model, parameters: [], imageObservations: [], imagesUsed: false };
  if (!cfg.enabled) {
    return { ...base, status: 'disabled', reason: cfg.mode === 'off' ? 'INSPECTION_AI=off' : 'no Anthropic credentials configured' };
  }

  let Anthropic = null;
  try {
    let client = cfg.client;
    if (!client) {
      Anthropic = await loadSdk();
      client = new Anthropic();
    }
    const wantImages = cfg.images && context.input.images.length > 0;
    let result;
    try {
      result = await callModel({ client, cfg, context, withImages: wantImages });
    } catch (err) {
      // An unreachable image URL fails the whole request; retry once without images.
      const isBadRequest = Anthropic ? err instanceof Anthropic.BadRequestError : err?.status === 400;
      if (!wantImages || !isBadRequest) throw err;
      result = await callModel({ client, cfg, context, withImages: false });
      result.imagesFailed = true;
    }
    return {
      ...base,
      status: 'ok',
      model: result.model || cfg.model,
      parameters: result.output.additionalParameters,
      imageObservations: result.output.imageObservations,
      inferredCategory: result.output.inferredCategory,
      imagesUsed: wantImages && !result.imagesFailed,
      usage: result.usage ? { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens } : undefined,
    };
  } catch (err) {
    return { ...base, status: 'failed', reason: err?.code || describeError(err, Anthropic) };
  }
}
