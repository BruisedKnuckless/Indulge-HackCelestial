import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { TOKEN_KEY } from '../api/client';

/**
 * Live notification channel. React Query also polls, so this only needs to
 * shorten the delay — a dropped socket degrades to a 30s refresh rather than
 * breaking anything.
 */
export default function useNotificationSocket() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    // Same rationale as api/client.js: '/' relies on the Vite dev proxy for
    // local development, but a production deploy with a separate backend
    // origin (e.g. Railway) needs the real URL from VITE_SOCKET_URL.
    const token = localStorage.getItem(TOKEN_KEY);
    const socket = io(import.meta.env.VITE_SOCKET_URL || '/', { auth: { token } });

    socket.on('notification', (n) => {
      toast(n.message || n.title, { icon: '🔔', duration: 5000 });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    });

    return () => socket.disconnect();
  }, [user, queryClient]);
}
