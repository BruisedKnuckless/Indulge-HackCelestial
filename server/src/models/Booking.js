import mongoose from 'mongoose';

export const BOOKING_STATUSES = [
  'pending',
  'negotiating',
  'accepted',
  'rejected',
  'confirmed',
  'cancelled',
  'completed',
];

// Statuses that hold real inventory. Anything outside this set is visible to
// the provider but does not reduce availableQuantity for anyone else.
export const HARD_RESERVED_STATUSES = ['accepted', 'confirmed'];

const bookingSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    // provider is denormalized off the resource so the provider inbox is a
    // single indexed query instead of a join.
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seeker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    requestedQuantity: { type: Number, default: 1, min: 1 },
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },

    status: { type: String, enum: BOOKING_STATUSES, default: 'pending', index: true },
    agreedPrice: Number,
    quotedPrice: Number,

    urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    logistics: { type: String, enum: ['self_pickup', 'provider_transport'], default: 'self_pickup' },
    notes: String,

    // Snapshot of why this resource was surfaced, kept for the "Why this match?"
    // panel even after prices or distances change.
    matchScore: Number,
    matchBreakdown: {
      priceFit: Number,
      distanceFit: Number,
      availabilityFit: Number,
      capacityFit: Number,
      urgencyFit: Number,
      preferenceBonus: Number,
    },

    cancellationReason: String,
    rejectionReason: String,
  },
  { timestamps: true }
);

// Drives the overlap scan in availability.service.js.
bookingSchema.index({ resource: 1, status: 1, startDateTime: 1, endDateTime: 1 });

export default mongoose.model('Booking', bookingSchema);
