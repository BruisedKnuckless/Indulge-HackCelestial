import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Zap,
  Edit3,
  X,
  Eye,
} from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Spinner, EmptyState } from '../components/ui';
import { dateTime } from '../lib/format';

const VEHICLE_PRESETS = [
  'Tata Ace / Pickup Truck (1.0T - 1.5T)',
  'Medium Commercial Vehicle / 407 (2.5T)',
  'Heavy Freight Cargo Truck (5T+)',
  'Refrigerated Catering Van',
  'Three Wheeler Cargo (500kg)',
  'Two Wheeler Express Dispatch',
  'Other Transport Vehicle',
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatVehicleInfo(info) {
  if (!info) return 'Standard Van Fleet';
  if (typeof info === 'string') return info;
  if (typeof info === 'object') {
    const parts = [];
    if (info.model) parts.push(info.model);
    else if (info.vehicleType) parts.push(info.vehicleType);
    if (info.licensePlate) parts.push(`(${info.licensePlate})`);
    if (info.capacityKg) parts.push(`· ${info.capacityKg} kg payload`);
    return parts.join(' ') || info.vehicleType || 'Standard Van Fleet';
  }
  return String(info);
}

export default function LogisticsDashboard() {
  const { user, updateUser } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'assigned';

  const [tab, setTab] = useState(activeTabParam); // 'assigned', 'available', 'active', 'returns', 'completed'
  const [editFleetOpen, setEditFleetOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  // Sync tab with URL if URL changes
  const handleTabChange = (newTab) => {
    setTab(newTab);
    setSearchParams({ tab: newTab });
  };

  // Edit Fleet Form State
  const [fleetForm, setFleetForm] = useState({
    vehicleType: user?.logisticsProfile?.vehicleInfo?.vehicleType || VEHICLE_PRESETS[0],
    model: user?.logisticsProfile?.vehicleInfo?.model || '',
    licensePlate: user?.logisticsProfile?.vehicleInfo?.licensePlate || '',
    capacityKg: user?.logisticsProfile?.vehicleInfo?.capacityKg || 1200,
    serviceArea: user?.logisticsProfile?.serviceArea?.join(', ') || 'Mumbai, Thane, Navi Mumbai',
  });

  // ── Queries ─────────────────────────────────────────────────────────────

  // 1. Fetch partner assigned/active/return/completed jobs
  const { data: myJobs = [], isLoading: myLoading } = useQuery({
    queryKey: ['logistics-my-jobs'],
    queryFn: async () => {
      const res = await api.get('/logistics/jobs');
      return res.data?.jobs || [];
    },
    refetchInterval: 8000,
  });

  // 2. Fetch open unassigned jobs claimable by this partner
  const { data: availableJobs = [], isLoading: availLoading } = useQuery({
    queryKey: ['logistics-available-jobs'],
    queryFn: async () => {
      const res = await api.get('/logistics/jobs', { params: { view: 'available' } });
      return res.data?.jobs || [];
    },
    refetchInterval: 8000,
  });

  const isLoading = myLoading || availLoading;

  // Filter jobs by category
  const assignedJobs = useMemo(
    () => myJobs.filter((j) => ['assigned', 'accepted'].includes(j.status)),
    [myJobs]
  );
  const activeJobs = useMemo(
    () =>
      myJobs.filter((j) =>
        ['pickup_scheduled', 'arrived_at_provider', 'picked_up', 'in_transit', 'delivered'].includes(
          j.status
        )
      ),
    [myJobs]
  );
  const returnsJobs = useMemo(
    () =>
      myJobs.filter((j) =>
        [
          'return_requested',
          'return_pickup_scheduled',
          'return_picked_up',
          'return_in_transit',
          'returned_to_provider',
        ].includes(j.status)
      ),
    [myJobs]
  );
  const completedJobs = useMemo(
    () => myJobs.filter((j) => ['completed', 'declined', 'cancelled'].includes(j.status)),
    [myJobs]
  );

  // Today's Operations: all active, assigned, and return jobs chronologically
  const todaysOperationsJobs = useMemo(() => {
    return myJobs
      .filter((j) => !['completed', 'declined', 'cancelled'].includes(j.status))
      .sort((a, b) => {
        const timeA = new Date(a.scheduledPickupTime || a.requiredDeliveryTime || a.createdAt).getTime();
        const timeB = new Date(b.scheduledPickupTime || b.requiredDeliveryTime || b.createdAt).getTime();
        return timeA - timeB;
      });
  }, [myJobs]);

  const countMap = {
    assigned: assignedJobs.length,
    available: availableJobs.length,
    active: activeJobs.length,
    returns: returnsJobs.length,
    completed: completedJobs.length,
  };

  const currentJobs =
    tab === 'available'
      ? availableJobs
      : tab === 'active'
      ? activeJobs
      : tab === 'returns'
      ? returnsJobs
      : tab === 'completed'
      ? completedJobs
      : assignedJobs;

  // ── Mutations ───────────────────────────────────────────────────────────

  // Operating status toggle mutation
  const statusMutation = useMutation({
    mutationFn: async (operatingStatus) => {
      const res = await api.patch('/logistics/partner-profile', { operatingStatus });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Operating status updated to ${data.user?.logisticsProfile?.operatingStatus}`);
      qc.invalidateQueries({ queryKey: ['me'] });
      if (updateUser && data.user) updateUser(data.user);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Claim unassigned job mutation
  const claimMutation = useMutation({
    mutationFn: async (jobId) => {
      const res = await api.patch(`/logistics/jobs/${jobId}/claim`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Dispatch job claimed successfully!');
      qc.invalidateQueries({ queryKey: ['logistics-my-jobs'] });
      qc.invalidateQueries({ queryKey: ['logistics-available-jobs'] });
      if (data?.job) setSelectedJob(data.job);
      handleTabChange('assigned');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: async (jobId) => {
      const res = await api.patch(`/logistics/jobs/${jobId}/accept`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Assignment accepted!');
      qc.invalidateQueries({ queryKey: ['logistics-my-jobs'] });
      if (data?.job) setSelectedJob(data.job);
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
      qc.invalidateQueries({ queryKey: ['logistics-my-jobs'] });
      qc.invalidateQueries({ queryKey: ['logistics-available-jobs'] });
      setSelectedJob(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Advance status mutation
  const advanceMutation = useMutation({
    mutationFn: async ({ jobId, status, notes }) => {
      const res = await api.patch(`/logistics/jobs/${jobId}/status`, { status, notes });
      return res.data;
    },
    onSuccess: (data, variables) => {
      toast.success(`Job advanced to ${variables.status.replace(/_/g, ' ')}`);
      qc.invalidateQueries({ queryKey: ['logistics-my-jobs'] });
      if (data?.job) {
        setSelectedJob(data.job);
      } else if (selectedJob && String(selectedJob._id) === String(variables.jobId)) {
        setSelectedJob((prev) => (prev ? { ...prev, status: variables.status } : null));
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Generate sample jobs mutation
  const generateSamplesMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/logistics/sample-jobs');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.count || 4} sample dispatch jobs loaded!`);
      qc.invalidateQueries({ queryKey: ['logistics-my-jobs'] });
      qc.invalidateQueries({ queryKey: ['logistics-available-jobs'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Edit fleet mutation
  const editFleetMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        vehicleInfo: {
          vehicleType: fleetForm.vehicleType,
          model: fleetForm.model || fleetForm.vehicleType,
          licensePlate: fleetForm.licensePlate,
          capacityKg: Number(fleetForm.capacityKg) || 1200,
        },
        capacityDescription: fleetForm.capacityKg ? `${fleetForm.capacityKg} kg payload` : '',
        serviceArea: fleetForm.serviceArea
          ? fleetForm.serviceArea.split(',').map((s) => s.trim()).filter(Boolean)
          : ['Mumbai Metropolitan Region'],
      };
      const res = await api.patch('/logistics/partner-profile', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Fleet profile updated!');
      qc.invalidateQueries({ queryKey: ['me'] });
      if (updateUser && data.user) updateUser(data.user);
      setEditFleetOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handleDecline = (jobId) => {
    const reason = window.prompt(
      'Reason for declining this assignment (e.g. Vehicle capacity unavailable):'
    );
    if (!reason) return;
    declineMutation.mutate({ jobId, reason });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'unassigned':
        return <span className="badge badge-muted text-xs capitalize">Open to Claim</span>;
      case 'assigned':
        return <span className="badge badge-indigo text-xs capitalize">Assigned</span>;
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
        return (
          <span className="badge badge-amber text-xs capitalize">
            {status.replace(/_/g, ' ')}
          </span>
        );
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

  /**
   * IMPORTANT: Render ONLY the single NEXT valid status action.
   * Never expose illegal future-state buttons.
   */
  const renderNextAction = (job) => {
    const isAssigned =
      String(job.logisticsPartner?._id || job.logisticsPartner) === String(user?._id);
    const isClaimable = job.status === 'unassigned' || job.status === 'declined';

    if (isClaimable) {
      return (
        <button
          onClick={() => claimMutation.mutate(job._id)}
          disabled={claimMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <Truck size={14} />
          Claim Job
        </button>
      );
    }

    if (job.status === 'assigned' && isAssigned) {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => acceptMutation.mutate(job._id)}
            disabled={acceptMutation.isPending}
            className="btn-primary btn-sm gap-1.5"
          >
            <Check size={14} />
            Accept Job
          </button>
          <button
            onClick={() => handleDecline(job._id)}
            disabled={declineMutation.isPending}
            className="btn-ghost btn-sm text-danger hover:bg-danger/10 gap-1"
          >
            <XCircle size={14} />
            Decline
          </button>
        </div>
      );
    }

    if (job.status === 'accepted') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'pickup_scheduled' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <Clock size={14} />
          Schedule Pickup
        </button>
      );
    }

    if (job.status === 'pickup_scheduled') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'arrived_at_provider' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <MapPin size={14} />
          Arrived at Provider
        </button>
      );
    }

    if (job.status === 'arrived_at_provider') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'picked_up' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <Package size={14} />
          Confirm Pickup
        </button>
      );
    }

    if (job.status === 'picked_up') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'in_transit' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <Truck size={14} />
          Start Delivery
        </button>
      );
    }

    if (job.status === 'in_transit') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'delivered' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <CheckCircle size={14} />
          Mark Delivered
        </button>
      );
    }

    if (job.status === 'delivered') {
      if (job.returnRequired) {
        return (
          <button
            onClick={() =>
              advanceMutation.mutate({ jobId: job._id, status: 'return_pickup_scheduled' })
            }
            disabled={advanceMutation.isPending}
            className="btn-secondary btn-sm gap-1.5 text-amber-accent border-amber-accent/40 hover:bg-amber-500/10"
          >
            <RotateCcw size={14} />
            Schedule Return Pickup
          </button>
        );
      }
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'completed' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <CheckCircle size={14} />
          Complete Job
        </button>
      );
    }

    if (job.status === 'return_requested') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'return_pickup_scheduled' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <Calendar size={14} />
          Schedule Return Pickup
        </button>
      );
    }

    if (job.status === 'return_pickup_scheduled') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'return_picked_up' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <Package size={14} />
          Confirm Return Picked Up
        </button>
      );
    }

    if (job.status === 'return_picked_up') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'return_in_transit' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <Truck size={14} />
          Start Return Transit
        </button>
      );
    }

    if (job.status === 'return_in_transit') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'returned_to_provider' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5"
        >
          <MapPin size={14} />
          Confirm Returned to Provider
        </button>
      );
    }

    if (job.status === 'returned_to_provider') {
      return (
        <button
          onClick={() =>
            advanceMutation.mutate({ jobId: job._id, status: 'completed' })
          }
          disabled={advanceMutation.isPending}
          className="btn-primary btn-sm gap-1.5 text-green-accent"
        >
          <CheckCircle size={14} />
          Complete Job
        </button>
      );
    }

    return (
      <span className="text-xs text-ink-mute italic">
        {job.status === 'completed' ? 'Lifecycle Completed' : 'No pending actions'}
      </span>
    );
  };

  return (
    <div className="shell pt-10 pb-20">
      {/* ── Top Section ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="h-page text-2xl sm:text-3xl font-bold text-ink">
            {getGreeting()}, {user?.businessName || 'Logistics Partner'}
          </h1>
          <p className="text-sm text-ink-soft mt-1">
            Manage today's pickups, deliveries and returns.
          </p>
        </div>

        {/* Operating Status & Quick Sample Button */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => generateSamplesMutation.mutate()}
            disabled={generateSamplesMutation.isPending}
            className="btn-secondary btn-sm gap-1.5 text-xs"
            title="Populate test jobs across forward and return workflows"
          >
            <Zap size={13} className="text-amber-accent" />
            {generateSamplesMutation.isPending ? 'Generating…' : 'Load Sample Jobs'}
          </button>

          {/* Operating Status Toggle: Available / Busy / Offline */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-xl border border-line bg-surface-alt/70">
            <span className="text-xs font-semibold text-ink-soft pl-1.5 pr-1">Operating Status:</span>
            {[
              { key: 'active', label: 'Available' },
              { key: 'busy', label: 'Busy' },
              { key: 'offline', label: 'Offline' },
            ].map((st) => {
              const currentStatus = user?.logisticsProfile?.operatingStatus || 'active';
              const isSelected =
                currentStatus === st.key || (st.key === 'active' && currentStatus === 'available');
              return (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => statusMutation.mutate(st.key)}
                  className={`text-xs px-2.5 py-1 rounded-lg capitalize font-semibold transition-all ${
                    isSelected
                      ? st.key === 'active'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : st.key === 'busy'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-zinc-600 text-white shadow-sm'
                      : 'text-ink-soft hover:bg-surface-sunk'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Operational KPIs (4 Cards) ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-4 rounded-xl border border-line bg-surface-alt/40 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-indigo/10 flex items-center justify-center text-indigo shrink-0">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold text-ink leading-tight">{countMap.assigned}</p>
            <p className="text-xs text-ink-soft uppercase font-semibold tracking-wider mt-0.5">
              Assigned Jobs
            </p>
          </div>
        </div>

        <div className="card p-4 rounded-xl border border-line bg-surface-alt/40 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <Truck size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold text-ink leading-tight">{countMap.active}</p>
            <p className="text-xs text-ink-soft uppercase font-semibold tracking-wider mt-0.5">
              Active Transit
            </p>
          </div>
        </div>

        <div className="card p-4 rounded-xl border border-line bg-surface-alt/40 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0">
            <RotateCcw size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold text-ink leading-tight">{countMap.returns}</p>
            <p className="text-xs text-ink-soft uppercase font-semibold tracking-wider mt-0.5">
              Return Pickups
            </p>
          </div>
        </div>

        <div className="card p-4 rounded-xl border border-line bg-surface-alt/40 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
            <CheckCircle size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold text-ink leading-tight">
              {user?.logisticsProfile?.completedJobs || countMap.completed}
            </p>
            <p className="text-xs text-ink-soft uppercase font-semibold tracking-wider mt-0.5">
              Completed Jobs
            </p>
          </div>
        </div>
      </div>

      {/* ── Fleet Profile Summary ─────────────────────────────────── */}
      {user?.logisticsProfile && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <div className="p-3.5 rounded-xl border border-line bg-surface-alt/40 relative">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-mute uppercase tracking-wide font-medium">Fleet Vehicles</p>
              <button
                type="button"
                onClick={() => setEditFleetOpen(true)}
                className="text-[11px] text-indigo hover:underline font-semibold flex items-center gap-1"
              >
                <Edit3 size={11} /> Edit Fleet
              </button>
            </div>
            <p className="text-sm font-semibold text-ink mt-1">
              {formatVehicleInfo(user.logisticsProfile.vehicleInfo)}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-line bg-surface-alt/40">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-mute uppercase tracking-wide font-medium">Service Coverage</p>
              <button
                type="button"
                onClick={() => setEditFleetOpen(true)}
                className="text-[11px] text-indigo hover:underline font-semibold"
              >
                Configure
              </button>
            </div>
            <p className="text-sm font-semibold text-ink mt-1">
              {user.logisticsProfile.serviceArea?.length
                ? user.logisticsProfile.serviceArea.join(', ')
                : 'Mumbai Metropolitan Region'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-line bg-surface-alt/40">
            <p className="text-xs text-ink-mute uppercase tracking-wide font-medium">Completed Deliveries</p>
            <p className="text-sm font-semibold text-green-accent mt-1">
              {user.logisticsProfile.completedJobs || 0} successfully delivered
            </p>
          </div>
        </div>
      )}

      {/* ── SECTION 5: TODAY'S OPERATIONS (Chronological Execution List) ──── */}
      <div className="mb-10">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Calendar size={18} className="text-brand-orange" />
              Today's Operations
            </h2>
            <p className="text-xs text-ink-soft">
              Active assignments and scheduled dispatches organized chronologically by pickup time.
            </p>
          </div>
          {todaysOperationsJobs.length > 0 && (
            <span className="badge badge-indigo text-xs font-semibold">
              {todaysOperationsJobs.length} active today
            </span>
          )}
        </div>

        {todaysOperationsJobs.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-6 text-center bg-surface-alt/20">
            <Clock size={28} className="mx-auto text-ink-mute mb-2" />
            <p className="text-sm font-semibold text-ink">No scheduled operations pending today</p>
            <p className="text-xs text-ink-soft mt-1">
              All active deliveries are up to date. Check the Open Available Jobs tab to claim new shipments.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {todaysOperationsJobs.map((job) => (
              <div
                key={job._id}
                className="card p-4 rounded-xl border border-line bg-surface-alt/50 hover:border-line-hard transition-all shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line/60 pb-2.5 mb-3">
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
                  <div className="text-xs text-ink-soft flex items-center gap-1">
                    <Clock size={12} className="text-indigo" />
                    Pickup Window:{' '}
                    <strong className="text-ink">
                      {job.scheduledPickupTime ? dateTime(job.scheduledPickupTime) : 'To be scheduled'}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  {/* Resource & Quantity */}
                  <div className="space-y-1">
                    <p className="text-ink-mute font-semibold uppercase tracking-wider">Resource / Cargo</p>
                    <p className="text-sm font-bold text-ink leading-snug">{job.resource?.title || 'Stock / Equipment'}</p>
                    <p className="text-indigo font-semibold">
                      Qty: {job.quantity} {job.resource?.unit || 'units'}
                    </p>
                  </div>

                  {/* Pickup Business & Location */}
                  <div className="space-y-1">
                    <p className="text-ink-mute font-semibold uppercase tracking-wider flex items-center gap-1">
                      <MapPin size={11} className="text-amber-accent" /> Pickup Point
                    </p>
                    <p className="font-bold text-ink">{job.provider?.businessName}</p>
                    <p className="text-ink-soft truncate">
                      {job.pickupLocation?.address ? `${job.pickupLocation.address}, ` : ''}
                      {job.pickupLocation?.city}
                    </p>
                  </div>

                  {/* Delivery Business & Location */}
                  <div className="space-y-1">
                    <p className="text-ink-mute font-semibold uppercase tracking-wider flex items-center gap-1">
                      <MapPin size={11} className="text-green-accent" /> Delivery Destination
                    </p>
                    <p className="font-bold text-ink">{job.seeker?.businessName}</p>
                    <p className="text-ink-soft truncate">
                      {job.deliveryLocation?.address ? `${job.deliveryLocation.address}, ` : ''}
                      {job.deliveryLocation?.city}
                    </p>
                    <p className="text-green-accent font-medium">
                      Required By: {job.requiredDeliveryTime ? dateTime(job.requiredDeliveryTime) : 'Standard'}
                    </p>
                  </div>

                  {/* Vehicle & Actions */}
                  <div className="flex flex-col justify-between items-start md:items-end gap-2">
                    <div className="text-left md:text-right">
                      <p className="text-ink-mute font-semibold uppercase tracking-wider">Assigned Fleet</p>
                      <p className="font-medium text-ink truncate max-w-[200px]">
                        {formatVehicleInfo(job.assignedVehicle || user?.logisticsProfile?.vehicleInfo)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedJob(job)}
                        className="btn-secondary btn-sm gap-1 text-xs"
                      >
                        <Eye size={13} />
                        View Job
                      </button>
                      {renderNextAction(job)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Filter Tabs with Live Badges ──────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-line mb-6 overflow-x-auto pb-1">
        {[
          { key: 'assigned', label: 'Assigned / Pending Acceptance', count: countMap.assigned },
          { key: 'available', label: 'Open Available Jobs', count: countMap.available },
          { key: 'active', label: 'Active Deliveries', count: countMap.active },
          { key: 'returns', label: 'Returns in Progress', count: countMap.returns },
          { key: 'completed', label: 'Completed History', count: countMap.completed },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              tab === t.key
                ? 'border-indigo text-indigo font-semibold'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-line'
            }`}
          >
            <span>{t.label}</span>
            {t.count > 0 && (
              <span
                className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                  tab === t.key ? 'bg-indigo text-white' : 'bg-surface-sunk text-ink-mute'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Job List under current tab ────────────────────────────── */}
      {isLoading ? (
        <Spinner label="Loading dispatch jobs…" />
      ) : currentJobs.length === 0 ? (
        <EmptyState
          title={`No ${tab.replace(/_/g, ' ')} jobs`}
          message={
            tab === 'available'
              ? 'There are currently no unassigned open dispatch jobs waiting in the network.'
              : 'When new delivery orders are assigned to your fleet, they will show up here for live tracking.'
          }
          action={
            <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
              <button
                type="button"
                onClick={() => generateSamplesMutation.mutate()}
                disabled={generateSamplesMutation.isPending}
                className="btn-primary btn-sm gap-1.5"
              >
                <Zap size={14} />
                {generateSamplesMutation.isPending ? 'Generating…' : 'Generate Sample Dispatch Jobs'}
              </button>
              {tab !== 'available' && countMap.available > 0 && (
                <button
                  type="button"
                  onClick={() => handleTabChange('available')}
                  className="btn-secondary btn-sm"
                >
                  View Available Jobs ({countMap.available})
                </button>
              )}
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {currentJobs.map((job) => (
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
                <div className="text-xs text-ink-soft">Created {dateTime(job.createdAt)}</div>
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
                  <p className="font-bold text-ink text-sm">{job.provider?.businessName}</p>
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
                  <p className="font-bold text-ink text-sm">{job.seeker?.businessName}</p>
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

              {/* Action Bar */}
              <div className="mt-5 pt-4 border-t border-line/70 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-ink-soft">
                  <span className="font-semibold text-ink">Fleet Assigned:</span>{' '}
                  {formatVehicleInfo(job.assignedVehicle || user?.logisticsProfile?.vehicleInfo)}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedJob(job)}
                    className="btn-secondary btn-sm gap-1.5"
                  >
                    <Eye size={13} />
                    View Job
                  </button>
                  {renderNextAction(job)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SECTION 6: JOB DETAIL UX MODAL (Execution Focused) ──────── */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-alt/50">
              <div className="flex items-center gap-3">
                <Truck size={22} className="text-indigo" />
                <div>
                  <h3 className="text-base font-bold text-ink font-mono">
                    JOB #{String(selectedJob._id).slice(-6).toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {getStatusBadge(selectedJob.status)}
                    {selectedJob.returnRequired && (
                      <span className="badge badge-muted text-[10px] flex items-center gap-1">
                        <RotateCcw size={10} /> Round-trip Return
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="p-1 rounded-lg text-ink-mute hover:text-ink hover:bg-surface-sunk"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              {/* Resource & Quantity */}
              <div className="p-4 rounded-xl border border-line bg-surface-alt/30">
                <p className="text-xs uppercase tracking-wider font-semibold text-ink-mute mb-2">
                  Resource Cargo
                </p>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h4 className="text-base font-bold text-ink">
                      {selectedJob.resource?.title || 'Physical Asset'}
                    </h4>
                    <p className="text-xs text-ink-soft">
                      Category: {selectedJob.resource?.category || 'Standard Equipment'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-indigo">
                      {selectedJob.quantity} {selectedJob.resource?.unit || 'units'}
                    </span>
                    <p className="text-[11px] text-ink-mute">Quantity</p>
                  </div>
                </div>
                {selectedJob.operationalNotes && (
                  <p className="text-xs text-ink-soft italic mt-3 bg-surface-sunk/60 p-2 rounded-lg">
                    "{selectedJob.operationalNotes}"
                  </p>
                )}
              </div>

              {/* Pickup & Delivery Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pickup details */}
                <div className="p-4 rounded-xl border border-line bg-surface-alt/30 space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-amber-accent flex items-center gap-1">
                    <MapPin size={12} /> Pickup Origin
                  </p>
                  <div>
                    <p className="font-bold text-ink text-sm">{selectedJob.provider?.businessName}</p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {selectedJob.pickupLocation?.address}, {selectedJob.pickupLocation?.city}
                    </p>
                  </div>
                  <div className="text-xs text-ink-soft pt-1">
                    <span className="font-semibold text-ink">Contact:</span>{' '}
                    {selectedJob.provider?.phone || selectedJob.provider?.email || 'N/A'}
                  </div>
                  <div className="text-xs text-indigo font-medium pt-1">
                    <span className="font-semibold text-ink">Scheduled Time:</span>{' '}
                    {dateTime(selectedJob.scheduledPickupTime)}
                  </div>
                </div>

                {/* Delivery details */}
                <div className="p-4 rounded-xl border border-line bg-surface-alt/30 space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-green-accent flex items-center gap-1">
                    <MapPin size={12} /> Delivery Destination
                  </p>
                  <div>
                    <p className="font-bold text-ink text-sm">{selectedJob.seeker?.businessName}</p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {selectedJob.deliveryLocation?.address}, {selectedJob.deliveryLocation?.city}
                    </p>
                  </div>
                  <div className="text-xs text-ink-soft pt-1">
                    <span className="font-semibold text-ink">Contact:</span>{' '}
                    {selectedJob.seeker?.phone || selectedJob.seeker?.email || 'N/A'}
                  </div>
                  <div className="text-xs text-green-accent font-medium pt-1">
                    <span className="font-semibold text-ink">Required By:</span>{' '}
                    {dateTime(selectedJob.requiredDeliveryTime)}
                  </div>
                </div>
              </div>

              {/* Assigned Vehicle */}
              <div className="p-4 rounded-xl border border-line bg-surface-alt/30">
                <p className="text-xs uppercase tracking-wider font-semibold text-ink-mute mb-2">
                  Assigned Vehicle & Fleet
                </p>
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div>
                    <p className="font-bold text-ink text-sm">
                      {selectedJob.assignedVehicle?.model ||
                        user?.logisticsProfile?.vehicleInfo?.model ||
                        'Standard Fleet Van'}
                    </p>
                    <p className="text-ink-soft">
                      Type:{' '}
                      {selectedJob.assignedVehicle?.vehicleType ||
                        user?.logisticsProfile?.vehicleInfo?.vehicleType ||
                        'Light Commercial Vehicle'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-ink">
                      {selectedJob.assignedVehicle?.licensePlate ||
                        user?.logisticsProfile?.vehicleInfo?.licensePlate ||
                        'MH-04-TRANSIT'}
                    </p>
                    <p className="text-ink-mute">
                      Payload:{' '}
                      {selectedJob.assignedVehicle?.capacityKg ||
                        user?.logisticsProfile?.vehicleInfo?.capacityKg ||
                        1200}{' '}
                      kg
                    </p>
                  </div>
                </div>
              </div>

              {/* Timeline History */}
              {selectedJob.timeline?.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-ink-mute mb-2">
                    Dispatch Progress Timeline
                  </p>
                  <div className="space-y-2 border-l-2 border-line pl-3 ml-1 text-xs">
                    {selectedJob.timeline.map((entry, idx) => (
                      <div key={idx} className="relative">
                        <span className="w-2 h-2 rounded-full bg-indigo absolute -left-[17px] top-1" />
                        <p className="font-semibold text-ink capitalize">
                          {entry.status.replace(/_/g, ' ')}
                        </p>
                        <p className="text-ink-mute text-[11px]">{dateTime(entry.timestamp)}</p>
                        {entry.notes && <p className="text-ink-soft italic">{entry.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Action Footer: Exclusively the NEXT Valid Action */}
            <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-3 bg-surface-alt/50">
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="btn-ghost btn-sm text-xs"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {renderNextAction(selectedJob)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Fleet Profile Modal ───────────────────────────────── */}
      {editFleetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Truck size={18} className="text-indigo" />
                Edit Fleet & Hub Profile
              </h3>
              <button
                type="button"
                onClick={() => setEditFleetOpen(false)}
                className="text-ink-mute hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                editFleetMutation.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label className="label">Vehicle Category</label>
                <select
                  value={fleetForm.vehicleType}
                  onChange={(e) =>
                    setFleetForm((f) => ({ ...f, vehicleType: e.target.value }))
                  }
                  className="field-select w-full text-xs"
                >
                  {VEHICLE_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Vehicle Model</label>
                  <input
                    value={fleetForm.model}
                    onChange={(e) => setFleetForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="e.g. Tata Ace Gold"
                    className="field text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="label">License Plate</label>
                  <input
                    value={fleetForm.licensePlate}
                    onChange={(e) =>
                      setFleetForm((f) => ({ ...f, licensePlate: e.target.value }))
                    }
                    placeholder="MH-04-AB-1234"
                    className="field text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Payload Capacity (kg)</label>
                <input
                  type="number"
                  min="50"
                  max="20000"
                  value={fleetForm.capacityKg}
                  onChange={(e) =>
                    setFleetForm((f) => ({ ...f, capacityKg: e.target.value }))
                  }
                  className="field text-xs"
                  required
                />
              </div>

              <div>
                <label className="label">Service Area Coverage</label>
                <input
                  value={fleetForm.serviceArea}
                  onChange={(e) =>
                    setFleetForm((f) => ({ ...f, serviceArea: e.target.value }))
                  }
                  placeholder="e.g. Mumbai, Thane, Navi Mumbai"
                  className="field text-xs"
                  required
                />
                <p className="text-[11px] text-ink-mute mt-1">
                  Comma-separated regions where fleet operates.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line mt-4">
                <button
                  type="button"
                  onClick={() => setEditFleetOpen(false)}
                  className="btn-ghost btn-sm text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editFleetMutation.isPending}
                  className="btn-primary btn-sm text-xs"
                >
                  {editFleetMutation.isPending ? 'Saving…' : 'Save Fleet Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
