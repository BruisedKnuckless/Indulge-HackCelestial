import { Router } from 'express';
import Resource from '../models/Resource.js';
import Review from '../models/Review.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { getAvailabilityCalendar, getAvailableQuantity } from '../services/availability.service.js';

const router = Router();

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resources = await Resource.find({ owner: req.user._id, status: { $ne: 'archived' } })
      .sort('-createdAt')
      .lean();
    res.json({ resources });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = { ...req.body, owner: req.user._id };

    // Fall back to the business's own address so a listing is always mappable.
    if (!body.location?.coordinates?.length) {
      body.location = { ...(body.location || {}), coordinates: req.user.location?.coordinates };
    }
    if (!body.location?.coordinates?.length) {
      throw new HttpError(400, 'Set your business location before creating a listing.');
    }

    const resource = await Resource.create(body);
    res.status(201).json({ resource });
  })
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.id)
      .populate('owner', 'businessName businessType location ratingAvg ratingCount')
      .lean();
    if (!resource) throw new HttpError(404, 'Resource not found.');

    const reviews = await Review.find({ resource: resource._id })
      .populate('reviewer', 'businessName')
      .sort('-createdAt')
      .limit(20)
      .lean();

    res.json({ resource, reviews });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.id);
    if (!resource) throw new HttpError(404, 'Resource not found.');
    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only edit your own listings.');
    }

    const blocked = ['owner', '_id', 'ratingAvg', 'ratingCount'];
    for (const [key, value] of Object.entries(req.body)) {
      if (!blocked.includes(key)) resource[key] = value;
    }
    await resource.save();
    res.json({ resource });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.id);
    if (!resource) throw new HttpError(404, 'Resource not found.');
    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only remove your own listings.');
    }

    // Soft delete — existing bookings still reference this resource.
    resource.status = 'archived';
    await resource.save();
    res.json({ ok: true });
  })
);

router.get(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const start = req.query.start ? new Date(req.query.start) : new Date();
    const end = req.query.end
      ? new Date(req.query.end)
      : new Date(Date.now() + 60 * 24 * 3600 * 1000);

    const days = await getAvailabilityCalendar(req.params.id, start, end);
    res.json({ days });
  })
);

/** Point check used by the buy box to show a live "available for your dates" line. */
router.get(
  '/:id/check',
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) throw new HttpError(400, 'start and end are required.');

    const result = await getAvailableQuantity(req.params.id, new Date(start), new Date(end));
    res.json(result);
  })
);

export default router;
