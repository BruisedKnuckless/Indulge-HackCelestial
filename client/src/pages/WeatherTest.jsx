/**
 * WeatherTest.jsx
 *
 * DEV-ONLY test page for the Indulge Weather API pipeline.
 * Route: /weather-test
 *
 * This page lets a developer:
 *  - Query live weather for predefined Indulge locations (Thane, Mumbai, Navi Mumbai)
 *  - Enter custom coordinates
 *  - See the full normalized WeatherSnapshot
 *  - Observe cache hits vs live fetches
 *  - Test error conditions (invalid coords, missing key)
 *
 * SECURITY: This page calls /api/weather — the API key is NEVER
 * exposed here. Only the normalized response is displayed.
 */

import { useState, useCallback } from 'react';
import api from '../api/client';

// ─── Preset locations for quick testing ──────────────────────────────────────

const PRESETS = [
  { label: 'Thane, MH', lat: 19.2183, lon: 72.9781 },
  { label: 'Mumbai, MH', lat: 19.076, lon: 72.8777 },
  { label: 'Navi Mumbai, MH', lat: 19.033, lon: 73.0297 },
  { label: 'Pune, MH', lat: 18.5204, lon: 73.8567 },
  { label: 'Nashik, MH', lat: 19.9975, lon: 73.7898 },
  { label: 'Invalid coords (test)', lat: 999, lon: 999 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function WeatherIcon({ icon }) {
  if (!icon) return null;
  return (
    <img
      src={'https://openweathermap.org/img/wn/' + icon + '@2x.png'}
      alt="weather icon"
      style={{ width: 64, height: 64, display: 'block' }}
    />
  );
}

function Badge({ label, value, unit = '' }) {
  return (
    <div style={styles.badge}>
      <span style={styles.badgeLabel}>{label}</span>
      <span style={styles.badgeValue}>{value != null ? ('' + value + unit) : '—'}</span>
    </div>
  );
}

function ForecastRow({ slot }) {
  const d = new Date(slot.time);
  return (
    <div style={styles.forecastRow}>
      <span style={styles.forecastTime}>
        {d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
        {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
      </span>
      <WeatherIcon icon={slot.weatherIcon} />
      <span style={styles.forecastTemp}>{slot.temperature != null ? (slot.temperature.toFixed(1) + '°C') : '—'}</span>
      <span style={styles.forecastDesc}>{slot.weatherDescription}</span>
      <span style={styles.forecastWind}>{slot.windSpeed != null ? (slot.windSpeed + ' m/s ' + slot.windDirection) : '—'}</span>
      <span style={styles.forecastRain}>
        {slot.precipitation ? ((slot.precipitation * 100).toFixed(0) + '% rain') : 'No rain'}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WeatherTest() {
  const [lat, setLat] = useState('19.2183');
  const [lon, setLon] = useState('72.9781');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);

  const fetchWeather = useCallback(async (overrideLat, overrideLon) => {
    const qLat = overrideLat ?? lat;
    const qLon = overrideLon ?? lon;
    setLoading(true);
    setError(null);
    setResult(null);
    setLastRequest({ lat: qLat, lon: qLon, at: new Date().toISOString() });
    try {
      const { data } = await api.get('/weather?lat=' + qLat + '&lon=' + qLon);
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [lat, lon]);

  const applyPreset = (preset) => {
    setLat(String(preset.lat));
    setLon(String(preset.lon));
    fetchWeather(preset.lat, preset.lon);
  };

  const cur = result?.current;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <span style={styles.headerIcon}>🌦️</span>
            <div>
              <h1 style={styles.h1}>Indulge Weather API — Test Console</h1>
              <p style={styles.subtitle}>
                Stage 1: Live weather pipeline · Source: OpenWeather · API key is server-side only
              </p>
            </div>
          </div>
          {result && (
            <div style={result.cached ? styles.tagCached : styles.tagLive}>
              {result.cached ? '⚡ CACHED' : '🔴 LIVE'}
            </div>
          )}
        </div>

        {/* Presets */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Quick Locations</h2>
          <div style={styles.presetGrid}>
            {PRESETS.map((p) => (
              <button key={p.label} style={styles.presetBtn} onClick={() => applyPreset(p)}>
                📍 {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Coords */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Custom Coordinates</h2>
          <div style={styles.coordRow}>
            <label style={styles.label}>
              Latitude
              <input
                id="weather-lat"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={styles.input}
                placeholder="e.g. 19.2183"
              />
            </label>
            <label style={styles.label}>
              Longitude
              <input
                id="weather-lon"
                type="number"
                step="any"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                style={styles.input}
                placeholder="e.g. 72.9781"
              />
            </label>
            <button
              id="weather-fetch-btn"
              style={styles.fetchBtn}
              onClick={() => fetchWeather()}
              disabled={loading}
            >
              {loading ? 'Fetching…' : 'Fetch Weather'}
            </button>
          </div>
          {lastRequest && (
            <p style={styles.meta}>
              Last request: lat={lastRequest.lat}, lon={lastRequest.lon} at {new Date(lastRequest.at).toLocaleTimeString('en-IN')}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Result — unavailable */}
        {result && !result.available && (
          <div style={styles.unavailableBox}>
            <h3 style={{ margin: 0, color: '#fbbf24' }}>⚠️ Weather Unavailable</h3>
            <p style={{ margin: '8px 0 0', color: '#fde68a' }}>{result.reason}</p>
            <p style={styles.meta}>Fetched at: {result.fetchedAt}</p>
          </div>
        )}

        {/* Result — available */}
        {result && result.available && cur && (
          <>
            {/* Location + Condition */}
            <div style={styles.section}>
              <div style={styles.conditionCard}>
                <div style={styles.conditionLeft}>
                  <WeatherIcon icon={cur.weatherIcon} />
                  <div>
                    <div style={styles.conditionMain}>{cur.weatherCondition}</div>
                    <div style={styles.conditionDesc}>{cur.weatherDescription}</div>
                  </div>
                </div>
                <div style={styles.conditionRight}>
                  <span style={styles.tempBig}>{cur.temperature != null ? (cur.temperature.toFixed(1) + '°C') : '—'}</span>
                  <span style={styles.feelsLike}>Feels like {cur.feelsLike != null ? (cur.feelsLike.toFixed(1) + '°C') : '—'}</span>
                </div>
              </div>
              <div style={styles.locationLine}>
                📍 {result.location?.name}{result.location?.country ? (', ' + result.location.country) : ''} &nbsp;·&nbsp;
                {result.location?.latitude}°N, {result.location?.longitude}°E &nbsp;·&nbsp;
                Observed: {new Date(cur.observedAt).toLocaleTimeString('en-IN')}
              </div>
            </div>

            {/* Detail Badges */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Current Conditions</h2>
              <div style={styles.badgeGrid}>
                <Badge label="Humidity" value={cur.humidity} unit="%" />
                <Badge label="Wind Speed" value={cur.windSpeed != null ? cur.windSpeed.toFixed(1) : null} unit=" m/s" />
                <Badge label="Wind Direction" value={cur.windDirection} />
                {cur.windGust != null && <Badge label="Wind Gust" value={cur.windGust.toFixed(1)} unit=" m/s" />}
                <Badge label="Rainfall (1h)" value={cur.rainfallIntensity} unit=" mm" />
                <Badge label="Snowfall (1h)" value={cur.snowfall} unit=" mm" />
                <Badge label="Pressure" value={cur.pressure} unit=" hPa" />
                <Badge label="Visibility" value={cur.visibility != null ? (cur.visibility / 1000).toFixed(1) : null} unit=" km" />
                <Badge label="Cloud Cover" value={cur.cloudCoverage} unit="%" />
                <Badge label="Sunrise" value={cur.sunrise ? new Date(cur.sunrise).toLocaleTimeString('en-IN') : null} />
                <Badge label="Sunset" value={cur.sunset ? new Date(cur.sunset).toLocaleTimeString('en-IN') : null} />
              </div>
            </div>

            {/* Forecast */}
            {result.forecast?.length > 0 && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>5-Day Forecast ({result.forecast.length} slots)</h2>
                <div style={styles.forecastContainer}>
                  {result.forecast.slice(0, 16).map((slot, i) => (
                    <ForecastRow key={i} slot={slot} />
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Raw Normalized Response</h2>
              <pre id="weather-raw-json" style={styles.jsonBlock}>
                {JSON.stringify({ ...result, forecast: result.forecast?.slice(0, 3) }, null, 2)}
                {result.forecast?.length > 3 ? ('\n  // … ' + (result.forecast.length - 3) + ' more forecast slots') : ''}
              </pre>
              <p style={styles.meta}>
                Source: {result.source} · Fetched at: {result.fetchedAt} · Cached: {String(result.cached)}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    padding: '24px 16px',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: '#e2e8f0',
  },
  container: {
    maxWidth: 900,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  headerIcon: {
    fontSize: 48,
    lineHeight: 1,
  },
  h1: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: '#f1f5f9',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#94a3b8',
  },
  tagLive: {
    padding: '6px 14px',
    background: '#dc262620',
    border: '1px solid #dc2626',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    color: '#f87171',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
    marginTop: 4,
  },
  tagCached: {
    padding: '6px 14px',
    background: '#16a34a20',
    border: '1px solid #16a34a',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    color: '#4ade80',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
    marginTop: 4,
  },
  section: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '20px 24px',
    marginBottom: 20,
  },
  sectionTitle: {
    margin: '0 0 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  presetGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetBtn: {
    padding: '8px 16px',
    background: 'rgba(99,102,241,0.15)',
    border: '1px solid rgba(99,102,241,0.4)',
    borderRadius: 8,
    color: '#a5b4fc',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'background 0.2s',
  },
  coordRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: 500,
  },
  input: {
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 14,
    width: 160,
    outline: 'none',
  },
  fetchBtn: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    height: 42,
  },
  meta: {
    margin: '10px 0 0',
    fontSize: 12,
    color: '#64748b',
  },
  errorBox: {
    background: '#dc262620',
    border: '1px solid #dc2626',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 20,
    color: '#fca5a5',
    fontSize: 14,
  },
  unavailableBox: {
    background: '#78350f20',
    border: '1px solid #b45309',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 20,
  },
  conditionCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  conditionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  conditionMain: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f1f5f9',
  },
  conditionDesc: {
    fontSize: 14,
    color: '#94a3b8',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  conditionRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  tempBig: {
    fontSize: 48,
    fontWeight: 800,
    color: '#fbbf24',
    lineHeight: 1,
  },
  feelsLike: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  locationLine: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  badgeGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '10px 16px',
    minWidth: 110,
  },
  badgeLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 600,
  },
  badgeValue: {
    fontSize: 18,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  forecastContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 400,
    overflowY: 'auto',
  },
  forecastRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    fontSize: 13,
    flexWrap: 'wrap',
  },
  forecastTime: { color: '#94a3b8', minWidth: 160 },
  forecastTemp: { fontWeight: 700, color: '#fbbf24', minWidth: 60 },
  forecastDesc: { color: '#cbd5e1', flex: 1, textTransform: 'capitalize' },
  forecastWind: { color: '#7dd3fc', minWidth: 100 },
  forecastRain: { color: '#86efac', minWidth: 80 },
  jsonBlock: {
    background: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    padding: '16px',
    fontSize: 12,
    color: '#86efac',
    overflowX: 'auto',
    maxHeight: 360,
    lineHeight: 1.6,
    margin: 0,
  },
};
