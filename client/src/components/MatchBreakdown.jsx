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
    <div className="text-base">
      <button
        onClick={() => setOpen((v) => !v)}
        className="a-link text-base inline-flex items-center gap-1"
        aria-expanded={open}
      >
        Why this match?
        <span className={`transition-transform text-[10px] ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="mt-2 border border-bd rounded p-3 bg-[#FAFAFA] max-w-[420px]">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-bold">Overall match</span>
            <span className="text-title font-bold text-deal">{pct}%</span>
          </div>

          <div className="space-y-1.5 mb-3">
            {Object.entries(FACTOR_LABELS).map(([key, label]) => {
              const v = breakdown[key] ?? 0;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-[86px] shrink-0 text-mini text-ink-soft">{label}</span>
                  <div className="flex-1 h-[10px] bg-[#E7E9E9] rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-star rounded-sm transition-all"
                      style={{ width: `${Math.round(v * 100)}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-mini tabular-nums">
                    {Math.round(v * 100)}
                  </span>
                  <span className="w-9 text-right text-micro text-ink-mute tabular-nums">
                    ×{FACTOR_WEIGHTS[key]}%
                  </span>
                </div>
              );
            })}
          </div>

          {Boolean(breakdown.preferenceBonus) && (
            <p className="text-mini text-success mb-2">
              +5% preferred-provider bonus applied
            </p>
          )}

          {reasons.length > 0 && (
            <ul className="border-t border-bd pt-2 space-y-0.5">
              {reasons.map((r) => (
                <li key={r} className="text-mini text-ink-soft flex gap-1.5">
                  <span className="text-success shrink-0">✓</span>
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
