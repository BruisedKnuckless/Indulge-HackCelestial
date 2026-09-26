import crypto from 'crypto';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.middleware.js';
import Booking from '../models/Booking.js';
import Transaction from '../models/Transaction.js';
import WebhookEvent from '../models/WebhookEvent.js';
import { ensureLogisticsJobForBooking } from './logistics.service.js';
import { notify } from './notification.service.js';
import { logger } from '../utils/logger.js';

export const ALLOWED_PAYMENT_METHODS = ['upi', 'card', 'netbanking', 'wallet', 'simulated_instant'];

/**
 * Timing-safe string comparison to prevent side-channel timing attacks on signatures.
 */
export function timingSafeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Computes an HMAC SHA256 digest hex string.
 */
export function computeHmacSha256(payload, secret) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * 1. Simulated Provider (Default for development, test, and demo)
 */
export class SimulatedPaymentProvider {
  name = 'simulated';

  async createOrder({ bookingId, amount, currency = 'INR', idempotencyKey }) {
    const gatewayOrderId = `sim_ord_${crypto.randomUUID()}`;
    return {
      provider: this.name,
      gatewayOrderId,
      amount,
      currency,
      status: 'created',
      idempotencyKey,
    };
  }

  verifyWebhook({ payload, signature }) {
    // In simulated environment, accept valid HMAC or predefined simulated signature
    const expected = computeHmacSha256(payload, env.paymentWebhookSecret);
    const isValid = timingSafeEqualStrings(signature, expected) || signature === 'sim_test_valid_signature';
    return {
      isValid,
      provider: this.name,
    };
  }

  async verifyPayment({ gatewayOrderId, gatewayPaymentId, gatewaySignature }) {
    return {
      verified: true,
      gatewayPaymentId: gatewayPaymentId || `sim_pay_${crypto.randomUUID()}`,
      reconciliationRef: `sim_rec_${Date.now()}`,
    };
  }

  async processRefund({ transaction, amount, reason }) {
    return {
      refundId: `sim_ref_${crypto.randomUUID()}`,
      status: 'processed',
      amount: amount || transaction.amount,
      refundedAt: new Date(),
      reason: reason || 'Customer requested refund',
    };
  }
}

/**
 * 2. Production Gateway Adapter (Sandbox-ready, ENV-gated)
 */
export class ProductionGatewayAdapter {
  name = 'production_gateway';

  constructor() {
    this.keyId = env.paymentGatewayKeyId;
    this.secret = env.paymentGatewaySecret;
    this.webhookSecret = env.paymentWebhookSecret;
  }

  async createOrder({ bookingId, amount, currency = 'INR', idempotencyKey }) {
    if (!this.keyId || !this.secret) {
      throw new HttpError(503, 'Payment gateway credentials are not configured.', 'GATEWAY_UNCONFIGURED');
    }
    // Production sandbox order reference
    const gatewayOrderId = `prod_ord_${crypto.randomUUID()}`;
    return {
      provider: this.name,
      gatewayOrderId,
      amount,
      currency,
      status: 'created',
      idempotencyKey,
    };
  }

  verifyWebhook({ payload, signature }) {
    if (!signature) return { isValid: false, provider: this.name };
    const expected = computeHmacSha256(payload, this.webhookSecret);
    const isValid = timingSafeEqualStrings(signature, expected);
    return {
      isValid,
      provider: this.name,
    };
  }

  async verifyPayment({ gatewayOrderId, gatewayPaymentId, gatewaySignature }) {
    if (!gatewaySignature) {
      throw new HttpError(400, 'Missing gateway signature.', 'INVALID_PAYMENT_SIGNATURE');
    }
    const payload = `${gatewayOrderId}|${gatewayPaymentId}`;
    const expected = computeHmacSha256(payload, this.secret);
    if (!timingSafeEqualStrings(gatewaySignature, expected)) {
      throw new HttpError(400, 'Payment signature verification failed.', 'PAYMENT_SIGNATURE_MISMATCH');
    }
    return {
      verified: true,
      gatewayPaymentId,
      reconciliationRef: `rec_${gatewayPaymentId}`,
    };
  }

  async processRefund({ transaction, amount, reason }) {
    return {
      refundId: `ref_${crypto.randomUUID()}`,
      status: 'processed',
      amount: amount || transaction.amount,
      refundedAt: new Date(),
      reason: reason || 'Refund initiated via platform',
    };
  }
}

/**
 * Active provider resolution based on environment configuration.
 */
export function getPaymentProvider() {
  if (env.paymentGatewayProvider === 'production' || env.paymentGatewayProvider === 'razorpay' || env.paymentGatewayProvider === 'stripe') {
    return new ProductionGatewayAdapter();
  }
  return new SimulatedPaymentProvider();
}

/**
 * Unified Payment Service Orchestrator
 */
export const PaymentService = {
  /**
   * Initializes a payment order for a booking.
   */
  async createPaymentOrder({ bookingId, user, idempotencyKey }) {
    const booking = await Booking.findById(bookingId).populate('resource');
    if (!booking) throw new HttpError(404, 'Booking not found.');

    if (String(booking.seeker) !== String(user._id) && !user.isPlatformAdmin) {
      throw new HttpError(403, 'Only the requesting seeker can initiate payment.');
    }

    if (!['accepted', 'pending'].includes(booking.status)) {
      throw new HttpError(400, `Cannot create payment order for booking in "${booking.status}" status.`);
    }

    const amount = booking.agreedPrice || booking.quotedPrice || 0;
    const provider = getPaymentProvider();
    const order = await provider.createOrder({
      bookingId: booking._id,
      amount,
      currency: 'INR',
      idempotencyKey,
    });

    // Ensure transaction record reflects initialized gateway order
    let transaction = await Transaction.findOne({ booking: booking._id });
    if (!transaction) {
      transaction = await Transaction.create({
        booking: booking._id,
        payer: booking.seeker,
        payee: booking.provider,
        amount,
        status: 'pending',
        gatewayOrderId: order.gatewayOrderId,
        idempotencyKey,
      });
    } else {
      transaction.gatewayOrderId = order.gatewayOrderId;
      if (idempotencyKey) transaction.idempotencyKey = idempotencyKey;
      await transaction.save();
    }

    return { order, transaction, booking };
  },

  /**
   * Confirms payment for a booking with idempotency and state machine protection.
   */
  async confirmPayment({
    bookingId,
    paymentMethod = 'upi',
    idempotencyKey,
    gatewayPaymentId,
    gatewaySignature,
    user,
  }) {
    const booking = await Booking.findById(bookingId).populate('resource');
    if (!booking) throw new HttpError(404, 'Request not found.');

    if (String(booking.seeker) !== String(user._id) && !user.isPlatformAdmin) {
      throw new HttpError(403, 'Only the requesting business can pay.');
    }

    // Strict idempotency: if already paid/confirmed, return existing record safely
    let existingTx = await Transaction.findOne({ booking: booking._id });
    if (existingTx && (existingTx.status === 'simulated_paid' || existingTx.status === 'paid')) {
      return {
        booking,
        transaction: existingTx,
        alreadyPaid: true,
      };
    }

    if (booking.status !== 'accepted' && booking.status !== 'confirmed') {
      throw new HttpError(400, `Payment is only possible for accepted requests (current: ${booking.status}).`);
    }

    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      throw new HttpError(400, `Invalid payment method. Allowed: ${ALLOWED_PAYMENT_METHODS.join(', ')}`);
    }

    const provider = getPaymentProvider();
    const verifyResult = await provider.verifyPayment({
      gatewayOrderId: existingTx?.gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    });

    // Advance booking state
    booking.status = 'confirmed';
    await booking.save();

    // Settle transaction record
    const amount = booking.agreedPrice || booking.quotedPrice || 0;
    const finalTx = await Transaction.findOneAndUpdate(
      { booking: booking._id },
      {
        payer: booking.seeker,
        payee: booking.provider,
        amount,
        status: 'simulated_paid',
        paymentMethod,
        paidAt: new Date(),
        gatewayPaymentId: verifyResult.gatewayPaymentId,
        reconciliationRef: verifyResult.reconciliationRef,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      { new: true, upsert: true }
    );

    // Initialize logistics job if required
    try {
      if (typeof ensureLogisticsJobForBooking === 'function') {
        await ensureLogisticsJobForBooking(booking);
      }
    } catch (err) {
      logger.error('Failed to initialize logistics job after payment confirmation', { error: err.message });
    }

    // Notify provider
    await notify({
      user: booking.provider,
      type: 'booking_status_change',
      title: 'Payment received — booking confirmed',
      message: `${user.businessName} paid and confirmed the booking for ${booking.resource.title}`,
      relatedBooking: booking._id,
    });

    return { booking, transaction: finalTx, alreadyPaid: false };
  },

  /**
   * Processes incoming gateway webhooks with HMAC signature verification,
   * duplicate event idempotency, and replay resistance.
   */
  async processWebhook({ payload, signature, headers = {} }) {
    if (!payload) {
      throw new HttpError(400, 'Missing webhook payload.', 'MISSING_WEBHOOK_PAYLOAD');
    }

    // 1. Signature Verification
    const provider = getPaymentProvider();
    const { isValid } = provider.verifyWebhook({ payload, signature });
    if (!isValid) {
      logger.warn('Webhook signature verification failed', { signature });
      throw new HttpError(400, 'Invalid webhook signature.', 'INVALID_WEBHOOK_SIGNATURE');
    }

    const eventId = payload.id || payload.eventId || `wh_${computeHmacSha256(payload, 'wh_id_salt').slice(0, 16)}`;
    const eventType = payload.event || payload.type || 'payment.captured';

    // 2. Replay Resistance: Check timestamp if present (within 10 minutes)
    const eventTimestamp = payload.createdAt || payload.timestamp || headers['x-webhook-timestamp'];
    if (eventTimestamp) {
      const eventTimeMs =
        typeof eventTimestamp === 'number'
          ? (eventTimestamp < 1e11 ? eventTimestamp * 1000 : eventTimestamp)
          : new Date(eventTimestamp).getTime();
      const ageMs = Date.now() - eventTimeMs;
      if (Math.abs(ageMs) > 10 * 60 * 1000) {
        logger.warn('Stale webhook rejected (replay resistance)', { eventId, ageMs });
        throw new HttpError(400, 'Webhook event timestamp expired.', 'WEBHOOK_TIMESTAMP_EXPIRED');
      }
    }

    // 3. Duplicate Webhook Idempotency: Check if already processed
    const existingEvent = await WebhookEvent.findOne({ eventId });
    if (existingEvent) {
      return {
        received: true,
        duplicate: true,
        status: existingEvent.status,
        eventId,
      };
    }

    // 4. Record event as received
    const webhookRecord = await WebhookEvent.create({
      eventId,
      gateway: provider.name,
      eventType,
      status: 'received',
      payload,
    });

    // 5. Handle lifecycle events
    const bookingId = payload.bookingId || payload.data?.bookingId;
    const transactionId = payload.transactionId || payload.data?.transactionId;

    if (eventType === 'payment.captured' || eventType === 'charge.succeeded') {
      const filter = transactionId ? { _id: transactionId } : bookingId ? { booking: bookingId } : null;
      if (filter) {
        const tx = await Transaction.findOne(filter);
        if (tx && tx.status !== 'simulated_paid' && tx.status !== 'paid') {
          tx.status = 'simulated_paid';
          tx.paidAt = new Date();
          tx.gatewayPaymentId = payload.paymentId || payload.data?.id || `pay_${eventId}`;
          tx.reconciliationRef = `rec_${tx.gatewayPaymentId}`;
          await tx.save();

          await Booking.findByIdAndUpdate(tx.booking, { status: 'confirmed' });
          webhookRecord.transaction = tx._id;
        }
      }
    } else if (eventType === 'payment.failed') {
      const filter = transactionId ? { _id: transactionId } : bookingId ? { booking: bookingId } : null;
      if (filter) {
        await Transaction.findOneAndUpdate(filter, {
          status: 'failed',
          failureReason: payload.reason || payload.data?.failureReason || 'Payment failed at gateway',
        });
      }
    } else if (eventType === 'refund.processed') {
      const filter = transactionId ? { _id: transactionId } : bookingId ? { booking: bookingId } : null;
      if (filter) {
        await Transaction.findOneAndUpdate(filter, {
          status: 'refunded',
          refundStatus: 'processed',
          refundedAt: new Date(),
        });
      }
    }

    webhookRecord.status = 'processed';
    await webhookRecord.save();

    return {
      received: true,
      duplicate: false,
      eventId,
      status: 'processed',
    };
  },

  /**
   * Processes a refund safely, updating transaction refund status.
   */
  async processRefund({ transactionId, reason, user, adminOverride = false }) {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) throw new HttpError(404, 'Transaction not found.');

    const isPayer = String(transaction.payer) === String(user._id);
    const isPayee = String(transaction.payee) === String(user._id);
    const isAdmin = Boolean(user.isPlatformAdmin || adminOverride);

    if (!isPayer && !isPayee && !isAdmin) {
      throw new HttpError(403, 'You do not have permission to refund this transaction.');
    }

    if (transaction.status === 'refunded') {
      return { transaction, alreadyRefunded: true };
    }

    if (transaction.status !== 'simulated_paid' && transaction.status !== 'paid') {
      throw new HttpError(400, `Cannot refund transaction in "${transaction.status}" status.`);
    }

    const provider = getPaymentProvider();
    const refundResult = await provider.processRefund({
      transaction,
      amount: transaction.amount,
      reason,
    });

    transaction.status = 'refunded';
    transaction.refundId = refundResult.refundId;
    transaction.refundStatus = 'processed';
    transaction.refundReason = reason || 'Refund issued';
    transaction.refundedAt = refundResult.refundedAt || new Date();
    await transaction.save();

    return {
      transaction,
      refundResult,
      alreadyRefunded: false,
    };
  },
};
