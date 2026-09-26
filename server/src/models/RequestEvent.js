import mongoose from 'mongoose';

/**
 * Append-only log of the decisions in a request's life that the domain models
 * do not keep history for.
 *
 * Most of a request's story is already stored — proposals, offers, negotiation
 * messages, transactions, logistics timelines and reviews all carry their own
 * timestamps. What is lost is *who changed a status, and when*: a booking only
 * remembers that it is now 'accepted', a proposal only its latest price. This
 * collection records exactly those moments and nothing else, so the admin
 * Live tracker can show the seeker/lister back-and-forth without rewriting the
 * negotiation system. Written by services/request-events.service.js.
 */
export const REQUEST_EVENT_ACTIONS = [
  'request_created', // seeker created a direct booking request (price at creation)
  'requirement_updated', // seeker edited an open RFQ
  'requirement_closed',
  'requirement_cancelled',
  'proposal_revised', // lister changed a submitted proposal's price
  'proposal_withdrawn',
  'offer_withdrawn',
  'proposal_accepted', // seeker awarded an RFQ proposal
  'offer_accepted', // seeker awarded an RFQ offer
  'counter_offer_accepted', // either side accepted the other's counter-offer
  'request_accepted', // lister accepted a booking request
  'request_rejected',
  'booking_confirmed', // seeker confirmed (and paid) an accepted request
  'booking_cancelled',
  'booking_completed',
];

const requestEventSchema = new mongoose.Schema(
  {
    requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
    proposal: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['seeker', 'lister'] },
    action: { type: String, enum: REQUEST_EVENT_ACTIONS, required: true },
    fromPrice: Number,
    toPrice: Number,
    note: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model('RequestEvent', requestEventSchema);
