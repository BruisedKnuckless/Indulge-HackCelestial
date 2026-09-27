import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Download,
  TrendingDown,
  TrendingUp,
  Receipt,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Wallet,
  PlusCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  Building,
  HelpCircle,
  ArrowRight,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  useBusinessBilling,
  useWallet,
  useWalletTransactions,
  useListerEarnings,
} from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { inr, dateTime } from '../lib/format';
import TopUpModal from '../components/wallet/TopUpModal';
import WithdrawModal from '../components/wallet/WithdrawModal';

/* ─────────────────────────────────────────────────────────────────────────────
   Badge Helpers
───────────────────────────────────────────────────────────────────────────── */
function SettlementBadge({ status }) {
  const map = {
    pending: { label: 'Pending Settlement', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' },
    eligible: { label: 'Eligible', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30' },
    processing: { label: 'Processing', cls: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30' },
    available: { label: 'Available to Withdraw', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    settled: { label: 'Settled', cls: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30' },
    dispute_hold: { label: 'Dispute Hold', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30' },
    refunded: { label: 'Refunded', cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20' },
  };

  const current = map[status] || { label: status, cls: 'bg-surface-sunk text-ink-mute border-line' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${current.cls}`}>
      {current.label}
    </span>
  );
}

function LedgerTypeBadge({ type, direction }) {
  const isCredit = String(direction || '').toUpperCase() === 'CREDIT';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
        isCredit
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
          : 'bg-surface-sunk text-ink-mute border border-line'
      }`}
    >
      {isCredit ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
      {type.replace(/_/g, ' ')}
    </span>
  );
}

export default function BillingTransactions() {
  const { user } = useAuth();
  const businessName = user?.businessName || 'Business';

  const [activeTab, setActiveTab] = useState('wallet_balance');
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedSettlementForDetail, setSelectedSettlementForDetail] = useState(null);

  // Queries
  const { data: billingData, isLoading: billingLoading } = useBusinessBilling();
  const { data: walletData, isLoading: walletLoading, refetch: refetchWallet } = useWallet();
  const { data: txData, isLoading: txLoading, refetch: refetchTx } = useWalletTransactions(1, 30);
  const { data: earningsData, isLoading: earningsLoading, refetch: refetchEarnings } = useListerEarnings();

  const rawWallet = walletData?.wallet || walletData?.balance || {};
  const wallet = {
    ...rawWallet,
    availableBalanceRupees:
      rawWallet.availableBalanceRupees ??
      rawWallet.availableRupees ??
      rawWallet.availableBalance ??
      0,
    reservedBalanceRupees:
      rawWallet.reservedBalanceRupees ??
      rawWallet.reservedRupees ??
      rawWallet.reservedBalance ??
      0,
    totalBalanceRupees:
      rawWallet.totalBalanceRupees ??
      rawWallet.totalRupees ??
      rawWallet.totalBalance ??
      0,
  };
  const ledger = txData?.transactions || [];
  const earningsSummary = earningsData?.summary || {
    totalEarningsRupees: 0,
    pendingSettlementRupees: 0,
    availableToWithdrawRupees: 0,
    settledRupees: 0,
  };
  const settlements = earningsData?.settlements || [];
  const generalTransactions = billingData?.transactions || [];

  return (
    <div className="shell pt-8 pb-20">
      <TopUpModal
        isOpen={topUpOpen}
        onClose={() => {
          setTopUpOpen(false);
          refetchWallet();
          refetchTx();
        }}
        onSuccess={() => {
          refetchWallet();
          refetchTx();
        }}
      />

      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        maxAvailable={earningsSummary.availableToWithdrawRupees}
        onSuccess={() => {
          refetchEarnings();
          refetchWallet();
        }}
      />

      {/* Page Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="h-page flex items-center gap-2 text-ink">
                <CreditCard className="text-indigo-600 dark:text-indigo-400" size={26} />
                {businessName} — Financial Center
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                Demo / Sandbox Ledger
              </span>
            </div>
            <p className="text-xs text-ink-mute mt-1">
              Your business wallet balance, transparent booking reservations, and staged provider settlement ledger.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/history" className="btn-secondary text-xs">
              View Activity History
            </Link>
          </div>
        </div>

        {/* Top-Level Tabs */}
        <div className="flex border-b border-line mt-6 gap-6">
          <button
            onClick={() => setActiveTab('wallet_balance')}
            className={`pb-3 text-sm font-semibold transition-all relative ${
              activeTab === 'wallet_balance'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-ink-mute hover:text-ink'
            }`}
          >
            Your Wallet Balance
            {activeTab === 'wallet_balance' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('lister_earnings')}
            className={`pb-3 text-sm font-semibold transition-all relative ${
              activeTab === 'lister_earnings'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-ink-mute hover:text-ink'
            }`}
          >
            Lister Earnings & Settlements
            {activeTab === 'lister_earnings' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('invoices')}
            className={`pb-3 text-sm font-semibold transition-all relative ${
              activeTab === 'invoices'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-ink-mute hover:text-ink'
            }`}
          >
            Billing Invoices & Receipts
            {activeTab === 'invoices' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
            )}
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: YOUR WALLET BALANCE (SEEKER OPERATING FUNDS)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'wallet_balance' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Main Balance Card */}
          <div className="card p-6 border-line bg-surface shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-line">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-mute block">
                  Your Account Balance
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-ink tracking-tight">
                    {inr(wallet?.totalBalanceRupees ?? 0)}
                  </span>
                  <span className="text-xs text-ink-mute font-mono">INR Total</span>
                </div>
                <p className="text-xs text-ink-soft mt-1">
                  Operating balance for {businessName} used for fast booking checkout, reservations, and security holds.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTopUpOpen(true)}
                  className="btn-primary flex items-center gap-1.5 shadow-xs"
                  id="wallet-add-money-btn"
                >
                  <PlusCircle size={16} />
                  <span>Add Money</span>
                </button>
              </div>
            </div>

            {/* Split breakdown: Available vs Reserved */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5">
              <div className="p-4 rounded-xl bg-surface-sunk border border-line">
                <div className="flex items-center justify-between text-ink-mute text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Available Balance</span>
                  <Wallet size={14} className="text-emerald-500" />
                </div>
                <div className="text-xl font-bold text-ink">
                  {inr(wallet?.availableBalanceRupees ?? 0)}
                </div>
                <p className="text-[11px] text-ink-mute mt-0.5">Ready for new booking reservations</p>
              </div>

              <div className="p-4 rounded-xl bg-surface-sunk border border-line">
                <div className="flex items-center justify-between text-ink-mute text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Reserved Balance</span>
                  <Clock size={14} className="text-indigo-500" />
                </div>
                <div className="text-xl font-bold text-ink-soft">
                  {inr(wallet?.reservedBalanceRupees ?? 0)}
                </div>
                <p className="text-[11px] text-ink-mute mt-0.5">Held in escrow for active rentals</p>
              </div>

              <div className="p-4 rounded-xl bg-surface-sunk border border-line">
                <div className="flex items-center justify-between text-ink-mute text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Total Balance</span>
                  <ShieldCheck size={14} className="text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-ink">
                  {inr(wallet?.totalBalanceRupees ?? 0)}
                </div>
                <p className="text-[11px] text-ink-mute mt-0.5">Sum of available and reserved funds</p>
              </div>
            </div>
          </div>

          {/* Wallet Transaction Ledger */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-alt/30">
              <div>
                <h3 className="text-sm font-semibold text-ink">Wallet Transaction Ledger</h3>
                <p className="text-xs text-ink-mute">Immutable audit trail of all top-ups, holds, and releases</p>
              </div>
              <span className="text-xs text-ink-mute">{ledger.length} entries</span>
            </div>

            {txLoading ? (
              <div className="p-8"><Spinner label="Loading ledger transactions..." /></div>
            ) : ledger.length === 0 ? (
              <div className="p-8 text-center text-ink-mute text-xs">
                No wallet transactions recorded yet. Use [ Add Money ] above to top up your balance.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-alt/70 border-b border-line text-ink-mute uppercase tracking-wider font-semibold text-[10px]">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Balance After</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ledger.map((entry) => {
                      const isCredit = String(entry.direction || '').toUpperCase() === 'CREDIT';
                      return (
                        <tr key={entry._id || entry.id} className="hover:bg-surface-alt/30 transition-colors">
                          <td className="py-3 px-4 text-ink-mute whitespace-nowrap">
                            {dateTime(entry.createdAt)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <LedgerTypeBadge type={entry.type} direction={entry.direction} />
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-ink">
                            {entry.reference}
                          </td>
                          <td className="py-3 px-4 max-w-xs truncate text-ink-soft">
                            {entry.description}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-sm">
                            <span className={isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink'}>
                              {isCredit ? '+' : '-'}{inr(entry.amountRupees)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap text-ink font-medium">
                            {inr(entry.balanceAfterRupees)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              {entry.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: LISTER EARNINGS (PROVIDER SETTLEMENTS)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'lister_earnings' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Notice: Settlement Lifecycle */}
          <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-3">
            <Info size={18} className="text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-sm mb-1">
                Your Payout Lifecycle & Escrow Protection
              </span>
              <span>
                Earnings from {businessName}'s listed resources enter <strong>Pending Settlement</strong> upon booking payment.
                Funds remain safely held in escrow through rental fulfillment and return inspection. Once return inspection is verified without dispute,
                your payout transitions to <strong>Eligible</strong> and becomes <strong>Available to Withdraw</strong> according to the demo settlement schedule.
              </span>
            </div>
          </div>

          {/* Earnings KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Earnings */}
            <div className="card p-5 border-line bg-surface shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-mute block">
                Your Total Earnings
              </span>
              <div className="text-2xl font-extrabold text-ink mt-1">
                {inr(earningsSummary.totalEarningsRupees)}
              </div>
              <p className="text-[11px] text-ink-mute mt-1">
                Cumulative net payout after 3% lister commission & GST
              </p>
            </div>

            {/* Pending Settlement */}
            <div className="card p-5 border-line bg-surface shadow-xs">
              <div className="flex items-center justify-between text-ink-mute">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending Settlement</span>
                <Clock size={16} className="text-amber-500" />
              </div>
              <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                {inr(earningsSummary.pendingSettlementRupees)}
              </div>
              <p className="text-[11px] text-ink-mute mt-1">
                Held in escrow during rental period & return inspection
              </p>
            </div>

            {/* Available to Withdraw */}
            <div className="card p-5 border-line bg-surface shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-ink-mute">
                  <span className="text-xs font-semibold uppercase tracking-wider">Available to Withdraw</span>
                  <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
                <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  {inr(earningsSummary.availableToWithdrawRupees)}
                </div>
                <p className="text-[11px] text-ink-mute mt-1">
                  Verified returns ready for demo payout
                </p>
              </div>

              <button
                type="button"
                onClick={() => setWithdrawOpen(true)}
                disabled={earningsSummary.availableToWithdrawRupees <= 0}
                className="btn-primary w-full justify-center mt-3 text-xs"
                id="withdraw-earnings-btn"
              >
                Withdraw {inr(earningsSummary.availableToWithdrawRupees)}
              </button>
            </div>
          </div>

          {/* Settlements Table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-alt/30">
              <div>
                <h3 className="text-sm font-semibold text-ink">Your Lister Settlement Records</h3>
                <p className="text-xs text-ink-mute">
                  Tracking resource booking payouts, 3% commission, and verified return releases for {businessName}
                </p>
              </div>
              <span className="text-xs text-ink-mute">{settlements.length} settlement(s)</span>
            </div>

            {earningsLoading ? (
              <div className="p-8"><Spinner label="Loading provider settlements..." /></div>
            ) : settlements.length === 0 ? (
              <div className="p-8 text-center text-ink-mute text-xs">
                No settlement records yet. When users book your listed resources, their payouts will be tracked here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-alt/70 border-b border-line text-ink-mute uppercase tracking-wider font-semibold text-[10px]">
                      <th className="py-3 px-4">Settlement ID</th>
                      <th className="py-3 px-4">Booking Ref</th>
                      <th className="py-3 px-4">Resource</th>
                      <th className="py-3 px-4 text-right">Gross Value</th>
                      <th className="py-3 px-4 text-right">Commission (3% + GST)</th>
                      <th className="py-3 px-4 text-right">Net Payout</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Timeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {settlements.map((s) => (
                      <tr key={s._id} className="hover:bg-surface-alt/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-ink">
                          {s.settlementId}
                        </td>
                        <td className="py-3 px-4 font-mono text-ink-soft">
                          {s.booking ? (
                            <Link
                              to={`/bookings/detail/${s.booking._id}`}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              #{String(s.booking._id).slice(-8).toUpperCase()}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[200px] truncate text-ink font-medium">
                          {s.resource?.title || 'Resource'}
                        </td>
                        <td className="py-3 px-4 text-right text-ink font-semibold">
                          {inr(s.grossAmountRupees)}
                        </td>
                        <td className="py-3 px-4 text-right text-ink-mute">
                          −{inr((s.commissionAmountRupees || 0) + (s.commissionGSTRupees || 0))}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-sm text-emerald-600 dark:text-emerald-400">
                          {inr(s.netAmountRupees)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <SettlementBadge status={s.status} />
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSettlementForDetail(
                                selectedSettlementForDetail?._id === s._id ? null : s
                              )
                            }
                            className="btn-ghost text-[11px] py-1 px-2.5"
                          >
                            {selectedSettlementForDetail?._id === s._id ? 'Hide' : 'Timeline'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Settlement Timeline Drawer if selected */}
          {selectedSettlementForDetail && (
            <div className="card p-5 border-line bg-surface-sunk animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-ink">
                    Settlement Timeline: {selectedSettlementForDetail.settlementId}
                  </h4>
                  <p className="text-xs text-ink-mute">
                    Tracking release stages for {selectedSettlementForDetail.resource?.title}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSettlementForDetail(null)}
                  className="text-xs btn-ghost"
                >
                  Close
                </button>
              </div>

              {/* Step indicator */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-lg bg-surface border border-line">
                  <CheckCircle2 size={16} className="text-emerald-500 mx-auto mb-1" />
                  <span className="font-semibold block text-[11px]">Payment Received</span>
                  <span className="text-[10px] text-ink-mute">Funds Reserved</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface border border-line">
                  <CheckCircle2 size={16} className="text-emerald-500 mx-auto mb-1" />
                  <span className="font-semibold block text-[11px]">Pending Settlement</span>
                  <span className="text-[10px] text-ink-mute">Escrowed</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface border border-line">
                  <Clock size={16} className="text-indigo-500 mx-auto mb-1" />
                  <span className="font-semibold block text-[11px]">Rental Period</span>
                  <span className="text-[10px] text-ink-mute">In Progress</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface border border-line">
                  <ShieldCheck size={16} className="text-indigo-400 mx-auto mb-1" />
                  <span className="font-semibold block text-[11px]">Return Verified</span>
                  <span className="text-[10px] text-ink-mute">Inspection</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface border border-line">
                  <span className="block text-sm font-bold text-ink-mute mb-0.5">●</span>
                  <span className="font-semibold block text-[11px]">Eligible</span>
                  <span className="text-[10px] text-ink-mute">Clearing</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface border border-line">
                  <span className="block text-sm font-bold text-ink-mute mb-0.5">○</span>
                  <span className="font-semibold block text-[11px]">Available</span>
                  <span className="text-[10px] text-ink-mute">Withdrawable</span>
                </div>
              </div>

              {selectedSettlementForDetail.status === 'dispute_hold' && (
                <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} />
                  <span>
                    <strong>Settlement On Hold:</strong> {selectedSettlementForDetail.holdReason || 'Return condition inspection requires review.'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: INVOICES & GENERAL RECEIPTS (EXISTING)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'invoices' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-xs">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-alt/30">
              <h3 className="text-sm font-semibold text-ink">General Billing Receipts</h3>
              <span className="text-xs text-ink-mute">{generalTransactions.length} records</span>
            </div>

            {billingLoading ? (
              <div className="p-8"><Spinner label="Loading billing ledger..." /></div>
            ) : generalTransactions.length === 0 ? (
              <div className="p-8 text-center text-ink-mute text-xs">
                No billing receipts recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-alt/70 border-b border-line text-ink-mute uppercase tracking-wider font-semibold text-[10px]">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Transaction ID</th>
                      <th className="py-3 px-4">Related Record</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {generalTransactions.map((t) => {
                      const isDebit = t.direction === 'debit';
                      const isRefunded = t.status === 'refunded' || t.refundStatus === 'processed';

                      return (
                        <tr key={t.id} className="hover:bg-surface-alt/40 transition-colors">
                          <td className="py-3 px-4 text-ink-mute whitespace-nowrap">
                            {dateTime(t.date)}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-ink">
                            {t.referenceNumber}
                          </td>
                          <td className="py-3 px-4 max-w-xs truncate text-ink font-medium">
                            {t.bookingId ? (
                              <Link
                                to={`/bookings/detail/${t.bookingId}`}
                                className="hover:text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                {t.relatedRecord}
                                <ExternalLink size={11} className="shrink-0 text-ink-mute" />
                              </Link>
                            ) : (
                              t.relatedRecord
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isDebit ? 'badge-muted' : 'badge-green'
                              }`}
                            >
                              {isDebit ? 'Payment Sent' : 'Payment Received'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-sm">
                            <span className={isDebit ? 'text-ink' : 'text-emerald-600 dark:text-emerald-400'}>
                              {isDebit ? '-' : '+'}{inr(t.amount)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isRefunded
                                  ? 'badge-amber'
                                  : ['paid', 'simulated_paid'].includes(t.status)
                                  ? 'badge-green'
                                  : 'badge-muted'
                              }`}
                            >
                              {isRefunded ? 'Refunded' : t.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <a
                              href={t.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="btn-secondary btn-sm text-[11px] py-1 px-2.5 inline-flex items-center gap-1 text-indigo-600 hover:border-indigo-600"
                              title="Download PDF Receipt"
                            >
                              <Download size={11} /> PDF
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
