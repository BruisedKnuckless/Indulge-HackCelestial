import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import { HARD_RESERVED_STATUSES } from '../models/Booking.js';

const HOUR_MS = 3600 * 1000;

/**
 * Bookings that overlap [start, end) and actually hold inventory.
 *
 * Takes into account the resource's turnaround/buffer intervals (bufferBeforeMinutes,
 * bufferAfterMinutes) so cleanups, setups, or transportation do not read as free time.
 */
export function overlapQuery(
  resourceId,
  start,
  end,
  { excludeBookingId, bufferBeforeMinutes = 0, bufferAfterMinutes = 0 } = {}
) {
  const bufBeforeMs = (bufferBeforeMinutes || 0) * 60 * 1000;
  const bufAfterMs = (bufferAfterMinutes || 0) * 60 * 1000;
  const totalBufMs = bufBeforeMs + bufAfterMs;

  const q = {
    resource: resourceId,
    status: { $in: HARD_RESERVED_STATUSES },
    startDateTime: { $lt: new Date(end.getTime() + totalBufMs) },
    endDateTime: { $gt: new Date(start.getTime() - totalBufMs) },
  };
  if (excludeBookingId) q._id = { $ne: excludeBookingId };
  return q;
}

/**
 * Peak simultaneous demand inside [start, end).
 *
 * Sweep-line over booking boundaries: walk the sorted event points, add
 * quantity at each start and remove it at each end, and keep the running peak.
 *
 * Supports buffer offsets so each booking's physical footprint includes its
 * bufferBefore and bufferAfter turnaround requirements.
 */
export function maxConcurrent(bookings, start, end, opts = {}) {
  if (!bookings.length) return 0;

  const bufBeforeMs = (opts.bufferBeforeMinutes || 0) * 60 * 1000;
  const bufAfterMs = (opts.bufferAfterMinutes || 0) * 60 * 1000;

  const evalStartMs = start.getTime();
  const evalEndMs = end.getTime();

  const events = [];
  for (const b of bookings) {
    const rawS = new Date(b.startDateTime).getTime();
    const rawE = new Date(b.endDateTime).getTime();
    const effS = rawS - bufBeforeMs;
    const effE = rawE + bufAfterMs;

    // Clip to the requested evaluation window
    const s = Math.max(effS, evalStartMs);
    const e = Math.min(effE, evalEndMs);
    if (e <= s) continue;
    events.push({ t: s, delta: b.requestedQuantity || 1 });
    events.push({ t: e, delta: -(b.requestedQuantity || 1) });
  }

  // Ends sort before starts at the same instant, so back-to-back bookings do
  // not read as concurrent unless buffers overlap.
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
 * Checks whether [start, end) conforms to a recurring weekly/daily schedule.
 */
export function matchesRecurringSchedule(schedule, start, end) {
  if (!schedule) return true;
  const daysOfWeek = schedule.daysOfWeek;
  if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
    const cur = new Date(start);
    while (cur < end) {
      const day = cur.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
      if (!daysOfWeek.includes(day)) return false;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(0, 0, 0, 0);
    }
  }

  // Time-of-day check
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  let schedStartMinutes = 0;
  let schedEndMinutes = 24 * 60;

  if (schedule.startTime) {
    const [h, m] = schedule.startTime.split(':').map(Number);
    schedStartMinutes = h * 60 + (m || 0);
  } else if (schedule.startHour != null) {
    schedStartMinutes = schedule.startHour * 60;
  }

  if (schedule.endTime) {
    const [h, m] = schedule.endTime.split(':').map(Number);
    schedEndMinutes = h * 60 + (m || 0);
  } else if (schedule.endHour != null) {
    schedEndMinutes = schedule.endHour * 60;
  }

  if (startMinutes < schedStartMinutes) return false;

  const isSameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (isSameDay) {
    if (endMinutes > schedEndMinutes) return false;
  } else {
    if (endMinutes > schedEndMinutes && endMinutes !== 0) return false;
  }

  return true;
}

/**
 * Evaluates whether [start, end) satisfies the resource's declared availability policy.
 * Supports: indefinite, until_date, date_range, recurring, and custom.
 */
export function withinAvailabilityWindows(resource, start, end) {
  const mode =
    resource.availabilityMode ||
    (resource.availabilityWindows?.length ? 'date_range' : 'indefinite');

  if (mode === 'until_date') {
    if (resource.availableUntil && new Date(end) > new Date(resource.availableUntil)) {
      return false;
    }
    return true;
  }

  if (mode === 'recurring') {
    return matchesRecurringSchedule(resource.recurringSchedule, start, end);
  }

  if (mode === 'date_range') {
    const windows = resource.availabilityWindows || [];
    if (!windows.length) return true;
    return windows.some((w) => new Date(w.start) <= start && new Date(w.end) >= end);
  }

  if (mode === 'custom') {
    if (resource.availabilityWindows?.length) {
      const insideWindow = resource.availabilityWindows.some(
        (w) => new Date(w.start) <= start && new Date(w.end) >= end
      );
      if (!insideWindow) return false;
    }
    if (resource.availableUntil && new Date(end) > new Date(resource.availableUntil)) {
      return false;
    }
    if (resource.recurringSchedule?.daysOfWeek?.length) {
      if (!matchesRecurringSchedule(resource.recurringSchedule, start, end)) return false;
    }
    return true;
  }

  // mode === 'indefinite'
  const windows = resource.availabilityWindows || [];
  if (!windows.length) return true;
  return windows.some((w) => new Date(w.start) <= start && new Date(w.end) >= end);
}

/**
 * How many units of a resource are free across the whole of [start, end).
 *
 * Takes into account:
 * - listing status (paused/archived -> 0)
 * - availability policy (outside policy -> 0)
 * - owner blocks & maintenance periods (overlapping block -> 0)
 * - booking buffers before and after (turnaround time)
 * - sweep-line maximum concurrent allocation
 */
export async function getAvailableQuantity(resourceId, start, end, opts = {}) {
  const resource = opts.resource || (await Resource.findById(resourceId).lean());
  if (!resource) return { total: 0, reserved: 0, available: 0 };

  const total = resource.totalQuantity ?? 1;

  // Check if paused or archived
  if (resource.status && resource.status !== 'active') {
    return { total, reserved: total, available: 0, status: resource.status };
  }

  // Check if candidate window sits inside availability policy
  if (!withinAvailabilityWindows(resource, start, end)) {
    return { total, reserved: total, available: 0, outOfPolicy: true };
  }

  const bufBefore = resource.bufferBeforeMinutes || 0;
  const bufAfter = resource.bufferAfterMinutes || 0;
  const bufBeforeMs = bufBefore * 60 * 1000;
  const bufAfterMs = bufAfter * 60 * 1000;

  const candEffStart = new Date(start.getTime() - bufBeforeMs);
  const candEffEnd = new Date(end.getTime() + bufAfterMs);

  // Check blocked periods
  const blocked = (resource.blockedPeriods || []).some((b) => {
    const bS = new Date(b.start).getTime();
    const bE = new Date(b.end).getTime();
    return Math.max(candEffStart.getTime(), bS) < Math.min(candEffEnd.getTime(), bE);
  });

  if (blocked) {
    return { total, reserved: total, available: 0, blocked: true };
  }

  const overlapping = await Booking.find(
    overlapQuery(resourceId, start, end, {
      ...opts,
      bufferBeforeMinutes: bufBefore,
      bufferAfterMinutes: bufAfter,
    })
  )
    .select('startDateTime endDateTime requestedQuantity')
    .lean();

  const reserved = maxConcurrent(overlapping, candEffStart, candEffEnd, {
    bufferBeforeMinutes: bufBefore,
    bufferAfterMinutes: bufAfter,
  });

  return { total, reserved, available: Math.max(0, total - reserved) };
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

  if (resource.status && resource.status !== 'active') {
    return {
      ok: false,
      reason: `This listing is currently ${resource.status} and cannot accept new bookings.`,
      available: 0,
    };
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
    const mode =
      resource.availabilityMode ||
      (resource.availabilityWindows?.length ? 'date_range' : 'indefinite');
    if (mode === 'until_date') {
      const untilStr = resource.availableUntil
        ? new Date(resource.availableUntil).toISOString().slice(0, 10)
        : '';
      return {
        ok: false,
        reason: `This resource is only available until ${untilStr}.`,
      };
    }
    if (mode === 'recurring') {
      return { ok: false, reason: 'The requested time is outside the recurring schedule for this resource.' };
    }
    return { ok: false, reason: 'The provider has not made this resource available for those dates.' };
  }

  // Check blocked periods
  const bufBeforeMs = (resource.bufferBeforeMinutes || 0) * 60 * 1000;
  const bufAfterMs = (resource.bufferAfterMinutes || 0) * 60 * 1000;
  const candEffStart = new Date(start.getTime() - bufBeforeMs);
  const candEffEnd = new Date(end.getTime() + bufAfterMs);

  const conflictingBlock = (resource.blockedPeriods || []).find((block) => {
    const bS = new Date(block.start).getTime();
    const bE = new Date(block.end).getTime();
    return Math.max(candEffStart.getTime(), bS) < Math.min(candEffEnd.getTime(), bE);
  });

  if (conflictingBlock) {
    const label = conflictingBlock.type === 'maintenance' ? 'maintenance' : 'owner block';
    return {
      ok: false,
      reason: `This resource is unavailable for the selected period due to scheduled ${label}.`,
      available: 0,
    };
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
 * Day-by-day availability for the calendar view on the resource page.
 * Distinguishes owner view (detailed operational breakdown) from seeker view (sanitized).
 */
export async function getAvailabilityCalendar(resourceId, rangeStart, rangeEnd, opts = {}) {
  const resource = opts.resource || (await Resource.findById(resourceId).lean());
  if (!resource) return [];

  const isOwner = Boolean(opts.isOwner);
  const bufBefore = resource.bufferBeforeMinutes || 0;
  const bufAfter = resource.bufferAfterMinutes || 0;
  const totalBufMs = (bufBefore + bufAfter) * 60 * 1000;

  const bookings = await Booking.find({
    resource: resourceId,
    status: { $in: HARD_RESERVED_STATUSES },
    startDateTime: { $lt: new Date(rangeEnd.getTime() + totalBufMs) },
    endDateTime: { $gt: new Date(rangeStart.getTime() - totalBufMs) },
  })
    .select('startDateTime endDateTime requestedQuantity')
    .lean();

  const days = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);

  const blockedList = resource.blockedPeriods || [];

  while (cursor < rangeEnd) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const total = resource.totalQuantity ?? 1;

    // Check if within availability policy
    const inPolicy = withinAvailabilityWindows(resource, dayStart, dayEnd);

    // Check for owner blocks / maintenance on this day
    const dayBlocks = blockedList.filter((b) => {
      const bS = new Date(b.start).getTime();
      const bE = new Date(b.end).getTime();
      return Math.max(dayStart.getTime(), bS) < Math.min(dayEnd.getTime(), bE);
    });

    const hasMaintenance = dayBlocks.some((b) => b.type === 'maintenance');
    const hasOwnerBlock = dayBlocks.some((b) => b.type !== 'maintenance');

    // Calculate reserved quantity with buffers
    const reserved = inPolicy
      ? maxConcurrent(bookings, dayStart, dayEnd, {
          bufferBeforeMinutes: bufBefore,
          bufferAfterMinutes: bufAfter,
        })
      : total;

    // Determine status
    let status = 'available';
    if (!inPolicy) {
      status = 'unavailable';
    } else if (hasMaintenance) {
      status = isOwner ? 'maintenance' : 'unavailable';
    } else if (hasOwnerBlock) {
      status = isOwner ? 'owner_blocked' : 'unavailable';
    } else if (reserved >= total) {
      status = 'booked';
    } else if (reserved > 0) {
      status = 'partially_available';
    }

    const availableQuantity =
      !inPolicy || hasMaintenance || hasOwnerBlock
        ? 0
        : Math.max(0, total - reserved);

    const dayObj = {
      date: dayStart.toISOString().slice(0, 10),
      totalQuantity: total,
      reservedQuantity: inPolicy ? reserved : total,
      availableQuantity,
      status,
    };

    if (isOwner) {
      if (dayBlocks.length) {
        dayObj.blocks = dayBlocks.map((b) => ({
          _id: b._id,
          type: b.type,
          reason: b.reason,
          start: b.start,
          end: b.end,
        }));
      }
      if (bufBefore || bufAfter) {
        dayObj.buffers = { before: bufBefore, after: bufAfter };
      }
    }

    days.push(dayObj);
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
