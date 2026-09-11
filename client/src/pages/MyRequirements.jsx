import { Link } from 'react-router-dom';
import { Pencil, ArrowRight } from 'lucide-react';
import { useMyRequirements } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

const STATUS_CLASS = {
  open:      'status-open',
  fulfilled: 'status-fulfilled',
  closed:    'status-closed',
  expired:   'status-expired',
};

export default function MyRequirements() {
  const { data, isLoading } = useMyRequirements();
  const requirements = data?.requirements || [];

  return (
    <div className="shell pt-12 pb-20">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="h-page">Your requirements</h1>
          <p className="text-sm muted mt-2">What you have asked the market for.</p>
        </div>
        <Link to="/requirements/new" className="btn-primary">
          Post a requirement
        </Link>
      </header>

      {isLoading ? (
        <Spinner label="Loading your requirements" />
      ) : requirements.length === 0 ? (
        <EmptyState
          title="You have not posted anything yet"
          message="Post what you need and providers with spare capacity can respond with an offer — even if they have not listed it."
          action={
            <Link to="/requirements/new" className="btn-primary">
              Post your first requirement
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {requirements.map((r) => {
            const live = (r.offers || []).filter((o) => o.status === 'offered');
            return (
              <div
                key={r._id}
                className="card-interactive p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-2">
                    <span className={STATUS_CLASS[r.status] || 'badge-muted'}>
                      {r.status}
                    </span>
                    {r.urgency === 'high' && r.status === 'open' && (
                      <span className="badge badge-red">Urgent</span>
                    )}
                    <span className="text-xs text-ink-mute">{CATEGORY_LABELS[r.category]}</span>
                  </div>

                  <Link
                    to={`/requirements/${r._id}`}
                    className="text-lg font-semibold hover:text-indigo transition-colors block leading-snug"
                  >
                    {r.title}
                  </Link>
                  <p className="text-sm muted mt-1">
                    Qty {r.quantity} · {dateRange(r.startDateTime, r.endDateTime)}
                    {r.maxPrice ? ` · under ${inr(r.maxPrice)}` : ''}
                    {r.radiusKm ? ` · ${r.radiusKm} km` : ''}
                  </p>
                  <p className="text-xs text-ink-mute mt-1">Posted {relative(r.createdAt)}</p>
                </div>

                <div className="sm:text-right shrink-0 flex items-center sm:flex-col sm:items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold tracking-tight text-indigo">{live.length}</p>
                    <p className="text-xs muted">
                      open offer{live.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === 'open' && (
                      <Link
                        to={`/requirements/${r._id}/edit`}
                        className="btn-secondary btn-sm gap-1 inline-flex items-center"
                      >
                        <Pencil size={12} />
                        <span>Edit</span>
                      </Link>
                    )}
                    {r.status === 'open' && (
                      <Link
                        to={`/s?requirementId=${r._id}`}
                        className="btn-primary btn-sm gap-1 inline-flex items-center"
                      >
                        <span>Find matches</span>
                        <ArrowRight size={12} />
                      </Link>
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
