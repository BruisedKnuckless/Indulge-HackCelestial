import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Truck, Clock, MapPin, User, CheckCircle2, AlertTriangle, XCircle, ArrowRight,
  ShieldCheck, RefreshCw, Eye, Calendar,
} from 'lucide-react';
import api, { errorMessage } from '../../api/client';
import { dateTime, relative } from '../../lib/format';
import { Spinner, EmptyState } from '../ui';
import {
  SectionHeader, Kpi, Toolbar, SearchBox, Segmented, DataTable, Pill, CopyId, OpenLink, Stacked,
} from './primitives';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'active', label: 'In Transit' },
  { value: 'completed', label: 'Completed' },
  { value: 'issue', label: 'Issues / Declined' },
];

const STATUS_GROUPS = {
  unassigned: ['unassigned', 'declined'],
  assigned: ['assigned', 'accepted', 'pickup_scheduled', 'arrived_at_provider'],
  active: [
    'picked_up',
    'in_transit',
    'delivered',
    'return_requested',
    'return_pickup_scheduled',
    'return_picked_up',
    'return_in_transit',
    'returned_to_provider',
  ],
  completed: ['completed'],
  issue: ['declined', 'cancelled'],
};

function matchesFilter(job, activeFilter) {
  if (!activeFilter || activeFilter === 'all') return true;
  const s = job.currentStatus || job.status;
  const allowed = STATUS_GROUPS[activeFilter];
  return allowed ? allowed.includes(s) : s === activeFilter;
}

export default function AdminLogistics() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [assignTarget, setAssignTarget] = useState(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [timelineTarget, setTimelineTarget] = useState(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'logistics'],
    queryFn: async () => {
      return (await api.get('/admin/logistics')).data;
    },
    refetchInterval: 15000,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, partnerId, notes }) => {
      return (await api.patch(`/admin/logistics/${id}/assign`, { partnerId, notes })).data;
    },
    onSuccess: () => {
      toast.success('Logistics partner assigned successfully');
      setAssignTarget(null);
      setSelectedPartnerId('');
      setAssignNotes('');
      qc.invalidateQueries({ queryKey: ['admin', 'logistics'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to assign partner'));
    },
  });

  const jobs = data?.jobs || [];
  const partners = data?.partners || [];
  const counts = data?.counts || { total: 0, unassigned: 0, assigned: 0, active: 0, completed: 0, issue: 0 };

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (filter !== 'all') {
      result = result.filter((j) => matchesFilter(j, filter));
    }
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter((j) => {
      const bRef = String(j.bookingId || j.booking?._id || j.booking || '').toLowerCase();
      const pName = (j.logisticsPartner?.businessName || j.assignedPartner?.businessName || '').toLowerCase();
      const seekerName = (j.seeker?.businessName || '').toLowerCase();
      const providerName = (j.provider?.businessName || '').toLowerCase();
      const rTitle = (j.resource?.title || '').toLowerCase();
      const pAddr = (j.pickupLocation?.address || '').toLowerCase();
      const dAddr = (j.deliveryLocation?.address || '').toLowerCase();
      return (
        bRef.includes(q) ||
        pName.includes(q) ||
        seekerName.includes(q) ||
        providerName.includes(q) ||
        rTitle.includes(q) ||
        pAddr.includes(q) ||
        dAddr.includes(q)
      );
    });
  }, [jobs, filter, search]);

  const handleOpenAssign = (job) => {
    setAssignTarget(job);
    const partner = job.logisticsPartner || job.assignedPartner;
    setSelectedPartnerId(partner?._id || '');
    setAssignNotes(job.operationalNotes || job.notes || '');
  };

  const handleConfirmAssign = (e) => {
    e.preventDefault();
    if (!selectedPartnerId) {
      toast.error('Please select a logistics partner');
      return;
    }
    assignMutation.mutate({
      id: assignTarget._id,
      partnerId: selectedPartnerId,
      notes: assignNotes,
    });
  };

  if (isLoading) return <Spinner label="Loading logistics fleet" />;

  if (isError) {
    return (
      <div className="card p-8 text-center space-y-4 border border-rose/30 bg-rose/5">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose/15 flex items-center justify-center text-rose">
          <AlertTriangle size={24} />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-ink">Failed to load logistics fleet</h3>
          <p className="text-xs text-ink-mute max-w-md mx-auto">
            {errorMessage(error, 'An error occurred while communicating with the logistics API.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-secondary btn-sm inline-flex items-center gap-1.5"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Logistics & Dispatch Fleet"
        subtitle="Real-time physical fulfillment overview, driver assignments, and transit checkpoint tracking."
      >
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </SectionHeader>

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi
          label="Total Jobs"
          value={counts.total}
          icon={Truck}
          tone="indigo"
          onClick={() => setFilter('all')}
        />
        <Kpi
          label="Unassigned"
          value={counts.unassigned}
          icon={AlertTriangle}
          tone="amber"
          onClick={() => setFilter('unassigned')}
        />
        <Kpi
          label="Assigned"
          value={counts.assigned}
          icon={Clock}
          tone="blue"
          onClick={() => setFilter('assigned')}
        />
        <Kpi
          label="In Transit"
          value={counts.active}
          icon={ArrowRight}
          tone="indigo"
          onClick={() => setFilter('active')}
        />
        <Kpi
          label="Completed"
          value={counts.completed}
          icon={CheckCircle2}
          tone="green"
          onClick={() => setFilter('completed')}
        />
        <Kpi
          label="Issues / Declined"
          value={counts.issue}
          icon={XCircle}
          tone="rose"
          onClick={() => setFilter('issue')}
        />
      </div>

      {/* ── Filter & Search Toolbar ───────────────────────────────────────── */}
      <Toolbar>
        <SearchBox
          className="w-72"
          value={search}
          onChange={setSearch}
          placeholder="Search booking, partner, route…"
        />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={STATUS_FILTERS}
        />
      </Toolbar>

      {/* ── Jobs Table ────────────────────────────────────────────────────── */}
      {filteredJobs.length === 0 ? (
        <EmptyState
          title="No logistics jobs"
          message={search ? 'No jobs match your search criteria.' : 'No logistics jobs found in this category.'}
        />
      ) : (
        <DataTable
          rows={filteredJobs}
          columns={[
            {
              key: 'job',
              label: 'Job & Booking',
              render: (j) => (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-ink">
                      #{String(j._id).slice(-8).toUpperCase()}
                    </span>
                    {j.isSample && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold border border-purple-500/30 inline-flex items-center gap-1">
                        Demo Sample
                      </span>
                    )}
                    {(j.returnRequired ?? j.requiresReturn) && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-accent/15 text-amber-accent font-medium">
                        Return
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink font-medium truncate max-w-[200px]">
                    {j.resource?.title || 'Resource'}
                    {j.quantity ? ` · Qty: ${j.quantity}` : ''}
                  </p>
                  {j.booking && (
                    <OpenLink
                      to={`/bookings/detail/${j.booking._id || j.booking}`}
                      label={`Booking #${String(j.booking._id || j.booking).slice(-6).toUpperCase()}`}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'route',
              label: 'Route',
              render: (j) => (
                <div className="text-xs space-y-1 max-w-[240px]">
                  <div className="flex items-start gap-1">
                    <span className="text-ink-mute font-semibold shrink-0">From:</span>
                    <span className="truncate text-ink-soft">
                      {j.pickupLocation?.address || j.provider?.businessName || 'Provider'}
                    </span>
                  </div>
                  <div className="flex items-start gap-1">
                    <span className="text-indigo font-semibold shrink-0">To:</span>
                    <span className="truncate text-ink font-medium">
                      {j.deliveryLocation?.address || j.seeker?.businessName || 'Seeker'}
                    </span>
                  </div>
                  {(j.scheduledPickupTime || j.requiredDeliveryTime) && (
                    <div className="flex items-center gap-1 text-[10px] text-ink-mute pt-0.5">
                      <Calendar size={10} className="shrink-0" />
                      <span>
                        {j.scheduledPickupTime ? dateTime(j.scheduledPickupTime) : 'ASAP'}
                      </span>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'partner',
              label: 'Assigned Partner',
              render: (j) => {
                const partner = j.logisticsPartner || j.assignedPartner;
                const vehicle = j.vehicle || partner?.logisticsProfile?.vehicleInfo;
                return (
                  <div>
                    {partner ? (
                      <div>
                        <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                          <Truck size={13} className="text-indigo shrink-0" />
                          {partner.businessName}
                        </p>
                        <p className="text-[11px] text-ink-mute">
                          {partner.phone || partner.email}
                        </p>
                        {vehicle?.model && (
                          <p className="text-[10px] text-ink-soft italic">
                            {vehicle.model}
                            {vehicle.licensePlate || vehicle.plateNumber ? ` (${vehicle.licensePlate || vehicle.plateNumber})` : ''}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-accent/10 text-amber-accent border border-amber-accent/25 font-medium inline-flex items-center gap-1">
                        <AlertTriangle size={11} /> Unassigned
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'status',
              label: 'Logistics Status',
              render: (j) => {
                const s = j.status || j.currentStatus || 'unassigned';
                const tone =
                  s === 'delivered' || s === 'completed'
                    ? 'green'
                    : s.includes('transit') || s.includes('picked_up')
                    ? 'indigo'
                    : s === 'unassigned' || s === 'declined'
                    ? 'amber'
                    : 'line';

                return (
                  <div>
                    <Pill tone={tone}>{s.replace(/_/g, ' ').toUpperCase()}</Pill>
                    <p className="text-[10px] text-ink-mute mt-1">
                      Updated {relative(j.updatedAt)}
                    </p>
                  </div>
                );
              },
            },
            {
              key: 'actions',
              align: 'right',
              render: (j) => {
                const partner = j.logisticsPartner || j.assignedPartner;
                return (
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTimelineTarget(j)}
                      className="btn-secondary btn-sm"
                      title="View Timeline"
                    >
                      <Eye size={12} />
                      Timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAssign(j)}
                      className="btn-primary btn-sm"
                    >
                      <Truck size={12} />
                      {partner ? 'Reassign' : 'Assign'}
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      )}

      {/* ── Assign / Reassign Dialog ─────────────────────────────────────── */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="card max-w-lg w-full p-6 space-y-4 shadow-xl border border-line">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="icon-box icon-box-indigo w-8 h-8">
                  <Truck size={16} />
                </span>
                <h3 className="text-base font-semibold text-ink">
                  {(assignTarget.logisticsPartner || assignTarget.assignedPartner) ? 'Reassign Logistics Partner' : 'Dispatch Logistics Partner'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignTarget(null)}
                className="text-ink-mute hover:text-ink text-sm p-1 rounded"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-soft">
              Assign a dedicated partner fleet for Job #{String(assignTarget._id).slice(-8).toUpperCase()} (
              {assignTarget.resource?.title || 'Resource transport'}).
            </p>

            <form onSubmit={handleConfirmAssign} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1">
                  Select Partner Fleet
                </label>
                <select
                  value={selectedPartnerId}
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                  className="field w-full text-sm"
                  required
                >
                  <option value="">-- Choose verified logistics partner --</option>
                  {partners.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.businessName} ({p.logisticsProfile?.vehicleInfo?.model || 'Fleet'} · {p.phone || p.email})
                    </option>
                  ))}
                </select>
                {partners.length === 0 && (
                  <p className="text-xs text-amber-accent mt-1">
                    No active logistics partners registered on platform.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1">
                  Dispatch Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Gate pass, loading dock instructions, timing constraints…"
                  className="field-area w-full text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setAssignTarget(null)}
                  className="btn-secondary btn-sm"
                  disabled={assignMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary btn-sm"
                  disabled={assignMutation.isPending}
                >
                  {assignMutation.isPending ? 'Assigning…' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Timeline Audit Modal ─────────────────────────────────────────── */}
      {timelineTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="card max-w-xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-xl border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="icon-box icon-box-indigo w-8 h-8">
                  <Clock size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Transit Audit Timeline
                  </h3>
                  <p className="text-xs text-ink-mute">
                    Job #{String(timelineTarget._id).slice(-8).toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTimelineTarget(null)}
                className="text-ink-mute hover:text-ink text-sm p-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {(timelineTarget.timeline || []).map((t, idx) => (
                <div key={idx} className="flex gap-3 text-xs border-l-2 border-indigo pl-3 py-1">
                  <div className="flex-1">
                    <p className="font-semibold text-ink capitalize">
                      {t.status.replace(/_/g, ' ')}
                    </p>
                    <p className="text-ink-mute">{dateTime(t.timestamp)}</p>
                    {t.notes && (
                      <p className="text-ink-soft italic mt-0.5">"{t.notes}"</p>
                    )}
                  </div>
                  <span className="text-[10px] text-ink-mute font-mono">
                    Step {idx + 1}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-line text-right">
              <button
                type="button"
                onClick={() => setTimelineTarget(null)}
                className="btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
