import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useBookings, useBookingActions } from '../hooks/queries';
import { errorMessage } from '../api/client';
import { StatusBadge, Spinner, EmptyState } from '../components/ui';
import { resourceImage } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending,negotiating', label: 'Open' },
  { key: 'accepted,confirmed', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled,rejected', label: 'Cancelled' },
];

/** Sub-status chip shown below the main status badge on the list row */
const FULFILLMENT_LABELS = {
  packed:           'Order packed',
  loading:          'Loading for transport',
  out_for_delivery: 'Out for delivery',
  delivered:        'Delivered',
};
const RETURN_LABELS = {
  return_requested:        'Return requested',
  return_pickup_scheduled: 'Pickup scheduled',
  return_in_transit:       'Return in transit',
  returned_to_provider:    'Returned to provider',
  return_completed:        'Return completed',
};

function FulfillmentChip({ booking }) {
  const fs = booking.fulfillment?.status;
  const rs = booking.return?.status;
  if (!fs && !rs) return null;

  const label = rs ? RETURN_LABELS[rs] : FULFILLMENT_LABELS[fs];
  const isReturn = Boolean(rs);
  const isDone = fs === 'delivered' || rs === 'return_completed';

  return (
    <span className={[
      'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border',
      isDone ? 'text-success border-success/30 bg-success/5' :
      isReturn ? 'text-warn border-warn/30 bg-warn/5' :
                 'text-ink-soft border-line bg-surface-sunk',
    ].join(' ')}>
      {isDone ? '✓ ' : '● '}{label}
    </span>
  );
}

/** One request: image, what it is, where it stands, and what you can do. */
function BookingRow({ booking, direction, actions }) {
  const [busy, setBusy] = useState('');
  const r = booking.resource || {};
  const isProvider = direction === 'received';
  const counterparty = isProvider ? booking.seeker : booking.provider;

  const run = async (verb, mutation, extra = {}) => {
    setBusy(verb);
    try {
      await mutation.mutateAsync({ id: booking._id, ...extra });
      toast.success(`Request ${verb}ed`);
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${verb} the request.`));
    } finally {
      setBusy('');
    }
  };

  const open = ['pending', 'negotiating'].includes(booking.status);
  const live = ['pending', 'negotiating', 'accepted', 'confirmed'].includes(booking.status);

  return (
    <article className="py-8 border-b border-line last:border-0">
      <div className="flex flex-col sm:flex-row gap-6">
        <Link to={`/r/${r._id}`} className="shrink-0">
          <img
            src={resourceImage(r)}
            alt={r.title}
            className="w-full sm:w-[120px] h-[100px] object-cover rounded bg-surface-sunk"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <StatusBadge status={booking.status} />
            <FulfillmentChip booking={booking} />
            {booking.urgency === 'high' && open && (
              <span className="text-xs text-danger font-medium">Urgent</span>
            )}
          </div>

          <Link to={`/r/${r._id}`} className="text-base font-semibold hover:underline underline-offset-4">
            {r.title}
          </Link>

          <p className="text-sm text-ink-soft mt-1">
            {isProvider ? 'From' : 'Provider:'} {counterparty?.businessName}
          </p>
          <p className="text-sm text-ink-soft">
            {dateRange(booking.startDateTime, booking.endDateTime)}
            {' · '}{booking.requestedQuantity} unit{booking.requestedQuantity !== 1 ? 's' : ''}
            {' · '}{inr(booking.agreedPrice ?? booking.quotedPrice ?? 0)}
          </p>

          {booking.notes && (
            <p className="text-sm text-ink-mute mt-1 line-clamp-2 max-w-prose italic">"{booking.notes}"</p>
          )}
          {(booking.rejectionReason || booking.cancellationReason) && (
            <p className="text-sm text-danger mt-1">
              {booking.rejectionReason || booking.cancellationReason}
            </p>
          )}

          <p className="text-xs text-ink-mute mt-2">Updated {relative(booking.updatedAt)}</p>
        </div>

        {/* Only the action that moves this forward is primary; the rest recede. */}
        <div className="sm:w-[170px] shrink-0 flex flex-col gap-2">
          {isProvider && open && (
            <button
              onClick={() => run('accept', actions.accept)}
              disabled={Boolean(busy)}
              className="btn-primary btn-sm"
            >
              {busy === 'accept' ? 'Accepting…' : 'Accept'}
            </button>
          )}

          {!isProvider && booking.status === 'accepted' && (
            <Link
              to={`/payment/${booking._id}`}
              className="btn-primary btn-sm"
            >
              Pay now →
            </Link>
          )}

          <Link to={`/bookings/detail/${booking._id}`} className="btn-secondary btn-sm">
            View
          </Link>

          {isProvider && open && (
            <button
              onClick={() => {
                const reason = window.prompt('Why are you declining? (optional)') ?? '';
                run('reject', actions.reject, { reason });
              }}
              disabled={Boolean(busy)}
              className="btn-ghost btn-sm"
            >
              Decline
            </button>
          )}

          {/* Only allow manual complete for non-delivery bookings (no fulfillment started).
               Delivery-workflow bookings auto-complete via return_completed on the backend. */}
          {booking.status === 'confirmed' && !booking.fulfillment?.status && (
            <button
              onClick={() => run('complete', actions.complete)}
              disabled={Boolean(busy)}
              className="btn-ghost btn-sm"
            >
              Mark completed
            </button>
          )}

          {/* Provider: next fulfillment action from the list */}
          {isProvider && booking.status === 'confirmed' && booking.fulfillment?.status &&
            booking.fulfillment.status !== 'delivered' && (
            <Link to={`/bookings/detail/${booking._id}`} className="btn-ghost btn-sm">
              Update delivery →
            </Link>
          )}

          {booking.status === 'completed' && (
            <Link to={`/bookings/detail/${booking._id}#review`} className="btn-ghost btn-sm">
              Write a review
            </Link>
          )}

          {live && (
            <button
              onClick={() => {
                const reason = window.prompt('Reason for cancelling? (optional)') ?? '';
                run('cancel', actions.cancel, { reason });
              }}
              disabled={Boolean(busy)}
              className="btn-ghost btn-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Bookings({ direction = 'sent' }) {
  const [tab, setTab] = useState('all');
  const { data, isLoading } = useBookings(direction, tab === 'all' ? undefined : tab);
  const actions = useBookingActions();

  const bookings = data?.bookings || [];
  const isProvider = direction === 'received';

  return (
    <div className="shell pt-12 pb-20">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <h1 className="h-page">{isProvider ? 'Incoming requests' : 'Your requests'}</h1>
        <Link to={isProvider ? '/bookings/sent' : '/bookings/received'} className="text-sm link">
          {isProvider ? 'Requests you sent' : 'Requests you received'}
        </Link>
      </header>

      <div className="flex gap-8 border-b border-line mb-2 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? 'border-ink text-ink font-medium'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner label="Loading requests" />
      ) : bookings.length === 0 ? (
        <EmptyState
          title={isProvider ? 'Nothing here yet' : 'No requests in this view'}
          message={
            isProvider
              ? 'When another business requests one of your listings, it appears here.'
              : 'Browse resources and add them to your request cart to get started.'
          }
          action={
            !isProvider && (
              <Link to="/s" className="btn-primary">
                Browse resources
              </Link>
            )
          }
        />
      ) : (
        <div>
          {bookings.map((b) => (
            <BookingRow key={b._id} booking={b} direction={direction} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}
