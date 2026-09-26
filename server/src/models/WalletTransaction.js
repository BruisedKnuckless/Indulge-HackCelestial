import mongoose from 'mongoose';
import { paiseToRupees } from '../services/fee-calculation.service.js';

export const WALLET_TRANSACTION_TYPES = [
  'TOP_UP',
  'BOOKING_RESERVE',
  'BOOKING_RELEASE',
  'REFUND',
  'PARTIAL_REFUND',
  'PAYOUT',
  'FEE',
  'ADJUSTMENT',
];

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      index: true,
    },
    type: {
      type: String,
      enum: WALLET_TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    // Amount in integer paise
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    reservedBefore: {
      type: Number,
      default: 0,
    },
    reservedAfter: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'cancelled'],
      default: 'success',
      index: true,
    },
    reference: {
      type: String,
      unique: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      index: true,
    },
    paymentMethod: {
      type: String,
      default: 'wallet',
    },
    description: {
      type: String,
      trim: true,
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

walletTransactionSchema.virtual('amountRupees').get(function () {
  return paiseToRupees(this.amount || 0);
});

walletTransactionSchema.virtual('balanceAfterRupees').get(function () {
  return paiseToRupees(this.balanceAfter || 0);
});

walletTransactionSchema.virtual('balanceBeforeRupees').get(function () {
  return paiseToRupees(this.balanceBefore || 0);
});

export default mongoose.model('WalletTransaction', walletTransactionSchema);
