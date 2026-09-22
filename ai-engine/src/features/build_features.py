import numpy as np
import pandas as pd

from src.preprocessing.load_telemetry import load_telemetry


def add_features(df):
    df = df.copy()

    df["acc_magnitude"] = np.sqrt(
        df["acc_x"] ** 2 +
        df["acc_y"] ** 2 +
        df["acc_z"] ** 2
    )

    df["gyro_magnitude"] = np.sqrt(
        df["gyro_x"] ** 2 +
        df["gyro_y"] ** 2 +
        df["gyro_z"] ** 2
    )

    return df


if __name__ == "__main__":
    data = load_telemetry("data/datasets/sample_telemetry.csv")
    data = add_features(data)

    print("Feature engineering completed.")
    print(data[["acc_magnitude", "gyro_magnitude"]])
    print("\nFeature dataset shape:", data.shape)
