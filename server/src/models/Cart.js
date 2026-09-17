import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    quantity: { type: Number, default: 1, min: 1 },
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },
    savedForLater: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    // One live cart per business.
    seeker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

export default mongoose.model('Cart', cartSchema);
