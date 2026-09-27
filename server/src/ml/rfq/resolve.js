import { WEEKDAYS, MONTHS } from './vocab.js';

/**
 * Deterministic date and time resolution. The model only copies date words
 * ("12 Oct", "this Saturday"); arithmetic happens here, so a small model is
 * never asked to count days.
 *
 * Everything is calendar maths on wall-clock values: results are local
 * "YYYY-MM-DDTHH:MM" strings (what a datetime-local input takes), resolved
 * against the seeker's own `today`, so a UTC server never shifts an Indian
 * event by five and a half hours.
 */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

/** Today's date in India, as YYYY-MM-DD, when the client does not say. */
export function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

function parseToday(today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(`${indiaToday()}T00:00:00Z`);
}

function monthIndex(word) {
  const w = String(word).toLowerCase().replace(/\.$/, '');
  if (w === 'sept') return 8;
  const i = MONTHS.findIndex((m) => m === w || m.slice(0, 3) === w);
  return i;
}

function validDay(y, m, d) {
  const date = new Date(Date.UTC(y, m, d));
  return date.getUTCMonth() === m && date.getUTCDate() === d ? date : null;
}

/** A date with no year means the next time it comes round (today counts). */
function upcoming(base, m, d) {
  const y = base.getUTCFullYear();
  const thisYear = validDay(y, m, d);
  if (thisYear && thisYear >= base) return thisYear;
  return validDay(y + 1, m, d);
}

/**
 * Resolve date words to YYYY-MM-DD, or null.
 * "next Friday" means the Friday of next week (a week after the coming one);
 * "this / coming Friday" and a bare "Friday" mean the coming one, today included.
 */
export function resolveDate(dateText, today) {
  const base = parseToday(today);
  const t = String(dateText || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/^(on|for|by)\s+/, '');
  if (!t) return null;

  if (t === 'today' || t === 'tonight') return ymd(base);
  if (t === 'tomorrow' || t === 'tmrw' || t === 'tomorrow night') return ymd(addDays(base, 1));
  if (t === 'day after tomorrow' || t === 'parso') return ymd(addDays(base, 2));
  if (t === 'this weekend' || t === 'weekend') {
    const gap = (6 - base.getUTCDay() + 7) % 7;
    return ymd(addDays(base, gap));
  }

  let m = /^(this |coming |next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/.exec(t);
  if (m) {
    const target = WEEKDAYS.findIndex((w) => w.startsWith(m[2].slice(0, 3)));
    let gap = (target - base.getUTCDay() + 7) % 7;
    if (m[1] === 'next ') gap = (gap === 0 ? 7 : gap) + 7;
    return ymd(addDays(base, gap));
  }

  // 12 Oct · 12th October · 12 October 2026
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+\.?),?(?:\s+(\d{4}))?$/.exec(t);
  if (m && monthIndex(m[2]) >= 0) {
    const d = m[3] ? validDay(+m[3], monthIndex(m[2]), +m[1]) : upcoming(base, monthIndex(m[2]), +m[1]);
    return d ? ymd(d) : null;
  }
  // Oct 12 · October 12th, 2026
  m = /^([a-z]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(t);
  if (m && monthIndex(m[1]) >= 0) {
    const d = m[3] ? validDay(+m[3], monthIndex(m[1]), +m[2]) : upcoming(base, monthIndex(m[1]), +m[2]);
    return d ? ymd(d) : null;
  }
  // 2026-10-12
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const d = validDay(+m[1], +m[2] - 1, +m[3]);
    return d ? ymd(d) : null;
  }
  // Indian day-first: 12/10 · 12-10-2026 · 12.10.26
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    const d = year ? validDay(year, +m[2] - 1, +m[1]) : upcoming(base, +m[2] - 1, +m[1]);
    return d ? ymd(d) : null;
  }
  return null;
}

/** "6pm" · "6:30 pm" · "18:00" · "12am" → "HH:MM"; a bare hour needs a meridiem. */
export function normalizeTime(value, fallbackMeridiem = null) {
  const t = String(value ?? '').toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  if (!t) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const mer = m[3] || fallbackMeridiem;
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === 'am') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (!m[2] || h > 23) {
    return null; // "6" alone is ambiguous
  }
  return `${pad(h)}:${pad(min)}`;
}

const DEFAULT_START = '09:00';
const DEFAULT_END = '18:00';

/**
 * Date words plus times → { start, end } as local "YYYY-MM-DDTHH:MM", or null
 * when the date cannot be read. No times → 09:00–18:00; start only → four
 * hours; an end at or before the start runs past midnight into the next day.
 */
export function resolveWindow({ dateText, startTime, endTime }, today) {
  const date = resolveDate(dateText, today);
  if (!date) return null;
  const s = normalizeTime(startTime);
  let e = normalizeTime(endTime);
  const start = s || DEFAULT_START;
  if (!e) e = s ? `${pad((+start.slice(0, 2) + 4) % 24)}:${start.slice(3)}` : DEFAULT_END;

  const startDate = new Date(`${date}T00:00:00Z`);
  const endDate = e <= start ? addDays(startDate, 1) : startDate;
  return { start: `${date}T${start}`, end: `${ymd(endDate)}T${e}` };
}
