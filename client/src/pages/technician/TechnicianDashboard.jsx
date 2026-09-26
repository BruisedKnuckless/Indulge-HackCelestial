import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, RotateCcw } from 'lucide-react';
import { useTechInspections } from '../../hooks/queries';
import { useAuth } from '../../context/AuthContext';
import { Spinner, EmptyState } from '../../components/ui';
import { STATUS_LABEL, statusBadge, fmtDateTime, FINAL_STATUSES } from '../../lib/inspection';

function Progress({ progress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-ink-soft">
      <div className="h-1.5 flex-1 rounded-full bg-surface-sunk overflow-hidden">
        <div className="h-full bg-indigo" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums">
        {progress.done}/{progress.total}
      </span>
    </div>
  );
}

function InspectionRow({ i }) {
  const final = FINAL_STATUSES.includes(i.status);
  const to = final ? `/technician/inspections/${i._id}/report` : `/technician/inspections/${i._id}`;
  return (
    <li>
      <Link to={to} className="card-interactive card block p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-xs text-ink-soft">{i.inspectionId}</span>
              <span className={`badge ${statusBadge(i.status)}`}>{STATUS_LABEL[i.status]}</span>
              {i.kind === 'return' && (
                <span className="badge badge-indigo inline-flex items-center gap-1">
                  <RotateCcw size={11} /> Return
                </span>
              )}
            </div>
            <p className="font-semibold text-ink truncate">{i.resourceName}</p>
            <p className="text-xs text-ink-soft flex items-center gap-1 mt-0.5">
              <MapPin size={12} />
              {[i.location?.address, i.location?.city].filter(Boolean).join(', ') || 'Location with provider'}
              {i.quantity > 1 ? ` · ${i.quantity} units` : ''}
            </p>
            <div className="mt-3">
              {final ? (
                <p className="text-sm">
                  Score <span className="font-semibold tabular-nums">{i.finalScore}/100</span>
                  <span className="text-ink-mute"> · {fmtDateTime(i.completedAt)}</span>
                </p>
              ) : (
                <>
                  <Progress progress={i.progress} />
                  <p className="text-xs text-ink-mute mt-1">
                    {i.scheduledAt ? `Scheduled ${fmtDateTime(i.scheduledAt)}` : `Assigned ${fmtDateTime(i.assignedAt)}`}
                    {i.lastSavedAt ? ` · last saved ${fmtDateTime(i.lastSavedAt)}` : ''}
                  </p>
                </>
              )}
            </div>
          </div>
          <ChevronRight size={20} className="text-ink-mute shrink-0 mt-1" />
        </div>
      </Link>
    </li>
  );
}

/** `/technician` shows today's queue; `/technician/inspections` shows everything. */
export default function TechnicianDashboard({ all = false }) {
  const { user } = useAuth();
  const [scope, setScope] = useState(all ? 'all' : 'open');
  const { data, isLoading } = useTechInspections(scope);
  const stats = data?.stats;
  const list = data?.inspections || [];
  const firstName = (user?.inspectorProfile?.displayName || user?.businessName || '').split(' ')[0];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {!all && (
        <>
          <h1 className="h-page">Hello{firstName ? `, ${firstName}` : ''}</h1>
          <p className="muted text-sm mb-5">Inspections assigned to you. Only you can record results on them.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              ['Assigned', stats?.assigned],
              ['In progress', stats?.inProgress],
              ['Done today', stats?.completedToday],
              ['Completed', stats?.completed],
            ].map(([label, n]) => (
              <div key={label} className="card p-3">
                <p className="text-2xl font-semibold tabular-nums">{n ?? '—'}</p>
                <p className="text-xs text-ink-soft">{label}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {all && (
        <>
          <h1 className="h-page mb-4">All inspections</h1>
          <div className="flex gap-2 mb-4">
            {[
              ['open', 'Open'],
              ['completed', 'Completed'],
              ['all', 'All'],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setScope(k)} className={`btn-sm ${scope === k ? 'btn-primary' : 'btn-secondary'}`}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {isLoading ? (
        <Spinner label="Loading inspections" />
      ) : list.length === 0 ? (
        <EmptyState
          title={scope === 'completed' ? 'No completed inspections yet' : 'Nothing assigned right now'}
          message="New inspections appear here when Indulge operations assign them to you."
        />
      ) : (
        <ul className="space-y-3">
          {list.map((i) => (
            <InspectionRow key={i._id} i={i} />
          ))}
        </ul>
      )}
    </div>
  );
}
