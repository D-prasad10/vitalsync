# SwasthyaEdge (VitalsSync) AI Interface Specification

## 1. Actual Implementation Audit & Current Status

> [!IMPORTANT]
> **AI Inference Implementation Status: NOT IMPLEMENTED (PLANNED)**  
> Comprehensive static code analysis of both the backend (`backend/server.js`, `backend/database.js`) and frontend (`frontend/src/`) repositories confirms that **no real AI/ML inference engine currently exists in the codebase**. There are no TensorFlow, PyTorch, ONNX, scikit-learn, or external generative AI (e.g. Gemini, OpenAI) libraries or API integrations present.

### What Actually Exists Today: Deterministic Heuristic Scoring
What currently functions as the "Health Score" in `backend/server.js` is a hardcoded, deterministic mathematical weighting algorithm:

1. **In Hardware Ingestion Mode (`ingestHardwareTelemetry()`)**:
   - Total base score: 100 points.
   - **Temperature**: 40 points (40 pts if $97^\circ\text{F} \le T \le 99^\circ\text{F}$; 25 pts if $96^\circ\text{F} \le T \le 100.4^\circ\text{F}$; 0 pts otherwise).
   - **Gas Environment (MQ-135)**: 35 points (35 pts if status is `"NORMAL"`, 0 pts if `"ALERT"`).
   - **ECG Lead Connectivity**: 25 points (25 pts if electrodes are attached, 0 pts if `loPlus` or `loMinus` are triggered).
   - Formula: $\text{HealthScore} = \text{round}\left(\frac{\text{EarnedScore}}{\text{TotalWeights}} \times 100\right)$.

2. **In Simulation Mode (Legacy 3-second simulation loop)**:
   - 25 points allocated across 4 vital channels (HR, Systolic BP, SpO2, Temperature) based on static normal/warning/critical interval comparisons.

This heuristic algorithm operates without machine learning models, statistical inference, feature embedding, or neural weights.

---

## 2. Planned AI Architecture & Intended Integration Boundary

The section below documents the **PLANNED** AI architecture, intended boundary interfaces, input/output schemas, and failure fallback behaviors for future implementation.

```
                                  INSPECTION BOUNDARY
                                           │
┌──────────────────────────┐               │               ┌───────────────────────────┐
│     BACKEND INGESTION    │               │               │    AI INFERENCE ENGINE    │
│  (backend/server.js)     │               │               │    (PLANNED MICROSERVICE) │
│                          │               │               │                           │
│  1. Receives ESP8266     │               │               │  1. Feature Preprocessing │
│     telemetry            │               │               │     • Bandpass Filter     │
│  2. Normalizes units &   │               │               │     • Normalization       │
│     validates schema     │               │               │  2. Model Inference       │
│  3. Maintains rolling    │ ─── POST ───► │ ─── HTTP ───► │     • Arrhythmia (CNN)    │
│     telemetry window     │   /inference  │   or gRPC     │     • Hypoxia Risk (LSTM) │
│     (10s buffer)         │   (Async)     │               │     • Fall Detection      │
│                          │               │               │  3. Formulate Predictions │
│  4. Emits to Socket.IO   │ ◄── JSON ──── │ ◄── JSON ──── │     • Risk Indices        │
│     and updates DB       │   Response    │   Response    │     • Clinical Insights   │
└──────────────────────────┘               │               └───────────────────────────┘
                                           │
```

### 2.1 Intended Integration Boundary
The AI Engine should operate as a decoupled, asynchronous microservice (e.g. FastAPI/Python or ONNX Runtime Node.js worker) communicating via HTTP/REST or gRPC:
- **Boundary Location**: Situated immediately after `ingestHardwareTelemetry()` in `backend/server.js`.
- **Calling Protocol**: Non-blocking asynchronous HTTP POST with strict timeout (e.g. 250ms). Telemetry broadcasting must never block on AI model latency.
- **State Buffer**: Backend maintains a rolling sliding window of the last 30 data points (~30 seconds at 1 Hz) per patient to supply time-series context to the models.

---

## 3. Planned Input Schema (`POST /v1/infer`)

The proposed telemetry context payload passed from the Node.js backend to the AI Inference Engine:

```json
{
  "patient": {
    "patientId": 1,
    "age": 45,
    "gender": "Male",
    "knownConditions": ["Hypertension"],
    "thresholds": {
      "hr_max": 100,
      "hr_min": 60,
      "temp_max": 99.5
    }
  },
  "window": {
    "sampleCount": 30,
    "windowDurationMs": 30000,
    "timestamps": [1726852000000, 1726852001000, 1726852002000],
    "ecgWaveform": [512, 518, 535, 620, 480, 510, 514],
    "ppg": {
      "rawIR": [18400, 18420, 18450, 18490, 18430],
      "rawRED": [15200, 15210, 15240, 15280, 15220]
    },
    "temperature": [98.4, 98.4, 98.5],
    "imu": {
      "accX": [120, 122, 118],
      "accY": [-30, -28, -32],
      "accZ": [16320, 16300, 16350]
    },
    "mq135Status": ["NORMAL", "NORMAL", "NORMAL"],
    "leadsConnected": [true, true, true]
  }
}
```

### Input Field Breakdown
- `patient`: Demographic parameters necessary for adjusting baseline neural weights (e.g. age-adjusted pediatric vs geriatric cardiac norms).
- `window.ecgWaveform`: Continuous array of 10-bit AD8232 analog voltage conversions sampled at 100 Hz or 10 Hz for QRS complex and arrhythmia detection.
- `window.ppg`: Dual-wavelength optical time-series arrays for extracting pulsatile $AC/DC$ ratios and calculating true SpO2.
- `window.imu`: 3-axis accelerometer and gyroscope vectors for identifying sudden impacts indicative of patient falls.

---

## 4. Planned Output Schema

The structured JSON returned by the AI Inference Engine:

```json
{
  "inferenceId": "inf-98124701",
  "patientId": 1,
  "timestamp": 1726852030000,
  "executionDurationMs": 42.8,
  "models": {
    "ecgArrhythmiaClassifier": "ecg-resnet18-v1.2",
    "spO2Estimator": "ppg-dsp-v2.0",
    "fallDetector": "imu-svm-v1.0",
    "decompensationForecaster": "lstm-vitals-v1.1"
  },
  "predictions": {
    "cardiacRiskIndex": 0.12,
    "arrhythmiaClassification": {
      "label": "NORMAL_SINUS_RHYTHM",
      "confidence": 0.96,
      "detectedAnomalies": []
    },
    "derivedVitals": {
      "estimatedHeartRateBpm": 74,
      "estimatedSpO2Percent": 98.2,
      "confidence": 0.91
    },
    "fallDetection": {
      "fallDetected": false,
      "confidence": 0.99
    },
    "patientStabilityScore": 94,
    "decompensationRisk30Min": 0.05
  },
  "clinicalActionRecommendations": [
    {
      "priority": "LOW",
      "message": "Vitals stable within baseline range. Maintain standard monitoring."
    }
  ]
}
```

---

## 5. Planned Models & Algorithms

| Clinical Domain | Model Architecture | Intended Input Features | Target Output |
| :--- | :--- | :--- | :--- |
| **Cardiac Rhythm** | 1D ResNet / 1D CNN | AD8232 ECG time series (250 Hz, 5s window) | Classification: Sinus, Tachycardia, Bradycardia, PVC, Atrial Fibrillation. |
| **SpO2 & Pulse** | Digital Signal Processing + Random Forest | MAX30100 raw IR and RED optical signals | Filtered Heart Rate (BPM) and calculated SpO2 (%). |
| **Fall & Motion** | Thresholded Decision Tree / SVM | MPU6050 3-axis accel vector magnitude: $\|a\| = \sqrt{a_x^2 + a_y^2 + a_z^2}$ | Fall alert flag (`true`/`false`). |
| **Early Warning** | Recurrent Neural Network (LSTM / GRU) | Multi-variate 30-minute history (Temp, HR, SpO2 trends) | Modified Early Warning Score (MEWS) trajectory. |

---

## 6. Error Handling & Fallback Behavior

Because SwasthyaEdge monitors medical patients, the architecture must guarantee zero service degradation if the AI subsystem fails:

1. **Strict Non-Blocking Asynchrony**:
   - Telemetry ingestion and WebSocket streaming operate on an event loop independent of AI inference.
   - If the AI engine is slow, telemetry delivery to clinical dashboards remains instantaneous (<500ms).

2. **Timeout Enforcement (Circuit Breaker)**:
   - Backend sets an HTTP request timeout of **300ms** on AI microservice calls.
   - If 3 consecutive calls exceed 300ms or return 5xx errors, the circuit breaker trips to `OPEN` for 30 seconds.

3. **Graceful Fallback to Rule-Based Heuristics**:
   - In the event of AI engine unavailability, timeout, or low model confidence ($<0.60$):
     - The backend automatically falls back to the deterministic heuristic score calculation ($0-100$).
     - The backend continues enforcing hard medical threshold checks (`hr_max`, `temp_max`, `mq135`, `leadOff`).
     - Dashboard badges display `AI: Heuristic Fallback (Offline)`.
     - An error log is recorded in `error.log` without crashing the Express server.
