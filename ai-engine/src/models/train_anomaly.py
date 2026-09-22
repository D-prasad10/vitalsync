import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

from src.features.build_features import add_features
from src.preprocessing.load_telemetry import load_telemetry


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


def train_anomaly_model():
    data = load_telemetry("data/datasets/sample_telemetry.csv")
    data = add_features(data)

    X = data[FEATURE_COLUMNS]

    model = IsolationForest(
        n_estimators=100,
        contamination="auto",
        random_state=42
    )

    model.fit(X)

    data["anomaly_prediction"] = model.predict(X)
    data["anomaly_score"] = model.decision_function(X)

    joblib.dump(
        model,
        "src/models/isolation_forest.joblib"
    )

    return data


if __name__ == "__main__":
    results = train_anomaly_model()

    print("Isolation Forest training completed.")
    print("\nPredictions:")
    print(
        results[
            ["timestamp", "anomaly_prediction", "anomaly_score"]
        ]
    )
