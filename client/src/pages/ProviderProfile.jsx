import { Link, useParams } from 'react-router-dom';
import {
  Building2,
  Utensils,
  ChefHat,
  Landmark,
  Palmtree,
  PartyPopper,
  Star,
  CheckCircle2,
  ListChecks,
  Handshake,
  Megaphone,
  Calendar,
} from 'lucide-react';
import { useProviderProfile, useUserReviews, useSearch } from '../hooks/queries';
import { Stars, Spinner, Price, EmptyState } from '../components/ui';
import {
  BUSINESS_TYPES,
  CATEGORY_LABELS,
  PRICE_UNIT_LABELS,
  resourceImage,
} from '../lib/constants';
import { relative } from '../lib/format';

/* ── Business-type metadata ───────────────────────────────────────────────── */
const BIZ_META = {
  hotel:           { label: 'Hotel',          Icon: Building2,   color: 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-900 dark:text-blue-400' },
  restaurant:      { label: 'Restaurant',     Icon: Utensils,    color: 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-900 dark:text-orange-400' },
  caterer:         { label: 'Caterer',        Icon: ChefHat,     color: 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-900 dark:text-amber-400' },
  banquet_venue:   { label: 'Banquet Venue',  Icon: Landmark,    color: 'bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-900 dark:text-purple-400' },
  resort:          { label: 'Resort',         Icon: Palmtree,    color: 'bg-green-500/10 text-green-600 border-green-200 dark:border-green-900 dark:text-green-400' },
  event_organizer: { label: 'Event Organizer',Icon: PartyPopper, color: 'bg-pink-500/10 text-pink-600 border-pink-200 dark:border-pink-900 dark:text-pink-400' },
  other:           { label: 'Business',       Icon: Building2,   color: 'bg-surface-sunk text-ink-soft border-line' },
};

function getBizMeta(type) {
  return BIZ_META[type] || BIZ_META.other;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function memberYear(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate).getFullYear();
}

/* ── Primary stat tile ────────────────────────────────────────────────────── */
function StatTile({ value, label, tone, icon: IconComp, sublabel }) {
  return (
    <div className="card p-4 flex flex-col items-center text-center gap-1">
      {IconComp && <IconComp size={18} className="text-ink-soft mb-0.5" aria-hidden="true" />}
      <p
        className={`text-2xl font-bold leading-none tabular-nums ${
          tone === 'success' ? 'text-success' :
          tone === 'accent'  ? 'text-accent'  : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-ink-mute uppercase tracking-wide font-medium">{label}</p>
      {sublabel && <p className="text-[10px] text-ink-mute">{sublabel}</p>}
    </div>
  );
}

/* ── Secondary info pill ─────────────────────────────────────────────────── */
function InfoPill({ icon: IconComp, label, value }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="w-8 h-8 rounded-lg bg-surface-sunk border border-line flex items-center justify-center text-ink-soft shrink-0" aria-hidden="true">
        {IconComp && <IconComp size={15} />}
      </span>
      <div className="min-w-0">
        <span className="text-ink-mute text-xs block">{label}</span>
        <span className="text-ink font-medium leading-tight">{value}</span>
      </div>
    </div>
  );
}

/* ── Rating distribution bar ─────────────────────────────────────────────── */
function RatingBar({ star, count, pct }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="w-12 shrink-0 text-xs text-ink-soft text-right tabular-nums flex items-center justify-end gap-1">
        <span>{star}</span>
        <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />
      </span>
      <div className="flex-1 h-2 bg-surface-sunk rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-xs text-ink-mute tabular-nums text-right">{count}</span>
    </div>
  );
}

/* ── Single review card ──────────────────────────────────────────────────── */
function ReviewCard({ review }) {
  return (
    <div className="py-4 border-b border-line last:border-0 group">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <Link
            to={`/provider/${review.reviewer?._id}`}
            className="text-sm font-semibold hover:text-accent transition-colors truncate block"
          >
            {review.reviewer?.businessName || 'Anonymous'}
          </Link>
          {review.resource?.title && (
            <p className="text-[11px] text-ink-mute truncate">
              on{' '}
              <Link to={`/r/${review.resource._id}`} className="hover:text-ink transition-colors">
                {review.resource.title}
              </Link>
            </p>
          )}
        </div>
        <p className="text-xs text-ink-mute shrink-0 pt-0.5">{relative(review.createdAt)}</p>
      </div>
      <Stars rating={review.rating} size={13} className="mb-1.5" />
      {review.title && (
        <p className="text-sm font-medium text-ink mb-0.5">{review.title}</p>
      )}
      {review.comment && (
        <p className="text-sm text-ink-soft leading-relaxed">"{review.comment}"</p>
      )}
    </div>
  );
}

/* ── Avatar initials ─────────────────────────────────────────────────────── */
function Avatar({ name, color }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div
      className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center shrink-0 text-2xl font-bold ${color}`}
    >
      {initial}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   ProviderProfile — professional B2B business profile page
   ════════════════════════════════════════════════════════════════════════════ */
export default function ProviderProfile() {
  const { id } = useParams();

  const { data: profileData, isLoading: profileLoading } = useProviderProfile(id);
  const { data: reviewData, isLoading: reviewsLoading } = useUserReviews(id);

  // Pull listings for this provider from the search index
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
        <EmptyState title="Business not found" message="This profile may have been removed or does not exist." />
      </div>
    );
  }

  const ratingAvg   = profile.ratingAvg   ?? 0;
  const ratingCount = profile.ratingCount ?? 0;

  // Rating distribution from the reviews we already fetched
  const histogram = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    return { star, count, pct: reviews.length ? (count / reviews.length) * 100 : 0 };
  });

  const biz = getBizMeta(profile.businessType);

  return (
    <div className="bg-surface min-h-screen">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="border-b border-line bg-surface-alt">
        <div className="shell py-8">
          {/* Breadcrumb */}
          <p className="text-xs text-ink-soft mb-5">
            <Link to="/s" className="link">Browse</Link>
            {' › '}
            <span>Partner profile</span>
          </p>

          <div className="flex items-start gap-5 flex-wrap">
            {/* Avatar */}
            <Avatar name={profile.businessName} color={biz.color} />

            <div className="flex-1 min-w-0">
              {/* Name */}
              <h1 className="text-2xl font-bold leading-tight mb-1.5 text-ink">
                {profile.businessName}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                {/* Business type badge */}
                <span
                  className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-xs font-semibold ${biz.color}`}
                >
                  <biz.Icon size={12} className="shrink-0" />
                  {biz.label}
                </span>

                {/* City */}
                {profile.city && (
                  <span className="flex items-center gap-1 text-ink-soft text-xs">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {profile.city}
                  </span>
                )}

                {/* Member since */}
                <span className="flex items-center gap-1 text-ink-mute text-xs">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Member since {memberYear(profile.memberSince)}
                </span>

                {/* Star rating inline */}
                {ratingCount > 0 && (
                  <Stars rating={ratingAvg} count={ratingCount} size={13} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shell py-8">

        {/* ── Trust / activity stats ──────────────────────────────────────── */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-3">
            Business overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile
              icon={Star}
              value={ratingCount > 0 ? ratingAvg.toFixed(1) : '—'}
              label="Rating"
              tone={ratingCount > 0 ? 'success' : undefined}
              sublabel={ratingCount > 0 ? `from ${ratingCount} review${ratingCount === 1 ? '' : 's'}` : 'No reviews yet'}
            />
            <StatTile
              icon={CheckCircle2}
              value={profile.completedOrders ?? 0}
              label="Orders fulfilled"
              tone={profile.completedOrders > 0 ? 'success' : undefined}
              sublabel="As provider"
            />
            <StatTile
              icon={ListChecks}
              value={profile.activeListings ?? 0}
              label="Active listings"
              tone={profile.activeListings > 0 ? 'accent' : undefined}
            />
            <StatTile
              icon={Handshake}
              value={profile.seekerCompletedOrders ?? 0}
              label="Orders placed"
              sublabel="As buyer"
            />
          </div>

          {/* Secondary row */}
          {(profile.postedRequirements > 0) && (
            <div className="mt-3 flex flex-wrap gap-4 p-4 card">
              <InfoPill icon={Megaphone} label="Requirements posted" value={profile.postedRequirements} />
              <InfoPill icon={Calendar} label="Member since" value={memberYear(profile.memberSince)} />
            </div>
          )}
        </div>

        {/* ── Main content grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

          {/* ── LEFT: Listings ─────────────────────────────────────────────── */}
          <div>
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <h2 className="h-section">
                  Active listings
                  {listings.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-ink-mute">({listings.length})</span>
                  )}
                </h2>
                {listings.length > 0 && (
                  <Link to={`/s?owner=${id}`} className="text-xs text-accent hover:underline">
                    View all →
                  </Link>
                )}
              </div>

              {listings.length === 0 ? (
                <EmptyState
                  title="No active listings"
                  message="This business has no resources listed at the moment."
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {listings.map((r) => (
                    <Link key={r._id} to={`/r/${r._id}`} className="group block">
                      <div className="aspect-[4/3] bg-surface-sunk overflow-hidden mb-2 rounded-lg border border-line">
                        <img
                          src={resourceImage(r)}
                          alt={r.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                        />
                      </div>
                      <p className="text-sm font-medium line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                        {r.title}
                      </p>
                      <p className="text-[11px] text-ink-mute mt-0.5">{CATEGORY_LABELS[r.category]}</p>
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

          {/* ── RIGHT: Reviews ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="card">
              <h2 className="h-section mb-4">
                Reviews
                {reviews.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-ink-mute">({reviews.length})</span>
                )}
              </h2>

              {reviews.length === 0 ? (
                <EmptyState
                  title="No reviews yet"
                  message="Reviews appear once both parties complete a booking."
                />
              ) : (
                <>
                  {/* Summary + distribution */}
                  <div className="flex items-start gap-5 mb-5 pb-5 border-b border-line">
                    {/* Big score */}
                    <div className="text-center shrink-0">
                      <p className="text-4xl font-bold text-ink leading-none">
                        {ratingAvg.toFixed(1)}
                      </p>
                      <Stars rating={ratingAvg} size={14} className="mt-1.5 justify-center" />
                      <p className="text-[11px] text-ink-mute mt-1">
                        {ratingCount} review{ratingCount === 1 ? '' : 's'}
                      </p>
                    </div>

                    {/* Histogram */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {histogram.map((h) => (
                        <RatingBar key={h.star} {...h} />
                      ))}
                    </div>
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
