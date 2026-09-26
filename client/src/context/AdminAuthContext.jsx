import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminApi, ADMIN_TOKEN_KEY, ADMIN_UNAUTHORIZED_EVENT } from '../api/client';

/**
 * Platform-admin session — independent of AuthContext.
 *
 * An admin is its own account type, signed in at /admin/login, not a business.
 * Its token lives under its own key and is only ever sent by adminApi, so an
 * admin sign-in or sign-out never disturbs a business session in the same
 * browser, and the other way round.
 */
const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const adminRef = useRef(null);
  adminRef.current = admin;

  // Restore the session on first load so a refresh doesn't sign the admin out.
  useEffect(() => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    adminApi
      .get('/admin/auth/me')
      .then(({ data }) => setAdmin(data.admin))
      .catch(() => localStorage.removeItem(ADMIN_TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  // A rejected admin token (expired, or the account was removed — e.g. the
  // in-memory dev database re-created it on an API restart) signs the console
  // out, so RequireAdminAuth sends the admin back to /admin/login rather than
  // leaving every tab silently empty.
  useEffect(() => {
    const onUnauthorized = () => {
      if (adminRef.current) {
        toast.error('Your admin session has ended. Please sign in again.', { id: 'admin-session' });
      }
      setAdmin(null);
      queryClient.removeQueries({ queryKey: ['admin'] });
    };
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  const login = useCallback(
    async (email, password) => {
      const { data } = await adminApi.post('/admin/auth/login', { email, password });
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setAdmin(data.admin);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      return data.admin;
    },
    [queryClient]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdmin(null);
    // Only the console's cache — the business session's data is not ours to drop.
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  const value = useMemo(() => ({ admin, loading, login, logout }), [admin, loading, login, logout]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
