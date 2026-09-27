import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { TOKEN_KEY, BUSINESS_UNAUTHORIZED_EVENT } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'admin' });
    };
    window.addEventListener(BUSINESS_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(BUSINESS_UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  // Restore the session on first load so a refresh doesn't sign the user out.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  // Every auth endpoint answers { user, token }; keep the session the same way for all of them.
  const startSession = useCallback(
    (data) => {
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'admin' });
      return data.user;
    },
    [queryClient]
  );

  const login = useCallback(
    async (email, password) => startSession((await api.post('/auth/login', { email, password })).data),
    [startSession]
  );

  const register = useCallback(
    async (payload) => startSession((await api.post('/auth/register', payload)).data),
    [startSession]
  );

  const registerTechnician = useCallback(
    async (payload) => startSession((await api.post('/auth/technician/register', payload)).data),
    [startSession]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    // Clear cached data so the next account never sees the previous one's cart.
    queryClient.clear();
  }, [queryClient]);

  const updateUser = useCallback(async (patch) => {
    const { data } = await api.patch('/auth/me', patch);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, registerTechnician, logout, updateUser }),
    [user, loading, login, register, registerTechnician, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
