import mongoose from 'mongoose';

export const PROPOSAL_STATUSES = ['submitted', 'accepted', 'rejected', 'withdrawn'];

const proposalSchema = new mongoose.Schema(
  {
    requirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: true,
    },
    quotedPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    proposedStart: Date,
    proposedEnd: Date,
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: PROPOSAL_STATUSES,
      default: 'submitted',
      index: true,
    },
  },
  { timestamps: true }
);

// Enforce at most one active proposal per provider per requirement
proposalSchema.index({ requirement: 1, provider: 1 }, { unique: true });

export default mongoose.model('Proposal', proposalSchema);
