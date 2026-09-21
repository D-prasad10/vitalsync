/**
 * SWASTHYAEDGE Backend Automated Test Suite
 *
 * Covers all 12 required verification scenarios:
 * 1. Valid telemetry acceptance & canonical normalization
 * 2. Invalid telemetry rejection (HTTP 400)
 * 3. MAX30100 disconnected & optical signal rules (strictly no fabricated HR, SpO2, or BP)
 * 4. AD8232 ECG leads disconnected detection & alert
 * 5. MQ135 hazardous gas/smoke detection & critical alert
 * 6. Device heartbeat tracking & status
 * 7. Device offline timeout watchdog (> 10s silent)
 * 8. Database persistence (sensor_logs, devices, alerts, ai_predictions)
 * 9. AI engine unavailable (graceful handling, telemetry succeeds)
 * 10. Valid AI engine response (prediction recorded & persisted)
 * 11. Malformed AI response handling
 * 12. Device management & existing API endpoints compatibility
 */

const http = require('http');
const axios = require('axios');
const assert = require('assert');
const path = require('path');

// Point to backend database & server
const db = require('../database');
const { app, server, io, deviceService, telemetryService, alertService, aiService } = require('../server');

let BASE_URL = '';
let TEST_PORT = 0;
let mockAiServer = null;
let mockAiPort = 0;
let mockAiResponse = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
  process.stdout.write(`• Testing: ${name}... `);
  try {
    await fn();
    console.log(`\x1b[32mPASSED\x1b[0m`);
    passedTests++;
  } catch (err) {
    console.log(`\x1b[31mFAILED\x1b[0m`);
    console.error(`  Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    failedTests++;
  }
}

async function setupServers() {
  // 1. Start main backend test server on an ephemeral port
  await new Promise((resolve) => {
    server.listen(0, () => {
      TEST_PORT = server.address().port;
      BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
      resolve();
    });
  });

  // 2. Start mock AI engine server on another ephemeral port
  mockAiServer = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', engine: 'mock-ai-engine' }));
    }

    if (req.url === '/predict' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        if (mockAiResponse === 'MALFORMED') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end('{"broken": true, [invalid json');
        }
        if (mockAiResponse === '500_ERROR') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Internal Model Failure' }));
        }

        // Default valid prediction response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          patientId: 1,
          riskLevel: 'moderate',
          riskType: 'anomaly',
          confidence: 0.87,
          modelVersion: 'v1.0.0',
          explanation: 'Elevated ambient temperature with baseline ECG rhythm.'
        }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => {
    mockAiServer.listen(0, () => {
      mockAiPort = mockAiServer.address().port;
      resolve();
    });
  });

  // Configure AI_ENGINE_URL to mock AI server initially
  process.env.AI_ENGINE_URL = `http://127.0.0.1:${mockAiPort}`;

  // Ensure SQLite schema and seed initialization have finished
  await db.readyPromise;
  await sleep(100);
}

async function teardownServers() {
  deviceService.stop();
  if (mockAiServer) mockAiServer.close();
  if (server) server.close();
  if (io) io.close();
}

async function main() {
  console.log(`\n====================================================`);
  console.log(` SWASTHYAEDGE Backend Automated Test Suite`);
  console.log(`====================================================\n`);

  await setupServers();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Valid Telemetry Acceptance & Canonical Normalization
    // -------------------------------------------------------------------------
    await runTest('1. Valid Telemetry Acceptance & Canonical Normalization', async () => {
      const payload = {
        deviceId: 'ESP8266-TEST-01',
        patientId: 1,
        dhtTemp: 29.2,
        humidity: 65.5,
        bmpTemp: 29.0,
        pressure: 1012.3,
        ecg: 520,
        loPlus: 0,
        loMinus: 0,
        mq135: 1,
        accX: 100,
        accY: 200,
        accZ: 16000,
        gyroX: 0,
        gyroY: 1,
        gyroZ: -1,
        maxFound: 1,
        maxIR: 18500,
        maxRED: 15300,
        gpsSat: 7,
        gpsFix: 1,
        gpsLat: 19.0760,
        gpsLng: 72.8777
      };

      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.deviceId, 'ESP8266-TEST-01');
      assert.strictEqual(res.data.patientId, 1);
      assert.strictEqual(res.data.status, 'ONLINE');

      // Wait briefly for throttled async DB insert to complete
      await sleep(150);

      // Verify canonical normalization through latest patient telemetry endpoint
      const latestRes = await axios.get(`${BASE_URL}/api/patients/1/latest`);
      assert.strictEqual(latestRes.status, 200);
      const latest = latestRes.data;
      assert.ok(latest, 'Latest telemetry point should exist');
      assert.strictEqual(latest.deviceId, 'ESP8266-TEST-01');
      assert.strictEqual(latest.dhtTemp, 29.2);
      assert.strictEqual(latest.bmpTemp, 29.0);
      assert.ok(latest.temp >= 80 && latest.temp <= 90, `Temperature in F expected, got: ${latest.temp}`);
      assert.strictEqual(latest.humidity, 65.5);
      assert.strictEqual(latest.pressure, 1012.3);
      assert.strictEqual(latest.ecg_val, 520);
      assert.strictEqual(latest.maxIR, 18500);
      assert.strictEqual(latest.maxRED, 15300);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Invalid Telemetry Rejection (HTTP 400)
    // -------------------------------------------------------------------------
    await runTest('2. Invalid Telemetry Rejection (HTTP 400)', async () => {
      // Missing deviceId
      try {
        await axios.post(`${BASE_URL}/api/telemetry/esp8266`, { patientId: 1, dhtTemp: 25 });
        assert.fail('Should have rejected payload missing deviceId');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400, 'Expected 400 for missing deviceId');
      }

      // Invalid patientId format
      try {
        await axios.post(`${BASE_URL}/api/telemetry/esp8266`, { deviceId: 'ESP8266-TEST', patientId: -5 });
        assert.fail('Should have rejected negative patientId');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400, 'Expected 400 for invalid patientId');
      }

      // Non-numeric sensor field
      try {
        await axios.post(`${BASE_URL}/api/telemetry/esp8266`, {
          deviceId: 'ESP8266-TEST',
          patientId: 1,
          dhtTemp: 'corrupted-text'
        });
        assert.fail('Should have rejected non-numeric dhtTemp');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400, 'Expected 400 for non-numeric temperature');
      }
    });

    // -------------------------------------------------------------------------
    // TEST 3: MAX30100 Disconnected & Strict Zero-Fabrication Rules
    // -------------------------------------------------------------------------
    await runTest('3. MAX30100 Disconnected & Strict Medical Integrity (No Fabricated HR/SpO2/BP)', async () => {
      const payload = {
        deviceId: 'ESP8266-OPT-TEST',
        patientId: 3,
        maxFound: 0,
        maxIR: 0,
        maxRED: 0,
        dhtTemp: 28.0
      };

      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);

      // Wait briefly for async persistence
      await sleep(150);

      // Inspect normalized latest telemetry
      const latestRes = await axios.get(`${BASE_URL}/api/patients/3/latest`);
      const latest = latestRes.data;
      assert.ok(latest, 'Latest telemetry record for patient 3 should be stored');

      // CRITICAL RULE CHECKS:
      assert.strictEqual(latest.hr, null, 'hr must be strictly null (never fabricated)');
      assert.strictEqual(latest.heartRate, null, 'heartRate must be strictly null');
      assert.strictEqual(latest.spo2, null, 'spo2 must be strictly null (never fabricated)');
      assert.strictEqual(latest.bpSys, null, 'bpSys must be strictly null (no BP hardware)');
      assert.strictEqual(latest.bpDia, null, 'bpDia must be strictly null (no BP hardware)');
      assert.strictEqual(latest.bp, null, 'bp must be strictly null');
    });

    // -------------------------------------------------------------------------
    // TEST 4: AD8232 ECG Leads Disconnected Detection & Alert
    // -------------------------------------------------------------------------
    await runTest('4. AD8232 ECG Leads Disconnected Detection & Alert', async () => {
      const payload = {
        deviceId: 'ESP8266-LEADS-OFF',
        patientId: 1,
        ecg: 1023,
        loPlus: 1,
        loMinus: 0
      };

      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);

      // Verify alert stored in alerts table
      await sleep(100);
      const alertsRes = await axios.get(`${BASE_URL}/api/alerts?patientId=1`);
      assert.ok(Array.isArray(alertsRes.data));
      const leadOffAlert = alertsRes.data.find(a => a.type === 'ecg_lead_off');
      assert.ok(leadOffAlert, 'Expected an ecg_lead_off alert to be recorded');
      assert.strictEqual(leadOffAlert.severity, 'warning');
      assert.ok(leadOffAlert.message.includes('ECG Leads Disconnected'));
    });

    // -------------------------------------------------------------------------
    // TEST 5: MQ135 Hazardous Gas/Smoke Detection & Critical Alert
    // -------------------------------------------------------------------------
    await runTest('5. MQ135 Hazardous Gas/Smoke Detection & Critical Alert', async () => {
      const payload = {
        deviceId: 'ESP8266-GAS-ALERT',
        patientId: 2,
        mq135: 0 // Digital 0 = LOW / Gas detected
      };

      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);

      await sleep(100);
      const alertsRes = await axios.get(`${BASE_URL}/api/alerts?patientId=2`);
      const gasAlert = alertsRes.data.find(a => a.type === 'mq135_gas');
      assert.ok(gasAlert, 'Expected an mq135_gas alert to be recorded');
      assert.strictEqual(gasAlert.severity, 'critical');
      assert.ok(gasAlert.message.includes('Gas / Smoke'));
    });

    // -------------------------------------------------------------------------
    // TEST 6: Device Heartbeat Tracking & Status
    // -------------------------------------------------------------------------
    await runTest('6. Device Heartbeat Tracking & Liveness', async () => {
      const payload = {
        deviceId: 'ESP8266-HEARTBEAT-01',
        patientId: 1,
        ip: '192.168.1.188'
      };

      await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);

      const statusRes = await axios.get(`${BASE_URL}/api/device/status`);
      assert.strictEqual(statusRes.status, 200);
      const devices = statusRes.data.devices || [];
      const found = devices.find(d => d.deviceId === 'ESP8266-HEARTBEAT-01');
      assert.ok(found, 'Heartbeat device should be found in device list');
      assert.strictEqual(found.status, 'ONLINE');
      assert.strictEqual(found.ip, '192.168.1.188');
      assert.ok(found.lastSeen > 0);
    });

    // -------------------------------------------------------------------------
    // TEST 7: Device Offline Timeout Watchdog (> 10s silent)
    // -------------------------------------------------------------------------
    await runTest('7. Device Offline Timeout Watchdog', async () => {
      const did = 'ESP8266-TIMEOUT-TEST';
      // Register heartbeat with lastSeen artificially backdated by 15 seconds
      const backdatedTime = Date.now() - 15000;
      deviceService.deviceHeartbeats.set(did, {
        lastSeen: backdatedTime,
        patientId: 1,
        ip: '192.168.1.99',
        status: 'ONLINE',
        reportedOnline: true
      });

      // Query devices endpoint
      const devices = deviceService.getDevices();
      const dev = devices.find(d => d.deviceId === did);
      assert.ok(dev);
      assert.strictEqual(dev.status, 'OFFLINE', 'Device older than 10s must report OFFLINE');
    });

    // -------------------------------------------------------------------------
    // TEST 8: Database Persistence (sensor_logs, devices, alerts)
    // -------------------------------------------------------------------------
    await runTest('8. SQLite Database Persistence Verification', async () => {
      // Check sensor_logs table
      const logs = await db.allAsync('SELECT * FROM sensor_logs ORDER BY id DESC LIMIT 5');
      assert.ok(logs && logs.length > 0, 'sensor_logs table must contain saved records');
      assert.ok(logs[0].patient_id, 'Sensor log must have patient_id');

      // Check devices table
      const devices = await db.allAsync('SELECT * FROM devices');
      assert.ok(devices && devices.length > 0, 'devices table must contain records');

      // Check alerts table
      const alerts = await db.allAsync('SELECT * FROM alerts');
      assert.ok(alerts && alerts.length > 0, 'alerts table must contain records');
    });

    // -------------------------------------------------------------------------
    // TEST 9: AI Engine Unavailable (Graceful Failure Handling)
    // -------------------------------------------------------------------------
    await runTest('9. AI Engine Unavailable (Graceful Failure & Ingestion Continuity)', async () => {
      // Point AI_ENGINE_URL to an unreachable port
      process.env.AI_ENGINE_URL = 'http://127.0.0.1:59999';

      const payload = {
        deviceId: 'ESP8266-AI-FAIL-TEST',
        patientId: 1,
        dhtTemp: 27.5
      };

      // Ingestion must succeed without throwing or crashing
      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // Check AI status endpoint
      const statusRes = await axios.get(`${BASE_URL}/api/ai/status`);
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.data.status, 'OFFLINE');
    });

    // -------------------------------------------------------------------------
    // TEST 10: Valid AI Engine Response (Prediction Persistence)
    // -------------------------------------------------------------------------
    await runTest('10. Valid AI Engine Response & Persistence', async () => {
      // Restore valid mock AI server URL
      process.env.AI_ENGINE_URL = `http://127.0.0.1:${mockAiPort}`;
      mockAiResponse = 'VALID';

      const payload = {
        deviceId: 'ESP8266-AI-VALID-TEST',
        patientId: 1,
        dhtTemp: 31.0
      };

      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);

      // Allow async AI evaluation to complete
      await sleep(200);

      const predictions = await aiService.getPredictions(1, 10);
      assert.ok(predictions && predictions.length > 0, 'AI prediction must be persisted in SQLite');
      const latest = predictions[0];
      assert.strictEqual(latest.risk_level, 'moderate');
      assert.strictEqual(latest.risk_type, 'anomaly');
      assert.strictEqual(latest.confidence, 0.87);
    });

    // -------------------------------------------------------------------------
    // TEST 11: Malformed AI Response Handling
    // -------------------------------------------------------------------------
    await runTest('11. Malformed AI Response Handling (No Crash)', async () => {
      mockAiResponse = 'MALFORMED';

      const payload = {
        deviceId: 'ESP8266-AI-MALFORMED',
        patientId: 1,
        dhtTemp: 26.0
      };

      // Server must remain running and accept telemetry
      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      mockAiResponse = null;
    });

    // -------------------------------------------------------------------------
    // TEST 12: Existing Device Endpoints & Compatibility
    // -------------------------------------------------------------------------
    await runTest('12. Existing Device Management Endpoints Compatibility', async () => {
      // GET /api/devices
      const devRes = await axios.get(`${BASE_URL}/api/devices`);
      assert.strictEqual(devRes.status, 200);
      assert.ok(Array.isArray(devRes.data));

      // POST /api/devices/assign
      const assignRes = await axios.post(`${BASE_URL}/api/devices/assign`, {
        deviceId: 'ESP8266-ASSIGN-TEST',
        patientId: 2
      });
      assert.strictEqual(assignRes.status, 200);
      assert.strictEqual(assignRes.data.success, true);
      assert.strictEqual(assignRes.data.patientId, 2);

      // GET /api/hardware/config
      const cfgRes = await axios.get(`${BASE_URL}/api/hardware/config`);
      assert.strictEqual(cfgRes.status, 200);
      assert.ok(cfgRes.data.lanIngestionUrl);

      // POST /api/hardware/config
      const updateCfgRes = await axios.post(`${BASE_URL}/api/hardware/config`, {
        pollingIntervalMs: 2000
      });
      assert.strictEqual(updateCfgRes.status, 200);
      assert.strictEqual(updateCfgRes.data.success, true);

      // POST /api/hardware/test-pulse
      const pulseRes = await axios.post(`${BASE_URL}/api/hardware/test-pulse`, {
        patientId: 1
      });
      assert.strictEqual(pulseRes.status, 200);
      assert.strictEqual(pulseRes.data.success, true);
      assert.ok(pulseRes.data.telemetry);
    });

    // -------------------------------------------------------------------------
    // TEST 13: Backward-Compatible Telemetry Endpoints
    // -------------------------------------------------------------------------
    await runTest('13. Backward-Compatible Telemetry Endpoints (/api/telemetry & /api/hardware/telemetry)', async () => {
      const p1 = { deviceId: 'ESP8266-LEGACY-1', patientId: 1, bmpTemp: 28.0 };
      const res1 = await axios.post(`${BASE_URL}/api/telemetry`, p1);
      assert.strictEqual(res1.status, 200);

      const p2 = { deviceId: 'ESP8266-LEGACY-2', patientId: 2, bmpTemp: 28.0 };
      const res2 = await axios.post(`${BASE_URL}/api/hardware/telemetry`, p2);
      assert.strictEqual(res2.status, 200);
    });

  } finally {
    await teardownServers();
  }

  console.log(`\n====================================================`);
  console.log(` Test Summary: ${passedTests} passed, ${failedTests} failed`);
  console.log(`====================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
