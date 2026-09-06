import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
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

  const { data, isLoading } = useMyRequirements(statusFilter !== 'all' ? statusFilter : undefined);
  const requirements = data?.requirements || [];

  return (
    <div className="shell pt-12 pb-20 max-w-[1000px]">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="h-page">My Requirements (RFQs)</h1>
          <p className="text-sm muted mt-1">
            Track resource requests you have broadcasted to suppliers, review competitive quotations, and confirm bookings.
          </p>
        </div>
        <Link to="/requirements/new" className="btn-primary">
          Post New Requirement
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line mb-6 text-sm">
        {['all', 'open', 'fulfilled'].map((tab) => (
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
              Post your first RFQ
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {requirements.map((rfq) => {
            const isOpen = openDrawerId === rfq._id;
            const isFulfilled = rfq.status === 'fulfilled';

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
                            : 'bg-surface-sunk border-line text-ink'
                        }`}
                      >
                        {rfq.status}
                      </span>
                      <span className="text-xs text-ink-mute">
                        Posted {relative(rfq.createdAt)}
                      </span>
                    </div>

                    <h2 className="text-lg font-semibold text-ink leading-snug mb-1">
                      {rfq.title}
                    </h2>

                    {rfq.description && (
                      <p className="text-sm muted mb-2">{rfq.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-xs text-ink-soft mt-3">
                      <span>Quantity: <strong className="text-ink">{rfq.requiredQuantity} {rfq.unit}</strong></span>
                      <span>Dates: <strong className="text-ink">{dateRange(rfq.startDateTime, rfq.endDateTime)}</strong></span>
                      {rfq.maxBudget && (
                        <span>Budget Cap: <strong className="text-success">{inr(rfq.maxBudget)}</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2 w-full md:w-auto">
                    <button
                      onClick={() => setOpenDrawerId(isOpen ? null : rfq._id)}
                      className="btn-secondary btn-sm w-full md:w-auto"
                    >
                      {isOpen ? 'Hide Quotes' : `View Quotes (${rfq.proposalCount || 0})`}
                    </button>

                    {isFulfilled && rfq.resultingBooking && (
                      <Link
                        to={`/bookings/detail/${rfq.resultingBooking._id || rfq.resultingBooking}`}
                        className="text-xs link"
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
