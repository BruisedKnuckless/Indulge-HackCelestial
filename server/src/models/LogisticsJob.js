import mongoose from 'mongoose';

export const LOGISTICS_STATUSES = [
  'unassigned',
  'assigned',
  'accepted',
  'pickup_scheduled',
  'arrived_at_provider',
  'picked_up',
  'in_transit',
  'delivered',
  'return_requested',
  'return_pickup_scheduled',
  'return_picked_up',
  'return_in_transit',
  'returned_to_provider',
  'completed',
  'declined',
  'cancelled',
];

export const LOGISTICS_STATUS_TRANSITIONS = {
  unassigned: ['assigned', 'cancelled'],
  assigned: ['accepted', 'declined', 'cancelled', 'assigned'],
  declined: ['assigned', 'cancelled'],
  accepted: ['pickup_scheduled', 'arrived_at_provider', 'picked_up', 'cancelled'],
  pickup_scheduled: ['arrived_at_provider', 'picked_up', 'cancelled'],
  arrived_at_provider: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'delivered', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: ['return_requested', 'completed'],
  return_requested: ['return_pickup_scheduled', 'return_picked_up', 'completed'],
  return_pickup_scheduled: ['return_picked_up', 'cancelled'],
  return_picked_up: ['return_in_transit', 'returned_to_provider', 'cancelled'],
  return_in_transit: ['returned_to_provider', 'cancelled'],
  returned_to_provider: ['completed'],
  completed: [],
  cancelled: [],
};

const logisticsJobSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
      index: true,
    },
    seeker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    logisticsPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    pickupLocation: {
      address: String,
      city: String,
      pincode: String,
      coordinates: [Number],
    },
    deliveryLocation: {
      address: String,
      city: String,
      pincode: String,
      coordinates: [Number],
    },
    scheduledPickupTime: Date,
    requiredDeliveryTime: Date,
    returnRequired: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: LOGISTICS_STATUSES,
      default: 'unassigned',
      index: true,
    },
    timeline: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        notes: String,
      },
    ],
    operationalNotes: String,
    declineReason: String,
    cancellationReason: String,
  },
  { timestamps: true }
);

logisticsJobSchema.index({ status: 1, logisticsPartner: 1 });

export default mongoose.model('LogisticsJob', logisticsJobSchema);
