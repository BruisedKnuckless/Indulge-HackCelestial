import React from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Check,
  Scale,
  ShieldCheck,
  MapPin,
  Calendar,
  Truck,
  Star,
  Award,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { inr, dateRange, relative } from '../../lib/format';
import { resourceImage, CATEGORY_LABELS } from '../../lib/constants';
import { Stars } from '../ui';

/**
 * Computes haversine distance in km between two coordinate pairs [lng, lat] or { lat, lng }
 */
function computeDistanceKm(c1, c2) {
  if (!c1 || !c2) return null;
  const lat1 = Array.isArray(c1) ? c1[1] : c1.lat;
  const lon1 = Array.isArray(c1) ? c1[0] : c1.lng;
  const lat2 = Array.isArray(c2) ? c2[1] : c2.lat;
  const lon2 = Array.isArray(c2) ? c2[0] : c2.lng;

  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export default function ProposalComparisonModal({
  isOpen,
  onClose,
  requirement,
  candidates = [],
  onAccept,
  isOwner,
  busyId,
}) {
  if (!isOpen) return null;

  const targetBudget = requirement?.maxPrice || requirement?.maxBudget;
  const seekerCoords = requirement?.location?.coordinates;
  const reqQty = requirement?.requiredQuantity || requirement?.quantity || 1;

  // Find lowest price and nearest distance for neutral informational badges
  const prices = candidates.map((c) => c.price).filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;

  const distances = candidates
    .map((c) => {
      const pCoords = c.resource?.location?.coordinates || c.provider?.location?.coordinates;
      return computeDistanceKm(seekerCoords, pCoords);
    })
    .filter((d) => d != null);
  const minDistance = distances.length ? Math.min(...distances) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/65 backdrop-blur-sm animate-in fade-in"
    >
      <div className="card w-full max-w-6xl max-h-[92vh] flex flex-col p-0 overflow-hidden border-line bg-surface shadow-2xl rounded-2xl">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-line bg-surface-sunk/40 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo/10 text-indigo border border-indigo/25">
                <Scale size={13} />
                RFQ Proposal Comparison
              </span>
              <span className="text-xs text-ink-mute">
                {candidates.length} Candidate{candidates.length === 1 ? '' : 's'} Submitted
              </span>
            </div>
            <h2 id="comparison-dialog-title" className="text-xl sm:text-2xl font-bold text-ink truncate">
              Compare Proposals for “{requirement?.title}”
            </h2>
            <p className="text-xs sm:text-sm text-ink-soft mt-1">
              Objective side-by-side evaluation across quote price, supplier proximity, availability, and positive contribution telemetry.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close proposal comparison"
            className="p-2 rounded-xl text-ink-mute hover:text-ink hover:bg-surface-sunk transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* User-Driven Decision Note (No AI Winner) */}
        <div className="px-5 sm:px-6 py-2.5 bg-brand/5 border-b border-brand/15 text-xs text-ink flex items-center gap-2">
          <AlertCircle size={15} className="text-brand shrink-0" />
          <span>
            <strong>User-Driven Decision:</strong> All data reflects verified provider capability and live inventory. No algorithmic or automated winner is selected — choose the proposal that best matches your organization’s operational priorities.
          </span>
        </div>

        {/* Horizontal Comparison Matrix Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-5 sm:p-6">
          <div className="min-w-[700px] border border-line rounded-xl overflow-hidden bg-surface">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-sunk/60">
                  <th className="p-4 text-xs font-bold text-ink-mute uppercase tracking-wider w-48 shrink-0 sticky left-0 bg-surface-sunk z-10 border-r border-line">
                    Evaluation Metric
                  </th>
                  {candidates.map((c, i) => {
                    const isMin = minPrice != null && c.price === minPrice;
                    return (
                      <th key={c._id || i} className="p-4 min-w-[240px] align-top border-r last:border-r-0 border-line">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-ink-mute">
                              Candidate {String.fromCharCode(65 + i)}
                            </span>
                            {isMin && (
                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                                Lowest Quote
                              </span>
                            )}
                          </div>
                          <Link
                            to={`/provider/${c.provider?._id}`}
                            className="font-bold text-base text-ink hover:underline block leading-snug"
                          >
                            {c.provider?.businessName}
                          </Link>
                          {c.resource && (
                            <div className="flex items-center gap-2 text-xs text-ink-soft">
                              <img
                                src={resourceImage(c.resource)}
                                alt={c.resource.title}
                                className="w-8 h-8 rounded object-cover border border-line shrink-0"
                              />
                              <span className="truncate font-medium">{c.resource.title}</span>
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs">
                {/* 1. Total Price & Budget Variance */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Quoted Total Price
                  </td>
                  {candidates.map((c, i) => {
                    const variance = targetBudget ? c.price - targetBudget : null;
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        <div className="space-y-1">
                          <p className="text-lg font-bold text-ink">{inr(c.price)}</p>
                          {variance != null && (
                            <p
                              className={`text-[11px] font-medium ${
                                variance <= 0 ? 'text-emerald-500' : 'text-danger'
                              }`}
                            >
                              {variance <= 0
                                ? `Within budget by ${inr(Math.abs(variance))}`
                                : `Over budget by ${inr(variance)}`}
                            </p>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 2. Effective Unit Rate */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Effective Unit Rate
                  </td>
                  {candidates.map((c, i) => {
                    const unitPrice = reqQty > 0 ? Math.round(c.price / reqQty) : c.price;
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line text-ink-soft">
                        <span className="font-semibold text-ink">{inr(unitPrice)}</span> / {requirement?.unit || 'unit'}
                      </td>
                    );
                  })}
                </tr>

                {/* 3. Proximity & Geographic Distance */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Proximity & Distance
                  </td>
                  {candidates.map((c, i) => {
                    const pCoords = c.resource?.location?.coordinates || c.provider?.location?.coordinates;
                    const distKm = computeDistanceKm(seekerCoords, pCoords);
                    const isClosest = minDistance != null && distKm === minDistance;
                    const city = c.resource?.location?.city || c.provider?.location?.city || 'Local Area';

                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <MapPin size={13} className="text-indigo shrink-0" />
                          <span className="font-semibold text-ink">
                            {distKm != null ? `${distKm} km away` : 'Within radius'}
                          </span>
                          {isClosest && distKm != null && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo/10 text-indigo font-bold">
                              Nearest
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-mute mt-0.5">{city}</p>
                      </td>
                    );
                  })}
                </tr>

                {/* 4. Availability & Delivery Timing */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Availability Window
                  </td>
                  {candidates.map((c, i) => {
                    const start = c.proposedStart || requirement?.startDateTime;
                    const end = c.proposedEnd || requirement?.endDateTime;
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        <div className="flex items-start gap-1.5">
                          <Calendar size={13} className="text-teal shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-ink">{dateRange(start, end)}</p>
                            <p className="text-[11px] text-ink-mute mt-0.5">Ready for requested timeline</p>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 5. Trust Tier & Contribution Standing */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Trust Tier & Status
                  </td>
                  {candidates.map((c, i) => {
                    const tier = c.provider?.reputation?.tier || 'Established';
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-brand shrink-0" />
                          <span className="font-bold text-ink uppercase tracking-wide text-[11px]">
                            {tier} Provider
                          </span>
                        </div>
                        {c.provider?.reputation?.positiveContributionScore != null && (
                          <p className="text-[11px] text-ink-mute mt-0.5">
                            Contribution score: <strong>{c.provider.reputation.positiveContributionScore}</strong>/100
                          </p>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* 6. Historical Fulfillment Rate */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Fulfillment Rate
                  </td>
                  {candidates.map((c, i) => {
                    const rate = c.provider?.reputation?.fulfillmentRate;
                    const pct = rate != null ? Math.round(rate * 100) : 100;
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-ink">{pct}%</span>
                          <span className="text-[10px] text-ink-mute">verified delivery</span>
                        </div>
                        <div className="w-full bg-surface-sunk rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 7. Ratings & Customer Feedback */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Quality Rating
                  </td>
                  {candidates.map((c, i) => {
                    const ratingAvg = c.provider?.ratingAvg || 0;
                    const count = c.provider?.ratingCount || 0;
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        {count > 0 ? (
                          <div className="space-y-0.5">
                            <Stars rating={ratingAvg} count={count} size={13} />
                            <p className="text-[11px] text-ink-mute">{count} review{count === 1 ? '' : 's'}</p>
                          </div>
                        ) : (
                          <span className="text-ink-mute italic">No reviews yet</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* 8. Contribution Badges */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Platform Badges
                  </td>
                  {candidates.map((c, i) => {
                    const badges = c.provider?.reputation?.badges || [];
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        {badges.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {badges.map((b, bIdx) => (
                              <span
                                key={bIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-sunk text-ink border border-line"
                              >
                                <Award size={10} className="text-amber-500" />
                                {typeof b === 'string' ? b : b.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-ink-mute italic">Standard account</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* 9. Logistics & Delivery */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Logistics Handling
                  </td>
                  {candidates.map((c, i) => {
                    const isTransportNeeded = ['furniture', 'av_equipment', 'vehicle'].includes(c.resource?.category);
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        <div className="flex items-center gap-1.5 text-ink-soft">
                          <Truck size={13} className="text-indigo shrink-0" />
                          <span>
                            {isTransportNeeded ? 'Transport dispatch eligible' : 'On-site / Self-service'}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 10. Provider Message / Notes */}
                <tr className="hover:bg-surface-sunk/30">
                  <td className="p-4 font-semibold text-ink sticky left-0 bg-surface z-10 border-r border-line">
                    Notes & Terms
                  </td>
                  {candidates.map((c, i) => {
                    const notes = c.message || c.notes;
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        {notes ? (
                          <p className="text-ink-soft italic leading-relaxed">“{notes}”</p>
                        ) : (
                          <span className="text-ink-mute">Standard marketplace terms</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* 11. Action: Direct Accept */}
                <tr className="bg-surface-sunk/40">
                  <td className="p-4 font-bold text-ink sticky left-0 bg-surface-sunk z-10 border-r border-line">
                    Select Decision
                  </td>
                  {candidates.map((c, i) => {
                    const isAccepted = c.status === 'accepted';
                    const isBusy = busyId === c._id;
                    return (
                      <td key={c._id || i} className="p-4 border-r last:border-r-0 border-line">
                        {isAccepted ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500">
                            <Check size={14} /> Accepted Offer
                          </span>
                        ) : isOwner && requirement?.status === 'open' ? (
                          <button
                            type="button"
                            onClick={() => onAccept(c._id)}
                            disabled={Boolean(busyId)}
                            className="btn-primary btn-sm w-full justify-center inline-flex items-center gap-1.5 shadow-sm"
                          >
                            {isBusy ? (
                              'Accepting…'
                            ) : (
                              <>
                                <span>Accept Candidate {String.fromCharCode(65 + i)}</span>
                                <ArrowRight size={13} />
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-ink-mute text-xs">Closed</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-line bg-surface-sunk/20 flex items-center justify-between text-xs text-ink-mute">
          <span>Comparing {candidates.length} candidate proposals</span>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary btn-sm"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
