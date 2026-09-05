import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useUserReviews, useSearch } from '../hooks/queries';
import { Stars, Spinner, Price } from '../components/ui';
import { CATEGORY_LABELS, PRICE_UNIT_LABELS, resourceImage } from '../lib/constants';
import { relative } from '../lib/format';

export default function ProviderProfile() {
  const { id } = useParams();
  const { data: reviewData, isLoading } = useUserReviews(id);

  // There is no dedicated public-profile endpoint; the search index already
  // carries owner details, so filter it rather than adding a route.
  const { data: searchData } = useSearch({ limit: 60, radiusKm: 200 });

  const reviews = reviewData?.reviews || [];
  const listings = (searchData?.results || []).filter(
    (r) => String(r.owner?._id) === String(id)
  );
  const provider = listings[0]?.owner || reviews[0]?.reviewee;

  if (isLoading) return <Spinner label="Loading provider" />;

  const ratingAvg = provider?.ratingAvg ?? 0;
  const ratingCount = provider?.ratingCount ?? reviews.length;

  // Distribution bars, computed from the reviews we already have.
  const histogram = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    return { star, count, pct: reviews.length ? (count / reviews.length) * 100 : 0 };
  });

  return (
    <div className="shell pt-12 pb-20">
      <div className="card mb-6">
        <h1 className="h-page mb-2">
          {provider?.businessName || 'Provider'}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Stars rating={ratingAvg} count={ratingCount} />
          {ratingCount > 0 && (
            <span className="text-base text-ink-soft">
              {ratingAvg.toFixed(1)} out of 5 across {ratingCount} booking
              {ratingCount === 1 ? '' : 's'}
            </span>
          )}
          {provider?.location?.city && (
            <span className="text-base text-ink-soft">· {provider.location.city}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="card">
          <h2 className="h-section mb-5">
            Listings from this provider ({listings.length})
          </h2>

          {listings.length === 0 ? (
            <p className="text-base text-ink-soft">
              This provider has no active listings right now.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              {listings.map((r) => (
                <Link key={r._id} to={`/r/${r._id}`} className="group">
                  <div className="aspect-square bg-surface-sunk overflow-hidden mb-2 rounded">
                    <img
                      src={resourceImage(r)}
                      alt={r.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                    />
                  </div>
                  <p className="text-base link line-clamp-2 leading-tight">{r.title}</p>
                  <p className="text-xs text-ink-mute">{CATEGORY_LABELS[r.category]}</p>
                  {r.ratingCount > 0 && (
                    <Stars rating={r.ratingAvg} count={r.ratingCount} size={12} className="mt-0.5" />
                  )}
                  <Price
                    amount={r.pricing?.basePrice}
                    unit={PRICE_UNIT_LABELS[r.pricing?.priceUnit]}
                    size="sm"
                    className="mt-0.5"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="h-section mb-5">Customer reviews</h2>

          {reviews.length === 0 ? (
            <p className="text-base text-ink-soft">No reviews yet.</p>
          ) : (
            <>
              <div className="space-y-1 mb-5">
                {histogram.map((h) => (
                  <div key={h.star} className="flex items-center gap-2 text-base">
                    <span className="w-12 shrink-0 link">{h.star} star</span>
                    <div className="flex-1 h-4 bg-surface-sunk border border-line rounded-sm overflow-hidden">
                      <div className="h-full bg-ink" style={{ width: `${h.pct}%` }} />
                    </div>
                    <span className="w-9 text-right text-ink-soft">{Math.round(h.pct)}%</span>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {reviews.map((rev) => (
                  <div key={rev._id} className="border-t border-line pt-3">
                    <p className="text-base font-semibold">{rev.reviewer?.businessName}</p>
                    <Stars rating={rev.rating} size={13} className="my-0.5" />
                    {rev.resource?.title && (
                      <p className="text-xs text-ink-mute">on {rev.resource.title}</p>
                    )}
                    <p className="text-base mt-1">{rev.comment}</p>
                    <p className="text-xs text-ink-mute mt-1">{relative(rev.createdAt)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
