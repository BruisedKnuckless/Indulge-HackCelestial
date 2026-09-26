import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

/**
 * GET /api/billing
 * Calculates accurate financial metrics (Total Spend, Total Earned, Transaction Count, Refunds)
 * from real stored Transaction records.
 * Ensures strict multi-tenant privacy: logistics partners without marketplace transactions
 * receive empty/scoped records and cannot see other businesses' financial details.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Logistics partners only see transactions they directly participate in
    const transactions = await Transaction.find({
      $or: [{ payer: userId }, { payee: userId }],
    })
      .populate({
        path: 'booking',
        select: 'bookingNumber resource requestedQuantity quantity startDateTime endDateTime',
        populate: { path: 'resource', select: 'title category' },
      })
      .populate('payer', 'businessName')
      .populate('payee', 'businessName')
      .sort('-createdAt')
      .lean();

    let totalSpend = 0;
    let totalEarned = 0;
    let refundCount = 0;
    let refundAmount = 0;

    const formattedTransactions = transactions.map((t) => {
      const isPayer = String(t.payer?._id || t.payer) === String(userId);
      const isPayee = String(t.payee?._id || t.payee) === String(userId);

      const isPaid = ['paid', 'simulated_paid'].includes(t.status);
      const isRefunded = t.status === 'refunded' || t.refundStatus === 'processed';

      if (isPaid || isRefunded) {
        if (isPayer) {
          totalSpend += t.amount || 0;
          if (isRefunded) {
            // Subtract refund from net spend and count as refund
            totalSpend -= t.amount || 0;
            refundCount += 1;
            refundAmount += t.amount || 0;
          }
        }
        if (isPayee) {
          totalEarned += t.amount || 0;
          if (isRefunded) {
            totalEarned -= t.amount || 0;
          }
        }
      }

      const relatedTitle =
        t.booking?.resource?.title ||
        (t.booking ? `Booking #${t.booking.bookingNumber || String(t.booking._id).slice(-6)}` : 'Marketplace Allocation');

      return {
        id: String(t._id),
        date: t.paidAt || t.createdAt,
        transactionId: String(t._id),
        referenceNumber: t.reconciliationRef || `TXN-${String(t._id).slice(-8).toUpperCase()}`,
        bookingId: t.booking?._id ? String(t.booking._id) : null,
        relatedRecord: relatedTitle,
        type: isPayer ? 'payment_sent' : 'payment_received',
        direction: isPayer ? 'debit' : 'credit',
        counterparty: isPayer ? t.payee?.businessName : t.payer?.businessName,
        amount: t.amount,
        status: t.status,
        refundStatus: t.refundStatus,
        receiptUrl: `/api/transactions/${t._id}/receipt.pdf`,
        jsonDataUrl: `/api/transactions/${t._id}/receipt`,
      };
    });

    res.json({
      summary: {
        totalSpend: Math.max(0, totalSpend),
        totalEarned: Math.max(0, totalEarned),
        transactionCount: transactions.length,
        refunds: {
          count: refundCount,
          amount: refundAmount,
        },
      },
      transactions: formattedTransactions,
    });
  })
);

export default router;
