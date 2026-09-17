import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

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

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      queryClient.invalidateQueries();
      return data.user;
    },
    [queryClient]
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/register', payload);
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      queryClient.invalidateQueries();
      return data.user;
    },
    [queryClient]
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
    () => ({ user, loading, login, register, logout, updateUser }),
    [user, loading, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
