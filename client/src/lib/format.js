import { format, formatDistanceToNowStrict, isSameDay } from 'date-fns';

export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export const shortDate = (d) => {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? '—' : format(parsed, 'EEE, d MMM');
  } catch {
    return '—';
  }
};
export const longDate = (d) => {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? '—' : format(parsed, 'd MMMM yyyy');
  } catch {
    return '—';
  }
};
export const dateTime = (d) => {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? '—' : format(parsed, "d MMM yyyy, h:mm a");
  } catch {
    return '—';
  }
};
export const timeOnly = (d) => {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? '—' : format(parsed, 'h:mm a');
  } catch {
    return '—';
  }
};

/** "Sat, 12 Oct · 10:00 AM – 10:00 PM" collapsing to one line for same-day ranges. */
export function dateRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (isSameDay(s, e)) {
    return `${format(s, 'EEE, d MMM')} · ${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`;
  }
  return `${format(s, 'd MMM, h:mm a')} – ${format(e, 'd MMM, h:mm a')}`;
}

export const relative = (d) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });

export const durationHours = (start, end) =>
  Math.max(0, (new Date(end) - new Date(start)) / 3600000);

/** Value for a datetime-local input, which needs local time without a zone. */
export function toLocalInput(date) {
  const d = new Date(date);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 16);
}

/** N days from now at a fixed hour — used for sensible default date pickers. */
export function defaultWindow(daysAhead = 7, startHour = 10, hours = 10) {
  const start = new Date();
  start.setDate(start.getDate() + daysAhead);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start.getTime() + hours * 3600000);
  return { start, end };
}
