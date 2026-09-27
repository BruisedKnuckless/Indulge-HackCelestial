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

/**
 * Records 'listing_created' as the first link in a resource's chain, but
 * only once — a later re-request (e.g. Indulge verification requested again
 * after a failed inspection, or requested after the listing already chose
 * 'none') must not make it look like the listing was created twice.
 */
export async function ensureListingCreatedEvent(resource, { actor, actorName } = {}) {
  const exists = await CustodyEvent.exists({ resource: resource._id, event: 'listing_created' });
  if (exists) return null;
  return recordCustody({
    resource: resource._id,
    event: 'listing_created',
    actorType: 'provider',
    actor: actor ?? resource.owner,
    actorName,
    details: { title: resource.title },
  });
}

/** The chain for a listing (optionally one booking), oldest first. */
export function custodyChain({ resource, booking } = {}) {
  const filter = {};
  if (resource) filter.resource = resource;
  if (booking) filter.booking = booking;
  return CustodyEvent.find(filter).sort({ at: 1, _id: 1 }).lean();
}
