/** Wraps async route handlers so a rejected promise reaches the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found.' });
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);

  if (status >= 500) console.error(err);

  if (err.code === 11000) {
    return res.status(409).json({ error: 'That record already exists.' });
  }

  res.status(status).json({ error: err.message || 'Something went wrong.' });
}
