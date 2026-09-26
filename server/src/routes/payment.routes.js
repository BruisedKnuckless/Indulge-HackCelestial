import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { PaymentService } from '../services/payment.service.js';
import Transaction from '../models/Transaction.js';
import Booking from '../models/Booking.js';

const router = Router();

/**
 * POST /api/payments/orders
 * Creates an order reference for a booking or direct payment checkout.
 */
router.post(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bookingId, idempotencyKey } = req.body;
    if (!bookingId) {
      throw new HttpError(400, 'bookingId is required to create a payment order.');
    }

    const key = idempotencyKey || req.headers['idempotency-key'];
    const result = await PaymentService.createPaymentOrder({
      bookingId,
      user: req.user,
      idempotencyKey: key,
    });

    res.status(201).json(result);
  })
);

/**
 * POST /api/payments/confirm
 * Explicit payment confirmation endpoint with provider adapter verification.
 */
router.post(
  '/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      bookingId,
      paymentMethod = 'upi',
      idempotencyKey,
      gatewayPaymentId,
      gatewaySignature,
    } = req.body;

    if (!bookingId) {
      throw new HttpError(400, 'bookingId is required.');
    }

    const key = idempotencyKey || req.headers['idempotency-key'];
    const result = await PaymentService.confirmPayment({
      bookingId,
      paymentMethod,
      idempotencyKey: key,
      gatewayPaymentId,
      gatewaySignature,
      user: req.user,
    });

    res.json(result);
  })
);

/**
 * POST /api/payments/webhook
 * Signature-verified webhook ingest for external payment gateways.
 * Accepts HMAC SHA-256 signatures via headers (e.g. x-payment-signature or x-razorpay-signature).
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const signature =
      req.headers['x-payment-signature'] ||
      req.headers['x-razorpay-signature'] ||
      req.headers['stripe-signature'] ||
      req.body?.signature;

    const result = await PaymentService.processWebhook({
      payload: req.body,
      signature,
      headers: req.headers,
    });

    res.status(200).json(result);
  })
);

/**
 * POST /api/payments/transactions/:id/refund
 * Initiates a refund for a paid transaction.
 */
router.post(
  '/transactions/:id/refund',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const result = await PaymentService.processRefund({
      transactionId: req.params.id,
      reason,
      user: req.user,
    });

    res.json(result);
  })
);

/**
 * GET /api/payments/transactions/:id
 * Retrieves transaction details with reconciliation references and refund audit.
 */
router.get(
  '/transactions/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.id)
      .populate('booking')
      .populate('payer', 'businessName email phone')
      .populate('payee', 'businessName email phone');

    if (!transaction) {
      throw new HttpError(404, 'Transaction not found.');
    }

    const isParty =
      String(transaction.payer?._id || transaction.payer) === String(req.user._id) ||
      String(transaction.payee?._id || transaction.payee) === String(req.user._id);

    if (!isParty) {
      throw new HttpError(403, 'Access denied.');
    }

    res.json({ transaction });
  })
);

export default router;
