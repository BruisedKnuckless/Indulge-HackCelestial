import { Router } from 'express';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const HOUR_MS = 3600 * 1000;

/**
 * Utilization per listing over a window: booked resource-hours as a share of
 * the hours the resource could theoretically have been rented for.
 */
router.get(
  '/utilization',
  requireAuth,
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * HOUR_MS);

    const resources = await Resource.find({ owner: req.user._id, status: { $ne: 'archived' } })
      .select('title category totalQuantity pricing')
      .lean();

    const bookings = await Booking.find({
      provider: req.user._id,
      status: { $in: ['accepted', 'confirmed', 'completed'] },
      startDateTime: { $gte: since },
    })
      .select('resource startDateTime endDateTime requestedQuantity agreedPrice quotedPrice')
      .lean();

    // Hospitality resources are not rentable around the clock — a hall or a
    // kitchen realistically turns over within a working day. Measuring against
    // 24h would make every listing look near-idle, so the denominator uses a
    // 12-hour bookable day, which is how venues quote their own occupancy.
    const BOOKABLE_HOURS_PER_DAY = 12;
    const windowHours = days * BOOKABLE_HOURS_PER_DAY;

    const rows = resources.map((r) => {
      const mine = bookings.filter((b) => String(b.resource) === String(r._id));
      const bookedUnitHours = mine.reduce((sum, b) => {
        const raw = (new Date(b.endDateTime) - new Date(b.startDateTime)) / HOUR_MS;
        // Cap each booking's contribution at the bookable day so an overnight
        // hire cannot report more than a full day of use.
        const spanDays = Math.max(1, Math.ceil(raw / 24));
        const billable = Math.min(raw, spanDays * BOOKABLE_HOURS_PER_DAY);
        return sum + billable * (b.requestedQuantity || 1);
      }, 0);
      const capacityUnitHours = windowHours * (r.totalQuantity || 1);

      return {
        resourceId: r._id,
        title: r.title,
        category: r.category,
        bookings: mine.length,
        utilization: capacityUnitHours
          ? Math.round((bookedUnitHours / capacityUnitHours) * 1000) / 10
          : 0,
        revenue: mine.reduce((s, b) => s + (b.agreedPrice ?? b.quotedPrice ?? 0), 0),
      };
    });

    rows.sort((a, b) => b.utilization - a.utilization);

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const avgUtilization = rows.length
      ? Math.round((rows.reduce((s, r) => s + r.utilization, 0) / rows.length) * 10) / 10
      : 0;

    res.json({ rows, totalRevenue, avgUtilization, days, listings: rows.length });
  })
);

/** Revenue by month for the provider's confirmed/completed bookings. */
router.get(
  '/revenue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await Booking.aggregate([
      {
        $match: {
          provider: oid(req.user._id),
          status: { $in: ['accepted', 'confirmed', 'completed'] },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$startDateTime' }, m: { $month: '$startDateTime' } },
          revenue: { $sum: { $ifNull: ['$agreedPrice', '$quotedPrice'] } },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
      { $limit: 12 },
    ]);

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    res.json({
      series: data.map((d) => ({
        month: `${MONTHS[d._id.m - 1]} ${String(d._id.y).slice(2)}`,
        revenue: d.revenue || 0,
        bookings: d.bookings,
      })),
    });
  })
);

/** Request funnel + category mix, for the dashboard's pie and bar charts. */
router.get(
  '/funnel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [received, sent, byCategory] = await Promise.all([
      Booking.aggregate([
        { $match: { provider: oid(req.user._id) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { seeker: oid(req.user._id) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { provider: oid(req.user._id) } },
        { $lookup: { from: 'resources', localField: 'resource', foreignField: '_id', as: 'r' } },
        { $unwind: '$r' },
        {
          $group: {
            _id: '$r.category',
            count: { $sum: 1 },
            revenue: { $sum: { $ifNull: ['$agreedPrice', '$quotedPrice'] } },
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);

    const shape = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));

    res.json({
      received: shape(received),
      sent: shape(sent),
      byCategory: byCategory.map((c) => ({
        category: c._id,
        count: c.count,
        revenue: c.revenue || 0,
      })),
    });
  })
);

/** Headline numbers for the dashboard tiles. */
router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [listings, pendingIn, activeOut, spendAgg, earnAgg] = await Promise.all([
      Resource.countDocuments({ owner: req.user._id, status: 'active' }),
      Booking.countDocuments({ provider: req.user._id, status: 'pending' }),
      Booking.countDocuments({
        seeker: req.user._id,
        status: { $in: ['pending', 'negotiating', 'accepted', 'confirmed'] },
      }),
      Booking.aggregate([
        {
          $match: {
            seeker: oid(req.user._id),
            status: { $in: ['confirmed', 'completed'] },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$agreedPrice', '$quotedPrice'] } } } },
      ]),
      Booking.aggregate([
        {
          $match: {
            provider: oid(req.user._id),
            status: { $in: ['confirmed', 'completed'] },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$agreedPrice', '$quotedPrice'] } } } },
      ]),
    ]);

    res.json({
      activeListings: listings,
      pendingRequests: pendingIn,
      activeRequests: activeOut,
      totalSpend: spendAgg[0]?.total || 0,
      totalEarned: earnAgg[0]?.total || 0,
    });
  })
);

export default router;
