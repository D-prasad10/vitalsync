const db = require('../database');

/**
 * Alert Management Service for SWASTHYAEDGE.
 *
 * Evaluates hardware, monitoring, and environmental safety thresholds.
 * IMPORTANT: These are monitoring/hardware/environment alerts, NOT medical diagnoses.
 */

class AlertService {
  constructor() {
    this.io = null;
  }

  init(io) {
    this.io = io;
  }

  /**
   * Evaluates incoming telemetry against safety thresholds.
   * Returns an array of detected alerts.
   */
  evaluateTelemetryAlerts(normalized, threshold = null) {
    const alerts = [];
    const patientId = normalized.patientId || normalized.patient_id;
    const deviceId = normalized.deviceId;
    const now = normalized.timestamp || Date.now();

    // 1. MQ-135 Air Quality / Gas Alert
    if (normalized.mq135 === 'ALERT' || normalized.mq135Digital === 0) {
      alerts.push({
        patient_id: patientId,
        device_id: deviceId,
        severity: 'critical',
        type: 'mq135_gas',
        message: 'Hazardous Gas / Smoke Detected (MQ-135)',
        timestamp: now
      });
    }

    // 2. AD8232 ECG Leads Disconnected Alert
    if (normalized.leadOffPlus || normalized.leadOffMinus) {
      alerts.push({
        patient_id: patientId,
        device_id: deviceId,
        severity: 'warning',
        type: 'ecg_lead_off',
        message: 'ECG Leads Disconnected (AD8232 LO+/LO- Active)',
        timestamp: now
      });
    }

    // 3. Body Temperature Threshold Exceeded
    const tempF = normalized.temp;
    if (threshold && tempF !== null && threshold.temp_max !== null && tempF > threshold.temp_max) {
      alerts.push({
        patient_id: patientId,
        device_id: deviceId,
        severity: tempF > 103.0 ? 'critical' : 'warning',
        type: 'temperature_threshold',
        message: `High Temperature: ${tempF} °F (Threshold: ${threshold.temp_max} °F)`,
        timestamp: now
      });
    }

    return alerts;
  }

  /**
   * Persists an alert into the alerts table.
   */
  async recordAlert(alertData) {
    const {
      patient_id,
      device_id,
      severity = 'warning',
      type = 'general_alert',
      message,
      timestamp = Date.now()
    } = alertData;

    try {
      const res = await db.runAsync(
        `INSERT INTO alerts (patient_id, device_id, severity, type, message, acknowledged, timestamp)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [patient_id, device_id, severity, type, message, timestamp]
      );
      return {
        id: res.lastID,
        patient_id,
        device_id,
        severity,
        type,
        message,
        acknowledged: 0,
        timestamp
      };
    } catch (err) {
      console.error('[ALERT DB] Error persisting alert:', err.message);
      return null;
    }
  }

  /**
   * Broadcasts alert payload through Socket.IO (globally and to patient room).
   */
  broadcastAlert(alertEvent) {
    if (!this.io) return;

    // Emit globally for existing dashboards
    this.io.emit('emergency_alert', alertEvent);

    // Emit to patient-specific room if patient_id present
    const pid = alertEvent.patient_id || alertEvent.patientId;
    if (pid) {
      this.io.to(`patient:${pid}`).emit('emergency_alert', alertEvent);
    }
  }

  /**
   * Retrieves alerts with optional filters.
   */
  async getAlerts(filters = {}) {
    const { patientId, severity, acknowledged, limit = 50 } = filters;
    const conditions = [];
    const params = [];

    if (patientId) {
      conditions.push('patient_id = ?');
      params.push(Number(patientId));
    }
    if (severity) {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (acknowledged !== undefined) {
      conditions.push('acknowledged = ?');
      params.push(Number(acknowledged) ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM alerts ${whereClause} ORDER BY timestamp DESC LIMIT ?`;
    params.push(Number(limit) || 50);

    return db.allAsync(sql, params);
  }

  /**
   * Acknowledges an alert.
   */
  async acknowledgeAlert(alertId) {
    const res = await db.runAsync(
      'UPDATE alerts SET acknowledged = 1 WHERE id = ?',
      [alertId]
    );
    return { success: res.changes > 0, id: alertId };
  }
}

module.exports = new AlertService();
