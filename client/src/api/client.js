import axios from 'axios';

export const TOKEN_KEY = 'indulge.token';

// In dev, Vite proxies '/api' to the local server (see vite.config.js), so the
// relative path just works. In production the frontend and backend are
// separate deployments (e.g. two Railway services), so VITE_API_URL must point
// at the backend's real origin — falls back to '/api' when unset, which is
// also correct for a same-origin production deploy.
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL });

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
