import Notification from '../models/Notification.js';
import { emitToUser } from '../sockets/index.js';

/**
 * Persist a notification and push it to the recipient if they have a live
 * socket. The DB row is the source of truth — the socket is an accelerator, and
 * the client also polls, so a dropped connection never loses a notification.
 */
export async function notify({ user, type, title, message, relatedBooking }) {
  const notification = await Notification.create({
    user,
    type,
    title,
    message,
    relatedBooking,
  });

  emitToUser(user, 'notification', notification.toObject());
  return notification;
}
