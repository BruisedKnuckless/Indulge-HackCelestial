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

const api = axios.create({ baseURL });

// An API that answers with HTML is a misrouted request, not a real response.
// Surfacing it as an error beats rendering a silently empty page.
api.interceptors.response.use((res) => {
  const type = res.headers?.['content-type'] || '';
  if (type.includes('text/html')) {
    throw new Error(
      `Expected JSON from ${res.config?.url} but received HTML — the API base URL is probably ` +
        `pointing at the frontend. Current baseURL: "${baseURL}"`
    );
  }
  return res;
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // A dead session should not leave a stale token behind, but let the caller
    // decide whether to redirect — some pages are browsable signed out.
    if (error.response?.status === 401) localStorage.removeItem(TOKEN_KEY);
    return Promise.reject(error);
  }
);

/** Pull the server's message out of an axios error for display. */
export function errorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.error || error?.message || fallback;
}

export default api;
