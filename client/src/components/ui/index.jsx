import { Link } from 'react-router-dom';
import { inr } from '../../lib/format';

/* ------------------------------------------------------------------ price */

const PRICE_SIZE = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
};

export function Price({ amount, unit, size = 'md', className = '' }) {
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span className={`${PRICE_SIZE[size]} font-semibold tracking-tight`}>{inr(amount)}</span>
      {unit && <span className="text-xs text-ink-mute">{unit}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ stars */

/**
 * Rating as a single filled bar plus the numeral. Five separate glyphs is a lot
 * of visual noise for one number, so this keeps the signal and drops the rest.
 */
export function Stars({ rating = 0, count, size = 14, linkTo, className = '' }) {
  const value = Number(rating) || 0;

  const body = (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className="text-ink">
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
      </svg>
      <span className="text-sm tabular-nums">{value.toFixed(1)}</span>
      {count != null && count > 0 && <span className="text-sm text-ink-mute">({count})</span>}
    </span>
  );

  if (linkTo) {
    return (
      <a href={linkTo} className="link-quiet">
        {body}
      </a>
    );
  }
  return body;
}

/* ----------------------------------------------------------------- badges */

/** Match quality. Named for its original slot; now a quiet outlined pill. */
export function DealBadge({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2.5 rounded-full border border-ink/25
                  text-xs font-medium text-ink ${className}`}
    >
      {children}
    </span>
  );
}

export const STATUS_LABELS = {
  pending: 'Awaiting provider',
  negotiating: 'In negotiation',
  accepted: 'Accepted — confirm to book',
  rejected: 'Declined',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const STATUS_TONE = {
  pending: 'border-warn/40 text-warn',
  negotiating: 'border-warn/40 text-warn',
  accepted: 'border-success/40 text-success',
  confirmed: 'border-success/40 text-success',
  completed: 'border-line-strong text-ink-soft',
  rejected: 'border-danger/40 text-danger',
  cancelled: 'border-danger/40 text-danger',
};

export function StatusBadge({ status, className = '' }) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2.5 rounded-full border text-xs font-medium
                  ${STATUS_TONE[status] || 'border-line-strong text-ink-soft'} ${className}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

/* --------------------------------------------------------------- surfaces */

export function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Panel({ children, className = '' }) {
  return <div className={`bg-surface border border-line rounded ${className}`}>{children}</div>;
}

export function GridCard({ title, footerLabel, footerTo, children, className = '' }) {
  return (
    <section className={`flex flex-col ${className}`}>
      <h2 className="h-card mb-4">{title}</h2>
      <div className="flex-1">{children}</div>
      {footerLabel && footerTo && (
        <Link to={footerTo} className="text-sm link mt-4 self-start">
          {footerLabel}
        </Link>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- buttons */

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  // Kept so older call sites keep rendering something sensible.
  yellow: 'btn-primary',
  orange: 'btn-primary',
};

export function Button({ variant = 'secondary', pill, className = '', as, to, ...props }) {
  const cls = `${VARIANTS[variant] || 'btn-secondary'} ${pill ? 'rounded-full' : ''} ${className}`;
  if (as === 'link' || to) return <Link to={to} className={cls} {...props} />;
  return <button className={cls} {...props} />;
}

/* ------------------------------------------------------------------ state */

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-mute">
      <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-ink animate-spin" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="text-center py-20 px-6">
      <p className="text-lg font-medium mb-2">{title}</p>
      {message && <p className="text-base muted max-w-prose mx-auto mb-6">{message}</p>}
      {action}
    </div>
  );
}

const ALERT_TONE = {
  info: 'border-line-strong bg-surface-alt text-ink',
  success: 'border-success/30 bg-success/5 text-success',
  warn: 'border-warn/30 bg-warn/5 text-warn',
  error: 'border-danger/30 bg-danger/5 text-danger',
};

export function Alert({ tone = 'info', children, className = '' }) {
  return (
    <div className={`border rounded px-4 py-3 text-sm ${ALERT_TONE[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function Divider({ label, className = '' }) {
  if (!label) return <hr className={`rule ${className}`} />;
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <hr className="rule flex-1" />
      <span className="text-xs text-ink-mute">{label}</span>
      <hr className="rule flex-1" />
    </div>
  );
}
