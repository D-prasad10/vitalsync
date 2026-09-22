/**
 * Centralized Error Handling Middleware for SWASTHYAEDGE.
 *
 * Ensures errors are logged gracefully and clean JSON responses
 * are returned without exposing server stack traces or internal DB details in production.
 */

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  console.error(`[ERROR] [${req.method} ${req.url}]:`, err.message || err);

  // In production, internal server errors (500) return safe generic message
  const errorMessage = (status >= 500 && !isDev)
    ? 'Internal server error occurred.'
    : (err.message || 'Internal server error occurred.');

  res.status(status).json({
    error: errorMessage,
    ...(isDev && err.stack ? { details: err.message } : {})
  });
}

module.exports = {
  errorHandler
};
