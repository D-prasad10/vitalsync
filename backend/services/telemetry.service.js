const db = require('../database');
const { normalizeTelemetry } = require('../utils/telemetryNormalizer');
const deviceService = require('./device.service');
const alertService = require('./alert.service');
const aiService = require('./ai.service');

/**
 * Telemetry Ingestion and Processing Pipeline for SWASTHYAEDGE.
 *
 * Orchestrates:
 * 1. Normalization
 * 2. Device Heartbeat Tracking
 * 3. Database Persistence (sensor_logs)
 * 4. Hardware/Monitoring Alert Evaluation
 * 5. Non-blocking AI Engine Interface
 * 6. Real-time Socket.IO Broadcast
 */

class TelemetryService {
  constructor() {
    this.io = null;
    this.lastDbSavePerPatient = new Map(); // patientId -> timestamp ms
  }

  init(io) {
    this.io = io;
  }

  /**
   * Main telemetry processing pipeline.
   */
  async processTelemetry(rawPayload, clientIp = null) {
    // 1. Determine fallback patient ID from device mapping
    const rawDeviceId = rawPayload.deviceId || rawPayload.device_id || 'ESP8266-001';
    const mappedPatientId = deviceService.getPatientIdForDevice(rawDeviceId);

    // 2. Canonical Normalization
    const normalized = normalizeTelemetry(rawPayload, clientIp, mappedPatientId);
    const patientId = normalized.patientId;
    const deviceId = normalized.deviceId;
    const timestamp = normalized.timestamp;
    const now = Date.now();

    // 3. Update Device Heartbeat (non-blocking)
    deviceService.updateHeartbeat(deviceId, patientId, normalized.deviceIp)
      .catch(err => console.error('[TELEMETRY] Heartbeat update error:', err.message));

    // 4. Broadcast real-time telemetry via Socket.IO
    if (this.io) {
      this.io.emit('sensor_data', normalized);
      this.io.emit('telemetry_update', normalized);

      // Support patient-specific room
      this.io.to(`patient:${patientId}`).emit('sensor_data', normalized);
      this.io.to(`patient:${patientId}`).emit('telemetry_update', normalized);
    }

    // 5. Evaluate Safety Thresholds & Alerts
    let threshold = null;
    try {
      threshold = await db.getAsync('SELECT * FROM thresholds WHERE patient_id = ?', [patientId]);
    } catch (err) {
      console.warn('[TELEMETRY] Could not read thresholds:', err.message);
    }

    const detectedAlerts = alertService.evaluateTelemetryAlerts(normalized, threshold);

    if (detectedAlerts.length > 0) {
      // Get patient name for alert payload
      let patientName = `Patient ${patientId}`;
      try {
        const patientRow = await db.getAsync('SELECT name FROM patients WHERE id = ?', [patientId]);
        if (patientRow && patientRow.name) {
          patientName = patientRow.name;
        }
      } catch (_) {}

      const alertMessages = detectedAlerts.map(a => a.message);
      const isCritical = detectedAlerts.some(a => a.severity === 'critical');
      const severity = isCritical ? 'critical' : 'warning';

      // Persist each alert into alerts table
      for (const alert of detectedAlerts) {
        alertService.recordAlert(alert).catch(err => {
          console.error('[TELEMETRY] Error recording alert:', err.message);
        });
      }

      // Broadcast emergency_alert
      alertService.broadcastAlert({
        id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
        patient_id: patientId,
        patientId,
        patient_name: patientName,
        alerts: alertMessages,
        severity,
        timestamp
      });
    }

    // 6. Persist to sensor_logs (throttled to 3s per patient unless alert is active)
    const lastSave = this.lastDbSavePerPatient.get(patientId) || 0;
    const shouldSave = detectedAlerts.length > 0 || (now - lastSave >= 3000);

    if (shouldSave) {
      this.lastDbSavePerPatient.set(patientId, now);
      this.persistSensorLog(normalized).catch(err => {
        console.error('[TELEMETRY DB] Error inserting sensor log:', err.message);
      });
    }

    // 7. Non-blocking AI Engine Interface
    // Telemetry MUST NOT fail or block if AI Engine is offline or errors out
    if (aiService.isConfigured()) {
      aiService.evaluateTelemetry(normalized).catch(err => {
        console.warn('[TELEMETRY] AI evaluation notice:', err.message);
      });
    }

    return normalized;
  }

  /**
   * Persists normalized telemetry record into SQLite sensor_logs table.
   */
  async persistSensorLog(normalized) {
    await db.runAsync(
      `INSERT INTO sensor_logs 
       (patient_id, hr, bp_sys, bp_dia, spo2, temp, health_score, humidity, pressure, ecg_val, mq135, gps_lat, gps_lng, raw_payload, timestamp, dht_temp, bmp_temp, max_ir, max_red, device_ip) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.patientId,
        normalized.hr,
        normalized.bpSys,
        normalized.bpDia,
        normalized.spo2,
        normalized.temp,
        normalized.healthScore,
        normalized.humidity,
        normalized.pressure,
        normalized.ecg_val,
        normalized.mq135,
        normalized.gps ? normalized.gps.latitude : null,
        normalized.gps ? normalized.gps.longitude : null,
        JSON.stringify(normalized),
        normalized.timestamp,
        normalized.dhtTemp,
        normalized.bmpTemp,
        normalized.maxIR,
        normalized.maxRED,
        normalized.deviceIp
      ]
    );
  }
}

module.exports = new TelemetryService();
