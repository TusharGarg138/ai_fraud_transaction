from datetime import datetime

HIGH_RISK_MERCHANTS = {"M_HIGH_RISK", "MERCH_RISKY", "M999"}

def run_rules(txn, context: dict) -> list[dict]:
    flags = []
    hour = (txn.timestamp or datetime.utcnow()).hour
    avg = context.get("customer_avg_amount")
    recent_count = context.get("recent_count_5m", 0)
    failed_24h = context.get("failed_24h", 0)
    merchant_rate = context.get("merchant_suspicious_rate", 0)

    if txn.amount >= 50000:
        flags.append({"name": "HIGH_AMOUNT", "severity": "HIGH", "reason": f"Amount {txn.amount:.2f} exceeds the high-value threshold."})
    if avg and txn.amount >= avg * 5:
        flags.append({"name": "SPENDING_DEVIATION", "severity": "HIGH", "reason": f"Amount is {txn.amount / avg:.1f}x higher than customer's average."})
    if recent_count >= 4:
        flags.append({"name": "RAPID_TXN_BURST", "severity": "HIGH", "reason": f"{recent_count} transactions were observed in the last 5 minutes."})
    if txn.international:
        flags.append({"name": "INTERNATIONAL_TRANSFER", "severity": "MEDIUM", "reason": "International transaction increases payment risk."})
    if txn.merchant_id in HIGH_RISK_MERCHANTS or merchant_rate >= 0.25:
        flags.append({"name": "HIGH_RISK_MERCHANT", "severity": "HIGH", "reason": "Merchant has elevated suspicious transaction history."})
    if failed_24h >= 3:
        flags.append({"name": "FAILED_TXN_SPIKE", "severity": "MEDIUM", "reason": f"{failed_24h} failed transactions for this customer in 24 hours."})
    if hour < 5:
        flags.append({"name": "UNUSUAL_HOUR", "severity": "LOW", "reason": "Transaction occurred during a historically risky late-night window."})
    return flags
