import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, AlertTriangle, ArrowRight, Minus, ArrowRightLeft } from 'lucide-react';
import { useAdminLiveTimeline } from '../../hooks/queries';
import { Spinner } from '../ui';
import { inr, shortDate, timeOnly, dateTime, dateRange, relative } from '../../lib/format';
import { CATEGORY_LABELS } from '../../lib/constants';
import { Pill } from './primitives';

/**
 * Expanded body of a Live activity row: the whole story of the request the
 * activity belongs to — who asked, who quoted, every seeker and lister move in
 * the negotiation, the agreement, and what happened after.
 *
 * All of it is rebuilt server-side from stored records and the RequestEvent
 * log (services/live-timeline.service.js). Nothing is inferred here: a time
 * that was never recorded reads as such, and a stage with no record is shown
 * as missing rather than done.
 */

/* ───────────────────────────────────────────────────────────── vocabulary */

const STATE_LABEL = {
  completed: 'Completed',
  current: 'In progress',
  upcoming: 'Not reached yet',
  skipped: 'Not needed',
  missing: 'No record — later steps are complete',
  stopped: 'Stopped here',
};

const ROLE = {
  seeker: { label: 'Seeker', chip: 'badge-indigo', bar: 'border-l-indigo' },
  lister: { label: 'Lister', chip: 'badge-teal', bar: 'border-l-teal' },
  logistics: { label: 'Logistics', chip: 'badge-amber', bar: 'border-l-amber-accent' },
  inspector: { label: 'Technician', chip: 'badge-green', bar: 'border-l-green-accent' },
  platform: { label: 'Platform', chip: 'badge-muted', bar: 'border-l-line-strong' },
};

const TAB_LABEL = {
  rfqs: 'RFQs',
  bookings: 'Bookings',
  negotiations: 'Negotiations',
  ledger: 'Ledger',
  logistics: 'Logistics',
  reviews: 'Reviews',
};

const PHASE_LABEL = {
  request: 'Request',
  matching: 'Matching',
  proposals: 'Proposals',
  negotiation: 'Negotiation',
  agreement: 'Agreement',
  booking: 'Booking',
  payment: 'Payment',
  logistics: 'Logistics',
  fulfilment: 'Fulfilment',
  inspection: 'Inspection',
  return_inspection: 'Return inspection',
  review: 'Review',
};

const NEGOTIATION_STATUS = {
  in_progress: { label: 'Negotiation in progress', dot: 'bg-indigo', text: 'text-indigo' },
  completed: { label: 'Negotiation completed', dot: 'bg-green-accent', text: 'text-green-accent' },
  cancelled: { label: 'Negotiation cancelled', dot: 'bg-red-accent', text: 'text-red-accent' },
  not_started: { label: 'Negotiation not started', dot: 'bg-line-strong', text: 'text-ink-mute' },
};

const OUTCOME = {
  selected: { label: 'Selected', cls: 'badge-green' },
  not_selected: { label: 'Not selected', cls: 'badge-muted' },
  withdrawn: { label: 'Withdrawn', cls: 'badge-red' },
  awaiting: { label: 'Awaiting decision', cls: 'badge-amber' },
};

// Opening moves that start the conversation, before negotiation proper.
const OPENING = ['request_posted', 'request_created', 'proposal_submitted', 'offer_made'];

const when = (d) => (d ? `${shortDate(d)} · ${timeOnly(d)}` : 'Time not recorded');

function formatFact({ label, value, type }) {
  if (type === 'money') return inr(value);
  if (type === 'range') return dateRange(value[0], value[1]);
  if (type === 'km') return `${value} km`;
  const text = String(value);
  return ['Urgency', 'Logistics'].includes(label) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/* ─────────────────────────────────────────────────────────────── pieces */

function RoleChip({ role }) {
  const r = ROLE[role] || ROLE.platform;
  return <span className={`${r.chip} uppercase tracking-wide text-[10px] font-semibold`}>{r.label}</span>;
}

function Price({ e, className = '' }) {
  if (e.fromPrice != null && e.toPrice != null) {
    return (
      <span className={`inline-flex items-center gap-1.5 tabular-nums ${className}`}>
        <span className="text-ink-mute line-through decoration-1">{inr(e.fromPrice)}</span>
        <ArrowRight size={12} className="text-ink-mute" />
        <span className="font-semibold">{inr(e.toPrice)}</span>
      </span>
    );
  }
  const v = e.toPrice ?? e.price;
  return v != null ? <span className={`tabular-nums font-semibold ${className}`}>{inr(v)}</span> : null;
}

function Node({ state }) {
  const base = 'relative z-10 grid place-items-center w-6 h-6 rounded-full transition-transform duration-150 group-hover:scale-105';
  if (state === 'completed') {
    return (
      <span className={`${base} bg-indigo text-white`}>
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className={`${base} bg-surface-alt border-2 border-indigo shadow-[0_0_0_4px_rgba(99,102,241,0.16)]`}>
        <span className="w-2 h-2 rounded-full bg-indigo animate-pulse" />
      </span>
    );
  }
  if (state === 'skipped') {
    return (
      <span className={`${base} bg-surface-alt border-2 border-indigo/40 text-indigo/60`}>
        <Minus size={11} strokeWidth={3} />
      </span>
    );
  }
  if (state === 'missing') {
    return (
      <span className={`${base} bg-surface-alt border-2 border-dashed border-amber-accent text-amber-accent`}>
        <AlertTriangle size={10} strokeWidth={2.6} />
      </span>
    );
  }
  if (state === 'stopped') {
    return (
      <span className={`${base} bg-red-accent text-white`}>
        <X size={13} strokeWidth={3} />
      </span>
    );
  }
  return <span className={`${base} bg-surface-alt border-2 border-line`} />;
}

/** Hover card, fixed-positioned so the track's horizontal scroll can't clip it. */
function StageTooltip({ stage, anchor }) {
  if (!stage || !anchor) return null;
  return (
    <div
      role="tooltip"
      className="fixed z-50 w-56 -translate-x-1/2 -translate-y-full px-3 py-2.5 rounded-lg
                 bg-surface-alt border border-line text-left pointer-events-none
                 shadow-[0_8px_28px_rgba(0,0,0,0.13)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
      style={{ left: anchor.x, top: anchor.y - 8 }}
    >
      <p className="text-sm font-medium">{stage.label}</p>
      <p className="text-[11px] text-ink-mute">{STATE_LABEL[stage.state]}</p>
      {stage.sub && <p className="text-xs mt-1">{stage.sub}</p>}
      {stage.inspection && (
        <p className="text-xs text-ink-soft mt-1">
          {stage.inspection.technician ? `${stage.inspection.technician} · ` : ''}
          {stage.inspection.detail}
        </p>
      )}
      <p className="text-xs text-ink-soft mt-1">{stage.at ? dateTime(stage.at) : 'No recorded time'}</p>
      {stage.count > 0 && (
        <p className="text-[11px] text-indigo mt-1.5">
          {stage.count} event{stage.count === 1 ? '' : 's'} · click to view
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── the tracker */

function Tracker({ stages, current, onSelect, selectedPhase }) {
  const [hover, setHover] = useState(null);
  const hovered = stages.find((s) => s.key === hover?.key);
  const showTip = (stage, el) => {
    const r = el.getBoundingClientRect();
    setHover({ key: stage.key, x: r.left + r.width / 2, y: r.top });
  };

  return (
    <div className="rounded-lg border border-line/70 bg-surface-alt">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-mute">Request lifecycle</p>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
          <span
            aria-hidden
            className={`w-1.5 h-1.5 rounded-full ${
              current.state === 'stopped' ? 'bg-red-accent' : current.state === 'done' ? 'bg-green-accent' : 'bg-indigo'
            }`}
          />
          <span className="font-medium text-ink">{current.text}</span>
        </span>
      </div>

      <div className="overflow-x-auto px-2 pt-4" onScroll={() => setHover(null)}>
        <ol className="flex min-w-max pb-3">
          {stages.map((stage, i) => {
            const reached = stage.state !== 'upcoming';
            const prevReached = i > 0 && ['completed', 'skipped'].includes(stages[i - 1].state);
            const isSelected = selectedPhase === stage.phase;
            return (
              <li key={stage.key} className="relative flex-1 min-w-[104px]">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={`absolute top-3 right-1/2 w-full h-[2px] -translate-y-1/2 ${
                      prevReached && reached ? 'bg-indigo' : 'bg-line'
                    }`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(stage)}
                  onMouseEnter={(e) => showTip(stage, e.currentTarget)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={(e) => showTip(stage, e.currentTarget)}
                  onBlur={() => setHover(null)}
                  aria-pressed={isSelected}
                  aria-label={`${stage.label}: ${STATE_LABEL[stage.state]}`}
                  className={`group relative w-full flex flex-col items-center px-1 pb-2 rounded-lg cursor-pointer
                              transition-colors duration-150 hover:bg-surface-sunk/60
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40
                              ${isSelected ? 'bg-indigo/[0.06]' : ''}`}
                >
                  <Node state={stage.state} />
                  <span
                    className={`mt-2 text-xs text-center leading-tight ${
                      stage.state === 'current'
                        ? 'font-semibold text-indigo'
                        : stage.state === 'stopped'
                        ? 'font-medium text-red-accent'
                        : reached
                        ? 'font-medium text-ink'
                        : 'text-ink-mute'
                    }`}
                  >
                    {stage.label}
                  </span>
                  <span className="mt-0.5 text-[11px] text-center leading-snug text-ink-soft min-h-[1rem] max-w-[9rem] truncate">
                    {stage.state === 'skipped' && !stage.inspection ? 'Not needed' : stage.sub || ''}
                  </span>
                  <span className="text-[11px] text-ink-mute tabular-nums text-center leading-snug min-h-[2rem]">
                    {stage.state === 'current' ? (
                      'In progress'
                    ) : !reached || stage.state === 'skipped' ? null : stage.at ? (
                      <>
                        {shortDate(stage.at)}
                        <br />
                        {timeOnly(stage.at)}
                      </>
                    ) : (
                      'Time not recorded'
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <StageTooltip stage={hovered} anchor={hover} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── negotiation */

function EventBubble({ e, onOpenTab }) {
  const [open, setOpen] = useState(false);
  const r = ROLE[e.role] || ROLE.platform;
  const side = e.role === 'lister' ? 'md:ml-auto' : e.role === 'seeker' ? 'md:mr-auto' : 'md:mx-auto';

  return (
    <li className={`w-full md:max-w-[70%] ${side}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full text-left rounded-lg border border-line/70 border-l-4 ${r.bar} bg-surface-alt px-3.5 py-2.5
                    transition-colors hover:bg-surface-sunk/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <RoleChip role={e.role} />
            <span className="text-xs font-medium truncate">{e.actor}</span>
          </span>
          <time className="text-[11px] text-ink-mute tabular-nums shrink-0" title={e.at ? dateTime(e.at) : undefined}>
            {when(e.at)}
          </time>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-1.5">
          <span className="text-sm">{e.label}</span>
          <Price e={e} className="text-sm" />
        </div>
        {e.detail && (
          <p className={`text-xs text-ink-soft mt-1 ${open ? '' : 'line-clamp-1'}`}>
            {['message', 'counter_offer', 'quotation'].includes(e.action) ? `“${e.detail}”` : e.detail}
          </p>
        )}
      </button>
      {open && e.tab && TAB_LABEL[e.tab] && (
        <button
          type="button"
          onClick={() => onOpenTab(e.tab)}
          className="inline-flex items-center gap-1 mt-1 ml-1 text-xs link-quiet hover:text-ink"
        >
          Open in {TAB_LABEL[e.tab]} <ArrowRight size={12} />
        </button>
      )}
    </li>
  );
}

function AgreementCard({ a }) {
  const pct = a.original && a.change != null ? Math.round((a.change / a.original) * 1000) / 10 : null;
  return (
    <div className="rounded-lg border border-green-accent/30 bg-green-accent/[0.05] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-green-accent mb-2">Final agreement</p>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className="text-[11px] text-ink-mute">Opening price</dt>
          <dd className="text-sm font-medium tabular-nums">{a.original != null ? inr(a.original) : 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-mute">Agreed price</dt>
          <dd className="text-sm font-semibold tabular-nums">{a.final != null ? inr(a.final) : '—'}</dd>
        </div>
        {a.change != null && (
          <div>
            <dt className="text-[11px] text-ink-mute">Change</dt>
            <dd
              className={`text-sm font-medium tabular-nums ${
                a.change < 0 ? 'text-green-accent' : a.change > 0 ? 'text-amber-accent' : ''
              }`}
            >
              {a.change === 0
                ? 'No change'
                : `${a.change < 0 ? '−' : '+'}${inr(Math.abs(a.change))}${pct != null ? ` (${pct < 0 ? '−' : '+'}${Math.abs(pct)}%)` : ''}`}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[11px] text-ink-mute">Agreed by</dt>
          <dd className="text-sm flex flex-wrap gap-x-3">
            <span className="inline-flex items-center gap-1">
              <Check size={13} className="text-green-accent" />
              {a.seeker}
            </span>
            <span className="inline-flex items-center gap-1">
              <Check size={13} className="text-green-accent" />
              {a.lister}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-mute">Accepted</dt>
          <dd className="text-sm">
            {when(a.acceptedAt)}
            {a.acceptedBy && <span className="text-ink-mute"> · by {a.acceptedBy}</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function NegotiationPanel({ data, onOpenTab }) {
  const { negotiation, events } = data;
  const st = NEGOTIATION_STATUS[negotiation.status] || NEGOTIATION_STATUS.not_started;
  const thread = events.filter(
    (e) => OPENING.includes(e.action) || e.phase === 'negotiation' || e.phase === 'agreement'
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${st.text}`}>
          <span className={`w-2 h-2 rounded-full ${st.dot} ${negotiation.status === 'in_progress' ? 'animate-pulse' : ''}`} />
          {st.label}
        </p>
        <p className="text-xs text-ink-soft">{negotiation.text}</p>
      </div>

      {/* The two sides */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 rounded-lg bg-surface-sunk/40 px-4 py-2.5">
        <div className="min-w-0">
          <RoleChip role="seeker" />
          <p className="text-sm font-medium truncate mt-1">{negotiation.seeker || '—'}</p>
        </div>
        <ArrowRightLeft size={16} className="hidden sm:block text-ink-mute" aria-hidden />
        <div className="min-w-0 sm:text-right">
          <RoleChip role="lister" />
          <p className="text-sm font-medium truncate mt-1">
            {negotiation.listers.length ? negotiation.listers.join(', ') : 'No lister yet'}
          </p>
        </div>
      </div>

      {thread.length ? (
        <ol className="space-y-2">
          {thread.map((e) => (
            <EventBubble key={e.id} e={e} onOpenTab={onOpenTab} />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-mute py-2">No negotiation activity has been recorded for this request yet.</p>
      )}

      {negotiation.agreement && <AgreementCard a={negotiation.agreement} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── proposals */

function ProposalsPanel({ proposals, onOpenTab }) {
  if (!proposals.length) {
    return <p className="text-sm text-ink-mute py-2">No proposals or offers have been received.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-soft">
        {proposals.length} quote{proposals.length === 1 ? '' : 's'} received
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {proposals.map((p) => {
          const o = OUTCOME[p.outcome] || OUTCOME.awaiting;
          return (
            <li
              key={p.id}
              className={`rounded-lg border px-3.5 py-3 bg-surface-alt ${
                p.outcome === 'selected' ? 'border-green-accent/40' : 'border-line/70'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.lister}</p>
                  <p className="text-[11px] text-ink-mute truncate">
                    {p.kind}
                    {p.resource ? ` · ${p.resource}` : ''}
                  </p>
                </div>
                <span className={`${o.cls} shrink-0`}>{o.label}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 mt-2">
                <Price
                  e={p.initialPrice !== p.price ? { fromPrice: p.initialPrice, toPrice: p.price } : { price: p.price }}
                  className="text-base"
                />
                <span className="text-[11px] text-ink-mute tabular-nums">{when(p.at)}</span>
              </div>
              {p.revisions > 0 && (
                <p className="text-[11px] text-ink-soft mt-1">Revised {p.revisions}× during negotiation</p>
              )}
              {p.notes && <p className="text-xs text-ink-soft mt-1 line-clamp-2">{p.notes}</p>}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => onOpenTab('rfqs')}
        className="inline-flex items-center gap-1 text-xs link-quiet hover:text-ink"
      >
        Open in RFQs <ArrowRight size={12} />
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── full story */

function StoryPanel({ events, phase, onPhase, onOpenTab }) {
  const phases = [...new Set(events.map((e) => e.phase))];
  const shown = phase ? events.filter((e) => e.phase === phase) : events;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[null, ...phases].map((p) => (
          <button
            key={p || 'all'}
            type="button"
            onClick={() => onPhase(p)}
            className={`px-2.5 h-7 rounded-full text-xs border transition-colors ${
              phase === p
                ? 'bg-ink text-ink-invert border-ink'
                : 'border-line text-ink-soft hover:text-ink hover:bg-surface-sunk'
            }`}
          >
            {p ? PHASE_LABEL[p] || p : 'All'}
            <span className="ml-1 opacity-60">{p ? events.filter((e) => e.phase === p).length : events.length}</span>
          </button>
        ))}
      </div>

      {shown.length ? (
        <ol className="relative border-l border-line ml-2 space-y-3">
          {shown.map((e) => (
            <li key={e.id} className="pl-4 relative">
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-surface-alt border-2 border-indigo/60" />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <time className="text-[11px] text-ink-mute tabular-nums w-[7.5rem] shrink-0">{when(e.at)}</time>
                <RoleChip role={e.role} />
                <span className="text-xs font-medium">{e.actor}</span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 mt-0.5 sm:pl-[8rem]">
                <span className="text-sm">{e.label}</span>
                <Price e={e} className="text-sm" />
                {e.tab && TAB_LABEL[e.tab] && (
                  <button type="button" onClick={() => onOpenTab(e.tab)} className="text-[11px] link-quiet hover:text-ink">
                    {TAB_LABEL[e.tab]} →
                  </button>
                )}
              </div>
              {e.detail && <p className="text-xs text-ink-soft mt-0.5 sm:pl-[8rem] line-clamp-2">{e.detail}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-mute">Nothing recorded for this stage.</p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── the card */

export default function LiveTimeline({ kind, id }) {
  const { data, isLoading, isError } = useAdminLiveTimeline(kind, id);
  const [, setParams] = useSearchParams();
  const [tab, setTab] = useState('negotiation');
  const [phase, setPhase] = useState(null);

  if (isLoading) {
    return (
      <div className="py-4">
        <Spinner label="Loading request story" />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="text-xs text-ink-mute py-2">This activity has no request lifecycle to show.</p>;
  }

  const { summary, stages, current, negotiation, proposals, events } = data;
  const isRfq = summary.type === 'RFQ';
  const openTab = (t) => setParams({ tab: t });

  // A stage click opens the part of the story it stands for.
  const selectStage = (stage) => {
    if (stage.phase === 'negotiation' || stage.phase === 'agreement') {
      setTab('negotiation');
      setPhase(null);
    } else if (stage.phase === 'proposals' && isRfq) {
      setTab('proposals');
      setPhase(null);
    } else {
      setTab('story');
      setPhase(stage.phase === 'request' ? null : stage.phase);
    }
  };

  const tabs = [
    { key: 'negotiation', label: 'Negotiation', count: negotiation.count },
    ...(isRfq ? [{ key: 'proposals', label: 'Proposals', count: proposals.length }] : []),
    { key: 'story', label: 'Full story', count: events.length },
  ];
  const selectedPhase = tab === 'story' ? phase : tab;

  return (
    <div className="space-y-3">
      {/* ── Request summary ── */}
      <div className="rounded-lg border border-line/70 bg-surface-alt">
        <div className="px-4 pt-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-ink-mute">{summary.ref}</span>
              <span className="badge-muted">{summary.type}</span>
              {summary.status && <Pill status={summary.status} />}
            </div>
            <p className="text-[11px] text-ink-mute">
              Created {when(summary.createdAt)}
              {summary.lastActivityAt && (
                <>
                  {' · '}Last activity{' '}
                  <span title={dateTime(summary.lastActivityAt)}>{relative(summary.lastActivityAt)}</span>
                </>
              )}
            </p>
          </div>
          <p className="text-sm leading-snug mt-2">
            <span className="font-semibold">{summary.business || '?'}</span>
            <span className="text-ink-mute"> · </span>
            {summary.title}
          </p>
          {summary.description && (
            <p className="text-xs text-ink-mute mt-1 max-w-3xl line-clamp-2">{summary.description}</p>
          )}
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t border-line/60 px-4 py-3">
          {summary.category && (
            <div>
              <dt className="text-[11px] text-ink-mute">Category</dt>
              <dd className="text-sm font-medium">{CATEGORY_LABELS[summary.category] || summary.category}</dd>
            </div>
          )}
          {(summary.facts || []).map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] text-ink-mute">{f.label}</dt>
              <dd className="text-sm font-medium text-ink truncate max-w-[16rem]">{formatFact(f)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Lifecycle ── */}
      <Tracker stages={stages} current={current} onSelect={selectStage} selectedPhase={selectedPhase} />

      {/* ── Negotiation / activity ── */}
      <div className="rounded-lg border border-line/70 bg-surface-alt">
        <div role="tablist" className="flex gap-0.5 border-b border-line/60 px-2 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key);
                setPhase(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 h-10 text-sm -mb-px border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key ? 'border-indigo text-ink font-medium' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {t.label}
              <span className="text-[11px] text-ink-mute tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'negotiation' && <NegotiationPanel data={data} onOpenTab={openTab} />}
          {tab === 'proposals' && <ProposalsPanel proposals={proposals} onOpenTab={openTab} />}
          {tab === 'story' && <StoryPanel events={events} phase={phase} onPhase={setPhase} onOpenTab={openTab} />}
        </div>
      </div>
    </div>
  );
}
