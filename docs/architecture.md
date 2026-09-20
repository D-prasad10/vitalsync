# SwasthyaEdge (VitalsSync) Architecture Overview

## 1. Executive Summary & System Overview

SwasthyaEdge (also referenced as VitalsSync) is a real-time clinical IoT healthcare monitoring system designed for continuous patient vital signs tracking, triage, alert dispatching, and medical reporting.

The system connects physical biomedical and ambient sensors attached to an ESP8266 microcontroller node to a central Node.js backend server. The backend ingests, validates, normalizes, and stores sensor data in an SQLite database, broadcasting updates via WebSockets (Socket.IO) to a React 18 web dashboard for medical professionals (doctors and caretakers).

---

## 2. Actual System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HARDWARE SENSOR SUITE                           │
│  ESP8266 / NodeMCU ESP-12E (Firmware: vitalsync_esp8266.ino)           │
│                                                                        │
│  • DHT11 (GPIO 14 / D5)           -> Ambient Temp & Relative Humidity  │
│  • BMP280 (I2C 0x76, SDA=D2/SCL=D1)-> Barometric Pressure & Temp       │
│  • AD8232 ECG (Analog A0)          -> Raw ECG Potential Waveform       │
│    Leads Off: LO+ (D6), LO- (D7)   -> Electrode Disconnect Status      │
│  • MPU6050 (I2C 0x68)             -> 3-Axis Accel & Gyroscope          │
│  • MAX30100 (I2C 0x57)            -> Raw Optical IR & RED PPG Counts   │
│  • MQ-135 (GPIO 16 / D0)          -> Digital Hazardous Gas Alert       │
│  • NEO-6M/8M GPS (UART D3/D4)     -> Satellites, Fix Status            │
│  • SSD1306 OLED (I2C 0x3C)        -> Local Diagnostics Display         │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 ▲
     HTTP POST /api/telemetry/esp8266                │ HTTP GET /data
     (Periodic Push Stream, 1s)                      │ (Background Poller, 1.5s)
                   ▼                                 │
┌────────────────────────────────────────────────────┴───────────────────┐
│                     BACKEND INGESTION & CORE ENGINE                    │
│  Node.js 18+ / Express 5.2.1 (backend/server.js)                       │
│                                                                        │
│  • Telemetry Normalizer (ingestHardwareTelemetry)                      │
│    - Strips/maps flat & nested payloads                                │
│    - Validates deviceId, deviceIp, patientId mapping                   │
│    - Derives display temperature (°F) from BMP280 / DHT11              │
│    - Enforces medical integrity (BP & derived SpO2/HR kept null)       │
│    - Evaluates safety thresholds (high temp, gas alert, lead-off)      │
│  • Device Watchdog (Heartbeat Monitor every 2s, 10s offline timeout)   │
│  • In-Memory OTP Store (Fast2SMS / Gmail Nodemailer fallback)          │
│  • Deterministic Rule-Based Health Score Evaluator (0–100)             │
│  • DB Storage Throttling (3-second window or instant on alert)         │
└──────────────┬─────────────────────────────┬───────────────────────────┘
               │                             │
    Direct SQL Queries / Inserts             │ Real-Time WebSocket Events
               ▼                             ▼
┌─────────────────────────────┐   ┌──────────────────────────────────────┐
│       DATABASE LAYER        │   │         REAL-TIME MESSAGING          │
│  SQLite 3 (health_monitor.db│   │  Socket.IO Server v4.8.3             │
│            or vitals.db)    │   │                                      │
│                             │   │  • sensor_data (Live telemetry)      │
│  • patients                 │   │  • telemetry_update (Sync event)     │
│  • thresholds               │   │  • emergency_alert (Critical alerts) │
│  • sensor_logs              │   │  • device_status (Liveness / offline)│
│  • staff                    │   │  • hardware_telemetry (Socket ingest)│
└─────────────────────────────┘   └──────────────────┬───────────────────┘
                                                     │
                                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENT TIER                            │
│  React 19 / Vite 7 SPA (frontend/src/)                                 │
│                                                                        │
│  • Telemetry Store: useSyncExternalStore + Socket.IO client (500ms bat)│
│  • RBAC Routes:                                                        │
│    - /login: OTP verification (doctor, caretaker, staff, patient)      │
│    - /doctor: ICU clinical dashboard, threshold configuration, triage  │
│    - /caretaker: Patient cards, real-time vital streams, calling       │
│    - /patient-dashboard: Individual vitals overview, health score      │
│    - /patient/:id: Comprehensive demographic & vitals dossier          │
│    - /staff-management: Hospital staff registration and permissions    │
│    - /reports: 7-day trend history, Chart.js graphs, CSV/PDF export    │
│  • Hardware Diagnostic Control: Dynamic IP config, test-pulse trigger  │
└────────────────────────────────────────────────────────────────────────┘

┌ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -┐
:                   AI INFERENCE LAYER [PLANNED]                         :
:  Status: NOT IMPLEMENTED IN CURRENT CODEBASE                           :
:  Intended Integration Point: Between Telemetry Normalizer & Alert Hub   :
:  Target: Arrhythmia classification, hypoxia forecast, fall detection   :
└ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -┘
```

---

## 3. Implementation Status Matrix

The following table explicitly distinguishes what is currently **Implemented**, **Partially Implemented**, and **Planned / Not Implemented** in the codebase:

| Subsystem | Feature / Component | Actual Status | Implementation Details & Source Reference |
| :--- | :--- | :--- | :--- |
| **Hardware** | ESP8266 Firmware | **Implemented** | `hardware/vitalsync_esp8266/vitalsync_esp8266.ino`: Reads DHT11, BMP280, AD8232, MPU6050, MAX30100, MQ-135, GPS; runs local HTTP server (`/`, `/data`) on port 80; HTTP POST to backend. |
| **Hardware** | Sensor Acquisition (Ambient Temp/Humidity) | **Implemented** | DHT11 on GPIO 14 (D5) and BMP280 on I2C `0x76`. |
| **Hardware** | Raw ECG Potential & Lead-off | **Implemented** | AD8232 analog signal on A0; lead-off pins on GPIO 12 (D6, LO+) and GPIO 13 (D7, LO-). |
| **Hardware** | Raw Optical PPG Acquisition | **Implemented** | MAX30100 on I2C `0x57`; extracts raw IR and RED photodiode registers. |
| **Hardware** | Calibrated SpO2 & Heart Rate DSP | **Partially Implemented** | MAX30100 registers read, but firmware does NOT perform motion-artifact filtered SpO2 calibration or peak-detection BPM. Backend explicitly sets `hr = null, spo2 = null`. |
| **Hardware** | Blood Pressure Sensor | **Not Implemented / No Sensor**| No cuff or NIBP module exists. Backend and firmware explicitly pass `null` for systolic/diastolic blood pressure. |
| **Hardware** | Calibrated Air Quality (AQI / PPM) | **Partially Implemented** | MQ-135 connected via digital comparator pin D0 (0=Alert, 1=Normal). No analog calibration or gas PPM calculation exists. |
| **Backend** | REST API Routing | **Implemented** | `backend/server.js`: Express 5.2.1 routes for auth (OTP), staff, patients, history, thresholds, hardware configuration, and device assignment. |
| **Backend** | Hardware Telemetry Ingestion | **Implemented** | `backend/server.js`: Supports both HTTP POST (`/api/telemetry/esp8266`, `/api/telemetry`, `/api/hardware/telemetry`) and active HTTP GET Poller service against `http://<ESP8266_IP>/data`. |
| **Backend** | Real-Time WebSocket Streaming | **Implemented** | Socket.IO v4.8.3 emits `sensor_data`, `telemetry_update`, `emergency_alert`, and `device_status`. |
| **Backend** | Hardware Liveness Watchdog | **Implemented** | `setInterval` (2000ms) tracks `deviceHeartbeats`; triggers `device-offline` warning if silent > 10 seconds. |
| **Backend** | Database Persistence | **Implemented** | `backend/database.js`: SQLite (`health_monitor.db`) stores `patients`, `thresholds`, `sensor_logs`, and `staff`. Sensor logs throttled to 3s window. |
| **Backend** | Health Score Calculation | **Implemented (Heuristic)** | Deterministic weighted arithmetic based on temperature, MQ-135 status, and lead-off detection. **No AI/ML model is used.** |
| **AI Layer** | Machine Learning Inference | **Planned / Not Implemented** | **No ML/AI models, Python microservices, ONNX runtimes, or AI APIs exist in current source code.** |
| **AI Layer** | Predictive Risk Modeling | **Planned / Not Implemented** | Outlined in roadmap documentation (`README.md`), but zero inference code exists. |
| **Frontend** | React SPA Architecture | **Implemented** | React 19, Vite 7, React Router DOM 7. Route protection based on roles (`doctor`, `caretaker`, `staff`, `patient`). |
| **Frontend** | Live Telemetry Store | **Implemented** | `frontend/src/utils/telemetryStore.js`: Custom external store with `useSyncExternalStore`, 500ms batched state flushing, rolling 30-point window. |
| **Frontend** | Dashboards & Analytics | **Implemented** | `DoctorDashboard.jsx`, `CaretakerDashboard.jsx`, `PatientDashboard.jsx`, `Reports.jsx`, `StaffManagement.jsx`. |
| **Frontend** | Hardware Configuration Control | **Implemented** | Doctor dashboard features live ESP8266 IP configuration, poller toggle, and test pulse generator. |
| **Mobile** | Flutter Mobile Application | **Preserved / Separate** | Preserved in commit history and documentation (`docs/mobile-app.md`), but removed from the active repository build tree in commit `e0bb823`. |

---

## 4. End-to-End Data Flow

### 4.1 Hardware Telemetry Ingestion Flow (Push & Poll)
1. **Push Ingestion (Default ESP8266 behavior)**:
   - ESP8266 samples DHT11, BMP280, AD8232, MPU6050, MAX30100, MQ-135, and GPS every 100ms.
   - Every 1000ms, ESP8266 constructs a JSON payload via `buildTelemetryJson()` and transmits an HTTP POST request to `http://<LAN_IP>:5001/api/telemetry/esp8266`.
2. **Poll Ingestion (Fallback / Backend Poller Service)**:
   - If configured via `POST /api/hardware/config`, the backend poller service issues periodic HTTP GET requests to `http://<ESP8266_IP>/data` every 1500ms.
   - Upon receiving the JSON response, the poller feeds the payload into `ingestHardwareTelemetry()`.

### 4.2 Normalization & Safety Boundary
- In `backend/server.js`, `ingestHardwareTelemetry()` inspects incoming fields:
  - Resolves `deviceId` and maps it to a corresponding `patientId` via `devicePatientMapping` (defaulting to 1 if unassigned).
  - Selects highest precision ambient temperature (BMP280 preferred over DHT11) and calculates Fahrenheit display value.
  - Formats AD8232 ECG analog signal and sets `leadOffPlus`/`leadOffMinus` flags.
  - Passes raw MAX30100 optical `maxIR` and `maxRED` values; enforces `hr: null` and `spo2: null` to prevent medical fabrication.
  - Evaluates MQ-135 digital signal (`0` = ALERT, `1` = NORMAL).
  - Evaluates patient thresholds and builds alert messages.
  - Updates in-memory heartbeat tracker with current timestamp and client IP.

### 4.3 Database Persistence & Throttling
- Sensor readings are inserted into SQLite table `sensor_logs`.
- To prevent database I/O saturation from high-frequency streams (1000ms or faster), storage is throttled to a minimum interval of 3000ms per patient, **unless** an emergency alert condition is detected (in which case the reading is written immediately).

### 4.4 Real-Time WebSocket Fan-Out
- Immediately upon normalization, the backend broadcasts the full telemetry payload to all connected WebSocket clients via `io.emit('sensor_data', normalizedPayload)` and `io.emit('telemetry_update', normalizedPayload)`.
- If threshold violations or hardware disconnections occur, `io.emit('emergency_alert', alertData)` is broadcast.
- The frontend `telemetryStore.js` batches incoming socket events over a 500ms debounce window and triggers UI re-renders across active dashboards.

### 4.5 AI Integration Boundary (Planned)
- The designated boundary for future AI/ML models sits immediately after `ingestHardwareTelemetry()` produces the clean normalized payload.
- Telemetry windows (e.g., rolling 5-second arrays of ECG and PPG counts) will be passed to an inference worker, which returns risk indices and classification flags back to the Socket.IO broadcaster and alert pipeline.
