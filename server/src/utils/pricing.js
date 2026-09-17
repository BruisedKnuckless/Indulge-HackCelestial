const HOUR_MS = 3600 * 1000;

/**
 * Estimated line total for a resource over a date range.
 *
 * Each price unit bills on a different basis, so the duration is converted to
 * that unit first. Day-rated resources round up — half a day of a banquet hall
 * still costs a day.
 */
export function estimatePrice(resource, { quantity = 1, startDateTime, endDateTime }) {
  const base = resource.pricing?.basePrice ?? 0;
  const unit = resource.pricing?.priceUnit ?? 'per_day';

  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  const hours = Math.max(0, (end - start) / HOUR_MS);

  switch (unit) {
    case 'per_hour':
      return Math.round(base * Math.max(1, Math.ceil(hours)) * quantity);
    case 'per_day':
      return Math.round(base * Math.max(1, Math.ceil(hours / 24)) * quantity);
    case 'per_unit':
      return Math.round(base * quantity * Math.max(1, Math.ceil(hours / 24)));
    case 'per_event':
    default:
      return Math.round(base * quantity);
  }
}

export const PRICE_UNIT_LABELS = {
  per_hour: '/hour',
  per_day: '/day',
  per_event: '/event',
  per_unit: '/unit/day',
};
