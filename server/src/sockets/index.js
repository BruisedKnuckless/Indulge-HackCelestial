import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

let io = null;

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  // Each business joins a room keyed by its own id, so notifications can be
  // addressed to a user without tracking individual socket ids.
  io.on('connection', (socket) => {
    const { token } = socket.handshake.auth || {};
    if (!token) return;

    try {
      const payload = jwt.verify(token, env.jwtSecret);
      socket.join(`user:${payload.sub}`);
    } catch {
      /* unauthenticated sockets simply receive nothing */
    }
  });

  return io;
}

export function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}
