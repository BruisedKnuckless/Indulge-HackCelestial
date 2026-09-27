import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wallet,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  PlusCircle,
  CreditCard,
  Building2,
  Smartphone,
  Info,
} from 'lucide-react';
import {
  useBooking,
  useBookingActions,
  useBookingQuote,
  useWalletActions,
} from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Spinner, Alert } from '../components/ui';
import { resourceImage, CATEGORY_LABELS } from '../lib/constants';
import { inr, dateRange, dateTime } from '../lib/format';
import PriceBreakdownCard from '../components/wallet/PriceBreakdownCard';
import TopUpModal from '../components/wallet/TopUpModal';

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
      <span
        className={[
          strong ? 'font-semibold text-ink' : '',
          highlight ? 'text-success font-bold text-base' : '',
          muted ? 'text-ink-mute' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
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
        <p className="text-xs text-ink-mute">Reserving booking balance in ledger.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Success receipt
───────────────────────────────────────────────────────────────────────────── */
const METHOD_LABELS = {
  indulge_balance: 'Your Wallet Balance (Funds Held in Reserve)',
  upi: 'UPI (Demo)',
  card: 'Card (Demo)',
  netbanking: 'Net Banking (Demo)',
  wallet: 'Your Wallet Balance (Funds Held in Reserve)',
};

function PaymentSuccess({ booking, transaction }) {
  const r = booking.resource || {};
  const breakdown = transaction?.metadata?.feeBreakdown || booking.feeBreakdown;
  const paid = transaction?.amount ?? breakdown?.total ?? booking.agreedPrice ?? booking.quotedPrice ?? 0;
  const txRef = transaction?.referenceNumber || transaction?._id ? String(transaction.referenceNumber || transaction._id).slice(-14).toUpperCase() : '—';

  return (
    <div className="bg-surface min-h-screen">
      <div className="shell pt-10 pb-20 max-w-[620px]">
        <div className="card text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 border-2 border-success/30">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-success"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ink mb-1">Payment Successful & Funds Reserved</h1>
          <p className="text-sm text-ink-soft mb-3">
            Your booking is confirmed. Funds are securely held in reserve until fulfillment and return verification.
          </p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warn/10 border border-warn/30 text-warn text-xs font-semibold">
            DEMO PAYMENT — Prototype Accounting Ledger
          </span>
        </div>

        <div className="card mb-4">
          <SectionTitle>Payment Receipt</SectionTitle>
          <div className="bg-surface-sunk rounded-lg border border-line p-4 space-y-2.5">
            <Row label="Receipt Reference" value={txRef} strong />
            <Row label="Booking Ref" value={String(booking._id).slice(-10).toUpperCase()} strong />
            <div className="border-t border-line pt-2.5 space-y-2">
              <Row label="Resource" value={r.title} />
              <Row label="Provider" value={booking.provider?.businessName} />
              <Row label="Dates" value={dateRange(booking.startDateTime, booking.endDateTime)} />
              <Row label="Qty" value={`${booking.requestedQuantity} unit(s)`} />
            </div>

            {breakdown && (
              <div className="border-t border-line pt-2.5 space-y-1.5 text-xs text-ink-mute">
                <Row label="Resource Rental" value={inr(breakdown.resourceSubtotal)} />
                <Row label="Resource GST" value={inr(breakdown.resourceGST)} />
                <Row label="Indulge Platform Fee (5%)" value={inr(breakdown.platformFee)} />
                <Row label="GST on Platform Fee" value={inr(breakdown.platformFeeGST)} />
                <Row label="Payment Processing Fee" value={inr(breakdown.paymentGatewayFee)} />
                <Row label="Logistics" value={breakdown.logisticsFee > 0 ? inr(breakdown.logisticsFee) : 'Free / Self'} />
              </div>
            )}

            <div className="border-t border-line pt-2.5 space-y-2">
              <Row label="Total Amount Paid & Held" value={inr(paid)} highlight />
              <Row
                label="Payment Method"
                value={METHOD_LABELS[transaction?.paymentMethod] || transaction?.paymentMethod || 'Wallet Balance'}
              />
              {transaction?.paidAt && <Row label="Settled at" value={dateTime(transaction.paidAt)} />}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Link
            to={`/bookings/detail/${booking._id}`}
            className="btn-primary w-full justify-center"
            id="view-booking-btn"
          >
            View Booking & Fulfillment
          </Link>
          <Link to="/billing" className="btn-secondary w-full justify-center">
            View Ledger & Wallet Balance
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Wallet Balance Tab
───────────────────────────────────────────────────────────────────────────── */
function WalletBalanceTab({
  wallet,
  totalRequired,
  shortfall,
  sufficientBalance,
  onPay,
  onOpenTopUp,
  paying,
}) {
  const available = wallet?.availableBalanceRupees ?? 0;
  const reserved = wallet?.reservedBalanceRupees ?? 0;
  const total = wallet?.totalBalanceRupees ?? 0;

  return (
    <div className="space-y-5">
      {/* Balance Card */}
      <div className="p-4 rounded-xl border border-line bg-surface-sunk space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="text-indigo-600 dark:text-indigo-400" size={18} />
            <span className="text-xs font-semibold text-ink uppercase tracking-wider">Your Wallet Balance</span>
          </div>
          <span className="text-[11px] text-ink-mute font-mono">INR</span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-line">
          <div>
            <span className="text-[11px] text-ink-mute block">Available</span>
            <span className="text-base font-bold text-ink">{inr(available)}</span>
          </div>
          <div>
            <span className="text-[11px] text-ink-mute block">Reserved</span>
            <span className="text-sm font-semibold text-ink-soft">{inr(reserved)}</span>
          </div>
          <div>
            <span className="text-[11px] text-ink-mute block">Total</span>
            <span className="text-sm font-semibold text-ink-soft">{inr(total)}</span>
          </div>
        </div>
      </div>

      {/* Sufficient vs Insufficient State */}
      {sufficientBalance ? (
        <div className="space-y-4">
          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Sufficient Wallet Balance</p>
              <p className="text-ink-mute mt-0.5">
                {inr(totalRequired)} will be moved to your reserved balance upon confirmation.
              </p>
            </div>
          </div>

          <button
            onClick={() => onPay('wallet_balance')}
            disabled={paying}
            className="btn-primary w-full justify-center py-3 text-sm font-semibold"
            id="pay-wallet-btn"
          >
            {paying ? 'Reserving Balance…' : `Pay ${inr(totalRequired)} with Wallet Balance`}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Insufficient Balance Box matching prompt specification */}
          <div className="p-4 rounded-xl border border-rose-500/25 bg-rose-500/5 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-xs uppercase tracking-wider">
              <AlertTriangle size={15} />
              <span>Insufficient Balance</span>
            </div>

            <div className="bg-surface/80 rounded-lg p-3 border border-rose-500/15 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-soft">Required:</span>
                <span className="font-bold text-ink">{inr(totalRequired)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Available:</span>
                <span className="font-medium text-ink">{inr(available)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-rose-600 dark:text-rose-400 font-bold">
                <span>Need to Add:</span>
                <span>{inr(shortfall)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenTopUp}
              className="w-full py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              id="add-shortfall-btn"
            >
              <PlusCircle size={15} />
              Add {inr(shortfall)} to Balance
            </button>
          </div>

          <p className="text-[11px] text-ink-mute text-center">
            Or select direct UPI / Card / Net Banking demo checkout below.
          </p>
        </div>
      )}
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
            onClick={() => {
              navigator.clipboard?.writeText('indulge-b2b@okaxis');
              toast.success('UPI ID copied');
            }}
            className="text-xs btn-ghost px-2 py-1"
          >
            Copy
          </button>
        </div>
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
          I have completed the UPI demo payment of <strong className="text-ink">{inr(amount)}</strong>.
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
function CardTab({ onPay, paying, amount }) {
  const [name, setName] = useState('');
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const handlePay = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Cardholder name is required');
      return;
    }
    onPay('card');
  };

  return (
    <form onSubmit={handlePay} className="space-y-3">
      <div className="bg-surface-sunk rounded-lg border border-line px-3 py-2 text-xs text-ink-soft flex items-center gap-2">
        <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
        <span>Sandbox Mode: Any test 16-digit card number will succeed.</span>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-mute mb-1">Cardholder Name</label>
        <input
          type="text"
          placeholder="e.g. Rahul Sharma"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field text-sm"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-mute mb-1">Card Number</label>
        <input
          type="text"
          placeholder="4532 •••• •••• 8890"
          value={card}
          onChange={(e) => setCard(e.target.value)}
          className="field text-sm font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-ink-mute mb-1">Expiry</label>
          <input
            type="text"
            placeholder="MM/YY"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="field text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-mute mb-1">CVV</label>
          <input
            type="password"
            maxLength={4}
            placeholder="•••"
            value={cvv}
            onChange={(e) => setCvv(e.target.value)}
            className="field text-sm font-mono"
          />
        </div>
      </div>

      <button
        id="card-pay-btn"
        type="submit"
        disabled={paying}
        className="btn-primary w-full mt-2"
      >
        {paying ? 'Processing Card…' : `Pay ${inr(amount)} via Card`}
      </button>
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Net Banking Tab
───────────────────────────────────────────────────────────────────────────── */
function NetBankingTab({ onPay, paying, amount }) {
  const [bank, setBank] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="bank-select">
          Select your bank
        </label>
        <select
          id="bank-select"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="field-select w-full"
        >
          <option value="">— Choose a bank —</option>
          {BANKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-sunk rounded-lg border border-line p-3 text-xs text-ink-soft">
        You will authenticate with <strong className="text-ink">{bank || 'your bank'}</strong>.
        This is a simulated demo environment.
      </div>

      <button
        id="netbanking-pay-btn"
        onClick={() => onPay('netbanking')}
        disabled={!bank || paying}
        className="btn-primary w-full"
      >
        {paying ? 'Connecting to bank…' : `Pay ${inr(amount)} via ${bank || 'Net Banking'}`}
      </button>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Main Payment page
═════════════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'wallet_balance', label: 'Wallet Balance' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'netbanking', label: 'Net Banking' },
];

export default function Payment() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const { data: bookingData, isLoading: bookingLoading } = useBooking(bookingId);
  const { data: quoteData, isLoading: quoteLoading, refetch: refetchQuote } = useBookingQuote(bookingId);
  const { payBooking } = useWalletActions();
  const bookingActions = useBookingActions();

  const [tab, setTab] = useState('wallet_balance');
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [result, setResult] = useState(null);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);

  if (bookingLoading || quoteLoading) return <Spinner label="Preparing booking quote & ledger..." />;

  const booking = bookingData?.booking;
  const existingTransaction = bookingData?.transaction;
  const quote = quoteData?.quote;
  const wallet = quoteData?.wallet;
  const shortfall = quoteData?.shortfall ?? 0;
  const sufficientBalance = quoteData?.sufficientBalance ?? false;

  if (!booking) {
    return (
      <div className="shell pt-12 pb-20 text-center">
        <p className="text-ink-soft mb-4">Booking not found.</p>
        <Link to="/bookings/sent" className="btn-secondary">
          Back to requests
        </Link>
      </div>
    );
  }

  if (user && String(booking.seeker?._id) !== String(user._id)) {
    return (
      <div className="shell pt-12 pb-20">
        <Alert tone="error">You are not authorised to pay for this booking.</Alert>
        <Link to="/bookings/sent" className="btn-secondary mt-4 inline-flex">
          Back
        </Link>
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

  const finalPayable = quote?.total ?? booking.agreedPrice ?? booking.quotedPrice ?? 0;

  const handlePay = async (method) => {
    if (processing || paid) return;
    setProcessing(true);

    try {
      let res;
      if (method === 'wallet_balance' || method === 'indulge_balance') {
        // Pay directly from Wallet Balance (holding funds in reserved balance)
        res = await payBooking.mutateAsync({
          bookingId: booking._id,
          paymentMethod: 'indulge_balance',
          transactionRef: `IND-BKG-${Date.now()}`,
        });
      } else {
        // Direct sandbox payment via UPI/Card/Netbanking
        res = await bookingActions.pay.mutateAsync({
          id: booking._id,
          paymentMethod: method,
        });
      }

      setResult(res);
      setPaid(true);
      toast.success('Payment completed and booking confirmed!');
    } catch (err) {
      toast.error(errorMessage(err, 'Payment could not be processed. Please try again.'));
    } finally {
      setProcessing(false);
    }
  };

  const handleTopUpSuccess = async () => {
    await refetchQuote();
    setTopUpModalOpen(false);
  };

  return (
    <>
      {processing && <ProcessingOverlay />}

      <TopUpModal
        isOpen={topUpModalOpen}
        onClose={() => setTopUpModalOpen(false)}
        initialAmount={shortfall > 0 ? shortfall : null}
        onSuccess={handleTopUpSuccess}
      />

      <div className="bg-surface min-h-screen">
        {/* Header */}
        <div className="border-b border-line bg-surface-alt">
          <div className="shell py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                to={`/bookings/detail/${booking._id}`}
                className="text-ink-mute hover:text-ink"
                aria-label="Back"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-base font-semibold leading-tight">Complete Payment & Hold Funds</h1>
                <p className="text-xs text-ink-mute">#{String(booking._id).slice(-10).toUpperCase()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                DEMO / SANDBOX PAYMENT
              </span>
            </div>
          </div>
        </div>

        <div className="shell py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            {/* Left: payment method tabs */}
            <div>
              {/* Tab bar */}
              <div className="flex rounded-lg border border-line bg-surface-sunk p-1 gap-1 mb-4">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={[
                      'flex-1 py-2 text-xs md:text-sm font-medium rounded-md transition-all duration-150',
                      tab === t.id
                        ? 'bg-surface text-ink shadow-sm border border-line font-semibold'
                        : 'text-ink-soft hover:text-ink',
                    ].join(' ')}
                    id={`tab-${t.id}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Demo notice */}
              <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
                <Info size={14} className="shrink-0 mt-0.5" />
                <span>
                  Demo Accounting Ledger: Funds are securely held in your reserve balance. The provider's payout is set to
                  <strong> Pending Settlement</strong> and only becomes withdrawable after return completion and verification.
                </span>
              </div>

              {/* Tab panels */}
              <div className="card">
                {tab === 'wallet_balance' && (
                  <WalletBalanceTab
                    wallet={wallet}
                    totalRequired={finalPayable}
                    shortfall={shortfall}
                    sufficientBalance={sufficientBalance}
                    onPay={handlePay}
                    onOpenTopUp={() => setTopUpModalOpen(true)}
                    paying={processing || paid}
                  />
                )}
                {tab === 'upi' && (
                  <UpiTab amount={finalPayable} onPay={handlePay} paying={processing || paid} />
                )}
                {tab === 'card' && (
                  <CardTab amount={finalPayable} onPay={handlePay} paying={processing || paid} />
                )}
                {tab === 'netbanking' && (
                  <NetBankingTab amount={finalPayable} onPay={handlePay} paying={processing || paid} />
                )}
              </div>

              <div className="flex items-center justify-between mt-4">
                <Link
                  to={`/bookings/detail/${booking._id}`}
                  className="btn-ghost text-xs inline-flex"
                  id="cancel-payment-btn"
                >
                  ← Cancel and return to booking
                </Link>

                <button
                  type="button"
                  onClick={() => setTopUpModalOpen(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                >
                  <PlusCircle size={13} />
                  Add Money to Wallet
                </button>
              </div>
            </div>

            {/* Right: order summary & price breakdown */}
            <div className="space-y-4 lg:sticky lg:top-20 self-start">
              {/* Resource snapshot */}
              <div className="card p-4">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-line shrink-0 bg-surface-sunk">
                    <img
                      src={resourceImage(booking.resource)}
                      alt={booking.resource?.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold line-clamp-1">{booking.resource?.title}</p>
                    {booking.resource?.category && (
                      <span className="inline-block mt-0.5 text-[10px] text-ink-mute border border-line rounded px-1.5">
                        {CATEGORY_LABELS[booking.resource.category] || booking.resource.category}
                      </span>
                    )}
                    <p className="text-xs text-ink-mute mt-1">
                      Provider: <strong className="text-ink">{booking.provider?.businessName}</strong>
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-line text-xs space-y-1.5">
                  <div className="flex justify-between text-ink-mute">
                    <span>Dates:</span>
                    <span className="font-medium text-ink">
                      {dateRange(booking.startDateTime, booking.endDateTime)}
                    </span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>Quantity:</span>
                    <span className="font-medium text-ink">{booking.requestedQuantity} unit(s)</span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>Logistics:</span>
                    <span className="font-medium text-ink">
                      {booking.logistics === 'provider_transport' ? 'Partner Transport' : 'Self Pickup'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Breakdown Card */}
              <PriceBreakdownCard quote={quote} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
