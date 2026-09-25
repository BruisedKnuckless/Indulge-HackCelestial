import mongoose from 'mongoose';

const procurementOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    requirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      required: true,
      index: true,
    },
    seeker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
    },
    planType: {
      type: String,
      enum: ['SINGLE_SUPPLIER', 'SPLIT_FULFILLMENT', 'PARTIAL_FULFILLMENT'],
      required: true,
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    fulfilledQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    fulfillmentPercentage: {
      type: Number,
      default: 0,
    },
    fullyFulfilled: {
      type: Boolean,
      default: false,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    budgetVariance: {
      type: Number,
      default: 0,
    },
    supplierCount: {
      type: Number,
      required: true,
      min: 1,
    },
    averageDistanceKm: {
      type: Number,
      default: 0,
    },
    maxDistanceKm: {
      type: Number,
      default: 0,
    },
    logisticsComplexity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'LOW',
    },
    labels: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ['confirmed', 'in_fulfillment', 'completed', 'cancelled'],
      default: 'confirmed',
      index: true,
    },
    childBookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
      },
    ],
    childTransactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
      },
    ],
    logisticsJobs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LogisticsJob',
      },
    ],
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  { timestamps: true }
);

procurementOrderSchema.index({ seeker: 1, status: 1, createdAt: -1 });

export default mongoose.model('ProcurementOrder', procurementOrderSchema);
