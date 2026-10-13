import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("txn"))
    customer_id: Mapped[str] = mapped_column(String, index=True)
    merchant_id: Mapped[str] = mapped_column(String, index=True)
    amount: Mapped[float] = mapped_column(Float)
    channel: Mapped[str] = mapped_column(String, default="UPI")
    device_id: Mapped[str] = mapped_column(String, index=True)
    international: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="SUCCESS")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    prediction = relationship("Prediction", back_populates="transaction", uselist=False, cascade="all, delete-orphan")
    cases = relationship("InvestigationCase", back_populates="transaction")

class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("pred"))
    transaction_id: Mapped[str] = mapped_column(ForeignKey("transactions.id"), index=True)
    fraud_probability: Mapped[float] = mapped_column(Float)
    risk_score: Mapped[int] = mapped_column(Integer)
    risk_bucket: Mapped[str] = mapped_column(String)
    prediction: Mapped[str] = mapped_column(String)
    model_version: Mapped[str] = mapped_column(String)
    top_factors_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    transaction = relationship("Transaction", back_populates="prediction")

class RiskFlag(Base):
    __tablename__ = "risk_flags"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("flag"))
    transaction_id: Mapped[str] = mapped_column(ForeignKey("transactions.id"), index=True)
    category: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class InvestigationCase(Base):
    __tablename__ = "investigation_cases"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("case"))
    transaction_id: Mapped[str] = mapped_column(ForeignKey("transactions.id"), index=True)
    risk_score: Mapped[int] = mapped_column(Integer)
    decision: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="OPEN")
    reason_summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    transaction = relationship("Transaction", back_populates="cases")
    actions = relationship("CaseAction", back_populates="case", cascade="all, delete-orphan")

class CaseAction(Base):
    __tablename__ = "case_actions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("act"))
    case_id: Mapped[str] = mapped_column(ForeignKey("investigation_cases.id"), index=True)
    action: Mapped[str] = mapped_column(String)
    analyst_id: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    case = relationship("InvestigationCase", back_populates="actions")
