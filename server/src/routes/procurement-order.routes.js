import { Router } from 'express';
import ProcurementOrder from '../models/ProcurementOrder.js';
import { requireAuth, requireBusinessUser, requireAuthOrAdmin } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';

const router = Router();

const POPULATE = [
  {
    path: 'requirement',
    select: 'title category quantity requiredQuantity startDateTime endDateTime location maxBudget',
  },
  {
    path: 'childBookings',
    populate: [
      { path: 'resource', select: 'title category images pricing capacity totalQuantity location unit requiresLogistics' },
      { path: 'provider', select: 'businessName location phone ratingAvg ratingCount' },
    ],
  },
  {
    path: 'childTransactions',
  },
  {
    path: 'logisticsJobs',
    populate: [{ path: 'logisticsPartner', select: 'businessName phone' }],
  },
];

/**
 * GET /api/procurement-orders/mine
 * List grouped procurement orders initiated by the authenticated seeker.
 */
router.get(
  '/mine',
  requireAuth,
  requireBusinessUser,
  asyncHandler(async (req, res) => {
    const orders = await ProcurementOrder.find({ seeker: req.user._id })
      .populate(POPULATE)
      .sort('-createdAt')
      .lean();
    res.json({ orders });
  })
);

/**
 * GET /api/procurement-orders/:id
 * Retrieve a grouped procurement order with its child bookings.
 * Strictly restricted to the seeker (order owner).
 * Providers must not see other providers' commercial terms or grouped allocations.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await ProcurementOrder.findById(req.params.id).populate(POPULATE);
    if (!order) {
      throw new HttpError(404, 'Procurement order not found.');
    }

    if (String(order.seeker) !== String(req.user._id)) {
      throw new HttpError(
        403,
        'Access denied. Only the procurement order owner can view grouped procurement details.'
      );
    }

    res.json({ order });
  })
);

/**
 * GET /api/procurement-orders/:id/receipt
 * Retrieves grouped procurement order receipt data.
 * Authorizes seeker, participating providers (scoped to own allocation), or admin.
 */
router.get(
  '/:id/receipt',
  requireAuthOrAdmin,
  asyncHandler(async (req, res) => {
    const { getProcurementReceiptData } = await import('../services/receipt.service.js');
    const { generateReceiptPdfBuffer } = await import('../services/receipt-pdf.service.js');
    const isAdmin = Boolean(req.admin || req.isAdmin || req.user?.isAdmin);
    const receipt = await getProcurementReceiptData(req.params.id, req.user, { isAdmin });

    if (req.query.format === 'pdf') {
      const pdfBuffer = generateReceiptPdfBuffer(receipt);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="procurement-receipt-${receipt.orderNumber || req.params.id}.pdf"`
      );
      return res.send(pdfBuffer);
    }

    res.json({
      receipt,
      ...receipt,
    });
  })
);

/**
 * GET /api/procurement-orders/:id/receipt.pdf
 * Directly streams the grouped procurement receipt PDF.
 */
router.get(
  '/:id/receipt.pdf',
  requireAuthOrAdmin,
  asyncHandler(async (req, res) => {
    const { getProcurementReceiptData } = await import('../services/receipt.service.js');
    const { generateReceiptPdfBuffer } = await import('../services/receipt-pdf.service.js');
    const isAdmin = Boolean(req.admin || req.isAdmin || req.user?.isAdmin);
    const receipt = await getProcurementReceiptData(req.params.id, req.user, { isAdmin });
    const pdfBuffer = generateReceiptPdfBuffer(receipt);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="procurement-receipt-${receipt.orderNumber || req.params.id}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

export default router;

