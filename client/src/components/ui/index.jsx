import { Link } from 'react-router-dom';

/* ------------------------------------------------------------------ Price */

/**
 * Amazon composes a price from three differently sized pieces: a raised
 * currency symbol, a large whole number, and raised decimals.
 */
export function Price({ amount, unit, size = 'md', className = '' }) {
  const value = Math.round(Number(amount) || 0);
  const whole = value.toLocaleString('en-IN');

  const sizes = {
    sm: { sym: 'text-[10px]', num: 'text-body', unit: 'text-mini' },
    md: { sym: 'text-mini', num: 'text-[21px]', unit: 'text-base' },
    lg: { sym: 'text-body', num: 'text-[28px]', unit: 'text-body' },
  }[size];

  return (
    <span className={`inline-flex items-start text-ink ${className}`}>
      <span className={`${sizes.sym} mt-[3px] mr-[1px]`}>₹</span>
      <span className={`${sizes.num} font-normal leading-none`}>{whole}</span>
      {unit && <span className={`${sizes.unit} text-ink-soft self-end ml-1`}>{unit}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ Stars */

export function Stars({ rating = 0, count, size = 14, linkTo, className = '' }) {
  const pct = Math.max(0, Math.min(5, Number(rating) || 0)) / 5;

  const row = (color, clip) => (
    <div
      className="absolute inset-0 flex gap-[1px] overflow-hidden"
      style={clip ? { width: `${pct * 100}%` } : undefined}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={color} className="shrink-0">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </div>
  );

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className="relative inline-block shrink-0"
        style={{ width: size * 5 + 4, height: size }}
        title={`${Number(rating).toFixed(1)} out of 5`}
      >
        {row('#E3E6E6', false)}
        {row('#FFA41C', true)}
      </span>
      {count !== undefined &&
        (linkTo ? (
          <Link to={linkTo} className="a-link text-base">
            {count.toLocaleString('en-IN')}
          </Link>
        ) : (
          <span className="text-base text-ink-soft">{count.toLocaleString('en-IN')}</span>
        ))}
    </span>
  );
}

/* ----------------------------------------------------------------- Badges */

/** The deal-red pill Amazon uses for "23% off". Here it carries match score. */
export function DealBadge({ children, className = '' }) {
  return (
    <span
      className={`inline-block bg-deal text-white text-mini font-bold px-1.5 py-[2px] rounded-sm ${className}`}
    >
      {children}
    </span>
  );
}

const STATUS_STYLES = {
  pending: 'bg-[#FEF8E7] text-[#8A6116] border-[#E7C65C]',
  negotiating: 'bg-[#EAF4FB] text-[#0F5A8F] border-[#7DBAE3]',
  accepted: 'bg-[#E8F5E9] text-success border-[#8CC98F]',
  confirmed: 'bg-[#E8F5E9] text-success border-[#8CC98F]',
  completed: 'bg-[#F0F2F2] text-ink-soft border-bd',
  rejected: 'bg-[#FDECEA] text-danger border-[#E8A9A2]',
  cancelled: 'bg-[#FDECEA] text-danger border-[#E8A9A2]',
};

export const STATUS_LABELS = {
  pending: 'Awaiting provider',
  negotiating: 'In negotiation',
  accepted: 'Accepted — confirm to book',
  confirmed: 'Confirmed',
  completed: 'Completed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

export function StatusBadge({ status, className = '' }) {
  return (
    <span
      className={`inline-block text-mini font-bold px-2 py-[2px] rounded border ${
        STATUS_STYLES[status] || STATUS_STYLES.completed
      } ${className}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

/* --------------------------------------------------------------- Surfaces */

export function Card({ children, className = '' }) {
  return <div className={`a-card ${className}`}>{children}</div>;
}

export function Panel({ children, className = '' }) {
  return <div className={`a-panel ${className}`}>{children}</div>;
}

/** White card with a 21px bold heading and a teal footer link — the home grid. */
export function GridCard({ title, footerLabel, footerTo, children, className = '' }) {
  return (
    <div className={`a-card flex flex-col ${className}`}>
      <h2 className="a-h2 mb-3">{title}</h2>
      <div className="flex-1">{children}</div>
      {footerLabel && (
        <Link to={footerTo || '#'} className="a-link text-base mt-3 inline-block">
          {footerLabel}
        </Link>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Buttons */

export function Button({ variant = 'secondary', pill, className = '', as, to, ...props }) {
  const cls = `btn-${variant} ${pill ? 'btn-pill' : ''} ${className}`;
  if (as === 'link') return <Link to={to} className={cls} {...props} />;
  return <button className={cls} {...props} />;
}

/* ------------------------------------------------------------------ Misc */

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-ink-soft text-body">
      <span className="w-4 h-4 border-2 border-bd border-t-link rounded-full animate-spin" />
      {label}…
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="a-card text-center py-12">
      <p className="text-title font-bold mb-1">{title}</p>
      {message && <p className="text-body text-ink-soft mb-4">{message}</p>}
      {action}
    </div>
  );
}

export function Alert({ tone = 'info', children, className = '' }) {
  const tones = {
    info: 'bg-[#F0F7FF] border-[#B3D4F0] text-ink',
    warn: 'bg-[#FEF8E7] border-[#E7C65C] text-ink',
    error: 'bg-[#FDECEA] border-[#E8A9A2] text-danger',
    success: 'bg-[#E8F5E9] border-[#8CC98F] text-ink',
  };
  return (
    <div className={`border rounded px-3 py-2 text-body ${tones[tone]} ${className}`}>{children}</div>
  );
}

/** Amazon's thin section rule with the heading sitting on it. */
export function Divider({ label, className = '' }) {
  if (!label) return <hr className={`border-0 border-t border-bd ${className}`} />;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <hr className="flex-1 border-0 border-t border-bd" />
      <span className="text-mini text-ink-soft">{label}</span>
      <hr className="flex-1 border-0 border-t border-bd" />
    </div>
  );
}
