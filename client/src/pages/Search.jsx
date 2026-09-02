import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSearch, useCartMutations } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import ResourceCard from '../components/ResourceCard';
import { Spinner, EmptyState, Stars } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { toLocalInput, defaultWindow } from '../lib/format';

const RADII = [5, 10, 25, 50, 100];
const PRICE_CAPS = [2000, 10000, 30000, 60000, 100000];

/** One filter block in the left rail. */
function FilterGroup({ title, children }) {
  return (
    <div className="mb-4">
      <h3 className="text-lead font-bold mb-1.5">{title}</h3>
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

  const { data, isLoading, isFetching } = useSearch(query);
  const results = data?.results || [];
  const criteria = data?.criteria;

  const q = params.get('q');
  const category = params.get('category') || 'all';

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
    <div className="page-shell py-3">
      <div className="flex gap-4">
        {/* ------------------------------------------------ filter rail */}
        <aside className="w-[240px] shrink-0 hidden lg:block">
          <div className="bg-white p-4">
            <FilterGroup title="Category">
              <ul className="space-y-1">
                <li>
                  <button
                    onClick={() => patch({ category: null })}
                    className={`text-base ${category === 'all' ? 'font-bold' : 'a-link-plain'}`}
                  >
                    All categories
                  </button>
                </li>
                {CATEGORIES.map((c) => (
                  <li key={c.value}>
                    <button
                      onClick={() => patch({ category: c.value })}
                      className={`text-base text-left ${
                        category === c.value ? 'font-bold' : 'a-link-plain'
                      }`}
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            </FilterGroup>

            <FilterGroup title="Availability">
              <label className="block text-mini text-ink-soft mb-0.5">From</label>
              <input
                type="datetime-local"
                value={params.get('start') ? toLocalInput(params.get('start')) : ''}
                onChange={(e) =>
                  patch({ start: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="a-input mb-2"
              />
              <label className="block text-mini text-ink-soft mb-0.5">To</label>
              <input
                type="datetime-local"
                value={params.get('end') ? toLocalInput(params.get('end')) : ''}
                onChange={(e) =>
                  patch({ end: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="a-input"
              />
              {(params.get('start') || params.get('end')) && (
                <button
                  onClick={() => patch({ start: null, end: null })}
                  className="a-link text-mini mt-1"
                >
                  Clear dates
                </button>
              )}
            </FilterGroup>

            <FilterGroup title="Quantity needed">
              <input
                type="number"
                min="1"
                value={params.get('quantity') || ''}
                placeholder="Any"
                onChange={(e) => patch({ quantity: e.target.value })}
                className="a-input"
              />
            </FilterGroup>

            <FilterGroup title="Distance">
              <ul className="space-y-1">
                {RADII.map((r) => (
                  <li key={r}>
                    <label className="flex items-center gap-2 text-base cursor-pointer">
                      <input
                        type="radio"
                        name="radius"
                        checked={String(params.get('radiusKm') || 25) === String(r)}
                        onChange={() => patch({ radiusKm: r })}
                      />
                      Within {r} km
                    </label>
                  </li>
                ))}
              </ul>
            </FilterGroup>

            <FilterGroup title="Max price">
              <ul className="space-y-1">
                {PRICE_CAPS.map((p) => (
                  <li key={p}>
                    <button
                      onClick={() => patch({ maxPrice: p })}
                      className={`text-base ${
                        String(params.get('maxPrice')) === String(p) ? 'font-bold' : 'a-link-plain'
                      }`}
                    >
                      Up to ₹{p.toLocaleString('en-IN')}
                    </button>
                  </li>
                ))}
                {params.get('maxPrice') && (
                  <li>
                    <button onClick={() => patch({ maxPrice: null })} className="a-link text-mini">
                      Clear
                    </button>
                  </li>
                )}
              </ul>
            </FilterGroup>

            <FilterGroup title="Minimum capacity">
              <input
                type="number"
                min="0"
                value={params.get('minCapacity') || ''}
                placeholder="Any"
                onChange={(e) => patch({ minCapacity: e.target.value })}
                className="a-input"
              />
            </FilterGroup>

            <FilterGroup title="Customer rating">
              <ul className="space-y-1">
                {[4, 3].map((r) => (
                  <li key={r}>
                    <button
                      onClick={() => patch({ minRating: r })}
                      className="flex items-center gap-1.5 group"
                    >
                      <Stars rating={r} size={15} />
                      <span className="text-base a-link-plain">&amp; up</span>
                    </button>
                  </li>
                ))}
                {params.get('minRating') && (
                  <li>
                    <button onClick={() => patch({ minRating: null })} className="a-link text-mini">
                      Clear
                    </button>
                  </li>
                )}
              </ul>
            </FilterGroup>

            <FilterGroup title="Urgency">
              <select
                value={params.get('urgency') || 'medium'}
                onChange={(e) => patch({ urgency: e.target.value })}
                className="a-select w-full"
              >
                <option value="low">Planning ahead</option>
                <option value="medium">Normal</option>
                <option value="high">Urgent — need it now</option>
              </select>
              <p className="text-micro text-ink-mute mt-1">
                Urgent ranking favours resources with no competing requests.
              </p>
            </FilterGroup>
          </div>
        </aside>

        {/* ---------------------------------------------------- results */}
        <div className="flex-1 min-w-0">
          <div className="bg-white px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-bd">
            <p className="text-body text-ink-soft">
              {isLoading ? (
                'Searching…'
              ) : (
                <>
                  1–{results.length} of {results.length} results
                  {q && (
                    <>
                      {' '}
                      for <span className="text-danger font-bold">“{q}”</span>
                    </>
                  )}
                  {category !== 'all' && <> in {CATEGORY_LABELS[category]}</>}
                </>
              )}
            </p>

            <label className="flex items-center gap-2 text-base">
              <span className="text-ink-soft">Sort by:</span>
              <select
                value={params.get('sort') || 'match'}
                onChange={(e) => patch({ sort: e.target.value })}
                className="a-select"
              >
                <option value="match">Best match</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="distance">Distance: nearest</option>
                <option value="rating">Avg. customer review</option>
              </select>
            </label>
          </div>

          {criteria && !criteria.hasLocation && (
            <div className="bg-[#FEF8E7] border-b border-[#E7C65C] px-4 py-2 text-base">
              Showing results without distance ranking.{' '}
              {user ? (
                <Link to="/account/profile" className="a-link">
                  Set your business location
                </Link>
              ) : (
                <Link to="/login" className="a-link">
                  Sign in
                </Link>
              )}{' '}
              to rank by how close each resource is.
            </div>
          )}

          <div className="bg-white">
            {isLoading ? (
              <Spinner label="Finding matching resources" />
            ) : results.length === 0 ? (
              <EmptyState
                title="No resources match those filters"
                message="Try widening the distance, clearing the date range, or raising the price cap."
                action={
                  <button onClick={() => setParams(new URLSearchParams())} className="btn-secondary">
                    Clear all filters
                  </button>
                }
              />
            ) : (
              <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
                {results.map((r) => (
                  <ResourceCard
                    key={r._id}
                    resource={r}
                    criteria={criteria}
                    onAddToCart={addToCart}
                    adding={addingId === r._id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
