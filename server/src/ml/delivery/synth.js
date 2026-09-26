import { label, ITEM_CLASSES } from './policy.js';

/**
 * Synthetic training listings.
 *
 * Each sample is a listing a hospitality business could plausibly post — a
 * title, description, category, quantity and price — generated from an item
 * class, then labelled by policy.js using that class. The text is noisy on
 * purpose (synonyms, brand names, filler, the telling word sometimes only in
 * the description, sometimes missing from the title altogether) so the model
 * has to learn which words matter rather than memorise templates.
 *
 * Deterministic: the same seed always yields the same dataset.
 */

/** mulberry32 — small, fast, seedable PRNG. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per class: listing categories it appears under, name variants, extra
 * adjectives, quantity range (log-uniform) and price range per unit.
 */
const SPECS = {
  chair: {
    categories: ['furniture'],
    names: ['banquet chairs', 'folding chairs', 'cushioned chairs', 'event seating', 'stacking chairs', 'plastic chairs', 'bar stools'],
    extras: ['white', 'black', 'padded', 'steel frame', 'with covers'],
    qty: [1, 1200],
    price: [15, 90],
  },
  finish_chair: {
    categories: ['furniture'],
    names: ['Chiavari chairs', 'Tiffany chairs', 'ghost chairs', 'gold banquet chairs', 'crystal back chairs'],
    extras: ['gold', 'silver', 'rose gold', 'acrylic', 'premium'],
    qty: [1, 800],
    price: [35, 180],
  },
  table: {
    categories: ['furniture'],
    names: ['round banquet tables', 'rectangular tables', 'cocktail tables', 'buffet tables', 'high tables'],
    extras: ['6ft', '8ft', 'seats 10', 'folding', 'with linen'],
    qty: [1, 200],
    price: [120, 600],
  },
  lounge: {
    categories: ['furniture'],
    names: ['lounge sofa set', 'velvet couch', 'ottoman set', 'chesterfield sofa', 'lounge seating'],
    extras: ['3-seater', 'white leather', 'vintage', 'modular'],
    qty: [1, 30],
    price: [1500, 8000],
  },
  staging: {
    categories: ['other', 'furniture', 'av_equipment'],
    names: ['modular stage', 'stage platform', 'aluminium truss', 'stage risers', 'podium and riser'],
    extras: ['8x4 ft', 'carpeted', 'with skirting', 'heavy duty'],
    qty: [1, 60],
    price: [800, 6000],
  },
  tent: {
    categories: ['other'],
    names: ['wedding tent', 'canopy', 'marquee', 'gazebo', 'German hangar tent'],
    extras: ['waterproof', '20x20 ft', 'white', 'with sidewalls'],
    qty: [1, 20],
    price: [3000, 40000],
  },
  crockery: {
    categories: ['other', 'kitchen_capacity'],
    names: ['crockery set', 'dinner plates', 'glassware', 'cutlery set', 'fine china', 'porcelain dinnerware'],
    extras: ['bone china', 'gold rim', 'per cover', 'wine glasses'],
    qty: [5, 2000],
    price: [8, 60],
  },
  linen: {
    categories: ['other', 'furniture'],
    names: ['table linen', 'tablecloths', 'napkins', 'chair drapes', 'satin drapes'],
    extras: ['ivory', 'satin', 'pressed', 'banquet size'],
    qty: [2, 1500],
    price: [10, 80],
  },
  decor_fragile: {
    categories: ['other'],
    names: ['crystal chandelier', 'glass centrepieces', 'mirror panels', 'antique vases', 'glass decor set'],
    extras: ['delicate', 'handcrafted', 'fragile', 'premium'],
    qty: [1, 60],
    price: [500, 25000],
  },
  speaker: {
    categories: ['av_equipment'],
    names: ['PA speakers', 'line array system', 'JBL speakers', 'subwoofer pair', 'sound system', 'active speakers'],
    extras: ['1000W', 'with amplifier', 'with technician', 'outdoor rated', 'powered'],
    qty: [1, 24],
    price: [1500, 45000],
  },
  screen: {
    categories: ['av_equipment'],
    names: ['LED wall', 'video wall', 'projector with screen', 'LED TV', 'display screen', 'P3 LED panels'],
    extras: ['12ft x 8ft', 'indoor', '4K', '65 inch', 'with operator'],
    qty: [1, 12],
    price: [2000, 60000],
  },
  lighting: {
    categories: ['av_equipment'],
    names: ['stage lights', 'par can lights', 'moving head lights', 'uplighters', 'spotlight set'],
    extras: ['DMX', 'RGB', 'LED', 'with controller'],
    qty: [1, 80],
    price: [300, 4000],
  },
  small_av: {
    categories: ['av_equipment'],
    names: ['wireless microphones', 'DJ console', 'audio mixer', 'mic set', 'DJ setup'],
    extras: ['Shure', 'Pioneer', '16 channel', 'with stands'],
    qty: [1, 20],
    price: [500, 12000],
  },
  generator: {
    categories: ['other', 'av_equipment'],
    names: ['diesel generator', 'silent genset', 'DG set', 'power backup generator'],
    extras: ['62.5 kVA', '125 kVA', 'with operator', 'silent'],
    qty: [1, 4],
    price: [6000, 30000],
  },
  appliance: {
    categories: ['other', 'kitchen_capacity'],
    names: ['commercial oven', 'deep freezer', 'refrigerator', 'tandoor', 'chafing dish set'],
    extras: ['double door', 'gas', 'stainless steel', 'heavy'],
    qty: [1, 15],
    price: [800, 9000],
  },
  vehicle: {
    categories: ['vehicle'],
    names: ['guest shuttle bus', 'refrigerated van', 'sedan with driver', 'tempo traveller', 'luxury coach', 'SUV fleet'],
    extras: ['AC', '32-seater', '1.5 ton', 'with driver', '12 seater'],
    qty: [1, 10],
    price: [2500, 25000],
  },
  generic: {
    categories: ['other'],
    names: ['event props', 'decor kit', 'backdrop set', 'photo booth props', 'signage boards'],
    extras: ['themed', 'custom', 'assorted'],
    qty: [1, 100],
    price: [100, 5000],
  },
};

const FILLER = [
  'Available for weddings and corporate events.',
  'Well maintained, cleaned after every hire.',
  'Pickup from our Thane warehouse.',
  'Minimum hire applies.',
  'Popular for receptions.',
  'Damage billed at replacement cost.',
  '',
];

/**
 * Accessory phrases per class. Real listings mention what comes *with* the
 * item — an LED wall "with rigging truss", tables "with linen", a PA "with
 * monitor wedges" — and those accessories share words with other classes.
 * Mixing them in teaches the model to tell the item from its extras.
 */
const ACCESSORIES = {
  chair: ['with seat covers', 'with sashes', 'stackable for transport'],
  finish_chair: ['with ivory cushions', 'with chair sashes', 'protective covers included'],
  table: ['linen included', 'with tablecloths', 'folding legs for transport'],
  lounge: ['with coffee table', 'cushions included', 'with side tables'],
  staging: ['with carpet', 'stage lights optional', 'with steps and skirting'],
  tent: ['with lighting', 'with flooring', 'chandelier add-on available'],
  crockery: ['with serving trays', 'chafing dishes available', 'packed in crates'],
  linen: ['for round tables', 'matching chair covers', 'napkins included'],
  decor_fragile: ['with stands', 'mounted on truss', 'with table runners'],
  speaker: ['with monitor wedges', 'digital mixing desk', 'with stands and cables', 'microphones included'],
  screen: ['with rigging truss', 'on stage or ground stack', 'with processor', 'speakers optional'],
  lighting: ['mounted on truss', 'with DMX console', 'with stands'],
  small_av: ['with speaker monitors', 'with stands', 'cables included'],
  generator: ['with cables and distribution board', 'fuel extra', 'for stage power'],
  appliance: ['with trolley', 'gas connection extra', 'crockery not included'],
  vehicle: ['with driver', 'fuel included', 'with refrigeration unit'],
  generic: ['assorted', 'with stands', 'setup included'],
};

const PRICE_UNITS = ['per_day', 'per_unit', 'per_event'];

export function generate(n = 6000, seed = 42) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const logUniform = ([lo, hi]) => Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo)));
  const classes = Object.keys(SPECS);

  const rows = [];
  for (let i = 0; i < n; i++) {
    const itemClass = pick(classes);
    const spec = SPECS[itemClass];
    const quantity = Math.max(1, Math.round(logUniform(spec.qty)));
    const price = Math.round(logUniform(spec.price));
    const name = pick(spec.names);
    const extra = r() < 0.6 ? pick(spec.extras) : '';

    // Text noise: usually the name is in the title; sometimes only in the
    // description behind a vague title; occasionally both are vague.
    const roll = r();
    let title;
    let description;
    if (roll < 0.72) {
      title = [extra, name].filter(Boolean).join(' ');
      description = pick(FILLER);
    } else if (roll < 0.94) {
      title = pick(['Event rental', 'Hire package', 'Premium rental', 'Wedding essentials', 'Bulk hire']);
      description = `${name}${extra ? `, ${extra}` : ''}. ${pick(FILLER)}`;
    } else {
      title = pick(['Event rental', 'Hire package', 'Assorted items']);
      description = pick(FILLER);
    }

    if (r() < 0.55) description = `${description} ${pick(ACCESSORIES[itemClass])}.`.trim();

    const resource = {
      title,
      description,
      tags: r() < 0.3 ? [name.split(' ').pop()] : [],
      category: pick(spec.categories),
      totalQuantity: quantity,
      unit: 'unit',
      capacity: itemClass === 'vehicle' && r() < 0.5 ? Math.round(4 + r() * 40) : undefined,
      requiresLogistics: r() < 0.3,
      pricing: { basePrice: price, priceUnit: pick(PRICE_UNITS) },
    };

    rows.push({ resource, quantity, itemClass, labels: label(itemClass, quantity, price) });
  }
  return rows;
}

export const SYNTH_CLASSES = Object.keys(ITEM_CLASSES);
