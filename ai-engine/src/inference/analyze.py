from src.inference.predict import load_model, predict_anomaly
from src.inference.risk import assess_risk

_cached_model = None


def get_model():
    global _cached_model
    if _cached_model is None:
        _cached_model = load_model()
    return _cached_model


def analyze_telemetry(telemetry, model=None):
    if model is None:
        model = get_model()
    anomaly_result = predict_anomaly(model, telemetry)
    return assess_risk(anomaly_result)


if __name__ == "__main__":
    sample = {
        "temperature_c": 31.2,
        "humidity_percent": 65.0,
        "pressure_hpa": 1008.4,
        "ecg_raw": 512,
        "max30100_ir_raw": 18420,
        "max30100_red_raw": 16210,
        "acc_x": 120,
        "acc_y": -40,
        "acc_z": 16200,
        "gyro_x": 12,
        "gyro_y": 4,
        "gyro_z": 8,
        "air_quality_alert": 0,
    }

    result = analyze_telemetry(sample)

    print("AI analysis:")
    print(result)
