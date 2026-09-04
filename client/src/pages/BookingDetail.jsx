import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useBooking,
  useNegotiation,
  useSendNegotiation,
  useBookingActions,
} from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { Panel, StatusBadge, Spinner, Price, Stars, Alert } from '../components/ui';
import MatchBreakdown from '../components/MatchBreakdown';
import { resourceImage } from '../lib/constants';
import { inr, dateRange, dateTime, relative, toLocalInput } from '../lib/format';

const STEPS = ['Requested', 'Accepted', 'Confirmed', 'In use', 'Completed'];

/** Which tracker step a status corresponds to; -1 means the flow ended early. */
function stepIndex(status) {
  switch (status) {
    case 'pending':
    case 'negotiating':
      return 0;
    case 'accepted':
      return 1;
    case 'confirmed':
      return 2;
    case 'completed':
      return 4;
    default:
      return -1;
  }
}

function ProgressTracker({ status }) {
  const active = stepIndex(status);

  if (active === -1) {
    return (
      <Alert tone="error">
        This request was {status}. No further action is possible.
      </Alert>
    );
  }

  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div
              className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold ${
                i <= active ? 'bg-success text-white' : 'bg-line text-ink-mute'
              }`}
            >
              {i < active ? '✓' : i + 1}
            </div>
            <span
              className={`text-xs whitespace-nowrap ${
                i <= active ? 'text-ink font-semibold' : 'text-ink-mute'
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`flex-1 h-[3px] mx-1 mb-4 rounded ${
                i < active ? 'bg-success' : 'bg-line'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function NegotiationThread({ bookingId, booking, me, isProvider }) {
  const { data, isLoading } = useNegotiation(bookingId);
  const send = useSendNegotiation(bookingId);
  const qc = useQueryClient();

  const [message, setMessage] = useState('');
  // 'message' | 'counter_offer' | 'quotation'. A quotation is the provider
  // stating a formal price; a counter-offer is either side proposing new terms.
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
      <h2 className="h-section mb-5">Messages & offers</h2>

      {isLoading ? (
        <Spinner label="Loading conversation" />
      ) : (
        <div className="space-y-3 mb-4">
          {messages.length === 0 && (
            <p className="text-base text-ink-soft">
              No messages yet. Use this thread to agree terms before accepting.
            </p>
          )}

          {messages.map((m) => {
            const mine = String(m.sender?._id) === String(me._id);
            return (
              <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] border rounded-lg px-3 py-2 ${
                    mine ? 'bg-surface-sunk border-line' : 'bg-white border-line'
                  }`}
                >
                  <p className="text-xs font-semibold mb-0.5">
                    {m.sender?.businessName}
                    <span className="font-normal text-ink-mute"> · {relative(m.createdAt)}</span>
                  </p>

                  {m.type === 'counter_offer' || m.type === 'quotation' ? (
                    <>
                      <p className="text-base font-semibold text-ink mb-0.5">
                        {m.type === 'quotation' ? 'Quotation' : 'Counter-offer'}: {inr(m.proposedPrice)}
                      </p>
                      {m.proposedStart && (
                        <p className="text-xs text-ink-soft mb-1">
                          {dateRange(m.proposedStart, m.proposedEnd)}
                        </p>
                      )}
                      {m.message && <p className="text-base mb-1">{m.message}</p>}
                      {!mine && !closed && (
                        <button
                          onClick={() => acceptOffer(m._id)}
                          className="btn-primary text-xs px-3 py-1 mt-1"
                        >
                          Accept these terms
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-base">{m.message}</p>
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
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label">From</label>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="field"
                />
              </div>
            </div>
          )}

          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              mode === 'message' ? 'Write a message…' : 'Add a note (optional)'
            }
            className="field-area mb-2"
          />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={send.isPending} className="btn-primary">
              {mode === 'message'
                ? 'Send message'
                : mode === 'quotation'
                  ? 'Send quotation'
                  : 'Send counter-offer'}
            </button>

            {mode === 'message' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode('counter_offer')}
                  className="btn-secondary"
                >
                  Make a counter-offer
                </button>
                {/* Only the side supplying the resource can quote a price for it. */}
                {isProvider && (
                  <button
                    type="button"
                    onClick={() => setMode('quotation')}
                    className="btn-secondary"
                  >
                    Send a quotation
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => setMode('message')} className="btn-ghost">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
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
    <form onSubmit={submit} id="review">
      <h2 className="h-section mb-4">Write a review</h2>

      <div className="flex items-center gap-2 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="p-0.5"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 20 20"
              fill={n <= rating ? '#141416' : '#E4E4E7'}
            >
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
            </svg>
          </button>
        ))}
        <span className="text-base text-ink-soft ml-1">{rating} out of 5</span>
      </div>

      <textarea
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How did it go? Condition, punctuality, communication…"
        className="field-area mb-2"
      />

      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? 'Posting…' : 'Submit review'}
      </button>
    </form>
  );
}

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, isLoading } = useBooking(id);
  const actions = useBookingActions();
  const [busy, setBusy] = useState('');

  if (isLoading) return <Spinner label="Loading request" />;

  const booking = data?.booking;
  if (!booking) return <div className="shell pt-12 pb-20">Request not found.</div>;

  const transaction = data?.transaction;
  const r = booking.resource || {};
  const isProvider = String(booking.provider?._id) === String(user._id);
  const counterparty = isProvider ? booking.seeker : booking.provider;

  const run = async (verb, mutation, extra = {}) => {
    setBusy(verb);
    try {
      await mutation.mutateAsync({ id: booking._id, ...extra });
      toast.success(`Request ${verb}ed`);
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${verb}.`));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="shell pt-12 pb-20">
      <p className="text-xs text-ink-soft mb-3">
        <Link to={isProvider ? '/bookings/received' : '/bookings/sent'} className="link">
          {isProvider ? 'Incoming requests' : 'Your requests'}
        </Link>
        {' › '}
        <span>Request #{booking._id.slice(-10).toUpperCase()}</span>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h1 className="h-section">Request status</h1>
              <StatusBadge status={booking.status} />
            </div>
            <ProgressTracker status={booking.status} />
          </div>

          <div className="card">
            <h2 className="h-section mb-5">Resource</h2>
            <div className="flex gap-4">
              <Link to={`/r/${r._id}`} className="shrink-0">
                <img
                  src={resourceImage(r)}
                  alt={r.title}
                  className="w-[120px] h-[120px] object-cover rounded"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/r/${r._id}`} className="text-lg link block">
                  {r.title}
                </Link>
                <p className="text-base text-ink-soft mt-1">
                  {dateRange(booking.startDateTime, booking.endDateTime)}
                </p>
                <p className="text-base text-ink-soft">Quantity: {booking.requestedQuantity}</p>
                <p className="text-base text-ink-soft">
                  Logistics:{' '}
                  {booking.logistics === 'provider_transport'
                    ? 'Provider arranges transport'
                    : 'Self pickup'}
                </p>
                {booking.notes && (
                  <p className="text-base mt-2 border-l-2 border-line pl-2 text-ink-soft">
                    “{booking.notes}”
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

          <div className="card">
            <NegotiationThread
              bookingId={booking._id}
              booking={booking}
              me={user}
              isProvider={isProvider}
            />
          </div>

          {booking.status === 'completed' && (
            <div className="card">
              <ReviewForm booking={booking} me={user} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <h2 className="text-base font-semibold mb-2">Summary</h2>
            <dl className="text-base space-y-1.5">
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
                <dd>{dateTime(booking.createdAt)}</dd>
              </div>
            </dl>

            {/* The money trail. Payments are simulated, and the copy says so
                rather than implying a real settlement has happened. */}
            {transaction && (
              <>
                <hr className="border-0 border-t border-line my-3" />
                <h3 className="text-base font-semibold mb-2">Transaction</h3>
                <dl className="text-base space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">Reference</dt>
                    <dd className="font-mono text-xs">
                      {String(transaction._id).slice(-10).toUpperCase()}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">Amount</dt>
                    <dd>{inr(transaction.amount)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">Status</dt>
                    <dd
                      className={
                        transaction.status === 'simulated_paid' ? 'text-success' : 'text-ink-soft'
                      }
                    >
                      {transaction.status === 'simulated_paid'
                        ? 'Paid (simulated)'
                        : transaction.status === 'refunded'
                          ? 'Refunded'
                          : 'Pending'}
                    </dd>
                  </div>
                  {transaction.paidAt && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-soft">Settled</dt>
                      <dd>{dateTime(transaction.paidAt)}</dd>
                    </div>
                  )}
                </dl>
              </>
            )}

            <hr className="border-0 border-t border-line my-3" />

            <h3 className="text-base font-semibold mb-1">
              {isProvider ? 'Requesting business' : 'Provider'}
            </h3>
            <Link to={`/provider/${counterparty?._id}`} className="link text-base block">
              {counterparty?.businessName}
            </Link>
            {counterparty?.ratingCount > 0 && (
              <Stars
                rating={counterparty.ratingAvg}
                count={counterparty.ratingCount}
                size={13}
                className="mt-0.5"
              />
            )}
            <p className="text-xs text-ink-soft mt-1">
              {counterparty?.location?.city}
              {counterparty?.phone ? ` · ${counterparty.phone}` : ''}
            </p>
          </Panel>

          <Panel className="p-4 space-y-2">
            <h2 className="text-base font-semibold">Actions</h2>

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
                    const reason = window.prompt('Why are you declining? (optional)') ?? '';
                    run('reject', actions.reject, { reason });
                  }}
                  disabled={Boolean(busy)}
                  className="btn-secondary w-full"
                >
                  Decline request
                </button>
              </>
            )}

            {!isProvider && booking.status === 'accepted' && (
              <button
                onClick={() => run('confirm', actions.confirm)}
                disabled={Boolean(busy)}
                className="btn-primary w-full"
              >
                Confirm booking
              </button>
            )}

            {booking.status === 'confirmed' && (
              <button
                onClick={() => run('complete', actions.complete)}
                disabled={Boolean(busy)}
                className="btn-secondary w-full"
              >
                Mark as completed
              </button>
            )}

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
              <p className="text-base text-ink-soft">
                This request is closed. Nothing further to do.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
