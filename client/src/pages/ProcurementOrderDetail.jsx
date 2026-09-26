import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { inr, relative } from '../lib/format';
import { Spinner, EmptyState } from '../components/ui';
import {
  Package,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  ChevronLeft,
  Download,
} from 'lucide-react';

export default function ProcurementOrderDetail() {
  const { id } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['procurement-order', id],
    queryFn: async () => {
      const res = await api.get(`/procurement-orders/${id}`);
      return res.data;
    },
  });

  if (isLoading) return <Spinner label="Loading procurement order" />;

  const order = data?.order;
  if (!order || error) {
    return (
      <div className="shell pt-12 pb-20 max-w-4xl mx-auto">
        <EmptyState
          title="Procurement order not found"
          message="The requested multi-provider procurement order does not exist or you do not have permission to view it."
        />
        <div className="mt-6 text-center">
          <Link to="/my-requirements" className="btn-secondary btn-sm">
            View My Requirements
          </Link>
        </div>
      </div>
    );
  }

  const childBookings = order.childBookings || [];
  const req = order.requirement || {};

  return (
    <div className="shell pt-8 pb-20 max-w-4xl mx-auto">
      {/* Back button */}
      <div className="mb-6">
        <Link
          to={`/requirements/${req._id || order.requirement}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink transition-colors"
        >
          <ChevronLeft size={14} /> Back to Requirement
        </Link>
      </div>

      {/* Header Card */}
      <div className="card p-6 md:p-8 mb-8 border-line">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-brand/10 text-brand">
                {order.planType.replace('_', ' ')}
              </span>
              <span className="badge badge-success flex items-center gap-1 text-xs">
                <CheckCircle2 size={12} /> {order.status.toUpperCase()}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-ink">
              Procurement #{order.orderNumber}
            </h1>
            <p className="text-sm text-ink-soft mt-1">
              Secured for requirement:{' '}
              <span className="font-semibold text-ink">“{req.title || 'Requirement'}”</span>
            </p>
          </div>

          <div className="text-left md:text-right">
            <span className="text-xs text-ink-mute uppercase tracking-wider">Grouped Total</span>
            <div className="text-3xl font-bold text-brand mt-0.5">{inr(order.totalPrice)}</div>
            <p className="text-xs text-success flex items-center gap-1 md:justify-end mt-1">
              <ShieldCheck size={13} /> Simulated Payment Settled
            </p>
          </div>
        </div>

        {/* Metric summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="p-3 rounded-xl bg-surface-sunk/60 border border-line/40">
            <span className="text-xs text-ink-mute flex items-center gap-1.5">
              <Package size={13} /> Fulfillment
            </span>
            <p className="text-lg font-bold text-ink mt-1">
              {order.fulfilledQuantity} / {order.requestedQuantity}
            </p>
            <span className="text-[11px] text-ink-soft">
              {order.fulfillmentPercentage}% satisfied
            </span>
          </div>

          <div className="p-3 rounded-xl bg-surface-sunk/60 border border-line/40">
            <span className="text-xs text-ink-mute flex items-center gap-1.5">
              <Layers size={13} /> Suppliers
            </span>
            <p className="text-lg font-bold text-ink mt-1">{order.supplierCount} Providers</p>
            <span className="text-[11px] text-ink-soft">Individual contracts</span>
          </div>

          <div className="p-3 rounded-xl bg-surface-sunk/60 border border-line/40">
            <span className="text-xs text-ink-mute flex items-center gap-1.5">
              <MapPin size={13} /> Max Distance
            </span>
            <p className="text-lg font-bold text-ink mt-1">{order.maxDistanceKm} km</p>
            <span className="text-[11px] text-ink-soft">Avg {order.averageDistanceKm} km</span>
          </div>

          <div className="p-3 rounded-xl bg-surface-sunk/60 border border-line/40">
            <span className="text-xs text-ink-mute flex items-center gap-1.5">
              <Truck size={13} /> Logistics
            </span>
            <p className="text-lg font-bold text-ink mt-1">{order.logisticsComplexity}</p>
            <span className="text-[11px] text-ink-soft">
              {order.logisticsJobs?.length || 0} job(s) dispatched
            </span>
          </div>
        </div>
      </div>

      {/* Child Bookings Section */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="h-section">
            Supplier Allocations & Child Bookings ({childBookings.length})
          </h2>
          <span className="text-xs text-ink-mute">Independent provider agreements</span>
        </div>

        <div className="space-y-4">
          {childBookings.map((b, idx) => {
            const res = b.resource || {};
            const prov = b.provider || {};
            return (
              <div
                key={b._id}
                className="card p-5 border-line hover:border-brand/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink text-base">
                        {prov.businessName || 'Provider'}
                      </span>
                      <span className="badge badge-success text-[11px]">Confirmed</span>
                      {b.logistics === 'provider_transport' && (
                        <span className="badge text-[11px] bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                          <Truck size={10} /> Physical Transport
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft mt-1">
                      Resource: <span className="font-medium text-ink">{res.title || 'Listing'}</span>{' '}
                      · {b.requestedQuantity} units
                    </p>
                    <p className="text-[11px] text-ink-mute mt-1 flex items-center gap-2">
                      <span>Booking #{b._id.toString().slice(-6)}</span>
                      {prov.phone && <span>· Ph: {prov.phone}</span>}
                    </p>
                  </div>
                </div>

                <div className="w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-line">
                  <div className="text-left sm:text-right">
                    <span className="text-xs text-ink-mute">Subtotal</span>
                    <p className="text-lg font-bold text-ink">{inr(b.agreedPrice || b.quotedPrice)}</p>
                  </div>
                  <Link
                    to={`/bookings/detail/${b._id}`}
                    className="btn-secondary btn-sm text-xs inline-flex items-center gap-1 mt-1 sm:mt-2"
                  >
                    View Booking <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Summary Box */}
      <div className="card p-6 border-line bg-surface-sunk/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-bold text-sm text-ink flex items-center gap-2">
            <ShieldCheck size={16} className="text-success" /> Payment Settlement Summary
          </h3>
          <a
            href={`/api/procurement-orders/${order._id}/receipt.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            download={`procurement-receipt-${order.orderNumber || String(order._id).slice(-6)}.pdf`}
            className="btn-primary btn-sm text-xs inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Download size={13} /> Download Overall Receipt
          </a>
        </div>

        <div className="space-y-2.5 text-xs border-b border-line pb-4 mb-4">
          {childBookings.map((b, idx) => {
            const childTxn = (order.childTransactions || []).find((t) => String(t.booking) === String(b._id));
            return (
              <div key={b._id} className="flex items-center justify-between text-ink-soft flex-wrap gap-2">
                <span>
                  Provider #{idx + 1} ({b.provider?.businessName}) — {b.requestedQuantity} units
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-ink">{inr(b.agreedPrice || b.quotedPrice)}</span>
                  {childTxn && (
                    <a
                      href={`/api/transactions/${childTxn._id || childTxn}/receipt.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-brand hover:underline inline-flex items-center gap-0.5"
                    >
                      <Download size={11} /> Child Receipt
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-sm font-bold text-ink">
          <span>Total Grouped Settlement</span>
          <span className="text-brand text-base">{inr(order.totalPrice)}</span>
        </div>
        <p className="text-[11px] text-ink-mute mt-3">
          Simulated instant settlement applied to all {childBookings.length} child contracts. Each
          provider receives payment directly for their respective allocation.
        </p>
      </div>
    </div>
  );
}
