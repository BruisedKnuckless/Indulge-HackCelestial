/**
 * gemini.service.js
 *
 * Thin wrapper around the Google Generative AI SDK.
 * All Gemini access in this codebase MUST go through this module so the API
 * key is never exposed to the React client and all model config is
 * consolidated in one place.
 *
 * Model fallback chain (tried in order):
 *   1. gemini-3.8-flash         — primary (fastest, as requested)
 *   2. gemini-3.1-flash-lite    — stable fallback
 *   3. gemini-3.7-flash         — second fallback
 *   4. gemini-3.5-flash         — last resort
 *
 * 503 (high demand) triggers automatic fallback.
 * 404 means the model doesn't exist for this key — skip immediately.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from '../../config/env.js';

let _client = null;

// Ordered fallback chain — first available/responsive wins
const MODEL_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
];

function getClient() {
  if (!_client) {
    const key = env.geminiApiKey;
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to server/.env before using the AI layer.'
      );
    }
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

/**
 * Returns a model instance for the given name.
 */
function buildModel(modelName, { structured = false } = {}) {
  return getClient().getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: structured ? 0.1 : 0.4,
      maxOutputTokens: structured ? 1024 : 2048,
      ...(structured ? { responseMimeType: 'application/json' } : {}),
    },
    safetySettings: [],
  });
}

/**
 * Whether an error is retryable (overload / temporary).
 * 503 = high demand, 429 = rate limit → try next model.
 * 404 = model not found for this key → try next model.
 * Other errors (400, 401, auth) → throw immediately.
 */
function isRetryable(err) {
  const status = err?.status ?? err?.errorDetails?.[0]?.code ?? 0;
  return status === 503 || status === 429 || status === 404 ||
    (err?.message || '').includes('503') ||
    (err?.message || '').includes('429') ||
    (err?.message || '').includes('404');
}

/**
 * Simple one-shot text generation with automatic model fallback.
 * Returns the text string from the first successful candidate.
 */
export async function generateText(prompt, { structured = false } = {}) {
  let lastErr;
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = buildModel(modelName, { structured });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      if (isRetryable(err)) {
        console.warn(`[gemini] ${modelName} unavailable (${err.status ?? '?'}), trying next model...`);
        continue;
      }
      // Non-retryable — surface immediately
      throw new Error(`Gemini generation failed: ${err.message}`);
    }
  }
  throw new Error(`All Gemini models are temporarily unavailable. Last error: ${lastErr?.message}`);
}

/**
 * Multi-turn chat session with automatic model fallback.
 *
 * Because startChat() doesn't fail until sendMessage() is called,
 * we return a wrapper object whose sendMessage() retries across models.
 *
 * Pass `history` (array of {role, parts:[{text}]}) to restore context.
 */
export function startChatSession(history = []) {
  return {
    async sendMessage(message) {
      let lastErr;
      for (const modelName of MODEL_CHAIN) {
        try {
          const model = buildModel(modelName);
          const chat = model.startChat({ history });
          const result = await chat.sendMessage(message);
          return result;
        } catch (err) {
          lastErr = err;
          if (isRetryable(err)) {
            console.warn(`[gemini] ${modelName} unavailable (${err.status ?? '?'}), trying next model...`);
            continue;
          }
          throw new Error(`Gemini chat failed: ${err.message}`);
        }
      }
      throw new Error(`All Gemini models are temporarily unavailable. Last error: ${lastErr?.message}`);
    },
  };
}

/** Convenience accessors kept for backward compat with any future direct callers. */
export function getChatModel() {
  return buildModel(MODEL_CHAIN[0]);
}

export function getStructuredModel() {
  return buildModel(MODEL_CHAIN[0], { structured: true });
}

export { SchemaType };
