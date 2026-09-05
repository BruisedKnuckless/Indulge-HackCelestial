import { Link } from 'react-router-dom';
import { useMyRequirements } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

const STATUS_TONE = {
  open: 'border-warn/40 text-warn',
  fulfilled: 'border-success/40 text-success',
  closed: 'border-line-strong text-ink-soft',
  expired: 'border-line-strong text-ink-mute',
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
        <div className="border-t border-line">
          {requirements.map((r) => {
            const live = (r.offers || []).filter((o) => o.status === 'offered');
            return (
              <Link
                key={r._id}
                to={`/requirements/${r._id}`}
                className="flex flex-col sm:flex-row sm:items-center gap-4 py-6 border-b border-line
                           hover:bg-surface-alt transition-colors px-2 -mx-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1.5">
                    <span
                      className={`inline-flex items-center h-6 px-2.5 rounded-full border text-xs
                                  font-medium capitalize ${STATUS_TONE[r.status]}`}
                    >
                      {r.status}
                    </span>
                    {r.urgency === 'high' && r.status === 'open' && (
                      <span className="text-xs text-danger">Urgent</span>
                    )}
                  </div>

                  <p className="text-lg font-medium">{r.title}</p>
                  <p className="text-sm muted mt-1">
                    {CATEGORY_LABELS[r.category]} · qty {r.quantity} ·{' '}
                    {dateRange(r.startDateTime, r.endDateTime)}
                    {r.maxPrice ? ` · under ${inr(r.maxPrice)}` : ''}
                  </p>
                  <p className="text-xs text-ink-mute mt-1">Posted {relative(r.createdAt)}</p>
                </div>

                <div className="sm:text-right shrink-0">
                  <p className="text-2xl font-semibold tracking-tight">{live.length}</p>
                  <p className="text-xs muted">
                    open offer{live.length === 1 ? '' : 's'}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
