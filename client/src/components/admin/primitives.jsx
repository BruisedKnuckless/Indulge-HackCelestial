import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Copy, Search, X } from 'lucide-react';
import { inr } from '../../lib/format';

/**
 * Shared furniture for the admin console.
 *
 * Deliberately built from the design-system classes in styles/index.css
 * (.card, .field, .badge-*, .btn-*) rather than fresh colour literals — a
 * previous skin was stripped out of this project and stray hex values are how
 * it creeps back.
 */

/* ------------------------------------------------------------------ layout */

export function SectionHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div className="min-w-0">
        <h2 className="h-section">{title}</h2>
        {subtitle && <p className="text-sm muted mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------- KPI */

/**
 * A headline number. `delta` is a signed percentage; it is rendered green for
 * up and red for down, which is only meaningful because every tile that passes
 * one is a metric where more is better.
 */
export function Kpi({ label, value, sub, delta, icon: Icon, tone = 'indigo', onClick }) {
  const interactive = typeof onClick === 'function';
  const Wrapper = interactive ? 'button' : 'div';

  return (
    <Wrapper
      {...(interactive ? { onClick, type: 'button' } : {})}
      className={`stat-card flex items-start gap-3.5 text-left w-full ${
        interactive ? 'cursor-pointer' : ''
      }`}
    >
      {Icon && (
        <span className={`icon-box icon-box-${tone} w-10 h-10`}>
          <Icon size={18} strokeWidth={1.8} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-ink-mute uppercase tracking-widest font-medium mb-1">
          {label}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none tracking-tight tabular-nums">{value}</span>
          {delta != null && (
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                delta >= 0 ? 'text-green-accent' : 'text-red-accent'
              }`}
            >
              {delta >= 0 ? '+' : ''}
              {delta}%
            </span>
          )}
        </span>
        {sub && <span className="block text-[11px] text-ink-mute mt-1.5">{sub}</span>}
      </span>
    </Wrapper>
  );
}

/* ------------------------------------------------------------------ badges */

const SEVERITY_CLASS = {
  critical: 'badge-red',
  warning: 'badge-amber',
  info: 'badge-indigo',
  ok: 'badge-green',
};

export function Severity({ level, children }) {
  return <span className={SEVERITY_CLASS[level] || 'badge-muted'}>{children || level}</span>;
}

/** Reuses the platform's own status pills so a status reads the same everywhere. */
export function Pill({ status, children }) {
  const known = [
    'open', 'pending', 'negotiating', 'accepted', 'confirmed', 'completed',
    'expired', 'fulfilled', 'closed', 'rejected', 'cancelled',
  ];
  const cls = known.includes(status) ? `status-${status}` : 'badge-muted';
  return <span className={cls}>{children || String(status || '—').replace(/_/g, ' ')}</span>;
}

/* ------------------------------------------------------------------ toolbar */

export function Toolbar({ children }) {
  return <div className="flex flex-wrap items-center gap-2 mb-4">{children}</div>;
}

/** Debounced so a filter does not fire a request per keystroke. */
export function SearchBox({ value, onChange, placeholder = 'Search…', className = '' }) {
  const [local, setLocal] = useState(value || '');
  const first = useRef(true);

  useEffect(() => setLocal(value || ''), [value]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onChange(local), 300);
    return () => clearTimeout(t);
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative ${className}`}>
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none"
      />
      <input
        className="field pl-9 pr-8 text-sm"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
      />
      {local && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setLocal('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className = '' }) {
  return (
    <select
      className={`field-select text-sm ${className}`}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || '')}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o.replace(/_/g, ' ') : o.label;
        return (
          <option key={val} value={val}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

/** Segmented control — for small mutually exclusive filter sets. */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-sunk border border-line">
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = (value || '') === val;
        return (
          <button
            key={val || 'all'}
            type="button"
            onClick={() => onChange(val)}
            className={`px-3 h-7 text-xs font-medium rounded-md transition-colors ${
              active ? 'bg-surface-alt text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- table */

/**
 * Dense table for cross-tenant data.
 *
 * `columns` is [{ key, header, render, align, width, hide }]. Rendering is left
 * to each column so a cell can hold a pill, a link or an action without the
 * table needing to know about any of them.
 */
export function DataTable({ columns, rows, rowKey = (r) => r._id, empty = 'Nothing to show.', onRowClick }) {
  const cols = columns.filter((c) => !c.hide);

  if (!rows?.length) {
    return (
      <div className="card text-center py-12">
        <p className="text-sm muted">{empty}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-alt border border-line rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-sunk/60">
              {cols.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-mute whitespace-nowrap ${
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line/60 last:border-0 transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-surface-sunk/50' : 'hover:bg-surface-sunk/30'
                }`}
              >
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 align-middle ${
                      c.align === 'right'
                        ? 'text-right tabular-nums'
                        : c.align === 'center'
                        ? 'text-center'
                        : ''
                    } ${c.nowrap === false ? '' : 'whitespace-nowrap'}`}
                  >
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pager({ page, pages, total, onPage }) {
  if (!total) return null;
  return (
    <div className="flex items-center justify-between gap-4 mt-3">
      <p className="text-xs text-ink-mute tabular-nums">
        {total.toLocaleString('en-IN')} record{total === 1 ? '' : 's'} · page {page} of {pages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

/**
 * Confirmation for a write that other businesses will feel.
 *
 * When `requireReason` is set the confirm button stays disabled until a reason
 * is typed, because these reasons are sent verbatim to both parties — an
 * override with no explanation is worse than no override.
 */
export function ActionDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Shown to the affected businesses',
  busy,
  onConfirm,
  onClose,
  children,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const blocked = requireReason && !reason.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="h-card mb-2">{title}</h3>
        {description && <p className="text-sm muted mb-4">{description}</p>}
        {children}

        {requireReason && (
          <label className="block mt-4">
            <span className="label">{reasonLabel}</span>
            <textarea
              className="field-area text-sm"
              rows={3}
              autoFocus
              value={reason}
              placeholder={reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            disabled={blocked || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Right-hand drawer for drill-downs, so the table underneath keeps its place. */
export function Drawer({ open, title, subtitle, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="w-full max-w-3xl h-full bg-surface border-l border-line overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 bg-surface/95 backdrop-blur border-b border-line">
          <div className="min-w-0">
            <h2 className="h-section truncate">{title}</h2>
            {subtitle && <p className="text-sm muted mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="px-6 py-5 space-y-6">{children}</div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------- misc */

export function Money({ amount, className = '' }) {
  if (amount == null) return <span className="text-ink-mute">—</span>;
  return <span className={`tabular-nums ${className}`}>{inr(amount)}</span>;
}

/** Compact currency for axis ticks and dense cells. */
export const compactInr = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return `₹${v}`;
};

export function CopyId({ value, label = 'ID' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}: ${value}`}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(String(value));
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked — the title attribute still shows the value */
        }
      }}
      className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-mute hover:text-ink transition-colors"
    >
      <Copy size={10} />
      {done ? 'copied' : String(value).slice(-6)}
    </button>
  );
}

/** Two-line cell: a name over a quiet detail. Used in almost every table. */
export function Stacked({ title, detail, to }) {
  const head = to ? (
    <Link to={to} className="font-medium link-quiet hover:text-ink" onClick={(e) => e.stopPropagation()}>
      {title}
    </Link>
  ) : (
    <span className="font-medium">{title}</span>
  );
  return (
    <span className="block max-w-[26ch] truncate">
      {head}
      {detail && <span className="block text-[11px] text-ink-mute truncate">{detail}</span>}
    </span>
  );
}

export function OpenLink({ to, label = 'Open' }) {
  if (!to) return null;
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-xs link-quiet hover:text-ink"
    >
      {label}
      <ChevronRight size={12} />
    </Link>
  );
}
