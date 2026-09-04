import { useState } from 'react';
import { FACTOR_LABELS, FACTOR_WEIGHTS } from '../lib/constants';

/**
 * Renders why a resource ranked where it did.
 *
 * The ranking is a weighted sum of five 0-1 factors, so showing each factor's
 * bar next to its weight makes the whole score reconstructable by eye — the
 * point being that the recommendation is auditable, not a black box.
 */
export default function MatchBreakdown({ score, breakdown, reasons = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!breakdown) return null;
  const pct = Math.round((score || 0) * 100);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm link-quiet inline-flex items-center gap-1.5"
        aria-expanded={open}
      >
        Why this match?
        <span className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-3 border border-line rounded p-5 max-w-[440px]">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-sm muted">Overall match</span>
            <span className="text-2xl font-semibold tracking-tight">{pct}%</span>
          </div>

          <div className="space-y-2.5">
            {Object.entries(FACTOR_LABELS).map(([key, label]) => {
              const v = breakdown[key] ?? 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-[84px] shrink-0 text-xs muted">{label}</span>
                  <div className="flex-1 h-[3px] bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ink rounded-full transition-all"
                      style={{ width: `${Math.round(v * 100)}%` }}
                    />
                  </div>
                  <span className="w-7 text-right text-xs tabular-nums">{Math.round(v * 100)}</span>
                  <span className="w-9 text-right text-xs text-ink-mute tabular-nums">
                    ×{FACTOR_WEIGHTS[key]}%
                  </span>
                </div>
              );
            })}
          </div>

          {Boolean(breakdown.preferenceBonus) && (
            <p className="text-xs text-success mt-3">+5% preferred-provider bonus applied</p>
          )}

          {reasons.length > 0 && (
            <ul className="border-t border-line mt-4 pt-4 space-y-1.5">
              {reasons.map((r) => (
                <li key={r} className="text-xs muted">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
