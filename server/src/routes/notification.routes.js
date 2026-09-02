import { Router } from 'express';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = { user: req.user._id };
    if (req.query.unreadOnly === 'true') filter.isRead = false;

    const notifications = await Notification.find(filter).sort('-createdAt').limit(50).lean();
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });

    res.json({ notifications, unreadCount });
  })
);

router.patch(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { isRead: true });
    res.json({ ok: true });
  })
);

router.patch(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    res.json({ ok: true });
  })
);

export default router;
