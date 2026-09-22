const axios = require('axios');
const db = require('../database');

/**
 * AI Engine Interface for SWASTHYAEDGE.
 *
 * NOTE: This is an integration bridge only. The AI model itself is NOT implemented here.
 * Connects to the external AI Engine configured via AI_ENGINE_URL environment variable.
 */

class AIService {
  constructor() {
    this.io = null;
    this.timeoutMs = 2500;
  }

  init(io) {
    this.io = io;
  }

  getAiEngineUrl() {
    return (process.env.AI_ENGINE_URL || '').trim().replace(/\/+$/, '');
  }

  isConfigured() {
    return Boolean(this.getAiEngineUrl());
  }

  /**
   * Evaluates normalized telemetry with the AI Engine.
   * Runs asynchronously and never throws to ensure telemetry ingestion is never blocked.
   */
  async evaluateTelemetry(normalizedTelemetry) {
    const aiUrl = this.getAiEngineUrl();
    if (!aiUrl) {
      return null;
    }

    const patientId = normalizedTelemetry.patientId || normalizedTelemetry.patient_id || 1;
    const deviceId = normalizedTelemetry.deviceId || 'ESP8266-001';
    const timestamp = normalizedTelemetry.timestamp || Date.now();

    try {
      const response = await axios.post(
        `${aiUrl}/predict`,
        {
          patientId,
          deviceId,
          timestamp,
          telemetry: normalizedTelemetry
        },
        {
          timeout: this.timeoutMs,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const data = response.data;
      if (!data || typeof data !== 'object') {
        console.warn('[AI ENGINE] Received invalid response structure (not an object)');
        return null;
      }

      // Extract and validate expected prediction fields
      const riskLevel = String(data.riskLevel || data.risk_level || 'low').toLowerCase();
      const riskType = String(data.riskType || data.risk_type || 'normal');
      const confidence = typeof data.confidence === 'number' && !Number.isNaN(data.confidence)
        ? data.confidence
        : (data.confidence != null ? Number(data.confidence) : 0.0);
      const modelVersion = String(data.modelVersion || data.model_version || 'v1.0.0');
      const explanation = String(data.explanation || 'No explanation provided');

      const prediction = {
        patient_id: patientId,
        patientId,
        device_id: deviceId,
        deviceId,
        risk_level: riskLevel,
        riskLevel,
        risk_type: riskType,
        riskType,
        confidence,
        model_version: modelVersion,
        modelVersion,
        explanation,
        timestamp
      };

      // Persist to ai_predictions table
      try {
        const res = await db.runAsync(
          `INSERT INTO ai_predictions 
           (patient_id, device_id, risk_level, risk_type, confidence, model_version, explanation, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [patientId, deviceId, riskLevel, riskType, confidence, modelVersion, explanation, timestamp]
        );
        prediction.id = res.lastID;
      } catch (dbErr) {
        console.error('[AI DB] Error saving prediction:', dbErr.message);
      }

      // Broadcast event via Socket.IO
      if (this.io) {
        this.io.emit('ai_prediction', prediction);
        this.io.to(`patient:${patientId}`).emit('ai_prediction', prediction);
      }

      return prediction;
    } catch (err) {
      // Network error, timeout, 4xx, 5xx: Log warning and continue safely
      if (err.code === 'ECONNREFUSED') {
        console.warn(`[AI ENGINE] Connection refused at ${aiUrl}/predict (AI engine offline)`);
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        console.warn(`[AI ENGINE] Request timed out after ${this.timeoutMs}ms`);
      } else {
        console.warn(`[AI ENGINE] Evaluation failed: ${err.message}`);
      }
      return null;
    }
  }

  /**
   * Retrieves past AI predictions for a given patient.
   */
  async getPredictions(patientId, limit = 20) {
    try {
      return await db.allAsync(
        'SELECT * FROM ai_predictions WHERE patient_id = ? ORDER BY timestamp DESC LIMIT ?',
        [Number(patientId), Number(limit) || 20]
      );
    } catch (err) {
      console.error('[AI DB] Error retrieving predictions:', err.message);
      return [];
    }
  }

  /**
   * Checks current connection status to the AI Engine.
   */
  async getStatus() {
    const aiUrl = this.getAiEngineUrl();
    if (!aiUrl) {
      return {
        configured: false,
        url: null,
        status: 'UNCONFIGURED'
      };
    }

    try {
      const pingUrl = `${aiUrl}/health`;
      const res = await axios.get(pingUrl, { timeout: 1500 });
      return {
        configured: true,
        url: aiUrl,
        status: res.status === 200 ? 'ONLINE' : 'DEGRADED',
        details: res.data
      };
    } catch (err) {
      return {
        configured: true,
        url: aiUrl,
        status: 'OFFLINE',
        error: err.message
      };
    }
  }
}

module.exports = new AIService();
