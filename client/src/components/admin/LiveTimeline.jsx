import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAdminLiveTimeline } from '../../hooks/queries';
import { Spinner } from '../ui';
import { inr, shortDate, timeOnly, dateTime, dateRange } from '../../lib/format';
import { CATEGORY_LABELS } from '../../lib/constants';
import { Pill, Money } from './primitives';

/**
 * Expanded body of a Live activity row: the lifecycle of the request the
 * activity belongs to, rebuilt server-side from stored records
 * (services/live-timeline.service.js). Nothing here is inferred — a stage with
 * no recorded time shows "—", and one with no record is shown as missing.
 */

const STATE_LABEL = {
  completed: 'Completed',
  current: 'In progress',
  upcoming: 'Not reached yet',
  missing: 'No record — later steps are complete',
  stopped: 'Stopped here',
};

const TAB_LABEL = {
  rfqs: 'RFQs',
  bookings: 'Bookings',
  negotiations: 'Negotiations',
  ledger: 'Ledger',
  logistics: 'Logistics',
};

function formatInfo({ value, type }) {
  if (type === 'money') return inr(value);
  if (type === 'date') return dateTime(value);
  return String(value);
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
    // Emphasis by a soft halo rather than animation — calm, but unmistakable.
    return (
      <span className={`${base} bg-surface-alt border-2 border-indigo shadow-[0_0_0_4px_rgba(99,102,241,0.16)]`}>
        <span className="w-2 h-2 rounded-full bg-indigo" />
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

const CAPITALISE = ['Urgency', 'Logistics'];

function formatFact({ label, value, type }) {
  if (type === 'money') return inr(value);
  if (type === 'range') return dateRange(value[0], value[1]);
  if (type === 'km') return `${value} km`;
  const text = String(value);
  return CAPITALISE.includes(label) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Hover card. Fixed-positioned so the timeline's horizontal scroll can't clip it. */
function StageTooltip({ stage, anchor, summary }) {
  if (!stage || !anchor) return null;
  return (
    <div
      role="tooltip"
      className="fixed z-50 w-60 -translate-x-1/2 -translate-y-full px-3 py-2.5 rounded-lg
                 bg-surface-alt border border-line text-left pointer-events-none
                 shadow-[0_8px_28px_rgba(0,0,0,0.13)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
      style={{ left: anchor.x, top: anchor.y - 8 }}
    >
      <p className="text-sm font-medium">{stage.label}</p>
      <p className="text-[11px] text-ink-mute mb-1.5">
        {stage.at ? dateTime(stage.at) : 'No recorded time'} · {STATE_LABEL[stage.state]}
      </p>
      <dl className="space-y-0.5">
        {stage.key === 'posted' || stage.key === 'requested'
          ? null
          : summary.business && (
              <div className="flex justify-between gap-3 text-xs">
                <dt className="text-ink-mute">Business</dt>
                <dd className="truncate">{summary.business}</dd>
              </div>
            )}
        {stage.info.map((row) => (
          <div key={row.label} className="flex justify-between gap-3 text-xs">
            <dt className="text-ink-mute shrink-0">{row.label}</dt>
            <dd className="truncate text-right">{formatInfo(row)}</dd>
          </div>
        ))}
      </dl>
      {stage.items?.length > 0 && <p className="text-[11px] text-indigo mt-1.5">Click for details</p>}
    </div>
  );
}

function StageDetail({ stage, onOpenTab }) {
  return (
    <div className="border border-line/70 rounded-lg bg-surface-alt">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line/60">
        <p className="text-xs font-medium">
          {stage.label}
          <span className="text-ink-mute font-normal"> · {stage.items.length} record(s)</span>
        </p>
        {stage.tab && TAB_LABEL[stage.tab] && (
          <button
            type="button"
            onClick={() => onOpenTab(stage.tab)}
            className="inline-flex items-center gap-1 text-xs link-quiet hover:text-ink"
          >
            Open in {TAB_LABEL[stage.tab]} <ArrowRight size={12} />
          </button>
        )}
      </div>
      <ul className="max-h-56 overflow-y-auto divide-y divide-line/60">
        {stage.items.map((it) => (
          <li
            key={it.id}
            className={`flex items-center gap-3 px-3 py-2 text-xs ${it.focus ? 'bg-indigo/5' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{it.title}</p>
              {it.meta && <p className="text-ink-mute truncate">{it.meta}</p>}
            </div>
            {it.score != null && <span className="text-ink-mute tabular-nums">{Math.round(it.score)} match</span>}
            {it.amount != null && <Money amount={it.amount} className="font-medium" />}
            {it.status && <Pill status={it.status} />}
            <time className="text-[11px] text-ink-mute w-24 text-right hidden sm:block" title={dateTime(it.at)}>
              {it.at ? `${shortDate(it.at)} · ${timeOnly(it.at)}` : '—'}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LiveTimeline({ kind, id }) {
  const { data, isLoading, isError } = useAdminLiveTimeline(kind, id);
  const [, setParams] = useSearchParams();
  const [hover, setHover] = useState(null); // { key, x, y }
  const [selected, setSelected] = useState(null);

  if (isLoading) {
    return (
      <div className="py-4">
        <Spinner label="Loading request timeline" />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="text-xs text-ink-mute py-2">This activity has no request lifecycle to show.</p>;
  }

  const { summary, stages, current } = data;
  const hovered = stages.find((s) => s.key === hover?.key);
  const openStage = stages.find((s) => s.key === selected && s.items?.length);

  const showTip = (stage, el) => {
    const r = el.getBoundingClientRect();
    setHover({ key: stage.key, x: r.left + r.width / 2, y: r.top });
  };

  const meta = [
    summary.category && (CATEGORY_LABELS[summary.category] || summary.category),
    summary.amount != null && inr(summary.amount),
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-mute mb-1">Request timeline</p>
          <p className="text-sm leading-snug">
            <span className="font-semibold">{summary.business || '?'}</span>
            <span className="text-ink-mute"> · </span>
            {summary.title}
          </p>
          {summary.description && (
            <p className="text-xs text-ink-mute mt-1 max-w-3xl line-clamp-2">{summary.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meta.length > 0 && <span className="text-xs text-ink-mute">{meta.join(' · ')}</span>}
          {summary.status && <Pill status={summary.status} />}
        </div>
      </div>

      {/* Request details, as stored on the record */}
      {summary.facts?.length > 0 && (
        <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-line/70 bg-surface-alt px-4 py-3">
          {summary.facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] text-ink-mute">{f.label}</dt>
              <dd className="text-sm font-medium text-ink truncate max-w-[16rem]">{formatFact(f)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Lifecycle — scrolls sideways when the screen is too narrow */}
      <div className="rounded-lg border border-line/70 bg-surface-alt">
        <div className="overflow-x-auto px-2 pt-4" onScroll={() => setHover(null)}>
          <ol className="flex min-w-max pb-2">
            {stages.map((stage, i) => {
              const reached = stage.state !== 'upcoming';
              const prevDone = i > 0 && stages[i - 1].state === 'completed';
              const clickable = stage.items?.length > 0;
              const isSelected = openStage?.key === stage.key;
              return (
                <li key={stage.key} className="relative flex-1 min-w-[112px]">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={`absolute top-3 right-1/2 w-full h-[2px] -translate-y-1/2 ${
                        prevDone && reached ? 'bg-indigo' : 'bg-line'
                      }`}
                    />
                  )}
                  <button
                    type="button"
                    // aria-disabled, not disabled: a disabled button gets no mouse
                    // events, and every stage should still show its hover card.
                    aria-disabled={!clickable}
                    onClick={() => clickable && setSelected(isSelected ? null : stage.key)}
                    onMouseEnter={(e) => showTip(stage, e.currentTarget)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => showTip(stage, e.currentTarget)}
                    onBlur={() => setHover(null)}
                    aria-pressed={clickable ? isSelected : undefined}
                    aria-label={`${stage.label}: ${STATE_LABEL[stage.state]}`}
                    className={`group relative w-full flex flex-col items-center px-1 pb-2 rounded-lg
                                transition-colors duration-150
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40
                                ${clickable ? 'cursor-pointer' : 'cursor-default'}
                                ${isSelected ? 'bg-indigo/[0.06]' : clickable ? 'hover:bg-surface-sunk/60' : ''}`}
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
                    <span className="mt-0.5 text-[11px] text-ink-mute tabular-nums text-center leading-snug min-h-[2rem]">
                      {stage.state === 'current' ? (
                        'In progress'
                      ) : !reached ? null : stage.at ? (
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

        <div className="flex items-center gap-2 border-t border-line/60 px-4 py-2.5 text-xs text-ink-soft">
          <span
            aria-hidden
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              current.state === 'stopped' ? 'bg-red-accent' : current.state === 'done' ? 'bg-green-accent' : 'bg-indigo'
            }`}
          />
          {current.state === 'done' ? 'Status' : current.state === 'stopped' ? 'Outcome' : 'Current activity'}
          <span className="font-medium text-ink">{current.text}</span>
        </div>
      </div>

      {openStage && <StageDetail stage={openStage} onOpenTab={(tab) => setParams({ tab })} />}

      <StageTooltip stage={hovered} anchor={hover} summary={summary} />
    </div>
  );
}
