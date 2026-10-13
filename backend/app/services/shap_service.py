LABELS = {
    "txn_count_24h": "High transaction frequency increased fraud risk.",
    "failed_txn_count_24h": "Recent failed transactions increased fraud risk.",
    "amount_vs_avg": "Transaction amount is higher than normal customer spending.",
    "amount": "Large transaction amount increased fraud risk.",
    "international": "International transaction increased fraud risk.",
    "merchant_risk": "Merchant history increased fraud risk.",
}

def explain(features: dict) -> list[dict]:
    ranked = sorted(features.items(), key=lambda kv: abs(float(kv[1] or 0)), reverse=True)[:5]
    factors = []
    for name, value in ranked:
        direction = "increases_risk" if float(value or 0) > 0 else "decreases_risk"
        impact = "high" if abs(float(value or 0)) >= 3 else "medium" if abs(float(value or 0)) >= 1 else "low"
        factors.append({
            "feature": name,
            "impact": impact,
            "direction": direction,
            "value": f"{value:.2f}" if isinstance(value, float) else str(value),
            "explanation": LABELS.get(name, f"{name} influenced model risk."),
        })
    return factors
