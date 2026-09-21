const express = require('express');
const router = express.Router();
const { validateTelemetryPayload } = require('../middleware/telemetryValidator');
const telemetryService = require('../services/telemetry.service');

const telemetryHandler = async (req, res, next) => {
  try {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientIp = rawIp ? String(rawIp).replace('::ffff:', '') : null;

    const normalized = await telemetryService.processTelemetry(req.body, clientIp);

    res.json({
      success: true,
      receivedAt: Date.now(),
      deviceId: normalized.deviceId,
      patientId: normalized.patientId,
      status: 'ONLINE'
    });
  } catch (err) {
    next(err);
  }
};

// Primary ingestion endpoint for ESP8266
router.post('/api/telemetry/esp8266', validateTelemetryPayload, telemetryHandler);

// Backward-compatible ingestion endpoints
router.post('/api/telemetry', validateTelemetryPayload, telemetryHandler);
router.post('/api/hardware/telemetry', validateTelemetryPayload, telemetryHandler);

module.exports = router;
