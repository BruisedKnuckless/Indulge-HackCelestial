/**
 * Safe sessionStorage persistence and validation for Nearby discovery state.
 *
 * Persists:
 * - Selected coordinates (lat, lng, city, isDemo, isBusiness, sourceType)
 * - Selected radius (radiusKm)
 * - Active mode (resources vs requirements)
 * - Active category filter
 * - Active sort option
 * - Mobile view tab (map vs list)
 */

export const NEARBY_SESSION_KEY = 'indulge_nearby_session_v1';

/**
 * Validates and safely parses saved Nearby session state.
 * Discards corrupt or invalid data and returns null if invalid.
 */
export function getSavedNearbySession() {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;

  try {
    const raw = window.sessionStorage.getItem(NEARBY_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // 1. Strict Coordinate Validation
    const { coords } = parsed;
    if (!coords || typeof coords !== 'object') return null;

    const lat = Number(coords.lat);
    const lng = Number(coords.lng);

    // Must be finite numbers and valid geographical ranges (-90..90, -180..180)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      clearNearbySession();
      return null;
    }

    const safeCoords = {
      lat,
      lng,
      city: typeof coords.city === 'string' ? coords.city.trim().slice(0, 120) : undefined,
      isDemo: Boolean(coords.isDemo),
      isBusiness: Boolean(coords.isBusiness),
      sourceType: ['current', 'demo', 'business'].includes(coords.sourceType)
        ? coords.sourceType
        : coords.isDemo
        ? 'demo'
        : coords.isBusiness
        ? 'business'
        : 'current',
      accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : undefined,
    };

    // 2. Radius Validation (positive number between 1 and 500 km)
    const rawRadius = Number(parsed.radiusKm);
    const safeRadius = Number.isFinite(rawRadius) && rawRadius >= 1 && rawRadius <= 500 ? rawRadius : 25;

    // 3. Mode Validation ('resources' | 'requirements')
    const safeMode = parsed.mode === 'requirements' ? 'requirements' : 'resources';

    // 4. Category Validation
    const safeCategory = typeof parsed.category === 'string' && parsed.category.trim() ? parsed.category.trim() : 'all';

    // 5. Sort Validation
    const safeSort = ['distance', 'price_asc', 'price_desc', 'rating'].includes(parsed.sort)
      ? parsed.sort
      : 'distance';

    // 6. Mobile Tab Validation
    const safeMobileTab = parsed.mobileTab === 'list' ? 'list' : 'map';

    return {
      coords: safeCoords,
      radiusKm: safeRadius,
      mode: safeMode,
      category: safeCategory,
      sort: safeSort,
      mobileTab: safeMobileTab,
    };
  } catch (err) {
    console.warn('Discarding unreadable Nearby session state:', err);
    clearNearbySession();
    return null;
  }
}

/**
 * Saves current Nearby state to sessionStorage safely.
 */
export function saveNearbySession(state) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;

  try {
    if (!state || !state.coords) {
      clearNearbySession();
      return;
    }

    const lat = Number(state.coords.lat);
    const lng = Number(state.coords.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const payload = {
      coords: {
        lat,
        lng,
        city: state.coords.city,
        isDemo: Boolean(state.coords.isDemo),
        isBusiness: Boolean(state.coords.isBusiness),
        sourceType: state.coords.sourceType || (state.coords.isDemo ? 'demo' : state.coords.isBusiness ? 'business' : 'current'),
        accuracy: state.coords.accuracy,
      },
      radiusKm: Number(state.radiusKm) || 25,
      mode: state.mode === 'requirements' ? 'requirements' : 'resources',
      category: state.category || 'all',
      sort: state.sort || 'distance',
      mobileTab: state.mobileTab === 'list' ? 'list' : 'map',
      savedAt: Date.now(),
    };

    window.sessionStorage.setItem(NEARBY_SESSION_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save Nearby session state:', err);
  }
}

/**
 * Clears Nearby session state from sessionStorage.
 */
export function clearNearbySession() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;

  try {
    window.sessionStorage.removeItem(NEARBY_SESSION_KEY);
  } catch {}
}
