import { useState, useCallback } from 'react';

// Default demo coordinates (Thane / Mumbai hospitality corridor from demoData)
export const DEMO_LOCATION = {
  lat: 19.2183,
  lng: 72.9781,
  city: 'Thane, Mumbai',
  isDemo: true,
};

/**
 * Hook to manage browser geolocation safely and transparently.
 *
 * Capabilities:
 * - Clear explanation & permission handling
 * - loading, granted, denied, and unavailable states
 * - In-memory ephemeral storage only (no unnecessary persistence)
 * - 1-click fallback to demo (Thane/Mumbai) or logged-in business location
 */
export function useGeolocation() {
  const [coords, setCoords] = useState(null); // { lat, lng, city, isDemo, isBusiness }
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'
  const [errorMessage, setErrorMessage] = useState(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          isDemo: false,
        });
        setStatus('granted');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied');
          setErrorMessage('Location permission was denied. You can enable location in your browser settings or use a demo location below.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setStatus('unavailable');
          setErrorMessage('Location information is currently unavailable from your device.');
        } else if (error.code === error.TIMEOUT) {
          setStatus('unavailable');
          setErrorMessage('The request to get your location timed out.');
        } else {
          setStatus('unavailable');
          setErrorMessage(error.message || 'An unknown error occurred while retrieving location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  const useDemoLocation = useCallback(() => {
    setCoords(DEMO_LOCATION);
    setStatus('granted');
    setErrorMessage(null);
  }, []);

  const useBusinessLocation = useCallback((userLocation) => {
    if (userLocation?.coordinates?.length === 2) {
      const [lng, lat] = userLocation.coordinates;
      setCoords({
        lat,
        lng,
        city: userLocation.city || userLocation.address || 'Your Business',
        isDemo: false,
        isBusiness: true,
      });
      setStatus('granted');
      setErrorMessage(null);
    }
  }, []);

  const clearLocation = useCallback(() => {
    setCoords(null);
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return {
    coords,
    status,
    errorMessage,
    requestLocation,
    useDemoLocation,
    useBusinessLocation,
    clearLocation,
  };
}
