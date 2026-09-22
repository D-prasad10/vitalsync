require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');
const axios = require('axios');
const os = require('os');
const db = require('./database');
const {
  isValidCoordinates,
  haversineDistance,
  calculateETA,
  calculateProgress,
  AmbulanceSimulatorService
} = require('./ambulanceSimulator');

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
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const ambulanceSimulator = new AmbulanceSimulatorService(db, io);
ambulanceSimulator.start();

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

  const processRows = (rows) => {
    const enriched = (rows || []).map(r => {
      let payload = {};
      if (r.raw_payload) {
        try { payload = JSON.parse(r.raw_payload); } catch (_) {}
      }
      const sys = payload.bpSys ?? payload.bp_sys ?? r.bp_sys ?? null;
      const dia = payload.bpDia ?? payload.bp_dia ?? r.bp_dia ?? null;
      const heartRate = payload.hr ?? payload.heartRate ?? payload.heart_rate ?? r.hr ?? null;
      const oxygen = payload.spo2 ?? r.spo2 ?? null;
      const temperature = payload.temp ?? payload.temperature ?? r.temp ?? null;
      const press = payload.bmpPress ?? payload.pressure ?? r.pressure ?? null;

      return {
        ...r,
        ...payload,
        id: r.id,
        patient_id: r.patient_id,
        patientId: r.patient_id,
        timestamp: r.timestamp,
        hr: heartRate,
        heartRate,
        pulse: heartRate,
        spo2: oxygen,
        bpSys: sys,
        bp_sys: sys,
        bpDia: dia,
        bp_dia: dia,
        bp: (sys != null && dia != null) ? `${sys}/${dia}` : null,
        temp: temperature,
        temperature,
        dhtTemp: payload.dhtTemp ?? r.dht_temp,
        bmpTemp: payload.bmpTemp ?? r.bmp_temp,
        pressure: press,
        bmpPress: press,
        humidity: payload.humidity ?? r.humidity,
        ecg: payload.ecg ?? (r.ecg_val != null ? { value: r.ecg_val, leadOffPlus: false, leadOffMinus: false, leadsConnected: true } : null),
        ecg_val: payload.ecg_val ?? r.ecg_val,
        maxFound: payload.maxFound !== false,
        maxIR: payload.maxIR ?? r.max_ir,
        maxRED: payload.maxRED ?? r.max_red,
        mq135: payload.mq135 ?? r.mq135,
        latitude: payload.latitude ?? payload.gpsLat ?? payload.gps?.latitude ?? r.gps_lat ?? null,
        longitude: payload.longitude ?? payload.gpsLng ?? payload.gps?.longitude ?? r.gps_lng ?? null,
        gpsLat: payload.latitude ?? payload.gpsLat ?? payload.gps?.latitude ?? r.gps_lat ?? null,
        gpsLng: payload.longitude ?? payload.gpsLng ?? payload.gps?.longitude ?? r.gps_lng ?? null,
        gpsFix: Boolean(payload.gpsFix ?? payload.gps?.fix ?? (r.gps_lat && r.gps_lng)),
        gpsSat: Number(payload.gpsSat ?? payload.gps?.satellites ?? (r.gps_lat && r.gps_lng ? 8 : 0)),
        healthScore: payload.healthScore ?? payload.health_score ?? r.health_score ?? 100,
        health_score: payload.healthScore ?? payload.health_score ?? r.health_score ?? 100,
        deviceStatus: payload.deviceStatus || 'ONLINE'
      };
    });
    res.json(enriched);
  };

  // Support limit parameter: ?limit=all for full report ranges, or number of recent points (default 80)
  const isAll = req.query.limit === 'all';
  const limit = isAll ? 5000 : (Math.min(500, Math.max(10, parseInt(req.query.limit, 10) || 80)));

  if (isAll) {
    db.all(
      'SELECT * FROM sensor_logs WHERE patient_id = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT ?',
      [patientId, sevenDaysAgo, limit],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        processRows(rows || []);
      }
    );
  } else {
    // Default fast query: get the most recent N points in chronological order
    db.all(
      'SELECT * FROM (SELECT * FROM sensor_logs WHERE patient_id = ? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC',
      [patientId, limit],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        processRows(rows || []);
      }
    );
  }
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
      const sys = payload.bpSys ?? payload.bp_sys ?? row.bp_sys ?? null;
      const dia = payload.bpDia ?? payload.bp_dia ?? row.bp_dia ?? null;
      const heartRate = payload.hr ?? payload.heartRate ?? payload.heart_rate ?? row.hr ?? null;
      const oxygen = payload.spo2 ?? row.spo2 ?? null;
      const temperature = payload.temp ?? payload.temperature ?? row.temp ?? null;
      const press = payload.bmpPress ?? payload.pressure ?? row.pressure ?? null;

      res.json({
        ...row,
        ...payload,
        id: row.id,
        patient_id: row.patient_id,
        patientId: row.patient_id,
        timestamp: row.timestamp,
        hr: heartRate,
        heartRate,
        pulse: heartRate,
        spo2: oxygen,
        bpSys: sys,
        bp_sys: sys,
        bpDia: dia,
        bp_dia: dia,
        bp: (sys != null && dia != null) ? `${sys}/${dia}` : null,
        temp: temperature,
        temperature,
        dhtTemp: payload.dhtTemp ?? row.dht_temp,
        bmpTemp: payload.bmpTemp ?? row.bmp_temp,
        pressure: press,
        bmpPress: press,
        humidity: payload.humidity ?? row.humidity,
        ecg: payload.ecg ?? (row.ecg_val != null ? { value: row.ecg_val, leadOffPlus: false, leadOffMinus: false, leadsConnected: true } : null),
        ecg_val: payload.ecg_val ?? row.ecg_val,
        maxFound: payload.maxFound !== false,
        maxIR: payload.maxIR ?? row.max_ir,
        maxRED: payload.maxRED ?? row.max_red,
        mq135: payload.mq135 ?? row.mq135,
        latitude: payload.latitude ?? payload.gpsLat ?? payload.gps?.latitude ?? row.gps_lat ?? null,
        longitude: payload.longitude ?? payload.gpsLng ?? payload.gps?.longitude ?? row.gps_lng ?? null,
        gpsLat: payload.latitude ?? payload.gpsLat ?? payload.gps?.latitude ?? row.gps_lat ?? null,
        gpsLng: payload.longitude ?? payload.gpsLng ?? payload.gps?.longitude ?? row.gps_lng ?? null,
        gpsFix: Boolean(payload.gpsFix ?? payload.gps?.fix ?? (row.gps_lat && row.gps_lng)),
        gpsSat: Number(payload.gpsSat ?? payload.gps?.satellites ?? (row.gps_lat && row.gps_lng ? 8 : 0)),
        healthScore: payload.healthScore ?? payload.health_score ?? row.health_score ?? 100,
        health_score: payload.healthScore ?? payload.health_score ?? row.health_score ?? 100,
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

// In-memory active alerts cache
const activeAlerts = new Map();

function recordActiveAlert(alertObj) {
  if (!alertObj || !alertObj.id) return;
  activeAlerts.set(alertObj.id, alertObj);
  if (activeAlerts.size > 50) {
    const firstKey = activeAlerts.keys().next().value;
    activeAlerts.delete(firstKey);
  }
  db.run(
    `INSERT OR REPLACE INTO alerts (id, patient_id, patient_name, severity, message, alerts, timestamp, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      alertObj.id,
      alertObj.patient_id || alertObj.patientId,
      alertObj.patient_name || alertObj.patientName,
      alertObj.severity || 'warning',
      alertObj.message || (alertObj.alerts ? alertObj.alerts.join(' • ') : 'Threshold alert'),
      JSON.stringify(alertObj.alerts || []),
      alertObj.timestamp || Date.now(),
      alertObj.status || 'active'
    ],
    () => {}
  );
}

// Pre-load active alerts from database on startup
db.all('SELECT * FROM alerts WHERE status = "active" ORDER BY timestamp DESC LIMIT 20', [], (err, rows) => {
  if (!err && rows) {
    rows.forEach(r => {
      let alertsArr = [];
      try { alertsArr = JSON.parse(r.alerts); } catch (_) { alertsArr = [r.message]; }
      activeAlerts.set(r.id, {
        ...r,
        patientId: r.patient_id,
        patientName: r.patient_name,
        alerts: alertsArr
      });
    });
  }
});

// Load initial patient-to-device mapping from database
db.all('SELECT id, device_id FROM patients WHERE device_id IS NOT NULL', [], (err, rows) => {
  if (!err && rows) {
    rows.forEach(r => {
      if (r.device_id) devicePatientMapping.set(r.device_id.trim(), r.id);
    });
  }
});

// Helper: Normalize incoming hardware telemetry from ESP8266 and broadcast to clients
function ingestHardwareTelemetry(raw, clientIp = null) {
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

  // 4. MAX30100 Pulse Oximeter: RAW OPTICAL SIGNALS & Clinical Vitals
  const maxFound = Boolean(src.maxFound !== false && (src.max30100?.connected !== false));
  const maxIR = src.maxIR != null ? Number(src.maxIR) : (src.max30100?.rawIR != null ? Number(src.max30100.rawIR) : 0);
  const maxRED = src.maxRED != null ? Number(src.maxRED) : (src.max30100?.rawRED != null ? Number(src.max30100.rawRED) : 0);

  // Accept physiological calculation or incoming telemetry readings
  const heartRate = (src.hr ?? src.heartRate ?? src.heart_rate ?? src.pulse) != null
    ? Number(src.hr ?? src.heartRate ?? src.heart_rate ?? src.pulse)
    : null;
  const spo2 = (src.spo2 ?? src.oxygen) != null
    ? Number(src.spo2 ?? src.oxygen)
    : null;

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

  // 7. Blood Pressure: Accept if present from telemetry, or null
  const bpSys = (src.bpSys ?? src.bp_sys ?? src.systolic) != null
    ? Number(src.bpSys ?? src.bp_sys ?? src.systolic)
    : null;
  const bpDia = (src.bpDia ?? src.bp_dia ?? src.diastolic) != null
    ? Number(src.bpDia ?? src.bp_dia ?? src.diastolic)
    : null;

  // Calculate Health Score based on genuine available physiological & hardware telemetry
  let totalWeights = 0;
  let earnedScore = 0;

  if (heartRate != null) {
    totalWeights += 25;
    if (heartRate >= 60 && heartRate <= 100) earnedScore += 25;
    else if ((heartRate >= 50 && heartRate < 60) || (heartRate > 100 && heartRate <= 120)) earnedScore += 12;
  }
  if (spo2 != null) {
    totalWeights += 25;
    if (spo2 >= 95) earnedScore += 25;
    else if (spo2 >= 90) earnedScore += 12;
  }
  if (bpSys != null) {
    totalWeights += 25;
    if (bpSys >= 90 && bpSys <= 120) earnedScore += 25;
    else if ((bpSys >= 80 && bpSys < 90) || (bpSys > 120 && bpSys <= 140)) earnedScore += 12;
  }
  if (tempF != null) {
    totalWeights += 25;
    if (tempF >= 97 && tempF <= 99) earnedScore += 25;
    else if (tempF >= 96 && tempF <= 100.4) earnedScore += 12;
  }

  if (totalWeights === 0) {
    totalWeights = 100;
    earnedScore = 100;
    if (mq135Status === 'ALERT') earnedScore -= 40;
    if (leadOffPlus || leadOffMinus) earnedScore -= 30;
  } else {
    if (mq135Status === 'ALERT') earnedScore = Math.max(0, earnedScore - 25);
    if (leadOffPlus || leadOffMinus) earnedScore = Math.max(0, earnedScore - 15);
  }

  const healthScore = Math.min(100, Math.max(0, Math.round((earnedScore / totalWeights) * 100)));

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
    bmpPress: pressure,

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
      heartRate,
      spo2,
      statusText: maxFound ? 'Optical Sensor Online' : 'Sensor Not Detected'
    },

    // Medical Clinical Vitals
    hr: heartRate,
    heartRate,
    pulse: heartRate,
    spo2,
    bpSys,
    bp_sys: bpSys,
    bpDia,
    bp_dia: bpDia,
    bp: (bpSys != null && bpDia != null) ? `${bpSys}/${bpDia}` : null,

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
    latitude: gpsLat,
    longitude: gpsLng,

    healthScore,
    health_score: healthScore
  };

  // Instant broadcast via Socket.IO for 500ms smooth real-time dashboard updates
  io.emit('sensor_data', normalizedPayload);
  io.emit('telemetry_update', normalizedPayload);

  // Broadcast GPS updates if fix is present and coordinates valid
  if (gpsFix && isValidCoordinates(gpsLat, gpsLng)) {
    io.emit('patient:location', {
      patientId,
      patient_id: patientId,
      latitude: gpsLat,
      longitude: gpsLng,
      gpsFix: true,
      gpsSat,
      timestamp
    });
  }

  // Evaluate clinical & hardware safety alerts
  const alerts = [];
  let severity = 'warning';

  if (mq135Status === 'ALERT') {
    alerts.push('⚠️ Hazardous Gas / Smoke Threshold Exceeded (MQ-135)');
    severity = 'critical';
  }
  if (leadOffPlus || leadOffMinus) {
    alerts.push('⚠️ ECG Leads Disconnected (AD8232 LO+/LO- Active)');
  }

  db.get('SELECT * FROM thresholds WHERE patient_id = ?', [patientId], (tErr, row) => {
    if (row) {
      if (tempF != null && row.temp_max != null && tempF > row.temp_max) {
        alerts.push(`High Temperature: ${tempF} °F (Threshold: ${row.temp_max} °F)`);
        if (tempF > 102) severity = 'critical';
      }
      if (heartRate != null) {
        if (row.hr_max != null && heartRate > row.hr_max) {
          alerts.push(`High Heart Rate: ${heartRate} BPM (Threshold: ${row.hr_max} BPM)`);
          if (heartRate > 120) severity = 'critical';
        }
        if (row.hr_min != null && heartRate < row.hr_min) {
          alerts.push(`Low Heart Rate: ${heartRate} BPM (Threshold: ${row.hr_min} BPM)`);
          if (heartRate < 45) severity = 'critical';
        }
      }
      if (spo2 != null && row.spo2_min != null && spo2 < row.spo2_min) {
        alerts.push(`Low SpO2: ${spo2}% (Threshold: ${row.spo2_min}%)`);
        if (spo2 < 90) severity = 'critical';
      }
      if (bpSys != null && row.bp_sys_max != null && bpSys > row.bp_sys_max) {
        alerts.push(`High Systolic BP: ${bpSys} mmHg (Threshold: ${row.bp_sys_max} mmHg)`);
        if (bpSys > 150) severity = 'critical';
      }
      if (bpDia != null && row.bp_dia_max != null && bpDia > row.bp_dia_max) {
        alerts.push(`High Diastolic BP: ${bpDia} mmHg (Threshold: ${row.bp_dia_max} mmHg)`);
        if (bpDia > 95) severity = 'critical';
      }
    }

    if (alerts.length > 0) {
      db.get('SELECT name FROM patients WHERE id = ?', [patientId], (_pErr, pRow) => {
        const patientName = pRow ? pRow.name : `Patient ${patientId}`;
        const alertId = `alert-${patientId}-${Date.now()}`;
        const alertObj = {
          id: alertId,
          patient_id: patientId,
          patientId: patientId,
          patient_name: patientName,
          patientName: patientName,
          alerts,
          message: alerts.join(' • '),
          timestamp,
          severity,
          status: 'active'
        };

        recordActiveAlert(alertObj);

        console.warn(`[ALERT] Patient ${patientId} (${patientName}):`, alerts);
        io.emit('emergency_alert', alertObj);
      });
    }

    // Persist to database with throttling (max once every 3 seconds per patient, or immediately if alert occurs)
    const shouldSaveDb = alerts.length > 0 || (now - (lastDbSavePerPatient.get(patientId) || 0) >= 3000);
    if (shouldSaveDb) {
      lastDbSavePerPatient.set(patientId, now);
      db.run(
        `INSERT INTO sensor_logs 
         (patient_id, hr, bp_sys, bp_dia, spo2, temp, health_score, humidity, pressure, ecg_val, mq135, gps_lat, gps_lng, raw_payload, timestamp, dht_temp, bmp_temp, max_ir, max_red, device_ip) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          deviceIp
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
app.post(['/api/telemetry', '/api/hardware/telemetry', '/api/telemetry/esp8266'], (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const normalized = ingestHardwareTelemetry(req.body, clientIp ? clientIp.replace('::ffff:', '') : null);
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

// GET /api/alerts — retrieve active and recent emergency alerts
app.get('/api/alerts', (req, res) => {
  db.all('SELECT * FROM alerts WHERE status = "active" ORDER BY timestamp DESC LIMIT 20', [], (err, rows) => {
    if (err || !rows || rows.length === 0) {
      const list = Array.from(activeAlerts.values()).filter(a => a.status !== 'dismissed');
      return res.json(list);
    }
    const parsed = rows.map(r => {
      let alertsArr = [];
      try { alertsArr = JSON.parse(r.alerts); } catch (_) { alertsArr = [r.message]; }
      return {
        ...r,
        patientId: r.patient_id,
        patientName: r.patient_name,
        alerts: alertsArr
      };
    });
    res.json(parsed);
  });
});

// POST /api/alerts/:id/dismiss — dismiss an active alert
app.post('/api/alerts/:id/dismiss', (req, res) => {
  const alertId = req.params.id;
  if (activeAlerts.has(alertId)) {
    const a = activeAlerts.get(alertId);
    a.status = 'dismissed';
  }
  db.run('UPDATE alerts SET status = "dismissed" WHERE id = ?', [alertId], () => {
    res.json({ success: true });
  });
});

// POST /api/alerts/clear — clear all active alerts
app.post('/api/alerts/clear', (req, res) => {
  activeAlerts.clear();
  db.run('UPDATE alerts SET status = "dismissed" WHERE status = "active"', () => {
    res.json({ success: true });
  });
});

// ── Emergency & Ambulance Tracking REST Endpoints ────────────────────────────

// GET /api/emergencies — retrieve all emergencies
app.get('/api/emergencies', (req, res) => {
  db.all(
    `SELECT e.*, p.room_number, p.gender, p.age, p.guardian_contact,
            a.name as ambulance_name, a.status as ambulance_status,
            a.latitude as ambulance_lat, a.longitude as ambulance_lng,
            a.is_simulated as ambulance_is_simulated
     FROM emergencies e
     LEFT JOIN patients p ON e.patient_id = p.id
     LEFT JOIN ambulances a ON e.ambulance_id = a.id
     ORDER BY e.updated_at DESC LIMIT 50`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const mapped = (rows || []).map(r => ({
        ...r,
        patientId: r.patient_id,
        patientName: r.patient_name,
        emergencyType: r.emergency_type,
        ambulanceId: r.ambulance_id,
        gpsFix: Boolean(r.gps_fix),
        gpsSat: r.gps_sat,
        initialDistance: r.initial_distance,
        currentDistance: r.current_distance,
        estimatedEta: r.estimated_eta_minutes,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
      res.json(mapped);
    }
  );
});

// GET /api/emergencies/active — retrieve current active emergency
app.get('/api/emergencies/active', (req, res) => {
  db.get(
    `SELECT e.*, p.room_number, p.gender, p.age, p.guardian_contact,
            a.name as ambulance_name, a.status as ambulance_status,
            a.latitude as ambulance_lat, a.longitude as ambulance_lng,
            a.is_simulated as ambulance_is_simulated
     FROM emergencies e
     LEFT JOIN patients p ON e.patient_id = p.id
     LEFT JOIN ambulances a ON e.ambulance_id = a.id
     WHERE e.status IN ('CREATED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED')
     ORDER BY e.updated_at DESC LIMIT 1`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.json(null);
      res.json({
        ...row,
        patientId: row.patient_id,
        patientName: row.patient_name,
        emergencyType: row.emergency_type,
        ambulanceId: row.ambulance_id,
        gpsFix: Boolean(row.gps_fix),
        gpsSat: row.gps_sat,
        initialDistance: row.initial_distance,
        currentDistance: row.current_distance,
        estimatedEta: row.estimated_eta_minutes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }
  );
});

// POST /api/emergencies — create a new emergency
app.post('/api/emergencies', (req, res) => {
  const {
    patientId,
    emergencyType = 'SOS',
    notes = '',
    latitude = null,
    longitude = null,
    gpsFix = false,
    gpsSat = 0,
    ambulanceId = null
  } = req.body;

  if (!patientId) {
    return res.status(400).json({ error: 'Patient ID is required.' });
  }

  db.get('SELECT * FROM patients WHERE id = ?', [patientId], (pErr, patient) => {
    if (pErr || !patient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const patientName = patient.name;
    const now = Date.now();
    const emgId = `EMG-${now.toString().slice(-6)}`;

    // Validate coordinates
    const hasValidCoords = Boolean(gpsFix) && isValidCoordinates(latitude, longitude);
    const validLat = hasValidCoords ? Number(latitude) : null;
    const validLng = hasValidCoords ? Number(longitude) : null;
    const validGpsFix = hasValidCoords ? 1 : 0;
    const validGpsSat = hasValidCoords ? Number(gpsSat || 8) : 0;

    const finalizeCreation = (selectedAmb) => {
      const ambId = selectedAmb ? selectedAmb.id : (ambulanceId || null);
      let initialDist = 0;
      let currentDist = 0;
      let eta = 0;
      let progress = 0;

      if (selectedAmb && hasValidCoords && isValidCoordinates(selectedAmb.latitude, selectedAmb.longitude)) {
        initialDist = haversineDistance(selectedAmb.latitude, selectedAmb.longitude, validLat, validLng);
        currentDist = initialDist;
        eta = calculateETA(currentDist);
        progress = calculateProgress(initialDist, currentDist);
      }

      const initialStatus = ambId ? 'EN_ROUTE' : 'CREATED';

      db.run(
        `INSERT INTO emergencies 
         (id, patient_id, patient_name, emergency_type, status, latitude, longitude, gps_fix, gps_sat, ambulance_id, initial_distance, current_distance, estimated_eta_minutes, progress, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emgId,
          patient.id,
          patientName,
          emergencyType.toUpperCase(),
          initialStatus,
          validLat,
          validLng,
          validGpsFix,
          validGpsSat,
          ambId,
          initialDist,
          currentDist,
          eta,
          progress,
          notes || `${emergencyType} Emergency Triggered`,
          now,
          now
        ],
        (insErr) => {
          if (insErr) return res.status(500).json({ error: insErr.message });

          if (ambId) {
            db.run(
              `UPDATE ambulances SET status = 'EN_ROUTE', assigned_patient_id = ?, assigned_emergency_id = ?, updated_at = ? WHERE id = ?`,
              [patient.id, emgId, now, ambId]
            );
          }

          const emgObj = {
            id: emgId,
            patient_id: patient.id,
            patientId: patient.id,
            patient_name: patientName,
            patientName,
            emergency_type: emergencyType.toUpperCase(),
            emergencyType: emergencyType.toUpperCase(),
            status: initialStatus,
            latitude: validLat,
            longitude: validLng,
            gps_fix: validGpsFix,
            gpsFix: Boolean(validGpsFix),
            gps_sat: validGpsSat,
            gpsSat: validGpsSat,
            ambulance_id: ambId,
            ambulanceId: ambId,
            ambulance_name: selectedAmb ? selectedAmb.name : null,
            ambulance_lat: selectedAmb ? selectedAmb.latitude : null,
            ambulance_lng: selectedAmb ? selectedAmb.longitude : null,
            ambulance_is_simulated: selectedAmb ? Boolean(selectedAmb.is_simulated) : true,
            initial_distance: initialDist,
            initialDistance: initialDist,
            current_distance: currentDist,
            currentDistance: currentDist,
            estimated_eta_minutes: eta,
            estimatedEta: eta,
            progress,
            notes: notes || `${emergencyType} Emergency Triggered`,
            room_number: patient.room_number,
            gender: patient.gender,
            age: patient.age,
            created_at: now,
            updated_at: now
          };

          // Integrate with existing emergency alert system
          const alertMsg = `EMERGENCY [${emergencyType.toUpperCase()}]: ${patientName} (Room ${patient.room_number || 'N/A'})${ambId ? ` — ${ambId} Dispatched` : ''}`;
          const alertObj = {
            id: `alert-emg-${emgId}`,
            patient_id: patient.id,
            patientId: patient.id,
            patient_name: patientName,
            patientName,
            severity: 'critical',
            message: alertMsg,
            alerts: [alertMsg],
            timestamp: now,
            status: 'active'
          };

          recordActiveAlert(alertObj);

          io.emit('emergency:created', emgObj);
          io.emit('emergency_alert', alertObj);
          if (ambId) {
            io.emit('ambulance:status', {
              ambulanceId: ambId,
              status: 'EN_ROUTE',
              assignedPatientId: patient.id,
              assignedEmergencyId: emgId,
              updatedAt: now
            });
          }

          res.json({ success: true, emergency: emgObj });
        }
      );
    };

    if (ambulanceId) {
      db.get('SELECT * FROM ambulances WHERE id = ?', [ambulanceId], (aErr, amb) => {
        finalizeCreation(amb || null);
      });
    } else {
      // Auto-assign first available unit
      db.get("SELECT * FROM ambulances WHERE status = 'AVAILABLE' LIMIT 1", [], (aErr, amb) => {
        finalizeCreation(amb || null);
      });
    }
  });
});

// PUT /api/emergencies/:id/status — update emergency status
app.put('/api/emergencies/:id/status', (req, res) => {
  const emgId = req.params.id;
  const { status, notes } = req.body;
  const now = Date.now();

  const allowed = ['CREATED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'CANCELLED'];
  if (!status || !allowed.includes(status.toUpperCase())) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
  }

  const upperStatus = status.toUpperCase();

  db.get('SELECT * FROM emergencies WHERE id = ?', [emgId], (err, emg) => {
    if (err || !emg) return res.status(404).json({ error: 'Emergency not found.' });

    let progress = emg.progress;
    let eta = emg.estimated_eta_minutes;
    let dist = emg.current_distance;

    if (upperStatus === 'ARRIVED') {
      progress = 100;
      eta = 0;
      dist = 0;
    } else if (upperStatus === 'COMPLETED' || upperStatus === 'CANCELLED') {
      progress = upperStatus === 'COMPLETED' ? 100 : progress;
    }

    db.run(
      `UPDATE emergencies 
       SET status = ?, progress = ?, estimated_eta_minutes = ?, current_distance = ?, notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [upperStatus, progress, eta, dist, notes, now, emgId],
      (uErr) => {
        if (uErr) return res.status(500).json({ error: uErr.message });

        if (emg.ambulance_id) {
          let ambStatus = 'AVAILABLE';
          let clearAssignments = false;

          if (upperStatus === 'ASSIGNED') ambStatus = 'ASSIGNED';
          else if (upperStatus === 'EN_ROUTE') ambStatus = 'EN_ROUTE';
          else if (upperStatus === 'ARRIVED') ambStatus = 'ARRIVED';
          else if (upperStatus === 'COMPLETED' || upperStatus === 'CANCELLED') {
            ambStatus = 'AVAILABLE';
            clearAssignments = true;
          }

          db.run(
            `UPDATE ambulances 
             SET status = ?, assigned_patient_id = ?, assigned_emergency_id = ?, updated_at = ?
             WHERE id = ?`,
            [
              ambStatus,
              clearAssignments ? null : emg.patient_id,
              clearAssignments ? null : emgId,
              now,
              emg.ambulance_id
            ]
          );

          io.emit('ambulance:status', {
            ambulanceId: emg.ambulance_id,
            status: ambStatus,
            updatedAt: now
          });
        }

        const updated = {
          ...emg,
          patientId: emg.patient_id,
          patientName: emg.patient_name,
          emergencyType: emg.emergency_type,
          ambulanceId: emg.ambulance_id,
          gpsFix: Boolean(emg.gps_fix),
          gpsSat: emg.gps_sat,
          initialDistance: emg.initial_distance,
          currentDistance: dist,
          estimatedEta: eta,
          status: upperStatus,
          progress,
          notes: notes || emg.notes,
          updated_at: now
        };

        if (upperStatus === 'COMPLETED' || upperStatus === 'CANCELLED') {
          const emgAlertId = `alert-emg-${emgId}`;
          if (activeAlerts.has(emgAlertId)) {
            activeAlerts.get(emgAlertId).status = 'dismissed';
          }
          db.run('UPDATE alerts SET status = "dismissed" WHERE id = ?', [emgAlertId], () => {
            const currentAlerts = Array.from(activeAlerts.values()).filter(a => a.status !== 'dismissed');
            io.emit('active_alerts', currentAlerts);
          });
        }

        io.emit('emergency:updated', updated);
        res.json({ success: true, emergency: updated });
      }
    );
  });
});

// GET /api/ambulances — retrieve ambulance fleet
app.get('/api/ambulances', (req, res) => {
  db.all(
    `SELECT a.*, e.patient_name as assigned_patient_name, e.emergency_type, e.current_distance, e.estimated_eta_minutes, e.progress
     FROM ambulances a
     LEFT JOIN emergencies e ON a.assigned_emergency_id = e.id
     ORDER BY a.id ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const enriched = (rows || []).map(a => ({
        ...a,
        ambulanceId: a.id,
        isSimulated: Boolean(a.is_simulated)
      }));
      res.json(enriched);
    }
  );
});

// POST /api/ambulances/:id/dispatch — dispatch specific ambulance to emergency
app.post('/api/ambulances/:id/dispatch', (req, res) => {
  const ambulanceId = req.params.id;
  const { emergencyId } = req.body;
  const now = Date.now();

  db.get('SELECT * FROM ambulances WHERE id = ?', [ambulanceId], (aErr, amb) => {
    if (aErr || !amb) return res.status(404).json({ error: 'Ambulance not found.' });

    db.get('SELECT * FROM emergencies WHERE id = ?', [emergencyId], (eErr, emg) => {
      if (eErr || !emg) return res.status(404).json({ error: 'Emergency not found.' });

      let dist = 0;
      if (isValidCoordinates(amb.latitude, amb.longitude) && isValidCoordinates(emg.latitude, emg.longitude)) {
        dist = haversineDistance(amb.latitude, amb.longitude, emg.latitude, emg.longitude);
      }
      const initialDist = emg.initial_distance || dist;
      const eta = calculateETA(dist);
      const prog = calculateProgress(initialDist, dist);

      db.run(
        `UPDATE emergencies 
         SET ambulance_id = ?, status = 'EN_ROUTE', initial_distance = ?, current_distance = ?, estimated_eta_minutes = ?, progress = ?, updated_at = ?
         WHERE id = ?`,
        [ambulanceId, initialDist, dist, eta, prog, now, emergencyId]
      );

      db.run(
        `UPDATE ambulances 
         SET status = 'EN_ROUTE', assigned_patient_id = ?, assigned_emergency_id = ?, updated_at = ?
         WHERE id = ?`,
        [emg.patient_id, emergencyId, now, ambulanceId]
      );

      const updatedAmbulance = {
        ...amb,
        status: 'EN_ROUTE',
        assigned_emergency_id: emergencyId,
        assigned_patient_id: emg.patient_id,
        updated_at: now
      };

      const updatedEmg = {
        ...emg,
        ambulance_id: ambulanceId,
        ambulanceId: ambulanceId,
        status: 'EN_ROUTE',
        current_distance: dist,
        currentDistance: dist,
        estimated_eta_minutes: eta,
        estimatedEta: eta,
        progress: prog,
        updated_at: now
      };

      io.emit('ambulance:status', { ambulanceId, status: 'EN_ROUTE', updatedAt: now });
      io.emit('emergency:updated', updatedEmg);

      res.json({ success: true, ambulance: updatedAmbulance, emergency: updatedEmg });
    });
  });
});

// POST /api/ambulances/:id/location — update ambulance coordinates
app.post('/api/ambulances/:id/location', (req, res) => {
  const ambulanceId = req.params.id;
  const { latitude, longitude } = req.body;
  const now = Date.now();

  if (!isValidCoordinates(latitude, longitude)) {
    return res.status(400).json({ error: 'Invalid latitude or longitude.' });
  }

  const numLat = Number(latitude);
  const numLng = Number(longitude);

  db.run(
    `UPDATE ambulances SET latitude = ?, longitude = ?, updated_at = ? WHERE id = ?`,
    [numLat, numLng, now, ambulanceId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get('SELECT * FROM emergencies WHERE ambulance_id = ? AND status = "EN_ROUTE"', [ambulanceId], (eErr, emg) => {
        let dist = 0;
        let eta = 0;
        let prog = 0;

        if (emg && isValidCoordinates(emg.latitude, emg.longitude)) {
          dist = haversineDistance(numLat, numLng, emg.latitude, emg.longitude);
          const initialDist = emg.initial_distance || dist;
          eta = calculateETA(dist);
          prog = calculateProgress(initialDist, dist);

          db.run(
            `UPDATE emergencies SET current_distance = ?, estimated_eta_minutes = ?, progress = ?, updated_at = ? WHERE id = ?`,
            [dist, eta, prog, now, emg.id]
          );

          io.emit('emergency:updated', {
            ...emg,
            current_distance: dist,
            currentDistance: dist,
            estimated_eta_minutes: eta,
            estimatedEta: eta,
            progress: prog,
            updated_at: now
          });
        }

        const payload = {
          ambulanceId,
          latitude: numLat,
          longitude: numLng,
          distance: dist,
          eta,
          progress: prog,
          updatedAt: now
        };

        io.emit('ambulance:location', payload);
        res.json({ success: true, location: payload });
      });
    }
  );
});

// POST /api/ambulances/simulator/toggle — toggle simulator running state
app.post('/api/ambulances/simulator/toggle', (req, res) => {
  const isRunning = ambulanceSimulator.toggle();
  res.json({ success: true, isRunning });
});

// POST /api/ambulances/simulator/step — manually advance simulator step
app.post('/api/ambulances/simulator/step', async (req, res) => {
  await ambulanceSimulator.tick();
  res.json({ success: true, message: 'Simulator advanced 1 step.' });
});

// POST /api/ambulances/simulator/reset — reset ambulances to starting coordinates
app.post('/api/ambulances/simulator/reset', (req, res) => {
  const now = Date.now();
  db.run(`UPDATE ambulances SET latitude = 20.3002, longitude = 85.8150, status = 'AVAILABLE', assigned_patient_id = NULL, assigned_emergency_id = NULL, updated_at = ? WHERE id = 'AMB-001'`, [now]);
  db.run(`UPDATE ambulances SET latitude = 20.2850, longitude = 85.8350, status = 'AVAILABLE', assigned_patient_id = NULL, assigned_emergency_id = NULL, updated_at = ? WHERE id = 'AMB-002'`, [now]);
  db.run(`UPDATE ambulances SET latitude = 20.3120, longitude = 85.8200, status = 'AVAILABLE', assigned_patient_id = NULL, assigned_emergency_id = NULL, updated_at = ? WHERE id = 'AMB-003'`, [now]);
  db.all('SELECT * FROM ambulances', [], (err, rows) => {
    io.emit('ambulance:status', { reset: true });
    res.json({ success: true, ambulances: rows });
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
      ingestHardwareTelemetry(payload, clientIp);
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
app.post('/api/hardware/test-pulse', (req, res) => {
  const testPayload = {
    ip: activeEspConfig.ip || '192.168.1.105',
    deviceId: 'ESP8266-001',
    patientId: activeEspConfig.patientId || 1,
    hr: 76,
    spo2: 98,
    bpSys: 122,
    bpDia: 78,
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
  const normalized = ingestHardwareTelemetry(testPayload, testPayload.ip);
  res.json({ success: true, telemetry: normalized });
});

// Socket.IO Connection & Hardware Ingestion
io.on('connection', (socket) => {
  console.log('[SOCKET] Client connected:', socket.id);

  // Synchronize active alerts to newly connected clients
  const currentAlerts = Array.from(activeAlerts.values()).filter(a => a.status !== 'dismissed');
  socket.emit('active_alerts', currentAlerts);

  // Synchronize active emergency to newly connected clients
  db.get(
    `SELECT e.*, p.room_number, p.gender, p.age,
            a.name as ambulance_name, a.status as ambulance_status,
            a.latitude as ambulance_lat, a.longitude as ambulance_lng,
            a.is_simulated as ambulance_is_simulated
     FROM emergencies e
     LEFT JOIN patients p ON e.patient_id = p.id
     LEFT JOIN ambulances a ON e.ambulance_id = a.id
     WHERE e.status IN ('CREATED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED')
     ORDER BY e.updated_at DESC LIMIT 1`,
    [],
    (err, activeEmg) => {
      if (!err && activeEmg) {
        socket.emit('emergency:active', {
          ...activeEmg,
          patientId: activeEmg.patient_id,
          patientName: activeEmg.patient_name,
          emergencyType: activeEmg.emergency_type,
          ambulanceId: activeEmg.ambulance_id,
          gpsFix: Boolean(activeEmg.gps_fix),
          gpsSat: activeEmg.gps_sat,
          initialDistance: activeEmg.initial_distance,
          currentDistance: activeEmg.current_distance,
          estimatedEta: activeEmg.estimated_eta_minutes
        });
      } else {
        socket.emit('emergency:active', null);
      }
    }
  );

  // Allow hardware or simulators to ingest via Socket.IO
  socket.on('hardware_telemetry', (data, ack) => {
    try {
      const normalized = ingestHardwareTelemetry(data);
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
      
      const offlineAlert = {
        id: `device-offline-${devId}-${now}`,
        patient_id: val.patientId,
        patientId: val.patientId,
        patient_name: 'Paired Patient',
        metric: 'Hardware Connectivity',
        value: 'OFFLINE',
        message: `Hardware Sensor Unit (${devId}) Disconnected / Offline (>10s)`,
        alerts: [`⚠️ Hardware Sensor Unit (${devId}) Disconnected / Offline (>10s)`],
        severity: 'warning',
        timestamp: now,
        status: 'active'
      };
      recordActiveAlert(offlineAlert);

      io.emit('emergency_alert', offlineAlert);
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
