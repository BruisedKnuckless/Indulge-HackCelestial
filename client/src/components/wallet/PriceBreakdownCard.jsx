import { ShieldCheck, Info } from 'lucide-react';
import { inr } from '../../lib/format';

export default function PriceBreakdownCard({ quote, className = '' }) {
  if (!quote) return null;

  const {
    resourceSubtotal = 0,
    resourceGST = 0,
    platformFee = 0,
    platformFeeGST = 0,
    paymentGatewayFee = 0,
    paymentGatewayGST = 0,
    logisticsFee = 0,
    total = 0,
    rates = {},
  } = quote;

  return (
    <div className={`p-4 rounded-xl border border-line bg-surface shadow-xs space-y-3 ${className}`}>
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">Price Breakdown</h3>
        <span className="text-[11px] text-ink-mute flex items-center gap-1 font-medium">
          <ShieldCheck size={13} className="text-emerald-500" />
          Verified Quote
        </span>
      </div>

      {/* Breakdown Items */}
      <div className="space-y-2 text-xs">
        {/* Resource Rental Subtotal */}
        <div className="flex items-center justify-between">
          <span className="text-ink-soft">Resource Rental</span>
          <span className="font-semibold text-ink">{inr(resourceSubtotal)}</span>
        </div>

        {/* Resource GST */}
        <div className="flex items-center justify-between">
          <span className="text-ink-mute flex items-center gap-1">
            Resource GST ({rates.resourceGSTPercent || 18}%)
            <Info size={11} className="text-ink-mute" />
          </span>
          <span className="text-ink-soft">{inr(resourceGST)}</span>
        </div>

        {/* Indulge Platform Fee */}
        <div className="flex items-center justify-between">
          <span className="text-ink-soft">
            Indulge Platform Fee ({rates.platformFeePercent || 5}%)
          </span>
          <span className="font-semibold text-ink">{inr(platformFee)}</span>
        </div>

        {/* GST on Platform Fee */}
        {platformFeeGST > 0 && (
          <div className="flex items-center justify-between text-ink-mute">
            <span>GST on Platform Fee ({rates.platformFeeGSTPercent || 18}%)</span>
            <span>{inr(platformFeeGST)}</span>
          </div>
        )}

        {/* Payment Processing Fee */}
        <div className="flex items-center justify-between">
          <span className="text-ink-mute">
            Payment Processing ({rates.paymentGatewayFeePercent || 2}%)
          </span>
          <span className="text-ink-soft">{inr(paymentGatewayFee)}</span>
        </div>

        {/* Payment Processing GST if applicable */}
        {paymentGatewayGST > 0 && (
          <div className="flex items-center justify-between text-ink-mute">
            <span>GST on Payment Fee ({rates.paymentGatewayGSTPercent || 18}%)</span>
            <span>{inr(paymentGatewayGST)}</span>
          </div>
        )}

        {/* Logistics Fee */}
        <div className="flex items-center justify-between">
          <span className="text-ink-soft">Logistics & Handling</span>
          <span className="font-semibold text-ink">{logisticsFee > 0 ? inr(logisticsFee) : 'Free / Self'}</span>
        </div>
      </div>

      {/* Total Payable */}
      <div className="border-t border-line pt-3 flex items-baseline justify-between">
        <div>
          <span className="text-sm font-bold text-ink">Total Payable</span>
          <p className="text-[10px] text-ink-mute">Taxes & fees included transparently</p>
        </div>
        <span className="text-lg font-extrabold text-ink tracking-tight">{inr(total)}</span>
      </div>
    </div>
  );
}
