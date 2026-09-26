/**
 * Versions stamped on every generated protocol, so a protocol can always be
 * traced to the logic that produced it. Bump:
 *   MODEL_VERSION   — when generation logic in this directory changes;
 *   PROMPT_VERSION  — when prompt.js changes;
 * Knowledge-base versions (templates, parameters, taxonomy, …) live in the
 * JSON files themselves and are read at load time (knowledge.js).
 */
export const MODEL_NAME = 'indulge-inspection-protocol-generator';
export const MODEL_VERSION = '1.0.0';
export const PROMPT_VERSION = 'inspection-prompt-1.0';

/** Default LLM for the optional augmentation layer (ai.js). */
export const DEFAULT_AI_MODEL = 'claude-opus-5';
