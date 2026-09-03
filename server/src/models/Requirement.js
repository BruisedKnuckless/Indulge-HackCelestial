import mongoose from 'mongoose';
import { RESOURCE_CATEGORIES } from './Resource.js';

export const REQUIREMENT_STATUSES = ['open', 'fulfilled', 'cancelled', 'expired'];

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
  },
  { timestamps: true }
);

requirementSchema.index({ 'location.coordinates': '2dsphere' });
requirementSchema.index({ category: 1, status: 1, startDateTime: 1 });

export default mongoose.model('Requirement', requirementSchema);
