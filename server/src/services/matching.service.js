import Booking from '../models/Booking.js';
import { getAvailableQuantity } from './availability.service.js';
import {
  priceFit,
  budgetFit,
  typeFit,
  distanceFit,
  availabilityFit,
  capacityFit,
  urgencyFit,
  combineScore,
  explain,
  getHighlights,
  PREFERENCE_BONUS,
} from '../utils/scoring.js';

const HOUR_MS = 3600 * 1000;

/**
 * Score and rank candidate resources for one seeker's requirement or search context.
 *
 * `candidates` come straight out of the discovery query ($geoNear or find).
 * When `criteria.skipScoring` is true (e.g. unauthenticated or non-requirement browse),
 * returns candidate items without personalized match scores.
 */
export async function rankResources(candidates, criteria = {}, seeker = null) {
  if (!candidates.length) return [];

  // If personalized scoring is explicitly skipped (e.g. logged out guest)
  if (criteria.skipScoring) {
    return candidates.map((r) => ({
      ...r,
      availableQuantity: r.totalQuantity ?? 1,
      matchScore: null,
      matchBreakdown: null,
      matchHighlights: [],
      matchReasons: [],
    }));
  }

  const {
    start,
    end,
    quantity = 1,
    capacity: requiredCapacity,
    radiusKm = 25,
    urgency = 'medium',
    budget,
    maxPrice,
    category: requestedCategory,
  } = criteria;

  const targetBudget = budget ?? maxPrice ?? null;

  const preferred = new Set(
    (seeker?.preferences?.preferredProviders || []).map((id) => String(id))
  );

  // Availability is per-resource and needs the DB, resolve up front
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

  // Only resources that can actually serve the request get ranked when dates specified
  const viable = start && end ? enriched.filter((r) => r.availableQuantity >= quantity) : enriched;
  if (!viable.length) return [];

  const prices = viable.map((r) => r.pricing?.basePrice ?? 0);
  const minPrice = Math.min(...prices);
  const maxPriceCandidate = Math.max(...prices);

  const hoursUntilStart = start ? (start.getTime() - Date.now()) / HOUR_MS : null;

  const scored = viable.map((r) => {
    const rawPrice = r.pricing?.basePrice ?? 0;

    const breakdown = {
      priceFit: budgetFit(rawPrice, targetBudget, minPrice, maxPriceCandidate),
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

    if (requestedCategory && requestedCategory !== 'all') {
      breakdown.typeFit = typeFit(r.category, requestedCategory);
    }

    const matchScore = combineScore(breakdown);

    const ctx = {
      distanceKm: r.distanceKm,
      budget: targetBudget,
      price: rawPrice,
      availableQuantity: r.availableQuantity,
      requestedQuantity: quantity,
      capacity: r.capacity,
      requiredCapacity,
      start,
      end,
    };

    return {
      ...r,
      matchScore,
      matchBreakdown: breakdown,
      matchHighlights: getHighlights(breakdown, ctx),
      matchReasons: explain(breakdown, ctx),
    };
  });

  return scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}

/**
 * Recompute a single resource's score.
 */
export async function scoreSingleResource(resource, criteria, seeker) {
  const [scored] = await rankResources([resource], criteria, seeker);
  return scored || null;
}
