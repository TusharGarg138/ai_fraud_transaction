from datetime import datetime
from pydantic import BaseModel, Field

class TransactionIn(BaseModel):
    customer_id: str = Field(min_length=2, max_length=80)
    merchant_id: str = Field(min_length=2, max_length=80)
    amount: float = Field(gt=0, le=10_000_000)
    channel: str = "UPI"
    device_id: str = Field(min_length=2, max_length=80)
    international: bool = False
    timestamp: datetime | None = None
    status: str = "SUCCESS"

class Factor(BaseModel):
    feature: str
    impact: str
    direction: str
    value: str
    explanation: str | None = None

class Flag(BaseModel):
    name: str
    severity: str
    reason: str
    triggered: bool = True

class PredictionOut(BaseModel):
    transaction_id: str
    prediction: str
    fraud_probability: float
    risk_score: int
    risk_bucket: str
    model_version: str
    top_factors: list[Factor]
    rule_flags: list[Flag]
    behavior_flags: list[Flag]
    device_flags: list[Flag]
    case_id: str | None = None

class CaseActionIn(BaseModel):
    action: str
    note: str = ""
    analyst_id: str | None = None

class CasePatch(BaseModel):
    status: str
    note: str = ""
