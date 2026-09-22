def assess_risk(anomaly_result):
    score = anomaly_result["anomaly_score"]
    anomaly = anomaly_result["anomaly"]

    if anomaly:
        risk_level = "warning"
        alert = True
    else:
        risk_level = "normal"
        alert = False

    return {
        "anomaly": anomaly,
        "anomaly_score": score,
        "risk_level": risk_level,
        "alert": alert,
    }


if __name__ == "__main__":
    sample_result = {
        "anomaly": False,
        "prediction": 1,
        "anomaly_score": 0.1040125,
    }

    result = assess_risk(sample_result)

    print("Risk assessment:")
    print(result)
