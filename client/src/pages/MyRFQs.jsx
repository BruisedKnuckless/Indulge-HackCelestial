import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Pencil, XCircle, ArrowRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMyRequirements, useRequirement, useRequirementActions } from '../hooks/queries';
import { errorMessage } from '../api/client';
import { Spinner, EmptyState, Stars } from '../components/ui';
import { CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

function ProposalsDrawer({ requirementId }) {
  const { data, isLoading } = useRequirement(requirementId);
  const { acceptProposal } = useRequirementActions();
  const navigate = useNavigate();
  const [acceptingId, setAcceptingId] = useState(null);

  const proposals = data?.proposals || [];
  const req = data?.requirement;

  const handleAccept = async (proposalId) => {
    if (!window.confirm('Accept this quotation? A confirmed booking will be created immediately.')) {
      return;
    }

    setAcceptingId(proposalId);
    try {
      const res = await acceptProposal.mutateAsync({
        requirementId,
        proposalId,
      });

      toast.success('Proposal accepted! Confirmed booking created.');
      if (res.booking?._id) {
        navigate(`/bookings/detail/${res.booking._id}`);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to accept proposal.'));
    } finally {
      setAcceptingId(null);
    }
  };

  if (isLoading) return <div className="p-4"><Spinner label="Loading proposals" /></div>;

  if (proposals.length === 0) {
    return (
      <div className="p-6 text-center text-ink-soft bg-surface-sunk/60 rounded-b-xl border-t border-line text-xs">
        No proposals received yet. We have broadcasted your requirement to suppliers nearby.
      </div>
    );
  }

  return (
    <div className="p-4 bg-surface-sunk/50 rounded-b-xl border-t border-line space-y-3">
      <h3 className="text-sm font-semibold text-ink">
        Submitted Quotations ({proposals.length})
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {proposals.map((p) => {
          const provider = p.provider || {};
          const resource = p.resource || {};
          const isWinner = p.status === 'accepted';
          const isRejected = p.status === 'rejected';

          return (
            <div
              key={p._id}
              className={`p-4 rounded-xl border bg-surface-alt flex flex-col justify-between ${
                isWinner
                  ? 'border-success ring-1 ring-success'
                  : isRejected
                  ? 'opacity-60 border-line'
                  : 'border-line hover:border-ink/40'
              }`}
            >
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <h4 className="text-sm font-semibold text-ink">{provider.businessName}</h4>
                  <span className="text-base font-semibold text-ink">{inr(p.quotedPrice)}</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  {provider.ratingCount > 0 ? (
                    <Stars rating={provider.ratingAvg} count={provider.ratingCount} size={12} />
                  ) : (
                    <span className="text-[11px] text-ink-soft">New Supplier</span>
                  )}
                  {provider.location?.city && (
                    <span className="text-[11px] text-ink-soft">· {provider.location.city}</span>
                  )}
                </div>

                <div className="p-2.5 bg-surface-sunk rounded-lg border border-line text-xs mb-2">
                  <span className="text-[11px] text-ink-mute block font-medium">Committed Resource:</span>
                  <Link to={`/r/${resource._id}`} className="font-semibold text-ink hover:underline">
                    {resource.title}
                  </Link>
                  {resource.capacity && (
                    <span className="text-[11px] text-ink-mute block">Capacity: {resource.capacity}</span>
                  )}
                </div>

                {p.notes && (
                  <p className="text-xs text-ink-soft italic mb-3">
                    “{p.notes}”
                  </p>
                )}
              </div>

              <div className="pt-2.5 border-t border-line flex items-center justify-between">
                <span className="text-[11px] text-ink-mute">
                  Quoted {relative(p.createdAt)}
                </span>

                {isWinner ? (
                  <span className="text-xs font-semibold bg-success/10 border border-success/30 text-success px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>Accepted & Booked</span>
                  </span>
                ) : isRejected ? (
                  <span className="text-xs text-ink-mute font-medium">Declined</span>
                ) : req.status === 'open' ? (
                  <button
                    onClick={() => handleAccept(p._id)}
                    disabled={acceptingId === p._id}
                    className="btn-primary btn-sm"
                  >
                    {acceptingId === p._id ? 'Booking…' : 'Accept & Book'}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MyRFQs() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [openDrawerId, setOpenDrawerId] = useState(null);
  const [actionBusyId, setActionBusyId] = useState(null);

  const { close, cancel } = useRequirementActions();
  const { data, isLoading } = useMyRequirements(statusFilter !== 'all' ? statusFilter : undefined);
  const requirements = data?.requirements || [];

  const handleClose = async (id) => {
    if (!window.confirm('Close this requirement? Suppliers will no longer be able to submit quotes.')) return;
    setActionBusyId(id);
    try {
      await close.mutateAsync(id);
      toast.success('Requirement closed');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to close requirement.'));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this requirement? It will be marked as cancelled.')) return;
    setActionBusyId(id);
    try {
      await cancel.mutateAsync(id);
      toast.success('Requirement cancelled');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to cancel requirement.'));
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="shell pt-12 pb-20 max-w-[1000px]">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-sunk border border-line text-ink-soft">
              My Demand Workspace
            </span>
          </div>
          <h1 className="h-page">My Requirements</h1>
          <p className="text-sm muted mt-1">
            Manage resource requirements your business has broadcasted, review incoming supplier quotes, and confirm bookings.
          </p>
        </div>
        <Link to="/requirements/new" className="btn-primary">
          Post New Requirement
        </Link>
      </div>

      {/* Conceptual clarity banner */}
      <div className="p-3.5 mb-6 bg-surface-sunk/70 border border-line rounded-lg text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <span className="text-ink-soft">
          Looking to supply capacity or quote on requirements posted by <strong>other businesses</strong>?
        </span>
        <Link
          to="/requirements/feed"
          className="font-medium text-ink hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>Open Supplier RFQ Feed</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Status Tabs */}
      <div className="flex border-b border-line mb-6 text-sm">
        {['all', 'open', 'fulfilled', 'closed'].map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 capitalize font-medium border-b-2 -mb-px transition-colors ${
              statusFilter === tab
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner label="Loading your requirements" />
      ) : requirements.length === 0 ? (
        <EmptyState
          title="No requirements posted"
          message="Post what you need and let qualified hospitality suppliers nearby bid with their best rates."
          action={
            <Link to="/requirements/new" className="btn-primary">
              Post your first requirement
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {requirements.map((rfq) => {
            const isOpen = openDrawerId === rfq._id;
            const isFulfilled = rfq.status === 'fulfilled';
            const isStatusOpen = rfq.status === 'open';

            return (
              <div key={rfq._id} className="card p-0 overflow-hidden">
                <div className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="inline-flex items-center h-5 px-2 rounded-full border border-line text-[11px] font-medium bg-surface-sunk text-ink-soft">
                        {CATEGORY_LABELS[rfq.category]}
                      </span>
                      <span
                        className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium border capitalize ${
                          isFulfilled
                            ? 'bg-success/10 border-success/30 text-success'
                            : isStatusOpen
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                            : 'bg-surface-sunk border-line text-ink-soft'
                        }`}
                      >
                        {rfq.status}
                      </span>
                      <span className="text-xs text-ink-mute">
                        Posted {relative(rfq.createdAt)}
                      </span>
                    </div>

                    <h2 className="text-lg font-semibold text-ink leading-snug mb-1">
                      <Link to={`/requirements/${rfq._id}`} className="hover:underline">
                        {rfq.title}
                      </Link>
                    </h2>

                    {rfq.description && (
                      <p className="text-sm muted mb-2 line-clamp-2">{rfq.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-xs text-ink-soft mt-3">
                      <span>Quantity: <strong className="text-ink">{rfq.requiredQuantity || rfq.quantity} {rfq.unit || 'unit'}</strong></span>
                      <span>Dates: <strong className="text-ink">{dateRange(rfq.startDateTime, rfq.endDateTime)}</strong></span>
                      {rfq.maxBudget && (
                        <span>Budget Cap: <strong className="text-success">{inr(rfq.maxBudget)}</strong></span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line text-xs">
                      <Link
                        to={`/requirements/${rfq._id}`}
                        className="text-ink-soft hover:text-ink hover:underline font-medium"
                      >
                        View Full Details →
                      </Link>
                      {isStatusOpen && (
                        <Link
                          to={`/s?requirementId=${rfq._id}`}
                          className="text-xs text-ink-soft hover:text-ink inline-flex items-center gap-1 font-medium"
                        >
                          <Sparkles size={11} className="text-emerald-500" />
                          <span>Find catalog matches</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-stretch md:items-end gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-2">
                      {isStatusOpen && (
                        <Link
                          to={`/requirements/${rfq._id}/edit`}
                          className="btn-secondary btn-sm gap-1 inline-flex items-center"
                          title="Edit requirement"
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </Link>
                      )}

                      <button
                        onClick={() => setOpenDrawerId(isOpen ? null : rfq._id)}
                        className="btn-primary btn-sm flex-1 md:flex-initial"
                      >
                        {isOpen ? 'Hide Quotes' : `View Quotes (${rfq.proposalCount || 0})`}
                      </button>
                    </div>

                    {isStatusOpen && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleClose(rfq._id)}
                          disabled={actionBusyId === rfq._id}
                          className="text-[11px] text-ink-soft hover:text-ink hover:underline"
                        >
                          Close RFQ
                        </button>
                        <span className="text-ink-mute text-[10px]">·</span>
                        <button
                          onClick={() => handleCancel(rfq._id)}
                          disabled={actionBusyId === rfq._id}
                          className="text-[11px] text-danger hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {isFulfilled && rfq.resultingBooking && (
                      <Link
                        to={`/bookings/detail/${rfq.resultingBooking._id || rfq.resultingBooking}`}
                        className="text-xs link font-medium"
                      >
                        View Confirmed Booking →
                      </Link>
                    )}
                  </div>
                </div>

                {isOpen && <ProposalsDrawer requirementId={rfq._id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
