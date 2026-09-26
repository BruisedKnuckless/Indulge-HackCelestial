import { Router } from 'express';
import { requireAuthOrAdmin } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { getTransactionReceiptData } from '../services/receipt.service.js';
import { generateReceiptPdfBuffer } from '../services/receipt-pdf.service.js';

const router = Router();

/**
 * GET /api/transactions/:id/receipt
 * Returns structured immutable receipt data.
 * Also handles PDF download if query param ?format=pdf is provided.
 */
router.get(
  '/:id/receipt',
  requireAuthOrAdmin,
  asyncHandler(async (req, res) => {
    const isAdmin = Boolean(req.admin || req.isAdmin || req.user?.isAdmin);
    const receipt = await getTransactionReceiptData(req.params.id, req.user, { isAdmin });

    if (req.query.format === 'pdf') {
      const pdfBuffer = generateReceiptPdfBuffer(receipt);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="receipt-${receipt.receiptNumber || req.params.id}.pdf"`
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
 * GET /api/transactions/:id/receipt.pdf
 * Generates and streams standard PDF receipt directly.
 */
router.get(
  '/:id/receipt.pdf',
  requireAuthOrAdmin,
  asyncHandler(async (req, res) => {
    const isAdmin = Boolean(req.admin || req.isAdmin || req.user?.isAdmin);
    const receipt = await getTransactionReceiptData(req.params.id, req.user, { isAdmin });
    const pdfBuffer = generateReceiptPdfBuffer(receipt);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${receipt.receiptNumber || req.params.id}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

export default router;
