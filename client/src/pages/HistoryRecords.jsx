import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Download,
  Calendar,
  CreditCard,
  Package,
  Layers,
  ShoppingBag,
  Truck,
  ExternalLink,
} from 'lucide-react';
import { useBusinessHistory } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { inr, dateTime } from '../lib/format';

const TABS = [
  { key: 'all', label: 'All Records', icon: Layers },
  { key: 'bookings', label: 'Bookings', icon: Package },
  { key: 'procurement', label: 'Procurement', icon: ShoppingBag },
  { key: 'rfqs', label: 'RFQs & Quotes', icon: FileText },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'logistics', label: 'Logistics', icon: Truck },
];

const TYPE_BADGES = {
  booking: 'badge-blue',
  procurement_order: 'badge-purple',
  procurement_order_child: 'badge-purple',
  rfq: 'badge-amber',
  payment: 'badge-green',
  logistics: 'badge-muted',
};

const STATUS_BADGES = {
  confirmed: 'badge-green',
  completed: 'badge-green',
  delivered: 'badge-green',
  paid: 'badge-green',
  simulated_paid: 'badge-green',
  pending: 'badge-amber',
  in_transit: 'badge-amber',
  active: 'badge-blue',
  assigned: 'badge-blue',
  cancelled: 'badge-red',
  rejected: 'badge-red',
  refunded: 'badge-red',
};

export default function HistoryRecords() {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useBusinessHistory(tab, page);

  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="shell pt-10 pb-20">
      <header className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="h-page flex items-center gap-2.5">
              <FileText className="text-indigo" size={26} />
              History & Records
            </h1>
            <p className="text-sm muted mt-1">
              Immutable operational audit trail across bookings, reverse procurement, payments, and shipments.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/billing" className="btn-secondary text-xs">
              <CreditCard size={14} /> View Billing & Ledgers
            </Link>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="History categories"
        className="flex gap-2 border-b border-line mb-6 overflow-x-auto no-scrollbar pb-px"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-indigo text-indigo bg-surface-alt font-semibold'
                  : 'border-transparent text-ink-soft hover:text-ink hover:bg-surface-alt/50'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Spinner label="Loading business activity records..." />
      ) : items.length === 0 ? (
        <EmptyState
          title="No records found"
          message={`No ${tab === 'all' ? 'activity' : tab} records exist for your business yet.`}
          action={
            <Link to="/s" className="btn-primary">
              Browse Marketplace
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-ink-mute px-1">
            <span>Showing {items.length} of {total} records</span>
            <span>Sorted by most recent</span>
          </div>

          <div className="border border-line rounded-xl overflow-hidden bg-surface divide-y divide-line shadow-xs">
            {items.map((item) => {
              const typeClass = TYPE_BADGES[item.recordType] || 'badge-muted';
              const statusClass = STATUS_BADGES[item.status] || 'badge-muted';

              return (
                <div
                  key={`${item.recordType}-${item.id}`}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-alt/40 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="mt-1 p-2 rounded-lg bg-surface-sunk text-ink-soft shrink-0">
                      {item.recordType === 'booking' && <Package size={18} />}
                      {item.recordType?.startsWith('procurement') && <ShoppingBag size={18} />}
                      {item.recordType === 'rfq' && <FileText size={18} />}
                      {item.recordType === 'payment' && <CreditCard size={18} />}
                      {item.recordType === 'logistics' && <Truck size={18} />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${typeClass}`}>
                          {item.recordType.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-xs font-semibold text-ink">
                          {item.referenceNumber}
                        </span>
                        <span className={`text-[10px] capitalize px-2 py-0.5 rounded-full ${statusClass}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <h3 className="text-sm font-medium text-ink truncate mb-1">
                        {item.title}
                      </h3>

                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} /> {dateTime(item.date)}
                        </span>
                        {item.counterparty && (
                          <span>
                            Counterparty: <strong className="text-ink font-medium">{item.counterparty}</strong>
                          </span>
                        )}
                        {item.role && (
                          <span className="capitalize">
                            Role: {item.role}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-line/50">
                    {item.amount !== null && item.amount !== undefined && (
                      <div className="text-right sm:mr-3">
                        <div className="text-sm font-bold text-ink">{inr(item.amount)}</div>
                        <div className="text-[10px] text-ink-mute uppercase tracking-wider">Amount</div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {item.viewUrl && (
                        <Link
                          to={item.viewUrl}
                          className="btn-secondary btn-sm text-xs flex items-center gap-1.5"
                        >
                          <ExternalLink size={12} /> View
                        </Link>
                      )}

                      {item.receiptUrl && (
                        <a
                          href={item.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="btn-secondary btn-sm text-xs flex items-center gap-1.5 text-indigo border-indigo/25 hover:border-indigo"
                        >
                          <Download size={12} /> Receipt
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
