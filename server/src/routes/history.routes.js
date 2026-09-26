import { Router } from 'express';
import Booking from '../models/Booking.js';
import ProcurementOrder from '../models/ProcurementOrder.js';
import Requirement from '../models/Requirement.js';
import Proposal from '../models/Proposal.js';
import Transaction from '../models/Transaction.js';
import LogisticsJob from '../models/LogisticsJob.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

/**
 * GET /api/history
 * Normalizes activity across Bookings, Procurement, RFQs, Payments, and Logistics.
 * Respects strict multi-tenant privacy boundaries: businesses only see records they participate in.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const isLogisticsPartner = req.user.userType === 'logistics_partner';
    const { tab = 'all', limit = 50, page = 1 } = req.query;

    const items = [];

    // 1. Bookings (as seeker or provider)
    if (!isLogisticsPartner && (tab === 'all' || tab === 'bookings')) {
      const bookings = await Booking.find({
        $or: [{ seeker: userId }, { provider: userId }],
      })
        .populate('seeker', 'businessName')
        .populate('provider', 'businessName')
        .populate('resource', 'title category')
        .sort('-createdAt')
        .limit(100)
        .lean();

      for (const b of bookings) {
        const isSeeker = String(b.seeker?._id || b.seeker) === String(userId);
        const counterparty = isSeeker ? b.provider?.businessName : b.seeker?.businessName;
        const amount = b.agreedPrice || b.quotedPrice || 0;

        items.push({
          id: String(b._id),
          date: b.createdAt,
          recordType: 'booking',
          referenceNumber: b.bookingNumber || `BK-${String(b._id).slice(-6).toUpperCase()}`,
          title: b.resource?.title || 'Resource Booking',
          counterparty: counterparty || 'Marketplace Partner',
          role: isSeeker ? 'seeker' : 'provider',
          amount,
          status: b.status,
          viewUrl: `/bookings/detail/${b._id}`,
          receiptUrl: ['confirmed', 'completed'].includes(b.status)
            ? `/bookings/detail/${b._id}#payment`
            : null,
        });
      }
    }

    // 2. Procurement Orders (as seeker)
    if (!isLogisticsPartner && (tab === 'all' || tab === 'procurement')) {
      const orders = await ProcurementOrder.find({ seeker: userId })
        .populate('requirement', 'title')
        .sort('-createdAt')
        .limit(50)
        .lean();

      for (const po of orders) {
        items.push({
          id: String(po._id),
          date: po.createdAt,
          recordType: 'procurement',
          referenceNumber: `PO-${po.orderNumber || String(po._id).slice(-6).toUpperCase()}`,
          title: po.requirement?.title || 'Multi-Provider Procurement',
          counterparty: 'Multi-Provider Grouped',
          role: 'seeker',
          amount: po.totalPrice || 0,
          status: po.status,
          viewUrl: `/procurement-orders/${po._id}`,
          receiptUrl: `/api/procurement-orders/${po._id}/receipt.pdf`,
        });
      }
    }

    // 3. RFQs / Requirements (as seeker) & Proposals (as provider)
    if (!isLogisticsPartner && (tab === 'all' || tab === 'rfqs')) {
      const [requirements, proposals] = await Promise.all([
        Requirement.find({ seeker: userId }).sort('-createdAt').limit(50).lean(),
        Proposal.find({ provider: userId }).populate('requirement', 'title seeker').sort('-createdAt').limit(50).lean(),
      ]);

      for (const reqRecord of requirements) {
        items.push({
          id: String(reqRecord._id),
          date: reqRecord.createdAt,
          recordType: 'rfq',
          referenceNumber: `RFQ-${String(reqRecord._id).slice(-6).toUpperCase()}`,
          title: reqRecord.title || 'Marketplace Requirement',
          counterparty: 'Public Marketplace',
          role: 'seeker',
          amount: reqRecord.maxBudget || null,
          status: reqRecord.status,
          viewUrl: `/requirements/${reqRecord._id}`,
          receiptUrl: null,
        });
      }

      for (const prop of proposals) {
        items.push({
          id: String(prop._id),
          date: prop.createdAt,
          recordType: 'rfq',
          referenceNumber: `PROP-${String(prop._id).slice(-6).toUpperCase()}`,
          title: prop.requirement?.title || 'Submitted Quote',
          counterparty: 'Requirement Seeker',
          role: 'provider',
          amount: prop.price || prop.quotedPrice || null,
          status: prop.status,
          viewUrl: prop.requirement?._id ? `/requirements/${prop.requirement._id}` : '/requirements/feed',
          receiptUrl: null,
        });
      }
    }

    // 4. Payments / Transactions (as payer or payee)
    if (!isLogisticsPartner && (tab === 'all' || tab === 'payments')) {
      const transactions = await Transaction.find({
        $or: [{ payer: userId }, { payee: userId }],
      })
        .populate('payer', 'businessName')
        .populate('payee', 'businessName')
        .sort('-createdAt')
        .limit(100)
        .lean();

      for (const t of transactions) {
        const isPayer = String(t.payer?._id || t.payer) === String(userId);
        items.push({
          id: String(t._id),
          date: t.paidAt || t.createdAt,
          recordType: 'payment',
          referenceNumber: t.reconciliationRef || `TXN-${String(t._id).slice(-6).toUpperCase()}`,
          title: isPayer ? 'Payment Disbursed' : 'Payment Received',
          counterparty: isPayer ? t.payee?.businessName : t.payer?.businessName,
          role: isPayer ? 'payer' : 'payee',
          amount: t.amount,
          status: t.status,
          viewUrl: `/api/transactions/${t._id}/receipt`,
          receiptUrl: `/api/transactions/${t._id}/receipt.pdf`,
        });
      }
    }

    // 5. Logistics (only authorized jobs)
    if (tab === 'all' || tab === 'logistics') {
      const jobFilter = isLogisticsPartner
        ? { logisticsPartner: userId }
        : { $or: [{ seeker: userId }, { provider: userId }] };

      const jobs = await LogisticsJob.find(jobFilter)
        .populate('seeker', 'businessName')
        .populate('provider', 'businessName')
        .populate('resource', 'title')
        .sort('-createdAt')
        .limit(50)
        .lean();

      for (const j of jobs) {
        items.push({
          id: String(j._id),
          date: j.createdAt,
          recordType: 'logistics',
          referenceNumber: `LOG-${String(j._id).slice(-6).toUpperCase()}`,
          title: `Transport: ${j.resource?.title || 'Consignment'}`,
          counterparty: isLogisticsPartner
            ? `${j.provider?.businessName || 'Provider'} → ${j.seeker?.businessName || 'Seeker'}`
            : 'Indulge Logistics Network',
          role: isLogisticsPartner ? 'logistics_partner' : 'participant',
          amount: null,
          status: j.currentStatus,
          viewUrl: isLogisticsPartner ? '/logistics/jobs' : `/bookings/detail/${j.bookingId || j.booking}`,
          receiptUrl: null,
        });
      }
    }

    // Sort chronologically descending
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const paginatedItems = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      items: paginatedItems,
      total: items.length,
      page: pageNum,
      limit: limitNum,
    });
  })
);

export default router;
