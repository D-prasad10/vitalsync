# VitalsSync Flutter Mobile Application Guide

The mobile application is located in `mobile/`.

## Framework & Architecture

- **Framework**: Flutter 3 with Dart 3.
- **State Management**: `provider` (`AuthProvider`, `PatientProvider`, `TelemetryProvider`).
- **Networking**: `http` for REST API endpoints and `socket_io_client` for real-time WebSocket telemetry.
- **Charting**: `fl_chart` for Heart Rate, SpO2, Blood Pressure (Systolic + Diastolic), and Body Temperature graphs.
- **Typography & Theme**: Google Fonts (Inter) with custom `AppTheme` matching the web glassmorphism design.

## Directory Structure

```
mobile/lib/
├── core/
│   ├── constants/api_constants.dart
│   └── theme/app_theme.dart
├── models/
│   ├── user.dart
│   ├── patient.dart
│   ├── vital.dart
│   ├── alert.dart
│   └── staff.dart
├── services/
│   ├── api_service.dart
│   ├── auth_service.dart
│   └── socket_service.dart
├── providers/
│   ├── auth_provider.dart
│   ├── patient_provider.dart
│   └── telemetry_provider.dart
├── screens/
│   ├── login/login_screen.dart
│   ├── doctor/doctor_dashboard_screen.dart
│   ├── caretaker/caretaker_dashboard_screen.dart
│   ├── patient/patient_dashboard_screen.dart
│   ├── reports/reports_screen.dart
│   └── profile/profile_screen.dart
├── widgets/
│   ├── sensor_graph_widget.dart
│   ├── patient_card_widget.dart
│   ├── alert_toast_widget.dart
│   └── health_score_panel_widget.dart
└── routes/app_routes.dart
```

## Running the Mobile App

1. Connect to backend: Ensure Node.js server is running on port 5001.
2. Android Emulator: Uses `http://10.0.2.2:5001` alias automatically.
3. Launch command:
   ```bash
   cd mobile
   flutter run
   ```
