/**
 * Delivery handling policy — the source of truth for the model's labels.
 *
 * There is no history of how Indulge deliveries were actually handled, so the
 * model is trained on synthetic listings labelled by this policy (synth.js,
 * train.js). The policy works from an item's *true* physical class; the model
 * only ever sees what a real listing exposes — its category, quantity, price
 * and free text — and learns to recover the handling from that. Change a rule
 * here and run `npm run train:delivery` to retrain.
 *
 * Handling cost is ADVISORY. It is shown to both parties but never added to a
 * quote, cart or transaction: transport and handling are agreed between them
 * (see CLAUDE.md, Prototype boundaries).
 */

/**
 * Physical profile per item class. Volume is per unit as packed/stacked (m³),
 * weight per unit (kg). `electrical` items get a function test; `stackable`
 * items travel stacked and wrapped.
 */
export const ITEM_CLASSES = {
  chair: { vol: 0.06, kg: 4, fragility: 'low', stackable: true },
  finish_chair: { vol: 0.07, kg: 4.5, fragility: 'medium', stackable: true }, // chiavari, tiffany, gold/crystal finish
  table: { vol: 0.35, kg: 22, fragility: 'low', bulky: true },
  lounge: { vol: 1.4, kg: 45, fragility: 'medium', bulky: true },
  staging: { vol: 0.9, kg: 55, fragility: 'low', heavy: true },
  tent: { vol: 0.8, kg: 40, fragility: 'low', bulky: true },
  crockery: { vol: 0.004, kg: 0.5, fragility: 'high' },
  linen: { vol: 0.003, kg: 0.3, fragility: 'low', stackable: true },
  decor_fragile: { vol: 0.3, kg: 12, fragility: 'high' }, // chandeliers, glass, mirrors
  speaker: { vol: 0.25, kg: 30, fragility: 'high', electrical: true },
  screen: { vol: 0.45, kg: 40, fragility: 'high', electrical: true }, // LED walls, TVs, projectors+screens
  lighting: { vol: 0.08, kg: 7, fragility: 'medium', electrical: true },
  small_av: { vol: 0.02, kg: 2, fragility: 'high', electrical: true }, // mics, mixers, consoles
  generator: { vol: 1.6, kg: 420, fragility: 'low', heavy: true, electrical: true },
  appliance: { vol: 0.9, kg: 90, fragility: 'medium', heavy: true, electrical: true }, // ovens, fridges
  vehicle: { vol: 0, kg: 0, fragility: 'medium', selfPropelled: true },
  generic: { vol: 0.2, kg: 10, fragility: 'medium' },
};

/**
 * Keyword → item class, for recognising the class of a *real* listing. Used
 * only to evaluate the trained model against the seeded listings and never at
 * prediction time — the model reads text through features.js instead.
 */
const CLASS_KEYWORDS = [
  ['vehicle', /\b(bus|van|car|sedan|suv|tempo|coach|shuttle|truck|minibus)\b/],
  ['generator', /\b(generator|genset|dg set|kva)\b/],
  ['screen', /\b(led wall|video wall|screen|projector|tv|display|monitor)\b/],
  ['speaker', /\b(speaker|pa system|line array|subwoofer|sound system|audio)\b/],
  ['small_av', /\b(mic|microphone|mixer|console|dj)\b/],
  ['lighting', /\b(light|lights|lighting|par can|moving head|spotlight|uplighter)\b/],
  ['decor_fragile', /\b(chandelier|glass|mirror|crystal decor|vase|centrepiece|centerpiece)\b/],
  ['crockery', /\b(crockery|plates|glassware|cutlery|china|porcelain)\b/],
  ['appliance', /\b(oven|fridge|refrigerator|freezer|chafing|tandoor)\b/],
  ['finish_chair', /\b(chiavari|tiffany|ghost chair|gold chair|crystal chair)\b/],
  ['chair', /\b(chair|chairs|stool|stools|seating)\b/],
  ['table', /\b(table|tables)\b/],
  ['lounge', /\b(sofa|couch|lounge|ottoman)\b/],
  ['staging', /\b(stage|platform|truss|riser|podium)\b/],
  ['tent', /\b(tent|canopy|gazebo|marquee)\b/],
  ['linen', /\b(linen|tablecloth|drape|drapes|napkin)\b/],
];

export function inferItemClass(resource) {
  // The title names the item; the description often names its accessories
  // ("LED wall … with rigging truss"), so it is only consulted second.
  for (const text of [resource.title, resource.description]) {
    const t = String(text || '').toLowerCase();
    for (const [cls, re] of CLASS_KEYWORDS) if (re.test(t)) return cls;
  }
  return 'generic';
}

/* ─────────────────────────────────────────────────────────────── labels */

export const TIERS = ['self_handled', 'standard_movers', 'professional_handlers'];
export const FRAGILITY = ['low', 'medium', 'high'];
export const CHECK_LEVELS = ['count_only', 'visual', 'itemised_photo', 'itemised_photo_function_test'];
export const PACKAGING = ['none', 'stack_and_wrap', 'crates', 'flight_cases'];
export const VEHICLES = ['none', 'two_wheeler', 'tempo', 'truck_14ft', 'truck_20ft'];

const VEHICLE_COST = { none: 0, two_wheeler: 300, tempo: 1800, truck_14ft: 4500, truck_20ft: 7000 };
const PACKAGING_COST_PER_UNIT = { none: 0, stack_and_wrap: 8, crates: 60, flight_cases: 350 };
const RATE_PER_PERSON_HOUR = { self_handled: 0, standard_movers: 180, professional_handlers: 300 };

const VEHICLE_HOURS = { none: 0, two_wheeler: 0, tempo: 0.5, truck_14ft: 1.5, truck_20ft: 2.5 };

const round100 = (n) => Math.max(0, Math.round(n / 100) * 100);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Advisory handling cost range for a handling plan. A function of the plan
 * itself — crew, tier, vehicle, packaging, fragility and quantity — so the
 * model's predicted plan and the cost shown next to it can never disagree.
 */
export function costFor({ tier, crew, vehicle, packaging, fragility, quantity }) {
  const hours = 2 + (VEHICLE_HOURS[vehicle] || 0) + (fragility === 'high' ? 1 : 0);
  const labour = tier === 'self_handled' ? 0 : crew * (RATE_PER_PERSON_HOUR[tier] || 0) * hours;
  const base = labour + (VEHICLE_COST[vehicle] || 0) + (PACKAGING_COST_PER_UNIT[packaging] || 0) * quantity;
  return { costMin: round100(base * 0.85), costMax: round100(base * 1.2) };
}

/**
 * The handling a class/quantity/value combination calls for.
 * @param {string} itemClass  key of ITEM_CLASSES
 * @param {number} quantity   units being moved
 * @param {number} unitPrice  listing price per billing unit — a value proxy
 */
export function label(itemClass, quantity, unitPrice = 0) {
  const p = ITEM_CLASSES[itemClass] || ITEM_CLASSES.generic;
  const qty = Math.max(1, Math.round(quantity));
  const totalVol = p.vol * qty;
  const totalKg = p.kg * qty;
  const totalValue = unitPrice * qty;

  // A vehicle is driven to the venue by its own driver.
  if (p.selfPropelled) {
    return {
      tier: 'self_handled',
      crew: 1,
      fragility: 'medium',
      checkLevel: 'itemised_photo_function_test',
      packaging: 'none',
      vehicle: 'none',
      costMin: 0,
      costMax: 0,
    };
  }

  // Expensive electronics are treated as fragile whatever their class says.
  let fragility = p.fragility;
  if (p.electrical && unitPrice >= 15000) fragility = 'high';
  else if (fragility === 'low' && unitPrice >= 25000) fragility = 'medium';

  // One handler safely moves ~300 kg or ~6 m³ per job; anything over 25 kg a
  // unit is a two-person lift; fragile loads get one extra pair of hands.
  let crew = Math.ceil(Math.max(totalKg / 300, totalVol / 6));
  if (p.kg >= 25) crew = Math.max(crew, 2);
  if (fragility === 'high' && qty > 2) crew += 1;
  if (p.heavy) crew = Math.max(crew, 3);
  crew = clamp(crew, 1, 14);

  let tier;
  if (totalKg <= 30 && totalVol <= 0.3 && fragility !== 'high' && !p.heavy) tier = 'self_handled';
  else if (crew >= 4 || p.heavy || (fragility === 'high' && totalValue >= 20000) || totalValue >= 150000)
    tier = 'professional_handlers';
  else tier = 'standard_movers';
  if (tier === 'self_handled') crew = Math.min(crew, 2);

  let vehicle;
  if (totalVol <= 0.15 && totalKg <= 20) vehicle = 'two_wheeler';
  else if (totalVol <= 6 && totalKg <= 1000) vehicle = 'tempo';
  else if (totalVol <= 20 && totalKg <= 3000) vehicle = 'truck_14ft';
  else vehicle = 'truck_20ft';
  if (tier === 'self_handled' && vehicle === 'two_wheeler' && totalKg <= 8) vehicle = 'none';

  let packaging;
  if (p.electrical && fragility === 'high') packaging = 'flight_cases';
  else if (fragility === 'high' || (fragility === 'medium' && !p.stackable && !p.bulky)) packaging = 'crates';
  else if (p.stackable || p.bulky || qty >= 10) packaging = 'stack_and_wrap';
  else packaging = 'none';

  let checkLevel;
  if (p.electrical) checkLevel = 'itemised_photo_function_test';
  else if (fragility !== 'low' || totalValue >= 50000 || qty >= 50) checkLevel = 'itemised_photo';
  else if (qty >= 10 && fragility === 'low' && unitPrice < 200) checkLevel = 'count_only';
  else checkLevel = 'visual';

  return {
    tier,
    crew,
    fragility,
    checkLevel,
    packaging,
    vehicle,
    ...costFor({ tier, crew, vehicle, packaging, fragility, quantity: qty }),
  };
}
