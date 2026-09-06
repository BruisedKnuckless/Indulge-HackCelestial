export const CATEGORIES = [
  { value: 'banquet_space', label: 'Banquet Spaces', short: 'Banquet' },
  { value: 'parking', label: 'Parking', short: 'Parking' },
  { value: 'vehicle', label: 'Vehicles', short: 'Vehicles' },
  { value: 'kitchen_capacity', label: 'Kitchen Capacity', short: 'Kitchen' },
  { value: 'furniture', label: 'Furniture', short: 'Furniture' },
  { value: 'av_equipment', label: 'AV Equipment', short: 'AV' },
  { value: 'staff', label: 'Staff', short: 'Staff' },
  { value: 'other', label: 'Other', short: 'Other' },
];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export const BUSINESS_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'caterer', label: 'Caterer' },
  { value: 'banquet_venue', label: 'Banquet Venue' },
  { value: 'resort', label: 'Resort' },
  { value: 'event_organizer', label: 'Event Organizer' },
  { value: 'other', label: 'Other' },
];

export const PRICE_UNIT_LABELS = {
  per_hour: '/hour',
  per_day: '/day',
  per_event: '/event',
  per_unit: '/unit/day',
};

export const PRICE_UNITS = [
  { value: 'per_hour', label: 'Per hour' },
  { value: 'per_day', label: 'Per day' },
  { value: 'per_event', label: 'Per event' },
  { value: 'per_unit', label: 'Per unit, per day' },
];

export const UNITS = [
  { value: 'unit', label: 'Unit' },
  { value: 'hour', label: 'Hour' },
  { value: 'seat', label: 'Seat' },
  { value: 'sqft', label: 'Sq ft' },
  { value: 'slot', label: 'Slot' },
];

export const FACTOR_LABELS = {
  priceFit: 'Price',
  distanceFit: 'Distance',
  availabilityFit: 'Availability',
  capacityFit: 'Capacity fit',
  urgencyFit: 'Readiness',
};

export const FACTOR_WEIGHTS = {
  priceFit: 30,
  distanceFit: 25,
  availabilityFit: 20,
  capacityFit: 15,
  urgencyFit: 10,
};

/** Per-category icon glyphs for card badges and map markers. */
export const CATEGORY_ICONS = {
  banquet_space: '🏛️',
  parking: '🅿️',
  vehicle: '🚐',
  kitchen_capacity: '👨‍🍳',
  furniture: '🪑',
  av_equipment: '🎙️',
  staff: '👤',
  other: '📦',
};

/* Placeholder image — uses CSS custom properties so it adapts to the theme. */
const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" role="img" aria-label="No image">
       <rect width="400" height="300" fill="rgb(244 244 245)"/>
       <rect x="156" y="100" width="88" height="68" rx="6" fill="rgb(228 228 231)"/>
       <circle cx="174" cy="120" r="10" fill="rgb(208 208 212)"/>
       <polygon points="152,168 200,120 248,168" fill="rgb(208 208 212)"/>
       <polygon points="196,168 228,136 260,168" fill="rgb(228 228 231)"/>
       <text x="200" y="196" text-anchor="middle" fill="rgb(142 142 147)"
             font-family="system-ui, -apple-system, sans-serif" font-size="12" letter-spacing="0.04em">NO IMAGE</text>
     </svg>`
  );

export const resourceImage = (resource, index = 0) =>
  resource?.images?.[index] || resource?.images?.[0] || PLACEHOLDER;

export { PLACEHOLDER };
