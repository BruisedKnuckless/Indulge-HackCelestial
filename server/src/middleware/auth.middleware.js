import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { isPlatformAdmin } from '../config/admin.js';

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

    // Suspension is enforced once, here, so no individual route can forget it.
    if (user.suspended) {
      return res.status(403).json({
        error: user.suspensionReason
          ? `This account is suspended: ${user.suspensionReason}`
          : 'This account has been suspended by the platform.',
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

/**
 * Gate for the admin console. Chain it after requireAuth.
 *
 * Answers 404 rather than 403 for non-admins so the console's existence is not
 * advertised to ordinary accounts probing the API.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (!isPlatformAdmin(req.user)) return res.status(404).json({ error: 'Not found.' });
  next();
}

/** Gate for logistics partner workspaces. */
export function requireLogisticsPartner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (req.user.userType !== 'logistics_partner' && !isPlatformAdmin(req.user)) {
    return res.status(403).json({ error: 'Access reserved for logistics partners.' });
  }
  next();
}

/** Gate for commercial marketplace operations (Seeker / Lister business accounts). */
export function requireBusinessUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (req.user.userType === 'logistics_partner') {
    return res.status(403).json({ error: 'Logistics partners cannot perform commercial marketplace operations.' });
  }
  next();
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
