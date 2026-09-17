import mongoose from 'mongoose';

export const RESOURCE_CATEGORIES = [
  'banquet_space',
  'parking',
  'vehicle',
  'kitchen_capacity',
  'furniture',
  'av_equipment',
  'staff',
  'other',
];

export const CATEGORY_LABELS = {
  banquet_space: 'Banquet Spaces',
  parking: 'Parking',
  vehicle: 'Vehicles',
  kitchen_capacity: 'Kitchen Capacity',
  furniture: 'Furniture',
  av_equipment: 'AV Equipment',
  staff: 'Staff',
  other: 'Other',
};

export const PRICE_UNITS = ['per_hour', 'per_day', 'per_event', 'per_unit'];

const resourceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: RESOURCE_CATEGORIES, required: true, index: true },
    description: String,
    highlights: [String],

    // totalQuantity drives the partial-allocation logic: 1 for a hall (any
    // overlapping confirmed booking blocks it), N for fungible stock like chairs.
    totalQuantity: { type: Number, default: 1, min: 1 },
    unit: { type: String, enum: ['unit', 'hour', 'seat', 'sqft', 'slot'], default: 'unit' },
    capacity: Number,

    pricing: {
      basePrice: { type: Number, required: true },
      priceUnit: { type: String, enum: PRICE_UNITS, default: 'per_day' },
      minRentalPeriodHours: { type: Number, default: 1 },
    },

    location: {
      address: String,
      city: String,
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    // Provider-declared windows the resource may be booked in at all. Empty
    // means "always open"; bookings are still checked against each other.
    availabilityWindows: [{ start: Date, end: Date }],

    conditions: String,
    tags: [String],
    images: [String],
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

resourceSchema.index({ 'location.coordinates': '2dsphere' });
resourceSchema.index({ category: 1, status: 1 });

export default mongoose.model('Resource', resourceSchema);
