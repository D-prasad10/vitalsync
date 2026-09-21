require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');
const axios = require('axios');
const os = require('os');
const db = require('./database');

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
    methods: ['GET', 'POST']
  }
});

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

// Socket.IO Connection & Hardware Ingestion
io.on('connection', (socket) => {
  console.log('[SOCKET] Client connected:', socket.id);

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

module.exports = { app, server, io, deviceService, telemetryService, alertService, aiService };

