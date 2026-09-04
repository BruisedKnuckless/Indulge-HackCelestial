import { Router } from 'express';
import Requirement from '../models/Requirement.js';
import Resource from '../models/Resource.js';
import Booking from '../models/Booking.js';
import Transaction from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validateBookingRequest } from '../services/availability.service.js';
import { notify } from '../services/notification.service.js';

const router = Router();

const POPULATE = [
  { path: 'seeker', select: 'businessName location ratingAvg ratingCount phone' },
  { path: 'offers.provider', select: 'businessName location ratingAvg ratingCount' },
  { path: 'offers.resource', select: 'title category images pricing capacity totalQuantity unit' },
];

/** Publish a requirement for providers to respond to. */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { startDateTime, endDateTime } = req.body;
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (!(start < end)) throw new HttpError(400, 'The end time must be after the start time.');

    const requirement = await Requirement.create({
      ...req.body,
      seeker: req.user._id,
      startDateTime: start,
      endDateTime: end,
      // Default to the seeker's own location so distance is meaningful without
      // making them re-enter an address they have already given us.
      location: req.body.location?.coordinates?.length
        ? req.body.location
        : req.user.location,
      offers: [],
      status: 'open',
    });

    res.status(201).json({ requirement });
  })
);

/**
 * The provider-facing board of open requirements. Excludes the caller's own
 * postings — you cannot bid on your own requirement.
 */
router.get(
  '/open',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = {
      status: 'open',
      seeker: { $ne: req.user._id },
      endDateTime: { $gte: new Date() },
    };
    if (req.query.category) filter.category = req.query.category;

    const requirements = await Requirement.find(filter)
      .populate(POPULATE)
      .sort({ urgency: -1, startDateTime: 1 })
      .limit(Number(req.query.limit) || 50)
      .lean();

    res.json({ requirements });
  })
);

/** Requirements the caller has posted. */
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirements = await Requirement.find({ seeker: req.user._id })
      .populate(POPULATE)
      .sort('-createdAt')
      .lean();
    res.json({ requirements });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirement = await Requirement.findById(req.params.id).populate(POPULATE).lean();
    if (!requirement) throw new HttpError(404, 'Requirement not found.');
    res.json({ requirement });
  })
);

/** A provider offers one of their listings against a requirement. */
router.post(
  '/:id/offers',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { resourceId, price, message } = req.body;

    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) throw new HttpError(404, 'Requirement not found.');
    if (requirement.status !== 'open') throw new HttpError(409, 'This requirement is closed.');
    if (String(requirement.seeker) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot offer against your own requirement.');
    }

    const resource = await Resource.findById(resourceId);
    if (!resource || resource.status !== 'active') {
      throw new HttpError(404, 'That resource is no longer listed.');
    }
    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only offer your own listings.');
    }

    // Offering something you cannot actually supply wastes the seeker's time,
    // so the same availability rules as a booking apply here.
    const check = await validateBookingRequest({
      resource,
      quantity: requirement.quantity,
      start: requirement.startDateTime,
      end: requirement.endDateTime,
    });
    if (!check.ok) throw new HttpError(409, check.reason);

    const existing = requirement.offers.find(
      (o) => String(o.provider) === String(req.user._id) && String(o.resource) === String(resourceId)
    );
    if (existing && existing.status === 'offered') {
      throw new HttpError(409, 'You have already offered this resource.');
    }

    requirement.offers.push({
      provider: req.user._id,
      resource: resourceId,
      price: Number(price),
      message,
    });
    await requirement.save();

    await notify({
      user: requirement.seeker,
      type: 'requirement_offer',
      title: 'New offer on your requirement',
      message: `${req.user.businessName} offered ${resource.title}.`,
      relatedRequirement: requirement._id,
    });

    res.status(201).json({ requirement });
  })
);

/**
 * The seeker accepts an offer. This converts the requirement into a real
 * booking, re-validating availability first — time has passed since the offer.
 */
router.post(
  '/:id/offers/:offerId/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) throw new HttpError(404, 'Requirement not found.');
    if (String(requirement.seeker) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the requirement owner can accept an offer.');
    }
    if (requirement.status !== 'open') throw new HttpError(409, 'This requirement is closed.');

    const offer = requirement.offers.id(req.params.offerId);
    if (!offer || offer.status !== 'offered') throw new HttpError(404, 'Offer not available.');

    const resource = await Resource.findById(offer.resource);
    if (!resource || resource.status !== 'active') {
      throw new HttpError(409, 'That resource is no longer listed.');
    }

    const check = await validateBookingRequest({
      resource,
      quantity: requirement.quantity,
      start: requirement.startDateTime,
      end: requirement.endDateTime,
    });
    if (!check.ok) throw new HttpError(409, check.reason);

    const booking = await Booking.create({
      resource: resource._id,
      provider: offer.provider,
      seeker: req.user._id,
      requestedQuantity: requirement.quantity,
      startDateTime: requirement.startDateTime,
      endDateTime: requirement.endDateTime,
      status: 'accepted', // the provider already offered these terms
      quotedPrice: offer.price,
      agreedPrice: offer.price,
      urgency: requirement.urgency,
      notes: `From requirement: ${requirement.title}`,
    });

    // An accepted booking always carries a pending transaction, whichever route
    // created it — otherwise requirement-sourced bookings would have no money
    // trail and would render an empty transaction panel.
    await Transaction.create({
      booking: booking._id,
      payer: req.user._id,
      payee: offer.provider,
      amount: offer.price,
      status: 'pending',
    });

    offer.status = 'accepted';
    requirement.offers.forEach((o) => {
      if (String(o._id) !== String(offer._id) && o.status === 'offered') o.status = 'declined';
    });
    requirement.status = 'fulfilled';
    requirement.fulfilledBooking = booking._id;
    await requirement.save();

    await notify({
      user: offer.provider,
      type: 'booking_status_change',
      title: 'Your offer was accepted',
      message: `${req.user.businessName} accepted your offer on "${requirement.title}".`,
      relatedBooking: booking._id,
    });

    res.json({ requirement, booking });
  })
);

/** Withdraw an offer you made. */
router.patch(
  '/:id/offers/:offerId/withdraw',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) throw new HttpError(404, 'Requirement not found.');

    const offer = requirement.offers.id(req.params.offerId);
    if (!offer) throw new HttpError(404, 'Offer not found.');
    if (String(offer.provider) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only withdraw your own offer.');
    }

    offer.status = 'withdrawn';
    await requirement.save();
    res.json({ requirement });
  })
);

/** Close a requirement without accepting anything. */
router.patch(
  '/:id/close',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) throw new HttpError(404, 'Requirement not found.');
    if (String(requirement.seeker) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the requirement owner can close it.');
    }

    requirement.status = 'closed';
    await requirement.save();
    res.json({ requirement });
  })
);

export default router;
