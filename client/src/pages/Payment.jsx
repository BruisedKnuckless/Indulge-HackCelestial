import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useBooking, useBookingActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Spinner, Alert, Price } from '../components/ui';
import { resourceImage } from '../lib/constants';
import { inr, dateRange, dateTime } from '../lib/format';

/* ── Payment method options ──────────────────────────────────────────────── */
const METHODS = [
  {
    id: 'upi',
    label: 'UPI',
    sub: 'Pay via any UPI app — GPay, PhonePe, Paytm',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8M8 12l4-4 4 4" />
      </svg>
    ),
  },
  {
    id: 'card',
    label: 'Credit / Debit Card',
    sub: 'Visa, Mastercard, Rupay',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    id: 'netbanking',
    label: 'Net Banking',
    sub: 'All major Indian banks supported',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M16 10v11M12 10v11" />
      </svg>
    ),
  },
  {
    id: 'wallet',
    label: 'Wallet / Other',
    sub: 'Amazon Pay, Mobikwik, Ola Money',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12V8a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2v-4" />
        <circle cx="18" cy="12" r="2" />
      </svg>
    ),
  },
];

/* ── Success screen ──────────────────────────────────────────────────────── */
function PaymentSuccess({ booking, transaction }) {
  const r = booking.resource || {};
  return (
    <div className="shell pt-12 pb-20 max-w-[560px]">
      <div className="card text-center">
        {/* Success icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 border border-success/30 mb-5 mx-auto">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <h1 className="h-page mb-1">Payment successful</h1>
        <p className="text-sm text-ink-soft mb-6">Your booking is now confirmed.</p>

        <div className="bg-surface-sunk rounded-xl border border-line p-4 text-left space-y-2 mb-6">
          <Row label="Transaction ID" value={String(transaction._id).slice(-12).toUpperCase()} mono />
          <Row label="Booking ref" value={String(booking._id).slice(-10).toUpperCase()} mono />
          <Row label="Resource" value={r.title} />
          <Row label="Provider" value={booking.provider?.businessName} />
          <Row label="Dates" value={dateRange(booking.startDateTime, booking.endDateTime)} />
          <Row label="Quantity" value={`${booking.requestedQuantity} unit(s)`} />
          <hr className="border-line" />
          <Row
            label="Amount paid"
            value={inr(transaction.amount || booking.agreedPrice || booking.quotedPrice || 0)}
            strong
          />
          <Row label="Method" value={
            METHODS.find((m) => m.id === transaction.paymentMethod)?.label || transaction.paymentMethod || 'Simulated'
          } />
          <Row label="Settled at" value={dateTime(transaction.paidAt)} />
        </div>

        <Link to={`/bookings/detail/${booking._id}`} className="btn-primary w-full justify-center mb-3">
          View booking
        </Link>
        <Link to="/bookings/sent" className="btn-secondary w-full justify-center">
          All your requests
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, mono, strong }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className={`text-right ${mono ? 'font-mono text-xs' : ''} ${strong ? 'font-semibold' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Payment page — demo mock payment gateway.
   Route: /payment/:bookingId
   ════════════════════════════════════════════════════════════════════════════ */
export default function Payment() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useBooking(bookingId);
  const actions = useBookingActions();

  const [method, setMethod] = useState('upi');
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState(null); // { booking, transaction } on success

  if (isLoading) return <Spinner label="Loading payment" />;

  const booking = data?.booking;

  if (!booking) {
    return (
      <div className="shell pt-12 pb-20 text-center">
        <p className="text-ink-soft">Booking not found.</p>
        <Link to="/bookings/sent" className="btn-secondary mt-4">Back to requests</Link>
      </div>
    );
  }

  // Guard: only the seeker can pay
  if (user && String(booking.seeker?._id) !== String(user._id)) {
    return (
      <div className="shell pt-12 pb-20">
        <Alert tone="error">You are not authorised to pay for this booking.</Alert>
        <Link to="/bookings/sent" className="btn-secondary mt-4 inline-flex">Back</Link>
      </div>
    );
  }

  // Already paid — show success immediately
  if (result) {
    return <PaymentSuccess booking={result.booking} transaction={result.transaction} />;
  }

  // Already confirmed / not accepted — redirect to booking detail
  if (booking.status !== 'accepted') {
    return (
      <div className="shell pt-12 pb-20">
        <Alert tone={booking.status === 'confirmed' ? 'success' : 'warn'}>
          {booking.status === 'confirmed'
            ? 'This booking has already been paid and confirmed.'
            : `Payment is not available — booking is ${booking.status}.`}
        </Alert>
        <Link to={`/bookings/detail/${booking._id}`} className="btn-secondary mt-4 inline-flex">
          View booking
        </Link>
      </div>
    );
  }

  const r = booking.resource || {};
  const payable = booking.agreedPrice ?? booking.quotedPrice ?? 0;
  const gst = Math.round(payable * 0.18);

  const pay = async () => {
    setPaying(true);
    try {
      const res = await actions.pay.mutateAsync({ id: booking._id, paymentMethod: method });
      setResult(res);
    } catch (err) {
      toast.error(errorMessage(err, 'Payment could not be processed. Please try again.'));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="bg-surface min-h-screen">
      {/* Page header */}
      <div className="border-b border-line bg-surface-alt">
        <div className="shell py-3 flex items-center justify-between gap-3">
          <h1 className="h-section">Complete payment</h1>
          {/* DEMO badge — clearly visible */}
          <span className="inline-flex items-center gap-1.5 h-6 px-3 rounded-full bg-warn/15 border border-warn/30 text-warn text-xs font-semibold tracking-wide">
            DEMO PAYMENT
          </span>
        </div>
      </div>

      <div className="shell py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

          {/* Left: Payment method selection */}
          <div className="space-y-4">
            {/* Order summary card */}
            <div className="card">
              <h2 className="h-section mb-4">Order summary</h2>
              <div className="flex gap-4">
                <img
                  src={resourceImage(r)}
                  alt={r.title}
                  className="w-[80px] h-[80px] object-cover rounded-lg border border-line shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold leading-snug">{r.title}</p>
                  <p className="text-sm text-ink-soft mt-0.5">
                    {dateRange(booking.startDateTime, booking.endDateTime)}
                  </p>
                  <p className="text-sm text-ink-soft">Qty: {booking.requestedQuantity}</p>
                  <p className="text-xs text-ink-mute mt-1">
                    Provider:{' '}
                    <Link to={`/provider/${booking.provider?._id}`} className="link-quiet">
                      {booking.provider?.businessName}
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            {/* Payment method selector */}
            <div className="card">
              <h2 className="h-section mb-4">Payment method</h2>
              <p className="text-xs text-ink-mute mb-4 border border-warn/30 bg-warn/5 text-warn rounded-lg px-3 py-2">
                This is a demo environment. No real money will be charged.
                Select any method to simulate payment.
              </p>
              <div className="space-y-2">
                {METHODS.map((m) => (
                  <label
                    key={m.id}
                    className={[
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150',
                      method === m.id
                        ? 'border-ink bg-surface-sunk'
                        : 'border-line hover:border-line-strong hover:bg-surface-sunk',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={m.id}
                      checked={method === m.id}
                      onChange={() => setMethod(m.id)}
                      className="sr-only"
                    />
                    <span className={`shrink-0 ${method === m.id ? 'text-ink' : 'text-ink-mute'}`}>
                      {m.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-ink-mute">{m.sub}</p>
                    </div>
                    {/* Selected indicator */}
                    <span
                      className={[
                        'w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                        method === m.id
                          ? 'border-ink bg-ink'
                          : 'border-line-strong bg-transparent',
                      ].join(' ')}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Price summary + Pay button */}
          <div>
            <div className="card sticky top-24">
              <h2 className="text-base font-semibold mb-4">Payment summary</h2>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Resource rental</dt>
                  <dd>{inr(payable)}</dd>
                </div>
                {booking.logistics === 'provider_transport' && (
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Logistics (provider arranged)</dt>
                    <dd className="text-ink-mute">Billed separately</dd>
                  </div>
                )}
                <div className="flex justify-between text-ink-mute text-xs">
                  <dt>GST 18% (informational)</dt>
                  <dd>{inr(gst)}</dd>
                </div>
              </dl>

              <hr className="border-line my-3" />

              <div className="flex justify-between font-semibold text-base mb-1">
                <span>Total payable</span>
                <span>{inr(payable)}</span>
              </div>
              <p className="text-xs text-ink-mute mb-5">
                GST to be settled directly with the provider per your agreement.
              </p>

              <button
                onClick={pay}
                disabled={paying}
                id="pay-now-btn"
                className="btn-primary w-full mb-2"
              >
                {paying ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-invert/30 border-t-ink-invert animate-spin" />
                    Processing…
                  </span>
                ) : (
                  `Pay ${inr(payable)}`
                )}
              </button>

              <Link
                to={`/bookings/detail/${booking._id}`}
                className="btn-ghost w-full justify-center text-xs"
              >
                Cancel and go back
              </Link>

              <p className="text-[11px] text-ink-mute text-center mt-3 leading-relaxed">
                By clicking Pay you agree to Indulge's Conditions of Use.
                This is a simulated payment — no real charge will be made.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
