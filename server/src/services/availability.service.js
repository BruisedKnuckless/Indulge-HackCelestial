import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import { HARD_RESERVED_STATUSES } from '../models/Booking.js';

const HOUR_MS = 3600 * 1000;

/**
 * Bookings that overlap [start, end) and actually hold inventory.
 *
 * Two intervals overlap when each starts before the other ends. Touching
 * endpoints (one ends exactly when the next begins) are NOT an overlap, which
 * is what lets a hall be booked 09:00-13:00 and 13:00-17:00 on the same day.
 */
function overlapQuery(resourceId, start, end, { excludeBookingId } = {}) {
  const q = {
    resource: resourceId,
    status: { $in: HARD_RESERVED_STATUSES },
    startDateTime: { $lt: end },
    endDateTime: { $gt: start },
  };
  if (excludeBookingId) q._id = { $ne: excludeBookingId };
  return q;
}

/**
 * How many units of a resource are free across the whole of [start, end).
 *
 * Returns the worst case over the window: a resource is only offered if it can
 * cover the entire requested period, so we take the maximum concurrent
 * reservation rather than a simple sum. Summing would over-count bookings that
 * never coexist (e.g. 09:00-11:00 and 14:00-16:00 both inside a 09:00-16:00
 * request) and wrongly report the resource as unavailable.
 */
export async function getAvailableQuantity(resourceId, start, end, opts = {}) {
  const resource = opts.resource || (await Resource.findById(resourceId).lean());
  if (!resource) return { total: 0, reserved: 0, available: 0 };

  const overlapping = await Booking.find(overlapQuery(resourceId, start, end, opts))
    .select('startDateTime endDateTime requestedQuantity')
    .lean();

  const reserved = maxConcurrent(overlapping, start, end);
  const total = resource.totalQuantity ?? 1;

  return { total, reserved, available: Math.max(0, total - reserved) };
}

/**
 * Peak simultaneous demand inside [start, end).
 *
 * Sweep-line over booking boundaries: walk the sorted event points, add
 * quantity at each start and remove it at each end, and keep the running peak.
 */
function maxConcurrent(bookings, start, end) {
  if (!bookings.length) return 0;

  const events = [];
  for (const b of bookings) {
    // Clip to the requested window so work outside it never inflates the peak.
    const s = Math.max(new Date(b.startDateTime).getTime(), start.getTime());
    const e = Math.min(new Date(b.endDateTime).getTime(), end.getTime());
    if (e <= s) continue;
    events.push({ t: s, delta: b.requestedQuantity || 1 });
    events.push({ t: e, delta: -(b.requestedQuantity || 1) });
  }

  // Ends sort before starts at the same instant, so back-to-back bookings do
  // not read as concurrent.
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  let running = 0;
  let peak = 0;
  for (const ev of events) {
    running += ev.delta;
    if (running > peak) peak = running;
  }
  return peak;
}

/**
 * Full validation for a would-be booking. Returns { ok, reason, available }.
 * Every write path (cart checkout, direct request, provider accept) calls this
 * immediately before committing — the client's view of availability is advisory.
 */
export async function validateBookingRequest({
  resource,
  quantity,
  start,
  end,
  excludeBookingId,
}) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(+start) || Number.isNaN(+end)) {
    return { ok: false, reason: 'Invalid start or end date.' };
  }
  if (end <= start) {
    return { ok: false, reason: 'End time must be after start time.' };
  }

  const minHours = resource.pricing?.minRentalPeriodHours || 0;
  const requestedHours = (end - start) / HOUR_MS;
  if (minHours && requestedHours < minHours) {
    return {
      ok: false,
      reason: `This resource has a minimum rental period of ${minHours} hour(s); you requested ${requestedHours.toFixed(1)}.`,
    };
  }

  if (!withinAvailabilityWindows(resource, start, end)) {
    return { ok: false, reason: 'The provider has not made this resource available for those dates.' };
  }

  const { available, total } = await getAvailableQuantity(resource._id, start, end, {
    resource,
    excludeBookingId,
  });

  if (quantity > available) {
    return {
      ok: false,
      reason:
        available === 0
          ? 'This resource is fully booked for the selected dates.'
          : `Only ${available} of ${total} unit(s) are free for those dates; you asked for ${quantity}.`,
      available,
    };
  }

  return { ok: true, available };
}

/**
 * A resource with no declared windows is treated as always bookable; otherwise
 * the request must sit entirely inside one window.
 */
export function withinAvailabilityWindows(resource, start, end) {
  const windows = resource.availabilityWindows || [];
  if (!windows.length) return true;
  return windows.some((w) => new Date(w.start) <= start && new Date(w.end) >= end);
}

/**
 * Day-by-day availability for the calendar view on the resource page.
 */
export async function getAvailabilityCalendar(resourceId, rangeStart, rangeEnd) {
  const resource = await Resource.findById(resourceId).lean();
  if (!resource) return [];

  const bookings = await Booking.find({
    resource: resourceId,
    status: { $in: HARD_RESERVED_STATUSES },
    startDateTime: { $lt: rangeEnd },
    endDateTime: { $gt: rangeStart },
  })
    .select('startDateTime endDateTime requestedQuantity')
    .lean();

  const days = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < rangeEnd) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const touching = bookings.filter(
      (b) => new Date(b.startDateTime) < dayEnd && new Date(b.endDateTime) > dayStart
    );
    const reserved = maxConcurrent(touching, dayStart, dayEnd);
    const total = resource.totalQuantity ?? 1;

    days.push({
      date: dayStart.toISOString().slice(0, 10),
      totalQuantity: total,
      reservedQuantity: reserved,
      availableQuantity: Math.max(0, total - reserved),
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
