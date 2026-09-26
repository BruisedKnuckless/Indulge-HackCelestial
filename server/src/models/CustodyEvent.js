import mongoose from 'mongoose';

/**
 * Chain of custody for a physical listing: an append-only record of every
 * moment its condition was established or it changed hands — listed,
 * inspected, handed over, returned, re-inspected, disputed, resolved.
 *
 * Written by services/verification/custody.service.js only. Nothing edits or
 * deletes an event; a correction is a new event.
 */
export const CUSTODY_EVENT_TYPES = [
  'listing_created',
  'protocol_generated',
  'inspection_created',
  'technician_assigned',
  'inspection_started',
  'evidence_captured',
  'inspection_submitted',
  'handover', // delivery condition check on the booking
  'dispatch_checked',
  'return_received', // return condition check on the booking
  'return_inspection_created',
  'return_inspection_submitted',
  'damage_detected',
  'dispute_resolved',
];

const custodyEventSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
    inspection: { type: mongoose.Schema.Types.ObjectId, ref: 'VerificationRequest', default: null, index: true },
    event: { type: String, enum: CUSTODY_EVENT_TYPES, required: true },
    actorType: { type: String, enum: ['provider', 'seeker', 'technician', 'admin', 'logistics_partner', 'system'], required: true },
    // User or Admin id depending on actorType; null for system.
    actor: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorName: { type: String, default: '' },
    at: { type: Date, default: Date.now, index: true },
    evidence: [{ type: String }], // evidenceIds on the inspection
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }
);

custodyEventSchema.index({ resource: 1, at: 1 });

export default mongoose.model('CustodyEvent', custodyEventSchema);
