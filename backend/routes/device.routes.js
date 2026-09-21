const express = require('express');
const router = express.Router();
const deviceService = require('../services/device.service');
const telemetryService = require('../services/telemetry.service');

const getPort = (req) => {
  return process.env.PORT || req.app.get('port') || 5001;
};

// GET /api/devices — list all registered/active hardware units with patient mapping
router.get('/api/devices', (req, res) => {
  res.json(deviceService.getDevices());
});

// POST /api/devices/assign — associate ESP8266 deviceId with a patientId
router.post('/api/devices/assign', async (req, res, next) => {
  try {
    const { deviceId, patientId } = req.body;
    if (!deviceId || !patientId) {
      return res.status(400).json({ error: 'deviceId and patientId are required.' });
    }
    const result = await deviceService.assignDevice(deviceId, patientId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/device/status — check liveness of connected hardware
router.get('/api/device/status', (req, res) => {
  res.json(deviceService.getDeviceStatus());
});

// GET /api/hardware/config — retrieve active ESP8266 polling and ingestion configuration
router.get('/api/hardware/config', (req, res) => {
  res.json(deviceService.getHardwareConfig(getPort(req)));
});

// POST /api/hardware/config — dynamically configure ESP8266 IP address and options
router.post('/api/hardware/config', async (req, res, next) => {
  try {
    const result = await deviceService.updateHardwareConfig(req.body, getPort(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/hardware/test-pulse — send a test telemetry packet adhering to real hardware schema
router.post('/api/hardware/test-pulse', async (req, res, next) => {
  try {
    const testPayload = {
      ip: deviceService.activeEspConfig.ip || '192.168.1.105',
      deviceId: 'ESP8266-001',
      patientId: deviceService.activeEspConfig.patientId || 1,
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

    const normalized = await telemetryService.processTelemetry(testPayload, testPayload.ip);
    res.json({ success: true, telemetry: normalized });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
