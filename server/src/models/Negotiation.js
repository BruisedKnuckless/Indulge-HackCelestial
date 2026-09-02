import mongoose from 'mongoose';

const negotiationSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['message', 'counter_offer', 'quotation'],
      default: 'message',
    },
    proposedPrice: Number,
    proposedStart: Date,
    proposedEnd: Date,
    message: String,
  },
  { timestamps: true }
);

export default mongoose.model('Negotiation', negotiationSchema);
