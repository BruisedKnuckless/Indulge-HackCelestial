import { Router } from 'express';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Transaction from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validateBookingRequest } from '../services/availability.service.js';
import { scoreSingleResource } from '../services/matching.service.js';
import { notify } from '../services/notification.service.js';
import { estimatePrice } from '../utils/pricing.js';

const router = Router();

const POPULATE = [
  { path: 'resource', select: 'title category images pricing capacity totalQuantity location unit' },
  { path: 'provider', select: 'businessName location ratingAvg ratingCount phone' },
  { path: 'seeker', select: 'businessName location ratingAvg ratingCount phone' },
];

/** "Request Now" — bypasses the cart for a single resource. */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      resourceId,
      quantity = 1,
      startDateTime,
      endDateTime,
      urgency = 'medium',
      logistics = 'self_pickup',
      notes,
    } = req.body;

    const resource = await Resource.findById(resourceId);
    if (!resource || resource.status !== 'active') {
      throw new HttpError(404, 'That resource is no longer listed.');
    }
    if (String(resource.owner) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot request your own listing.');
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    const check = await validateBookingRequest({
      resource,
      quantity: Number(quantity),
      start,
      end,
    });
    if (!check.ok) throw new HttpError(409, check.reason);

    const scored = await scoreSingleResource(
      resource.toObject(),
      { start, end, quantity: Number(quantity), capacity: resource.capacity, urgency },
      req.user
    );

    const booking = await Booking.create({
      resource: resource._id,
      provider: resource.owner,
      seeker: req.user._id,
      requestedQuantity: Number(quantity),
      startDateTime: start,
      endDateTime: end,
      urgency,
      logistics,
      notes,
      quotedPrice: estimatePrice(resource, { quantity, startDateTime: start, endDateTime: end }),
      matchScore: scored?.matchScore,
      matchBreakdown: scored?.matchBreakdown,
    });

    await notify({
      user: resource.owner,
      type: 'booking_request',
      title: 'New resource request',
      message: `${req.user.businessName} requested ${quantity} × ${resource.title}`,
      relatedBooking: booking._id,
    });

    res.status(201).json({ booking: await booking.populate(POPULATE) });
  })
);

router.get(
  '/sent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = { seeker: req.user._id };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };

    const bookings = await Booking.find(filter).populate(POPULATE).sort('-createdAt').lean();
    res.json({ bookings });
  })
);

router.get(
  '/received',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = { provider: req.user._id };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };

    const bookings = await Booking.find(filter).populate(POPULATE).sort('-createdAt').lean();
    res.json({ bookings });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate(POPULATE);
    if (!booking) throw new HttpError(404, 'Request not found.');

    const mine = [String(booking.provider._id), String(booking.seeker._id)];
    if (!mine.includes(String(req.user._id))) {
      throw new HttpError(403, 'You are not a party to this request.');
    }

    res.json({ booking });
  })
);

router.patch(
  '/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');
    if (String(booking.provider) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the provider can accept this request.');
    }
    if (!['pending', 'negotiating'].includes(booking.status)) {
      throw new HttpError(400, `This request is already ${booking.status}.`);
    }

    // Re-check immediately before committing: another request for the same slot
    // may have been accepted since this one arrived.
    const check = await validateBookingRequest({
      resource: booking.resource,
      quantity: booking.requestedQuantity,
      start: booking.startDateTime,
      end: booking.endDateTime,
      excludeBookingId: booking._id,
    });
    if (!check.ok) throw new HttpError(409, check.reason);

    booking.status = 'accepted';
    if (req.body.agreedPrice != null) booking.agreedPrice = Number(req.body.agreedPrice);
    if (booking.agreedPrice == null) booking.agreedPrice = booking.quotedPrice;
    await booking.save();

    await Transaction.create({
      booking: booking._id,
      payer: booking.seeker,
      payee: booking.provider,
      amount: booking.agreedPrice || 0,
      status: 'pending',
    });

    await notify({
      user: booking.seeker,
      type: 'booking_status_change',
      title: 'Request accepted',
      message: `${req.user.businessName} accepted your request for ${booking.resource.title}`,
      relatedBooking: booking._id,
    });

    res.json({ booking: await booking.populate(POPULATE) });
  })
);

router.patch(
  '/:id/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');
    if (String(booking.provider) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the provider can reject this request.');
    }

    booking.status = 'rejected';
    booking.rejectionReason = req.body.reason || 'No reason given';
    await booking.save();

    await notify({
      user: booking.seeker,
      type: 'booking_status_change',
      title: 'Request declined',
      message: `${req.user.businessName} declined your request for ${booking.resource.title}`,
      relatedBooking: booking._id,
    });

    res.json({ booking: await booking.populate(POPULATE) });
  })
);

/** Seeker confirms an accepted request, which is when the mock payment settles. */
router.patch(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');
    if (String(booking.seeker) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the requesting business can confirm.');
    }
    if (booking.status !== 'accepted') {
      throw new HttpError(400, 'Only accepted requests can be confirmed.');
    }

    booking.status = 'confirmed';
    await booking.save();

    await Transaction.findOneAndUpdate(
      { booking: booking._id },
      { status: 'simulated_paid', paidAt: new Date() }
    );

    await notify({
      user: booking.provider,
      type: 'booking_status_change',
      title: 'Booking confirmed',
      message: `${req.user.businessName} confirmed the booking for ${booking.resource.title}`,
      relatedBooking: booking._id,
    });

    res.json({ booking: await booking.populate(POPULATE) });
  })
);

router.patch(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');

    const parties = [String(booking.provider), String(booking.seeker)];
    if (!parties.includes(String(req.user._id))) {
      throw new HttpError(403, 'You are not a party to this request.');
    }
    if (['completed', 'cancelled'].includes(booking.status)) {
      throw new HttpError(400, `This request is already ${booking.status}.`);
    }

    booking.status = 'cancelled';
    booking.cancellationReason = req.body.reason || 'No reason given';
    await booking.save();

    const other = String(booking.provider) === String(req.user._id) ? booking.seeker : booking.provider;
    await notify({
      user: other,
      type: 'booking_status_change',
      title: 'Booking cancelled',
      message: `${req.user.businessName} cancelled the booking for ${booking.resource.title}`,
      relatedBooking: booking._id,
    });

    res.json({ booking: await booking.populate(POPULATE) });
  })
);

router.patch(
  '/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');

    const parties = [String(booking.provider), String(booking.seeker)];
    if (!parties.includes(String(req.user._id))) {
      throw new HttpError(403, 'You are not a party to this request.');
    }
    if (booking.status !== 'confirmed') {
      throw new HttpError(400, 'Only confirmed bookings can be completed.');
    }

    booking.status = 'completed';
    await booking.save();

    res.json({ booking: await booking.populate(POPULATE) });
  })
);

export default router;
