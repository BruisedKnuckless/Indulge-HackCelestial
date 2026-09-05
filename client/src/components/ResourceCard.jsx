import { Link } from 'react-router-dom';
import { Price, Stars, DealBadge } from './ui';
import MatchBreakdown from './MatchBreakdown';
import { CATEGORY_LABELS, PRICE_UNIT_LABELS, resourceImage } from '../lib/constants';

/**
 * One search result. A single row of information with plenty of air: image,
 * what it is, what it costs, and one action. Secondary detail is a single
 * subdued meta line rather than a stack of badges.
 */
export default function ResourceCard({ resource: r, criteria, onAdd, adding }) {
  const unit = PRICE_UNIT_LABELS[r.pricing?.priceUnit] || '';
  const match = r.matchScore != null ? Math.round(r.matchScore * 100) : null;

  const meta = [
    CATEGORY_LABELS[r.category],
    r.distanceKm != null && `${r.distanceKm.toFixed(1)} km away`,
    r.capacity && `up to ${r.capacity} guests`,
    r.pricing?.minRentalPeriodHours > 1 && `min ${r.pricing.minRentalPeriodHours}h`,
  ].filter(Boolean);

  return (
    <article className="py-8 border-b border-line last:border-0">
      <div className="flex flex-col sm:flex-row gap-6">
        <Link to={`/r/${r._id}`} className="shrink-0">
          <img
            src={resourceImage(r)}
            alt={r.title}
            loading="lazy"
            className="w-full sm:w-[180px] h-[140px] object-cover rounded bg-surface-sunk"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Link to={`/r/${r._id}`} className="text-lg font-medium hover:underline underline-offset-4">
                {r.title}
              </Link>
              <p className="text-sm muted mt-0.5">
                <Link to={`/provider/${r.owner?._id}`} className="link-quiet">
                  {r.owner?.businessName}
                </Link>
              </p>
            </div>

            {match != null && <DealBadge className="shrink-0">{match}% match</DealBadge>}
          </div>

          <div className="flex items-center gap-4 mt-3">
            <Price amount={r.pricing?.basePrice} unit={unit} />
            {r.ratingCount > 0 && <Stars rating={r.ratingAvg} count={r.ratingCount} size={13} />}
          </div>

          <p className="text-sm muted mt-2">{meta.join(' · ')}</p>

          {r.description && (
            <p className="text-sm muted mt-2 line-clamp-2 max-w-prose">{r.description}</p>
          )}

          {r.availableQuantity != null && (
            <p className="text-sm mt-2 text-success">
              {r.availableQuantity} of {r.totalQuantity} available for your dates
            </p>
          )}

          <div className="flex items-center gap-3 mt-5">
            {onAdd && (
              <button onClick={() => onAdd(r)} disabled={adding} className="btn-primary btn-sm">
                {adding ? 'Adding…' : 'Add to request'}
              </button>
            )}
            <Link to={`/r/${r._id}`} className="btn-secondary btn-sm">
              View details
            </Link>
          </div>

          {r.matchBreakdown && (
            <div className="mt-4">
              <MatchBreakdown
                score={r.matchScore}
                breakdown={r.matchBreakdown}
                reasons={r.matchReasons}
                criteria={criteria}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Compact tile for grids and carousels. */
export function ResourceTile({ resource: r, showPrice = true }) {
  return (
    <Link to={`/r/${r._id}`} className="group block">
      <div className="aspect-[4/3] rounded overflow-hidden bg-surface-sunk mb-3">
        <img
          src={resourceImage(r)}
          alt={r.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
        />
      </div>
      <p className="text-sm line-clamp-2 leading-snug group-hover:underline underline-offset-4">
        {r.title}
      </p>
      {showPrice && <Price amount={r.pricing?.basePrice} size="sm" className="mt-1" />}
    </Link>
  );
}
