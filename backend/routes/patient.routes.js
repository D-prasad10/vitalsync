const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'N/A', 'UNKNOWN', 'NOT SPECIFIED'];

/**
 * Validates that an ID is a positive integer.
 */
function isValidId(id) {
  const num = Number(id);
  return Number.isInteger(num) && num > 0;
}

// ── GET /api/patients — List all patients ─────────────────────────────────────
router.get('/api/patients', authenticate, async (req, res) => {
  try {
    const rows = await db.allAsync('SELECT * FROM patients ORDER BY id ASC');
    res.json(rows || []);
  } catch {
    res.status(500).json({ error: 'Database error retrieving patients.' });
  }
});

// ── GET /api/patients/:id — Get a single patient profile ──────────────────────
router.get('/api/patients/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  const patientId = Number(id);
  try {
    const row = await db.getAsync('SELECT * FROM patients WHERE id = ?', [patientId]);
    if (!row) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Database error retrieving patient.' });
  }
});

// ── POST /api/patients — Register a new patient ──────────────────────────────
router.post('/api/patients', authenticate, requireRole('doctor', 'caretaker', 'staff'), async (req, res) => {
  const {
    name,
    age,
    gender,
    blood_group,
    weight,
    mobile,
    guardian_contact,
    room_number
  } = req.body || {};

  // Validate Name (required, non-empty, 2-100 characters)
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Patient name is required.' });
  }
  const cleanName = name.trim();
  if (cleanName.length < 2 || cleanName.length > 100) {
    return res.status(400).json({ error: 'Patient name must be between 2 and 100 characters.' });
  }

  // Validate Age (optional, but if provided must be an integer 0..150)
  let cleanAge = null;
  if (age !== undefined && age !== null && age !== '') {
    const numAge = Number(age);
    if (!Number.isInteger(numAge) || numAge < 0 || numAge > 150) {
      return res.status(400).json({ error: 'Age must be an integer between 0 and 150.' });
    }
    cleanAge = numAge;
  }

  // Validate Weight (optional, but if provided must be a positive number 0..500)
  let cleanWeight = 0.0;
  if (weight !== undefined && weight !== null && weight !== '') {
    const numWeight = Number(weight);
    if (Number.isNaN(numWeight) || numWeight < 0 || numWeight > 500) {
      return res.status(400).json({ error: 'Weight must be a positive number up to 500 kg.' });
    }
    cleanWeight = numWeight;
  }

  // Validate Blood Group
  let cleanBloodGroup = 'N/A';
  if (blood_group !== undefined && blood_group !== null && blood_group !== '') {
    if (typeof blood_group !== 'string') {
      return res.status(400).json({ error: 'Invalid blood group format.' });
    }
    const bgUpper = blood_group.trim().toUpperCase();
    if (!VALID_BLOOD_GROUPS.includes(bgUpper)) {
      return res.status(400).json({ error: `Invalid blood group. Allowed values: ${VALID_BLOOD_GROUPS.slice(0, 8).join(', ')}` });
    }
    cleanBloodGroup = bgUpper;
  }

  // Validate Mobile (optional, but if given must be 10 digits or 'N/A')
  let cleanMobile = 'N/A';
  if (mobile !== undefined && mobile !== null && mobile !== '') {
    if (typeof mobile !== 'string' && typeof mobile !== 'number') {
      return res.status(400).json({ error: 'Invalid mobile number format.' });
    }
    const mobileStr = String(mobile).trim();
    if (mobileStr !== 'N/A') {
      const digits = mobileStr.replace(/\D/g, '');
      if (digits.length !== 10) {
        return res.status(400).json({ error: 'Mobile number must be a 10-digit number.' });
      }
      cleanMobile = digits;
    }
  }

  const cleanGender = gender && typeof gender === 'string' ? gender.trim() : 'Not Specified';
  const cleanGuardian = guardian_contact && typeof guardian_contact === 'string' ? guardian_contact.trim() : 'N/A';
  const cleanRoom = room_number && typeof room_number === 'string' ? room_number.trim() : null;

  try {
    // Duplicate check: prevent registering identical patient with same name and mobile
    if (cleanMobile !== 'N/A') {
      const existing = await db.getAsync(
        'SELECT id FROM patients WHERE LOWER(name) = LOWER(?) AND mobile = ?',
        [cleanName, cleanMobile]
      );
      if (existing) {
        return res.status(409).json({ error: `Patient "${cleanName}" with mobile ${cleanMobile} already exists.` });
      }
    }

    // Parameterized Insert
    const insertRes = await db.runAsync(
      `INSERT INTO patients (name, age, gender, blood_group, weight, mobile, guardian_contact, room_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cleanName, cleanAge, cleanGender, cleanBloodGroup, cleanWeight, cleanMobile, cleanGuardian, cleanRoom]
    );

    const newPatientId = insertRes.lastID;

    // Provision default safety thresholds
    try {
      await db.runAsync('INSERT INTO thresholds (patient_id) VALUES (?)', [newPatientId]);
    } catch {
      // Threshold already exists or non-fatal
    }

    const createdPatient = await db.getAsync('SELECT * FROM patients WHERE id = ?', [newPatientId]);
    res.status(201).json({ success: true, patient: createdPatient });
  } catch {
    res.status(500).json({ error: 'Failed to register patient.' });
  }
});

// ── PUT /api/patients/:id — Update existing patient ──────────────────────────
router.put('/api/patients/:id', authenticate, requireRole('doctor', 'caretaker', 'staff'), async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  const patientId = Number(id);

  try {
    // Check if patient exists
    const existing = await db.getAsync('SELECT * FROM patients WHERE id = ?', [patientId]);
    if (!existing) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const body = req.body || {};

    // Validate Name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return res.status(400).json({ error: 'Patient name cannot be empty.' });
      }
      if (body.name.trim().length < 2 || body.name.trim().length > 100) {
        return res.status(400).json({ error: 'Patient name must be between 2 and 100 characters.' });
      }
    }

    // Validate Age if provided
    if (body.age !== undefined && body.age !== null && body.age !== '') {
      const numAge = Number(body.age);
      if (!Number.isInteger(numAge) || numAge < 0 || numAge > 150) {
        return res.status(400).json({ error: 'Age must be an integer between 0 and 150.' });
      }
    }

    // Validate Weight if provided
    if (body.weight !== undefined && body.weight !== null && body.weight !== '') {
      const numWeight = Number(body.weight);
      if (Number.isNaN(numWeight) || numWeight < 0 || numWeight > 500) {
        return res.status(400).json({ error: 'Weight must be a positive number up to 500 kg.' });
      }
    }

    // Validate Blood Group if provided
    if (body.blood_group !== undefined && body.blood_group !== null && body.blood_group !== '') {
      if (typeof body.blood_group !== 'string') {
        return res.status(400).json({ error: 'Invalid blood group format.' });
      }
      const bgUpper = body.blood_group.trim().toUpperCase();
      if (!VALID_BLOOD_GROUPS.includes(bgUpper)) {
        return res.status(400).json({ error: `Invalid blood group. Allowed values: ${VALID_BLOOD_GROUPS.slice(0, 8).join(', ')}` });
      }
    }

    // Validate Mobile if provided
    if (body.mobile !== undefined && body.mobile !== null && body.mobile !== '') {
      if (typeof body.mobile !== 'string' && typeof body.mobile !== 'number') {
        return res.status(400).json({ error: 'Invalid mobile number format.' });
      }
      const mStr = String(body.mobile).trim();
      if (mStr !== 'N/A' && mStr !== '') {
        const digits = mStr.replace(/\D/g, '');
        if (digits.length !== 10) {
          return res.status(400).json({ error: 'Mobile number must be a 10-digit number.' });
        }
      }
    }

    // Merge only non-undefined fields to prevent wiping existing data
    const updated = {
      name: body.name !== undefined ? body.name.trim() : existing.name,
      age: body.age !== undefined ? (body.age !== '' && body.age !== null ? Number(body.age) : null) : existing.age,
      gender: body.gender !== undefined ? String(body.gender).trim() : existing.gender,
      blood_group: body.blood_group !== undefined ? String(body.blood_group).trim().toUpperCase() : existing.blood_group,
      weight: body.weight !== undefined ? (body.weight !== '' && body.weight !== null ? Number(body.weight) : null) : existing.weight,
      mobile: body.mobile !== undefined ? String(body.mobile).trim() : existing.mobile,
      guardian_contact: body.guardian_contact !== undefined ? String(body.guardian_contact).trim() : existing.guardian_contact,
      photo: body.photo !== undefined ? body.photo : existing.photo,
      doctor_name: body.doctor_name !== undefined ? String(body.doctor_name).trim() : existing.doctor_name,
      doctor_phone: body.doctor_phone !== undefined ? String(body.doctor_phone).trim() : existing.doctor_phone,
      room_number: body.room_number !== undefined ? String(body.room_number).trim() : existing.room_number,
      doctor_specialization: body.doctor_specialization !== undefined ? String(body.doctor_specialization).trim() : existing.doctor_specialization,
      doctor_email: body.doctor_email !== undefined ? String(body.doctor_email).trim().toLowerCase() : existing.doctor_email
    };

    // Parameterized update (protected internal field 'id' cannot be modified)
    await db.runAsync(
      `UPDATE patients
       SET name = ?, age = ?, gender = ?, blood_group = ?, weight = ?, mobile = ?,
           guardian_contact = ?, photo = ?, doctor_name = ?, doctor_phone = ?,
           room_number = ?, doctor_specialization = ?, doctor_email = ?
       WHERE id = ?`,
      [
        updated.name, updated.age, updated.gender, updated.blood_group, updated.weight,
        updated.mobile, updated.guardian_contact, updated.photo, updated.doctor_name,
        updated.doctor_phone, updated.room_number, updated.doctor_specialization,
        updated.doctor_email, patientId
      ]
    );

    const resultPatient = await db.getAsync('SELECT * FROM patients WHERE id = ?', [patientId]);
    res.json({ success: true, changes: 1, patient: resultPatient });
  } catch {
    res.status(500).json({ error: 'Failed to update patient.' });
  }
});

// ── GET /api/patients/:id/history — 7-day telemetry history ───────────────────
router.get('/api/patients/:id/history', authenticate, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  const patientId = Number(id);

  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const rows = await db.allAsync(
      'SELECT * FROM sensor_logs WHERE patient_id = ? AND timestamp > ? ORDER BY timestamp ASC',
      [patientId, sevenDaysAgo]
    );

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
  } catch {
    res.status(500).json({ error: 'Database error retrieving patient history.' });
  }
});

// ── GET /api/patients/:id/latest — Most recent telemetry point ───────────────
router.get('/api/patients/:id/latest', authenticate, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  const patientId = Number(id);

  try {
    const row = await db.getAsync(
      'SELECT * FROM sensor_logs WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1',
      [patientId]
    );

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
  } catch {
    res.status(500).json({ error: 'Database error retrieving latest telemetry.' });
  }
});

// ── GET /api/patients/:id/thresholds — Get thresholds ────────────────────────
router.get('/api/patients/:id/thresholds', authenticate, async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  const patientId = Number(id);

  try {
    const row = await db.getAsync('SELECT * FROM thresholds WHERE patient_id = ?', [patientId]);
    res.json(row || {});
  } catch {
    res.status(500).json({ error: 'Database error retrieving patient thresholds.' });
  }
});

// ── POST /api/patients/:id/thresholds — Update thresholds (Doctor Only) ──────
router.post('/api/patients/:id/thresholds', authenticate, requireRole('doctor'), async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  const patientId = Number(id);

  try {
    const patient = await db.getAsync('SELECT id FROM patients WHERE id = ?', [patientId]);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { hr_max, hr_min, bp_sys_max, bp_dia_max, spo2_min, temp_max } = req.body || {};

    // Validate numeric thresholds if provided
    if (hr_max !== undefined && hr_max !== null && (Number.isNaN(Number(hr_max)) || Number(hr_max) < 30 || Number(hr_max) > 250)) {
      return res.status(400).json({ error: 'hr_max must be a number between 30 and 250 BPM.' });
    }
    if (hr_min !== undefined && hr_min !== null && (Number.isNaN(Number(hr_min)) || Number(hr_min) < 30 || Number(hr_min) > 250)) {
      return res.status(400).json({ error: 'hr_min must be a number between 30 and 250 BPM.' });
    }
    if (spo2_min !== undefined && spo2_min !== null && (Number.isNaN(Number(spo2_min)) || Number(spo2_min) < 50 || Number(spo2_min) > 100)) {
      return res.status(400).json({ error: 'spo2_min must be a number between 50 and 100%.' });
    }
    if (temp_max !== undefined && temp_max !== null && (Number.isNaN(Number(temp_max)) || Number(temp_max) < 90 || Number(temp_max) > 115)) {
      return res.status(400).json({ error: 'temp_max must be a number between 90 and 115 °F.' });
    }

    await db.runAsync(
      `INSERT INTO thresholds (patient_id, hr_max, hr_min, bp_sys_max, bp_dia_max, spo2_min, temp_max)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_id) DO UPDATE SET
         hr_max = excluded.hr_max,
         hr_min = excluded.hr_min,
         bp_sys_max = excluded.bp_sys_max,
         bp_dia_max = excluded.bp_dia_max,
         spo2_min = excluded.spo2_min,
         temp_max = excluded.temp_max`,
      [
        patientId,
        hr_max !== undefined ? Number(hr_max) : null,
        hr_min !== undefined ? Number(hr_min) : null,
        bp_sys_max !== undefined ? Number(bp_sys_max) : null,
        bp_dia_max !== undefined ? Number(bp_dia_max) : null,
        spo2_min !== undefined ? Number(spo2_min) : null,
        temp_max !== undefined ? Number(temp_max) : null
      ]
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update patient thresholds.' });
  }
});

module.exports = router;
