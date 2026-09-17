import { useState, useEffect, useCallback } from 'react';

export const HOME_ANIMATION_STORAGE_KEY = 'indulge_home_animation_enabled';

/**
 * Reads the current homepage animation preference from localStorage.
 * Default is true (ON) if not set.
 */
export function getHomeAnimationPreference() {
  try {
    const value = localStorage.getItem(HOME_ANIMATION_STORAGE_KEY);
    if (value === null) return true; // Default ON
    return value !== 'false';
  } catch {
    return true;
  }
}

/**
 * Persists the homepage animation preference to localStorage and broadcasts
 * an event so all components update immediately.
 */
export function setHomeAnimationPreference(enabled) {
  try {
    localStorage.setItem(HOME_ANIMATION_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(
      new CustomEvent('indulge_home_animation_change', { detail: { enabled } })
    );
  } catch {
    // Ignore storage quota errors in private mode
  }
}

/**
 * Custom React hook for reading and updating the homepage animation preference.
 */
export function useHomeAnimation() {
  const [enabled, setEnabledState] = useState(() => getHomeAnimationPreference());

  useEffect(() => {
    const handleCustomChange = (e) => {
      if (e.detail?.enabled !== undefined) {
        setEnabledState(Boolean(e.detail.enabled));
      } else {
        setEnabledState(getHomeAnimationPreference());
      }
    };

    const handleStorage = (e) => {
      if (e.key === HOME_ANIMATION_STORAGE_KEY) {
        setEnabledState(getHomeAnimationPreference());
      }
    };

    window.addEventListener('indulge_home_animation_change', handleCustomChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('indulge_home_animation_change', handleCustomChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !getHomeAnimationPreference();
    setHomeAnimationPreference(next);
    setEnabledState(next);
    return next;
  }, []);

  const setEnabled = useCallback((value) => {
    setHomeAnimationPreference(value);
    setEnabledState(value);
  }, []);

  return { enabled, toggle, setEnabled };
}

export default useHomeAnimation;
