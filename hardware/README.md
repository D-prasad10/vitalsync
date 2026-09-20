# VitalsSync Hardware Integration — ESP8266 / NodeMCU

This directory contains the production-ready Arduino firmware and hardware pinout specifications for the VitalsSync healthcare monitoring system.

---

## 1. Hardware Pinout & Wiring Specification

| Sensor / Module | Hardware Interface | NodeMCU Pin | ESP8266 GPIO | Description / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DHT11** | Single-bus Digital | **D5** | GPIO 14 | Ambient temperature (°C) and relative humidity (%) |
| **BMP280** | I2C (`0x76`) | **D2 (SDA), D1 (SCL)** | GPIO 4, GPIO 5 | High-precision barometric pressure (hPa) & temperature |
| **MPU6050** | I2C (`0x68`) | **D2 (SDA), D1 (SCL)** | GPIO 4, GPIO 5 | 3-axis accelerometer (X, Y, Z) and gyroscope (X, Y, Z) |
| **AD8232 ECG** | Analog + Digital | **A0, D6, D7** | A0, GPIO 12, GPIO 13 | A0 = ECG Analog waveform; D6 = LO+; D7 = LO- lead detection |
| **MAX30100** | I2C (`0x57`) | **D2 (SDA), D1 (SCL)** | GPIO 4, GPIO 5 | Optical photoplethysmography (SpO2 & Heart Rate) |
| **MQ-135** | Digital Threshold | **D0** | GPIO 16 | Digital Output: **LOW** = Smoke/Toxic Gas Alert, **HIGH** = Normal |
| **GPS (NEO-6M/8M)**| UART Serial | **D3 (RX), D4 (TX)** | GPIO 0, GPIO 2 | SoftwareSerial 9600 baud; Satellites, Latitude, Longitude |
| **OLED SSD1306** | I2C (`0x3C`) | **D2 (SDA), D1 (SCL)** | GPIO 4, GPIO 5 | 128x64 display for local device status, IP, and alerts |

---

## 2. Required Arduino IDE Libraries

Install the following libraries via the Arduino IDE Library Manager:
1. `DHT sensor library` by Adafruit
2. `Adafruit BMP280 Library` by Adafruit
3. `Adafruit MPU6050` by Adafruit
4. `Adafruit SSD1306` & `Adafruit GFX Library` by Adafruit
5. `TinyGPSPlus` by Mikal Hart
6. `MAX30100lib` by OXullo Interventi

---

## 3. Local Web Server & Backend Ingestion Endpoints

The ESP8266 hosts a local web server on port 80 and transmits data to the central VitalsSync server:
- **`GET http://<ESP8266_IP>/`**: Live HTML hardware diagnostic and test dashboard.
- **`GET http://<ESP8266_IP>/data`**: Real-time JSON telemetry payload.
- **`POST http://<YOUR_COMPUTER_LAN_IP>:5001/api/telemetry/esp8266`**: Periodic non-blocking telemetry ingestion stream to the VitalsSync Node.js backend.

---

## 4. Configuration & Flashing Instructions

1. Open [`hardware/vitalsync_esp8266/vitalsync_esp8266.ino`](vitalsync_esp8266/vitalsync_esp8266.ino) in the Arduino IDE.
2. Select Board: **NodeMCU 1.0 (ESP-12E Module)**.
3. Find your computer's LAN IP address:
   - **macOS / Linux**: run `ipconfig getifaddr en0` or `hostname -I`
   - **Windows**: run `ipconfig` in Command Prompt (IPv4 Address)
   - *Example LAN IP: `192.168.1.15`*
4. Update your Wi-Fi credentials and backend server address in the `.ino` file:
   ```cpp
   const char* WIFI_SSID     = "Your_WiFi_Network";
   const char* WIFI_PASS     = "Your_WiFi_Password";
   // Use your computer's LAN IP on port 5001 (NOT localhost!)
   const char* BACKEND_URL   = "http://192.168.1.15:5001/api/telemetry/esp8266";
   const char* DEVICE_ID     = "ESP8266-001";
   const int   PATIENT_ID    = 1;
   ```
5. Flash the code to your ESP8266 board via USB.
6. Open the Serial Monitor at **115200 baud** to observe sensor boot diagnostics, local IP address, and transmission logs.

---

## 4. Medical Integrity & Sensor Rules
- **No Blood Pressure Fabrication**: The hardware suite has no cuff or NIBP module. The backend and firmware explicitly pass `null` for BP. The dashboard displays `Unavailable (No Sensor)`.
- **MAX30100 True Optical Acquisition**: Heart rate and SpO2 are acquired only when a genuine finger is placed on the optical photodiode. When finger is absent, values are reported as `null` (never fabricated).
- **ECG Lead-off Detection**: If either `LO+` (D6) or `LO-` (D7) is active, the dashboard triggers an immediate alert: `⚠️ ECG Leads Disconnected`.
- **MQ-135 Gas Detection**: When D0 goes `LOW`, the system triggers an emergency alert: `⚠️ Toxic Gas / Smoke Threshold Exceeded`.
