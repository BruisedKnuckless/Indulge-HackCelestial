/**
 * weather.service.js
 *
 * Indulge Live Weather Integration — Stage 1
 * Source: OpenWeather Current Weather API (2.5) + 5-Day Forecast API
 *
 * Security rules:
 *  - API key is read ONLY from process.env.OPENWEATHER_API_KEY
 *  - Key is NEVER logged, returned in responses, or passed to the client
 *  - This module must NEVER be imported from any frontend/client code
 *
 * Future use:
 *  - The normalized WeatherSnapshot and Forecast objects are designed to be
 *    consumed directly by the Indulge Digital Twin layer without modification.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const OW_BASE = 'https://api.openweathermap.org/data/2.5';

function cacheTtlMs() {
  const raw = parseInt(process.env.WEATHER_CACHE_TTL_SECONDS || '300', 10);
  return isNaN(raw) || raw <= 0 ? 300_000 : raw * 1000;
}

function fetchTimeoutMs() {
  const raw = parseInt(process.env.WEATHER_FETCH_TIMEOUT_MS || '8000', 10);
  return isNaN(raw) || raw <= 0 ? 8_000 : raw;
}

// ─── In-memory Cache ─────────────────────────────────────────────────────────

const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry;
}

function cacheSet(key, data) {
  _cache.set(key, { data, expiresAt: Date.now() + cacheTtlMs() });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs());

  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('OpenWeather request timed out after ' + fetchTimeoutMs() + ' ms');
    }
    throw new Error('OpenWeather network error: ' + err.message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch (_) {}
    throw new Error('OpenWeather returned HTTP ' + res.status + ': ' + body);
  }

  return res.json();
}

// ─── Wind direction mapper ───────────────────────────────────────────────────

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

function windBearing(deg) {
  if (deg == null) return 'UNKNOWN';
  return COMPASS[Math.round(deg / 22.5) % 16];
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeForecastSlot(item) {
  return {
    time: new Date(item.dt * 1000).toISOString(),
    temperature: item.main?.temp ?? null,
    feelsLike: item.main?.feels_like ?? null,
    humidity: item.main?.humidity ?? null,
    precipitation: item.pop ?? 0,
    rainfallMm: item.rain?.['3h'] ?? 0,
    snowfallMm: item.snow?.['3h'] ?? 0,
    windSpeed: item.wind?.speed ?? null,
    windDirection: windBearing(item.wind?.deg),
    weatherCondition: item.weather?.[0]?.main ?? 'Unknown',
    weatherDescription: item.weather?.[0]?.description ?? '',
    weatherIcon: item.weather?.[0]?.icon ?? null,
  };
}

function buildSnapshot(current, forecastList = []) {
  return {
    location: {
      name: current.name || 'Unknown',
      country: current.sys?.country || null,
      latitude: current.coord?.lat ?? null,
      longitude: current.coord?.lon ?? null,
    },
    current: {
      temperature: current.main?.temp ?? null,
      feelsLike: current.main?.feels_like ?? null,
      humidity: current.main?.humidity ?? null,
      precipitation: current.rain?.['1h'] ?? current.rain?.['3h'] ?? 0,
      rainfallIntensity: current.rain?.['1h'] ?? 0,
      snowfall: current.snow?.['1h'] ?? 0,
      windSpeed: current.wind?.speed ?? null,
      windDirection: windBearing(current.wind?.deg),
      windGust: current.wind?.gust ?? null,
      weatherCondition: current.weather?.[0]?.main ?? 'Unknown',
      weatherDescription: current.weather?.[0]?.description ?? '',
      weatherIcon: current.weather?.[0]?.icon ?? null,
      visibility: current.visibility ?? null,
      pressure: current.main?.pressure ?? null,
      cloudCoverage: current.clouds?.all ?? null,
      observedAt: new Date(current.dt * 1000).toISOString(),
      sunrise: current.sys?.sunrise ? new Date(current.sys.sunrise * 1000).toISOString() : null,
      sunset: current.sys?.sunset ? new Date(current.sys.sunset * 1000).toISOString() : null,
    },
    forecast: forecastList.map(normalizeForecastSlot),
    source: 'OpenWeather',
    available: true,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getWeatherByCoords(lat, lon) {
  const numLat = Number(lat);
  const numLon = Number(lon);

  if (!isFinite(numLat) || numLat < -90 || numLat > 90) {
    return unavailable('Invalid latitude: ' + lat);
  }
  if (!isFinite(numLon) || numLon < -180 || numLon > 180) {
    return unavailable('Invalid longitude: ' + lon);
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || apiKey === 'YOUR_OPENWEATHER_API_KEY_HERE' || apiKey.trim() === '') {
    return unavailable('OPENWEATHER_API_KEY is not configured in the server environment.');
  }

  const cacheKey = numLat.toFixed(2) + ',' + numLon.toFixed(2);
  const cached = cacheGet(cacheKey);
  if (cached) {
    return { ...cached.data, cached: true };
  }

  const params = 'lat=' + numLat + '&lon=' + numLon + '&units=metric&appid=' + apiKey;

  let currentData, forecastData;
  try {
    [currentData, forecastData] = await Promise.all([
      fetchWithTimeout(OW_BASE + '/weather?' + params),
      fetchWithTimeout(OW_BASE + '/forecast?' + params + '&cnt=40'),
    ]);
  } catch (err) {
    const safeMsg = err.message.replace(apiKey, '[REDACTED]');
    console.error('[WeatherService] Fetch error: ' + safeMsg);
    return unavailable('OpenWeather request failed: ' + safeMsg);
  }

  const snapshot = buildSnapshot(currentData, forecastData?.list ?? []);
  cacheSet(cacheKey, snapshot);

  return { ...snapshot, cached: false };
}

export function getCacheStats() {
  const now = Date.now();
  let live = 0;
  for (const [, entry] of _cache) {
    if (now <= entry.expiresAt) live++;
  }
  return {
    totalEntries: _cache.size,
    liveEntries: live,
    ttlMs: cacheTtlMs(),
    timeoutMs: fetchTimeoutMs(),
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function unavailable(reason) {
  return {
    available: false,
    reason,
    location: null,
    current: null,
    forecast: [],
    source: 'OpenWeather',
    fetchedAt: new Date().toISOString(),
  };
}
