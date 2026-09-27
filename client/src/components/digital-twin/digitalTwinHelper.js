/**
 * digitalTwinHelper.js
 *
 * Deterministic presentation helpers for Indulge Digital Twin Frontend.
 *
 * SAFETY CONTRACT:
 * - All calculations are presentation-only.
 * - Real MongoDB, booking, and logistics records are NEVER modified.
 * - Standard logistics service radius = 30 km.
 */

// Well-known Indulge cities with coordinates
export const CITIES = [
  { name: 'Thane', lat: 19.2183, lon: 72.9781 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Navi Mumbai', lat: 19.0330, lon: 73.0297 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Nashik', lat: 19.9975, lon: 73.7898 },
];

// Default standard logistics radius in kilometers
export const STANDARD_LOGISTICS_RADIUS_KM = 30;

// Scenario presets for instant demo testing
export const PRESET_SCENARIOS = [
  {
    id: 'normal',
    label: 'Normal Day',
    icon: '☀️',
    badge: 'On Time',
    badgeTone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    description: 'Clear conditions · 30 km full radius · Standard operations',
    scenario: {
      rainfallMmPerHour: 0,
      temperature: 28,
      windSpeedMps: 2,
      durationHours: 1,
    },
  },
  {
    id: 'moderate',
    label: 'Moderate Rain',
    icon: '🌦️',
    badge: 'Possible Delay',
    badgeTone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    description: 'Monsoon showers · ~25 km effective radius · Slight transport delay',
    scenario: {
      rainfallMmPerHour: 40,
      temperature: 26,
      windSpeedMps: 8,
      durationHours: 2,
    },
  },
  {
    id: 'severe',
    label: 'Severe Storm',
    icon: '⛈️',
    badge: 'High Risk',
    badgeTone: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    description: 'High winds & flooding · 15 km effective radius · Disruption & reschedule alert',
    scenario: {
      rainfallMmPerHour: 90,
      temperature: 28,
      windSpeedMps: 15,
      durationHours: 5,
    },
  },
];

/**
 * Normal Operating Distance Zones
 * 0–10 km = Nearby / Preferred
 * 10–20 km = Standard Delivery
 * 20–30 km = Extended Delivery
 * >30 km = Outside Default Service Radius
 */
export function getDistanceZone(distanceKm) {
  const d = Number(distanceKm) || 0;
  if (d <= 10) {
    return {
      tier: 'preferred',
      label: 'Nearby / Preferred',
      tone: 'text-emerald-600 dark:text-emerald-400',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      eligible: true,
      description: 'Optimal delivery zone (0–10 km)',
    };
  }
  if (d <= 20) {
    return {
      tier: 'standard',
      label: 'Standard Delivery',
      tone: 'text-blue-600 dark:text-blue-400',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      eligible: true,
      description: 'Standard operating zone (10–20 km)',
    };
  }
  if (d <= 30) {
    return {
      tier: 'extended',
      label: 'Extended Delivery',
      tone: 'text-amber-600 dark:text-amber-400',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      eligible: true,
      description: 'Extended operational zone (20–30 km)',
    };
  }
  return {
    tier: 'outside',
    label: 'Outside Standard 30 km Service Radius',
    tone: 'text-red-600 dark:text-red-400',
    badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    eligible: false,
    description: 'Additional logistics arrangement required (>30 km)',
  };
}

/**
 * Weather-Aware Simulated Effective Radius
 * NORMAL: Effective radius = 30 km
 * MODERATE WEATHER: Effective radius = 25 km
 * HEAVY RAIN / HIGH IMPACT: Effective radius = 20 km
 * SEVERE STORM: Effective radius = 10–15 km
 */
export function getEffectiveRadius(weatherClass, score = 0) {
  if (!weatherClass) return STANDARD_LOGISTICS_RADIUS_KM;

  const s = Number(score) || 0;
  const isStorm = weatherClass.isStorm || s >= 65;
  const severity = weatherClass.severity || 'mild';

  if (isStorm || s >= 75) {
    // Severe storm window: 10–15 km
    return Math.max(10, Math.min(15, Math.round(30 - (s / 100) * 20)));
  }
  if (severity === 'severe' || s >= 50) {
    return 15;
  }
  if (severity === 'moderate' || s >= 25) {
    return 25;
  }
  return STANDARD_LOGISTICS_RADIUS_KM;
}

/**
 * Formats decimal hours into a clean delay string: "+1h 45m" or "+30m"
 */
export function formatDelay(hours) {
  const h = Number(hours) || 0;
  if (h <= 0.05) return '0m (On Time)';
  const totalMinutes = Math.round(h * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs > 0 && mins > 0) return `+${hrs}h ${mins}m`;
  if (hrs > 0) return `+${hrs}h`;
  return `+${mins}m`;
}

/**
 * Calculates a Simulated ETA from an original date or baseline time
 */
export function calculateSimulatedETA(originalTime, delayHours = 0) {
  let baseDate;
  if (originalTime) {
    baseDate = new Date(originalTime);
  }
  if (!baseDate || isNaN(baseDate.getTime())) {
    baseDate = new Date();
    baseDate.setHours(10, 30, 0, 0); // Default demo baseline 10:30 AM
  }

  const delayMs = Math.round((Number(delayHours) || 0) * 3600 * 1000);
  const simulatedDate = new Date(baseDate.getTime() + delayMs);

  const formatTime = (d) =>
    d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

  return {
    originalFormatted: formatTime(baseDate),
    simulatedFormatted: formatTime(simulatedDate),
    delayText: formatDelay(delayHours),
  };
}

/**
 * Status Progression for Logistics Jobs:
 * Normal: ✓ ON TIME
 * Moderate: ⚠ POSSIBLE DELAY
 * High: ⚠ DELAYED
 * Severe: 🚨 AT RISK
 * Critical: 🚨 RESCHEDULE RECOMMENDED
 */
export function getLogisticsRiskStatus(disruptionProbability = 0, distanceKm = 18.4, effectiveRadius = 15) {
  const dp = Number(disruptionProbability) || 0;
  const exceedsRadius = Number(distanceKm) > Number(effectiveRadius);

  if (dp >= 0.8 || (dp >= 0.6 && exceedsRadius)) {
    return {
      statusText: 'RESCHEDULE RECOMMENDED',
      badgeLabel: '🚨 RESCHEDULE RECOMMENDED',
      tone: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
      level: 'critical',
      dotColor: '#EF4444',
      recommendation: 'Assign a closer logistics partner or reschedule delivery.',
    };
  }
  if (dp >= 0.55 || (dp >= 0.4 && exceedsRadius)) {
    return {
      statusText: 'AT RISK',
      badgeLabel: '🚨 AT RISK',
      tone: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
      level: 'severe',
      dotColor: '#F43F5E',
      recommendation: 'Delivery at high risk of delay — standby alternative partner.',
    };
  }
  if (dp >= 0.3 || exceedsRadius) {
    return {
      statusText: 'DELAYED',
      badgeLabel: '⚠ DELAYED',
      tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      level: 'high',
      dotColor: '#F59E0B',
      recommendation: 'Allow extra time buffer for pickup and transit.',
    };
  }
  if (dp >= 0.15) {
    return {
      statusText: 'POSSIBLE DELAY',
      badgeLabel: '⚠ POSSIBLE DELAY',
      tone: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
      level: 'moderate',
      dotColor: '#EAB308',
      recommendation: 'Monitor road and traffic conditions.',
    };
  }
  return {
    statusText: 'ON TIME',
    badgeLabel: '✓ ON TIME',
    tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    level: 'normal',
    dotColor: '#10B981',
    recommendation: 'Standard transit time expected — dispatch as scheduled.',
  };
}

/**
 * Booking Risk & Cancellation Risk Helper
 */
export function getBookingRiskInfo(disruptionProbability = 0, riskLevel = 'low') {
  const dp = Number(disruptionProbability) || 0;
  const isCritical = riskLevel === 'critical' || dp >= 0.75;
  const isHigh = riskLevel === 'high' || dp >= 0.45;
  const isModerate = riskLevel === 'moderate' || dp >= 0.2;

  let riskBadge = 'LOW RISK';
  let badgeTone = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  let cancellationRisk = 'LOW';
  let actionText = 'Low risk — proceed as planned';

  if (isCritical) {
    riskBadge = 'CRITICAL RISK';
    badgeTone = 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
    cancellationRisk = 'HIGH — RESCHEDULE RECOMMENDED';
    actionText = 'Delivery unlikely during storm peak. Reschedule or switch to indoor asset.';
  } else if (isHigh) {
    riskBadge = 'HIGH RISK';
    badgeTone = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    cancellationRisk = 'MODERATE';
    actionText = 'Delivery may miss scheduled event time. Prepare backup provider.';
  } else if (isModerate) {
    riskBadge = 'MODERATE RISK';
    badgeTone = 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
    cancellationRisk = 'LOW';
    actionText = 'Minor transit delays anticipated. Track dispatch updates.';
  }

  return {
    riskBadge,
    badgeTone,
    cancellationRisk,
    actionText,
  };
}
