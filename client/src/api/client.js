import axios from 'axios';

export const TOKEN_KEY = 'indulge.token';

const api = axios.create({ baseURL: '/api' });

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
