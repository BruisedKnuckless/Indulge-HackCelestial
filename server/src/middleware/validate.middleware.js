import { z } from 'zod';
import { RESOURCE_CATEGORIES, PRICE_UNITS } from '../models/Resource.js';
import { LOGISTICS_STATUSES } from '../models/LogisticsJob.js';

/**
 * Reusable express middleware that validates req[source] (default 'body')
 * against a Zod schema. Returns 400 with actionable error messages on failure.
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const parsed = schema.parse(req[source]);
    req[source] = parsed;
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issueList = err.issues || err.errors || [];
      const issues = issueList.map((e) => ({
        field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
        message: e.message,
      }));
      return res.status(400).json({
        error: issues[0]?.message || 'Validation failed.',
        code: 'VALIDATION_ERROR',
        details: issues,
        requestId: req.id,
      });
    }
    next(err);
  }
};

/* ── 1. Auth Schemas ──────────────────────────────────────────────────────── */

export const registerSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters.'),
  email: z.string().trim().email('A valid email address is required.'),
  password: z.string().min(6, 'Passwords must be at least 6 characters.'),
  phone: z.string().optional(),
  businessType: z.string().optional(),
  location: z.any().optional(),
  gstNumber: z.string().optional(),
  userType: z.enum(['business', 'logistics_partner']).optional(),
  logisticsProfile: z.any().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.'),
  password: z.string().min(1, 'Password is required.'),
});

/* ── 2. Resource Mutation Schemas ─────────────────────────────────────────── */

export const createResourceSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(140, 'Title is too long.'),
  category: z.enum(RESOURCE_CATEGORIES, {
    errorMap: () => ({ message: `Category must be one of: ${RESOURCE_CATEGORIES.join(', ')}` }),
  }),
  description: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  totalQuantity: z.number().int().min(1, 'Total quantity must be at least 1.').optional().default(1),
  unit: z.enum(['unit', 'hour', 'seat', 'sqft', 'slot']).optional(),
  capacity: z.number().min(0).optional(),
  pricing: z
    .object({
      basePrice: z.number().positive('Base price must be greater than 0.'),
      priceUnit: z.enum(PRICE_UNITS).optional(),
      minRentalPeriodHours: z.number().min(0).optional(),
    })
    .passthrough(),
  location: z
    .object({
      address: z.string().optional(),
      city: z.string().optional(),
      coordinates: z.array(z.number()).length(2, 'Coordinates must be [longitude, latitude]').optional(),
    })
    .optional(),
  availabilityMode: z.enum(['indefinite', 'until_date', 'date_range', 'recurring', 'custom']).optional(),
  availableUntil: z.any().optional(),
  requiresLogistics: z.boolean().optional(),
  conditions: z.string().optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
}).passthrough();

export const updateResourceSchema = createResourceSchema.partial();

/* ── 3. Requirements Schemas ─────────────────────────────────────────────── */

export const createRequirementSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(140),
  category: z.enum(RESOURCE_CATEGORIES, {
    errorMap: () => ({ message: `Category must be one of: ${RESOURCE_CATEGORIES.join(', ')}` }),
  }),
  description: z.string().optional(),
  requiredQuantity: z.number().min(1).optional(),
  quantity: z.number().min(1).optional(),
  unit: z.enum(['unit', 'hour', 'seat', 'sqft', 'slot']).optional(),
  maxBudget: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  startDateTime: z.string().or(z.date()).refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid start date/time is required.',
  }),
  endDateTime: z.string().or(z.date()).refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid end date/time is required.',
  }),
  location: z
    .object({
      address: z.string().optional(),
      city: z.string().optional(),
      pincode: z.string().optional(),
      coordinates: z.array(z.number()).length(2, 'Coordinates must be [longitude, latitude]').optional(),
      radiusKm: z.number().min(1).optional(),
    })
    .optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
}).passthrough();

/* ── 4. Procurement Execution Schema ─────────────────────────────────────── */

export const executeProcurementPlanSchema = z
  .object({
    plan: z.any().optional(),
    planId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    paymentMethod: z.string().optional(),
  })
  .refine((data) => Boolean(data.plan || data.planId), {
    message: 'Either plan or planId is required to execute a procurement plan.',
  })
  .passthrough();

/* ── 5. Logistics Status Update Schema ────────────────────────────────────── */

export const updateLogisticsStatusSchema = z.object({
  status: z.enum(LOGISTICS_STATUSES, {
    errorMap: () => ({ message: `Invalid logistics status. Allowed: ${LOGISTICS_STATUSES.join(', ')}` }),
  }),
  notes: z.string().optional(),
  operationalNotes: z.string().optional(),
}).passthrough();

/* ── 6. Admin Mutation Schemas ────────────────────────────────────────────── */

export const adminAssignLogisticsSchema = z.object({
  partnerId: z.string().min(1, 'partnerId is required.'),
  operationalNotes: z.string().optional(),
}).passthrough();

export const adminSuspendUserSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().optional(),
}).passthrough();
