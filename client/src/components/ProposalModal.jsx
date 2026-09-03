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
    return list.filter((r) => r.category === requirement.category && r.status === 'active');
  }, [listingsData, requirement.category]);

  const [resourceId, setResourceId] = useState('');
  const [quotedPrice, setQuotedPrice] = useState(requirement.maxBudget || '');
  const [customDates, setCustomDates] = useState(false);
  const [start, setStart] = useState(toLocalInput(requirement.startDateTime));
  const [end, setEnd] = useState(toLocalInput(requirement.endDateTime));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Set default resource once listings load
  useState(() => {
    if (matchingResources.length > 0 && !resourceId) {
      setResourceId(matchingResources[0]._id);
    }
  });

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-bd">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-bd bg-[#F7F8F8]">
          <div>
            <h3 className="text-title font-bold leading-tight">Submit Quotation</h3>
            <p className="text-mini text-ink-soft mt-0.5 line-clamp-1">{requirement.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-mute hover:text-ink text-lead font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="a-label">
              Select Your Listed Resource ({CATEGORY_LABELS[requirement.category]})
            </label>
            {listingsLoading ? (
              <p className="text-mini text-ink-soft">Loading your listings…</p>
            ) : matchingResources.length === 0 ? (
              <div className="p-3 bg-[#FDECEA] border border-[#E8A9A2] rounded text-danger text-base">
                You do not have any active listings in <strong>{CATEGORY_LABELS[requirement.category]}</strong>.
                Please list a resource in this category before quoting.
              </div>
            ) : (
              <select
                value={selectedResId}
                onChange={(e) => setResourceId(e.target.value)}
                className="a-select w-full"
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
              <p className="text-micro text-ink-mute mt-1">
                Capacity: {selectedResource.capacity || 'N/A'} · Min Hire: {selectedResource.pricing?.minRentalPeriodHours || 1}h
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="a-label">Quoted Price (₹)</label>
              <input
                type="number"
                min="1"
                value={quotedPrice}
                onChange={(e) => setQuotedPrice(e.target.value)}
                className="a-input"
                required
              />
              {requirement.maxBudget && (
                <p className="text-micro text-ink-soft mt-1">
                  Seeker Budget: {inr(requirement.maxBudget)}
                </p>
              )}
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-base text-ink-soft cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={customDates}
                  onChange={(e) => setCustomDates(e.target.checked)}
                />
                Propose adjusted hours
              </label>
            </div>
          </div>

          {customDates && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#F7FAFA] border border-bd rounded">
              <div>
                <label className="a-label text-mini">Proposed Start</label>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="a-input"
                  required={customDates}
                />
              </div>
              <div>
                <label className="a-label text-mini">Proposed End</label>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="a-input"
                  required={customDates}
                />
              </div>
            </div>
          )}

          <div>
            <label className="a-label">Proposal Notes / Inclusions</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Includes green room, 2 sound technicians, and setup from 8am."
              className="a-textarea"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-bd">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn-secondary btn-pill"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || matchingResources.length === 0}
              className="btn-yellow btn-pill"
            >
              {busy ? 'Submitting…' : 'Submit Proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
