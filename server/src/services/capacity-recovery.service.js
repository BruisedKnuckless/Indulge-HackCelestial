import Resource from '../models/Resource.js';
import Requirement from '../models/Requirement.js';
import CapacityRecoveryOpportunity from '../models/CapacityRecoveryOpportunity.js';
import Proposal from '../models/Proposal.js';
import { getAvailableQuantity } from './availability.service.js';
import { calculateDistanceKm } from './procurement-solver.service.js';
import { HttpError } from '../middleware/error.middleware.js';
import { notify } from './notification.service.js';

export const DEFAULT_RECOVERY_HORIZON_HOURS = 72;

/**
 * Calculates a transparent, deterministic recovery priority score (0 - 100)
 * based on urgency, quantity fit, distance, budget fit, and potential utilization gain.
 */
export function calculateRecoveryPriorityScore({
  hoursUntilExpiry,
  availableQuantity,
  requiredQuantity,
  utilizationGain,
  distanceKm,
  estimatedRevenue,
  maxBudget,
}) {
  // 1. Urgency Score (up to 30 pts): nearer expiry = higher recovery value
  let urgencyScore = 5;
  if (hoursUntilExpiry <= 24) {
    urgencyScore = 30;
  } else if (hoursUntilExpiry <= 48) {
    urgencyScore = 20;
  } else if (hoursUntilExpiry <= 72) {
    urgencyScore = 10;
  }

  // 2. Quantity & Utilization Fit (up to 30 pts)
  let quantityScore = 0;
  if (availableQuantity >= requiredQuantity) {
    quantityScore += 20; // 100% demand covered
  } else {
    quantityScore += Math.round((availableQuantity / (requiredQuantity || 1)) * 20);
  }
  quantityScore += Math.round(((utilizationGain || 0) / 100) * 10);
  quantityScore = Math.min(30, Math.max(0, quantityScore));

  // 3. Distance Score (up to 20 pts)
  let distanceScore = 10;
  if (distanceKm != null) {
    if (distanceKm <= 3) {
      distanceScore = 20;
    } else if (distanceKm <= 10) {
      distanceScore = 15;
    } else if (distanceKm <= 25) {
      distanceScore = 10;
    } else if (distanceKm <= 50) {
      distanceScore = 5;
    } else {
      distanceScore = 0;
    }
  }

  // 4. Budget & Price Compatibility (up to 20 pts)
  let budgetScore = 15;
  if (maxBudget != null && maxBudget > 0) {
    if (estimatedRevenue <= maxBudget) {
      budgetScore = 20;
    } else if (estimatedRevenue <= maxBudget * 1.2) {
      budgetScore = 10;
    } else {
      budgetScore = 5;
    }
  }

  const recoveryPriorityScore = Math.min(
    100,
    Math.max(0, urgencyScore + quantityScore + distanceScore + budgetScore)
  );

  return {
    recoveryPriorityScore,
    scoreBreakdown: {
      urgencyScore,
      quantityScore,
      distanceScore,
      budgetScore,
      hoursUntilExpiry,
      utilizationGain,
    },
  };
}

/**
 * Scans active resources and upcoming open requirements within a recovery horizon,
 * performs live true-availability evaluation, auto-expires stale opportunities,
 * and synchronizes capacity recovery opportunities.
 */
export async function scanAndSyncCapacityRecovery({
  providerId = null,
  horizonHours = DEFAULT_RECOVERY_HORIZON_HOURS,
  now = new Date(),
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const horizonMs = horizonHours * 3600 * 1000;
  const horizonEnd = new Date(nowDate.getTime() + horizonMs);

  // 1. Auto-expire passed opportunities or opportunities where resource or requirement is no longer active/open
  await CapacityRecoveryOpportunity.updateMany(
    {
      status: { $in: ['active', 'claimed'] },
      $or: [{ expiresAt: { $lte: nowDate } }, { opportunityStart: { $lte: nowDate } }],
    },
    { status: 'expired' }
  );

  const inactiveResourceIds = await Resource.find({ status: { $ne: 'active' } }).distinct('_id');
  const inactiveReqIds = await Requirement.find({ status: { $ne: 'open' } }).distinct('_id');
  if (inactiveResourceIds.length || inactiveReqIds.length) {
    const invalidConditions = [];
    if (inactiveResourceIds.length) invalidConditions.push({ resource: { $in: inactiveResourceIds } });
    if (inactiveReqIds.length) invalidConditions.push({ requirement: { $in: inactiveReqIds } });
    await CapacityRecoveryOpportunity.updateMany(
      {
        status: 'active',
        $or: invalidConditions,
      },
      { status: 'expired' }
    );
  }

  // 2. Fetch active candidate resources
  const resourceFilter = { status: 'active' };
  if (providerId) {
    resourceFilter.owner = providerId;
  }
  const resources = await Resource.find(resourceFilter).lean();
  if (resources.length === 0) {
    return [];
  }

  // 3. Fetch open requirements starting within horizon
  const requirements = await Requirement.find({
    status: 'open',
    startDateTime: { $gt: nowDate, $lte: horizonEnd },
  }).lean();

  if (requirements.length === 0) {
    return [];
  }

  // 4. Match resources against requirements
  const syncedOpportunities = [];

  for (const res of resources) {
    for (const req of requirements) {
      // Must match category
      if (res.category !== req.category) {
        continue;
      }

      // If requirement has minCapacity, resource must meet it
      if (req.minCapacity != null && (res.capacity == null || res.capacity < req.minCapacity)) {
        continue;
      }

      // Check distance if both locations exist
      const dist = calculateDistanceKm(res.location?.coordinates, req.location?.coordinates);
      const maxRadius = req.location?.radiusKm || req.radiusKm || 50;
      if (dist != null && dist > maxRadius) {
        continue;
      }

      // Live inventory availability check
      const start = new Date(req.startDateTime);
      const end = new Date(req.endDateTime);
      const avail = await getAvailableQuantity(res._id, start, end, { resource: res });

      if (avail.available <= 0) {
        // Invalidate any existing opportunity for this pair
        await CapacityRecoveryOpportunity.updateMany(
          { resource: res._id, requirement: req._id, status: 'active' },
          { status: 'expired' }
        );
        continue;
      }

      let availableQuantity = avail.available;
      let requiredQuantity = req.requiredQuantity || req.quantity || 1;
      let baseCap = res.totalQuantity || availableQuantity;
      let matchedQuantity = Math.min(availableQuantity, requiredQuantity);
      let estimatedRevenue = 0;

      const isExclusiveCapacity = res.capacity != null && res.capacity > 0;
      if (isExclusiveCapacity) {
        // Single/Exclusive capacity (e.g. banquet hall with capacity 300)
        availableQuantity = res.capacity;
        requiredQuantity = req.minCapacity || req.requiredQuantity || req.quantity || 1;
        baseCap = res.capacity;
        matchedQuantity = Math.min(availableQuantity, requiredQuantity);
        // Exclusive space booking yields full base price
        estimatedRevenue = res.pricing?.basePrice || 0;
      } else {
        // Quantity-based inventory (e.g. 10 projectors, 500 chairs)
        const unitPrice = res.pricing?.basePrice || 0;
        estimatedRevenue = unitPrice * matchedQuantity;
      }

      // Potential utilization gain (e.g., 250 / 300 = 83%)
      const utilizationGain = Math.min(
        100,
        Math.max(1, Math.round((matchedQuantity / (baseCap || 1)) * 100))
      );

      // Calculate hours until expiry
      const diffMs = start.getTime() - nowDate.getTime();
      const hoursUntilExpiry = Math.max(0, Math.round((diffMs / (3600 * 1000)) * 10) / 10);

      const maxBudget = req.maxBudget || req.maxPrice;

      // Deterministic priority score
      const { recoveryPriorityScore, scoreBreakdown } = calculateRecoveryPriorityScore({
        hoursUntilExpiry,
        availableQuantity,
        requiredQuantity,
        utilizationGain,
        distanceKm: dist,
        estimatedRevenue,
        maxBudget,
      });

      // Upsert or update opportunity
      const existingOpp = await CapacityRecoveryOpportunity.findOne({
        resource: res._id,
        requirement: req._id,
      });

      let opp;
      if (!existingOpp) {
        opp = await CapacityRecoveryOpportunity.create({
          resource: res._id,
          requirement: req._id,
          provider: res.owner,
          availableQuantity,
          requiredQuantity,
          opportunityStart: start,
          opportunityEnd: end,
          hoursUntilExpiry,
          distanceKm: dist != null ? dist : 0,
          estimatedRevenue,
          utilizationGain,
          recoveryPriorityScore,
          scoreBreakdown,
          expiresAt: start,
          status: 'active',
        });
      } else {
        existingOpp.provider = res.owner;
        existingOpp.availableQuantity = availableQuantity;
        existingOpp.requiredQuantity = requiredQuantity;
        existingOpp.opportunityStart = start;
        existingOpp.opportunityEnd = end;
        existingOpp.hoursUntilExpiry = hoursUntilExpiry;
        existingOpp.distanceKm = dist != null ? dist : 0;
        existingOpp.estimatedRevenue = estimatedRevenue;
        existingOpp.utilizationGain = utilizationGain;
        existingOpp.recoveryPriorityScore = recoveryPriorityScore;
        existingOpp.scoreBreakdown = scoreBreakdown;
        existingOpp.expiresAt = start;
        if (!['claimed', 'converted', 'dismissed'].includes(existingOpp.status)) {
          existingOpp.status = 'active';
        }
        await existingOpp.save();
        opp = existingOpp;
      }

      // If it was already active or freshly created, add to results
      if (opp.status === 'active') {
        syncedOpportunities.push(opp);
      }
    }
  }

  // Deterministically sort opportunities: highest recovery priority score first, then earliest start
  syncedOpportunities.sort((a, b) => {
    if (b.recoveryPriorityScore !== a.recoveryPriorityScore) {
      return b.recoveryPriorityScore - a.recoveryPriorityScore;
    }
    return new Date(a.opportunityStart) - new Date(b.opportunityStart);
  });

  return syncedOpportunities;
}

/**
 * Returns active recovery opportunities for a specific provider along with
 * deterministic capacity recovery analytics.
 */
export async function getProviderRecoveryOverview(providerId, { horizonHours = DEFAULT_RECOVERY_HORIZON_HOURS } = {}) {
  // Sync live state
  await scanAndSyncCapacityRecovery({ providerId, horizonHours });

  // Query active opportunities
  const opportunities = await CapacityRecoveryOpportunity.find({
    provider: providerId,
    status: 'active',
    expiresAt: { $gt: new Date() },
  })
    .populate({
      path: 'resource',
      select: 'title category totalQuantity capacity pricing images location unit',
    })
    .populate({
      path: 'requirement',
      select: 'title category requiredQuantity quantity startDateTime endDateTime location maxBudget maxPrice urgency seeker',
    })
    .sort('-recoveryPriorityScore')
    .lean();

  // Query converted opportunities for analytics
  const converted = await CapacityRecoveryOpportunity.find({
    provider: providerId,
    status: 'converted',
  }).lean();

  const expiredCount = await CapacityRecoveryOpportunity.countDocuments({
    provider: providerId,
    status: 'expired',
  });

  // Calculate provider analytics
  const idleCapacityIdentified = opportunities.reduce((sum, o) => sum + (o.availableQuantity || 0), 0) +
    converted.reduce((sum, o) => sum + (o.availableQuantity || 0), 0);

  const recoveredQuantity = converted.reduce(
    (sum, o) => sum + Math.min(o.availableQuantity || 0, o.requiredQuantity || 0),
    0
  );

  const estimatedRecoveredRevenue = converted.reduce((sum, o) => sum + (o.estimatedRevenue || 0), 0);

  const avgUtilization =
    converted.length > 0
      ? Math.round(converted.reduce((sum, o) => sum + (o.utilizationGain || 0), 0) / converted.length)
      : 0;

  return {
    opportunities,
    analytics: {
      idleCapacityIdentified,
      recoveredQuantity,
      utilizationRecovered: avgUtilization,
      estimatedRecoveredRevenue,
      opportunitiesConverted: converted.length,
      opportunitiesExpired: expiredCount,
    },
  };
}

/**
 * Returns marketplace-level capacity recovery metrics for Admin operations.
 */
export async function getAdminRecoveryMetrics() {
  const now = new Date();

  // Clean up passed opportunities
  await CapacityRecoveryOpportunity.updateMany(
    { status: 'active', expiresAt: { $lte: now } },
    { status: 'expired' }
  );

  const activeOpportunities = await CapacityRecoveryOpportunity.countDocuments({
    status: 'active',
    expiresAt: { $gt: now },
  });

  const converted = await CapacityRecoveryOpportunity.find({ status: 'converted' }).lean();

  const recoveredCapacity = converted.reduce(
    (sum, o) => sum + Math.min(o.availableQuantity || 0, o.requiredQuantity || 0),
    0
  );

  const convertedRecoveryValue = converted.reduce((sum, o) => sum + (o.estimatedRevenue || 0), 0);

  const expiringOpportunities = await CapacityRecoveryOpportunity.countDocuments({
    status: 'active',
    expiresAt: { $gt: now },
    hoursUntilExpiry: { $lte: 24 },
  });

  const recentOpportunities = await CapacityRecoveryOpportunity.find({ status: 'active', expiresAt: { $gt: now } })
    .populate('resource', 'title category pricing')
    .populate('requirement', 'title category requiredQuantity startDateTime location')
    .populate('provider', 'businessName')
    .sort('-recoveryPriorityScore')
    .limit(10)
    .lean();

  return {
    activeOpportunities,
    recoveredCapacity,
    convertedRecoveryValue,
    expiringOpportunities,
    recentOpportunities,
  };
}

/**
 * Responds to a capacity recovery opportunity by submitting an RFQ proposal,
 * marking the opportunity claimed, and preserving the standard RFQ workflow.
 */
export async function respondToRecoveryOpportunity({
  opportunityId,
  providerId,
  quotedPrice,
  notes,
  proposedStart,
  proposedEnd,
}) {
  const opportunity = await CapacityRecoveryOpportunity.findById(opportunityId);
  if (!opportunity) {
    throw new HttpError(404, 'Capacity recovery opportunity not found.');
  }

  if (String(opportunity.provider) !== String(providerId)) {
    throw new HttpError(403, 'Unauthorized. You can only respond to your own recovery opportunities.');
  }

  if (opportunity.status !== 'active') {
    throw new HttpError(400, `This recovery opportunity is already ${opportunity.status}.`);
  }

  const requirement = await Requirement.findById(opportunity.requirement);
  if (!requirement || requirement.status !== 'open') {
    opportunity.status = 'expired';
    await opportunity.save();
    throw new HttpError(409, 'The target requirement is no longer open.');
  }

  const resource = await Resource.findById(opportunity.resource);
  if (!resource || resource.status !== 'active') {
    opportunity.status = 'expired';
    await opportunity.save();
    throw new HttpError(409, 'Your listing is no longer active.');
  }

  // Create standard RFQ Proposal
  const start = proposedStart ? new Date(proposedStart) : opportunity.opportunityStart;
  const end = proposedEnd ? new Date(proposedEnd) : opportunity.opportunityEnd;
  const price = quotedPrice != null ? Number(quotedPrice) : opportunity.estimatedRevenue;

  const proposal = await Proposal.create({
    requirement: requirement._id,
    provider: providerId,
    resource: resource._id,
    quotedPrice: price,
    proposedStart: start,
    proposedEnd: end,
    notes: notes?.trim() || 'Submitted via Capacity Recovery recommendation.',
    status: 'submitted',
  });

  requirement.proposalCount = (requirement.proposalCount || 0) + 1;
  await requirement.save();

  // Mark opportunity claimed
  opportunity.status = 'claimed';
  opportunity.resultingProposal = proposal._id;
  await opportunity.save();

  await notify({
    user: requirement.seeker,
    type: 'rfq_proposal_received',
    title: 'New proposal received',
    message: `A provider responded with a quote of ₹${price} for "${requirement.title}"`,
    relatedRequirement: requirement._id,
  });

  return {
    opportunity,
    proposal,
  };
}
