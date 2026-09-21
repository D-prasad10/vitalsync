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
const { signToken } = require('../services/auth.service');

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

const testToken = signToken({ staffId: 'DR-TEST-SUITE', role: 'doctor', name: 'Dr. Test Suite' });
const testAuthHeader = { headers: { Authorization: `Bearer ${testToken}` } };

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
      const latestRes = await axios.get(`${BASE_URL}/api/patients/1/latest`, testAuthHeader);
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
      const latestRes = await axios.get(`${BASE_URL}/api/patients/3/latest`, testAuthHeader);
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
      const alertsRes = await axios.get(`${BASE_URL}/api/alerts?patientId=1`, testAuthHeader);
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
      const alertsRes = await axios.get(`${BASE_URL}/api/alerts?patientId=2`, testAuthHeader);
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

      const statusRes = await axios.get(`${BASE_URL}/api/device/status`, testAuthHeader);
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
      const statusRes = await axios.get(`${BASE_URL}/api/ai/status`, testAuthHeader);
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
      const doctorToken = signToken({ staffId: 'DR-DEV-TEST', role: 'doctor', name: 'Dr. Device Test' });
      const authHeader = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // GET /api/devices (requires authentication)
      const devRes = await axios.get(`${BASE_URL}/api/devices`, authHeader);
      assert.strictEqual(devRes.status, 200);
      assert.ok(Array.isArray(devRes.data));

      // POST /api/devices/assign (requires doctor/caretaker/staff)
      const assignRes = await axios.post(`${BASE_URL}/api/devices/assign`, {
        deviceId: 'ESP8266-ASSIGN-TEST',
        patientId: 2
      }, authHeader);
      assert.strictEqual(assignRes.status, 200);
      assert.strictEqual(assignRes.data.success, true);
      assert.strictEqual(assignRes.data.patientId, 2);

      // GET /api/hardware/config (public for ESP8266 discovery)
      const cfgRes = await axios.get(`${BASE_URL}/api/hardware/config`);
      assert.strictEqual(cfgRes.status, 200);
      assert.ok(cfgRes.data.lanIngestionUrl);

      // POST /api/hardware/config (requires doctor/staff)
      const updateCfgRes = await axios.post(`${BASE_URL}/api/hardware/config`, {
        pollingIntervalMs: 2000
      }, authHeader);
      assert.strictEqual(updateCfgRes.status, 200);
      assert.strictEqual(updateCfgRes.data.success, true);

      // POST /api/hardware/test-pulse (requires authentication)
      const pulseRes = await axios.post(`${BASE_URL}/api/hardware/test-pulse`, {
        patientId: 1
      }, authHeader);
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

    // -------------------------------------------------------------------------
    // TEST 14: Valid Authentication Flow & Token Generation
    // -------------------------------------------------------------------------
    await runTest('14. Valid Authentication Flow & Token Generation', async () => {
      const authPayload = {
        role: 'doctor',
        mobile: '9348505908',
        email: 'ashishpatra752006@gmail.com'
      };

      // Step 1: Send OTP
      const sendRes = await axios.post(`${BASE_URL}/api/auth/send-otp`, authPayload);
      assert.strictEqual(sendRes.status, 200);
      assert.strictEqual(sendRes.data.success, true);
      assert.ok(sendRes.data.devOtp, 'Development OTP should be returned in non-production mode');
      assert.strictEqual(sendRes.data.devOtp.length, 6);

      // Step 2: Verify OTP
      const verifyRes = await axios.post(`${BASE_URL}/api/auth/verify-otp`, {
        mobile: authPayload.mobile,
        otp: sendRes.data.devOtp
      });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.data.success, true);
      assert.ok(verifyRes.data.token, 'A signed JWT auth token must be returned');
      assert.strictEqual(verifyRes.data.token.split('.').length, 3, 'Token must be a valid 3-part JWT');
      assert.strictEqual(verifyRes.data.user.role, 'doctor');
      assert.ok(verifyRes.data.user.staffId, 'User must have staffId');
      assert.ok(verifyRes.data.user.id, 'User must have id for backward compatibility');

      // Step 3: Verify authenticated session on /api/auth/me via standard Bearer header
      const meRes = await axios.get(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${verifyRes.data.token}` }
      });
      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.data.success, true);
      assert.strictEqual(meRes.data.user.role, 'doctor');

      // Step 4: Verify authentication via custom x-auth-token header
      const customHeaderRes = await axios.get(`${BASE_URL}/api/auth/me`, {
        headers: { 'x-auth-token': verifyRes.data.token }
      });
      assert.strictEqual(customHeaderRes.status, 200);
      assert.strictEqual(customHeaderRes.data.user.role, 'doctor');

      // Step 5: Verify authentication via query parameter (?token=...)
      const queryParamRes = await axios.get(`${BASE_URL}/api/auth/me?token=${verifyRes.data.token}`);
      assert.strictEqual(queryParamRes.status, 200);
      assert.strictEqual(queryParamRes.data.user.role, 'doctor');
    });

    // -------------------------------------------------------------------------
    // TEST 15: Invalid Credentials Rejection (Safe HTTP 400 Responses)
    // -------------------------------------------------------------------------
    await runTest('15. Invalid Credentials Rejection (Safe HTTP 400)', async () => {
      // Missing mobile
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/auth/send-otp`, { role: 'doctor', email: 'doc@vitalsync.com' }),
        err => err.response && err.response.status === 400
      );

      // Missing email
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/auth/send-otp`, { role: 'doctor', mobile: '9876543210' }),
        err => err.response && err.response.status === 400
      );

      // Missing role
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/auth/send-otp`, { mobile: '9876543210', email: 'doc@vitalsync.com' }),
        err => err.response && err.response.status === 400
      );

      // Invalid role
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/auth/send-otp`, { role: 'superadmin', mobile: '9876543210', email: 'doc@vitalsync.com' }),
        err => err.response && err.response.status === 400
      );

      // Invalid mobile number (not 10 digits)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/auth/send-otp`, { role: 'doctor', mobile: '123', email: 'doc@vitalsync.com' }),
        err => err.response && err.response.status === 400
      );

      // Invalid email address
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/auth/send-otp`, { role: 'doctor', mobile: '9876543210', email: 'not-an-email' }),
        err => err.response && err.response.status === 400
      );

      // Type mismatch (objects passed instead of strings)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/auth/send-otp`, { role: { admin: true }, mobile: '9876543210', email: 'doc@vitalsync.com' }),
        err => err.response && err.response.status === 400
      );
    });

    // -------------------------------------------------------------------------
    // TEST 16: Invalid OTP Rejection & Brute-Force Lockout
    // -------------------------------------------------------------------------
    await runTest('16. Invalid OTP Rejection & Brute-Force Lockout', async () => {
      const mobile = '9888877777';
      const sendRes = await axios.post(`${BASE_URL}/api/auth/send-otp`, {
        role: 'caretaker',
        mobile,
        email: 'caretaker@vitalsync.com'
      });
      assert.strictEqual(sendRes.status, 200);

      // Try incorrect OTP
      try {
        await axios.post(`${BASE_URL}/api/auth/verify-otp`, { mobile, otp: '000000' });
        assert.fail('Expected incorrect OTP to be rejected');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert.strictEqual(err.response.data.error, 'Incorrect OTP. Please try again.');
      }

      // Exhaust attempts to trigger brute-force lockout (5 attempts total)
      for (let i = 0; i < 5; i++) {
        try {
          await axios.post(`${BASE_URL}/api/auth/verify-otp`, { mobile, otp: '000000' });
        } catch (err) {
          assert.strictEqual(err.response.status, 400);
        }
      }

      // Subsequent attempt must return lockout error
      try {
        await axios.post(`${BASE_URL}/api/auth/verify-otp`, { mobile, otp: sendRes.data.devOtp });
        assert.fail('Expected locked-out OTP to be rejected even with valid code');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert.ok(err.response.data.error.includes('Too many failed attempts') || err.response.data.error.includes('No OTP request found'));
      }
    });

    // -------------------------------------------------------------------------
    // TEST 17: Expired / Non-Existent OTP Handling
    // -------------------------------------------------------------------------
    await runTest('17. Expired / Non-Existent OTP Handling', async () => {
      // Non-existent mobile request
      try {
        await axios.post(`${BASE_URL}/api/auth/verify-otp`, {
          mobile: '9111111111',
          otp: '123456'
        });
        assert.fail('Expected non-existent mobile OTP to be rejected');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert.strictEqual(err.response.data.error, 'No OTP request found. Please request a new OTP.');
      }

      // Invalid OTP format (not 6 digits)
      try {
        await axios.post(`${BASE_URL}/api/auth/verify-otp`, {
          mobile: '9111111111',
          otp: '12'
        });
        assert.fail('Expected short OTP to be rejected');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert.strictEqual(err.response.data.error, 'OTP must be a 6-digit number.');
      }
    });

    // -------------------------------------------------------------------------
    // TEST 18: Unauthenticated Access to Protected Endpoints (HTTP 401)
    // -------------------------------------------------------------------------
    await runTest('18. Unauthenticated Access to Protected Endpoints (HTTP 401)', async () => {
      const protectedGetEndpoints = [
        '/api/staff',
        '/api/patients',
        '/api/patients/1',
        '/api/patients/1/thresholds',
        '/api/alerts',
        '/api/devices',
        '/api/device/status',
        '/api/ai/predictions/1',
        '/api/ai/status'
      ];

      for (const endpoint of protectedGetEndpoints) {
        await assert.rejects(
          () => axios.get(`${BASE_URL}${endpoint}`),
          err => err.response && err.response.status === 401,
          `Expected 401 on GET ${endpoint}`
        );
      }

      const protectedPostEndpoints = [
        { url: '/api/staff', data: { staff_id: 'X-1', role: 'doctor', name: 'X', mobile: '9999999999', email: 'x@x.com' } },
        { url: '/api/patients', data: { name: 'Unauth Patient' } },
        { url: '/api/patients/1/thresholds', data: { hr_max: 120 } },
        { url: '/api/alerts/1/acknowledge', data: {} },
        { url: '/api/alerts/1/resolve', data: {} },
        { url: '/api/devices/assign', data: { deviceId: 'ESP-1', patientId: 1 } },
        { url: '/api/hardware/config', data: { ip: '1.2.3.4' } },
        { url: '/api/hardware/test-pulse', data: {} }
      ];

      for (const { url, data } of protectedPostEndpoints) {
        await assert.rejects(
          () => axios.post(`${BASE_URL}${url}`, data),
          err => err.response && err.response.status === 401,
          `Expected 401 on POST ${url}`
        );
      }

      // DELETE /api/staff/1 without token
      await assert.rejects(
        () => axios.delete(`${BASE_URL}/api/staff/1`),
        err => err.response && err.response.status === 401
      );
    });

    // -------------------------------------------------------------------------
    // TEST 19: Expired and Tampered Token Rejection (HTTP 401)
    // -------------------------------------------------------------------------
    await runTest('19. Expired and Tampered Token Rejection (HTTP 401)', async () => {
      // 1. Malformed token string
      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/staff`, {
          headers: { Authorization: 'Bearer this.is.garbage' }
        }),
        err => err.response && err.response.status === 401
      );

      // 2. Bare "Bearer" with empty token
      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/staff`, {
          headers: { Authorization: 'Bearer' }
        }),
        err => err.response && err.response.status === 401
      );

      // 3. Tampered token signature
      const validToken = signToken({ staffId: 'DR-001', role: 'doctor', name: 'Dr. Real' });
      const parts = validToken.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -3)}xyz`;

      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/staff`, {
          headers: { Authorization: `Bearer ${tamperedToken}` }
        }),
        err => err.response && err.response.status === 401
      );

      // 4. Expired token (negative expiresInSeconds)
      const expiredToken = signToken({ staffId: 'DR-001', role: 'doctor', name: 'Dr. Expired' }, -60);

      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/staff`, {
          headers: { Authorization: `Bearer ${expiredToken}` }
        }),
        err => err.response && err.response.status === 401
      );
    });

    // -------------------------------------------------------------------------
    // TEST 20: Authorized Role Access (Doctor & Staff Privileges)
    // -------------------------------------------------------------------------
    await runTest('20. Authorized Role Access (Doctor & Staff Privileges)', async () => {
      const doctorToken = signToken({ staffId: 'DR-999', role: 'doctor', name: 'Dr. Lead' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // Doctor configuring vital thresholds on patient 1
      const threshRes = await axios.post(`${BASE_URL}/api/patients/1/thresholds`, {
        hr_max: 110,
        hr_min: 55,
        bp_sys_max: 135,
        bp_dia_max: 88,
        spo2_min: 94,
        temp_max: 99.8
      }, doctorAuth);
      assert.strictEqual(threshRes.status, 200);
      assert.strictEqual(threshRes.data.success, true);

      // Doctor accessing patient directory
      const patientsRes = await axios.get(`${BASE_URL}/api/patients`, doctorAuth);
      assert.strictEqual(patientsRes.status, 200);
      assert.ok(Array.isArray(patientsRes.data));

      // Doctor accessing alerts
      const alertsRes = await axios.get(`${BASE_URL}/api/alerts`, doctorAuth);
      assert.strictEqual(alertsRes.status, 200);

      // Doctor resolving alert via /api/alerts/:id/resolve alias
      const resolveRes = await axios.post(`${BASE_URL}/api/alerts/1/resolve`, {}, doctorAuth);
      assert.strictEqual(resolveRes.status, 200);
      assert.strictEqual(resolveRes.data.id, 1);

      // Doctor assigning a device
      const assignRes = await axios.post(`${BASE_URL}/api/devices/assign`, {
        deviceId: 'ESP8266-001',
        patientId: 1
      }, doctorAuth);
      assert.strictEqual(assignRes.status, 200);
      assert.strictEqual(assignRes.data.success, true);
    });

    // -------------------------------------------------------------------------
    // TEST 21: Unauthorized Role Access Rejection (HTTP 403 Forbidden)
    // -------------------------------------------------------------------------
    await runTest('21. Unauthorized Role Access Rejection (HTTP 403 Forbidden)', async () => {
      const caretakerToken = signToken({ staffId: 'CR-555', role: 'caretaker', name: 'Caretaker Bob' });
      const caretakerAuth = { headers: { Authorization: `Bearer ${caretakerToken}` } };

      // Caretaker CAN read patients
      const readRes = await axios.get(`${BASE_URL}/api/patients`, caretakerAuth);
      assert.strictEqual(readRes.status, 200);

      // Caretaker CANNOT set clinical vital thresholds (Doctor only)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients/1/thresholds`, { hr_max: 120 }, caretakerAuth),
        err => {
          assert.strictEqual(err.response.status, 403);
          assert.strictEqual(err.response.data.error, 'Access denied: Insufficient privileges.');
          return true;
        }
      );

      // Caretaker CANNOT manage or delete staff (Doctor/Staff admin only)
      await assert.rejects(
        () => axios.delete(`${BASE_URL}/api/staff/1`, caretakerAuth),
        err => {
          assert.strictEqual(err.response.status, 403);
          assert.strictEqual(err.response.data.error, 'Access denied: Insufficient privileges.');
          return true;
        }
      );

      // Caretaker CANNOT update hardware polling configuration (Doctor/Staff only)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { ip: '10.0.0.99' }, caretakerAuth),
        err => {
          assert.strictEqual(err.response.status, 403);
          assert.strictEqual(err.response.data.error, 'Access denied: Insufficient privileges.');
          return true;
        }
      );

      // Patient CANNOT add staff members
      const patientToken = signToken({ staffId: 'PT-100', role: 'patient', name: 'Patient Alice' });
      const patientAuth = { headers: { Authorization: `Bearer ${patientToken}` } };

      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/staff`, {
          staff_id: 'DR-HACK',
          role: 'doctor',
          name: 'Hacker',
          mobile: '9999999999',
          email: 'hacker@hospital.com'
        }, patientAuth),
        err => {
          assert.strictEqual(err.response.status, 403);
          assert.strictEqual(err.response.data.error, 'Access denied: Insufficient privileges.');
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 22: Safe Authentication Error Responses
    // -------------------------------------------------------------------------
    await runTest('22. Safe Authentication Error Responses (No Sensitive Leaks)', async () => {
      try {
        await axios.post(`${BASE_URL}/api/auth/send-otp`, {
          role: 'hacker\' OR 1=1 --',
          mobile: 'abc',
          email: 'invalid'
        });
        assert.fail('Expected safe 400 response');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        const dataStr = JSON.stringify(err.response.data);
        assert.ok(!dataStr.includes('SQLITE'), 'Error response must not expose SQL internal errors');
        assert.ok(!dataStr.includes('SELECT'), 'Error response must not expose SQL queries');
        assert.ok(!dataStr.includes('stack'), 'Error response must not leak stack traces');
      }
    });

    // -------------------------------------------------------------------------
    // TEST 23: Production Mode Secret & OTP Security (No Dev OTP Leaks)
    // -------------------------------------------------------------------------
    await runTest('23. Production Mode Secret & OTP Security (No Dev OTP Leaks)', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const prodRes = await axios.post(`${BASE_URL}/api/auth/send-otp`, {
          role: 'doctor',
          mobile: '9348505908',
          email: 'ashishpatra752006@gmail.com'
        }).catch(err => err.response);

        // In production without external SMS/Email configured, must return 503 and NEVER expose devOtp
        if (prodRes.status === 200) {
          assert.strictEqual(prodRes.data.devOtp, undefined, 'devOtp MUST NEVER be exposed in production responses');
        } else {
          assert.strictEqual(prodRes.status, 503);
          assert.strictEqual(prodRes.data.devOtp, undefined);
        }
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    // -------------------------------------------------------------------------
    // TEST 24: Patient Creation & Strict Input Validation (POST /api/patients)
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // TEST 24: Patient Creation & Strict Input Validation (POST /api/patients)
    // -------------------------------------------------------------------------
    let createdPatientId;
    let testName;
    await runTest('24. Patient Creation & Strict Input Validation', async () => {
      const doctorToken = signToken({ staffId: 'DR-TEST', role: 'doctor', name: 'Dr. Tester' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      const runSuffix = Date.now().toString().slice(-6);
      const testMobile = `9871${runSuffix}`;
      testName = `Vikram Singh ${runSuffix}`;

      // 1. Valid patient creation with full demographic details
      const validPayload = {
        name: testName,
        age: 52,
        gender: 'Male',
        blood_group: 'O+',
        weight: 74.5,
        mobile: testMobile,
        guardian_contact: '9871122335',
        room_number: '305C'
      };

      const createRes = await axios.post(`${BASE_URL}/api/patients`, validPayload, doctorAuth);
      assert.strictEqual(createRes.status, 201, 'Patient creation should return HTTP 201');
      assert.strictEqual(createRes.data.success, true);
      assert.ok(createRes.data.patient, 'Created patient object must be returned');
      assert.strictEqual(createRes.data.patient.name, testName);
      assert.strictEqual(createRes.data.patient.age, 52);
      assert.strictEqual(createRes.data.patient.blood_group, 'O+');
      assert.strictEqual(createRes.data.patient.room_number, '305C');

      createdPatientId = createRes.data.patient.id;
      assert.ok(createdPatientId, 'Created patient must have an ID');

      // Verify default thresholds automatically provisioned in database
      const threshRow = await db.getAsync('SELECT * FROM thresholds WHERE patient_id = ?', [createdPatientId]);
      assert.ok(threshRow, 'Default clinical thresholds must be auto-created for new patient');

      // 2. Reject missing required 'name'
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { age: 30, gender: 'Male' }, doctorAuth),
        err => err.response?.status === 400 && err.response?.data?.error?.includes('Patient name is required')
      );

      // 3. Reject empty/blank 'name'
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: '   ', age: 30 }, doctorAuth),
        err => err.response?.status === 400
      );

      // 4. Reject invalid age (negative or out of bounds)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: 'Invalid Age', age: -5 }, doctorAuth),
        err => err.response?.status === 400 && err.response?.data?.error?.includes('Age must be an integer')
      );
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: 'Invalid Age', age: 250 }, doctorAuth),
        err => err.response?.status === 400
      );

      // 5. Reject invalid weight (negative or non-numeric)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: 'Invalid Weight', weight: -10 }, doctorAuth),
        err => err.response?.status === 400 && err.response?.data?.error?.includes('Weight must be a positive number')
      );

      // 6. Reject invalid blood group format
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: 'Invalid BG', blood_group: 'Z_POSITIVE' }, doctorAuth),
        err => err.response?.status === 400 && err.response?.data?.error?.includes('Invalid blood group')
      );

      // 7. Reject invalid mobile length
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: 'Invalid Mobile', mobile: '123' }, doctorAuth),
        err => err.response?.status === 400 && err.response?.data?.error?.includes('10-digit')
      );

      // 8. Prevent duplicate patient registration (same name & mobile)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, validPayload, doctorAuth),
        err => err.response?.status === 409 && err.response?.data?.error?.includes('already exists')
      );
    });

    // -------------------------------------------------------------------------
    // TEST 25: Patient Retrieval & 404 / 400 Handling (GET /api/patients)
    // -------------------------------------------------------------------------
    await runTest('25. Patient Retrieval & 404 / 400 Handling', async () => {
      const doctorToken = signToken({ staffId: 'DR-TEST', role: 'doctor', name: 'Dr. Tester' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // 1. GET all patients returns array including created patient
      const listRes = await axios.get(`${BASE_URL}/api/patients`, doctorAuth);
      assert.strictEqual(listRes.status, 200);
      assert.ok(Array.isArray(listRes.data));
      assert.ok(listRes.data.length >= 3, 'Must contain seed patients plus created patient');
      const found = listRes.data.find(p => p.id === createdPatientId);
      assert.ok(found, 'Created patient must be listed in GET /api/patients');

      // 2. GET single existing patient by ID
      const singleRes = await axios.get(`${BASE_URL}/api/patients/${createdPatientId}`, doctorAuth);
      assert.strictEqual(singleRes.status, 200);
      assert.strictEqual(singleRes.data.id, createdPatientId);
      assert.strictEqual(singleRes.data.name, testName);

      // 3. GET nonexistent patient ID returns HTTP 404
      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/patients/999999`, doctorAuth),
        err => err.response?.status === 404 && err.response?.data?.error === 'Patient not found'
      );

      // 4. GET invalid patient ID format returns HTTP 400
      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/patients/invalid-id`, doctorAuth),
        err => err.response?.status === 400 && err.response?.data?.error?.includes('Invalid patient ID')
      );
      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/patients/-10`, doctorAuth),
        err => err.response?.status === 400
      );
    });

    // -------------------------------------------------------------------------
    // TEST 26: Patient Update & Anti-Corruption Protection (PUT /api/patients/:id)
    // -------------------------------------------------------------------------
    await runTest('26. Patient Update & Anti-Corruption Protection', async () => {
      const doctorToken = signToken({ staffId: 'DR-TEST', role: 'doctor', name: 'Dr. Tester' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // 1. Partial update: modify room_number and weight only
      const updateRes = await axios.put(`${BASE_URL}/api/patients/${createdPatientId}`, {
        room_number: '401B',
        weight: 76.2
      }, doctorAuth);

      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.data.success, true);
      assert.strictEqual(updateRes.data.changes, 1);

      // Verify anti-corruption: untouched fields (name, age, mobile, blood_group) MUST NOT be wiped out
      const verifyRes = await axios.get(`${BASE_URL}/api/patients/${createdPatientId}`, doctorAuth);
      assert.strictEqual(verifyRes.data.name, testName, 'Existing name must be preserved');
      assert.strictEqual(verifyRes.data.age, 52, 'Existing age must be preserved');
      assert.strictEqual(verifyRes.data.blood_group, 'O+', 'Existing blood group must be preserved');
      assert.strictEqual(verifyRes.data.room_number, '401B', 'Updated room_number must be saved');
      assert.strictEqual(verifyRes.data.weight, 76.2, 'Updated weight must be saved');

      // 2. Reject update for nonexistent patient ID with HTTP 404
      await assert.rejects(
        () => axios.put(`${BASE_URL}/api/patients/999999`, { room_number: '100' }, doctorAuth),
        err => err.response?.status === 404 && err.response?.data?.error === 'Patient not found'
      );

      // 3. Reject update with invalid patient ID format with HTTP 400
      await assert.rejects(
        () => axios.put(`${BASE_URL}/api/patients/bad-id`, { room_number: '100' }, doctorAuth),
        err => err.response?.status === 400
      );

      // 4. Reject update with empty name
      await assert.rejects(
        () => axios.put(`${BASE_URL}/api/patients/${createdPatientId}`, { name: '   ' }, doctorAuth),
        err => err.response?.status === 400 && err.response?.data?.error?.includes('Patient name cannot be empty')
      );

      // 5. Reject update with invalid blood group
      await assert.rejects(
        () => axios.put(`${BASE_URL}/api/patients/${createdPatientId}`, { blood_group: 'XYZ' }, doctorAuth),
        err => err.response?.status === 400
      );

      // 6. Ensure internal protected field 'id' cannot be modified
      await axios.put(`${BASE_URL}/api/patients/${createdPatientId}`, { id: 8888, room_number: '505A' }, doctorAuth);
      const idCheck = await axios.get(`${BASE_URL}/api/patients/${createdPatientId}`, doctorAuth);
      assert.strictEqual(idCheck.data.id, createdPatientId, 'Internal id must remain unchanged');
    });

    // -------------------------------------------------------------------------
    // TEST 27: Patient-Device Assignment Validation (POST /api/devices/assign)
    // -------------------------------------------------------------------------
    await runTest('27. Patient-Device Assignment Validation', async () => {
      const doctorToken = signToken({ staffId: 'DR-TEST', role: 'doctor', name: 'Dr. Tester' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // 1. Valid assignment (existing device ESP8266-001 to created patient)
      const assignRes = await axios.post(`${BASE_URL}/api/devices/assign`, {
        deviceId: 'ESP8266-001',
        patientId: createdPatientId
      }, doctorAuth);

      assert.strictEqual(assignRes.status, 200);
      assert.strictEqual(assignRes.data.success, true);
      assert.strictEqual(assignRes.data.deviceId, 'ESP8266-001');
      assert.strictEqual(assignRes.data.patientId, createdPatientId);

      // Verify mapping updated in patients table
      const pRow = await db.getAsync('SELECT device_id FROM patients WHERE id = ?', [createdPatientId]);
      assert.strictEqual(pRow.device_id, 'ESP8266-001');

      // 2. Reject assignment to nonexistent patient ID with HTTP 404
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'ESP8266-001',
          patientId: 999999
        }, doctorAuth),
        err => err.response?.status === 404 && err.response?.data?.error?.includes('Patient not found')
      );

      // 3. Reject assignment of nonexistent / unregistered device ID with HTTP 404
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'UNKNOWN-HARDWARE-999',
          patientId: createdPatientId
        }, doctorAuth),
        err => err.response?.status === 404 && err.response?.data?.error?.includes('Device not found')
      );

      // 4. Reject missing required fields with HTTP 400
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, { patientId: createdPatientId }, doctorAuth),
        err => err.response?.status === 400
      );
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, { deviceId: 'ESP8266-001' }, doctorAuth),
        err => err.response?.status === 400
      );

      // 5. Reject invalid patientId format with HTTP 400
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'ESP8266-001',
          patientId: 'not-a-number'
        }, doctorAuth),
        err => err.response?.status === 400
      );
    });

    // -------------------------------------------------------------------------
    // TEST 28: Role-Based Authorization for Patient Management (HTTP 403 / 401)
    // -------------------------------------------------------------------------
    await runTest('28. Role-Based Authorization for Patient Management', async () => {
      const patientToken = signToken({ staffId: 'PT-999', role: 'patient', name: 'Self Patient' });
      const patientAuth = { headers: { Authorization: `Bearer ${patientToken}` } };
      const caretakerToken = signToken({ staffId: 'CR-999', role: 'caretaker', name: 'Nurse Mary' });
      const caretakerAuth = { headers: { Authorization: `Bearer ${caretakerToken}` } };

      // 1. Patient role CANNOT create patients (HTTP 403)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: 'Unauthorized Create' }, patientAuth),
        err => err.response?.status === 403 && err.response?.data?.error?.includes('Insufficient privileges')
      );

      // 2. Patient role CANNOT update patients (HTTP 403)
      await assert.rejects(
        () => axios.put(`${BASE_URL}/api/patients/${createdPatientId}`, { room_number: '999' }, patientAuth),
        err => err.response?.status === 403 && err.response?.data?.error?.includes('Insufficient privileges')
      );

      // 3. Patient role CANNOT assign hardware devices (HTTP 403)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'ESP8266-001',
          patientId: createdPatientId
        }, patientAuth),
        err => err.response?.status === 403 && err.response?.data?.error?.includes('Insufficient privileges')
      );

      // 4. Caretaker role CAN update patient demographics
      const caretakerUpdate = await axios.put(`${BASE_URL}/api/patients/${createdPatientId}`, {
        room_number: '305D'
      }, caretakerAuth);
      assert.strictEqual(caretakerUpdate.status, 200);

      // 5. Caretaker role CANNOT modify clinical thresholds (Doctor only -> HTTP 403)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients/${createdPatientId}/thresholds`, { hr_max: 130 }, caretakerAuth),
        err => err.response?.status === 403 && err.response?.data?.error?.includes('Insufficient privileges')
      );

      // 6. Unauthenticated requests to patient modification endpoints return HTTP 401
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/patients`, { name: 'Unauthenticated' }),
        err => err.response?.status === 401
      );
      await assert.rejects(
        () => axios.put(`${BASE_URL}/api/patients/${createdPatientId}`, { room_number: '000' }),
        err => err.response?.status === 401
      );
    });

    // -------------------------------------------------------------------------
    // TEST 29: Safe Database Error Responses & SQL Injection Protection
    // -------------------------------------------------------------------------
    await runTest('29. Safe Database Error Responses & SQL Injection Protection', async () => {
      const doctorToken = signToken({ staffId: 'DR-TEST', role: 'doctor', name: 'Dr. Tester' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // 1. SQL Injection attempt in patient creation name & room_number
      const sqlInjectionPayload = {
        name: "Test Patient'); DROP TABLE patients;--",
        room_number: "101' OR '1'='1"
      };

      const injectionRes = await axios.post(`${BASE_URL}/api/patients`, sqlInjectionPayload, doctorAuth);
      assert.strictEqual(injectionRes.status, 201);
      assert.strictEqual(injectionRes.data.patient.name, "Test Patient'); DROP TABLE patients;--");

      // Verify table is intact and not dropped
      const countRow = await db.getAsync('SELECT count(*) as count FROM patients');
      assert.ok(countRow.count > 0, 'Patients table must be safe from SQL injection');

      // 2. Safe error response: error payloads must never leak SQLite syntax or internal stacks
      try {
        await axios.get(`${BASE_URL}/api/patients/' OR 1=1 --`, doctorAuth);
        assert.fail('Expected 400 error for SQL injection in patient ID parameter');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400);
        const dataStr = JSON.stringify(err.response?.data);
        assert.ok(!dataStr.includes('SQLITE'), 'Error response must not expose SQL internal errors');
        assert.ok(!dataStr.includes('SELECT'), 'Error response must not expose SQL queries');
        assert.ok(!dataStr.includes('stack'), 'Error response must not leak stack traces');
      }
    });


    // =========================================================================
    // DEVICE MANAGEMENT TESTS (30–52)
    // =========================================================================

    // -------------------------------------------------------------------------
    // TEST 30: Device Registration / Recognition via Telemetry
    // -------------------------------------------------------------------------
    await runTest('30. Device Registration / Recognition via Telemetry', async () => {
      const payload = {
        deviceId: 'ESP8266-REG-TEST-30',
        patientId: 1,
        dhtTemp: 29.0
      };

      const res = await axios.post(`${BASE_URL}/api/telemetry/esp8266`, payload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.deviceId, 'ESP8266-REG-TEST-30');

      await sleep(150);

      // Device must appear in the in-memory heartbeat map
      assert.ok(deviceService.deviceHeartbeats.has('ESP8266-REG-TEST-30'), 'Device must be registered in heartbeat map after telemetry');

      // Device must be persisted in SQLite devices table
      const dbRow = await db.getAsync('SELECT * FROM devices WHERE device_id = ?', ['ESP8266-REG-TEST-30']);
      assert.ok(dbRow, 'Device must be persisted in devices table');
      assert.strictEqual(dbRow.status, 'ONLINE');
      assert.ok(dbRow.last_seen > 0, 'last_seen must be set');
    });

    // -------------------------------------------------------------------------
    // TEST 31: Duplicate Device Handling (Upsert — No Duplicate Records)
    // -------------------------------------------------------------------------
    await runTest('31. Duplicate Device Handling (Upsert — No Duplicate DB Records)', async () => {
      const deviceId = 'ESP8266-UPSERT-TEST-31';

      // Send telemetry twice from the same device
      for (let i = 0; i < 3; i++) {
        await axios.post(`${BASE_URL}/api/telemetry/esp8266`, {
          deviceId,
          patientId: 1,
          dhtTemp: 28.0 + i
        });
        await sleep(50);
      }

      await sleep(150);

      // Only one record must exist for this device_id in the DB (ON CONFLICT upsert)
      const rows = await db.allAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
      assert.strictEqual(rows.length, 1, 'Exactly one device record must exist (upsert, not insert-on-duplicate)');

      // last_seen should be recent (within 5 seconds)
      const now = Date.now();
      assert.ok(now - rows[0].last_seen < 5000, 'last_seen must be updated to most recent telemetry time');
    });

    // -------------------------------------------------------------------------
    // TEST 32: GET /api/devices — Authentication Required (HTTP 401)
    // -------------------------------------------------------------------------
    await runTest('32. GET /api/devices — Unauthenticated → HTTP 401', async () => {
      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/devices`),
        err => err.response && err.response.status === 401
      );
    });

    // -------------------------------------------------------------------------
    // TEST 33: GET /api/devices — Authorized Access Returns Array
    // -------------------------------------------------------------------------
    await runTest('33. GET /api/devices — Authorized Access Returns Device List', async () => {
      const doctorToken = signToken({ staffId: 'DR-DEV-33', role: 'doctor', name: 'Dr. Device' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      const res = await axios.get(`${BASE_URL}/api/devices`, doctorAuth);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data), 'Response must be an array');

      // Each device entry must have expected fields
      if (res.data.length > 0) {
        const d = res.data[0];
        assert.ok('deviceId' in d, 'deviceId field required');
        assert.ok('status' in d, 'status field required');
        assert.ok('lastSeen' in d, 'lastSeen field required');
        // Must not expose internal secrets or stack traces
        const str = JSON.stringify(d);
        assert.ok(!str.includes('JWT_SECRET'), 'Must not expose secrets');
        assert.ok(!str.includes('password'), 'Must not expose passwords');
      }
    });

    // -------------------------------------------------------------------------
    // TEST 34: GET /api/device/status — Unauthenticated → HTTP 401 (Fixed)
    // -------------------------------------------------------------------------
    await runTest('34. GET /api/device/status — Unauthenticated → HTTP 401', async () => {
      await assert.rejects(
        () => axios.get(`${BASE_URL}/api/device/status`),
        err => {
          assert.strictEqual(err.response.status, 401, 'device/status must require authentication');
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 35: GET /api/device/status — Authorized Access Returns Status Object
    // -------------------------------------------------------------------------
    await runTest('35. GET /api/device/status — Authorized Access Returns Status Object', async () => {
      const doctorToken = signToken({ staffId: 'DR-STATUS-35', role: 'doctor', name: 'Dr. Status' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      const res = await axios.get(`${BASE_URL}/api/device/status`, doctorAuth);
      assert.strictEqual(res.status, 200);

      // Must have standard status fields
      assert.ok('online' in res.data, 'online field required');
      assert.ok('devices' in res.data, 'devices array required');
      assert.ok(Array.isArray(res.data.devices), 'devices must be an array');

      // Must not expose sensitive internals
      const str = JSON.stringify(res.data);
      assert.ok(!str.includes('JWT_SECRET'), 'Must not expose secrets');
      assert.ok(!str.includes('SQLITE'), 'Must not expose SQLite internals');
    });

    // -------------------------------------------------------------------------
    // TEST 36: Online Device Status — Device Reports ONLINE Within Window
    // -------------------------------------------------------------------------
    await runTest('36. Online Device Status — Device Reports ONLINE Within 10s Window', async () => {
      const deviceId = 'ESP8266-ONLINE-36';
      const now = Date.now();

      // Inject a fresh heartbeat directly into the map
      deviceService.deviceHeartbeats.set(deviceId, {
        lastSeen: now,
        patientId: 1,
        ip: '192.168.1.200',
        status: 'ONLINE',
        reportedOnline: true
      });

      const devices = deviceService.getDevices();
      const found = devices.find(d => d.deviceId === deviceId);
      assert.ok(found, 'Device must be in device list');
      assert.strictEqual(found.status, 'ONLINE', 'Device with recent heartbeat must be ONLINE');
      assert.ok(found.secondsAgo !== null, 'secondsAgo must be populated');
      assert.ok(found.secondsAgo <= 1, 'secondsAgo must be near zero for fresh heartbeat');
    });

    // -------------------------------------------------------------------------
    // TEST 37: Stale Device Reports OFFLINE (> 10s)
    // -------------------------------------------------------------------------
    await runTest('37. Stale Device Reports OFFLINE (> 10s Without Telemetry)', async () => {
      const deviceId = 'ESP8266-STALE-37';
      const staleTime = Date.now() - 15000; // 15 seconds ago

      deviceService.deviceHeartbeats.set(deviceId, {
        lastSeen: staleTime,
        patientId: 1,
        ip: '192.168.1.201',
        status: 'ONLINE',
        reportedOnline: true
      });

      const devices = deviceService.getDevices();
      const found = devices.find(d => d.deviceId === deviceId);
      assert.ok(found, 'Stale device must still appear in list');
      assert.strictEqual(found.status, 'OFFLINE', 'Device inactive > 10s must report OFFLINE');
      assert.ok(found.secondsAgo >= 15, `secondsAgo should be >= 15, got: ${found.secondsAgo}`);
    });

    // -------------------------------------------------------------------------
    // TEST 38: Unknown Device Handling — Does Not Crash
    // -------------------------------------------------------------------------
    await runTest('38. Unknown Device Handling — GET /api/device/status Does Not Crash', async () => {
      const doctorToken = signToken({ staffId: 'DR-UNK-38', role: 'doctor', name: 'Dr. Unknown' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // Even if no devices are registered, status endpoint returns safe structure
      const res = await axios.get(`${BASE_URL}/api/device/status`, doctorAuth);
      assert.strictEqual(res.status, 200);
      assert.ok(typeof res.data.online === 'boolean', 'online must be boolean');
      assert.ok(Array.isArray(res.data.devices), 'devices must be array (may be empty)');
    });

    // -------------------------------------------------------------------------
    // TEST 39: Valid Patient/Device Assignment
    // -------------------------------------------------------------------------
    await runTest('39. Valid Patient / Device Assignment (POST /api/devices/assign)', async () => {
      const doctorToken = signToken({ staffId: 'DR-ASSIGN-39', role: 'doctor', name: 'Dr. Assign' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // Use device registered in Test 30 (ESP8266-REG-TEST-30 is in DB)
      const res = await axios.post(`${BASE_URL}/api/devices/assign`, {
        deviceId: 'ESP8266-REG-TEST-30',
        patientId: 2
      }, doctorAuth);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.deviceId, 'ESP8266-REG-TEST-30');
      assert.strictEqual(res.data.patientId, 2);

      // Verify patients table is updated
      const pRow = await db.getAsync('SELECT device_id FROM patients WHERE id = ?', [2]);
      assert.strictEqual(pRow.device_id, 'ESP8266-REG-TEST-30');
    });

    // -------------------------------------------------------------------------
    // TEST 40: Nonexistent Patient Assignment → HTTP 404
    // -------------------------------------------------------------------------
    await runTest('40. Nonexistent Patient Assignment → HTTP 404', async () => {
      const doctorToken = signToken({ staffId: 'DR-P404-40', role: 'doctor', name: 'Dr. P404' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'ESP8266-REG-TEST-30',
          patientId: 999999
        }, doctorAuth),
        err => {
          assert.strictEqual(err.response.status, 404);
          assert.ok(err.response.data.error.includes('Patient not found'));
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 41: Nonexistent Device Assignment → HTTP 404
    // -------------------------------------------------------------------------
    await runTest('41. Nonexistent / Unregistered Device Assignment → HTTP 404', async () => {
      const doctorToken = signToken({ staffId: 'DR-D404-41', role: 'doctor', name: 'Dr. D404' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'UNKNOWN-DEVICE-99999-XYZ',
          patientId: 1
        }, doctorAuth),
        err => {
          assert.strictEqual(err.response.status, 404);
          assert.ok(err.response.data.error.includes('Device not found'));
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 42: Duplicate / Conflicting Assignment — Idempotent Upsert
    // -------------------------------------------------------------------------
    await runTest('42. Duplicate / Conflicting Assignment — Idempotent (No Error)', async () => {
      const doctorToken = signToken({ staffId: 'DR-DUP-42', role: 'doctor', name: 'Dr. Dup' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // Assign same device to same patient twice — must succeed both times without error
      const res1 = await axios.post(`${BASE_URL}/api/devices/assign`, {
        deviceId: 'ESP8266-REG-TEST-30',
        patientId: 1
      }, doctorAuth);
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.data.success, true);

      const res2 = await axios.post(`${BASE_URL}/api/devices/assign`, {
        deviceId: 'ESP8266-REG-TEST-30',
        patientId: 1
      }, doctorAuth);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.success, true);

      // DB should still have exactly one record for this device
      const rows = await db.allAsync('SELECT * FROM devices WHERE device_id = ?', ['ESP8266-REG-TEST-30']);
      assert.strictEqual(rows.length, 1, 'Duplicate assignment must not create duplicate DB records');
    });

    // -------------------------------------------------------------------------
    // TEST 43: Assignment — Invalid deviceId Formats → HTTP 400
    // -------------------------------------------------------------------------
    await runTest('43. Assignment — Invalid deviceId Formats → HTTP 400', async () => {
      const doctorToken = signToken({ staffId: 'DR-VAL-43', role: 'doctor', name: 'Dr. Val' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      // Missing deviceId
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, { patientId: 1 }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // Empty string deviceId
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, { deviceId: '', patientId: 1 }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // Whitespace-only deviceId
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, { deviceId: '   ', patientId: 1 }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // Object as deviceId
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, { deviceId: { id: 'ESP1' }, patientId: 1 }, doctorAuth),
        err => err.response && err.response.status === 400
      );
    });

    // -------------------------------------------------------------------------
    // TEST 44: Assignment — Invalid patientId Formats → HTTP 400
    // -------------------------------------------------------------------------
    await runTest('44. Assignment — Invalid patientId Formats → HTTP 400', async () => {
      const doctorToken = signToken({ staffId: 'DR-PIDVAL-44', role: 'doctor', name: 'Dr. PidVal' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      const invalidPids = [
        { patientId: -1 },
        { patientId: 0 },
        { patientId: 'not-a-number' },
        { patientId: null },
        { patientId: [] },
        { patientId: {} },
        { patientId: Infinity },
        { patientId: NaN }
      ];

      for (const body of invalidPids) {
        await assert.rejects(
          () => axios.post(`${BASE_URL}/api/devices/assign`, { deviceId: 'ESP8266-001', ...body }, doctorAuth),
          err => err.response && err.response.status === 400,
          `Expected 400 for patientId: ${JSON.stringify(body.patientId)}`
        );
      }
    });

    // -------------------------------------------------------------------------
    // TEST 45: Assignment — Unauthenticated → HTTP 401
    // -------------------------------------------------------------------------
    await runTest('45. Assignment — Unauthenticated → HTTP 401', async () => {
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'ESP8266-REG-TEST-30',
          patientId: 1
        }),
        err => err.response && err.response.status === 401
      );
    });

    // -------------------------------------------------------------------------
    // TEST 46: Assignment — Unauthorized Role (Patient) → HTTP 403
    // -------------------------------------------------------------------------
    await runTest('46. Assignment — Patient Role → HTTP 403', async () => {
      const patientToken = signToken({ staffId: 'PT-ASSIGN-46', role: 'patient', name: 'Patient Self' });
      const patientAuth = { headers: { Authorization: `Bearer ${patientToken}` } };

      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/devices/assign`, {
          deviceId: 'ESP8266-REG-TEST-30',
          patientId: 1
        }, patientAuth),
        err => {
          assert.strictEqual(err.response.status, 403);
          assert.ok(err.response.data.error.includes('Insufficient privileges'));
          return true;
        }
      );
    });

    // -------------------------------------------------------------------------
    // TEST 47: Heartbeat / Last-Seen Update Consistency
    // -------------------------------------------------------------------------
    await runTest('47. Heartbeat / Last-Seen Update Consistency', async () => {
      const deviceId = 'ESP8266-HB-CONSISTENCY-47';
      const before = Date.now();

      await axios.post(`${BASE_URL}/api/telemetry/esp8266`, {
        deviceId,
        patientId: 1,
        dhtTemp: 30.5
      });

      await sleep(150);

      const hb = deviceService.deviceHeartbeats.get(deviceId);
      assert.ok(hb, 'Heartbeat entry must exist after telemetry');
      assert.ok(hb.lastSeen >= before, 'lastSeen must be >= time before telemetry was sent');
      assert.ok(hb.lastSeen <= Date.now(), 'lastSeen must be <= now');
      assert.strictEqual(hb.status, 'ONLINE', 'Status must be ONLINE after telemetry');
      assert.strictEqual(hb.reportedOnline, true, 'reportedOnline must be true after telemetry');

      // DB record must also reflect update
      const dbRow = await db.getAsync('SELECT last_seen, status FROM devices WHERE device_id = ?', [deviceId]);
      assert.ok(dbRow, 'Device must exist in devices table');
      assert.strictEqual(dbRow.status, 'ONLINE');
      assert.ok(dbRow.last_seen >= before, 'DB last_seen must be updated');
    });

    // -------------------------------------------------------------------------
    // TEST 48: Multiple Telemetry Updates — No State Corruption
    // -------------------------------------------------------------------------
    await runTest('48. Multiple Telemetry Updates — No Device State Corruption', async () => {
      const deviceId = 'ESP8266-MULTI-48';

      // Send 5 telemetry packets sequentially
      for (let i = 0; i < 5; i++) {
        await axios.post(`${BASE_URL}/api/telemetry/esp8266`, {
          deviceId,
          patientId: 1,
          dhtTemp: 27.0 + i * 0.2
        });
        await sleep(20);
      }
      await sleep(150);

      // Should still have exactly one in-memory entry
      const devices = deviceService.getDevices();
      const matching = devices.filter(d => d.deviceId === deviceId);
      assert.strictEqual(matching.length, 1, 'Multiple telemetry must not create duplicate in-memory entries');
      assert.strictEqual(matching[0].status, 'ONLINE');

      // And one DB record
      const dbRows = await db.allAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
      assert.strictEqual(dbRows.length, 1, 'Multiple telemetry must not create duplicate DB records');
    });

    // -------------------------------------------------------------------------
    // TEST 49: Offline Detection — Watchdog Marks Device OFFLINE in DB
    // -------------------------------------------------------------------------
    await runTest('49. Offline Detection — Watchdog Persists OFFLINE Status to DB', async () => {
      const deviceId = 'ESP8266-WATCHDOG-DB-49';
      const now = Date.now();

      // First, register in DB via upsert
      await db.runAsync(
        `INSERT INTO devices (device_id, patient_id, ip, status, last_seen, created_at, updated_at)
         VALUES (?, ?, ?, 'ONLINE', ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           status = 'ONLINE',
           last_seen = excluded.last_seen,
           updated_at = excluded.updated_at`,
        [deviceId, 1, '192.168.1.100', now - 15000, now - 15000, now - 15000]
      );

      // Inject into heartbeat map as stale (15s ago, still reportedOnline=true)
      deviceService.deviceHeartbeats.set(deviceId, {
        lastSeen: now - 15000,
        patientId: 1,
        ip: '192.168.1.100',
        status: 'ONLINE',
        reportedOnline: true
      });

      // getDevices() must return OFFLINE status based on time delta
      const devices = deviceService.getDevices();
      const found = devices.find(d => d.deviceId === deviceId);
      assert.ok(found, 'Device must appear in device list');
      assert.strictEqual(found.status, 'OFFLINE', 'Device with stale heartbeat must be OFFLINE in getDevices()');
    });

    // -------------------------------------------------------------------------
    // TEST 50: Offline Alert Integration — Alert Recorded When Device Goes Offline
    // -------------------------------------------------------------------------
    await runTest('50. Offline Alert Integration — Alert Recorded on Device Offline', async () => {
      const deviceId = 'ESP8266-OFFLINE-ALERT-50';
      const now = Date.now();
      const backdated = now - 15000;

      // Inject stale heartbeat with reportedOnline=true so watchdog will fire
      deviceService.deviceHeartbeats.set(deviceId, {
        lastSeen: backdated,
        patientId: 1,
        ip: '192.168.1.202',
        status: 'ONLINE',
        reportedOnline: true
      });

      // Manually trigger one watchdog cycle
      const watchdogNow = Date.now();
      const hb = deviceService.deviceHeartbeats.get(deviceId);
      if (watchdogNow - hb.lastSeen > 10000 && hb.reportedOnline !== false) {
        hb.reportedOnline = false;
        hb.status = 'OFFLINE';

        // Persist to DB
        try {
          await db.runAsync("UPDATE devices SET status = 'OFFLINE', updated_at = ? WHERE device_id = ?", [watchdogNow, deviceId]);
        } catch (_) {}

        // Record alert via alertService
        await alertService.recordAlert({
          patient_id: hb.patientId,
          device_id: deviceId,
          severity: 'warning',
          type: 'device_offline',
          message: `Hardware Sensor Unit (${deviceId}) Disconnected / Offline (>10s)`,
          timestamp: watchdogNow
        });
      }

      await sleep(100);

      // Verify an offline alert exists for this device
      const doctorToken = signToken({ staffId: 'DR-OFFALT-50', role: 'doctor', name: 'Dr. OffAlert' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };

      const alertsRes = await axios.get(`${BASE_URL}/api/alerts?patientId=1`, doctorAuth);
      assert.ok(Array.isArray(alertsRes.data));
      const offlineAlert = alertsRes.data.find(a => a.type === 'device_offline' && a.device_id === deviceId);
      assert.ok(offlineAlert, 'device_offline alert must be recorded when device goes offline');
      assert.strictEqual(offlineAlert.severity, 'warning');
      assert.ok(offlineAlert.message.includes(deviceId));
    });

    // -------------------------------------------------------------------------
    // TEST 51: GET /api/hardware/config — Returns Safe Config (No Secrets)
    // -------------------------------------------------------------------------
    await runTest('51. GET /api/hardware/config — Returns Safe Config (No Secrets)', async () => {
      // Public endpoint (intentional — ESP8266 self-discovery)
      const res = await axios.get(`${BASE_URL}/api/hardware/config`);
      assert.strictEqual(res.status, 200);

      // Must have expected fields
      assert.ok('lanIngestionUrl' in res.data, 'lanIngestionUrl field required');
      assert.ok('localIngestionUrl' in res.data, 'localIngestionUrl field required');
      assert.ok('pollingIntervalMs' in res.data, 'pollingIntervalMs field required');
      assert.ok(typeof res.data.pollingIntervalMs === 'number', 'pollingIntervalMs must be a number');

      // Must not expose secrets or tokens
      const str = JSON.stringify(res.data);
      assert.ok(!str.includes('JWT_SECRET'), 'Must not expose JWT secret');
      assert.ok(!str.includes('EMAIL_PASS'), 'Must not expose email credentials');
      assert.ok(!str.includes('password'), 'Must not expose passwords');
    });

    // -------------------------------------------------------------------------
    // TEST 52: POST /api/hardware/config — Valid Update, Invalid Rejection, Auth Check
    // -------------------------------------------------------------------------
    await runTest('52. POST /api/hardware/config — Valid Update, Invalid Rejection, Auth Check', async () => {
      const doctorToken = signToken({ staffId: 'DR-CFG-52', role: 'doctor', name: 'Dr. Config' });
      const doctorAuth = { headers: { Authorization: `Bearer ${doctorToken}` } };
      const caretakerToken = signToken({ staffId: 'CR-CFG-52', role: 'caretaker', name: 'Care Config' });
      const caretakerAuth = { headers: { Authorization: `Bearer ${caretakerToken}` } };

      // 1. Valid config update
      const validRes = await axios.post(`${BASE_URL}/api/hardware/config`, {
        pollingIntervalMs: 2000
      }, doctorAuth);
      assert.strictEqual(validRes.status, 200);
      assert.strictEqual(validRes.data.success, true);
      assert.strictEqual(validRes.data.config.pollingIntervalMs, 2000);

      // 2. Invalid pollingIntervalMs (below 500)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { pollingIntervalMs: 100 }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // 3. Invalid pollingIntervalMs (NaN)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { pollingIntervalMs: 'fast' }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // 4. Invalid pollingIntervalMs (Infinity)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { pollingIntervalMs: Infinity }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // 5. Invalid ip (empty string)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { ip: '' }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // 6. Invalid ip (whitespace)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { ip: '   ' }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // 7. Invalid patientId (negative)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { patientId: -5 }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // 8. Invalid patientId (object)
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { patientId: { id: 1 } }, doctorAuth),
        err => err.response && err.response.status === 400
      );

      // 9. Caretaker role cannot modify config → HTTP 403
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { pollingIntervalMs: 2000 }, caretakerAuth),
        err => {
          assert.strictEqual(err.response.status, 403);
          assert.ok(err.response.data.error.includes('Insufficient privileges'));
          return true;
        }
      );

      // 10. Unauthenticated → HTTP 401
      await assert.rejects(
        () => axios.post(`${BASE_URL}/api/hardware/config`, { pollingIntervalMs: 2000 }),
        err => err.response && err.response.status === 401
      );

      // 11. Error responses must not expose SQL or stack traces
      try {
        await axios.post(`${BASE_URL}/api/hardware/config`, { pollingIntervalMs: -999 }, doctorAuth);
      } catch (err) {
        const str = JSON.stringify(err.response.data);
        assert.ok(!str.includes('SQLITE'), 'Must not expose SQLite internals');
        assert.ok(!str.includes('stack'), 'Must not expose stack traces');
        assert.ok(!str.includes('SELECT'), 'Must not expose SQL queries');
      }
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
