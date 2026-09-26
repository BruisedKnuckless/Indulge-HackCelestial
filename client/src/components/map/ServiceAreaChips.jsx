import { useState } from 'react';
import { X, Plus, MapPin } from 'lucide-react';

const COMMON_REGIONS = [
  'Thane',
  'Mumbai',
  'Navi Mumbai',
  'Kalyan',
  'Panvel',
  'Bhiwandi',
  'Mira-Bhayandar',
  'Pune',
];

/**
 * Multi-chip service area coverage selector for Logistics Partners.
 *
 * Emits an array of strings e.g. ['Thane', 'Mumbai', 'Navi Mumbai', 'Kalyan'].
 */
export default function ServiceAreaChips({
  areas = [],
  onChange,
  disabled = false,
  label = 'Service area coverage',
}) {
  const [inputVal, setInputVal] = useState('');

  const activeAreas = Array.isArray(areas) ? areas : [];

  const addArea = (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    if (activeAreas.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      setInputVal('');
      return;
    }
    onChange?.([...activeAreas, trimmed]);
    setInputVal('');
  };

  const removeArea = (indexToRemove) => {
    if (disabled) return;
    onChange?.(activeAreas.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addArea(inputVal);
    }
  };

  const unselectedCommon = COMMON_REGIONS.filter(
    (region) => !activeAreas.some((a) => a.toLowerCase() === region.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label">
          {label} <span className="text-red-500">*</span>
        </label>
        <span className="text-[11px] text-ink-mute">
          {activeAreas.length} {activeAreas.length === 1 ? 'region' : 'regions'} covered
        </span>
      </div>

      {/* ── Active Selected Chips ── */}
      <div className="min-h-[42px] p-2 rounded-lg border border-line bg-surface flex flex-wrap gap-1.5 items-center">
        {activeAreas.length === 0 ? (
          <span className="text-xs text-ink-mute px-1">
            No service areas added yet. Add cities or dispatch regions below.
          </span>
        ) : (
          activeAreas.map((area, idx) => (
            <span
              key={`${area}-${idx}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo/10 text-indigo border border-indigo/25 shadow-2xs transition-all"
            >
              <MapPin size={11} className="text-indigo/80" />
              {area}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeArea(idx)}
                  className="hover:bg-indigo/20 rounded-full p-0.5 text-indigo ml-0.5"
                  aria-label={`Remove ${area}`}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {/* ── Add Custom Area Input ── */}
      {!disabled && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type city or operating zone (e.g. Bandra, Powai, Pune)..."
            className="field text-xs py-1.5 flex-1"
          />
          <button
            type="button"
            onClick={() => addArea(inputVal)}
            disabled={!inputVal.trim()}
            className="btn-secondary btn-sm text-xs py-1.5 px-3 flex items-center gap-1 shrink-0"
          >
            <Plus size={13} />
            Add service area
          </button>
        </div>
      )}

      {/* ── Suggested Regional Presets ── */}
      {!disabled && unselectedCommon.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] text-ink-mute mb-1 font-medium">Quick suggestions:</p>
          <div className="flex flex-wrap gap-1">
            {unselectedCommon.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => addArea(c)}
                className="text-[11px] px-2 py-0.5 rounded border border-line bg-surface-sunk text-ink-soft hover:text-ink hover:border-line-strong transition-all flex items-center gap-1"
              >
                + {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
