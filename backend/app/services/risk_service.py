def bucket_for(score: int) -> str:
    if score >= 70:
        return "BLOCK"
    if score >= 40:
        return "REVIEW"
    return "APPROVE"

def severity_points(severity: str) -> int:
    return {"LOW": 2, "MEDIUM": 5, "HIGH": 8, "CRITICAL": 12}.get(severity.upper(), 3)

def calculate_risk_score(probability: float, rule_flags: list, behavior_flags: list, device_flags: list) -> int:
    # Transparent formula:
    # ML probability contributes 0-70 points.
    # Explainable rule violations contribute up to 15 points.
    # Behavioral anomalies contribute up to 10 points.
    # Device risk contributes up to 5 points.
    # Final score is clamped to 0-100.
    ml = probability * 70
    rules = min(15, sum(severity_points(f["severity"]) for f in rule_flags))
    behavior = min(10, sum(severity_points(f["severity"]) for f in behavior_flags))
    device = min(5, sum(severity_points(f["severity"]) for f in device_flags))
    return max(0, min(100, round(ml + rules + behavior + device)))
