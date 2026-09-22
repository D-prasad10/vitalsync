import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

# Ensure ai-engine root is in sys.path
_AI_ENGINE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_AI_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ENGINE_ROOT))

from src.inference.analyze import analyze_telemetry, get_model

REQUIRED_FIELDS = [
    "temperature_c",
    "humidity_percent",
    "pressure_hpa",
    "ecg_raw",
    "max30100_ir_raw",
    "max30100_red_raw",
    "acc_x",
    "acc_y",
    "acc_z",
    "gyro_x",
    "gyro_y",
    "gyro_z",
    "air_quality_alert",
]


class TelemetryRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data):
        response_bytes = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if path == "/health":
            self._send_json(200, {"status": "ok"})
        elif path == "/analyze":
            self._send_json(405, {"error": "Method Not Allowed. Use POST /analyze."})
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if path == "/analyze":
            self._handle_analyze()
        elif path == "/health":
            self._send_json(405, {"error": "Method Not Allowed. Use GET /health."})
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_PUT(self):
        self._send_json(405, {"error": "Method Not Allowed"})

    def do_DELETE(self):
        self._send_json(405, {"error": "Method Not Allowed"})

    def do_PATCH(self):
        self._send_json(405, {"error": "Method Not Allowed"})

    def _handle_analyze(self):
        content_length = self.headers.get("Content-Length")
        if not content_length:
            self._send_json(400, {"error": "Missing Content-Length header or empty body"})
            return

        try:
            length = int(content_length)
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body)
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        if not isinstance(data, dict):
            self._send_json(400, {"error": "Telemetry payload must be a JSON object"})
            return

        missing_fields = [f for f in REQUIRED_FIELDS if f not in data]
        if missing_fields:
            self._send_json(
                400,
                {
                    "error": "Missing required telemetry field(s)",
                    "missing_fields": missing_fields,
                },
            )
            return

        null_fields = [f for f in REQUIRED_FIELDS if data.get(f) is None]
        if null_fields:
            self._send_json(
                400,
                {
                    "error": "Required telemetry field(s) cannot be null",
                    "invalid_fields": null_fields,
                },
            )
            return

        try:
            result = analyze_telemetry(data)
            self._send_json(200, result)
        except Exception as e:
            self._send_json(500, {"error": f"Inference processing error: {str(e)}"})

    def log_message(self, format, *args):
        sys.stderr.write(f"[AI-ENGINE] {self.address_string()} - {format % args}\n")


def create_server(host="127.0.0.1", port=None):
    if port is None:
        port = int(os.environ.get("AI_ENGINE_PORT", 5002))

    # Preload the Isolation Forest model into memory at startup
    print("[AI-ENGINE] Loading Isolation Forest model into memory...")
    get_model()
    print("[AI-ENGINE] Model loaded successfully into memory.")

    server_address = (host, port)
    return ThreadingHTTPServer(server_address, TelemetryRequestHandler)


def run_server(host="127.0.0.1", port=None):
    if port is None:
        port = int(os.environ.get("AI_ENGINE_PORT", 5002))

    httpd = create_server(host=host, port=port)

    print("=" * 60)
    print("  VitalsSync / SwasthyaEdge AI Engine HTTP Bridge")
    print(f"  Listening on: http://{host}:{port}")
    print("  Endpoints:")
    print("    GET  /health   -> Status check ({\"status\":\"ok\"})")
    print("    POST /analyze  -> Unified AI inference & risk assessment")
    print("=" * 60, flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[AI-ENGINE] Shutting down AI Engine server...")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run_server()
