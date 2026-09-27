import mongoose from 'mongoose';

/**
 * One run of the RFQ smart intake: what the seeker typed, what the Nugen model
 * said, what grounding kept, and — once posted — the requirement it became.
 *
 * Kept for two reasons: the posted requirement snapshots its provenance from
 * here (server-side, so a client cannot claim a model drafted it), and real
 * seeker phrasings are the next alignment dataset for src/ml/rfq.
 */
const rfqIntakeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, maxlength: 1000 },
    today: String,
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    draft: { type: mongoose.Schema.Types.Mixed, default: {} },
    fieldSources: { type: mongoose.Schema.Types.Mixed, default: {} },
    check: [String],
    dropped: [{ _id: false, field: String, reason: String }],
    ai: {
      status: String,
      reason: String,
      provider: String,
      model: String,
      aligned: Boolean,
      confidenceScore: Number,
      latencyMs: Number,
      promptVersion: String,
    },
    requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('RfqIntake', rfqIntakeSchema);
