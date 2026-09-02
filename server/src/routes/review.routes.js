import { Router } from 'express';
import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Resource from '../models/Resource.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { notify } from '../services/notification.service.js';

const router = Router();

/** Recompute a target's rating from its reviews — cheaper to read than to join. */
async function recomputeRating(Model, targetField, targetId) {
  const [agg] = await Review.aggregate([
    { $match: { [targetField]: new mongoose.Types.ObjectId(String(targetId)) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Model.findByIdAndUpdate(targetId, {
    ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0,
    ratingCount: agg ? agg.count : 0,
  });
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bookingId, rating, title, comment } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'completed') {
      throw new HttpError(400, 'You can only review a completed booking.');
    }

    const parties = [String(booking.provider), String(booking.seeker)];
    if (!parties.includes(String(req.user._id))) {
      throw new HttpError(403, 'You are not a party to this booking.');
    }

    const reviewee =
      String(booking.seeker) === String(req.user._id) ? booking.provider : booking.seeker;

    const existing = await Review.findOne({ booking: booking._id, reviewer: req.user._id });
    if (existing) throw new HttpError(409, 'You have already reviewed this booking.');

    const review = await Review.create({
      booking: booking._id,
      resource: booking.resource,
      reviewer: req.user._id,
      reviewee,
      rating: Number(rating),
      title,
      comment,
    });

    await recomputeRating(User, 'reviewee', reviewee);
    await recomputeRating(Resource, 'resource', booking.resource);

    await notify({
      user: reviewee,
      type: 'review_received',
      title: 'New review',
      message: `${req.user.businessName} left you a ${rating}-star review`,
      relatedBooking: booking._id,
    });

    res.status(201).json({ review });
  })
);

router.get(
  '/user/:userId',
  asyncHandler(async (req, res) => {
    const reviews = await Review.find({ reviewee: req.params.userId })
      .populate('reviewer', 'businessName')
      .populate('resource', 'title')
      .sort('-createdAt')
      .lean();

    res.json({ reviews });
  })
);

export default router;
