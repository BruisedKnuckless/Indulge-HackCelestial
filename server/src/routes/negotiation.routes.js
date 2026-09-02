import { Router } from 'express';
import Booking from '../models/Booking.js';
import Negotiation from '../models/Negotiation.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { notify } from '../services/notification.service.js';

const router = Router();

async function loadParticipantBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate('resource', 'title');
  if (!booking) throw new HttpError(404, 'Request not found.');

  const parties = [String(booking.provider), String(booking.seeker)];
  if (!parties.includes(String(userId))) {
    throw new HttpError(403, 'You are not a party to this request.');
  }
  return booking;
}

router.get(
  '/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    await loadParticipantBooking(req.params.bookingId, req.user._id);

    const messages = await Negotiation.find({ booking: req.params.bookingId })
      .populate('sender', 'businessName')
      .sort('createdAt')
      .lean();

    res.json({ messages });
  })
);

router.post(
  '/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await loadParticipantBooking(req.params.bookingId, req.user._id);

    if (['completed', 'cancelled', 'rejected'].includes(booking.status)) {
      throw new HttpError(400, `This request is ${booking.status} and can no longer be negotiated.`);
    }

    const { type = 'message', message, proposedPrice, proposedStart, proposedEnd } = req.body;
    if (type === 'message' && !message?.trim()) {
      throw new HttpError(400, 'Message cannot be empty.');
    }

    const entry = await Negotiation.create({
      booking: booking._id,
      sender: req.user._id,
      type,
      message,
      proposedPrice,
      proposedStart,
      proposedEnd,
    });

    // A counter-offer moves the request out of plain "pending" so both sides see
    // that terms are actively being worked out.
    if (type === 'counter_offer' && ['pending', 'negotiating'].includes(booking.status)) {
      booking.status = 'negotiating';
      if (proposedPrice != null) booking.quotedPrice = Number(proposedPrice);
      await booking.save();
    }

    const other =
      String(booking.provider) === String(req.user._id) ? booking.seeker : booking.provider;

    await notify({
      user: other,
      type: 'negotiation_message',
      title: type === 'counter_offer' ? 'New counter-offer' : 'New message',
      message: `${req.user.businessName} on ${booking.resource.title}: ${
        type === 'counter_offer' ? `₹${proposedPrice}` : message?.slice(0, 60)
      }`,
      relatedBooking: booking._id,
    });

    res.status(201).json({ message: await entry.populate('sender', 'businessName') });
  })
);

/** Accept the other side's counter-offer, adopting its price and dates. */
router.post(
  '/:bookingId/accept-offer/:messageId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await loadParticipantBooking(req.params.bookingId, req.user._id);
    const offer = await Negotiation.findById(req.params.messageId);

    if (!offer || String(offer.booking) !== String(booking._id)) {
      throw new HttpError(404, 'Offer not found.');
    }
    if (String(offer.sender) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot accept your own offer.');
    }

    if (offer.proposedPrice != null) booking.quotedPrice = offer.proposedPrice;
    if (offer.proposedStart) booking.startDateTime = offer.proposedStart;
    if (offer.proposedEnd) booking.endDateTime = offer.proposedEnd;
    booking.status = 'pending'; // terms agreed; provider still formally accepts
    await booking.save();

    await notify({
      user: offer.sender,
      type: 'negotiation_message',
      title: 'Counter-offer accepted',
      message: `${req.user.businessName} accepted your offer on ${booking.resource.title}`,
      relatedBooking: booking._id,
    });

    res.json({ booking });
  })
);

export default router;
