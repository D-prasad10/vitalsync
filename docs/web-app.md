# VitalsSync React Web Application Guide

The web application is located in `frontend/`.

## Architecture & Framework Stack

- **Framework**: React 18 with Vite 7 builder.
- **Styling**: Vanilla CSS Design System (`frontend/src/index.css`) utilizing dark mode glassmorphism variables.
- **Charting**: Chart.js and `react-chartjs-2`.
- **Icons**: Lucide React.
- **Real-Time Engine**: Socket.IO Client.

## Web Application Routes

- `/login` — Unified role login with 6-digit OTP verification flow.
- `/doctor` — Doctor Clinical Dashboard with patient search, triage, live vitals, threshold tuning, and medicine reminders.
- `/caretaker` — Caretaker Station with patient roster cards, real-time vital streams, and emergency phone actions.
- `/patient-dashboard` — Patient Portal featuring 2x2 vital trend graphs (Heart Rate, SpO2, Blood Pressure Systolic/Diastolic, Body Temperature).
- `/patient/:id` — Detailed patient profile dossier and demographics.
- `/staff-management` — RBAC Hospital Directory and staff registration module.
- `/reports` — 7-Day Clinical Dossier with interactive telemetry data table, CSV download, and printable PDF export (`@media print`).

## Key Features

1. **Floating Toast Notification Stack**: Top-right non-blocking alert toasts that stack up to 4 notifications high (`alerts.slice(-4)`).
2. **Clinical Data Export**: Export 7-day telemetry history to `.csv` or print formatted dossier reports.
3. **Responsive Glass Design**: Tailored layout grids for 1440px desktop, 1024px tablet, and 390px mobile screens.
