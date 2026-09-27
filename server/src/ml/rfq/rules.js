import { LEXICON, CITIES, URGENCY_WORDS } from './vocab.js';
import { extractAmounts } from './ground.js';
import { normalizeTime } from './resolve.js';
import { OUTPUT_KEYS } from './prompt.js';

/**
 * The rule parser: keyword and regex extraction over the same vocabulary the
 * model is aligned on. Two jobs:
 * - fallback: fills the form when Nugen is off, slow or wrong, and fills any
 *   field the model left out or had dropped by grounding;
 * - baseline: evaluate.js scores it next to the base and aligned models, which
 *   is how we show what alignment adds.
 * Returns raw output in the model's shape, so both go through the same
 * grounding (ground.js).
 */

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (phrase) => new RegExp(`(?<![a-z])${escape(phrase.toLowerCase())}(?![a-z])`);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Earliest item mentioned (longest phrase on a tie); keywords only if no item. */
function findCategory(lower) {
  const scan = (kind) => {
    let best = null;
    for (const [category, spec] of Object.entries(LEXICON)) {
      const phrases = kind === 'items' ? spec.items.flat() : spec.keywords;
      for (const phrase of phrases) {
        const m = wordRe(phrase).exec(lower);
        if (!m) continue;
        if (!best || m.index < best.index || (m.index === best.index && phrase.length > best.phrase.length)) {
          best = { category, index: m.index, phrase: lower.slice(m.index, m.index + phrase.length) };
        }
      }
    }
    return best;
  };
  return scan('items') || scan('keywords');
}

function findQuantity(lower, hit) {
  if (hit.category === 'kitchen_capacity') {
    const after = lower.slice(hit.index);
    const m = /^.{0,40}?\bfor\s+(\d+)\s*(?:hours|hour|hrs|hr)\b/.exec(after) || /(\d+)\s*(?:hours|hour|hrs|hr)\s+of\s+$/.exec(lower.slice(0, hit.index));
    return m ? Number(m[1]) : null;
  }
  const before = lower.slice(0, hit.index);
  const num = /(\d[\d,]*)\s+(?:[a-z-]+\s+){0,2}$/.exec(before);
  if (num) return Number(num[1].replace(/,/g, ''));
  if (/(?:^|\s)(?:a|an|one)\s+(?:[a-z-]+\s+){0,1}$/.test(before)) return 1;
  return null;
}

function findCapacity(lower, category) {
  if (category === 'banquet_space') {
    const m = /(\d[\d,]*)\s*(?:guests|pax|people|persons|attendees)\b/.exec(lower);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }
  if (category === 'vehicle') {
    const m = /(\d+)[\s-]*seater\b/.exec(lower);
    return m ? Number(m[1]) : null;
  }
  return null;
}

const BUDGET_CUES = /(budget|under|max|within|around|up ?to|spend|below|₹|rs\.?|inr)[\s:.-]*$/;

function findBudget(text, taken) {
  const lower = text.toLowerCase();
  for (const a of extractAmounts(text)) {
    if (taken.has(a.value) && !a.currency && !a.suffix) continue;
    const before = lower.slice(Math.max(0, a.index - 24), a.index);
    // Skip parts of dates and times: 12/10, 21-04-2027, 18:00.
    const around = lower.slice(Math.max(0, a.index - 1), a.index + 12);
    if (/^[/.:-]/.test(around) || /^\d+[/:]\d/.test(lower.slice(a.index, a.index + 6))) continue;
    if (a.currency || a.suffix || BUDGET_CUES.test(before) || /\/-/.test(lower.slice(a.index, a.index + 14))) return a.value;
  }
  return null;
}

function findCity(lower) {
  let best = null;
  for (const c of CITIES) {
    for (const alias of [c.name, ...c.aliases]) {
      const m = wordRe(alias).exec(lower);
      if (m && (!best || m.index < best.index || (m.index === best.index && alias.length > best.len))) {
        best = { city: c.name, index: m.index, len: alias.length };
      }
    }
  }
  return best?.city || null;
}

const MONTH =
  '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)(?![a-z])\\.?';
const DATE_PATTERNS = [
  /\b(?:day after tomorrow|tomorrow|today|tonight|this weekend)\b/i,
  /\b(?:(?:this|next|coming)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+\\d{4})?(?![a-z])`, 'i'),
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?(?![a-z0-9])`, 'i'),
  /(?<![\d:])\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?(?![\d:])(?!\s*(?:am|pm))/i,
];

function findDateText(text) {
  for (const re of DATE_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0].trim().replace(/\.$/, '');
  }
  return null;
}

const RANGE_RE = /(?<![\d/.-])(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|till|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?![\d/]|[.-]\d)/gi;

function findTimes(text) {
  // Step one character past a rejected match, so "May 4 - 15:00-01:00" still
  // finds the range that starts inside the rejected "4 - 15:00".
  RANGE_RE.lastIndex = 0;
  for (let m = RANGE_RE.exec(text); m; m = RANGE_RE.exec(text)) {
    RANGE_RE.lastIndex = m.index + 1;
    const [, sh, sm, smer, eh, em, emer] = m;
    let s1 = smer?.toLowerCase() || null;
    let e1 = emer?.toLowerCase() || null;
    if (!s1 && !e1 && !(sm && em)) continue; // "12-10" is a date, not a time
    if (!s1 && e1) {
      s1 = e1;
      // "11 to 2 pm" starts in the morning
      if (Number(sh) % 12 > Number(eh) % 12 && e1 === 'pm') s1 = 'am';
    }
    if (s1 && !e1) {
      e1 = s1;
      if (Number(eh) % 12 < Number(sh) % 12) e1 = s1 === 'am' ? 'pm' : 'am';
    }
    const start = normalizeTime(`${sh}${sm ? `:${sm}` : ''}${s1 || ''}`);
    const end = normalizeTime(`${eh}${em ? `:${em}` : ''}${e1 || ''}`);
    if (start && end) return { startTime: start, endTime: end };
  }
  const single = /\b(?:from|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))|(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+onwards/i.exec(text);
  if (single) return { startTime: normalizeTime(single[1] || single[2]), endTime: null };
  return { startTime: null, endTime: null };
}

function findUrgency(lower) {
  if (URGENCY_WORDS.low.some((w) => wordRe(w).test(lower))) return 'low';
  if (URGENCY_WORDS.high.some((w) => wordRe(w).test(lower))) return 'high';
  return 'medium';
}

export function parseWithRules(text) {
  const src = String(text || '');
  const lower = src.toLowerCase();
  const out = Object.fromEntries(OUTPUT_KEYS.map((k) => [k, null]));

  const hit = findCategory(lower);
  if (hit) {
    out.category = hit.category;
    out.unit = LEXICON[hit.category].unit;
    out.quantity = findQuantity(lower, hit);
    out.minCapacity = findCapacity(lower, hit.category);
    if (hit.category === 'kitchen_capacity' && out.quantity) out.title = `${cap(hit.phrase)} for ${out.quantity} hours`;
    else if (out.quantity && out.quantity > 1) out.title = `${out.quantity} ${hit.phrase}`;
    else if (out.minCapacity && hit.category === 'banquet_space') out.title = `${cap(hit.phrase)} for ${out.minCapacity} guests`;
    else out.title = cap(hit.phrase);
  }

  const taken = new Set([out.quantity, out.minCapacity].filter(Boolean));
  out.budget = findBudget(src, taken);
  out.city = findCity(lower);
  out.dateText = findDateText(src);
  Object.assign(out, findTimes(src));
  out.urgency = findUrgency(lower);
  return out;
}
