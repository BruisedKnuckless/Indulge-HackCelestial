import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSearch, useRequirementActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import ResourceCard from '../components/ResourceCard';
import { Alert, Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/constants';
import { toLocalInput, defaultWindow } from '../lib/format';

/**
 * The reverse side of the marketplace (RFQ):
 * 1. Broadcasts the requirement to nearby hospitality suppliers.
 * 2. Previews instant catalog matches from currently listed inventory.
 */
export default function PostRequirement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { create } = useRequirementActions();
  const initial = useMemo(() => defaultWindow(10, 9, 12), []);

  const [form, setForm] = useState({
    title: '',
    category: 'banquet_space',
    description: '',
    quantity: 1,
    unit: 'unit',
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

  // Query for instant matches preview
  const searchQuery = useMemo(
    () => ({
      category: form.category,
      quantity: form.quantity,
      minCapacity: form.minCapacity || undefined,
      maxPrice: form.maxPrice || undefined,
      radiusKm: form.radiusKm,
      urgency: form.urgency,
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      limit: 10,
    }),
    [form]
  );

  const { data: searchData, isLoading } = useSearch(searchQuery, previewed);
  const results = searchData?.results || [];

  const handlePost = async () => {
    if (!user) {
      toast.error('Sign in to post requirements.');
      navigate('/login', { state: { from: '/requirements/new' } });
      return;
    }

    const titleToUse = form.title.trim() || `Need ${form.quantity} × ${form.category.replace('_', ' ')}`;

    setPosting(true);
    try {
      const data = await create.mutateAsync({
        title: titleToUse,
        category: form.category,
        description: form.description?.trim(),
        requiredQuantity: Number(form.quantity) || 1,
        quantity: Number(form.quantity) || 1,
        unit: form.unit,
        minCapacity: form.minCapacity ? Number(form.minCapacity) : undefined,
        maxBudget: form.maxPrice ? Number(form.maxPrice) : undefined,
        maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
        startDateTime: new Date(form.start).toISOString(),
        endDateTime: new Date(form.end).toISOString(),
        radiusKm: Number(form.radiusKm) || 25,
        urgency: form.urgency,
      });

      const reqId = data?.requirement?._id;
      toast.success('Requirement posted — providers can now respond');
      if (reqId) {
        navigate(`/requirements/${reqId}`);
      } else {
        navigate('/requirements/mine');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not post the requirement.'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="shell pt-12 pb-20">
      <header className="mb-10 max-w-prose">
        <h1 className="h-page">Post a Requirement (RFQ)</h1>
        <p className="text-base muted mt-3">
          Describe what you need. Broadcast to suppliers nearby so providers can submit quotes, or preview what already matches right now.
        </p>
        <div className="flex gap-4 mt-3">
          <Link to="/requirements/mine" className="text-sm link">
            View your posted RFQs →
          </Link>
          <Link to="/requirements/board" className="text-sm link">
            Browse open requirements board →
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-12">
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
                placeholder="e.g. 250 banquet chairs for Saturday"
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
              <label className="label">Details / Specifications</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={set('description')}
                placeholder="Anything a provider should know — access, setup, condition, delivery."
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
                  required
                />
              </div>
              <div>
                <label className="label">Min. Capacity</label>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">From</label>
                <input
                  type="datetime-local"
                  value={form.start}
                  onChange={set('start')}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="datetime-local"
                  value={form.end}
                  onChange={set('end')}
                  className="field"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Budget Cap (₹)</label>
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
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Urgency</label>
              <select value={form.urgency} onChange={set('urgency')} className="field-select w-full">
                <option value="low">Planning ahead</option>
                <option value="medium">Normal urgency</option>
                <option value="high">Urgent — within 24-48 hours</option>
              </select>
            </div>

            <div className="space-y-3 pt-4 border-t border-line">
              <button
                type="button"
                onClick={handlePost}
                disabled={posting}
                className="btn-primary w-full py-2.5 font-medium"
              >
                {posting ? 'Broadcasting…' : 'Broadcast RFQ to Suppliers'}
              </button>
              <button
                type="submit"
                className="btn-secondary w-full py-2"
              >
                Show what matches now
              </button>
            </div>
          </form>
        </div>

        {/* Right side explanation or preview */}
        <div>
          {!previewed ? (
            <div className="border border-line rounded p-8">
              <h2 className="text-lg font-medium mb-2">How the Reverse Marketplace Works</h2>
              <p className="text-base muted mb-6">
                Instead of making dozens of phone calls or checking listings one by one, Indulge lets you broadcast your specific event requirements to qualified suppliers nearby.
              </p>

              <div className="space-y-4 mb-6">
                {[
                  ['1. Post Your Need', 'Define your exact dates, quantities, capacity, and budget cap.'],
                  ['2. Real-Time Alert', 'Suppliers with idle capacity in your category receive notification.'],
                  ['3. Competitive Quotations', 'Suppliers propose their best rates and reserve available stock.'],
                  ['4. 1-Click Confirmation', 'Compare quotes side-by-side and accept the best offer to create an immediate confirmed booking.'],
                ].map(([title, desc]) => (
                  <div key={title} className="flex gap-3">
                    <span className="text-ink font-bold shrink-0">✓</span>
                    <div>
                      <p className="font-medium text-ink text-sm">{title}</p>
                      <p className="text-xs text-ink-soft">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-surface-sunk border border-line rounded text-sm text-ink-soft">
                💡 Click <strong>"Show what matches now"</strong> if you want to inspect existing listings before broadcasting an open request.
              </div>
            </div>
          ) : isLoading ? (
            <Spinner label="Matching your requirement" />
          ) : results.length === 0 ? (
            <div className="border border-line rounded p-8">
              <Alert tone="warn">
                Nothing currently listed matches those exact constraints. Click <strong>"Broadcast RFQ to Suppliers"</strong> so local businesses can review and make you a custom offer!
              </Alert>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-line">
                <p className="text-sm muted">
                  <span className="font-medium text-ink">{results.length}</span> listing
                  {results.length === 1 ? '' : 's'} already match — or post the requirement to reach providers with unlisted stock.
                </p>
                <button onClick={() => setPreviewed(false)} className="text-xs link">
                  Hide preview
                </button>
              </div>
              <div className="space-y-3">
                {results.map((r) => (
                  <ResourceCard key={r._id} resource={r} criteria={searchData?.criteria} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
