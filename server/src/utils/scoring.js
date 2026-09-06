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

/** Resource category / type fit against the seeker's requirement. */
export function typeFit(resourceCategory, requestedCategory) {
  if (!requestedCategory || requestedCategory === 'all') return 1;
  return resourceCategory === requestedCategory ? 1 : 0.15;
}

/**
 * Budget fit:
 * If a budget is specified, anything within budget scores 1 (with slight bonus if well under),
 * and prices above budget decay gracefully.
 * If no budget is specified, falls back to min-max comparative price fit.
 */
export function budgetFit(price, budget, minPrice, maxPrice) {
  if (!Number.isFinite(price)) return 0;
  if (Number.isFinite(budget) && budget > 0) {
    if (price <= budget) {
      // Within budget: perfect score, reward good value
      return clamp01(0.9 + 0.1 * (1 - price / budget));
    }
    // Over budget: decays down to 0 at 2x budget
    return clamp01(1 - (price - budget) / budget);
  }
  return priceFit(price, minPrice, maxPrice);
}

/**
 * Relative min-max price fit across candidates.
 * Cheapest candidate scores 1, priciest 0.
 */
export function priceFit(price, minPrice, maxPrice) {
  if (!Number.isFinite(price)) return 0;
  const span = maxPrice - minPrice;
  if (span <= 0) return 1;
  return clamp01(1 - (price - minPrice) / span);
}

/** Distance fit: linear decay from 1 down to 0.6 at radius edge, then decays beyond. */
export function distanceFit(distanceKm, radiusKm = 25) {
  if (!Number.isFinite(distanceKm) || !radiusKm) return 0.7;
  if (distanceKm <= radiusKm) {
    return clamp01(1 - 0.4 * (distanceKm / radiusKm));
  }
  return clamp01(Math.max(0, 0.6 * (1 - (distanceKm - radiusKm) / radiusKm)));
}

/** Availability fit: checks available quantity against requested quantity. */
export function availabilityFit(availableQuantity, requestedQuantity = 1) {
  if (availableQuantity <= 0) return 0;
  if (!requestedQuantity) return 1;
  return clamp01(availableQuantity / requestedQuantity);
}

/**
 * Capacity fit:
 * Rewards a tight fit and penalizes oversizing or undersizing.
 * 1x to 1.5x of required capacity scores 1.
 */
export function capacityFit(requiredCapacity, resourceCapacity) {
  if (!requiredCapacity || !resourceCapacity) return 0.8;
  if (resourceCapacity < requiredCapacity) {
    return clamp01((resourceCapacity / requiredCapacity) * 0.5);
  }
  if (resourceCapacity <= requiredCapacity * 1.5) {
    return 1;
  }
  return clamp01(Math.max(0.65, requiredCapacity / resourceCapacity));
}

/**
 * Urgency fit: under time pressure a seeker needs certainty.
 */
export function urgencyFit({ urgency, hoursUntilStart, hasPendingConflicts }) {
  const isUrgent = urgency === 'high' || (Number.isFinite(hoursUntilStart) && hoursUntilStart < 24);
  if (!isUrgent) return 0.75;
  return hasPendingConflicts ? 0.35 : 1;
}

/**
 * Weighted sum of the five factors, plus preference bonus, adjusted for type compatibility.
 */
export function combineScore(breakdown) {
  let base =
    WEIGHTS.price * (breakdown.priceFit ?? 0) +
    WEIGHTS.distance * (breakdown.distanceFit ?? 0) +
    WEIGHTS.availability * (breakdown.availabilityFit ?? 0) +
    WEIGHTS.capacity * (breakdown.capacityFit ?? 0) +
    WEIGHTS.urgency * (breakdown.urgencyFit ?? 0);

  // If a specific resource type was specified and mismatched, scale down
  if (breakdown.typeFit !== undefined) {
    base = base * (0.3 + 0.7 * breakdown.typeFit);
  }

  return clamp01(base + (breakdown.preferenceBonus || 0));
}

/**
 * Quick visual checklist highlights for the resource card:
 * [ ✓ Date available, ✓ Within budget, ✓ 2.4 km away, ✓ Quantity available ]
 */
export function getHighlights(breakdown, ctx = {}) {
  const highlights = [];
  const { distanceKm, budget, price, availableQuantity, requestedQuantity = 1, start, end } = ctx;

  // 1. Date availability
  if (start && end) {
    const isAvail = (breakdown.availabilityFit ?? 0) >= 0.8;
    highlights.push({
      label: isAvail ? 'Date available' : (breakdown.availabilityFit > 0 ? 'Limited date availability' : 'Unavailable on requested dates'),
      ok: isAvail,
    });
  } else {
    highlights.push({ label: 'Dates available', ok: true });
  }

  // 2. Budget / Price
  if (budget != null && budget > 0) {
    const withinBudget = price != null && price <= budget;
    const diff = price != null ? Math.round(price - budget) : 0;
    highlights.push({
      label: withinBudget ? 'Within budget' : `₹${diff.toLocaleString('en-IN')} over budget`,
      ok: withinBudget,
    });
  } else if ((breakdown.priceFit ?? 0) >= 0.75) {
    highlights.push({ label: 'Within budget', ok: true });
  } else {
    highlights.push({ label: 'Standard rate', ok: true });
  }

  // 3. Distance
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    highlights.push({
      label: `${distanceKm.toFixed(1)} km away`,
      ok: (breakdown.distanceFit ?? 0) >= 0.5,
    });
  } else {
    highlights.push({ label: 'Location suitable', ok: true });
  }

  // 4. Quantity
  const qtyOk = (availableQuantity ?? 1) >= requestedQuantity;
  highlights.push({
    label: qtyOk ? 'Quantity available' : `${availableQuantity || 0} of ${requestedQuantity} available`,
    ok: qtyOk,
  });

  return highlights;
}

/**
 * Human-readable reasons for "Why this match?".
 */
export function explain(breakdown, ctx = {}) {
  const reasons = [];
  const { priceFit: p, distanceFit: d, availabilityFit: a, capacityFit: c, typeFit: t } = breakdown;
  const { budget, price, distanceKm } = ctx;

  if (t !== undefined && t >= 0.9) {
    reasons.push('Matches requested resource category');
  }

  if (budget != null && price != null) {
    if (price <= budget) {
      const saved = budget - price;
      reasons.push(
        saved > 0
          ? `Within budget — ₹${saved.toLocaleString('en-IN')} below your cap`
          : 'Fits exactly within your budget cap'
      );
    } else {
      reasons.push(`Priced ₹${(price - budget).toLocaleString('en-IN')} above your target budget`);
    }
  } else if (p >= 0.8) {
    reasons.push('Among the lowest priced options for your dates');
  } else if (p <= 0.25) {
    reasons.push('Priced above most alternatives nearby');
  }

  if (distanceKm != null) {
    if (d >= 0.8) reasons.push(`Very close by — ${distanceKm.toFixed(1)} km`);
    else if (d <= 0.3) reasons.push(`Located ${distanceKm.toFixed(1)} km away (near boundary)`);
    else reasons.push(`Located ${distanceKm.toFixed(1)} km away`);
  } else if (d >= 0.8) {
    reasons.push('Very close by');
  }

  if (a >= 1) reasons.push('Full requested quantity available for your dates');
  else if (a > 0) reasons.push('Partial units available for your dates');
  else reasons.push('Unavailable or contested for these dates');

  if (c >= 0.75) reasons.push('Capacity closely fits your requirement');
  else if (c > 0 && c <= 0.35) reasons.push('Considerably larger than you need');

  if (breakdown.preferenceBonus) reasons.push('You have worked with this provider before');

  return reasons;
}
