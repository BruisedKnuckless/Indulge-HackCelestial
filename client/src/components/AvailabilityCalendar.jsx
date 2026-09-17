import { useState, useMemo } from 'react';
import { useAvailability } from '../hooks/queries';
import { Spinner } from './ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Month grid shaded by how much of each day is already committed. Colour is
 * derived from the reserved ratio, so a partly-booked multi-unit resource reads
 * differently from one that is fully gone.
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

  const byDate = useMemo(
    () => Object.fromEntries((data?.days || []).map((d) => [d.date, d])),
    [data]
  );

  const leadingBlanks = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const cellStyle = (day) => {
    if (!day) return 'bg-surface-sunk text-ink-mute';
    const ratio = day.totalQuantity ? day.reservedQuantity / day.totalQuantity : 0;
    if (ratio === 0) return 'bg-success/10 text-ink border-success/30';
    if (ratio >= 1) return 'bg-danger/10 text-danger border-danger/30';
    return 'bg-warn/10 text-ink border-warn/30';
  };

  return (
    <div className="border border-line rounded p-4 max-w-[560px]">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOffset((o) => o - 1)}
          disabled={offset <= 0}
          className="btn-secondary px-2 py-1 disabled:opacity-40"
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className="text-base font-bold">
          {MONTHS[monthStart.getMonth()]} {monthStart.getFullYear()}
        </h3>
        <button
          onClick={() => setOffset((o) => o + 1)}
          disabled={offset >= 5}
          className="btn-secondary px-2 py-1 disabled:opacity-40"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Loading availability" />
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
                  className={`aspect-square rounded border text-center py-1 ${cellStyle(day)} ${
                    iso === today ? 'ring-2 ring-ink' : ''
                  }`}
                  title={
                    day
                      ? `${day.availableQuantity} of ${day.totalQuantity} available`
                      : 'No data'
                  }
                >
                  <div className="text-xs font-bold leading-none">{dayNum}</div>
                  {day && day.totalQuantity > 1 && (
                    <div className="text-[9px] leading-tight mt-0.5">{day.availableQuantity}</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 mt-3 text-xs text-ink-soft">
            {[
              ['bg-success/10 border-success/30', 'Fully available'],
              ['bg-warn/10 border-warn/30', 'Partly booked'],
              ['bg-danger/10 border-danger/30', 'Fully booked'],
            ].map(([cls, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm border ${cls}`} />
                {label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
