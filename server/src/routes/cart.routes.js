import { Router } from 'express';
import Cart from '../models/Cart.js';
import Resource from '../models/Resource.js';
import Booking from '../models/Booking.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validateBookingRequest } from '../services/availability.service.js';
import { scoreSingleResource } from '../services/matching.service.js';
import { notify } from '../services/notification.service.js';
import { estimatePrice } from '../utils/pricing.js';

const router = Router();

async function loadCart(seekerId) {
  let cart = await Cart.findOne({ seeker: seekerId });
  if (!cart) cart = await Cart.create({ seeker: seekerId, items: [] });
  return cart;
}

/** Populates each line with its resource plus a live availability verdict. */
async function hydrate(cart) {
  await cart.populate({
    path: 'items.resource',
    populate: { path: 'owner', select: 'businessName location ratingAvg ratingCount' },
  });

  const items = await Promise.all(
    cart.items.map(async (item) => {
      const resource = item.resource;
      if (!resource) return null;

      const check = await validateBookingRequest({
        resource,
        quantity: item.quantity,
        start: item.startDateTime,
        end: item.endDateTime,
      });

      return {
        _id: item._id,
        resource,
        quantity: item.quantity,
        startDateTime: item.startDateTime,
        endDateTime: item.endDateTime,
        savedForLater: item.savedForLater,
        estimatedPrice: estimatePrice(resource, item),
        available: check.ok,
        unavailableReason: check.ok ? null : check.reason,
      };
    })
  );

  const live = items.filter(Boolean);
  const active = live.filter((i) => !i.savedForLater);

  return {
    items: live,
    subtotal: active.reduce((sum, i) => sum + i.estimatedPrice, 0),
    count: active.length,
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const cart = await loadCart(req.user._id);
    res.json(await hydrate(cart));
  })
);

router.post(
  '/items',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { resourceId, quantity = 1, startDateTime, endDateTime } = req.body;
    if (!resourceId || !startDateTime || !endDateTime) {
      throw new HttpError(400, 'Resource and date range are required.');
    }

    const resource = await Resource.findById(resourceId);
    if (!resource || resource.status !== 'active') {
      throw new HttpError(404, 'That resource is no longer listed.');
    }
    if (String(resource.owner) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot request your own listing.');
    }

    const check = await validateBookingRequest({
      resource,
      quantity: Number(quantity),
      start: new Date(startDateTime),
      end: new Date(endDateTime),
    });
    if (!check.ok) throw new HttpError(409, check.reason);

    const cart = await loadCart(req.user._id);
    cart.items.push({
      resource: resource._id,
      quantity: Number(quantity),
      startDateTime: new Date(startDateTime),
      endDateTime: new Date(endDateTime),
    });
    await cart.save();

    res.status(201).json(await hydrate(cart));
  })
);

router.patch(
  '/items/:itemId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const cart = await loadCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) throw new HttpError(404, 'That item is no longer in your cart.');

    const { quantity, startDateTime, endDateTime, savedForLater } = req.body;
    if (quantity !== undefined) item.quantity = Number(quantity);
    if (startDateTime) item.startDateTime = new Date(startDateTime);
    if (endDateTime) item.endDateTime = new Date(endDateTime);
    if (savedForLater !== undefined) item.savedForLater = Boolean(savedForLater);

    await cart.save();
    res.json(await hydrate(cart));
  })
);

router.delete(
  '/items/:itemId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const cart = await loadCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (item) item.deleteOne();
    await cart.save();
    res.json(await hydrate(cart));
  })
);

/**
 * POST /api/cart/checkout
 *
 * Turns the cart into one Booking per active line. Availability is re-checked
 * here rather than trusted from the cart view, because time has passed since
 * the item was added and another business may have taken the same slot.
 * Unavailable lines are reported back and left in the cart instead of failing
 * the whole checkout.
 */
router.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { urgency = 'medium', logistics = 'self_pickup', notes } = req.body;

    const cart = await loadCart(req.user._id);
    await cart.populate('items.resource');

    const active = cart.items.filter((i) => !i.savedForLater && i.resource);
    if (!active.length) throw new HttpError(400, 'Your request cart is empty.');

    const created = [];
    const failed = [];

    for (const item of active) {
      const resource = item.resource;

      const check = await validateBookingRequest({
        resource,
        quantity: item.quantity,
        start: item.startDateTime,
        end: item.endDateTime,
      });

      if (!check.ok) {
        failed.push({ title: resource.title, reason: check.reason });
        continue;
      }

      const scored = await scoreSingleResource(
        resource.toObject(),
        {
          start: item.startDateTime,
          end: item.endDateTime,
          quantity: item.quantity,
          capacity: resource.capacity,
          urgency,
        },
        req.user
      );

      const booking = await Booking.create({
        resource: resource._id,
        provider: resource.owner,
        seeker: req.user._id,
        requestedQuantity: item.quantity,
        startDateTime: item.startDateTime,
        endDateTime: item.endDateTime,
        urgency,
        logistics,
        notes,
        quotedPrice: estimatePrice(resource, item),
        matchScore: scored?.matchScore,
        matchBreakdown: scored?.matchBreakdown,
      });

      await notify({
        user: resource.owner,
        type: 'booking_request',
        title: 'New resource request',
        message: `${req.user.businessName} requested ${item.quantity} × ${resource.title}`,
        relatedBooking: booking._id,
      });

      created.push(booking);
      item.deleteOne();
    }

    await cart.save();

    res.status(created.length ? 201 : 409).json({
      created: created.length,
      bookings: created,
      failed,
    });
  })
);

export default router;
