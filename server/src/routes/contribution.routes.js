import { Router } from 'express';
import { requireAuth, requireBusinessUser, optionalAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import {
  calculateContributionProfile,
  getPublicReputationProfile,
} from '../services/contribution.service.js';

const router = Router();

/**
 * GET /api/contribution/me
 * Provider gets their own complete contribution intelligence profile,
 * including underlying signals, breakdown, and improvement hints.
 */
router.get(
  '/me',
  requireAuth,
  requireBusinessUser,
  asyncHandler(async (req, res) => {
    const profile = await calculateContributionProfile(req.user._id, {
      bypassCache: req.query.refresh === 'true',
    });
    if (!profile) {
      throw new HttpError(404, 'Contribution profile not found for this account.');
    }
    res.json({ profile });
  })
);

/**
 * GET /api/contribution/business/:id
 * Public endpoint: returns sanitized reputation profile.
 * Does NOT expose private cancellation cases, dispute descriptions,
 * or confidential operational details.
 */
router.get(
  '/business/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const profile = await getPublicReputationProfile(req.params.id, {
      bypassCache: req.query.refresh === 'true',
    });
    if (!profile) {
      throw new HttpError(404, 'Business reputation profile not found.');
    }
    res.json({ profile });
  })
);

/**
 * GET /api/contribution/business/:id/detailed
 * Private detailed breakdown: ONLY the business owner themselves can access
 * private detailed signals (the admin console reads them via /api/admin/contribution). Unrelated businesses are forbidden (403).
 */
router.get(
  '/business/:id/detailed',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (String(req.user._id) !== String(req.params.id)) {
      throw new HttpError(
        403,
        'You are not authorized to view private detailed contribution signals for this business.'
      );
    }

    const profile = await calculateContributionProfile(req.params.id, {
      bypassCache: req.query.refresh === 'true',
    });
    if (!profile) {
      throw new HttpError(404, 'Contribution profile not found.');
    }
    res.json({ profile });
  })
);

export default router;
