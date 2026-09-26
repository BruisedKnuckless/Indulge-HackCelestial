import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { WalletService } from '../services/wallet.service.js';
import { SettlementService } from '../services/settlement.service.js';
import { FeeCalculationService, rupeesToPaise } from '../services/fee-calculation.service.js';
import { PaymentService } from '../services/payment.service.js';
import Booking from '../models/Booking.js';
import Settlement from '../models/Settlement.js';

const router = Router();

/**
 * GET /api/wallet
 * Returns current business user's Indulge Balance (Available, Reserved, Total).
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const balance = await WalletService.getBalance(req.user._id);
    res.json({
      balance,
      wallet: balance,
    });
  })
);

/**
 * POST /api/wallet/topup
 * Simulates adding funds to Indulge Balance via Card, UPI, or Net Banking sandbox.
 */
router.post(
  '/topup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount, paymentMethod = 'upi', idempotencyKey } = req.body;
    const result = await WalletService.topUp({
      userId: req.user._id,
      amountRupees: amount,
      paymentMethod,
      idempotencyKey: idempotencyKey || req.headers['idempotency-key'],
    });

    const walletInfo = {
      _id: result.wallet._id,
      availableBalance: result.wallet.availableRupees,
      reservedBalance: result.wallet.reservedRupees,
      totalBalance: result.wallet.totalRupees,
      availableBalanceRupees: result.wallet.availableRupees,
      reservedBalanceRupees: result.wallet.reservedRupees,
      totalBalanceRupees: result.wallet.totalRupees,
      availableRupees: result.wallet.availableRupees,
      reservedRupees: result.wallet.reservedRupees,
      totalRupees: result.wallet.totalRupees,
    };

    res.json({
      success: true,
      message: `₹${Number(amount).toLocaleString('en-IN')} added to your wallet.`,
      wallet: walletInfo,
      balance: walletInfo,
      transaction: result.transaction,
    });
  })
);

/**
 * GET /api/wallet/transactions
 * Returns immutable ledger entries for the authenticated business.
 */
router.get(
  '/transactions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { limit = 50, skip = 0, type } = req.query;
    const result = await WalletService.getTransactions(req.user._id, { limit, skip, type });
    res.json(result);
  })
);

/**
 * GET /api/wallet/quote/:bookingId
 * Backend authority for fee calculation and balance shortfall checks.
 * Never trusts frontend prices; validates availability & calculates exact fee breakdown.
 */
router.get(
  '/quote/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId).populate('resource');
    if (!booking) throw new HttpError(404, 'Booking not found.');

    const isParty = String(booking.seeker) === String(req.user._id) || String(booking.provider) === String(req.user._id);
    if (!isParty) throw new HttpError(403, 'Access denied.');

    const unitPrice = booking.agreedPrice ?? booking.quotedPrice ?? booking.resource?.pricing?.basePrice ?? 0;
    const quantity = booking.requestedQuantity || 1;
    const category = booking.resource?.category || 'other';

    // Logistics fee: if transport requested, look at resource transport specs or standard demo logistics
    let logisticsFee = 0;
    if (booking.logistics === 'provider_transport') {
      logisticsFee = 2000; // Standard demo logistics charge
    }

    const feeBreakdown = FeeCalculationService.calculateBookingFees({
      resourcePrice: unitPrice,
      quantity,
      category,
      logisticsFee,
    });

    // Check seeker's wallet balance
    const wallet = await WalletService.getBalance(req.user._id);
    const requiredAmount = feeBreakdown.total;
    const availableBalance = wallet.availableRupees;
    const shortfall = Math.max(0, requiredAmount - availableBalance);

    res.json({
      bookingId: booking._id,
      resourceTitle: booking.resource?.title,
      unitPrice,
      quantity,
      feeBreakdown,
      quote: feeBreakdown,
      wallet: {
        available: availableBalance,
        reserved: wallet.reservedRupees,
        total: wallet.totalRupees,
        availableBalanceRupees: availableBalance,
        reservedBalanceRupees: wallet.reservedRupees,
        totalBalanceRupees: wallet.totalRupees,
        required: requiredAmount,
        shortfall,
        canAfford: shortfall === 0,
      },
      shortfall,
      sufficientBalance: shortfall === 0,
    });
  })
);

/**
 * POST /api/wallet/pay-booking
 * Confirms payment for a booking using Indulge Balance (or direct demo method).
 * Deducts from available balance, holds in reserved balance, advances booking state,
 * and initializes provider's PENDING settlement.
 */
router.post(
  '/pay-booking',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      bookingId,
      paymentMethod = 'wallet',
      idempotencyKey,
      autoTopUp = false,
    } = req.body;

    if (!bookingId) throw new HttpError(400, 'bookingId is required.');

    const booking = await Booking.findById(bookingId).populate('resource');
    if (!booking) throw new HttpError(404, 'Booking not found.');

    if (String(booking.seeker) !== String(req.user._id)) {
      throw new HttpError(403, 'Only the requesting business can pay for this booking.');
    }

    // Backend fee recalculation — source of truth
    const unitPrice = booking.agreedPrice ?? booking.quotedPrice ?? booking.resource?.pricing?.basePrice ?? 0;
    const quantity = booking.requestedQuantity || 1;
    const category = booking.resource?.category || 'other';
    const logisticsFee = booking.logistics === 'provider_transport' ? 2000 : 0;

    const feeBreakdown = FeeCalculationService.calculateBookingFees({
      resourcePrice: unitPrice,
      quantity,
      category,
      logisticsFee,
    });

    const totalPaise = feeBreakdown.paise.total;
    const key = idempotencyKey || req.headers['idempotency-key'] || `BKG-PAY-${bookingId}-${Date.now()}`;

    // If autoTopUp requested (user chose direct card/upi demo at checkout with zero balance)
    let wallet = await WalletService.getOrCreateWallet(req.user._id);
    if (wallet.availableBalance < totalPaise && autoTopUp) {
      const neededPaise = totalPaise - wallet.availableBalance;
      await WalletService.topUp({
        userId: req.user._id,
        amountRupees: neededPaise / 100,
        paymentMethod: paymentMethod === 'wallet' ? 'upi' : paymentMethod,
        idempotencyKey: `TOPUP-AUTO-${key}`,
      });
      wallet = await WalletService.getOrCreateWallet(req.user._id);
    }

    // Execute reservation
    const reserveResult = await WalletService.reserveForBooking({
      userId: req.user._id,
      bookingId: booking._id,
      totalPaise,
      idempotencyKey: key,
      description: `Payment reserved for ${booking.resource?.title || 'Resource'} (Booking #${String(booking._id).slice(-6)})`,
    });

    // Advance booking and record payment transaction
    const result = await PaymentService.confirmPayment({
      bookingId: booking._id,
      paymentMethod: paymentMethod === 'wallet' ? 'indulge_balance' : paymentMethod,
      idempotencyKey: key,
      user: req.user,
      feeBreakdown,
    });

    // Initialize provider's PENDING settlement
    const settlement = await SettlementService.createPendingSettlement({
      booking,
      feeBreakdown,
    });

    res.json({
      success: true,
      booking: result.booking,
      transaction: result.transaction,
      settlement,
      wallet: {
        available: reserveResult.wallet.availableRupees,
        reserved: reserveResult.wallet.reservedRupees,
        total: reserveResult.wallet.totalRupees,
        availableBalance: reserveResult.wallet.availableRupees,
        reservedBalance: reserveResult.wallet.reservedRupees,
        totalBalance: reserveResult.wallet.totalRupees,
        availableBalanceRupees: reserveResult.wallet.availableRupees,
        reservedBalanceRupees: reserveResult.wallet.reservedRupees,
        totalBalanceRupees: reserveResult.wallet.totalRupees,
      },
      feeBreakdown,
    });
  })
);

/**
 * GET /api/wallet/earnings
 * Provider / Lister earnings dashboard:
 * Total Earnings, Pending Settlement, Available to Withdraw, and Settlement History.
 */
router.get(
  '/earnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const earnings = await SettlementService.getListerEarnings(req.user._id);
    res.json(earnings);
  })
);

/**
 * POST /api/wallet/withdraw
 * Demo / sandbox withdrawal for funds that have reached AVAILABLE status.
 */
router.post(
  '/withdraw',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount, payoutMethod = 'bank_transfer', accountDetails } = req.body;
    const result = await SettlementService.requestWithdrawal({
      providerId: req.user._id,
      amountRupees: amount,
      payoutMethod,
      accountDetails,
    });

    res.json(result);
  })
);

/**
 * GET /api/wallet/settlement/:bookingId
 * Returns the settlement status and details for a specific booking.
 */
router.get(
  '/settlement/:bookingId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const settlement = await Settlement.findOne({ booking: req.params.bookingId })
      .populate('resource', 'title category images')
      .populate('provider', 'businessName');

    if (!settlement) {
      return res.json({ settlement: null });
    }

    // Only authorized parties (provider, or internal platform) can see provider net settlement
    if (String(settlement.provider?._id || settlement.provider) !== String(req.user._id)) {
      throw new HttpError(403, 'Unauthorized to view provider settlement details.');
    }

    res.json({ settlement });
  })
);

export default router;
