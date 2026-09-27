import { CATEGORIES, UNITS, URGENCIES, CITIES, canonicalCity } from './vocab.js';
import { normalizeTime, resolveWindow } from './resolve.js';
import { resolveDefaultCoordinates } from '../../utils/location.js';

/**
 * Grounding and normalisation — the layer between the model and the form.
 *
 * Model output is checked field by field, so one bad field never discards the
 * rest. A value is kept only if it is valid AND supported by the request text:
 * numbers must be derivable from a number the seeker wrote (after reading 40k,
 * 1.5 lakh, 2,50,000), a city must be named, date words must appear verbatim.
 * Anything else is dropped and reported, and the rule parser gets a chance to
 * fill it. The same rule as inspections: claims must come from the input.
 */

const MULTIPLIERS = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };
const AMOUNT_RE = /(₹|\brs\.?|\binr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|crores?|cr)?(?![a-z0-9])/gi;

/** Every number the seeker wrote, normalised: [{ value, index, currency, suffix }]. */
export function extractAmounts(text) {
  const out = [];
  for (const m of String(text || '').matchAll(AMOUNT_RE)) {
    const n = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const suffix = m[3] ? m[3].toLowerCase() : null;
    out.push({
      value: Math.round(n * (suffix ? MULTIPLIERS[suffix] : 1)),
      index: m.index + m[0].indexOf(m[2]),
      currency: Boolean(m[1]),
      suffix,
    });
  }
  return out;
}

/** "40k" · "₹2,50,000" · "1.5 lakh" · 40000 → 40000; NaN when not a number. */
export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const [a] = extractAmounts(value);
  return a ? a.value : NaN;
}

const grounded = (value, amounts) => amounts.some((a) => Math.abs(a.value - value) < 0.5);

function slugCategory(value) {
  const s = String(value || '').toLowerCase().trim().replace(/[\s&/-]+/g, '_');
  if (CATEGORIES.includes(s)) return s;
  const aliases = { av: 'av_equipment', banquet: 'banquet_space', kitchen: 'kitchen_capacity', vehicles: 'vehicle', banquet_spaces: 'banquet_space' };
  return aliases[s] || null;
}

const mentionsCity = (city, lower) => {
  const entry = CITIES.find((c) => c.name === city);
  return [entry.name, ...entry.aliases].some((a) => new RegExp(`(?<![a-z])${a.toLowerCase()}(?![a-z])`).test(lower));
};

/**
 * Validate and ground raw output (from the model or the rule parser).
 * Returns { fields, dropped: [{ field, reason }] }; a field that is absent or
 * null stays null without counting as dropped.
 */
export function groundOutput(raw, text) {
  const lower = String(text || '').toLowerCase();
  const amounts = extractAmounts(text);
  const fields = {};
  const dropped = [];
  const drop = (field, reason) => dropped.push({ field, reason });
  const given = (v) => v !== null && v !== undefined && v !== '';
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  // category
  if (given(src.category)) {
    const c = slugCategory(src.category);
    if (c) fields.category = c;
    else drop('category', 'not an Indulge category');
  }

  // title
  if (typeof src.title === 'string' && src.title.trim().length >= 2) fields.title = src.title.trim().slice(0, 140);

  // quantity — 1 is implied by "a hall", so it needs no number in the text
  if (given(src.quantity)) {
    const q = toNumber(src.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 100000) drop('quantity', 'not a whole number');
    else if (q !== 1 && !grounded(q, amounts)) drop('quantity', 'not in the request');
    else fields.quantity = q;
  }

  // unit
  if (given(src.unit)) {
    const u = String(src.unit).toLowerCase().trim();
    const unit = u === 'hours' || u === 'hrs' ? 'hour' : u === 'slots' ? 'slot' : u === 'units' ? 'unit' : u;
    if (UNITS.includes(unit)) fields.unit = unit;
    else drop('unit', 'not a unit');
  }

  // minCapacity
  if (given(src.minCapacity)) {
    const n = toNumber(src.minCapacity);
    if (!Number.isInteger(n) || n < 1) drop('minCapacity', 'not a whole number');
    else if (!grounded(n, amounts)) drop('minCapacity', 'not in the request');
    else fields.minCapacity = n;
  }

  // budget
  if (given(src.budget)) {
    const b = toNumber(src.budget);
    if (!Number.isFinite(b) || b <= 0) drop('budget', 'not an amount');
    else if (!grounded(b, amounts)) drop('budget', 'not in the request');
    else fields.budget = Math.round(b);
  }

  // city
  if (given(src.city)) {
    const city = canonicalCity(src.city);
    if (!city) drop('city', 'not a supported city');
    else if (!mentionsCity(city, lower)) drop('city', 'not in the request');
    else fields.city = city;
  }

  // dateText — must be the seeker's own words
  if (given(src.dateText)) {
    const d = String(src.dateText).trim();
    if (lower.includes(d.toLowerCase())) fields.dateText = d;
    else drop('dateText', 'not in the request');
  }

  // times
  for (const key of ['startTime', 'endTime']) {
    if (!given(src[key])) continue;
    const t = normalizeTime(src[key]);
    if (t) fields[key] = t;
    else drop(key, 'not a time');
  }

  // urgency
  if (given(src.urgency)) {
    const u = String(src.urgency).toLowerCase().trim();
    if (URGENCIES.includes(u)) fields.urgency = u;
    else drop('urgency', 'not an urgency');
  }

  // notes
  if (typeof src.notes === 'string' && src.notes.trim()) fields.notes = src.notes.trim().slice(0, 300);

  return { fields, dropped };
}

/**
 * Grounded fields → the draft the Post Requirement form takes. The window is
 * resolved here (never by the model); `dates` is false when there were date
 * words but they could not be read, so the form keeps its default and asks.
 */
export function toDraft(fields, { today } = {}) {
  const draft = {};
  if (fields.category) draft.category = fields.category;
  if (fields.title) draft.title = fields.title;
  if (fields.quantity) draft.quantity = fields.quantity;
  if (fields.unit) draft.unit = fields.unit;
  if (fields.minCapacity) draft.minCapacity = fields.minCapacity;
  if (fields.budget) draft.maxPrice = fields.budget;
  if (fields.urgency) draft.urgency = fields.urgency;
  if (fields.notes) draft.description = fields.notes;
  if (fields.city) {
    draft.location = { city: fields.city, coordinates: resolveDefaultCoordinates({ city: fields.city }) };
  }
  if (fields.dateText) {
    const window = resolveWindow(fields, today);
    if (window) {
      draft.start = window.start;
      draft.end = window.end;
    }
  }
  return draft;
}
