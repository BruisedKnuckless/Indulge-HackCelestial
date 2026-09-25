import { Router } from 'express';
import CapacityRecoveryOpportunity from '../models/CapacityRecoveryOpportunity.js';
import { requireAuth, requireBusinessUser } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import {
  getProviderRecoveryOverview,
  respondToRecoveryOpportunity,
} from '../services/capacity-recovery.service.js';
import { isPlatformAdmin } from '../config/admin.js';

const router = Router();

/**
 * GET /api/capacity-recovery/mine
 * Retrieves active capacity recovery opportunities and utilization analytics for the authenticated provider.
 */
router.get(
  '/mine',
  requireAuth,
  requireBusinessUser,
  asyncHandler(async (req, res) => {
    const horizonHours = req.query.horizonHours ? Number(req.query.horizonHours) : 72;
    const result = await getProviderRecoveryOverview(req.user._id, { horizonHours });
    res.json(result);
  })
);

/**
 * GET /api/capacity-recovery/:id
 * Retrieve details for a specific capacity recovery opportunity.
 * Restricted to the opportunity owner (provider) and platform admins.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const opportunity = await CapacityRecoveryOpportunity.findById(req.params.id)
      .populate({
        path: 'resource',
        select: 'title category totalQuantity capacity pricing images location unit',
      })
      .populate({
        path: 'requirement',
        select: 'title category requiredQuantity quantity startDateTime endDateTime location maxBudget maxPrice urgency seeker',
      });

    if (!opportunity) {
      throw new HttpError(404, 'Capacity recovery opportunity not found.');
    }

    const isOwner = String(opportunity.provider) === String(req.user._id);
    const isAdmin = isPlatformAdmin(req.user);

    if (!isOwner && !isAdmin) {
      throw new HttpError(
        403,
        'Access denied. You do not have permission to view this capacity recovery opportunity.'
      );
    }

    res.json({ opportunity });
  })
);

/**
 * POST /api/capacity-recovery/:id/respond
 * Converts a capacity recovery opportunity into a submitted RFQ proposal.
 */
router.post(
  '/:id/respond',
  requireAuth,
  requireBusinessUser,
  asyncHandler(async (req, res) => {
    const { quotedPrice, notes, proposedStart, proposedEnd } = req.body;

    const result = await respondToRecoveryOpportunity({
      opportunityId: req.params.id,
      providerId: req.user._id,
      quotedPrice,
      notes,
      proposedStart,
      proposedEnd,
    });

    res.status(201).json(result);
  })
);

export default router;
