import { Router } from 'express';
import Requirement from '../models/Requirement.js';
import Proposal from '../models/Proposal.js';
import Resource from '../models/Resource.js';
import Booking from '../models/Booking.js';
import Transaction from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validateBookingRequest, getAvailableQuantity } from '../services/availability.service.js';
import { scoreSingleResource } from '../services/matching.service.js';
import { notify } from '../services/notification.service.js';

const router = Router();

const USER_POPULATE = 'businessName businessType location ratingAvg ratingCount phone';

/**
 * POST /api/requirements
 * Seeker broadcasts a new requirement (RFQ).
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      title,
      category,
      description,
      requiredQuantity = 1,
      unit = 'unit',
      minCapacity,
      maxBudget,
      startDateTime,
      endDateTime,
      radiusKm = 25,
      urgency = 'medium',
      location,
    } = req.body;

    if (!title || !category || !startDateTime || !endDateTime) {
      throw new HttpError(400, 'Title, category, and date range are required.');
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
      throw new HttpError(400, 'End time must be after start time.');
    }

    if (Number(requiredQuantity) < 1) {
      throw new HttpError(400, 'Required quantity must be at least 1.');
    }

    // Resolve coordinates from body or user profile
    const coords = location?.coordinates?.length
      ? location.coordinates
      : req.user.location?.coordinates;

    if (!coords || coords.length !== 2) {
      throw new HttpError(400, 'Set your business location before posting a requirement.');
    }

    const requirement = await Requirement.create({
      seeker: req.user._id,
      title: title.trim(),
      category,
      description: description?.trim(),
      requiredQuantity: Number(requiredQuantity),
      unit,
      minCapacity: minCapacity ? Number(minCapacity) : undefined,
      maxBudget: maxBudget ? Number(maxBudget) : undefined,
      startDateTime: start,
      endDateTime: end,
      location: {
        address: location?.address || req.user.location?.address,
        city: location?.city || req.user.location?.city,
        coordinates: coords,
        radiusKm: Number(radiusKm) || 25,
      },
      urgency,
      status: 'open',
    });

    // Asynchronously identify matching providers nearby and notify them
    try {
      const candidates = await Resource.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: coords },
            distanceField: 'distanceMeters',
            maxDistance: (Number(radiusKm) || 25) * 1000,
            query: {
              category,
              status: 'active',
              owner: { $ne: req.user._id },
            },
            spherical: true,
          },
        },
        { $limit: 20 },
      ]);

      const notifiedProviders = new Set();
      for (const c of candidates) {
        const ownerId = String(c.owner);
        if (!notifiedProviders.has(ownerId)) {
          notifiedProviders.add(ownerId);
          await notify({
            user: c.owner,
            type: 'rfq_match',
            title: 'New RFQ in your area',
            message: `${req.user.businessName} posted an RFQ: ${requirement.requiredQuantity} × ${requirement.title}`,
            relatedRequirement: requirement._id,
          });
          if (notifiedProviders.size >= 10) break;
        }
      }
    } catch {
      /* geo broadcast is best-effort and must not fail RFQ creation */
    }

    res.status(201).json({ requirement });
  })
);

/**
 * GET /api/requirements/mine
 * List RFQs published by the authenticated seeker.
 */
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = { seeker: req.user._id };
    if (req.query.status) {
      filter.status = { $in: String(req.query.status).split(',') };
    }

    const requirements = await Requirement.find(filter)
      .populate('acceptedProposal')
      .populate('resultingBooking')
      .sort('-createdAt')
      .lean();

    res.json({ requirements });
  })
);

/**
 * GET /api/requirements/feed
 * Supplier feed of open requirements near the calling provider.
 */
router.get(
  '/feed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { category, radiusKm = 50, urgency } = req.query;
    const radius = Number(radiusKm) || 50;

    const match = {
      status: 'open',
      seeker: { $ne: req.user._id },
    };

    if (category && category !== 'all') match.category = category;
    if (urgency && urgency !== 'all') match.urgency = urgency;

    const coords = req.user.location?.coordinates;
    let requirements;

    if (coords && coords.length === 2) {
      requirements = await Requirement.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: coords },
            distanceField: 'distanceMeters',
            maxDistance: radius * 1000,
            query: match,
            spherical: true,
          },
        },
        { $limit: 50 },
        {
          $lookup: {
            from: 'users',
            localField: 'seeker',
            foreignField: '_id',
            as: 'seekerDoc',
          },
        },
        { $unwind: '$seekerDoc' },
        { $addFields: { distanceKm: { $divide: ['$distanceMeters', 1000] } } },
        { $project: { 'seekerDoc.passwordHash': 0 } },
      ]);
    } else {
      requirements = await Requirement.find(match)
        .populate('seeker', USER_POPULATE)
        .limit(50)
        .sort('-createdAt')
        .lean();
      requirements = requirements.map((r) => ({
        ...r,
        seekerDoc: r.seeker,
        distanceKm: null,
      }));
    }

    // Enrich with provider's existing proposal if any
    const reqIds = requirements.map((r) => r._id);
    const existingProposals = await Proposal.find({
      requirement: { $in: reqIds },
      provider: req.user._id,
    })
      .populate('resource', 'title')
      .lean();

    const proposalMap = new Map(existingProposals.map((p) => [String(p.requirement), p]));

    const feed = requirements.map((r) => ({
      ...r,
      seeker: r.seekerDoc || r.seeker,
      seekerDoc: undefined,
      myProposal: proposalMap.get(String(r._id)) || null,
      hasProposed: proposalMap.has(String(r._id)),
    }));

    res.json({ requirements: feed, total: feed.length });
  })
);

/**
 * GET /api/requirements/:id
 * Detailed requirement view with proposal security masking.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirement = await Requirement.findById(req.params.id)
      .populate('seeker', USER_POPULATE)
      .populate('acceptedProposal')
      .populate('resultingBooking')
      .lean();

    if (!requirement) throw new HttpError(404, 'Requirement not found.');

    const isSeeker = String(requirement.seeker._id) === String(req.user._id);

    let proposals = [];
    if (isSeeker) {
      // Seeker sees all proposals submitted to their RFQ
      proposals = await Proposal.find({ requirement: requirement._id })
        .populate('provider', USER_POPULATE)
        .populate('resource', 'title images pricing capacity totalQuantity location unit')
        .sort('-createdAt')
        .lean();
    } else {
      // Competing providers only see their own submitted quote
      const myProposal = await Proposal.findOne({
        requirement: requirement._id,
        provider: req.user._id,
      })
        .populate('provider', USER_POPULATE)
        .populate('resource', 'title images pricing capacity totalQuantity location unit')
        .lean();
      if (myProposal) proposals = [myProposal];
    }

    res.json({ requirement, proposals });
  })
);

/**
 * POST /api/requirements/:id/proposals
 * Provider submits a quotation/proposal referencing an owned resource.
 */
router.post(
  '/:id/proposals',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) throw new HttpError(404, 'Requirement not found.');

    if (requirement.status !== 'open') {
      throw new HttpError(400, `This requirement is ${requirement.status} and no longer accepts proposals.`);
    }

    if (String(requirement.seeker) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot submit a proposal to your own requirement.');
    }

    const { resourceId, quotedPrice, proposedStart, proposedEnd, notes } = req.body;

    if (!resourceId || quotedPrice == null || Number(quotedPrice) <= 0) {
      throw new HttpError(400, 'A valid resource and quoted price are required.');
    }

    const resource = await Resource.findById(resourceId);
    if (!resource || resource.status !== 'active') {
      throw new HttpError(404, 'Selected resource is not available.');
    }

    if (String(resource.owner) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only propose your own listed resources.');
    }

    if (resource.category !== requirement.category) {
      throw new HttpError(400, `Resource category (${resource.category}) does not match requirement category (${requirement.category}).`);
    }

    const existing = await Proposal.findOne({ requirement: requirement._id, provider: req.user._id });
    if (existing && existing.status === 'submitted') {
      throw new HttpError(409, 'You have already submitted a proposal for this requirement.');
    }

    const start = proposedStart ? new Date(proposedStart) : requirement.startDateTime;
    const end = proposedEnd ? new Date(proposedEnd) : requirement.endDateTime;

    // Check that provider's resource currently has inventory for the dates
    const check = await validateBookingRequest({
      resource,
      quantity: requirement.requiredQuantity,
      start,
      end,
    });

    if (!check.ok) {
      throw new HttpError(409, `Your resource cannot cover this request: ${check.reason}`);
    }

    const proposal = await Proposal.create({
      requirement: requirement._id,
      provider: req.user._id,
      resource: resource._id,
      quotedPrice: Number(quotedPrice),
      proposedStart: start,
      proposedEnd: end,
      notes: notes?.trim(),
      status: 'submitted',
    });

    requirement.proposalCount = (requirement.proposalCount || 0) + 1;
    await requirement.save();

    await notify({
      user: requirement.seeker,
      type: 'rfq_proposal_received',
      title: 'New proposal received',
      message: `${req.user.businessName} submitted a quote of ₹${quotedPrice} for "${requirement.title}"`,
      relatedRequirement: requirement._id,
    });

    res.status(201).json({
      proposal: await proposal.populate([
        { path: 'provider', select: USER_POPULATE },
        { path: 'resource', select: 'title pricing images capacity unit' },
      ]),
    });
  })
);

/**
 * PATCH /api/requirements/:id/proposals/:proposalId
 * Provider updates or withdraws their submitted proposal.
 */
router.patch(
  '/:id/proposals/:proposalId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const proposal = await Proposal.findById(req.params.proposalId);
    if (!proposal || String(proposal.requirement) !== String(req.params.id)) {
      throw new HttpError(404, 'Proposal not found.');
    }

    if (String(proposal.provider) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only edit your own proposals.');
    }

    if (proposal.status !== 'submitted') {
      throw new HttpError(400, `Proposal is already ${proposal.status}.`);
    }

    const { quotedPrice, notes, status } = req.body;
    if (quotedPrice != null && Number(quotedPrice) > 0) proposal.quotedPrice = Number(quotedPrice);
    if (notes !== undefined) proposal.notes = notes.trim();
    if (status === 'withdrawn') proposal.status = 'withdrawn';

    await proposal.save();
    res.json({ proposal });
  })
);

/**
 * POST /api/requirements/:id/proposals/:proposalId/accept
 * Seeker accepts winning proposal -> converts atomically into confirmed Booking.
 */
router.post(
  '/:id/proposals/:proposalId/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) throw new HttpError(404, 'Requirement not found.');

    if (String(requirement.seeker) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the requirement owner can accept a proposal.');
    }

    if (requirement.status !== 'open') {
      throw new HttpError(400, `This requirement is ${requirement.status} and cannot be awarded.`);
    }

    const proposal = await Proposal.findById(req.params.proposalId).populate('resource');
    if (!proposal || String(proposal.requirement) !== String(requirement._id)) {
      throw new HttpError(404, 'Proposal not found.');
    }

    if (proposal.status !== 'submitted') {
      throw new HttpError(400, `This proposal is already ${proposal.status}.`);
    }

    const start = proposal.proposedStart || requirement.startDateTime;
    const end = proposal.proposedEnd || requirement.endDateTime;

    // Synchronous sweep-line inventory validation at commit time
    const check = await validateBookingRequest({
      resource: proposal.resource,
      quantity: requirement.requiredQuantity,
      start,
      end,
    });

    if (!check.ok) {
      throw new HttpError(409, `The provider's resource is no longer available: ${check.reason}`);
    }

    // Score single resource for breakdown audit snapshot
    const scored = await scoreSingleResource(
      proposal.resource.toObject(),
      {
        start,
        end,
        quantity: requirement.requiredQuantity,
        capacity: requirement.minCapacity || proposal.resource.capacity,
        urgency: requirement.urgency,
      },
      req.user
    );

    // 1. Create standard confirmed Booking
    const booking = await Booking.create({
      resource: proposal.resource._id,
      provider: proposal.provider,
      seeker: req.user._id,
      requestedQuantity: requirement.requiredQuantity,
      startDateTime: start,
      endDateTime: end,
      status: 'confirmed',
      quotedPrice: proposal.quotedPrice,
      agreedPrice: proposal.quotedPrice,
      urgency: requirement.urgency,
      logistics: 'self_pickup',
      notes: `Awarded from RFQ: "${requirement.title}". ${proposal.notes || ''}`.trim(),
      matchScore: scored?.matchScore,
      matchBreakdown: scored?.matchBreakdown,
    });

    // 2. Create simulated paid Transaction
    await Transaction.create({
      booking: booking._id,
      payer: req.user._id,
      payee: proposal.provider,
      amount: proposal.quotedPrice,
      status: 'simulated_paid',
      paidAt: new Date(),
    });

    // 3. Update Winning Proposal status
    proposal.status = 'accepted';
    await proposal.save();

    // 4. Reject all competing proposals
    const competing = await Proposal.find({
      requirement: requirement._id,
      _id: { $ne: proposal._id },
      status: 'submitted',
    });

    await Proposal.updateMany(
      { requirement: requirement._id, _id: { $ne: proposal._id }, status: 'submitted' },
      { status: 'rejected' }
    );

    // 5. Transition Requirement to fulfilled
    requirement.status = 'fulfilled';
    requirement.acceptedProposal = proposal._id;
    requirement.resultingBooking = booking._id;
    await requirement.save();

    // 6. Notify Winning Provider
    await notify({
      user: proposal.provider,
      type: 'rfq_proposal_accepted',
      title: 'Proposal accepted!',
      message: `${req.user.businessName} accepted your quote of ₹${proposal.quotedPrice} for "${requirement.title}". Booking is confirmed.`,
      relatedBooking: booking._id,
      relatedRequirement: requirement._id,
    });

    // 7. Notify Competing Providers
    for (const comp of competing) {
      await notify({
        user: comp.provider,
        type: 'rfq_proposal_closed',
        title: 'Requirement closed',
        message: `The requirement "${requirement.title}" has been awarded to another provider.`,
        relatedRequirement: requirement._id,
      });
    }

    res.status(201).json({
      booking,
      requirement,
      proposal,
    });
  })
);

export default router;
