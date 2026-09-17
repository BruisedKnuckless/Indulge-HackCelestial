import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRight } from 'lucide-react';
import { useRequirementsFeed } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import ProposalModal from '../components/ProposalModal';
import { Spinner, EmptyState, Stars } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

export default function RequirementsFeed() {
  const { user } = useAuth();
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
    <div className="shell pt-12 pb-20">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="badge badge-indigo">
              Marketplace Demand Feed
            </span>
          </div>
          <h1 className="h-page">Supplier RFQ Feed</h1>
          <p className="text-sm muted mt-1 max-w-2xl">
            Live resource requirements posted by other hospitality businesses nearby. Submit competitive quotations to monetize idle capacity.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link to="/requirements" className="btn-secondary">
            My Requirements
          </Link>
          <Link to="/listings" className="btn-secondary">
            Manage Listings
          </Link>
        </div>
      </div>

      {/* Distinction helper banner */}
      <div className="p-3.5 mb-6 bg-surface-sunk/70 border border-line rounded-lg text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <span className="text-ink-soft">
          Need resources, spaces, or equipment for <strong>your own business</strong>?
        </span>
        <Link
          to="/requirements"
          className="font-medium text-ink hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>Go to My Requirements Workspace</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Filter strip */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-4">
        <div>
          <label className="label text-xs">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="field-select text-xs h-9"
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
          <label className="label text-xs">Distance Radius</label>
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="field-select text-xs h-9"
          >
            <option value={15}>Within 15 km</option>
            <option value={30}>Within 30 km</option>
            <option value={50}>Within 50 km</option>
            <option value={100}>Within 100 km</option>
          </select>
        </div>

        <div>
          <label className="label text-xs">Urgency</label>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="field-select text-xs h-9"
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
                className="card-interactive p-5 flex flex-col md:flex-row gap-5 justify-between items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="badge badge-indigo">
                      {CATEGORY_LABELS[rfq.category]}
                    </span>
                    {isUrgent && (
                      <span className="badge badge-red">
                        Urgent Need
                      </span>
                    )}
                    {rfq.distanceKm != null && (
                      <span className="text-xs text-ink-soft inline-flex items-center gap-1">
                        <MapPin size={11} className="shrink-0 text-ink-mute" />
                        <span>{rfq.distanceKm.toFixed(1)} km away ({rfq.location?.city || seeker.location?.city})</span>
                      </span>
                    )}
                    <span className="text-xs text-ink-mute">· posted {relative(rfq.createdAt)}</span>
                  </div>

                  <h2 className="text-lg font-semibold text-ink leading-snug mb-1">
                    <Link to={`/requirements/${rfq._id}`} className="hover:underline">
                      {rfq.title}
                    </Link>
                  </h2>

                  {rfq.description && (
                    <p className="text-sm muted mb-3 line-clamp-2">
                      {rfq.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2.5 px-3 bg-surface-sunk rounded-lg text-xs mb-3 border border-line">
                    <div>
                      <span className="text-ink-mute block">Required Quantity</span>
                      <span className="font-semibold text-ink">
                        {rfq.requiredQuantity} {rfq.unit}{rfq.requiredQuantity > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-mute block">Time Window</span>
                      <span className="font-semibold text-ink">
                        {dateRange(rfq.startDateTime, rfq.endDateTime)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-mute block">Budget Cap</span>
                      <span className="font-semibold text-success">
                        {rfq.maxBudget ? inr(rfq.maxBudget) : 'Flexible'}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-mute block">Min. Capacity</span>
                      <span className="font-semibold text-ink">
                        {rfq.minCapacity ? `${rfq.minCapacity} guests` : 'Any'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-ink-soft">
                    <span>
                      Seeker:{' '}
                      <Link
                        to={`/provider/${seeker._id}`}
                        className="font-semibold text-ink hover:text-accent transition-colors"
                      >
                        {seeker.businessName || 'Verified Seeker'}
                      </Link>
                    </span>
                    {seeker.ratingCount > 0 && (
                      <Stars rating={seeker.ratingAvg} count={seeker.ratingCount} size={12} />
                    )}
                  </div>
                </div>

                {/* Right side quote action */}
                <div className="w-full md:w-[220px] shrink-0 flex flex-col justify-between items-stretch md:items-end border-t md:border-t-0 md:border-l border-line pt-3 md:pt-0 md:pl-5">
                  <div className="text-left md:text-right mb-3">
                    <span className="text-xs text-ink-mute block">Active Proposals</span>
                    <span className="text-base font-semibold text-ink">
                      {rfq.proposalCount || 0} quote{rfq.proposalCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  {user && String(seeker._id || seeker) === String(user._id) ? (
                    <div className="p-2.5 bg-surface-sunk border border-line rounded-lg text-center w-full">
                      <span className="text-xs font-semibold text-ink-soft block">Your Requirement</span>
                      <Link to={`/requirements/${rfq._id}`} className="text-xs link mt-1 block">
                        Manage in Workspace →
                      </Link>
                    </div>
                  ) : rfq.hasProposed ? (
                    <div className="p-2.5 bg-success/10 border border-success/30 rounded-lg text-center w-full">
                      <span className="text-xs font-semibold text-success block">Quote Submitted</span>
                      <span className="text-sm font-semibold text-ink">
                        {inr(rfq.myProposal?.quotedPrice)}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedRfq(rfq)}
                      className="btn-primary w-full text-xs font-medium py-2"
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
