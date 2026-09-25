/**
 * gemini.service.js
 *
 * Thin wrapper around the Google Generative AI SDK.
 * All Gemini access in this codebase MUST go through this module so the API
 * key is never exposed to the React client and all model config is
 * consolidated in one place.
 *
 * Model: gemini-2.5-flash (as requested)
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from '../../config/env.js';

let _client = null;

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

/** The primary chat/assistant model. */
export function getChatModel() {
  return getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
    safetySettings: [],
  });
}

/** A lower-temperature model for structured extraction tasks. */
export function getStructuredModel() {
  return getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
    safetySettings: [],
  });
}

/**
 * Simple one-shot text generation helper.
 * Returns the text string from the first candidate.
 */
export async function generateText(prompt, { structured = false } = {}) {
  const model = structured ? getStructuredModel() : getChatModel();
  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (err) {
    // Surface a clean message so routes can catch it without crashing
    throw new Error(`Gemini generation failed: ${err.message}`);
  }
}

/**
 * Multi-turn chat session factory.
 * Pass `history` (array of {role, parts:[{text}]}) to restore context.
 */
export function startChatSession(history = []) {
  const model = getChatModel();
  return model.startChat({ history });
}

export { SchemaType };
