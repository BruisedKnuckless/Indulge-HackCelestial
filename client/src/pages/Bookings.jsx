import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useBookings, useBookingActions } from '../hooks/queries';
import { errorMessage } from '../api/client';
import { StatusBadge, Spinner, EmptyState, DealBadge } from '../components/ui';
import { resourceImage } from '../lib/constants';
import { inr, dateRange, longDate, relative } from '../lib/format';

const TABS = [
  { key: 'all', label: 'All requests' },
  { key: 'pending,negotiating', label: 'Open' },
  { key: 'accepted,confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled,rejected', label: 'Cancelled' },
];

/**
 * One booking, rendered as an order card: gray meta strip on top, content and
 * actions below.
 */
function BookingCard({ booking, direction, actions }) {
  const [busy, setBusy] = useState('');
  const r = booking.resource || {};
  const counterparty = direction === 'sent' ? booking.provider : booking.seeker;

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

  const isProvider = direction === 'received';

  return (
    <div className="border border-bd rounded bg-white mb-4">
      <div className="bg-[#F0F2F2] border-b border-bd rounded-t px-4 py-2.5 flex flex-wrap gap-x-10 gap-y-2 text-mini">
        <div>
          <p className="text-ink-soft uppercase tracking-wide">Request placed</p>
          <p>{longDate(booking.createdAt)}</p>
        </div>
        <div>
          <p className="text-ink-soft uppercase tracking-wide">Amount</p>
          <p>{inr(booking.agreedPrice ?? booking.quotedPrice ?? 0)}</p>
        </div>
        <div>
          <p className="text-ink-soft uppercase tracking-wide">
            {isProvider ? 'Requested by' : 'Provider'}
          </p>
          <p>{counterparty?.businessName}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-ink-soft uppercase tracking-wide">Request #</p>
          <p className="font-mono">{booking._id.slice(-10).toUpperCase()}</p>
        </div>
      </div>

      <div className="p-4 flex flex-col sm:flex-row gap-4">
        <Link to={`/r/${r._id}`} className="shrink-0">
          <img
            src={resourceImage(r)}
            alt={r.title}
            className="w-[110px] h-[110px] object-cover rounded"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={booking.status} />
            {booking.urgency === 'high' && <DealBadge>Urgent</DealBadge>}
            {booking.matchScore >= 0.7 && (
              <span className="text-mini text-ink-soft">
                {Math.round(booking.matchScore * 100)}% match at request time
              </span>
            )}
          </div>

          <Link to={`/r/${r._id}`} className="text-title a-link block leading-snug">
            {r.title}
          </Link>

          <p className="text-base text-ink-soft mt-0.5">
            {dateRange(booking.startDateTime, booking.endDateTime)}
          </p>
          <p className="text-base text-ink-soft">
            Quantity: {booking.requestedQuantity}
            {booking.logistics === 'provider_transport' && ' · Provider transport requested'}
          </p>

          {booking.notes && (
            <p className="text-base text-ink-soft mt-1 line-clamp-2">“{booking.notes}”</p>
          )}

          {booking.rejectionReason && (
            <p className="text-base text-danger mt-1">Reason: {booking.rejectionReason}</p>
          )}
          {booking.cancellationReason && (
            <p className="text-base text-danger mt-1">Reason: {booking.cancellationReason}</p>
          )}

          <p className="text-mini text-ink-mute mt-1">Updated {relative(booking.updatedAt)}</p>
        </div>

        <div className="sm:w-[210px] shrink-0 space-y-2">
          <Link to={`/bookings/detail/${booking._id}`} className="btn-secondary btn-pill w-full">
            {isProvider ? 'View request' : 'Track request'}
          </Link>

          {isProvider && ['pending', 'negotiating'].includes(booking.status) && (
            <>
              <button
                onClick={() => run('accept', actions.accept)}
                disabled={Boolean(busy)}
                className="btn-yellow btn-pill w-full"
              >
                {busy === 'accept' ? 'Accepting…' : 'Accept request'}
              </button>
              <button
                onClick={() => {
                  const reason = window.prompt('Why are you declining? (optional)') ?? '';
                  run('reject', actions.reject, { reason });
                }}
                disabled={Boolean(busy)}
                className="btn-secondary btn-pill w-full"
              >
                Decline
              </button>
            </>
          )}

          {!isProvider && booking.status === 'accepted' && (
            <button
              onClick={() => run('confirm', actions.confirm)}
              disabled={Boolean(busy)}
              className="btn-yellow btn-pill w-full"
            >
              {busy === 'confirm' ? 'Confirming…' : 'Confirm booking'}
            </button>
          )}

          {booking.status === 'confirmed' && (
            <button
              onClick={() => run('complete', actions.complete)}
              disabled={Boolean(busy)}
              className="btn-secondary btn-pill w-full"
            >
              Mark completed
            </button>
          )}

          {['pending', 'negotiating', 'accepted', 'confirmed'].includes(booking.status) && (
            <button
              onClick={() => {
                const reason = window.prompt('Reason for cancelling? (optional)') ?? '';
                run('cancel', actions.cancel, { reason });
              }}
              disabled={Boolean(busy)}
              className="btn-secondary btn-pill w-full"
            >
              Cancel
            </button>
          )}

          {booking.status === 'completed' && (
            <Link
              to={`/bookings/detail/${booking._id}#review`}
              className="btn-secondary btn-pill w-full"
            >
              Write a review
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Bookings({ direction = 'sent' }) {
  const [tab, setTab] = useState('all');
  const { data, isLoading } = useBookings(direction, tab === 'all' ? undefined : tab);
  const actions = useBookingActions();

  const bookings = data?.bookings || [];
  const isProvider = direction === 'received';

  return (
    <div className="page-shell py-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h1 className="text-page font-normal">
          {isProvider ? 'Incoming requests' : 'Your requests'}
        </h1>
        <Link to={isProvider ? '/bookings/sent' : '/bookings/received'} className="a-link text-base">
          {isProvider ? 'View requests you sent ›' : 'View requests you received ›'}
        </Link>
      </div>

      <div className="border-b border-bd mb-4 flex gap-5 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 text-body whitespace-nowrap border-b-[3px] -mb-px transition-colors ${
              tab === t.key
                ? 'border-orange font-bold text-ink'
                : 'border-transparent a-link-plain text-link'
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
          title={isProvider ? 'No requests here yet' : 'No requests in this view'}
          message={
            isProvider
              ? 'When another business requests one of your listings, it will appear here.'
              : 'Browse resources and add them to your request cart to get started.'
          }
          action={
            !isProvider && (
              <Link to="/s" className="btn-yellow btn-pill">
                Browse resources
              </Link>
            )
          }
        />
      ) : (
        bookings.map((b) => (
          <BookingCard key={b._id} booking={b} direction={direction} actions={actions} />
        ))
      )}
    </div>
  );
}
