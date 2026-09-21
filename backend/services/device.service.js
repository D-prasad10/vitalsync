const axios = require('axios');
const db = require('../database');
const { getLocalLanIp } = require('../utils/network');

/**
 * Device Management Service for SWASTHYAEDGE.
 *
 * Tracks hardware device liveness, IP address, patient assignment,
 * periodic ESP8266 polling, and timeout watchdog (> 10s silent -> OFFLINE).
 */

class DeviceService {
  constructor() {
    this.deviceHeartbeats = new Map(); // deviceId -> { lastSeen, patientId, ip, status, reportedOnline }
    this.devicePatientMapping = new Map(); // deviceId -> patientId
    this.io = null;
    this.alertService = null;
    this.ingestCallback = null;

    this.activeEspConfig = {
      ip: process.env.ESP8266_IP || '',
      patientId: 1,
      pollingIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 1500,
      isPolling: true,
      lastPollStatus: 'IDLE',
      lastPollError: null,
      lastPollTime: null
    };

    this.pollIntervalTimer = null;
    this.watchdogIntervalTimer = null;
  }

  /**
   * Initialize service with Socket.IO instance and AlertService reference.
   */
  async init(io, alertService, ingestCallback) {
    this.io = io;
    this.alertService = alertService;
    this.ingestCallback = ingestCallback;

    // Load registered devices from database
    try {
      const rows = await db.allAsync('SELECT * FROM devices');
      if (rows && rows.length > 0) {
        rows.forEach(r => {
          this.deviceHeartbeats.set(r.device_id, {
            lastSeen: r.last_seen || 0,
            patientId: r.patient_id,
            ip: r.ip,
            status: 'OFFLINE',
            reportedOnline: false
          });
          if (r.patient_id) {
            this.devicePatientMapping.set(r.device_id, r.patient_id);
          }
        });
      }
    } catch (err) {
      console.warn('[DEVICE] Notice: Could not load initial devices table:', err.message);
    }

    // Load patient-to-device mapping from patients table
    try {
      const patients = await db.allAsync('SELECT id, device_id FROM patients WHERE device_id IS NOT NULL');
      if (patients && patients.length > 0) {
        patients.forEach(p => {
          if (p.device_id) {
            this.devicePatientMapping.set(p.device_id.trim(), p.id);
          }
        });
      }
    } catch (err) {
      console.warn('[DEVICE] Notice: Could not load patient device mapping:', err.message);
    }

    // Start background watchdog for hardware device timeout (> 10s silent)
    this.startWatchdog();

    // Start ESP8266 background poller if configured
    if (this.activeEspConfig.ip) {
      this.startEspPoller();
    }
  }

  getPatientIdForDevice(deviceId) {
    if (!deviceId) return 1;
    return this.devicePatientMapping.get(String(deviceId).trim()) || 1;
  }

  /**
   * Updates device heartbeat upon telemetry arrival.
   */
  async updateHeartbeat(deviceId, patientId, deviceIp) {
    const did = String(deviceId).trim();
    const pid = Number(patientId) || this.getPatientIdForDevice(did);
    const ip = deviceIp || '192.168.1.1';
    const now = Date.now();

    this.devicePatientMapping.set(did, pid);

    const previous = this.deviceHeartbeats.get(did);
    const wasOffline = !previous || previous.status === 'OFFLINE' || previous.reportedOnline === false;

    this.deviceHeartbeats.set(did, {
      lastSeen: now,
      patientId: pid,
      ip,
      status: 'ONLINE',
      reportedOnline: true
    });

    // Notify socket clients if device came back ONLINE
    if (wasOffline && this.io) {
      this.io.emit('device_status', {
        deviceId: did,
        patientId: pid,
        status: 'ONLINE',
        lastSeen: now
      });
    }

    // Sync state with SQLite devices table (upsert)
    try {
      await db.runAsync(
        `INSERT INTO devices (device_id, patient_id, ip, status, last_seen, created_at, updated_at)
         VALUES (?, ?, ?, 'ONLINE', ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           patient_id = excluded.patient_id,
           ip = excluded.ip,
           status = 'ONLINE',
           last_seen = excluded.last_seen,
           updated_at = excluded.updated_at`,
        [did, pid, ip, now, now, now]
      );
    } catch (err) {
      console.error('[DEVICE DB] Error updating device record:', err.message);
    }
  }

  /**
   * Retrieves list of all tracked hardware units with status.
   */
  getDevices() {
    const now = Date.now();
    const devices = [];

    this.deviceHeartbeats.forEach((val, devId) => {
      const isOnline = now - val.lastSeen <= 10000;
      devices.push({
        deviceId: devId,
        patientId: val.patientId,
        ip: val.ip,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
        lastSeen: val.lastSeen,
        secondsAgo: val.lastSeen ? Math.round((now - val.lastSeen) / 1000) : null
      });
    });

    return devices;
  }

  /**
   * Assigns a device to a specific patient.
   */
  async assignDevice(deviceId, patientId) {
    const did = String(deviceId).trim();
    const pid = Number(patientId);
    const now = Date.now();

    this.devicePatientMapping.set(did, pid);

    const existing = this.deviceHeartbeats.get(did) || {
      lastSeen: 0,
      ip: '192.168.1.1',
      status: 'OFFLINE',
      reportedOnline: false
    };

    this.deviceHeartbeats.set(did, {
      ...existing,
      patientId: pid
    });

    // Update patients table
    await db.runAsync('UPDATE patients SET device_id = ? WHERE id = ?', [did, pid]);

    // Update devices table
    await db.runAsync(
      `INSERT INTO devices (device_id, patient_id, ip, status, last_seen, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         patient_id = excluded.patient_id,
         updated_at = excluded.updated_at`,
      [did, pid, existing.ip, existing.status, existing.lastSeen, now, now]
    );

    return { success: true, deviceId: did, patientId: pid };
  }

  /**
   * Returns primary device and overall hardware connectivity status.
   */
  getDeviceStatus() {
    const now = Date.now();
    const devices = this.getDevices();
    const primary = devices[0] || null;

    return {
      online: primary ? primary.status === 'ONLINE' : false,
      deviceId: primary ? primary.deviceId : (this.activeEspConfig.ip ? 'ESP8266-001' : null),
      ip: primary ? primary.ip : this.activeEspConfig.ip || null,
      lastSeen: primary ? primary.lastSeen : this.activeEspConfig.lastPollTime,
      secondsAgo: primary ? primary.secondsAgo : (this.activeEspConfig.lastPollTime ? Math.round((now - this.activeEspConfig.lastPollTime) / 1000) : null),
      devices
    };
  }

  /**
   * Returns current hardware polling and network configuration.
   */
  getHardwareConfig(port) {
    const lanIp = getLocalLanIp();
    return {
      ...this.activeEspConfig,
      localLanIp: lanIp,
      lanIngestionUrl: `http://${lanIp}:${port}/api/telemetry/esp8266`,
      localIngestionUrl: `http://localhost:${port}/api/telemetry/esp8266`
    };
  }

  /**
   * Updates polling configuration.
   */
  async updateHardwareConfig(body, port) {
    const { ip, patientId, pollingIntervalMs, isPolling } = body;
    if (ip !== undefined) this.activeEspConfig.ip = String(ip).trim();
    if (patientId !== undefined) this.activeEspConfig.patientId = Number(patientId) || 1;
    if (pollingIntervalMs !== undefined) this.activeEspConfig.pollingIntervalMs = Math.max(500, Number(pollingIntervalMs) || 1500);
    if (isPolling !== undefined) this.activeEspConfig.isPolling = Boolean(isPolling);

    this.startEspPoller();

    if (this.activeEspConfig.ip && this.activeEspConfig.isPolling) {
      await this.pollEsp8266();
    }

    const lanIp = getLocalLanIp();
    return {
      success: true,
      config: {
        ...this.activeEspConfig,
        localLanIp: lanIp,
        lanIngestionUrl: `http://${lanIp}:${port}/api/telemetry/esp8266`
      }
    };
  }

  /**
   * Polls the ESP8266 HTTP /data endpoint.
   */
  async pollEsp8266() {
    if (!this.activeEspConfig.ip || !this.activeEspConfig.isPolling) return;

    let baseIp = this.activeEspConfig.ip.trim();
    if (!baseIp.startsWith('http://') && !baseIp.startsWith('https://')) {
      baseIp = 'http://' + baseIp;
    }
    let targetUrl = baseIp;
    if (!targetUrl.endsWith('/data')) {
      targetUrl = targetUrl.replace(/\/+$/, '') + '/data';
    }

    try {
      const response = await axios.get(targetUrl, { timeout: 2500 });
      if (response.data && typeof response.data === 'object') {
        this.activeEspConfig.lastPollStatus = 'SUCCESS';
        this.activeEspConfig.lastPollError = null;
        this.activeEspConfig.lastPollTime = Date.now();

        const clientIp = this.activeEspConfig.ip.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
        const payload = {
          ...response.data,
          patientId: this.activeEspConfig.patientId || 1,
          ip: response.data.ip || clientIp
        };

        if (typeof this.ingestCallback === 'function') {
          this.ingestCallback(payload, clientIp);
        }
      }
    } catch (err) {
      this.activeEspConfig.lastPollStatus = 'ERROR';
      this.activeEspConfig.lastPollError = err.message;
      this.activeEspConfig.lastPollTime = Date.now();
    }
  }

  startEspPoller() {
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);
    if (this.activeEspConfig.ip && this.activeEspConfig.isPolling) {
      console.log(`[POLLER] Started polling ESP8266 at ${this.activeEspConfig.ip} every ${this.activeEspConfig.pollingIntervalMs}ms`);
      this.pollEsp8266();
      this.pollIntervalTimer = setInterval(() => this.pollEsp8266(), this.activeEspConfig.pollingIntervalMs);
    }
  }

  /**
   * Watchdog timer checking for silent devices (> 10s).
   */
  startWatchdog() {
    if (this.watchdogIntervalTimer) clearInterval(this.watchdogIntervalTimer);

    this.watchdogIntervalTimer = setInterval(async () => {
      const now = Date.now();
      for (const [devId, val] of this.deviceHeartbeats.entries()) {
        if (now - val.lastSeen > 10000 && val.reportedOnline !== false) {
          val.reportedOnline = false;
          val.status = 'OFFLINE';

          console.warn(`[WATCHDOG] Hardware Device ${devId} went OFFLINE (>10s silent)`);

          // Update devices table
          try {
            await db.runAsync("UPDATE devices SET status = 'OFFLINE', updated_at = ? WHERE device_id = ?", [now, devId]);
          } catch (err) {
            console.error('[WATCHDOG DB] Error updating status:', err.message);
          }

          // Record alert in alerts table via AlertService
          if (this.alertService) {
            this.alertService.recordAlert({
              patient_id: val.patientId,
              device_id: devId,
              severity: 'warning',
              type: 'device_offline',
              message: `Hardware Sensor Unit (${devId}) Disconnected / Offline (>10s)`,
              timestamp: now
            }).catch(e => console.error('[WATCHDOG ALERT] Save error:', e.message));
          }

          // Broadcast emergency_alert, sensor_data, and device_status to Socket.IO
          if (this.io) {
            this.io.emit('emergency_alert', {
              id: `device-offline-${devId}-${now}`,
              patient_id: val.patientId,
              patientId: val.patientId,
              patient_name: 'Paired Patient',
              metric: 'Hardware Connectivity',
              value: 'OFFLINE',
              message: `Hardware Sensor Unit (${devId}) Disconnected / Offline (>10s)`,
              alerts: [`⚠️ Hardware Sensor Unit (${devId}) Disconnected / Offline (>10s)`],
              severity: 'warning',
              timestamp: now
            });

            this.io.emit('sensor_data', {
              deviceId: devId,
              patient_id: val.patientId,
              patientId: val.patientId,
              deviceStatus: 'OFFLINE',
              timestamp: now
            });

            this.io.emit('device_status', {
              deviceId: devId,
              patientId: val.patientId,
              status: 'OFFLINE',
              lastSeen: val.lastSeen
            });
          }
        }
      }
    }, 2000);
  }

  stop() {
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);
    if (this.watchdogIntervalTimer) clearInterval(this.watchdogIntervalTimer);
  }
}

module.exports = new DeviceService();
