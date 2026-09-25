import Resource from '../models/Resource.js';
import Requirement from '../models/Requirement.js';
import User from '../models/User.js';
import { getAvailableQuantity } from './availability.service.js';

/**
 * Calculates Haversine distance in kilometers between two [longitude, latitude] coordinates.
 * Returns rounded to 1 decimal place, or null if coordinates are invalid.
 */
export function calculateDistanceKm(coords1, coords2) {
  if (
    !coords1 ||
    !coords2 ||
    !Array.isArray(coords1) ||
    !Array.isArray(coords2) ||
    coords1.length !== 2 ||
    coords2.length !== 2
  ) {
    return null;
  }

  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  if (!Number.isFinite(lon1) || !Number.isFinite(lat1) || !Number.isFinite(lon2) || !Number.isFinite(lat2)) {
    return null;
  }

  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Evaluates whether Plan A strictly dominates Plan B in Pareto efficiency.
 *
 * Plan A dominates Plan B (A ≻ B) if:
 * 1. A.totalPrice <= B.totalPrice
 * 2. A.maxDistanceKm <= B.maxDistanceKm
 * 3. A.supplierCount <= B.supplierCount
 * 4. A.fulfilledQuantity >= B.fulfilledQuantity
 * AND A is strictly better in at least one metric.
 */
export function doesPlanDominate(planA, planB) {
  const distA = planA.maxDistanceKm ?? 0;
  const distB = planB.maxDistanceKm ?? 0;

  const noWorse =
    planA.totalPrice <= planB.totalPrice &&
    distA <= distB &&
    planA.supplierCount <= planB.supplierCount &&
    planA.fulfilledQuantity >= planB.fulfilledQuantity;

  if (!noWorse) return false;

  const strictlyBetter =
    planA.totalPrice < planB.totalPrice ||
    distA < distB ||
    planA.supplierCount < planB.supplierCount ||
    planA.fulfilledQuantity > planB.fulfilledQuantity;

  return strictlyBetter;
}

/**
 * Filters an array of procurement plans to retain only non-dominated (Pareto-optimal) solutions.
 */
export function filterNonDominatedPlans(plans) {
  if (plans.length <= 1) return plans;

  // Deduplicate plans that allocate the exact same resources with identical quantities
  const uniqueMap = new Map();
  for (const p of plans) {
    const key = p.suppliers
      .map((s) => `${s.resourceId}:${s.allocatedQuantity}`)
      .sort()
      .join('|');
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p);
    } else {
      // If duplicate allocation key, keep the one with smaller ID (deterministic)
      const existing = uniqueMap.get(key);
      if (p.id < existing.id) uniqueMap.set(key, p);
    }
  }

  const uniquePlans = Array.from(uniqueMap.values());

  return uniquePlans.filter((planA, indexA) => {
    // If any other plan strictly dominates planA, discard planA
    for (let indexB = 0; indexB < uniquePlans.length; indexB++) {
      if (indexA === indexB) continue;
      const planB = uniquePlans[indexB];
      if (doesPlanDominate(planB, planA)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Generates all unique subsets of items up to maxSize.
 */
function getCombinations(items, maxSize) {
  const results = [];

  function helper(startIndex, current) {
    if (current.length > 0 && current.length <= maxSize) {
      results.push([...current]);
    }
    if (current.length === maxSize) return;

    for (let i = startIndex; i < items.length; i++) {
      current.push(items[i]);
      helper(i + 1, current);
      current.pop();
    }
  }

  helper(0, []);
  return results;
}

/**
 * Generates deterministic procurement plans for a requirement.
 *
 * @param {Object} params
 * @param {Object} [params.requirement] - Requirement document or metadata
 * @param {number} params.requestedQuantity - Units needed
 * @param {Object} params.requestedDates - { start: Date, end: Date }
 * @param {Object} [params.location] - Seeker destination location { coordinates, address, city, radiusKm }
 * @param {number|null} [params.budget] - Max target budget for the whole quantity
 * @param {Array} params.candidates - Candidate resources (optionally pre-enriched)
 * @param {number} [params.maxSuppliersPerPlan=3] - Maximum number of suppliers allowed in a single plan
 * @returns {Promise<Array>} List of feasible, non-dominated procurement plans
 */
export async function generateProcurementPlans({
  requirement = null,
  requestedQuantity,
  requestedDates,
  location = null,
  budget = null,
  candidates = [],
  maxSuppliersPerPlan = 3,
}) {
  const reqQty = Number(requestedQuantity || requirement?.requiredQuantity || requirement?.quantity || 1);
  const start = requestedDates?.start || requirement?.startDateTime;
  const end = requestedDates?.end || requirement?.endDateTime;
  const targetBudget = budget ?? requirement?.maxBudget ?? requirement?.maxPrice ?? null;
  const reqCoords = location?.coordinates || requirement?.location?.coordinates || null;

  if (!reqQty || reqQty < 1 || !start || !end) {
    return [];
  }

  // 1. Enrich candidates with true availability using the existing sweep-line engine
  const eligibleCandidates = [];
  const seenResources = new Set();

  for (const c of candidates) {
    const resId = String(c._id || c.resourceId);
    if (seenResources.has(resId)) continue;
    seenResources.add(resId);

    // Filter out inactive/paused/archived listings immediately
    if (c.status && c.status !== 'active') {
      continue;
    }

    let bookableQty = 0;
    if (typeof c.availableQuantity === 'number') {
      bookableQty = c.availableQuantity;
    } else {
      const avail = await getAvailableQuantity(c._id, new Date(start), new Date(end), { resource: c });
      bookableQty = avail.available;
    }

    if (bookableQty <= 0) {
      continue;
    }

    // Determine distance in km
    let distKm = null;
    if (typeof c.distanceKm === 'number' && Number.isFinite(c.distanceKm)) {
      distKm = Math.round(c.distanceKm * 10) / 10;
    } else if (reqCoords && c.location?.coordinates) {
      distKm = calculateDistanceKm(reqCoords, c.location.coordinates);
    }

    const providerId = String(c.owner?._id || c.owner || c.providerId || '');
    const providerName =
      c.owner?.businessName || c.ownerDoc?.businessName || c.providerName || 'Provider';

    eligibleCandidates.push({
      resourceId: resId,
      resourceTitle: c.title || 'Equipment / Cargo',
      category: c.category || 'other',
      providerId,
      providerName,
      availableQuantity: bookableQty,
      unitPrice: Number(c.pricing?.basePrice ?? c.unitPrice ?? 0),
      distanceKm: distKm,
      pickupLocation: c.location || null,
      matchScore: c.matchScore ?? null,
    });
  }

  if (eligibleCandidates.length === 0) {
    return [];
  }

  // Deterministically sort candidate pool
  eligibleCandidates.sort((a, b) => {
    if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
    if ((a.distanceKm ?? 999) !== (b.distanceKm ?? 999)) return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
    return a.resourceId.localeCompare(b.resourceId);
  });

  // Limit combination search pool if very large to prevent memory overhead
  const cappedCandidates = eligibleCandidates.slice(0, 15);
  const maxSuppliers = Math.min(Number(maxSuppliersPerPlan) || 3, cappedCandidates.length);

  // 2. Generate supplier combinations of size 1..maxSuppliers
  const combinations = getCombinations(cappedCandidates, maxSuppliers);
  const candidatePlans = [];

  for (const combo of combinations) {
    // Constraint: "Do not duplicate the same resource/provider inside a plan."
    const providerIds = new Set();
    const resourceIds = new Set();
    let hasDuplicate = false;

    for (const item of combo) {
      if (item.providerId && providerIds.has(item.providerId)) {
        hasDuplicate = true;
        break;
      }
      if (resourceIds.has(item.resourceId)) {
        hasDuplicate = true;
        break;
      }
      if (item.providerId) providerIds.add(item.providerId);
      resourceIds.add(item.resourceId);
    }

    if (hasDuplicate) continue;

    const totalAvailable = combo.reduce((sum, s) => sum + s.availableQuantity, 0);
    const canFullyFulfill = totalAvailable >= reqQty;

    // Build allocation strategy functions
    const strategies = [];

    if (combo.length === 1) {
      // Single supplier strategy
      const s = combo[0];
      const alloc = Math.min(s.availableQuantity, reqQty);
      strategies.push([
        {
          ...s,
          allocatedQuantity: alloc,
          totalPrice: alloc * s.unitPrice,
        },
      ]);
    } else if (canFullyFulfill) {
      // Strategy A: Cheapest First (Greedy by unitPrice ASC)
      const sortedByPrice = [...combo].sort((a, b) => {
        if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
        return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      });
      let remainingA = reqQty;
      const allocA = [];
      for (const s of sortedByPrice) {
        if (remainingA <= 0) break;
        const take = Math.min(s.availableQuantity, remainingA);
        allocA.push({
          ...s,
          allocatedQuantity: take,
          totalPrice: take * s.unitPrice,
        });
        remainingA -= take;
      }
      strategies.push(allocA);

      // Strategy B: Nearest First (Greedy by distanceKm ASC)
      const sortedByDist = [...combo].sort((a, b) => {
        if ((a.distanceKm ?? 999) !== (b.distanceKm ?? 999)) {
          return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
        }
        return a.unitPrice - b.unitPrice;
      });
      let remainingB = reqQty;
      const allocB = [];
      for (const s of sortedByDist) {
        if (remainingB <= 0) break;
        const take = Math.min(s.availableQuantity, remainingB);
        allocB.push({
          ...s,
          allocatedQuantity: take,
          totalPrice: take * s.unitPrice,
        });
        remainingB -= take;
      }
      strategies.push(allocB);
    } else {
      // Partial fulfillment: take all available inventory from each supplier in combo
      const allocPartial = combo.map((s) => ({
        ...s,
        allocatedQuantity: s.availableQuantity,
        totalPrice: s.availableQuantity * s.unitPrice,
      }));
      strategies.push(allocPartial);
    }

    // Evaluate each strategy allocation into a standard Plan object
    for (const supplierAllocations of strategies) {
      const activeSuppliers = supplierAllocations.filter((s) => s.allocatedQuantity > 0);
      if (activeSuppliers.length === 0) continue;

      const fulfilledQty = activeSuppliers.reduce((sum, s) => sum + s.allocatedQuantity, 0);
      const isFullyFulfilled = fulfilledQty >= reqQty;
      const pct = Math.round((fulfilledQty / reqQty) * 100);
      const planTotalPrice = activeSuppliers.reduce((sum, s) => sum + s.totalPrice, 0);
      const variance = targetBudget != null ? planTotalPrice - targetBudget : null;

      const distances = activeSuppliers.map((s) => s.distanceKm).filter((d) => d != null && Number.isFinite(d));
      const maxDist = distances.length ? Math.round(Math.max(...distances) * 10) / 10 : 0;
      const avgDist = distances.length
        ? Math.round((distances.reduce((sum, d) => sum + d, 0) / distances.length) * 10) / 10
        : 0;

      let planType = 'split';
      if (!isFullyFulfilled) {
        planType = 'partial';
      } else if (activeSuppliers.length === 1) {
        planType = 'single';
      }

      const complexity =
        activeSuppliers.length === 1 ? 'low' : activeSuppliers.length === 2 ? 'medium' : 'high';

      // Deterministic plan ID based on sorted resource and allocation pairs
      const allocSignature = activeSuppliers
        .map((s) => `${s.resourceId.slice(-4)}x${s.allocatedQuantity}`)
        .sort()
        .join('-');
      const planId = `plan-${planType}-${allocSignature}`;

      candidatePlans.push({
        id: planId,
        type: planType,
        fulfilledQuantity: fulfilledQty,
        requestedQuantity: reqQty,
        fulfillmentPercentage: pct,
        fullyFulfilled: isFullyFulfilled,
        totalPrice: planTotalPrice,
        budgetVariance: variance,
        supplierCount: activeSuppliers.length,
        averageDistanceKm: avgDist,
        maxDistanceKm: maxDist,
        logisticsComplexity: complexity,
        logisticsJobsRequired: activeSuppliers.length,
        labels: [],
        suppliers: activeSuppliers.map((s) => ({
          resourceId: s.resourceId,
          resourceTitle: s.resourceTitle,
          category: s.category,
          providerId: s.providerId,
          providerName: s.providerName,
          allocatedQuantity: s.allocatedQuantity,
          availableQuantity: s.availableQuantity,
          unitPrice: s.unitPrice,
          totalPrice: s.totalPrice,
          distanceKm: s.distanceKm,
          pickupLocation: s.pickupLocation,
          matchScore: s.matchScore,
        })),
      });
    }
  }

  if (candidatePlans.length === 0) {
    return [];
  }

  // 3. Separate full plans vs partial plans
  const fullPlans = candidatePlans.filter((p) => p.fullyFulfilled);
  let survivingPlans = [];

  if (fullPlans.length > 0) {
    // If full fulfillment is feasible, Pareto filter across the full plans
    survivingPlans = filterNonDominatedPlans(fullPlans);
  } else {
    // If full fulfillment is impossible, return the best non-dominated partial fulfillment plans
    // (maximizing fulfilledQuantity, minimizing cost/suppliers/distance)
    survivingPlans = filterNonDominatedPlans(candidatePlans);
  }

  if (survivingPlans.length === 0) {
    return [];
  }

  // 4. Compute Labels Deterministically
  const minPrice = Math.min(...survivingPlans.map((p) => p.totalPrice));
  const minMaxDist = Math.min(...survivingPlans.map((p) => p.maxDistanceKm));
  const minSuppliers = Math.min(...survivingPlans.map((p) => p.supplierCount));

  // Determine BEST_OPERATIONAL_FIT plan using a deterministic composite score
  let bestFitId = null;
  let bestFitScore = -Infinity;

  for (const p of survivingPlans) {
    // Base score from fulfillment percentage
    const fulfillmentScore = (p.fulfillmentPercentage / 100) * 50;

    // Supplier penalty (fewer suppliers preferred)
    const supplierScore = Math.max(0, 30 - (p.supplierCount - 1) * 10);

    // Budget fit score
    let budgetScore = 15;
    if (targetBudget != null) {
      if (p.totalPrice <= targetBudget) {
        budgetScore = 20;
      } else {
        const overBudgetPct = (p.totalPrice - targetBudget) / targetBudget;
        budgetScore = Math.max(0, 20 - overBudgetPct * 20);
      }
    }

    // Distance score
    const distScore = Math.max(0, 15 - (p.maxDistanceKm || 0) * 0.5);

    const totalOperationalScore = fulfillmentScore + supplierScore + budgetScore + distScore;
    if (totalOperationalScore > bestFitScore) {
      bestFitScore = totalOperationalScore;
      bestFitId = p.id;
    }
  }

  for (const p of survivingPlans) {
    const labels = [];

    if (p.fullyFulfilled) {
      labels.push('FULLY_FULFILLED');
    } else {
      labels.push('PARTIALLY_FULFILLED');
    }

    if (targetBudget != null && p.totalPrice <= targetBudget) {
      labels.push('WITHIN_BUDGET');
    }

    if (p.totalPrice === minPrice) {
      labels.push('CHEAPEST');
    }

    if (p.maxDistanceKm === minMaxDist) {
      labels.push('NEAREST');
    }

    if (p.supplierCount === minSuppliers) {
      labels.push('FEWEST_SUPPLIERS');
    }

    if (p.id === bestFitId) {
      labels.push('BEST_OPERATIONAL_FIT');
    }

    p.labels = labels;
  }

  // 5. Deterministic Sort for Final Presentation
  survivingPlans.sort((a, b) => {
    // 1. Fully fulfilled before partial
    if (a.fullyFulfilled !== b.fullyFulfilled) {
      return a.fullyFulfilled ? -1 : 1;
    }
    // 2. Best operational fit first
    const aFit = a.labels.includes('BEST_OPERATIONAL_FIT') ? 1 : 0;
    const bFit = b.labels.includes('BEST_OPERATIONAL_FIT') ? 1 : 0;
    if (aFit !== bFit) return bFit - aFit;

    // 3. Lowest supplier count
    if (a.supplierCount !== b.supplierCount) {
      return a.supplierCount - b.supplierCount;
    }
    // 4. Lowest price
    if (a.totalPrice !== b.totalPrice) {
      return a.totalPrice - b.totalPrice;
    }
    // 5. Shortest max distance
    if (a.maxDistanceKm !== b.maxDistanceKm) {
      return a.maxDistanceKm - b.maxDistanceKm;
    }
    // 6. Alphabetical ID tie-breaker
    return a.id.localeCompare(b.id);
  });

  return survivingPlans;
}

/**
 * High-level helper to query candidates and solve procurement for a database Requirement.
 *
 * @param {string|mongoose.Types.ObjectId} requirementId
 * @param {Object} [options]
 * @param {number} [options.maxSuppliers=3]
 * @returns {Promise<{ requirementId: string, requestedQuantity: number, options: Array }>}
 */
export async function solveRequirementProcurement(requirementId, options = {}) {
  const requirement = await Requirement.findById(requirementId).lean();
  if (!requirement) {
    throw new Error('Requirement not found');
  }

  const requestedQuantity = requirement.requiredQuantity || requirement.quantity || 1;
  const start = requirement.startDateTime;
  const end = requirement.endDateTime;
  const targetBudget = requirement.maxBudget ?? requirement.maxPrice ?? null;
  const reqCoords = requirement.location?.coordinates || null;
  const radiusKm = requirement.radiusKm || requirement.location?.radiusKm || 50;

  // Query eligible candidate resources matching the category and active status
  const matchFilter = {
    category: requirement.category,
    status: 'active',
    owner: { $ne: requirement.seeker },
  };

  let candidateResources = [];

  if (reqCoords && reqCoords.length === 2) {
    try {
      candidateResources = await Resource.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: reqCoords },
            distanceField: 'distanceMeters',
            maxDistance: radiusKm * 1000,
            query: matchFilter,
            spherical: true,
          },
        },
        { $limit: 30 },
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
    } catch {
      // Fallback if 2dsphere index query fails
      candidateResources = await Resource.find(matchFilter)
        .populate('owner', 'businessName ratingAvg ratingCount location')
        .limit(30)
        .lean();
    }
  }

  if (!candidateResources || candidateResources.length === 0) {
    candidateResources = await Resource.find(matchFilter)
      .populate('owner', 'businessName ratingAvg ratingCount location')
      .limit(30)
      .lean();
  }

  const plans = await generateProcurementPlans({
    requirement,
    requestedQuantity,
    requestedDates: { start, end },
    location: requirement.location,
    budget: targetBudget,
    candidates: candidateResources,
    maxSuppliersPerPlan: options.maxSuppliers || 3,
  });

  return {
    requirementId: String(requirement._id),
    requestedQuantity,
    options: plans,
  };
}
