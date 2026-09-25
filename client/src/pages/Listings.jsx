import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart2, Pencil, Eye, Trash2, Pause, Play, Zap, ArrowRight, X } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useMyListings, useAnalytics } from '../hooks/queries';
import { Price, Stars, Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS, PRICE_UNIT_LABELS, resourceImage } from '../lib/constants';
import { inr, dateRange } from '../lib/format';

export default function Listings() {
  const { data, isLoading } = useMyListings();
  const { data: util } = useAnalytics('utilization', { days: 30 });
  const qc = useQueryClient();

  const listings = data?.resources || [];
  const utilByResource = Object.fromEntries(
    (util?.rows || []).map((r) => [String(r.resourceId), r])
  );

  const [selectedOpp, setSelectedOpp] = useState(null);
  const [respondQuote, setRespondQuote] = useState('');
  const [respondNotes, setRespondNotes] = useState('');
  const [responding, setResponding] = useState(false);

  const { data: recoveryData } = useQuery({
    queryKey: ['capacity-recovery-mine'],
    queryFn: async () => (await api.get('/capacity-recovery/mine')).data,
  });
  const opportunities = recoveryData?.opportunities || [];
  const recoveryAnalytics = recoveryData?.analytics;

  const handleRespondSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOpp) return;
    setResponding(true);
    try {
      await api.post(`/capacity-recovery/${selectedOpp._id}/respond`, {
        quotedPrice: Number(respondQuote),
        notes: respondNotes,
      });
      toast.success('Proposal submitted to seeker!');
      setSelectedOpp(null);
      qc.invalidateQueries({ queryKey: ['capacity-recovery-mine'] });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to respond to opportunity.'));
    } finally {
      setResponding(false);
    }
  };

  const toggleStatus = async (id, currentStatus, title) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/resources/${id}/status`, { status: nextStatus });
      toast.success(nextStatus === 'paused' ? `"${title}" paused` : `"${title}" reactivated`);
      qc.invalidateQueries({ queryKey: ['listings'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const archive = async (id, title) => {
    if (!window.confirm(`Archive "${title}"? This hides it from search and prevents new bookings. Existing confirmed bookings will remain protected.`)) return;
    try {
      await api.delete(`/resources/${id}`);
      toast.success('Listing archived');
      qc.invalidateQueries({ queryKey: ['listings'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  /* Utilization color */
  const utilColor = (pct) => {
    if (pct >= 70) return 'text-green-accent';
    if (pct >= 40) return 'text-amber-accent';
    return 'text-indigo';
  };

  return (
    <div className="shell pt-12 pb-20">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
        <div>
          <h1 className="h-page">Your listings</h1>
          <p className="text-sm muted mt-1">Manage and track your listed capacity.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/analytics" className="btn-secondary">
            <BarChart2 size={15} />
            Analytics
          </Link>
          <Link to="/listings/new" className="btn-primary">
            List a resource
          </Link>
        </div>
      </div>

      {/* ── Capacity Recovery Section (Deterministic) ── */}
      {opportunities.length > 0 && (
        <section className="mb-8 p-5 rounded-2xl border border-amber-500/30 bg-surface-alt/40">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-accent flex items-center justify-center">
                <Zap size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  Capacity Recovery
                  <span className="badge badge-amber text-xs font-semibold">
                    {opportunities.length} active
                  </span>
                </h2>
                <p className="text-xs text-ink-soft">
                  Deterministic opportunities matched against open buyer demand before time windows expire.
                </p>
              </div>
            </div>
            {recoveryAnalytics && (
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-ink-mute">Idle Recoverable: </span>
                  <span className="font-semibold text-ink">{recoveryAnalytics.idleCapacityIdentified} units</span>
                </div>
                <div>
                  <span className="text-ink-mute">Est. Recoverable: </span>
                  <span className="font-semibold text-amber-accent">{inr(recoveryAnalytics.estimatedRecoveredRevenue)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {opportunities.slice(0, 6).map((opp) => (
              <div
                key={opp._id}
                className="card p-4 rounded-xl border border-line bg-surface hover:border-amber-500/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink line-clamp-1">
                      {opp.resource?.title || 'Resource'}
                    </span>
                    <span className="badge badge-amber text-[10px] shrink-0 font-mono">
                      Priority {opp.recoveryPriorityScore}/100
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-ink-soft my-2.5">
                    <p>
                      <strong className="text-ink">Idle: </strong>
                      {dateRange(opp.opportunityStart, opp.opportunityEnd)}
                    </p>
                    <p>
                      <strong className="text-ink">Recoverable: </strong>
                      {opp.availableQuantity} {opp.resource?.unit || 'units'}
                      {opp.resource?.capacity ? ` (cap: ${opp.resource.capacity})` : ''}
                    </p>
                    <div className="border-t border-line/60 pt-1.5">
                      <p className="text-ink font-medium">Matched Demand:</p>
                      <p className="text-ink-soft line-clamp-1">{opp.requirement?.title}</p>
                      <p className="text-[11px] text-ink-mute">
                        Needs {opp.requiredQuantity} {opp.requirement?.unit || 'units'}
                        {opp.distanceKm != null ? ` · ${opp.distanceKm} km away` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-line/60 flex items-center justify-between gap-2 mt-2">
                  <div className="text-xs">
                    <span className="text-ink-mute">Potential Util: </span>
                    <span className="font-bold text-green-accent">{opp.utilizationGain}%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOpp(opp);
                      setRespondQuote(opp.estimatedRevenue || opp.requirement?.maxPrice || '');
                      setRespondNotes('');
                    }}
                    className="btn-secondary btn-sm text-xs gap-1 inline-flex items-center"
                  >
                    View Opportunity <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isLoading ? (
        <Spinner label="Loading your listings" />
      ) : listings.length === 0 ? (
        <EmptyState
          title="You have not listed anything yet"
          message="Turn idle capacity into revenue — list a hall, a vehicle, spare furniture or kitchen hours."
          action={
            <Link to="/listings/new" className="btn-primary">
              List your first resource
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {listings.map((r) => {
            const stats = utilByResource[String(r._id)];
            return (
              <div
                key={r._id}
                className="card-interactive p-4 flex gap-4 items-start"
              >
                {/* Image */}
                <Link to={`/r/${r._id}`} className="shrink-0">
                  <img
                    src={resourceImage(r)}
                    alt={r.title}
                    className="w-[110px] h-[110px] object-cover rounded-lg border border-line transition-transform duration-300 hover:scale-[1.03]"
                  />
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <Link to={`/r/${r._id}`} className="text-lg font-semibold link block leading-snug">
                        {r.title}
                      </Link>
                      <p className="text-sm text-ink-soft mt-0.5">
                        {CATEGORY_LABELS[r.category]} · {r.totalQuantity} {r.unit}
                        {r.totalQuantity > 1 ? 's' : ''}
                        {r.capacity ? ` · capacity ${r.capacity}` : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Price
                          amount={r.pricing?.basePrice}
                          unit={PRICE_UNIT_LABELS[r.pricing?.priceUnit]}
                          size="sm"
                        />
                        {r.ratingCount > 0 && <Stars rating={r.ratingAvg} count={r.ratingCount} size={13} />}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {r.status === 'active' && (
                          <span className="badge badge-green text-xs capitalize">Active</span>
                        )}
                        {r.status === 'paused' && (
                          <span className="badge badge-amber text-xs capitalize">Paused</span>
                        )}
                        {r.status === 'archived' && (
                          <span className="badge badge-red text-xs capitalize">Archived</span>
                        )}
                        {r.availabilityMode && (
                          <span className="text-xs text-ink-mute capitalize">
                            • {r.availabilityMode.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Performance stats */}
                    {stats && (
                      <div className="hidden sm:block shrink-0 bg-surface-sunk/60 dark:bg-surface-sunk/80 rounded-xl p-3 min-w-[140px] text-sm border border-line/60">
                        <p className="text-ink-mute text-xs uppercase tracking-wide mb-2 font-medium">Last 30 days</p>
                        <p>
                          <span className={`text-lg font-bold ${utilColor(stats.utilization)}`}>
                            {stats.utilization ?? 0}%
                          </span>
                          <span className="text-ink-mute text-xs ml-1">utilised</span>
                        </p>
                        <p className="text-ink-soft text-xs mt-0.5">{stats.bookings ?? 0} bookings</p>
                        <p className="text-ink-soft text-xs">{inr(stats.revenue ?? 0)} earned</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Link to={`/listings/${r._id}/edit`} className="btn-secondary btn-sm gap-1">
                      <Pencil size={12} />
                      Edit
                    </Link>
                    <Link to={`/r/${r._id}`} className="btn-secondary btn-sm gap-1">
                      <Eye size={12} />
                      View
                    </Link>
                    {r.status === 'active' && (
                      <button
                        onClick={() => toggleStatus(r._id, r.status, r.title)}
                        className="btn-secondary btn-sm gap-1 text-amber-accent hover:text-amber-500"
                        title="Temporarily pause listing without affecting existing bookings"
                      >
                        <Pause size={12} />
                        Pause
                      </button>
                    )}
                    {r.status === 'paused' && (
                      <button
                        onClick={() => toggleStatus(r._id, r.status, r.title)}
                        className="btn-secondary btn-sm gap-1 text-green-accent hover:text-green-500"
                        title="Reactivate listing to accept new bookings"
                      >
                        <Play size={12} />
                        Reactivate
                      </button>
                    )}
                    {r.status !== 'archived' && (
                      <button
                        onClick={() => archive(r._id, r.title)}
                        className="btn-danger btn-sm gap-1"
                        title="Archive listing safely"
                      >
                        <Trash2 size={12} />
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Opportunity Detail Modal ── */}
      {selectedOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-xl w-full p-6 border-line bg-surface shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedOpp(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-ink-mute hover:text-ink hover:bg-surface-sunk"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-accent">
                Capacity Recovery Opportunity
              </span>
              <span className="text-xs font-mono text-ink-mute">
                Priority: {selectedOpp.recoveryPriorityScore}/100
              </span>
            </div>

            <h3 className="text-lg font-bold text-ink mb-1">
              {selectedOpp.resource?.title}
            </h3>
            <p className="text-xs text-ink-soft mb-4">
              Window: {dateRange(selectedOpp.opportunityStart, selectedOpp.opportunityEnd)}
              {selectedOpp.hoursUntilExpiry != null && ` · Expires in ~${selectedOpp.hoursUntilExpiry}h`}
            </p>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5 text-xs">
              <div className="p-2.5 rounded-xl bg-surface-sunk/60 border border-line">
                <p className="text-ink-mute text-[10px] uppercase">Unused Capacity</p>
                <p className="text-sm font-bold text-ink mt-0.5">{selectedOpp.availableQuantity} units</p>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-sunk/60 border border-line">
                <p className="text-ink-mute text-[10px] uppercase">Matched Demand</p>
                <p className="text-sm font-bold text-ink mt-0.5">{selectedOpp.requiredQuantity} units</p>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-sunk/60 border border-line">
                <p className="text-ink-mute text-[10px] uppercase">Utilization Gain</p>
                <p className="text-sm font-bold text-green-accent mt-0.5">{selectedOpp.utilizationGain}%</p>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-sunk/60 border border-line">
                <p className="text-ink-mute text-[10px] uppercase">Potential Revenue</p>
                <p className="text-sm font-bold text-brand mt-0.5">{inr(selectedOpp.estimatedRevenue)}</p>
              </div>
            </div>

            {/* Transparent Score Breakdown */}
            <div className="p-3 rounded-xl bg-surface-sunk/40 border border-line mb-5 text-xs space-y-1.5">
              <p className="font-semibold text-ink flex items-center justify-between">
                <span>Deterministic Recovery Priority Score:</span>
                <span className="font-mono text-amber-accent">{selectedOpp.recoveryPriorityScore}/100</span>
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-soft">
                <div>• Urgency ({selectedOpp.hoursUntilExpiry}h to start): <span className="text-ink font-medium">{selectedOpp.scoreBreakdown?.urgencyScore ?? 0}/25</span></div>
                <div>• Demand Fit: <span className="text-ink font-medium">{selectedOpp.scoreBreakdown?.demandFitScore ?? 0}/35</span></div>
                <div>• Utilization Gain ({selectedOpp.utilizationGain}%): <span className="text-ink font-medium">{selectedOpp.scoreBreakdown?.utilizationScore ?? 0}/20</span></div>
                <div>• Distance ({selectedOpp.distanceKm ?? 0} km): <span className="text-ink font-medium">{selectedOpp.scoreBreakdown?.distanceScore ?? 0}/10</span></div>
                <div>• Budget Compatibility: <span className="text-ink font-medium">{selectedOpp.scoreBreakdown?.budgetScore ?? 0}/10</span></div>
              </div>
            </div>

            {/* Matched Requirement Detail */}
            <div className="p-3.5 rounded-xl border border-line bg-surface mb-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-ink">{selectedOpp.requirement?.title}</p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Category: {CATEGORY_LABELS[selectedOpp.requirement?.category] || selectedOpp.requirement?.category}
                    {selectedOpp.requirement?.location?.address ? ` · ${selectedOpp.requirement.location.address}` : ''}
                  </p>
                  {selectedOpp.requirement?.maxPrice && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      Buyer Budget: <span className="text-ink font-medium">{inr(selectedOpp.requirement.maxPrice)}</span>
                    </p>
                  )}
                </div>
                <Link
                  to={`/requirements/${selectedOpp.requirement?._id}`}
                  className="btn-ghost btn-sm text-xs shrink-0"
                >
                  View Requirement
                </Link>
              </div>
            </div>

            {/* Quick Proposal Form */}
            <form onSubmit={handleRespondSubmit} className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                Respond to Matched Requirement
              </h4>
              <p className="text-xs text-ink-soft">
                Submits an RFQ proposal directly to the seeker reusing standard proposal negotiation.
              </p>
              <div>
                <label className="text-xs font-medium text-ink block mb-1">
                  Quoted Price (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={respondQuote}
                  onChange={(e) => setRespondQuote(e.target.value)}
                  className="input input-sm w-full"
                  placeholder="e.g. 15000"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink block mb-1">
                  Message / Terms (Optional)
                </label>
                <textarea
                  rows="2"
                  value={respondNotes}
                  onChange={(e) => setRespondNotes(e.target.value)}
                  className="input input-sm w-full resize-none"
                  placeholder="Special offers, setup times, or flexibility..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOpp(null)}
                  className="btn-ghost btn-sm"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={responding}
                  className="btn-primary btn-sm inline-flex items-center gap-1.5"
                >
                  {responding ? 'Submitting…' : 'Submit Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
