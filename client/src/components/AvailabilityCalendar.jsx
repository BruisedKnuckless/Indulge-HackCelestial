import { useState, useMemo } from 'react';
import { useAvailability } from '../hooks/queries';
import { Spinner } from './ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Month grid shaded by availability status and quantity allocations.
 *
 * Provider view distinguishes:
 * - Available (green)
 * - Partially booked (amber)
 * - Fully booked (red)
 * - Owner blocked (indigo)
 * - Maintenance (amber/orange)
 * - Unavailable / outside policy (muted)
 *
 * Seeker view cleanly protects operational privacy:
 * - Available (green)
 * - Limited availability (amber)
 * - Unavailable (muted/red)
 */
export default function AvailabilityCalendar({ resourceId }) {
  const [offset, setOffset] = useState(0);

  const { monthStart, monthEnd } = useMemo(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const e = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return { monthStart: s, monthEnd: e };
  }, [offset]);

  const { data, isLoading } = useAvailability(
    resourceId,
    monthStart.toISOString(),
    monthEnd.toISOString()
  );

  const isOwner = Boolean(data?.isOwner);

  const byDate = useMemo(
    () => Object.fromEntries((data?.days || []).map((d) => [d.date, d])),
    [data]
  );

  const leadingBlanks = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const cellStyle = (day) => {
    if (!day) return 'bg-surface-sunk text-ink-mute border-line/40';

    if (isOwner) {
      if (day.status === 'maintenance') {
        return 'bg-amber-accent/20 text-amber-accent border-amber-accent/40 font-semibold';
      }
      if (day.status === 'owner_blocked') {
        return 'bg-indigo/20 text-indigo border-indigo/40 font-semibold';
      }
      if (day.status === 'unavailable') {
        return 'bg-surface-sunk text-ink-mute border-line/50 opacity-60';
      }
    }

    if (day.availableQuantity === 0) {
      return 'bg-danger/10 text-danger border-danger/30';
    }

    const ratio = day.totalQuantity ? day.reservedQuantity / day.totalQuantity : 0;
    if (ratio === 0) {
      return 'bg-success/10 text-ink border-success/30';
    }
    return 'bg-warn/10 text-ink border-warn/30';
  };

  const cellTooltip = (day) => {
    if (!day) return 'No data';

    if (isOwner) {
      if (day.status === 'maintenance') {
        const reasons = day.blocks?.map((b) => b.reason).filter(Boolean).join(', ');
        return `Maintenance${reasons ? `: ${reasons}` : ''}`;
      }
      if (day.status === 'owner_blocked') {
        const reasons = day.blocks?.map((b) => b.reason || b.type).filter(Boolean).join(', ');
        return `Owner Blocked${reasons ? `: ${reasons}` : ''}`;
      }
      if (day.status === 'unavailable') {
        return 'Outside declared operating policy';
      }
      if (day.availableQuantity === 0) {
        return `Fully booked (${day.totalQuantity} of ${day.totalQuantity} reserved)`;
      }
      if (day.reservedQuantity > 0) {
        return `Partially booked: ${day.availableQuantity} of ${day.totalQuantity} free`;
      }
      return `Fully available (${day.totalQuantity} units)`;
    }

    // Seeker public view (sanitized)
    if (day.availableQuantity === 0) {
      return 'Unavailable for this date';
    }
    return `${day.availableQuantity} of ${day.totalQuantity} available`;
  };

  return (
    <div className="border border-line rounded-xl p-4 max-w-[560px] bg-surface-alt/40">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOffset((o) => o - 1)}
          disabled={offset <= 0}
          className="btn-secondary px-2.5 py-1 text-sm disabled:opacity-40"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="text-center">
          <h3 className="text-base font-bold text-ink">
            {MONTHS[monthStart.getMonth()]} {monthStart.getFullYear()}
          </h3>
          {isOwner && data?.mode && (
            <span className="text-[11px] text-ink-mute uppercase tracking-wider font-mono">
              Policy: {data.mode}
            </span>
          )}
        </div>
        <button
          onClick={() => setOffset((o) => o + 1)}
          disabled={offset >= 5}
          className="btn-secondary px-2.5 py-1 text-sm disabled:opacity-40"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Loading availability calendar" />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-xs text-ink-soft font-bold py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
              const iso = new Date(
                Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), dayNum)
              )
                .toISOString()
                .slice(0, 10);
              const day = byDate[iso];

              return (
                <div
                  key={iso}
                  className={`aspect-square rounded-lg border text-center py-1 transition-colors flex flex-col justify-center items-center ${cellStyle(
                    day
                  )} ${iso === today ? 'ring-2 ring-indigo ring-offset-1 dark:ring-offset-surface' : ''}`}
                  title={cellTooltip(day)}
                >
                  <div className="text-xs font-bold leading-none">{dayNum}</div>
                  {day && day.totalQuantity > 1 && day.availableQuantity > 0 && (
                    <div className="text-[9px] leading-tight mt-0.5 font-medium opacity-90">
                      {day.availableQuantity}
                    </div>
                  )}
                  {isOwner && day?.status === 'maintenance' && (
                    <div className="text-[8px] uppercase tracking-tighter font-mono font-bold mt-0.5 leading-none">
                      Mnt
                    </div>
                  )}
                  {isOwner && day?.status === 'owner_blocked' && (
                    <div className="text-[8px] uppercase tracking-tighter font-mono font-bold mt-0.5 leading-none">
                      Blk
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Dynamic Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-line/60 text-xs text-ink-soft">
            {isOwner ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-success/15 border-success/40" />
                  Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-warn/15 border-warn/40" />
                  Partly Booked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-danger/15 border-danger/40" />
                  Fully Booked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-indigo/25 border-indigo/50" />
                  Owner Blocked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-amber-accent/25 border-amber-accent/50" />
                  Maintenance
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-success/15 border-success/40" />
                  Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-warn/15 border-warn/40" />
                  Limited Availability
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border bg-danger/15 border-danger/40" />
                  Unavailable
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
