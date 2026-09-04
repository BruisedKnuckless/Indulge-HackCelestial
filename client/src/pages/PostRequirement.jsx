import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSearch, useRequirementActions } from '../hooks/queries';
import { errorMessage } from '../api/client';
import ResourceCard from '../components/ResourceCard';
import { Alert, Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/constants';
import { toLocalInput, defaultWindow } from '../lib/format';

/**
 * The reverse side of the marketplace. Two things happen here, deliberately in
 * this order: we show what already matches right now (an instant answer through
 * the same ranking engine as search), and we let the seeker publish the
 * requirement so providers who have nothing listed yet can still respond.
 */
export default function PostRequirement() {
  const navigate = useNavigate();
  const { create } = useRequirementActions();
  const initial = useMemo(() => defaultWindow(10, 9, 12), []);

  const [form, setForm] = useState({
    title: '',
    category: 'banquet_space',
    description: '',
    quantity: 1,
    minCapacity: '',
    maxPrice: '',
    radiusKm: 25,
    urgency: 'medium',
    start: toLocalInput(initial.start),
    end: toLocalInput(initial.end),
  });
  const [previewed, setPreviewed] = useState(false);
  const [posting, setPosting] = useState(false);

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

  const { data, isLoading } = useSearch(query, previewed);
  const results = data?.results || [];

  const post = async () => {
    if (!form.title.trim()) {
      toast.error('Give the requirement a short title first.');
      return;
    }
    setPosting(true);
    try {
      const { requirement } = await create.mutateAsync({
        title: form.title.trim(),
        category: form.category,
        description: form.description,
        quantity: Number(form.quantity) || 1,
        minCapacity: form.minCapacity ? Number(form.minCapacity) : undefined,
        maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
        startDateTime: new Date(form.start).toISOString(),
        endDateTime: new Date(form.end).toISOString(),
        urgency: form.urgency,
      });
      toast.success('Requirement posted — providers can now respond');
      navigate(`/requirements/${requirement._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not post the requirement.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="shell pt-12 pb-20">
      <header className="mb-10 max-w-prose">
        <h1 className="h-page">Post a requirement</h1>
        <p className="text-base muted mt-3">
          Describe what you need. We show what already matches, and publish the requirement so
          providers can come to you with an offer.
        </p>
        <Link to="/requirements" className="text-sm link mt-3 inline-block">
          See requirements you have posted
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-14">
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPreviewed(true);
            }}
            className="space-y-5"
          >
            <div>
              <label className="label">Title</label>
              <input
                value={form.title}
                onChange={set('title')}
                placeholder="250 banquet chairs for Saturday"
                className="field"
              />
            </div>

            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={set('category')} className="field-select w-full">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Details</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={set('description')}
                placeholder="Anything a provider should know — access, setup, condition."
                className="field-area"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={set('quantity')}
                  className="field"
                />
              </div>
              <div>
                <label className="label">Min. capacity</label>
                <input
                  type="number"
                  min="0"
                  value={form.minCapacity}
                  onChange={set('minCapacity')}
                  placeholder="Any"
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label">From</label>
              <input type="datetime-local" value={form.start} onChange={set('start')} className="field" />
            </div>

            <div>
              <label className="label">To</label>
              <input type="datetime-local" value={form.end} onChange={set('end')} className="field" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Budget cap (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={form.maxPrice}
                  onChange={set('maxPrice')}
                  placeholder="Any"
                  className="field"
                />
              </div>
              <div>
                <label className="label">Within (km)</label>
                <input
                  type="number"
                  min="1"
                  value={form.radiusKm}
                  onChange={set('radiusKm')}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label">Urgency</label>
              <select value={form.urgency} onChange={set('urgency')} className="field-select w-full">
                <option value="low">Planning ahead</option>
                <option value="medium">Normal</option>
                <option value="high">Urgent — within 24 hours</option>
              </select>
            </div>

            <div className="space-y-2 pt-4 border-t border-line">
              <button type="button" onClick={post} disabled={posting} className="btn-primary w-full">
                {posting ? 'Posting…' : 'Post requirement'}
              </button>
              <button type="submit" className="btn-secondary w-full">
                Show what matches now
              </button>
            </div>
          </form>
        </div>

        <div>
          {!previewed ? (
            <div className="border border-line rounded p-12 text-center">
              <p className="text-lg font-medium mb-2">Tell us what you are short of</p>
              <p className="text-base muted max-w-prose mx-auto">
                Post it and providers bring you offers — or preview what is already listed for
                those dates before you decide.
              </p>
            </div>
          ) : isLoading ? (
            <Spinner label="Matching your requirement" />
          ) : results.length === 0 ? (
            <Alert tone="warn">
              Nothing currently listed matches those constraints. Posting the requirement is the
              better route — providers with spare capacity can respond directly.
            </Alert>
          ) : (
            <>
              <p className="text-sm muted pb-4 border-b border-line">
                <span className="font-medium text-ink">{results.length}</span> listing
                {results.length === 1 ? '' : 's'} already match — or post the requirement to reach
                providers who have not listed this yet.
              </p>
              <div>
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
