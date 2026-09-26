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

    // Availability mode: indefinite, until_date, date_range, recurring, custom
    availabilityMode: {
      type: String,
      enum: ['indefinite', 'until_date', 'date_range', 'recurring', 'custom'],
      default: 'indefinite',
      index: true,
    },
    availableUntil: { type: Date, default: null },
    recurringSchedule: {
      daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0 = Sun, 1 = Mon ... 6 = Sat
      startHour: { type: Number, min: 0, max: 23, default: 0 },
      endHour: { type: Number, min: 1, max: 24, default: 24 },
      startTime: { type: String, default: '00:00' },
      endTime: { type: String, default: '23:59' },
    },

    // Turnaround and cleaning buffers (in minutes)
    bufferBeforeMinutes: { type: Number, default: 0, min: 0 },
    bufferAfterMinutes: { type: Number, default: 0, min: 0 },

    // Provider-blocked periods (internal use, maintenance, private events)
    blockedPeriods: [
      {
        start: { type: Date, required: true },
        end: { type: Date, required: true },
        type: {
          type: String,
          enum: ['internal_use', 'maintenance', 'private_event', 'unavailable', 'other'],
          default: 'unavailable',
        },
        reason: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Whether physical transport/logistics partner dispatch is required
    requiresLogistics: { type: Boolean, default: false },

    conditions: String,
    tags: [String],
    images: [String],
    media: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
        width: { type: Number },
        height: { type: Number },
        format: { type: String },
        isPrimary: { type: Boolean, default: false },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

resourceSchema.pre('save', function (next) {
  if (this.media && this.media.length > 0) {
    const urls = this.media.map((m) => m.url).filter(Boolean);
    if (urls.length > 0) {
      this.images = urls;
    }
  } else if (this.images && this.images.length > 0 && (!this.media || this.media.length === 0)) {
    this.media = this.images.map((url, idx) => ({
      url,
      publicId: `legacy_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      format: (url.split('.').pop() || 'jpg').split('?')[0].slice(0, 5),
      isPrimary: idx === 0,
    }));
  }
  next();
});

resourceSchema.index({ 'location.coordinates': '2dsphere' });
resourceSchema.index({ category: 1, status: 1 });
resourceSchema.index({ owner: 1, status: 1 });
resourceSchema.index({ status: 1, createdAt: -1 });

export function doesResourceRequireLogistics(resource, booking) {
  if (booking?.logistics === 'provider_transport') return true;
  if (resource?.requiresLogistics === true) return true;
  const physicalCategories = ['furniture', 'av_equipment', 'vehicle', 'other'];
  return physicalCategories.includes(resource?.category);
}

export default mongoose.model('Resource', resourceSchema);
