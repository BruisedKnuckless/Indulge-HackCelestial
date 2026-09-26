import mongoose from 'mongoose';
import { paiseToRupees } from '../services/fee-calculation.service.js';

export const SETTLEMENT_STATUSES = [
  'PENDING',
  'ELIGIBLE',
  'PROCESSING',
  'AVAILABLE',
  'SETTLED',
  'DISPUTE_HOLD',
  'REFUNDED',
];

const settlementSchema = new mongoose.Schema(
  {
    settlementId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    seeker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: true,
    },

    // Amounts in integer paise
    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    commissionPercent: {
      type: Number,
      default: 3,
    },
    commissionAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    commissionGSTPercent: {
      type: Number,
      default: 18,
    },
    commissionGST: {
      type: Number,
      required: true,
      min: 0,
    },
    adjustments: {
      type: Number,
      default: 0,
    },
    netAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: SETTLEMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },

    holdReason: {
      type: String,
      trim: true,
    },
    eligibleAt: {
      type: Date,
    },
    availableAt: {
      type: Date,
    },
    settledAt: {
      type: Date,
    },
    payoutRef: {
      type: String,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals for rupees
settlementSchema.virtual('grossRupees').get(function () {
  return paiseToRupees(this.grossAmount || 0);
});

settlementSchema.virtual('commissionRupees').get(function () {
  return paiseToRupees(this.commissionAmount || 0);
});

settlementSchema.virtual('commissionGSTRupees').get(function () {
  return paiseToRupees(this.commissionGST || 0);
});

settlementSchema.virtual('netRupees').get(function () {
  return paiseToRupees(this.netAmount || 0);
});

export default mongoose.model('Settlement', settlementSchema);
