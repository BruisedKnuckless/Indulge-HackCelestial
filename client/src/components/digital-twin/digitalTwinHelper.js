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

// Well-known Indulge metropolitan hubs with coordinates
export const CITIES = [
  // Mumbai Metropolitan Region (MMR) & Maharashtra Core
  { name: 'Thane', lat: 19.2183, lon: 72.9781, state: 'Maharashtra', region: 'MMR' },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777, state: 'Maharashtra', region: 'MMR' },
  { name: 'Navi Mumbai', lat: 19.0330, lon: 73.0297, state: 'Maharashtra', region: 'MMR' },
  { name: 'Kalyan-Dombivli', lat: 19.2437, lon: 73.1355, state: 'Maharashtra', region: 'MMR' },
  { name: 'Bhiwandi', lat: 19.2967, lon: 73.0631, state: 'Maharashtra', region: 'MMR' },
  { name: 'Mira-Bhayandar', lat: 19.2952, lon: 72.8544, state: 'Maharashtra', region: 'MMR' },
  { name: 'Vasai-Virar', lat: 19.3919, lon: 72.8397, state: 'Maharashtra', region: 'MMR' },
  { name: 'Pune', lat: 18.5204, lon: 73.8567, state: 'Maharashtra', region: 'Western India' },
  { name: 'Nashik', lat: 19.9975, lon: 73.7898, state: 'Maharashtra', region: 'Northern Maharashtra' },
  { name: 'Nagpur', lat: 21.1458, lon: 79.0882, state: 'Maharashtra', region: 'Vidarbha' },
  { name: 'Chhatrapati Sambhajinagar', lat: 19.8762, lon: 75.3433, state: 'Maharashtra', region: 'Marathwada' },

  // Pan-India Metros & Economic Hubs
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946, state: 'Karnataka', region: 'South India' },
  { name: 'Delhi NCR', lat: 28.6139, lon: 77.2090, state: 'Delhi NCR', region: 'North India' },
  { name: 'Hyderabad', lat: 17.3850, lon: 78.4867, state: 'Telangana', region: 'South India' },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707, state: 'Tamil Nadu', region: 'South India' },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639, state: 'West Bengal', region: 'East India' },
  { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714, state: 'Gujarat', region: 'West India' },
  { name: 'Surat', lat: 21.1702, lon: 72.8311, state: 'Gujarat', region: 'West India' },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873, state: 'Rajasthan', region: 'North India' },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462, state: 'Uttar Pradesh', region: 'North India' },
  { name: 'Chandigarh', lat: 30.7333, lon: 76.7794, state: 'Punjab/Haryana', region: 'North India' },
  { name: 'Indore', lat: 22.7196, lon: 75.8577, state: 'Madhya Pradesh', region: 'Central India' },
  { name: 'Goa (Panaji)', lat: 15.4909, lon: 73.8278, state: 'Goa', region: 'West India' },
  { name: 'Kochi', lat: 9.9312, lon: 76.2673, state: 'Kerala', region: 'South India' },
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
      temperature: 28,
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
 * Weather-Aware Simulated Effective Radius (30 KM LOGISTICS RULE)
 * - Normal = 30 km
 * - Moderate = 25 km
 * - Heavy = 20 km
 * - Severe / Extreme = 15 km
 */
export function getEffectiveRadius(weatherClass, score = 0) {
  if (!weatherClass) return STANDARD_LOGISTICS_RADIUS_KM;

  const s = Number(score) || 0;
  const severity = weatherClass.severity || 'mild';
  const isStorm = weatherClass.isStorm || s >= 50;

  // Severe: 15 km
  if (severity === 'extreme' || severity === 'severe' || isStorm || s >= 50) {
    return 15;
  }
  // Heavy: 20 km
  if (weatherClass.rainfallBand === 'rainfall_heavy' || s >= 40) {
    return 20;
  }
  // Moderate: 25 km
  if (severity === 'moderate' || s >= 25) {
    return 25;
  }
  // Normal: 30 km
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
      statusText: 'AT RISK',
      badgeLabel: '⚠ AT RISK',
      tone: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
      level: 'critical',
      dotColor: '#EF4444',
      recommendation: 'Delivery distance exceeds simulated radius — reschedule or assign closer partner.',
    };
  }
  if (dp >= 0.55 || (dp >= 0.4 && exceedsRadius) || exceedsRadius) {
    return {
      statusText: 'AT RISK',
      badgeLabel: '⚠ AT RISK',
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
