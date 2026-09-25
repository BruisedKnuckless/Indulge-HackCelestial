import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  Package,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  Shield,
  Phone,
  Calendar,
  XCircle,
  Check,
} from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Spinner, EmptyState, Panel, Alert } from '../components/ui';
import { dateTime } from '../lib/format';

export default function LogisticsDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('assigned'); // 'assigned', 'available', 'active', 'returns', 'completed'
  const [busyJobId, setBusyJobId] = useState(null);

  // Fetch jobs
  const { data, isLoading } = useQuery({
    queryKey: ['logistics-jobs', tab],
    queryFn: async () => {
      let viewParam = 'assigned';
      if (tab === 'available') viewParam = 'available';
      if (tab === 'completed') viewParam = 'completed';
      const res = await api.get('/logistics/jobs', { params: { view: viewParam } });
      return res.data;
    },
    refetchInterval: 10000,
  });

  const jobs = data?.jobs || [];

  // Filter jobs based on active tab
  const filteredJobs = jobs.filter((j) => {
    if (tab === 'available') return j.status === 'unassigned';
    if (tab === 'assigned') return ['assigned', 'accepted'].includes(j.status);
    if (tab === 'active')
      return [
        'pickup_scheduled',
        'arrived_at_provider',
        'picked_up',
        'in_transit',
        'delivered',
      ].includes(j.status);
    if (tab === 'returns')
      return [
        'return_requested',
        'return_pickup_scheduled',
        'return_picked_up',
        'return_in_transit',
        'returned_to_provider',
      ].includes(j.status);
    if (tab === 'completed') return ['completed', 'declined', 'cancelled'].includes(j.status);
    return true;
  });

  // Partner status toggle mutation
  const statusMutation = useMutation({
    mutationFn: async (operatingStatus) => {
      const res = await api.patch('/logistics/partner-profile', { operatingStatus });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Operating status updated to ${data.user?.logisticsProfile?.operatingStatus}`);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: async (jobId) => {
      const res = await api.patch(`/logistics/jobs/${jobId}/accept`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Assignment accepted!');
      qc.invalidateQueries({ queryKey: ['logistics-jobs'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: async ({ jobId, reason }) => {
      const res = await api.patch(`/logistics/jobs/${jobId}/decline`, { reason });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Job assignment declined.');
      qc.invalidateQueries({ queryKey: ['logistics-jobs'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Advance status mutation
  const advanceMutation = useMutation({
    mutationFn: async ({ jobId, status, notes }) => {
      const res = await api.patch(`/logistics/jobs/${jobId}/status`, { status, notes });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      toast.success(`Job advanced to ${variables.status.replace(/_/g, ' ')}`);
      qc.invalidateQueries({ queryKey: ['logistics-jobs'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handleDecline = (jobId) => {
    const reason = window.prompt('Reason for declining this assignment (e.g. Vehicle capacity unavailable):');
    if (!reason) return;
    declineMutation.mutate({ jobId, reason });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'unassigned':
        return <span className="badge badge-muted text-xs capitalize">Unassigned</span>;
      case 'assigned':
        return <span className="badge badge-indigo text-xs capitalize">Assigned to You</span>;
      case 'accepted':
        return <span className="badge badge-green text-xs capitalize">Accepted</span>;
      case 'pickup_scheduled':
        return <span className="badge badge-indigo text-xs capitalize">Pickup Scheduled</span>;
      case 'arrived_at_provider':
        return <span className="badge badge-amber text-xs capitalize">At Provider</span>;
      case 'picked_up':
      case 'in_transit':
        return <span className="badge badge-amber text-xs capitalize">In Transit</span>;
      case 'delivered':
        return <span className="badge badge-green text-xs capitalize">Delivered</span>;
      case 'return_requested':
      case 'return_pickup_scheduled':
      case 'return_picked_up':
      case 'return_in_transit':
        return <span className="badge badge-amber text-xs capitalize">{status.replace(/_/g, ' ')}</span>;
      case 'returned_to_provider':
        return <span className="badge badge-indigo text-xs capitalize">Returned</span>;
      case 'completed':
        return <span className="badge badge-green text-xs capitalize">Completed</span>;
      case 'declined':
        return <span className="badge badge-red text-xs capitalize">Declined</span>;
      default:
        return <span className="badge badge-muted text-xs capitalize">{status}</span>;
    }
  };

  return (
    <div className="shell pt-10 pb-20">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge badge-indigo text-xs font-semibold tracking-wide uppercase">
              Logistics Partner Network
            </span>
            <span className="text-xs text-ink-mute">
              {user?.businessName}
            </span>
          </div>
          <h1 className="h-page flex items-center gap-3">
            <Truck className="text-indigo" size={32} />
            Logistics Dispatch Center
          </h1>
          <p className="text-sm muted mt-1">
            Accept assignments, track pickups, coordinate delivery and handle asset returns.
          </p>
        </div>

        {/* Operating Status Pill */}
        <div className="flex items-center gap-2 p-2 rounded-xl border border-line bg-surface-alt/70">
          <span className="text-xs font-semibold text-ink-soft pl-1">Status:</span>
          {['active', 'busy', 'offline'].map((st) => (
            <button
              key={st}
              onClick={() => statusMutation.mutate(st)}
              className={`text-xs px-2.5 py-1 rounded-md capitalize font-medium transition-all ${
                (user?.logisticsProfile?.operatingStatus || 'active') === st
                  ? st === 'active'
                    ? 'bg-green-600 text-white shadow-sm'
                    : st === 'busy'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-zinc-600 text-white shadow-sm'
                  : 'text-ink-soft hover:bg-surface-sunk'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ── Fleet Profile Summary ─────────────────────────────────── */}
      {user?.logisticsProfile && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <div className="p-3.5 rounded-xl border border-line bg-surface-alt/40">
            <p className="text-xs text-ink-mute uppercase tracking-wide font-medium">Fleet Vehicles</p>
            <p className="text-sm font-semibold text-ink mt-1">
              {user.logisticsProfile.vehicleInfo || 'Standard Van Fleet'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-line bg-surface-alt/40">
            <p className="text-xs text-ink-mute uppercase tracking-wide font-medium">Service Coverage</p>
            <p className="text-sm font-semibold text-ink mt-1">
              {user.logisticsProfile.serviceArea?.length
                ? user.logisticsProfile.serviceArea.join(', ')
                : 'Mumbai Metropolitan Region'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-line bg-surface-alt/40">
            <p className="text-xs text-ink-mute uppercase tracking-wide font-medium">Completed Jobs</p>
            <p className="text-sm font-semibold text-green-accent mt-1">
              {user.logisticsProfile.completedJobs || 0} successfully delivered
            </p>
          </div>
        </div>
      )}

      {/* ── Filter Tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-line mb-6 overflow-x-auto pb-1">
        {[
          { key: 'assigned', label: 'Assigned / Pending Acceptance' },
          { key: 'active', label: 'Active Deliveries' },
          { key: 'returns', label: 'Returns in Progress' },
          { key: 'completed', label: 'Completed History' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-indigo text-indigo'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-line'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Job List ──────────────────────────────────────────────── */}
      {isLoading ? (
        <Spinner label="Loading dispatch jobs…" />
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          title={`No ${tab.replace(/_/g, ' ')} jobs`}
          message="When new delivery orders are assigned to your fleet, they will show up here for live tracking."
        />
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const isAssigned = String(job.logisticsPartner?._id || job.logisticsPartner) === String(user?._id);
            return (
              <div
                key={job._id}
                className="card p-5 rounded-2xl border border-line bg-surface-alt/50 hover:border-line-hard transition-all shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/60 pb-3 mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-ink-mute">
                      JOB #{String(job._id).slice(-6).toUpperCase()}
                    </span>
                    {getStatusBadge(job.status)}
                    {job.returnRequired && (
                      <span className="badge badge-muted text-[11px] flex items-center gap-1">
                        <RotateCcw size={10} /> Round-trip Return
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-soft">
                    Created {dateTime(job.createdAt)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Resource & Quantity */}
                  <div className="flex gap-3">
                    {job.resource?.images?.[0] ? (
                      <img
                        src={job.resource.images[0]}
                        alt={job.resource.title}
                        className="w-16 h-16 object-cover rounded-xl border border-line shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-surface-sunk flex items-center justify-center text-ink-mute shrink-0">
                        <Package size={24} />
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-bold text-ink leading-snug">
                        {job.resource?.title || 'Physical Equipment / Stock'}
                      </h3>
                      <p className="text-xs text-indigo font-semibold mt-1">
                        Quantity: {job.quantity} {job.resource?.unit || 'units'}
                      </p>
                      {job.operationalNotes && (
                        <p className="text-xs text-ink-soft italic mt-1 bg-surface-sunk/60 p-1.5 rounded">
                          "{job.operationalNotes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Pickup Route */}
                  <div className="text-xs space-y-1">
                    <p className="text-ink-mute font-semibold uppercase tracking-wider flex items-center gap-1">
                      <MapPin size={12} className="text-amber-accent" /> Pickup Point
                    </p>
                    <p className="font-bold text-ink text-sm">
                      {job.provider?.businessName}
                    </p>
                    <p className="text-ink-soft">
                      {job.pickupLocation?.address}, {job.pickupLocation?.city}
                    </p>
                    {job.provider?.phone && (
                      <p className="text-ink-soft flex items-center gap-1">
                        <Phone size={10} /> {job.provider.phone}
                      </p>
                    )}
                    <p className="text-indigo font-medium pt-1">
                      Pickup Window: {dateTime(job.scheduledPickupTime)}
                    </p>
                  </div>

                  {/* Delivery Route */}
                  <div className="text-xs space-y-1">
                    <p className="text-ink-mute font-semibold uppercase tracking-wider flex items-center gap-1">
                      <MapPin size={12} className="text-green-accent" /> Delivery Destination
                    </p>
                    <p className="font-bold text-ink text-sm">
                      {job.seeker?.businessName}
                    </p>
                    <p className="text-ink-soft">
                      {job.deliveryLocation?.address}, {job.deliveryLocation?.city}
                    </p>
                    {job.seeker?.phone && (
                      <p className="text-ink-soft flex items-center gap-1">
                        <Phone size={10} /> {job.seeker.phone}
                      </p>
                    )}
                    <p className="text-green-accent font-medium pt-1">
                      Required By: {dateTime(job.requiredDeliveryTime)}
                    </p>
                  </div>
                </div>

                {/* ── Partner Action State Machine Bar ────────────────── */}
                <div className="mt-5 pt-4 border-t border-line/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-ink-soft">
                    {job.status === 'assigned' && (
                      <span className="text-amber-accent font-medium flex items-center gap-1">
                        <Clock size={12} /> Please accept or decline this dispatch assignment.
                      </span>
                    )}
                    {job.status === 'accepted' && (
                      <span className="text-indigo font-medium">Ready to dispatch pickup team.</span>
                    )}
                    {job.status === 'picked_up' && (
                      <span className="text-amber-accent font-medium">Loaded. Out for delivery to destination.</span>
                    )}
                    {job.status === 'delivered' && (
                      <span className="text-green-accent font-medium">Delivery confirmed.</span>
                    )}
                    {job.status === 'completed' && (
                      <span className="text-green-accent font-medium">Full transit lifecycle completed.</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Assigned: Accept or Decline */}
                    {job.status === 'assigned' && isAssigned && (
                      <>
                        <button
                          onClick={() => acceptMutation.mutate(job._id)}
                          className="btn-primary btn-sm gap-1"
                        >
                          <Check size={13} />
                          Accept Job
                        </button>
                        <button
                          onClick={() => handleDecline(job._id)}
                          className="btn-ghost btn-sm text-danger hover:bg-danger/10 gap-1"
                        >
                          <XCircle size={13} />
                          Decline
                        </button>
                      </>
                    )}

                    {/* Accepted -> Scheduled / Arrived / Picked Up */}
                    {job.status === 'accepted' && (
                      <>
                        <button
                          onClick={() =>
                            advanceMutation.mutate({ jobId: job._id, status: 'pickup_scheduled' })
                          }
                          className="btn-secondary btn-sm gap-1"
                        >
                          Schedule Pickup
                        </button>
                        <button
                          onClick={() =>
                            advanceMutation.mutate({ jobId: job._id, status: 'picked_up' })
                          }
                          className="btn-primary btn-sm gap-1"
                        >
                          Confirm Picked Up
                        </button>
                      </>
                    )}

                    {job.status === 'pickup_scheduled' && (
                      <>
                        <button
                          onClick={() =>
                            advanceMutation.mutate({ jobId: job._id, status: 'arrived_at_provider' })
                          }
                          className="btn-secondary btn-sm gap-1"
                        >
                          Arrived at Loading Bay
                        </button>
                        <button
                          onClick={() =>
                            advanceMutation.mutate({ jobId: job._id, status: 'picked_up' })
                          }
                          className="btn-primary btn-sm gap-1"
                        >
                          Confirm Picked Up
                        </button>
                      </>
                    )}

                    {job.status === 'arrived_at_provider' && (
                      <button
                        onClick={() =>
                          advanceMutation.mutate({ jobId: job._id, status: 'picked_up' })
                        }
                        className="btn-primary btn-sm gap-1"
                      >
                        Confirm Picked Up
                      </button>
                    )}

                    {/* Picked up -> In Transit / Delivered */}
                    {job.status === 'picked_up' && (
                      <>
                        <button
                          onClick={() =>
                            advanceMutation.mutate({ jobId: job._id, status: 'in_transit' })
                          }
                          className="btn-secondary btn-sm gap-1"
                        >
                          Mark In Transit
                        </button>
                        <button
                          onClick={() =>
                            advanceMutation.mutate({ jobId: job._id, status: 'delivered' })
                          }
                          className="btn-primary btn-sm gap-1"
                        >
                          Confirm Delivered
                        </button>
                      </>
                    )}

                    {job.status === 'in_transit' && (
                      <button
                        onClick={() =>
                          advanceMutation.mutate({ jobId: job._id, status: 'delivered' })
                        }
                        className="btn-primary btn-sm gap-1"
                      >
                        Confirm Delivered
                      </button>
                    )}

                    {/* Delivered -> Returns or Complete */}
                    {job.status === 'delivered' && (
                      <>
                        {job.returnRequired ? (
                          <button
                            onClick={() =>
                              advanceMutation.mutate({ jobId: job._id, status: 'return_requested' })
                            }
                            className="btn-secondary btn-sm gap-1 text-amber-accent"
                          >
                            <RotateCcw size={12} />
                            Initiate Return Pickup
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              advanceMutation.mutate({ jobId: job._id, status: 'completed' })
                            }
                            className="btn-primary btn-sm gap-1"
                          >
                            <CheckCircle size={12} />
                            Complete Job
                          </button>
                        )}
                      </>
                    )}

                    {/* Return Flow */}
                    {job.status === 'return_requested' && (
                      <button
                        onClick={() =>
                          advanceMutation.mutate({ jobId: job._id, status: 'return_pickup_scheduled' })
                        }
                        className="btn-secondary btn-sm gap-1"
                      >
                        Schedule Return Pickup
                      </button>
                    )}

                    {job.status === 'return_pickup_scheduled' && (
                      <button
                        onClick={() =>
                          advanceMutation.mutate({ jobId: job._id, status: 'return_picked_up' })
                        }
                        className="btn-primary btn-sm gap-1"
                      >
                        Confirm Return Picked Up
                      </button>
                    )}

                    {job.status === 'return_picked_up' && (
                      <button
                        onClick={() =>
                          advanceMutation.mutate({ jobId: job._id, status: 'returned_to_provider' })
                        }
                        className="btn-primary btn-sm gap-1"
                      >
                        Returned to Provider
                      </button>
                    )}

                    {job.status === 'returned_to_provider' && (
                      <button
                        onClick={() =>
                          advanceMutation.mutate({ jobId: job._id, status: 'completed' })
                        }
                        className="btn-primary btn-sm gap-1 text-green-accent"
                      >
                        <CheckCircle size={13} />
                        Complete Job & Release Deposit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
