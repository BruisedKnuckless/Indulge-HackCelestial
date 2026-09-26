import { z } from 'zod';
import { RESOURCE_CATEGORIES, PRICE_UNITS } from '../models/Resource.js';
import { LOGISTICS_STATUSES } from '../models/LogisticsJob.js';
import { isValidGstinFormat, isValidUdyamFormat } from '../services/verification.service.js';

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

function validateCoordinates(coords, ctx, path = ['location', 'coordinates']) {
  if (coords === undefined || coords === null) return;
  if (!Array.isArray(coords) || coords.length !== 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Coordinates must be an array of [longitude, latitude].',
      path,
    });
    return;
  }
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid longitude: must be between -180 and 180.',
      path: [...path, 0],
    });
  }
  if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid latitude: must be between -90 and 90.',
      path: [...path, 1],
    });
  }
}

function validateLocationObject(loc, ctx, basePath = ['location']) {
  if (!loc) return;
  if (typeof loc !== 'object') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Location must be an object.',
      path: basePath,
    });
    return;
  }
  if (loc.type !== undefined && loc.type !== 'Point') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Location type must be "Point".',
      path: [...basePath, 'type'],
    });
  }
  if (loc.coordinates !== undefined) {
    validateCoordinates(loc.coordinates, ctx, [...basePath, 'coordinates']);
  }
  if (loc.latitude !== undefined) {
    const lat = Number(loc.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid latitude: must be between -90 and 90.',
        path: [...basePath, 'latitude'],
      });
    }
  }
  if (loc.longitude !== undefined) {
    const lng = Number(loc.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid longitude: must be between -180 and 180.',
        path: [...basePath, 'longitude'],
      });
    }
  }
}

export const registerSchema = z
  .object({
    businessName: z.string().trim().min(2, 'Business name must be at least 2 characters.'),
    email: z.string().trim().email('A valid email address is required.'),
    password: z.string().min(6, 'Passwords must be at least 6 characters.'),
    phone: z.string().optional(),
    businessType: z.string().optional(),
    customBusinessType: z.string().trim().optional(),
    location: z.any().optional(),
    gstNumber: z.string().optional(),
    gstin: z.string().optional(),
    notGstRegistered: z.boolean().optional(),
    udyamNumber: z.string().optional(),
    constitution: z.string().optional(),
    cin: z.string().optional(),
    userType: z.enum(['business', 'logistics_partner']).optional(),
    logisticsProfile: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.businessType === 'other' && data.userType !== 'logistics_partner') {
      if (!data.customBusinessType || !data.customBusinessType.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Specify business type is required when business type is Other.',
          path: ['customBusinessType'],
        });
      }
    }

    const gstinValue = (data.gstin || data.gstNumber || '').trim();
    if (gstinValue) {
      if (!isValidGstinFormat(gstinValue)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid GSTIN format. Expected 15-character Indian GST format (e.g. 27AABCU9603R1ZM).',
          path: ['gstin'],
        });
      }
    }

    const udyamValue = (data.udyamNumber || '').trim();
    if (udyamValue) {
      if (!isValidUdyamFormat(udyamValue)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid Udyam registration number format (e.g. UDYAM-MH-01-0012345).',
          path: ['udyamNumber'],
        });
      }
    }

    if (data.location) {
      validateLocationObject(data.location, ctx, ['location']);
    }
    if (data.logisticsProfile?.hubLocation) {
      validateLocationObject(data.logisticsProfile.hubLocation, ctx, ['logisticsProfile', 'hubLocation']);
    }
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
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),
  declaredCondition: z.string().trim().max(60).optional(),
  specifications: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).transform(String)).optional(),
  accessories: z.array(z.string()).optional(),
}).passthrough();

/**
 * Fields only the inspection system may write. Stripped from provider
 * create/update bodies so a listing can never mark itself verified.
 */
export const PROTECTED_RESOURCE_FIELDS = [
  'verificationStatus', 'verificationId', 'verifiedAt', 'conditionScore', 'recommendedPrice',
  'owner', 'ratingAvg', 'ratingCount',
];

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
