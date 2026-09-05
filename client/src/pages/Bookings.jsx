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
  { key: 'accepted,confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled,rejected', label: 'Cancelled' },
];

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
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <StatusBadge status={booking.status} />
            {booking.urgency === 'high' && open && (
              <span className="text-xs text-danger">Urgent</span>
            )}
          </div>

          <Link to={`/r/${r._id}`} className="text-lg font-medium hover:underline underline-offset-4">
            {r.title}
          </Link>

          <p className="text-sm muted mt-1">
            {isProvider ? 'Requested by' : 'From'} {counterparty?.businessName}
          </p>
          <p className="text-sm muted">
            {dateRange(booking.startDateTime, booking.endDateTime)} · qty {booking.requestedQuantity}
            {' · '}
            {inr(booking.agreedPrice ?? booking.quotedPrice ?? 0)}
          </p>

          {booking.notes && (
            <p className="text-sm muted mt-2 line-clamp-2 max-w-prose">“{booking.notes}”</p>
          )}
          {(booking.rejectionReason || booking.cancellationReason) && (
            <p className="text-sm text-danger mt-2">
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
            <button
              onClick={() => run('confirm', actions.confirm)}
              disabled={Boolean(busy)}
              className="btn-primary btn-sm"
            >
              Confirm booking
            </button>
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

          {booking.status === 'confirmed' && (
            <button
              onClick={() => run('complete', actions.complete)}
              disabled={Boolean(busy)}
              className="btn-ghost btn-sm"
            >
              Mark completed
            </button>
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
