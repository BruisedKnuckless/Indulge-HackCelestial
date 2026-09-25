import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** Wraps async route handlers so a rejected promise reaches the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found.' });
}

export function errorHandler(err, req, res, _next) {
  const requestId = req?.id;

  // Handle body-parser JSON syntax error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Malformed JSON payload.',
      code: 'INVALID_JSON',
      requestId,
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: 'Payload too large. Request body exceeds maximum allowed size.',
      code: 'PAYLOAD_TOO_LARGE',
      requestId,
    });
  }

  // Handle Mongo duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'That record already exists.',
      code: 'DUPLICATE_KEY',
      requestId,
    });
  }

  // Handle Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(' ') || 'Validation error.';
    return res.status(400).json({
      error: message,
      code: 'VALIDATION_ERROR',
      requestId,
    });
  }

  // Handle CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid identifier: ${err.value}`,
      code: 'INVALID_ID',
      requestId,
    });
  }

  const status = Number(err.status) || 500;

  // Log 5xx errors with full diagnostics internally
  if (status >= 500) {
    logger.error('Unhandled server error', {
      requestId,
      method: req?.method,
      url: req?.originalUrl,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack,
    });
  }

  // In production, mask internals on server errors
  if (env.isProduction && status >= 500) {
    return res.status(status).json({
      error: 'An internal server error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
      requestId,
    });
  }

  res.status(status).json({
    error: err.message || 'Something went wrong.',
    code: err.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    requestId,
    ...(env.isDevelopment && status >= 500 ? { stack: err.stack } : {}),
  });
}
