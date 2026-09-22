const crypto = require('crypto');

/**
 * Default fallback secret for development and local testing environments only.
 * In production, JWT_SECRET MUST be set in environment variables.
 */
const DEFAULT_DEV_SECRET = 'vitalsync-dev-insecure-secret-change-in-production';

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[SECURITY WARNING] Running in production mode without JWT_SECRET environment variable set! Using development secret is insecure.');
  }
  return DEFAULT_DEV_SECRET;
}

// In-memory OTP Store: mobile -> { otp, expires, staffId, role, name, attempts, createdAt }
const otpStore = new Map();

// Max allowed verification attempts per OTP before automatic invalidation (brute-force defense)
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes validity
const RESEND_COOLDOWN_MS = process.env.NODE_ENV === 'production' ? 30 * 1000 : 0; // 30s cooldown in production

/**
 * Base64URL encoding helper
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decoding helper
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Signs a payload and returns a standard compact HMAC-SHA256 JWT string.
 * Supports configurable token expiration via JWT_EXPIRES_IN (default: 24h).
 */
function signToken(payload, expiresInSeconds) {
  const secret = getJwtSecret();
  const header = { alg: 'HS256', typ: 'JWT' };

  const parsedEnvExp = parseInt(process.env.JWT_EXPIRES_IN, 10);
  const ttl = (expiresInSeconds !== undefined && expiresInSeconds !== null)
    ? expiresInSeconds
    : (!Number.isNaN(parsedEnvExp) && parsedEnvExp > 0 ? parsedEnvExp : 24 * 60 * 60);

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + ttl
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signature}`;
}

/**
 * Verifies and decodes a compact JWT string.
 * Uses timingSafeEqual to protect against timing attacks on signatures.
 * Rejects tampered, expired, or non-object payloads.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token missing or malformed');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token structure');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const secret = getJwtSecret();
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuf = Buffer.from(signature);
  const expSigBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
    throw new Error('Invalid token signature');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new Error('Invalid token payload');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid token payload format');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token has expired');
  }

  return payload;
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP string.
 */
function generateSecureOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Stores an OTP with metadata, TTL, and attempt counter.
 * Enforces cooldown in production to prevent OTP flooding / SMS exhaustion.
 */
function saveOtp(mobile, { otp, staffId, role, name }) {
  const cleanMobile = String(mobile).trim();
  const now = Date.now();

  const existing = otpStore.get(cleanMobile);
  if (existing && RESEND_COOLDOWN_MS > 0 && (now - existing.createdAt < RESEND_COOLDOWN_MS)) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.createdAt)) / 1000);
    return {
      success: false,
      error: `Please wait ${waitSeconds} seconds before requesting a new OTP.`,
      status: 429
    };
  }

  const expires = now + OTP_TTL_MS;
  otpStore.set(cleanMobile, {
    otp: String(otp).trim(),
    expires,
    staffId,
    role,
    name,
    attempts: 0,
    createdAt: now
  });

  return { success: true, expires };
}

/**
 * Verifies an OTP against stored credentials with rate limiting and constant-time comparison.
 */
function verifyOtp(mobile, inputOtp) {
  const cleanMobile = String(mobile).trim();
  const cleanInputOtp = String(inputOtp).trim();

  const record = otpStore.get(cleanMobile);
  if (!record) {
    return { success: false, error: 'No OTP request found. Please request a new OTP.', status: 400 };
  }

  // Check TTL expiry
  if (Date.now() > record.expires) {
    otpStore.delete(cleanMobile);
    return { success: false, error: 'OTP has expired. Please request a new one.', status: 400 };
  }

  // Increment attempts counter
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > MAX_OTP_ATTEMPTS) {
    otpStore.delete(cleanMobile);
    return { success: false, error: 'Too many failed attempts. Please request a new OTP.', status: 400 };
  }

  // Constant-time comparison to protect against timing attacks
  const recBuf = Buffer.from(record.otp);
  const inputBuf = Buffer.from(cleanInputOtp);

  const isValid = recBuf.length === inputBuf.length && crypto.timingSafeEqual(recBuf, inputBuf);
  if (!isValid) {
    return { success: false, error: 'Incorrect OTP. Please try again.', status: 400 };
  }

  // Success: consume OTP so it cannot be re-used
  otpStore.delete(cleanMobile);

  // Generate auth token (includes both staffId and id for legacy compatibility)
  const token = signToken({
    staffId: record.staffId,
    id: record.staffId,
    role: record.role,
    name: record.name
  });

  return {
    success: true,
    token,
    user: {
      role: record.role,
      name: record.name,
      staffId: record.staffId,
      id: record.staffId
    }
  };
}

/**
 * Clears expired OTP records from memory periodically.
 */
function pruneExpiredOtps() {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (now > value.expires) {
      otpStore.delete(key);
    }
  }
}

// Prune expired OTPs every 10 minutes
setInterval(pruneExpiredOtps, 10 * 60 * 1000).unref();

module.exports = {
  signToken,
  verifyToken,
  generateSecureOtp,
  saveOtp,
  verifyOtp,
  otpStore,
  getJwtSecret,
  DEFAULT_DEV_SECRET,
  MAX_OTP_ATTEMPTS,
  OTP_TTL_MS
};
