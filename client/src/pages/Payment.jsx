import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useBooking, useBookingActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Spinner, Alert } from '../components/ui';
import { resourceImage, CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, dateTime } from '../lib/format';

/* ─────────────────────────────────────────────────────────────────────────────
   Top 10 Indian banks for Net Banking
───────────────────────────────────────────────────────────────────────────── */
const BANKS = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'IndusInd Bank',
];

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
function Row({ label, value, strong, muted, highlight }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className={muted ? 'text-ink-mute' : 'text-ink-soft'}>{label}</span>
      <span className={[strong ? 'font-semibold text-ink' : '', highlight ? 'text-success font-bold text-base' : '', muted ? 'text-ink-mute' : ''].filter(Boolean).join(' ')}>
        {value ?? '—'}
      </span>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-ink mb-3">{children}</h2>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Processing overlay
───────────────────────────────────────────────────────────────────────────── */
function ProcessingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
      <div className="card text-center px-10 py-10 max-w-xs w-full">
        <div className="relative w-14 h-14 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-line" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-ink animate-spin" />
        </div>
        <p className="text-base font-semibold text-ink mb-1">Processing payment…</p>
        <p className="text-xs text-ink-mute">Please do not close this window.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Success receipt
───────────────────────────────────────────────────────────────────────────── */
const METHOD_LABELS = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', wallet: 'Wallet' };

function PaymentSuccess({ booking, transaction }) {
  const r = booking.resource || {};
  const paid = transaction?.amount ?? booking.agreedPrice ?? booking.quotedPrice ?? 0;
  const txRef = transaction?._id ? String(transaction._id).slice(-12).toUpperCase() : '—';

  return (
    <div className="bg-surface min-h-screen">
      <div className="shell pt-10 pb-20 max-w-[560px]">
        <div className="card text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 border-2 border-success/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ink mb-1">Payment Successful</h1>
          <p className="text-sm text-ink-soft mb-3">Your booking is confirmed. The provider has been notified.</p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warn/10 border border-warn/30 text-warn text-xs font-semibold">
            DEMO PAYMENT — no real charge made
          </span>
        </div>

        <div className="card mb-4">
          <SectionTitle>Payment receipt</SectionTitle>
          <div className="bg-surface-sunk rounded-lg border border-line p-4 space-y-2.5">
            <Row label="Transaction ID" value={txRef} strong />
            <Row label="Booking ref" value={String(booking._id).slice(-10).toUpperCase()} strong />
            <div className="border-t border-line pt-2.5 space-y-2">
              <Row label="Resource" value={r.title} />
              <Row label="Provider" value={booking.provider?.businessName} />
              <Row label="Dates" value={dateRange(booking.startDateTime, booking.endDateTime)} />
              <Row label="Qty" value={`${booking.requestedQuantity} unit(s)`} />
            </div>
            <div className="border-t border-line pt-2.5 space-y-2">
              <Row label="Amount paid" value={inr(paid)} highlight />
              <Row label="Method" value={METHOD_LABELS[transaction?.paymentMethod] || transaction?.paymentMethod || '—'} />
              {transaction?.paidAt && <Row label="Settled at" value={dateTime(transaction.paidAt)} />}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Link to={`/bookings/detail/${booking._id}`} className="btn-primary w-full justify-center" id="view-booking-btn">
            View Booking
          </Link>
          <Link to="/bookings/sent" className="btn-secondary w-full justify-center">All Requests</Link>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   UPI Tab
───────────────────────────────────────────────────────────────────────────── */
function UpiTab({ amount, onPay, paying }) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-4">
      {/* QR code */}
      <div className="flex flex-col items-center">
        <div className="border-2 border-line rounded-xl overflow-hidden w-52 h-52 bg-white flex items-center justify-center">
          <img src="/upi-qr.png" alt="UPI QR Code" className="w-full h-full object-cover" />
        </div>
        <p className="text-xs text-ink-mute mt-2 text-center">
          Scan with GPay, PhonePe, Paytm, BHIM or any UPI app
        </p>
      </div>

      {/* UPI ID */}
      <div className="bg-surface-sunk rounded-lg border border-line p-3">
        <p className="text-xs text-ink-mute mb-1">UPI ID (or pay to)</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-mono font-semibold text-ink">indulge-b2b@okaxis</p>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText('indulge-b2b@okaxis'); toast.success('UPI ID copied'); }}
            className="text-xs btn-ghost px-2 py-1"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="text-xs text-ink-soft space-y-1 px-1">
        <p>1. Open any UPI app and scan the QR code above, or enter the UPI ID.</p>
        <p>2. Enter the exact amount: <strong className="text-ink">{inr(amount)}</strong></p>
        <p>3. Complete the payment in your UPI app.</p>
        <p>4. Return here and click "I have paid" to confirm.</p>
      </div>

      {/* Confirmation checkbox */}
      <label className="flex items-start gap-2.5 cursor-pointer border border-line rounded-lg p-3 hover:bg-surface-sunk transition-colors">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
          id="upi-confirm-checkbox"
        />
        <span className="text-sm text-ink-soft">
          I have completed the UPI payment of <strong className="text-ink">{inr(amount)}</strong>.
        </span>
      </label>

      <button
        id="upi-pay-btn"
        onClick={() => onPay('upi')}
        disabled={!confirmed || paying}
        className="btn-primary w-full"
      >
        {paying ? 'Verifying…' : 'Confirm UPI Payment'}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Card Tab
───────────────────────────────────────────────────────────────────────────── */
function luhnCheck(num) {
  const digits = num.replace(/\D/g, '');
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0 && digits.length >= 13;
}

function cardType(num) {
  const n = num.replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^5[1-5]/.test(n)) return 'Mastercard';
  if (/^6[0-9]{15}/.test(n) || /^508[5-9]/.test(n)) return 'RuPay';
  return '';
}

function formatCard(val) {
  return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(val) {
  const d = val.replace(/\D/g, '').slice(0, 4);
  if (d.length >= 2) return d.slice(0, 2) + '/' + d.slice(2);
  return d;
}

function CardTab({ onPay, paying }) {
  const [name, setName] = useState('');
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Required';
    const digits = card.replace(/\D/g, '');
    if (digits.length < 13 || !luhnCheck(digits)) e.card = 'Invalid card number';
    const [mm, yy] = expiry.split('/');
    const m = parseInt(mm, 10), y = parseInt('20' + yy, 10);
    const now = new Date();
    if (!mm || !yy || m < 1 || m > 12 || new Date(y, m - 1) < now) e.expiry = 'Invalid expiry';
    if (!cvv || cvv.length < 3) e.cvv = 'Invalid CVV';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePay = () => {
    if (validate()) onPay('card');
  };

  const type = cardType(card);

  return (
    <div className="space-y-3">
      <div className="bg-surface-sunk rounded-lg border border-line px-3 py-2 text-xs text-ink-soft flex items-center gap-2">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        Card details are used for display only and are never transmitted to the server.
      </div>

      {/* Cardholder name */}
      <div>
        <label className="label" htmlFor="card-name">Cardholder name</label>
        <input id="card-name" type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="As printed on card" className={`field w-full ${errors.name ? 'border-danger' : ''}`} />
        {errors.name && <p className="text-xs text-danger mt-0.5">{errors.name}</p>}
      </div>

      {/* Card number */}
      <div>
        <label className="label" htmlFor="card-number">Card number</label>
        <div className="relative">
          <input id="card-number" type="text" inputMode="numeric" value={card}
            onChange={e => setCard(formatCard(e.target.value))}
            placeholder="0000 0000 0000 0000"
            className={`field w-full pr-16 ${errors.card ? 'border-danger' : ''}`} />
          {type && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-soft">{type}</span>
          )}
        </div>
        {errors.card && <p className="text-xs text-danger mt-0.5">{errors.card}</p>}
      </div>

      {/* Expiry + CVV */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="card-expiry">Expiry (MM/YY)</label>
          <input id="card-expiry" type="text" inputMode="numeric" value={expiry}
            onChange={e => setExpiry(formatExpiry(e.target.value))}
            placeholder="MM/YY"
            className={`field w-full ${errors.expiry ? 'border-danger' : ''}`} />
          {errors.expiry && <p className="text-xs text-danger mt-0.5">{errors.expiry}</p>}
        </div>
        <div>
          <label className="label" htmlFor="card-cvv">CVV</label>
          <input id="card-cvv" type="password" inputMode="numeric" maxLength={4}
            value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="•••"
            className={`field w-full ${errors.cvv ? 'border-danger' : ''}`} />
          {errors.cvv && <p className="text-xs text-danger mt-0.5">{errors.cvv}</p>}
        </div>
      </div>

      <button id="card-pay-btn" onClick={handlePay} disabled={paying} className="btn-primary w-full mt-2">
        {paying ? 'Processing…' : 'Pay Now'}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Net Banking Tab
───────────────────────────────────────────────────────────────────────────── */
function NetBankingTab({ onPay, paying }) {
  const [bank, setBank] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="bank-select">Select your bank</label>
        <select id="bank-select" value={bank} onChange={e => setBank(e.target.value)} className="field-select w-full">
          <option value="">— Choose a bank —</option>
          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div className="bg-surface-sunk rounded-lg border border-line p-3 text-xs text-ink-soft">
        You will be redirected to <strong className="text-ink">{bank || 'your bank'}'s</strong> secure
        payment page to authenticate. This is a demo environment — no real redirect occurs.
      </div>

      <button
        id="netbanking-pay-btn"
        onClick={() => onPay('netbanking')}
        disabled={!bank || paying}
        className="btn-primary w-full"
      >
        {paying ? 'Connecting to bank…' : `Continue to ${bank || 'Bank'}`}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Order summary panel (shared right column)
───────────────────────────────────────────────────────────────────────────── */
function OrderSummary({ booking, payable, gst }) {
  const r = booking.resource || {};
  return (
    <div className="card">
      <SectionTitle>Order summary</SectionTitle>

      {/* Resource */}
      <div className="flex gap-3 mb-4">
        <div className="w-16 h-16 rounded-lg overflow-hidden border border-line shrink-0 bg-surface-sunk">
          <img src={resourceImage(r)} alt={r.title} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold line-clamp-2">{r.title}</p>
          {r.category && (
            <span className="inline-block mt-0.5 text-[10px] text-ink-mute border border-line rounded px-1.5">
              {CATEGORY_LABELS[r.category] || r.category}
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        <Row label="Provider" value={booking.provider?.businessName} />
        <Row label="Dates" value={dateRange(booking.startDateTime, booking.endDateTime)} />
        <Row label="Qty" value={`${booking.requestedQuantity} unit(s)`} />
        <Row
          label="Logistics"
          value={booking.logistics === 'provider_transport' ? 'Provider transport' : 'Self pickup'}
          muted
        />
      </div>

      <div className="border-t border-line pt-3 space-y-2 mb-4">
        <Row label={`Rental × ${booking.requestedQuantity}`} value={inr(payable)} />
        {booking.logistics === 'provider_transport' && (
          <Row label="Transport" value="Billed separately" muted />
        )}
        <Row label="GST 18% (informational)" value={payable > 0 ? inr(gst) : '—'} muted />
      </div>

      <div className="border-t border-line pt-3">
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-semibold">Total payable</span>
          <span className="text-lg font-bold text-ink">{inr(payable)}</span>
        </div>
        <p className="text-[11px] text-ink-mute mt-1">
          GST settled directly with provider per agreement.
        </p>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Main Payment page
═════════════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'netbanking', label: 'Net Banking' },
];

export default function Payment() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const { data, isLoading } = useBooking(bookingId);
  const actions = useBookingActions();

  const [tab, setTab] = useState('upi');
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [result, setResult] = useState(null);

  if (isLoading) return <Spinner label="Loading payment" />;

  const booking = data?.booking;
  const existingTransaction = data?.transaction;

  if (!booking) {
    return (
      <div className="shell pt-12 pb-20 text-center">
        <p className="text-ink-soft mb-4">Booking not found.</p>
        <Link to="/bookings/sent" className="btn-secondary">Back to requests</Link>
      </div>
    );
  }

  if (user && String(booking.seeker?._id) !== String(user._id)) {
    return (
      <div className="shell pt-12 pb-20">
        <Alert tone="error">You are not authorised to pay for this booking.</Alert>
        <Link to="/bookings/sent" className="btn-secondary mt-4 inline-flex">Back</Link>
      </div>
    );
  }

  if (paid && result) {
    return <PaymentSuccess booking={result.booking} transaction={result.transaction} />;
  }

  if (booking.status === 'confirmed' && existingTransaction?.status === 'simulated_paid') {
    return <PaymentSuccess booking={booking} transaction={existingTransaction} />;
  }

  if (booking.status !== 'accepted') {
    const tone = ['cancelled', 'rejected'].includes(booking.status) ? 'error' : 'warn';
    return (
      <div className="shell pt-12 pb-20">
        <Alert tone={tone}>
          {booking.status === 'confirmed'
            ? 'This booking has already been paid and confirmed.'
            : `Payment is not available — booking status is "${booking.status}".`}
        </Alert>
        <Link to={`/bookings/detail/${booking._id}`} className="btn-secondary mt-4 inline-flex">
          View booking
        </Link>
      </div>
    );
  }

  const payable = booking.agreedPrice ?? booking.quotedPrice ?? 0;
  const gst = payable > 0 ? Math.round(payable * 0.18) : 0;

  const handlePay = async (method) => {
    if (processing || paid) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1400));
    try {
      const res = await actions.pay.mutateAsync({ id: booking._id, paymentMethod: method });
      setResult(res);
      setPaid(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Payment could not be processed. Please try again.'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      {processing && <ProcessingOverlay />}

      <div className="bg-surface min-h-screen">
        {/* Header */}
        <div className="border-b border-line bg-surface-alt">
          <div className="shell py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link to={`/bookings/detail/${booking._id}`} className="text-ink-mute hover:text-ink" aria-label="Back">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-base font-semibold leading-tight">Complete Payment</h1>
                <p className="text-xs text-ink-mute">#{String(booking._id).slice(-10).toUpperCase()}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-warn/15 border border-warn/40 text-warn text-[11px] font-semibold">
              DEMO PAYMENT
            </span>
          </div>
        </div>

        <div className="shell py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Left: payment method tabs */}
            <div>
              {/* Tab bar */}
              <div className="flex rounded-lg border border-line bg-surface-sunk p-1 gap-1 mb-4">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={[
                      'flex-1 py-2 text-sm font-medium rounded-md transition-all duration-150',
                      tab === t.id
                        ? 'bg-surface text-ink shadow-sm border border-line'
                        : 'text-ink-soft hover:text-ink',
                    ].join(' ')}
                    id={`tab-${t.id}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Demo notice */}
              <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-warn/5 border border-warn/30 text-warn text-xs">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px" aria-hidden>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Demo environment — no real payment is made. All methods simulate a successful payment.
              </div>

              {/* Tab panels */}
              <div className="card">
                {tab === 'upi' && <UpiTab amount={payable} onPay={handlePay} paying={processing || paid} />}
                {tab === 'card' && <CardTab onPay={handlePay} paying={processing || paid} />}
                {tab === 'netbanking' && <NetBankingTab onPay={handlePay} paying={processing || paid} />}
              </div>

              <Link to={`/bookings/detail/${booking._id}`} className="btn-ghost mt-3 text-xs inline-flex" id="cancel-payment-btn">
                ← Cancel and return to booking
              </Link>
            </div>

            {/* Right: order summary */}
            <div className="lg:sticky lg:top-24 self-start">
              <OrderSummary booking={booking} payable={payable} gst={gst} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
