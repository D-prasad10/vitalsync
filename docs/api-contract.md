# SWASTHYAEDGE (VitalsSync) Backend API Contract & Socket.IO Specification

This document provides a comprehensive, verified contract for every HTTP and WebSocket API endpoint implemented in the SWASTHYAEDGE backend.

- **Base URL**: `http://localhost:5001` (or `http://<HOST_LAN_IP>:5001`)
- **Protocols**: HTTP/1.1 (Express) and WebSocket (Socket.IO)
- **Content-Type**: `application/json`

---

## 1. Authentication & Role-Based Authorization (RBAC)

All clinical and administrative endpoints require authentication. The server validates signed HMAC-SHA256 tokens supplied via any of the following mechanisms:
- Standard HTTP header: `Authorization: Bearer <token>`
- Direct header: `Authorization: <token>`
- Custom header: `x-auth-token: <token>`
- Query parameter: `?token=<token>`

Hardware ingestion endpoints (`/api/telemetry/esp8266`, `/api/telemetry`, `/api/hardware/telemetry`) and hardware config discovery remain machine-accessible without authentication.

### Development Fallback Behavior
- When `NODE_ENV !== 'production'`, if external SMS (`FAST2SMS_API_KEY`) or Email (`EMAIL_USER`/`EMAIL_PASS`) services are unconfigured, the backend includes `{ "devOtp": "..." }` in the response for offline testing and automated suites.
- When `NODE_ENV === 'production'`, `devOtp` is strictly suppressed and never returned or leaked under any circumstances.

### Roles & Permissions Matrix
- **`doctor`**: Highest clinical privilege. Can create/modify patients, set vital safety thresholds, manage devices, acknowledge/resolve alerts, and manage hospital staff.
- **`caretaker`**: Clinical monitoring and patient care. Can view/update patient records, monitor vitals/history, assign paired devices, and acknowledge/resolve emergency alerts.
- **`staff`**: Hospital administrative staff. Can manage staff directory and register patient profiles.
- **`patient`**: Patient portal access for self-monitoring telemetry and personal thresholds.

---

### 1.1 Request One-Time Password (OTP)
- **Method**: `POST`
- **Path**: `/api/auth/send-otp`
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "mobile": "9876543210",
    "email": "doctor@hospital.org",
    "role": "doctor"
  }
  ```
  *Allowed roles*: `"doctor"`, `"caretaker"`, `"staff"`, `"patient"`.
- **Success Response (200 OK - Non-Production)**:
  ```json
  {
    "success": true,
    "message": "OTP sent to your mobile 9876543210",
    "devOtp": "123456"
  }
  ```
- **Success Response (200 OK - Production / Dispatched)**:
  ```json
  {
    "success": true,
    "message": "OTP sent to your mobile 9876543210"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "error": "Role, mobile, and email are required." }` or `{ "error": "Invalid role \"...\". Allowed roles: doctor, caretaker, staff, patient" }`
  - `500 Internal Server Error`: `{ "error": "Failed to register account." }`

---

### 1.2 Verify One-Time Password (OTP)
- **Method**: `POST`
- **Path**: `/api/auth/verify-otp`
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "mobile": "9876543210",
    "otp": "123456"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "DR-123456",
      "staffId": "DR-123456",
      "role": "doctor",
      "name": "Dr. Sarah Jenkins"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "error": "Mobile and OTP are required." }`
  - `400 Bad Request`: `{ "error": "Incorrect OTP. Please try again." }`
  - `400 Bad Request`: `{ "error": "OTP has expired. Please request a new one." }`

---

### 1.3 Get Current Authenticated Session
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Authentication**: Required (`doctor`, `caretaker`, `staff`, `patient`)
- **Headers**: `Authorization: Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "DR-123456",
      "staffId": "DR-123456",
      "role": "doctor",
      "name": "Dr. Sarah Jenkins"
    }
  }
  ```

---

## 2. Staff Management Endpoints

### 2.1 List All Staff
- **Method**: `GET`
- **Path**: `/api/staff`
- **Authentication**: Required (Valid token)
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "staff_id": "DR-00123",
      "role": "doctor",
      "name": "Dr. Ashish Patra",
      "mobile": "9348505908",
      "email": "ashishpatra752006@gmail.com"
    }
  ]
  ```

### 2.2 Register New Staff Member
- **Method**: `POST`
- **Path**: `/api/staff`
- **Authentication**: Required (`doctor`, `staff`)
- **Request Body**:
  ```json
  {
    "staff_id": "DR-88901",
    "role": "doctor",
    "name": "Dr. Elena Rostova",
    "mobile": "9876500112",
    "email": "elena.rostova@hospital.org"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "id": 5
  }
  ```

### 2.3 Delete Staff Member
- **Method**: `DELETE`
- **Path**: `/api/staff/:id`
- **Authentication**: Required (`doctor`, `staff`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "changes": 1
  }
  ```

---

## 3. Patient Management & Profile Endpoints

### 3.1 List All Patients
- **Method**: `GET`
- **Path**: `/api/patients`
- **Authentication**: Required (`doctor`, `caretaker`, `staff`)
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "name": "Ramesh Patel",
      "age": 58,
      "gender": "Male",
      "blood_group": "B+",
      "condition": "Post-Myocardial Infarction Recovery",
      "room": "ICU-204",
      "bed": "B-12",
      "device_id": "ESP8266-001",
      "created_at": 1726850000000
    }
  ]
  ```

### 3.2 Get Single Patient Details
- **Method**: `GET`
- **Path**: `/api/patients/:id`
- **Authentication**: Required
- **Success Response (200 OK)**:
  ```json
  {
    "id": 1,
    "name": "Ramesh Patel",
    "age": 58,
    "gender": "Male",
    "blood_group": "B+",
    "condition": "Post-Myocardial Infarction Recovery",
    "room": "ICU-204",
    "bed": "B-12",
    "device_id": "ESP8266-001"
  }
  ```
- **Error Response**: `404 Not Found` if patient ID does not exist.

### 3.3 Register New Patient
- **Method**: `POST`
- **Path**: `/api/patients`
- **Authentication**: Required (`doctor`, `caretaker`, `staff`)
- **Request Body**:
  ```json
  {
    "name": "Sunita Sharma",
    "age": 46,
    "gender": "Female",
    "blood_group": "O+",
    "condition": "Cardiac Arrhythmia Surveillance",
    "room": "Ward-3B",
    "bed": "Bed-05",
    "device_id": "ESP8266-002"
  }
  ```
- **Success Response (200 OK / 201 Created)**:
  ```json
  {
    "success": true,
    "id": 2,
    "patient": {
      "id": 2,
      "name": "Sunita Sharma"
    }
  }
  ```

### 3.4 Update Patient Profile
- **Method**: `PUT`
- **Path**: `/api/patients/:id`
- **Authentication**: Required (`doctor`, `caretaker`)
- **Request Body**: One or more fields to update (`name`, `age`, `gender`, `condition`, `room`, `bed`, `device_id`).
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "id": 1
  }
  ```

---

## 4. Telemetry History & Clinical Safety Thresholds

### 4.1 Get Patient Historical Logs
- **Method**: `GET`
- **Path**: `/api/patients/:id/history` or `/api/patients/:id/logs`
- **Query Parameters**: `limit` (default: 50, max: 500)
- **Authentication**: Required
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": 240,
      "patient_id": 1,
      "hr": null,
      "bp_sys": null,
      "bp_dia": null,
      "spo2": null,
      "temp": 83.3,
      "health_score": 100,
      "humidity": 62.0,
      "pressure": 1008.4,
      "ecg_val": 512,
      "mq135": "NORMAL",
      "timestamp": 1726852000000,
      "dht_temp": 28.5,
      "bmp_temp": 28.5,
      "max_ir": 18432,
      "max_red": 15200,
      "device_ip": "192.168.1.105"
    }
  ]
  ```

### 4.2 Get Latest Telemetry Reading
- **Method**: `GET`
- **Path**: `/api/patients/:id/latest`
- **Authentication**: Required
- **Success Response (200 OK)**: Returns the most recent telemetry entry or null if no logs exist.

### 4.3 Get Patient Vital Safety Thresholds
- **Method**: `GET`
- **Path**: `/api/patients/:id/thresholds` or `/api/thresholds/:patient_id`
- **Authentication**: Required
- **Success Response (200 OK)**:
  ```json
  {
    "id": 1,
    "patient_id": 1,
    "hr_min": 50,
    "hr_max": 120,
    "temp_max": 101.5,
    "spo2_min": 92,
    "bp_sys_max": 140,
    "bp_dia_max": 90
  }
  ```

### 4.4 Set Patient Vital Safety Thresholds
- **Method**: `POST` (or `PUT`)
- **Path**: `/api/patients/:id/thresholds` or `/api/thresholds/:patient_id`
- **Authentication**: Required (`doctor`)
- **Request Body**:
  ```json
  {
    "hr_min": 55,
    "hr_max": 110,
    "temp_max": 100.4,
    "spo2_min": 94,
    "bp_sys_max": 135,
    "bp_dia_max": 85
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "patientId": 1
  }
  ```

---

## 5. Hardware Ingestion & Device Management Endpoints

### 5.1 Ingest Hardware Telemetry
- **Method**: `POST`
- **Paths**:
  - `/api/telemetry/esp8266` *(Primary)*
  - `/api/telemetry` *(Backward-Compatible)*
  - `/api/hardware/telemetry` *(Backward-Compatible)*
- **Authentication**: None (Device-level ingestion)
- **Validation**: Strict validation middleware rejects missing `deviceId`, malformed payloads, non-numeric values, or injection attacks with HTTP 400.
- **Request Body**:
  ```json
  {
    "deviceId": "ESP8266-001",
    "patientId": 1,
    "dhtTemp": 28.5,
    "humidity": 62.0,
    "bmpTemp": 28.3,
    "pressure": 1008.4,
    "ecg": 512,
    "loPlus": 0,
    "loMinus": 0,
    "mq135": 1,
    "accX": 120,
    "accY": -30,
    "accZ": 16320,
    "gyroX": 5,
    "gyroY": -2,
    "gyroZ": 1,
    "maxFound": 1,
    "maxIR": 18432,
    "maxRED": 15200,
    "gpsSat": 8,
    "gpsFix": 1,
    "ip": "192.168.1.105"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "receivedAt": 1726919400000,
    "deviceId": "ESP8266-001",
    "patientId": 1,
    "status": "ONLINE"
  }
  ```

### 5.2 List Monitored Hardware Devices
- **Method**: `GET`
- **Path**: `/api/devices`
- **Authentication**: Required (`doctor`, `caretaker`, `staff`)
- **Success Response (200 OK)**:
  ```json
  [
    {
      "deviceId": "ESP8266-001",
      "patientId": 1,
      "ip": "192.168.1.105",
      "status": "ONLINE",
      "lastSeen": 1726919400000,
      "secondsAgo": 2
    }
  ]
  ```

### 5.3 Pair Hardware Device to Patient
- **Method**: `POST`
- **Path**: `/api/devices/assign`
- **Authentication**: Required (`doctor`, `caretaker`, `staff`)
- **Request Body**:
  ```json
  {
    "deviceId": "ESP8266-001",
    "patientId": 1
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "deviceId": "ESP8266-001",
    "patientId": 1
  }
  ```

### 5.4 Check Device Liveness Status
- **Method**: `GET`
- **Path**: `/api/device/status`
- **Authentication**: Required
- **Success Response (200 OK)**:
  ```json
  {
    "online": true,
    "deviceId": "ESP8266-001",
    "ip": "192.168.1.105",
    "lastSeen": 1726919400000,
    "secondsAgo": 1,
    "devices": [...]
  }
  ```

### 5.5 Hardware Poller Configuration
- **GET `/api/hardware/config`**: Public endpoint returning current poller settings and local LAN ingestion URLs.
- **POST `/api/hardware/config`**: Requires authentication (`doctor`, `staff`). Dynamically updates polling IP, interval, and activation.

### 5.6 Trigger Test Pulse Diagnostic Packet
- **Method**: `POST`
- **Path**: `/api/hardware/test-pulse`
- **Authentication**: Required
- **Request Body**: Optional overrides (e.g. `{ "patientId": 2 }`).
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "telemetry": { ... }
  }
  ```

---

## 6. Emergency Alerts API

### 6.1 List Alerts
- **Method**: `GET`
- **Path**: `/api/alerts` (or `/api/patients/:id/alerts`)
- **Authentication**: Required
- **Success Response (200 OK)**: Returns list of environmental and hardware safety alerts.

### 6.2 Acknowledge / Resolve Alert
- **Method**: `POST` or `PUT`
- **Paths**:
  - `/api/alerts/:id/acknowledge`
  - `/api/alerts/:id/resolve`
- **Authentication**: Required (`doctor`, `caretaker`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "id": 1,
    "status": "acknowledged"
  }
  ```

---

## 7. AI Engine Integration Endpoints

### 7.1 Check AI Engine Status
- **Method**: `GET`
- **Path**: `/api/ai/status`
- **Authentication**: Required
- **Success Response (200 OK)**:
  ```json
  {
    "configured": true,
    "url": "http://127.0.0.1:5002",
    "status": "ONLINE"
  }
  ```

### 7.2 Get Patient AI Predictions History
- **Method**: `GET`
- **Path**: `/api/ai/predictions/:patientId`
- **Authentication**: Required
- **Query Parameters**: `limit` (default: 20)
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "patient_id": 1,
      "device_id": "ESP8266-001",
      "risk_level": "moderate",
      "risk_type": "anomaly",
      "confidence": 0.87,
      "model_version": "v1.0.0",
      "explanation": "Elevated ambient temperature with baseline ECG rhythm.",
      "timestamp": 1726919400000
    }
  ]
  ```

---

## 8. Real-Time WebSocket Interface (Socket.IO)

Clients connect to `http://localhost:5001` via WebSocket:

### 8.1 Server-to-Client Broadcasts
- **`sensor_data` / `telemetry_update`**: Emitted upon ingestion of normalized telemetry. Broadcast globally and to patient room `patient:${patientId}`.
- **`emergency_alert`**: Emitted when critical conditions occur (gas detected, lead-off, threshold violation, or device timeout).
- **`ai_prediction`**: Emitted when the AI engine returns risk evaluation for a telemetry record.
- **`device_status`**: Emitted on device connect/disconnect/heartbeat transitions.

### 8.2 Client-to-Server Actions
- **`join_patient`**: Client joins room `patient:${patientId}` to receive targeted vital streams.
- **`leave_patient`**: Client leaves patient room.
- **`hardware_telemetry`**: Allows simulator or hardware clients to stream raw telemetry over WebSocket directly, with acknowledgment callback `ack({ success: true, telemetry })`.
