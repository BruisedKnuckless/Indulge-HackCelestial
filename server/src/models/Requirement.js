import mongoose from 'mongoose';
import { RESOURCE_CATEGORIES } from './Resource.js';

export const REQUIREMENT_STATUSES = ['open', 'fulfilled', 'closed', 'cancelled', 'expired'];

/**
 * The reverse side of the marketplace: a seeker publishes what they need and
 * providers come to them, rather than the seeker hunting through listings.
 *
 * Offers are embedded for direct responses from the requirement board,
 * while Proposals are supported as rich quotations with inventory checks.
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
    seeker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    category: {
      type: String,
      enum: RESOURCE_CATEGORIES,
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    requiredQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    unit: {
      type: String,
      enum: ['unit', 'hour', 'seat', 'sqft', 'slot'],
      default: 'unit',
    },
    minCapacity: {
      type: Number,
      min: 0,
    },
    maxBudget: {
      type: Number,
      min: 0,
    },
    maxPrice: {
      type: Number,
      min: 0,
    },
    startDateTime: {
      type: Date,
      required: true,
      index: true,
    },
    endDateTime: {
      type: Date,
      required: true,
    },
    location: {
      address: String,
      city: String,
      pincode: String,
      coordinates: {
        type: [Number], // GeoJSON [lng, lat]
        required: true,
      },
      radiusKm: {
        type: Number,
        default: 25,
      },
    },
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    offers: [offerSchema],
    status: {
      type: String,
      enum: REQUIREMENT_STATUSES,
      default: 'open',
      index: true,
    },
    proposalCount: {
      type: Number,
      default: 0,
    },
    acceptedProposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proposal',
    },
    resultingBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    fulfilledBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
  },
  { timestamps: true }
);

requirementSchema.pre('save', function (next) {
  if (this.requiredQuantity != null && this.quantity == null) {
    this.quantity = this.requiredQuantity;
  } else if (this.quantity != null && this.requiredQuantity == null) {
    this.requiredQuantity = this.quantity;
  }
  if (this.maxBudget != null && this.maxPrice == null) {
    this.maxPrice = this.maxBudget;
  } else if (this.maxPrice != null && this.maxBudget == null) {
    this.maxBudget = this.maxPrice;
  }
  if (this.resultingBooking && !this.fulfilledBooking) {
    this.fulfilledBooking = this.resultingBooking;
  } else if (this.fulfilledBooking && !this.resultingBooking) {
    this.resultingBooking = this.fulfilledBooking;
  }
  next();
});

requirementSchema.index({ 'location.coordinates': '2dsphere' });
requirementSchema.index({ category: 1, status: 1, startDateTime: 1 });
requirementSchema.index({ status: 1, startDateTime: 1 });

export default mongoose.model('Requirement', requirementSchema);
