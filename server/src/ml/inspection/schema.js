import { z } from 'zod';

/**
 * Structured contracts for the inspection generator: what goes in, what comes
 * out, and what the optional AI layer may return. Everything that leaves the
 * generator is validated against ProtocolSchema.
 */

export const PARAMETER_CATEGORIES = [
  'physical', 'functional', 'specification', 'identity', 'safety',
  'accessories', 'performance', 'cosmetic', 'documentation', 'other',
];

export const VERIFICATION_TYPES = [
  'visual', 'functional_test', 'system_check', 'measurement',
  'document_check', 'serial_check', 'comparison', 'manual_test',
];

export const GENERATION_SOURCES = ['baseline', 'ai_generated', 'baseline_plus_ai'];
export const BASES = ['template', 'conditional', 'claim', 'brand_profile', 'ai'];
export const PRIORITIES = ['critical', 'high', 'medium', 'low', 'minimal'];

const specValue = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Provider-submitted product information. Only productName is required; every
 * other field sharpens the protocol. Indulge listings are mapped onto this by
 * fromResource() in normalize.js.
 */
export const InputSchema = z.object({
  productName: z.string().trim().min(1),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  model: z.string().trim().optional(),
  description: z.string().trim().optional(),
  declaredCondition: z.string().trim().optional(),
  usageAge: z.string().trim().optional(),
  intendedUse: z.string().trim().optional(),
  quantity: z.number().int().positive().optional(),
  specifications: z.record(z.string(), specValue).default({}),
  features: z.array(z.string()).default([]),
  accessories: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
  listingCategory: z.string().trim().optional(),
  sourceRef: z.object({ type: z.string(), id: z.string() }).optional(),
});

export const ParameterSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  category: z.enum(PARAMETER_CATEGORIES),
  title: z.string().min(1),
  description: z.string().min(1),
  instructions: z.array(z.string().min(1)).min(1),
  expectedResult: z.string().min(1),
  verificationType: z.enum(VERIFICATION_TYPES),
  required: z.boolean(),
  requiresEvidenceOnFail: z.boolean(),
  weight: z.number().int().min(1).max(5),
  priority: z.enum(PRIORITIES),
  requiresQualifiedInspector: z.boolean(),
  claimedValue: z.string().optional(),
  verificationInstruction: z.string().optional(),
  appliesTo: z.enum(['every_unit', 'sample', 'lot']),
  generationSource: z.enum(GENERATION_SOURCES),
  basis: z.array(z.enum(BASES)).min(1),
  reason: z.string().min(1),
  status: z.literal('pending_inspection'),
});

export const ProtocolSchema = z.object({
  protocolId: z.string(),
  inspectionVersion: z.string(),
  status: z.literal('pending_inspection'),
  disclaimer: z.string(),
  productName: z.string(),
  productCategory: z.string(),
  categoryLabel: z.string(),
  product: z.record(z.string(), z.any()),
  classification: z.record(z.string(), z.any()),
  attributes: z.record(z.string(), z.any()),
  claims: z.array(z.record(z.string(), z.any())),
  inspectionScope: z.record(z.string(), z.any()),
  parameters: z.array(ParameterSchema).min(1),
  summary: z.record(z.string(), z.any()),
  imageHints: z.array(z.record(z.string(), z.any())),
  validation: z.record(z.string(), z.any()),
  generation: z.object({
    modelName: z.string(),
    modelVersion: z.string(),
    promptVersion: z.string(),
    templateVersion: z.string(),
    knowledgeVersions: z.record(z.string(), z.string()),
    generationTimestamp: z.string(),
    mode: z.enum(['baseline_only', 'baseline_plus_ai']),
    ai: z.record(z.string(), z.any()),
  }),
});

/* ─────────────────────────────── AI layer contract ─────────────────────────────── */

/** What the LLM may return. Validated again with zod after parsing. */
export const AiOutputSchema = z.object({
  inferredCategory: z.string().nullable(),
  additionalParameters: z.array(
    z.object({
      title: z.string().min(1),
      category: z.enum(PARAMETER_CATEGORIES),
      description: z.string().min(1),
      instructions: z.array(z.string().min(1)).min(1),
      expectedResult: z.string().min(1),
      verificationType: z.enum(VERIFICATION_TYPES),
      weight: z.number().int(),
      requiresEvidenceOnFail: z.boolean(),
      claimedValue: z.string().nullable(),
      basedOnImage: z.boolean(),
      reason: z.string().min(1),
    })
  ),
  imageObservations: z.array(
    z.object({ observation: z.string(), suggestedFocus: z.string() })
  ),
});

/**
 * The same contract as JSON Schema, for the API's structured-output mode.
 * Structured outputs require additionalProperties:false on every object and
 * do not support numeric bounds, so ranges are enforced after parsing.
 */
export const AI_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['inferredCategory', 'additionalParameters', 'imageObservations'],
  properties: {
    inferredCategory: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    additionalParameters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title', 'category', 'description', 'instructions', 'expectedResult',
          'verificationType', 'weight', 'requiresEvidenceOnFail', 'claimedValue', 'basedOnImage', 'reason',
        ],
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: PARAMETER_CATEGORIES },
          description: { type: 'string' },
          instructions: { type: 'array', items: { type: 'string' } },
          expectedResult: { type: 'string' },
          verificationType: { type: 'string', enum: VERIFICATION_TYPES },
          weight: { type: 'integer' },
          requiresEvidenceOnFail: { type: 'boolean' },
          claimedValue: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          basedOnImage: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
    },
    imageObservations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['observation', 'suggestedFocus'],
        properties: {
          observation: { type: 'string' },
          suggestedFocus: { type: 'string' },
        },
      },
    },
  },
};
