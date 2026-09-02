import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
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

  const archive = async (id, title) => {
    if (!window.confirm(`Remove “${title}” from your listings?`)) return;
    try {
      await api.delete(`/resources/${id}`);
      toast.success('Listing removed');
      qc.invalidateQueries({ queryKey: ['listings'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="page-shell py-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <h1 className="text-page font-normal">Your listings</h1>
        <div className="flex gap-2">
          <Link to="/analytics" className="btn-secondary btn-pill">
            View analytics
          </Link>
          <Link to="/listings/new" className="btn-yellow btn-pill">
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
            <Link to="/listings/new" className="btn-yellow btn-pill">
              List your first resource
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {listings.map((r) => {
            const stats = utilByResource[String(r._id)];
            return (
              <div key={r._id} className="bg-white border border-bd rounded p-4 flex gap-4">
                <Link to={`/r/${r._id}`} className="shrink-0">
                  <img
                    src={resourceImage(r)}
                    alt={r.title}
                    className="w-[120px] h-[120px] object-cover rounded"
                  />
                </Link>

                <div className="flex-1 min-w-0">
                  <Link to={`/r/${r._id}`} className="text-title a-link block leading-snug">
                    {r.title}
                  </Link>

                  <p className="text-base text-ink-soft mt-0.5">
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

                  {r.status !== 'active' && (
                    <p className="text-mini text-danger font-bold mt-1 capitalize">{r.status}</p>
                  )}
                </div>

                {/* Per-listing performance, so the provider sees value at a glance. */}
                <div className="hidden sm:block w-[150px] shrink-0 text-base">
                  <p className="text-ink-soft text-mini uppercase tracking-wide mb-1">
                    Last 30 days
                  </p>
                  <p>
                    <span className="font-bold">{stats?.utilization ?? 0}%</span> utilised
                  </p>
                  <p className="text-ink-soft">{stats?.bookings ?? 0} bookings</p>
                  <p className="text-ink-soft">{inr(stats?.revenue ?? 0)} earned</p>
                </div>

                <div className="w-[140px] shrink-0 space-y-2">
                  <Link to={`/listings/${r._id}/edit`} className="btn-secondary btn-pill w-full">
                    Edit listing
                  </Link>
                  <Link to={`/r/${r._id}`} className="btn-secondary btn-pill w-full">
                    View as buyer
                  </Link>
                  <button
                    onClick={() => archive(r._id, r.title)}
                    className="btn-secondary btn-pill w-full"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
