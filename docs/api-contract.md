# SWASTHYAEDGE API Contract & Socket.IO Specification

Base URL: `http://localhost:5001` (LAN IP dynamically reported via `/api/hardware/config`)

---

## 0. Authentication & Role-Based Authorization (RBAC)

All clinical and administrative endpoints require authentication. The server accepts tokens via:
- `Authorization: Bearer <token>`
- `Authorization: <token>`
- `x-auth-token: <token>`
- Query parameter: `?token=<token>`

Hardware ingestion endpoints (`/api/telemetry/esp8266`, `/api/telemetry`, `/api/hardware/telemetry`) remain machine-accessible without authentication.

### Development Fallback Behavior
- When `NODE_ENV !== 'production'`, if external SMS (`FAST2SMS_API_KEY`) and Email (`EMAIL_USER`/`EMAIL_PASS`) dispatchers are not configured, the backend returns `{ "devOtp": "..." }` in the response to support local offline testing and automated suites.
- When `NODE_ENV === 'production'`, `devOtp` is strictly suppressed and never exposed under any circumstances. If dispatchers are not configured in production, HTTP 503 is safely returned.

### Roles & Access Matrix
- **`doctor`**: Highest clinical privilege. Can view/modify patient profiles, clinical vital thresholds, alerts, device mappings, and staff directory.
- **`caretaker`**: Clinical caretaker. Can view/update patient records, monitor vitals/history, and acknowledge emergency alerts (`/api/alerts/:id/acknowledge`, `/api/alerts/:id/resolve`).
- **`staff`**: Hospital administrative staff. Can manage hospital staff directory and view patient demographics.
- **`patient`**: Patient portal access for self-monitoring telemetry.

### Endpoints

#### `POST /api/auth/send-otp`
Generates and dispatches a 6-digit cryptographic verification code. Auto-registers new staff accounts safely.
- **Request Body**:
  ```json
  {
    "role": "doctor",
    "mobile": "9876543210",
    "email": "doctor@hospital.com"
  }
  ```
- **Response (200 OK - Non-Production)**:
  ```json
  {
    "success": true,
    "message": "OTP sent to your mobile 9876543210",
    "devOtp": "123456"
  }
  ```
- **Response (200 OK - Production / Dispatched)**:
  ```json
  {
    "success": true,
    "message": "OTP sent to your mobile 9876543210"
  }
  ```

#### `POST /api/auth/verify-otp`
Validates 6-digit OTP and issues a HMAC-SHA256 Bearer token.
- **Request Body**:
  ```json
  {
    "mobile": "9876543210",
    "otp": "123456"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "role": "doctor",
      "name": "doctor",
      "staffId": "DR-123456",
      "id": "DR-123456"
    }
  }
  ```

#### `GET /api/auth/me`
Returns current authenticated session user details.
- **Headers**: `Authorization: Bearer <token>` or `x-auth-token: <token>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "staffId": "DR-123456",
      "id": "DR-123456",
      "role": "doctor",
      "name": "doctor"
    }
  }
  ```

---

## 1. Hardware Telemetry Ingestion

### `POST /api/telemetry/esp8266` (Primary)
### `POST /api/telemetry` (Backward-Compatible)
### `POST /api/hardware/telemetry` (Backward-Compatible)

Accepts real-time hardware telemetry from ESP8266 or simulator.

- **Headers**: `Content-Type: application/json`
- **Request Body**: Valid JSON object containing at minimum `deviceId` (e.g. `"ESP8266-001"`).
- **Validation**:
  - Rejects missing `deviceId` with HTTP 400.
  - Rejects non-numeric sensor readings or `NaN` with HTTP 400.
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
- **Error Response (400 Bad Request)**:
  ```json
  {
    "error": "Invalid telemetry payload: Valid \"deviceId\" is required."
  }
  ```

---

## 2. Patient Management Endpoints

### `GET /api/patients`
Retrieves all registered hospital patients. Requires valid Bearer token (`doctor`, `caretaker`, `staff`, `patient`).
- **Response (200 OK)**: Array of patient objects.

### `GET /api/patients/:id`
Retrieves a single patient profile by ID.
- **Validation**: Rejects invalid ID formats with HTTP 400.
- **Response (200 OK)**: Patient object.
- **Response (404 Not Found)**: `{ "error": "Patient not found" }`

### `POST /api/patients`
Registers a new patient and automatically provisions default clinical thresholds. Restricted to `doctor`, `caretaker`, `staff`.
- **Request Body**:
  ```json
  {
    "name": "Vikram Singh",
    "age": 52,
    "gender": "Male",
    "blood_group": "O+",
    "weight": 74.5,
    "mobile": "9871122334",
    "guardian_contact": "9871122335",
    "room_number": "305C"
  }
  ```
- **Validation**:
  - `name`: Required non-empty string (2-100 chars).
  - `age`: Optional positive integer (0-150).
  - `weight`: Optional positive number (0-500).
  - `blood_group`: Optional standard blood group format (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
  - `mobile`: Optional 10-digit number.
- **Response (201 Created)**: `{ "success": true, "patient": { ... } }`
- **Response (409 Conflict)**: Returned if a patient with the identical name and mobile number is already registered.

### `PUT /api/patients/:id`
Partially updates an existing patient profile with anti-corruption protection (unspecified fields are preserved and never erased to NULL). Restricted to `doctor`, `caretaker`, `staff`.
- **Response (200 OK)**: `{ "success": true, "changes": 1, "patient": { ... } }`
- **Response (404 Not Found)**: `{ "error": "Patient not found" }`

### `GET /api/patients/:id/history`
Retrieves historical telemetry logs from the past 7 days for clinical analytics.

### `GET /api/patients/:id/latest`
Returns the most recent telemetry point ingested for the patient.

### `GET /api/patients/:id/thresholds`
Returns customized vital safety thresholds for the patient.

### `POST /api/patients/:id/thresholds`
Configures clinical vital threshold limits. Strictly restricted to `doctor` role.

---

## 3. Device Management Endpoints

### `GET /api/devices`
Lists all tracked hardware units, patient assignments, and liveness.
- **Response (200 OK)**:
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

### `POST /api/devices/assign`
Assigns or re-pairs an ESP8266 hardware unit to a specific hospital patient.
- **Request Body**:
  ```json
  {
    "deviceId": "ESP8266-001",
    "patientId": 2
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "deviceId": "ESP8266-001",
    "patientId": 2
  }
  ```

### `GET /api/device/status`
Returns primary device connectivity and watchdog status for UI indicators.
- **Response (200 OK)**:
  ```json
  {
    "online": true,
    "deviceId": "ESP8266-001",
    "ip": "192.168.1.105",
    "lastSeen": 1726919400000,
    "secondsAgo": 2,
    "devices": [...]
  }
  ```

### `GET /api/hardware/config`
Retrieves ESP8266 polling options and server LAN ingestion endpoints.
- **Response (200 OK)**:
  ```json
  {
    "ip": "192.168.1.105",
    "patientId": 1,
    "pollingIntervalMs": 1500,
    "isPolling": true,
    "lastPollStatus": "SUCCESS",
    "lastPollError": null,
    "lastPollTime": 1726919400000,
    "localLanIp": "192.168.1.15",
    "lanIngestionUrl": "http://192.168.1.15:5001/api/telemetry/esp8266",
    "localIngestionUrl": "http://localhost:5001/api/telemetry/esp8266"
  }
  ```

### `POST /api/hardware/config`
Updates ESP8266 target IP and polling intervals dynamically.
- **Request Body**:
  ```json
  {
    "ip": "192.168.1.105",
    "patientId": 1,
    "pollingIntervalMs": 2000,
    "isPolling": true
  }
  ```

### `POST /api/hardware/test-pulse`
Injects a compliant test telemetry packet for testing and UI demonstrations.

---

## 3. Alerts Endpoints

### `GET /api/alerts`
Retrieves safety alerts with optional filtering.
- **Query Parameters**:
  - `patientId`: Filter by patient (e.g. `?patientId=1`)
  - `severity`: Filter by severity (`warning` | `critical`)
  - `acknowledged`: `0` for active alerts, `1` for acknowledged
  - `limit`: Maximum records (default 50)
- **Response (200 OK)**: Array of Alert objects.

### `POST /api/alerts/:id/acknowledge`
Acknowledges an active alert.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "id": 14
  }
  ```

---

## 4. AI Engine Integration Endpoints

### `GET /api/ai/predictions/:patientId`
Retrieves risk predictions generated by the external AI Engine for a patient.

### `GET /api/ai/status`
Checks connectivity and health of the configured external `AI_ENGINE_URL`.

---

## 5. Socket.IO Real-time Events

### Server-to-Client Broadcasts
- **`sensor_data`**: Broadcasts normalized telemetry packets (fired globally and to room `patient:${patientId}`).
- **`telemetry_update`**: Real-time telemetry point for streaming dashboard graphs.
- **`emergency_alert`**: Fired when MQ-135 gas, lead-off, or temperature limits are breached.
- **`device_status`**: Fired when device transitions between `ONLINE` and `OFFLINE`.
- **`ai_prediction`**: Broadcasts external AI risk assessments.

### Client-to-Server Actions
- **`join_patient` (`patientId`)**: Client subscribes to private room `patient:${patientId}`.
- **`leave_patient` (`patientId`)**: Client unsubscribes from patient room.
- **`hardware_telemetry` (`data`, `ack`)**: Ingest telemetry directly over WebSocket.
