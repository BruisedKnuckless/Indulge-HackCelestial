import mongoose from 'mongoose';

/**
 * The checklist a technician must physically work through for one listing,
 * as produced by ml/inspection (category baseline + optional Claude
 * suggestions, re-validated so mandatory checks can never be removed).
 *
 * A protocol states *what to check*; it verifies nothing. Results live on the
 * inspection (VerificationRequest) that executes it. Initial and return
 * inspections of the same listing run the same protocol version so their
 * results can be compared parameter by parameter.
 *
 * A listing has at most one `active` protocol; regenerating supersedes the
 * previous one rather than editing it, so completed inspections keep pointing
 * at the checklist they were actually run against.
 */
const protocolParameterSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    category: String,
    title: { type: String, required: true },
    description: String,
    instructions: [String],
    expectedResult: String,
    verificationType: String,
    required: { type: Boolean, default: true },
    requiresEvidenceOnFail: { type: Boolean, default: false },
    weight: { type: Number, default: 1 },
    priority: String,
    requiresQualifiedInspector: { type: Boolean, default: false },
    claimedValue: { type: String, default: null },
    verificationInstruction: { type: String, default: null },
    appliesTo: String,
    generationSource: String,
    basis: [String],
    reason: String,
  },
  { _id: false }
);

const inspectionProtocolSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    protocolId: { type: String, required: true },
    version: { type: Number, default: 1 },
    status: { type: String, enum: ['active', 'superseded'], default: 'active', index: true },

    productName: String,
    productCategory: String,
    categoryLabel: String,
    // What the provider claimed, exactly as the generator received it.
    input: { type: mongoose.Schema.Types.Mixed },
    claims: { type: mongoose.Schema.Types.Mixed },
    attributes: { type: mongoose.Schema.Types.Mixed },
    classification: { type: mongoose.Schema.Types.Mixed },
    inspectionScope: { type: mongoose.Schema.Types.Mixed },
    parameters: [protocolParameterSchema],
    summary: { type: mongoose.Schema.Types.Mixed },
    validation: { type: mongoose.Schema.Types.Mixed },
    // Model/prompt/template versions, AI status and whether it fell back.
    generation: { type: mongoose.Schema.Types.Mixed },
    // 'ml_inspection' normally; 'category_template' only if the generator threw.
    generator: { type: String, enum: ['ml_inspection', 'category_template'], default: 'ml_inspection' },
    disclaimer: String,
  },
  { timestamps: true }
);

inspectionProtocolSchema.index({ resource: 1, status: 1, version: -1 });

export default mongoose.model('InspectionProtocol', inspectionProtocolSchema);
