import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.models import CaseAction, InvestigationCase, Prediction, RiskFlag, Transaction
from app.db.session import get_db
from app.schemas.fraud import CaseActionIn, CasePatch, PredictionOut, TransactionIn
from app.services.case_service import CASE_STATUSES, record_action
from app.services.fraud_service import predict_transaction

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok"}

@router.post("/predict", response_model=PredictionOut)
def predict(payload: TransactionIn, db: Session = Depends(get_db)):
    return predict_transaction(db, payload)

@router.get("/transactions")
def transactions(db: Session = Depends(get_db), limit: int = 100):
    rows = db.query(Transaction).order_by(Transaction.timestamp.desc()).limit(min(limit, 500)).all()
    return [serialize_transaction(t) for t in rows]

@router.get("/transactions/{transaction_id}")
def transaction_detail(transaction_id: str, db: Session = Depends(get_db)):
    txn = db.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    flags = db.query(RiskFlag).filter(RiskFlag.transaction_id == transaction_id).all()
    return {**serialize_transaction(txn), "flags": [serialize_flag(f) for f in flags]}

@router.get("/cases")
def cases(db: Session = Depends(get_db), limit: int = 100):
    rows = db.query(InvestigationCase).order_by(InvestigationCase.created_at.desc()).limit(min(limit, 500)).all()
    return [serialize_case(c, compact=True) for c in rows]

@router.get("/cases/{case_id}")
def case_detail(case_id: str, db: Session = Depends(get_db)):
    case = db.get(InvestigationCase, case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    txn = case.transaction
    flags = db.query(RiskFlag).filter(RiskFlag.transaction_id == txn.id).all()
    customer_history = db.query(Transaction).filter(Transaction.customer_id == txn.customer_id).order_by(Transaction.timestamp.desc()).limit(10).all()
    device_history = db.query(Transaction).filter(Transaction.device_id == txn.device_id).order_by(Transaction.timestamp.desc()).limit(10).all()
    merchant_history = db.query(Transaction).filter(Transaction.merchant_id == txn.merchant_id).order_by(Transaction.timestamp.desc()).limit(10).all()
    return {
        **serialize_case(case),
        "transaction": serialize_transaction(txn),
        "flags": [serialize_flag(f) for f in flags],
        "customer_history": [serialize_transaction(t) for t in customer_history],
        "device_history": [serialize_transaction(t) for t in device_history],
        "merchant_history": [serialize_transaction(t) for t in merchant_history],
        "actions": [serialize_action(a) for a in case.actions],
    }

@router.patch("/cases/{case_id}")
def patch_case(case_id: str, payload: CasePatch, db: Session = Depends(get_db)):
    case = db.get(InvestigationCase, case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    if payload.status not in CASE_STATUSES:
        raise HTTPException(400, "Invalid case status")
    record_action(db, case, payload.status, payload.note)
    db.commit()
    return serialize_case(case)

@router.post("/cases/{case_id}/action")
def case_action(case_id: str, payload: CaseActionIn, db: Session = Depends(get_db)):
    case = db.get(InvestigationCase, case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    action = record_action(db, case, payload.action, payload.note, payload.analyst_id)
    db.commit()
    return serialize_action(action)

@router.get("/analytics/overview")
def overview(db: Session = Depends(get_db)):
    total = db.query(Transaction).count()
    fraud_detected = db.query(Prediction).filter(Prediction.risk_bucket == "BLOCK").count()
    open_cases = db.query(InvestigationCase).filter(InvestigationCase.status.in_(["OPEN", "UNDER_REVIEW", "NEEDS_MORE_INVESTIGATION"])).count()
    confirmed = db.query(InvestigationCase).filter(InvestigationCase.status == "CONFIRMED_FRAUD").count()
    false_pos = db.query(InvestigationCase).filter(InvestigationCase.status == "FALSE_POSITIVE").count()
    review = db.query(Prediction).filter(Prediction.risk_bucket == "REVIEW").count()
    return {
        "total_transactions": total,
        "fraud_detected": fraud_detected,
        "open_cases": open_cases,
        "confirmed_fraud": confirmed,
        "false_positives": false_pos,
        "fraud_rate": fraud_detected / total if total else 0,
        "review_rate": review / total if total else 0,
        "block_rate": fraud_detected / total if total else 0,
    }

@router.get("/analytics/trends")
def trends(db: Session = Depends(get_db)):
    buckets = db.query(Prediction.risk_bucket, func.count(Prediction.id)).group_by(Prediction.risk_bucket).all()
    outcomes = db.query(InvestigationCase.status, func.count(InvestigationCase.id)).group_by(InvestigationCase.status).all()
    by_day = db.query(func.date(Transaction.timestamp), func.count(Transaction.id)).group_by(func.date(Transaction.timestamp)).all()
    return {
        "risk_distribution": [{"name": b or "UNKNOWN", "value": c} for b, c in buckets],
        "case_outcomes": [{"name": s or "UNKNOWN", "value": c} for s, c in outcomes],
        "transactions_over_time": [{"date": str(d), "transactions": c} for d, c in by_day],
    }

def serialize_transaction(t: Transaction):
    p = t.prediction
    return {
        "id": t.id, "customer_id": t.customer_id, "merchant_id": t.merchant_id, "amount": t.amount,
        "channel": t.channel, "device_id": t.device_id, "international": t.international,
        "timestamp": t.timestamp.isoformat(), "status": t.status,
        "prediction": p.prediction if p else None, "fraud_probability": p.fraud_probability if p else None,
        "risk_score": p.risk_score if p else None, "risk_bucket": p.risk_bucket if p else None,
    }

def serialize_case(c: InvestigationCase, compact=False):
    data = {
        "id": c.id, "transaction_id": c.transaction_id, "risk_score": c.risk_score, "decision": c.decision,
        "status": c.status, "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat(),
        "reason_summary": json.loads(c.reason_summary or "[]"),
    }
    if c.transaction:
        data.update({"customer_id": c.transaction.customer_id, "amount": c.transaction.amount, "merchant_id": c.transaction.merchant_id})
    return data

def serialize_flag(f: RiskFlag):
    return {"category": f.category, "name": f.name, "severity": f.severity, "reason": f.reason}

def serialize_action(a: CaseAction):
    return {"id": a.id, "case_id": a.case_id, "action": a.action, "analyst_id": a.analyst_id, "note": a.note, "created_at": a.created_at.isoformat()}
