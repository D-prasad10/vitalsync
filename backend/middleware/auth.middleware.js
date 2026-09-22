const { verifyToken } = require('../services/auth.service');

/**
 * Extracts authentication token from standard Bearer header, custom header, or query parameter.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
    // Handle bare token without "Bearer" prefix, as long as it's not the word "Bearer" alone
    if (parts.length === 1 && !/^Bearer$/i.test(parts[0])) {
      return parts[0];
    }
  }

  const customHeader = req.headers['x-auth-token'];
  if (customHeader && typeof customHeader === 'string') {
    return customHeader.trim();
  }

  if (req.query && req.query.token && typeof req.query.token === 'string') {
    return req.query.token.trim();
  }

  return null;
}

/**
 * Enforces valid authentication token. Rejects with HTTP 401 if missing, expired, or invalid.
 */
function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please provide a valid Bearer token.' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

/**
 * Enforces role-based authorization.
 * e.g., requireRole('doctor') or requireRole('doctor', 'caretaker')
 */
function requireRole(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(r => String(r).toLowerCase().trim());

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userRole = String(req.user.role || '').toLowerCase().trim();

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied: Insufficient privileges.' });
    }

    next();
  };
}

/**
 * Optional authentication: decodes token if present, but never blocks unauthenticated requests.
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Ignored for optional auth
    }
  }
  next();
}

module.exports = {
  authenticate,
  requireRole,
  optionalAuth,
  extractToken
};
