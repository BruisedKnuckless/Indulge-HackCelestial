import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import Admin from '../models/Admin.js';

/**
 * Two kinds of session share one secret but never one another's routes:
 *   business — { sub: userId,  type: 'business' }           → requireAuth
 *   admin    — { sub: adminId, type: 'admin', role }        → requireAdmin
 * Tokens issued before the type claim existed carry no type and are business
 * sessions, so existing sign-ins survive the change.
 */
const isAdminPayload = (payload) => payload?.type === 'admin';

export function signToken(userOrId) {
  const sub = userOrId?._id ? String(userOrId._id) : String(userOrId);
  return jwt.sign({ sub, type: 'business' }, env.jwtSecret, { expiresIn: env.jwtExpires });
}

export function signAdminToken(admin) {
  return jwt.sign({ sub: String(admin._id), type: 'admin', role: admin.role }, env.jwtSecret, {
    expiresIn: env.jwtExpires,
  });
}

const bearer = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

export async function requireAuth(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Session expired. Please sign in again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        error: 'Invalid or malformed authentication token.',
        code: 'INVALID_TOKEN',
      });
    }

    if (!payload?.sub) {
      return res.status(401).json({ error: 'Invalid token payload.', code: 'INVALID_TOKEN' });
    }

    // An administrator is not a business and has no marketplace identity.
    if (isAdminPayload(payload)) {
      return res.status(403).json({
        error: 'Admin sessions cannot use business APIs. Sign in with a business account.',
        code: 'ADMIN_SESSION',
      });
    }

    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Session no longer valid.', code: 'SESSION_INVALID' });

    // Suspension is enforced once, here, so no individual route can forget it.
    if (user.suspended) {
      return res.status(403).json({
        error: user.suspensionReason
          ? `This account is suspended: ${user.suspensionReason}`
          : 'This account has been suspended by the platform.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Gate for the admin console. Stands alone — it authenticates an Admin
 * account from an admin token and sets req.admin; it never looks at User.
 *
 * No token is a 401 so the admin client can send the operator to
 * /admin/login. A valid *business* token answers 404 rather than 403 so the
 * console's existence is not advertised to ordinary accounts probing the API.
 */
export async function requireAdmin(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch (jwtErr) {
      return res.status(401).json({
        error:
          jwtErr.name === 'TokenExpiredError'
            ? 'Session expired. Please sign in again.'
            : 'Invalid or malformed authentication token.',
        code: jwtErr.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      });
    }

    if (!isAdminPayload(payload)) return res.status(404).json({ error: 'Not found.' });

    const admin = await Admin.findById(payload.sub);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: 'Session no longer valid.', code: 'SESSION_INVALID' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

/** Gate for logistics partner workspaces. */
export function requireLogisticsPartner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (req.user.userType !== 'logistics_partner') {
    return res.status(403).json({ error: 'Access reserved for logistics partners.' });
  }
  next();
}

/** Gate for commercial marketplace operations (Seeker / Lister business accounts). */
export function requireBusinessUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (req.user.userType === 'logistics_partner') {
    return res.status(403).json({
      error: 'Logistics partners cannot perform commercial marketplace operations.',
    });
  }
  next();
}

/** Attaches req.user when a token is present but never blocks the request. */
export async function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      if (payload?.sub && !isAdminPayload(payload)) {
        req.user = await User.findById(payload.sub);
      }
    } catch {
      /* anonymous browsing is fine */
    }
  }
  next();
}
