import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  Clock,
  ArrowRight,
  Search,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import api from '../api/client';
import InspectorHeader from '../components/inspector/InspectorHeader';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS } from '../lib/constants';

export default function InspectorDashboard() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inspector-tasks', tab, search],
    queryFn: async () => {
      const params = {};
      if (tab !== 'all') params.tab = tab;
      if (search) params.search = search;
      const res = await api.get('/verifications', { params });
      return res.data;
    },
    refetchInterval: 15000,
  });

  const verifications = data?.verifications || [];
  const counts = data?.counts || { totalToday: 0, pendingAction: 0, inProgress: 0, completed: 0 };

  const getStatusIndicator = (status) => {
    switch (status) {
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Verified
          </span>
        );
      case 'conditionally_verified':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Conditionally Verified
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Rejected
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 dark:text-purple-400">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Scheduled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Pending
          </span>
        );
    }
  };

  const formatScheduledTime = (dateStr) => {
    if (!dateStr) return 'TODAY';
    const d = new Date(dateStr);
    const isToday = new Date().toDateString() === d.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return isToday ? `TODAY ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <InspectorHeader />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Compact Daily Task Summary Strip (Swiggy/Zomato ops style) */}
        <section className="bg-surface-alt border border-line rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-ink-mute">
              Today's Field Tasks
            </span>
            <button
              onClick={() => refetch()}
              className="text-ink-soft hover:text-ink text-xs flex items-center gap-1 transition-colors"
              title="Refresh tasks"
            >
              <RotateCcw size={12} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-surface-sunk/60 rounded-xl py-2 px-1 border border-line/60">
              <span className="text-xl font-black text-ink block leading-none">{counts.totalToday}</span>
              <span className="text-[10px] font-semibold text-ink-mute uppercase tracking-wide mt-1 block">Visits</span>
            </div>
            <div className="bg-surface-sunk/60 rounded-xl py-2 px-1 border border-line/60">
              <span className="text-xl font-black text-amber-600 dark:text-amber-400 block leading-none">
                {counts.pendingAction}
              </span>
              <span className="text-[10px] font-semibold text-ink-mute uppercase tracking-wide mt-1 block">Pending</span>
            </div>
            <div className="bg-surface-sunk/60 rounded-xl py-2 px-1 border border-line/60">
              <span className="text-xl font-black text-blue-600 dark:text-blue-400 block leading-none">
                {counts.inProgress}
              </span>
              <span className="text-[10px] font-semibold text-ink-mute uppercase tracking-wide mt-1 block">In Progress</span>
            </div>
            <div className="bg-surface-sunk/60 rounded-xl py-2 px-1 border border-line/60">
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 block leading-none">
                {counts.completed}
              </span>
              <span className="text-[10px] font-semibold text-ink-mute uppercase tracking-wide mt-1 block">Completed</span>
            </div>
          </div>
        </section>

        {/* Task Filters & Search */}
        <div className="space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              type="text"
              placeholder="Search by ID (INS-...), resource, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-surface-alt border border-line rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-ink"
            />
          </div>

          {/* Clean task status tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All Tasks' },
              { id: 'today', label: 'Today' },
              { id: 'assigned', label: 'Pending' },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'completed', label: 'Completed' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  tab === t.id
                    ? 'bg-ink text-surface shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-surface-sunk bg-surface-alt border border-line'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task Cards List (Delivery-partner operations style) */}
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <Spinner label="Loading inspection tasks..." />
          </div>
        ) : verifications.length === 0 ? (
          <EmptyState
            title="No inspection tasks found"
            message={
              search || tab !== 'all'
                ? 'Try clearing your search query or switching tabs.'
                : 'All caught up! No field inspections are currently assigned.'
            }
          />
        ) : (
          <div className="space-y-3">
            {verifications.map((v) => {
              const totalParams = v.parameters?.length || 0;
              const completedParams = v.parameters?.filter((p) => p.rating != null).length || 0;
              const provider = v.provider || {};
              const isDone = ['verified', 'conditionally_verified', 'rejected', 'submitted'].includes(v.status);
              const isInProgress = v.status === 'in_progress';

              return (
                <article
                  key={v._id}
                  className="bg-surface-alt border border-line rounded-2xl p-4 shadow-xs hover:border-indigo-400/60 transition-all flex flex-col justify-between gap-3 group"
                >
                  {/* Top Bar: ID + Scheduled Time */}
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-line/60">
                    <span className="font-mono font-black text-ink bg-surface-sunk px-2 py-0.5 rounded text-[11px] border border-line">
                      {v.inspectionId}
                    </span>
                    <span className="font-semibold text-ink-soft flex items-center gap-1 text-[11px]">
                      <Clock size={12} className="text-ink-mute" />
                      {formatScheduledTime(v.scheduledAt)}
                    </span>
                  </div>

                  {/* Resource & Location Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      <span>{CATEGORY_LABELS[v.category] || v.category}</span>
                      {v.quantity > 1 && <span>· {v.quantity} units</span>}
                    </div>

                    <h3 className="font-extrabold text-base text-ink leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {v.resourceName}
                    </h3>

                    <p className="text-xs text-ink-soft font-medium">
                      {provider.businessName || 'Resource Provider'}
                    </p>

                    <p className="text-xs text-ink-mute flex items-center gap-1 pt-0.5">
                      <MapPin size={12} className="shrink-0 text-ink-mute" />
                      <span>{v.location?.address ? `${v.location.address}, ` : ''}{v.location?.city || 'Mumbai'}</span>
                    </p>
                  </div>

                  {/* Bottom Operational Row: Status + Progress + Action Button */}
                  <div className="flex items-center justify-between pt-2 border-t border-line/60 gap-3">
                    <div className="space-y-0.5">
                      <div>{getStatusIndicator(v.status)}</div>
                      <span className="text-[11px] text-ink-mute block font-medium">
                        {completedParams} / {totalParams} checks completed
                      </span>
                    </div>

                    <Link
                      to={`/inspector/${v._id}`}
                      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all ${
                        isInProgress
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : isDone
                          ? 'bg-surface-sunk hover:bg-surface-sunk/80 text-ink border border-line'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                    >
                      {isInProgress ? (
                        <>
                          <Play size={13} fill="currentColor" />
                          <span>Continue</span>
                        </>
                      ) : isDone ? (
                        <>
                          <CheckCircle2 size={13} />
                          <span>View</span>
                        </>
                      ) : (
                        <>
                          <Play size={13} fill="currentColor" />
                          <span>Start Inspection</span>
                        </>
                      )}
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
