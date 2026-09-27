import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT, FEW_SHOT, formatInstruction } from './prompt.js';
import { parseModelJson } from './chain.js';

/**
 * Second-tier fallback for RFQ intake: Google Gemini, called directly.
 *
 * Nugen is the required integration (HackCelestial Task 2) and is always
 * tried first; this only runs when Nugen doesn't produce usable fields
 * (down, unconfigured, or its reply fails grounding) and GEMINI_API_KEY is
 * set. It is never presented as "the aligned model" — intake.js and the UI
 * both label it plainly as a fallback, so it can never be mistaken for the
 * Nugen deliverable.
 *
 * Called directly via the @google/genai SDK rather than through LangChain:
 * unlike Nugen (which needs an OpenAI-compatible base URL swap to reuse
 * ChatOpenAI), there is no shared abstraction LangChain would buy here, and
 * the SDK's own generateContent call is already a single, simple request.
 */

let injectedClient = null;
/** verify.js only: route every Gemini call through this fake client. */
export function setGeminiClientForTests(client) {
  injectedClient = client;
}

/** intake.js: an injected test client counts as configured, no key needed. */
export function hasInjectedGeminiClient() {
  return injectedClient !== null;
}

const contentsFor = (text) => [
  ...FEW_SHOT.flatMap((ex) => [
    { role: 'user', parts: [{ text: formatInstruction(ex.text) }] },
    { role: 'model', parts: [{ text: JSON.stringify(ex.output) }] },
  ]),
  { role: 'user', parts: [{ text: formatInstruction(text) }] },
];

/**
 * Calls Gemini and returns { output, modelName, usage }. Throws on any
 * failure (bad key, timeout, empty/invalid reply) — intake.js catches it and
 * falls back further, to the rule parser, exactly like a Nugen failure.
 */
export async function callGemini(text, { apiKey, model, timeoutMs = 15000 }) {
  const client = injectedClient || new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await client.models.generateContent({
      model,
      contents: contentsFor(text),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
        abortSignal: controller.signal,
      },
    });
    const raw = response?.text;
    if (!raw) throw new Error('Gemini returned an empty response');
    const output = await parseModelJson(raw);
    return { output, modelName: model, usage: response.usageMetadata || null };
  } finally {
    clearTimeout(timer);
  }
}
