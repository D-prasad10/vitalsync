# VitalsSync Architecture Overview

VitalsSync is an end-to-end real-time healthcare telemetry and patient monitoring platform.

```
                    ┌───────────────────┐
                    │  Simulated IoT /  │
                    │   Vitals Sensors  │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Node.js Backend   │
                    │ (Express + WS)    │
                    └─────────┬─────────┘
                              │
                         SQLite DB
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
┌──────────────────┐                     ┌──────────────────┐
│ React 18 Web App │                     │ Flutter 3 Mobile │
│ (Glassmorphism)  │                     │ App Client       │
└──────────────────┘                     └──────────────────┘
```

---

## System Components

### 1. Backend Service (`backend/`)
- **Technology**: Node.js, Express.js, Socket.IO, SQLite3.
- **Role**: Serves RESTful endpoints for patient rosters, telemetry log history, clinical thresholds, and staff accounts.
- **Simulation Loop**: Broadcasts real-time patient sensor vitals every 3 seconds over Socket.IO (`sensor_data` channel) and evaluates individual threshold alerts (`emergency_alert` channel).

### 2. React Web Dashboard (`frontend/`)
- **Technology**: React 18, Vite 7, Chart.js / `react-chartjs-2`, Vanilla CSS tokens.
- **Role**: Responsive clinical dashboard for Doctors, Caretakers, and Patients. Features 7-day trend dossiers, interactive telemetry tables, printable PDF dossiers, and CSV data export.

### 3. Flutter Mobile App (`mobile/`)
- **Technology**: Flutter 3, Dart 3, `provider`, `fl_chart`, `socket_io_client`, `http`.
- **Role**: Multi-platform mobile app for iOS and Android. Enables on-the-go patient vitals monitoring, real-time threshold alert toasts, and role-based views.

---

## Data Flow & Real-Time Sync

1. **REST Initial Loading**: When a user logs in or selects a patient, the client fetches the patient dossier via `GET /api/patients/:id` and stored history via `GET /api/patients/:id/history`.
2. **Socket.IO Real-Time Stream**: Live telemetry points broadcast on `sensor_data` are appended to state (`globalRealtimeData` in Web, `TelemetryProvider` in Mobile).
3. **Threshold Alerts**: If vitals breach min/max thresholds, an `emergency_alert` event fires, displaying non-blocking floating alert toasts across both Web and Mobile platforms.
