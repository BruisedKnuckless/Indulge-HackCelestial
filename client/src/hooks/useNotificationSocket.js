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

    const token = localStorage.getItem(TOKEN_KEY);
    const socket = io('/', { auth: { token } });

    socket.on('notification', (n) => {
      toast(n.message || n.title, { icon: '🔔', duration: 5000 });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    });

    return () => socket.disconnect();
  }, [user, queryClient]);
}
