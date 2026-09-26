import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Price } from '../ui';
import { CATEGORY_ICONS, CATEGORY_LABELS, resourceImage, PLACEHOLDER } from '../../lib/constants';

// Subtle marker category colors
const CATEGORY_COLORS = {
  commercial_kitchen: '#ea580c',
  cloud_kitchen: '#d97706',
  banquet_space: '#4f46e5',
  dining_hall: '#2563eb',
  kitchen_equipment: '#0d9488',
  food_truck: '#7c3aed',
  deep_freezer: '#0284c7',
  parking: '#059669',
  furniture: '#d97706',
  av_equipment: '#7c3aed',
  staff: '#0d9488',
};

const DEFAULT_RESOURCE_COLOR = '#4f46e5';
const REQUIREMENT_COLOR = '#d97706';
const SELECTED_COLOR = '#059669';

// Standard Google Maps teardrop vector pin path
const PIN_SVG_PATH =
  'M 12 2 C 8.13 2 5 5.13 5 9 C 5 14.25 12 22 12 22 C 12 22 19 14.25 19 9 C 19 5.13 15.87 2 12 2 Z M 12 6.5 A 2.5 2.5 0 1 0 12 11.5 A 2.5 2.5 0 1 0 12 6.5 Z';

/**
 * Loads the Google Maps JavaScript API script dynamically if an API key is provided.
 */
export function useGoogleMapsLoader() {
  const [loaded, setLoaded] = useState(() => typeof window.google?.maps?.Map === 'function');
  const [loadError, setLoadError] = useState(false);
  const [authError, setAuthError] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) {
      setLoaded(false);
      return;
    }

    // Capture auth failures if the provided API key has restrictions or needs API enabled
    window.gm_authFailure = () => {
      console.warn(
        'Google Maps API authentication warning: Please ensure "Maps JavaScript API" is enabled in Google Cloud Console for this key.'
      );
      setAuthError(true);
    };

    if (typeof window.google?.maps?.Map === 'function') {
      setLoaded(true);
      return;
    }

    const callbackName = '__initGoogleMapsApi';
    window[callbackName] = () => {
      setLoaded(true);
    };

    const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existingScript) {
      const interval = setInterval(() => {
        if (typeof window.google?.maps?.Map === 'function') {
          setLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      existingScript.addEventListener('error', () => {
        clearInterval(interval);
        setLoadError(true);
      });
      return () => clearInterval(interval);
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => setLoadError(true);
    document.head.appendChild(script);

    return () => {
      delete window[callbackName];
    };
  }, [apiKey]);

  return {
    isLoaded: loaded && typeof window.google?.maps?.Map === 'function',
    hasKey: Boolean(apiKey),
    loadError,
    authError,
    setLoadError,
  };
}

/**
 * Clean fallback when no Google Maps API key is configured or auth fails.
 */
function NoMapKeyFallback({ userCoords, radiusKm, isAuthError }) {
  return (
    <div className="relative w-full h-full min-h-[380px] bg-surface-alt rounded-xl border border-line overflow-hidden flex flex-col items-center justify-center p-8 select-none">
      <div className="absolute inset-0 opacity-5" aria-hidden>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        </svg>
      </div>

      <div className="relative z-10 text-center max-w-sm">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-surface border border-line flex items-center justify-center text-2xl shadow-sm">
          🗺️
        </div>

        <h3 className="text-base font-semibold text-ink mb-1.5">
          {isAuthError ? 'Google Maps Authentication Error' : 'Google Maps is not configured'}
        </h3>
        <p className="text-sm text-ink-soft leading-relaxed mb-4">
          {isAuthError ? (
            <>
              The configured API key could not be verified by Google Maps. Please check that{' '}
              <code className="px-1 py-0.5 rounded bg-surface-sunk border border-line text-xs font-mono text-accent">
                Maps JavaScript API
              </code>{' '}
              is enabled and billing is active.
            </>
          ) : (
            <>
              Add{' '}
              <code className="px-1 py-0.5 rounded bg-surface-sunk border border-line text-xs font-mono text-accent">
                VITE_GOOGLE_MAPS_API_KEY
              </code>{' '}
              to enable live interactive maps.
            </>
          )}
        </p>

        {userCoords && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-line text-xs text-ink-soft">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span>
              Location active — showing listings within <strong className="text-ink">{radiusKm} km</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main GoogleMap Component.
 * Visualizes resources and requirements with graceful degradation.
 */
export default function GoogleMap({
  userCoords,
  items = [],
  radiusKm = 25,
  selectedId,
  onSelect,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());
  const circleRef = useRef(null);
  const userMarkerRef = useRef(null);

  const { isLoaded, hasKey, loadError, authError, setLoadError } = useGoogleMapsLoader();
  const [activePreview, setActivePreview] = useState(null);
  const [showAuthWarning, setShowAuthWarning] = useState(true);

  // Sync selectedId with active preview & map center
  useEffect(() => {
    if (!selectedId) {
      setActivePreview(null);
      return;
    }
    const found = items.find((it) => it._id === selectedId);
    if (!found) return;

    setActivePreview(found);

    const coords = found.location?.coordinates || found.seeker?.location?.coordinates;
    if (coords?.length === 2 && mapInstanceRef.current) {
      const [lng, lat] = coords;
      try {
        mapInstanceRef.current.panTo({ lat, lng });
      } catch {
        /* best-effort pan */
      }
    }
  }, [selectedId, items]);

  // Auto-dismiss Google Maps development mode auth/billing popup
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new MutationObserver(() => {
      const errNodes = mapContainerRef.current.querySelectorAll(
        '.gm-err-container, [class*="gm-err"], div[style*="z-index: 100000"]'
      );
      errNodes.forEach((node) => {
        if (
          node.classList.contains('gm-err-container') ||
          node.textContent?.includes("This page can't load Google Maps correctly") ||
          node.textContent?.includes('Do you own this website?')
        ) {
          node.remove();
        }
      });

      const buttons = mapContainerRef.current.querySelectorAll('button');
      buttons.forEach((btn) => {
        if (btn.textContent?.trim() === 'OK') {
          btn.click();
        }
      });
    });

    observer.observe(mapContainerRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isLoaded]);

  // Initialize map instance
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || !userCoords) return;

    try {
      const google = window.google;
      if (!google?.maps?.Map) return;

      const center = { lat: userCoords.lat, lng: userCoords.lng };
      const zoom = radiusKm <= 5 ? 13 : radiusKm <= 15 ? 12 : radiusKm <= 35 ? 11 : 10;

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new google.maps.Map(mapContainerRef.current, {
          center,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
          ],
        });

        mapInstanceRef.current.addListener('click', () => {
          setActivePreview(null);
          if (onSelect) onSelect(null);
        });
      } else {
        mapInstanceRef.current.setCenter(center);
      }

      const map = mapInstanceRef.current;

      // Radius Circle
      if (circleRef.current) circleRef.current.setMap(null);
      circleRef.current = new google.maps.Circle({
        strokeColor: '#4f46e5',
        strokeOpacity: 0.5,
        strokeWeight: 1.5,
        fillColor: '#4f46e5',
        fillOpacity: 0.05,
        map,
        center,
        radius: (Number(radiusKm) || 25) * 1000,
      });

      // User Location Blue Marker
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      userMarkerRef.current = new google.maps.Marker({
        position: center,
        map,
        title: 'Your Location',
        zIndex: 999,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
      });
    } catch (err) {
      console.warn('Google Maps initialization failed:', err);
      setLoadError?.(true);
    }
  }, [isLoaded, userCoords, radiusKm, onSelect, setLoadError]);

  // Update item markers
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current) return;

    try {
      const google = window.google;
      if (!google?.maps?.Marker) return;
      const map = mapInstanceRef.current;

      // Clean up previous markers
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();

      items.forEach((item) => {
        const coords = item.location?.coordinates || item.seeker?.location?.coordinates;
        if (!coords || coords.length !== 2) return;
        const [lng, lat] = coords;

        const isReq = Boolean(item.seeker);
        const isSelected = item._id === selectedId;
        const catColor = isReq
          ? REQUIREMENT_COLOR
          : CATEGORY_COLORS[item.category] || DEFAULT_RESOURCE_COLOR;
        const pinColor = isSelected ? SELECTED_COLOR : catColor;

        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: item.title,
          zIndex: isSelected ? 100 : 1,
          icon: {
            path: PIN_SVG_PATH,
            fillColor: pinColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: isSelected ? 1.8 : 1.4,
            anchor: new google.maps.Point(12, 22),
          },
        });

        marker.addListener('click', () => {
          setActivePreview(item);
          if (onSelect) onSelect(item);
        });

        markersRef.current.set(item._id, marker);
      });
    } catch (err) {
      console.warn('Google Maps markers update failed:', err);
    }
  }, [isLoaded, items, selectedId, onSelect]);

  // Fallback when key is missing or script network request failed completely
  if (!hasKey || (loadError && !isLoaded)) {
    return (
      <div className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-line shadow-sm">
        <NoMapKeyFallback userCoords={userCoords} radiusKm={radiusKm} isAuthError={authError} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-line shadow-sm">
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[380px]" />

      {/* Informative banner if API key requires Maps JavaScript API activation */}
      {authError && showAuthWarning && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-600/90 text-white text-xs font-medium backdrop-blur-sm shadow-md animate-fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <span>⚠️</span>
            <span className="truncate">
              API Key active in dev mode — enable <strong>Maps JavaScript API</strong> in Google Cloud Console
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://console.cloud.google.com/google/maps-apis/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-100 font-semibold"
            >
              Cloud Console →
            </a>
            <button
              onClick={() => setShowAuthWarning(false)}
              className="text-white/80 hover:text-white text-sm ml-1"
              aria-label="Dismiss warning"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-alt">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-ink-soft">Loading Google Maps…</p>
          </div>
        </div>
      )}

      {/* Selected Marker Card Preview */}
      {activePreview && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-4 sm:right-auto sm:w-80 z-30 bg-surface/98 backdrop-blur-md border border-line rounded-xl p-3.5 shadow-xl text-ink">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute flex items-center gap-1">
              <span>{CATEGORY_ICONS[activePreview.category] || '📦'}</span>
              <span>{CATEGORY_LABELS[activePreview.category] || activePreview.category}</span>
            </span>
            <button
              onClick={() => {
                setActivePreview(null);
                if (onSelect) onSelect(null);
              }}
              className="text-ink-mute hover:text-ink text-sm p-0.5 rounded transition-colors"
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-3">
            {!activePreview.seeker && (
              <img
                src={resourceImage(activePreview)}
                alt=""
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = PLACEHOLDER;
                }}
                className="w-14 h-14 rounded-lg object-cover bg-surface-sunk shrink-0 border border-line"
              />
            )}
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold leading-snug text-ink line-clamp-1">
                {activePreview.title}
              </h4>
              <p className="text-xs text-ink-soft truncate mt-0.5">
                {activePreview.owner?.businessName ||
                  activePreview.seeker?.businessName ||
                  'Verified Partner'}
              </p>
              <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                <span className="font-semibold text-accent">
                  📍 {(activePreview.distanceKm ?? 0).toFixed(1)} km
                </span>
                {activePreview.pricing?.basePrice != null && (
                  <Price amount={activePreview.pricing.basePrice} size="sm" />
                )}
                {activePreview.maxPrice != null && (
                  <span className="text-ink-mute">
                    Budget: ₹{activePreview.maxPrice.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-line flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-mute truncate">
              {activePreview.location?.city || activePreview.location?.address || 'Near you'}
            </span>
            <Link
              to={
                activePreview.seeker
                  ? `/requirements/${activePreview._id}`
                  : `/r/${activePreview._id}`
              }
              className="btn-primary btn-sm text-xs py-1 px-3 whitespace-nowrap"
            >
              View details →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
