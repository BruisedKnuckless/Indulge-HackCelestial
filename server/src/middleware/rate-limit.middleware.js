import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Standard skip helper: bypass rate limiting during test suite unless
 * an explicit test header (x-test-rate-limit) is passed to verify rate-limiting behavior.
 */
const shouldSkip = (req) => {
  if (
    (env.isTest || process.env.NODE_ENV === 'test' || process.env.IN_VERIFY === 'true' || global.__IN_VERIFY__) &&
    !req.headers['x-test-rate-limit']
  ) {
    return true;
  }
  return false;
};

/**
 * General API rate limiter — protects all API routes against flooding.
 * 1000 requests per 15 minutes in production/dev.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (req.headers['x-test-rate-limit'] ? 5 : 1000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const url = req.originalUrl || req.url || '';
    if (url.includes('/auth/login') || url.includes('/auth/register')) {
      return true;
    }
    return shouldSkip(req);
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * Stricter rate limiter for authentication routes (login / register).
 * 20 attempts per 15 minutes per IP to guard against brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (req.headers['x-test-rate-limit'] ? 3 : 20),
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts, please try again after 15 minutes.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    });
  },
});
