import json
from datetime import datetime
from sqlalchemy.orm import Session
from app.db.models import InvestigationCase, CaseAction, RiskFlag, Transaction
from app.core.config import settings

CASE_STATUSES = {"OPEN", "UNDER_REVIEW", "CONFIRMED_FRAUD", "FALSE_POSITIVE", "NEEDS_MORE_INVESTIGATION", "CLOSED"}

def create_case_if_needed(db: Session, txn: Transaction, risk_score: int, bucket: str, factors, flags) -> InvestigationCase | None:
    if bucket == "APPROVE":
        return None
    reasons = [f.get("reason") or f.get("explanation") or f.get("name", "") for f in flags]
    reasons += [f.get("explanation", f.get("feature", "")) for f in factors[:3]]
    case = InvestigationCase(transaction_id=txn.id, risk_score=risk_score, decision=bucket, reason_summary=json.dumps(reasons[:8]))
    db.add(case)
    db.flush()
    return case

def add_flags(db: Session, txn_id: str, category: str, flags: list[dict]):
    for flag in flags:
        db.add(RiskFlag(transaction_id=txn_id, category=category, name=flag["name"], severity=flag["severity"], reason=flag["reason"]))

def record_action(db: Session, case: InvestigationCase, action: str, note: str = "", analyst_id: str | None = None):
    status = action if action in CASE_STATUSES else {
        "CONFIRM_FRAUD": "CONFIRMED_FRAUD",
        "FALSE_POSITIVE": "FALSE_POSITIVE",
        "NEEDS_MORE_INVESTIGATION": "NEEDS_MORE_INVESTIGATION",
    }.get(action, "UNDER_REVIEW")
    case.status = status
    case.updated_at = datetime.utcnow()
    item = CaseAction(case_id=case.id, action=status, note=note, analyst_id=analyst_id or settings.demo_analyst_id)
    db.add(item)
    db.flush()
    return item
