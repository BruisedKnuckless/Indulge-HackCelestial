/**
 * Pure scoring helpers for the matching engine.
 *
 * Every function returns 0..1 where higher is better, so the weighted sum in
 * matching.service.js stays readable and each factor can be unit-tested and
 * shown to the user in the "Why this match?" breakdown.
 */

export const WEIGHTS = {
  price: 0.3,
  distance: 0.25,
  availability: 0.2,
  capacity: 0.15,
  urgency: 0.1,
};

export const PREFERENCE_BONUS = 0.05;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * Cheapest candidate in the result set scores 1, priciest 0.
 * Min-max is relative on purpose: "good value" only means anything next to the
 * alternatives the seeker is actually choosing between. A single result, or a
 * set where every price is equal, scores a neutral 1.
 */
export function priceFit(price, minPrice, maxPrice) {
  if (!Number.isFinite(price)) return 0;
  const span = maxPrice - minPrice;
  if (span <= 0) return 1;
  return clamp01(1 - (price - minPrice) / span);
}

/** Linear decay from the seeker outward; at the radius edge this hits 0. */
export function distanceFit(distanceKm, radiusKm) {
  if (!Number.isFinite(distanceKm) || !radiusKm) return 0.5;
  return clamp01(1 - distanceKm / radiusKm);
}

/** Rewards slack: a resource with spare units is safer than a last-unit match. */
export function availabilityFit(availableQuantity, requestedQuantity) {
  if (!requestedQuantity) return 0;
  return clamp01(availableQuantity / requestedQuantity);
}

/**
 * Rewards a tight fit and penalizes oversizing — booking a 500-seat hall for 40
 * guests is a real mismatch even though it technically satisfies the filter.
 * No stated requirement means capacity cannot discriminate, so score neutral.
 */
export function capacityFit(requiredCapacity, resourceCapacity) {
  if (!requiredCapacity || !resourceCapacity) return 0.7;
  if (resourceCapacity < requiredCapacity) return 0; // shouldn't survive filtering
  return clamp01(requiredCapacity / resourceCapacity);
}

/**
 * Under time pressure a seeker needs certainty, so a resource with nothing
 * pending against it is worth more than one with contested requests. When there
 * is no urgency this factor deliberately stays flat so it cannot skew ranking.
 */
export function urgencyFit({ urgency, hoursUntilStart, hasPendingConflicts }) {
  const isUrgent = urgency === 'high' || (Number.isFinite(hoursUntilStart) && hoursUntilStart < 24);
  if (!isUrgent) return 0.7;
  return hasPendingConflicts ? 0.4 : 1;
}

/**
 * Weighted sum of the five factors, plus a small bonus for providers the seeker
 * has worked with before. Capped at 1 so the bonus can't push past a perfect score.
 */
export function combineScore(breakdown) {
  const base =
    WEIGHTS.price * breakdown.priceFit +
    WEIGHTS.distance * breakdown.distanceFit +
    WEIGHTS.availability * breakdown.availabilityFit +
    WEIGHTS.capacity * breakdown.capacityFit +
    WEIGHTS.urgency * breakdown.urgencyFit;

  return clamp01(base + (breakdown.preferenceBonus || 0));
}

/**
 * Human-readable reasons, strongest first — this is what the UI renders under
 * "Why this match?" so the ranking never looks like a black box.
 */
export function explain(breakdown, ctx = {}) {
  const reasons = [];
  const { priceFit: p, distanceFit: d, availabilityFit: a, capacityFit: c } = breakdown;

  if (p >= 0.8) reasons.push('Among the lowest priced options for your dates');
  else if (p <= 0.25) reasons.push('Priced above most alternatives nearby');

  if (d >= 0.8) reasons.push(`Very close by${ctx.distanceKm != null ? ` — ${ctx.distanceKm.toFixed(1)} km` : ''}`);
  else if (d <= 0.3) reasons.push('Further away than other matches');

  if (a >= 1) reasons.push('Full quantity available with room to spare');
  else if (a < 1) reasons.push('Limited units left for your window');

  if (c >= 0.75) reasons.push('Capacity closely fits your requirement');
  else if (c > 0 && c <= 0.35) reasons.push('Considerably larger than you need');

  if (breakdown.preferenceBonus) reasons.push('You have worked with this provider before');

  return reasons;
}
