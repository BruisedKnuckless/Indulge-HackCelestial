import { Router } from 'express';
import Resource from '../models/Resource.js';
import Booking, { HARD_RESERVED_STATUSES } from '../models/Booking.js';
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

    if (req.body.status === 'archived') {
      const futureCommitments = await Booking.countDocuments({
        resource: resource._id,
        status: { $in: HARD_RESERVED_STATUSES },
        endDateTime: { $gt: new Date() },
      });
      if (futureCommitments > 0) {
        throw new HttpError(
          400,
          `Cannot archive this listing: you have ${futureCommitments} active or upcoming confirmed booking(s). Pause the listing to stop new bookings instead.`
        );
      }
    }

    const blocked = ['owner', '_id', 'ratingAvg', 'ratingCount'];
    for (const [key, value] of Object.entries(req.body)) {
      if (!blocked.includes(key)) resource[key] = value;
    }
    await resource.save();
    res.json({ resource });
  })
);

router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.id);
    if (!resource) throw new HttpError(404, 'Resource not found.');
    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only change the status of your own listings.');
    }

    const { status } = req.body;
    if (!['active', 'paused', 'archived'].includes(status)) {
      throw new HttpError(400, 'Invalid status. Allowed: active, paused, archived.');
    }

    if (status === 'archived') {
      const futureCommitments = await Booking.countDocuments({
        resource: resource._id,
        status: { $in: HARD_RESERVED_STATUSES },
        endDateTime: { $gt: new Date() },
      });
      if (futureCommitments > 0) {
        throw new HttpError(
          400,
          `Cannot archive this listing: you have ${futureCommitments} active or upcoming confirmed booking(s). Pause the listing to stop new bookings instead.`
        );
      }
    }

    resource.status = status;
    await resource.save();
    res.json({ ok: true, resource });
  })
);

router.patch(
  '/:id/availability',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.id);
    if (!resource) throw new HttpError(404, 'Resource not found.');
    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only edit your own listings.');
    }

    const {
      availabilityMode,
      availableUntil,
      recurringSchedule,
      availabilityWindows,
      bufferBeforeMinutes,
      bufferAfterMinutes,
    } = req.body;

    if (availabilityMode !== undefined) {
      if (!['indefinite', 'until_date', 'date_range', 'recurring', 'custom'].includes(availabilityMode)) {
        throw new HttpError(400, 'Invalid availabilityMode.');
      }
      resource.availabilityMode = availabilityMode;
    }

    if (availableUntil !== undefined) {
      resource.availableUntil = availableUntil ? new Date(availableUntil) : null;
    }

    if (recurringSchedule !== undefined) {
      resource.recurringSchedule = recurringSchedule;
    }

    if (availabilityWindows !== undefined) {
      resource.availabilityWindows = availabilityWindows;
    }

    if (bufferBeforeMinutes !== undefined) {
      if (typeof bufferBeforeMinutes !== 'number' || bufferBeforeMinutes < 0) {
        throw new HttpError(400, 'bufferBeforeMinutes must be a non-negative number.');
      }
      resource.bufferBeforeMinutes = bufferBeforeMinutes;
    }

    if (bufferAfterMinutes !== undefined) {
      if (typeof bufferAfterMinutes !== 'number' || bufferAfterMinutes < 0) {
        throw new HttpError(400, 'bufferAfterMinutes must be a non-negative number.');
      }
      resource.bufferAfterMinutes = bufferAfterMinutes;
    }

    await resource.save();
    res.json({ resource });
  })
);

router.post(
  '/:id/blocks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.id);
    if (!resource) throw new HttpError(404, 'Resource not found.');
    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only block dates on your own listings.');
    }

    const { start, end, type = 'unavailable', reason = '' } = req.body;
    if (!start || !end) throw new HttpError(400, 'start and end dates are required.');

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (Number.isNaN(+startDate) || Number.isNaN(+endDate)) {
      throw new HttpError(400, 'Invalid start or end date.');
    }
    if (endDate <= startDate) {
      throw new HttpError(400, 'End date must be after start date.');
    }

    const validTypes = ['internal_use', 'maintenance', 'private_event', 'unavailable', 'other'];
    if (!validTypes.includes(type)) {
      throw new HttpError(400, `Invalid block type. Allowed: ${validTypes.join(', ')}`);
    }

    // Check if proposed block overlaps any accepted/confirmed booking on this resource
    const bufBeforeMs = (resource.bufferBeforeMinutes || 0) * 60 * 1000;
    const bufAfterMs = (resource.bufferAfterMinutes || 0) * 60 * 1000;

    const conflict = await Booking.findOne({
      resource: resource._id,
      status: { $in: HARD_RESERVED_STATUSES },
      startDateTime: { $lt: new Date(endDate.getTime() + bufBeforeMs) },
      endDateTime: { $gt: new Date(startDate.getTime() - bufAfterMs) },
    }).lean();

    if (conflict) {
      throw new HttpError(
        409,
        `Cannot block this period: it conflicts with an existing confirmed booking (${new Date(conflict.startDateTime).toISOString()} - ${new Date(conflict.endDateTime).toISOString()}).`
      );
    }

    const newBlock = {
      start: startDate,
      end: endDate,
      type,
      reason: reason.trim(),
    };

    resource.blockedPeriods.push(newBlock);
    await resource.save();

    res.status(201).json({
      ok: true,
      block: resource.blockedPeriods[resource.blockedPeriods.length - 1],
      blockedPeriods: resource.blockedPeriods,
    });
  })
);

router.delete(
  '/:id/blocks/:blockId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.params.id);
    if (!resource) throw new HttpError(404, 'Resource not found.');
    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only edit your own listings.');
    }

    resource.blockedPeriods = (resource.blockedPeriods || []).filter(
      (b) => String(b._id) !== String(req.params.blockId)
    );
    await resource.save();

    res.json({ ok: true, blockedPeriods: resource.blockedPeriods });
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

    const futureCommitments = await Booking.countDocuments({
      resource: resource._id,
      status: { $in: HARD_RESERVED_STATUSES },
      endDateTime: { $gt: new Date() },
    });
    if (futureCommitments > 0) {
      throw new HttpError(
        400,
        `Cannot archive this listing: you have ${futureCommitments} active or upcoming confirmed booking(s). Pause the listing to stop new bookings instead.`
      );
    }

    // Soft delete — existing bookings still reference this resource.
    resource.status = 'archived';
    await resource.save();
    res.json({ ok: true });
  })
);

router.get(
  '/:id/availability',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const start = req.query.start ? new Date(req.query.start) : new Date();
    const end = req.query.end
      ? new Date(req.query.end)
      : new Date(Date.now() + 60 * 24 * 3600 * 1000);

    const resource = await Resource.findById(req.params.id).lean();
    if (!resource) throw new HttpError(404, 'Resource not found.');

    const isOwner = req.user && String(resource.owner) === String(req.user._id);
    const days = await getAvailabilityCalendar(req.params.id, start, end, { isOwner, resource });

    res.json({
      days,
      isOwner: Boolean(isOwner),
      mode: resource.availabilityMode || 'indefinite',
      buffers: isOwner
        ? {
            before: resource.bufferBeforeMinutes || 0,
            after: resource.bufferAfterMinutes || 0,
          }
        : undefined,
    });
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
