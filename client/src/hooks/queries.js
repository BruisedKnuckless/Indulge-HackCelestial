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
    enabled: Boolean(user) && user?.userType !== 'logistics_partner',
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
    accept:      useMutation(patch('accept')),
    reject:      useMutation(patch('reject')),
    confirm:     useMutation(patch('confirm')),
    cancel:      useMutation(patch('cancel')),
    complete:    useMutation(patch('complete')),
    pay:         useMutation(patch('pay')),
    fulfillment: useMutation(patch('fulfillment')),
    returnItem:  useMutation(patch('return')),
    checkExpiry: useMutation({
      mutationFn: async ({ id }) => (await api.post(`/bookings/${id}/check-expiry`)).data,
      onSuccess: refresh,
    }),
  };
}

export function useBookingLogistics(bookingId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['logistics', 'booking', bookingId],
    queryFn: async () => (await api.get(`/logistics/by-booking/${bookingId}`)).data,
    enabled: Boolean(user && bookingId),
  });
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

export function useAnalytics(kind, params, options = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['analytics', kind, params],
    queryFn: async () => (await api.get(`/analytics/${kind}`, { params })).data,
    enabled: Boolean(user) && user?.userType !== 'logistics_partner' && (options.enabled ?? true),
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

export function useProviderProfile(userId) {
  return useQuery({
    queryKey: ['provider-profile', userId],
    queryFn: async () => (await api.get(`/auth/users/${userId}/public`)).data,
    enabled: Boolean(userId),
    staleTime: 60_000, // profile stats don't need to refresh every second
  });
}

/* --------------------------------------------- Reverse Marketplace / RFQ / Requirements */

/** The supplier feed of open requirements near the calling provider with distance & proposal state. */
export function useRequirementsFeed(params) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['requirements', 'feed', params],
    queryFn: async () => (await api.get('/requirements/feed', { params })).data,
    enabled: Boolean(user),
    refetchInterval: 15000,
  });
}

/** The provider-facing board of open requirements from other businesses. */
export function useOpenRequirements(params, enabled = true) {
  return useQuery({
    queryKey: ['requirements', 'open', params],
    queryFn: async () => (await api.get('/requirements/open', { params })).data,
    enabled,
  });
}

/** Requirements the signed-in business has posted. */
export function useMyRequirements(status) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['requirements', 'mine', status],
    queryFn: async () =>
      (await api.get('/requirements/mine', { params: status ? { status } : {} })).data,
    enabled: Boolean(user),
  });
}

export function useRequirement(id) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['requirement', id],
    queryFn: async () => (await api.get(`/requirements/${id}`)).data,
    enabled: Boolean(user && id),
  });
}

/**
 * Every write here can change boards, proposals, and, on accept, the bookings list —
 * so they all invalidate the same broad set rather than trying to be surgical.
 */
export function useRequirementActions() {
  const qc = useQueryClient();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['requirements'] });
    qc.invalidateQueries({ queryKey: ['requirement'] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['booking'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const create = useMutation({
    mutationFn: async (payload) => (await api.post('/requirements', payload)).data,
    onSuccess: refresh,
  });

  const offer = useMutation({
    mutationFn: async ({ id, ...body }) =>
      (await api.post(`/requirements/${id}/offers`, body)).data,
    onSuccess: refresh,
  });

  const acceptOffer = useMutation({
    mutationFn: async ({ id, offerId }) =>
      (await api.post(`/requirements/${id}/offers/${offerId}/accept`)).data,
    onSuccess: refresh,
  });

  const withdrawOffer = useMutation({
    mutationFn: async ({ id, offerId }) =>
      (await api.patch(`/requirements/${id}/offers/${offerId}/withdraw`)).data,
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...body }) => (await api.put(`/requirements/${id}`, body)).data,
    onSuccess: refresh,
  });

  const close = useMutation({
    mutationFn: async (id) => (await api.patch(`/requirements/${id}/close`)).data,
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: async (id) => (await api.patch(`/requirements/${id}/cancel`)).data,
    onSuccess: refresh,
  });

  const submitProposal = useMutation({
    mutationFn: async ({ requirementId, ...body }) =>
      (await api.post(`/requirements/${requirementId}/proposals`, body)).data,
    onSuccess: refresh,
  });

  const acceptProposal = useMutation({
    mutationFn: async ({ requirementId, proposalId }) =>
      (await api.post(`/requirements/${requirementId}/proposals/${proposalId}/accept`)).data,
    onSuccess: refresh,
  });

  return {
    create,
    update,
    offer,
    acceptOffer,
    withdrawOffer,
    close,
    cancel,
    submitProposal,
    acceptProposal,
  };
}

/* ------------------------------------------------- Admin console (eagle eye) */

/**
 * Platform administration. Every one of these reads across tenant boundaries,
 * so the API answers 404 rather than 403 to a non-admin — which means these
 * hooks stay disabled unless the session actually carries the flag, and a
 * demoted admin degrades to an empty console instead of a wall of errors.
 */
function useAdminSession() {
  const { user } = useAuth();
  return Boolean(user?.isPlatformAdmin);
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => (await api.get('/admin/overview')).data,
    enabled: useAdminSession(),
    refetchInterval: 60000,
  });
}

/** The merged activity stream — the one screen that should feel live. */
export function useAdminLive(limit = 60) {
  return useQuery({
    queryKey: ['admin', 'live', limit],
    queryFn: async () => (await api.get('/admin/live', { params: { limit } })).data,
    enabled: useAdminSession(),
    refetchInterval: 15000,
  });
}

export function useAdminHealth() {
  return useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => (await api.get('/admin/health')).data,
    enabled: useAdminSession(),
    // The audit sweeps every collection, so it is the one call here worth
    // holding onto rather than refetching on a timer.
    staleTime: 60_000,
  });
}

export function useAdminMeta() {
  return useQuery({
    queryKey: ['admin', 'meta'],
    queryFn: async () => (await api.get('/admin/meta')).data,
    enabled: useAdminSession(),
    staleTime: 5 * 60_000,
  });
}

/**
 * One hook for every paginated admin table — they all share the same
 * {total, page, pages} envelope, so a second hook per resource would only
 * duplicate the filter plumbing.
 */
export function useAdminList(resource, params = {}) {
  return useQuery({
    queryKey: ['admin', resource, params],
    queryFn: async () => (await api.get(`/admin/${resource}`, { params })).data,
    enabled: useAdminSession(),
    placeholderData: (prev) => prev, // keep rows on screen while refiltering
  });
}

/** Full dossier for one business — both sides of the marketplace at once. */
export function useAdminBusiness(id) {
  return useQuery({
    queryKey: ['admin', 'business', id],
    queryFn: async () => (await api.get(`/admin/users/${id}`)).data,
    enabled: useAdminSession() && Boolean(id),
  });
}

/**
 * Administrative writes. Each one can move counts, money, the audit and
 * somebody's notification list at once, so they all invalidate the whole
 * admin namespace rather than guessing which table was affected — and the
 * marketplace queries too, since the acting admin is also a business.
 */
export function useAdminActions() {
  const qc = useQueryClient();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['listings'] });
    qc.invalidateQueries({ queryKey: ['requirements'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const mutate = (fn) => ({ mutationFn: fn, onSuccess: refresh });

  return {
    suspendBusiness: useMutation(
      mutate(async ({ id, suspended, reason }) =>
        (await api.patch(`/admin/users/${id}/suspend`, { suspended, reason })).data
      )
    ),
    unlistBusiness: useMutation(
      mutate(async ({ id, status, reason }) =>
        (await api.post(`/admin/users/${id}/unlist`, { status, reason })).data
      )
    ),
    resetPassword: useMutation(
      mutate(async ({ id }) => (await api.post(`/admin/users/${id}/reset-password`)).data)
    ),
    setListingStatus: useMutation(
      mutate(async ({ id, status, reason }) =>
        (await api.patch(`/admin/listings/${id}/status`, { status, reason })).data
      )
    ),
    overrideBooking: useMutation(
      mutate(async ({ id, status, reason }) =>
        (await api.patch(`/admin/bookings/${id}/status`, { status, reason })).data
      )
    ),
    setRequirementStatus: useMutation(
      mutate(async ({ id, status, reason }) =>
        (await api.patch(`/admin/requirements/${id}/status`, { status, reason })).data
      )
    ),
    refund: useMutation(
      mutate(async ({ id, reason }) =>
        (await api.patch(`/admin/transactions/${id}/refund`, { reason })).data
      )
    ),
    deleteReview: useMutation(mutate(async ({ id }) => (await api.delete(`/admin/reviews/${id}`)).data)),
    broadcast: useMutation(mutate(async (payload) => (await api.post('/admin/broadcast', payload)).data)),
    repair: useMutation(
      mutate(async ({ checkId }) => (await api.post('/admin/health/repair', { checkId })).data)
    ),
    assignLogistics: useMutation(
      mutate(async ({ id, partnerId, notes }) =>
        (await api.patch(`/admin/logistics/${id}/assign`, { partnerId, notes })).data
      )
    ),
  };
}
