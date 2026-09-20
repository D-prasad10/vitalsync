/*
 * =========================================================================================
 * VitalsSync ESP8266 / NodeMCU Real Hardware Sensor Telemetry Firmware
 * =========================================================================================
 * Hardware Components:
 *   1. DHT11             - Digital Pin D5 (GPIO 14) [Temp & Humidity]
 *   2. BMP280            - I2C addr 0x76 (SDA=D2, SCL=D1) [Temp & Barometric Pressure]
 *   3. MPU6050           - I2C addr 0x68 (SDA=D2, SCL=D1) [3-Axis Accel & Gyroscope]
 *   4. AD8232 ECG        - Analog A0, LO+ D6 (GPIO 12), LO- D7 (GPIO 13)
 *   5. MAX30100 PulseOx  - I2C addr 0x57 (SDA=D2, SCL=D1) [Optical raw IR/RED sensors]
 *   6. MQ-135 Gas Sensor - Digital Out D0 (GPIO 16) [LOW = Threshold Alert, HIGH = Normal]
 *   7. GPS (NEO-6M/8M)   - SoftwareSerial RX=D3 (GPIO 0), TX=D4 (GPIO 2) at 9600 baud
 *   8. OLED SSD1306      - I2C addr 0x3C (SDA=D2, SCL=D1) [Local Status Screen]
 *
 * Local Web Server:
 *   GET /      - Local hardware diagnostic and sensor test page
 *   GET /data  - Live JSON telemetry endpoint
 *
 * Backend Telemetry Ingestion:
 *   POST http://<YOUR_LAN_IP>:5001/api/telemetry/esp8266
 * =========================================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include <MAX30100.h>

// ── Wi-Fi & Backend Configuration ────────────────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";

// NOTE: Replace 192.168.1.100 with your computer's actual local LAN IP (e.g. 192.168.1.5)
// The VitalsSync backend runs on port 5001. Do NOT use localhost.
const char* BACKEND_URL   = "http://192.168.1.100:5001/api/telemetry/esp8266";
const char* DEVICE_ID     = "ESP8266-001";
const int   PATIENT_ID    = 1;
const unsigned long TELEMETRY_INTERVAL_MS = 1000; // 1 second interval between POST transmissions

// ── Pin Definitions ──────────────────────────────────────────────────────────────────────
#define PIN_DHT11       14  // NodeMCU D5 (GPIO 14)
#define PIN_AD8232_A0   A0  // Analog ECG input
#define PIN_ECG_LOP     12  // NodeMCU D6 (GPIO 12) - Lead Off +
#define PIN_ECG_LOM     13  // NodeMCU D7 (GPIO 13) - Lead Off -
#define PIN_MQ135_DO    16  // NodeMCU D0 (GPIO 16) - Digital threshold output
#define PIN_GPS_RX      0   // NodeMCU D3 (GPIO 0)  - Connect to GPS TX
#define PIN_GPS_TX      2   // NodeMCU D4 (GPIO 2)  - Connect to GPS RX

#define OLED_SCREEN_WIDTH   128
#define OLED_SCREEN_HEIGHT  64
#define OLED_RESET_PIN      -1

// ── Sensor Objects & Servers ─────────────────────────────────────────────────────────────
ESP8266WebServer server(80);
DHT dht(PIN_DHT11, DHT11);
Adafruit_BMP280 bmp; // I2C address 0x76
Adafruit_MPU6050 mpu; // I2C address 0x68
Adafruit_SSD1306 display(OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, &Wire, OLED_RESET_PIN);
SoftwareSerial gpsSerial(PIN_GPS_RX, PIN_GPS_TX);
TinyGPSPlus gps;
MAX30100 pox;

// ── Hardware Sensor State ────────────────────────────────────────────────────────────────
bool bmpAvailable     = false;
bool mpuAvailable     = false;
bool oledAvailable    = false;
bool max30100Available = false;

// Live readings buffer
float dhtTemp = 0.0;
float dhtHumidity = 0.0;
float bmpTemp = 0.0;
float bmpPressure = 0.0;
int   ecgRaw = 0;
int   loPlus = 0;
int   loMinus = 0;
int   mq135Val = 1;
int   accX = 0, accY = 0, accZ = 0;
int   gyroX = 0, gyroY = 0, gyroZ = 0;
uint16_t rawIR = 0;
uint16_t rawRED = 0;
int   gpsSat = 0;
bool  gpsFix = false;

unsigned long lastTelemetrySent = 0;
unsigned long lastOledRefresh   = 0;
unsigned long lastSensorSample  = 0;

// ── JSON Telemetry Builder ───────────────────────────────────────────────────────────────
String buildTelemetryJson() {
  String json = "{";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  json += "\"patientId\":" + String(PATIENT_ID) + ",";
  json += "\"dhtTemp\":" + String(dhtTemp, 2) + ",";
  json += "\"humidity\":" + String(dhtHumidity, 2) + ",";
  json += "\"bmpTemp\":" + String(bmpTemp, 2) + ",";
  json += "\"pressure\":" + String(bmpPressure, 2) + ",";
  json += "\"ecg\":" + String(ecgRaw) + ",";
  json += "\"loPlus\":" + String(loPlus) + ",";
  json += "\"loMinus\":" + String(loMinus) + ",";
  json += "\"mq135\":" + String(mq135Val) + ",";
  json += "\"accX\":" + String(accX) + ",";
  json += "\"accY\":" + String(accY) + ",";
  json += "\"accZ\":" + String(accZ) + ",";
  json += "\"gyroX\":" + String(gyroX) + ",";
  json += "\"gyroY\":" + String(gyroY) + ",";
  json += "\"gyroZ\":" + String(gyroZ) + ",";
  json += "\"maxFound\":" + String(max30100Available ? "true" : "false") + ",";
  json += "\"maxIR\":" + String(rawIR) + ",";
  json += "\"maxRED\":" + String(rawRED) + ",";
  json += "\"gpsSat\":" + String(gpsSat) + ",";
  json += "\"gpsFix\":" + String(gpsFix ? "true" : "false");
  json += "}";
  return json;
}

// ── Web Server Handler: Root (Diagnostic Web Page) ───────────────────────────────────────
void handleRoot() {
  String html = F("<!DOCTYPE html><html><head><meta charset='utf-8'><title>VitalsSync ESP8266 Node</title>");
  html += F("<meta name='viewport' content='width=device-width, initial-scale=1'>");
  html += F("<style>body{font-family:Arial,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px;}");
  html += F(".card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:12px;}");
  html += F("h1{color:#58a6ff;font-size:20px;}code{color:#7ee787;}</style></head><body>");
  html += F("<h1>VitalsSync ESP8266 Hardware Sensor Node</h1>");
  html += "<div class='card'><p><b>Device:</b> " + String(DEVICE_ID) + "</p>";
  html += "<p><b>IP Address:</b> " + WiFi.localIP().toString() + "</p>";
  html += "<p><b>Backend URL:</b> " + String(BACKEND_URL) + "</p></div>";
  html += F("<div class='card'><h3>Live Sensors</h3><pre><code>");
  html += buildTelemetryJson();
  html += F("</code></pre><p><a href='/data' style='color:#58a6ff;'>Raw JSON /data endpoint</a></p></div></body></html>");
  server.send(200, "text/html", html);
}

// ── Web Server Handler: /data (Live JSON Sensor Data) ────────────────────────────────────
void handleData() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", buildTelemetryJson());
}

// ── OLED Display Update Helper ───────────────────────────────────────────────────────────
void updateOled() {
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // Header
  display.setCursor(0, 0);
  display.print(F("VitalsSync "));
  display.print(DEVICE_ID);

  display.setCursor(82, 0);
  if (WiFi.status() == WL_CONNECTED) {
    display.print(F("[WIFI]"));
  } else {
    display.print(F("[OFF]"));
  }

  // Row 1: Temperatures
  display.setCursor(0, 14);
  display.print(F("T:D "));
  display.print(dhtTemp, 1);
  display.print(F(" B "));
  display.print(bmpTemp, 1);
  display.print(F("C"));

  // Row 2: Humidity & Barometric Pressure
  display.setCursor(0, 26);
  display.print(F("H:"));
  display.print((int)dhtHumidity);
  display.print(F("% P:"));
  display.print((int)bmpPressure);
  display.print(F("hPa"));

  // Row 3: AD8232 ECG & MQ135 Status
  display.setCursor(0, 38);
  display.print(F("ECG:"));
  display.print(ecgRaw);
  if (loPlus || loMinus) {
    display.print(F(" LEADS!"));
  } else {
    display.print(F(" OK"));
  }
  display.setCursor(85, 38);
  display.print(mq135Val == 0 ? F("GAS!") : F("AIR:OK"));

  // Row 4: MAX30100 & GPS
  display.setCursor(0, 50);
  display.print(F("IR:"));
  display.print(rawIR);
  display.setCursor(75, 50);
  display.print(F("GPS:"));
  display.print(gpsSat);
  if (gpsFix) display.print(F("F"));

  display.display();
}

// ── Sample All Physical Sensors ──────────────────────────────────────────────────────────
void sampleSensors() {
  // 1. DHT11
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) dhtTemp = t;
  if (!isnan(h)) dhtHumidity = h;

  // 2. BMP280
  if (bmpAvailable) {
    bmpTemp = bmp.readTemperature();
    bmpPressure = bmp.readPressure() / 100.0F;
  }

  // 3. AD8232 ECG
  ecgRaw = analogRead(PIN_AD8232_A0);
  loPlus = (digitalRead(PIN_ECG_LOP) == HIGH) ? 1 : 0;
  loMinus = (digitalRead(PIN_ECG_LOM) == HIGH) ? 1 : 0;

  // 4. MQ-135 (LOW = Alert threshold crossed, HIGH = Normal)
  mq135Val = (digitalRead(PIN_MQ135_DO) == LOW) ? 0 : 1;

  // 5. MPU6050
  if (mpuAvailable) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    accX = (int)(a.acceleration.x * 100);
    accY = (int)(a.acceleration.y * 100);
    accZ = (int)(a.acceleration.z * 100);
    gyroX = (int)(g.gyro.x * 100);
    gyroY = (int)(g.gyro.y * 100);
    gyroZ = (int)(g.gyro.z * 100);
  }

  // 6. MAX30100 Raw Optical
  if (max30100Available) {
    pox.update();
    rawIR = pox.rawIRValue;
    rawRED = pox.rawRedValue;
  }

  // 7. GPS
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
  gpsSat = gps.satellites.isValid() ? gps.satellites.value() : 0;
  gpsFix = (gps.location.isValid() && gps.location.age() < 5000);
}

// ── Setup ────────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600);
  delay(100);

  Serial.println(F("\n=================================================="));
  Serial.println(F(" VitalsSync ESP8266 Telemetry & Local Server"));
  Serial.println(F("=================================================="));

  pinMode(PIN_ECG_LOP, INPUT);
  pinMode(PIN_ECG_LOM, INPUT);
  pinMode(PIN_MQ135_DO, INPUT);

  Wire.begin(4, 5); // SDA = D2 (GPIO4), SCL = D1 (GPIO5)

  // 1. OLED SSD1306
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    oledAvailable = true;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(5, 10);
    display.println(F("VitalsSync"));
    display.setCursor(5, 24);
    display.println(F("Connecting WiFi..."));
    display.display();
  }

  // 2. DHT11
  dht.begin();

  // 3. BMP280
  if (bmp.begin(0x76)) {
    bmpAvailable = true;
    Serial.println(F("[OK] BMP280 detected at 0x76"));
  }

  // 4. MPU6050
  if (mpu.begin(0x68)) {
    mpuAvailable = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    Serial.println(F("[OK] MPU6050 detected at 0x68"));
  }

  // 5. MAX30100
  if (pox.begin()) {
    max30100Available = true;
    pox.setMode(MAX30100_MODE_SPO2_HR);
    pox.setLedsCurrent(MAX30100_LED_CURR_50MA, MAX30100_LED_CURR_27_1MA);
    Serial.println(F("[OK] MAX30100 raw optical acquisition initialized"));
  }

  // 6. Connect WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print(F("[WIFI] Connecting to "));
  Serial.println(WIFI_SSID);

  // 7. Setup Local Web Server Routes
  server.on("/", handleRoot);
  server.on("/data", handleData);
  server.begin();
  Serial.println(F("[HTTP] Local web server started on port 80"));
}

// ── Main Loop ────────────────────────────────────────────────────────────────────────────
void loop() {
  // 1. Handle incoming HTTP requests on local server (/ and /data)
  server.handleClient();

  // 2. Sample sensors at 100ms intervals
  if (millis() - lastSensorSample >= 100) {
    lastSensorSample = millis();
    sampleSensors();
  }

  // 3. Refresh OLED display (Every 1s)
  if (millis() - lastOledRefresh >= 1000) {
    lastOledRefresh = millis();
    updateOled();
  }

  // 4. Non-blocking Telemetry POST to VitalsSync Backend
  if (millis() - lastTelemetrySent >= TELEMETRY_INTERVAL_MS) {
    lastTelemetrySent = millis();

    // Check WiFi; attempt reconnect without blocking loop
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.reconnect();
      return;
    }

    // Build payload and send HTTP POST
    String payload = buildTelemetryJson();
    WiFiClient client;
    HTTPClient http;
    http.setTimeout(800); // 800ms non-blocking timeout

    if (http.begin(client, BACKEND_URL)) {
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(payload);
      if (httpCode > 0) {
        Serial.printf("[TX] Sent telemetry: HTTP %d\n", httpCode);
      } else {
        Serial.printf("[TX WARN] POST error: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    }
  }
}
