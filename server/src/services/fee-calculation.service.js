import { FEES_CONFIG } from '../config/fees.config.js';

/**
 * Money representation helpers:
 * 1 INR = 100 paise.
 * All internal arithmetic is performed on integer paise to eliminate floating-point drift.
 */
export function rupeesToPaise(rupees) {
  if (rupees == null || isNaN(rupees)) return 0;
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise) {
  if (paise == null || isNaN(paise)) return 0;
  return Math.round(Number(paise)) / 100;
}

export const FeeCalculationService = {
  /**
   * Resolves the applicable resource GST percentage based on category or custom override.
   */
  resolveResourceGSTRate(category, customRate) {
    if (customRate !== undefined && !isNaN(customRate)) {
      return Number(customRate);
    }
    if (category && FEES_CONFIG.CATEGORY_GST_RATES[category]) {
      return FEES_CONFIG.CATEGORY_GST_RATES[category];
    }
    return FEES_CONFIG.DEFAULT_RESOURCE_GST_PERCENT;
  },

  /**
   * Calculates comprehensive, auditable fee breakdown for any booking or resource.
   * Backend is the source of truth; never trusts frontend-provided totals.
   */
  calculateBookingFees({
    resourcePrice = 0,
    quantity = 1,
    category = 'other',
    resourceGSTRate,
    resourceGSTPercent,
    logisticsFee = 0,
    includeGatewayGST = false,
    customRates = {},
    rates = {},
  }) {
    const qty = Math.max(1, Number(quantity) || 1);
    const unitPriceRupees = Math.max(0, Number(resourcePrice) || 0);
    const combinedRates = { ...customRates, ...rates };

    // 1. Gross Resource Rental
    const resourceSubtotalPaise = rupeesToPaise(unitPriceRupees * qty);
    const resourceSubtotal = paiseToRupees(resourceSubtotalPaise);

    // 2. Resource GST
    const explicitGSTRate =
      resourceGSTRate ??
      resourceGSTPercent ??
      combinedRates.resourceGSTPercent ??
      combinedRates.resourceGSTRate;
    const resGSTRate = this.resolveResourceGSTRate(category, explicitGSTRate);
    const resourceGSTPaise = Math.round((resourceSubtotalPaise * resGSTRate) / 100);
    const resourceGST = paiseToRupees(resourceGSTPaise);

    // 3. Seeker Indulge Platform Fee (5%)
    const platformFeeRate = combinedRates.platformFeePercent ?? FEES_CONFIG.PLATFORM_FEE_PERCENT;
    const platformFeePaise = Math.round((resourceSubtotalPaise * platformFeeRate) / 100);
    const platformFee = paiseToRupees(platformFeePaise);

    // 4. GST on Platform Fee (18%)
    const platformGSTRate =
      combinedRates.platformFeeGSTPercent ??
      combinedRates.platformServiceGSTRate ??
      FEES_CONFIG.PLATFORM_SERVICE_GST_PERCENT;
    const platformFeeGSTPaise = Math.round((platformFeePaise * platformGSTRate) / 100);
    const platformFeeGST = paiseToRupees(platformFeeGSTPaise);

    // 5. Payment Processing Fee (2%)
    const gatewayFeeRate = combinedRates.paymentGatewayFeePercent ?? FEES_CONFIG.PAYMENT_GATEWAY_FEE_PERCENT;
    const paymentGatewayFeePaise = Math.round((resourceSubtotalPaise * gatewayFeeRate) / 100);
    const paymentGatewayFee = paiseToRupees(paymentGatewayFeePaise);

    // 6. GST on Gateway Fee (Optional / Configurable)
    const gatewayGSTRate =
      combinedRates.paymentGatewayGSTPercent ??
      combinedRates.gatewayGSTRate ??
      FEES_CONFIG.GATEWAY_GST_PERCENT;
    const paymentGatewayGSTPaise = includeGatewayGST
      ? Math.round((paymentGatewayFeePaise * gatewayGSTRate) / 100)
      : 0;
    const paymentGatewayGST = paiseToRupees(paymentGatewayGSTPaise);

    // 7. Logistics Fee (Billed separately, not inside platform fee)
    const logisticsFeePaise = rupeesToPaise(Number(logisticsFee) || 0);
    const resolvedLogisticsFee = paiseToRupees(logisticsFeePaise);

    // 8. Seeker Grand Total
    const totalPaise =
      resourceSubtotalPaise +
      resourceGSTPaise +
      platformFeePaise +
      platformFeeGSTPaise +
      paymentGatewayFeePaise +
      paymentGatewayGSTPaise +
      logisticsFeePaise;
    const total = paiseToRupees(totalPaise);

    // 9. Lister Commission & Net Settlement
    const listerCommissionRate = combinedRates.listerCommissionPercent ?? FEES_CONFIG.LISTER_COMMISSION_PERCENT;
    const listerCommissionPaise = Math.round((resourceSubtotalPaise * listerCommissionRate) / 100);
    const listerCommission = paiseToRupees(listerCommissionPaise);

    const listerCommissionGSTRate =
      combinedRates.listerCommissionGSTPercent ??
      combinedRates.listerCommissionGSTRate ??
      FEES_CONFIG.LISTER_COMMISSION_GST_PERCENT;
    const listerCommissionGSTPaise = Math.round((listerCommissionPaise * listerCommissionGSTRate) / 100);
    const listerCommissionGST = paiseToRupees(listerCommissionGSTPaise);

    // Provider payout: Resource Value - Indulge Commission - GST on Commission
    const listerNetPayoutPaise = resourceSubtotalPaise - listerCommissionPaise - listerCommissionGSTPaise;
    const listerNetPayout = paiseToRupees(listerNetPayoutPaise);

    return {
      currency: 'INR',
      rates: {
        resourceGSTPercent: resGSTRate,
        platformFeePercent: platformFeeRate,
        platformFeeGSTPercent: platformGSTRate,
        paymentGatewayFeePercent: gatewayFeeRate,
        paymentGatewayGSTPercent: gatewayGSTRate,
        listerCommissionPercent: listerCommissionRate,
        listerCommissionGSTPercent: listerCommissionGSTRate,
      },
      // Amounts in Rupees (for display and APIs)
      resourceSubtotal,
      resourceGST,
      platformFee,
      platformFeeGST,
      paymentGatewayFee,
      paymentGatewayGST,
      logisticsFee: resolvedLogisticsFee,
      total,

      // Lister Settlement breakdown
      listerSettlement: {
        grossAmount: resourceSubtotal,
        commissionPercent: listerCommissionRate,
        commissionAmount: listerCommission,
        commissionGSTPercent: listerCommissionGSTRate,
        commissionGST: listerCommissionGST,
        netPayout: listerNetPayout,
        netPayoutPaise: listerNetPayoutPaise,
      },

      // Underlying exact integer paise representations
      paise: {
        resourceSubtotal: resourceSubtotalPaise,
        resourceGST: resourceGSTPaise,
        platformFee: platformFeePaise,
        platformFeeGST: platformFeeGSTPaise,
        paymentGatewayFee: paymentGatewayFeePaise,
        paymentGatewayGST: paymentGatewayGSTPaise,
        logisticsFee: logisticsFeePaise,
        total: totalPaise,
        listerNetPayout: listerNetPayoutPaise,
      },
    };
  },
};
