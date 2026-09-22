from pathlib import Path

import joblib
import pandas as pd

from src.features.build_features import add_features

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "isolation_forest.joblib"

FEATURE_COLUMNS = [
    "temperature_c",
    "humidity_percent",
    "pressure_hpa",
    "ecg_raw",
    "max30100_ir_raw",
    "max30100_red_raw",
    "acc_magnitude",
    "gyro_magnitude",
    "air_quality_alert",
]


def load_model():
    return joblib.load(MODEL_PATH)


def predict_anomaly(model, telemetry):
    data = pd.DataFrame([telemetry])
    data = add_features(data)

    X = data[FEATURE_COLUMNS]

    prediction = int(model.predict(X)[0])
    score = float(model.decision_function(X)[0])

    return {
        "anomaly": prediction == -1,
        "prediction": prediction,
        "anomaly_score": score,
    }


if __name__ == "__main__":
    model = load_model()

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

    result = predict_anomaly(model, sample)

    print("Inference result:")
    print(result)
