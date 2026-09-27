import crypto from 'crypto';
import Settlement from '../models/Settlement.js';
import Booking from '../models/Booking.js';
import VerificationRequest from '../models/VerificationRequest.js';
import { HttpError } from '../middleware/error.middleware.js';
import { FEES_CONFIG } from '../config/fees.config.js';
import { paiseToRupees, rupeesToPaise } from './fee-calculation.service.js';

export const SettlementService = {
  /**
   * Initializes a PENDING settlement record for the provider upon successful seeker payment.
   * Funds are held in PENDING until fulfillment, rental, and return are completed.
   */
  async createPendingSettlement({ booking, feeBreakdown }) {
    if (!booking) throw new HttpError(400, 'Booking is required to create settlement.');

    // Idempotency: if settlement already exists for this booking, return it
    const existing = await Settlement.findOne({ booking: booking._id });
    if (existing) return existing;

    const resourceSubtotalPaise = feeBreakdown.paise?.resourceSubtotal ?? rupeesToPaise(feeBreakdown.resourceSubtotal || 0);
    const listerCommissionPaise = feeBreakdown.paise?.listerCommissionAmount ??
      rupeesToPaise(feeBreakdown.listerSettlement?.commissionAmount || Math.round(feeBreakdown.resourceSubtotal * 0.03));
    const listerCommissionGSTPaise = feeBreakdown.paise?.listerCommissionGST ??
      rupeesToPaise(feeBreakdown.listerSettlement?.commissionGST || Math.round(paiseToRupees(listerCommissionPaise) * 0.18));

    const netAmountPaise = resourceSubtotalPaise - listerCommissionPaise - listerCommissionGSTPaise;

    const settlementId = `SET-${String(booking._id).slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    const settlement = await Settlement.create({
      settlementId,
      booking: booking._id,
      provider: booking.provider,
      seeker: booking.seeker,
      resource: booking.resource?._id || booking.resource,
      grossAmount: resourceSubtotalPaise,
      commissionPercent: feeBreakdown.rates?.listerCommissionPercent ?? FEES_CONFIG.LISTER_COMMISSION_PERCENT,
      commissionAmount: listerCommissionPaise,
      commissionGSTPercent: feeBreakdown.rates?.listerCommissionGSTPercent ?? FEES_CONFIG.LISTER_COMMISSION_GST_PERCENT,
      commissionGST: listerCommissionGSTPaise,
      netAmount: netAmountPaise,
      status: 'PENDING',
      metadata: {
        bookingId: booking._id,
        environment: 'sandbox_demo',
      },
    });

    return settlement;
  },

  /**
   * Evaluates return completion and condition inspection to advance settlement state.
   * If return condition inspection finds major damage or an open dispute, settlement enters DISPUTE_HOLD.
   * If clean, settlement becomes ELIGIBLE, then advances to AVAILABLE based on schedule.
   */
  async evaluateBookingCompletion(bookingId) {
    const booking = await Booking.findById(bookingId).populate('resource');
    if (!booking) return null;

    const settlement = await Settlement.findOne({ booking: booking._id });
    if (!settlement || ['SETTLED', 'REFUNDED'].includes(settlement.status)) {
      return settlement;
    }

    // Check if any verification or inspection has flagged major defects
    const verification = await VerificationRequest.findOne({
      resource: booking.resource?._id || booking.resource,
    }).sort('-createdAt');

    const hasDefects =
      verification?.parameters?.some((p) => p.issueFlag === 'major') ||
      booking.return?.notes?.toLowerCase().includes('damage') ||
      booking.return?.notes?.toLowerCase().includes('dispute') ||
      booking.return?.notes?.toLowerCase().includes('missing');

    if (hasDefects) {
      settlement.status = 'DISPUTE_HOLD';
      settlement.holdReason = 'Condition inspection or return notes reported defects. Settlement held pending review.';
      await settlement.save();
      return settlement;
    }

    // Rental & return are completed cleanly -> Eligible
    settlement.status = 'AVAILABLE';
    settlement.eligibleAt = settlement.eligibleAt || new Date();
    settlement.availableAt = new Date();
    settlement.holdReason = undefined;
    await settlement.save();

    return settlement;
  },

  /**
   * Handles cancellation or refund: reverses/updates the pending settlement.
   */
  async handleBookingRefund({ bookingId, reason }) {
    const settlement = await Settlement.findOne({ booking: bookingId });
    if (!settlement) return null;

    if (settlement.status === 'SETTLED') {
      throw new HttpError(400, 'Cannot reverse settlement that has already been paid out.');
    }

    settlement.status = 'REFUNDED';
    settlement.holdReason = reason || 'Booking was cancelled / refunded before settlement.';
    await settlement.save();

    return settlement;
  },

  /**
   * Retrieves aggregated lister earnings and settlement breakdown for a provider.
   */
  async getListerEarnings(providerId) {
    const settlements = await Settlement.find({ provider: providerId })
      .populate({
        path: 'booking',
        select: 'bookingNumber status startDateTime endDateTime requestedQuantity fulfillment return',
        populate: { path: 'resource', select: 'title category images' },
      })
      .sort('-createdAt');

    let totalEarningsPaise = 0;
    let pendingSettlementPaise = 0;
    let availableToWithdrawPaise = 0;
    let settledPaise = 0;

    for (const s of settlements) {
      // Only count active non-refunded settlements towards total earnings
      if (s.status !== 'REFUNDED') {
        totalEarningsPaise += s.netAmount;
      }

      if (['PENDING', 'DISPUTE_HOLD', 'ELIGIBLE', 'PROCESSING'].includes(s.status)) {
        pendingSettlementPaise += s.netAmount;
      } else if (s.status === 'AVAILABLE') {
        availableToWithdrawPaise += s.netAmount;
      } else if (s.status === 'SETTLED') {
        settledPaise += s.netAmount;
      }
    }

    return {
      summary: {
        totalEarnings: paiseToRupees(totalEarningsPaise),
        pendingSettlement: paiseToRupees(pendingSettlementPaise),
        availableToWithdraw: paiseToRupees(availableToWithdrawPaise),
        settled: paiseToRupees(settledPaise),
        settlementCount: settlements.length,
      },
      settlements: settlements.map((s) => ({
        id: s._id,
        settlementId: s.settlementId,
        bookingId: s.booking?._id,
        bookingNumber: s.booking?.bookingNumber || `BKG-${String(s.booking?._id || '').slice(-6).toUpperCase()}`,
        resourceTitle: s.booking?.resource?.title || 'Hospitality Resource',
        grossAmount: s.grossRupees,
        commissionAmount: s.commissionRupees,
        commissionGST: s.commissionGSTRupees,
        netAmount: s.netRupees,
        status: s.status,
        holdReason: s.holdReason,
        createdAt: s.createdAt,
        eligibleAt: s.eligibleAt,
        availableAt: s.availableAt,
        settledAt: s.settledAt,
        bookingStatus: s.booking?.status,
        fulfillmentStatus: s.booking?.fulfillment?.status,
        returnStatus: s.booking?.return?.status,
      })),
    };
  },

  /**
   * Executes a simulated demo withdrawal of available funds.
   */
  async requestWithdrawal({ providerId, amountRupees, payoutMethod = 'bank_transfer', accountDetails }) {
    const amount = Number(amountRupees);
    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new HttpError(400, 'Withdrawal amount must be greater than zero.');
    }

    const requestedPaise = rupeesToPaise(amount);
    const availableSettlements = await Settlement.find({
      provider: providerId,
      status: 'AVAILABLE',
    }).sort('createdAt');

    const totalAvailablePaise = availableSettlements.reduce((sum, s) => sum + s.netAmount, 0);

    if (totalAvailablePaise < requestedPaise) {
      throw new HttpError(
        400,
        `Insufficient available funds to withdraw. Available: ₹${paiseToRupees(totalAvailablePaise).toLocaleString('en-IN')}, Requested: ₹${amount.toLocaleString('en-IN')}.`
      );
    }

    // Mark settlements as SETTLED up to the requested amount
    let remainingToSettle = requestedPaise;
    const payoutRef = `WD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    for (const s of availableSettlements) {
      if (remainingToSettle <= 0) break;
      s.status = 'SETTLED';
      s.settledAt = new Date();
      s.payoutRef = payoutRef;
      await s.save();
      remainingToSettle -= s.netAmount;
    }

    return {
      success: true,
      payoutRef,
      amountWithdrawn: amount,
      payoutMethod,
      settledAt: new Date(),
      message: `Demo payout of ₹${amount.toLocaleString('en-IN')} initiated successfully to ${accountDetails?.bankName || 'Registered Account'} (Demo Sandbox).`,
    };
  },
};
