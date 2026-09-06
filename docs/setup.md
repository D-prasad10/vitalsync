# VitalsSync – Complete Setup & Installation Guide

This document provides comprehensive instructions for installing, configuring, and running the **VitalsSync Real-Time Healthcare Monitoring System**, including the Node.js backend, React web dashboard, and Flutter mobile application.

---

## 📋 System Prerequisites

Before setting up VitalsSync, ensure you have installed:

| Component | Required Version | Verification Command |
| :--- | :--- | :--- |
| **Node.js** | v18.0.0 or higher | `node -v` |
| **npm** | v9.0.0 or higher | `npm -v` |
| **Flutter SDK** | v3.16.0 or higher | `flutter --version` |
| **Dart SDK** | v3.2.0 or higher | `dart --version` |
| **Git** | v2.30.0 or higher | `git --version` |

---

## 🗂️ Project Structure Overview

```text
vitalsync/
├── backend/               # Express + Socket.IO + SQLite Backend Server
├── frontend/              # React + Vite Web Dashboard
├── mobile/                # Flutter Cross-Platform Mobile Application
├── docs/                  # Architecture & API Documentation
├── README.md              # Project Master README
├── .env.example           # Shared Environment Template
└── LICENSE                # MIT License
```

---

## ⚙️ Step 1: Environment Configuration

Create a `.env` file in both `backend/` and `frontend/` (or use root `.env` as reference).

### Backend `.env` (`backend/.env`)
```env
PORT=5001
JWT_SECRET=vitalsync_super_secret_jwt_key_2026
NODE_ENV=development
SOCKET_CORS_ORIGIN=*
```

### Frontend `.env` (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5001
VITE_SOCKET_URL=http://localhost:5001
```

---

## 🛠️ Step 2: Backend Setup & Launch

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Initialize/seed SQLite database (optional/automatic):
   The SQLite database file `vitalsync.db` is initialized automatically when the backend server boots if tables do not exist.

4. Start the Node.js server:
   - **Development mode (with auto-reload):**
     ```bash
     npm run dev
     ```
   - **Production mode:**
     ```bash
     npm start
     ```

5. Verify server status:
   - HTTP API: `http://localhost:5001/api/health` or `http://localhost:5001/api/patients`
   - Console log output: `Server running on port 5001` and `Socket.IO initialized`.

---

## 💻 Step 3: React Web Application Setup

1. Open a new terminal and navigate to `frontend/`:
   ```bash
   cd frontend
   ```

2. Install npm dependencies:
   ```bash
   npm install
   ```

3. Launch Vite development server:
   ```bash
   npm run dev
   ```

4. Access the web dashboard:
   - Open browser at `http://localhost:5173` (or the URL printed in console).

5. Test production build (optional verification):
   ```bash
   npm run build
   ```

---

## 📱 Step 4: Flutter Mobile Application Setup

1. Open a terminal and navigate to `mobile/`:
   ```bash
   cd mobile
   ```

2. Fetch Flutter dependencies:
   ```bash
   flutter pub get
   ```

3. Verify Flutter setup & diagnostics:
   ```bash
   flutter doctor
   ```

4. Configure local backend URL:
   - **iOS Simulator**: Uses `http://localhost:5001`
   - **Android Emulator**: Uses `http://10.0.2.2:5001`
   - **Physical Device**: Uses your computer's local network IP e.g., `http://192.168.1.50:5001`
   - Update `mobile/lib/core/constants/api_constants.dart` if testing on Android emulator or physical device.

5. Launch Mobile App:
   - **Chrome / Web**:
     ```bash
     flutter run -d chrome
     ```
   - **iOS Simulator / macOS**:
     ```bash
     flutter run -d macOS
     ```
   - **Android Emulator**:
     ```bash
     flutter run -d android
     ```

6. Analyze & test codebase:
   ```bash
   flutter analyze
   flutter test
   ```

---

## 🔑 Default Test Credentials

For testing role-based access control (RBAC), the following pre-configured user roles are available in the database:

| Role | Email | Password | Allowed Dashboards / Actions |
| :--- | :--- | :--- | :--- |
| **Doctor** | `doctor@vitalsync.com` | `doctor123` | Full patient access, Vitals, Reports, Staff Management |
| **Caretaker** | `caretaker@vitalsync.com` | `caretaker123` | Assigned patients, Emergency alerts, Live Vitals |
| **Patient** | `patient@vitalsync.com` | `patient123` | Personal health dashboard, personal vital trends |

---

## 🔍 Troubleshooting & Common Issues

### 1. Connection Refused on Mobile / Android Emulator
- Android emulators map `localhost` to `10.0.2.2`. Modify `baseUrl` in `mobile/lib/core/constants/api_constants.dart` to `http://10.0.2.2:5001/api`.

### 2. CORS Errors on Web Dashboard
- Ensure backend `server.js` enables CORS with `app.use(cors())` and Socket.IO allows origins `*`.

### 3. Database Locked or Corrupted
- Stop the backend server, remove `backend/vitalsync.db` (if non-production local copy), and restart `npm run dev` to re-initialize SQLite tables.
