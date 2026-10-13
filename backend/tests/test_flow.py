from app.services.risk_service import bucket_for, calculate_risk_score
from app.services.rule_engine import run_rules

def test_health(client):
    assert client.get("/health").json()["status"] == "ok"

def test_predict_creates_response(client):
    payload = {"customer_id": "C001", "merchant_id": "M_HIGH_RISK", "amount": 75000, "channel": "UPI", "device_id": "D001", "international": True}
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["transaction_id"]
    assert 0 <= body["risk_score"] <= 100
    assert body["risk_bucket"] in {"APPROVE", "REVIEW", "BLOCK"}
    assert body["top_factors"]

def test_invalid_amount(client):
    res = client.post("/predict", json={"customer_id": "C", "merchant_id": "M", "amount": -1, "device_id": "D"})
    assert res.status_code == 422

def test_risk_bucket_formula():
    assert bucket_for(20) == "APPROVE"
    assert bucket_for(50) == "REVIEW"
    assert bucket_for(80) == "BLOCK"
    score = calculate_risk_score(0.5, [{"severity": "HIGH"}], [], [])
    assert score >= 40

def test_case_action(client):
    body = client.post("/predict", json={"customer_id": "C999", "merchant_id": "M999", "amount": 120000, "device_id": "D999", "international": True}).json()
    assert body["case_id"]
    res = client.post(f"/cases/{body['case_id']}/action", json={"action": "CONFIRMED_FRAUD", "note": "Clear evidence"})
    assert res.status_code == 200
    assert res.json()["action"] == "CONFIRMED_FRAUD"

def test_analytics(client):
    res = client.get("/analytics/overview")
    assert res.status_code == 200
    assert "total_transactions" in res.json()
