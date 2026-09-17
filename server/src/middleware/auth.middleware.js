import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: env.jwtExpires });
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Session no longer valid.' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

/** Attaches req.user when a token is present but never blocks the request. */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      req.user = await User.findById(payload.sub);
    } catch {
      /* anonymous browsing is fine */
    }
  }
  next();
}
