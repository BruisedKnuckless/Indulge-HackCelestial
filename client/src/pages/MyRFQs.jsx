import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useMyRequirements, useRequirement, useRequirementActions } from '../hooks/queries';
import { errorMessage } from '../api/client';
import { Spinner, EmptyState, Stars, Price } from '../components/ui';
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
      <div className="p-6 text-center text-ink-soft bg-[#F7F8F8] rounded-b border-t border-bd text-base">
        No proposals received yet. We have broadcasted your requirement to suppliers nearby.
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#F7F8F8] rounded-b border-t border-bd space-y-3">
      <h3 className="text-lead font-bold text-ink">
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
              className={`p-4 rounded border bg-white flex flex-col justify-between ${
                isWinner
                  ? 'border-success ring-1 ring-success'
                  : isRejected
                  ? 'opacity-60 border-bd'
                  : 'border-bd hover:border-[#007185]'
              }`}
            >
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <h4 className="text-title font-bold text-ink">{provider.businessName}</h4>
                  <span className="text-lead font-bold text-deal">{inr(p.quotedPrice)}</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  {provider.ratingCount > 0 ? (
                    <Stars rating={provider.ratingAvg} count={provider.ratingCount} size={12} />
                  ) : (
                    <span className="text-mini text-ink-soft">New Supplier</span>
                  )}
                  {provider.location?.city && (
                    <span className="text-mini text-ink-soft">· {provider.location.city}</span>
                  )}
                </div>

                <div className="p-2 bg-[#F7FAFA] rounded border border-bd text-base mb-2">
                  <span className="text-mini text-ink-soft block font-bold">Committed Resource:</span>
                  <Link to={`/r/${resource._id}`} className="a-link font-bold">
                    {resource.title}
                  </Link>
                  {resource.capacity && (
                    <span className="text-micro text-ink-mute block">Capacity: {resource.capacity}</span>
                  )}
                </div>

                {p.notes && (
                  <p className="text-base text-ink-soft italic mb-3">
                    “{p.notes}”
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-bd flex items-center justify-between">
                <span className="text-mini text-ink-mute">
                  Quoted {relative(p.createdAt)}
                </span>

                {isWinner ? (
                  <span className="text-mini font-bold bg-[#E8F5E9] text-success px-2.5 py-1 rounded">
                    ✓ Accepted & Booked
                  </span>
                ) : isRejected ? (
                  <span className="text-mini text-ink-mute font-bold">Declined</span>
                ) : req.status === 'open' ? (
                  <button
                    onClick={() => handleAccept(p._id)}
                    disabled={acceptingId === p._id}
                    className="btn-yellow btn-pill text-base font-bold px-4 py-1"
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
    <div className="page-shell py-4 max-w-[1000px]">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-page font-normal">My Requirements (RFQs)</h1>
          <p className="text-base text-ink-soft">
            Track resource requests you have broadcasted to suppliers, review competitive quotations, and confirm bookings.
          </p>
        </div>
        <Link to="/requirements/new" className="btn-yellow btn-pill">
          Post New Requirement
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-bd mb-4 text-base">
        {['all', 'open', 'fulfilled'].map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 capitalize font-bold border-b-2 -mb-px transition-colors ${
              statusFilter === tab
                ? 'border-orange text-ink'
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
            <Link to="/requirements/new" className="btn-yellow btn-pill">
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
              <div key={rfq._id} className="bg-white border border-bd rounded-lg overflow-hidden">
                <div className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-micro font-bold bg-[#E7F3F5] text-[#007185] px-2 py-0.5 rounded">
                        {CATEGORY_LABELS[rfq.category]}
                      </span>
                      <span
                        className={`text-micro font-bold px-2 py-0.5 rounded capitalize ${
                          isFulfilled ? 'bg-[#E8F5E9] text-success' : 'bg-[#FEF8E7] text-ink'
                        }`}
                      >
                        {rfq.status}
                      </span>
                      <span className="text-mini text-ink-mute">
                        Posted {relative(rfq.createdAt)}
                      </span>
                    </div>

                    <h2 className="text-title font-bold text-ink leading-snug mb-1">
                      {rfq.title}
                    </h2>

                    {rfq.description && (
                      <p className="text-base text-ink-soft mb-2">{rfq.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-base text-ink-soft mt-2">
                      <span>Quantity: <strong>{rfq.requiredQuantity} {rfq.unit}</strong></span>
                      <span>Dates: <strong>{dateRange(rfq.startDateTime, rfq.endDateTime)}</strong></span>
                      {rfq.maxBudget && (
                        <span>Budget Cap: <strong className="text-success">{inr(rfq.maxBudget)}</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2 w-full md:w-auto">
                    <button
                      onClick={() => setOpenDrawerId(isOpen ? null : rfq._id)}
                      className="btn-secondary btn-pill text-base w-full md:w-auto"
                    >
                      {isOpen ? 'Hide Quotes' : `View Quotes (${rfq.proposalCount || 0})`}
                    </button>

                    {isFulfilled && rfq.resultingBooking && (
                      <Link
                        to={`/bookings/detail/${rfq.resultingBooking._id || rfq.resultingBooking}`}
                        className="a-link text-mini"
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
