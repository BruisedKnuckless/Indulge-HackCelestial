/**
 * Shared text normalisation for matching check names — used by the
 * de-duplicator (validate.js) and by the knowledge-base alias check
 * (knowledge.js), so both agree on when two names mean the same check.
 */

export const STOPWORDS = new Set([
  'check', 'checks', 'test', 'tests', 'testing', 'verify', 'verification', 'inspect', 'inspection', 'the', 'and', 'of',
  'for', 'a', 'an', 'status', 'functionality', 'function', 'functional', 'working', 'condition', 'quality', 'overall',
  'visual', 'physical', 'assessment', 'evaluation', 'operation', 'confirm', 'all', 'any', 'item', 'items',
]);

export const tokens = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[&/()\-_,.:]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));

export const normName = (s) => tokens(s).join(' ');

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
}
