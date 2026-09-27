/**
 * digital-twin.service.js
 *
 * Indulge Digital Twin State Model + Weather Impact Engine — Stage 2
 *
 * Architecture:
 *   Real Indulge data (READ-ONLY lean queries)
 *     -> Digital Twin Snapshot
 *       -> Weather Impact Engine
 *         -> Cascading Effects
 *           -> What-If Simulation Result (DB never touched)
 *
 * SAFETY CONTRACT:
 *   - Only .find().lean() and .countDocuments() — NO writes
 *   - All simulation objects are plain JS clones
 *   - Real MongoDB data is NEVER modified by this service
 */

import mongoose from 'mongoose';
import { getWeatherByCoords } from './weather.service.js';
import { getPublicSignals, correlateWeatherAndSignals } from './public-signals.service.js';

// ─── UUID generator (no extra dep — use crypto) ───────────────────────────────
import { randomBytes } from 'crypto';
function simId() {
  return 'sim_' + randomBytes(8).toString('hex');
}

// ─── Lazy model refs (read-only) ──────────────────────────────────────────────
let Resource, Booking, Requirement, LogisticsJob;
function lazyModels() {
  if (!Resource) {
    Resource     = mongoose.model('Resource');
    Booking      = mongoose.model('Booking');
    Requirement  = mongoose.model('Requirement');
    LogisticsJob = mongoose.model('LogisticsJob');
  }
}

// ─── City coordinate registry ─────────────────────────────────────────────────
const CITY_COORDS = {
  thane:           { lat: 19.2183, lon: 72.9781 },
  mumbai:          { lat: 19.0760, lon: 72.8777 },
  'navi mumbai':   { lat: 19.0330, lon: 73.0297 },
  'kalyan-dombivli': { lat: 19.2437, lon: 73.1355 },
  kalyan:          { lat: 19.2437, lon: 73.1355 },
  dombivli:        { lat: 19.2144, lon: 73.0970 },
  bhiwandi:        { lat: 19.2967, lon: 73.0631 },
  'mira-bhayandar':{ lat: 19.2952, lon: 72.8544 },
  'vasai-virar':   { lat: 19.3919, lon: 72.8397 },
  pune:            { lat: 18.5204, lon: 73.8567 },
  nashik:          { lat: 19.9975, lon: 73.7898 },
  nagpur:          { lat: 21.1458, lon: 79.0882 },
  aurangabad:      { lat: 19.8762, lon: 75.3433 },
  'chhatrapati sambhajinagar': { lat: 19.8762, lon: 75.3433 },
  delhi:           { lat: 28.6139, lon: 77.2090 },
  'delhi ncr':     { lat: 28.6139, lon: 77.2090 },
  bengaluru:       { lat: 12.9716, lon: 77.5946 },
  bangalore:       { lat: 12.9716, lon: 77.5946 },
  hyderabad:       { lat: 17.3850, lon: 78.4867 },
  chennai:         { lat: 13.0827, lon: 80.2707 },
  kolkata:         { lat: 22.5726, lon: 88.3639 },
  ahmedabad:       { lat: 23.0225, lon: 72.5714 },
  surat:           { lat: 21.1702, lon: 72.8311 },
  jaipur:          { lat: 26.9124, lon: 75.7873 },
  lucknow:         { lat: 26.8467, lon: 80.9462 },
  chandigarh:      { lat: 30.7333, lon: 76.7794 },
  indore:          { lat: 22.7196, lon: 75.8577 },
  goa:             { lat: 15.4909, lon: 73.8278 },
  panaji:          { lat: 15.4909, lon: 73.8278 },
  kochi:           { lat: 9.9312, lon: 76.2673 },
};

function resolveCoords(location) {
  if (!location) return null;
  if (typeof location === 'string') {
    return CITY_COORDS[location.toLowerCase().trim()] || null;
  }
  if (location && typeof location === 'object') {
    const lat = Number(location.lat);
    const lon = Number(location.lon ?? location.lng);
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0) {
      return { lat, lon };
    }
    if (location.name && typeof location.name === 'string') {
      return CITY_COORDS[location.name.toLowerCase().trim()] || null;
    }
  }
  return null;
}

// ─── Weather impact coefficients ──────────────────────────────────────────────
// availability reduction fractions per band/category (0=no hit, 1=total shutdown)
const CAT_IMPACT = {
  vehicle:         { rainfall_light: 0.10, rainfall_moderate: 0.30, rainfall_heavy: 0.60, storm: 0.90, wind_high: 0.20 },
  furniture:       { rainfall_light: 0.05, rainfall_moderate: 0.20, rainfall_heavy: 0.45, storm: 0.70, wind_high: 0.10 },
  av_equipment:    { rainfall_light: 0.05, rainfall_moderate: 0.25, rainfall_heavy: 0.55, storm: 0.80, wind_high: 0.15 },
  banquet_space:   { rainfall_light: 0.02, rainfall_moderate: 0.10, rainfall_heavy: 0.25, storm: 0.50, wind_high: 0.05 },
  kitchen_capacity:{ rainfall_light: 0.01, rainfall_moderate: 0.05, rainfall_heavy: 0.10, storm: 0.20, wind_high: 0.02 },
  parking:         { rainfall_light: 0.05, rainfall_moderate: 0.15, rainfall_heavy: 0.35, storm: 0.60, wind_high: 0.10 },
  staff:           { rainfall_light: 0.05, rainfall_moderate: 0.20, rainfall_heavy: 0.40, storm: 0.65, wind_high: 0.08 },
  other:           { rainfall_light: 0.05, rainfall_moderate: 0.15, rainfall_heavy: 0.30, storm: 0.50, wind_high: 0.08 },
};

const LOGISTICS_IMPACT = {
  rainfall_light: 0.10, rainfall_moderate: 0.35, rainfall_heavy: 0.65, storm: 0.88, wind_high: 0.18,
};

const DEMAND_SURGE = {
  vehicle: 1.4, banquet_space: 1.2, kitchen_capacity: 1.1,
  av_equipment: 1.0, furniture: 0.9, parking: 1.3, staff: 1.1, other: 1.0,
};

// ─── Weather classification ────────────────────────────────────────────────────
function classifyWeather(sc) {
  const rain   = Number(sc.rainfallMmPerHour || 0);
  const wind   = Number(sc.windSpeedMps || 0);
  const windKmh = wind * 3.6;
  const temp   = Number(sc.temperature != null ? sc.temperature : 25);
  const dur    = Number(sc.durationHours || 1);

  let rainfallBand;
  if (rain === 0)        rainfallBand = 'none';
  else if (rain < 10)   rainfallBand = 'rainfall_light';
  else if (rain < 50)   rainfallBand = 'rainfall_moderate';
  else                  rainfallBand = 'rainfall_heavy';

  const isStorm    = rain >= 50 || windKmh >= 80;
  const isHighWind = windKmh >= 50;

  let score = 0;
  if (rain > 0)              score += Math.min(50, (rain / 90) * 50);
  if (wind > 0)              score += Math.min(30, (windKmh / 100) * 30);
  if (temp < 10 || temp > 42) score += 10;
  if (dur > 3)               score += Math.min(10, (dur / 24) * 10);
  score = Math.round(score);

  let severity;
  if (score >= 75)      severity = 'extreme';
  else if (score >= 50) severity = 'severe';
  else if (score >= 25) severity = 'moderate';
  else                  severity = 'mild';

  return { rainfallBand, isStorm, isHighWind, severity, score, rain, wind, windKmh, temp, dur };
}

// ─── Availability factor ───────────────────────────────────────────────────────
function availFactor(category, wc) {
  const t = CAT_IMPACT[category] || CAT_IMPACT.other;
  let hit = 0;
  if (wc.rainfallBand !== 'none') hit += (t[wc.rainfallBand] || 0);
  if (wc.isStorm)    hit = Math.max(hit, t.storm || 0);
  if (wc.isHighWind) hit += (t.wind_high || 0);
  return Math.max(0, Math.min(1, 1 - hit));
}

function impactLevel(factor) {
  if (factor < 0.30) return 'critical';
  if (factor < 0.60) return 'high';
  if (factor < 0.85) return 'moderate';
  return 'low';
}

function resourceReasons(cat, wc) {
  const r = [];
  if (wc.rainfallBand !== 'none') {
    if (cat === 'vehicle')        r.push('Rain reduces driver availability and road safety');
    else if (cat === 'furniture') r.push('Outdoor furniture transport risk in wet conditions');
    else if (cat === 'av_equipment') r.push('Electronics risk in high-moisture conditions');
    else if (cat === 'banquet_space') r.push('Outdoor/semi-outdoor spaces exposed to rain');
    else if (cat === 'parking')   r.push('Flooding risk reduces usable capacity');
    else if (cat === 'staff')     r.push('Staff commute affected by rain');
    else                          r.push('Operational disruption due to rainfall');
  }
  if (wc.isStorm)    r.push('Storm conditions trigger safety shutdown protocols');
  if (wc.isHighWind) r.push('High winds increase risk for transport and outdoor assets');
  if (r.length === 0) r.push('Minor weather impact on operations');
  return r;
}

// ─── Read real Indulge data (READ-ONLY) ───────────────────────────────────────
async function readSnapshot(coords) {
  lazyModels();
  const RADIUS_KM  = 50;
  const RADIUS_RAD = RADIUS_KM / 6371;

  // Try geo-indexed query first
  let resources = await Resource.find({
    status: 'active',
    'location.coordinates': {
      $geoWithin: { $centerSphere: [[coords.lon, coords.lat], RADIUS_RAD] },
    },
  }).lean();

  // Fallback for seeded/demo data without coordinates
  if (resources.length === 0) {
    resources = await Resource.find({ status: 'active' }).limit(200).lean();
  }

  const rIds = resources.map((r) => r._id);

  const [bookings, requirements, logisticsJobs] = await Promise.all([
    Booking.find({
      resource: { $in: rIds },
      status: { $in: ['confirmed', 'accepted', 'pending'] },
    }).lean(),
    Requirement.find({ status: 'open' }).limit(200).lean(),
    LogisticsJob.find({
      status: { $in: ['unassigned', 'assigned', 'accepted', 'picked_up', 'in_transit'] },
    }).lean(),
  ]);

  return { resources, bookings, requirements, logisticsJobs };
}

// ─── Weather Impact Engine ────────────────────────────────────────────────────
function applyImpact(snapshot, wc, scenario) {
  const { resources, bookings, requirements, logisticsJobs } = snapshot;
  const dur = Number(scenario.durationHours || 1);

  // Resources
  const affectedResources = resources.map((r) => {
    const f  = availFactor(r.category, wc);
    const il = impactLevel(f);
    return {
      resourceId:              String(r._id),
      title:                   r.title,
      category:                r.category,
      location:                r.location || null,
      originalAvailabilityFactor:  1.0,
      simulatedAvailabilityFactor: parseFloat(f.toFixed(3)),
      availabilityReductionPct:    parseFloat(((1 - f) * 100).toFixed(1)),
      estimatedRevenueLossInr:     Math.round((r.pricing?.basePrice || 0) * (1 - f)),
      impactLevel:             il,
      requiresLogistics:       r.requiresLogistics || false,
      reasons:                 resourceReasons(r.category, wc),
    };
  });

  // Bookings
  const riMap = {};
  for (const ar of affectedResources) riMap[ar.resourceId] = ar;

  const affectedBookings = bookings.map((b) => {
    const ri  = riMap[String(b.resource)];
    const f   = ri ? ri.simulatedAvailabilityFactor : 0.9;
    const dp  = parseFloat((1 - f).toFixed(3));
    const rl  = dp >= 0.6 ? 'critical' : dp >= 0.35 ? 'high' : dp >= 0.15 ? 'moderate' : 'low';
    return {
      bookingId:             String(b._id),
      resourceId:            String(b.resource),
      status:                b.status,
      startDateTime:         b.startDateTime,
      endDateTime:           b.endDateTime,
      agreedPrice:           b.agreedPrice || null,
      logistics:             b.logistics,
      disruptionProbability: dp,
      riskLevel:             rl,
      recommendation: dp > 0.5
        ? 'Consider rescheduling or sourcing alternative resource'
        : dp > 0.25 ? 'Monitor — disruption possible' : 'Low risk — proceed as planned',
    };
  });

  // Requirements (demand shift)
  const affectedRequirements = requirements.map((req) => {
    const surge = DEMAND_SURGE[req.category] || 1.0;
    return {
      requirementId:                String(req._id),
      title:                        req.title,
      category:                     req.category,
      status:                       req.status,
      urgency:                      req.urgency,
      demandSurgeMultiplier:        surge,
      competitionIncreasePct:       parseFloat(((surge - 1) * 100).toFixed(1)),
      recommendedBudgetIncreasePct: parseFloat(((surge - 1) * 70).toFixed(1)),
      note: surge > 1.2
        ? 'High demand surge — increase budget or book early'
        : surge > 1.0 ? 'Slight demand increase expected' : 'Stable or reduced demand',
    };
  });

  // Logistics
  const logBase = (() => {
    let d = 0;
    if (wc.rainfallBand !== 'none') d += (LOGISTICS_IMPACT[wc.rainfallBand] || 0);
    if (wc.isStorm)    d = Math.max(d, LOGISTICS_IMPACT.storm);
    if (wc.isHighWind) d += LOGISTICS_IMPACT.wind_high;
    return Math.min(0.98, d);
  })();

  const affectedLogisticsJobs = logisticsJobs.map((j) => ({
    jobId:                 String(j._id),
    bookingId:             String(j.booking),
    resourceId:            String(j.resource),
    currentStatus:         j.status,
    pickupLocation:        j.pickupLocation || null,
    deliveryLocation:      j.deliveryLocation || null,
    scheduledPickupTime:   j.scheduledPickupTime || null,
    requiredDeliveryTime:  j.requiredDeliveryTime || null,
    quantity:              j.quantity || 1,
    disruptionProbability: parseFloat(logBase.toFixed(3)),
    estimatedDelayHours:   parseFloat((logBase * dur * 0.8).toFixed(1)),
    recommendation: logBase > 0.6
      ? 'Reschedule — high disruption risk'
      : logBase > 0.3 ? 'Allow extra time buffer' : 'Monitor traffic conditions',
  }));

  // Cascading effects
  const cascadingEffects = buildCascade(wc, affectedResources, affectedBookings, affectedLogisticsJobs, dur);

  // Aggregate metrics
  const criticalResources   = affectedResources.filter((r) => r.impactLevel === 'critical').length;
  const highRiskBookings    = affectedBookings.filter((b) => b.riskLevel === 'critical' || b.riskLevel === 'high').length;
  const disruptedLogistics  = affectedLogisticsJobs.filter((j) => j.disruptionProbability > 0.5).length;
  const totalRevenueLoss    = affectedResources.reduce((s, r) => s + r.estimatedRevenueLossInr, 0);
  const avgFactor = affectedResources.length > 0
    ? parseFloat((affectedResources.reduce((s, r) => s + r.simulatedAvailabilityFactor, 0) / affectedResources.length).toFixed(3))
    : 1.0;

  return {
    metrics: {
      totalResourcesScanned:       resources.length,
      affectedResourcesCount:      affectedResources.filter((r) => r.availabilityReductionPct > 0).length,
      criticalResources,
      totalBookingsAtRisk:         affectedBookings.length,
      highRiskBookings,
      totalRequirementsScanned:    requirements.length,
      surgeRequirements:           affectedRequirements.filter((r) => r.demandSurgeMultiplier > 1.1).length,
      activeLogisticsJobs:         logisticsJobs.length,
      disruptedLogistics,
      estimatedTotalRevenueLossInr: totalRevenueLoss,
      avgAvailabilityFactor:       avgFactor,
    },
    affectedResources,
    affectedBookings,
    affectedRequirements,
    affectedLogisticsJobs,
    cascadingEffects,
  };
}

// ─── Cascading effects ────────────────────────────────────────────────────────
function buildCascade(wc, resources, bookings, logistics, dur) {
  const effects = [];
  const critical = resources.filter((r) => r.impactLevel === 'critical').length;
  const high     = resources.filter((r) => r.impactLevel === 'high').length;
  const logCrit  = logistics.filter((j) => j.disruptionProbability > 0.6).length;

  if (logCrit > 0) {
    effects.push({
      type: 'logistics_bottleneck',
      severity: wc.severity,
      description: logCrit + ' logistics jobs face critical disruption',
      estimatedDelayHours: parseFloat((logCrit * 0.5 * dur).toFixed(1)),
      affectedCount: logCrit,
      cascade: 'primary',
    });
  }

  const providerTransport = bookings.filter((b) => b.logistics === 'provider_transport').length;
  if (providerTransport > 0 && logCrit > 0) {
    effects.push({
      type: 'booking_fulfilment_risk',
      severity: wc.score > 50 ? 'severe' : 'moderate',
      description: providerTransport + ' provider-transport bookings risk delivery failure',
      affectedCount: providerTransport,
      cascade: 'secondary',
      triggerEffect: 'logistics_bottleneck',
    });
  }

  if (critical > 0) {
    effects.push({
      type: 'resource_cluster_offline',
      severity: wc.severity,
      description: critical + ' resources critically impacted — temporary supply shortage',
      affectedCount: critical,
      cascade: 'primary',
    });
  }

  if (high + critical > 2) {
    effects.push({
      type: 'demand_spike',
      severity: 'moderate',
      description: 'Supply reduction expected to trigger demand spike for indoor resources',
      cascade: 'secondary',
      triggerEffect: 'resource_cluster_offline',
      affectedCategories: ['banquet_space', 'kitchen_capacity'],
    });
  }

  if (wc.score >= 50) {
    effects.push({
      type: 'pricing_pressure',
      severity: wc.score >= 75 ? 'severe' : 'moderate',
      description: 'Available resource prices expected to rise ' + (wc.score >= 75 ? '20-35%' : '10-20%') + ' during storm window',
      cascade: 'tertiary',
      triggerEffect: 'demand_spike',
      estimatedPriceIncreasePct: wc.score >= 75 ? 27 : 15,
    });
  }

  if (wc.isStorm && wc.score >= 75) {
    effects.push({
      type: 'operational_pause_advisory',
      severity: 'extreme',
      description: 'Extreme storm — halt all outdoor deliveries and transport for ' + dur + ' hours',
      cascade: 'primary',
      durationHours: dur,
    });
  }

  return effects;
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * runWeatherSimulation — what-if weather scenario simulation.
 * Real DB is NEVER modified.
 */
export async function runWeatherSimulation(params) {
  const id = simId();
  const startedAt = new Date().toISOString();

  try {
    const coords = resolveCoords(params.location);
    if (!coords) {
      return {
        simulationId: id, success: false, startedAt,
        completedAt: new Date().toISOString(),
        error: 'Cannot resolve location: ' + JSON.stringify(params.location),
      };
    }

    let liveWeather = null;
    if (params.useLiveWeather) {
      liveWeather = await getWeatherByCoords(coords.lat, coords.lon);
    }

    const scenario = {
      rainfallMmPerHour: params.useLiveWeather
        ? (liveWeather?.current?.rainfallIntensity || 0)
        : (params.scenario?.rainfallMmPerHour ?? 0),
      windSpeedMps: params.useLiveWeather
        ? (liveWeather?.current?.windSpeed || 0)
        : (params.scenario?.windSpeedMps ?? 0),
      temperature: params.useLiveWeather
        ? (liveWeather?.current?.temperature || 25)
        : (params.scenario?.temperature ?? 25),
      durationHours: params.scenario?.durationHours ?? 1,
    };

    const wc       = classifyWeather(scenario);
    const snapshot = await readSnapshot(coords);
    const impact   = applyImpact(snapshot, wc, scenario);

    // Retrieve contextual public signals layer (non-blocking fallback)
    let publicSignals = null;
    try {
      const cityName = typeof params.location === 'string' ? params.location : (params.location?.name || 'Thane');
      const sigData = await getPublicSignals(cityName, false);
      const correlation = correlateWeatherAndSignals(wc, sigData.aggregation);
      publicSignals = {
        feedSource: sigData.feedSource,
        aggregation: sigData.aggregation,
        correlation,
        clusters: sigData.clusters,
        sampleSignals: sigData.signals.slice(0, 8),
      };
    } catch (sigErr) {
      console.warn('[DigitalTwin] Public signals retrieval non-fatal warning:', sigErr.message);
    }

    return {
      simulationId: id,
      success: true,
      location: { input: params.location, resolved: coords, radiusKm: 50 },
      scenario,
      weatherClassification: wc,
      liveWeatherSnapshot: liveWeather,
      publicSignals,
      ...impact,
      meta: {
        startedAt,
        completedAt: new Date().toISOString(),
        dataIsolation: 'READ_ONLY — real MongoDB data unchanged',
        source: 'Indulge Digital Twin v2.0 — Stage 2',
      },
    };
  } catch (err) {
    console.error('[DigitalTwin] Error:', err.message);
    return {
      simulationId: id, success: false, startedAt,
      completedAt: new Date().toISOString(),
      error: err.message,
    };
  }
}

/**
 * getTwinStatus — quick read-only count snapshot (no simulation).
 */
export async function getTwinStatus() {
  lazyModels();
  try {
    const [rC, bC, rqC, ljC] = await Promise.all([
      Resource.countDocuments({ status: 'active' }),
      Booking.countDocuments({ status: { $in: ['confirmed', 'accepted'] } }),
      Requirement.countDocuments({ status: 'open' }),
      LogisticsJob.countDocuments({ status: { $in: ['assigned', 'accepted', 'in_transit'] } }),
    ]);
    return {
      available: true,
      activeResources: rC,
      activeBookings:  bC,
      openRequirements: rqC,
      activeLogisticsJobs: ljC,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}
