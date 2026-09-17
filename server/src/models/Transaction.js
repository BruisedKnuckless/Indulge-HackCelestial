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
      enum: ['pending', 'simulated_paid', 'refunded'],
      default: 'pending',
    },
    paymentMethod: { type: String, default: 'mock' },
    paidAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('Transaction', transactionSchema);
