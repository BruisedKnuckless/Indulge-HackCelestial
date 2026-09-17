/**
 * Short display name for a business.
 *
 * Naively taking the first word gives "Hello, The" for "The Grand Orchid
 * Hotel", so drop leading articles and trailing entity words, then keep the
 * first couple of meaningful words.
 */
const LEADING = new Set(['the', 'a', 'an']);
const TRAILING = new Set([
  'hotel', 'resort', 'restaurant', 'caterers', 'catering', 'events', 'co.',
  'co', 'ltd', 'ltd.', 'pvt', 'pvt.', 'inc', 'inc.', 'llp', 'rentals',
  'hospitality', 'convention', 'grill', 'company', '&',
]);

export function shortName(businessName = '') {
  const words = businessName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'there';

  let start = 0;
  if (LEADING.has(words[0].toLowerCase())) start = 1;

  let end = words.length;
  while (end > start + 1 && TRAILING.has(words[end - 1].toLowerCase())) end -= 1;

  const kept = words.slice(start, end);
  if (!kept.length) return words[0];

  // Two words reads naturally ("Grand Orchid", "Blue Bay") without running long.
  return kept.slice(0, 2).join(' ');
}
