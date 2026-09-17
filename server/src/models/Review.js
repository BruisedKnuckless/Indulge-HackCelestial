import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', index: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: String,
    comment: String,
  },
  { timestamps: true }
);

// Reviews are bidirectional — both parties may review a booking, but each side
// only once.
reviewSchema.index({ booking: 1, reviewer: 1 }, { unique: true });

export default mongoose.model('Review', reviewSchema);
