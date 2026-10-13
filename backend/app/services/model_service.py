import math
from pathlib import Path
import joblib

ARTIFACT_DIR = Path(__file__).resolve().parents[2] / "model_artifacts"

class FraudModel:
    def __init__(self):
        self.model = None
        self.feature_columns = ["amount", "international", "txn_count_24h", "failed_txn_count_24h", "amount_vs_avg", "merchant_risk"]
        self.loaded_artifact = False
        self.load()

    def load(self):
        model_path = ARTIFACT_DIR / "fraud_model.pkl"
        cols_path = ARTIFACT_DIR / "feature_columns.pkl"
        if model_path.exists() and cols_path.exists():
            self.model = joblib.load(model_path)
            self.feature_columns = list(joblib.load(cols_path))
            self.loaded_artifact = True

    @property
    def model_version_suffix(self) -> str:
        return "artifact" if self.loaded_artifact else "demo_rules_model_v0"

    def prepare_features(self, txn, context: dict) -> dict:
        avg = context.get("customer_avg_amount") or max(txn.amount, 1)
        base = {
            "amount": txn.amount,
            "international": int(txn.international),
            "txn_count_24h": context.get("recent_count_5m", 0),
            "failed_txn_count_24h": context.get("failed_24h", 0),
            "amount_vs_avg": txn.amount / avg,
            "merchant_risk": context.get("merchant_suspicious_rate", 0),
        }
        return {col: base.get(col, 0) for col in self.feature_columns}

    def predict_probability(self, features: dict) -> float:
        if self.loaded_artifact and hasattr(self.model, "predict_proba"):
            row = [[features.get(c, 0) for c in self.feature_columns]]
            return float(self.model.predict_proba(row)[0][1])
        z = -4.0
        z += min(features.get("amount", 0) / 25000, 3.0)
        z += 0.8 * features.get("international", 0)
        z += 0.35 * features.get("txn_count_24h", 0)
        z += 0.55 * features.get("failed_txn_count_24h", 0)
        z += min(features.get("amount_vs_avg", 1), 10) * 0.22
        z += features.get("merchant_risk", 0) * 2.0
        return round(1 / (1 + math.exp(-z)), 4)

fraud_model = FraudModel()
