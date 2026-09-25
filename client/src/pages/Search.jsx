import { useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearch, useCartMutations, useMyRequirements } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import ResourceCard from '../components/ResourceCard';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { toLocalInput, defaultWindow, dateRange } from '../lib/format';

/* ── Constants ──────────────────────────────────────────────────────────── */

const RADII = [5, 10, 25, 50, 100];
const RATINGS = [3, 3.5, 4, 4.5];

const SORTS = [
  ['', 'Best match'],
  ['price_asc', 'Price ↑'],
  ['price_desc', 'Price ↓'],
  ['distance', 'Nearest'],
  ['rating', 'Top rated'],
];

/** Params that count as active filters (not search query, not sort). */
const FILTER_KEYS = [
  'category', 'start', 'end', 'radiusKm',
  'minPrice', 'maxPrice', 'quantity', 'minCapacity', 'minRating',
];

/** Human-readable label for each active filter chip. */
function filterLabel(key, value) {
  if (key === 'category')    return CATEGORY_LABELS[value] || value;
  if (key === 'radiusKm')    return `≤ ${value} km`;
  if (key === 'minPrice')    return `Min ₹${value}`;
  if (key === 'maxPrice')    return `Max ₹${value}`;
  if (key === 'quantity')    return `Qty ${value}`;
  if (key === 'minCapacity') return `Cap ≥ ${value}`;
  if (key === 'minRating')   return `${value}+ Stars`;
  if (key === 'start')       return `From ${new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  if (key === 'end')         return `Until ${new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  return `${key}: ${value}`;
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

/** Labelled filter section inside the rail or drawer. */
function FilterGroup({ label, children }) {
  return (
    <div className="py-4 border-b border-line last:border-0">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-mute mb-3">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Pill toggle — used for radius and rating. */
function PillToggle({ value, active, onClick, children }) {
  return (
    <button
      onClick={() => onClick(active ? null : value)}
      className={[
        'h-7 px-3 text-xs rounded-full border transition-all duration-200 whitespace-nowrap',
        active
          ? 'bg-indigo border-indigo text-white shadow-xs'
          : 'border-line-strong text-ink-soft hover:border-indigo/40 hover:text-ink hover:bg-indigo/5 dark:hover:bg-indigo/10',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/** View-mode toggle icons. */
function ViewToggle({ grid, onToggle }) {
  return (
    <div className="flex items-center gap-0.5 border border-line rounded-lg p-0.5 bg-surface-alt">
      {[
        {
          key: 'grid',
          title: 'Grid view',
          active: grid,
          path: 'M3 3h7v7H3zm0 10h7v7H3zm10-10h7v7h-7zm0 10h7v7h-7z',
        },
        {
          key: 'list',
          title: 'List view',
          active: !grid,
          path: 'M4 6h16M4 10h16M4 14h16M4 18h16',
          stroke: true,
        },
      ].map(({ key, title, active, path, stroke }) => (
        <button
          key={key}
          title={title}
          onClick={() => onToggle(key === 'grid')}
          className={[
            'w-7 h-7 rounded-md grid place-items-center transition-all duration-200',
            active ? 'bg-indigo text-white shadow-xs' : 'text-ink-soft hover:text-ink hover:bg-indigo/10',
          ].join(' ')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={stroke ? 'none' : 'currentColor'}
               stroke={stroke ? 'currentColor' : 'none'} strokeWidth="2" strokeLinecap="round">
            <path d={path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/* ── Filter panel (shared between rail and mobile drawer) ─────────────────  */
function FilterPanel({ params, patch, onClearAll }) {
  const category   = params.get('category') || 'all';
  const radiusKm   = params.get('radiusKm');
  const minRating  = params.get('minRating');

  return (
    <div>
      {/* RESOURCE */}
      <FilterGroup label="Resource">
        <select
          value={category}
          onChange={(e) => patch({ category: e.target.value })}
          className="field-select w-full text-sm"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </FilterGroup>

      {/* AVAILABILITY */}
      <FilterGroup label="Availability">
        <div className="space-y-2">
          <label className="label">From</label>
          <input
            type="datetime-local"
            aria-label="Availability from"
            value={params.get('start') ? toLocalInput(params.get('start')) : ''}
            onChange={(e) =>
              patch({ start: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
            className="field text-sm"
          />
          <label className="label mt-2">Until</label>
          <input
            type="datetime-local"
            aria-label="Availability until"
            value={params.get('end') ? toLocalInput(params.get('end')) : ''}
            onChange={(e) =>
              patch({ end: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
            className="field text-sm"
          />
        </div>
      </FilterGroup>

      {/* LOCATION */}
      <FilterGroup label="Location">
        <p className="text-xs text-ink-mute mb-2">Max distance</p>
        <div className="flex flex-wrap gap-1.5">
          {RADII.map((r) => (
            <PillToggle
              key={r}
              value={String(r)}
              active={radiusKm === String(r)}
              onClick={(v) => patch({ radiusKm: v })}
            >
              {r} km
            </PillToggle>
          ))}
        </div>
      </FilterGroup>

      {/* COMMERCIAL */}
      <FilterGroup label="Price">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Min (₹)</label>
            <input
              type="number"
              min="0"
              placeholder="Any"
              value={params.get('minPrice') || ''}
              onChange={(e) => patch({ minPrice: e.target.value })}
              className="field text-sm"
            />
          </div>
          <div>
            <label className="label">Max (₹)</label>
            <input
              type="number"
              min="0"
              placeholder="Any"
              value={params.get('maxPrice') || ''}
              onChange={(e) => patch({ maxPrice: e.target.value })}
              className="field text-sm"
            />
          </div>
        </div>
      </FilterGroup>

      {/* CAPACITY / QUANTITY */}
      <FilterGroup label="Capacity &amp; Quantity">
        <div className="space-y-2">
          <div>
            <label className="label">Quantity needed</label>
            <input
              type="number"
              min="1"
              placeholder="1"
              value={params.get('quantity') || ''}
              onChange={(e) => patch({ quantity: e.target.value })}
              className="field text-sm"
            />
          </div>
          <div>
            <label className="label">Min. guest capacity</label>
            <input
              type="number"
              min="0"
              placeholder="Any"
              value={params.get('minCapacity') || ''}
              onChange={(e) => patch({ minCapacity: e.target.value })}
              className="field text-sm"
            />
          </div>
        </div>
      </FilterGroup>

      {/* QUALITY */}
      <FilterGroup label="Rating">
        <div className="flex flex-wrap gap-1.5">
          {RATINGS.map((r) => (
            <PillToggle
              key={r}
              value={String(r)}
              active={minRating === String(r)}
              onClick={(v) => patch({ minRating: v })}
            >
              <span className="inline-flex items-center gap-1">
                <Star size={11} className="fill-current" />
                <span>{r}+</span>
              </span>
            </PillToggle>
          ))}
        </div>
      </FilterGroup>

      {/* Clear all */}
      {onClearAll && (
        <div className="pt-4">
          <button onClick={onClearAll} className="btn-secondary btn-sm w-full justify-center">
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Smart Requirement Match Bar ────────────────────────────────────────── */
function RequirementMatchBar({
  user,
  activeReq,
  activeRequirements,
  isMatchCleared,
  onSelectRequirement,
  onClearMatching,
  onResumeMatching,
}) {
  if (!user) {
    return (
      <div className="mb-8 p-4 rounded-xl border border-line bg-surface-alt flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs text-ink-soft">
          <span className="font-semibold text-ink">B2B Smart Matching</span>
          {' '}— Sign in and post a requirement to unlock personalized match scores across listings.
        </div>
        <Link to="/login" className="btn-secondary btn-sm text-xs shrink-0">
          Sign in →
        </Link>
      </div>
    );
  }

  if (activeReq) {
    return (
      <div className="mb-8 p-5 rounded-xl border border-accent/40 bg-surface-alt shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold bg-accent/15 text-accent border border-accent/30">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Smart Match Active
              </span>
              <span className="text-base font-semibold text-ink truncate">{activeReq.title}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs text-ink-soft">
              <span className="inline-flex items-center h-5 px-2 rounded-full border border-line text-[11px] bg-surface-sunk">
                {CATEGORY_LABELS[activeReq.category] || activeReq.category}
              </span>
              <span>•</span>
              <span>Qty: {activeReq.quantity}</span>
              {activeReq.maxPrice && (
                <>
                  <span>•</span>
                  <span>Budget: ≤ ₹{activeReq.maxPrice.toLocaleString('en-IN')}</span>
                </>
              )}
              {activeReq.minCapacity && (
                <>
                  <span>•</span>
                  <span>Min cap: {activeReq.minCapacity}</span>
                </>
              )}
              <span>•</span>
              <span>Radius: ≤ {activeReq.radiusKm || 25} km</span>
              <span>•</span>
              <span>{dateRange(activeReq.startDateTime, activeReq.endDateTime)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center flex-wrap">
            {activeRequirements.length > 1 && (
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span className="hidden sm:inline">Match requirement:</span>
                <select
                  value={activeReq._id}
                  onChange={(e) => onSelectRequirement(e.target.value)}
                  className="field-select text-xs h-8 pl-2 pr-6 max-w-[200px] truncate"
                >
                  {activeRequirements.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              onClick={onClearMatching}
              className="btn-secondary btn-sm text-xs"
              title="Browse all resources without requirement matching"
            >
              Clear match
            </button>

            <Link
              to={`/requirements/${activeReq._id}`}
              className="btn-ghost btn-sm text-xs"
            >
              Requirement details →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isMatchCleared && activeRequirements.length > 0) {
    return (
      <div className="mb-8 p-4 rounded-xl border border-line bg-surface-alt flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-ink-soft">
          Personalized smart matching is currently paused. You are browsing all marketplace listings.
        </p>
        <button
          onClick={() => onResumeMatching(activeRequirements[0]._id)}
          className="btn-secondary btn-sm text-xs font-medium"
        >
          Resume match with: {activeRequirements[0].title} →
        </button>
      </div>
    );
  }

  return (
    <div className="mb-8 p-4 rounded-xl border border-line bg-surface-sunk flex items-center justify-between gap-4 flex-wrap">
      <div className="text-xs text-ink-soft">
        <span className="font-semibold text-ink">Personalized Smart Matching</span>
        {' '}— Post your event needs to unlock real-time match scoring on dates, budget, and distance.
      </div>
      <Link to="/requirements/new" className="btn-secondary btn-sm text-xs shrink-0">
        Post a requirement →
      </Link>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Search page
   ════════════════════════════════════════════════════════════════════════ */
export default function Search() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { add } = useCartMutations();
  const [addingId, setAddingId]   = useState(null);
  const [gridView, setGridView]   = useState(() => {
    const saved = localStorage.getItem('indulge_view_mode');
    return saved !== null ? saved === 'grid' : true;
  });
  const [drawerOpen, setDrawer]   = useState(false);

  const handleToggleView = useCallback((grid) => {
    setGridView(grid);
    localStorage.setItem('indulge_view_mode', grid ? 'grid' : 'list');
  }, []);

  const { data: reqData } = useMyRequirements();
  const activeRequirements = useMemo(
    () => (reqData?.requirements || []).filter((r) => r.status === 'open'),
    [reqData]
  );
  const requirementIdParam = params.get('requirementId');

  const [matchCleared, setMatchCleared] = useState(
    () => sessionStorage.getItem('indulge_match_cleared') === 'true'
  );

  useEffect(() => {
    if (requirementIdParam && requirementIdParam !== 'none') {
      sessionStorage.removeItem('indulge_match_cleared');
      setMatchCleared(false);
    }
  }, [requirementIdParam]);

  const activeReq = useMemo(() => {
    if (!user || activeRequirements.length === 0 || matchCleared || requirementIdParam === 'none') {
      return null;
    }
    if (requirementIdParam && requirementIdParam !== 'none') {
      return activeRequirements.find((r) => r._id === requirementIdParam) || activeRequirements[0];
    }
    return activeRequirements[0];
  }, [user, activeRequirements, requirementIdParam, matchCleared]);

  /* URL is source of truth — results/share/back-button all work. */
  const patch = useCallback(
    (updates) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '' || v === 'all') next.delete(k);
        else next.set(k, v);
      }
      setParams(next);
    },
    [params, setParams]
  );

  const handleClearMatching = useCallback(() => {
    sessionStorage.setItem('indulge_match_cleared', 'true');
    setMatchCleared(true);
    patch({ requirementId: null });
  }, [patch]);

  const handleResumeMatching = useCallback((id) => {
    sessionStorage.removeItem('indulge_match_cleared');
    setMatchCleared(false);
    patch({ requirementId: id || activeRequirements[0]?._id });
  }, [activeRequirements, patch]);

  const handleSelectRequirement = useCallback((id) => {
    sessionStorage.removeItem('indulge_match_cleared');
    setMatchCleared(false);
    patch({ requirementId: id });
  }, [patch]);

  const query = useMemo(() => {
    const o = Object.fromEntries(params.entries());
    // Strip requirementId so it is never sent unless activeReq is active
    delete o.requirementId;

    if (activeReq) {
      return { ...o, requirementId: activeReq._id, limit: 40 };
    }
    return { ...o, limit: 40 };
  }, [params, activeReq]);

  const { data, isLoading } = useSearch(query);
  const results  = data?.results || [];
  const criteria = data?.criteria;

  const q            = params.get('q');
  const category     = params.get('category') || 'all';
  const activeFilters = FILTER_KEYS
    .map((k) => ({ key: k, value: params.get(k) }))
    .filter(({ value }) => value && value !== 'all');

  const clearAll = useCallback(() => {
    const next = {};
    if (q) next.q = q;
    if (activeReq) next.requirementId = activeReq._id;
    setParams(next);
  }, [q, activeReq, setParams]);

  const addToCart = async (resource) => {
    if (!user) {
      toast.error('Sign in to build a request cart.');
      return;
    }
    if (user.userType === 'logistics_partner') {
      toast.error('Logistics partners cannot add marketplace resources to cart.');
      return;
    }
    const start = params.get('start') || defaultWindow().start.toISOString();
    const end   = params.get('end')   || defaultWindow().end.toISOString();
    setAddingId(resource._id);
    try {
      await add.mutateAsync({
        resourceId: resource._id,
        quantity: Number(params.get('quantity')) || 1,
        startDateTime: start,
        endDateTime: end,
      });
      toast.success('Added to your request cart');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add to cart.'));
    } finally {
      setAddingId(null);
    }
  };

  /* ── Page title ─────────────────────────────────────────────────────── */
  const pageTitle = q
    ? `"${q}"`
    : activeReq
    ? `Smart Matches for "${activeReq.title}"`
    : category !== 'all'
    ? CATEGORY_LABELS[category]
    : 'Browse Resources';

  return (
    <div className="shell pt-10 pb-20">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <header className="mb-6">
        <h1 className="h-page">{pageTitle}</h1>
        <p className="text-sm text-ink-soft mt-1.5">
          {isLoading
            ? 'Searching…'
            : `${results.length} resource${results.length === 1 ? '' : 's'} available${
                criteria?.start ? ' for your dates' : ''
              }`}
        </p>
      </header>

      {/* ── Requirement match banner ─────────────────────────────────── */}
      <RequirementMatchBar
        user={user}
        activeReq={activeReq}
        activeRequirements={activeRequirements}
        isMatchCleared={Boolean(matchCleared || requirementIdParam === 'none')}
        onSelectRequirement={handleSelectRequirement}
        onClearMatching={handleClearMatching}
        onResumeMatching={handleResumeMatching}
      />

      {/* ── Active filter chips ──────────────────────────────────────── */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {activeFilters.map(({ key, value }) => (
            <button
              key={key}
              onClick={() => patch({ [key]: null })}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full
                         bg-ink text-ink-invert text-xs font-medium
                         hover:bg-indigo hover:text-white transition-all duration-200 shadow-xs"
            >
              {filterLabel(key, value)}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M8 2L2 8M2 2l6 6" stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" fill="none" />
              </svg>
            </button>
          ))}
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 h-7 px-3 rounded-full
                       border border-line-strong text-xs text-ink-soft hover:text-red-accent
                       hover:border-red-accent/40 hover:bg-red-accent/5 transition-all duration-200"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-10">

        {/* ── Desktop filter rail ─────────────────────────────────── */}
        <aside className="hidden lg:block w-[220px] shrink-0">
          <div className="sticky top-20">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Filters</h2>
              {activeFilters.length > 0 && (
                <button onClick={clearAll} className="text-xs link-quiet">
                  Clear all
                </button>
              )}
            </div>
            <FilterPanel params={params} patch={patch} />
          </div>
        </aside>

        {/* ── Results column ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Toolbar: sort + view toggle + mobile filter button */}
          <div className="flex items-center justify-between gap-3 pb-4 mb-6 border-b border-line">
            {/* Mobile: filter trigger */}
            <button
              onClick={() => setDrawer(true)}
              className="lg:hidden btn-secondary btn-sm gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M7 12h10M11 18h2" />
              </svg>
              Filters
              {activeFilters.length > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full
                                 bg-ink text-ink-invert text-[10px] font-bold">
                  {activeFilters.length}
                </span>
              )}
            </button>

            <span className="hidden lg:block text-sm text-ink-soft">
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>

            <div className="flex items-center gap-3 ml-auto">
              {/* Sort */}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-soft hidden sm:inline">Sort</span>
                <select
                  value={params.get('sort') || ''}
                  onChange={(e) => patch({ sort: e.target.value })}
                  className="field-select text-sm h-8 pl-2 pr-7"
                >
                  {SORTS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>

              {/* View toggle — desktop only */}
              <div className="hidden sm:block">
                <ViewToggle grid={gridView} onToggle={handleToggleView} />
              </div>
            </div>
          </div>

          {/* Results */}
          {isLoading ? (
            <Spinner label="Searching" />
          ) : results.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              message="Try widening the distance, relaxing the budget, or shifting the dates."
              action={
                <button onClick={clearAll} className="btn-secondary">
                  Clear filters
                </button>
              }
            />
          ) : gridView ? (
            /* ── Grid layout ──────────────────────────────────────── */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {results.map((r) => (
                <ResourceCard
                  key={r._id}
                  resource={r}
                  criteria={criteria}
                  onAdd={addToCart}
                  adding={addingId === r._id}
                  layout="grid"
                />
              ))}
            </div>
          ) : (
            /* ── List layout (compact B2B row) ────────────────────── */
            <div className="flex flex-col gap-3">
              {results.map((r) => (
                <ResourceCard
                  key={r._id}
                  resource={r}
                  criteria={criteria}
                  onAdd={addToCart}
                  adding={addingId === r._id}
                  layout="list"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile filter drawer ─────────────────────────────────────── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setDrawer(false)}
            aria-hidden
          />

          {/* Drawer panel */}
          <div
            role="dialog"
            aria-label="Filters"
            className={[
              'fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-2xl',
              'max-h-[90dvh] overflow-y-auto',
              'border-t border-line shadow-[0_-8px_40px_rgba(0,0,0,0.15)]',
            ].join(' ')}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-line-strong" />
            </div>

            <div className="px-5 pb-safe-area-inset-bottom">
              <div className="flex items-center justify-between mb-2 pb-3 border-b border-line">
                <h2 className="text-base font-semibold">Filters</h2>
                <button
                  onClick={() => setDrawer(false)}
                  className="text-ink-soft hover:text-ink transition-colors p-1"
                  aria-label="Close filters"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <FilterPanel
                params={params}
                patch={(updates) => {
                  patch(updates);
                }}
                onClearAll={() => {
                  clearAll();
                  setDrawer(false);
                }}
              />

              {/* Apply button */}
              <div className="pt-4 pb-6">
                <button
                  onClick={() => setDrawer(false)}
                  className="btn-primary w-full justify-center"
                >
                  Show {results.length} result{results.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
