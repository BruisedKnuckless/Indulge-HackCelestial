import { Router } from 'express';
import User from '../models/User.js';
import Resource from '../models/Resource.js';
import Booking from '../models/Booking.js';
import VerificationRequest, { VERIFICATION_STATUSES } from '../models/VerificationRequest.js';
import InspectionProtocol from '../models/InspectionProtocol.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { createAuditLog } from '../models/AuditLog.js';
import {
  assignTechnician,
  createReturnInspection,
  createVerificationForResource,
  resolveDispute,
  isInspectable,
} from '../services/verification/verification.service.js';
import { custodyChain } from '../services/verification/custody.service.js';

/**
 * Admin console — inspections and technicians. Mounted at /api/admin next to
 * admin.routes.js; each route carries requireAdmin itself.
 *
 * Admins assign technicians, open return inspections and resolve damage
 * disputes. They never record results: those come only from the technician.
 */
const router = Router();

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byIdOrCode = (id) =>
  /^INS-\d+$/i.test(id) ? { inspectionId: id.toUpperCase() } : /^[a-f0-9]{24}$/i.test(id) ? { _id: id } : null;

async function loadInspection(id) {
  const filter = byIdOrCode(id);
  const vr = filter ? await VerificationRequest.findOne(filter) : null;
  if (!vr) throw new HttpError(404, 'Inspection not found.');
  return vr;
}

function row(vr) {
  const params = vr.parameters || [];
  return {
    _id: vr._id,
    inspectionId: vr.inspectionId,
    kind: vr.kind,
    status: vr.status,
    resourceName: vr.resourceName,
    resource: vr.resource,
    provider: vr.provider,
    booking: vr.booking,
    inspectionCategory: vr.inspectionCategory,
    technician: vr.assignedTechnician?.id ? { id: vr.assignedTechnician.id, name: vr.assignedTechnician.name } : null,
    finalScore: vr.finalScore,
    conditionStatus: vr.conditionStatus,
    checks: params.length,
    completed: params.filter((p) => p.result).length,
    failed: params.filter((p) => p.result === 'fail').length,
    minor: params.filter((p) => p.result === 'minor_issue').length,
    evidence: (vr.evidence || []).length,
    disputeStatus: vr.disputeStatus,
    damageDetected: Boolean(vr.damageSummary?.damageDetected),
    createdAt: vr.createdAt,
    completedAt: vr.completedAt,
  };
}

/** GET /api/admin/inspections?status=&kind=&dispute=open&q= */
router.get(
  '/inspections',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, kind, dispute, q, technician } = req.query;
    const filter = {};
    if (status === 'open') filter.status = { $in: ['pending', 'assigned', 'scheduled', 'in_progress'] };
    else if (status === 'unassigned') filter.status = 'pending';
    else if (VERIFICATION_STATUSES.includes(status)) filter.status = status;
    if (['initial', 'return'].includes(kind)) filter.kind = kind;
    if (['open', 'resolved'].includes(dispute)) filter.disputeStatus = dispute;
    if (technician && /^[a-f0-9]{24}$/i.test(technician)) filter['assignedTechnician.id'] = technician;
    if (q) filter.$or = [{ resourceName: { $regex: escape(q), $options: 'i' } }, { inspectionId: { $regex: escape(q), $options: 'i' } }];

    const list = await VerificationRequest.find(filter)
      .sort('-createdAt')
      .limit(200)
      .populate('provider', 'businessName')
      .lean();

    const counts = await VerificationRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const openDisputes = await VerificationRequest.countDocuments({ disputeStatus: 'open' });
    res.json({
      inspections: list.map(row),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
      openDisputes,
    });
  })
);

/** GET /api/admin/inspections/:id — full record, protocol, baseline and custody chain. */
router.get(
  '/inspections/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const vr = await loadInspection(req.params.id);
    const [resource, provider, protocol, baseline, booking, custody] = await Promise.all([
      Resource.findById(vr.resource).select('title category images brand model declaredCondition specifications accessories totalQuantity verificationStatus').lean(),
      User.findById(vr.provider).select('businessName email phone').lean(),
      vr.protocol ? InspectionProtocol.findById(vr.protocol).lean() : null,
      vr.baselineInspection ? VerificationRequest.findById(vr.baselineInspection).select('inspectionId finalScore status completedAt parameters').lean() : null,
      vr.booking ? Booking.findById(vr.booking).populate('seeker', 'businessName').populate('provider', 'businessName').select('seeker provider status startDateTime endDateTime requestedQuantity return').lean() : null,
      custodyChain({ resource: vr.resource }),
    ]);
    res.json({ inspection: vr.toObject(), resource, provider, protocol, baseline, booking, custody });
  })
);

/** PATCH /api/admin/inspections/:id/assign { technicianId, scheduledAt? } */
router.patch(
  '/inspections/:id/assign',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const vr = await loadInspection(req.params.id);
    const { technicianId, scheduledAt } = req.body || {};
    if (!/^[a-f0-9]{24}$/i.test(String(technicianId || ''))) throw new HttpError(400, 'Choose a technician.');
    const previous = vr.assignedTechnician?.name || null;
    await assignTechnician(vr, technicianId, req.admin, { scheduledAt });
    await createAuditLog({
      action: 'inspection_assigned',
      actorId: req.admin._id,
      actorEmail: req.admin.email,
      targetType: 'inspection',
      targetId: vr._id,
      previousState: { technician: previous },
      newState: { technician: vr.assignedTechnician.name, status: vr.status },
    });
    res.json({ inspection: row(vr) });
  })
);

/** POST /api/admin/inspections { resourceId } — initial inspection for a listing that has none open. */
router.post(
  '/inspections',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const resource = await Resource.findById(req.body?.resourceId);
    if (!resource) throw new HttpError(404, 'Listing not found.');
    if (!isInspectable(resource)) throw new HttpError(400, 'Only physical items are inspected.');
    const open = await VerificationRequest.findOne({
      resource: resource._id,
      kind: 'initial',
      status: { $in: ['pending', 'assigned', 'scheduled', 'in_progress'] },
    });
    if (open) throw new HttpError(409, `${open.inspectionId} is already open for this listing.`);
    const vr = await createVerificationForResource(resource, null);
    if (!vr) throw new HttpError(500, 'The inspection could not be created.');
    res.status(201).json({ inspection: row(vr) });
  })
);

/** POST /api/admin/inspections/return { bookingId } — idempotent per booking. */
router.post(
  '/inspections/return',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { bookingId } = req.body || {};
    if (!/^[a-f0-9]{24}$/i.test(String(bookingId || ''))) throw new HttpError(400, 'A booking id is required.');
    const { vr, created } = await createReturnInspection(bookingId, {
      actorType: 'admin',
      actor: req.admin._id,
      actorName: req.admin.name,
    });
    res.status(created ? 201 : 200).json({ inspection: row(vr), created });
  })
);

/** PATCH /api/admin/inspections/:id/resolution { decision, amount?, note } */
router.patch(
  '/inspections/:id/resolution',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const vr = await loadInspection(req.params.id);
    await resolveDispute(vr, req.admin, req.body || {});
    await createAuditLog({
      action: 'inspection_dispute_resolved',
      actorId: req.admin._id,
      actorEmail: req.admin.email,
      targetType: 'inspection',
      targetId: vr._id,
      previousState: { disputeStatus: 'open' },
      newState: { disputeStatus: 'resolved', ...vr.resolution.toObject?.() },
      reason: vr.resolution.note,
    });
    res.json({ inspection: vr.toObject() });
  })
);

/** GET /api/admin/technicians — technician accounts with their open workload. */
router.get(
  '/technicians',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const techs = await User.find({ userType: 'inspector' }).select('businessName email phone inspectorProfile suspended location.city').lean();
    const load = await VerificationRequest.aggregate([
      { $match: { 'assignedTechnician.id': { $in: techs.map((t) => t._id) } } },
      {
        $group: {
          _id: '$assignedTechnician.id',
          open: { $sum: { $cond: [{ $in: ['$status', ['assigned', 'scheduled', 'in_progress']] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $in: ['$status', ['verified', 'conditionally_verified', 'rejected']] }, 1, 0] } },
        },
      },
    ]);
    const byId = new Map(load.map((l) => [String(l._id), l]));
    res.json({
      technicians: techs.map((t) => ({
        _id: t._id,
        name: t.inspectorProfile?.displayName || t.businessName,
        title: t.inspectorProfile?.title || 'Field Technician',
        employeeId: t.inspectorProfile?.employeeId || null,
        email: t.email,
        phone: t.phone,
        city: t.location?.city || null,
        suspended: Boolean(t.suspended),
        open: byId.get(String(t._id))?.open || 0,
        completed: byId.get(String(t._id))?.completed || 0,
      })),
    });
  })
);

/**
 * POST /api/admin/technicians { name, email, password, phone?, title?, employeeId?, city? }
 * Technician accounts are created here only — never through public sign-up.
 */
router.post(
  '/technicians',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, password, phone, title, employeeId } = req.body || {};
    if (!String(name || '').trim()) throw new HttpError(400, 'Name is required.');
    if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) throw new HttpError(400, 'A valid email is required.');
    if (String(password || '').length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    if (await User.exists({ email: String(email).toLowerCase() })) throw new HttpError(409, 'An account with that email already exists.');

    const hq = await User.findOne({ userType: 'inspector' }).select('location').lean();
    const tech = await User.create({
      businessName: String(name).trim(),
      email: String(email).toLowerCase(),
      passwordHash: await User.hashPassword(password),
      phone,
      businessType: 'other',
      customBusinessType: 'Indulge inspection team',
      userType: 'inspector',
      inspectorProfile: { displayName: String(name).trim(), title: title || 'Field Technician', employeeId },
      location: hq?.location?.coordinates?.length ? hq.location : { type: 'Point', address: 'Indulge HQ', city: 'Mumbai', coordinates: [72.9051, 19.1176] },
    });
    await createAuditLog({
      action: 'technician_created',
      actorId: req.admin._id,
      actorEmail: req.admin.email,
      targetType: 'user',
      targetId: tech._id,
      newState: { email: tech.email, userType: 'inspector' },
    });
    res.status(201).json({ technician: { _id: tech._id, name: tech.businessName, email: tech.email } });
  })
);

export default router;
