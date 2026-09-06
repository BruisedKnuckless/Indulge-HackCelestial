import { useState } from 'react';
import { Star, Check } from 'lucide-react';
import { FACTOR_LABELS, FACTOR_WEIGHTS } from '../lib/constants';

/**
 * Renders why a resource ranked where it did.
 *
 * Explains match factors with clear percentage bars and human-readable reasons,
 * making recommendations auditable and transparent.
 */
export default function MatchBreakdown({ score, breakdown, reasons = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!breakdown) return null;
  const pct = Math.round((score || 0) * 100);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs link-quiet inline-flex items-center gap-1.5 font-medium hover:text-ink transition-colors"
        aria-expanded={open}
      >
        <span>Why this match?</span>
        <span className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-2.5 border border-line bg-surface rounded-lg p-4 max-w-[440px] shadow-sm text-ink">
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-mute">Match Score</span>
            <span className={`text-xl font-bold tracking-tight ${
              pct >= 90 ? 'text-success' : pct >= 75 ? 'text-accent' : 'text-ink'
            }`}>
              {pct}%
            </span>
          </div>

          <div className="space-y-2">
            {Object.entries(FACTOR_LABELS).map(([key, label]) => {
              if (breakdown[key] === undefined && key === 'typeFit') return null;
              const v = breakdown[key] ?? 0;
              const barPct = Math.round(v * 100);
              const weight = FACTOR_WEIGHTS[key];

              return (
                <div key={key} className="flex items-center gap-2.5 text-xs">
                  <span className="w-[88px] shrink-0 text-ink-soft truncate">{label}</span>
                  <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        v >= 0.8 ? 'bg-success' : v >= 0.5 ? 'bg-accent' : 'bg-warn'
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-ink font-medium">{barPct}%</span>
                  {weight && (
                    <span className="w-8 text-right text-[10px] text-ink-mute tabular-nums">
                      {weight}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {Boolean(breakdown.preferenceBonus) && (
            <p className="text-xs text-success mt-2.5 flex items-center gap-1.5 font-medium">
              <Star size={12} className="fill-success text-success shrink-0" />
              <span>+5% preferred provider bonus</span>
            </p>
          )}

          {reasons.length > 0 && (
            <div className="border-t border-line mt-3 pt-3">
              <p className="text-[10px] uppercase font-semibold text-ink-mute tracking-wider mb-1.5">
                Key Match Factors
              </p>
              <ul className="space-y-1">
                {reasons.map((r, i) => {
                  const isNegative =
                    r.includes('above') ||
                    r.includes('Unavailable') ||
                    r.includes('Further away') ||
                    r.includes('Priced above') ||
                    r.includes('larger than');

                  return (
                    <li
                      key={i}
                      className={`text-xs flex items-start gap-2 leading-relaxed ${
                        isNegative ? 'text-ink-soft' : 'text-ink'
                      }`}
                    >
                      <span className={`shrink-0 ${isNegative ? 'text-warn' : 'text-success'} mt-0.5`}>
                        {isNegative ? (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn" />
                        ) : (
                          <Check size={12} strokeWidth={2.5} />
                        )}
                      </span>
                      <span>{r}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
