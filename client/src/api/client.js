import axios from 'axios';

export const TOKEN_KEY = 'indulge.token';

// In dev, Vite proxies '/api' to the local server (see vite.config.js), so the
// relative path just works. In production the frontend and backend are
// separate deployments (e.g. two Railway services), so VITE_API_URL must point
// at the backend's real origin — falls back to '/api' when unset, which is
// also correct for a same-origin production deploy.
/**
 * Hosting dashboards show domains without a scheme ("api.example.com"), and a
 * schemeless baseURL is treated by axios as a *relative* path — so requests
 * quietly go to the frontend's own origin, get the SPA's index.html back with a
 * 200, and every page renders empty without a single error. Normalise it here
 * so that mistake can't happen silently.
 */
function normaliseBase(value) {
  if (!value) return '/api';
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '/api';
  // A leading slash is a deliberate same-origin path; leave it alone.
  if (trimmed.startsWith('/')) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const baseURL = normaliseBase(import.meta.env.VITE_API_URL);

/**
 * Files the API stores itself (inspection evidence, local uploads) come back
 * as server-relative paths like /uploads/x.jpg. They live on the API's origin,
 * which is not this page's origin once the two are deployed separately.
 */
export function mediaUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  return /^https?:\/\//i.test(baseURL) ? new URL(baseURL).origin + url : url;
}

/**
 * Admin and business sessions are separate accounts with separate tokens,
 * held under separate keys and sent by separate clients — so signing in or out
 * of one never touches the other, and an admin token is never attached to a
 * marketplace request (or vice versa).
 */
function createClient(tokenKey, onUnauthorized) {
  const client = axios.create({ baseURL });

  // An API that answers with HTML is a misrouted request, not a real response.
  // Surfacing it as an error beats rendering a silently empty page.
  client.interceptors.response.use((res) => {
    const type = res.headers?.['content-type'] || '';
    if (type.includes('text/html')) {
      throw new Error(
        `Expected JSON from ${res.config?.url} but received HTML — the API base URL is probably ` +
          `pointing at the frontend. Current baseURL: "${baseURL}"`
      );
    }
    return res;
  });

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem(tokenKey);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    (error) => {
      // A dead session should not leave a stale token behind, but let the caller
      // decide whether to redirect — some pages are browsable signed out.
      if (error.response?.status === 401) {
        localStorage.removeItem(tokenKey);
        onUnauthorized?.();
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export const ADMIN_TOKEN_KEY = 'indulge.adminToken';

/** Fired when the admin session is rejected, so AdminAuthContext can sign out
 *  instead of leaving the console rendering empty tabs. */
export const ADMIN_UNAUTHORIZED_EVENT = 'indulge:admin-unauthorized';

const api = createClient(TOKEN_KEY);

/** Platform-admin client — used only by the admin console. */
export const adminApi = createClient(ADMIN_TOKEN_KEY, () =>
  window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED_EVENT))
);

/** Pull the server's message out of an axios error for display. */
export function errorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.error || error?.message || fallback;
}

export default api;
