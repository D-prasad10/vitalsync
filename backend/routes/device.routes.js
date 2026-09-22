const express = require('express');
const router = express.Router();
const deviceService = require('../services/device.service');
const telemetryService = require('../services/telemetry.service');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

const getPort = (req) => {
  return process.env.PORT || req.app.get('port') || 5001;
};

// GET /api/devices — list all registered/active hardware units with patient mapping
router.get('/api/devices', authenticate, (req, res) => {
  res.json(deviceService.getDevices());
});

// POST /api/devices/assign — associate ESP8266 deviceId with a patientId
router.post('/api/devices/assign', authenticate, requireRole('doctor', 'caretaker', 'staff'), async (req, res, next) => {
  try {
    const { deviceId, patientId } = req.body || {};

    // Validate deviceId: must be a non-empty string
    if (!deviceId || typeof deviceId !== 'string' || !String(deviceId).trim()) {
      return res.status(400).json({ error: 'deviceId must be a non-empty string.' });
    }

    // Validate patientId: must be a finite positive integer (reject NaN, Infinity, objects, arrays)
    const pidNum = Number(patientId);
    if (
      patientId === undefined ||
      patientId === null ||
      typeof patientId === 'object' ||
      !Number.isFinite(pidNum) ||
      !Number.isInteger(pidNum) ||
      pidNum <= 0
    ) {
      return res.status(400).json({ error: 'patientId must be a positive integer.' });
    }

    const result = await deviceService.assignDevice(String(deviceId).trim(), pidNum);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// GET /api/device/status — check liveness of connected hardware (requires authentication)
router.get('/api/device/status', authenticate, (req, res) => {
  res.json(deviceService.getDeviceStatus());
});

// GET /api/hardware/config — retrieve active ESP8266 polling and ingestion configuration
// Public: ESP8266 devices need this for self-discovery without credentials
router.get('/api/hardware/config', (req, res) => {
  res.json(deviceService.getHardwareConfig(getPort(req)));
});

// POST /api/hardware/config — dynamically configure ESP8266 IP address and options
router.post('/api/hardware/config', authenticate, requireRole('doctor', 'staff'), async (req, res, next) => {
  try {
    const result = await deviceService.updateHardwareConfig(req.body, getPort(req));
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /api/hardware/test-pulse — send a test telemetry packet adhering to real hardware schema
// Only whitelisted fields from req.body are merged (patientId override) to prevent injection.
router.post('/api/hardware/test-pulse', authenticate, async (req, res, next) => {
  try {
    // Validate optional patientId override
    const bodyPatientId = (req.body || {}).patientId;
    let resolvedPatientId = deviceService.activeEspConfig.patientId || 1;
    if (bodyPatientId !== undefined) {
      const pidNum = Number(bodyPatientId);
      if (!Number.isFinite(pidNum) || !Number.isInteger(pidNum) || pidNum <= 0) {
        return res.status(400).json({ error: 'patientId must be a positive integer.' });
      }
      resolvedPatientId = pidNum;
    }

    // Fixed hardware-schema test payload — only patientId can be overridden from body
    const testPayload = {
      ip: deviceService.activeEspConfig.ip || '192.168.1.105',
      deviceId: 'ESP8266-001',
      patientId: resolvedPatientId,
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
      gpsFix: 1
    };

    const normalized = await telemetryService.processTelemetry(testPayload, testPayload.ip);
    res.json({ success: true, telemetry: normalized });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
