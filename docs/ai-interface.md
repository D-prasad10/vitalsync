# SWASTHYAEDGE AI Engine Integration Interface

## 1. Overview & Current Implementation Status

The backend acts as an integration bridge between real-time hardware telemetry and an external AI Inference Engine.

> [!IMPORTANT]
> The backend **does NOT implement the AI machine learning model internally**.
> It provides a robust, non-blocking HTTP bridge configured via `AI_ENGINE_URL`.
> The primary machine learning models and inference services operate as a decoupled microservice (e.g. Python FastAPI / HTTP Server in `ai-engine/`).

### Baseline Deterministic Heuristic Scoring Fallback
When the AI service is offline, unconfigured, or timed out, the backend seamlessly falls back to a deterministic mathematical heuristic health scoring algorithm:
- **Total Base Score**: 100 points
- **Temperature Weight (40 pts)**: 40 pts for optimal range ($97^\circ\text{F} \le T \le 99^\circ\text{F}$); 25 pts for acceptable range ($96^\circ\text{F} \le T \le 100.4^\circ\text{F}$); 0 pts otherwise.
- **Gas Environment (MQ-135, 35 pts)**: 35 pts for `"NORMAL"`, 0 pts for `"ALERT"`.
- **ECG Lead Connectivity (25 pts)**: 25 pts when leads are securely attached; 0 pts if `loPlus` or `loMinus` are triggered.
- **Formula**: $\text{HealthScore} = \text{round}\left(\frac{\text{EarnedScore}}{\text{TotalWeights}} \times 100\right)$

---

## 2. Architecture & Integration Boundary

The AI Engine operates as an independent, decoupled microservice communicating via HTTP/REST:

```
                                  INTEGRATION BOUNDARY
┌──────────────────────────┐               │               ┌───────────────────────────┐
│     Node.js Backend      │               │               │   Python / AI Engine      │
│  (SwasthyaEdge Service)  │               │               │     (Port 5002 / 8000)    │
│                          │               │               │                           │
│  1. Receives ESP8266     │               │               │  1. Feature Preprocessing │
│     telemetry            │               │               │     • Scaling / Encoders  │
│  2. Normalizes units &   │               │               │     • Unit Validation     │
│     validates schema     │               │               │  2. Model Inference       │
│  3. Formulates inference │ ─── POST ───► │ ─── HTTP ───► │     • Isolation Forest    │
│     payload              │  /predict or  │               │     • Arrhythmia (CNN)    │
│                          │   /analyze    │               │     • Risk Classifier     │
│  4. Emits to Socket.IO   │ ◄── JSON ──── │ ◄── JSON ──── │  3. Formulate Predictions │
│     and updates DB       │   Response    │   Response    │     • Risk Indices & Alert│
└──────────────────────────┘               │               └───────────────────────────┘
                                           │
```

- **Boundary Location**: Invoked immediately after telemetry canonical normalization.
- **Calling Protocol**: Non-blocking asynchronous HTTP POST with strict timeout (2500ms). Real-time telemetry delivery to WebSocket clients and databases never blocks on AI latency.

---

## 3. Configuration

Set the AI Engine base URL in `backend/.env` (or server environment variables):

```env
AI_ENGINE_URL=http://127.0.0.1:5002
```

If `AI_ENGINE_URL` is omitted or empty, the backend operates in standalone mode without attempting AI calls.

---

## 4. Telemetry Prediction Request

When normalized telemetry arrives, the backend sends an asynchronous HTTP POST request to the configured AI engine:

```http
POST ${AI_ENGINE_URL}/predict
Content-Type: application/json
Timeout: 2500ms
```

*(Note: The AI engine also accepts `POST /analyze` for direct raw sensor feature inference).*

### Request Payload (`/predict`)

```json
{
  "patientId": 1,
  "deviceId": "ESP8266-001",
  "timestamp": 1726919400000,
  "telemetry": {
    "dhtTemp": 28.5,
    "bmpTemp": 28.3,
    "temp": 82.9,
    "humidity": 62.0,
    "pressure": 1008.4,
    "ecg": {
      "value": 512,
      "leadOffPlus": false,
      "leadOffMinus": false,
      "leadsConnected": true
    },
    "maxFound": true,
    "maxIR": 18432,
    "maxRED": 15200,
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
    "healthScore": 100
  }
}
```

### Direct Feature Payload (`/analyze`)

```json
{
  "temperature_c": 28.3,
  "humidity_percent": 62.0,
  "pressure_hpa": 1008.4,
  "ecg_raw": 512,
  "max30100_ir_raw": 18432,
  "max30100_red_raw": 15200,
  "acc_x": 120,
  "acc_y": -30,
  "acc_z": 16320,
  "gyro_x": 5,
  "gyro_y": -2,
  "gyro_z": 1,
  "air_quality_alert": 0
}
```

---

## 5. Expected AI Engine Response

The external AI service returns a JSON response with HTTP 200:

```json
{
  "patientId": 1,
  "riskLevel": "moderate",
  "riskType": "anomaly",
  "confidence": 0.87,
  "modelVersion": "v1.0.0",
  "explanation": "Elevated ambient temperature with baseline ECG rhythm."
}
```

*(Or for `/analyze`: `{"anomaly": false, "anomaly_score": 0.12, "risk_level": "low", "alert": false}`)*

### Response Field Definitions

| Field | Type | Description |
| :--- | :--- | :--- |
| `patientId` | `number` | Target patient ID |
| `riskLevel` | `string` | Risk tier (e.g. `'low'`, `'moderate'`, `'high'`, `'critical'`) |
| `riskType` | `string` | Category of risk detected |
| `confidence`| `number` | Confidence probability between 0.0 and 1.0 |
| `modelVersion` | `string` | Version identifier of the inference model |
| `explanation` | `string` | Human-readable explanation for clinical staff |

---

## 6. Advanced ML Models & Algorithmic Roadmap

| Clinical Domain | Model Architecture | Intended Input Features | Target Output |
| :--- | :--- | :--- | :--- |
| **Cardiac Rhythm** | 1D ResNet / 1D CNN | AD8232 ECG time series (250 Hz, 5s window) | Classification: Sinus, Tachycardia, Bradycardia, PVC, Atrial Fibrillation. |
| **SpO2 & Pulse** | Digital Signal Processing + Random Forest | MAX30100 raw IR and RED optical signals | Filtered Heart Rate (BPM) and calculated SpO2 (%). |
| **Fall & Motion** | Thresholded Decision Tree / SVM | MPU6050 3-axis accel vector magnitude: $\|a\| = \sqrt{a_x^2 + a_y^2 + a_z^2}$ | Fall alert flag (`true`/`false`). |
| **Early Warning** | Recurrent Neural Network (LSTM / GRU) | Multi-variate 30-minute history (Temp, HR, SpO2 trends) | Modified Early Warning Score (MEWS) trajectory. |

---

## 7. Fault Tolerance & Non-Blocking Design

Because SwasthyaEdge monitors human patients, the architecture guarantees zero service degradation if the AI subsystem encounters errors:

1. **Strict Non-Blocking Asynchrony**:
   - Telemetry ingestion from hardware **NEVER fails** if the AI Engine is unavailable, times out, returns HTTP 500, or sends malformed data.
   - Telemetry delivery to clinical dashboards remains instantaneous (< 500ms).

2. **Timeout Enforcement**:
   - HTTP request timeout is enforced at **2500ms** on AI calls to eliminate hanging sockets and resource exhaustion.

3. **Persistence**:
   - Successfully parsed predictions are saved to the SQLite `ai_predictions` table.
   - Anomaly evaluation is also logged in `sensor_logs` (`ai_risk_level`, `ai_anomaly_score`).

4. **Real-Time Broadcast**:
   - Emits the `ai_prediction` event over Socket.IO (globally and to `patient:${patientId}`).

5. **Graceful Fallback to Rule-Based Heuristics**:
   - In the event of AI engine downtime or timeouts:
     - The backend automatically falls back to deterministic heuristic score calculation (0–100).
     - Hard medical threshold checks continue uninterrupted (`hr_max`, `temp_max`, `mq135`, `leadOff`).
