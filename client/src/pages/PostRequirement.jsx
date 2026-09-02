import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSearch } from '../hooks/queries';
import ResourceCard from '../components/ResourceCard';
import { Alert, Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/constants';
import { toLocalInput, defaultWindow } from '../lib/format';

/**
 * The reverse side of the marketplace: describe what you need and immediately
 * see what already matches, ranked. Rather than posting into a void and waiting
 * for replies, the requirement is run through the same matching engine that
 * powers search, so the answer is instant.
 */
export default function PostRequirement() {
  const navigate = useNavigate();
  const initial = useMemo(() => defaultWindow(10, 9, 12), []);

  const [form, setForm] = useState({
    category: 'banquet_space',
    quantity: 1,
    minCapacity: '',
    maxPrice: '',
    radiusKm: 25,
    urgency: 'medium',
    start: toLocalInput(initial.start),
    end: toLocalInput(initial.end),
  });
  const [submitted, setSubmitted] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const query = useMemo(
    () => ({
      category: form.category,
      quantity: form.quantity,
      minCapacity: form.minCapacity || undefined,
      maxPrice: form.maxPrice || undefined,
      radiusKm: form.radiusKm,
      urgency: form.urgency,
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      limit: 20,
    }),
    [form]
  );

  const { data, isLoading } = useSearch(query, submitted);
  const results = data?.results || [];

  const goToSearch = () => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== '')
    );
    navigate(`/s?${params.toString()}`);
  };

  return (
    <div className="page-shell py-4 max-w-[1100px]">
      <h1 className="text-page font-normal mb-1">Post a requirement</h1>
      <p className="text-base text-ink-soft mb-4">
        Describe what you need. We match it against every listing nearby and rank the results by
        price, distance, availability and fit.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <div className="bg-white p-5 h-fit">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
            className="space-y-4"
          >
            <div>
              <label className="a-label">What do you need?</label>
              <select value={form.category} onChange={set('category')} className="a-select w-full">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="a-label">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={set('quantity')}
                  className="a-input"
                />
              </div>
              <div>
                <label className="a-label">Min. capacity</label>
                <input
                  type="number"
                  min="0"
                  value={form.minCapacity}
                  onChange={set('minCapacity')}
                  placeholder="Any"
                  className="a-input"
                />
              </div>
            </div>

            <div>
              <label className="a-label">From</label>
              <input
                type="datetime-local"
                value={form.start}
                onChange={set('start')}
                className="a-input"
              />
            </div>

            <div>
              <label className="a-label">To</label>
              <input
                type="datetime-local"
                value={form.end}
                onChange={set('end')}
                className="a-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="a-label">Budget cap (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={form.maxPrice}
                  onChange={set('maxPrice')}
                  placeholder="Any"
                  className="a-input"
                />
              </div>
              <div>
                <label className="a-label">Within (km)</label>
                <input
                  type="number"
                  min="1"
                  value={form.radiusKm}
                  onChange={set('radiusKm')}
                  className="a-input"
                />
              </div>
            </div>

            <div>
              <label className="a-label">Urgency</label>
              <select value={form.urgency} onChange={set('urgency')} className="a-select w-full">
                <option value="low">Planning ahead</option>
                <option value="medium">Normal</option>
                <option value="high">Urgent — within 24 hours</option>
              </select>
            </div>

            <button type="submit" className="btn-yellow btn-pill w-full">
              Find matches
            </button>

            {submitted && (
              <button type="button" onClick={goToSearch} className="btn-secondary btn-pill w-full">
                Open in full search
              </button>
            )}
          </form>
        </div>

        <div>
          {!submitted ? (
            <div className="bg-white p-10 text-center">
              <p className="text-title font-bold mb-1">Tell us what you are short of</p>
              <p className="text-base text-ink-soft">
                Fill in the form and we will show what is genuinely available for those dates —
                not just what exists.
              </p>
            </div>
          ) : isLoading ? (
            <div className="bg-white">
              <Spinner label="Matching your requirement" />
            </div>
          ) : results.length === 0 ? (
            <div className="bg-white p-8">
              <Alert tone="warn">
                Nothing available matches those constraints. Try widening the radius, relaxing the
                budget, or shifting the dates.
              </Alert>
            </div>
          ) : (
            <>
              <div className="bg-white px-4 py-2.5 border-b border-bd">
                <p className="text-body">
                  <span className="font-bold">{results.length}</span> provider
                  {results.length === 1 ? '' : 's'} can meet this requirement, best match first.
                </p>
              </div>
              <div className="bg-white">
                {results.map((r) => (
                  <ResourceCard key={r._id} resource={r} criteria={data?.criteria} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
