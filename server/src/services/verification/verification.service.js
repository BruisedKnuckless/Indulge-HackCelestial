import VerificationRequest from '../../models/VerificationRequest.js';
import Resource from '../../models/Resource.js';
import { generateInspectionGuidelines } from './guideline.service.js';
import { generatePriceRecommendation } from './pricing-recommendation.service.js';
import { logger } from '../../utils/logger.js';
import { HttpError } from '../../middleware/error.middleware.js';

/**
 * Creates an inspection request for a newly listed resource.
 * Designed with graceful fallback so listing creation NEVER fails even if
 * guideline generation or request saving encounters an unexpected issue.
 *
 * @param {Object} resource - Mongoose Resource document
 * @param {Object} user - User document who owns the resource
 * @returns {Promise<Object|null>} Created VerificationRequest or null on failure
 */
export async function createVerificationForResource(resource, user) {
  try {
    const { templateId, parameters } = await generateInspectionGuidelines({
      category: resource.category,
      resourceType: resource.category,
      resourceName: resource.title,
      description: resource.description,
      metadata: {
        totalQuantity: resource.totalQuantity,
        unit: resource.unit,
        pricing: resource.pricing,
      },
    });

    const vr = await VerificationRequest.create({
      resource: resource._id,
      provider: resource.owner || user?._id,
      category: resource.category,
      resourceName: resource.title,
      status: 'pending',
      generatedTemplateId: templateId,
      parameters,
      assignedTechnician: {
        id: user?.userType === 'inspector' ? user._id : undefined,
        name: 'Rahul Sharma',
        badge: 'Senior Field Inspector',
        phone: '+91 98200 99001',
      },
      location: {
        address: resource.location?.address || user?.location?.address || 'Mumbai',
        city: resource.location?.city || user?.location?.city || 'Mumbai',
      },
      quantity: resource.totalQuantity || 1,
      listedPrice: resource.pricing?.basePrice || 0,
      priceUnit: resource.pricing?.priceUnit || 'per_day',
    });

    // Update resource reference
    await Resource.findByIdAndUpdate(resource._id, {
      verificationStatus: 'pending',
      verificationId: vr._id,
    });

    logger.info('Verification request auto-generated for resource:', {
      resourceId: resource._id,
      inspectionId: vr.inspectionId,
      parametersCount: parameters.length,
    });

    return vr;
  } catch (err) {
    logger.error('Graceful fallback: failed to auto-generate verification request for resource:', {
      resourceId: resource?._id,
      error: err.message,
    });
    return null;
  }
}

/**
 * Calculates weighted condition score, status, and verification outcome.
 *
 * @param {Array} parameters
 * @returns {{ score: number, conditionStatus: string, verificationLevel: string, status: string }}
 */
export function calculateConditionScore(parameters = []) {
  if (!parameters || parameters.length === 0) {
    return {
      score: 0,
      conditionStatus: 'Poor',
      verificationLevel: 'Rejected',
      status: 'rejected',
    };
  }

  let totalWeight = 0;
  let weightedSum = 0;
  let majorIssuesCount = 0;
  let minorIssuesCount = 0;
  let criticalCheckFailed = false;

  for (const p of parameters) {
    const weight = Number(p.weight) || 0.1;
    totalWeight += weight;

    const rating = Number(p.rating);
    const scale = Number(p.ratingScale) || 5;

    if (rating && !isNaN(rating)) {
      weightedSum += (rating / scale) * weight;

      // If a required parameter is rated critically low (1 out of 5)
      if (p.required && rating <= 1) {
        criticalCheckFailed = true;
      }
    }

    if (p.issueFlag === 'major') majorIssuesCount++;
    if (p.issueFlag === 'minor') minorIssuesCount++;
  }

  const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Condition Status determination
  let conditionStatus = 'Poor';
  if (score >= 90) conditionStatus = 'Excellent';
  else if (score >= 75) conditionStatus = 'Good';
  else if (score >= 60) conditionStatus = 'Fair';
  else if (score >= 40) conditionStatus = 'Needs Attention';

  // Result verification state
  // VERIFIED: Score >= 75, no major issues, no critical check failures
  // CONDITIONALLY VERIFIED: Score >= 50, acceptable with minor issues
  // REJECTED: Score < 50, or major issues > 0, or critical safety check failed
  let verificationLevel = 'Indulge Verified';
  let status = 'verified';

  if (majorIssuesCount > 0 || criticalCheckFailed || score < 50) {
    verificationLevel = 'Rejected';
    status = 'rejected';
  } else if (minorIssuesCount > 0 || score < 75) {
    verificationLevel = 'Conditionally Verified';
    status = 'conditionally_verified';
  }

  return {
    score,
    conditionStatus,
    verificationLevel,
    status,
  };
}

/**
 * Submits an inspection, recalculates condition score, generates recommended pricing,
 * and updates the underlying listing.
 *
 * @param {string} verificationId
 * @param {Object} inspectorUser
 * @param {Object} payload
 * @returns {Promise<Object>} Updated VerificationRequest
 */
export async function submitInspection(verificationId, inspectorUser, payload = {}) {
  const vr = await VerificationRequest.findById(verificationId);
  if (!vr) throw new HttpError(404, 'Verification request not found.');

  // Merge updated parameters if provided
  if (Array.isArray(payload.parameters)) {
    const updatedMap = new Map(payload.parameters.map((p) => [p.id, p]));
    vr.parameters = vr.parameters.map((existing) => {
      const update = updatedMap.get(existing.id);
      if (!update) return existing;
      return {
        ...existing.toObject(),
        rating: update.rating != null ? Number(update.rating) : existing.rating,
        notes: update.notes !== undefined ? update.notes : existing.notes,
        photos: Array.isArray(update.photos) ? update.photos : existing.photos,
        issueFlag: update.issueFlag || existing.issueFlag || 'none',
        issueDescription: update.issueDescription !== undefined ? update.issueDescription : existing.issueDescription,
      };
    });
  }

  // Append evidence if provided
  if (Array.isArray(payload.evidence)) {
    for (const ev of payload.evidence) {
      if (ev.url) {
        vr.evidence.push({
          url: ev.url,
          caption: ev.caption || '',
          parameterId: ev.parameterId || null,
          issueLevel: ev.issueLevel || 'none',
          uploadedAt: new Date(),
        });
      }
    }
  }

  if (payload.inspectorNotes !== undefined) {
    vr.inspectorNotes = payload.inspectorNotes;
  }

  // Calculate scores
  const scoreResult = calculateConditionScore(vr.parameters);
  vr.finalScore = scoreResult.score;
  vr.conditionStatus = scoreResult.conditionStatus;
  vr.verificationLevel = scoreResult.verificationLevel;
  vr.status = scoreResult.status;
  vr.completedAt = new Date();

  // Generate recommended rental price
  const priceRec = await generatePriceRecommendation({
    listedPrice: vr.listedPrice,
    category: vr.category,
    priceUnit: vr.priceUnit,
    conditionScore: vr.finalScore,
    quantity: vr.quantity,
    parameters: vr.parameters,
    location: vr.location?.city,
  });

  vr.recommendedPrice = {
    ...priceRec,
    generatedAt: new Date(),
  };

  await vr.save();

  // Update linked Resource
  const resourceUpdate = {
    verificationStatus: vr.status,
    verificationId: vr._id,
    conditionScore: vr.finalScore,
    recommendedPrice: {
      basePrice: vr.recommendedPrice.recommendedPrice,
      lowerBound: vr.recommendedPrice.lowerBound,
      upperBound: vr.recommendedPrice.upperBound,
      score: vr.recommendedPrice.score,
      explanation: vr.recommendedPrice.explanation,
    },
  };

  if (vr.status === 'verified' || vr.status === 'conditionally_verified') {
    resourceUpdate.verifiedAt = new Date();
  }

  await Resource.findByIdAndUpdate(vr.resource, resourceUpdate);

  logger.info('Inspection successfully submitted and scored:', {
    verificationId: vr._id,
    inspectionId: vr.inspectionId,
    score: vr.finalScore,
    status: vr.status,
    recommendedPrice: vr.recommendedPrice.recommendedPrice,
  });

  return vr;
}
