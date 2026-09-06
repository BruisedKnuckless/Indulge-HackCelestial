import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import CategoryIcon from '../ui/CategoryIcon';
import {
  CATEGORY_LABELS,
  PRICE_UNIT_LABELS,
  resourceImage,
  PLACEHOLDER,
} from '../../lib/constants';

/**
 * NearbyCard — compact resource card designed specifically for the side panel.
 * Information-dense horizontal layout with thumbnail, title, provider, category,
 * availability, distance, pricing, and action button.
 */
export default function NearbyCard({ resource: r, selected, onClick, onAdd, adding }) {
  const unit = PRICE_UNIT_LABELS[r.pricing?.priceUnit] || '';
  const price = r.pricing?.basePrice;
  const distKm = r.distanceKm != null ? r.distanceKm.toFixed(1) : null;
  const avail = r.availableQuantity ?? r.totalQuantity;
  const isAvail = avail == null || avail > 0;
  const category = CATEGORY_LABELS[r.category] || r.category || '';
  const match = r.matchScore != null ? Math.round(r.matchScore * 100) : null;

  return (
    <article
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={[
        'group flex items-start gap-3 p-3 rounded-xl border cursor-pointer',
        'bg-surface-alt transition-all duration-150',
        selected
          ? 'border-accent ring-1 ring-accent/30 shadow-sm bg-surface'
          : 'border-line hover:border-line-strong hover:shadow-sm hover:-translate-y-px',
      ].join(' ')}
    >
      {/* Thumbnail */}
      <Link
        to={`/r/${r._id}`}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-surface-sunk border border-line block relative"
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
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
        />
        {match != null && (
          <span className="absolute bottom-0 inset-x-0 bg-ink/75 backdrop-blur-[2px] text-white text-[9px] font-bold text-center py-0.5">
            {match}%
          </span>
        )}
      </Link>

      {/* Content Area */}
      <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch gap-1">
        {/* Name & Provider */}
        <div className="min-w-0">
          <Link
            to={`/r/${r._id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-ink hover:text-accent transition-colors leading-snug line-clamp-1 block"
            title={r.title}
          >
            {r.title}
          </Link>

          <p className="text-xs text-ink-soft truncate leading-tight mt-0.5">
            {r.owner?.businessName || 'Verified Provider'}
          </p>
        </div>

        {/* Category & Availability row */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-ink-mute">
            <CategoryIcon category={r.category} size={12} className="shrink-0 text-ink-soft" />
            <span>{category}</span>
          </span>
          <span className="text-ink-mute">•</span>
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              isAvail ? 'text-success' : 'text-danger'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isAvail ? 'bg-success' : 'bg-danger'}`} />
            {isAvail ? 'Available' : 'Unavailable'}
          </span>
        </div>

        {/* Distance + Price + Details Action */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/60">
          <div className="flex items-center gap-2 text-xs min-w-0 flex-wrap">
            {distKm && (
              <span className="font-semibold text-accent whitespace-nowrap inline-flex items-center gap-1">
                <MapPin size={11} className="shrink-0" />
                <span>{distKm} km</span>
              </span>
            )}
            {price != null && (
              <span className="font-semibold text-ink whitespace-nowrap">
                ₹{price.toLocaleString()}
                {unit && <span className="text-ink-mute font-normal text-[11px]">/{unit}</span>}
              </span>
            )}
          </div>

          <Link
            to={`/r/${r._id}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md border border-line bg-surface hover:border-accent hover:text-accent transition-all duration-150 whitespace-nowrap shadow-sm"
          >
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}
