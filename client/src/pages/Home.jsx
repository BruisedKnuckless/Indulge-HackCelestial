import { Link } from 'react-router-dom';
import { useSearch, useAnalytics } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import HeroCarousel from '../components/HeroCarousel';
import ScrollSequence from '../components/ScrollSequence';
import { ResourceTile } from '../components/ResourceCard';
import { GridCard, Price, Stars, DealBadge, Spinner } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS, resourceImage } from '../lib/constants';
import { shortName } from '../lib/businessName';

/** 2×2 tile grid — the shape a marketplace home page uses for its card blocks. */
function TileGrid({ resources = [], showPrice = true }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {resources.slice(0, 4).map((r) => (
        <ResourceTile key={r._id} resource={r} showPrice={showPrice} />
      ))}
    </div>
  );
}

/** Single large image with a caption — the "Deal for you" card shape. */
function SpotlightCard({ title, resource, footerLabel, badge }) {
  if (!resource) return null;
  return (
    <div className="a-card flex flex-col">
      <h2 className="a-h2 mb-3">{title}</h2>
      <Link to={`/r/${resource._id}`} className="flex-1 group">
        <div className="aspect-[4/3] bg-[#F7F8F8] overflow-hidden mb-2">
          <img
            src={resourceImage(resource)}
            alt={resource.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
          />
        </div>
        {badge && <DealBadge className="mb-1">{badge}</DealBadge>}
        <p className="text-base line-clamp-2 leading-tight">{resource.title}</p>
        <p className="mt-1">
          <Price amount={resource.pricing?.basePrice} size="sm" />
        </p>
      </Link>
      <Link to={`/r/${resource._id}`} className="a-link text-base mt-3">
        {footerLabel}
      </Link>
    </div>
  );
}

/**
 * Fourth card in the hero row. Signed out it sells the sign-in; signed in it
 * becomes a live snapshot of the account, which is more useful than a block of
 * marketing copy and fills the card to the same height as its neighbours.
 */
function AccountCard({ user }) {
  const { data: summary } = useAnalytics('summary');

  if (!user) {
    return (
      <div className="a-card flex flex-col">
        <h2 className="a-h2 mb-3">Sign in for your best rates</h2>
        <p className="text-base text-ink-soft flex-1">
          See resources ranked for your location, dates and budget — and track every request in one
          place.
        </p>
        <Link to="/login" className="btn-yellow w-full mt-3">
          Sign in securely
        </Link>
      </div>
    );
  }

  const stats = [
    { label: 'Active listings', value: summary?.activeListings ?? 0, to: '/listings' },
    { label: 'Requests to review', value: summary?.pendingRequests ?? 0, to: '/bookings/received' },
    { label: 'Your open requests', value: summary?.activeRequests ?? 0, to: '/bookings/sent' },
  ];

  return (
    <div className="a-card flex flex-col">
      <h2 className="a-h2 mb-3">Welcome back, {shortName(user.businessName)}</h2>

      <div className="flex-1">
        <ul className="divide-y divide-bd border-y border-bd">
          {stats.map((s) => (
            <li key={s.label}>
              <Link
                to={s.to}
                className="flex items-center justify-between py-2 group"
              >
                <span className="text-base a-link-plain">{s.label}</span>
                <span
                  className={`text-section font-bold ${
                    s.value > 0 && s.label !== 'Active listings' ? 'text-deal' : 'text-ink'
                  }`}
                >
                  {s.value}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="text-mini text-ink-soft mt-3">
          Idle capacity earns nothing. List what you are not using this week.
        </p>
      </div>

      <div className="space-y-2 mt-3">
        <Link to="/listings/new" className="btn-yellow w-full">
          List a resource
        </Link>
        <Link to="/analytics" className="btn-secondary w-full">
          View analytics
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();

  const { data: nearby, isLoading } = useSearch({ limit: 24, radiusKm: 60 });
  const { data: banquet } = useSearch({ category: 'banquet_space', limit: 8, radiusKm: 60 });
  const { data: av } = useSearch({ category: 'av_equipment', limit: 8, radiusKm: 60 });
  const { data: topRated } = useSearch({ sort: 'rating', limit: 8, radiusKm: 60 });

  const all = nearby?.results || [];
  const best = [...all].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  return (
    <div className="relative">
      {/* Cinematic intro runs first; the marketplace begins once it has played out. */}
      <ScrollSequence />

      <HeroCarousel />

      {/* The card row that overlaps the bottom of the hero. */}
      <div className="relative -mt-[110px] sm:-mt-[130px] z-10">
        <div className="page-shell">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GridCard
              title="Keep browsing banquet spaces"
              footerLabel="See more"
              footerTo="/s?category=banquet_space"
            >
              <TileGrid resources={banquet?.results || []} showPrice={false} />
            </GridCard>

            <SpotlightCard
              title="Deal for you"
              resource={best[0]}
              badge={best[0] ? `${Math.round((best[0].matchScore || 0) * 100)}% match` : null}
              footerLabel="See details"
            />

            <GridCard
              title="AV equipment for your next event"
              footerLabel="See more"
              footerTo="/s?category=av_equipment"
            >
              <TileGrid resources={av?.results || []} showPrice={false} />
            </GridCard>

            <AccountCard user={user} />
          </div>
        </div>
      </div>

      <div className="page-shell space-y-4 mt-4 pb-6">
        {isLoading && (
          <div className="a-card">
            <Spinner label="Finding resources near you" />
          </div>
        )}

        {/* Horizontal scroller of best matches. */}
        {best.length > 0 && (
          <div className="a-card">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="a-h2">Recommended for your requirements</h2>
              <Link to="/s" className="a-link text-base">
                See all
              </Link>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
              {best.slice(0, 10).map((r) => (
                <Link
                  key={r._id}
                  to={`/r/${r._id}`}
                  className="w-[180px] shrink-0 group"
                >
                  <div className="h-[180px] bg-[#F7F8F8] overflow-hidden mb-2">
                    <img
                      src={resourceImage(r)}
                      alt={r.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                    />
                  </div>
                  {r.matchScore >= 0.7 && (
                    <DealBadge className="mb-1">
                      {Math.round(r.matchScore * 100)}% match
                    </DealBadge>
                  )}
                  <p className="text-base line-clamp-2 leading-tight">{r.title}</p>
                  {/* Empty stars on an unrated listing read as a bad score. */}
                  {r.ratingCount > 0 && (
                    <div className="mt-0.5">
                      <Stars rating={r.ratingAvg} count={r.ratingCount} size={12} />
                    </div>
                  )}
                  <Price amount={r.pricing?.basePrice} size="sm" className="mt-0.5" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Category shortcuts. */}
        <div className="a-card">
          <h2 className="a-h2 mb-3">Shop by category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {CATEGORIES.map((c) => {
              const sample = all.find((r) => r.category === c.value);
              return (
                <Link key={c.value} to={`/s?category=${c.value}`} className="group text-center">
                  <div className="aspect-square bg-[#F7F8F8] overflow-hidden mb-1.5 rounded">
                    {sample ? (
                      <img
                        src={resourceImage(sample)}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-ink-mute text-mini">
                        {c.short}
                      </div>
                    )}
                  </div>
                  <span className="text-base a-link-plain">{c.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Four-up card grid mirroring the reference layout. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GridCard title="Top-rated providers" footerLabel="See all" footerTo="/s?sort=rating">
            <TileGrid resources={topRated?.results || []} showPrice={false} />
          </GridCard>

          <GridCard title="Furniture & seating" footerLabel="See more" footerTo="/s?category=furniture">
            <TileGrid resources={all.filter((r) => r.category === 'furniture')} />
          </GridCard>

          <GridCard title="Transport & logistics" footerLabel="See more" footerTo="/s?category=vehicle">
            <TileGrid resources={all.filter((r) => r.category === 'vehicle')} />
          </GridCard>

          <div className="a-card flex flex-col">
            <h2 className="a-h2 mb-3">Can’t find what you need?</h2>
            <div className="flex-1">
              <p className="text-base text-ink-soft mb-3">
                Describe the requirement instead. We run it through the same ranking that powers
                search and show who can actually cover it.
              </p>
              <ul className="space-y-1.5">
                {[
                  ['300 chairs', 'this Saturday, within 10 km'],
                  ['A hall for 200', 'under ₹50,000 for the day'],
                  ['Kitchen hours', 'overnight, FSSAI licensed'],
                ].map(([what, when]) => (
                  <li key={what} className="text-base flex gap-2">
                    <span className="text-success shrink-0">✓</span>
                    <span>
                      <span className="font-bold">{what}</span>
                      <span className="text-ink-soft"> — {when}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Link to="/requirements/new" className="btn-secondary w-full mt-3">
              Post a requirement
            </Link>
          </div>
        </div>

        {/* Long tail, presented as a dense grid. */}
        {all.length > 0 && (
          <div className="a-card">
            <h2 className="a-h2 mb-3">Available near you</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {all.slice(0, 12).map((r) => (
                <div key={r._id}>
                  <ResourceTile resource={r} />
                  <p className="text-micro text-ink-mute mt-0.5">
                    {CATEGORY_LABELS[r.category]}
                    {r.distanceKm != null && ` · ${r.distanceKm.toFixed(1)} km`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
