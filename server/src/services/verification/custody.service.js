import CustodyEvent from '../../models/CustodyEvent.js';
import { logger } from '../../utils/logger.js';

/**
 * Append one link to a listing's chain of custody. Never throws: a custody
 * write must not undo the action it records, so a failure is logged instead.
 */
export async function recordCustody({ resource, booking, inspection, event, actorType, actor, actorName, evidence, details, at }) {
  try {
    return await CustodyEvent.create({
      resource,
      booking: booking || null,
      inspection: inspection || null,
      event,
      actorType,
      actor: actor || null,
      actorName: actorName || '',
      evidence: evidence || [],
      details: details || {},
      at: at || new Date(),
    });
  } catch (err) {
    logger.warn('Custody event not recorded', { event, resource: String(resource), error: err.message });
    return null;
  }
}

/** The chain for a listing (optionally one booking), oldest first. */
export function custodyChain({ resource, booking } = {}) {
  const filter = {};
  if (resource) filter.resource = resource;
  if (booking) filter.booking = booking;
  return CustodyEvent.find(filter).sort({ at: 1, _id: 1 }).lean();
}
