import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

/* ------------------------------------------------------------------ Search */

export function useSearch(params, enabled = true) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: async () => (await api.get('/search/resources', { params })).data,
    enabled,
    placeholderData: (prev) => prev, // keep results on screen while refiltering
  });
}

export function useResource(id) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: async () => (await api.get(`/resources/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useAvailability(resourceId, start, end) {
  return useQuery({
    queryKey: ['availability', resourceId, start, end],
    queryFn: async () =>
      (await api.get(`/resources/${resourceId}/availability`, { params: { start, end } })).data,
    enabled: Boolean(resourceId),
  });
}

export function useMyListings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['listings', 'mine'],
    queryFn: async () => (await api.get('/resources/mine')).data,
    enabled: Boolean(user),
  });
}

/* -------------------------------------------------------------------- Cart */

export function useCart() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get('/cart')).data,
    enabled: Boolean(user),
  });
}

export function useCartMutations() {
  const qc = useQueryClient();
  const onCart = (data) => qc.setQueryData(['cart'], data);

  return {
    add: useMutation({
      mutationFn: async (payload) => (await api.post('/cart/items', payload)).data,
      onSuccess: onCart,
    }),
    update: useMutation({
      mutationFn: async ({ itemId, ...patch }) =>
        (await api.patch(`/cart/items/${itemId}`, patch)).data,
      onSuccess: onCart,
    }),
    remove: useMutation({
      mutationFn: async (itemId) => (await api.delete(`/cart/items/${itemId}`)).data,
      onSuccess: onCart,
    }),
    checkout: useMutation({
      mutationFn: async (payload) => (await api.post('/cart/checkout', payload)).data,
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['cart'] });
        qc.invalidateQueries({ queryKey: ['bookings'] });
      },
    }),
  };
}

/* ---------------------------------------------------------------- Bookings */

export function useBookings(direction = 'sent', status) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['bookings', direction, status],
    queryFn: async () =>
      (await api.get(`/bookings/${direction}`, { params: status ? { status } : {} })).data,
    enabled: Boolean(user),
  });
}

export function useBooking(id) {
  return useQuery({
    queryKey: ['booking', id],
    queryFn: async () => (await api.get(`/bookings/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useBookingActions() {
  const qc = useQueryClient();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['booking'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  // One mutation per verb, declared explicitly so the hook order is fixed.
  const patch = (verb) => ({
    mutationFn: async ({ id, ...body }) => (await api.patch(`/bookings/${id}/${verb}`, body)).data,
    onSuccess: refresh,
  });

  return {
    create: useMutation({
      mutationFn: async (payload) => (await api.post('/bookings', payload)).data,
      onSuccess: refresh,
    }),
    accept: useMutation(patch('accept')),
    reject: useMutation(patch('reject')),
    confirm: useMutation(patch('confirm')),
    cancel: useMutation(patch('cancel')),
    complete: useMutation(patch('complete')),
  };
}

/* ------------------------------------------------------------- Negotiation */

export function useNegotiation(bookingId) {
  return useQuery({
    queryKey: ['negotiation', bookingId],
    queryFn: async () => (await api.get(`/negotiations/${bookingId}`)).data,
    enabled: Boolean(bookingId),
  });
}

export function useSendNegotiation(bookingId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => (await api.post(`/negotiations/${bookingId}`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['negotiation', bookingId] });
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

/* ----------------------------------------------------------- Notifications */

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data,
    enabled: Boolean(user),
    // Sockets deliver these instantly; polling is the safety net so the demo
    // never looks broken if the connection drops.
    refetchInterval: 30000,
  });
}

/* --------------------------------------------------------------- Analytics */

export function useAnalytics(kind, params) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['analytics', kind, params],
    queryFn: async () => (await api.get(`/analytics/${kind}`, { params })).data,
    enabled: Boolean(user),
  });
}

/* ----------------------------------------------------------------- Reviews */

export function useUserReviews(userId) {
  return useQuery({
    queryKey: ['reviews', userId],
    queryFn: async () => (await api.get(`/reviews/user/${userId}`)).data,
    enabled: Boolean(userId),
  });
}
