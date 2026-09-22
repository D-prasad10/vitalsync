const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const axios = require('axios');
const db = require('../database');
const { generateSecureOtp, saveOtp, verifyOtp } = require('../services/auth.service');
const { authenticate } = require('../middleware/auth.middleware');

// Validated roles permitted in the VitalsSync healthcare system
const VALID_ROLES = ['doctor', 'caretaker', 'staff', 'patient'];

// Email Transporter (initialized with env credentials if provided)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Mask sensitive identifiers for safe logging
 */
function maskIdentifier(val) {
  if (!val || typeof val !== 'string') return '***';
  if (val.length <= 4) return '***';
  return `${val.slice(0, 2)}****${val.slice(-2)}`;
}

// POST /api/auth/send-otp
// Generates and dispatches a 6-digit OTP code to mobile & email.
// Auto-registers new staff accounts safely using parameterized queries.
router.post('/api/auth/send-otp', (req, res) => {
  const { mobile, email, role } = req.body || {};

  if (!mobile || !email || !role) {
    return res.status(400).json({ error: 'Role, mobile, and email are required.' });
  }

  if (typeof role !== 'string' || (typeof mobile !== 'string' && typeof mobile !== 'number') || typeof email !== 'string') {
    return res.status(400).json({ error: 'Invalid input format.' });
  }

  const normalizedRole = String(role).toLowerCase().trim();
  const normalizedMobile = String(mobile).replace(/\D/g, '').trim();
  const normalizedEmail = String(email).toLowerCase().trim();

  // Validate inputs strictly
  if (!VALID_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ error: `Invalid role "${role}". Allowed roles: ${VALID_ROLES.join(', ')}` });
  }

  if (normalizedMobile.length !== 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number is required.' });
  }

  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Valid email address is required.' });
  }

  // Parameterized query looking up registered staff
  db.get(
    'SELECT * FROM staff WHERE role = ? AND mobile = ? AND email = ?',
    [normalizedRole, normalizedMobile, normalizedEmail],
    async (err, staffRow) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
      }

      const dispatchOtp = async (staff) => {
        const otp = generateSecureOtp();
        const saveRes = saveOtp(normalizedMobile, {
          otp,
          staffId: staff.staff_id,
          role: staff.role,
          name: staff.name
        });

        if (!saveRes.success) {
          return res.status(saveRes.status || 429).json({ error: saveRes.error });
        }

        // 1. Try SMS via Fast2SMS
        const fast2smsKey = process.env.FAST2SMS_API_KEY;
        if (fast2smsKey && !fast2smsKey.includes('YOUR_')) {
          try {
            const smsRes = await axios.post(
              'https://www.fast2sms.com/dev/bulkV2',
              { route: 'otp', variables_values: otp, flash: 0, numbers: normalizedMobile },
              { headers: { authorization: fast2smsKey } }
            );
            if (smsRes.data && smsRes.data.return === true) {
              console.log(`[AUTH] SMS OTP dispatched to ${maskIdentifier(normalizedMobile)}`);
              return res.json({ success: true, message: `OTP sent to your mobile ${normalizedMobile}` });
            }
          } catch {
            // Fallback to next delivery channel without exposing internal errors
          }
        }

        // 2. Fallback: Email via Nodemailer
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS && !process.env.EMAIL_PASS.includes('YOUR_')) {
          try {
            await transporter.sendMail({
              from: `"VitalsSync" <${process.env.EMAIL_USER}>`,
              to: normalizedEmail,
              subject: '🔐 Your VitalsSync Verification Code',
              html: `<div style="font-family:Arial;padding:24px;background:#0d1117;color:#e6edf3;border-radius:12px;">
                <h2 style="color:#00d2ff">🩺 VitalsSync</h2>
                <p>Your 6-digit verification code is:</p>
                <div style="font-size:44px;font-weight:900;letter-spacing:12px;color:#00d2ff;text-align:center;padding:20px;background:rgba(0,210,255,0.08);border-radius:10px;margin:16px 0">${otp}</div>
                <p style="color:#8b949e;font-size:13px;">Valid for 5 minutes. Do not share this code with anyone.</p>
              </div>`
            });
            console.log(`[AUTH] Email OTP dispatched to ${maskIdentifier(normalizedEmail)}`);
            return res.json({ success: true, message: `OTP sent to ${normalizedEmail}` });
          } catch {
            // Fallback to dev mode if email fails
          }
        }

        // 3. Dev Fallback: return devOtp in non-production environments to support local testing
        if (process.env.NODE_ENV === 'production') {
          return res.status(503).json({ error: 'SMS and Email dispatch channels are currently unavailable.' });
        }

        return res.json({
          success: true,
          message: 'Dev mode: OTP auto-filled below.',
          devOtp: otp
        });
      };

      if (staffRow) {
        return dispatchOtp(staffRow);
      }

      // First-time login: auto-register new staff account with parameterized insert
      const rolePrefix = {
        doctor: 'DR',
        caretaker: 'CR',
        staff: 'ST',
        patient: 'PT'
      }[normalizedRole] || 'ST';

      const staffId = `${rolePrefix}-${Date.now().toString().slice(-6)}`;
      const name = normalizedEmail.split('@')[0];

      db.run(
        'INSERT INTO staff (staff_id, role, name, mobile, email) VALUES (?, ?, ?, ?, ?)',
        [staffId, normalizedRole, name, normalizedMobile, normalizedEmail],
        function (insertErr) {
          if (insertErr) {
            return res.status(500).json({ error: 'Failed to create staff account.' });
          }
          console.log(`[AUTH] Auto-registered new ${normalizedRole}: ${staffId}`);
          dispatchOtp({ staff_id: staffId, role: normalizedRole, name });
        }
      );
    }
  );
});

// POST /api/auth/verify-otp
// Validates 6-digit OTP code and returns authenticated user + JWT token
router.post('/api/auth/verify-otp', (req, res) => {
  const { mobile, otp } = req.body || {};

  if (!mobile || !otp) {
    return res.status(400).json({ error: 'Mobile and OTP are required.' });
  }

  if ((typeof mobile !== 'string' && typeof mobile !== 'number') || (typeof otp !== 'string' && typeof otp !== 'number')) {
    return res.status(400).json({ error: 'Invalid input format.' });
  }

  const normalizedMobile = String(mobile).replace(/\D/g, '').trim();
  const normalizedOtp = String(otp).trim();

  if (normalizedOtp.length !== 6 || !/^\d{6}$/.test(normalizedOtp)) {
    return res.status(400).json({ error: 'OTP must be a 6-digit number.' });
  }

  const result = verifyOtp(normalizedMobile, normalizedOtp);
  if (!result.success) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  res.json({
    success: true,
    token: result.token,
    user: result.user
  });
});

// GET /api/auth/me
// Returns current authenticated session details
router.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
