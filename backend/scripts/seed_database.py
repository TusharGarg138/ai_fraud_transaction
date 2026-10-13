import argparse
import csv
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.db.session import SessionLocal
from app.main import app  # noqa: F401 creates tables
from app.schemas.fraud import TransactionIn
from app.services.fraud_service import predict_transaction

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="../data/transactions_test.csv")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    db = SessionLocal()
    count = 0
    with open(args.csv, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            payload = TransactionIn(
                customer_id=row.get("customer_id") or row.get("customer") or f"CUST_{count % 20}",
                merchant_id=row.get("merchant_id") or row.get("merchant") or f"M{count % 8}",
                amount=float(row.get("amount") or row.get("transaction_amount") or 1000),
                channel=row.get("channel") or "UPI",
                device_id=row.get("device_id") or f"DEV_{count % 30}",
                international=str(row.get("international", "false")).lower() in {"1", "true", "yes"},
                status=row.get("status") or "SUCCESS",
            )
            predict_transaction(db, payload)
            count += 1
            if count >= args.limit:
                break
    db.close()
    print(f"Seeded {count} transactions through prediction pipeline.")

if __name__ == "__main__":
    main()
