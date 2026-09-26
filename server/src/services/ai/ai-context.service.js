/**
 * ai-context.service.js
 *
 * Builds the "grounded context" payload that is injected into every Gemini
 * prompt.  All data access is authorization-aware: only data the current user
 * is permitted to see is included.
 *
 * Rule: structured, live marketplace facts (availability, price, quantities,
 * booking state) are fetched directly from MongoDB here — NOT from a vector
 * store — so Gemini can never hallucinate them.
 */

import User from '../../models/User.js';
import Resource from '../../models/Resource.js';
import Requirement from '../../models/Requirement.js';
import Booking from '../../models/Booking.js';
import Proposal from '../../models/Proposal.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function safe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pickUser(u) {
  if (!u) return null;
  return {
    id: u._id,
    businessName: u.businessName,
    businessType: u.businessType,
    location: u.location,
    ratingAvg: u.ratingAvg,
    ratingCount: u.ratingCount,
  };
}

function pickResource(r) {
  if (!r) return null;
  return {
    id: r._id,
    title: r.title,
    category: r.category,
    description: r.description,
    totalQuantity: r.totalQuantity,
    unit: r.unit,
    capacity: r.capacity,
    basePrice: r.pricing?.basePrice,
    priceUnit: r.pricing?.priceUnit,
    location: r.location,
    status: r.status,
    ratingAvg: r.ratingAvg,
    ratingCount: r.ratingCount,
    tags: r.tags,
  };
}

function pickRequirement(req) {
  if (!req) return null;
  return {
    id: req._id,
    title: req.title,
    category: req.category,
    requiredQuantity: req.requiredQuantity,
    startDateTime: req.startDateTime,
    endDateTime: req.endDateTime,
    location: req.location,
    maxBudget: req.maxBudget,
    urgency: req.urgency,
    status: req.status,
    proposalCount: req.proposalCount,
    createdAt: req.createdAt,
  };
}

function pickBooking(b) {
  if (!b) return null;
  return {
    id: b._id,
    status: b.status,
    startDateTime: b.startDateTime,
    endDateTime: b.endDateTime,
    requestedQuantity: b.requestedQuantity,
    agreedPrice: b.agreedPrice,
    quotedPrice: b.quotedPrice,
    logistics: b.logistics,
    urgency: b.urgency,
    fulfillmentStatus: b.fulfillment?.status,
    createdAt: b.createdAt,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Build a rich, auth-scoped context object for the current user.
 * Only data visible to this user is included.
 *
 * @param {object} user  – Mongoose User document from req.user
 * @param {object} opts  – Optional hints to load extra targeted context
 *   opts.requirementId   – load a specific requirement + its proposals
 *   opts.bookingId       – load a specific booking with resource detail
 *   opts.resourceId      – load a specific resource
 *   opts.query           – natural-language query (used for semantic context)
 */
export async function buildUserContext(user, opts = {}) {
  const userId = user._id;

  // ── My open requirements ────────────────────────────────────────────────
  const myRequirements = await Requirement.find({
    seeker: userId,
    status: { $in: ['open', 'fulfilled'] },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  // ── My recent bookings (both as seeker and provider) ───────────────────
  const myBookings = await Booking.find({
    $or: [{ seeker: userId }, { provider: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(15)
    .populate('resource', 'title category pricing location')
    .populate('seeker', 'businessName')
    .populate('provider', 'businessName')
    .lean();

  // ── My listings (as provider) ─────────────────────────────────────────
  const myListings = await Resource.find({ owner: userId, status: { $ne: 'archived' } })
    .sort('-createdAt')
    .lean();

  // ── My business profile ───────────────────────────────────────────────
  const profile = await User.findById(userId).lean();

  // ── Targeted context (optional) ───────────────────────────────────────
  let focusRequirement = null;
  let focusBooking = null;
  let focusResource = null;
  let focusProposals = [];

  if (opts.requirementId) {
    const req = await Requirement.findOne({
      _id: opts.requirementId,
      seeker: userId, // MUST be owned by this user
    })
      .populate('offers.provider', 'businessName ratingAvg')
      .lean();
    if (req) {
      focusRequirement = req;
      // Load associated proposals (providers can only see their own)
      focusProposals = await Proposal.find({ requirement: req._id })
        .populate('provider', 'businessName ratingAvg location')
        .populate('resource', 'title category pricing')
        .lean();
    }
  }

  if (opts.bookingId) {
    const booking = await Booking.findOne({
      _id: opts.bookingId,
      $or: [{ seeker: userId }, { provider: userId }],
    })
      .populate('resource')
      .populate('seeker', 'businessName location')
      .populate('provider', 'businessName location ratingAvg')
      .lean();
    focusBooking = booking;
  }

  if (opts.resourceId) {
    focusResource = await Resource.findById(opts.resourceId).lean();
  }

  return {
    user: {
      id: userId,
      businessName: profile?.businessName,
      businessType: profile?.businessType,
      location: profile?.location,
      userType: profile?.userType,
    },
    myOpenRequirements: myRequirements.map(pickRequirement),
    myRecentBookings: myBookings.map((b) => ({
      ...pickBooking(b),
      resourceTitle: b.resource?.title,
      resourceCategory: b.resource?.category,
      seekerName: b.seeker?.businessName,
      providerName: b.provider?.businessName,
      isAsSeeker: String(b.seeker?._id || b.seeker) === String(userId),
    })),
    myListings: myListings.map(pickResource),
    myActiveListings: myListings.map(pickResource),
    // targeted context
    focusRequirement: focusRequirement ? safe(focusRequirement) : null,
    focusBooking: focusBooking ? safe(focusBooking) : null,
    focusResource: focusResource ? pickResource(focusResource) : null,
    focusProposals: focusProposals.map((p) => ({
      id: p._id,
      providerName: p.provider?.businessName,
      providerRating: p.provider?.ratingAvg,
      resourceTitle: p.resource?.title,
      quotedPrice: p.quotedPrice,
      notes: p.notes,
      status: p.status,
    })),
  };
}

/**
 * Lightweight context for the requirement-parsing endpoint —
 * just enough to help Gemini understand the user's location & preferences.
 */
export async function buildParseContext(user) {
  const profile = await User.findById(user._id).lean();
  return {
    businessName: profile?.businessName,
    businessType: profile?.businessType,
    userLocation: profile?.location,
    currentDateTime: new Date().toISOString(),
  };
}
