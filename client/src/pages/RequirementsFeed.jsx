import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRequirementsFeed } from '../hooks/queries';
import ProposalModal from '../components/ProposalModal';
import { Spinner, EmptyState, Stars } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

export default function RequirementsFeed() {
  const [category, setCategory] = useState('all');
  const [radiusKm, setRadiusKm] = useState(50);
  const [urgency, setUrgency] = useState('all');
  const [selectedRfq, setSelectedRfq] = useState(null);

  const query = {
    category: category !== 'all' ? category : undefined,
    radiusKm,
    urgency: urgency !== 'all' ? urgency : undefined,
  };

  const { data, isLoading } = useRequirementsFeed(query);
  const requirements = data?.requirements || [];

  return (
    <div className="page-shell py-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-page font-normal">Supplier RFQ Feed</h1>
          <p className="text-base text-ink-soft">
            Live resource requirements posted by hospitality businesses nearby. Submit competitive quotations to monetize idle capacity.
          </p>
        </div>
        <Link to="/listings" className="btn-secondary btn-pill">
          Manage Your Listings
        </Link>
      </div>

      {/* Filter strip */}
      <div className="bg-white p-4 rounded border border-bd mb-4 flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-mini text-ink-soft mb-1 font-bold">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="a-select text-base"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-mini text-ink-soft mb-1 font-bold">Distance Radius</label>
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="a-select text-base"
          >
            <option value={15}>Within 15 km</option>
            <option value={30}>Within 30 km</option>
            <option value={50}>Within 50 km</option>
            <option value={100}>Within 100 km</option>
          </select>
        </div>

        <div>
          <label className="block text-mini text-ink-soft mb-1 font-bold">Urgency</label>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="a-select text-base"
          >
            <option value="all">Any Urgency</option>
            <option value="high">High Urgency</option>
            <option value="medium">Normal</option>
            <option value="low">Planning ahead</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Loading open requirements near you" />
      ) : requirements.length === 0 ? (
        <EmptyState
          title="No open requirements in this area"
          message="When seekers post requirements matching your category and location, they will appear here in real time."
        />
      ) : (
        <div className="space-y-4">
          {requirements.map((rfq) => {
            const seeker = rfq.seeker || {};
            const isUrgent = rfq.urgency === 'high';

            return (
              <div
                key={rfq._id}
                className="bg-white border border-bd rounded-lg p-5 flex flex-col md:flex-row gap-5 justify-between items-start hover:shadow-sm transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-micro font-bold bg-[#E7F3F5] text-[#007185] px-2 py-0.5 rounded">
                      {CATEGORY_LABELS[rfq.category]}
                    </span>
                    {isUrgent && (
                      <span className="text-micro font-bold bg-[#FDECEA] text-danger px-2 py-0.5 rounded">
                        Urgent Need
                      </span>
                    )}
                    {rfq.distanceKm != null && (
                      <span className="text-mini text-ink-soft">
                        📍 {rfq.distanceKm.toFixed(1)} km away ({rfq.location?.city || seeker.location?.city})
                      </span>
                    )}
                    <span className="text-mini text-ink-mute">· posted {relative(rfq.createdAt)}</span>
                  </div>

                  <h2 className="text-title font-bold text-ink leading-snug mb-1">
                    {rfq.title}
                  </h2>

                  {rfq.description && (
                    <p className="text-base text-ink-soft mb-3 line-clamp-2">
                      {rfq.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 px-3 bg-[#F7F8F8] rounded text-base mb-3">
                    <div>
                      <span className="text-mini text-ink-soft block">Required Quantity</span>
                      <span className="font-bold">
                        {rfq.requiredQuantity} {rfq.unit}{rfq.requiredQuantity > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-mini text-ink-soft block">Time Window</span>
                      <span className="font-bold text-mini">
                        {dateRange(rfq.startDateTime, rfq.endDateTime)}
                      </span>
                    </div>
                    <div>
                      <span className="text-mini text-ink-soft block">Budget Cap</span>
                      <span className="font-bold text-success">
                        {rfq.maxBudget ? inr(rfq.maxBudget) : 'Flexible'}
                      </span>
                    </div>
                    <div>
                      <span className="text-mini text-ink-soft block">Min. Capacity</span>
                      <span className="font-bold">
                        {rfq.minCapacity ? `${rfq.minCapacity} guests` : 'Any'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-base text-ink-soft">
                    <span>Seeker: <strong>{seeker.businessName || 'Verified Seeker'}</strong></span>
                    {seeker.ratingCount > 0 && (
                      <Stars rating={seeker.ratingAvg} count={seeker.ratingCount} size={12} />
                    )}
                  </div>
                </div>

                {/* Right side quote action */}
                <div className="w-full md:w-[220px] shrink-0 flex flex-col justify-between items-stretch md:items-end border-t md:border-t-0 md:border-l border-bd pt-3 md:pt-0 md:pl-5">
                  <div className="text-left md:text-right mb-3">
                    <span className="text-mini text-ink-soft block">Active Proposals</span>
                    <span className="text-title font-bold text-deal">
                      {rfq.proposalCount || 0} quote{rfq.proposalCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  {rfq.hasProposed ? (
                    <div className="p-2.5 bg-[#E8F5E9] border border-[#8CC98F] rounded text-center">
                      <span className="text-mini font-bold text-success block">Quote Submitted</span>
                      <span className="text-base font-bold text-ink">
                        {inr(rfq.myProposal?.quotedPrice)}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedRfq(rfq)}
                      className="btn-yellow btn-pill w-full text-base font-bold py-2"
                    >
                      Submit Quote
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedRfq && (
        <ProposalModal
          requirement={selectedRfq}
          isOpen={Boolean(selectedRfq)}
          onClose={() => setSelectedRfq(null)}
        />
      )}
    </div>
  );
}
