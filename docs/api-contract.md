# SwasthyaEdge (VitalsSync) Backend API Contract

This document provides a comprehensive, verified contract for every HTTP and WebSocket API endpoint currently implemented in `backend/server.js`.

**Base URL**: `http://localhost:5001` (or `http://<HOST_LAN_IP>:5001`)  
**Protocols**: HTTP/1.1 (Express 5.2.1) and WebSocket (Socket.IO v4.8.3)  
**Content-Type**: `application/json`

---

## 1. Authentication & OTP Endpoints

### 1.1 Request One-Time Password (OTP)
- **Method**: `POST`
- **Path**: `/api/auth/send-otp`
- **Purpose**: Generates a random 6-digit verification code for a mobile number, email, and role. Attempts SMS delivery via Fast2SMS (`FAST2SMS_API_KEY`), falls back to Email via Nodemailer (`EMAIL_USER`, `EMAIL_PASS`), or logs the OTP to server console / response in development mode. If the user does not exist in the `staff` table, they are automatically registered.
- **Authentication**: None (Public).
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "mobile": "9876543210",
    "email": "doctor@hospital.org",
    "role": "doctor"
  }
  ```
  *Allowed values for `role`*: `"doctor"`, `"caretaker"`, `"staff"`, `"patient"`.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "OTP sent to your mobile 9876543210",
    "devOtp": "654321"
  }
  ```
  *(Note: `devOtp` is only present when SMS and Email services are unconfigured).*
- **Error Responses**:
  - `400 Bad Request`:
    ```json
    { "error": "Role, mobile, and email are required." }
    ```
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error." }
    ```
    or
    ```json
    { "error": "Failed to register account." }
    ```

---

### 1.2 Verify One-Time Password (OTP)
- **Method**: `POST`
- **Path**: `/api/auth/verify-otp`
- **Purpose**: Validates the 6-digit OTP against the server's in-memory OTP store (expires after 5 minutes). On success, clears the OTP and returns the user's role and identity.
- **Authentication**: None (Public).
- **Request Body**:
  ```json
  {
    "mobile": "9876543210",
    "otp": "654321"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "role": "doctor",
      "name": "Dr. Sarah Jenkins",
      "staffId": "DR-123456"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request` (Missing parameters):
    ```json
    { "error": "Mobile and OTP are required." }
    ```
  - `400 Bad Request` (Session missing or invalid):
    ```json
    { "error": "No OTP request found. Please request a new OTP." }
    ```
  - `400 Bad Request` (Expired):
    ```json
    { "error": "OTP has expired. Please request a new one." }
    ```
  - `400 Bad Request` (Incorrect):
    ```json
    { "error": "Incorrect OTP. Please try again." }
    ```

---

## 2. Staff Management Endpoints

### 2.1 List All Staff
- **Method**: `GET`
- **Path**: `/api/staff`
- **Purpose**: Retrieves all registered hospital doctors, caretakers, and clinical staff.
- **Authentication**: None at API layer (Frontend guards access to `doctor` and `staff` roles).
- **Request Parameters**: None.
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
    },
    {
      "id": 2,
      "staff_id": "CR-00456",
      "role": "caretaker",
      "name": "Caretaker Ashish",
      "mobile": "9348505908",
      "email": "ashishpatra752006@gmail.com"
    }
  ]
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 2.2 Register New Staff Member
- **Method**: `POST`
- **Path**: `/api/staff`
- **Purpose**: Creates a new staff record in SQLite table `staff`.
- **Authentication**: None at API layer.
- **Request Body**:
  ```json
  {
    "staff_id": "DR-88901",
    "role": "doctor",
    "name": "Dr. Elena Rostova",
    "mobile": "9876543210",
    "email": "elena.rostova@hospital.org"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "id": 3
  }
  ```
- **Error Responses**:
  - `400 Bad Request`:
    ```json
    { "error": "All fields are required." }
    ```
  - `409 Conflict`:
    ```json
    { "error": "Staff ID \"DR-88901\" already exists." }
    ```
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 2.3 Delete Staff Member
- **Method**: `DELETE`
- **Path**: `/api/staff/:id`
- **Purpose**: Removes a staff record from SQLite by database row ID.
- **Authentication**: None at API layer.
- **Path Parameters**:
  - `id` (integer): Staff row ID.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "changes": 1
  }
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

## 3. Patient Management & Profile Endpoints

### 3.1 List All Patients
- **Method**: `GET`
- **Path**: `/api/patients`
- **Purpose**: Retrieves all registered patients including demographic attributes, assigned medical staff, and paired IoT hardware device identifier.
- **Authentication**: None at API layer.
- **Request Parameters**: None.
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "name": "John Doe",
      "age": 45,
      "room_number": "101A",
      "gender": "Male",
      "mobile": "+1 555-0100",
      "weight": 175.5,
      "guardian_contact": "+1 555-0101",
      "blood_group": "O+",
      "photo": null,
      "doctor_name": null,
      "doctor_phone": null,
      "doctor_specialization": null,
      "doctor_email": null,
      "device_id": "ESP8266-001"
    }
  ]
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 3.2 Get Single Patient Details
- **Method**: `GET`
- **Path**: `/api/patients/:id`
- **Purpose**: Retrieves full demographic and assigned doctor record for an individual patient.
- **Authentication**: None at API layer.
- **Path Parameters**:
  - `id` (integer): Patient database ID.
- **Success Response (200 OK)**:
  ```json
  {
    "id": 1,
    "name": "John Doe",
    "age": 45,
    "room_number": "101A",
    "gender": "Male",
    "mobile": "+1 555-0100",
    "weight": 175.5,
    "guardian_contact": "+1 555-0101",
    "blood_group": "O+",
    "photo": null,
    "doctor_name": "Dr. Ashish Patra",
    "doctor_phone": "9348505908",
    "doctor_specialization": "Cardiology",
    "doctor_email": "ashishpatra752006@gmail.com",
    "device_id": "ESP8266-001"
  }
  ```
- **Error Responses**:
  - `404 Not Found`:
    ```json
    { "error": "Patient not found" }
    ```
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 3.3 Register New Patient
- **Method**: `POST`
- **Path**: `/api/patients`
- **Purpose**: Inserts a new patient and automatically initializes default safety thresholds (HR: 60–100, BP Sys: 130, BP Dia: 85, SpO2: 95, Temp: 99.5) in the `thresholds` table.
- **Authentication**: None at API layer.
- **Request Body**:
  ```json
  {
    "name": "Alice Walker",
    "age": 52,
    "gender": "Female",
    "blood_group": "B+",
    "weight": 64.2,
    "mobile": "+91 9876543210",
    "guardian_contact": "+91 9876543211",
    "room_number": "302B"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "patient": {
      "id": 3,
      "name": "Alice Walker",
      "age": 52,
      "room_number": "302B",
      "gender": "Female",
      "mobile": "+91 9876543210",
      "weight": 64.2,
      "guardian_contact": "+91 9876543211",
      "blood_group": "B+",
      "photo": null,
      "doctor_name": null,
      "doctor_phone": null,
      "doctor_specialization": null,
      "doctor_email": null,
      "device_id": null
    }
  }
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 3.4 Update Patient Profile
- **Method**: `PUT`
- **Path**: `/api/patients/:id`
- **Purpose**: Updates demographic details, contact numbers, room assignment, base64 photo, and assigned doctor credentials.
- **Authentication**: None at API layer.
- **Path Parameters**:
  - `id` (integer): Patient database ID.
- **Request Body**:
  ```json
  {
    "name": "Alice Walker",
    "age": 53,
    "gender": "Female",
    "blood_group": "B+",
    "weight": 63.5,
    "mobile": "+91 9876543210",
    "guardian_contact": "+91 9876543211",
    "photo": "data:image/jpeg;base64,...",
    "doctor_name": "Dr. Ashish Patra",
    "doctor_phone": "9348505908",
    "doctor_specialization": "Internal Medicine",
    "doctor_email": "ashishpatra752006@gmail.com",
    "room_number": "302A"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "changes": 1
  }
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

## 4. Telemetry History & Clinical Thresholds

### 4.1 Get Patient 7-Day History
- **Method**: `GET`
- **Path**: `/api/patients/:id/history`
- **Purpose**: Retrieves all stored telemetry entries from SQLite table `sensor_logs` logged within the last 7 calendar days (`timestamp > now - 7 days`), ordered chronologically ascending.
- **Authentication**: None at API layer.
- **Path Parameters**:
  - `id` (integer): Patient database ID.
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": 104,
      "patient_id": 1,
      "hr": null,
      "bp_sys": null,
      "bp_dia": null,
      "spo2": null,
      "temp": 98.4,
      "timestamp": 1726848000000,
      "health_score": 100,
      "humidity": 58.2,
      "pressure": 1012.4,
      "ecg_val": 514,
      "mq135": "NORMAL",
      "gps_lat": null,
      "gps_lng": null,
      "raw_payload": "{...}",
      "dht_temp": 25.8,
      "bmp_temp": 25.7,
      "max_ir": 18200,
      "max_red": 15100,
      "device_ip": "192.168.1.105"
    }
  ]
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 4.2 Get Latest Telemetry Reading
- **Method**: `GET`
- **Path**: `/api/patients/:id/latest`
- **Purpose**: Returns the single most recent sensor log recorded for a patient.
- **Authentication**: None at API layer.
- **Path Parameters**:
  - `id` (integer): Patient database ID.
- **Success Response (200 OK)**:
  ```json
  {
    "id": 142,
    "patient_id": 1,
    "hr": null,
    "bp_sys": null,
    "bp_dia": null,
    "spo2": null,
    "temp": 98.6,
    "timestamp": 1726851234000,
    "health_score": 100,
    "humidity": 60.1,
    "pressure": 1011.8,
    "ecg_val": 508,
    "mq135": "NORMAL",
    "dht_temp": 26.1,
    "bmp_temp": 26.0,
    "max_ir": 19040,
    "max_red": 16120,
    "device_ip": "192.168.1.105"
  }
  ```
- **Error Responses**:
  - `404 Not Found`:
    ```json
    { "error": "No telemetry data found for this patient" }
    ```
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 4.3 Get Patient Vital Thresholds
- **Method**: `GET`
- **Path**: `/api/patients/:id/thresholds`
- **Purpose**: Fetches the clinical safety boundaries used to trigger automated warning alerts.
- **Authentication**: None at API layer.
- **Path Parameters**:
  - `id` (integer): Patient database ID.
- **Success Response (200 OK)**:
  ```json
  {
    "patient_id": 1,
    "hr_max": 100,
    "hr_min": 60,
    "bp_sys_max": 130,
    "bp_dia_max": 85,
    "spo2_min": 95,
    "temp_max": 99.5
  }
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 4.4 Set Patient Vital Thresholds
- **Method**: `POST`
- **Path**: `/api/patients/:id/thresholds`
- **Purpose**: Updates or inserts clinical safety boundaries (`ON CONFLICT(patient_id) DO UPDATE`).
- **Authentication**: None at API layer (Frontend protected).
- **Path Parameters**:
  - `id` (integer): Patient database ID.
- **Request Body**:
  ```json
  {
    "hr_max": 110,
    "hr_min": 55,
    "bp_sys_max": 135,
    "bp_dia_max": 90,
    "spo2_min": 94,
    "temp_max": 100.4
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true
  }
  ```
- **Error Responses**:
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

## 5. Hardware Ingestion & Device Management Endpoints

### 5.1 Ingest Hardware Telemetry
- **Method**: `POST`
- **Paths**:
  - `/api/telemetry/esp8266` *(Recommended)*
  - `/api/telemetry`
  - `/api/hardware/telemetry`
- **Purpose**: Primary ingestion gateway for ESP8266 firmware transmissions. Parses raw sensor parameters, normalizes units, maps device to patient, evaluates thresholds, triggers WebSocket broadcasts, and throttles DB writes.
- **Authentication**: None (Open for IoT sensor nodes on LAN).
- **Request Body** (Conforming to ESP8266 firmware payload):
  ```json
  {
    "ip": "192.168.1.105",
    "deviceId": "ESP8266-001",
    "patientId": 1,
    "dhtTemp": 27.8,
    "humidity": 59.4,
    "bmpTemp": 27.6,
    "pressure": 1010.5,
    "ecg": 512,
    "loPlus": 0,
    "loMinus": 0,
    "mq135": 1,
    "accX": 102,
    "accY": -15,
    "accZ": 980,
    "gyroX": 3,
    "gyroY": -1,
    "gyroZ": 0,
    "maxFound": true,
    "maxIR": 18432,
    "maxRED": 15200,
    "gpsSat": 6,
    "gpsFix": true
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "receivedAt": 1726852000000,
    "deviceId": "ESP8266-001",
    "patientId": 1,
    "status": "ONLINE"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`:
    ```json
    { "error": "Invalid telemetry payload: must be a JSON object" }
    ```

---

### 5.2 List Monitored Hardware Devices
- **Method**: `GET`
- **Path**: `/api/devices`
- **Purpose**: Lists all active or registered hardware units tracked by the in-memory heartbeat watchdog, showing online status, last seen timestamp, and paired patient ID.
- **Authentication**: None.
- **Success Response (200 OK)**:
  ```json
  [
    {
      "deviceId": "ESP8266-001",
      "patientId": 1,
      "ip": "192.168.1.105",
      "status": "ONLINE",
      "lastSeen": 1726852000000,
      "secondsAgo": 1
    }
  ]
  ```

---

### 5.3 Pair Hardware Device to Patient
- **Method**: `POST`
- **Path**: `/api/devices/assign`
- **Purpose**: Associates a physical device identifier (`deviceId`) with a database patient (`patientId`) and persists the relation in the `patients` table.
- **Authentication**: None.
- **Request Body**:
  ```json
  {
    "deviceId": "ESP8266-001",
    "patientId": 2
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "deviceId": "ESP8266-001",
    "patientId": 2
  }
  ```
- **Error Responses**:
  - `400 Bad Request`:
    ```json
    { "error": "deviceId and patientId are required." }
    ```
  - `500 Internal Server Error`:
    ```json
    { "error": "Database error message string" }
    ```

---

### 5.4 Check Device Liveness Status
- **Method**: `GET`
- **Path**: `/api/device/status`
- **Purpose**: High-level status check of connected hardware, including primary device status, seconds since last transmission, and list of all known units.
- **Authentication**: None.
- **Success Response (200 OK)**:
  ```json
  {
    "online": true,
    "deviceId": "ESP8266-001",
    "ip": "192.168.1.105",
    "lastSeen": 1726852000000,
    "secondsAgo": 1,
    "devices": [
      {
        "deviceId": "ESP8266-001",
        "patientId": 1,
        "ip": "192.168.1.105",
        "status": "ONLINE",
        "lastSeen": 1726852000000,
        "secondsAgo": 1
      }
    ]
  }
  ```

---

### 5.5 Get Hardware Poller Configuration
- **Method**: `GET`
- **Path**: `/api/hardware/config`
- **Purpose**: Retrieves backend poller parameters, local server LAN IP address, and complete ingestion URLs for flashing into ESP8266 firmware.
- **Authentication**: None.
- **Success Response (200 OK)**:
  ```json
  {
    "ip": "192.168.1.105",
    "patientId": 1,
    "pollingIntervalMs": 1500,
    "isPolling": true,
    "lastPollStatus": "SUCCESS",
    "lastPollError": null,
    "lastPollTime": 1726852000000,
    "localLanIp": "192.168.1.50",
    "lanIngestionUrl": "http://192.168.1.50:5001/api/telemetry/esp8266",
    "localIngestionUrl": "http://localhost:5001/api/telemetry/esp8266"
  }
  ```

---

### 5.6 Update Hardware Poller Configuration
- **Method**: `POST`
- **Path**: `/api/hardware/config`
- **Purpose**: Dynamically updates the IP address of the target ESP8266 node, toggles background polling, adjusts polling frequency, and immediately triggers a test poll.
- **Authentication**: None.
- **Request Body**:
  ```json
  {
    "ip": "192.168.1.105",
    "patientId": 1,
    "pollingIntervalMs": 1500,
    "isPolling": true
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "config": {
      "ip": "192.168.1.105",
      "patientId": 1,
      "pollingIntervalMs": 1500,
      "isPolling": true,
      "lastPollStatus": "SUCCESS",
      "lastPollError": null,
      "lastPollTime": 1726852005000,
      "localLanIp": "192.168.1.50",
      "lanIngestionUrl": "http://192.168.1.50:5001/api/telemetry/esp8266"
    }
  }
  ```

---

### 5.7 Trigger Test Pulse Diagnostic Packet
- **Method**: `POST`
- **Path**: `/api/hardware/test-pulse`
- **Purpose**: Injects a synthetic telemetry packet strictly conforming to the physical ESP8266 schema directly into the backend ingestion pipeline. Useful for validating WebSocket dispatch and UI rendering without live hardware connected.
- **Authentication**: None.
- **Request Body**: Optional property overrides (e.g. `{"dhtTemp": 31.2, "mq135": 0}`).
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "telemetry": {
      "deviceId": "ESP8266-001",
      "patient_id": 1,
      "patientId": 1,
      "timestamp": 1726852010000,
      "deviceStatus": "ONLINE",
      "temp": 82.9,
      "humidity": 62.0,
      "pressure": 1008.4,
      "ecg_val": 512,
      "mq135": "NORMAL",
      "healthScore": 100
    }
  }
  ```

---

## 6. Real-Time WebSocket Interface (Socket.IO)

Clients connect to `ws://localhost:5001` or `http://localhost:5001` via `socket.io-client`.

### 6.1 Server-to-Client Broadcasts

#### A. Event: `sensor_data` / `telemetry_update`
Broadcast whenever new telemetry arrives from ESP8266 or the poller.
```json
{
  "deviceId": "ESP8266-001",
  "patient_id": 1,
  "patientId": 1,
  "timestamp": 1726852010000,
  "deviceStatus": "ONLINE",
  "deviceIp": "192.168.1.105",
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
  "imu": {
    "accX": 120,
    "accY": -30,
    "accZ": 16320,
    "gyroX": 5,
    "gyroY": -2,
    "gyroZ": 1
  },
  "gps": {
    "satellites": 8,
    "latitude": null,
    "longitude": null,
    "fix": true
  },
  "healthScore": 100
}
```

#### B. Event: `emergency_alert`
Broadcast immediately when safety threshold limits are breached or hardware disconnection occurs.
```json
{
  "id": 1726852015123.45,
  "patient_id": 1,
  "patient_name": "John Doe",
  "alerts": [
    "⚠️ Hazardous Gas / Smoke Threshold Exceeded (MQ-135)",
    "⚠️ ECG Leads Disconnected (AD8232 LO+/LO- Active)"
  ],
  "timestamp": 1726852015000,
  "severity": "critical"
}
```

#### C. Event: `device_status`
Broadcast by the watchdog timer when an active sensor node ceases transmitting for >10 seconds.
```json
{
  "deviceId": "ESP8266-001",
  "patientId": 1,
  "status": "OFFLINE",
  "lastSeen": 1726852000000
}
```

### 6.2 Client-to-Server Ingestion Event

#### Event: `hardware_telemetry`
Permits edge gateways or simulators to transmit telemetry packets directly over WebSockets rather than HTTP POST.
- **Payload**: JSON telemetry object conforming to the ingestion schema.
- **Acknowledgment Callback**: `{ "success": true }` or `{ "error": "error message" }`.
