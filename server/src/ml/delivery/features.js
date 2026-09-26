import { RESOURCE_CATEGORIES, PRICE_UNITS } from '../../models/Resource.js';

/**
 * Turns a listing (and the quantity being moved) into the numeric vector the
 * delivery model reads. Only what a real listing exposes is used: category,
 * units, quantity, price, capacity and free text. The item's true physical
 * class — which the training labels come from — is deliberately not a
 * feature; the model has to recover it from the words.
 *
 * Bump FEATURE_VERSION whenever this vector changes, then retrain
 * (`npm run train:delivery`). predict.js refuses a model built for another
 * version rather than silently mis-reading it.
 */
export const FEATURE_VERSION = 1;

const UNITS = ['unit', 'hour', 'seat', 'sqft', 'slot'];

/** Words that carry handling signal. Singular forms; see tokenize(). */
export const VOCABULARY = [
  // seating & furniture
  'chair', 'chiavari', 'tiffany', 'ghost', 'gold', 'stool', 'seating', 'folding', 'banquet',
  'table', 'round', 'cocktail', 'sofa', 'lounge', 'couch', 'ottoman',
  // structures
  'stage', 'platform', 'truss', 'riser', 'podium', 'tent', 'canopy', 'marquee', 'gazebo',
  // tableware, linen, decor
  'crockery', 'plate', 'glassware', 'cutlery', 'china', 'porcelain', 'linen', 'tablecloth', 'drape', 'napkin',
  'chandelier', 'glass', 'mirror', 'crystal', 'vase', 'centrepiece', 'decor',
  // audio / visual
  'speaker', 'pa', 'array', 'subwoofer', 'sound', 'audio', 'amplifier',
  'led', 'wall', 'video', 'screen', 'projector', 'tv', 'display', 'monitor',
  'light', 'lighting', 'par', 'spotlight', 'uplighter', 'mic', 'microphone', 'mixer', 'console', 'dj',
  // power & kitchen equipment
  'generator', 'genset', 'kva', 'oven', 'fridge', 'refrigerator', 'refrigerated', 'freezer', 'chafing', 'tandoor',
  // vehicles
  'bus', 'van', 'shuttle', 'car', 'sedan', 'suv', 'coach', 'tempo', 'truck', 'seater', 'ton',
  // descriptors
  'technician', 'operator', 'fragile', 'delicate', 'antique', 'heavy', 'premium', 'kit', 'set', 'indoor', 'outdoor',
];
const VOCAB_INDEX = new Map(VOCABULARY.map((w, i) => [w, i]));

/** Lower-case word tokens with a light plural strip ("speakers" → "speaker"). */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

export function listingText(resource) {
  return [resource.title, resource.description, ...(resource.highlights || []), ...(resource.tags || [])]
    .filter(Boolean)
    .join(' ');
}

const oneHot = (values, value) => values.map((v) => (v === value ? 1 : 0));

/** Feature vector for moving `quantity` units of `resource`. */
export function featurize(resource, quantity) {
  const qty = Math.max(1, Number(quantity) || 1);
  const price = Math.max(0, Number(resource.pricing?.basePrice) || 0);

  const words = new Array(VOCABULARY.length).fill(0);
  for (const token of tokenize(listingText(resource))) {
    const i = VOCAB_INDEX.get(token);
    if (i !== undefined) words[i] = 1;
  }

  return [
    Math.log1p(qty),
    Math.log1p(price),
    Math.log1p(qty * price),
    Math.log1p(Number(resource.capacity) || 0),
    resource.requiresLogistics ? 1 : 0,
    ...oneHot(RESOURCE_CATEGORIES, resource.category),
    ...oneHot(PRICE_UNITS, resource.pricing?.priceUnit || 'per_day'),
    ...oneHot(UNITS, resource.unit || 'unit'),
    ...words,
  ];
}

/** Which vocabulary words a listing matched — shown to users as reasons. */
export function matchedWords(resource) {
  const tokens = new Set(tokenize(listingText(resource)));
  return VOCABULARY.filter((w) => tokens.has(w));
}
