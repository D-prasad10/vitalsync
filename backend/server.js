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

const { authenticate, requireRole } = require('./middleware/auth.middleware');
const authRoutes = require('./routes/auth.routes');

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

// Mount Authentication routes (/api/auth/send-otp, /api/auth/verify-otp, /api/auth/me)
app.use(authRoutes);

// ── Staff Management Endpoints ──────────────────────────────────────────────────

// GET /api/staff — list all staff (Requires authentication)
app.get('/api/staff', authenticate, (req, res) => {
  db.all('SELECT id, staff_id, role, name, mobile, email FROM staff', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error retrieving staff list.' });
    res.json(rows);
  });
});

// POST /api/staff — add a new staff member (Requires doctor or staff admin role)
app.post('/api/staff', authenticate, requireRole('doctor', 'staff'), (req, res) => {
  const { staff_id, role, name, mobile, email } = req.body || {};
  if (!staff_id || !role || !name || !mobile || !email) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const VALID_ROLES = ['doctor', 'caretaker', 'staff', 'patient'];
  const normalizedRole = String(role).toLowerCase().trim();
  if (!VALID_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ error: `Invalid role "${role}". Allowed roles: ${VALID_ROLES.join(', ')}` });
  }

  db.run(
    'INSERT INTO staff (staff_id, role, name, mobile, email) VALUES (?, ?, ?, ?, ?)',
    [String(staff_id).trim(), normalizedRole, String(name).trim(), String(mobile).trim(), String(email).trim().toLowerCase()],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: `Staff ID "${staff_id}" already exists.` });
        return res.status(500).json({ error: 'Failed to create staff member.' });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// DELETE /api/staff/:id — remove a staff member (Requires doctor or staff admin role)
app.delete('/api/staff/:id', authenticate, requireRole('doctor', 'staff'), (req, res) => {
  db.run('DELETE FROM staff WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete staff member.' });
    res.json({ success: true, changes: this.changes });
  });
});

// ── Patient API Endpoints (Mounted via patient.routes.js) ─────────────────────
const patientRoutes = require('./routes/patient.routes');
app.use(patientRoutes);

// ── Modular Services & Routers ────────────────────────────────────────────────
const alertService = require('./services/alert.service');
const aiService = require('./services/ai.service');
const deviceService = require('./services/device.service');
const telemetryService = require('./services/telemetry.service');
const { getLocalLanIp } = require('./utils/network');
const { errorHandler } = require('./middleware/errorHandler.middleware');

const telemetryRoutes = require('./routes/telemetry.routes');
const deviceRoutes = require('./routes/device.routes');
const alertRoutes = require('./routes/alert.routes');
const aiRoutes = require('./routes/ai.routes');

// Initialize Services with Socket.IO instance
alertService.init(io);
aiService.init(io);
telemetryService.init(io);
deviceService.init(io, alertService, (payload, clientIp) => {
  return telemetryService.processTelemetry(payload, clientIp);
});

// Mount modular routes
app.set('port', PORT);
app.use(telemetryRoutes);
app.use(deviceRoutes);
app.use(alertRoutes);
app.use(aiRoutes);

// ── Active Alerts Cache & Helpers ─────────────────────────────────────────────
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
      const mapped = (rows || []).map(a => ({
        ...a,
        ambulanceId: a.id,
        isSimulated: Boolean(a.is_simulated)
      }));
      res.json(mapped);
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

// ── Socket.IO Connection & Real-Time Sync ────────────────────────────────────
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

  // Allow clients (e.g. patient details page) to subscribe to patient-specific room
  socket.on('join_patient', (patientId) => {
    if (patientId) {
      const room = `patient:${patientId}`;
      socket.join(room);
      console.log(`[SOCKET] ${socket.id} joined room ${room}`);
    }
  });

  socket.on('leave_patient', (patientId) => {
    if (patientId) {
      const room = `patient:${patientId}`;
      socket.leave(room);
      console.log(`[SOCKET] ${socket.id} left room ${room}`);
    }
  });

  // Allow hardware or simulators to ingest via Socket.IO
  socket.on('hardware_telemetry', async (data, ack) => {
    try {
      const normalized = await telemetryService.processTelemetry(data);
      if (typeof ack === 'function') ack({ success: true, telemetry: normalized });
    } catch (err) {
      if (typeof ack === 'function') ack({ error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] Client disconnected:', socket.id);
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Start Server if executed directly
if (require.main === module) {
  server.listen(PORT, () => {
    const lanIp = getLocalLanIp();
    console.log(`====================================================`);
    console.log(` SWASTHYAEDGE Backend Server running on port ${PORT}`);
    console.log(` Local Ingestion URL:     http://localhost:${PORT}/api/telemetry/esp8266`);
    console.log(` Wi-Fi LAN Ingestion URL: http://${lanIp}:${PORT}/api/telemetry/esp8266`);
    console.log(`====================================================`);
  });
}

module.exports = { app, server, io, deviceService, telemetryService, alertService, aiService, ambulanceSimulator };
