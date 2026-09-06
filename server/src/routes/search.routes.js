import { Router } from 'express';
import mongoose from 'mongoose';
import Resource from '../models/Resource.js';
import Requirement from '../models/Requirement.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { rankResources } from '../services/matching.service.js';

const router = Router();

/**
 * GET /api/search/resources
 *
 * Runs the discovery pipeline: geo filter -> attribute filter -> availability
 * filter -> weighted ranking.
 *
 * When a logged-in user matches against a requirement (via requirementId),
 * requirement constraints (category, dates, budget, quantity, capacity, radius)
 * are populated and resources receive personalized match scores and highlights.
 *
 * Logged-out users or generic browse requests without a requirement receive
 * clean marketplace results without artificial match percentages.
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
      radiusKm,
      start,
      end,
      minCapacity,
      minPrice,
      maxPrice,
      minRating,
      quantity,
      urgency,
      sort = 'match',
      limit = 40,
      requirementId,
    } = req.query;

    let requirement = null;
    if (
      requirementId &&
      requirementId !== 'none' &&
      requirementId !== 'null' &&
      mongoose.isValidObjectId(requirementId) &&
      req.user
    ) {
      requirement = await Requirement.findOne({
        _id: requirementId,
        seeker: req.user._id,
      }).lean();
    }

    // Populate criteria from requirement when active, allowing explicit query params to override
    const effectiveCategory = category || requirement?.category || undefined;
    const effectiveStart = start ? new Date(start) : requirement?.startDateTime ? new Date(requirement.startDateTime) : null;
    const effectiveEnd = end ? new Date(end) : requirement?.endDateTime ? new Date(requirement.endDateTime) : null;
    const effectiveQuantity = quantity ? Number(quantity) : requirement?.quantity || 1;
    const effectiveMinCapacity = minCapacity ? Number(minCapacity) : requirement?.minCapacity || null;
    const effectiveMaxPrice = maxPrice ? Number(maxPrice) : requirement?.maxPrice || null;
    const effectiveRadius = Number(radiusKm) || requirement?.radiusKm || 25;
    const effectiveUrgency = urgency || requirement?.urgency || 'medium';

    // Only apply a hard distance cutoff if radiusKm was explicitly requested OR specified by an active requirement
    const hasExplicitRadius = Boolean(radiusKm);
    const radiusLimitMeters = hasExplicitRadius
      ? Number(radiusKm) * 1000
      : requirement?.radiusKm
      ? requirement.radiusKm * 1000
      : null;

    // Origin coordinates: explicit query > requirement location > user account location
    const originCoords =
      lat && lng
        ? [Number(lng), Number(lat)]
        : requirement?.location?.coordinates?.length
          ? requirement.location.coordinates
          : req.user?.location?.coordinates?.length
            ? req.user.location.coordinates
            : null;

    const match = { status: 'active' };
    if (effectiveCategory && effectiveCategory !== 'all') match.category = effectiveCategory;
    if (effectiveMinCapacity) match.capacity = { $gte: Number(effectiveMinCapacity) };
    if (minPrice || (effectiveMaxPrice && !requirement)) {
      match['pricing.basePrice'] = {};
      if (minPrice) match['pricing.basePrice'].$gte = Number(minPrice);
      if (effectiveMaxPrice && !requirement) {
        match['pricing.basePrice'].$lte = Number(effectiveMaxPrice);
      }
    }
    if (minRating) match.ratingAvg = { $gte: Number(minRating) };
    if (q) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }

    let candidates;

    if (originCoords) {
      const geoNearStage = {
        near: { type: 'Point', coordinates: originCoords },
        distanceField: 'distanceMeters',
        query: match,
        spherical: true,
      };
      if (radiusLimitMeters) {
        geoNearStage.maxDistance = radiusLimitMeters;
      }

      candidates = await Resource.aggregate([
        { $geoNear: geoNearStage },
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

    // Fallback: If geoNear returned 0 candidates because of user location and no radius was requested,
    // ensure active marketplace resources are still discoverable
    if ((!candidates || candidates.length === 0) && !hasExplicitRadius && !requirement) {
      candidates = await Resource.find(match)
        .limit(Number(limit) * 3)
        .populate('owner', 'businessName ratingAvg ratingCount location')
        .lean();
      candidates = candidates.map((r) => ({ ...r, ownerDoc: r.owner, distanceKm: null }));
    }

    // Only personalize scoring if logged-in AND (matching a requirement OR explicit date query like in tests)
    const isRequirementMatch = Boolean(requirement);
    const hasExplicitQuery = Boolean(effectiveStart && effectiveEnd);
    const shouldScore = Boolean(req.user && (isRequirementMatch || hasExplicitQuery));

    const criteria = {
      start: effectiveStart,
      end: effectiveEnd,
      quantity: effectiveQuantity,
      capacity: effectiveMinCapacity,
      radiusKm: effectiveRadius,
      urgency: effectiveUrgency,
      budget: effectiveMaxPrice,
      maxPrice: effectiveMaxPrice,
      category: effectiveCategory,
      isRequirementMatch,
      skipScoring: !shouldScore,
    };

    let results = await rankResources(candidates, criteria, req.user);

    if (sort === 'price_asc') {
      results.sort((a, b) => (a.pricing?.basePrice ?? 0) - (b.pricing?.basePrice ?? 0));
    } else if (sort === 'price_desc') {
      results.sort((a, b) => (b.pricing?.basePrice ?? 0) - (a.pricing?.basePrice ?? 0));
    } else if (sort === 'distance') {
      results.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    } else if (sort === 'rating') {
      results.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
    } else if (sort === 'match' || !sort) {
      if (shouldScore) {
        results.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      } else {
        results.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
      }
    }

    results = results.slice(0, Number(limit));

    res.json({
      results: results.map((r) => ({
        ...r,
        owner: r.ownerDoc || r.owner,
        ownerDoc: undefined,
      })),
      total: results.length,
      criteria: { ...criteria, hasLocation: Boolean(originCoords) },
      requirement: requirement || null,
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
