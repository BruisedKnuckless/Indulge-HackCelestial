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

/** Labels for the five ranking factors, shown in the match breakdown. */
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

const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
       <rect width="400" height="300" fill="#F4F4F5"/>
       <text x="200" y="155" text-anchor="middle" fill="#8E8E93"
             font-family="system-ui, sans-serif" font-size="17">No image</text>
     </svg>`
  );

export const resourceImage = (resource, index = 0) =>
  resource?.images?.[index] || resource?.images?.[0] || PLACEHOLDER;

export { PLACEHOLDER };
