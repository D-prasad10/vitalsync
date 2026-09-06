require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');
const axios = require('axios');
const db = require('./database');

// ── Email Transporter ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

// ── In-memory OTP Store: { mobile: { otp, expires, staffId, role, name } } ────
const otpStore = new Map();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5001;

// POST /api/auth/send-otp
// Anyone can log in with their own mobile + email.
// If first time, they are auto-registered as staff.
app.post('/api/auth/send-otp', (req, res) => {
  const { mobile, email, role } = req.body;
  if (!mobile || !email || !role) {
    return res.status(400).json({ error: 'Role, mobile, and email are required.' });
  }

  // Look up by role + mobile + email
  db.get(
    'SELECT * FROM staff WHERE role = ? AND mobile = ? AND email = ?',
    [role, mobile.trim(), email.trim().toLowerCase()],
    async (err, staffRow) => {
      if (err) return res.status(500).json({ error: 'Database error.' });

      const sendOtp = async (staff) => {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
        otpStore.set(mobile.trim(), { otp, expires, staffId: staff.staff_id, role: staff.role, name: staff.name });

        // ── Try SMS via Fast2SMS ──────────────────────────────────────────────
        const fast2smsKey = process.env.FAST2SMS_API_KEY;
        if (fast2smsKey && !fast2smsKey.includes('YOUR_')) {
          try {
            const smsRes = await axios.post(
              'https://www.fast2sms.com/dev/bulkV2',
              { route: 'otp', variables_values: otp, flash: 0, numbers: mobile.trim() },
              { headers: { authorization: fast2smsKey } }
            );
            if (smsRes.data && smsRes.data.return === true) {
              console.log(`✅ SMS OTP sent to ${mobile.trim()}`);
              return res.json({ success: true, message: `OTP sent to your mobile ${mobile.trim()}` });
            }
            console.error('Fast2SMS response:', smsRes.data);
          } catch (smsErr) {
            console.error('SMS error:', smsErr.message);
          }
        }

        // ── Fallback: Email ───────────────────────────────────────────────────
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS && !process.env.EMAIL_PASS.includes('YOUR_')) {
          try {
            await transporter.sendMail({
              from: `"VitalsSync" <${process.env.EMAIL_USER}>`,
              to: email.trim(),
              subject: '🔐 Your VitalsSync OTP',
              html: `<div style="font-family:Arial;padding:24px;background:#0d1117;color:#e6edf3;border-radius:12px;"><h2 style="color:#00d2ff">🩺 VitalsSync</h2><p>Your OTP:</p><div style="font-size:44px;font-weight:900;letter-spacing:12px;color:#00d2ff;text-align:center;padding:20px;background:rgba(0,210,255,0.08);border-radius:10px;margin:16px 0">${otp}</div><p style="color:#8b949e;font-size:13px;">Valid for 5 minutes.</p></div>`
            });
            console.log(`✅ Email OTP sent to ${email.trim()}`);
            return res.json({ success: true, message: `OTP sent to ${email.trim()}` });
          } catch (emailErr) {
            console.error('Email error:', emailErr.message);
          }
        }

        // ── Dev fallback: return OTP in response ──────────────────────────────
        console.log(`\n⚠️  DEV MODE — OTP for ${mobile.trim()}: ${otp}  (5 min)\n`);
        res.json({ success: true, message: 'Dev mode: OTP auto-filled below.', devOtp: otp });
      };

      if (staffRow) {
        // Existing user — send them their OTP
        return sendOtp(staffRow);
      }

      // ── First-time login: auto-register ──────────────────────────────────────
      const prefix = role === 'doctor' ? 'DR' : 'CR';
      const staffId = `${prefix}-${Date.now().toString().slice(-6)}`;
      const name = email.trim().split('@')[0]; // use email prefix as default name

      db.run(
        'INSERT INTO staff (staff_id, role, name, mobile, email) VALUES (?, ?, ?, ?, ?)',
        [staffId, role, name, mobile.trim(), email.trim().toLowerCase()],
        function(insertErr) {
          if (insertErr) {
            console.error('Auto-register error:', insertErr.message);
            return res.status(500).json({ error: 'Failed to register account.' });
          }
          console.log(`✅ Auto-registered new ${role}: ${email.trim()} (${staffId})`);
          sendOtp({ staff_id: staffId, role, name });
        }
      );
    }
  );
});

// POST /api/auth/verify-otp — check OTP, return user info on success
app.post('/api/auth/verify-otp', (req, res) => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) return res.status(400).json({ error: 'Mobile and OTP are required.' });

  const record = otpStore.get(mobile.trim());
  if (!record) return res.status(400).json({ error: 'No OTP request found. Please request a new OTP.' });
  if (Date.now() > record.expires) {
    otpStore.delete(mobile.trim());
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
  }

  // Success — clear OTP and return user
  otpStore.delete(mobile.trim());
  res.json({ success: true, user: { role: record.role, name: record.name, staffId: record.staffId } });
});

// ── Staff Management Endpoints ──────────────────────────────────────────────────

// GET /api/staff — list all staff
app.get('/api/staff', (req, res) => {
  db.all('SELECT id, staff_id, role, name, mobile, email FROM staff', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /api/staff — add a new staff member
app.post('/api/staff', (req, res) => {
  const { staff_id, role, name, mobile, email } = req.body;
  if (!staff_id || !role || !name || !mobile || !email) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  db.run(
    'INSERT INTO staff (staff_id, role, name, mobile, email) VALUES (?, ?, ?, ?, ?)',
    [staff_id.trim(), role, name.trim(), mobile.trim(), email.trim().toLowerCase()],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: `Staff ID "${staff_id}" already exists.` });
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// DELETE /api/staff/:id — remove a staff member
app.delete('/api/staff/:id', (req, res) => {
  db.run('DELETE FROM staff WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changes: this.changes });
  });
});

// ── Patient API Endpoints ──────────────────────────────────────────────────────
app.get('/api/patients', (req, res) => {
  db.all('SELECT * FROM patients', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/patients/:id', (req, res) => {
  const patientId = req.params.id;
  db.get('SELECT * FROM patients WHERE id = ?', [patientId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Patient not found" });
    res.json(row);
  });
});

app.put('/api/patients/:id', (req, res) => {
  const patientId = req.params.id;
  const { name, age, gender, blood_group, weight, mobile, guardian_contact, photo, doctor_name, doctor_phone, room_number, doctor_specialization, doctor_email } = req.body;
  
  db.run(`
    UPDATE patients 
    SET name = ?, age = ?, gender = ?, blood_group = ?, weight = ?, mobile = ?, guardian_contact = ?, photo = ?, doctor_name = ?, doctor_phone = ?, room_number = ?, doctor_specialization = ?, doctor_email = ?
    WHERE id = ?
  `, [name, age, gender, blood_group, weight, mobile, guardian_contact, photo, doctor_name, doctor_phone, room_number, doctor_specialization, doctor_email, patientId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changes: this.changes });
  });
});

app.post('/api/patients', (req, res) => {
  const { name, age, gender, blood_group, weight, mobile, guardian_contact, room_number } = req.body;

  db.run(`
    INSERT INTO patients (name, age, gender, blood_group, weight, mobile, guardian_contact, room_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [name, age, gender, blood_group, weight, mobile, guardian_contact, room_number], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    // Create default thresholds for this patient
    const newPatientId = this.lastID;
    db.run(`INSERT INTO thresholds (patient_id) VALUES (?)`, [newPatientId], (err2) => {
      if (err2) console.error("Could not set default thresholds", err2);
      
      db.get('SELECT * FROM patients WHERE id = ?', [newPatientId], (err3, row) => {
         res.json({ success: true, patient: row });
      });
    });
  });
});

app.get('/api/patients/:id/history', (req, res) => {
  const patientId = req.params.id;
  // Get history from the last 7 days
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  db.all(
    'SELECT * FROM sensor_logs WHERE patient_id = ? AND timestamp > ? ORDER BY timestamp ASC',
    [patientId, sevenDaysAgo],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/patients/:id/thresholds', (req, res) => {
  const patientId = req.params.id;
  db.get('SELECT * FROM thresholds WHERE patient_id = ?', [patientId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

app.post('/api/patients/:id/thresholds', (req, res) => {
  const patientId = req.params.id;
  const { hr_max, hr_min, bp_sys_max, bp_dia_max, spo2_min, temp_max } = req.body;

  db.run(`
    INSERT INTO thresholds (patient_id, hr_max, hr_min, bp_sys_max, bp_dia_max, spo2_min, temp_max)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(patient_id) DO UPDATE SET
      hr_max = excluded.hr_max,
      hr_min = excluded.hr_min,
      bp_sys_max = excluded.bp_sys_max,
      bp_dia_max = excluded.bp_dia_max,
      spo2_min = excluded.spo2_min,
      temp_max = excluded.temp_max
  `, [patientId, hr_max, hr_min, bp_sys_max, bp_dia_max, spo2_min, temp_max], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Real-time Simulation & Socket.IO
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Simulation Loop (Runs every 3 seconds for active patients)
setInterval(() => {
  db.all('SELECT * FROM patients', [], (err, patients) => {
    if (err) return;

    patients.forEach(patient => {
      // Generate simulated data points
      const hr = Math.floor(60 + Math.random() * 40); // 60-100 bpm
      const bpSys = Math.floor(110 + Math.random() * 30); // 110-140 mmHg
      const bpDia = Math.floor(70 + Math.random() * 20); // 70-90 mmHg
      const spo2 = Math.floor(95 + Math.random() * 5); // 95-100%
      const temp = Number((97.8 + Math.random() * 2.2).toFixed(1)); // 97.8-100.0 F
      const timestamp = Date.now();

      // Calculate Health Score (Max 100)
      // 25 pts each for HR, BP, SpO2, Temp
      let scoreHr = 25, scoreBp = 25, scoreSpo2 = 25, scoreTemp = 25;

      // Heart Rate: 60-100 Normal, 50-59/101-120 Warning, else Critical
      if (hr < 50 || hr > 120) scoreHr = 0;
      else if (hr < 60 || hr > 100) scoreHr = 12;

      // Blood Pressure (Sys): 90-120 Normal, 121-140/80-89 Warning, else Critical
      if (bpSys < 80 || bpSys > 140) scoreBp = 0;
      else if (bpSys < 90 || bpSys > 120) scoreBp = 12;

      // SpO2: 95-100 Normal, 90-94 Warning, else Critical
      if (spo2 < 90) scoreSpo2 = 0;
      else if (spo2 < 95) scoreSpo2 = 12;

      // Temperature (F): 97-99 Normal, 99.1-101/95-96.9 Warning, else Critical
      if (temp < 95 || temp > 101) scoreTemp = 0;
      else if (temp < 97 || temp > 99) scoreTemp = 12;

      const healthScore = scoreHr + scoreBp + scoreSpo2 + scoreTemp;

      const payload = {
        patient_id: patient.id,
        hr, bpSys, bpDia, spo2, temp, healthScore, timestamp
      };

      // Emit data via socket
      io.emit('sensor_data', payload);

      // Store in DB
      db.run(
        'INSERT INTO sensor_logs (patient_id, hr, bp_sys, bp_dia, spo2, temp, health_score, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [patient.id, hr, bpSys, bpDia, spo2, temp, healthScore, timestamp]
      );

      // Check Thresholds
      db.get('SELECT * FROM thresholds WHERE patient_id = ?', [patient.id], (err, row) => {
        if (!row || err) return;

        let alerts = [];
        if (hr > row.hr_max) alerts.push(`High Heart Rate: ${hr} bpm`);
        if (hr < row.hr_min) alerts.push(`Low Heart Rate: ${hr} bpm`);
        if (bpSys > row.bp_sys_max) alerts.push(`High Systolic BP: ${bpSys} mmHg`);
        if (bpDia > row.bp_dia_max) alerts.push(`High Diastolic BP: ${bpDia} mmHg`);
        if (spo2 < row.spo2_min) alerts.push(`Low SpO2: ${spo2}%`);
        if (temp > row.temp_max) alerts.push(`High Temp: ${temp} °F`);

        if (alerts.length > 0) {
          io.emit('emergency_alert', {
            patient_id: patient.id,
            patient_name: patient.name,
            alerts,
            timestamp
          });
        }
      });
    });
  });
}, 3000);

server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
