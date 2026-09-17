import { format, formatDistanceToNowStrict, isSameDay } from 'date-fns';

export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export const shortDate = (d) => format(new Date(d), 'EEE, d MMM');
export const longDate = (d) => format(new Date(d), 'd MMMM yyyy');
export const dateTime = (d) => format(new Date(d), "d MMM yyyy, h:mm a");
export const timeOnly = (d) => format(new Date(d), 'h:mm a');

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
