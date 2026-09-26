import mongoose from 'mongoose';
import { assessDelivery } from '../ml/delivery/predict.js';
import { logger } from '../utils/logger.js';

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

    // ── Fulfillment lifecycle ─────────────────────────────────────────────────
    // Provider advances these states after booking is confirmed.
    // All fields are optional for backward-compatibility with existing bookings.
    fulfillment: {
      status: {
        type: String,
        enum: ['packed', 'loading', 'out_for_delivery', 'delivered'],
      },
      packedAt:          Date,
      loadingAt:         Date,
      outForDeliveryAt:  Date,
      deliveredAt:       Date,
      notes:             String,
    },

    // ── Return lifecycle ──────────────────────────────────────────────────────
    // Seeker initiates; provider manages logistics.
    return: {
      status: {
        type: String,
        enum: [
          'return_requested',
          'return_pickup_scheduled',
          'return_in_transit',
          'returned_to_provider',
          'return_completed',
        ],
      },
      returnRequestedAt:         Date,
      returnPickupScheduledAt:   Date,
      returnInTransitAt:         Date,
      returnedAt:                Date,
      returnCompletedAt:         Date,
      notes:                     String,
    },

    // Set to true once the rental-expiry notification has been sent so we never
    // send it twice even if the endpoint is called multiple times.
    rentalExpiryNotified: { type: Boolean, default: false },
    isSample: { type: Boolean, default: false },
    procurementOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcurementOrder', index: true },
    sourceRequirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', index: true },

    // Delivery-conditions plan from the ML model (ml/delivery), snapshotted when
    // the booking is created — like matchBreakdown, so what both sides agreed to
    // stays readable even after the model is retrained.
    deliveryPlan: { type: mongoose.Schema.Types.Mixed, default: undefined },

    // Condition recorded by the lister, seeker or logistics crew at each
    // checkpoint of the plan (dispatch → delivery → return). Append-only.
    conditionChecks: [
      {
        checkpoint: { type: String, enum: ['dispatch', 'delivery', 'return'], required: true },
        items: [{ key: String, label: String, ok: Boolean, note: String, _id: false }],
        countVerified: Number,
        overall: { type: String, enum: ['good', 'minor_issues', 'damaged'], required: true },
        notes: String,
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['lister', 'seeker', 'logistics'] },
        recordedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

/**
 * Snapshot the delivery plan on creation. Every creation path — direct
 * request, cart checkout, RFQ award, procurement execution, the seed — goes
 * through save(), so this one hook covers them all. A model failure must
 * never block a booking, so it is logged and the plan is computed later.
 */
bookingSchema.pre('save', async function snapshotDeliveryPlan() {
  if (!this.isNew || this.deliveryPlan) return;
  try {
    const resource = await mongoose.model('Resource').findById(this.resource).lean();
    if (resource) this.deliveryPlan = assessDelivery(resource, this.requestedQuantity);
  } catch (err) {
    logger.warn('Delivery plan not snapshotted', { booking: String(this._id), error: err.message });
  }
});

// Drives the overlap scan in availability.service.js.
bookingSchema.index({ resource: 1, status: 1, startDateTime: 1, endDateTime: 1 });
bookingSchema.index({ seeker: 1, status: 1, createdAt: -1 });
bookingSchema.index({ provider: 1, status: 1, createdAt: -1 });

export default mongoose.model('Booking', bookingSchema);
