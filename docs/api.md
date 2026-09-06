# VitalsSync REST API & Socket.IO Reference

Base URL: `http://localhost:5001` (Android Emulator: `http://10.0.2.2:5001`)

---

## REST Endpoints

### 1. Authentication

#### `POST /api/auth/send-otp`
Generates and dispatches a 6-digit verification code. Auto-registers new staff accounts.
- **Request Body**:
  ```json
  {
    "mobile": "9876543210",
    "email": "doctor@hospital.com",
    "role": "doctor"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "OTP sent successfully.",
    "devOtp": "123456"
  }
  ```

#### `POST /api/auth/verify-otp`
Validates 6-digit OTP and authenticates staff session.
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
    "user": {
      "role": "doctor",
      "name": "Dr. Sarah Jenkins",
      "staffId": "DOC-901"
    }
  }
  ```

---

### 2. Patient Directory & Telemetry

#### `GET /api/patients`
Retrieves all registered hospital patients.
- **Response**: Array of Patient objects.

#### `GET /api/patients/:id`
Retrieves single patient profile demographics.

#### `POST /api/patients`
Registers a new hospital patient.

#### `PUT /api/patients/:id`
Updates patient profile demographics or doctor assignments.

#### `GET /api/patients/:id/history`
Returns stored sensor telemetry log history for the patient.

#### `GET /api/patients/:id/thresholds`
Retrieves safety threshold parameters for vital alerts.

#### `POST /api/patients/:id/thresholds`
Updates safety threshold parameters for heart rate, SpO2, blood pressure, and temperature.

---

### 3. Staff Management

#### `GET /api/staff`
Lists all verified hospital staff members.

#### `POST /api/staff`
Registers a new staff member account (Doctor or Caretaker).

#### `DELETE /api/staff/:id`
Deletes a staff member account.

---

## Socket.IO Events

### Client Listeners

- `sensor_data`: Broadcasts real-time patient telemetry.
  ```json
  {
    "patient_id": 1,
    "hr": 78,
    "bpSys": 118,
    "bpDia": 78,
    "spo2": 98,
    "temp": 98.6,
    "healthScore": 100,
    "timestamp": 1725615000000
  }
  ```

- `emergency_alert`: Fired when vitals breach threshold limits.
  ```json
  {
    "patient_id": 1,
    "patient_name": "John Doe",
    "alerts": ["High Heart Rate: 125 bpm", "Low SpO2: 89%"],
    "timestamp": 1725615000000
  }
  ```
