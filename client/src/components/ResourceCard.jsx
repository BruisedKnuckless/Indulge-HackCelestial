import { Link } from 'react-router-dom';
import { Price, Stars, DealBadge } from './ui';
import MatchBreakdown from './MatchBreakdown';
import { CATEGORY_LABELS, PRICE_UNIT_LABELS, resourceImage } from '../lib/constants';
import { shortDate } from '../lib/format';

/**
 * A search result row, laid out the way a marketplace listing is: image left,
 * details centre, actions right.
 */
export default function ResourceCard({ resource, criteria, onAddToCart, adding }) {
  const r = resource;
  const owner = r.owner || {};
  const score = Math.round((r.matchScore || 0) * 100);
  const unit = PRICE_UNIT_LABELS[r.pricing?.priceUnit] || '';

  return (
    <div className="bg-white p-4 flex flex-col sm:flex-row gap-4 border-b border-bd last:border-0">
      <Link to={`/r/${r._id}`} className="shrink-0 self-start">
        <img
          src={resourceImage(r)}
          alt={r.title}
          loading="lazy"
          className="w-full sm:w-[200px] h-[180px] sm:h-[160px] object-contain bg-white"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={`/r/${r._id}`} className="block">
          <h3 className="text-title text-link hover:text-link-hover leading-snug mb-1">
            {r.title}
          </h3>
        </Link>

        <p className="text-base mb-1">
          <span className="text-ink-soft">by </span>
          <Link to={`/provider/${owner._id}`} className="a-link">
            {owner.businessName}
          </Link>
        </p>

        {Boolean(r.ratingCount) && (
          <div className="mb-1">
            <Stars rating={r.ratingAvg} count={r.ratingCount} linkTo={`/r/${r._id}#reviews`} />
          </div>
        )}

        <div className="flex items-center flex-wrap gap-2 mb-1">
          {score >= 70 && <DealBadge>{score}% match</DealBadge>}
          <Price amount={r.pricing?.basePrice} unit={unit} />
        </div>

        {/* Availability sits where a shopping site puts its delivery promise. */}
        {criteria?.start ? (
          <p className="text-base text-success font-bold mb-1">
            Available {shortDate(criteria.start)}
            {r.availableQuantity != null && (
              <span className="font-normal text-ink-soft">
                {' '}
                · {r.availableQuantity} of {r.totalQuantity} free
              </span>
            )}
          </p>
        ) : (
          <p className="text-base text-success font-bold mb-1">
            {r.totalQuantity} {r.totalQuantity === 1 ? 'unit' : 'units'} listed
          </p>
        )}

        <p className="text-base text-ink-soft mb-1">
          {CATEGORY_LABELS[r.category]}
          {r.capacity ? ` · capacity ${r.capacity}` : ''}
          {r.distanceKm != null ? ` · ${r.distanceKm.toFixed(1)} km away` : ''}
          {r.pricing?.minRentalPeriodHours > 1
            ? ` · min ${r.pricing.minRentalPeriodHours}h hire`
            : ''}
        </p>

        {r.description && (
          <p className="text-base text-ink-soft line-clamp-2 mb-2">{r.description}</p>
        )}

        <MatchBreakdown
          score={r.matchScore}
          breakdown={r.matchBreakdown}
          reasons={r.matchReasons}
        />
      </div>

      <div className="sm:w-[190px] shrink-0 flex sm:flex-col gap-2 sm:items-stretch">
        <button
          onClick={() => onAddToCart?.(r)}
          disabled={adding}
          className="btn-yellow btn-pill w-full"
        >
          {adding ? 'Adding…' : 'Add to Request Cart'}
        </button>
        <Link to={`/r/${r._id}`} className="btn-secondary btn-pill w-full">
          See details
        </Link>
      </div>
    </div>
  );
}

/** Compact tile used inside the home page card grids. */
export function ResourceTile({ resource, showPrice = true }) {
  const r = resource;
  return (
    <Link to={`/r/${r._id}`} className="block group">
      <div className="aspect-square bg-[#F7F8F8] overflow-hidden mb-1">
        <img
          src={resourceImage(r)}
          alt={r.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
        />
      </div>
      <p className="text-mini text-ink line-clamp-2 leading-tight">{r.title}</p>
      {showPrice && (
        <p className="mt-0.5">
          <Price amount={r.pricing?.basePrice} size="sm" />
        </p>
      )}
    </Link>
  );
}
