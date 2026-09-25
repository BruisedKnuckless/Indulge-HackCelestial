import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Pencil, Check, Layers, ChevronRight, Truck, Package, ShieldCheck, AlertCircle, X, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirement, useRequirementActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../api/client';
import { Spinner, Stars, Price, Alert, EmptyState } from '../components/ui';
import { CATEGORY_LABELS, resourceImage } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

const LABEL_CONFIG = {
  CHEAPEST: { text: 'Cheapest', color: 'badge-emerald text-emerald-400 bg-emerald-950/40 border border-emerald-800/40' },
  NEAREST: { text: 'Nearest', color: 'badge-indigo text-indigo-400 bg-indigo-950/40 border border-indigo-800/40' },
  FEWEST_SUPPLIERS: { text: 'Fewest Suppliers', color: 'badge-purple text-purple-400 bg-purple-950/40 border border-purple-800/40' },
  WITHIN_BUDGET: { text: 'Within Budget', color: 'badge-teal text-teal-400 bg-teal-950/40 border border-teal-800/40' },
  FULLY_FULFILLED: { text: '100% Fulfilled', color: 'badge-blue text-blue-400 bg-blue-950/40 border border-blue-800/40' },
  PARTIALLY_FULFILLED: { text: 'Partial Fulfillment', color: 'badge-amber text-amber-400 bg-amber-950/40 border border-amber-800/40' },
  BEST_OPERATIONAL_FIT: { text: 'Best Operational Fit', color: 'badge-accent font-bold text-amber-300 bg-amber-950/50 border border-amber-500/40' },
};

export default function RequirementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useRequirement(id);
  const { acceptOffer, withdrawOffer, close, cancel } = useRequirementActions();
  const [busy, setBusy] = useState('');
  const [confirmingPlan, setConfirmingPlan] = useState(null);

  const r = data?.requirement;
  const isOwner = String(r?.seeker?._id) === String(user?._id);

  const { data: procData, isLoading: procLoading } = useQuery({
    queryKey: ['requirement-procurement-options', id],
    queryFn: async () => {
      const res = await api.get(`/requirements/${id}/procurement-options`);
      return res.data;
    },
    enabled: Boolean(isOwner && r?.status === 'open'),
  });

  const selectPlanMutation = useMutation({
    mutationFn: async (plan) => {
      const res = await api.post(`/requirements/${id}/select-procurement-plan`, { plan });
      return res.data;
    },
    onSuccess: (resData) => {
      toast.success(resData?.message || 'Procurement option selected!');
      qc.invalidateQueries({ queryKey: ['requirement', id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const executePlanMutation = useMutation({
    mutationFn: async (plan) => {
      const res = await api.post(`/requirements/${id}/execute-procurement-plan`, { plan });
      return res.data;
    },
    onSuccess: (resData) => {
      toast.success(resData?.message || 'Procurement plan executed successfully!');
      qc.invalidateQueries({ queryKey: ['requirement', id] });
      setConfirmingPlan(null);
      if (resData?.procurementOrder?._id) {
        navigate(`/procurement-orders/${resData.procurementOrder._id}`);
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <Spinner label="Loading requirement" />;

  if (!r) return <div className="shell pt-12 pb-20">Requirement not found.</div>;

  const offers = r.offers || [];
  const liveOffers = offers.filter((o) => o.status === 'offered');

  const accept = async (offerId) => {
    setBusy(offerId);
    try {
      const { booking } = await acceptOffer.mutateAsync({ id, offerId });
      toast.success('Offer accepted — booking created');
      navigate(`/bookings/detail/${booking._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not accept the offer.'));
    } finally {
      setBusy('');
    }
  };

  const withdraw = async (offerId) => {
    setBusy(offerId);
    try {
      await withdrawOffer.mutateAsync({ id, offerId });
      toast.success('Offer withdrawn');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const closeIt = async () => {
    if (!window.confirm('Close this requirement? Providers will no longer be able to offer.')) return;
    try {
      await close.mutateAsync(id);
      toast.success('Requirement closed');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const cancelIt = async () => {
    if (!window.confirm('Cancel this requirement? It will be marked as cancelled.')) return;
    try {
      await cancel.mutateAsync(id);
      toast.success('Requirement cancelled');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="shell pt-12 pb-20 max-w-[900px]">
      <p className="text-xs text-ink-soft mb-3">
        <Link to={isOwner ? '/requirements' : '/requirements/feed'} className="link">
          {isOwner ? 'My Requirements' : 'Supplier RFQ Feed'}
        </Link>
        {' › '}
        <span>{r.title}</span>
      </p>

      <header className="pb-8 border-b border-line">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="tag capitalize">{r.status}</span>
              {r.urgency === 'high' && r.status === 'open' && (
                <span className="text-xs text-danger">Urgent</span>
              )}
            </div>
            <h1 className="h-page">{r.title}</h1>
            <p className="text-sm muted mt-3">
              {CATEGORY_LABELS[r.category]} · qty {r.quantity} ·{' '}
              {dateRange(r.startDateTime, r.endDateTime)}
              {r.maxPrice ? ` · budget ${inr(r.maxPrice)}` : ''}
              {r.minCapacity ? ` · capacity ${r.minCapacity}+` : ''}
              {r.radiusKm ? ` · within ${r.radiusKm} km` : ''}
            </p>
            {r.additionalConstraints && (
              <p className="text-xs text-accent mt-1.5 font-medium">
                Constraints: {r.additionalConstraints}
              </p>
            )}
            <p className="text-sm muted mt-1">
              Posted by{' '}
              <Link to={`/provider/${r.seeker?._id}`} className="link-quiet font-medium hover:text-ink">
                {r.seeker?.businessName}
              </Link>
              {' '}· {relative(r.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isOwner && r.status === 'open' && (
              <Link
                to={`/requirements/${r._id}/edit`}
                className="btn-secondary btn-sm gap-1.5 inline-flex items-center"
              >
                <Pencil size={13} />
                <span>Edit</span>
              </Link>
            )}
            {isOwner && r.status === 'open' && (
              <Link
                to={`/s?requirementId=${r._id}`}
                className="btn-primary btn-sm gap-1.5 inline-flex items-center"
              >
                <span>Find matches</span>
                <span aria-hidden>→</span>
              </Link>
            )}
            {isOwner && r.status === 'open' && (
              <button onClick={closeIt} className="btn-ghost btn-sm">
                Close
              </button>
            )}
            {isOwner && r.status === 'open' && (
              <button onClick={cancelIt} className="btn-ghost btn-sm text-danger hover:text-danger">
                Cancel
              </button>
            )}
          </div>
        </div>

        {r.description && <p className="text-base muted mt-5 max-w-prose">{r.description}</p>}
      </header>

      {r.status === 'fulfilled' && (
        <Alert tone="success" className="mt-8">
          This requirement was fulfilled.{' '}
          {r.fulfilledBooking && (
            <Link to={`/bookings/detail/${r.fulfilledBooking}`} className="link">
              View the booking
            </Link>
          )}
        </Alert>
      )}

      {/* ── Procurement Options (Deterministic Order-Splitting & Trade-Offs) ── */}
      {isOwner && r.status === 'open' && (
        <section className="mt-10 pb-8 border-b border-line">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-indigo" />
                <h2 className="h-section text-xl font-bold text-ink">Procurement Options</h2>
              </div>
              <p className="text-xs text-ink-soft mt-0.5">
                Deterministic multi-supplier allocation and single-provider strategies based on true capacity.
              </p>
            </div>
            {procData?.options?.length > 0 && (
              <span className="badge badge-indigo text-xs">
                {procData.options.length} feasible strateg{procData.options.length === 1 ? 'y' : 'ies'}
              </span>
            )}
          </div>

          {r.procurementOrder && (
            <div className="card p-4 mb-5 border-line bg-surface-sunk/60 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/10 text-green-accent flex items-center justify-center shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">Grouped Procurement Order Active</p>
                  <p className="text-xs text-ink-soft">
                    Multi-provider inventory has been secured across child bookings.
                  </p>
                </div>
              </div>
              <Link
                to={`/procurement-orders/${r.procurementOrder._id || r.procurementOrder}`}
                className="btn-primary btn-sm text-xs inline-flex items-center gap-1"
              >
                View Grouped Order <ArrowRight size={12} />
              </Link>
            </div>
          )}

          {procLoading ? (
            <div className="p-8 text-center text-xs text-ink-soft">
              <Spinner label="Evaluating feasible supplier combinations…" />
            </div>
          ) : !procData?.options || procData.options.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-line bg-surface-alt/30 text-center text-xs text-ink-soft">
              No matching supplier has bookable stock for this requirement window. Providers can submit custom quotes in the section below.
            </div>
          ) : (
            <div className="space-y-4">
              {procData.options.map((opt, index) => (
                <div
                  key={opt.id}
                  className={`card p-5 rounded-2xl border transition-all ${
                    r.selectedProcurementPlan?.id === opt.id
                      ? 'border-green-500/50 bg-green-950/10'
                      : 'border-line bg-surface-alt/40 hover:border-line-hard'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase font-mono font-bold tracking-wider text-ink-mute">
                          OPTION {String.fromCharCode(65 + index)}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            opt.type === 'single'
                              ? 'bg-indigo/20 text-indigo border border-indigo/30'
                              : opt.type === 'split'
                              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {opt.type === 'single'
                            ? 'Single Supplier'
                            : opt.type === 'split'
                            ? 'Split Fulfillment'
                            : 'Partial Fulfillment'}
                        </span>
                      </div>
                      <p className="text-base font-bold text-ink mt-1">
                        {opt.fulfilledQuantity} / {opt.requestedQuantity} {r.unit || 'units'} fulfilled
                        <span className="text-xs font-normal text-ink-soft ml-2">
                          ({opt.fulfillmentPercentage}%)
                        </span>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-ink">{inr(opt.totalPrice)}</p>
                      {opt.budgetVariance != null && (
                        <p
                          className={`text-xs font-medium ${
                            opt.budgetVariance <= 0 ? 'text-green-accent' : 'text-danger'
                          }`}
                        >
                          {opt.budgetVariance <= 0
                            ? `Within budget by ${inr(Math.abs(opt.budgetVariance))}`
                            : `Over budget by ${inr(opt.budgetVariance)}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Metrics row */}
                  <div className="flex items-center gap-3 text-xs text-ink-soft flex-wrap border-y border-line/60 py-2.5 my-3">
                    <span>
                      <strong>{opt.supplierCount}</strong> supplier{opt.supplierCount === 1 ? '' : 's'}
                    </span>
                    <span>·</span>
                    <span>
                      <strong>{opt.maxDistanceKm} km</strong> max distance (avg {opt.averageDistanceKm} km)
                    </span>
                    <span>·</span>
                    <span className="capitalize">
                      <strong>{opt.logisticsComplexity}</strong> logistics complexity
                    </span>
                  </div>

                  {/* Allocation breakdown */}
                  <div className="space-y-1.5 mb-3">
                    <p className="text-[11px] font-semibold text-ink-mute uppercase tracking-wide">
                      Allocation Breakdown
                    </p>
                    {opt.suppliers.map((s, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-surface-sunk/60 border border-line/50"
                      >
                        <div>
                          <span className="font-semibold text-ink">{s.providerName}</span>
                          <span className="text-ink-soft ml-1.5">({s.resourceTitle})</span>
                          {s.distanceKm != null && (
                            <span className="text-ink-mute ml-2">· {s.distanceKm} km away</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-ink">
                            {s.allocatedQuantity} {r.unit || 'units'}
                          </span>
                          <span className="text-ink-soft ml-1.5">
                            ({inr(s.totalPrice)} @ {inr(s.unitPrice)}/unit)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Labels and action */}
                  <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {opt.labels.map((lbl) => (
                        <span
                          key={lbl}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                            LABEL_CONFIG[lbl]?.color || 'badge'
                          }`}
                        >
                          {LABEL_CONFIG[lbl]?.text || lbl}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectPlanMutation.mutate(opt)}
                        disabled={selectPlanMutation.isPending}
                        className={`btn-sm text-xs ${
                          r.selectedProcurementPlan?.id === opt.id
                            ? 'btn-secondary text-green-accent border-green-500/40'
                            : 'btn-ghost'
                        }`}
                      >
                        {r.selectedProcurementPlan?.id === opt.id ? (
                          <span className="inline-flex items-center gap-1">
                            <Check size={13} /> Selected
                          </span>
                        ) : (
                          'Select Option'
                        )}
                      </button>

                      {r.selectedProcurementPlan?.id === opt.id && r.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => setConfirmingPlan(opt)}
                          className="btn-primary btn-sm text-xs inline-flex items-center gap-1"
                        >
                          Continue with this plan <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal / Dialog for explicit execution confirmation */}
          {confirmingPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in">
              <div className="card max-w-xl w-full p-6 md:p-7 border-line bg-surface shadow-2xl relative">
                <button
                  type="button"
                  onClick={() => setConfirmingPlan(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-ink-mute hover:text-ink hover:bg-surface-sunk"
                >
                  <X size={18} />
                </button>

                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-brand/10 text-brand">
                    {confirmingPlan.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-ink-mute">Review & Confirm</span>
                </div>

                <h3 className="text-xl font-bold text-ink mb-1">
                  Execute Procurement Strategy
                </h3>
                <p className="text-xs text-ink-soft mb-5">
                  Live inventory will be verified across all {confirmingPlan.suppliers.length} providers before creating individual contracts.
                </p>

                {/* Suppliers breakdown */}
                <div className="space-y-2 mb-5 max-h-56 overflow-y-auto pr-1">
                  {confirmingPlan.suppliers.map((s, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-surface-sunk/70 border border-line flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-ink">{s.providerName}</p>
                        <p className="text-[11px] text-ink-soft">{s.resourceTitle} {s.distanceKm != null ? `· ${s.distanceKm} km away` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-ink">{s.allocatedQuantity} {r.unit || 'units'}</p>
                        <p className="text-[11px] text-ink-soft">{inr(s.totalPrice)} ({inr(s.unitPrice)}/ea)</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary Box */}
                <div className="p-4 rounded-xl border border-line bg-surface-sunk/30 space-y-2 text-xs mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Target Fulfillment:</span>
                    <span className="font-semibold text-ink">{confirmingPlan.fulfilledQuantity} / {confirmingPlan.requestedQuantity} {r.unit || 'units'} ({confirmingPlan.fulfillmentPercentage}%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Logistics Jobs Expected:</span>
                    <span className="font-semibold text-ink">{confirmingPlan.logisticsJobsRequired || confirmingPlan.supplierCount} pickup dispatch(es)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Execution Window:</span>
                    <span className="font-semibold text-ink">{dateRange(r.startDateTime, r.endDateTime)}</span>
                  </div>
                  <div className="border-t border-line/60 pt-2 flex items-center justify-between text-sm font-bold text-ink">
                    <span>Grouped Order Total:</span>
                    <span className="text-brand text-base">{inr(confirmingPlan.totalPrice)}</span>
                  </div>
                </div>

                {/* Confirmation Actions */}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingPlan(null)}
                    disabled={executePlanMutation.isPending}
                    className="btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => executePlanMutation.mutate(confirmingPlan)}
                    disabled={executePlanMutation.isPending}
                    className="btn-primary btn-sm inline-flex items-center gap-1.5"
                  >
                    {executePlanMutation.isPending ? 'Executing Strategy…' : 'Confirm & Execute Plan'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="h-section mb-6">
          Offers {offers.length > 0 && <span className="muted font-normal">({offers.length})</span>}
        </h2>

        {offers.length === 0 ? (
          <EmptyState
            title="No offers yet"
            message={
              isOwner
                ? 'Providers who can supply this will respond here. You will get a notification.'
                : 'Be the first to offer against this requirement.'
            }
          />
        ) : (
          <div className="border-t border-line">
            {offers.map((o) => {
              const isMine = String(o.provider?._id) === String(user._id);
              const res = o.resource || {};
              return (
                <div key={o._id} className="flex flex-col sm:flex-row gap-5 py-6 border-b border-line">
                  <Link to={`/r/${res._id}`} className="shrink-0">
                    <img
                      src={resourceImage(res)}
                      alt={res.title}
                      className="w-full sm:w-[110px] h-[90px] object-cover rounded bg-surface-sunk"
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/r/${res._id}`}
                      className="text-base font-medium hover:underline underline-offset-4"
                    >
                      {res.title}
                    </Link>
                    <p className="text-sm muted mt-0.5">
                      <Link to={`/provider/${o.provider?._id}`} className="link-quiet">
                        {o.provider?.businessName}
                      </Link>
                      {isMine && ' · your offer'}
                    </p>
                    {o.provider?.ratingCount > 0 && (
                      <Stars
                        rating={o.provider.ratingAvg}
                        count={o.provider.ratingCount}
                        size={13}
                        className="mt-1"
                      />
                    )}
                    {o.message && <p className="text-sm muted mt-2 max-w-prose">“{o.message}”</p>}
                    <p className="text-xs text-ink-mute mt-2">
                      {relative(o.createdAt)}
                      {o.status !== 'offered' && ` · ${o.status}`}
                    </p>
                  </div>

                  <div className="shrink-0 sm:text-right flex sm:flex-col items-start sm:items-end gap-3">
                    <Price amount={o.price} />
                    {r.maxPrice != null && (
                      <span
                        className={`text-xs ${o.price <= r.maxPrice ? 'text-success' : 'text-danger'}`}
                      >
                        {o.price <= r.maxPrice ? 'Within budget' : 'Over budget'}
                      </span>
                    )}

                    {isOwner && r.status === 'open' && o.status === 'offered' && (
                      <button
                        onClick={() => accept(o._id)}
                        disabled={Boolean(busy)}
                        className="btn-primary btn-sm"
                      >
                        {busy === o._id ? 'Accepting…' : 'Accept offer'}
                      </button>
                    )}

                    {isMine && o.status === 'offered' && (
                      <button
                        onClick={() => withdraw(o._id)}
                        disabled={Boolean(busy)}
                        className="btn-ghost btn-sm"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isOwner && liveOffers.length > 1 && (
          <p className="text-sm muted mt-6">
            Accepting one offer declines the rest and creates the booking straight away — the
            provider has already agreed these terms.
          </p>
        )}
      </section>
    </div>
  );
}
