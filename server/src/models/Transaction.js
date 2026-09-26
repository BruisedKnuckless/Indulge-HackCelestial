import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    payee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    amount: { type: Number, required: true },
    // Prototype only — no gateway is integrated, status is advanced manually.
    status: {
      type: String,
      enum: ['pending', 'simulated_paid', 'paid', 'refunded', 'failed'],
      default: 'pending',
      index: true,
    },
    paymentMethod: { type: String, default: 'mock' },
    gatewayOrderId: { type: String, index: true },
    gatewayPaymentId: { type: String, index: true },
    gatewaySignature: { type: String },
    idempotencyKey: { type: String, index: true },
    reconciliationRef: { type: String, index: true },
    refundId: { type: String, index: true },
    refundStatus: {
      type: String,
      enum: ['none', 'requested', 'processed', 'failed'],
      default: 'none',
    },
    refundReason: String,
    refundedAt: Date,
    failureReason: String,
    metadata: mongoose.Schema.Types.Mixed,
    paidAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('Transaction', transactionSchema);
