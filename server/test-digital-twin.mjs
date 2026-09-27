/**
 * test-digital-twin.mjs — Stage 2 Digital Twin test suite
 *
 * Uses the same connectDB() / runSeed() as the main server to boot
 * an in-memory MongoDB so every simulation test gets real seeded data.
 *
 * Run: node --env-file=.env test-digital-twin.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

// ── Bootstrap DB (same as server startup) ────────────────────────────────────
import { connectDB, disconnectDB } from './src/config/db.js';
import { runSeed } from './src/seed/seed.js';

// ── Register Mongoose schemas ─────────────────────────────────────────────────
import './src/models/Resource.js';
import './src/models/Booking.js';
import './src/models/Requirement.js';
import './src/models/LogisticsJob.js';

// ── Digital Twin service ──────────────────────────────────────────────────────
import { runWeatherSimulation, getTwinStatus } from './src/services/digital-twin.service.js';
import mongoose from 'mongoose';

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  PASS: ' + label); passed++; }
  else { console.error('  FAIL: ' + label + (detail ? ' | ' + detail : '')); failed++; }
}

console.log('=== Indulge Digital Twin Stage 2 Tests ===');

// ── Connect and seed ───────────────────────────────────────────────────────────
console.log('Booting in-memory MongoDB + seed...');
const { ephemeral } = await connectDB();
if (ephemeral) {
  await runSeed({ quiet: true });
}

// ── Pre-simulation counts (isolation check) ───────────────────────────────────
const preResCount  = await mongoose.model('Resource').countDocuments();
const preBookCount = await mongoose.model('Booking').countDocuments();
const preReqCount  = await mongoose.model('Requirement').countDocuments();
console.log('Pre-sim: resources=' + preResCount + ' bookings=' + preBookCount + ' requirements=' + preReqCount);

// ── T1: getTwinStatus ─────────────────────────────────────────────────────────
console.log('T1: getTwinStatus()');
const status = await getTwinStatus();
assert('has timestamp',        typeof status.timestamp === 'string');
assert('has activeResources',  typeof status.activeResources === 'number' && status.activeResources >= 0);
assert('has activeBookings',   typeof status.activeBookings === 'number');
assert('has openRequirements', typeof status.openRequirements === 'number');
console.log('  Status: resources=' + status.activeResources + ' bookings=' + status.activeBookings);

// ── T2: Invalid location ──────────────────────────────────────────────────────
console.log('T2: Invalid location');
const r2 = await runWeatherSimulation({ location: 'nonexistentcityxyz', scenario: { rainfallMmPerHour: 10 } });
assert('success=false bad location', r2.success === false);
assert('has error',                  typeof r2.error === 'string');
assert('has simulationId',           r2.simulationId && r2.simulationId.startsWith('sim_'));

// ── T3: Thane storm scenario (THE MAIN DEMO) ──────────────────────────────────
console.log('T3: Thane storm (90mm/h, 28C, 5h, 15m/s wind)');
const r3 = await runWeatherSimulation({
  location: 'Thane',
  scenario: { rainfallMmPerHour: 90, temperature: 28, durationHours: 5, windSpeedMps: 15 },
  useLiveWeather: false,
});

assert('success=true',           r3.success === true);
assert('has simulationId',       r3.simulationId && r3.simulationId.startsWith('sim_'));
assert('location resolved',      r3.location && r3.location.resolved && r3.location.resolved.lat === 19.2183);
assert('scenario rain=90',       r3.scenario && r3.scenario.rainfallMmPerHour === 90);
assert('scenario temp=28',       r3.scenario && r3.scenario.temperature === 28);
assert('scenario dur=5',         r3.scenario && r3.scenario.durationHours === 5);

const wc = r3.weatherClassification;
assert('rainfallBand=heavy',     wc && wc.rainfallBand === 'rainfall_heavy');
assert('isStorm=true',           wc && wc.isStorm === true);
assert('severity severe/extreme',wc && (wc.severity === 'severe' || wc.severity === 'extreme'));
assert('score > 50',             wc && wc.score > 50);

const m = r3.metrics;
assert('metrics object exists',  m && typeof m === 'object');
assert('totalResourcesScanned',  typeof m.totalResourcesScanned === 'number');
assert('resources scanned > 0',  m.totalResourcesScanned > 0);
assert('criticalResources >= 0', typeof m.criticalResources === 'number' && m.criticalResources >= 0);
assert('bookingsAtRisk >= 0',    typeof m.totalBookingsAtRisk === 'number' && m.totalBookingsAtRisk >= 0);
assert('revenueLoss >= 0',       typeof m.estimatedTotalRevenueLossInr === 'number' && m.estimatedTotalRevenueLossInr >= 0);
assert('avgAvailFactor 0-1',     m.avgAvailabilityFactor >= 0 && m.avgAvailabilityFactor <= 1);

assert('affectedResources array',     Array.isArray(r3.affectedResources));
assert('affectedResources non-empty', r3.affectedResources.length > 0);
assert('affectedBookings array',      Array.isArray(r3.affectedBookings));
assert('affectedRequirements array',  Array.isArray(r3.affectedRequirements));
assert('affectedLogisticsJobs array', Array.isArray(r3.affectedLogisticsJobs));
assert('cascadingEffects array',      Array.isArray(r3.cascadingEffects));
assert('has cascading effects',       r3.cascadingEffects.length > 0);

// Resource shape
const ar = r3.affectedResources[0];
assert('resource has resourceId',     typeof ar.resourceId === 'string');
assert('resource has title',          typeof ar.title === 'string');
assert('resource has category',       typeof ar.category === 'string');
assert('resource simFactor 0-1',      ar.simulatedAvailabilityFactor >= 0 && ar.simulatedAvailabilityFactor <= 1);
assert('resource has impactLevel',    ['low','moderate','high','critical'].includes(ar.impactLevel));
assert('resource has reasons',        Array.isArray(ar.reasons) && ar.reasons.length > 0);

// Vehicle should be critically impacted in storm
const vr = r3.affectedResources.find((r) => r.category === 'vehicle');
if (vr) {
  assert('vehicle critically impacted', vr.simulatedAvailabilityFactor < 0.5);
  assert('vehicle impactLevel high/critical', vr.impactLevel === 'critical' || vr.impactLevel === 'high');
}

// Cascading effect shape
const ce = r3.cascadingEffects[0];
assert('cascade has type',     typeof ce.type === 'string');
assert('cascade has severity', typeof ce.severity === 'string');
assert('cascade has cascade',  ['primary','secondary','tertiary'].includes(ce.cascade));

// Meta
assert('meta.dataIsolation=READ_ONLY', r3.meta && r3.meta.dataIsolation && r3.meta.dataIsolation.includes('READ_ONLY'));
assert('meta.source set',              r3.meta && r3.meta.source && r3.meta.source.includes('Digital Twin'));
assert('meta.completedAt',             r3.meta && typeof r3.meta.completedAt === 'string');

// ── T4: Mumbai mild scenario ──────────────────────────────────────────────────
console.log('T4: Mumbai mild weather (2mm/h, 1h)');
const r4 = await runWeatherSimulation({
  location: 'Mumbai',
  scenario: { rainfallMmPerHour: 2, temperature: 30, durationHours: 1, windSpeedMps: 3 },
});
assert('success=true mild',       r4.success === true);
assert('rainfallBand=light',      r4.weatherClassification && r4.weatherClassification.rainfallBand === 'rainfall_light');
assert('severity=mild',           r4.weatherClassification && r4.weatherClassification.severity === 'mild');
assert('avgFactor > 0.7 mild',    r4.metrics && r4.metrics.avgAvailabilityFactor > 0.7);

// ── T5: No rain ───────────────────────────────────────────────────────────────
console.log('T5: No rain (clear day)');
const r5 = await runWeatherSimulation({
  location: 'Thane',
  scenario: { rainfallMmPerHour: 0, temperature: 30, durationHours: 1, windSpeedMps: 5 },
});
assert('success=true clear',      r5.success === true);
assert('rainfallBand=none',       r5.weatherClassification && r5.weatherClassification.rainfallBand === 'none');
assert('isStorm=false',           r5.weatherClassification && r5.weatherClassification.isStorm === false);

// ── T6: Coordinates input ─────────────────────────────────────────────────────
console.log('T6: Coord input {lat,lon}');
const r6 = await runWeatherSimulation({
  location: { lat: 19.0330, lon: 73.0297 },
  scenario: { rainfallMmPerHour: 50, durationHours: 3 },
});
assert('success=true coords',     r6.success === true);
assert('resolved lat correct',    r6.location && r6.location.resolved && r6.location.resolved.lat === 19.0330);

// ── T7: DB isolation ──────────────────────────────────────────────────────────
console.log('T7: DB isolation verification');
const postResCount  = await mongoose.model('Resource').countDocuments();
const postBookCount = await mongoose.model('Booking').countDocuments();
const postReqCount  = await mongoose.model('Requirement').countDocuments();
assert('resource count unchanged',     postResCount  === preResCount);
assert('booking count unchanged',      postBookCount === preBookCount);
assert('requirement count unchanged',  postReqCount  === preReqCount);
console.log('Post-sim: resources=' + postResCount + ' bookings=' + postBookCount + ' requirements=' + postReqCount);

// ── Demo output for Thane storm ───────────────────────────────────────────────
if (r3.success) {
  console.log('');
  console.log('=== THANE STORM SCENARIO DEMO ===');
  console.log('Simulation ID:   ' + r3.simulationId);
  console.log('Location:        ' + JSON.stringify(r3.location));
  console.log('Scenario:        rain=' + r3.scenario.rainfallMmPerHour + 'mm/h | temp=' + r3.scenario.temperature + 'C | dur=' + r3.scenario.durationHours + 'h | wind=' + r3.scenario.windSpeedMps + 'm/s');
  console.log('Classification:  ' + wc.severity + ' (score=' + wc.score + ', band=' + wc.rainfallBand + ', storm=' + wc.isStorm + ', highWind=' + wc.isHighWind + ')');
  console.log('');
  console.log('IMPACT METRICS:');
  console.log('  Resources scanned:      ' + m.totalResourcesScanned);
  console.log('  Affected resources:     ' + m.affectedResourcesCount);
  console.log('  CRITICAL resources:     ' + m.criticalResources);
  console.log('  Bookings at risk:       ' + m.totalBookingsAtRisk);
  console.log('  HIGH-risk bookings:     ' + m.highRiskBookings);
  console.log('  Requirements scanned:   ' + m.totalRequirementsScanned);
  console.log('  Surge requirements:     ' + m.surgeRequirements);
  console.log('  Active logistics jobs:  ' + m.activeLogisticsJobs);
  console.log('  Disrupted logistics:    ' + m.disruptedLogistics);
  console.log('  Est. revenue loss:      INR ' + m.estimatedTotalRevenueLossInr.toLocaleString('en-IN'));
  console.log('  Avg availability:       ' + (m.avgAvailabilityFactor * 100).toFixed(1) + '%');
  console.log('');
  console.log('AFFECTED RESOURCES (first 5):');
  for (const res of r3.affectedResources.slice(0, 5)) {
    console.log('  [' + res.impactLevel.toUpperCase() + '] ' + res.title + ' (' + res.category + ') — avail=' + (res.simulatedAvailabilityFactor * 100).toFixed(0) + '%, loss=INR ' + res.estimatedRevenueLossInr);
  }
  console.log('');
  console.log('AFFECTED BOOKINGS (first 3):');
  for (const b of r3.affectedBookings.slice(0, 3)) {
    console.log('  [' + b.riskLevel.toUpperCase() + '] Booking ' + b.bookingId + ' | disruption=' + (b.disruptionProbability * 100).toFixed(0) + '%');
    console.log('    -> ' + b.recommendation);
  }
  console.log('');
  console.log('AFFECTED REQUIREMENTS (first 3):');
  for (const req of r3.affectedRequirements.slice(0, 3)) {
    console.log('  ' + req.title + ' (' + req.category + ') — surge=x' + req.demandSurgeMultiplier + ' | ' + req.note);
  }
  console.log('');
  console.log('CASCADING EFFECTS (' + r3.cascadingEffects.length + '):');
  for (const e of r3.cascadingEffects) {
    console.log('  [' + e.cascade.toUpperCase() + '] ' + e.type + ' [' + e.severity + ']: ' + e.description);
  }
  console.log('');
  console.log('DB ISOLATION: ' + r3.meta.dataIsolation);
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('');
console.log('=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===');

await disconnectDB();
if (failed > 0) process.exit(1);
