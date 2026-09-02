import Booking from '../models/Booking.js';
import { getAvailableQuantity } from './availability.service.js';
import {
  priceFit,
  distanceFit,
  availabilityFit,
  capacityFit,
  urgencyFit,
  combineScore,
  explain,
  PREFERENCE_BONUS,
} from '../utils/scoring.js';

const HOUR_MS = 3600 * 1000;

/**
 * Score and rank candidate resources for one seeker's requirement.
 *
 * `candidates` come straight out of the $geoNear pipeline, each already
 * carrying `distanceKm`. Price normalization is done across the surviving set,
 * so the returned scores are comparative — exactly how a buyer reads a results
 * page.
 */
export async function rankResources(candidates, criteria = {}, seeker = null) {
  if (!candidates.length) return [];

  const {
    start,
    end,
    quantity = 1,
    capacity: requiredCapacity,
    radiusKm = 25,
    urgency = 'medium',
  } = criteria;

  const preferred = new Set(
    (seeker?.preferences?.preferredProviders || []).map((id) => String(id))
  );

  // Availability is per-resource and needs the DB, so resolve it once up front
  // rather than inside the scoring loop.
  const enriched = await Promise.all(
    candidates.map(async (r) => {
      let available = r.totalQuantity ?? 1;
      let hasPendingConflicts = false;

      if (start && end) {
        const avail = await getAvailableQuantity(r._id, start, end, { resource: r });
        available = avail.available;

        hasPendingConflicts = Boolean(
          await Booking.exists({
            resource: r._id,
            status: { $in: ['pending', 'negotiating'] },
            startDateTime: { $lt: end },
            endDateTime: { $gt: start },
          })
        );
      }

      return { ...r, availableQuantity: available, hasPendingConflicts };
    })
  );

  // Only resources that can actually serve the request get ranked.
  const viable = start && end ? enriched.filter((r) => r.availableQuantity >= quantity) : enriched;
  if (!viable.length) return [];

  const prices = viable.map((r) => r.pricing?.basePrice ?? 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const hoursUntilStart = start ? (start.getTime() - Date.now()) / HOUR_MS : null;

  const scored = viable.map((r) => {
    const breakdown = {
      priceFit: priceFit(r.pricing?.basePrice ?? 0, minPrice, maxPrice),
      distanceFit: distanceFit(r.distanceKm, radiusKm),
      availabilityFit: availabilityFit(r.availableQuantity, quantity),
      capacityFit: capacityFit(requiredCapacity, r.capacity),
      urgencyFit: urgencyFit({
        urgency,
        hoursUntilStart,
        hasPendingConflicts: r.hasPendingConflicts,
      }),
      preferenceBonus: preferred.has(String(r.owner?._id || r.owner)) ? PREFERENCE_BONUS : 0,
    };

    const matchScore = combineScore(breakdown);

    return {
      ...r,
      matchScore,
      matchBreakdown: breakdown,
      matchReasons: explain(breakdown, { distanceKm: r.distanceKm }),
    };
  });

  return scored.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Recompute a single resource's score — used when a booking is created directly
 * from a resource page, where there is no surrounding result set to normalize
 * price against. Price is compared to the provider's own asking price, which
 * makes priceFit neutral rather than misleading.
 */
export async function scoreSingleResource(resource, criteria, seeker) {
  const [scored] = await rankResources([resource], criteria, seeker);
  return scored || null;
}
