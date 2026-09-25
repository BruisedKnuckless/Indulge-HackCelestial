import crypto from 'crypto';

/**
 * Middleware that attaches a unique correlation/request ID to each incoming request
 * and propagates it via the X-Request-Id response header.
 */
export function requestIdMiddleware(req, res, next) {
  const existingId = req.headers['x-request-id'];
  const requestId =
    typeof existingId === 'string' && existingId.trim().length > 0
      ? existingId.trim()
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
