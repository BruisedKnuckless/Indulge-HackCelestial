import mongoose from 'mongoose';

/**
 * The reverse side of the marketplace: a seeker publishes what they need and
 * providers come to them, rather than the seeker hunting through listings.
 *
 * Offers are embedded rather than a separate collection because they are only
 * ever read in the context of their requirement, and a requirement collects a
 * handful of them at most.
 */
const offerSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    price: { type: Number, required: true, min: 0 },
    message: String,
    status: {
      type: String,
      enum: ['offered', 'withdrawn', 'accepted', 'declined'],
      default: 'offered',
    },
  },
  { timestamps: true }
);

const requirementSchema = new mongoose.Schema(
  {
    seeker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: [
        'banquet_space', 'parking', 'vehicle', 'kitchen_capacity',
        'furniture', 'av_equipment', 'staff', 'other',
      ],
      index: true,
    },
    description: String,

    quantity: { type: Number, default: 1, min: 1 },
    minCapacity: Number,
    maxPrice: Number,

    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },

    // Where the seeker needs it, so providers can judge the trip.
    location: {
      address: String,
      city: String,
      pincode: String,
      coordinates: { type: [Number], index: '2dsphere' }, // [lng, lat]
    },

    urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },

    offers: [offerSchema],

    status: {
      type: String,
      enum: ['open', 'fulfilled', 'closed', 'expired'],
      default: 'open',
      index: true,
    },
    // Set when an offer is accepted, so the requirement links to the booking.
    fulfilledBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true }
);

// The provider-facing board is "open requirements, soonest first".
requirementSchema.index({ status: 1, startDateTime: 1 });

export default mongoose.model('Requirement', requirementSchema);
