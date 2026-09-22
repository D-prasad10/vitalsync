/**
 * Telemetry Validation Middleware for SWASTHYAEDGE ESP8266 Telemetry Ingestion.
 *
 * Validates incoming payload format, identity headers/fields, and numeric ranges.
 * Rejects malformed requests with HTTP 400.
 */

function isFiniteNumber(val) {
  if (val === null || val === undefined) return false;
  const num = Number(val);
  return typeof num === 'number' && !Number.isNaN(num) && Number.isFinite(num);
}

function validateTelemetryPayload(req, res, next) {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      error: 'Invalid telemetry payload: Request body must be a valid JSON object.'
    });
  }

  // 1. Validate device identity
  const deviceId = (body.deviceId || body.device_id);
  if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
    return res.status(400).json({
      error: 'Invalid telemetry payload: Valid "deviceId" is required.'
    });
  }

  // 2. Validate patient identity if provided
  const patientIdRaw = body.patientId ?? body.patient_id;
  if (patientIdRaw !== undefined && patientIdRaw !== null) {
    if (!isFiniteNumber(patientIdRaw) || Number(patientIdRaw) <= 0) {
      return res.status(400).json({
        error: 'Invalid telemetry payload: "patientId" must be a positive number.'
      });
    }
  }

  // 3. Validate timestamp if provided
  if (body.timestamp !== undefined && body.timestamp !== null) {
    if (!isFiniteNumber(body.timestamp) || Number(body.timestamp) < 0) {
      return res.status(400).json({
        error: 'Invalid telemetry payload: "timestamp" must be a valid non-negative epoch number.'
      });
    }
  }

  // 4. Validate sensor numeric fields (from flat body or nested body.sensors)
  const src = body.sensors && typeof body.sensors === 'object' && !Array.isArray(body.sensors)
    ? { ...body, ...body.sensors }
    : body;

  const numericFields = [
    'dhtTemp',
    'bmpTemp',
    'temp',
    'humidity',
    'pressure',
    'accX',
    'accY',
    'accZ',
    'gyroX',
    'gyroY',
    'gyroZ',
    'maxIR',
    'maxRED',
    'gpsSat',
    'gpsLat',
    'gpsLng'
  ];

  for (const field of numericFields) {
    if (src[field] !== undefined && src[field] !== null) {
      if (!isFiniteNumber(src[field])) {
        return res.status(400).json({
          error: `Invalid telemetry payload: Field "${field}" must be a valid numeric value.`
        });
      }
    }
  }

  // ECG can be a number or an object { value, leadOffPlus, leadOffMinus }
  if (src.ecg !== undefined && src.ecg !== null) {
    if (typeof src.ecg === 'object' && !Array.isArray(src.ecg)) {
      const val = src.ecg.value ?? src.ecg.ecg;
      if (val !== undefined && val !== null && !isFiniteNumber(val)) {
        return res.status(400).json({
          error: 'Invalid telemetry payload: "ecg.value" must be a valid number.'
        });
      }
    } else if (!isFiniteNumber(src.ecg)) {
      return res.status(400).json({
        error: 'Invalid telemetry payload: "ecg" must be a valid numeric analog reading or ECG object.'
      });
    }
  }

  // Lead-off indicators must be boolean or numeric 0/1 if provided
  for (const leadField of ['loPlus', 'loMinus', 'leadOffPlus', 'leadOffMinus']) {
    if (src[leadField] !== undefined && src[leadField] !== null) {
      const v = src[leadField];
      if (typeof v !== 'boolean' && v !== 0 && v !== 1 && v !== '0' && v !== '1') {
        return res.status(400).json({
          error: `Invalid telemetry payload: "${leadField}" must be a boolean or 0/1 indicator.`
        });
      }
    }
  }

  // MQ135 indicator can be numeric 0/1 or string 'ALERT'/'NORMAL'
  if (src.mq135 !== undefined && src.mq135 !== null) {
    if (typeof src.mq135 === 'object' && !Array.isArray(src.mq135)) {
      // nested format ok
    } else if (typeof src.mq135 === 'string') {
      const upper = src.mq135.trim().toUpperCase();
      if (upper !== 'ALERT' && upper !== 'NORMAL' && !isFiniteNumber(src.mq135)) {
        return res.status(400).json({
          error: 'Invalid telemetry payload: "mq135" must be a digital 0/1 or "ALERT"/"NORMAL".'
        });
      }
    } else if (!isFiniteNumber(src.mq135)) {
      return res.status(400).json({
        error: 'Invalid telemetry payload: "mq135" must be a digital 0/1 status.'
      });
    }
  }

  next();
}

module.exports = {
  validateTelemetryPayload,
  isFiniteNumber
};
