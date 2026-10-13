import json
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.models import Prediction, Transaction
from app.schemas.fraud import TransactionIn
from app.services import behavioral_service, device_service, rule_engine, shap_service
from app.services.case_service import add_flags, create_case_if_needed
from app.services.model_service import fraud_model
from app.services.risk_service import bucket_for, calculate_risk_score

def predict_transaction(db: Session, payload: TransactionIn) -> dict:
    now = payload.timestamp or datetime.utcnow()
    txn = Transaction(
        customer_id=payload.customer_id,
        merchant_id=payload.merchant_id,
        amount=payload.amount,
        channel=payload.channel.upper(),
        device_id=payload.device_id,
        international=payload.international,
        status=payload.status.upper(),
        timestamp=now,
    )
    context = behavioral_service.customer_context(db, txn.customer_id, txn.merchant_id, now)
    rule_flags = rule_engine.run_rules(txn, context)
    behavior_flags = behavioral_service.analyze_behavior(txn, context)
    device_flags = device_service.analyze_device(db, txn, context["known_devices"])
    features = fraud_model.prepare_features(txn, context)
    probability = fraud_model.predict_probability(features)
    risk_score = calculate_risk_score(probability, rule_flags, behavior_flags, device_flags)
    bucket = bucket_for(risk_score)
    prediction_label = "Fraudulent" if bucket == "BLOCK" else "Suspicious" if bucket == "REVIEW" else "Legitimate"
    factors = shap_service.explain(features)

    db.add(txn)
    db.flush()
    pred = Prediction(
        transaction_id=txn.id,
        fraud_probability=probability,
        risk_score=risk_score,
        risk_bucket=bucket,
        prediction=prediction_label,
        model_version=settings.model_version if fraud_model.loaded_artifact else fraud_model.model_version_suffix,
        top_factors_json=json.dumps(factors),
    )
    db.add(pred)
    add_flags(db, txn.id, "RULE", rule_flags)
    add_flags(db, txn.id, "BEHAVIOR", behavior_flags)
    add_flags(db, txn.id, "DEVICE", device_flags)
    case = create_case_if_needed(db, txn, risk_score, bucket, factors, rule_flags + behavior_flags + device_flags)
    db.commit()
    return {
        "transaction_id": txn.id,
        "prediction": prediction_label,
        "fraud_probability": probability,
        "risk_score": risk_score,
        "risk_bucket": bucket,
        "model_version": pred.model_version,
        "top_factors": factors,
        "rule_flags": rule_flags,
        "behavior_flags": behavior_flags,
        "device_flags": device_flags,
        "case_id": case.id if case else None,
    }
