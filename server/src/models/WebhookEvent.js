import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gateway: {
      type: String,
      required: true,
      default: 'simulated',
    },
    eventType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'failed'],
      default: 'processed',
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('WebhookEvent', webhookEventSchema);
