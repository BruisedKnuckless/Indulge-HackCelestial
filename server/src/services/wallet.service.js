import crypto from 'crypto';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { HttpError } from '../middleware/error.middleware.js';
import { rupeesToPaise, paiseToRupees } from './fee-calculation.service.js';

export const WalletService = {
  /**
   * Retrieves an existing wallet or lazily provisions a new one with ₹0 balance.
   */
  async getOrCreateWallet(userId) {
    if (!userId) throw new HttpError(400, 'User ID is required.');
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        availableBalance: 0,
        reservedBalance: 0,
        status: 'active',
      });
    }
    return wallet;
  },

  /**
   * Returns current balances for the user.
   */
  async getBalance(userId) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      _id: wallet._id,
      user: wallet.user,
      availableBalance: wallet.availableRupees,
      reservedBalance: wallet.reservedRupees,
      totalBalance: wallet.totalRupees,
      availableRupees: wallet.availableRupees,
      reservedRupees: wallet.reservedRupees,
      totalRupees: wallet.totalRupees,
      availableBalanceRupees: wallet.availableRupees,
      reservedBalanceRupees: wallet.reservedRupees,
      totalBalanceRupees: wallet.totalRupees,
      availableBalancePaise: wallet.availableBalance,
      reservedBalancePaise: wallet.reservedBalance,
      totalBalancePaise: wallet.totalBalance,
      currency: wallet.currency,
      status: wallet.status,
    };
  },

  /**
   * Adds money to the seeker/business wallet through sandbox payment.
   */
  async topUp({ userId, amountRupees, paymentMethod = 'upi', idempotencyKey }) {
    const amount = Number(amountRupees);
    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new HttpError(400, 'Top-up amount must be a positive number.');
    }

    const amountPaise = rupeesToPaise(amount);
    const wallet = await this.getOrCreateWallet(userId);

    // Idempotency check: if transaction with this idempotencyKey already succeeded
    if (idempotencyKey) {
      const existingTx = await WalletTransaction.findOne({
        user: userId,
        idempotencyKey,
        type: 'TOP_UP',
      });
      if (existingTx) {
        return {
          wallet,
          transaction: existingTx,
          alreadyProcessed: true,
        };
      }
    }

    const balanceBefore = wallet.availableBalance;
    const reservedBefore = wallet.reservedBalance;
    const balanceAfter = balanceBefore + amountPaise;

    wallet.availableBalance = balanceAfter;
    await wallet.save();

    const reference = `TXN-TOP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const transaction = await WalletTransaction.create({
      wallet: wallet._id,
      user: userId,
      type: 'TOP_UP',
      direction: 'credit',
      amount: amountPaise,
      balanceBefore,
      balanceAfter,
      reservedBefore,
      reservedAfter: reservedBefore,
      status: 'success',
      reference,
      idempotencyKey,
      paymentMethod,
      description: `Wallet top-up via ${paymentMethod.toUpperCase()} (Demo/Sandbox)`,
      metadata: {
        environment: 'sandbox_demo',
        amountRupees: amount,
      },
    });

    return {
      wallet,
      transaction,
      alreadyProcessed: false,
    };
  },

  /**
   * Reserves funds in the seeker's wallet for a booking.
   * Atomically decreases availableBalance and increases reservedBalance.
   */
  async reserveForBooking({ userId, bookingId, totalPaise, idempotencyKey, description }) {
    if (!totalPaise || totalPaise <= 0) {
      throw new HttpError(400, 'Invalid reserve amount.');
    }

    const wallet = await this.getOrCreateWallet(userId);

    // Idempotency check
    if (idempotencyKey) {
      const existingTx = await WalletTransaction.findOne({
        user: userId,
        booking: bookingId,
        idempotencyKey,
        type: 'BOOKING_RESERVE',
      });
      if (existingTx) {
        return { wallet, transaction: existingTx, alreadyReserved: true };
      }
    }

    // Check if available balance is sufficient
    if (wallet.availableBalance < totalPaise) {
      const requiredRupees = paiseToRupees(totalPaise);
      const availableRupees = wallet.availableRupees;
      const shortfallRupees = paiseToRupees(totalPaise - wallet.availableBalance);

      const err = new HttpError(
        400,
        `Insufficient Indulge Balance. Required: ₹${requiredRupees.toLocaleString('en-IN')}, Available: ₹${availableRupees.toLocaleString('en-IN')}. Need to add ₹${shortfallRupees.toLocaleString('en-IN')}.`,
        'INSUFFICIENT_BALANCE'
      );
      err.data = {
        required: requiredRupees,
        available: availableRupees,
        shortfall: shortfallRupees,
      };
      throw err;
    }

    const balanceBefore = wallet.availableBalance;
    const reservedBefore = wallet.reservedBalance;
    const balanceAfter = balanceBefore - totalPaise;
    const reservedAfter = reservedBefore + totalPaise;

    wallet.availableBalance = balanceAfter;
    wallet.reservedBalance = reservedAfter;
    await wallet.save();

    const reference = `TXN-RES-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const transaction = await WalletTransaction.create({
      wallet: wallet._id,
      user: userId,
      booking: bookingId,
      type: 'BOOKING_RESERVE',
      direction: 'debit',
      amount: totalPaise,
      balanceBefore,
      balanceAfter,
      reservedBefore,
      reservedAfter,
      status: 'success',
      reference,
      idempotencyKey,
      paymentMethod: 'wallet_reserve',
      description: description || `Booking payment reserved for #${String(bookingId).slice(-6)}`,
      metadata: {
        bookingId,
        environment: 'sandbox_demo',
      },
    });

    return { wallet, transaction, alreadyReserved: false };
  },

  /**
   * Releases or refunds a booking hold back to available balance.
   */
  async refundBooking({ userId, bookingId, refundPaise, reason }) {
    if (!refundPaise || refundPaise <= 0) return null;

    const wallet = await this.getOrCreateWallet(userId);

    const balanceBefore = wallet.availableBalance;
    const reservedBefore = wallet.reservedBalance;

    // Deduct from reserved balance up to available reserved
    const deductionFromReserved = Math.min(reservedBefore, refundPaise);
    const balanceAfter = balanceBefore + refundPaise;
    const reservedAfter = Math.max(0, reservedBefore - deductionFromReserved);

    wallet.availableBalance = balanceAfter;
    wallet.reservedBalance = reservedAfter;
    await wallet.save();

    const reference = `TXN-REF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const transaction = await WalletTransaction.create({
      wallet: wallet._id,
      user: userId,
      booking: bookingId,
      type: 'REFUND',
      direction: 'credit',
      amount: refundPaise,
      balanceBefore,
      balanceAfter,
      reservedBefore,
      reservedAfter,
      status: 'success',
      reference,
      paymentMethod: 'wallet_refund',
      description: reason || `Refund processed for booking #${String(bookingId).slice(-6)}`,
      metadata: {
        bookingId,
        reason,
        environment: 'sandbox_demo',
      },
    });

    return { wallet, transaction };
  },

  /**
   * Retrieves ledger transactions for the user.
   */
  async getTransactions(userId, { limit = 50, skip = 0, type } = {}) {
    const query = { user: userId };
    if (type) query.type = type;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .populate('booking', 'bookingNumber resource requestedQuantity')
        .sort('-createdAt')
        .skip(Number(skip) || 0)
        .limit(Number(limit) || 50),
      WalletTransaction.countDocuments(query),
    ]);

    return {
      transactions,
      total,
      limit: Number(limit) || 50,
      skip: Number(skip) || 0,
    };
  },
};
