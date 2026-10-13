from sqlalchemy.orm import Session
from app.db.models import Transaction

def analyze_device(db: Session, txn, known_devices: set[str]) -> list[dict]:
    flags = []
    device_history = db.query(Transaction).filter(Transaction.device_id == txn.device_id).limit(100).all()
    customers = {t.customer_id for t in device_history}
    if txn.device_id not in known_devices:
        flags.append({"name": "NEW_DEVICE", "severity": "HIGH", "reason": "Device has not previously been used by this customer."})
    if len(customers - {txn.customer_id}) >= 2:
        flags.append({"name": "DEVICE_LINKED_TO_MULTIPLE_CUSTOMERS", "severity": "HIGH", "reason": f"Device is associated with {len(customers)} customers."})
    customer_devices = known_devices | {txn.device_id}
    if len(customer_devices) >= 5:
        flags.append({"name": "FREQUENT_DEVICE_CHANGES", "severity": "MEDIUM", "reason": "Customer has used many devices, which increases account-takeover risk."})
    return flags
