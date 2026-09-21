# SWASTHYAEDGE AI Engine Integration Interface

## 1. Overview

The backend acts as an integration bridge between real-time hardware telemetry and an external AI Inference Engine.

> [!IMPORTANT]
> The backend **does NOT implement the AI machine learning model**.
> It provides a robust, non-blocking HTTP bridge configured via `AI_ENGINE_URL`.

---

## 2. Configuration

Set the AI Engine base URL in `backend/.env` (or environment variables):

```env
AI_ENGINE_URL=http://localhost:8000
```

If `AI_ENGINE_URL` is omitted or empty, the backend operates in standalone mode without attempting AI calls.

---

## 3. Telemetry Prediction Request

When normalized telemetry arrives, the backend sends an asynchronous HTTP POST request to:

```http
POST ${AI_ENGINE_URL}/predict
Content-Type: application/json
Timeout: 2500ms
```

### Request Payload

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

---

## 4. Expected AI Engine Response

The external AI service must return a JSON response with HTTP 200:

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

## 5. Fault Tolerance & Non-Blocking Design

- **Zero-Block Guarantees**: Telemetry ingestion from hardware **NEVER fails** if the AI Engine is unavailable, times out, returns HTTP 500, or returns malformed data.
- **Timeout**: Enforced at 2500ms to prevent resource exhaustion.
- **Persistence**: Valid predictions are saved into the SQLite `ai_predictions` table.
- **Real-Time Broadcast**: Successfully parsed predictions emit the `ai_prediction` event over Socket.IO (globally and to `patient:${patientId}`).
