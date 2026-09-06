import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useMyListings, useRequirementActions } from '../hooks/queries';
import { errorMessage } from '../api/client';
import { inr, toLocalInput } from '../lib/format';
import { CATEGORY_LABELS } from '../lib/constants';

export default function ProposalModal({ requirement, isOpen, onClose }) {
  const { data: listingsData, isLoading: listingsLoading } = useMyListings();
  const { submitProposal } = useRequirementActions();

  const matchingResources = useMemo(() => {
    const list = listingsData?.resources || [];
    return list.filter((r) => r.category === requirement?.category && r.status === 'active');
  }, [listingsData, requirement?.category]);

  const [resourceId, setResourceId] = useState('');
  const [quotedPrice, setQuotedPrice] = useState(requirement?.maxBudget || '');
  const [customDates, setCustomDates] = useState(false);
  const [start, setStart] = useState(requirement?.startDateTime ? toLocalInput(requirement.startDateTime) : '');
  const [end, setEnd] = useState(requirement?.endDateTime ? toLocalInput(requirement.endDateTime) : '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen || !requirement) return null;

  const selectedResId = resourceId || matchingResources[0]?._id;
  const selectedResource = matchingResources.find((r) => r._id === selectedResId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedResId) {
      toast.error(`You must have an active listing in "${CATEGORY_LABELS[requirement.category]}" to submit a proposal.`);
      return;
    }

    setBusy(true);
    try {
      await submitProposal.mutateAsync({
        requirementId: requirement._id,
        resourceId: selectedResId,
        quotedPrice: Number(quotedPrice),
        proposedStart: customDates ? new Date(start).toISOString() : undefined,
        proposedEnd: customDates ? new Date(end).toISOString() : undefined,
        notes,
      });

      toast.success('Proposal submitted to seeker!');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to submit proposal.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-surface-alt text-ink rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-line">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface-sunk/40">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink leading-tight">Submit Quotation</h3>
            <p className="text-xs text-ink-soft mt-0.5 truncate">{requirement.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-mute hover:text-ink text-sm font-semibold p-1.5 rounded-md hover:bg-surface-sunk transition-colors"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">
              Select Your Listed Resource ({CATEGORY_LABELS[requirement.category]})
            </label>
            {listingsLoading ? (
              <p className="text-xs text-ink-soft">Loading your listings…</p>
            ) : matchingResources.length === 0 ? (
              <div className="p-3 bg-danger/10 border border-danger/25 rounded-lg text-danger text-xs leading-relaxed">
                You do not have any active listings in <strong>{CATEGORY_LABELS[requirement.category]}</strong>.
                Please list a resource in this category before quoting.
              </div>
            ) : (
              <select
                value={selectedResId}
                onChange={(e) => setResourceId(e.target.value)}
                className="field-select w-full text-sm"
                required
              >
                {matchingResources.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.title} (Base: {inr(r.pricing?.basePrice)} · Qty: {r.totalQuantity})
                  </option>
                ))}
              </select>
            )}
            {selectedResource && (
              <p className="text-[11px] text-ink-mute mt-1.5">
                Capacity: {selectedResource.capacity || 'N/A'} · Min Hire: {selectedResource.pricing?.minRentalPeriodHours || 1}h
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Quoted Price (₹)</label>
              <input
                type="number"
                min="1"
                value={quotedPrice}
                onChange={(e) => setQuotedPrice(e.target.value)}
                className="field text-sm"
                required
              />
              {requirement.maxBudget && (
                <p className="text-[11px] text-ink-soft mt-1">
                  Seeker Budget: {inr(requirement.maxBudget)}
                </p>
              )}
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer mb-2.5 select-none">
                <input
                  type="checkbox"
                  checked={customDates}
                  onChange={(e) => setCustomDates(e.target.checked)}
                  className="rounded border-line-strong text-ink focus:ring-ink"
                />
                <span>Propose adjusted hours</span>
              </label>
            </div>
          </div>

          {customDates && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-surface-sunk border border-line rounded-lg">
              <div>
                <label className="label text-[11px]">Proposed Start</label>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="field text-xs"
                  required={customDates}
                />
              </div>
              <div>
                <label className="label text-[11px]">Proposed End</label>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="field text-xs"
                  required={customDates}
                />
              </div>
            </div>
          )}

          <div>
            <label className="label">Proposal Notes / Inclusions</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Includes green room, 2 sound technicians, and setup from 8am."
              className="field-area text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || matchingResources.length === 0}
              className="btn-primary btn-sm"
            >
              {busy ? 'Submitting…' : 'Submit Proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
