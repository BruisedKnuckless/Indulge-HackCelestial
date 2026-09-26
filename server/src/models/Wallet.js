import mongoose from 'mongoose';
import { paiseToRupees } from '../services/fee-calculation.service.js';

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    // Stored as integer paise (1 INR = 100 paise) to prevent floating-point drift
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservedBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'frozen', 'suspended'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for total balance in paise
walletSchema.virtual('totalBalance').get(function () {
  return (this.availableBalance || 0) + (this.reservedBalance || 0);
});

// Virtuals for rupee values for client consumption
walletSchema.virtual('availableRupees').get(function () {
  return paiseToRupees(this.availableBalance || 0);
});

walletSchema.virtual('reservedRupees').get(function () {
  return paiseToRupees(this.reservedBalance || 0);
});

walletSchema.virtual('totalRupees').get(function () {
  return paiseToRupees((this.availableBalance || 0) + (this.reservedBalance || 0));
});

walletSchema.virtual('availableBalanceRupees').get(function () {
  return paiseToRupees(this.availableBalance || 0);
});

walletSchema.virtual('reservedBalanceRupees').get(function () {
  return paiseToRupees(this.reservedBalance || 0);
});

walletSchema.virtual('totalBalanceRupees').get(function () {
  return paiseToRupees((this.availableBalance || 0) + (this.reservedBalance || 0));
});

export default mongoose.model('Wallet', walletSchema);
