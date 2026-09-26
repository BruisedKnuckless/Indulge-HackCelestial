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
} from 'lucide-react';
import { useBusinessBilling } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { inr, dateTime } from '../lib/format';

export default function BillingTransactions() {
  const { data, isLoading } = useBusinessBilling();

  const summary = data?.summary || {
    totalSpend: 0,
    totalEarned: 0,
    transactionCount: 0,
    refunds: { count: 0, amount: 0 },
  };
  const transactions = data?.transactions || [];

  return (
    <div className="shell pt-10 pb-20">
      <header className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="h-page flex items-center gap-2.5">
              <CreditCard className="text-indigo" size={26} />
              Billing & Transactions
            </h1>
            <p className="text-sm muted mt-1">
              Authoritative transaction ledger, multi-tenant settlement records, and downloadable receipts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/history" className="btn-secondary text-xs">
              View Activity History
            </Link>
          </div>
        </div>
      </header>

      {/* Demo / Simulated Payment Notice */}
      <div className="mb-8 p-3.5 rounded-lg border border-amber-accent/30 bg-amber-accent/5 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-accent shrink-0 mt-0.5" />
        <div className="text-xs text-ink-mute">
          <span className="font-semibold text-ink">Simulated Settlement Environment:</span>{' '}
          All payments, receipts, and refund ledgers shown here are generated in demo/simulated mode.
          Receipts downloaded from this ledger are marked as <strong>Demo / Simulated Payment Receipts</strong> and do not represent final GST tax invoices.
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl border border-line bg-surface shadow-xs">
          <div className="flex items-center justify-between text-ink-mute mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Spent</span>
            <TrendingDown size={16} className="text-red-accent" />
          </div>
          <div className="text-2xl font-bold text-ink">{inr(summary.totalSpend)}</div>
          <p className="text-[11px] text-ink-mute mt-1">Outflows as seeker / buyer</p>
        </div>

        <div className="p-4 rounded-xl border border-line bg-surface shadow-xs">
          <div className="flex items-center justify-between text-ink-mute mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Earned</span>
            <TrendingUp size={16} className="text-green-accent" />
          </div>
          <div className="text-2xl font-bold text-green-accent">{inr(summary.totalEarned)}</div>
          <p className="text-[11px] text-ink-mute mt-1">Net revenue as resource provider</p>
        </div>

        <div className="p-4 rounded-xl border border-line bg-surface shadow-xs">
          <div className="flex items-center justify-between text-ink-mute mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Transactions</span>
            <Receipt size={16} className="text-indigo" />
          </div>
          <div className="text-2xl font-bold text-ink">{summary.transactionCount}</div>
          <p className="text-[11px] text-ink-mute mt-1">Total platform settled transactions</p>
        </div>

        <div className="p-4 rounded-xl border border-line bg-surface shadow-xs">
          <div className="flex items-center justify-between text-ink-mute mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Refunds</span>
            <RotateCcw size={16} className="text-amber-accent" />
          </div>
          <div className="text-2xl font-bold text-ink">{inr(summary.refunds?.amount || 0)}</div>
          <p className="text-[11px] text-ink-mute mt-1">{summary.refunds?.count || 0} processed reversal(s)</p>
        </div>
      </div>

      {/* Transactions Table */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Transaction Ledger</h2>
          <span className="text-xs text-ink-mute">{transactions.length} record(s)</span>
        </div>

        {isLoading ? (
          <Spinner label="Loading billing ledger..." />
        ) : transactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            message="Completed booking payments and reverse procurement transactions will appear here with downloadable receipts."
            action={
              <Link to="/s" className="btn-primary">
                Explore Marketplace
              </Link>
            }
          />
        ) : (
          <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-xs">
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
                  {transactions.map((t) => {
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
                              className="hover:text-indigo hover:underline flex items-center gap-1"
                            >
                              {t.relatedRecord}
                              <ExternalLink size={11} className="shrink-0 text-ink-mute" />
                            </Link>
                          ) : (
                            t.relatedRecord
                          )}
                          {t.counterparty && (
                            <span className="block text-[11px] text-ink-mute font-normal">
                              {isDebit ? `To: ${t.counterparty}` : `From: ${t.counterparty}`}
                            </span>
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
                          <span className={isDebit ? 'text-ink' : 'text-green-accent'}>
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
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={t.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="btn-secondary btn-sm text-[11px] py-1 px-2.5 flex items-center gap-1 text-indigo hover:border-indigo"
                              title="Download PDF Receipt"
                            >
                              <Download size={11} /> PDF
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
