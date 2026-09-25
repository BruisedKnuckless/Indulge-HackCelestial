import mongoose from 'mongoose';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Review from '../models/Review.js';
import Proposal from '../models/Proposal.js';
import CapacityRecoveryOpportunity from '../models/CapacityRecoveryOpportunity.js';
import Requirement from '../models/Requirement.js';

/** Short-lived in-memory cache to avoid redundant aggregations on rapid calls (30s TTL). */
const profileCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

export const CONTRIBUTION_TIERS = {
  NEW: 'NEW',
  ACTIVE: 'ACTIVE',
  TRUSTED: 'TRUSTED',
  PREFERRED: 'PREFERRED',
};

export const BADGE_DEFINITIONS = {
  RELIABLE_FULFILLER: {
    id: 'RELIABLE_FULFILLER',
    name: 'Reliable Fulfiller',
    description: 'Consistently completes accepted bookings with at least 90% fulfillment.',
  },
  CAPACITY_CONTRIBUTOR: {
    id: 'CAPACITY_CONTRIBUTOR',
    name: 'Capacity Contributor',
    description: 'Frequently makes idle resources and capacity available to the ecosystem.',
  },
  URGENT_SUPPORTER: {
    id: 'URGENT_SUPPORTER',
    name: 'Urgent Supporter',
    description: 'Successfully fulfills urgent requirements and emergency demand.',
  },
  RECOVERY_CHAMPION: {
    id: 'RECOVERY_CHAMPION',
    name: 'Recovery Champion',
    description: 'Converts perishable idle-capacity opportunities into completed bookings.',
  },
  HIGHLY_RATED_PROVIDER: {
    id: 'HIGHLY_RATED_PROVIDER',
    name: 'Highly Rated Provider',
    description: 'Maintains strong verified resource quality ratings of 4.5 or higher.',
  },
  PREFERRED_PARTNER: {
    id: 'PREFERRED_PARTNER',
    name: 'Preferred Partner',
    description: 'Exemplary trust, active marketplace contribution, and established track record.',
  },
};

/** Clear cache entry or all cache */
export function invalidateContributionCache(businessId = null) {
  if (businessId) {
    profileCache.delete(String(businessId));
  } else {
    profileCache.clear();
  }
}

/**
 * Deterministically compute the Contribution Profile for a business account.
 * Aggregates REAL marketplace records without any AI.
 */
export async function calculateContributionProfile(businessId, options = {}) {
  const bId = String(businessId);
  const now = Date.now();

  if (!options.bypassCache) {
    const cached = profileCache.get(bId);
    if (cached && cached.expiresAt > now) {
      return cached.profile;
    }
  }

  const user = await User.findById(bId).lean();
  if (!user) return null;

  // 1. Gather real records concurrently
  const [
    providerBookings,
    resources,
    reviews,
    acceptedProposals,
    convertedRecoveryOpps,
    activeRecoveryOpps,
  ] = await Promise.all([
    Booking.find({ provider: bId }).select('status urgency sourceRequirement createdAt').lean(),
    Resource.find({ owner: bId }).select('status totalQuantity availabilityMode blockedPeriods').lean(),
    Review.find({ reviewee: bId }).select('rating createdAt').lean(),
    Proposal.countDocuments({ provider: bId, status: 'accepted' }),
    CapacityRecoveryOpportunity.find({ provider: bId, status: 'converted' }).select('_id resultingBooking').lean(),
    CapacityRecoveryOpportunity.countDocuments({ provider: bId, status: 'active' }),
  ]);

  // 2. Booking Signals & Operational Reliability
  const completedBookings = providerBookings.filter((b) => b.status === 'completed');
  const cancelledBookings = providerBookings.filter((b) => b.status === 'cancelled');
  const confirmedBookings = providerBookings.filter((b) => ['confirmed', 'accepted'].includes(b.status));

  const completedCount = completedBookings.length;
  const cancelledCount = cancelledBookings.length;
  const totalEvaluated = completedCount + cancelledCount;

  // Safe rates with zero-activity guards
  const fulfillmentRate = totalEvaluated > 0
    ? Math.round((completedCount / totalEvaluated) * 1000) / 1000
    : 0;
  const cancellationRate = totalEvaluated > 0
    ? Math.round((cancelledCount / totalEvaluated) * 1000) / 1000
    : 0;

  // Urgent requirements helped: completed bookings with urgency: 'high'
  const urgentRequestsHelped = completedBookings.filter((b) => b.urgency === 'high').length;

  // 3. Capacity sharing & recovery
  const activeResources = resources.filter((r) => r.status === 'active');
  const activeResourceCount = activeResources.length;
  const sharedCapacity = activeResources.reduce((sum, r) => sum + (r.totalQuantity || 1), 0);

  // Distinct converted recovery opportunities (prevent double counting)
  const distinctConvertedIds = new Set(convertedRecoveryOpps.map((o) => String(o._id)));
  const recoveryConversions = distinctConvertedIds.size;

  // 4. Resource Quality
  const reviewCount = reviews.length;
  let averageResourceRating = 0;
  if (reviewCount > 0) {
    const sumRating = reviews.reduce((sum, rev) => sum + rev.rating, 0);
    averageResourceRating = Math.round((sumRating / reviewCount) * 10) / 10;
  } else if (user.ratingCount > 0) {
    averageResourceRating = Math.round((user.ratingAvg || 0) * 10) / 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CONTRIBUTION SCORE (0 - 100)
  // Transparent, deterministic components:
  // - Fulfillment reliability       30
  // - Successful marketplace help   20
  // - Capacity sharing/recovery      15
  // - Resource quality              15
  // - Availability accuracy         10
  // - Urgent assistance             10
  // ═══════════════════════════════════════════════════════════════════════════

  // A. Fulfillment reliability (max 30)
  let fulfillmentReliabilityScore = 0;
  if (totalEvaluated > 0) {
    const reliabilityFactor = fulfillmentRate * Math.max(0, 1 - (cancellationRate * 0.5));
    // Sample confidence damping: requires at least 5 actioned bookings for full confidence
    const sampleFactor = Math.min(totalEvaluated / 5, 1.0);
    fulfillmentReliabilityScore = Math.round(30 * reliabilityFactor * sampleFactor * 10) / 10;
  }

  // B. Successful marketplace help (max 20)
  // Considers completed fulfillments + accepted RFQs
  const totalHelpEvents = completedCount + acceptedProposals;
  const marketplaceHelpScore = Math.min(20, totalHelpEvents * 4);

  // C. Capacity sharing & recovery (max 15)
  // 5 points per recovery conversion (max 10) + 1.5 points per active listing (max 5)
  const recoveryPart = Math.min(10, recoveryConversions * 5);
  const sharingPart = Math.min(5, Math.round(activeResourceCount * 1.5 * 10) / 10);
  const capacitySharingScore = Math.min(15, recoveryPart + sharingPart);

  // D. Resource quality (max 15)
  let resourceQualityScore = 0;
  if (reviewCount > 0 && averageResourceRating > 0) {
    const ratingFraction = Math.max(0, (averageResourceRating - 1) / 4); // 1.0 -> 0, 5.0 -> 1.0
    const volumeFactor = Math.min(reviewCount / 5, 1.0); // requires 5 reviews for full weight
    resourceQualityScore = Math.round(15 * ratingFraction * volumeFactor * 10) / 10;
  }

  // E. Availability accuracy (max 10)
  let availabilityAccuracyScore = 0;
  if (activeResourceCount > 0) {
    const accuracyRatio = totalEvaluated > 0 ? Math.max(0, 1 - (cancellationRate * 1.5)) : 1.0;
    const listingFactor = Math.min(activeResourceCount / 2, 1.0);
    availabilityAccuracyScore = Math.round(10 * accuracyRatio * listingFactor * 10) / 10;
  }

  // F. Urgent assistance (max 10)
  const urgentAssistanceScore = Math.min(10, urgentRequestsHelped * 5);

  const rawContribution =
    fulfillmentReliabilityScore +
    marketplaceHelpScore +
    capacitySharingScore +
    resourceQualityScore +
    availabilityAccuracyScore +
    urgentAssistanceScore;

  const contributionScore = Math.round(Math.max(0, Math.min(100, rawContribution)));

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. OPERATIONAL TRUST SCORE (0 - 100)
  // Focuses specifically on operational reliability:
  // - Fulfillment rate (45)
  // - Low cancellation rate (30)
  // - Verified rating / satisfaction (25)
  // Smoothly blended with neutral baseline (50) for unproven / new accounts
  // ═══════════════════════════════════════════════════════════════════════════

  let trustScore = 50; // Neutral baseline for zero activity
  if (totalEvaluated > 0 || reviewCount > 0) {
    const fComp = fulfillmentRate * 45;
    const cComp = Math.max(0, 1 - (cancellationRate * 2)) * 30;
    const rComp = reviewCount > 0
      ? ((averageResourceRating / 5) * 25)
      : (totalEvaluated > 0 ? 15 : 12.5);

    const empiricalTrust = fComp + cComp + rComp;
    // Confidence factor: requires 5 transactions/reviews for empirical score to dominate
    const confidence = Math.min(1.0, (totalEvaluated / 5) * 0.8 + (reviewCount / 5) * 0.2);
    trustScore = Math.round((50 * (1 - confidence)) + (empiricalTrust * confidence));
    trustScore = Math.max(0, Math.min(100, trustScore));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. CONTRIBUTION TIERS
  // Restrained professional tier names: NEW, ACTIVE, TRUSTED, PREFERRED
  // Minimum sample requirements prevent instant high tiers
  // ═══════════════════════════════════════════════════════════════════════════

  let tier = CONTRIBUTION_TIERS.NEW;
  if (completedCount >= 10 && contributionScore >= 75 && trustScore >= 80) {
    tier = CONTRIBUTION_TIERS.PREFERRED;
  } else if (completedCount >= 5 && contributionScore >= 55 && trustScore >= 70) {
    tier = CONTRIBUTION_TIERS.TRUSTED;
  } else if (completedCount >= 2 && contributionScore >= 25) {
    tier = CONTRIBUTION_TIERS.ACTIVE;
  } else {
    tier = CONTRIBUTION_TIERS.NEW;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. DETERMINISTIC BADGES
  // ═══════════════════════════════════════════════════════════════════════════

  const badges = [];

  // RELIABLE_FULFILLER: consistently completes accepted bookings (>=5 bookings, >=90% fulfillment, <=10% cancellations)
  if (completedCount >= 5 && fulfillmentRate >= 0.90 && cancellationRate <= 0.10) {
    badges.push({ ...BADGE_DEFINITIONS.RELIABLE_FULFILLER });
  }

  // CAPACITY_CONTRIBUTOR: >=3 active resources or active recovery opportunities
  if (activeResourceCount >= 3 || activeRecoveryOpps >= 2) {
    badges.push({ ...BADGE_DEFINITIONS.CAPACITY_CONTRIBUTOR });
  }

  // URGENT_SUPPORTER: >= 1 urgent requirements helped
  if (urgentRequestsHelped >= 1) {
    badges.push({ ...BADGE_DEFINITIONS.URGENT_SUPPORTER });
  }

  // RECOVERY_CHAMPION: >= 1 recovery conversions
  if (recoveryConversions >= 1) {
    badges.push({ ...BADGE_DEFINITIONS.RECOVERY_CHAMPION });
  }

  // HIGHLY_RATED_PROVIDER: >= 3 reviews with average rating >= 4.5
  if (reviewCount >= 3 && averageResourceRating >= 4.5) {
    badges.push({ ...BADGE_DEFINITIONS.HIGHLY_RATED_PROVIDER });
  }

  // PREFERRED_PARTNER: requires PREFERRED tier
  if (tier === CONTRIBUTION_TIERS.PREFERRED) {
    badges.push({ ...BADGE_DEFINITIONS.PREFERRED_PARTNER });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. DETERMINISTIC IMPROVEMENT HINTS (NO AI)
  // ═══════════════════════════════════════════════════════════════════════════

  const improvementHints = [];
  if (tier === CONTRIBUTION_TIERS.NEW) {
    const needed = Math.max(1, 2 - completedCount);
    improvementHints.push(`Complete ${needed} more successful booking${needed === 1 ? '' : 's'} to advance to Active status.`);
  } else if (tier === CONTRIBUTION_TIERS.ACTIVE) {
    const needed = Math.max(1, 5 - completedCount);
    improvementHints.push(`Complete ${needed} more bookings with 55+ contribution to qualify for Trusted tier.`);
  } else if (tier === CONTRIBUTION_TIERS.TRUSTED) {
    const needed = Math.max(1, 10 - completedCount);
    improvementHints.push(`Complete ${needed} more bookings and achieve an 75+ contribution score to qualify for Preferred Partner status.`);
  }

  if (cancellationRate > 0.05) {
    improvementHints.push('Minimizing provider-side cancellations will directly strengthen your operational trust score.');
  }
  if (reviewCount < 3) {
    improvementHints.push('Encourage clients to leave verified reviews to build your resource quality score.');
  }
  if (recoveryConversions === 0) {
    improvementHints.push('Respond to time-bound capacity recovery alerts to earn the Recovery Champion badge.');
  }
  if (activeResourceCount < 3) {
    improvementHints.push('List additional idle resources or open capacity windows to earn the Capacity Contributor badge.');
  }
  if (urgentRequestsHelped === 0) {
    improvementHints.push('Fulfill high-urgency marketplace requirements to unlock the Urgent Supporter badge.');
  }

  const profile = {
    businessId: String(user._id),
    businessName: user.businessName,
    businessType: user.businessType,
    contributionScore,
    trustScore,
    tier,
    resourceQuality: {
      averageRating: averageResourceRating,
      reviewCount,
    },
    signals: {
      successfulFulfillments: completedCount,
      recoveryConversions,
      urgentRequestsHelped,
      sharedCapacity,
      cancellationRate,
      averageResourceRating,
      fulfillmentRate,
      completedTransactions: completedCount,
      totalActionedBookings: totalEvaluated,
      providerCancellations: cancelledCount,
      successfulRfqs: acceptedProposals,
      activeListings: activeResourceCount,
    },
    badges,
    breakdown: {
      fulfillmentReliability: fulfillmentReliabilityScore,
      marketplaceHelp: marketplaceHelpScore,
      capacitySharing: capacitySharingScore,
      resourceQuality: resourceQualityScore,
      availabilityAccuracy: availabilityAccuracyScore,
      urgentAssistance: urgentAssistanceScore,
    },
    improvementHints: improvementHints.slice(0, 3),
    calculatedAt: new Date().toISOString(),
  };

  profileCache.set(bId, { profile, expiresAt: now + CACHE_TTL_MS });
  return profile;
}

/**
 * Returns a sanitized public reputation profile.
 * Does NOT expose private cancellation cases, dispute descriptions,
 * private transaction values, internal admin flags, or confidential details.
 */
export async function getPublicReputationProfile(businessId, options = {}) {
  const fullProfile = await calculateContributionProfile(businessId, options);
  if (!fullProfile) return null;

  return {
    businessId: fullProfile.businessId,
    businessName: fullProfile.businessName,
    businessType: fullProfile.businessType,
    contributionScore: fullProfile.contributionScore,
    trustScore: fullProfile.trustScore,
    tier: fullProfile.tier,
    resourceQuality: fullProfile.resourceQuality,
    badges: fullProfile.badges,
    fulfillmentRate: fullProfile.signals.fulfillmentRate,
    calculatedAt: fullProfile.calculatedAt,
  };
}
