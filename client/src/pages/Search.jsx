import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSearch, useCartMutations } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import ResourceCard from '../components/ResourceCard';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { toLocalInput, defaultWindow } from '../lib/format';

const RADII = [5, 10, 25, 50, 100];

const SORTS = [
  ['', 'Best match'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['distance', 'Nearest first'],
  ['rating', 'Highest rated'],
];

/** One labelled block in the filter rail. */
function Filter({ label, children }) {
  return (
    <div className="py-5 border-b border-line last:border-0">
      <h3 className="text-sm font-medium mb-3">{label}</h3>
      {children}
    </div>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { add } = useCartMutations();
  const [addingId, setAddingId] = useState(null);

  // The URL is the source of truth for filters, so results are shareable and
  // the back button behaves.
  const patch = (updates) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '' || v === 'all') next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };

  const query = useMemo(() => {
    const o = Object.fromEntries(params.entries());
    return { ...o, limit: 40 };
  }, [params]);

  const { data, isLoading } = useSearch(query);
  const results = data?.results || [];
  const criteria = data?.criteria;

  const q = params.get('q');
  const category = params.get('category') || 'all';
  const activeCount = [...params.keys()].filter((k) => k !== 'q' && k !== 'sort').length;

  const addToCart = async (resource) => {
    if (!user) {
      toast.error('Sign in to build a request cart.');
      return;
    }
    // Fall back to a sensible window when the shopper hasn't picked dates yet,
    // so the primary action always works from the results page.
    const start = params.get('start') || defaultWindow().start.toISOString();
    const end = params.get('end') || defaultWindow().end.toISOString();

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

  return (
    <div className="shell pt-12 pb-20">
      <header className="mb-10">
        <h1 className="h-page">
          {q ? `“${q}”` : category !== 'all' ? CATEGORY_LABELS[category] : 'All resources'}
        </h1>
        <p className="text-sm muted mt-2">
          {isLoading
            ? 'Searching…'
            : `${results.length} available${criteria?.start ? ' for your dates' : ''}`}
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-14">
        {/* ------------------------------------------------ filter rail */}
        <aside className="w-full lg:w-[220px] shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium">Filters</h2>
            {activeCount > 0 && (
              <button onClick={() => setParams(q ? { q } : {})} className="text-xs link-quiet">
                Clear
              </button>
            )}
          </div>

          <Filter label="Category">
            <select
              value={category}
              onChange={(e) => patch({ category: e.target.value })}
              className="field-select w-full"
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Filter>

          <Filter label="Dates">
            <div className="space-y-2">
              <input
                type="datetime-local"
                aria-label="From"
                value={params.get('start') ? toLocalInput(params.get('start')) : ''}
                onChange={(e) =>
                  patch({ start: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="field text-sm"
              />
              <input
                type="datetime-local"
                aria-label="To"
                value={params.get('end') ? toLocalInput(params.get('end')) : ''}
                onChange={(e) =>
                  patch({ end: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="field text-sm"
              />
            </div>
          </Filter>

          <Filter label="Distance">
            <div className="flex flex-wrap gap-2">
              {RADII.map((r) => {
                const on = String(params.get('radiusKm')) === String(r);
                return (
                  <button
                    key={r}
                    onClick={() => patch({ radiusKm: on ? null : r })}
                    className={`h-8 px-3 text-xs rounded-full border transition-colors ${
                      on
                        ? 'bg-ink border-ink text-ink-invert'
                        : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink'
                    }`}
                  >
                    {r} km
                  </button>
                );
              })}
            </div>
          </Filter>

          <Filter label="Quantity & capacity">
            <div className="space-y-2">
              <input
                type="number"
                min="1"
                placeholder="Quantity needed"
                value={params.get('quantity') || ''}
                onChange={(e) => patch({ quantity: e.target.value })}
                className="field text-sm"
              />
              <input
                type="number"
                min="0"
                placeholder="Min. guest capacity"
                value={params.get('minCapacity') || ''}
                onChange={(e) => patch({ minCapacity: e.target.value })}
                className="field text-sm"
              />
            </div>
          </Filter>

          <Filter label="Max price">
            <input
              type="number"
              min="0"
              placeholder="Any"
              value={params.get('maxPrice') || ''}
              onChange={(e) => patch({ maxPrice: e.target.value })}
              className="field text-sm"
            />
          </Filter>
        </aside>

        {/* --------------------------------------------------- results */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between pb-4 border-b border-line">
            <span className="text-sm muted">
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
            <label className="flex items-center gap-2 text-sm">
              <span className="muted">Sort</span>
              <select
                value={params.get('sort') || ''}
                onChange={(e) => patch({ sort: e.target.value })}
                className="field-select text-sm h-9"
              >
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!user && (
            <p className="text-sm muted mt-5">
              <Link to="/login" className="link">
                Sign in
              </Link>{' '}
              to rank results by distance from your business.
            </p>
          )}

          {isLoading ? (
            <Spinner label="Searching" />
          ) : results.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              message="Try widening the distance, relaxing the budget, or shifting the dates."
              action={
                <button onClick={() => setParams(q ? { q } : {})} className="btn-secondary">
                  Clear filters
                </button>
              }
            />
          ) : (
            <div>
              {results.map((r) => (
                <ResourceCard
                  key={r._id}
                  resource={r}
                  criteria={criteria}
                  onAdd={addToCart}
                  adding={addingId === r._id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
