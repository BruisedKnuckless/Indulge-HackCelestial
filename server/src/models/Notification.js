import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'booking_request',
        'booking_status_change',
        'negotiation_message',
        'review_received',
        'rfq_match',
        'rfq_proposal_received',
        'rfq_proposal_accepted',
        'rfq_proposal_closed',
        'requirement_offer',
        'fulfillment_update',
        'rental_expiry',
        'return_update',
        // Sent by the admin console — broadcasts and moderation outcomes.
        // Carries no related booking or requirement of its own.
        'platform_announcement',
      ],
      required: true,
    },
    relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    relatedRequirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement' },
    title: String,
    message: String,
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('Notification', notificationSchema);
