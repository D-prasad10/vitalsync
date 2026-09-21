require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');
const axios = require('axios');
const os = require('os');
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
      const enriched = (rows || []).map(r => {
        let payload = {};
        if (r.raw_payload) {
          try { payload = JSON.parse(r.raw_payload); } catch (_) {}
        }
        return {
          ...r,
          ...payload,
          id: r.id,
          patient_id: r.patient_id,
          patientId: r.patient_id,
          timestamp: r.timestamp,
          dhtTemp: payload.dhtTemp ?? r.dht_temp,
          bmpTemp: payload.bmpTemp ?? r.bmp_temp,
          temp: payload.temp ?? r.temp,
          humidity: payload.humidity ?? r.humidity,
          pressure: payload.pressure ?? r.pressure,
          ecg: payload.ecg ?? (r.ecg_val != null ? { value: r.ecg_val, leadOffPlus: false, leadOffMinus: false, leadsConnected: true } : null),
          ecg_val: payload.ecg_val ?? r.ecg_val,
          maxFound: payload.maxFound !== false,
          maxIR: payload.maxIR ?? r.max_ir,
          maxRED: payload.maxRED ?? r.max_red,
          mq135: payload.mq135 ?? r.mq135,
          healthScore: payload.healthScore ?? r.health_score ?? 100,
          deviceStatus: payload.deviceStatus || 'ONLINE'
        };
      });
      res.json(enriched);
    }
  );
});

// GET /api/patients/:id/latest - returns the most recent telemetry point
app.get('/api/patients/:id/latest', (req, res) => {
  const patientId = req.params.id;
  db.get(
    'SELECT * FROM sensor_logs WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1',
    [patientId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.json(null);
      let payload = {};
      if (row.raw_payload) {
        try { payload = JSON.parse(row.raw_payload); } catch (_) {}
      }
      res.json({
        ...row,
        ...payload,
        id: row.id,
        patient_id: row.patient_id,
        patientId: row.patient_id,
        timestamp: row.timestamp,
        dhtTemp: payload.dhtTemp ?? row.dht_temp,
        bmpTemp: payload.bmpTemp ?? row.bmp_temp,
        temp: payload.temp ?? row.temp,
        humidity: payload.humidity ?? row.humidity,
        pressure: payload.pressure ?? row.pressure,
        ecg: payload.ecg ?? (row.ecg_val != null ? { value: row.ecg_val, leadOffPlus: false, leadOffMinus: false, leadsConnected: true } : null),
        ecg_val: payload.ecg_val ?? row.ecg_val,
        maxFound: payload.maxFound !== false,
        maxIR: payload.maxIR ?? row.max_ir,
        maxRED: payload.maxRED ?? row.max_red,
        mq135: payload.mq135 ?? row.mq135,
        healthScore: payload.healthScore ?? row.health_score ?? 100,
        deviceStatus: payload.deviceStatus || 'ONLINE'
      });
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

// ── Real Hardware Sensor Telemetry Ingestion ──────────────────────────────────
// Device Liveness Map: deviceId -> { lastSeen, patientId, ip, status }
const deviceHeartbeats = new Map();
const devicePatientMapping = new Map(); // deviceId -> patientId
const lastDbSavePerPatient = new Map(); // patientId -> lastTimestamp

// Load initial patient-to-device mapping from database
db.all('SELECT id, device_id FROM patients WHERE device_id IS NOT NULL', [], (err, rows) => {
  if (!err && rows) {
    rows.forEach(r => {
      if (r.device_id) devicePatientMapping.set(r.device_id.trim(), r.id);
    });
  }
});

// ── AI Engine Configuration & Mapping Helpers ───────────────────────────────
// AI_ENGINE_URL env var accepts either the service base URL (preferred, e.g.
// http://127.0.0.1:5002) or the legacy full endpoint URL (http://127.0.0.1:5002/analyze).
// Trailing '/analyze' and trailing slashes are stripped so that the path is
// always appended exactly once, preventing the double-path bug /analyze/analyze.
const AI_ENGINE_BASE_URL = (process.env.AI_ENGINE_URL || 'http://127.0.0.1:5002')
  .replace(/\/analyze\/?$/, '')  // strip legacy trailing /analyze
  .replace(/\/+$/, '');          // strip any remaining trailing slashes
const AI_ENGINE_ANALYZE_URL = `${AI_ENGINE_BASE_URL}/analyze`;

/**
 * Maps backend normalized telemetry to the exact AI engine inference schema.
 * Never uses normalized.temp directly (which is in Fahrenheit).
 * Uses normalized.bmpTemp ?? normalized.dhtTemp (Celsius).
 * Does not fabricate missing sensor values.
 */
function mapToAiEngineTelemetry(normalized) {
  if (!normalized || typeof normalized !== 'object') {
    return null;
  }

  // 1. Temperature: Use Celsius (bmpTemp ?? dhtTemp). Never use normalized.temp (Fahrenheit).
  const tempC = normalized.bmpTemp ?? normalized.dhtTemp;

  // 2. Air quality alert: 1 when ALERT (or mq135Digital === 0), otherwise 0
  let airQualityAlert = 0;
  if (normalized.mq135 === 'ALERT' || normalized.mq135Digital === 0) {
    airQualityAlert = 1;
  }

  return {
    temperature_c: tempC != null ? Number(tempC) : null,
    humidity_percent: normalized.humidity != null ? Number(normalized.humidity) : null,
    pressure_hpa: normalized.pressure != null ? Number(normalized.pressure) : null,
    ecg_raw: (normalized.ecg_val ?? normalized.ecg?.value) != null ? Number(normalized.ecg_val ?? normalized.ecg?.value) : null,
    max30100_ir_raw: (normalized.maxIR ?? normalized.max30100?.rawIR) != null ? Number(normalized.maxIR ?? normalized.max30100?.rawIR) : null,
    max30100_red_raw: (normalized.maxRED ?? normalized.max30100?.rawRED) != null ? Number(normalized.maxRED ?? normalized.max30100?.rawRED) : null,
    acc_x: (normalized.accelX ?? normalized.imu?.accX) != null ? Number(normalized.accelX ?? normalized.imu?.accX) : null,
    acc_y: (normalized.accelY ?? normalized.imu?.accY) != null ? Number(normalized.accelY ?? normalized.imu?.accY) : null,
    acc_z: (normalized.accelZ ?? normalized.imu?.accZ) != null ? Number(normalized.accelZ ?? normalized.imu?.accZ) : null,
    gyro_x: (normalized.gyroX ?? normalized.imu?.gyroX) != null ? Number(normalized.gyroX ?? normalized.imu?.gyroX) : null,
    gyro_y: (normalized.gyroY ?? normalized.imu?.gyroY) != null ? Number(normalized.gyroY ?? normalized.imu?.gyroY) : null,
    gyro_z: (normalized.gyroZ ?? normalized.imu?.gyroZ) != null ? Number(normalized.gyroZ ?? normalized.imu?.gyroZ) : null,
    air_quality_alert: airQualityAlert
  };
}

/**
 * Asynchronously sends mapped telemetry to the Python AI engine for anomaly & risk inference.
 * Gracefully handles connection failures, timeouts, and missing fields.
 */
async function analyzeWithAiEngine(normalized) {
  const telemetry = mapToAiEngineTelemetry(normalized);
  if (!telemetry) {
    return { status: 'unavailable', reason: 'invalid_telemetry_payload' };
  }

  const requiredFields = [
    'temperature_c',
    'humidity_percent',
    'pressure_hpa',
    'ecg_raw',
    'max30100_ir_raw',
    'max30100_red_raw',
    'acc_x',
    'acc_y',
    'acc_z',
    'gyro_x',
    'gyro_y',
    'gyro_z',
    'air_quality_alert'
  ];

  const hasMissingOrInvalid = requiredFields.some(
    (field) => telemetry[field] === null || telemetry[field] === undefined || typeof telemetry[field] !== 'number' || !Number.isFinite(telemetry[field])
  );

  if (hasMissingOrInvalid) {
    return { status: 'unavailable', reason: 'required_telemetry_missing' };
  }

  try {
    const response = await axios.post(AI_ENGINE_ANALYZE_URL, telemetry, {
      timeout: 2000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data && typeof response.data === 'object' && typeof response.data.anomaly === 'boolean') {
      return {
        anomaly: response.data.anomaly,
        anomaly_score: response.data.anomaly_score,
        risk_level: response.data.risk_level,
        alert: response.data.alert
      };
    }

    return { status: 'unavailable', reason: 'invalid_ai_response' };
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.warn(`[AI-ENGINE] AI service offline at ${AI_ENGINE_BASE_URL}`);
    } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      console.warn(`[AI-ENGINE] Request to ${AI_ENGINE_ANALYZE_URL} timed out`);
    } else {
      console.warn(`[AI-ENGINE] AI service error: ${err.message}`);
    }

    return { status: 'unavailable', reason: 'ai_service_unavailable' };
  }
}

// Helper: Normalize incoming hardware telemetry from ESP8266 and broadcast to clients
async function ingestHardwareTelemetry(raw, clientIp = null) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid telemetry payload: must be a JSON object');
  }

  const deviceId = String(raw.deviceId || raw.device_id || 'ESP8266-001').trim();
  const deviceIp = raw.ip || raw.device_ip || clientIp || '192.168.1.1';

  // Determine Patient ID (from payload, or database mapping, or default to 1)
  let patientId = Number(raw.patientId || raw.patient_id);
  if (!patientId || isNaN(patientId)) {
    patientId = devicePatientMapping.get(deviceId) || 1;
  } else {
    devicePatientMapping.set(deviceId, patientId);
  }

  const now = Date.now();
  const timestamp = Number(raw.timestamp) && Number(raw.timestamp) > 1000000000000 ? Number(raw.timestamp) : now;

  const src = raw.sensors && typeof raw.sensors === 'object' ? { ...raw, ...raw.sensors } : raw;

  // 1. Temperature normalization (DHT11 and BMP280)
  let dhtTemp = null;
  let bmpTemp = null;
  let dhtHumidity = null;
  let bmpPressure = null;

  // Check flat keys from ESP8266 /data
  if (src.dhtTemp != null && !isNaN(src.dhtTemp)) dhtTemp = Number(Number(src.dhtTemp).toFixed(2));
  if (src.bmpTemp != null && !isNaN(src.bmpTemp)) bmpTemp = Number(Number(src.bmpTemp).toFixed(2));
  if (src.humidity != null && !isNaN(src.humidity)) dhtHumidity = Number(Number(src.humidity).toFixed(2));
  if (src.pressure != null && !isNaN(src.pressure)) bmpPressure = Number(Number(src.pressure).toFixed(2));

  // Check nested object formats
  if (src.dht11 && typeof src.dht11 === 'object') {
    if (dhtTemp == null) dhtTemp = (src.dht11.tempC ?? src.dht11.temperature) != null ? Number(src.dht11.tempC ?? src.dht11.temperature) : null;
    if (dhtHumidity == null) dhtHumidity = src.dht11.humidity != null ? Number(src.dht11.humidity) : null;
  }
  if (src.bmp280 && typeof src.bmp280 === 'object') {
    if (bmpTemp == null) bmpTemp = (src.bmp280.tempC ?? src.bmp280.temperature) != null ? Number(src.bmp280.tempC ?? src.bmp280.temperature) : null;
    if (bmpPressure == null) bmpPressure = src.bmp280.pressure != null ? Number(src.bmp280.pressure) : null;
  }

  // Clinical primary display temperature (BMP280 has higher precision, fallback to DHT11)
  let primaryTempC = bmpTemp ?? dhtTemp;
  let tempF = null;
  if (primaryTempC != null && !isNaN(primaryTempC)) {
    tempF = primaryTempC < 55 ? Number((primaryTempC * 1.8 + 32).toFixed(1)) : Number(primaryTempC.toFixed(1));
  }

  const humidity = dhtHumidity;
  const pressure = bmpPressure;

  // 2. AD8232 ECG (Analog A0 + Leads Off LO+ / LO-)
  let ecgValue = null;
  let leadOffPlus = false;
  let leadOffMinus = false;

  if (src.ecg != null && typeof src.ecg === 'object') {
    ecgValue = (src.ecg.value ?? src.ecg.ecg) != null ? Number(src.ecg.value ?? src.ecg.ecg) : null;
    leadOffPlus = Boolean(src.ecg.leadOffPlus ?? src.ecg.loPlus);
    leadOffMinus = Boolean(src.ecg.leadOffMinus ?? src.ecg.loMinus);
  } else {
    if (src.ecg != null && !isNaN(src.ecg)) ecgValue = Number(src.ecg);
    leadOffPlus = (src.loPlus === 1 || src.loPlus === true || src.leadOffPlus === true);
    leadOffMinus = (src.loMinus === 1 || src.loMinus === true || src.leadOffMinus === true);
  }

  // 3. MPU6050 / IMU 6-Axis
  const imuSrc = src.mpu6050 || src.imu || src;
  const accel = imuSrc.accel || imuSrc;
  const gyro = imuSrc.gyro || imuSrc;
  const imu = {
    accX: Number(accel.accX ?? accel.x ?? 0),
    accY: Number(accel.accY ?? accel.y ?? 0),
    accZ: Number(accel.accZ ?? accel.z ?? 0),
    gyroX: Number(gyro.gyroX ?? gyro.x ?? 0),
    gyroY: Number(gyro.gyroY ?? gyro.y ?? 0),
    gyroZ: Number(gyro.gyroZ ?? gyro.z ?? 0),
  };

  // 4. MAX30100 Pulse Oximeter: RAW OPTICAL SIGNALS ONLY (IR & RED)
  // CRITICAL REQUIREMENT: Do NOT invent fake heart rate or SpO2!
  const maxFound = Boolean(src.maxFound !== false && (src.max30100?.connected !== false));
  const maxIR = src.maxIR != null ? Number(src.maxIR) : (src.max30100?.rawIR != null ? Number(src.max30100.rawIR) : 0);
  const maxRED = src.maxRED != null ? Number(src.maxRED) : (src.max30100?.rawRED != null ? Number(src.max30100.rawRED) : 0);

  // Heart Rate & SpO2 are strictly null unless authentic physiological calculation exists
  const heartRate = null;
  const spo2 = null;

  // 5. MQ-135 Air Quality (Digital: 0 = LOW/Alert, 1 = HIGH/Normal)
  let mq135Digital = 1;
  if (src.mq135 != null) {
    mq135Digital = typeof src.mq135 === 'object' ? (src.mq135.digital ?? (src.mq135.status === 'ALERT' ? 0 : 1)) : Number(src.mq135);
  } else if (src.airQuality?.mq135 != null) {
    mq135Digital = String(src.airQuality.mq135).toUpperCase() === 'ALERT' ? 0 : 1;
  }
  const mq135Status = (mq135Digital === 0 || String(src.mq135).toUpperCase() === 'ALERT') ? 'ALERT' : 'NORMAL';

  // 6. NEO-M8N GPS
  const gpsSat = Number(src.gpsSat ?? src.gps?.satellites ?? 0);
  const gpsFix = Boolean(src.gpsFix ?? src.gps?.fix ?? (gpsSat >= 4));
  const gpsLat = src.gpsLat != null ? Number(src.gpsLat) : (src.latitude != null ? Number(src.latitude) : (src.gps?.latitude != null ? Number(src.gps.latitude) : null));
  const gpsLng = src.gpsLng != null ? Number(src.gpsLng) : (src.longitude != null ? Number(src.longitude) : (src.gps?.longitude != null ? Number(src.gps.longitude) : null));

  const gps = {
    satellites: gpsSat,
    latitude: gpsLat,
    longitude: gpsLng,
    fix: gpsFix
  };

  // 7. Blood Pressure: Hardware has NO BP sensor. Explicitly null. NEVER fabricated.
  const bpSys = null;
  const bpDia = null;

  // Calculate Health Score based on genuine available hardware telemetry
  let totalWeights = 0;
  let earnedScore = 0;

  if (tempF != null) {
    totalWeights += 40;
    if (tempF >= 97 && tempF <= 99) earnedScore += 40;
    else if (tempF >= 96 && tempF <= 100.4) earnedScore += 25;
  }

  totalWeights += 35;
  if (mq135Status === 'NORMAL') earnedScore += 35;

  totalWeights += 25;
  if (!leadOffPlus && !leadOffMinus) earnedScore += 25;

  const healthScore = totalWeights > 0 ? Math.round((earnedScore / totalWeights) * 100) : 100;

  // Track device heartbeat with IP and liveness
  deviceHeartbeats.set(deviceId, {
    lastSeen: now,
    patientId,
    ip: deviceIp,
    status: 'ONLINE'
  });

  // Construct comprehensive normalized telemetry payload
  const normalizedPayload = {
    deviceId,
    patient_id: patientId,
    patientId,
    timestamp,
    deviceStatus: 'ONLINE',
    deviceIp,
    ip: deviceIp,

    // Temperatures
    dhtTemp,
    bmpTemp,
    temp: tempF,
    temperature: {
      dht11: dhtTemp,
      bmp280: bmpTemp,
      displayF: tempF
    },

    // Environmental
    humidity,
    pressure,

    // AD8232 ECG
    ecg: {
      value: ecgValue,
      leadOffPlus,
      leadOffMinus,
      leadsConnected: !leadOffPlus && !leadOffMinus
    },
    ecg_val: ecgValue,
    leadOffPlus,
    leadOffMinus,
    loPlus: leadOffPlus ? 1 : 0,
    loMinus: leadOffMinus ? 1 : 0,

    // MAX30100 Optical Raw
    maxFound,
    maxIR,
    maxRED,
    max30100: {
      connected: maxFound,
      rawIR: maxIR,
      rawRED: maxRED,
      heartRate: null,
      spo2: null,
      statusText: maxFound ? 'Optical Sensor Online' : 'Sensor Not Detected'
    },

    // Medical Clinical Vitals
    hr: null,
    heartRate: null,
    spo2: null,
    bpSys: null,
    bpDia: null,
    bp: null,

    // Air Quality MQ-135
    mq135: mq135Status,
    mq135Digital,
    airQuality: {
      mq135: mq135Status,
      digital: mq135Digital
    },

    // 6-Axis IMU
    imu,
    accelX: imu.accX,
    accelY: imu.accY,
    accelZ: imu.accZ,
    gyroX: imu.gyroX,
    gyroY: imu.gyroY,
    gyroZ: imu.gyroZ,

    // GPS
    gps,
    gpsSat,
    gpsFix,
    gps_lat: gpsLat,
    gps_lng: gpsLng,

    healthScore
  };

  // ── AI Engine Integration ──────────────────────────────────────────────────
  normalizedPayload.ai = await analyzeWithAiEngine(normalizedPayload);

  // Instant broadcast via Socket.IO for 500ms smooth real-time dashboard updates
  io.emit('sensor_data', normalizedPayload);
  io.emit('telemetry_update', normalizedPayload);

  // Evaluate clinical & hardware safety alerts
  const alerts = [];
  if (mq135Status === 'ALERT') {
    alerts.push('⚠️ Hazardous Gas / Smoke Threshold Exceeded (MQ-135)');
  }
  if (leadOffPlus || leadOffMinus) {
    alerts.push('⚠️ ECG Leads Disconnected (AD8232 LO+/LO- Active)');
  }
  if (normalizedPayload.ai && normalizedPayload.ai.alert) {
    alerts.push(`⚠️ AI Anomaly Detected (${(normalizedPayload.ai.risk_level || 'warning').toUpperCase()} risk)`);
  }

  db.get('SELECT * FROM thresholds WHERE patient_id = ?', [patientId], (tErr, row) => {
    if (row && tempF != null && row.temp_max != null && tempF > row.temp_max) {
      alerts.push(`High Temperature: ${tempF} °F (Threshold: ${row.temp_max} °F)`);
    }

    if (alerts.length > 0) {
      db.get('SELECT name FROM patients WHERE id = ?', [patientId], (_pErr, pRow) => {
        const patientName = pRow ? pRow.name : `Patient ${patientId}`;
        console.warn(`[ALERT] Patient ${patientId} (${patientName}):`, alerts);
        io.emit('emergency_alert', {
          id: Date.now() + Math.random(),
          patient_id: patientId,
          patient_name: patientName,
          alerts,
          timestamp,
          severity: mq135Status === 'ALERT' ? 'critical' : 'warning'
        });
      });
    }

    // Persist to database with throttling (max once every 3 seconds per patient, or immediately if alert occurs)
    const shouldSaveDb = alerts.length > 0 || (now - (lastDbSavePerPatient.get(patientId) || 0) >= 3000);
    if (shouldSaveDb) {
      lastDbSavePerPatient.set(patientId, now);

      let aiRiskLevel = 'unavailable';
      let aiAnomalyScore = null;
      if (normalizedPayload.ai && typeof normalizedPayload.ai === 'object') {
        if (normalizedPayload.ai.risk_level && typeof normalizedPayload.ai.risk_level === 'string') {
          aiRiskLevel = normalizedPayload.ai.risk_level;
        }
        if (typeof normalizedPayload.ai.anomaly_score === 'number' && Number.isFinite(normalizedPayload.ai.anomaly_score)) {
          aiAnomalyScore = normalizedPayload.ai.anomaly_score;
        }
      }

      db.run(
        `INSERT INTO sensor_logs 
         (patient_id, hr, bp_sys, bp_dia, spo2, temp, health_score, humidity, pressure, ecg_val, mq135, gps_lat, gps_lng, raw_payload, timestamp, dht_temp, bmp_temp, max_ir, max_red, device_ip, ai_risk_level, ai_anomaly_score) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patientId,
          heartRate,
          bpSys,
          bpDia,
          spo2,
          tempF,
          healthScore,
          humidity,
          pressure,
          ecgValue,
          mq135Status,
          gpsLat,
          gpsLng,
          JSON.stringify(normalizedPayload),
          timestamp,
          dhtTemp,
          bmpTemp,
          maxIR,
          maxRED,
          deviceIp,
          aiRiskLevel,
          aiAnomalyScore
        ],
        (insertErr) => {
          if (insertErr) console.error('[DB] sensor_logs insert error:', insertErr.message);
        }
      );
    }
  });

  return normalizedPayload;
}

// ── Ingestion HTTP Endpoints for ESP8266 ───────────────────────────────────────
app.post(['/api/telemetry', '/api/hardware/telemetry', '/api/telemetry/esp8266'], async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const normalized = await ingestHardwareTelemetry(req.body, clientIp ? clientIp.replace('::ffff:', '') : null);
    res.json({
      success: true,
      receivedAt: Date.now(),
      deviceId: normalized.deviceId,
      patientId: normalized.patientId,
      status: 'ONLINE'
    });
  } catch (err) {
    console.error('[INGEST] Hardware telemetry ingestion rejected:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/devices — list all registered/active hardware units with patient mapping
app.get('/api/devices', (req, res) => {
  const now = Date.now();
  const devices = [];
  deviceHeartbeats.forEach((val, devId) => {
    const isOnline = now - val.lastSeen <= 10000;
    devices.push({
      deviceId: devId,
      patientId: val.patientId,
      ip: val.ip,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      lastSeen: val.lastSeen,
      secondsAgo: Math.round((now - val.lastSeen) / 1000)
    });
  });
  res.json(devices);
});

// POST /api/devices/assign — associate ESP8266 deviceId with a patientId
app.post('/api/devices/assign', (req, res) => {
  const { deviceId, patientId } = req.body;
  if (!deviceId || !patientId) {
    return res.status(400).json({ error: 'deviceId and patientId are required.' });
  }
  const pid = Number(patientId);
  const did = String(deviceId).trim();
  devicePatientMapping.set(did, pid);

  db.run('UPDATE patients SET device_id = ? WHERE id = ?', [did, pid], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deviceId: did, patientId: pid });
  });
});

// GET /api/device/status — check liveness of connected hardware
app.get('/api/device/status', (req, res) => {
  const now = Date.now();
  const devices = [];
  deviceHeartbeats.forEach((val, devId) => {
    const isOnline = now - val.lastSeen <= 10000;
    devices.push({
      deviceId: devId,
      patientId: val.patientId,
      ip: val.ip,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      lastSeen: val.lastSeen,
      secondsAgo: Math.round((now - val.lastSeen) / 1000)
    });
  });
  const primary = devices[0] || null;
  res.json({
    online: primary ? primary.status === 'ONLINE' : false,
    deviceId: primary ? primary.deviceId : (activeEspConfig.ip ? 'ESP8266-001' : null),
    ip: primary ? primary.ip : activeEspConfig.ip || null,
    lastSeen: primary ? primary.lastSeen : activeEspConfig.lastPollTime,
    secondsAgo: primary ? primary.secondsAgo : (activeEspConfig.lastPollTime ? Math.round((now - activeEspConfig.lastPollTime)/1000) : null),
    devices
  });
});

// Helper: detect local LAN IPv4 address for ESP8266 local network connection
function getLocalLanIp() {
  const ifaces = os.networkInterfaces();
  for (const dev in ifaces) {
    for (const details of ifaces[dev]) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return 'localhost';
}

// ── Background ESP8266 Poller Service ──────────────────────────────────────────
let activeEspConfig = {
  ip: process.env.ESP8266_IP || '',
  patientId: 1,
  pollingIntervalMs: 1500,
  isPolling: true,
  lastPollStatus: 'IDLE',
  lastPollError: null,
  lastPollTime: null
};

let pollIntervalTimer = null;

async function pollEsp8266() {
  if (!activeEspConfig.ip || !activeEspConfig.isPolling) return;

  let baseIp = activeEspConfig.ip.trim();
  if (!baseIp.startsWith('http://') && !baseIp.startsWith('https://')) {
    baseIp = 'http://' + baseIp;
  }
  let targetUrl = baseIp;
  if (!targetUrl.endsWith('/data')) {
    targetUrl = targetUrl.replace(/\/+$/, '') + '/data';
  }

  try {
    const response = await axios.get(targetUrl, { timeout: 2500 });
    if (response.data && typeof response.data === 'object') {
      activeEspConfig.lastPollStatus = 'SUCCESS';
      activeEspConfig.lastPollError = null;
      activeEspConfig.lastPollTime = Date.now();

      const clientIp = activeEspConfig.ip.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
      const payload = {
        ...response.data,
        patientId: activeEspConfig.patientId || 1,
        ip: response.data.ip || clientIp
      };
      await ingestHardwareTelemetry(payload, clientIp);
    }
  } catch (err) {
    activeEspConfig.lastPollStatus = 'ERROR';
    activeEspConfig.lastPollError = err.message;
    activeEspConfig.lastPollTime = Date.now();
  }
}

function startEspPoller() {
  if (pollIntervalTimer) clearInterval(pollIntervalTimer);
  if (activeEspConfig.ip && activeEspConfig.isPolling) {
    console.log(`[POLLER] Started polling ESP8266 at ${activeEspConfig.ip} every ${activeEspConfig.pollingIntervalMs}ms`);
    pollEsp8266();
    pollIntervalTimer = setInterval(pollEsp8266, activeEspConfig.pollingIntervalMs);
  }
}

// GET /api/hardware/config — retrieve active ESP8266 polling and ingestion configuration
app.get('/api/hardware/config', (req, res) => {
  const lanIp = getLocalLanIp();
  res.json({
    ...activeEspConfig,
    localLanIp: lanIp,
    lanIngestionUrl: `http://${lanIp}:${PORT}/api/telemetry/esp8266`,
    localIngestionUrl: `http://localhost:${PORT}/api/telemetry/esp8266`
  });
});

// POST /api/hardware/config — dynamically configure ESP8266 IP address and options
app.post('/api/hardware/config', async (req, res) => {
  const { ip, patientId, pollingIntervalMs, isPolling } = req.body;
  if (ip !== undefined) activeEspConfig.ip = String(ip).trim();
  if (patientId !== undefined) activeEspConfig.patientId = Number(patientId) || 1;
  if (pollingIntervalMs !== undefined) activeEspConfig.pollingIntervalMs = Math.max(500, Number(pollingIntervalMs) || 1500);
  if (isPolling !== undefined) activeEspConfig.isPolling = Boolean(isPolling);

  startEspPoller();
  
  if (activeEspConfig.ip) {
    await pollEsp8266();
  }

  const lanIp = getLocalLanIp();
  res.json({
    success: true,
    config: {
      ...activeEspConfig,
      localLanIp: lanIp,
      lanIngestionUrl: `http://${lanIp}:${PORT}/api/telemetry/esp8266`
    }
  });
});

// POST /api/hardware/test-pulse — send a test telemetry packet adhering to real hardware schema
app.post('/api/hardware/test-pulse', async (req, res) => {
  const testPayload = {
    ip: activeEspConfig.ip || '192.168.1.105',
    deviceId: 'ESP8266-001',
    patientId: activeEspConfig.patientId || 1,
    dhtTemp: 28.5,
    humidity: 62.0,
    bmpTemp: 28.3,
    pressure: 1008.4,
    ecg: 512,
    loPlus: 0,
    loMinus: 0,
    mq135: 1,
    accX: 120,
    accY: -30,
    accZ: 16320,
    gyroX: 5,
    gyroY: -2,
    gyroZ: 1,
    maxFound: 1,
    maxIR: 18432,
    maxRED: 15200,
    gpsSat: 8,
    gpsFix: 1,
    ...req.body
  };
  const normalized = await ingestHardwareTelemetry(testPayload, testPayload.ip);
  res.json({ success: true, telemetry: normalized });
});

// Socket.IO Connection & Hardware Ingestion
io.on('connection', (socket) => {
  console.log('[SOCKET] Client connected:', socket.id);

  // Allow hardware or simulators to ingest via Socket.IO
  socket.on('hardware_telemetry', async (data, ack) => {
    try {
      const normalized = await ingestHardwareTelemetry(data);
      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] Client disconnected:', socket.id);
  });
});

// Background 2-second monitor for hardware device timeout (> 10s silent)
setInterval(() => {
  const now = Date.now();
  deviceHeartbeats.forEach((val, devId) => {
    if (now - val.lastSeen > 10000 && val.reportedOnline !== false) {
      val.reportedOnline = false;
      console.warn(`[WATCHDOG] Hardware Device ${devId} went OFFLINE (>10s silent)`);
      
      io.emit('emergency_alert', {
        id: `device-offline-${devId}-${now}`,
        patient_id: val.patientId,
        patientId: val.patientId,
        patient_name: 'Paired Patient',
        metric: 'Hardware Connectivity',
        value: 'OFFLINE',
        message: `Hardware Sensor Unit (${devId}) Disconnected / Offline (>10s)`,
        alerts: [`⚠️ Hardware Sensor Unit (${devId}) Disconnected / Offline (>10s)`],
        severity: 'warning',
        timestamp: now
      });
      io.emit('sensor_data', {
        deviceId: devId,
        patient_id: val.patientId,
        patientId: val.patientId,
        deviceStatus: 'OFFLINE',
        timestamp: now
      });
      io.emit('device_status', {
        deviceId: devId,
        patientId: val.patientId,
        status: 'OFFLINE',
        lastSeen: val.lastSeen
      });
    }
  });
}, 2000);

server.listen(PORT, () => {
  const lanIp = getLocalLanIp();
  console.log(`====================================================`);
  console.log(` SWASTHYAEDGE Backend Server running on port ${PORT}`);
  console.log(` Local Ingestion URL:     http://localhost:${PORT}/api/telemetry/esp8266`);
  console.log(` Wi-Fi LAN Ingestion URL: http://${lanIp}:${PORT}/api/telemetry/esp8266`);
  console.log(`====================================================`);
  startEspPoller();
});
