import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart2, Pencil, Eye, Trash2, Pause, Play } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useMyListings, useAnalytics } from '../hooks/queries';
import { Price, Stars, Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS, PRICE_UNIT_LABELS, resourceImage } from '../lib/constants';
import { inr } from '../lib/format';

export default function Listings() {
  const { data, isLoading } = useMyListings();
  const { data: util } = useAnalytics('utilization', { days: 30 });
  const qc = useQueryClient();

  const listings = data?.resources || [];
  const utilByResource = Object.fromEntries(
    (util?.rows || []).map((r) => [String(r.resourceId), r])
  );

  const toggleStatus = async (id, currentStatus, title) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/resources/${id}/status`, { status: nextStatus });
      toast.success(nextStatus === 'paused' ? `"${title}" paused` : `"${title}" reactivated`);
      qc.invalidateQueries({ queryKey: ['listings'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const archive = async (id, title) => {
    if (!window.confirm(`Archive "${title}"? This hides it from search and prevents new bookings. Existing confirmed bookings will remain protected.`)) return;
    try {
      await api.delete(`/resources/${id}`);
      toast.success('Listing archived');
      qc.invalidateQueries({ queryKey: ['listings'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  /* Utilization color */
  const utilColor = (pct) => {
    if (pct >= 70) return 'text-green-accent';
    if (pct >= 40) return 'text-amber-accent';
    return 'text-indigo';
  };

  return (
    <div className="shell pt-12 pb-20">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
        <div>
          <h1 className="h-page">Your listings</h1>
          <p className="text-sm muted mt-1">Manage and track your listed capacity.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/analytics" className="btn-secondary">
            <BarChart2 size={15} />
            Analytics
          </Link>
          <Link to="/listings/new" className="btn-primary">
            List a resource
          </Link>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Loading your listings" />
      ) : listings.length === 0 ? (
        <EmptyState
          title="You have not listed anything yet"
          message="Turn idle capacity into revenue — list a hall, a vehicle, spare furniture or kitchen hours."
          action={
            <Link to="/listings/new" className="btn-primary">
              List your first resource
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {listings.map((r) => {
            const stats = utilByResource[String(r._id)];
            return (
              <div
                key={r._id}
                className="card-interactive p-4 flex gap-4 items-start"
              >
                {/* Image */}
                <Link to={`/r/${r._id}`} className="shrink-0">
                  <img
                    src={resourceImage(r)}
                    alt={r.title}
                    className="w-[110px] h-[110px] object-cover rounded-lg border border-line transition-transform duration-300 hover:scale-[1.03]"
                  />
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <Link to={`/r/${r._id}`} className="text-lg font-semibold link block leading-snug">
                        {r.title}
                      </Link>
                      <p className="text-sm text-ink-soft mt-0.5">
                        {CATEGORY_LABELS[r.category]} · {r.totalQuantity} {r.unit}
                        {r.totalQuantity > 1 ? 's' : ''}
                        {r.capacity ? ` · capacity ${r.capacity}` : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Price
                          amount={r.pricing?.basePrice}
                          unit={PRICE_UNIT_LABELS[r.pricing?.priceUnit]}
                          size="sm"
                        />
                        {r.ratingCount > 0 && <Stars rating={r.ratingAvg} count={r.ratingCount} size={13} />}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {r.status === 'active' && (
                          <span className="badge badge-green text-xs capitalize">Active</span>
                        )}
                        {r.status === 'paused' && (
                          <span className="badge badge-amber text-xs capitalize">Paused</span>
                        )}
                        {r.status === 'archived' && (
                          <span className="badge badge-red text-xs capitalize">Archived</span>
                        )}
                        {r.availabilityMode && (
                          <span className="text-xs text-ink-mute capitalize">
                            • {r.availabilityMode.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Performance stats */}
                    {stats && (
                      <div className="hidden sm:block shrink-0 bg-surface-sunk/60 dark:bg-surface-sunk/80 rounded-xl p-3 min-w-[140px] text-sm border border-line/60">
                        <p className="text-ink-mute text-xs uppercase tracking-wide mb-2 font-medium">Last 30 days</p>
                        <p>
                          <span className={`text-lg font-bold ${utilColor(stats.utilization)}`}>
                            {stats.utilization ?? 0}%
                          </span>
                          <span className="text-ink-mute text-xs ml-1">utilised</span>
                        </p>
                        <p className="text-ink-soft text-xs mt-0.5">{stats.bookings ?? 0} bookings</p>
                        <p className="text-ink-soft text-xs">{inr(stats.revenue ?? 0)} earned</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Link to={`/listings/${r._id}/edit`} className="btn-secondary btn-sm gap-1">
                      <Pencil size={12} />
                      Edit
                    </Link>
                    <Link to={`/r/${r._id}`} className="btn-secondary btn-sm gap-1">
                      <Eye size={12} />
                      View
                    </Link>
                    {r.status === 'active' && (
                      <button
                        onClick={() => toggleStatus(r._id, r.status, r.title)}
                        className="btn-secondary btn-sm gap-1 text-amber-accent hover:text-amber-500"
                        title="Temporarily pause listing without affecting existing bookings"
                      >
                        <Pause size={12} />
                        Pause
                      </button>
                    )}
                    {r.status === 'paused' && (
                      <button
                        onClick={() => toggleStatus(r._id, r.status, r.title)}
                        className="btn-secondary btn-sm gap-1 text-green-accent hover:text-green-500"
                        title="Reactivate listing to accept new bookings"
                      >
                        <Play size={12} />
                        Reactivate
                      </button>
                    )}
                    {r.status !== 'archived' && (
                      <button
                        onClick={() => archive(r._id, r.title)}
                        className="btn-danger btn-sm gap-1"
                        title="Archive listing safely"
                      >
                        <Trash2 size={12} />
                        Archive
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
