import mongoose from 'mongoose';

const capacityRecoveryOpportunitySchema = new mongoose.Schema(
  {
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      required: true,
      index: true,
    },
    availableQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    requiredQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    opportunityStart: {
      type: Date,
      required: true,
    },
    opportunityEnd: {
      type: Date,
      required: true,
    },
    hoursUntilExpiry: {
      type: Number,
      required: true,
      min: 0,
    },
    distanceKm: {
      type: Number,
      default: 0,
    },
    matchScore: {
      type: Number,
      default: 0,
    },
    recoveryPriorityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    scoreBreakdown: {
      urgencyScore: { type: Number, default: 0 },
      quantityScore: { type: Number, default: 0 },
      distanceScore: { type: Number, default: 0 },
      budgetScore: { type: Number, default: 0 },
      hoursUntilExpiry: { type: Number, default: 0 },
      utilizationGain: { type: Number, default: 0 },
    },
    estimatedRevenue: {
      type: Number,
      default: 0,
    },
    utilizationGain: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ['active', 'claimed', 'converted', 'expired', 'dismissed'],
      default: 'active',
      index: true,
    },
    resultingProposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proposal',
    },
    resultingBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

capacityRecoveryOpportunitySchema.index({ provider: 1, status: 1, expiresAt: 1 });
capacityRecoveryOpportunitySchema.index({ resource: 1, requirement: 1 }, { unique: true });

export default mongoose.model('CapacityRecoveryOpportunity', capacityRecoveryOpportunitySchema);
