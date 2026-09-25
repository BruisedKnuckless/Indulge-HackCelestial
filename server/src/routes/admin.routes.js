import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Resource, { RESOURCE_CATEGORIES } from '../models/Resource.js';
import Booking, { BOOKING_STATUSES } from '../models/Booking.js';
import Transaction from '../models/Transaction.js';
import Requirement, { REQUIREMENT_STATUSES } from '../models/Requirement.js';
import Proposal from '../models/Proposal.js';
import Review from '../models/Review.js';
import Cart from '../models/Cart.js';
import Negotiation from '../models/Negotiation.js';
import Notification from '../models/Notification.js';
import LogisticsJob from '../models/LogisticsJob.js';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validateBookingRequest } from '../services/availability.service.js';
import { runIntegrityAudit, recomputeRatings } from '../services/audit.service.js';
import { notify } from '../services/notification.service.js';
import { isPlatformAdmin } from '../config/admin.js';
import { getAdminRecoveryMetrics } from '../services/capacity-recovery.service.js';

/**
 * Platform administration — the eagle-eye console.
 *
 * Everything here reads or writes across tenant boundaries, which no other
 * route in the app is allowed to do: the rest of the API is scoped to
 * req.user by construction. That makes this file the one place where a missing
 * guard leaks the whole marketplace, so the gate is applied to the router
 * itself rather than per-endpoint.
 */
const router = Router();
router.use(requireAuth, requireAdmin);

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const DAY = 24 * 3600 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Revenue recognised on a booking, whichever price field carries it. */
const PRICE = { $ifNull: ['$agreedPrice', '$quotedPrice'] };

/** Statuses that represent real committed business rather than an enquiry. */
const COMMITTED = ['accepted', 'confirmed', 'completed'];

const tally = (rows) => Object.fromEntries(rows.map((r) => [r._id ?? 'unknown', r.count]));

const parsePage = (req, fallbackLimit = 50) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || fallbackLimit));
  const page = Math.max(1, Number(req.query.page) || 1);
  return { limit, page, skip: (page - 1) * limit };
};

/** Case-insensitive contains, escaped so a user's "." doesn't become a wildcard. */
const rx = (value) => new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

/* ═══════════════════════════════════════════════════════════════ CAPACITY RECOVERY */

/**
 * GET /api/admin/capacity-recovery
 * Marketplace-wide metrics for time-bound idle capacity recovery.
 */
router.get(
  '/capacity-recovery',
  asyncHandler(async (_req, res) => {
    const metrics = await getAdminRecoveryMetrics();
    res.json({ metrics });
  })
);

/* ═══════════════════════════════════════════════════════════════ OVERVIEW */

/**
 * Everything the top of the console needs, in one request — the whole point of
 * an eagle-eye view is that it is a single glance, not fifteen spinners.
 */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY);
    const since7 = new Date(now - 7 * DAY);
    const since60 = new Date(now - 60 * DAY);

    const [
      businesses,
      suspended,
      newBusinesses30,
      listingsByStatus,
      bookingsByStatus,
      requirementsByStatus,
      proposalsByStatus,
      transactionTotals,
      bookings30,
      bookings7,
      bookingsPrev30,
      reviewStats,
      matchStats,
      categoryMix,
      monthly,
      topProviders,
      topSeekers,
      cities,
      negotiations,
      unreadNotifications,
      activeCarts,
      fulfillmentStages,
      returnStages,
      overdueReturns,
      negotiationTypes,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ suspended: true }),
      User.countDocuments({ createdAt: { $gte: since30 } }),

      Resource.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Requirement.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Proposal.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

      Transaction.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
      ]),

      Booking.countDocuments({ createdAt: { $gte: since30 } }),
      Booking.countDocuments({ createdAt: { $gte: since7 } }),
      Booking.countDocuments({ createdAt: { $gte: since60, $lt: since30 } }),

      Review.aggregate([
        { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
      ]),

      // The snapshotted match score is the only record of how well the ranking
      // is actually serving people, so it belongs on the platform dashboard.
      Booking.aggregate([
        { $match: { matchScore: { $ne: null } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avg: { $avg: '$matchScore' },
            avgPrice: { $avg: '$matchBreakdown.priceFit' },
            avgDistance: { $avg: '$matchBreakdown.distanceFit' },
            avgAvailability: { $avg: '$matchBreakdown.availabilityFit' },
            avgCapacity: { $avg: '$matchBreakdown.capacityFit' },
            avgUrgency: { $avg: '$matchBreakdown.urgencyFit' },
          },
        },
      ]),

      Booking.aggregate([
        { $lookup: { from: 'resources', localField: 'resource', foreignField: '_id', as: 'r' } },
        { $unwind: '$r' },
        {
          $group: {
            _id: '$r.category',
            bookings: { $sum: 1 },
            committed: {
              $sum: { $cond: [{ $in: ['$status', COMMITTED] }, 1, 0] },
            },
            revenue: {
              $sum: { $cond: [{ $in: ['$status', COMMITTED] }, PRICE, 0] },
            },
          },
        },
        { $sort: { bookings: -1 } },
      ]),

      Booking.aggregate([
        { $match: { status: { $in: COMMITTED } } },
        {
          $group: {
            _id: { y: { $year: '$startDateTime' }, m: { $month: '$startDateTime' } },
            revenue: { $sum: PRICE },
            bookings: { $sum: 1 },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
        { $limit: 18 },
      ]),

      Booking.aggregate([
        { $match: { status: { $in: COMMITTED } } },
        { $group: { _id: '$provider', revenue: { $sum: PRICE }, bookings: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 8 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        {
          $project: {
            businessName: '$u.businessName',
            businessType: '$u.businessType',
            city: '$u.location.city',
            ratingAvg: '$u.ratingAvg',
            revenue: 1,
            bookings: 1,
          },
        },
      ]),

      Booking.aggregate([
        { $match: { status: { $in: COMMITTED } } },
        { $group: { _id: '$seeker', spend: { $sum: PRICE }, bookings: { $sum: 1 } } },
        { $sort: { spend: -1 } },
        { $limit: 8 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        {
          $project: {
            businessName: '$u.businessName',
            businessType: '$u.businessType',
            city: '$u.location.city',
            spend: 1,
            bookings: 1,
          },
        },
      ]),

      User.aggregate([
        { $group: { _id: '$location.city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Negotiation.countDocuments({}),
      Notification.countDocuments({ isRead: false }),
      Cart.countDocuments({ 'items.0': { $exists: true } }),

      Booking.aggregate([
        { $match: { 'fulfillment.status': { $ne: null } } },
        { $group: { _id: '$fulfillment.status', count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { 'return.status': { $ne: null } } },
        { $group: { _id: '$return.status', count: { $sum: 1 } } },
      ]),
      // Delivered, the hire window has closed, and nothing has come back. This
      // is the platform's real exposure and no single tenant's screen shows it.
      Booking.countDocuments({
        status: 'confirmed',
        'fulfillment.status': 'delivered',
        endDateTime: { $lt: new Date() },
        $or: [{ 'return.status': { $exists: false } }, { 'return.status': null }],
      }),
      Negotiation.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    ]);

    const tx = Object.fromEntries(
      transactionTotals.map((t) => [t._id, { count: t.count, total: t.total || 0 }])
    );
    const bookingCounts = tally(bookingsByStatus);
    const listingCounts = tally(listingsByStatus);

    const settled = tx.simulated_paid?.total || 0;
    const pendingSettlement = tx.pending?.total || 0;
    const refunded = tx.refunded?.total || 0;

    const enquiries = Object.values(bookingCounts).reduce((a, b) => a + b, 0);
    const accepted = COMMITTED.reduce((n, s) => n + (bookingCounts[s] || 0), 0);
    const confirmed = (bookingCounts.confirmed || 0) + (bookingCounts.completed || 0);
    const completed = bookingCounts.completed || 0;

    const m = matchStats[0] || {};

    res.json({
      generatedAt: new Date(),

      headline: {
        businesses,
        suspended,
        newBusinesses30,
        listings: Object.values(listingCounts).reduce((a, b) => a + b, 0),
        activeListings: listingCounts.active || 0,
        bookings: enquiries,
        openRequirements: tally(requirementsByStatus).open || 0,
        // Only settled money is GMV; the rest is explicitly separated so the
        // headline can never quietly count an unpaid booking as revenue.
        gmv: settled,
        pendingSettlement,
        refunded,
        avgOrderValue: tx.simulated_paid?.count
          ? Math.round(settled / tx.simulated_paid.count)
          : 0,
        bookings30,
        bookings7,
        // Direction of travel against the preceding equal-length window.
        bookingGrowth30: bookingsPrev30
          ? Math.round(((bookings30 - bookingsPrev30) / bookingsPrev30) * 1000) / 10
          : null,
        reviews: reviewStats[0]?.count || 0,
        avgRating: reviewStats[0]?.avg ? Math.round(reviewStats[0].avg * 10) / 10 : 0,
        negotiations,
        unreadNotifications,
        activeCarts,
      },

      /**
       * Physical logistics across the whole platform. Providers advance
       * fulfillment and seekers initiate returns, so neither side ever sees
       * the full pipeline — only the console does.
       */
      logistics: {
        fulfillment: tally(fulfillmentStages),
        returns: tally(returnStages),
        inTransit:
          (tally(fulfillmentStages).out_for_delivery || 0) +
          (tally(returnStages).return_in_transit || 0),
        overdueReturns,
        awaitingReturn: tally(returnStages).return_requested || 0,
      },

      negotiationMix: tally(negotiationTypes),

      breakdown: {
        listings: listingCounts,
        bookings: bookingCounts,
        requirements: tally(requirementsByStatus),
        proposals: tally(proposalsByStatus),
        transactions: tx,
      },

      /** Enquiry → committed → paid → delivered, as counts plus conversion. */
      funnel: [
        { stage: 'Requests raised', count: enquiries, rate: 100 },
        { stage: 'Accepted', count: accepted, rate: pct(accepted, enquiries) },
        { stage: 'Confirmed & paid', count: confirmed, rate: pct(confirmed, enquiries) },
        { stage: 'Completed', count: completed, rate: pct(completed, enquiries) },
      ],

      categoryMix: categoryMix.map((c) => ({
        category: c._id,
        bookings: c.bookings,
        committed: c.committed,
        revenue: c.revenue || 0,
      })),

      monthly: monthly.map((d) => ({
        month: `${MONTHS[d._id.m - 1]} ${String(d._id.y).slice(2)}`,
        revenue: d.revenue || 0,
        bookings: d.bookings,
      })),

      topProviders,
      topSeekers,
      cities: cities.filter((c) => c._id).map((c) => ({ city: c._id, count: c.count })),

      /**
       * Average of each ranking factor across every booking ever made. Low
       * averages here mean the weights are pulling in a direction the market
       * does not actually reward.
       */
      matching: {
        scored: m.count || 0,
        avgScore: m.avg ? Math.round(m.avg * 1000) / 1000 : 0,
        factors: {
          priceFit: round3(m.avgPrice),
          distanceFit: round3(m.avgDistance),
          availabilityFit: round3(m.avgAvailability),
          capacityFit: round3(m.avgCapacity),
          urgencyFit: round3(m.avgUrgency),
        },
      },
    });
  })
);

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const round3 = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0);

/* ═══════════════════════════════════════════════════════════════════ LIVE */

/**
 * One merged, reverse-chronological stream of everything happening on the
 * platform. Separate tables would make you reconstruct the ordering in your
 * head; the interesting question is almost always "what just happened".
 */
router.get(
  '/live',
  asyncHandler(async (req, res) => {
    const limit = Math.min(120, Math.max(5, Number(req.query.limit) || 60));
    const each = Math.ceil(limit / 2);

    const [bookings, requirements, proposals, transactions, reviews, users] = await Promise.all([
      Booking.find({})
        .sort('-createdAt')
        .limit(each)
        .populate('resource', 'title category')
        .populate('provider', 'businessName')
        .populate('seeker', 'businessName')
        .lean(),
      Requirement.find({})
        .sort('-createdAt')
        .limit(each)
        .populate('seeker', 'businessName')
        .lean(),
      Proposal.find({})
        .sort('-createdAt')
        .limit(each)
        .populate('provider', 'businessName')
        .populate('resource', 'title')
        .lean(),
      Transaction.find({})
        .sort('-createdAt')
        .limit(each)
        .populate('payer', 'businessName')
        .populate('payee', 'businessName')
        .lean(),
      Review.find({})
        .sort('-createdAt')
        .limit(each)
        .populate('reviewer', 'businessName')
        .populate('reviewee', 'businessName')
        .lean(),
      User.find({}).sort('-createdAt').limit(each).select('businessName businessType location createdAt').lean(),
    ]);

    const feed = [
      ...bookings.map((b) => ({
        kind: 'booking',
        id: b._id,
        at: b.createdAt,
        status: b.status,
        title: `${b.seeker?.businessName || '?'} requested ${b.requestedQuantity} × ${b.resource?.title || 'a listing'}`,
        detail: `from ${b.provider?.businessName || '?'}`,
        amount: b.agreedPrice ?? b.quotedPrice ?? null,
        link: `/bookings/detail/${b._id}`,
        category: b.resource?.category || null,
      })),
      ...requirements.map((r) => ({
        kind: 'requirement',
        id: r._id,
        at: r.createdAt,
        status: r.status,
        title: `${r.seeker?.businessName || '?'} posted “${r.title}”`,
        detail: `${r.proposalCount || 0} proposal(s) · ${(r.offers || []).length} offer(s)`,
        amount: r.maxBudget ?? r.maxPrice ?? null,
        link: `/requirements/${r._id}`,
        category: r.category,
      })),
      ...proposals.map((p) => ({
        kind: 'proposal',
        id: p._id,
        at: p.createdAt,
        status: p.status,
        title: `${p.provider?.businessName || '?'} quoted on a requirement`,
        detail: p.resource?.title || '',
        amount: p.quotedPrice,
        link: `/requirements/${p.requirement}`,
        category: null,
      })),
      ...transactions.map((t) => ({
        kind: 'transaction',
        id: t._id,
        at: t.createdAt,
        status: t.status,
        title: `${t.payer?.businessName || '?'} → ${t.payee?.businessName || '?'}`,
        detail: t.status === 'simulated_paid' ? `paid via ${t.paymentMethod}` : t.status,
        amount: t.amount,
        link: `/bookings/detail/${t.booking}`,
        category: null,
      })),
      ...reviews.map((v) => ({
        kind: 'review',
        id: v._id,
        at: v.createdAt,
        status: `${v.rating}★`,
        title: `${v.reviewer?.businessName || '?'} rated ${v.reviewee?.businessName || '?'} ${v.rating}/5`,
        detail: v.comment ? v.comment.slice(0, 120) : '',
        amount: null,
        link: `/bookings/detail/${v.booking}`,
        category: null,
      })),
      ...users.map((u) => ({
        kind: 'signup',
        id: u._id,
        at: u.createdAt,
        status: u.businessType,
        title: `${u.businessName} joined`,
        detail: u.location?.city || '',
        amount: null,
        link: `/provider/${u._id}`,
        category: null,
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);

    res.json({ feed, generatedAt: new Date() });
  })
);

/* ═════════════════════════════════════════════════════════════════ HEALTH */

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json(await runIntegrityAudit());
  })
);

/**
 * Repair actions for audit findings. Each one is the narrowest write that
 * restores the invariant, and none of them touches inventory: an oversubscribed
 * resource is a judgement call about whose booking gives way, so the console
 * reports it and leaves the decision to a human.
 */
router.post(
  '/health/repair',
  asyncHandler(async (req, res) => {
    const { checkId } = req.body;
    let repaired = 0;
    const notes = [];

    switch (checkId) {
      case 'missing_transaction': {
        const bookings = await Booking.find({ status: { $in: COMMITTED } })
          .select('agreedPrice quotedPrice provider seeker status')
          .lean();
        const existing = new Set(
          (await Transaction.find({}).select('booking').lean()).map((t) => String(t.booking))
        );
        for (const b of bookings) {
          if (existing.has(String(b._id))) continue;
          await Transaction.create({
            booking: b._id,
            payer: b.seeker,
            payee: b.provider,
            amount: b.agreedPrice ?? b.quotedPrice ?? 0,
            // Backfilled rows are never marked paid — inventing a settled
            // payment would corrupt GMV to make a dashboard look tidy.
            status: b.status === 'completed' ? 'simulated_paid' : 'pending',
            paidAt: b.status === 'completed' ? new Date() : undefined,
          });
          repaired++;
        }
        notes.push('Backfilled transactions from each booking’s agreed price.');
        break;
      }

      case 'rating_drift': {
        await recomputeRatings();
        repaired = 1;
        notes.push('Recomputed every ratingAvg / ratingCount from the Review collection.');
        break;
      }

      case 'unmappable': {
        const listings = await Resource.find({
          status: { $ne: 'archived' },
          $or: [
            { 'location.coordinates': { $exists: false } },
            { 'location.coordinates': { $size: 0 } },
            { 'location.coordinates': null },
          ],
        }).populate('owner', 'location');
        for (const r of listings) {
          const coords = r.owner?.location?.coordinates;
          if (!coords?.length) continue;
          r.location = { ...(r.location?.toObject?.() || r.location || {}), coordinates: coords };
          await r.save();
          repaired++;
        }
        notes.push('Copied coordinates from each listing’s owner business location.');
        break;
      }

      case 'stale_cart': {
        const live = new Set(
          (await Resource.find({ status: 'active' }).select('_id').lean()).map((r) => String(r._id))
        );
        for (const cart of await Cart.find({ 'items.0': { $exists: true } })) {
          const before = cart.items.length;
          cart.items = cart.items.filter((i) => live.has(String(i.resource)));
          if (cart.items.length !== before) {
            await cart.save();
            repaired += before - cart.items.length;
          }
        }
        notes.push('Pruned cart lines whose listing is no longer active.');
        break;
      }

      case 'orphans': {
        const users = new Set((await User.find({}).select('_id').lean()).map((u) => String(u._id)));
        const resources = new Set(
          (await Resource.find({}).select('_id').lean()).map((r) => String(r._id))
        );
        const bookings = new Set(
          (await Booking.find({}).select('_id').lean()).map((b) => String(b._id))
        );
        const requirements = new Set(
          (await Requirement.find({}).select('_id').lean()).map((r) => String(r._id))
        );

        for (const t of await Transaction.find({}).select('booking').lean()) {
          if (!bookings.has(String(t.booking))) {
            await Transaction.deleteOne({ _id: t._id });
            repaired++;
          }
        }
        for (const p of await Proposal.find({}).select('requirement resource').lean()) {
          if (!requirements.has(String(p.requirement)) || !resources.has(String(p.resource))) {
            await Proposal.deleteOne({ _id: p._id });
            repaired++;
          }
        }
        const touchedUsers = new Set();
        const touchedResources = new Set();
        for (const v of await Review.find({}).select('booking reviewee resource').lean()) {
          if (!bookings.has(String(v.booking))) {
            await Review.deleteOne({ _id: v._id });
            if (v.reviewee) touchedUsers.add(String(v.reviewee));
            if (v.resource) touchedResources.add(String(v.resource));
            repaired++;
          }
        }
        // Deleting reviews moves the denormalised ratings, so settle them here
        // rather than leaving a second finding behind.
        if (touchedUsers.size || touchedResources.size) {
          await recomputeRatings({
            users: [...touchedUsers].map(oid),
            resources: [...touchedResources].map(oid),
          });
        }
        for (const n of await Notification.find({}).select('user').lean()) {
          if (!users.has(String(n.user))) {
            await Notification.deleteOne({ _id: n._id });
            repaired++;
          }
        }
        notes.push('Deleted records whose parent row no longer exists, then re-settled ratings.');
        break;
      }

      case 'requirement_state': {
        const stale = await Requirement.find({
          status: 'open',
          endDateTime: { $lt: new Date() },
        });
        for (const r of stale) {
          r.status = 'expired';
          await r.save();
          repaired++;
        }
        notes.push('Marked requirements whose window has passed as expired.');
        break;
      }

      case 'overdue_return': {
        const overdue = await Booking.find({
          status: 'confirmed',
          'fulfillment.status': 'delivered',
          endDateTime: { $lt: new Date() },
          rentalExpiryNotified: { $ne: true },
          $or: [{ 'return.status': { $exists: false } }, { 'return.status': null }],
        }).populate('resource', 'title');

        for (const b of overdue) {
          // Same flag the booking route uses, so the seeker cannot be told
          // twice by two different paths.
          b.rentalExpiryNotified = true;
          await b.save();
          await notify({
            user: b.seeker,
            type: 'rental_expiry',
            title: 'Rental period ended',
            message: `Your rental for ${b.resource?.title || 'a listing'} has ended. Please initiate the return.`,
            relatedBooking: b._id,
          });
          repaired++;
        }
        notes.push('Sent the rental-expiry notice to every seeker still holding delivered stock.');
        break;
      }

      default:
        throw new HttpError(
          400,
          'That check has no automatic repair — it needs a human decision about which record gives way.'
        );
    }

    res.json({ checkId, repaired, notes, audit: await runIntegrityAudit() });
  })
);

/* ═══════════════════════════════════════════════════════════════ BUSINESSES */

/**
 * The business directory, with the cross-side totals that no per-tenant screen
 * can show: what a business earns as a provider next to what it spends as a
 * seeker. Both numbers exist for every account because every account is both.
 */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { limit, page, skip } = parsePage(req);
    const { q, businessType, city, status, sort = 'recent' } = req.query;

    const filter = {};
    if (q) filter.$or = [{ businessName: rx(q) }, { email: rx(q) }, { phone: rx(q) }];
    if (businessType) filter.businessType = businessType;
    if (city) filter['location.city'] = rx(city);
    if (status === 'suspended') filter.suspended = true;
    if (status === 'active') filter.suspended = { $ne: true };

    const SORTS = {
      recent: { createdAt: -1 },
      name: { businessName: 1 },
      rating: { ratingAvg: -1, ratingCount: -1 },
    };

    const [users, total] = await Promise.all([
      User.find(filter).sort(SORTS[sort] || SORTS.recent).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    const ids = users.map((u) => u._id);
    const [listings, asProvider, asSeeker, requirements] = await Promise.all([
      Resource.aggregate([
        { $match: { owner: { $in: ids } } },
        {
          $group: {
            _id: '$owner',
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          },
        },
      ]),
      Booking.aggregate([
        { $match: { provider: { $in: ids } } },
        {
          $group: {
            _id: '$provider',
            bookings: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            earned: { $sum: { $cond: [{ $in: ['$status', COMMITTED] }, PRICE, 0] } },
            lastAt: { $max: '$createdAt' },
          },
        },
      ]),
      Booking.aggregate([
        { $match: { seeker: { $in: ids } } },
        {
          $group: {
            _id: '$seeker',
            bookings: { $sum: 1 },
            spent: { $sum: { $cond: [{ $in: ['$status', COMMITTED] }, PRICE, 0] } },
            lastAt: { $max: '$createdAt' },
          },
        },
      ]),
      Requirement.aggregate([
        { $match: { seeker: { $in: ids } } },
        {
          $group: {
            _id: '$seeker',
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const index = (rows) => new Map(rows.map((r) => [String(r._id), r]));
    const L = index(listings);
    const P = index(asProvider);
    const S = index(asSeeker);
    const R = index(requirements);

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      users: users.map((u) => {
        const key = String(u._id);
        const p = P.get(key);
        const s = S.get(key);
        const lastAt = [p?.lastAt, s?.lastAt, u.createdAt]
          .filter(Boolean)
          .sort((a, b) => new Date(b) - new Date(a))[0];

        return {
          _id: u._id,
          businessName: u.businessName,
          email: u.email,
          phone: u.phone || null,
          businessType: u.businessType,
          gstNumber: u.gstNumber || null,
          city: u.location?.city || null,
          address: u.location?.address || null,
          pincode: u.location?.pincode || null,
          coordinates: u.location?.coordinates || null,
          // Empty coordinates make a business's own listings unrankable by
          // distance, so it belongs in the directory rather than buried.
          mappable: Boolean(u.location?.coordinates?.length),
          preferredProviders: (u.preferences?.preferredProviders || []).length,
          preferredResourceTypes: u.preferences?.preferredResourceTypes || [],
          ratingAvg: u.ratingAvg || 0,
          ratingCount: u.ratingCount || 0,
          suspended: Boolean(u.suspended),
          suspensionReason: u.suspensionReason || null,
          isPlatformAdmin: isPlatformAdmin(u),
          createdAt: u.createdAt,
          lastActivityAt: lastAt,
          listings: L.get(key)?.total || 0,
          activeListings: L.get(key)?.active || 0,
          requirements: R.get(key)?.total || 0,
          openRequirements: R.get(key)?.open || 0,
          providerBookings: p?.bookings || 0,
          pendingInbox: p?.pending || 0,
          seekerBookings: s?.bookings || 0,
          earned: p?.earned || 0,
          spent: s?.spent || 0,
          net: (p?.earned || 0) - (s?.spent || 0),
        };
      }),
    });
  })
);

/** Everything about one business, both sides of the marketplace at once. */
router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) throw new HttpError(404, 'Business not found.');

    const id = oid(req.params.id);
    const [listings, provided, sought, requirements, proposals, reviewsGiven, reviewsGot, money, cart] =
      await Promise.all([
        Resource.find({ owner: id }).sort('-createdAt').lean(),
        Booking.find({ provider: id })
          .sort('-createdAt')
          .limit(50)
          .populate('resource', 'title category')
          .populate('seeker', 'businessName')
          .lean(),
        Booking.find({ seeker: id })
          .sort('-createdAt')
          .limit(50)
          .populate('resource', 'title category')
          .populate('provider', 'businessName')
          .lean(),
        Requirement.find({ seeker: id }).sort('-createdAt').limit(50).lean(),
        Proposal.find({ provider: id })
          .sort('-createdAt')
          .limit(50)
          .populate('resource', 'title')
          .populate('requirement', 'title status')
          .lean(),
        Review.find({ reviewer: id }).sort('-createdAt').populate('reviewee', 'businessName').lean(),
        Review.find({ reviewee: id }).sort('-createdAt').populate('reviewer', 'businessName').lean(),
        Transaction.aggregate([
          { $match: { $or: [{ payer: id }, { payee: id }] } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              paidOut: { $sum: { $cond: [{ $eq: ['$payer', id] }, '$amount', 0] } },
              receivedIn: { $sum: { $cond: [{ $eq: ['$payee', id] }, '$amount', 0] } },
            },
          },
        ]),
        Cart.findOne({ seeker: id }).populate('items.resource', 'title pricing status').lean(),
      ]);

    // preferredProviders drives the PREFERENCE_BONUS in ranking, so it changes
    // what this business sees — worth resolving to names rather than ids.
    const [preferredProviders, negotiations, notifications] = await Promise.all([
      User.find({ _id: { $in: user.preferences?.preferredProviders || [] } })
        .select('businessName businessType location.city ratingAvg')
        .lean(),
      Negotiation.find({ sender: id })
        .sort('-createdAt')
        .limit(30)
        .populate({ path: 'booking', select: 'resource status', populate: { path: 'resource', select: 'title' } })
        .lean(),
      Notification.aggregate([
        { $match: { user: id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unread: { $sum: { $cond: ['$isRead', 0, 1] } },
          },
        },
      ]),
    ]);

    res.json({
      business: {
        ...user,
        passwordHash: undefined,
        isPlatformAdmin: isPlatformAdmin(user),
      },
      listings,
      bookings: { provided, sought },
      requirements,
      proposals,
      reviews: { given: reviewsGiven, received: reviewsGot },
      money,
      cart: cart?.items || [],
      preferredProviders,
      negotiations,
      notifications: notifications[0] || { total: 0, unread: 0 },
    });
  })
);

/**
 * Suspend or restore a business. Enforced centrally in requireAuth, so this one
 * flag locks every route at once rather than relying on each to check.
 */
router.patch(
  '/users/:id/suspend',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'Business not found.');

    // An admin who suspends themselves locks the console with no way back in
    // except a database edit.
    if (String(user._id) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot suspend your own account.');
    }
    if (isPlatformAdmin(user) && req.body.suspended) {
      throw new HttpError(400, 'Platform administrators cannot be suspended from the console.');
    }

    const suspended = Boolean(req.body.suspended);
    user.suspended = suspended;
    user.suspendedAt = suspended ? new Date() : undefined;
    user.suspensionReason = suspended ? req.body.reason || 'No reason given' : undefined;
    await user.save();

    // Told on restore, not on suspension — a suspended account cannot sign in
    // to read it, and the notification would sit unread forever.
    if (!suspended) {
      await notify({
        user: user._id,
        type: 'platform_announcement',
        title: 'Account restored',
        message: 'Your account has been restored by the platform team. Welcome back.',
      });
    }

    res.json({
      business: { ...user.toJSON(), isPlatformAdmin: isPlatformAdmin(user) },
    });
  })
);

/**
 * Take a business's listings off the market without suspending the account —
 * the proportionate response to a listing-quality problem, since the business
 * can still honour bookings it has already taken.
 */
router.post(
  '/users/:id/unlist',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'Business not found.');

    const status = req.body.status === 'archived' ? 'archived' : 'paused';
    const { modifiedCount } = await Resource.updateMany(
      { owner: user._id, status: 'active' },
      { status }
    );

    const closed = await Requirement.updateMany(
      { seeker: user._id, status: 'open' },
      { status: 'closed' }
    );

    await notify({
      user: user._id,
      type: 'platform_announcement',
      title: `Your listings have been ${status}`,
      message:
        req.body.reason ||
        `The platform team ${status} your active listings. Existing bookings are unaffected.`,
    });

    res.json({ listings: modifiedCount, requirementsClosed: closed.modifiedCount, status });
  })
);

/**
 * Force a new password for a business locked out of its account. Returned once,
 * in the response, because there is no mail transport in this prototype — a
 * real deployment would send a single-use reset link instead of a password.
 */
router.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'Business not found.');

    const password = req.body.password || temporaryPassword();
    if (String(password).length < 6) {
      throw new HttpError(400, 'Passwords must be at least 6 characters.');
    }

    user.passwordHash = await User.hashPassword(String(password));
    await user.save();

    res.json({
      ok: true,
      email: user.email,
      temporaryPassword: password,
      note: 'Shown once. The business should change it after signing in.',
    });
  })
);

function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/* ════════════════════════════════════════════════════════════════ LISTINGS */

router.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const { limit, page, skip } = parsePage(req);
    const { q, category, status, owner } = req.query;

    const filter = {};
    if (q) filter.$or = [{ title: rx(q) }, { description: rx(q) }, { tags: rx(q) }];
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (owner) filter.owner = oid(owner);

    const [listings, total] = await Promise.all([
      Resource.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('owner', 'businessName location.city suspended')
        .lean(),
      Resource.countDocuments(filter),
    ]);

    // Committed demand per listing, so a takedown decision can see what it
    // would strand before it is made.
    const held = await Booking.aggregate([
      { $match: { resource: { $in: listings.map((r) => r._id) } } },
      {
        $group: {
          _id: '$resource',
          bookings: { $sum: 1 },
          committed: { $sum: { $cond: [{ $in: ['$status', COMMITTED] }, 1, 0] } },
          upcoming: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', ['accepted', 'confirmed']] },
                    { $gt: ['$endDateTime', new Date()] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          revenue: { $sum: { $cond: [{ $in: ['$status', COMMITTED] }, PRICE, 0] } },
        },
      },
    ]);
    const H = new Map(held.map((h) => [String(h._id), h]));

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      listings: listings.map((r) => ({
        ...r,
        stats: {
          bookings: H.get(String(r._id))?.bookings || 0,
          committed: H.get(String(r._id))?.committed || 0,
          upcoming: H.get(String(r._id))?.upcoming || 0,
          revenue: H.get(String(r._id))?.revenue || 0,
        },
        mappable: Boolean(r.location?.coordinates?.length),
        windows: (r.availabilityWindows || []).length,
      })),
    });
  })
);

/** Moderation: force a listing active / paused / archived. */
router.patch(
  '/listings/:id/status',
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    if (!['active', 'paused', 'archived'].includes(status)) {
      throw new HttpError(400, 'Status must be active, paused or archived.');
    }

    const resource = await Resource.findById(req.params.id);
    if (!resource) throw new HttpError(404, 'Listing not found.');

    const previous = resource.status;
    resource.status = status;
    await resource.save();

    if (previous !== status) {
      await notify({
        user: resource.owner,
        type: 'platform_announcement',
        title: `Listing ${status} by the platform`,
        message: `“${resource.title}” was moved from ${previous} to ${status}.${reason ? ` Reason: ${reason}` : ''}`,
      });
    }

    // Upcoming reserved bookings survive a takedown on purpose: the listing
    // leaves the market, but a commitment already made is still owed.
    const upcoming = await Booking.countDocuments({
      resource: resource._id,
      status: { $in: ['accepted', 'confirmed'] },
      endDateTime: { $gt: new Date() },
    });

    res.json({ resource, previous, upcomingBookingsRetained: upcoming });
  })
);

/* ════════════════════════════════════════════════════════════════ BOOKINGS */

router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const { limit, page, skip } = parsePage(req);
    const { status, party, category, from, to, flagged } = req.query;

    const filter = {};
    if (status) filter.status = { $in: String(status).split(',') };
    if (party) filter.$or = [{ provider: oid(party) }, { seeker: oid(party) }];
    if (from || to) {
      filter.startDateTime = {};
      if (from) filter.startDateTime.$gte = new Date(from);
      if (to) filter.startDateTime.$lte = new Date(to);
    }
    // Stuck queue: awaiting a provider decision with the start date already
    // behind us. Nobody's own dashboard surfaces this.
    if (flagged === 'stuck') {
      filter.status = { $in: ['pending', 'negotiating'] };
      filter.startDateTime = { ...(filter.startDateTime || {}), $lt: new Date() };
    }
    if (flagged === 'in_transit') {
      filter.$or = [
        { 'fulfillment.status': { $in: ['loading', 'out_for_delivery'] } },
        { 'return.status': { $in: ['return_pickup_scheduled', 'return_in_transit'] } },
      ];
    }
    // Delivered goods past their hire window with no return started.
    if (flagged === 'overdue_return') {
      filter.status = 'confirmed';
      filter['fulfillment.status'] = 'delivered';
      filter.endDateTime = { ...(filter.endDateTime || {}), $lt: new Date() };
      filter.$or = [{ 'return.status': { $exists: false } }, { 'return.status': null }];
    }
    if (flagged === 'unpaid') {
      filter.status = 'accepted';
    }

    const query = Booking.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('resource', 'title category totalQuantity unit pricing')
      .populate('provider', 'businessName location.city')
      .populate('seeker', 'businessName location.city')
      .lean();

    const [bookings, total] = await Promise.all([query, Booking.countDocuments(filter)]);

    const filtered = category
      ? bookings.filter((b) => b.resource?.category === category)
      : bookings;

    const txs = await Transaction.find({ booking: { $in: filtered.map((b) => b._id) } }).lean();
    const T = new Map(txs.map((t) => [String(t.booking), t]));

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      bookings: filtered.map((b) => ({
        ...b,
        transaction: T.get(String(b._id)) || null,
      })),
    });
  })
);

/**
 * Administrative status override — the dispute-resolution lever.
 *
 * Moving a booking *into* a hard-reserved status re-validates availability
 * first, exactly like the provider-accept path. The console must not be able to
 * create the oversubscription its own audit would then report.
 */
router.patch(
  '/bookings/:id/status',
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    if (!BOOKING_STATUSES.includes(status)) {
      throw new HttpError(400, `Status must be one of: ${BOOKING_STATUSES.join(', ')}.`);
    }
    if (!reason?.trim()) {
      throw new HttpError(400, 'An override reason is required — it is written to both parties.');
    }

    const booking = await Booking.findById(req.params.id).populate('resource');
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (!booking.resource) throw new HttpError(409, 'This booking’s listing no longer exists.');

    const previous = booking.status;
    if (previous === status) throw new HttpError(400, `This booking is already ${status}.`);

    const HARD = ['accepted', 'confirmed'];
    if (HARD.includes(status) && !HARD.includes(previous)) {
      const check = await validateBookingRequest({
        resource: booking.resource,
        quantity: booking.requestedQuantity,
        start: booking.startDateTime,
        end: booking.endDateTime,
        excludeBookingId: booking._id,
      });
      if (!check.ok) {
        throw new HttpError(409, `Cannot reserve this booking: ${check.reason}`);
      }
    }

    booking.status = status;
    if (status === 'cancelled') booking.cancellationReason = `Platform override: ${reason}`;
    if (status === 'rejected') booking.rejectionReason = `Platform override: ${reason}`;
    if (HARD.includes(status) && booking.agreedPrice == null) {
      booking.agreedPrice = booking.quotedPrice;
    }
    await booking.save();

    // Keep the money trail consistent with the new state, so the override does
    // not leave a finding behind in the audit.
    let transaction = await Transaction.findOne({ booking: booking._id });
    if (COMMITTED.includes(status)) {
      if (!transaction) {
        transaction = await Transaction.create({
          booking: booking._id,
          payer: booking.seeker,
          payee: booking.provider,
          amount: booking.agreedPrice ?? booking.quotedPrice ?? 0,
          status: 'pending',
        });
      }
    } else if (transaction && transaction.status === 'pending') {
      await Transaction.deleteOne({ _id: transaction._id });
      transaction = null;
    }

    for (const party of [booking.provider, booking.seeker]) {
      await notify({
        user: party,
        type: 'booking_status_change',
        title: `Booking moved to ${status} by the platform`,
        message: `“${booking.resource.title}” was changed from ${previous} to ${status}. Reason: ${reason}`,
        relatedBooking: booking._id,
      });
    }

    res.json({ booking, previous, transaction });
  })
);

/* ════════════════════════════════════════════════════════════════════ RFQs */

router.get(
  '/requirements',
  asyncHandler(async (req, res) => {
    const { limit, page, skip } = parsePage(req);
    const { q, status, category } = req.query;

    const filter = {};
    if (q) filter.$or = [{ title: rx(q) }, { description: rx(q) }];
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [requirements, total] = await Promise.all([
      Requirement.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('seeker', 'businessName location.city suspended')
        .lean(),
      Requirement.countDocuments(filter),
    ]);

    const proposals = await Proposal.aggregate([
      { $match: { requirement: { $in: requirements.map((r) => r._id) } } },
      {
        $group: {
          _id: '$requirement',
          total: { $sum: 1 },
          submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          bestQuote: { $min: '$quotedPrice' },
        },
      },
    ]);
    const P = new Map(proposals.map((p) => [String(p._id), p]));

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      requirements: requirements.map((r) => ({
        ...r,
        proposals: {
          total: P.get(String(r._id))?.total || 0,
          submitted: P.get(String(r._id))?.submitted || 0,
          bestQuote: P.get(String(r._id))?.bestQuote ?? null,
        },
        offerCount: (r.offers || []).length,
        expired: r.status === 'open' && new Date(r.endDateTime) < new Date(),
      })),
    });
  })
);

/** Close, cancel or re-open an RFQ — spam control and stale-board cleanup. */
router.patch(
  '/requirements/:id/status',
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    if (!REQUIREMENT_STATUSES.includes(status)) {
      throw new HttpError(400, `Status must be one of: ${REQUIREMENT_STATUSES.join(', ')}.`);
    }

    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) throw new HttpError(404, 'Requirement not found.');

    // Fulfilled means a booking exists against it; reversing that in a status
    // dropdown would orphan the booking.
    if (requirement.status === 'fulfilled' && status !== 'fulfilled') {
      throw new HttpError(
        400,
        'A fulfilled requirement is tied to a booking — change the booking instead.'
      );
    }

    const previous = requirement.status;
    requirement.status = status;
    await requirement.save();

    await notify({
      user: requirement.seeker,
      type: 'platform_announcement',
      title: `Requirement ${status} by the platform`,
      message: `“${requirement.title}” was moved from ${previous} to ${status}.${reason ? ` Reason: ${reason}` : ''}`,
      relatedRequirement: requirement._id,
    });

    res.json({ requirement, previous });
  })
);

/* ══════════════════════════════════════════════════════════════════ LEDGER */

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const { limit, page, skip } = parsePage(req);
    const { status, party } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (party) filter.$or = [{ payer: oid(party) }, { payee: oid(party) }];

    const [transactions, total, totals] = await Promise.all([
      Transaction.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('payer', 'businessName')
        .populate('payee', 'businessName')
        .populate({ path: 'booking', select: 'status resource', populate: { path: 'resource', select: 'title' } })
        .lean(),
      Transaction.countDocuments(filter),
      Transaction.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      transactions,
      totals: Object.fromEntries(
        totals.map((t) => [t._id, { count: t.count, amount: t.amount || 0 }])
      ),
    });
  })
);

/** Mark a simulated payment refunded. */
router.patch(
  '/transactions/:id/refund',
  asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) throw new HttpError(404, 'Transaction not found.');
    if (transaction.status !== 'simulated_paid') {
      throw new HttpError(400, `Only a settled payment can be refunded (current: ${transaction.status}).`);
    }

    transaction.status = 'refunded';
    await transaction.save();

    // A refund without a cancelled booking would leave the provider holding
    // inventory for an order nobody paid for.
    const booking = await Booking.findById(transaction.booking).populate('resource', 'title');
    if (booking && !['cancelled', 'completed'].includes(booking.status)) {
      booking.status = 'cancelled';
      booking.cancellationReason = `Platform refund: ${req.body.reason || 'No reason given'}`;
      await booking.save();
    }

    for (const party of [transaction.payer, transaction.payee].filter(Boolean)) {
      await notify({
        user: party,
        type: 'booking_status_change',
        title: 'Payment refunded by the platform',
        message: `₹${transaction.amount} was refunded for “${booking?.resource?.title || 'a booking'}”.${
          req.body.reason ? ` Reason: ${req.body.reason}` : ''
        }`,
        relatedBooking: transaction.booking,
      });
    }

    res.json({ transaction, booking });
  })
);

/* ════════════════════════════════════════════════════════════ NEGOTIATIONS */

/**
 * The price-negotiation log across the platform.
 *
 * Every counter-offer a business has ever sent is stored, but until now only
 * the two parties could read it. It is the evidence trail for any pricing
 * dispute, and in aggregate it is the only record of how far quoted prices
 * actually move before a deal closes.
 */
router.get(
  '/negotiations',
  asyncHandler(async (req, res) => {
    const { limit, page, skip } = parsePage(req);
    const { type, q, booking } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (q) filter.message = rx(q);
    if (booking) filter.booking = oid(booking);

    const [messages, total, byType, movement] = await Promise.all([
      Negotiation.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('sender', 'businessName')
        .populate({
          path: 'booking',
          select: 'status quotedPrice agreedPrice resource provider seeker',
          populate: [
            { path: 'resource', select: 'title category' },
            { path: 'provider', select: 'businessName' },
            { path: 'seeker', select: 'businessName' },
          ],
        })
        .lean(),
      Negotiation.countDocuments(filter),
      Negotiation.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),

      // How much negotiation actually shifts a price, platform-wide. Only
      // settled bookings count — an open thread has no outcome yet.
      Booking.aggregate([
        {
          $match: {
            status: { $in: COMMITTED },
            agreedPrice: { $ne: null },
            quotedPrice: { $ne: null, $gt: 0 },
          },
        },
        {
          $lookup: {
            from: 'negotiations',
            localField: '_id',
            foreignField: 'booking',
            as: 'thread',
          },
        },
        { $match: { 'thread.0': { $exists: true } } },
        {
          $group: {
            _id: null,
            deals: { $sum: 1 },
            avgQuoted: { $avg: '$quotedPrice' },
            avgAgreed: { $avg: '$agreedPrice' },
            totalDiscount: { $sum: { $subtract: ['$quotedPrice', '$agreedPrice'] } },
          },
        },
      ]),
    ]);

    const m = movement[0];

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      messages,
      byType: tally(byType),
      priceMovement: m
        ? {
            negotiatedDeals: m.deals,
            avgQuoted: Math.round(m.avgQuoted),
            avgAgreed: Math.round(m.avgAgreed),
            totalDiscount: Math.round(m.totalDiscount),
            avgDiscountPct: m.avgQuoted
              ? Math.round(((m.avgQuoted - m.avgAgreed) / m.avgQuoted) * 1000) / 10
              : 0,
          }
        : null,
    });
  })
);

/* ═════════════════════════════════════════════════════════════════ REVIEWS */

router.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    const { limit, page, skip } = parsePage(req);
    const { rating, q } = req.query;

    const filter = {};
    if (rating) filter.rating = { $lte: Number(rating) };
    if (q) filter.$or = [{ comment: rx(q) }, { title: rx(q) }];

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('reviewer', 'businessName')
        .populate('reviewee', 'businessName')
        .populate('resource', 'title')
        .lean(),
      Review.countDocuments(filter),
    ]);

    res.json({ total, page, limit, pages: Math.ceil(total / limit) || 1, reviews });
  })
);

/** Remove an abusive review and re-settle the ratings it was counted in. */
router.delete(
  '/reviews/:id',
  asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) throw new HttpError(404, 'Review not found.');

    const { reviewee, resource } = review;
    await Review.deleteOne({ _id: review._id });

    // ratingAvg / ratingCount are denormalised; leaving them alone here is
    // exactly the drift the audit reports.
    await recomputeRatings({
      users: [reviewee].filter(Boolean),
      resources: [resource].filter(Boolean),
    });

    res.json({ ok: true, removed: review._id });
  })
);

/* ═══════════════════════════════════════════════════════════════ BROADCAST */

/**
 * Platform announcement. Goes through the same notify() service as everything
 * else, so recipients get it over their live socket and it survives in their
 * notification list if they are offline.
 */
router.post(
  '/broadcast',
  asyncHandler(async (req, res) => {
    const { title, message, audience = 'all', businessType, city } = req.body;
    if (!title?.trim() || !message?.trim()) {
      throw new HttpError(400, 'A title and message are required.');
    }

    const filter = { suspended: { $ne: true } };
    if (businessType) filter.businessType = businessType;
    if (city) filter['location.city'] = rx(city);

    if (audience === 'providers') {
      const owners = await Resource.distinct('owner', { status: 'active' });
      filter._id = { $in: owners };
    } else if (audience === 'seekers') {
      const seekers = await Requirement.distinct('seeker');
      const buyers = await Booking.distinct('seeker');
      filter._id = { $in: [...new Set([...seekers, ...buyers].map(String))].map(oid) };
    }

    const recipients = await User.find(filter).select('_id').lean();
    if (!recipients.length) throw new HttpError(400, 'That audience matches no businesses.');

    for (const r of recipients) {
      await notify({
        user: r._id,
        type: 'platform_announcement',
        title: title.trim(),
        message: message.trim(),
      });
    }

    res.json({ sent: recipients.length, audience, title: title.trim() });
  })
);

/* ═════════════════════════════════════════════════════════════════ FILTERS */

/** Option lists for the console's own filter controls. */
router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const cities = await User.distinct('location.city');
    res.json({
      categories: RESOURCE_CATEGORIES,
      bookingStatuses: BOOKING_STATUSES,
      requirementStatuses: REQUIREMENT_STATUSES,
      cities: cities.filter(Boolean).sort(),
      admins: (await User.find({}).select('email businessName').lean())
        .filter(isPlatformAdmin)
        .map((u) => ({ email: u.email, businessName: u.businessName })),
    });
  })
);

/* ═════════════════════════════════════════════════════════════ LOGISTICS */

/** Overview and listing of logistics jobs for platform administration */
router.get(
  '/logistics',
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const [jobs, partners, stats] = await Promise.all([
      LogisticsJob.find(filter)
        .populate([
          { path: 'seeker', select: 'businessName email phone location' },
          { path: 'provider', select: 'businessName email phone location' },
          { path: 'logisticsPartner', select: 'businessName email phone logisticsProfile' },
          { path: 'resource', select: 'title category location unit images' },
          { path: 'booking', select: 'status startDateTime endDateTime agreedPrice quotedPrice' },
        ])
        .sort({ createdAt: -1 })
        .lean(),
      User.find({ userType: 'logistics_partner', suspended: false })
        .select('businessName email phone location logisticsProfile')
        .lean(),
      LogisticsJob.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts = Object.fromEntries(stats.map((s) => [s._id, s.count]));

    res.json({
      jobs,
      partners,
      counts: {
        total: jobs.length,
        unassigned: statusCounts.unassigned || 0,
        assigned: statusCounts.assigned || 0,
        active:
          (statusCounts.accepted || 0) +
          (statusCounts.pickup_scheduled || 0) +
          (statusCounts.arrived_at_provider || 0) +
          (statusCounts.picked_up || 0) +
          (statusCounts.in_transit || 0) +
          (statusCounts.return_pickup_scheduled || 0) +
          (statusCounts.return_picked_up || 0) +
          (statusCounts.return_in_transit || 0),
        delivered: statusCounts.delivered || 0,
        completed: statusCounts.completed || 0,
        declined: statusCounts.declined || 0,
        ...statusCounts,
      },
    });
  })
);

/** Admin assign or reassign partner */
router.patch(
  '/logistics/:id/assign',
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

    const previousPartner = job.logisticsPartner;
    job.logisticsPartner = partner._id;
    job.status = 'assigned';
    job.declineReason = undefined;
    job.timeline.push({
      status: 'assigned',
      timestamp: new Date(),
      updatedBy: req.user._id,
      notes: notes || (previousPartner ? `Admin re-assigned to ${partner.businessName}` : `Admin assigned to ${partner.businessName}`),
    });
    await job.save();

    await notify({
      user: partner._id,
      type: 'logistics_assignment',
      title: 'New Logistics Job Assigned',
      message: `Admin assigned you to delivery for booking #${String(job.booking).slice(-6)}.`,
      relatedBooking: job.booking,
      relatedLogisticsJob: job._id,
    });

    res.json({
      job: await job.populate([
        { path: 'seeker', select: 'businessName email phone location' },
        { path: 'provider', select: 'businessName email phone location' },
        { path: 'logisticsPartner', select: 'businessName email phone logisticsProfile' },
        { path: 'resource', select: 'title category location unit images' },
        { path: 'booking', select: 'status startDateTime endDateTime agreedPrice' },
      ]),
    });
  })
);

export default router;
