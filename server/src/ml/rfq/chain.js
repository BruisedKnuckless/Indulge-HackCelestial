import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { SYSTEM_PROMPT, FEW_SHOT, formatInstruction } from './prompt.js';

/**
 * The LangChain pipeline that calls the Nugen-aligned model:
 *
 *   ChatPromptTemplate ─► ChatOpenAI (pointed at Nugen) ─► capture ─► JSON parse
 *
 * Nugen's inference API is OpenAI-shaped, so LangChain's ChatOpenAI talks to
 * it with only a different base URL — the same wiring as Nugen's own LangChain
 * cookbook. Nugen adds `confidence_score` (0–100, aligned models only) to the
 * response; ChatOpenAI keeps the raw body when __includeRawResponse is set,
 * which is where `capture` reads it.
 */

export const nugenInferenceUrl = () => `${(process.env.NUGEN_BASE_URL || 'https://api.nugen.in').replace(/\/+$/, '')}/api/v3/inference`;

export function createNugenChatModel({ model, apiKey, timeoutMs = 15000, maxTokens = 300 }) {
  return new ChatOpenAI({
    model,
    apiKey,
    temperature: 0.1,
    maxTokens,
    timeout: timeoutMs,
    maxRetries: 1,
    __includeRawResponse: true,
    configuration: { baseURL: nugenInferenceUrl() },
  });
}

// Static messages are passed as message objects, not template strings, so the
// braces in the few-shot JSON are never read as template variables.
const prompt = ChatPromptTemplate.fromMessages([
  new SystemMessage(SYSTEM_PROMPT),
  ...FEW_SHOT.flatMap((ex) => [new HumanMessage(formatInstruction(ex.text)), new AIMessage(JSON.stringify(ex.output))]),
  ['human', '{instruction}'],
]);

const textOf = (message) =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('')
      : '';

function confidenceOf(message) {
  const raw = message?.additional_kwargs?.__raw_response;
  const score = message?.response_metadata?.confidence_score ?? raw?.confidence_score;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

const capture = RunnableLambda.from((message) => ({
  text: textOf(message),
  confidenceScore: confidenceOf(message),
  modelName: message?.response_metadata?.model_name || message?.additional_kwargs?.__raw_response?.model || null,
}));

const jsonParser = new JsonOutputParser();

/**
 * JsonOutputParser handles code fences; small models also wrap JSON in prose.
 * Shared with gemini.js, so every provider's reply is parsed the same way.
 */
export async function parseModelJson(text) {
  try {
    const out = await jsonParser.parse(text);
    if (out && typeof out === 'object' && !Array.isArray(out)) return out;
  } catch {
    // fall through
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const out = JSON.parse(text.slice(first, last + 1));
    if (out && typeof out === 'object' && !Array.isArray(out)) return out;
  }
  throw new SyntaxError('The model reply was not a JSON object');
}

const parse = RunnableLambda.from(async (captured) => ({ ...captured, output: await parseModelJson(captured.text) }));

/**
 * Build the chain around a chat model — the Nugen ChatOpenAI in production, a
 * stub in verify.js. Invoke with { instruction: formatInstruction(text) };
 * resolves to { output, text, confidenceScore, modelName }.
 */
export function buildIntakeChain(chatModel) {
  return RunnableSequence.from([prompt, chatModel, capture, parse]);
}
