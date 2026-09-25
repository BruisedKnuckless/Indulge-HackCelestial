import { Router } from 'express';
import mongoose from 'mongoose';
import LogisticsJob, { LOGISTICS_STATUS_TRANSITIONS } from '../models/LogisticsJob.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Resource, { doesResourceRequireLogistics } from '../models/Resource.js';
import { requireAuth, requireAdmin, requireLogisticsPartner } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { isPlatformAdmin } from '../config/admin.js';
import { sessionUser } from '../config/admin.js';
import { notify } from '../services/notification.service.js';
import { validate, updateLogisticsStatusSchema } from '../middleware/validate.middleware.js';

const router = Router();

/** Populate paths for a full logistics view */
const JOB_POPULATE = [
  { path: 'seeker', select: 'businessName email phone location' },
  { path: 'provider', select: 'businessName email phone location' },
  { path: 'logisticsPartner', select: 'businessName email phone logisticsProfile' },
  { path: 'resource', select: 'title category location totalQuantity unit images' },
  { path: 'booking', select: 'status startDateTime endDateTime agreedPrice quotedPrice requestedQuantity' },
];

/**
 * GET /api/logistics/jobs
 * List jobs according to role and query filters.
 */
router.get(
  '/jobs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, view } = req.query;
    const filter = {};

    if (isPlatformAdmin(req.user)) {
      if (status) filter.status = status;
    } else if (req.user.userType === 'logistics_partner') {
      if (view === 'available') {
        filter.status = 'unassigned';
      } else if (view === 'completed') {
        filter.logisticsPartner = req.user._id;
        filter.status = { $in: ['delivered', 'returned_to_provider', 'completed'] };
      } else {
        filter.logisticsPartner = req.user._id;
        if (status) filter.status = status;
      }
    } else {
      // Normal business: only bookings where they are seeker or provider
      filter.$or = [{ seeker: req.user._id }, { provider: req.user._id }];
      if (status) filter.status = status;
    }

    const jobs = await LogisticsJob.find(filter)
      .populate(JOB_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ jobs });
  })
);

/**
 * GET /api/logistics/jobs/:id
 * Retrieve single logistics job with strict authorization.
 */
router.get(
  '/jobs/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await LogisticsJob.findById(req.params.id).populate(JOB_POPULATE);
    if (!job) throw new HttpError(404, 'Logistics job not found.');

    const isSeeker = String(job.seeker?._id || job.seeker) === String(req.user._id);
    const isProvider = String(job.provider?._id || job.provider) === String(req.user._id);
    const isAssigned = job.logisticsPartner && String(job.logisticsPartner?._id || job.logisticsPartner) === String(req.user._id);
    const isAdmin = isPlatformAdmin(req.user);

    if (!isSeeker && !isProvider && !isAssigned && !isAdmin) {
      throw new HttpError(403, 'You do not have access to this logistics job.');
    }

    res.json({ job });
  })
);

/**
 * GET /api/logistics/by-booking/:bookingId
 * Retrieve logistics job for a given booking.
 */
router.get(
  '/by-booking/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await LogisticsJob.findOne({ booking: req.params.bookingId }).populate(JOB_POPULATE);
    if (!job) return res.json({ job: null });

    const isSeeker = String(job.seeker?._id || job.seeker) === String(req.user._id);
    const isProvider = String(job.provider?._id || job.provider) === String(req.user._id);
    const isAssigned = job.logisticsPartner && String(job.logisticsPartner?._id || job.logisticsPartner) === String(req.user._id);
    const isAdmin = isPlatformAdmin(req.user);

    if (!isSeeker && !isProvider && !isAssigned && !isAdmin) {
      throw new HttpError(403, 'You do not have access to this booking logistics.');
    }

    res.json({ job });
  })
);

/**
 * POST /api/logistics/jobs
 * Create a new logistics job for a confirmed or accepted booking.
 */
router.post(
  '/jobs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bookingId, scheduledPickupTime, requiredDeliveryTime, returnRequired, operationalNotes } = req.body;
    if (!bookingId) throw new HttpError(400, 'bookingId is required.');

    const booking = await Booking.findById(bookingId).populate('resource');
    if (!booking) throw new HttpError(404, 'Booking not found.');

    const isSeeker = String(booking.seeker) === String(req.user._id);
    const isProvider = String(booking.provider) === String(req.user._id);
    const isAdmin = isPlatformAdmin(req.user);

    if (!isSeeker && !isProvider && !isAdmin) {
      throw new HttpError(403, 'Only parties to this booking or an admin may create a logistics job.');
    }

    if (!doesResourceRequireLogistics(booking.resource, booking)) {
      throw new HttpError(400, 'Logistics transport is not required for this resource/service.');
    }

    const existing = await LogisticsJob.findOne({ booking: booking._id });
    if (existing) {
      throw new HttpError(409, 'A logistics job already exists for this booking.');
    }

    const [providerUser, seekerUser] = await Promise.all([
      User.findById(booking.provider),
      User.findById(booking.seeker),
    ]);

    const pickupLocation = {
      address: booking.resource.location?.address || providerUser?.location?.address || 'Provider Facility',
      city: booking.resource.location?.city || providerUser?.location?.city || 'Mumbai',
      pincode: providerUser?.location?.pincode,
      coordinates: booking.resource.location?.coordinates || providerUser?.location?.coordinates,
    };

    const deliveryLocation = {
      address: seekerUser?.location?.address || 'Seeker Facility',
      city: seekerUser?.location?.city || 'Mumbai',
      pincode: seekerUser?.location?.pincode,
      coordinates: seekerUser?.location?.coordinates,
    };

    const job = await LogisticsJob.create({
      booking: booking._id,
      seeker: booking.seeker,
      provider: booking.provider,
      resource: booking.resource._id,
      quantity: booking.requestedQuantity || 1,
      pickupLocation,
      deliveryLocation,
      scheduledPickupTime: scheduledPickupTime || booking.startDateTime,
      requiredDeliveryTime: requiredDeliveryTime || booking.startDateTime,
      returnRequired:
        returnRequired !== undefined
          ? returnRequired
          : booking.resource.category !== 'kitchen_capacity' && booking.resource.category !== 'staff',
      operationalNotes,
      status: 'unassigned',
      timeline: [
        {
          status: 'unassigned',
          timestamp: new Date(),
          updatedBy: req.user._id,
          notes: 'Logistics job created',
        },
      ],
    });

    res.status(201).json({ job: await job.populate(JOB_POPULATE) });
  })
);

/**
 * PATCH /api/logistics/jobs/:id/assign
 * Admin assigns or reassigns a logistics partner.
 */
router.patch(
  '/jobs/:id/assign',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { partnerId, notes } = req.body;
    if (!partnerId) throw new HttpError(400, 'partnerId is required.');

    const job = await LogisticsJob.findById(req.params.id);
    if (!job) throw new HttpError(404, 'Logistics job not found.');

    const partner = await User.findById(partnerId);
    if (!partner || partner.userType !== 'logistics_partner') {
      throw new HttpError(400, 'Selected user is not an active logistics partner.');
    }
    if (partner.suspended) {
      throw new HttpError(400, 'Logistics partner account is suspended.');
    }

    job.logisticsPartner = partner._id;
    job.status = 'assigned';
    job.declineReason = undefined;
    job.timeline.push({
      status: 'assigned',
      timestamp: new Date(),
      updatedBy: req.user._id,
      notes: notes || `Assigned to ${partner.businessName}`,
    });
    await job.save();

    await notify({
      user: partner._id,
      type: 'logistics_assignment',
      title: 'New Logistics Job Assigned',
      message: `You have been assigned transport for booking #${String(job.booking).slice(-6)}.`,
      relatedBooking: job.booking,
      relatedLogisticsJob: job._id,
    });

    res.json({ job: await job.populate(JOB_POPULATE) });
  })
);

/**
 * PATCH /api/logistics/jobs/:id/claim
 * Active logistics partner self-assigns an unassigned or declined job.
 */
router.patch(
  '/jobs/:id/claim',
  requireAuth,
  requireLogisticsPartner,
  asyncHandler(async (req, res) => {
    const job = await LogisticsJob.findById(req.params.id);
    if (!job) throw new HttpError(404, 'Logistics job not found.');

    if (job.status !== 'unassigned' && job.status !== 'declined') {
      throw new HttpError(400, `This job is not open for dispatch claiming (currently ${job.status}).`);
    }

    job.logisticsPartner = req.user._id;
    job.status = 'assigned';
    job.timeline.push({
      status: 'assigned',
      timestamp: new Date(),
      updatedBy: req.user._id,
      notes: `Claimed by ${req.user.businessName}`,
    });
    await job.save();

    await notify({
      user: req.user._id,
      type: 'logistics_assignment',
      title: 'Dispatch Job Claimed',
      message: `You have successfully claimed transport for booking #${String(job.booking).slice(-6)}.`,
      relatedBooking: job.booking,
      relatedLogisticsJob: job._id,
    });

    res.json({ job: await job.populate(JOB_POPULATE) });
  })
);

const SAMPLE_OPERATIONAL_NOTES = [
  'Fragile banquet setup gear. Handle with care.',
  'Express delivery. Destination contact ready at gate.',
  'Event concluded. Return inspection and inventory check required.',
  'Catering warmer boxes. Direct one-way transfer.',
  'Completed banquet furniture dispatch and return inspection.',
];

/**
 * POST /api/logistics/sample-jobs
 * Seeds interactive sample dispatch jobs for the active partner to explore the full lifecycle.
 * Strictly idempotent: replaces previous sample jobs rather than creating endless duplicates.
 */
router.post(
  '/sample-jobs',
  requireAuth,
  requireLogisticsPartner,
  asyncHandler(async (req, res) => {
    let resource = await Resource.findOne({ category: { $in: ['furniture', 'av_equipment', 'decor'] } });
    if (!resource) resource = await Resource.findOne();
    if (!resource) throw new HttpError(400, 'No resources available to create logistics jobs.');

    let seeker = await User.findOne({ _id: { $ne: req.user._id }, userType: 'business' });
    let provider = (await User.findOne({ _id: { $nin: [req.user._id, seeker?._id] }, userType: 'business' })) || seeker;
    if (!seeker || !provider) {
      throw new HttpError(400, 'Insufficient business users in system.');
    }

    // 0. Clean up any previous sample jobs for this partner (or unassigned sample jobs)
    // so loading sample jobs is strictly idempotent and never accumulates redundant duplicates.
    const sampleFilter = {
      $and: [
        {
          $or: [
            { isSample: true },
            { operationalNotes: { $in: SAMPLE_OPERATIONAL_NOTES } },
          ],
        },
        {
          $or: [{ logisticsPartner: req.user._id }, { status: 'unassigned' }],
        },
      ],
    };

    const existingSamples = await LogisticsJob.find(sampleFilter);
    if (existingSamples.length > 0) {
      const sampleBookingIds = existingSamples.map((j) => j.booking).filter(Boolean);
      await Promise.all([
        Booking.deleteMany({ _id: { $in: sampleBookingIds } }),
        LogisticsJob.deleteMany({ _id: { $in: existingSamples.map((j) => j._id) } }),
      ]);
    }

    const createdJobs = [];
    const now = Date.now();

    // 1. Pending Assignment Job
    const b1 = await Booking.create({
      resource: resource._id,
      provider: provider._id,
      seeker: seeker._id,
      quantity: 50,
      startDateTime: new Date(now + 24 * 3600000),
      endDateTime: new Date(now + 48 * 3600000),
      status: 'confirmed',
      agreedPrice: 7500,
      paymentStatus: 'paid',
      isSample: true,
    });
    const job1 = await LogisticsJob.create({
      booking: b1._id,
      seeker: seeker._id,
      provider: provider._id,
      logisticsPartner: req.user._id,
      resource: resource._id,
      quantity: 50,
      pickupLocation: provider.location || { address: 'Grand Orchid Loading Bay, Powai', city: 'Mumbai' },
      deliveryLocation: seeker.location || { address: 'Seasons Terrace, Thane West', city: 'Thane' },
      scheduledPickupTime: new Date(now + 22 * 3600000),
      requiredDeliveryTime: new Date(now + 24 * 3600000),
      returnRequired: true,
      operationalNotes: 'Fragile banquet setup gear. Handle with care.',
      status: 'assigned',
      isSample: true,
      timeline: [
        { status: 'unassigned', timestamp: new Date(now - 3600000), notes: 'Job initialized' },
        { status: 'assigned', timestamp: new Date(), notes: `Assigned to ${req.user.businessName}` },
      ],
    });
    createdJobs.push(job1);

    // 2. Active Delivery Job (In Transit)
    const b2 = await Booking.create({
      resource: resource._id,
      provider: provider._id,
      seeker: seeker._id,
      quantity: 20,
      startDateTime: new Date(now + 4 * 3600000),
      endDateTime: new Date(now + 20 * 3600000),
      status: 'confirmed',
      agreedPrice: 3200,
      paymentStatus: 'paid',
      fulfillment: { status: 'out_for_delivery', outForDeliveryAt: new Date() },
      isSample: true,
    });
    const job2 = await LogisticsJob.create({
      booking: b2._id,
      seeker: seeker._id,
      provider: provider._id,
      logisticsPartner: req.user._id,
      resource: resource._id,
      quantity: 20,
      pickupLocation: provider.location || { address: 'Warehouse Hub 3, Mulund', city: 'Mumbai' },
      deliveryLocation: seeker.location || { address: 'Kalpataru Banquet, Vashi', city: 'Navi Mumbai' },
      scheduledPickupTime: new Date(now - 2 * 3600000),
      requiredDeliveryTime: new Date(now + 2 * 3600000),
      returnRequired: true,
      operationalNotes: 'Express delivery. Destination contact ready at gate.',
      status: 'in_transit',
      isSample: true,
      timeline: [
        { status: 'assigned', timestamp: new Date(now - 4 * 3600000), notes: 'Assigned' },
        { status: 'accepted', timestamp: new Date(now - 3 * 3600000), notes: 'Accepted' },
        { status: 'picked_up', timestamp: new Date(now - 2 * 3600000), notes: 'Picked up' },
        { status: 'in_transit', timestamp: new Date(now - 3600000), notes: 'In transit to seeker' },
      ],
    });
    createdJobs.push(job2);

    // 3. Return in progress job
    const b3 = await Booking.create({
      resource: resource._id,
      provider: provider._id,
      seeker: seeker._id,
      quantity: 35,
      startDateTime: new Date(now - 24 * 3600000),
      endDateTime: new Date(now - 2 * 3600000),
      status: 'confirmed',
      agreedPrice: 5000,
      paymentStatus: 'paid',
      fulfillment: { status: 'delivered', deliveredAt: new Date(now - 24 * 3600000) },
      return: { status: 'return_requested', returnRequestedAt: new Date(now - 2 * 3600000) },
      isSample: true,
    });
    const job3 = await LogisticsJob.create({
      booking: b3._id,
      seeker: seeker._id,
      provider: provider._id,
      logisticsPartner: req.user._id,
      resource: resource._id,
      quantity: 35,
      pickupLocation: seeker.location || { address: 'Kalpataru Banquet, Vashi', city: 'Navi Mumbai' },
      deliveryLocation: provider.location || { address: 'Grand Orchid Loading Bay, Powai', city: 'Mumbai' },
      scheduledPickupTime: new Date(now + 2 * 3600000),
      requiredDeliveryTime: new Date(now + 6 * 3600000),
      returnRequired: true,
      operationalNotes: 'Event concluded. Return inspection and inventory check required.',
      status: 'return_requested',
      isSample: true,
      timeline: [
        { status: 'delivered', timestamp: new Date(now - 24 * 3600000), notes: 'Forward delivery completed' },
        { status: 'return_requested', timestamp: new Date(now - 2 * 3600000), notes: 'Return transport requested' },
      ],
    });
    createdJobs.push(job3);

    // 4. Open Unassigned Job (to test Claiming)
    const b4 = await Booking.create({
      resource: resource._id,
      provider: provider._id,
      seeker: seeker._id,
      quantity: 10,
      startDateTime: new Date(now + 36 * 3600000),
      endDateTime: new Date(now + 72 * 3600000),
      status: 'confirmed',
      agreedPrice: 2000,
      paymentStatus: 'paid',
      isSample: true,
    });
    const job4 = await LogisticsJob.create({
      booking: b4._id,
      seeker: seeker._id,
      provider: provider._id,
      resource: resource._id,
      quantity: 10,
      pickupLocation: provider.location || { address: 'Silverline Caterers Depot, Thane', city: 'Thane' },
      deliveryLocation: seeker.location || { address: 'Coastal Kitchens, Powai', city: 'Mumbai' },
      scheduledPickupTime: new Date(now + 30 * 3600000),
      requiredDeliveryTime: new Date(now + 36 * 3600000),
      returnRequired: false,
      operationalNotes: 'Catering warmer boxes. Direct one-way transfer.',
      status: 'unassigned',
      isSample: true,
      timeline: [
        { status: 'unassigned', timestamp: new Date(), notes: 'Broadcasted to logistics network' },
      ],
    });
    createdJobs.push(job4);

    // 5. Completed Job (to test Completed History tab)
    const b5 = await Booking.create({
      resource: resource._id,
      provider: provider._id,
      seeker: seeker._id,
      quantity: 40,
      startDateTime: new Date(now - 72 * 3600000),
      endDateTime: new Date(now - 48 * 3600000),
      status: 'completed',
      agreedPrice: 6000,
      paymentStatus: 'paid',
      fulfillment: { status: 'delivered', deliveredAt: new Date(now - 70 * 3600000) },
      return: { status: 'return_completed', returnCompletedAt: new Date(now - 48 * 3600000) },
      isSample: true,
    });
    const job5 = await LogisticsJob.create({
      booking: b5._id,
      seeker: seeker._id,
      provider: provider._id,
      logisticsPartner: req.user._id,
      resource: resource._id,
      quantity: 40,
      pickupLocation: provider.location || { address: 'Grand Orchid Loading Bay, Powai', city: 'Mumbai' },
      deliveryLocation: seeker.location || { address: 'Seasons Terrace, Thane West', city: 'Thane' },
      scheduledPickupTime: new Date(now - 72 * 3600000),
      requiredDeliveryTime: new Date(now - 70 * 3600000),
      returnRequired: true,
      operationalNotes: 'Completed banquet furniture dispatch and return inspection.',
      status: 'completed',
      isSample: true,
      timeline: [
        { status: 'assigned', timestamp: new Date(now - 73 * 3600000), notes: `Assigned to ${req.user.businessName}` },
        { status: 'accepted', timestamp: new Date(now - 72.5 * 3600000), notes: 'Partner accepted assignment' },
        { status: 'picked_up', timestamp: new Date(now - 72 * 3600000), notes: 'Loaded at origin' },
        { status: 'delivered', timestamp: new Date(now - 70 * 3600000), notes: 'Delivered to venue' },
        { status: 'return_picked_up', timestamp: new Date(now - 49 * 3600000), notes: 'Return pickup completed' },
        { status: 'returned_to_provider', timestamp: new Date(now - 48.5 * 3600000), notes: 'Returned to provider dock' },
        { status: 'completed', timestamp: new Date(now - 48 * 3600000), notes: 'Return inspection passed, job closed' },
      ],
    });
    createdJobs.push(job5);

    // Recalculate partner's completedJobs accurately from real database count (never arbitrary $inc)
    const completedCount = await LogisticsJob.countDocuments({
      logisticsPartner: req.user._id,
      status: 'completed',
    });
    await User.findByIdAndUpdate(req.user._id, {
      'logisticsProfile.completedJobs': completedCount,
    });

    res.status(201).json({ count: createdJobs.length, message: 'Sample jobs loaded successfully' });
  })
);

/**
 * DELETE /api/logistics/sample-jobs
 * Clears all sample dispatch jobs for the active partner, leaving only real orders.
 */
router.delete(
  '/sample-jobs',
  requireAuth,
  requireLogisticsPartner,
  asyncHandler(async (req, res) => {
    const sampleFilter = {
      $and: [
        {
          $or: [
            { isSample: true },
            { operationalNotes: { $in: SAMPLE_OPERATIONAL_NOTES } },
          ],
        },
        {
          $or: [{ logisticsPartner: req.user._id }, { status: 'unassigned' }],
        },
      ],
    };

    const existingSamples = await LogisticsJob.find(sampleFilter);
    if (existingSamples.length > 0) {
      const sampleBookingIds = existingSamples.map((j) => j.booking).filter(Boolean);
      await Promise.all([
        Booking.deleteMany({ _id: { $in: sampleBookingIds } }),
        LogisticsJob.deleteMany({ _id: { $in: existingSamples.map((j) => j._id) } }),
      ]);
    }

    const completedCount = await LogisticsJob.countDocuments({
      logisticsPartner: req.user._id,
      status: 'completed',
    });
    await User.findByIdAndUpdate(req.user._id, {
      'logisticsProfile.completedJobs': completedCount,
    });

    res.json({ message: 'Sample jobs cleared successfully', count: existingSamples.length });
  })
);

/**
 * PATCH /api/logistics/jobs/:id/accept
 * Assigned partner accepts the job assignment.
 */
router.patch(
  '/jobs/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await LogisticsJob.findById(req.params.id);
    if (!job) throw new HttpError(404, 'Logistics job not found.');

    if (req.user.userType !== 'logistics_partner') {
      throw new HttpError(403, 'Access reserved for logistics partners.');
    }

    if (String(job.logisticsPartner) !== String(req.user._id)) {
      throw new HttpError(403, 'You are not the assigned partner for this job.');
    }

    if (job.status !== 'assigned') {
      throw new HttpError(400, `Cannot accept job in "${job.status}" status.`);
    }

    job.status = 'accepted';
    job.timeline.push({
      status: 'accepted',
      timestamp: new Date(),
      updatedBy: req.user._id,
      notes: 'Partner accepted assignment',
    });
    await job.save();

    await Promise.all([
      notify({
        user: job.seeker,
        type: 'logistics_update',
        title: 'Logistics Partner Confirmed',
        message: `${req.user.businessName} has accepted your transport assignment.`,
        relatedBooking: job.booking,
        relatedLogisticsJob: job._id,
      }),
      notify({
        user: job.provider,
        type: 'logistics_update',
        title: 'Logistics Partner Confirmed',
        message: `${req.user.businessName} has accepted the transport assignment.`,
        relatedBooking: job.booking,
        relatedLogisticsJob: job._id,
      }),
    ]);

    res.json({ job: await job.populate(JOB_POPULATE) });
  })
);

/**
 * PATCH /api/logistics/jobs/:id/decline
 * Assigned partner declines the job, returning it to an assignable state.
 */
router.patch(
  '/jobs/:id/decline',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const job = await LogisticsJob.findById(req.params.id);
    if (!job) throw new HttpError(404, 'Logistics job not found.');

    if (String(job.logisticsPartner) !== String(req.user._id)) {
      throw new HttpError(403, 'You are not the assigned partner for this job.');
    }

    if (job.status !== 'assigned') {
      throw new HttpError(400, `Cannot decline job in "${job.status}" status.`);
    }

    job.status = 'declined';
    job.declineReason = reason || 'Partner unavailable';
    job.logisticsPartner = null;
    job.timeline.push({
      status: 'declined',
      timestamp: new Date(),
      updatedBy: req.user._id,
      notes: reason || 'Partner declined assignment',
    });
    await job.save();

    await notify({
      user: job.provider,
      type: 'logistics_update',
      title: 'Logistics Partner Declined',
      message: `Assigned partner declined transport: ${reason || 'Unavailable'}. Reassignment needed.`,
      relatedBooking: job.booking,
      relatedLogisticsJob: job._id,
    });

    res.json({ job: await job.populate(JOB_POPULATE) });
  })
);

/**
 * PATCH /api/logistics/jobs/:id/status
 * Partner or Admin advances the state machine.
 */
router.patch(
  '/jobs/:id/status',
  requireAuth,
  validate(updateLogisticsStatusSchema),
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body;
    if (!status) throw new HttpError(400, 'status is required.');

    const job = await LogisticsJob.findById(req.params.id);
    if (!job) throw new HttpError(404, 'Logistics job not found.');

    const isAssigned = String(job.logisticsPartner) === String(req.user._id);
    const isAdmin = isPlatformAdmin(req.user);

    if (!isAssigned && !isAdmin) {
      throw new HttpError(403, 'Only the assigned logistics partner or an admin can update job status.');
    }

    const allowedNext = LOGISTICS_STATUS_TRANSITIONS[job.status] || [];
    if (!allowedNext.includes(status)) {
      throw new HttpError(400, `Invalid status transition from "${job.status}" to "${status}".`);
    }

    job.status = status;
    job.timeline.push({
      status,
      timestamp: new Date(),
      updatedBy: req.user._id,
      notes: notes || `Status updated to ${status}`,
    });
    await job.save();

    // ── Synchronize with Booking fulfillment / return models ──
    const booking = await Booking.findById(job.booking);
    if (booking) {
      if (!booking.fulfillment) booking.fulfillment = {};
      if (!booking.return) booking.return = {};

      if (status === 'arrived_at_provider') {
        booking.fulfillment.status = 'loading';
        booking.fulfillment.loadingAt = new Date();
      } else if (['picked_up', 'in_transit'].includes(status)) {
        booking.fulfillment.status = 'out_for_delivery';
        booking.fulfillment.outForDeliveryAt = new Date();
      } else if (status === 'delivered') {
        booking.fulfillment.status = 'delivered';
        booking.fulfillment.deliveredAt = new Date();
      } else if (status === 'return_requested') {
        booking.return.status = 'return_requested';
        booking.return.returnRequestedAt = new Date();
      } else if (status === 'return_pickup_scheduled') {
        booking.return.status = 'return_pickup_scheduled';
        booking.return.returnPickupScheduledAt = new Date();
      } else if (['return_picked_up', 'return_in_transit'].includes(status)) {
        booking.return.status = 'return_in_transit';
        booking.return.returnInTransitAt = new Date();
      } else if (status === 'returned_to_provider') {
        booking.return.status = 'returned_to_provider';
        booking.return.returnedAt = new Date();
      } else if (status === 'completed') {
        booking.return.status = 'return_completed';
        booking.return.returnCompletedAt = new Date();
        booking.status = 'completed';
      }

      if (notes) {
        if (status.startsWith('return_') || status === 'returned_to_provider' || status === 'completed') {
          booking.return.notes = notes;
        } else {
          booking.fulfillment.notes = notes;
        }
      }
      booking.markModified('fulfillment');
      booking.markModified('return');
      await booking.save();
    }

    // Recalculate completed jobs accurately on final completion
    if (status === 'completed' && job.logisticsPartner) {
      const completedCount = await LogisticsJob.countDocuments({
        logisticsPartner: job.logisticsPartner,
        status: 'completed',
      });
      await User.findByIdAndUpdate(job.logisticsPartner, {
        'logisticsProfile.completedJobs': completedCount,
      });
    }

    // Milestone notifications
    const milestoneTitles = {
      picked_up: 'Goods Picked Up',
      in_transit: 'Goods In Transit',
      delivered: 'Goods Delivered',
      return_picked_up: 'Return Picked Up',
      returned_to_provider: 'Returned to Provider',
      completed: 'Logistics Job Completed',
    };
    if (milestoneTitles[status]) {
      const msg = `Delivery status for #${String(job.booking).slice(-6)} is now ${status.replace(/_/g, ' ')}.`;
      await Promise.all([
        notify({
          user: job.seeker,
          type: 'logistics_update',
          title: milestoneTitles[status],
          message: msg,
          relatedBooking: job.booking,
          relatedLogisticsJob: job._id,
        }),
        notify({
          user: job.provider,
          type: 'logistics_update',
          title: milestoneTitles[status],
          message: msg,
          relatedBooking: job.booking,
          relatedLogisticsJob: job._id,
        }),
      ]);
    }

    res.json({ job: await job.populate(JOB_POPULATE) });
  })
);

/**
 * GET /api/logistics/partners
 * Admin lists all registered logistics partners for assignment.
 */
router.get(
  '/partners',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const partners = await User.find({ userType: 'logistics_partner', suspended: false })
      .select('businessName email phone location logisticsProfile')
      .lean();
    res.json({ partners });
  })
);

/**
 * PATCH /api/logistics/partner-profile
 * Partner updates operating status and fleet details.
 */
router.patch(
  '/partner-profile',
  requireAuth,
  requireLogisticsPartner,
  asyncHandler(async (req, res) => {
    const { operatingStatus, vehicleInfo, serviceArea, capacityDescription } = req.body;
    const update = {};
    if (operatingStatus) {
      update['logisticsProfile.operatingStatus'] = operatingStatus === 'available' ? 'active' : operatingStatus;
    }
    if (vehicleInfo !== undefined) update['logisticsProfile.vehicleInfo'] = vehicleInfo;
    if (serviceArea !== undefined) update['logisticsProfile.serviceArea'] = serviceArea;
    if (capacityDescription !== undefined) update['logisticsProfile.capacityDescription'] = capacityDescription;

    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
    res.json({ user: sessionUser(user) });
  })
);

export default router;
