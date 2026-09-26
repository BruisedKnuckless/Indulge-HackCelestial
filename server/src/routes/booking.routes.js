import { Router } from 'express';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Transaction from '../models/Transaction.js';
import LogisticsJob from '../models/LogisticsJob.js';
import { requireAuth, requireBusinessUser } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validateBookingRequest } from '../services/availability.service.js';
import { scoreSingleResource } from '../services/matching.service.js';
import { notify } from '../services/notification.service.js';
import { recordEvent, roleOn } from '../services/request-events.service.js';
import { estimatePrice } from '../utils/pricing.js';
import { ensureLogisticsJobForBooking } from '../services/logistics.service.js';
import { PaymentService } from '../services/payment.service.js';
import { assessDelivery } from '../ml/delivery/predict.js';

const router = Router();

const POPULATE = [
  { path: 'resource', select: 'title category images pricing capacity totalQuantity location unit' },
  { path: 'provider', select: 'businessName location ratingAvg ratingCount phone' },
  { path: 'seeker', select: 'businessName location ratingAvg ratingCount phone' },
  { path: 'conditionChecks.recordedBy', select: 'businessName' },
];

/** "Request Now" — bypasses the cart for a single resource. */
router.post(
  '/',
  requireAuth,
  requireBusinessUser,
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
    await recordEvent({
      booking, actor: req.user, role: 'seeker', action: 'request_created', toPrice: booking.quotedPrice,
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
  requireBusinessUser,
  asyncHandler(async (req, res) => {
    const filter = { seeker: req.user._id };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };

    const bookings = await Booking.find(filter).populate(POPULATE).sort('-createdAt').lean();
    res.json({ bookings });
  })
);

const URGENCY_RANK = { high: 3, medium: 2, low: 1 };
const AWAITING = new Set(['pending', 'negotiating']);

/**
 * Order the provider's queue by what actually needs attention: anything still
 * awaiting a decision floats to the top, most urgent first, then whatever
 * starts soonest. Settled requests fall back to recency.
 *
 * Sorted here rather than in Mongo because the urgency enum sorts
 * alphabetically there ("high" < "low" < "medium"), which is not the intended
 * order — a numeric rank has to be applied either way.
 */
function byProviderPriority(a, b) {
  const aWaiting = AWAITING.has(a.status);
  const bWaiting = AWAITING.has(b.status);
  if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;

  if (aWaiting) {
    const rank = (URGENCY_RANK[b.urgency] || 0) - (URGENCY_RANK[a.urgency] || 0);
    if (rank !== 0) return rank;
    return new Date(a.startDateTime) - new Date(b.startDateTime);
  }

  return new Date(b.createdAt) - new Date(a.createdAt);
}

router.get(
  '/received',
  requireAuth,
  requireBusinessUser,
  asyncHandler(async (req, res) => {
    const filter = { provider: req.user._id };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };

    const bookings = await Booking.find(filter).populate(POPULATE).lean();
    bookings.sort(byProviderPriority);
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
      const assignedJob = await LogisticsJob.findOne({ booking: booking._id, logisticsPartner: req.user._id });
      if (!assignedJob) {
        throw new HttpError(403, 'You are not a party to this request.');
      }
    }

    // Both parties can see the money trail for their own booking.
    const transaction = await Transaction.findOne({ booking: booking._id }).lean();
    const out = booking.toJSON();
    out.deliveryPlan = await deliveryPlanFor(booking);

    res.json({ booking: out, transaction: transaction || null });
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

    const priceBefore = booking.quotedPrice;
    booking.status = 'accepted';
    if (req.body.agreedPrice != null) booking.agreedPrice = Number(req.body.agreedPrice);
    if (booking.agreedPrice == null) booking.agreedPrice = booking.quotedPrice;
    await booking.save();
    await recordEvent({
      booking, requirement: booking.sourceRequirement, actor: req.user, role: 'lister',
      action: 'request_accepted', fromPrice: priceBefore, toPrice: booking.agreedPrice,
    });

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
    await recordEvent({
      booking, requirement: booking.sourceRequirement, actor: req.user, role: 'lister',
      action: 'request_rejected', note: booking.rejectionReason,
    });

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
    await recordEvent({
      booking, requirement: booking.sourceRequirement, actor: req.user, role: 'seeker',
      action: 'booking_confirmed', toPrice: booking.agreedPrice,
    });

    await Transaction.findOneAndUpdate(
      { booking: booking._id },
      { status: 'simulated_paid', paidAt: new Date() }
    );

    // Initialize logistics job if physical transport is required
    try {
      await ensureLogisticsJobForBooking(booking);
    } catch (err) {
      console.error('Failed to initialize logistics job:', err);
    }

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

/**
 * PATCH /bookings/:id/pay — demo payment gateway.
 *
 * Validates ownership, status and idempotency before advancing the booking
 * to confirmed and recording the simulated payment.  A real gateway would
 * verify a payment-provider token here instead of trusting the client.
 */
router.patch(
  '/:id/pay',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      paymentMethod = 'upi',
      idempotencyKey,
      gatewayPaymentId,
      gatewaySignature,
    } = req.body;

    const result = await PaymentService.confirmPayment({
      bookingId: req.params.id,
      paymentMethod,
      idempotencyKey: idempotencyKey || req.headers['idempotency-key'],
      gatewayPaymentId,
      gatewaySignature,
      user: req.user,
    });

    const populatedBooking = await Booking.findById(result.booking._id).populate(POPULATE);
    res.json({
      booking: populatedBooking,
      transaction: result.transaction,
      alreadyPaid: result.alreadyPaid,
    });
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
    await recordEvent({
      booking, requirement: booking.sourceRequirement, actor: req.user, role: roleOn(booking, req.user._id),
      action: 'booking_cancelled', note: booking.cancellationReason,
    });

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

    // If fulfillment has been started (physical delivery workflow), the booking
    // can only reach "completed" via the return workflow (PATCH /return with
    // status: return_completed). Preventing early completion here ensures
    // DELIVERED ≠ COMPLETED.
    if (booking.fulfillment?.status) {
      throw new HttpError(
        400,
        'This booking uses the delivery/return workflow. ' +
        'It will be completed automatically when the return is confirmed.'
      );
    }

    // Non-physical/service bookings (no fulfillment started) may be completed
    // directly by either party.
    booking.status = 'completed';
    await booking.save();
    await recordEvent({
      booking, requirement: booking.sourceRequirement, actor: req.user, role: roleOn(booking, req.user._id),
      action: 'booking_completed',
    });

    res.json({ booking: await booking.populate(POPULATE) });
  })
);


/* ─────────────────────────────────────────────────────────────────────────────
   FULFILLMENT
   Provider advances: packed → loading → out_for_delivery → delivered
   Only the provider of a confirmed booking may call this.
───────────────────────────────────────────────────────────────────────────── */

const FULFILLMENT_ORDER = ['packed', 'loading', 'out_for_delivery', 'delivered'];
const FULFILLMENT_TS_FIELD = {
  packed:            'packedAt',
  loading:           'loadingAt',
  out_for_delivery:  'outForDeliveryAt',
  delivered:         'deliveredAt',
};

router.patch(
  '/:id/fulfillment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');

    // Only the provider may update fulfillment.
    if (String(booking.provider) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the provider can update fulfillment status.');
    }
    if (booking.status !== 'confirmed') {
      throw new HttpError(400, 'Fulfillment can only be updated for confirmed bookings.');
    }

    const { status, notes } = req.body;
    if (!FULFILLMENT_ORDER.includes(status)) {
      throw new HttpError(400, `Invalid fulfillment status: ${status}`);
    }

    // Enforce forward-only transitions.
    const currentIdx = FULFILLMENT_ORDER.indexOf(booking.fulfillment?.status ?? '');
    const newIdx = FULFILLMENT_ORDER.indexOf(status);
    if (newIdx <= currentIdx) {
      throw new HttpError(400, `Cannot go from ${booking.fulfillment?.status} to ${status}.`);
    }

    // Set status + timestamp.
    if (!booking.fulfillment) booking.fulfillment = {};
    booking.fulfillment.status = status;
    booking.fulfillment[FULFILLMENT_TS_FIELD[status]] = new Date();
    if (notes) booking.fulfillment.notes = notes;
    booking.markModified('fulfillment');
    await booking.save();

    // Notify the seeker.
    const FULFILLMENT_LABELS = {
      packed:           'Order packed',
      loading:          'Loading for transport',
      out_for_delivery: 'Out for delivery',
      delivered:        'Delivered',
    };
    await notify({
      user: booking.seeker,
      type: 'fulfillment_update',
      title: FULFILLMENT_LABELS[status],
      message: `Your booking for ${booking.resource.title} is now: ${FULFILLMENT_LABELS[status]}`,
      relatedBooking: booking._id,
    });

    res.json({ booking: await booking.populate(POPULATE) });
  })
);

/* ─────────────────────────────────────────────────────────────────────────────
   RETURN
   Seeker initiates (return_requested).
   Subsequent states can be advanced by either party (provider manages logistics).
   State machine: return_requested → return_pickup_scheduled → return_in_transit
                  → returned_to_provider → return_completed
───────────────────────────────────────────────────────────────────────────── */

const RETURN_ORDER = [
  'return_requested',
  'return_pickup_scheduled',
  'return_in_transit',
  'returned_to_provider',
  'return_completed',
];
const RETURN_TS_FIELD = {
  return_requested:          'returnRequestedAt',
  return_pickup_scheduled:   'returnPickupScheduledAt',
  return_in_transit:         'returnInTransitAt',
  returned_to_provider:      'returnedAt',
  return_completed:          'returnCompletedAt',
};

router.patch(
  '/:id/return',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');

    const parties = [String(booking.provider), String(booking.seeker)];
    if (!parties.includes(String(req.user._id))) {
      throw new HttpError(403, 'You are not a party to this request.');
    }
    if (booking.status !== 'confirmed') {
      throw new HttpError(400, 'Returns can only be initiated for confirmed bookings.');
    }

    const { status, notes } = req.body;
    if (!RETURN_ORDER.includes(status)) {
      throw new HttpError(400, `Invalid return status: ${status}`);
    }

    // First transition (return_requested) must come from the seeker.
    if (status === 'return_requested' && String(booking.seeker) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the seeker can initiate a return.');
    }

    // Enforce forward-only transitions.
    const currentIdx = RETURN_ORDER.indexOf(booking.return?.status ?? '');
    const newIdx = RETURN_ORDER.indexOf(status);
    if (newIdx <= currentIdx) {
      throw new HttpError(400, `Cannot go from ${booking.return?.status} to ${status}.`);
    }

    if (!booking.return) booking.return = {};
    booking.return.status = status;
    booking.return[RETURN_TS_FIELD[status]] = new Date();
    if (notes) booking.return.notes = notes;
    booking.markModified('return');

    // When return is fully completed, mark the booking as completed.
    if (status === 'return_completed') {
      booking.status = 'completed';
    }

    await booking.save();

    const RETURN_LABELS = {
      return_requested:        'Return requested',
      return_pickup_scheduled: 'Return pickup scheduled',
      return_in_transit:       'Return in transit',
      returned_to_provider:    'Returned to provider',
      return_completed:        'Return completed',
    };

    // Notify the other party.
    const otherParty =
      String(req.user._id) === String(booking.seeker) ? booking.provider : booking.seeker;
    await notify({
      user: otherParty,
      type: 'return_update',
      title: RETURN_LABELS[status],
      message: `Return update for ${booking.resource.title}: ${RETURN_LABELS[status]}`,
      relatedBooking: booking._id,
    });

    res.json({ booking: await booking.populate(POPULATE) });
  })
);

/* ─────────────────────────────────────────────────────────────────────────────
   CHECK EXPIRY
   Idempotent: fires a rental-expiry notification to the seeker if:
   - booking is confirmed
   - item has been delivered
   - rental endDateTime has passed
   - notification not yet sent (rentalExpiryNotified === false)
───────────────────────────────────────────────────────────────────────────── */

router.post(
  '/:id/check-expiry',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');

    const parties = [String(booking.provider), String(booking.seeker)];
    if (!parties.includes(String(req.user._id))) {
      throw new HttpError(403, 'You are not a party to this request.');
    }

    const now = new Date();
    const rentalEnded = booking.endDateTime && now > new Date(booking.endDateTime);
    const delivered = booking.fulfillment?.status === 'delivered';
    const returnDone =
      booking.return?.status === 'return_completed' || booking.status === 'completed';

    if (
      booking.status === 'confirmed' &&
      delivered &&
      rentalEnded &&
      !returnDone &&
      !booking.rentalExpiryNotified
    ) {
      booking.rentalExpiryNotified = true;
      await booking.save();

      await notify({
        user: booking.seeker,
        type: 'rental_expiry',
        title: 'Rental period ended',
        message: `Your rental for ${booking.resource.title} has ended. Please initiate the return.`,
        relatedBooking: booking._id,
      });

      return res.json({ notified: true });
    }

    res.json({ notified: false });
  })
);

/**
 * The booking's delivery plan: the snapshot taken at creation, or — for
 * bookings made before the model existed — one computed now and marked so.
 */
async function deliveryPlanFor(booking) {
  if (booking.deliveryPlan) return booking.deliveryPlan;
  const resource = await Resource.findById(booking.resource?._id || booking.resource).lean();
  if (!resource) return null;
  return { ...assessDelivery(resource, booking.requestedQuantity), computedNow: true };
}

/** Who may record each checkpoint: whoever physically holds the goods then. */
const CHECKPOINT_RECORDERS = {
  dispatch: ['lister', 'logistics'],
  delivery: ['seeker', 'logistics'],
  return: ['lister', 'logistics'],
};
const CHECKPOINT_ORDER = ['dispatch', 'delivery', 'return'];

/**
 * POST /api/bookings/:id/condition-checks/:checkpoint
 * Record the condition of the goods at one checkpoint of the delivery plan.
 * Each checkpoint is recorded once, in order, against the plan's checklist,
 * and the other side is notified — loudly when damage is reported.
 */
router.post(
  '/:id/condition-checks/:checkpoint',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { checkpoint } = req.params;
    if (!CHECKPOINT_ORDER.includes(checkpoint)) throw new HttpError(400, 'Unknown checkpoint.');

    const booking = await Booking.findById(req.params.id).populate('resource', 'title category');
    if (!booking) throw new HttpError(404, 'Request not found.');

    const me = String(req.user._id);
    const isLister = String(booking.provider) === me;
    const isSeeker = String(booking.seeker) === me;
    const isPartner = !isLister && !isSeeker && Boolean(await LogisticsJob.exists({ booking: booking._id, logisticsPartner: req.user._id }));
    if (!isLister && !isSeeker && !isPartner) throw new HttpError(403, 'You are not a party to this request.');

    const role = isLister ? 'lister' : isSeeker ? 'seeker' : 'logistics';
    if (!CHECKPOINT_RECORDERS[checkpoint].includes(role)) {
      throw new HttpError(403, `The ${checkpoint} check is recorded by the ${CHECKPOINT_RECORDERS[checkpoint].join(' or ')}.`);
    }
    if (!['accepted', 'confirmed', 'completed'].includes(booking.status)) {
      throw new HttpError(400, `Condition checks start once the booking is accepted; it is ${booking.status}.`);
    }

    const plan = await deliveryPlanFor(booking);
    if (!plan?.requiresDelivery) throw new HttpError(400, 'This booking has no delivery, so there is nothing to check.');
    if (!booking.deliveryPlan) booking.deliveryPlan = plan;

    const recorded = new Set((booking.conditionChecks || []).map((c) => c.checkpoint));
    if (recorded.has(checkpoint)) throw new HttpError(409, `The ${checkpoint} check has already been recorded.`);
    const previous = CHECKPOINT_ORDER[CHECKPOINT_ORDER.indexOf(checkpoint) - 1];
    if (previous && !recorded.has(previous)) {
      throw new HttpError(409, `Record the ${previous} check first — each check is compared with the one before it.`);
    }

    // Answers must cover exactly the plan's checklist for this checkpoint.
    const checklist = plan.checkpoints.find((c) => c.key === checkpoint)?.items || [];
    const answers = Array.isArray(req.body?.items) ? req.body.items : [];
    const byKey = new Map(answers.map((a) => [a?.key, a]));
    const unknown = answers.filter((a) => !checklist.some((i) => i.key === a?.key));
    if (unknown.length) throw new HttpError(400, `Not on this checklist: ${unknown.map((a) => a?.key).join(', ')}.`);
    const missing = checklist.filter((i) => typeof byKey.get(i.key)?.ok !== 'boolean');
    if (missing.length) throw new HttpError(400, `Answer every checklist item: ${missing.map((i) => i.label).join('; ')}.`);

    const overall = req.body?.overall;
    if (!['good', 'minor_issues', 'damaged'].includes(overall)) {
      throw new HttpError(400, 'Overall condition must be good, minor_issues or damaged.');
    }
    const countVerified = req.body?.countVerified == null ? undefined : Number(req.body.countVerified);
    if (countVerified !== undefined && (!Number.isFinite(countVerified) || countVerified < 0)) {
      throw new HttpError(400, 'Count must be a non-negative number.');
    }

    booking.conditionChecks.push({
      checkpoint,
      items: checklist.map((i) => ({
        key: i.key,
        label: i.label,
        ok: byKey.get(i.key).ok,
        note: String(byKey.get(i.key).note || '').slice(0, 300) || undefined,
      })),
      countVerified,
      overall,
      notes: String(req.body?.notes || '').slice(0, 1000) || undefined,
      recordedBy: req.user._id,
      role,
      recordedAt: new Date(),
    });
    await booking.save();

    const label = plan.checkpoints.find((c) => c.key === checkpoint)?.label || checkpoint;
    const shortfall = countVerified !== undefined && countVerified < booking.requestedQuantity;
    for (const user of [booking.seeker, booking.provider].filter((u) => String(u) !== me)) {
      await notify({
        user,
        type: 'fulfillment_update',
        title:
          overall === 'damaged'
            ? `Damage reported — ${label.toLowerCase()} check`
            : shortfall
            ? `Count short — ${label.toLowerCase()} check`
            : `${label} condition check recorded`,
        message: `${req.user.businessName} recorded the ${label.toLowerCase()} check for ${booking.resource?.title || 'your booking'}: ${overall.replace('_', ' ')}${
          shortfall ? `, ${countVerified} of ${booking.requestedQuantity} counted` : ''
        }.`,
        relatedBooking: booking._id,
      });
    }

    res.status(201).json({ booking: await booking.populate(POPULATE) });
  })
);

export default router;

