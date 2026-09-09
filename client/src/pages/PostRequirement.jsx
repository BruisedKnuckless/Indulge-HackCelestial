import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Info, AlertTriangle, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearch, useRequirement, useRequirementActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import ResourceCard from '../components/ResourceCard';
import { Alert, Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/constants';
import { toLocalInput, defaultWindow } from '../lib/format';

/**
 * The reverse side of the marketplace (RFQ):
 * 1. Broadcasts or edits the requirement to nearby hospitality suppliers.
 * 2. Previews instant catalog matches from currently listed inventory.
 */
export default function PostRequirement() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { create, update } = useRequirementActions();
  const { data: reqData, isLoading: reqLoading } = useRequirement(id);

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
    additionalConstraints: '',
    start: toLocalInput(initial.start),
    end: toLocalInput(initial.end),
  });

  const [initialData, setInitialData] = useState(null);
  const [previewed, setPreviewed] = useState(false);
  const [posting, setPosting] = useState(false);

  // Pre-fill form when editing an existing requirement
  useEffect(() => {
    if (editing && reqData?.requirement) {
      const r = reqData.requirement;
      const populated = {
        title: r.title || '',
        category: r.category || 'banquet_space',
        description: r.description || '',
        quantity: r.quantity ?? r.requiredQuantity ?? 1,
        unit: r.unit || 'unit',
        minCapacity: r.minCapacity ?? '',
        maxPrice: r.maxPrice ?? r.maxBudget ?? '',
        radiusKm: r.radiusKm ?? r.location?.radiusKm ?? 25,
        urgency: r.urgency || 'medium',
        additionalConstraints: r.additionalConstraints || '',
        start: r.startDateTime ? toLocalInput(r.startDateTime) : toLocalInput(initial.start),
        end: r.endDateTime ? toLocalInput(r.endDateTime) : toLocalInput(initial.end),
      };
      setForm(populated);
      setInitialData(populated);
    }
  }, [editing, reqData, initial]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const currentReq = reqData?.requirement;
  const isOwner = currentReq && user ? String(currentReq.seeker?._id || currentReq.seeker) === String(user._id) : true;
  const proposalsCount = currentReq?.proposalCount || reqData?.proposals?.length || (currentReq?.offers || []).length || 0;
  const hasProposals = proposalsCount > 0;

  // Track if any major fields changed
  const majorFieldsChanged = useMemo(() => {
    if (!editing || !initialData) return false;
    return (
      form.category !== initialData.category ||
      Number(form.quantity) !== Number(initialData.quantity) ||
      Number(form.minCapacity || 0) !== Number(initialData.minCapacity || 0) ||
      Number(form.maxPrice || 0) !== Number(initialData.maxPrice || 0) ||
      form.start !== initialData.start ||
      form.end !== initialData.end ||
      Number(form.radiusKm) !== Number(initialData.radiusKm)
    );
  }, [editing, initialData, form]);

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

  const handleSave = async () => {
    if (!user) {
      toast.error('Sign in to manage requirements.');
      navigate('/login', { state: { from: `/requirements/${id}/edit` } });
      return;
    }

    if (editing && !isOwner) {
      toast.error('You do not have permission to edit this requirement.');
      return;
    }

    if (editing && currentReq?.status !== 'open') {
      toast.error(`Cannot edit a requirement that is ${currentReq?.status}.`);
      return;
    }

    const titleToUse = form.title.trim() || `Need ${form.quantity} × ${form.category.replace('_', ' ')}`;

    if (editing && hasProposals && majorFieldsChanged) {
      const confirmed = window.confirm(
        `This requirement has ${proposalsCount} existing supplier quotation(s).\n\nYou have changed key terms (category, dates, budget, quantity, or capacity). Suppliers calculated their quotes based on previous specifications.\n\nDo you want to save these changes and preserve the existing proposals?`
      );
      if (!confirmed) return;
    }

    setPosting(true);
    try {
      const payload = {
        title: titleToUse,
        category: form.category,
        description: form.description?.trim(),
        requiredQuantity: Number(form.quantity) || 1,
        quantity: Number(form.quantity) || 1,
        unit: form.unit,
        minCapacity: form.minCapacity ? Number(form.minCapacity) : undefined,
        maxBudget: form.maxPrice ? Number(form.maxPrice) : undefined,
        maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
        radiusKm: Number(form.radiusKm) || 25,
        additionalConstraints: form.additionalConstraints.trim() || undefined,
        startDateTime: new Date(form.start).toISOString(),
        endDateTime: new Date(form.end).toISOString(),
        urgency: form.urgency,
      };

      if (editing) {
        await update.mutateAsync({ id, ...payload });
        toast.success('Requirement updated successfully');
        navigate(`/requirements/${id}`);
      } else {
        const data = await create.mutateAsync(payload);
        const reqId = data?.requirement?._id;
        toast.success('Requirement posted — providers can now respond');
        if (reqId) {
          navigate(`/requirements/${reqId}`);
        } else {
          navigate('/requirements');
        }
      }
    } catch (err) {
      toast.error(errorMessage(err, editing ? 'Could not update the requirement.' : 'Could not post the requirement.'));
    } finally {
      setPosting(false);
    }
  };

  if (editing && reqLoading) {
    return <Spinner label="Loading requirement details" />;
  }

  if (editing && currentReq && !isOwner) {
    return (
      <div className="shell pt-12 pb-20 max-w-prose">
        <Alert tone="danger" className="mb-4">
          You do not have permission to edit this requirement because you are not the owner.
        </Alert>
        <Link to="/requirements" className="btn-secondary">
          Return to My Requirements
        </Link>
      </div>
    );
  }

  if (editing && currentReq && currentReq.status !== 'open') {
    return (
      <div className="shell pt-12 pb-20 max-w-prose">
        <Alert tone="warn" className="mb-4">
          This requirement is <strong>{currentReq.status}</strong> and cannot be edited.
        </Alert>
        <Link to={`/requirements/${id}`} className="btn-secondary">
          View Requirement Detail
        </Link>
      </div>
    );
  }

  return (
    <div className="shell pt-12 pb-20">
      <header className="mb-10 max-w-prose">
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => navigate(editing ? `/requirements/${id}` : '/requirements')}
            className="text-xs text-ink-soft hover:text-ink inline-flex items-center gap-1 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>{editing ? 'Back to Requirement' : 'Back to My Requirements'}</span>
          </button>
        </div>

        <h1 className="h-page">
          {editing ? 'Edit Requirement' : 'Post a Requirement (RFQ)'}
        </h1>
        <p className="text-base muted mt-3">
          {editing
            ? 'Update your requirement specifications. Changes will be updated on the marketplace while keeping your existing proposals on record.'
            : 'Describe what you need. Broadcast to suppliers nearby so providers can submit quotes, or preview what already matches right now.'}
        </p>

        {!editing && (
          <div className="flex gap-4 mt-3">
            <Link to="/requirements" className="text-sm link">
              View your posted RFQs →
            </Link>
            <Link to="/requirements/feed" className="text-sm link">
              Browse supplier RFQ feed →
            </Link>
          </div>
        )}
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
              <label className="label">Additional constraints / notes</label>
              <input
                type="text"
                value={form.additionalConstraints}
                onChange={set('additionalConstraints')}
                placeholder="e.g. Ground floor delivery, setup assistance needed"
                className="field"
              />
            </div>

            <div>
              <label className="label">Urgency</label>
              <select value={form.urgency} onChange={set('urgency')} className="field-select w-full">
                <option value="low">Planning ahead</option>
                <option value="medium">Normal urgency</option>
                <option value="high">Urgent — within 24-48 hours</option>
              </select>
            </div>

            {/* Warning banner when editing an RFQ with existing proposals */}
            {editing && hasProposals && majorFieldsChanged && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <strong className="block font-semibold mb-0.5">Key specifications modified</strong>
                  <span>
                    This requirement has {proposalsCount} quotation(s) already submitted. Suppliers calculated their quotes based on previous specifications. Saving will preserve existing proposals.
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-4 border-t border-line">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={posting}
                    className="btn-primary w-full py-2.5 font-medium"
                  >
                    {posting ? 'Saving Changes…' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/requirements/${id}`)}
                    className="btn-secondary w-full py-2"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
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
                </>
              )}
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
                    <Check size={14} className="text-ink font-bold shrink-0 mt-0.5" strokeWidth={2.5} />
                    <div>
                      <p className="font-medium text-ink text-sm">{title}</p>
                      <p className="text-xs text-ink-soft">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-surface-sunk border border-line rounded text-sm text-ink-soft flex items-start gap-2.5">
                <Info size={16} className="text-ink-soft shrink-0 mt-0.5" />
                <span>
                  Click <strong>"Show what matches now"</strong> if you want to inspect existing listings before broadcasting an open request.
                </span>
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
