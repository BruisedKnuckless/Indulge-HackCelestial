import { Router } from 'express';
import mongoose from 'mongoose';
import Resource from '../models/Resource.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { rankResources } from '../services/matching.service.js';

const router = Router();

/**
 * GET /api/search/resources
 *
 * Runs the discovery pipeline: geo filter -> attribute filter -> availability
 * filter -> weighted ranking. Everything after $geoNear is optional, so an
 * empty query still returns a browsable, ranked list.
 */
router.get(
  '/resources',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const {
      q,
      category,
      lat,
      lng,
      radiusKm = 25,
      start,
      end,
      minCapacity,
      maxPrice,
      minRating,
      quantity = 1,
      urgency = 'medium',
      sort = 'match',
      limit = 40,
    } = req.query;

    const radius = Number(radiusKm) || 25;

    // Fall back to the signed-in business's own location so "near me" works
    // without the browser geolocation prompt.
    const originCoords =
      lat && lng
        ? [Number(lng), Number(lat)]
        : req.user?.location?.coordinates?.length
          ? req.user.location.coordinates
          : null;

    const match = { status: 'active' };
    if (category && category !== 'all') match.category = category;
    if (minCapacity) match.capacity = { $gte: Number(minCapacity) };
    if (maxPrice) match['pricing.basePrice'] = { $lte: Number(maxPrice) };
    if (minRating) match.ratingAvg = { $gte: Number(minRating) };
    if (q) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }

    let candidates;

    if (originCoords) {
      // $geoNear must be the first stage in the pipeline.
      candidates = await Resource.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: originCoords },
            distanceField: 'distanceMeters',
            maxDistance: radius * 1000,
            query: match,
            spherical: true,
          },
        },
        { $limit: Number(limit) * 3 },
        {
          $lookup: {
            from: 'users',
            localField: 'owner',
            foreignField: '_id',
            as: 'ownerDoc',
          },
        },
        { $unwind: '$ownerDoc' },
        { $addFields: { distanceKm: { $divide: ['$distanceMeters', 1000] } } },
        { $project: { 'ownerDoc.passwordHash': 0 } },
      ]);
    } else {
      candidates = await Resource.find(match)
        .limit(Number(limit) * 3)
        .populate('owner', 'businessName ratingAvg ratingCount location')
        .lean();
      candidates = candidates.map((r) => ({ ...r, ownerDoc: r.owner, distanceKm: null }));
    }

    const criteria = {
      start: start ? new Date(start) : null,
      end: end ? new Date(end) : null,
      quantity: Number(quantity) || 1,
      capacity: minCapacity ? Number(minCapacity) : null,
      radiusKm: radius,
      urgency,
    };

    let results = await rankResources(candidates, criteria, req.user);

    if (sort === 'price_asc') results.sort((a, b) => a.pricing.basePrice - b.pricing.basePrice);
    else if (sort === 'price_desc') results.sort((a, b) => b.pricing.basePrice - a.pricing.basePrice);
    else if (sort === 'distance') results.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    else if (sort === 'rating') results.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));

    results = results.slice(0, Number(limit));

    res.json({
      results: results.map((r) => ({
        ...r,
        owner: r.ownerDoc || r.owner,
        ownerDoc: undefined,
      })),
      total: results.length,
      criteria: { ...criteria, hasLocation: Boolean(originCoords) },
    });
  })
);

/** Lightweight type-ahead for the header search bar. */
router.get(
  '/suggest',
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ suggestions: [] });

    const rx = new RegExp('^' + q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const found = await Resource.find({ status: 'active', $or: [{ title: rx }, { tags: rx }] })
      .select('title category')
      .limit(8)
      .lean();

    res.json({ suggestions: found });
  })
);

export default router;
