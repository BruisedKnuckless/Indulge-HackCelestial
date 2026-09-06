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

/* Placeholder image — uses neutral translucent fills so it adapts seamlessly to both light and dark themes without bright flashes. */
const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" role="img" aria-label="No image">
       <rect width="400" height="300" fill="rgba(128, 128, 128, 0.12)"/>
       <rect x="156" y="96" width="88" height="68" rx="8" fill="none" stroke="rgba(128, 128, 128, 0.3)" stroke-width="2"/>
       <circle cx="174" cy="116" r="8" fill="rgba(128, 128, 128, 0.3)"/>
       <polygon points="162,156 195,124 220,146 232,136 242,156" fill="rgba(128, 128, 128, 0.3)"/>
       <text x="200" y="194" text-anchor="middle" fill="rgba(128, 128, 128, 0.55)"
             font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="0.08em">INDULGE</text>
     </svg>`
  );

export const resourceImage = (resource, index = 0) =>
  resource?.images?.[index] || resource?.images?.[0] || PLACEHOLDER;

export { PLACEHOLDER };
