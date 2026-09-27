import { GoogleGenAI, ThinkingLevel } from '@google/genai';
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Google sheds load with 503 "high demand" often; one short retry usually clears it. */
async function withRetryOn503(fn, signal) {
  try {
    return await fn();
  } catch (err) {
    if (err?.status !== 503 || signal.aborted) throw err;
    await sleep(1000);
    return fn();
  }
}

/**
 * Calls Gemini and returns { output, modelName, usage }. Throws on any
 * failure (bad key, timeout, empty/invalid reply) — intake.js catches it and
 * falls back further, to the rule parser, exactly like a Nugen failure.
 *
 * Gemini's newer models "think" before answering, and those thinking tokens
 * count against maxOutputTokens: at 300 the thinking alone used the whole
 * budget and the JSON came back cut off after eleven tokens. Extraction needs
 * no reasoning, so thinking is set to LOW and the cap is generous. Some
 * models reject a thinking level outright (400), so that request is retried
 * once without it rather than failing the whole fallback on a model swap.
 */
export async function callGemini(text, { apiKey, model, timeoutMs = 15000 }) {
  const client = injectedClient || new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const contents = contentsFor(text);
  const baseConfig = {
    systemInstruction: SYSTEM_PROMPT,
    temperature: 0.1,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
    abortSignal: controller.signal,
  };
  const generate = (config) => withRetryOn503(() => client.models.generateContent({ model, contents, config }), controller.signal);
  try {
    let response;
    try {
      response = await generate({ ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } });
    } catch (err) {
      if (err?.status === 400 && /thinking/i.test(err?.message || '')) response = await generate(baseConfig);
      else throw err;
    }
    const raw = response?.text;
    if (!raw) throw new Error('Gemini returned an empty response');
    const output = await parseModelJson(raw);
    return { output, modelName: model, usage: response.usageMetadata || null };
  } finally {
    clearTimeout(timer);
  }
}
