import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Truck, Phone, AlertCircle, MapPin, Clock, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useBooking,
  useNegotiation,
  useSendNegotiation,
  useBookingActions,
  useBookingLogistics,
  useBookingInspections,
} from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { Panel, StatusBadge, Spinner, Stars, Alert } from '../components/ui';
import MatchBreakdown from '../components/MatchBreakdown';
import DeliveryConditions from '../components/DeliveryConditions';
import ConditionChecks from '../components/ConditionChecks';
import { resourceImage } from '../lib/constants';
import { inr, dateRange, dateTime, relative, toLocalInput } from '../lib/format';

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */

/** Icon: checkmark circle (completed step) */
function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="9" r="8" className="stroke-success" />
      <path d="M5.5 9l2.5 2.5 4-4" className="stroke-success" />
    </svg>
  );
}

/** Vertical connector line between timeline steps */
function Connector({ done }) {
  return (
    <div className={`w-px flex-1 mt-0.5 mb-0.5 mx-auto ${done ? 'bg-success' : 'bg-line'}`}
         style={{ minHeight: 14, width: 2 }} />
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   A — ORDER TIMELINE (7 stages, "Upcoming" removed)
   "In Progress" is now the 6th stage and is clickable to expand fulfillment.
══════════════════════════════════════════════════════════════════════════════ */

const ORDER_STAGES = [
  { key: 'requested',   label: 'Requested' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'accepted',    label: 'Accepted' },
  { key: 'payment',     label: 'Payment' },
  { key: 'confirmed',   label: 'Confirmed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
];

/**
 * Maps booking → ORDER_STAGES index.
 * "confirmed" bookings move to "In Progress" (index 5) once fulfillment/return
 * has started or startDateTime has arrived; otherwise they stay at "Confirmed" (index 4).
 * "completed" only maps to index 6 — delivery alone never triggers this.
 */
function orderStageIndex(booking) {
  if (!booking) return -1;
  const { status, startDateTime, fulfillment, return: ret } = booking;
  const now = Date.now();
  const start = startDateTime ? new Date(startDateTime).getTime() : Infinity;
  switch (status) {
    case 'pending':      return 0;
    case 'negotiating':  return 1;
    case 'accepted':     return 2;
    case 'confirmed': {
      // If fulfillment has started, return has started, or start date reached -> In Progress (index 5)
      const inProgress = Boolean(fulfillment?.status) || Boolean(ret?.status) || (now >= start);
      return inProgress ? 5 : 4;
    }
    case 'completed':    return 6;
    default:             return -1; // cancelled / rejected
  }
}

function OrderTimeline({ booking, onClickInProgress, fulfillmentExpanded }) {
  const activeIdx = orderStageIndex(booking);

  if (activeIdx === -1) {
    return (
      <Alert tone="error">
        This request was <strong>{booking.status}</strong>. No further action is possible.
      </Alert>
    );
  }

  const isConfirmed = booking.status === 'confirmed';
  const isCompleted = booking.status === 'completed';

  return (
    <>
      {/* Desktop stepper */}
      <div className="hidden sm:flex items-start">
        {ORDER_STAGES.map((stage, i) => {
          const done    = i < activeIdx;
          const current = i === activeIdx;
          const isIP    = stage.key === 'in_progress';
          // In Progress is clickable whenever booking has reached confirmed or completed
          const clickable = isIP && (isConfirmed || isCompleted);

          return (
            <div key={stage.key} className="flex items-start flex-1 last:flex-none">
              {clickable ? (
                <button
                  type="button"
                  onClick={onClickInProgress}
                  title={fulfillmentExpanded ? 'Collapse fulfillment detail' : 'Expand fulfillment detail'}
                  aria-expanded={fulfillmentExpanded}
                  className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group p-1 -m-1 rounded hover:bg-surface-subtle transition-colors"
                >
                  <div
                    className={[
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                      'transition-all duration-150',
                      'group-hover:ring-2 group-hover:ring-ink/20 group-hover:scale-105',
                      done    ? 'bg-success text-white' :
                      current ? 'bg-ink text-ink-invert' :
                                'bg-line text-ink-mute',
                    ].join(' ')}
                  >
                    {done ? <Check size={13} strokeWidth={2.5} /> : i + 1}
                  </div>
                  <span className={[
                    'text-[10px] text-center leading-tight whitespace-nowrap',
                    i <= activeIdx ? 'text-ink font-medium' : 'text-ink-mute',
                    'underline underline-offset-2 decoration-line-strong group-hover:text-ink',
                  ].join(' ')}>
                    {stage.label}
                  </span>
                  <span className="text-[9px] text-ink-mute group-hover:text-ink transition-transform">
                    {fulfillmentExpanded ? '▲' : '▼'}
                  </span>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div
                    className={[
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                      done    ? 'bg-success text-white' :
                      current ? 'bg-ink text-ink-invert' :
                                'bg-line text-ink-mute',
                    ].join(' ')}
                  >
                    {done ? <Check size={13} strokeWidth={2.5} /> : i + 1}
                  </div>
                  <span className={[
                    'text-[10px] text-center leading-tight whitespace-nowrap',
                    i <= activeIdx ? 'text-ink font-medium' : 'text-ink-mute',
                  ].join(' ')}>
                    {stage.label}
                  </span>
                </div>
              )}

              {i < ORDER_STAGES.length - 1 && (
                <div className={`flex-1 h-[2px] mt-3 mx-1 rounded ${i < activeIdx ? 'bg-success' : 'bg-line'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: current step */}
      <div className="sm:hidden flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-ink text-ink-invert flex items-center justify-center text-sm font-semibold shrink-0">
          {activeIdx + 1}
        </div>
        <div>
          <p className="text-sm font-medium">{ORDER_STAGES[activeIdx]?.label}</p>
          <p className="text-xs text-ink-mute">Step {activeIdx + 1} of {ORDER_STAGES.length}</p>
          {(isConfirmed || isCompleted) && (
            <button
              type="button"
              onClick={onClickInProgress}
              className="text-xs text-ink underline underline-offset-2 mt-0.5 inline-flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>{fulfillmentExpanded ? 'Hide fulfillment' : 'Show fulfillment'}</span>
              <span>{fulfillmentExpanded ? '▲' : '▼'}</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   B — FULFILLMENT TIMELINE
   Expandable from "In Progress" click. Provider advances; seeker views.
══════════════════════════════════════════════════════════════════════════════ */

const FULFILLMENT_STAGES = [
  { key: 'packed',           label: 'Order Packed',          tsField: 'packedAt' },
  { key: 'loading',          label: 'Loading for Transport', tsField: 'loadingAt' },
  { key: 'out_for_delivery', label: 'Out for Delivery',      tsField: 'outForDeliveryAt' },
  { key: 'delivered',        label: 'Delivered',             tsField: 'deliveredAt' },
];

const FULFILLMENT_ORDER  = FULFILLMENT_STAGES.map(s => s.key);
const FULFILLMENT_LABELS = {
  packed:           'Mark Order Packed',
  loading:          'Mark Loading for Transport',
  out_for_delivery: 'Mark Out for Delivery',
  delivered:        'Mark Delivered',
};

function FulfillmentTimeline({ fulfillment, isProvider, onAdvance, busy, partnerAssigned, partnerName }) {
  const activeIdx = FULFILLMENT_ORDER.indexOf(fulfillment?.status ?? '');
  const nextStatus = FULFILLMENT_ORDER[activeIdx + 1];
  const isDelivered = fulfillment?.status === 'delivered';

  return (
    <div>
      <div className="space-y-0">
        {FULFILLMENT_STAGES.map((stage, i) => {
          const isDone    = i <= activeIdx;
          const isCurrent = !isDelivered && (activeIdx === -1 ? i === 0 : i === activeIdx + 1);
          const ts        = fulfillment?.[stage.tsField];

          return (
            <div key={stage.key} className="flex gap-3">
              {/* Dot column */}
              <div className="flex flex-col items-center" style={{ width: 20 }}>
                <div className={[
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold shrink-0 transition-colors',
                  isDone    ? 'bg-success border-success text-white' :
                  isCurrent ? 'bg-ink border-ink text-ink-invert ring-2 ring-ink/20' :
                              'bg-surface border-line text-ink-mute',
                ].join(' ')}>
                  {isDone ? <Check size={11} strokeWidth={2.5} /> : isCurrent ? <span className="w-1.5 h-1.5 rounded-full bg-current" /> : null}
                </div>
                {i < FULFILLMENT_STAGES.length - 1 && (
                  <Connector done={isDone} />
                )}
              </div>
              {/* Label */}
              <div className="pb-3 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${isDone ? 'text-ink' : isCurrent ? 'text-ink font-semibold' : 'text-ink-mute'}`}>
                    {stage.label}
                  </p>
                  {isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/10 text-ink font-medium">
                      Next Step
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-mute">
                  {ts ? dateTime(ts) : isCurrent ? (isProvider ? 'Ready to advance' : 'Waiting for provider') : 'Pending'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Provider next action */}
      {isProvider && nextStatus && (
        partnerAssigned ? (
          <div className="mt-3 p-2.5 rounded-lg bg-surface-subtle border border-line text-xs text-ink-soft flex items-center gap-2">
            <Truck size={14} className="text-indigo shrink-0" />
            <span>Transit is dispatched to logistics partner <strong>{partnerName || 'Logistics Partner'}</strong>. Step updates occur upon driver checkpoint scans.</span>
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-ink-soft">
              Ready to update delivery status:
            </p>
            <button
              type="button"
              onClick={() => onAdvance(nextStatus)}
              disabled={Boolean(busy)}
              className="btn-primary btn-sm"
              id={`ff-btn-${nextStatus}`}
            >
              {busy ? 'Updating…' : FULFILLMENT_LABELS[nextStatus]}
            </button>
          </div>
        )
      )}

      {/* Delivered confirmation chip */}
      {isDelivered && (
        <div className="mt-3 p-2.5 rounded-lg bg-success/10 border border-success/20 flex items-center gap-2 text-success text-xs font-medium">
          <IconCheck />
          <span>Item delivered — rental period is now active</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   C — RENTAL PERIOD
══════════════════════════════════════════════════════════════════════════════ */

function RentalPeriod({ booking }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const end = booking.endDateTime ? new Date(booking.endDateTime).getTime() : null;
  const expired = end ? now > end : false;
  const hoursLeft = end ? Math.max(0, Math.floor((end - now) / 3_600_000)) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-soft">Period</span>
        <span className={[
          'text-xs font-semibold px-2 py-0.5 rounded-full border',
          expired ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
        ].join(' ')}>
          {expired ? 'Expired' : 'Active'}
        </span>
      </div>

      <p className="text-sm">{dateRange(booking.startDateTime, booking.endDateTime)}</p>

      {!expired && hoursLeft !== null && (
        <p className="text-xs text-ink-mute">
          {hoursLeft > 0 ? `${hoursLeft}h remaining` : 'Ending soon'}
        </p>
      )}
      {expired && (
        <p className="text-xs text-danger">
          Rental has ended. Please initiate the return process.
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   D — RETURN TIMELINE
══════════════════════════════════════════════════════════════════════════════ */

const RETURN_STAGES = [
  { key: 'return_requested',        label: 'Return Requested',        tsField: 'returnRequestedAt' },
  { key: 'return_pickup_scheduled', label: 'Return Pickup Scheduled', tsField: 'returnPickupScheduledAt' },
  { key: 'return_in_transit',       label: 'Return In Transit',       tsField: 'returnInTransitAt' },
  { key: 'returned_to_provider',    label: 'Returned to Provider',    tsField: 'returnedAt' },
  { key: 'return_completed',        label: 'Return Completed',        tsField: 'returnCompletedAt' },
];

const RETURN_ORDER = RETURN_STAGES.map(s => s.key);
const RETURN_LABELS = {
  return_pickup_scheduled: 'Schedule Pickup',
  return_in_transit:       'Mark In Transit',
  returned_to_provider:    'Mark Returned to Provider',
  return_completed:        'Complete Return',
};

function ReturnTimeline({ returnData, isProvider, onAdvance, busy, partnerAssigned, partnerName }) {
  const activeIdx = RETURN_ORDER.indexOf(returnData?.status ?? '');
  const nextStatus = RETURN_ORDER[activeIdx + 1];
  const isComplete = returnData?.status === 'return_completed';

  return (
    <div>
      <div className="space-y-0">
        {RETURN_STAGES.map((stage, i) => {
          const done = i <= activeIdx;
          const ts   = returnData?.[stage.tsField];
          return (
            <div key={stage.key} className="flex gap-3">
              <div className="flex flex-col items-center" style={{ width: 20 }}>
                <div className={[
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold shrink-0',
                  done ? 'bg-success border-success text-white' : 'bg-surface border-line text-ink-mute',
                ].join(' ')}>
                  {done ? <Check size={11} strokeWidth={2.5} /> : null}
                </div>
                {i < RETURN_STAGES.length - 1 && <Connector done={done} />}
              </div>
              <div className="pb-3 min-w-0">
                <p className={`text-sm font-medium ${done ? 'text-ink' : 'text-ink-mute'}`}>
                  {stage.label}
                </p>
                <p className="text-xs text-ink-mute">{ts ? dateTime(ts) : 'Pending'}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Provider advance action */}
      {isProvider && nextStatus && RETURN_LABELS[nextStatus] && !isComplete && (
        partnerAssigned ? (
          <div className="mt-3 p-2.5 rounded-lg bg-surface-subtle border border-line text-xs text-ink-soft flex items-center gap-2">
            <Truck size={14} className="text-indigo shrink-0" />
            <span>Return transit is managed by logistics partner <strong>{partnerName || 'Logistics Partner'}</strong>.</span>
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-line">
            <button
              onClick={() => onAdvance(nextStatus)}
              disabled={Boolean(busy)}
              className="btn-secondary btn-sm"
              id={`ret-btn-${nextStatus}`}
            >
              {busy ? 'Updating…' : RETURN_LABELS[nextStatus]}
            </button>
          </div>
        )
      )}

      {isComplete && (
        <div className="mt-3 flex items-center gap-2 text-success text-xs font-medium">
          <IconCheck />
          Return completed — booking fully closed
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   LOGISTICS & TRANSIT SECTION
══════════════════════════════════════════════════════════════════════════════ */

const LOGISTICS_FORWARD_STEPS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'pickup_scheduled', label: 'Pickup Sched' },
  { key: 'arrived_at_provider', label: 'At Provider' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
];

const LOGISTICS_RETURN_STEPS = [
  { key: 'return_requested', label: 'Return Req' },
  { key: 'return_pickup_scheduled', label: 'Pickup Sched' },
  { key: 'return_picked_up', label: 'Picked Up' },
  { key: 'return_in_transit', label: 'In Transit' },
  { key: 'returned_to_provider', label: 'Returned' },
  { key: 'completed', label: 'Completed' },
];

function LogisticsTrackingSection({ job }) {
  if (!job) return null;

  const partner = job.assignedPartner || job.logisticsPartner;
  const currentStatus = job.currentStatus || job.status;
  const isUnassigned = currentStatus === 'unassigned';
  const isDeclined = currentStatus === 'declined';

  const currentIdx = LOGISTICS_FORWARD_STEPS.findIndex(s => s.key === currentStatus);
  const isReturnPhase = LOGISTICS_RETURN_STEPS.some(s => s.key === currentStatus);
  const returnIdx = LOGISTICS_RETURN_STEPS.findIndex(s => s.key === currentStatus);

  const getStepTime = (stepKey) => {
    const entry = (job.timeline || []).find(t => t.status === stepKey);
    return entry ? dateTime(entry.timestamp) : null;
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="icon-box icon-box-indigo w-7 h-7">
            <Truck size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Logistics & Transport Dispatch</h2>
            <p className="text-xs text-ink-mute">Physical fulfillment partner and route status</p>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          ['delivered', 'completed'].includes(currentStatus)
            ? 'bg-success/10 text-success border border-success/30'
            : ['in_transit', 'return_in_transit', 'picked_up', 'return_picked_up'].includes(currentStatus)
            ? 'bg-indigo/10 text-indigo border border-indigo/30'
            : isUnassigned || isDeclined
            ? 'bg-amber-accent/10 text-amber-accent border border-amber-accent/30'
            : 'bg-surface-sunk text-ink-soft border border-line'
        }`}>
          {currentStatus?.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      {/* Partner info banner */}
      {partner ? (
        <div className="p-3 rounded-lg bg-surface-subtle border border-line flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo/10 text-indigo font-bold flex items-center justify-center text-sm">
              {partner.businessName?.charAt(0) || 'L'}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">{partner.businessName}</p>
              <p className="text-xs text-ink-mute">
                {partner.logisticsProfile?.vehicleInfo?.model
                  ? `${partner.logisticsProfile.vehicleInfo.model} (${partner.logisticsProfile.vehicleInfo.licensePlate || 'Fleet'})`
                  : 'Verified Logistics Partner'}
                {partner.phone && ` · ${partner.phone}`}
              </p>
            </div>
          </div>
          {partner.phone && (
            <a href={`tel:${partner.phone}`} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
              <Phone size={12} /> Call Dispatch
            </a>
          )}
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-amber-accent/5 border border-amber-accent/20 text-xs text-amber-accent flex items-center gap-2">
          <AlertCircle size={15} />
          <span>Awaiting partner dispatch assignment by Indulge Platform Admin.</span>
        </div>
      )}

      {/* Route & Schedule details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-lg border border-line space-y-1">
          <p className="font-semibold text-ink-soft uppercase tracking-wide text-[10px]">Pickup Origin</p>
          <p className="font-medium text-ink">{job.pickupLocation?.address || 'Provider Facility'}</p>
          {job.pickupLocation?.contactName && (
            <p className="text-ink-mute">Contact: {job.pickupLocation.contactName} ({job.pickupLocation.contactPhone || 'N/A'})</p>
          )}
          {(job.pickupScheduledAt || job.scheduledPickupTime) && (
            <p className="text-indigo font-medium pt-1">Scheduled: {dateTime(job.pickupScheduledAt || job.scheduledPickupTime)}</p>
          )}
        </div>

        <div className="p-3 rounded-lg border border-line space-y-1">
          <p className="font-semibold text-ink-soft uppercase tracking-wide text-[10px]">Delivery Destination</p>
          <p className="font-medium text-ink">{job.deliveryLocation?.address || 'Seeker Facility'}</p>
          {job.deliveryLocation?.contactName && (
            <p className="text-ink-mute">Contact: {job.deliveryLocation.contactName} ({job.deliveryLocation.contactPhone || 'N/A'})</p>
          )}
          {(job.deliveryRequiredBy || job.requiredDeliveryTime) && (
            <p className="text-indigo font-medium pt-1">Required by: {dateTime(job.deliveryRequiredBy || job.requiredDeliveryTime)}</p>
          )}
        </div>
      </div>

      {/* Forward Milestones Stepper */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-ink-soft">Delivery Milestones</p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 pt-1">
          {LOGISTICS_FORWARD_STEPS.map((s, idx) => {
            const isDone = isReturnPhase || (currentIdx !== -1 && idx <= currentIdx);
            const isCurrent = !isReturnPhase && currentIdx === idx;
            const ts = getStepTime(s.key);
            return (
              <div key={s.key} className="flex flex-col items-center text-center p-1 rounded bg-surface-subtle border border-line/60">
                <div className={`w-4 h-4 rounded-full mb-1 flex items-center justify-center text-[8px] font-bold ${
                  isDone ? 'bg-success text-white' : isCurrent ? 'bg-indigo text-white ring-2 ring-indigo/30' : 'bg-line text-ink-mute'
                }`}>
                  {isDone ? '✓' : idx + 1}
                </div>
                <span className={`text-[9px] leading-tight font-medium ${isCurrent ? 'text-indigo font-semibold' : isDone ? 'text-ink' : 'text-ink-mute'}`}>
                  {s.label}
                </span>
                {ts && <span className="text-[8px] text-ink-mute mt-0.5 truncate max-w-full">{ts.split(',')[1] || ts}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Return Milestones Stepper if return is required */}
      {(job.requiresReturn !== undefined ? job.requiresReturn : job.returnRequired) && (
        <div className="space-y-1 pt-2 border-t border-line">
          <p className="text-xs font-semibold text-ink-soft">Return Transport Milestones</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 pt-1">
            {LOGISTICS_RETURN_STEPS.map((s, idx) => {
              const isDone = isReturnPhase && (returnIdx !== -1 && idx <= returnIdx);
              const isCurrent = isReturnPhase && returnIdx === idx;
              const ts = getStepTime(s.key);
              return (
                <div key={s.key} className="flex flex-col items-center text-center p-1 rounded bg-surface-subtle border border-line/60">
                  <div className={`w-4 h-4 rounded-full mb-1 flex items-center justify-center text-[8px] font-bold ${
                    isDone ? 'bg-success text-white' : isCurrent ? 'bg-indigo text-white ring-2 ring-indigo/30' : 'bg-line text-ink-mute'
                  }`}>
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span className={`text-[9px] leading-tight font-medium ${isCurrent ? 'text-indigo font-semibold' : isDone ? 'text-ink' : 'text-ink-mute'}`}>
                    {s.label}
                  </span>
                  {ts && <span className="text-[8px] text-ink-mute mt-0.5 truncate max-w-full">{ts.split(',')[1] || ts}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   NEGOTIATION THREAD
══════════════════════════════════════════════════════════════════════════════ */

function NegotiationThread({ bookingId, booking, me, isProvider }) {
  const { data, isLoading } = useNegotiation(bookingId);
  const send = useSendNegotiation(bookingId);
  const qc = useQueryClient();

  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('message');
  const [price, setPrice] = useState(booking.quotedPrice || '');
  const [start, setStart] = useState(toLocalInput(booking.startDateTime));
  const [end, setEnd] = useState(toLocalInput(booking.endDateTime));

  const messages = data?.messages || [];
  const closed = ['completed', 'cancelled', 'rejected'].includes(booking.status);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (mode !== 'message') {
        await send.mutateAsync({
          type: mode,
          proposedPrice: Number(price),
          proposedStart: new Date(start).toISOString(),
          proposedEnd: new Date(end).toISOString(),
          message,
        });
        toast.success(mode === 'quotation' ? 'Quotation sent' : 'Counter-offer sent');
        setMode('message');
      } else {
        if (!message.trim()) return;
        await send.mutateAsync({ type: 'message', message });
      }
      setMessage('');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send.'));
    }
  };

  const acceptOffer = async (msgId) => {
    try {
      await api.post(`/negotiations/${bookingId}/accept-offer/${msgId}`);
      toast.success('Offer accepted — terms updated');
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
      qc.invalidateQueries({ queryKey: ['negotiation', bookingId] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <h2 className="h-section mb-4">Messages &amp; offers</h2>
      {isLoading ? (
        <Spinner label="Loading conversation" />
      ) : (
        <div className="space-y-3 mb-4">
          {messages.length === 0 && (
            <p className="text-sm text-ink-soft">
              No messages yet. Use this thread to agree terms before accepting.
            </p>
          )}
          {messages.map((m) => {
            const mine = String(m.sender?._id) === String(me._id);
            return (
              <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] border rounded-lg px-3 py-2 ${
                  mine ? 'bg-surface-sunk border-line' : 'bg-surface-alt border-line'
                }`}>
                  <p className="text-xs font-semibold mb-0.5">
                    {m.sender?.businessName}
                    <span className="font-normal text-ink-mute"> · {relative(m.createdAt)}</span>
                  </p>
                  {m.type === 'counter_offer' || m.type === 'quotation' ? (
                    <>
                      <p className="text-sm font-semibold text-ink mb-0.5">
                        {m.type === 'quotation' ? 'Quotation' : 'Counter-offer'}: {inr(m.proposedPrice)}
                      </p>
                      {m.proposedStart && (
                        <p className="text-xs text-ink-soft mb-1">
                          {dateRange(m.proposedStart, m.proposedEnd)}
                        </p>
                      )}
                      {m.message && <p className="text-sm mb-1">{m.message}</p>}
                      {!mine && !closed && (
                        <button onClick={() => acceptOffer(m._id)}
                          className="btn-primary btn-sm mt-1">
                          Accept these terms
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm">{m.message}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!closed && (
        <form onSubmit={submit} className="border-t border-line pt-3">
          {mode !== 'message' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <div>
                <label className="label">
                  {mode === 'quotation' ? 'Quoted price (₹)' : 'Proposed price (₹)'}
                </label>
                <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                  className="field" required />
              </div>
              <div>
                <label className="label">From</label>
                <input type="datetime-local" value={start}
                  onChange={e => setStart(e.target.value)} className="field" />
              </div>
              <div>
                <label className="label">To</label>
                <input type="datetime-local" value={end}
                  onChange={e => setEnd(e.target.value)} className="field" />
              </div>
            </div>
          )}
          <textarea rows={2} value={message} onChange={e => setMessage(e.target.value)}
            placeholder={mode === 'message' ? 'Write a message…' : 'Add a note (optional)'}
            className="field-area mb-2" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={send.isPending} className="btn-primary">
              {mode === 'message' ? 'Send message'
                : mode === 'quotation' ? 'Send quotation'
                : 'Send counter-offer'}
            </button>
            {mode === 'message' ? (
              <>
                <button type="button" onClick={() => setMode('counter_offer')}
                  className="btn-secondary">Make a counter-offer</button>
                {isProvider && (
                  <button type="button" onClick={() => setMode('quotation')}
                    className="btn-secondary">Send a quotation</button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => setMode('message')}
                className="btn-ghost">Cancel</button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   REVIEW FORM — fully theme-aware, dark-mode safe
   Stars use CSS custom properties; no hard-coded hex colours.
══════════════════════════════════════════════════════════════════════════════ */

function StarRating({ rating, onSelect, disabled }) {
  const [hovered, setHovered] = useState(0);
  const display = disabled ? rating : (hovered || rating);

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => !disabled && setHovered(0)}
      role="group"
      aria-label="Star rating"
    >
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onSelect(n)}
          onMouseEnter={() => !disabled && setHovered(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={[
            'p-0.5 rounded transition-transform duration-100',
            !disabled ? 'cursor-pointer hover:scale-110' : 'cursor-default',
          ].join(' ')}
        >
          {/* Use currentColor so the star responds to Tailwind text-* classes */}
          <svg
            width="28" height="28"
            viewBox="0 0 20 20"
            fill={n <= display ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1"
            className={n <= display ? 'text-ink' : 'text-line-strong'}
          >
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function ReviewForm({ booking, me }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/reviews', { bookingId: booking._id, rating, comment });
      toast.success('Thanks for your review');
      setDone(true);
      qc.invalidateQueries({ queryKey: ['resource'] });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not post the review.'));
    } finally {
      setBusy(false);
    }
  };

  if (done) return <Alert tone="success">Your review has been posted.</Alert>;

  return (
    <form onSubmit={submit}>
      <h2 className="h-section mb-4">Write a review</h2>

      <div className="mb-3">
        <StarRating rating={rating} onSelect={setRating} disabled={false} />
        <p className="text-sm text-ink-soft mt-1.5">
          <span className="font-semibold text-ink">{rating}</span> out of 5
        </p>
      </div>

      <textarea
        rows={3}
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="How did it go? Condition, punctuality, communication…"
        className="field-area w-full mb-3"
      />

      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? 'Posting…' : 'Submit review'}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DIRECTIONS
══════════════════════════════════════════════════════════════════════════════ */

function buildMapsUrl(resource, provider) {
  const coords = resource?.location?.coordinates;
  if (coords?.length === 2) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`;
  }
  const addr = resource?.location?.address || resource?.location?.city;
  if (addr) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
  const city = provider?.location?.city;
  if (city) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(city)}`;
  return null;
}

function GetDirections({ booking, isProvider }) {
  if (isProvider) return null;
  if (!['confirmed', 'completed'].includes(booking.status)) return null;
  const url = buildMapsUrl(booking.resource, booking.provider);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </svg>
      Get Directions
    </a>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   SECTION WRAPPER — collapsible with header chevron
══════════════════════════════════════════════════════════════════════════════ */

function Section({ title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 group"
      >
        <h2 className="h-section text-left">{title}</h2>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-ink-mute transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, isLoading } = useBooking(id);
  const { data: logisticsData } = useBookingLogistics(id);
  const actions = useBookingActions();
  const [busy, setBusy] = useState('');
  const [fulfillmentExpanded, setFulfillmentExpanded] = useState(true);

  const logisticsJob = logisticsData?.job;

  // Fire rental-expiry check on load (idempotent server-side)
  useEffect(() => {
    if (!data?.booking || !user) return;
    const b = data.booking;
    const parties = [String(b.provider?._id), String(b.seeker?._id)];
    if (!parties.includes(String(user._id))) return;
    if (b.status !== 'confirmed' || b.fulfillment?.status !== 'delivered') return;
    if (b.rentalExpiryNotified) return;
    const expired = b.endDateTime && Date.now() > new Date(b.endDateTime).getTime();
    if (!expired) return;
    actions.checkExpiry.mutate({ id: b._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.booking?._id, data?.booking?.status, data?.booking?.fulfillment?.status]);

  if (isLoading) return <Spinner label="Loading request" />;

  const booking = data?.booking;
  if (!booking) {
    return (
      <div className="shell pt-12 pb-20 text-center">
        <p className="text-ink-soft">Request not found.</p>
        <Link to="/bookings/sent" className="btn-secondary mt-4 inline-flex">Back</Link>
      </div>
    );
  }

  const transaction  = data?.transaction;
  const r            = booking.resource || {};
  const isProvider   = String(booking.provider?._id) === String(user._id);
  const counterparty = isProvider ? booking.seeker : booking.provider;

  // Key state flags
  const isConfirmed  = booking.status === 'confirmed';
  const isCompleted  = booking.status === 'completed';
  const hasAnyFulfillment = Boolean(booking.fulfillment?.status);
  const isDelivered  = booking.fulfillment?.status === 'delivered';
  const hasReturn    = Boolean(booking.return?.status);
  const rentalEnded  = booking.endDateTime && Date.now() > new Date(booking.endDateTime).getTime();

  // Physical freight dispatch vs on-site space access
  const isPhysicalTransport =
    booking.logistics === 'provider_transport' ||
    Boolean(logisticsJob) ||
    ['furniture', 'av_equipment', 'vehicle', 'other'].includes(r.category) ||
    r.requiresLogistics === true;

  const run = async (verb, mutation, extra = {}) => {
    setBusy(verb);
    try {
      await mutation.mutateAsync({ id: booking._id, ...extra });
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${verb}.`));
    } finally {
      setBusy('');
    }
  };

  const advanceFulfillment = (status) => run('fulfillment', actions.fulfillment, { status });
  const advanceReturn      = (status) => run('returnItem', actions.returnItem, { status });

  return (
    <div className="shell pt-10 pb-20">
      {/* Breadcrumb */}
      <p className="text-xs text-ink-soft mb-4">
        <Link to={isProvider ? '/bookings/received' : '/bookings/sent'} className="link">
          {isProvider ? 'Incoming requests' : 'Your requests'}
        </Link>
        {' › '}
        <span>Request #{String(booking._id).slice(-10).toUpperCase()}</span>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* ── LEFT ──────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* ═══ A — ORDER TIMELINE ═══ */}
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
              <h1 className="h-section">Order timeline</h1>
              <StatusBadge status={booking.status} />
            </div>

            <OrderTimeline
              booking={booking}
              onClickInProgress={() => setFulfillmentExpanded(e => !e)}
              fulfillmentExpanded={fulfillmentExpanded}
            />

            {/* Inline fulfillment expansion (connected to In Progress) */}
            {fulfillmentExpanded && (isConfirmed || isCompleted) && (
              <div className="mt-5 pt-4 border-t border-line">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-ink-mute uppercase tracking-wide">
                    {isPhysicalTransport ? 'Fulfillment detail' : 'Venue access detail'}
                  </p>
                  {isDelivered || isCompleted ? (
                    <span className="text-xs text-success font-medium inline-flex items-center gap-1">
                      <Check size={12} strokeWidth={2.5} /> {isPhysicalTransport ? 'Delivered' : 'Access Ready'}
                    </span>
                  ) : hasAnyFulfillment ? (
                    <span className="text-xs text-ink-mute font-medium">In Progress</span>
                  ) : (
                    <span className="text-xs text-ink-mute">{isPhysicalTransport ? 'Awaiting Start' : 'Confirmed'}</span>
                  )}
                </div>

                {isPhysicalTransport ? (
                  <FulfillmentTimeline
                    fulfillment={booking.fulfillment}
                    isProvider={isProvider && isConfirmed}
                    onAdvance={advanceFulfillment}
                    busy={busy === 'fulfillment' ? busy : ''}
                    partnerAssigned={Boolean(logisticsJob?.assignedPartner || logisticsJob?.logisticsPartner)}
                    partnerName={(logisticsJob?.assignedPartner || logisticsJob?.logisticsPartner)?.businessName}
                  />
                ) : (
                  <div className="p-3.5 rounded-lg border border-line bg-surface-alt/60 space-y-2">
                    <div className="flex items-center gap-2 text-ink font-semibold text-xs">
                      <MapPin size={14} className="text-accent shrink-0" />
                      <span>On-Site Venue Reservation — Self Pickup / Direct Access</span>
                    </div>
                    <p className="text-xs text-ink-soft">
                      Access is at <strong>{isProvider ? 'Your venue' : (booking.provider?.businessName || 'Provider venue')}</strong> ({r.location?.address || booking.provider?.location?.address || 'On-site facility'}). No freight transport vehicle is dispatched for stationary spaces.
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-mute pt-0.5">
                      <Clock size={12} className="text-accent" />
                      <span>Scheduled Event Window: {dateRange(booking.startDateTime, booking.endDateTime)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rejection / cancellation reason */}
            {(booking.cancellationReason || booking.rejectionReason) && (
              <div className="mt-4 p-3 rounded-lg bg-danger/5 border border-danger/20 text-sm text-danger">
                <span className="font-medium">Reason: </span>
                {booking.cancellationReason || booking.rejectionReason}
              </div>
            )}
          </div>

          {/* ═══ Resource details ═══ */}
          <div className="card">
            <h2 className="h-section mb-4">Resource</h2>
            <div className="flex gap-4">
              <Link to={`/r/${r._id}`} className="shrink-0">
                <img
                  src={resourceImage(r)} alt={r.title}
                  className="w-24 h-24 object-cover rounded border border-line"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/r/${r._id}`} className="text-base font-semibold link block">
                  {r.title}
                </Link>
                <p className="text-sm text-ink-soft mt-1">
                  {dateRange(booking.startDateTime, booking.endDateTime)}
                </p>
                <p className="text-sm text-ink-soft">Qty: {booking.requestedQuantity}</p>
                <p className="text-sm text-ink-soft">
                  {booking.logistics === 'provider_transport' ? 'Provider transport' : 'Self pickup'}
                </p>
                {booking.notes && (
                  <p className="text-sm mt-2 border-l-2 border-line pl-2 text-ink-soft italic">
                    "{booking.notes}"
                  </p>
                )}
              </div>
            </div>
            {booking.matchBreakdown && (
              <div className="mt-4 pt-4 border-t border-line">
                <MatchBreakdown
                  score={booking.matchScore}
                  breakdown={booking.matchBreakdown}
                  defaultOpen
                />
              </div>
            )}
          </div>

          {/* ═══ Negotiation ═══ */}
          <div className="card">
            <NegotiationThread
              bookingId={booking._id}
              booking={booking}
              me={user}
              isProvider={isProvider}
            />
          </div>

          {/* ═══ Delivery & handling plan — same for both sides ═══ */}
          {booking.deliveryPlan && (
            <DeliveryConditions
              assessment={booking.deliveryPlan}
              title="Delivery & handling plan"
              wide
              note={
                booking.deliveryPlan.computedNow
                  ? 'computed now — this request predates the delivery model'
                  : 'fixed when the request was made'
              }
            />
          )}

          {/* ═══ Before/after condition checks ═══ */}
          {booking.deliveryPlan?.requiresDelivery && (
            <Section
              title="Condition checks"
              defaultOpen={['accepted', 'confirmed', 'completed'].includes(booking.status)}
              badge={
                <span className="text-xs text-ink-mute">
                  {(booking.conditionChecks || []).length} of {booking.deliveryPlan.checkpoints.length} recorded
                </span>
              }
            >
              <ConditionChecks booking={booking} user={user} />
            </Section>
          )}

          <ReturnInspections bookingId={booking._id} />

          {/* ═══ Dedicated Logistics & Transport Section (shown when logistics job exists) ═══ */}
          {logisticsJob && (
            <LogisticsTrackingSection job={logisticsJob} />
          )}

          {/* ═══ B — FULFILLMENT (standalone card, shown when confirmed for physical transport) ═══ */}
          {(isConfirmed || isCompleted) && isPhysicalTransport && (
            <Section
              title="Fulfillment"
              defaultOpen={hasAnyFulfillment || isConfirmed}
              badge={
                isDelivered
                  ? <span className="text-xs text-success font-medium inline-flex items-center gap-1"><Check size={12} strokeWidth={2.5} /> Delivered</span>
                  : hasAnyFulfillment
                  ? <span className="text-xs text-ink-mute">In progress</span>
                  : <span className="text-xs text-ink-mute">Awaiting start</span>
              }
            >
              <FulfillmentTimeline
                fulfillment={booking.fulfillment}
                isProvider={isProvider && isConfirmed}
                onAdvance={advanceFulfillment}
                busy={busy === 'fulfillment' ? busy : ''}
                partnerAssigned={Boolean(logisticsJob?.assignedPartner || logisticsJob?.logisticsPartner)}
                partnerName={(logisticsJob?.assignedPartner || logisticsJob?.logisticsPartner)?.businessName}
              />
            </Section>
          )}

          {/* ═══ C — RENTAL PERIOD (only after delivered) ═══ */}
          {isDelivered && (
            <Section title="Rental period" defaultOpen badge={
              rentalEnded
                ? <span className="text-xs text-danger font-medium">Expired</span>
                : <span className="text-xs text-success font-medium">Active</span>
            }>
              <RentalPeriod booking={booking} />
            </Section>
          )}

          {/* ═══ D — RETURN (only after delivered + rental ended or return started) ═══ */}
          {isDelivered && (rentalEnded || hasReturn) && (
            <Section
              title="Return"
              defaultOpen={hasReturn}
              badge={
                booking.return?.status === 'return_completed'
                  ? <span className="text-xs text-success font-medium inline-flex items-center gap-1"><Check size={12} strokeWidth={2.5} /> Completed</span>
                  : hasReturn
                  ? <span className="text-xs text-ink-mute">In progress</span>
                  : null
              }
            >
              {!hasReturn ? (
                <div>
                  <p className="text-sm text-ink-soft mb-3">
                     The rental period has ended. Please initiate the return process.
                  </p>
                  {!isProvider && isConfirmed && (
                    <button
                      onClick={() => run('returnItem', actions.returnItem, { status: 'return_requested' })}
                      disabled={Boolean(busy)}
                      className="btn-primary"
                      id="start-return-btn"
                    >
                      {busy === 'returnItem' ? 'Processing…' : 'Start Return'}
                    </button>
                  )}
                </div>
              ) : (
                <ReturnTimeline
                  returnData={booking.return}
                  isProvider={isProvider && isConfirmed}
                  onAdvance={advanceReturn}
                  busy={busy === 'returnItem' ? busy : ''}
                  partnerAssigned={Boolean(logisticsJob?.assignedPartner || logisticsJob?.logisticsPartner)}
                  partnerName={(logisticsJob?.assignedPartner || logisticsJob?.logisticsPartner)?.businessName}
                />
              )}
            </Section>
          )}

          {/* ═══ Review (only after full completion) ═══ */}
          {isCompleted && (
            <div className="card">
              <ReviewForm booking={booking} me={user} />
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Summary panel */}
          <Panel className="p-4">
            <h2 className="text-base font-semibold mb-3">Summary</h2>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">Quoted</dt>
                <dd>{inr(booking.quotedPrice || 0)}</dd>
              </div>
              {booking.agreedPrice != null && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-soft">Agreed</dt>
                  <dd className="font-semibold">{inr(booking.agreedPrice)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">Urgency</dt>
                <dd className="capitalize">{booking.urgency}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">Requested</dt>
                <dd className="text-right">{dateTime(booking.createdAt)}</dd>
              </div>
            </dl>

            {/* ═══ Payment & Receipt Section ═══ */}
            {(transaction || isConfirmed || isCompleted) && (
              <>
                <hr className="rule my-3" />
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-ink">Payment</h3>
                  <span className="badge badge-success text-[10px] uppercase font-bold tracking-wider">
                    {transaction?.status === 'simulated_paid' || isConfirmed || isCompleted
                      ? 'PAID'
                      : transaction?.status || 'PENDING'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-surface-sunk/60 border border-line space-y-2 mb-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-ink-mute">Amount</span>
                    <span className="text-lg font-bold text-ink">
                      {inr(transaction?.amount ?? booking.agreedPrice ?? booking.quotedPrice ?? 0)}
                    </span>
                  </div>
                  {transaction && (
                    <div className="text-[11px] text-ink-mute flex items-center justify-between pt-1 border-t border-line/50">
                      <span>Ref:</span>
                      <span className="font-mono">{String(transaction._id).slice(-8).toUpperCase()}</span>
                    </div>
                  )}
                  {transaction?.paidAt && (
                    <div className="text-[11px] text-ink-mute flex items-center justify-between">
                      <span>Settled:</span>
                      <span>{dateTime(transaction.paidAt)}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {transaction && (
                    <a
                      href={`/api/transactions/${transaction._id}/receipt.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={`receipt-${String(transaction._id).slice(-6)}.pdf`}
                      className="btn-secondary btn-sm w-full justify-center text-xs inline-flex items-center gap-1.5"
                    >
                      <Download size={13} /> Download Receipt
                    </a>
                  )}
                  {transaction && (
                    <a
                      href={`/api/transactions/${transaction._id}/receipt`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-outline btn-sm w-full justify-center text-[11px] text-ink-soft hover:text-ink"
                    >
                      View Payment
                    </a>
                  )}
                </div>
              </>
            )}

            <hr className="rule my-3" />
            <h3 className="text-sm font-semibold mb-1">
              {isProvider ? 'Requesting business' : 'Provider'}
            </h3>
            <Link to={`/provider/${counterparty?._id}`} className="link text-sm block">
              {counterparty?.businessName}
            </Link>
            {counterparty?.ratingCount > 0 && (
              <Stars rating={counterparty.ratingAvg} count={counterparty.ratingCount}
                     size={12} className="mt-1" />
            )}
            <p className="text-xs text-ink-soft mt-1">
              {counterparty?.location?.city}
              {counterparty?.phone ? ` · ${counterparty.phone}` : ''}
            </p>
          </Panel>

          {/* Actions panel */}
          <Panel className="p-4 space-y-2">
            <h2 className="text-sm font-semibold mb-1">Actions</h2>

            {/* Provider: accept / decline */}
            {isProvider && ['pending', 'negotiating'].includes(booking.status) && (
              <>
                <button
                  onClick={() => run('accept', actions.accept)}
                  disabled={Boolean(busy)}
                  className="btn-primary w-full"
                >
                  Accept request
                </button>
                <button
                  onClick={() => {
                    const reason = window.prompt('Reason for declining? (optional)') ?? '';
                    run('reject', actions.reject, { reason });
                  }}
                  disabled={Boolean(busy)}
                  className="btn-secondary w-full"
                >
                  Decline request
                </button>
              </>
            )}

            {/* Seeker: proceed to payment */}
            {!isProvider && booking.status === 'accepted' && (
              <Link to={`/payment/${booking._id}`} className="btn-primary w-full justify-center">
                Proceed to Payment →
              </Link>
            )}

            {/* Non-physical complete (service bookings — no fulfillment) */}
            {booking.status === 'confirmed' && !hasAnyFulfillment && (
              <button
                onClick={() => run('complete', actions.complete)}
                disabled={Boolean(busy)}
                className="btn-secondary w-full"
              >
                Mark as completed
              </button>
            )}

            <GetDirections booking={booking} isProvider={isProvider} />

            {/* Cancel */}
            {['pending', 'negotiating', 'accepted', 'confirmed'].includes(booking.status) && (
              <button
                onClick={() => {
                  const reason = window.prompt('Reason for cancelling? (optional)') ?? '';
                  run('cancel', actions.cancel, { reason });
                }}
                disabled={Boolean(busy)}
                className="btn-secondary w-full"
              >
                Cancel request
              </button>
            )}

            {['completed', 'cancelled', 'rejected'].includes(booking.status) && (
              <p className="text-xs text-ink-soft text-center py-1">
                This request is closed.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Return inspection(s) opened when the goods came back — both parties see them. */
function ReturnInspections({ bookingId }) {
  const { data } = useBookingInspections(bookingId);
  const list = data?.inspections || [];
  if (!list.length) return null;
  const done = (v) => ['verified', 'conditionally_verified', 'rejected'].includes(v.status);
  return (
    <Panel className="p-4">
      <h2 className="h-card mb-2">Return inspection</h2>
      <ul className="space-y-2 text-sm">
        {list.map((v) => (
          <li key={v._id} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-soft">{v.inspectionId}</span>
            {!done(v) ? (
              <span className="badge badge-muted">Awaiting technician</span>
            ) : v.damageSummary?.damageDetected ? (
              <span className="badge badge-red">
                Damage found{v.damageSummary.unitsLost ? ` · ${v.damageSummary.unitsLost} missing` : ''}
              </span>
            ) : (
              <span className="badge badge-green">No new damage</span>
            )}
            {v.disputeStatus === 'open' && <span className="text-ink-soft">Under review by Indulge</span>}
            {v.disputeStatus === 'resolved' && (
              <span className="text-ink-soft">
                Resolved: {String(v.resolution?.decision || '').replace(/_/g, ' ')}
                {v.resolution?.amount != null ? ` · ${inr(v.resolution.amount)}` : ''}
              </span>
            )}
            {done(v) && (
              <Link to={`/inspections/${v.inspectionId}`} className="link ml-auto">
                View report
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
