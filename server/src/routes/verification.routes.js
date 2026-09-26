import { Router } from 'express';
import VerificationRequest from '../models/VerificationRequest.js';
import VerificationTemplate from '../models/VerificationTemplate.js';
import Resource from '../models/Resource.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { uploadMiddleware, getMediaProvider } from '../services/media.service.js';
import { generateInspectionGuidelines, DEFAULT_CATEGORY_TEMPLATES } from '../services/verification/guideline.service.js';
import { generatePriceRecommendation } from '../services/verification/pricing-recommendation.service.js';
import {
  createVerificationForResource,
  calculateConditionScore,
  submitInspection,
} from '../services/verification/verification.service.js';

const router = Router();

/**
 * GET /api/verification-templates
 * Returns all active category guideline templates and defaults.
 */
router.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    const dbTemplates = await VerificationTemplate.find({ isActive: true }).lean();
    res.json({
      templates: dbTemplates.length > 0 ? dbTemplates : Object.values(DEFAULT_CATEGORY_TEMPLATES),
    });
  })
);

/**
 * POST /api/verifications/generate-guidelines
 * Modular endpoint for future ML/adapter model compatibility.
 * Generates inspection checklist for a given category & resource info.
 */
router.post(
  '/generate-guidelines',
  asyncHandler(async (req, res) => {
    const { category, resourceType, resourceName, description, metadata } = req.body;
    if (!category) {
      throw new HttpError(400, 'Resource category is required to generate guidelines.');
    }
    const result = await generateInspectionGuidelines({
      category,
      resourceType,
      resourceName,
      description,
      metadata,
    });
    res.json(result);
  })
);

/**
 * GET /api/verifications
 * Fetches verification requests with filters for the technician dashboard.
 * Supports query: status, tab ('today', 'assigned', 'in_progress', 'completed', 'all'), search.
 */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { tab, status, category, search } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    } else if (tab === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      filter.scheduledAt = { $gte: startOfDay, $lte: endOfDay };
    } else if (tab === 'assigned') {
      filter.status = { $in: ['pending', 'assigned', 'scheduled'] };
    } else if (tab === 'in_progress') {
      filter.status = 'in_progress';
    } else if (tab === 'completed') {
      filter.status = { $in: ['submitted', 'verified', 'conditionally_verified', 'rejected'] };
    }

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { inspectionId: { $regex: search, $options: 'i' } },
        { resourceName: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
      ];
    }

    const verifications = await VerificationRequest.find(filter)
      .populate('provider', 'businessName email phone location')
      .populate('resource', 'title category images media totalQuantity pricing location')
      .sort({ createdAt: -1 })
      .lean();

    // Summary statistics for inspector dashboard header
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [todayCount, pendingCount, inProgressCount, completedCount] = await Promise.all([
      VerificationRequest.countDocuments({ scheduledAt: { $gte: startOfToday, $lte: endOfToday } }),
      VerificationRequest.countDocuments({ status: { $in: ['pending', 'assigned', 'scheduled'] } }),
      VerificationRequest.countDocuments({ status: 'in_progress' }),
      VerificationRequest.countDocuments({
        status: { $in: ['submitted', 'verified', 'conditionally_verified', 'rejected'] },
      }),
    ]);

    res.json({
      verifications,
      counts: {
        totalToday: todayCount,
        pendingAction: pendingCount,
        inProgress: inProgressCount,
        completed: completedCount,
      },
    });
  })
);

/**
 * POST /api/verifications
 * Manual creation of a verification request for an existing listing if needed.
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { resourceId } = req.body;
    if (!resourceId) throw new HttpError(400, 'resourceId is required.');

    const resource = await Resource.findById(resourceId);
    if (!resource) throw new HttpError(404, 'Resource not found.');

    const vr = await createVerificationForResource(resource, req.user);
    if (!vr) throw new HttpError(500, 'Failed to create verification request.');

    res.status(201).json({ verification: vr });
  })
);

/**
 * GET /api/verifications/:id
 * Detailed verification request with inspection checklist, resource details, and provider.
 */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const vr = await VerificationRequest.findById(req.params.id)
      .populate('provider', 'businessName email phone location')
      .populate('resource')
      .lean();

    if (!vr) throw new HttpError(404, 'Verification request not found.');
    res.json({ verification: vr });
  })
);

/**
 * POST /api/verifications/:id/start
 * Representative clicks [ Start Inspection ]: transitions status to 'in_progress'.
 */
router.post(
  '/:id/start',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const vr = await VerificationRequest.findById(req.params.id);
    if (!vr) throw new HttpError(404, 'Verification request not found.');

    if (vr.status === 'pending' || vr.status === 'assigned' || vr.status === 'scheduled') {
      vr.status = 'in_progress';
      vr.startedAt = new Date();
      await vr.save();

      // Reflect in Resource
      await Resource.findByIdAndUpdate(vr.resource, { verificationStatus: 'in_progress' });
    }

    res.json({ verification: vr });
  })
);

/**
 * PATCH /api/verifications/:id/parameters/:parameterId
 * Update an individual parameter's rating, notes, photos, or damage flag in real-time.
 */
router.patch(
  '/:id/parameters/:parameterId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { rating, notes, photos, issueFlag, issueDescription } = req.body;
    const vr = await VerificationRequest.findById(req.params.id);
    if (!vr) throw new HttpError(404, 'Verification request not found.');

    const param = vr.parameters.find((p) => p.id === req.params.parameterId);
    if (!param) throw new HttpError(404, 'Parameter not found in this inspection.');

    if (rating !== undefined) {
      const numRating = Number(rating);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        throw new HttpError(400, 'Rating must be an integer between 1 and 5.');
      }
      param.rating = numRating;
    }

    if (notes !== undefined) param.notes = notes;
    if (photos !== undefined && Array.isArray(photos)) param.photos = photos;
    if (issueFlag !== undefined) param.issueFlag = issueFlag;
    if (issueDescription !== undefined) param.issueDescription = issueDescription;

    await vr.save();
    res.json({ parameter: param, verification: vr });
  })
);

/**
 * POST /api/verifications/:id/evidence
 * Uploads evidence photos to the inspection (via file upload or URL payload).
 */
router.post(
  '/:id/evidence',
  optionalAuth,
  uploadMiddleware.single('image'),
  asyncHandler(async (req, res) => {
    const vr = await VerificationRequest.findById(req.params.id);
    if (!vr) throw new HttpError(404, 'Verification request not found.');

    const { caption, parameterId, issueLevel, url } = req.body;
    let imageUrl = url;

    if (req.file) {
      const provider = getMediaProvider();
      const uploaded = await provider.upload(req.file);
      imageUrl = uploaded.url;
    }

    if (!imageUrl) {
      throw new HttpError(400, 'Image file or image URL is required.');
    }

    const evidenceItem = {
      url: imageUrl,
      caption: caption || '',
      parameterId: parameterId || null,
      issueLevel: issueLevel || 'none',
      uploadedAt: new Date(),
    };

    vr.evidence.push(evidenceItem);

    // If attached to a specific parameter, also push into parameter.photos
    if (parameterId) {
      const param = vr.parameters.find((p) => p.id === parameterId);
      if (param && !param.photos.includes(imageUrl)) {
        param.photos.push(imageUrl);
      }
    }

    await vr.save();
    res.status(201).json({ evidence: evidenceItem, verification: vr });
  })
);

/**
 * POST /api/verifications/:id/recommend-price
 * Computes/previews recommended price dynamically based on current ratings and condition score.
 */
router.post(
  '/:id/recommend-price',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const vr = await VerificationRequest.findById(req.params.id);
    if (!vr) throw new HttpError(404, 'Verification request not found.');

    const currentScore = calculateConditionScore(vr.parameters);
    const recommendation = await generatePriceRecommendation({
      listedPrice: vr.listedPrice,
      category: vr.category,
      priceUnit: vr.priceUnit,
      conditionScore: currentScore.score,
      quantity: vr.quantity,
      parameters: vr.parameters,
      location: vr.location?.city,
    });

    res.json({
      conditionScore: currentScore.score,
      conditionStatus: currentScore.conditionStatus,
      verificationLevel: currentScore.verificationLevel,
      recommendedPrice: recommendation,
    });
  })
);

/**
 * POST /api/verifications/:id/submit
 * Finalizes the inspection: computes score, generates price, sets status, updates listing.
 */
router.post(
  '/:id/submit',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const updated = await submitInspection(req.params.id, req.user, req.body);
    res.json({ verification: updated });
  })
);

/**
 * PATCH /api/verifications/:id/status
 * Administrative or manual status update if needed.
 */
router.patch(
  '/:id/status',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const vr = await VerificationRequest.findById(req.params.id);
    if (!vr) throw new HttpError(404, 'Verification request not found.');

    vr.status = status;
    await vr.save();

    await Resource.findByIdAndUpdate(vr.resource, { verificationStatus: status });
    res.json({ verification: vr });
  })
);

export default router;
