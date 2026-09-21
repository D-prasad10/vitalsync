/**
 * Centralized Error Handling Middleware for SWASTHYAEDGE.
 *
 * Ensures errors are logged gracefully and clean JSON responses
 * are returned without exposing server stack traces or crashing the process.
 */

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  console.error(`[ERROR] [${req.method} ${req.url}]:`, err.message || err);

  res.status(status).json({
    error: err.message || 'Internal server error occurred.',
    ...(isDev && err.stack ? { details: err.message } : {})
  });
}

module.exports = {
  errorHandler
};
