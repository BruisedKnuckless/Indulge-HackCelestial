import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Resource, { doesResourceRequireLogistics } from '../models/Resource.js';
import Transaction from '../models/Transaction.js';
import LogisticsJob from '../models/LogisticsJob.js';
import ProcurementOrder from '../models/ProcurementOrder.js';
import Requirement from '../models/Requirement.js';
import { validateBookingRequest } from './availability.service.js';
import { ensureLogisticsJobForBooking } from './logistics.service.js';
import { notify } from './notification.service.js';
import { HttpError } from '../middleware/error.middleware.js';

/**
 * Executes a selected procurement plan for a requirement with:
 * 1. Strict re-validation of all supplier allocations against true live availability
 * 2. Idempotency protection against duplicate execution
 * 3. All-or-nothing execution with compensating rollback
 * 4. Distinct child bookings per supplier with tenant privacy preserved
 * 5. Simulated payment records per child booking
 * 6. Logistics dispatch where physical transport is required
 * 7. Requirement lifecycle updates
 */
export async function executeProcurementPlan({
  requirementId,
  seekerId,
  plan,
  idempotencyKey,
  paymentMethod = 'simulated_instant',
}) {
  const requirement = await Requirement.findById(requirementId);
  if (!requirement) {
    throw new HttpError(404, 'Requirement not found.');
  }

  // 1. Authorize: Only seeker or admin can execute
  if (String(requirement.seeker) !== String(seekerId)) {
    throw new HttpError(403, 'Unauthorized. Only the requirement owner can execute a procurement plan.');
  }

  // 2. Resolve target plan
  const targetPlan = plan || requirement.selectedProcurementPlan;
  if (!targetPlan || !targetPlan.id || !Array.isArray(targetPlan.suppliers) || targetPlan.suppliers.length === 0) {
    throw new HttpError(400, 'No valid procurement plan provided or selected on this requirement.');
  }

  // 3. Deterministic Idempotency Key
  const effectiveIdempotencyKey =
    idempotencyKey || `req_${requirement._id}_plan_${targetPlan.id}_seeker_${seekerId}`;

  // Check if already executed
  const existingOrder = await ProcurementOrder.findOne({ idempotencyKey: effectiveIdempotencyKey })
    .populate({
      path: 'childBookings',
      populate: [
        { path: 'resource', select: 'title category images pricing capacity totalQuantity location unit' },
        { path: 'provider', select: 'businessName location phone ratingAvg ratingCount' },
      ],
    })
    .populate('childTransactions');

  if (existingOrder) {
    return {
      procurementOrder: existingOrder,
      alreadyExecuted: true,
      message: 'Procurement plan has already been executed.',
    };
  }

  // 4. Lifecycle status check for new executions
  if (requirement.status === 'fulfilled') {
    throw new HttpError(400, 'This requirement has already been fulfilled.');
  }
  if (['closed', 'cancelled', 'expired'].includes(requirement.status)) {
    throw new HttpError(400, `Cannot execute procurement plan on a ${requirement.status} requirement.`);
  }

  // 5. STALE PLAN REVALIDATION (Pre-flight live inventory check)
  const start = new Date(requirement.startDateTime);
  const end = new Date(requirement.endDateTime);

  // Validate every supplier before touching the database
  const validatedSuppliers = [];
  for (const supp of targetPlan.suppliers) {
    const resource = await Resource.findById(supp.resourceId);
    if (!resource) {
      throw new HttpError(
        409,
        `Resource "${supp.supplierName || supp.resourceId}" is no longer listed. Refresh procurement options.`
      );
    }

    if (resource.status && resource.status !== 'active') {
      throw new HttpError(
        409,
        `Listing "${resource.title}" by ${supp.supplierName || 'provider'} is now ${resource.status}. Refresh procurement options.`
      );
    }

    const check = await validateBookingRequest({
      resource,
      quantity: supp.allocatedQuantity,
      start,
      end,
    });

    if (!check.ok) {
      throw new HttpError(
        409,
        `Provider ${supp.supplierName || 'supplier'} now has insufficient availability: ${check.reason} Refresh procurement options.`
      );
    }

    validatedSuppliers.push({
      supplier: supp,
      resource,
    });
  }

  // 6. ALL-OR-NOTHING EXECUTION WITH COMPENSATING ROLLBACK
  const createdBookings = [];
  const createdTransactions = [];
  const createdJobs = [];

  try {
    // A. Create child bookings and transactions per supplier
    for (const { supplier, resource } of validatedSuppliers) {
      const needsLogistics = doesResourceRequireLogistics(resource);

      const booking = await Booking.create({
        resource: resource._id,
        provider: supplier.supplierId || resource.owner,
        seeker: seekerId,
        requestedQuantity: supplier.allocatedQuantity,
        startDateTime: start,
        endDateTime: end,
        status: 'confirmed',
        quotedPrice: supplier.subtotal,
        agreedPrice: supplier.subtotal,
        urgency: requirement.urgency || 'medium',
        logistics: needsLogistics ? 'provider_transport' : 'self_pickup',
        notes: `Procurement split fulfillment from Requirement "${requirement.title}"`.trim(),
        sourceRequirement: requirement._id,
      });
      createdBookings.push(booking);

      // Child transaction record for seeker -> provider
      const transaction = await Transaction.create({
        booking: booking._id,
        payer: seekerId,
        payee: supplier.supplierId || resource.owner,
        amount: supplier.subtotal,
        status: 'simulated_paid',
        paymentMethod: paymentMethod || 'simulated_instant',
        paidAt: new Date(),
      });
      createdTransactions.push(transaction);

      // If logistics required, initialize physical transport job
      if (needsLogistics) {
        const job = await ensureLogisticsJobForBooking(booking);
        if (job) {
          createdJobs.push(job);
        }
      }
    }

    // B. Create Parent Procurement Order
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `IND-PO-${Date.now().toString().slice(-4)}-${randomSuffix}`;

    const procurementOrder = await ProcurementOrder.create({
      orderNumber,
      requirement: requirement._id,
      seeker: seekerId,
      planId: targetPlan.id,
      planType: targetPlan.type,
      requestedQuantity: targetPlan.requestedQuantity || requirement.requiredQuantity || requirement.quantity || 1,
      fulfilledQuantity: targetPlan.fulfilledQuantity,
      fulfillmentPercentage: targetPlan.fulfillmentPercentage || Math.round((targetPlan.fulfilledQuantity / (targetPlan.requestedQuantity || 1)) * 100),
      fullyFulfilled: Boolean(targetPlan.fullyFulfilled),
      totalPrice: targetPlan.totalPrice,
      budgetVariance: targetPlan.budgetVariance || 0,
      supplierCount: targetPlan.supplierCount || validatedSuppliers.length,
      averageDistanceKm: targetPlan.averageDistanceKm || 0,
      maxDistanceKm: targetPlan.maxDistanceKm || 0,
      logisticsComplexity: targetPlan.logisticsComplexity || 'LOW',
      labels: targetPlan.labels || [],
      status: 'confirmed',
      childBookings: createdBookings.map((b) => b._id),
      childTransactions: createdTransactions.map((t) => t._id),
      logisticsJobs: createdJobs.map((j) => j._id),
      idempotencyKey: effectiveIdempotencyKey,
    });

    // C. Backlink parent order onto each child booking
    await Booking.updateMany(
      { _id: { $in: createdBookings.map((b) => b._id) } },
      { procurementOrder: procurementOrder._id }
    );

    // D. Update Requirement Lifecycle
    requirement.procurementOrder = procurementOrder._id;
    requirement.fulfilledQuantity = targetPlan.fulfilledQuantity;
    requirement.remainingQuantity = Math.max(
      0,
      (targetPlan.requestedQuantity || requirement.requiredQuantity || requirement.quantity || 0) -
        targetPlan.fulfilledQuantity
    );

    if (targetPlan.fullyFulfilled) {
      requirement.status = 'fulfilled';
      requirement.resultingBooking = createdBookings[0]?._id;
      requirement.fulfilledBooking = createdBookings[0]?._id;
    }
    await requirement.save();

    // E. Send targeted notifications (tenant privacy preserved)
    await notify({
      user: seekerId,
      type: 'booking_status_change',
      title: 'Procurement Order confirmed',
      message: `Procurement order ${orderNumber} for ${targetPlan.fulfilledQuantity} units across ${validatedSuppliers.length} supplier(s) has been secured.`,
      relatedBooking: createdBookings[0]?._id,
      relatedRequirement: requirement._id,
    });

    for (let i = 0; i < validatedSuppliers.length; i++) {
      const { supplier, resource } = validatedSuppliers[i];
      const childBooking = createdBookings[i];
      await notify({
        user: supplier.supplierId || resource.owner,
        type: 'booking_status_change',
        title: 'New Procurement Booking Confirmed',
        message: `Your listing "${resource.title}" was booked for ${supplier.allocatedQuantity} units (₹${supplier.subtotal}).`,
        relatedBooking: childBooking._id,
        relatedRequirement: requirement._id,
      });
    }

    const populatedOrder = await ProcurementOrder.findById(procurementOrder._id)
      .populate({
        path: 'childBookings',
        populate: [
          { path: 'resource', select: 'title category images pricing capacity totalQuantity location unit' },
          { path: 'provider', select: 'businessName location phone ratingAvg ratingCount' },
        ],
      })
      .populate('childTransactions');

    return {
      procurementOrder: populatedOrder,
      childBookings: createdBookings,
      childTransactions: createdTransactions,
      logisticsJobs: createdJobs,
      alreadyExecuted: false,
    };
  } catch (err) {
    // COMPENSATING ROLLBACK: Delete all created entities on failure to ensure zero orphan bookings
    if (createdJobs.length > 0) {
      await LogisticsJob.deleteMany({ _id: { $in: createdJobs.map((j) => j._id) } }).catch(() => {});
    }
    if (createdTransactions.length > 0) {
      await Transaction.deleteMany({ _id: { $in: createdTransactions.map((t) => t._id) } }).catch(() => {});
    }
    if (createdBookings.length > 0) {
      await Booking.deleteMany({ _id: { $in: createdBookings.map((b) => b._id) } }).catch(() => {});
    }
    throw err;
  }
}
