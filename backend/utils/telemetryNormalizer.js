/**
 * Canonical Telemetry Normalizer for SWASTHYAEDGE.
 *
 * Transforms raw ESP8266 hardware payloads (flat or nested) into the
 * single canonical telemetry model while preserving 100% backward
 * compatibility with frontend Socket.IO listeners and database schemas.
 *
 * CRITICAL MEDICAL RULES:
 * - Blood pressure is strictly null (no hardware BP cuff exists).
 * - Heart rate and SpO2 are strictly null (MAX30100 provides raw IR/RED optical counts).
 * - Raw ECG is waveform data only, not a clinical diagnosis.
 * - MQ135 is an air quality / environmental sensor.
 */

function normalizeTelemetry(raw, clientIp = null, defaultPatientId = 1) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid telemetry payload: must be a JSON object');
  }

  const deviceId = String(raw.deviceId || raw.device_id || 'ESP8266-001').trim();
  const deviceIp = raw.ip || raw.device_ip || clientIp || '192.168.1.1';

  // Determine Patient ID
  let patientId = Number(raw.patientId ?? raw.patient_id);
  if (!patientId || Number.isNaN(patientId) || patientId <= 0) {
    patientId = defaultPatientId;
  }

  const now = Date.now();
  const rawTs = Number(raw.timestamp);
  const timestamp = rawTs && rawTs > 1000000000000 ? rawTs : now;

  // Merge flat body with nested sensors object if provided
  const src = raw.sensors && typeof raw.sensors === 'object' && !Array.isArray(raw.sensors)
    ? { ...raw, ...raw.sensors }
    : raw;

  // 1. Temperature Normalization (DHT11 & BMP280)
  let dhtTemp = null;
  let bmpTemp = null;
  let dhtHumidity = null;
  let bmpPressure = null;

  if (src.dhtTemp !== undefined && src.dhtTemp !== null && !Number.isNaN(Number(src.dhtTemp))) {
    dhtTemp = Number(Number(src.dhtTemp).toFixed(2));
  }
  if (src.bmpTemp !== undefined && src.bmpTemp !== null && !Number.isNaN(Number(src.bmpTemp))) {
    bmpTemp = Number(Number(src.bmpTemp).toFixed(2));
  }
  if (src.humidity !== undefined && src.humidity !== null && !Number.isNaN(Number(src.humidity))) {
    dhtHumidity = Number(Number(src.humidity).toFixed(2));
  }
  if (src.pressure !== undefined && src.pressure !== null && !Number.isNaN(Number(src.pressure))) {
    bmpPressure = Number(Number(src.pressure).toFixed(2));
  }

  // Nested structures support
  if (src.dht11 && typeof src.dht11 === 'object') {
    const t = src.dht11.tempC ?? src.dht11.temperature;
    if (dhtTemp === null && t !== undefined && t !== null && !Number.isNaN(Number(t))) {
      dhtTemp = Number(Number(t).toFixed(2));
    }
    const h = src.dht11.humidity;
    if (dhtHumidity === null && h !== undefined && h !== null && !Number.isNaN(Number(h))) {
      dhtHumidity = Number(Number(h).toFixed(2));
    }
  }

  if (src.bmp280 && typeof src.bmp280 === 'object') {
    const t = src.bmp280.tempC ?? src.bmp280.temperature;
    if (bmpTemp === null && t !== undefined && t !== null && !Number.isNaN(Number(t))) {
      bmpTemp = Number(Number(t).toFixed(2));
    }
    const p = src.bmp280.pressure;
    if (bmpPressure === null && p !== undefined && p !== null && !Number.isNaN(Number(p))) {
      bmpPressure = Number(Number(p).toFixed(2));
    }
  }

  // Primary body temperature calculation (BMP280 has higher resolution; fallback to DHT11)
  const primaryTempC = bmpTemp ?? dhtTemp;
  let tempF = null;
  if (primaryTempC !== null && !Number.isNaN(primaryTempC)) {
    tempF = primaryTempC < 55
      ? Number((primaryTempC * 1.8 + 32).toFixed(1))
      : Number(primaryTempC.toFixed(1));
  }

  const humidity = dhtHumidity;
  const pressure = bmpPressure;

  // 2. AD8232 ECG Normalization (Analog A0 + Digital LO+/LO-)
  let ecgValue = null;
  let leadOffPlus = false;
  let leadOffMinus = false;

  if (src.ecg !== undefined && src.ecg !== null) {
    if (typeof src.ecg === 'object' && !Array.isArray(src.ecg)) {
      const v = src.ecg.value ?? src.ecg.ecg;
      if (v !== undefined && v !== null && !Number.isNaN(Number(v))) {
        ecgValue = Number(v);
      }
      leadOffPlus = Boolean(src.ecg.leadOffPlus ?? src.ecg.loPlus);
      leadOffMinus = Boolean(src.ecg.leadOffMinus ?? src.ecg.loMinus);
    } else if (!Number.isNaN(Number(src.ecg))) {
      ecgValue = Number(src.ecg);
    }
  }

  if (src.loPlus !== undefined) leadOffPlus = Boolean(src.loPlus === 1 || src.loPlus === true || src.loPlus === '1');
  if (src.loMinus !== undefined) leadOffMinus = Boolean(src.loMinus === 1 || src.loMinus === true || src.loMinus === '1');
  if (src.leadOffPlus !== undefined) leadOffPlus = Boolean(src.leadOffPlus);
  if (src.leadOffMinus !== undefined) leadOffMinus = Boolean(src.leadOffMinus);

  // 3. MPU6050 / 6-Axis IMU
  const imuSrc = src.mpu6050 || src.imu || src;
  const accel = imuSrc.accel || imuSrc;
  const gyro = imuSrc.gyro || imuSrc;
  const imu = {
    accX: Number(accel.accX ?? accel.x ?? src.accX ?? 0),
    accY: Number(accel.accY ?? accel.y ?? src.accY ?? 0),
    accZ: Number(accel.accZ ?? accel.z ?? src.accZ ?? 0),
    gyroX: Number(gyro.gyroX ?? gyro.x ?? src.gyroX ?? 0),
    gyroY: Number(gyro.gyroY ?? gyro.y ?? src.gyroY ?? 0),
    gyroZ: Number(gyro.gyroZ ?? gyro.z ?? src.gyroZ ?? 0),
  };

  // 4. MAX30100 Pulse Oximeter: RAW OPTICAL SIGNALS ONLY (IR & RED)
  // CRITICAL RULE: NEVER FABRICATE HEART RATE OR SPO2
  const maxFound = Boolean(
    src.maxFound !== false &&
    src.maxFound !== 0 &&
    (src.max30100?.connected !== false)
  );
  const maxIR = src.maxIR !== undefined && src.maxIR !== null
    ? Number(src.maxIR)
    : (src.max30100?.rawIR !== undefined ? Number(src.max30100.rawIR) : 0);
  const maxRED = src.maxRED !== undefined && src.maxRED !== null
    ? Number(src.maxRED)
    : (src.max30100?.rawRED !== undefined ? Number(src.max30100.rawRED) : 0);

  // 5. MQ-135 Air Quality / Gas Sensor
  // Digital Output: 0 = LOW / Toxic Gas or Smoke Alert, 1 = HIGH / Normal
  let mq135Digital = 1;
  if (src.mq135 !== undefined && src.mq135 !== null) {
    if (typeof src.mq135 === 'object' && !Array.isArray(src.mq135)) {
      mq135Digital = src.mq135.digital ?? (src.mq135.status === 'ALERT' ? 0 : 1);
    } else if (typeof src.mq135 === 'string') {
      mq135Digital = src.mq135.toUpperCase() === 'ALERT' || src.mq135 === '0' ? 0 : 1;
    } else {
      mq135Digital = Number(src.mq135) === 0 ? 0 : 1;
    }
  } else if (src.airQuality?.mq135 !== undefined) {
    mq135Digital = String(src.airQuality.mq135).toUpperCase() === 'ALERT' ? 0 : 1;
  }
  const mq135Status = mq135Digital === 0 ? 'ALERT' : 'NORMAL';

  // 6. NEO-6M/8M GPS
  const gpsSat = Number(src.gpsSat ?? src.gps?.satellites ?? 0);
  const gpsFix = Boolean(src.gpsFix ?? src.gps?.fix ?? (gpsSat >= 4));
  const gpsLat = src.gpsLat != null ? Number(src.gpsLat) : (src.latitude != null ? Number(src.latitude) : (src.gps?.latitude != null ? Number(src.gps.latitude) : null));
  const gpsLng = src.gpsLng != null ? Number(src.gpsLng) : (src.longitude != null ? Number(src.longitude) : (src.gps?.longitude != null ? Number(src.gps.longitude) : null));

  const gps = {
    satellites: gpsSat,
    latitude: gpsLat,
    longitude: gpsLng,
    fix: gpsFix
  };

  // 7. Health Score (derived transparently from available non-null hardware telemetry)
  let totalWeights = 0;
  let earnedScore = 0;

  if (tempF !== null) {
    totalWeights += 40;
    if (tempF >= 97 && tempF <= 99) earnedScore += 40;
    else if (tempF >= 96 && tempF <= 100.4) earnedScore += 25;
  }

  totalWeights += 35;
  if (mq135Status === 'NORMAL') earnedScore += 35;

  totalWeights += 25;
  if (!leadOffPlus && !leadOffMinus) earnedScore += 25;

  const healthScore = totalWeights > 0 ? Math.round((earnedScore / totalWeights) * 100) : 100;

  // Canonical Normalized Model
  return {
    // Canonical Object representations
    device: {
      id: deviceId,
      ip: deviceIp,
      status: 'ONLINE'
    },
    patient: {
      id: patientId
    },

    // Identity & Metadata
    deviceId,
    patient_id: patientId,
    patientId,
    timestamp,
    deviceStatus: 'ONLINE',
    deviceIp,
    ip: deviceIp,

    // Temperatures
    dhtTemp,
    bmpTemp,
    temp: tempF,
    temperature: {
      dht11: dhtTemp,
      bmp280: bmpTemp,
      displayF: tempF
    },

    // Environmental
    humidity,
    pressure,

    // AD8232 ECG
    ecg: {
      value: ecgValue,
      leadOffPlus,
      leadOffMinus,
      leadsConnected: !leadOffPlus && !leadOffMinus
    },
    ecg_val: ecgValue,
    leadOffPlus,
    leadOffMinus,
    loPlus: leadOffPlus ? 1 : 0,
    loMinus: leadOffMinus ? 1 : 0,

    // MAX30100 Optical Raw Signals (strictly un-fabricated)
    maxFound,
    maxIR,
    maxRED,
    max30100: {
      connected: maxFound,
      rawIR: maxIR,
      rawRED: maxRED,
      heartRate: null,
      spo2: null,
      statusText: maxFound ? 'Optical Sensor Online' : 'Sensor Not Detected'
    },

    // Medical Clinical Vitals (strictly null per rules)
    hr: null,
    heartRate: null,
    spo2: null,
    bpSys: null,
    bpDia: null,
    bp: null,

    // MQ-135 Air Quality
    mq135: mq135Status,
    mq135Digital,
    airQuality: {
      mq135: mq135Status,
      digital: mq135Digital
    },

    // 6-Axis IMU
    imu,
    accelX: imu.accX,
    accelY: imu.accY,
    accelZ: imu.accZ,
    gyroX: imu.gyroX,
    gyroY: imu.gyroY,
    gyroZ: imu.gyroZ,

    // GPS
    gps,
    gpsSat,
    gpsFix,
    gps_lat: gpsLat,
    gps_lng: gpsLng,

    // Scoring
    healthScore
  };
}

module.exports = {
  normalizeTelemetry
};
