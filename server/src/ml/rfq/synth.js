import { rng } from '../delivery/synth.js';
import { LEXICON, CATEGORIES, CITIES, URGENCY_WORDS, MONTHS } from './vocab.js';

/**
 * Synthetic RFQ requests with gold labels, for aligning the intake model on
 * Nugen and for measuring it.
 *
 * There is no history of real free-text requests yet, so each sample is built
 * from parts (items, guests, city, date, time, budget, urgency, extras) and
 * rendered through a phrasing template. The gold JSON comes from construction,
 * so it is correct by definition. Noise is deliberate: Indian number styles
 * (40k, 1.5 lakh, 2,50,000), Hinglish, a second item that is not the category,
 * guest counts on items where they are not a capacity, casing.
 *
 * Templates are split: TRAIN_TEMPLATES feed the alignment dataset,
 * HELDOUT_TEMPLATES only the benchmark and the test set, so evaluation never
 * sees a phrasing the model was aligned on.
 *
 * Deterministic: the same seed always yields the same requests.
 */

// [segment] renders only if every {placeholder} inside it is non-empty.
export const TRAIN_TEMPLATES = [
  '{need} {items}{extra} {guests} {city} {date}[, {time}]. [{budget}.] {urgency}',
  '[{urgencyCap} - ]{need} {items} {city}[, {date}][, {time}][, {budget}]',
  '{items} {guests} required {city} {date} [{time}] [{budget}]',
  'Hi, we are hosting an event {date} {city}. {need} {items}{extra}.[ Timing {time}.][ {budget}.] {urgency}',
  '{need} {items} {date} [{time}] {city} {guests}[ - {budget}][ - {urgency}]',
  '{items}{extra} chahiye {city} [{dateBare} ko][, {time}].[ {budget}.] {urgency}',
  'Requirement: {items}{extra}[ | {cityBare}][ | {dateBare}][ | {time}][ | {budget}][ | {urgency}]',
  'Can anyone provide {items} {city} {date}? [Time {time}.][ {budget}.] {urgency}',
  '{urgencyCap}: {items} needed {date} {city}[ from {time}][. {budget}]',
  'We need {items} for our client event {date}[ ({time})] {city}.[ {budget}.] {urgency}',
  '{need} {items}{extra} - {cityBare} - {dateBare}[ - {time}][ - {budget}]',
  'Event {date} {city}[, {time}]. Need {items} {guests}.[ {budget}.] {urgency}',
  'Quote needed for {items}{extra} {city}[ on {dateBare}][, {time}].[ {budget}.] {urgency}',
  '{items} for a wedding {date} {city}[ {time}][. {budget}][. {urgency}]',
  'Pls share rates for {items} {date} {city}.[ {budget}.] {urgency}',
  '{need} {items} {guests} {city}.[ Date: {dateBare}.][ Time: {time}.][ {budget}.]',
  '{cityBare} event {date}: {items}{extra}[, {time}][, {budget}][, {urgency}]',
  'Booking {items} {date}[ {time}] {city}[, {budget}] {urgency}',
  'Our banquet needs {items} {date} {city}.[ {budget}.] {urgency}',
  '{need} {items}{extra} {date} {city}[ {time}][ {budget}] {urgency} thanks',
  'Hello team, {items} required {city} {date}[ between {time}][. {budget}][. {urgency}]',
  '{items} ki zarurat hai {city} {date}[, {time}][, {budget}]. {urgency}',
  'RFQ: {items}{extra}, {guests}, {cityBare}, {dateBare}[, {time}][, {budget}]',
  'Corporate offsite {date} {city} - {need} {items}[, {time}].[ {budget}.] {urgency}',
  '{need} {items} urgently? {urgency} {city} {date} [{time}] [{budget}]',
  'Anyone with {items} available {date} {city}?[ {budget}.] {urgency}',
  '{items}{extra} {city} {date}[ {time}] [{budget}]',
  'Please arrange {items} {guests} {city} {date}[ from {time}].[ {budget}.] {urgency}',
];

export const HELDOUT_TEMPLATES = [
  'For a sangeet {date} {city} we {needLower} {items}{extra}[ ({time})].[ {budget}.] {urgency}',
  '{urgencyCap}!! {items} {city} {date}[ {time}][ {budget}]',
  'Need help sourcing {items} {guests} {date}[ {time}] {city}[; {budget}][; {urgency}]',
  '{items} - {dateBare}[ - {time}] - {cityBare}[ - {budget}] {urgency}',
  'Kindly quote for {items}{extra} {city}, {date}.[ Timing: {time}.][ {budget}.] {urgency}',
  'Hey, {needLower} {items} {date} {city}[, {time}][, {budget}]. {urgency}',
  '{cityBare}, {dateBare}[, {time}]: {items}{extra}.[ {budget}.] {urgency}',
  'Birthday party {date} {city} - looking for {items} {guests}[, {budget}] {urgency}',
  '{items} bhi chahiye {date} {city}[ {time}][ {budget}] {urgency}',
  'Product launch {date}[ {time}] {city}; {needLower} {items}{extra}.[ {budget}.] {urgency}',
  'Short notice - {items} {city} {date}[ {time}].[ {budget}.] {urgency}',
  'Would like to rent {items} {guests} {city} {date}[ {time}][. {budget}][. {urgency}]',
];

const NEEDS = ['Need', 'Looking for', 'Require', 'We need', 'Want to hire', 'Need to rent', 'Searching for', 'Hiring'];

const EXTRAS = {
  banquet_space: ['with AC', 'with parking', 'with in-house catering allowed', 'indoor only', 'with stage'],
  parking: ['covered only', 'near the venue', 'with security'],
  vehicle: ['with driver', 'fuel included', 'AC only', 'with experienced driver'],
  kitchen_capacity: ['with gas connection', 'veg only', 'with cold storage', 'with helpers'],
  furniture: ['with covers', 'white only', 'setup included', 'good condition only', 'with sashes'],
  av_equipment: ['with operator', 'with backup', 'setup included', 'with stands'],
  staff: ['uniformed', 'experienced only', 'with supervisor', 'English speaking'],
  other: ['with operator', 'with backup', 'setup included', 'with fuel'],
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RELATIVE_DATES = ['today', 'tonight', 'tomorrow', 'day after tomorrow', 'this Saturday', 'this Sunday', 'next Friday', 'this weekend', 'coming Monday', 'Saturday'];
const GUEST_NOUNS = ['guests', 'pax', 'people', 'attendees'];

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pad = (n) => String(n).padStart(2, '0');
const ordinal = (d) => (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');

/** 250000 → "2,50,000" (Indian digit grouping). */
export function indianGrouping(n) {
  const s = String(Math.round(n));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/**
 * Render a template: fill {placeholders}, drop [segments] with an empty one,
 * tidy punctuation. Returns the text and the parts that made it in, so the
 * gold label only records what the request actually says.
 */
export function renderParts(template, parts) {
  const withSegments = template.replace(/\[([^\]]+)\]/g, (seg, inner) => {
    const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return keys.every((k) => parts[k]) ? inner : '';
  });
  const used = new Set([...withSegments.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => parts[k]));
  const text = withSegments
    .replace(/\{(\w+)\}/g, (_, k) => parts[k] ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/([,;:|-])(\s*[,;:|-])+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[,;|-]\s*([.!?])/g, '$1')
    .replace(/\.(\s*\.)+/g, '.')
    .replace(/^[\s,.;:|-]+/, '')
    .replace(/[\s,;:|]+$/, '')
    .replace(/\s+-$/, '')
    .trim();
  return { text, used };
}

export const render = (template, parts) => renderParts(template, parts).text;

export function generate(n, { seed = 7, templates = TRAIN_TEMPLATES } = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const chance = (p) => r() < p;
  const between = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const logUniform = ([lo, hi]) => Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo)));

  const out = [];
  for (let i = 0; i < n; i++) {
    const template = pick(templates);
    const category = pick(CATEGORIES);
    const spec = LEXICON[category];
    const [singular, plural] = pick(spec.items);
    const gold = {
      category,
      title: null,
      quantity: null,
      unit: spec.unit,
      minCapacity: null,
      budget: null,
      city: null,
      dateText: null,
      startTime: null,
      endTime: null,
      urgency: 'medium',
      notes: null,
    };
    const notes = [];

    // Items: the first one decides the category.
    let items;
    if (category === 'kitchen_capacity') {
      const hours = between(spec.qty[0], spec.qty[1]);
      const article = /^[aeiou]/i.test(singular) ? 'an' : 'a';
      items = pick([`${article} ${singular} for ${hours} hours`, `${singular} for ${hours} hrs`, `${hours} hours of ${singular} time`]);
      gold.quantity = hours;
      gold.title = `${cap(singular)} for ${hours} hours`;
    } else if (spec.single && chance(0.8)) {
      const article = /^[aeiou]/i.test(singular) ? 'an' : 'a';
      items = `${pick([article, article, 'one'])} ${singular}`;
      gold.quantity = 1;
      gold.title = cap(singular);
    } else {
      const qty = Math.max(2, Math.round(logUniform([Math.max(2, spec.qty[0]), spec.qty[1]])));
      items = `${qty} ${plural}`;
      gold.quantity = qty;
      gold.title = `${qty} ${plural}`;
    }

    // Vehicles: seats per vehicle.
    if (category === 'vehicle' && chance(0.35)) {
      const seats = pick([4, 7, 12, 17, 26, 40]);
      items += pick([` (${seats} seater)`, ` ${seats}-seater`]);
      gold.minCapacity = seats;
    }

    // A second item from another category — mentioned, but not the category.
    if (chance(0.3)) {
      const other = pick(CATEGORIES.filter((c) => c !== category && c !== 'kitchen_capacity'));
      const [s2, p2] = pick(LEXICON[other].items);
      const second = chance(0.5) ? `${between(2, 12)} ${p2}` : `${/^[aeiou]/i.test(s2) ? 'an' : 'a'} ${s2}`;
      items += pick([` + ${second}`, ` and ${second}`, `, also ${second}`]);
      notes.push(`also ${second}`);
    }

    const extra = chance(0.4) ? pick(EXTRAS[category]) : '';

    // Guests: a capacity only for venues; elsewhere it is context.
    let guests = '';
    let guestCapacity = null;
    if ((category === 'banquet_space' && chance(0.8)) || chance(0.15)) {
      const g = Math.round(between(20, 1200) / 10) * 10;
      guests = pick([`for ${g} ${pick(GUEST_NOUNS)}`, `for around ${g} ${pick(GUEST_NOUNS)}`, `(${g} ${pick(GUEST_NOUNS)})`]);
      if (category === 'banquet_space') guestCapacity = g;
    }

    // City.
    let city = '';
    let cityBare = '';
    if (chance(0.85)) {
      const c = pick(CITIES);
      const alias = chance(0.75) ? c.name.replace(' NCR', '') : pick(c.aliases);
      cityBare = alias;
      city = pick([`in ${alias}`, `at ${alias}`, `${alias} location`, `near ${alias}`]);
      gold.city = c.name;
    }

    // Date: gold is the date words exactly as written, without "on"/"for".
    let dateBare = '';
    if (chance(0.9)) {
      if (chance(0.4)) {
        dateBare = pick(RELATIVE_DATES);
      } else {
        const m = between(0, 11);
        const d = between(1, 28);
        const y = pick([2026, 2027]);
        dateBare = pick([
          `${d} ${MONTH_SHORT[m]}`,
          `${d}${ordinal(d)} ${cap(MONTHS[m])}`,
          `${MONTH_SHORT[m]} ${d}`,
          `${d}/${m + 1}`,
          `${pad(d)}-${pad(m + 1)}-${y}`,
          `${d} ${cap(MONTHS[m])} ${y}`,
        ]);
      }
      gold.dateText = dateBare;
    }
    const date = dateBare ? (/^(today|tonight|tomorrow|this|next|coming)/.test(dateBare) ? dateBare : `${pick(['on ', 'on ', 'for ', ''])}${dateBare}`) : '';

    // Time window.
    let time = '';
    if (chance(0.7)) {
      const sh = between(7, 22);
      const sm = chance(0.2) ? 30 : 0;
      const dur = between(2, 10);
      const eh = (sh + dur) % 24;
      const h12 = (h) => (h % 12 === 0 ? 12 : h % 12);
      const mer = (h) => (h < 12 ? 'am' : 'pm');
      const t12 = (h, m, sep = '') => `${h12(h)}${m ? `:${pad(m)}` : ''}${sep}${mer(h)}`;
      const startOnly = chance(0.12);
      if (startOnly) {
        time = pick([`from ${t12(sh, sm)} onwards`, `at ${t12(sh, sm)}`, `${t12(sh, sm, ' ')} onwards`]);
        gold.startTime = `${pad(sh)}:${pad(sm)}`;
      } else {
        const styles = [
          `${t12(sh, sm)}-${t12(eh, 0)}`,
          `${t12(sh, sm, ' ')} to ${t12(eh, 0, ' ')}`,
          `from ${t12(sh, sm)} till ${t12(eh, 0)}`,
          `${pad(sh)}:${pad(sm)}-${pad(eh)}:00`,
          `${t12(sh, sm)} – ${t12(eh, 0)}`,
        ];
        // "6 to 11 pm" only when both ends share a meridiem and read in order.
        if (mer(sh) === mer(eh) && h12(sh) < h12(eh) && !sm) styles.push(`${h12(sh)} to ${h12(eh)} ${mer(eh)}`);
        time = pick(styles);
        gold.startTime = `${pad(sh)}:${pad(sm)}`;
        gold.endTime = `${pad(eh)}:00`;
      }
    }

    // Budget, in the styles people actually type.
    let budget = '';
    if (chance(0.65)) {
      let v = Math.round(logUniform(spec.budget) / 1000) * 1000;
      const lakhStyle = v >= 100000 && chance(0.5);
      if (lakhStyle) v = Math.round(v / 50000) * 50000;
      let amount;
      if (lakhStyle) amount = pick([`${v / 100000} lakh`, `${v / 100000}L`, `${v / 100000} lakhs`]);
      else amount = pick([`${v / 1000}k`, `₹${indianGrouping(v)}`, `Rs ${v}`, `Rs. ${indianGrouping(v)}`, `INR ${indianGrouping(v)}`, `${indianGrouping(v)}/-`]);
      budget = pick([`budget ${amount}`, `Budget: ${amount}`, `under ${amount}`, `max ${amount}`, `budget around ${amount}`, `can spend up to ${amount}`, `within ${amount}`]);
      gold.budget = v;
    }

    // Urgency.
    let urgency = '';
    const u = r();
    if (u < 0.3) {
      urgency = pick(URGENCY_WORDS.high);
      gold.urgency = 'high';
    } else if (u < 0.45) {
      urgency = pick(URGENCY_WORDS.low);
      gold.urgency = 'low';
    }

    const parts = {
      need: pick(NEEDS),
      needLower: pick(NEEDS).toLowerCase(),
      items,
      extra: extra ? `, ${extra}` : '',
      guests,
      city,
      cityBare,
      date,
      dateBare,
      time,
      budget,
      urgency,
      urgencyCap: cap(urgency),
    };
    const rendered = renderParts(template, parts);
    let text = rendered.text;
    const has = (...keys) => keys.some((k) => rendered.used.has(k));

    // Label only what the rendered request actually says.
    if (!has('city', 'cityBare')) gold.city = null;
    if (!has('date', 'dateBare')) gold.dateText = null;
    if (!has('time')) gold.startTime = gold.endTime = null;
    if (!has('budget')) gold.budget = null;
    if (!has('urgency', 'urgencyCap')) gold.urgency = 'medium';
    if (has('guests') && guestCapacity) {
      gold.minCapacity = guestCapacity;
      if (gold.quantity === 1) gold.title = `${cap(singular)} for ${guestCapacity} guests`;
    }
    if (has('extra')) notes.push(extra);

    // Casing noise: some people type everything in lower case.
    if (chance(0.12)) {
      text = text.toLowerCase();
      if (gold.dateText) gold.dateText = gold.dateText.toLowerCase();
    }
    gold.notes = notes.length ? notes.join('; ') : null;

    out.push({ id: `rfq-${seed}-${i}`, template: templates.indexOf(template), text, gold });
  }
  return out;
}
