/**
 * The RFQ intake vocabulary: how Indian hospitality businesses phrase what
 * they need, mapped onto Indulge's listing categories.
 *
 * One source for both sides: synth.js writes training requests from it and
 * rules.js reads requests with it, so the labels the model is aligned on and
 * the fallback parser can never disagree about what a word means.
 */

export const CATEGORIES = [
  'banquet_space',
  'parking',
  'vehicle',
  'kitchen_capacity',
  'furniture',
  'av_equipment',
  'staff',
  'other',
];

export const UNITS = ['unit', 'hour', 'seat', 'sqft', 'slot'];
export const URGENCIES = ['low', 'medium', 'high'];

/**
 * Per category:
 * - items: things a seeker asks for by name (singular, plural). The first
 *   mention in a request decides its category.
 * - keywords: weaker hints that only count when no item matched.
 * - unit: what the quantity counts.
 * - qty: [min, max] a request plausibly asks for; single: a quantity of 1 is
 *   usually implied ("a banquet hall"), so it is often left unstated.
 * - capacity: a guest / seat count sets minCapacity (venues and vehicles
 *   only; "250 chairs for 300 guests" does not mean chairs seating 300).
 * - budget: [min, max] rupees for the whole request.
 */
export const LEXICON = {
  banquet_space: {
    items: [
      ['banquet hall', 'banquet halls'],
      ['party hall', 'party halls'],
      ['conference room', 'conference rooms'],
      ['ballroom', 'ballrooms'],
      ['lawn', 'lawns'],
      ['rooftop venue', 'rooftop venues'],
      ['terrace', 'terraces'],
      ['board room', 'board rooms'],
      ['marriage hall', 'marriage halls'],
      ['function hall', 'function halls'],
      ['auditorium', 'auditoriums'],
    ],
    keywords: ['venue', 'hall', 'banquet', 'mandap', 'space for'],
    unit: 'unit',
    qty: [1, 3],
    single: true,
    capacity: true,
    budget: [25000, 800000],
  },
  parking: {
    items: [
      ['parking slot', 'parking slots'],
      ['parking space', 'parking spaces'],
      ['car parking', 'car parking'],
      ['parking bay', 'parking bays'],
      ['two-wheeler parking', 'two-wheeler parking'],
    ],
    keywords: ['parking', 'park cars'],
    unit: 'slot',
    qty: [5, 200],
    budget: [3000, 120000],
  },
  vehicle: {
    items: [
      ['Innova', 'Innovas'],
      ['Innova Crysta', 'Innova Crystas'],
      ['tempo traveller', 'tempo travellers'],
      ['mini bus', 'mini buses'],
      ['coach', 'coaches'],
      ['sedan', 'sedans'],
      ['Ertiga', 'Ertigas'],
      ['luxury car', 'luxury cars'],
      ['vintage car', 'vintage cars'],
      ['refrigerated van', 'refrigerated vans'],
    ],
    keywords: ['cab', 'car', 'bus', 'van', 'vehicle', 'transport', 'pickup and drop'],
    unit: 'unit',
    capacity: true,
    qty: [1, 25],
    budget: [3000, 300000],
  },
  kitchen_capacity: {
    items: [
      ['commercial kitchen', 'commercial kitchens'],
      ['kitchen slot', 'kitchen slots'],
      ['tandoor', 'tandoors'],
      ['prep kitchen', 'prep kitchens'],
      ['bakery oven', 'bakery ovens'],
      ['cloud kitchen', 'cloud kitchens'],
    ],
    keywords: ['kitchen', 'cooking space', 'bulk cooking'],
    unit: 'hour',
    qty: [2, 48],
    budget: [2000, 90000],
  },
  furniture: {
    items: [
      ['banquet chair', 'banquet chairs'],
      ['chiavari chair', 'chiavari chairs'],
      ['folding chair', 'folding chairs'],
      ['round table', 'round tables'],
      ['cocktail table', 'cocktail tables'],
      ['sofa set', 'sofa sets'],
      ['lounge set', 'lounge sets'],
      ['buffet counter', 'buffet counters'],
      ['stage platform', 'stage platforms'],
      ['podium', 'podiums'],
    ],
    keywords: ['chairs', 'tables', 'furniture', 'seating'],
    unit: 'unit',
    qty: [2, 1200],
    budget: [2000, 250000],
  },
  av_equipment: {
    items: [
      ['PA system', 'PA systems'],
      ['projector', 'projectors'],
      ['LED wall', 'LED walls'],
      ['sound system', 'sound systems'],
      ['DJ console', 'DJ consoles'],
      ['wireless mic', 'wireless mics'],
      ['stage light', 'stage lights'],
      ['line array speaker', 'line array speakers'],
      ['projection screen', 'projection screens'],
    ],
    keywords: ['speaker', 'speakers', 'mic', 'audio', 'lighting', 'av setup', 'screen'],
    unit: 'unit',
    qty: [1, 40],
    budget: [3000, 400000],
  },
  staff: {
    items: [
      ['waiter', 'waiters'],
      ['chef', 'chefs'],
      ['valet driver', 'valet drivers'],
      ['bartender', 'bartenders'],
      ['housekeeping staff', 'housekeeping staff'],
      ['security guard', 'security guards'],
      ['event crew member', 'event crew'],
      ['usher', 'ushers'],
      ['cook', 'cooks'],
    ],
    keywords: ['staff', 'manpower', 'crew', 'helpers', 'labour'],
    unit: 'unit',
    qty: [2, 80],
    budget: [3000, 200000],
  },
  other: {
    items: [
      ['generator', 'generators'],
      ['tent', 'tents'],
      ['decor prop', 'decor props'],
      ['water dispenser', 'water dispensers'],
      ['outdoor heater', 'outdoor heaters'],
      ['air cooler', 'air coolers'],
      ['crockery set', 'crockery sets'],
    ],
    keywords: ['decor', 'dg set', 'shamiana', 'misc'],
    unit: 'unit',
    qty: [1, 150],
    budget: [2000, 150000],
  },
};

/**
 * Cities a request can name, as { canonical, aliases }. Every canonical name is
 * one resolveDefaultCoordinates (utils/location.js) maps to a preset point.
 */
export const CITIES = [
  { name: 'Mumbai', aliases: ['Mumbai', 'Bombay', 'Andheri', 'Bandra', 'Powai', 'Juhu', 'BKC', 'Worli', 'Lower Parel'] },
  { name: 'Navi Mumbai', aliases: ['Navi Mumbai', 'Vashi', 'Belapur', 'Kharghar', 'Panvel'] },
  { name: 'Thane', aliases: ['Thane'] },
  { name: 'Pune', aliases: ['Pune', 'Hinjewadi', 'Kharadi'] },
  { name: 'Bengaluru', aliases: ['Bengaluru', 'Bangalore'] },
  { name: 'Delhi NCR', aliases: ['Delhi', 'New Delhi', 'Gurgaon', 'Noida'] },
  { name: 'Hyderabad', aliases: ['Hyderabad'] },
  { name: 'Chennai', aliases: ['Chennai'] },
  { name: 'Kolkata', aliases: ['Kolkata'] },
  { name: 'Ahmedabad', aliases: ['Ahmedabad'] },
];

/** Phrases that set urgency. Anything else is 'medium'. */
export const URGENCY_WORDS = {
  high: ['urgent', 'urgently', 'asap', 'immediately', 'urgent hai', 'last minute', 'at the earliest'],
  low: ['no rush', 'flexible', 'planning ahead', 'not urgent', 'whenever available'],
};

/** Words that attach a number to guest count rather than item quantity. */
export const GUEST_WORDS = ['guests', 'pax', 'people', 'persons', 'attendees', 'seater'];

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Canonical city for any alias, or null. Case-insensitive. */
export function canonicalCity(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  for (const c of CITIES) {
    if (c.name.toLowerCase() === n || c.aliases.some((a) => a.toLowerCase() === n)) return c.name;
  }
  return null;
}
