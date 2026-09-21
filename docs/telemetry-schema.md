# SWASTHYAEDGE Hardware Telemetry Schema

## 1. Overview & Data Flow

```
ESP8266 NodeMCU
      ↓  (HTTP POST /api/telemetry/esp8266 or /data poller)
Backend Ingestion Pipeline
      ↓  (Validator Middleware: HTTP 400 on malformed payloads)
Canonical Normalizer
      ↓  (Zero-fabrication enforcement)
SQLite Database (`sensor_logs`, `devices`, `alerts`)
      ↓  (Asynchronous non-blocking HTTP bridge)
AI Engine (`POST ${AI_ENGINE_URL}/predict`)
      ↓  (Real-time broadcast: global + patient room)
Socket.IO Dashboard Clients
```

---

## 2. Ingestion Format (ESP8266 Payload)

The backend accepts both flat payloads (from ESP8266 `/data` or test pulse) and nested objects.

### Required Identity Fields
- `deviceId` (string, required): Hardware identifier (e.g. `"ESP8266-001"`).
- `patientId` (number, optional): Patient ID. If omitted, falls back to the database-mapped device assignment.

### Supported Sensor Keys

| Key | Type | Description | Unit / Range |
| :--- | :--- | :--- | :--- |
| `dhtTemp` | `number` | DHT11 Ambient Temperature | °C |
| `humidity` | `number` | DHT11 Relative Humidity | % |
| `bmpTemp` | `number` | BMP280 Ambient / Case Temperature | °C |
| `pressure` | `number` | BMP280 Barometric Pressure | hPa |
| `ecg` | `number` or `object` | AD8232 ECG Raw Analog Waveform | 0 – 1023 |
| `loPlus` | `number` or `boolean` | Lead-Off Plus detection | 0 = OK, 1 = Lead Off |
| `loMinus` | `number` or `boolean` | Lead-Off Minus detection | 0 = OK, 1 = Lead Off |
| `mq135` | `number` or `string` | MQ-135 Hazardous Gas / Smoke | 0 / `'ALERT'` = Alert, 1 / `'NORMAL'` = Normal |
| `accX`, `accY`, `accZ` | `number` | MPU6050 3-Axis Accelerometer | Raw LSB |
| `gyroX`, `gyroY`, `gyroZ`| `number` | MPU6050 3-Axis Gyroscope | Raw LSB |
| `maxFound` | `number` or `boolean` | MAX30100 I2C detection status | 0 / 1 |
| `maxIR` | `number` | MAX30100 Raw Optical Infrared Signal | 16-bit counts |
| `maxRED` | `number` | MAX30100 Raw Optical Red Signal | 16-bit counts |
| `gpsSat` | `number` | NEO-6M/8M Satellites in view | Integer count |
| `gpsFix` | `number` or `boolean` | GPS Valid Fix status | 0 / 1 |
| `gpsLat` | `number` | Latitude | Decimal degrees |
| `gpsLng` | `number` | Longitude | Decimal degrees |
| `ip` | `string` | Local Wi-Fi IP address of ESP8266 | IPv4 |
| `timestamp` | `number` | Epoch millisecond timestamp | ms |

---

## 3. Strict Medical Data Integrity Rules

1. **MAX30100 Optical Signals**:
   - MAX30100 acquires raw optical counts (`maxIR` and `maxRED`).
   - The backend **NEVER** fabricates or guesses heart rate (`hr = null`) or SpO2 (`spo2 = null`). Values remain strictly `null` unless authentic mathematical extraction runs.
2. **Blood Pressure**:
   - The hardware possesses **NO blood-pressure cuff or NIBP module**.
   - `bpSys` and `bpDia` are strictly `null`.
3. **ECG Signal**:
   - AD8232 produces raw analog electrical signals. It is not an automated clinical diagnosis.
4. **MQ-135**:
   - MQ-135 is an environmental air-quality / hazardous gas sensor. It indicates ambient safety, not patient disease.
5. **Alerts**:
   - All system alerts are designated as **monitoring, hardware, or environmental alerts**, never medical diagnoses.

---

## 4. Canonical Normalized Model

Every ingested telemetry point is normalized into the following standard schema:

```json
{
  "device": {
    "id": "ESP8266-001",
    "ip": "192.168.1.105",
    "status": "ONLINE"
  },
  "patient": {
    "id": 1
  },
  "deviceId": "ESP8266-001",
  "patientId": 1,
  "patient_id": 1,
  "timestamp": 1726919400000,
  "deviceStatus": "ONLINE",
  "deviceIp": "192.168.1.105",
  "ip": "192.168.1.105",
  "dhtTemp": 28.5,
  "bmpTemp": 28.3,
  "temp": 82.9,
  "temperature": {
    "dht11": 28.5,
    "bmp280": 28.3,
    "displayF": 82.9
  },
  "humidity": 62.0,
  "pressure": 1008.4,
  "ecg": {
    "value": 512,
    "leadOffPlus": false,
    "leadOffMinus": false,
    "leadsConnected": true
  },
  "ecg_val": 512,
  "leadOffPlus": false,
  "leadOffMinus": false,
  "loPlus": 0,
  "loMinus": 0,
  "maxFound": true,
  "maxIR": 18432,
  "maxRED": 15200,
  "max30100": {
    "connected": true,
    "rawIR": 18432,
    "rawRED": 15200,
    "heartRate": null,
    "spo2": null,
    "statusText": "Optical Sensor Online"
  },
  "hr": null,
  "heartRate": null,
  "spo2": null,
  "bpSys": null,
  "bpDia": null,
  "bp": null,
  "mq135": "NORMAL",
  "mq135Digital": 1,
  "airQuality": {
    "mq135": "NORMAL",
    "digital": 1
  },
  "imu": {
    "accX": 120,
    "accY": -30,
    "accZ": 16320,
    "gyroX": 5,
    "gyroY": -2,
    "gyroZ": 1
  },
  "accelX": 120,
  "accelY": -30,
  "accelZ": 16320,
  "gyroX": 5,
  "gyroY": -2,
  "gyroZ": 1,
  "gps": {
    "satellites": 8,
    "latitude": null,
    "longitude": null,
    "fix": true
  },
  "gpsSat": 8,
  "gpsFix": true,
  "gps_lat": null,
  "gps_lng": null,
  "healthScore": 100
}
```
