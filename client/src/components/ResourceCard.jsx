import { Link } from 'react-router-dom';
import { Check, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Price, Stars, DealBadge } from './ui';
import CategoryIcon from './ui/CategoryIcon';
import MatchBreakdown from './MatchBreakdown';
import { getCategoryCardTheme } from '../lib/categoryTheme';
import {
  CATEGORY_LABELS,
  PRICE_UNIT_LABELS,
  resourceImage,
  PLACEHOLDER,
} from '../lib/constants';

/* ── Availability pill ─────────────────────────────────────────────────── */
function AvailBadge({ resource: r }) {
  if (r.availableQuantity == null) {
    /* No date filter active — just show total stock */
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-mute" />
        {r.totalQuantity} {r.unit || 'unit'}{r.totalQuantity !== 1 ? 's' : ''}
      </span>
    );
  }
  const avail = r.availableQuantity;
  const total = r.totalQuantity;
  const ok = avail > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        ok ? 'text-success' : 'text-danger'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`}
      />
      {ok ? `${avail} / ${total} available` : 'Unavailable'}
    </span>
  );
}

/* ── Category badge ────────────────────────────────────────────────────── */
function CategoryBadge({ category }) {
  const label = CATEGORY_LABELS[category] || category;
  const theme = getCategoryCardTheme(category);
  return (
    <span className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-full border text-[11px] font-medium transition-all duration-200 ${theme.badge}`}>
      <CategoryIcon category={category} size={11} className="shrink-0" />
      <span>{label}</span>
    </span>
  );
}

/* ── Shared Match Badge ────────────────────────────────────────────────── */
function MatchBadge({ match, className = '' }) {
  if (match == null) return null;
  const tier =
    match >= 90 ? 'bg-emerald-700 text-white' :
    match >= 75 ? 'bg-slate-700 text-white' :
                  'bg-amber-700 text-white';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold tracking-tight ${tier} ${className}`}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      {match}% Match
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ResourceCard — B2B resource card supporting both Grid and List layouts.
   ════════════════════════════════════════════════════════════════════════ */
/**
 * @param {object}   props
 * @param {object}   props.resource   — search result object
 * @param {object}   [props.criteria] — active search criteria (for match breakdown)
 * @param {function} [props.onAdd]    — add-to-cart callback
 * @param {boolean}  [props.adding]   — loading state for this card's add button
 * @param {'grid'|'list'} [props.layout] — 'grid' or 'list' layout mode
 */
export default function ResourceCard({
  resource: r,
  criteria,
  onAdd,
  adding,
  layout = 'grid',
}) {
  const unit = PRICE_UNIT_LABELS[r.pricing?.priceUnit] || '';
  const match = r.matchScore != null ? Math.round(r.matchScore * 100) : null;
  const theme = getCategoryCardTheme(r.category);

  const locationLine = [
    r.distanceKm != null && `${r.distanceKm.toFixed(1)} km`,
    r.owner?.location?.city || r.owner?.location?.address || null,
  ]
    .filter(Boolean)
    .join(' · ');

  /* ── 1. Compact B2B List layout ──────────────────────────────────────── */
  if (layout === 'list') {
    return (
      <article
        className={[
          'group relative flex flex-col sm:flex-row rounded-xl overflow-hidden',
          'resource-card',
          theme.catClass,
        ].join(' ')}
      >
        {/* Image: Fixed compact aspect ratio (approx 180x130 on desktop) */}
        <Link
          to={`/r/${r._id}`}
          className="relative w-full h-36 sm:w-44 sm:h-[130px] md:w-[180px] md:h-[130px] sm:self-start shrink-0 overflow-hidden bg-surface-sunk block rounded-t-lg sm:rounded-t-none sm:rounded-l-lg"
          tabIndex={-1}
          aria-hidden
        >
          <img
            src={resourceImage(r)}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER;
            }}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          {/* Mobile match badge */}
          {match != null && (
            <span className="sm:hidden absolute top-2 right-2 z-10">
              <MatchBadge match={match} />
            </span>
          )}
        </Link>

        {/* Content Column (Middle) */}
        <div className="flex-1 min-w-0 p-3 sm:p-3.5 md:p-4 flex flex-col justify-between">
          <div className="space-y-1.5">
            {/* Title & Provider */}
            <div className="min-w-0">
              <Link
                to={`/r/${r._id}`}
                className={`text-base font-semibold leading-snug truncate block text-ink transition-colors duration-200 ${theme.titleHover}`}
                title={r.title}
              >
                {r.title}
              </Link>
              <p className="text-xs text-ink-soft mt-0.5 truncate">
                by{' '}
                <Link
                  to={`/provider/${r.owner?._id}`}
                  className="link-quiet hover:text-ink font-medium"
                >
                  {r.owner?.businessName || 'Verified Provider'}
                </Link>
              </p>
            </div>

            {/* Category • Quantity • Availability • Capacity */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <CategoryBadge category={r.category} />
              <span className="text-ink-mute text-xs">•</span>
              <AvailBadge resource={r} />
              {r.capacity != null && (
                <>
                  <span className="text-ink-mute text-xs">•</span>
                  <span className="text-ink-soft">
                    Up to {r.capacity} guests
                  </span>
                </>
              )}
              {r.pricing?.minRentalPeriodHours > 1 && (
                <>
                  <span className="text-ink-mute text-xs">•</span>
                  <span className="text-ink-mute">
                    min {r.pricing.minRentalPeriodHours}h
                  </span>
                </>
              )}
              {r.verificationStatus === 'verified' && (
                <>
                  <span className="text-ink-mute text-xs">•</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={12} />
                    <span>✓ Indulge Verified</span>
                    {r.conditionScore != null && (
                      <span className="px-1 rounded bg-emerald-100 dark:bg-emerald-950 text-[10px]">
                        {r.conditionScore}/100
                      </span>
                    )}
                  </span>
                </>
              )}
            </div>

            {/* Rating • Distance • Location */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
              {r.ratingCount > 0 ? (
                <Stars rating={r.ratingAvg} count={r.ratingCount} size={12} />
              ) : (
                <span className="text-ink-mute">No reviews yet</span>
              )}
              {locationLine && (
                <>
                  <span className="text-ink-mute">•</span>
                  <span className="truncate">{locationLine}</span>
                </>
              )}
            </div>

            {/* Match highlights (compact list when matching) */}
            {r.matchHighlights && r.matchHighlights.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60 text-[11px]">
                {r.matchHighlights.slice(0, 3).map((h, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 ${
                      h.ok ? 'text-success font-medium' : 'text-ink-soft'
                    }`}
                  >
                    <span className="shrink-0">
                      {h.ok ? (
                        <Check size={11} className="text-success inline" strokeWidth={2.5} />
                      ) : (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-mute" />
                      )}
                    </span>
                    <span>{h.label}</span>
                  </span>
                ))}
                {r.matchHighlights.length > 3 && (
                  <span className="text-ink-mute text-[10px]">
                    +{r.matchHighlights.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Match breakdown (collapsible "Why this match?") */}
          {r.matchBreakdown && (
            <div className="pt-2">
              <MatchBreakdown
                score={r.matchScore}
                breakdown={r.matchBreakdown}
                reasons={r.matchReasons}
                criteria={criteria}
              />
            </div>
          )}
        </div>

        {/* Right Column: Price, Match %, Actions */}
        <div className="p-3 sm:p-3.5 md:p-4 sm:pl-0 flex flex-col justify-between sm:items-end border-t sm:border-t-0 sm:border-l border-line sm:w-44 md:w-48 shrink-0 bg-surface-alt/40 sm:bg-transparent">
          {/* Price + Desktop Match Badge */}
          <div className="sm:text-right flex items-center sm:flex-col sm:items-end justify-between sm:justify-start gap-1 w-full">
            <Price amount={r.pricing?.basePrice} unit={unit} size="md" />
            {match != null && (
              <div className="hidden sm:block mt-1">
                <MatchBadge match={match} />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-3 sm:mt-0 w-full">
            {onAdd && (
              <button
                onClick={() => onAdd(r)}
                disabled={adding}
                className="btn-primary btn-sm flex-1 justify-center whitespace-nowrap"
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            )}
            <Link
              to={`/r/${r._id}`}
              className={`btn-secondary btn-sm ${onAdd ? 'flex-1' : 'w-full'} justify-center whitespace-nowrap inline-flex items-center gap-1 group-hover:border-line-strong transition-all duration-200`}
            >
              <span>Details</span>
              <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-[3px]" />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  /* ── 2. Grid layout ──────────────────────────────────────────────────── */
  return (
    <article
      className={[
        'group relative flex flex-col rounded-xl overflow-hidden',
        'resource-card',
        theme.catClass,
      ].join(' ')}
    >
      {/* ── Image ────────────────────────────────────────────────── */}
      <Link
        to={`/r/${r._id}`}
        className="block aspect-[4/3] overflow-hidden bg-surface-sunk shrink-0"
        tabIndex={-1}
        aria-hidden
      >
        <img
          src={resourceImage(r)}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = PLACEHOLDER;
          }}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </Link>

      {/* Match badge — floats top-right over the image only when personalized score exists */}
      {match != null && (
        <span className="absolute top-2.5 right-2.5 z-10">
          <MatchBadge match={match} />
        </span>
      )}

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Category */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryBadge category={r.category} />
            {r.verificationStatus === 'verified' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800" title="Indulge Verified Resource">
                <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
                <span>Verified</span>
              </span>
            )}
          </div>
          <AvailBadge resource={r} />
        </div>

        {/* Title + provider */}
        <div className="min-w-0">
          <Link
            to={`/r/${r._id}`}
            className={`text-base font-semibold leading-snug line-clamp-2 text-ink transition-colors duration-200 ${theme.titleHover}`}
          >
            {r.title}
          </Link>
          <p className="text-xs text-ink-soft mt-0.5 truncate">
            by{' '}
            <Link to={`/provider/${r.owner?._id}`} className="link-quiet hover:text-ink">
              {r.owner?.businessName}
            </Link>
          </p>
        </div>

        {/* Rating + location */}
        <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
          {r.ratingCount > 0 ? (
            <Stars rating={r.ratingAvg} count={r.ratingCount} size={12} />
          ) : (
            <span className="text-ink-mute">No reviews yet</span>
          )}
          {locationLine && (
            <span className="truncate text-right">{locationLine}</span>
          )}
        </div>

        {/* Capacity */}
        {r.capacity != null && (
          <p className="text-xs text-ink-mute -mt-1">
            Up to {r.capacity} guests
            {r.pricing?.minRentalPeriodHours > 1 &&
              ` · min ${r.pricing.minRentalPeriodHours} h`}
          </p>
        )}

        {/* Match highlights checklist — visible when matching against active requirement */}
        {r.matchHighlights && r.matchHighlights.length > 0 && (
          <div className="bg-surface-sunk/70 rounded-md p-2.5 border border-line text-xs space-y-1 my-0.5">
            {r.matchHighlights.map((h, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 ${
                  h.ok ? 'text-success font-medium' : 'text-ink-soft'
                }`}
              >
                <span className="shrink-0">
                  {h.ok ? (
                    <Check size={12} className="text-success inline" strokeWidth={2.5} />
                  ) : (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-mute" />
                  )}
                </span>
                <span className="truncate leading-tight">{h.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Spacer pushes price + CTA to bottom */}
        <div className="flex-1" />

        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          <Price amount={r.pricing?.basePrice} unit={unit} size="md" />
        </div>

        {/* CTA row */}
        <div className="flex gap-2 pt-1 border-t border-line">
          {onAdd && (
            <button
              onClick={() => onAdd(r)}
              disabled={adding}
              className="btn-primary btn-sm flex-1"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          )}
          <Link
            to={`/r/${r._id}`}
            className={`btn-secondary btn-sm ${onAdd ? '' : 'flex-1 justify-center'} inline-flex items-center justify-center gap-1 group-hover:border-line-strong transition-all duration-200`}
          >
            <span>Details</span>
            <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-[3px]" />
          </Link>
        </div>

        {/* Match breakdown — collapsible, explainable */}
        {r.matchBreakdown && (
          <div className="pt-1">
            <MatchBreakdown
              score={r.matchScore}
              breakdown={r.matchBreakdown}
              reasons={r.matchReasons}
              criteria={criteria}
            />
          </div>
        )}
      </div>
    </article>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ResourceTile — compact tile for landing-page carousels.
   DO NOT modify — used by Home.jsx / Browse landing sections.
   ════════════════════════════════════════════════════════════════════════ */
/** @param {{ resource: object, showPrice?: boolean }} props */
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
