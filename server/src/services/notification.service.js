import Notification from '../models/Notification.js';
import { emitToUser } from '../sockets/index.js';

/**
 * Persist a notification and push it to the recipient if they have a live
 * socket. The DB row is the source of truth — the socket is an accelerator, and
 * the client also polls, so a dropped connection never loses a notification.
 */
export async function notify({
  user,
  type,
  title,
  message,
  relatedBooking,
  relatedRequirement,
  relatedLogisticsJob,
  dedupWindowMs = 5000,
}) {
  // Deduplication guard: ignore duplicate identical notifications within dedupWindowMs
  if (dedupWindowMs > 0) {
    const filter = {
      user,
      type,
      ...(relatedBooking ? { relatedBooking } : {}),
      ...(relatedRequirement ? { relatedRequirement } : {}),
      ...(relatedLogisticsJob ? { relatedLogisticsJob } : {}),
      createdAt: { $gte: new Date(Date.now() - dedupWindowMs) },
    };
    const recent = await Notification.findOne(filter).lean();
    if (recent) {
      return recent;
    }
  }

  const notification = await Notification.create({
    user,
    type,
    title,
    message,
    relatedBooking,
    relatedRequirement,
    relatedLogisticsJob,
  });

  emitToUser(user, 'notification', notification.toObject());
  return notification;
}
