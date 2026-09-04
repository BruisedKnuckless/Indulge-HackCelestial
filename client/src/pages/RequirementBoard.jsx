import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useOpenRequirements, useMyListings, useRequirementActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

/**
 * The provider's view of demand: what other businesses are asking for right
 * now, so spare capacity can be offered without waiting to be found in search.
 */
function OfferForm({ requirement, listings, onDone }) {
  const { offer } = useRequirementActions();
  const [resourceId, setResourceId] = useState('');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Only listings in the same category are worth offering.
  const eligible = listings.filter((l) => l.category === requirement.category);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await offer.mutateAsync({
        id: requirement._id,
        resourceId,
        price: Number(price),
        message,
      });
      toast.success('Offer sent');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the offer.'));
    } finally {
      setBusy(false);
    }
  };

  if (eligible.length === 0) {
    return (
      <p className="text-sm muted mt-4">
        You have no {CATEGORY_LABELS[requirement.category].toLowerCase()} listings to offer.{' '}
        <Link to="/listings/new" className="link">
          List one
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-line space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Offer which listing?</label>
          <select
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            required
            className="field-select w-full"
          >
            <option value="">Choose…</option>
            {eligible.map((l) => (
              <option key={l._id} value={l._id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Your price (₹)</label>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            className="field"
            placeholder={requirement.maxPrice ? `Budget ${inr(requirement.maxPrice)}` : 'Total'}
          />
        </div>
      </div>

      <div>
        <label className="label">Message (optional)</label>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Delivery included, available from 8am…"
          className="field"
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary btn-sm">
          {busy ? 'Sending…' : 'Send offer'}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost btn-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RequirementRow({ requirement: r, listings, me }) {
  const [open, setOpen] = useState(false);
  const mine = (r.offers || []).filter((o) => String(o.provider?._id) === String(me._id));
  const alreadyOffered = mine.some((o) => o.status === 'offered');

  return (
    <article className="py-8 border-b border-line last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1.5">
            {r.urgency === 'high' && <span className="text-xs text-danger">Urgent</span>}
            <span className="text-xs muted">{CATEGORY_LABELS[r.category]}</span>
          </div>

          <p className="text-lg font-medium">{r.title}</p>

          <p className="text-sm muted mt-1">
            {r.seeker?.businessName}
            {r.location?.city ? ` · ${r.location.city}` : ''} · posted {relative(r.createdAt)}
          </p>
          <p className="text-sm muted">
            Qty {r.quantity} · {dateRange(r.startDateTime, r.endDateTime)}
            {r.maxPrice ? ` · budget ${inr(r.maxPrice)}` : ''}
            {r.minCapacity ? ` · capacity ${r.minCapacity}+` : ''}
          </p>

          {r.description && (
            <p className="text-sm muted mt-2 max-w-prose">{r.description}</p>
          )}

          <p className="text-xs text-ink-mute mt-2">
            {(r.offers || []).filter((o) => o.status === 'offered').length} offer(s) so far
          </p>
        </div>

        <div className="shrink-0">
          {alreadyOffered ? (
            <span className="text-sm text-success">You have offered</span>
          ) : (
            <button onClick={() => setOpen((v) => !v)} className="btn-secondary btn-sm">
              {open ? 'Close' : 'Make an offer'}
            </button>
          )}
        </div>
      </div>

      {open && !alreadyOffered && (
        <OfferForm requirement={r} listings={listings} onDone={() => setOpen(false)} />
      )}
    </article>
  );
}

export default function RequirementBoard() {
  const { user } = useAuth();
  const [category, setCategory] = useState('');
  const { data, isLoading } = useOpenRequirements(category ? { category } : undefined);
  const { data: listingData } = useMyListings();

  const requirements = data?.requirements || [];
  const listings = listingData?.resources || [];

  return (
    <div className="shell pt-12 pb-20">
      <header className="mb-8 max-w-prose">
        <h1 className="h-page">Open requirements</h1>
        <p className="text-base muted mt-3">
          What other businesses are looking for right now. Offer spare capacity directly instead of
          waiting to be found.
        </p>
      </header>

      <div className="flex items-center gap-3 pb-4 border-b border-line mb-2">
        <label className="text-sm muted">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field-select text-sm h-9"
        >
          <option value="">All</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-sm muted ml-auto">
          {requirements.length} open
        </span>
      </div>

      {isLoading ? (
        <Spinner label="Loading requirements" />
      ) : requirements.length === 0 ? (
        <EmptyState
          title="No open requirements"
          message="When another business posts something you can supply, it appears here."
        />
      ) : (
        <div>
          {requirements.map((r) => (
            <RequirementRow key={r._id} requirement={r} listings={listings} me={user} />
          ))}
        </div>
      )}
    </div>
  );
}
