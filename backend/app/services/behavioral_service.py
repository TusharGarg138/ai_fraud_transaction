from datetime import timedelta
from sqlalchemy.orm import Session
from app.db.models import Transaction

def customer_context(db: Session, customer_id: str, merchant_id: str, now) -> dict:
    history = db.query(Transaction).filter(Transaction.customer_id == customer_id).order_by(Transaction.timestamp.desc()).limit(100).all()
    merchant_txns = db.query(Transaction).filter(Transaction.merchant_id == merchant_id).limit(100).all()
    recent_5m = [t for t in history if now - t.timestamp <= timedelta(minutes=5)]
    failed_24h = [t for t in history if now - t.timestamp <= timedelta(hours=24) and t.status.upper() == "FAILED"]
    avg = sum(t.amount for t in history) / len(history) if history else None
    devices = {t.device_id for t in history}
    merchant_suspicious_rate = 0
    if merchant_txns:
        merchant_suspicious_rate = sum(1 for t in merchant_txns if t.prediction and t.prediction.risk_bucket != "APPROVE") / len(merchant_txns)
    return {
        "history_count": len(history),
        "customer_avg_amount": avg,
        "recent_count_5m": len(recent_5m),
        "failed_24h": len(failed_24h),
        "known_devices": devices,
        "merchant_suspicious_rate": merchant_suspicious_rate,
        "recent_transactions": history[:10],
    }

def analyze_behavior(txn, context: dict) -> list[dict]:
    if context["history_count"] < 3:
        return [{"name": "INSUFFICIENT_HISTORY", "severity": "LOW", "reason": "Insufficient historical data for a confident behavior baseline."}]
    flags = []
    avg = context["customer_avg_amount"]
    if avg and txn.amount > avg * 3:
        flags.append({"name": "AMOUNT_ABOVE_BASELINE", "severity": "HIGH", "reason": f"Amount is {txn.amount / avg:.1f}x higher than customer's average."})
    if context["recent_count_5m"] >= 3:
        flags.append({"name": "FREQUENCY_ANOMALY", "severity": "HIGH", "reason": f"{context['recent_count_5m']} recent transactions indicate unusual frequency."})
    if txn.device_id not in context["known_devices"]:
        flags.append({"name": "UNKNOWN_CUSTOMER_DEVICE", "severity": "MEDIUM", "reason": "Device has not previously been observed for this customer."})
    return flags
