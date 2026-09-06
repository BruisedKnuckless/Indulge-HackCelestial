import { Link, useParams } from 'react-router-dom';
import { useProviderProfile, useUserReviews, useSearch } from '../hooks/queries';
import { Stars, Spinner, Price, EmptyState } from '../components/ui';
import {
  BUSINESS_TYPES,
  CATEGORY_LABELS,
  PRICE_UNIT_LABELS,
  resourceImage,
} from '../lib/constants';
import { relative } from '../lib/format';

/* ── Business type label lookup ──────────────────────────────────────────── */
const BIZ_LABEL = Object.fromEntries(BUSINESS_TYPES.map((t) => [t.value, t.label]));

/* ── Stat tile for the trust/activity row ────────────────────────────────── */
function StatTile({ value, label, tone }) {
  return (
    <div className="card p-4 text-center">
      <p
        className={`text-2xl font-semibold leading-none mb-1 ${
          tone === 'success' ? 'text-success' : ''
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-ink-mute uppercase tracking-wide">{label}</p>
    </div>
  );
}

/* ── Single review card ──────────────────────────────────────────────────── */
function ReviewCard({ review }) {
  return (
    <div className="py-4 border-b border-line last:border-0">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-semibold">{review.reviewer?.businessName || 'Anonymous'}</p>
        <p className="text-xs text-ink-mute shrink-0">{relative(review.createdAt)}</p>
      </div>
      <Stars rating={review.rating} size={13} className="mb-1" />
      {review.resource?.title && (
        <p className="text-xs text-ink-mute mb-1.5">on {review.resource.title}</p>
      )}
      {review.comment && (
        <p className="text-sm text-ink-soft leading-relaxed">"{review.comment}"</p>
      )}
    </div>
  );
}

/* ── Rating distribution bar ─────────────────────────────────────────────── */
function RatingBar({ star, count, pct }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-10 shrink-0 text-ink-soft text-right">{star} ★</span>
      <div className="flex-1 h-2 bg-surface-sunk rounded-full overflow-hidden border border-line">
        <div
          className="h-full bg-ink rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-xs text-ink-mute">{count}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   ProviderProfile — B2B business profile page
   ════════════════════════════════════════════════════════════════════════════ */
export default function ProviderProfile() {
  const { id } = useParams();

  const { data: profileData, isLoading: profileLoading } = useProviderProfile(id);
  const { data: reviewData, isLoading: reviewsLoading } = useUserReviews(id);

  // Listings — still uses search but no longer the only source of profile data
  const { data: searchData } = useSearch({ limit: 100, radiusKm: 500 });

  const profile = profileData?.profile;
  const reviews = reviewData?.reviews || [];
  const listings = (searchData?.results || []).filter(
    (r) => String(r.owner?._id) === String(id)
  );

  const isLoading = profileLoading || reviewsLoading;
  if (isLoading) return <Spinner label="Loading profile" />;
  if (!profile) {
    return (
      <div className="shell pt-12 pb-20">
        <EmptyState title="Business not found" message="This profile may have been removed." />
      </div>
    );
  }

  const ratingAvg = profile.ratingAvg ?? 0;
  const ratingCount = profile.ratingCount ?? 0;

  // Rating distribution from reviews we already have
  const histogram = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    return { star, count, pct: reviews.length ? (count / reviews.length) * 100 : 0 };
  });

  const bizLabel = BIZ_LABEL[profile.businessType] || 'Business';

  return (
    <div className="bg-surface min-h-screen">
      {/* ── Hero header ─────────────────────────────────────────────── */}
      <div className="border-b border-line bg-surface-alt">
        <div className="shell py-8">
          <p className="text-xs text-ink-soft mb-4">
            <Link to="/s" className="link">
              Browse
            </Link>
            {' › '}
            <span>Partner profile</span>
          </p>
          <div className="flex items-start gap-5 flex-wrap">
            {/* Avatar — initials placeholder */}
            <div className="w-16 h-16 rounded-xl bg-surface-sunk border border-line flex items-center justify-center shrink-0">
              <span className="text-2xl font-semibold text-ink-soft">
                {profile.businessName.charAt(0).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="h-page mb-1">{profile.businessName}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                {/* Business type badge */}
                <span className="tag">{bizLabel}</span>

                {profile.city && (
                  <span className="flex items-center gap-1">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {profile.city}
                  </span>
                )}

                {ratingCount > 0 && (
                  <Stars rating={ratingAvg} count={ratingCount} size={14} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shell py-8">
        {/* ── Trust / activity stats ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatTile
            value={ratingCount > 0 ? ratingAvg.toFixed(1) : '—'}
            label="Rating"
            tone={ratingCount > 0 ? 'success' : undefined}
          />
          <StatTile value={ratingCount} label="Reviews" />
          <StatTile value={profile.completedOrders} label="Completed orders" tone={profile.completedOrders > 0 ? 'success' : undefined} />
          <StatTile value={profile.activeListings} label="Active listings" />
        </div>

        {/* ── Main content grid ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

          {/* Left: Listings */}
          <div>
            <div className="card">
              <h2 className="h-section mb-5">
                Active listings
                {listings.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-ink-mute">
                    ({listings.length})
                  </span>
                )}
              </h2>

              {listings.length === 0 ? (
                <EmptyState
                  title="No active listings"
                  message="This business has no resources listed at the moment."
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {listings.map((r) => (
                    <Link key={r._id} to={`/r/${r._id}`} className="group">
                      <div className="aspect-[4/3] bg-surface-sunk overflow-hidden mb-2 rounded-lg border border-line">
                        <img
                          src={resourceImage(r)}
                          alt={r.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                      </div>
                      <p className="text-sm font-medium line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                        {r.title}
                      </p>
                      <p className="text-xs text-ink-mute mt-0.5">
                        {CATEGORY_LABELS[r.category]}
                      </p>
                      {r.ratingCount > 0 && (
                        <Stars rating={r.ratingAvg} count={r.ratingCount} size={11} className="mt-0.5" />
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
          </div>

          {/* Right: Reviews */}
          <div>
            <div className="card">
              <h2 className="h-section mb-4">Customer reviews</h2>

              {reviews.length === 0 ? (
                <EmptyState title="No reviews yet" message="This business hasn't received any reviews yet." />
              ) : (
                <>
                  {/* Rating distribution */}
                  <div className="space-y-1.5 mb-5 pb-5 border-b border-line">
                    {histogram.map((h) => (
                      <RatingBar key={h.star} {...h} />
                    ))}
                  </div>

                  {/* Review list */}
                  <div>
                    {reviews.map((rev) => (
                      <ReviewCard key={rev._id} review={rev} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
