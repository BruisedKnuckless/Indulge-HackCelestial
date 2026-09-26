import mongoose from 'mongoose';

/**
 * Append-only AuditLog for platform administration and verification actions.
 * Tracks who made what change, to which entity, previous vs new states, and reasons.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ['admin', 'user', 'system'],
      default: 'admin',
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    actorEmail: {
      type: String,
      trim: true,
    },
    targetType: {
      type: String,
      enum: ['user', 'booking', 'transaction', 'procurement_order', 'resource', 'inspection'],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
    },
    reason: {
      type: String,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export async function createAuditLog({
  action,
  actorType = 'admin',
  actorId,
  actorEmail,
  targetType,
  targetId,
  previousState,
  newState,
  reason,
  metadata,
}) {
  try {
    return await mongoose.model('AuditLog').create({
      action,
      actorType,
      actorId,
      actorEmail,
      targetType,
      targetId,
      previousState,
      newState,
      reason,
      metadata,
    });
  } catch (err) {
    console.error('AuditLog creation failure:', err);
    return null;
  }
}

export default mongoose.model('AuditLog', auditLogSchema);
