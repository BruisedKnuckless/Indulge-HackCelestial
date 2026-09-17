import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  RefreshCw,
  AlertCircle,
  CreditCard,
} from 'lucide-react';
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
      <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className="text-amber-accent">
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
      </svg>
      <span className="text-sm tabular-nums font-medium">{value.toFixed(1)}</span>
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
  // Booking lifecycle
  pending: 'Awaiting provider',
  negotiating: 'In negotiation',
  accepted: 'Accepted — confirm to book',
  payment_pending: 'Payment pending',
  confirmed: 'Confirmed',
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  rejected: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Completed',
  // Fulfillment
  packed:           'Order packed',
  loading:          'Loading for transport',
  out_for_delivery: 'Out for delivery',
  delivered:        'Delivered',
  // Return
  return_requested:        'Return requested',
  return_pickup_scheduled: 'Pickup scheduled',
  return_in_transit:       'Return in transit',
  returned_to_provider:    'Returned to provider',
  return_completed:        'Return completed',
};

const STATUS_CONFIG = {
  pending: { tone: 'bg-warn/10 border-warn/30 text-warn', icon: Clock },
  negotiating: { tone: 'bg-warn/10 border-warn/30 text-warn', icon: RefreshCw },
  accepted: { tone: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  payment_pending: { tone: 'bg-warn/10 border-warn/30 text-warn', icon: CreditCard },
  confirmed: { tone: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  upcoming: { tone: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400', icon: Clock },
  in_progress: { tone: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400', icon: RefreshCw },
  completed: { tone: 'bg-surface-sunk border-line-strong text-ink-soft', icon: CheckCircle2 },
  rejected: { tone: 'bg-danger/10 border-danger/30 text-danger', icon: XCircle },
  cancelled: { tone: 'bg-danger/10 border-danger/30 text-danger', icon: XCircle },
  // Fulfillment
  packed:           { tone: 'bg-surface-sunk border-line text-ink-soft', icon: Package },
  loading:          { tone: 'bg-surface-sunk border-line text-ink-soft', icon: Package },
  out_for_delivery: { tone: 'bg-warn/10 border-warn/30 text-warn', icon: Truck },
  delivered:        { tone: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  // Return
  return_requested:        { tone: 'bg-warn/10 border-warn/30 text-warn', icon: Clock },
  return_pickup_scheduled: { tone: 'bg-warn/10 border-warn/30 text-warn', icon: Clock },
  return_in_transit:       { tone: 'bg-warn/10 border-warn/30 text-warn', icon: Truck },
  returned_to_provider:    { tone: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  return_completed:        { tone: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
};

export function StatusBadge({ status, className = '', showIcon = true }) {
  const config = STATUS_CONFIG[status] || {
    tone: 'bg-surface-sunk border-line-strong text-ink-soft',
    icon: AlertCircle,
  };
  const IconComponent = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-xs font-medium
                  ${config.tone} ${className}`}
    >
      {showIcon && IconComponent && <IconComponent size={12} strokeWidth={2} className="shrink-0" />}
      <span>{STATUS_LABELS[status] || status}</span>
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
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
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
      <span className="w-5 h-5 rounded-full border-2 border-line-strong border-t-indigo animate-spin" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, message, action, icon }) {
  return (
    <div className="text-center py-20 px-6">
      {/* Icon — either a custom one passed via prop, or the default inbox glyph */}
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                      bg-indigo/5 dark:bg-indigo/10
                      border border-indigo/20 dark:border-indigo/30
                      mb-5 mx-auto text-indigo">
        {icon || (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
               strokeLinejoin="round">
            <path d="M22 12h-6l-2 3H10l-2-3H2" />
            <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
          </svg>
        )}
      </div>
      <p className="h-section mb-2">{title}</p>
      {message && <p className="text-sm muted max-w-prose mx-auto mb-6">{message}</p>}
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
