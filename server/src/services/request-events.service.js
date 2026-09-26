import RequestEvent from '../models/RequestEvent.js';
import { logger } from '../utils/logger.js';

/**
 * Record one request-lifecycle decision (see models/RequestEvent.js).
 *
 * Called after the business action has already succeeded, and never throws:
 * the log exists for the admin tracker, so a failure to write it must not
 * fail — or roll back the meaning of — the request the user just made.
 */
export async function recordEvent({ booking, requirement, proposal, actor, role, action, fromPrice, toPrice, note }) {
  try {
    await RequestEvent.create({
      booking: booking?._id || booking,
      requirement: requirement?._id || requirement,
      proposal: proposal?._id || proposal,
      actor: actor?._id || actor,
      role,
      action,
      fromPrice: fromPrice ?? undefined,
      toPrice: toPrice ?? undefined,
      note: note || undefined,
    });
  } catch (err) {
    logger.warn('Could not record request event', { action, error: err.message });
  }
}

/** Seeker or lister, from the booking's point of view. */
export const roleOn = (booking, userId) =>
  String(booking.provider?._id || booking.provider) === String(userId) ? 'lister' : 'seeker';
