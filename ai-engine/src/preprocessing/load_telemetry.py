import pandas as pd


REQUIRED_COLUMNS = [
    "timestamp",
    "temperature_c",
    "humidity_percent",
    "pressure_hpa",
    "ecg_raw",
    "ecg_lead_off",
    "max30100_ir_raw",
    "max30100_red_raw",
    "acc_x",
    "acc_y",
    "acc_z",
    "gyro_x",
    "gyro_y",
    "gyro_z",
    "air_quality_alert",
    "gps_fix",
    "gps_satellites",
]


def load_telemetry(path):
    df = pd.read_csv(path)

    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    if df["timestamp"].isna().any():
        raise ValueError("Invalid timestamp found in telemetry data.")

    boolean_columns = [
        "ecg_lead_off",
        "air_quality_alert",
        "gps_fix",
    ]

    for column in boolean_columns:
        df[column] = df[column].astype(int)

    return df


if __name__ == "__main__":
    data = load_telemetry("data/datasets/sample_telemetry.csv")

    print("Telemetry loaded successfully.")
    print(f"Shape: {data.shape}")
    print("\nData types:")
    print(data.dtypes)
    print("\nFirst rows:")
    print(data.head())
