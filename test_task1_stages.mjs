// test_task1_stages.mjs - Comprehensive Stage 1-4 Verification for Task 1
import http from 'http';

const BASE_URL = 'http://localhost:5050/api';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('TASK 1 — STAGES 1 TO 4 AUTOMATED VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  // ── STAGE 1: LIVE WEATHER INTEGRATION ──
  console.log('--- Stage 1: Weather API ---');
  try {
    const res = await request('/weather?lat=19.2183&lon=72.9781');
    assert(res.status === 200, `GET /api/weather returned status 200 (got ${res.status})`);
    assert(res.data.available === true, 'Weather data available flag is true');
    assert(res.data.current && typeof res.data.current.temperature === 'number', 'Current temperature is valid number');
    assert(res.data.cached !== undefined, 'Cache status is present');
  } catch (err) {
    console.error('Stage 1 error:', err.message);
  }

  // ── STAGE 2: DIGITAL TWIN SIMULATION ──
  console.log('\n--- Stage 2: Digital Twin Simulation ---');
  try {
    // 1. Normal Day preset (Rainfall: 0, Wind: 2, Temp: 28, Duration: 1h)
    const normalRes = await request('/digital-twin/simulate', {
      method: 'POST',
      body: {
        location: { name: 'Thane', lat: 19.2183, lon: 72.9781 },
        scenario: { rainfallMmPerHour: 0, temperature: 28, windSpeedMps: 2, durationHours: 1 },
      },
    });
    assert(normalRes.status === 200, 'POST /api/digital-twin/simulate (Normal Day) returned 200');
    assert(normalRes.data.weatherClassification?.severity === 'mild', 'Normal Day classified as mild');
    assert(normalRes.data.weatherClassification?.score <= 10, `Normal Day score low (got ${normalRes.data.weatherClassification?.score})`);

    // 2. Severe Storm preset (Rainfall: 90, Wind: 15, Temp: 28, Duration: 5h)
    const severeRes = await request('/digital-twin/simulate', {
      method: 'POST',
      body: {
        location: { name: 'Thane', lat: 19.2183, lon: 72.9781 },
        scenario: { rainfallMmPerHour: 90, temperature: 28, windSpeedMps: 15, durationHours: 5 },
      },
    });
    assert(severeRes.status === 200, 'POST /api/digital-twin/simulate (Severe Storm) returned 200');
    assert(
      severeRes.data.weatherClassification?.severity === 'severe' || severeRes.data.weatherClassification?.severity === 'extreme',
      `Severe Storm classified as severe/extreme (got ${severeRes.data.weatherClassification?.severity})`
    );
    assert(severeRes.data.weatherClassification?.isStorm === true, 'Severe Storm isStorm flag is true');
    assert(severeRes.data.metrics?.affectedResourcesCount > 0, 'Affected resources count > 0 in severe storm');
    assert(severeRes.data.cascadingEffects?.length > 0, 'Cascading effects array is populated');
  } catch (err) {
    console.error('Stage 2 error:', err.message);
  }

  // ── STAGE 3: GEOSPATIAL MAP DATA INTEGRITY ──
  console.log('\n--- Stage 3: Geospatial Map Verification ---');
  try {
    const res = await request('/digital-twin/simulate', {
      method: 'POST',
      body: {
        location: { name: 'Thane', lat: 19.2183, lon: 72.9781 },
        scenario: { rainfallMmPerHour: 90, temperature: 28, windSpeedMps: 15, durationHours: 5 },
      },
    });
    assert(res.data.location?.resolved?.lat === 19.2183, 'Hub latitude matches Thane center');
    assert(res.data.location?.resolved?.lon === 72.9781, 'Hub longitude matches Thane center');
    assert(Array.isArray(res.data.affectedResources), 'Affected resources is an array');
    assert(Array.isArray(res.data.affectedBookings), 'Affected bookings is an array');
    assert(Array.isArray(res.data.affectedLogisticsJobs), 'Affected logistics jobs is an array');
  } catch (err) {
    console.error('Stage 3 error:', err.message);
  }

  // ── STAGE 4: PUBLIC & SOCIAL SIGNALS INTEGRATION ──
  console.log('\n--- Stage 4: Public Signals API ---');
  try {
    const res = await request('/public-signals?location=Thane');
    assert(res.status === 200, `GET /api/public-signals returned 200 (got ${res.status})`);
    assert(res.data.success === true, 'Public signals success flag is true');
    assert(typeof res.data.aggregation?.activityScore === 'number', 'Activity score is a number');
    assert(
      res.data.aggregation?.activityScore >= 0 && res.data.aggregation?.activityScore <= 100,
      `Activity score is clamped strictly between 0 and 100 (got ${res.data.aggregation?.activityScore})`
    );
    assert(Array.isArray(res.data.signals), 'Signals array is returned');
    assert(res.data.feedSource !== undefined, 'Syndication feed source is specified');
  } catch (err) {
    console.error('Stage 4 error:', err.message);
  }

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} / ${total} tests passed.`);
  console.log('====================================================');
  process.exit(passed === total ? 0 : 1);
}

runTests();
