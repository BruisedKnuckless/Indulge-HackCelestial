import mongoose from 'mongoose';
import { RESOURCE_CATEGORIES } from './Resource.js';

/**
 * One physical inspection of a listing by an Indulge technician.
 *
 * `kind: 'initial'` verifies a listing before it is trusted; `kind: 'return'`
 * re-runs the same protocol after a booking and compares against the initial
 * (baseline) inspection to find new damage or loss.
 *
 * Final statuses map onto the product vocabulary:
 *   verified               → VERIFIED
 *   conditionally_verified → VERIFIED_WITH_ISSUES
 *   rejected               → FAILED
 *
 * Everything here that a technician records is tied to the technician's own
 * user id by the server (never taken from the request body).
 */
export const VERIFICATION_STATUSES = [
  'pending', // created, no technician yet
  'assigned', // technician assigned by an admin
  'scheduled',
  'in_progress',
  'submitted',
  'under_review',
  'verified',
  'conditionally_verified',
  'rejected',
];

export const FINAL_VERIFICATION_STATUSES = ['verified', 'conditionally_verified', 'rejected'];
export const OPEN_VERIFICATION_STATUSES = ['pending', 'assigned', 'scheduled', 'in_progress'];

export const PARAMETER_RESULTS = ['pass', 'minor_issue', 'fail', 'not_applicable'];
export const EVIDENCE_TYPES = ['photo', 'video', 'note', 'measurement'];
export const COMPARISON_OUTCOMES = ['new_damage', 'pre_existing', 'no_change', 'improved', 'not_compared'];

const parameterSchema = new mongoose.Schema(
  {
    // Copied from the protocol so the inspection is self-contained even if the
    // protocol is later superseded.
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'physical' },
    instructions: [String],
    expectedResult: { type: String, default: '' },
    verificationType: { type: String, default: 'visual' },
    claimedValue: { type: String, default: null },
    verificationInstruction: { type: String, default: null },
    required: { type: Boolean, default: true },
    requiresEvidenceOnFail: { type: Boolean, default: false },
    requiresQualifiedInspector: { type: Boolean, default: false },
    weight: { type: Number, min: 0, default: 1 },
    priority: { type: String, default: 'medium' },
    appliesTo: { type: String, default: 'every_unit' },
    generationSource: { type: String, default: 'baseline' },
    reason: { type: String, default: '' },

    // Technician's result.
    result: { type: String, enum: [...PARAMETER_RESULTS, null], default: null },
    observedValue: { type: String, default: '' },
    note: { type: String, default: '' },
    resultAt: { type: Date, default: null },
    resultBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    evidenceId: { type: String, required: true },
    parameterId: { type: String, required: true },
    type: { type: String, enum: EVIDENCE_TYPES, required: true },
    url: { type: String, default: null }, // photo / video
    text: { type: String, default: '' }, // note, or caption
    value: { type: String, default: null }, // measurement
    unit: { type: String, default: null },
    technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    capturedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const comparisonSchema = new mongoose.Schema(
  {
    parameterId: String,
    name: String,
    before: { type: String, default: null }, // baseline result
    after: { type: String, default: null }, // return result
    beforeValue: { type: String, default: null },
    afterValue: { type: String, default: null },
    outcome: { type: String, enum: COMPARISON_OUTCOMES },
    loss: { type: Number, default: 0 }, // units missing vs. baseline count
    note: { type: String, default: '' },
  },
  { _id: false }
);

const verificationRequestSchema = new mongoose.Schema(
  {
    inspectionId: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ['initial', 'return'], default: 'initial', index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    protocol: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionProtocol', default: null },
    // Return inspections only.
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
    baselineInspection: { type: mongoose.Schema.Types.ObjectId, ref: 'VerificationRequest', default: null },

    category: { type: String, enum: RESOURCE_CATEGORIES, required: true, index: true },
    inspectionCategory: { type: String, default: null }, // ml/inspection category (laptop, vehicle…)
    resourceName: { type: String, required: true, trim: true },
    status: { type: String, enum: VERIFICATION_STATUSES, default: 'pending', index: true },
    generatedTemplateId: { type: String, default: null },
    parameters: [parameterSchema],

    // Set only by an admin assignment; the id is the technician's User id.
    assignedTechnician: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
      name: { type: String, default: null },
      badge: { type: String, default: null },
      phone: { type: String, default: null },
      assignedAt: { type: Date, default: null },
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    },

    generatedAt: { type: Date, default: Date.now },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastSavedAt: { type: Date, default: null },

    finalScore: { type: Number, min: 0, max: 100, default: null },
    scoreBreakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    decisionReasons: [String],
    conditionStatus: {
      type: String,
      enum: ['Excellent', 'Good', 'Fair', 'Needs Attention', 'Poor', null],
      default: null,
    },
    verificationLevel: {
      type: String,
      enum: ['Indulge Verified', 'Conditionally Verified', 'Rejected', null],
      default: null,
    },

    recommendedPrice: {
      basePrice: { type: Number, default: null },
      lowerBound: { type: Number, default: null },
      upperBound: { type: Number, default: null },
      score: { type: Number, default: null },
      explanation: { type: String, default: '' },
      generatedAt: { type: Date, default: null },
    },

    inspectorNotes: { type: String, default: '' },
    evidence: [evidenceSchema],

    // Return inspections: before/after comparison and the dispute it may open.
    comparison: [comparisonSchema],
    damageSummary: {
      newDamage: { type: Number, default: 0 },
      preExisting: { type: Number, default: 0 },
      noChange: { type: Number, default: 0 },
      improved: { type: Number, default: 0 },
      notCompared: { type: Number, default: 0 },
      unitsLost: { type: Number, default: 0 },
      damageDetected: { type: Boolean, default: false },
    },
    disputeStatus: { type: String, enum: ['none', 'open', 'resolved'], default: 'none', index: true },
    resolution: {
      decision: { type: String, enum: ['seeker_liable', 'no_liability', 'shared', 'waived', null], default: null },
      amount: { type: Number, default: null }, // agreed charge, simulated like every payment
      note: { type: String, default: '' },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      resolvedAt: { type: Date, default: null },
    },

    location: {
      address: { type: String, default: '' },
      city: { type: String, default: '' },
    },
    quantity: { type: Number, default: 1 },
    listedPrice: { type: Number, default: 0 },
    priceUnit: { type: String, default: 'per_day' },
  },
  { timestamps: true }
);

// INS-xxxx is what technicians read out loud, so keep it short; widen only on
// the rare collision.
verificationRequestSchema.pre('validate', async function assignInspectionId() {
  if (this.inspectionId) return;
  const Model = this.constructor;
  for (let digits = 4; digits <= 8; digits += 1) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const lo = 10 ** (digits - 1);
      const candidate = `INS-${Math.floor(lo + Math.random() * 9 * lo)}`;
      // eslint-disable-next-line no-await-in-loop
      if (!(await Model.exists({ inspectionId: candidate }))) {
        this.inspectionId = candidate;
        return;
      }
    }
  }
});

verificationRequestSchema.index({ status: 1, scheduledAt: 1 });
verificationRequestSchema.index({ provider: 1, createdAt: -1 });
verificationRequestSchema.index({ 'assignedTechnician.id': 1, status: 1 });

export default mongoose.model('VerificationRequest', verificationRequestSchema);
