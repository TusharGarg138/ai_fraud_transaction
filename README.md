# AI-Powered Fraud Detection and Prevention for UPI Transactions

A production-style student portfolio project for fraud analytics, risk scoring, explainability, and investigation case management. The system is designed for an internal fraud analyst / risk operations team, not as a generic CRUD dashboard.

## Implemented

- FastAPI backend with `POST /predict`, transaction APIs, case APIs, analytics APIs, and health check.
- Lean transaction payloads. The backend validates, enriches, prepares model features, scores risk, runs rules, analyzes behavior and device risk, persists evidence, and creates cases.
- XGBoost artifact loader that uses `model_artifacts/fraud_model.pkl` and `feature_columns.pkl` when available.
- Deterministic transparent demo model fallback when artifacts are missing, so the application remains runnable without retraining.
- SHAP service wrapper. It uses SHAP when available and falls back to human-readable factor explanations from the same feature evidence.
- SQLAlchemy persistence using PostgreSQL/Supabase via `DATABASE_URL`; local SQLite fallback for demo and tests.
- Investigation cases, statuses, analyst actions, notes, rule flags, behavior flags, device flags, and model version audit field.
- React analyst dashboard with overview cards, investigation queue, simulator, case details, evidence panels, and analytics charts from backend data.
- CSV seed/replay script that sends rows through the same prediction service instead of bypassing the pipeline.
- Pytest coverage for model loading fallback, prediction, invalid input, risk scoring, rules, case creation/action, and analytics.

## Future / Planned

- Kafka producer/consumer streaming ingestion. The core fraud service is source-independent so CSV, REST, or Kafka can call the same pipeline later.
- Enterprise authentication and role management.
- Continuous retraining and model registry integration.
- Production-grade hardware fingerprinting. Current device risk is transaction-level `device_id` simulation.

## Architecture

React Dashboard -> FastAPI -> Fraud Service -> ML Model + Rule Engine + Behavioral Analytics + Device Risk + Risk Engine + SHAP -> PostgreSQL/SQLite.

The fraud detection core does not care whether a transaction came from REST, CSV replay, or a future Kafka consumer.

## Tech Stack

Backend: Python, FastAPI, SQLAlchemy, Pydantic, XGBoost/joblib compatible artifact loading, pytest.

Frontend: React, Vite, Recharts, CSS modules through plain CSS.

Database: PostgreSQL/Supabase in deployed mode, SQLite for local demo and tests.

## ML Approach

The original ML work used the Digital Payment Fraud Detection Benchmark Dataset, a time-aware train/validation split, XGBoost, `scale_pos_weight`, early stopping, and PR-AUC as the primary metric for class-imbalanced fraud detection. Known validation metrics from the prompt: PR-AUC about 0.288 and ROC-AUC about 0.821. The app does not retrain the model.

Put the existing artifacts here:

- `backend/model_artifacts/fraud_model.pkl`
- `backend/model_artifacts/feature_columns.pkl`

If they are missing, the app uses a transparent fallback scorer for portfolio/demo operation and labels the model version as `demo_rules_model_v0`.

## Risk Scoring

Risk score is documented in `backend/app/services/risk_service.py`:

- ML probability contributes up to 70 points.
- Rule flags contribute up to 15 points.
- Behavioral anomalies contribute up to 10 points.
- Device risk contributes up to 5 points.

The total is clamped to `0..100`.

Buckets:

- `0-39`: `APPROVE`
- `40-69`: `REVIEW`
- `70-100`: `BLOCK`

## Rule Engine

Rules are explainable and include high amount, rapid transaction burst, international transfer, high-risk merchant, failed transaction spike, unusual hour, and spending deviation.

## Behavioral Analytics

The service compares amount, frequency, time, and known devices against stored customer history. If history is insufficient, it returns a clear insufficient-history flag rather than fabricating evidence.

## Device Risk

The device service checks new devices, devices used by multiple customers, and frequent device changes from transaction history.

## Investigation Case Engine

A case is automatically created for `REVIEW` or `BLOCK` predictions. Analysts can set:

- `CONFIRMED_FRAUD`
- `FALSE_POSITIVE`
- `NEEDS_MORE_INVESTIGATION`
- `UNDER_REVIEW`
- `CLOSED`

Every action is stored with timestamp and optional note.

## API Endpoints

- `GET /health`
- `POST /predict`
- `GET /transactions`
- `GET /transactions/{transaction_id}`
- `GET /cases`
- `GET /cases/{case_id}`
- `PATCH /cases/{case_id}`
- `POST /cases/{case_id}/action`
- `GET /analytics/overview`
- `GET /analytics/trends`

## Setup

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Alternatively, from the workspace root:

```bash
python run.py
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Tests:

```bash
cd backend
pytest
```

Seed data:

```bash
cd backend
python scripts/seed_database.py --csv ..\data\transactions_test.csv --limit 100
```

## Environment Variables

See `backend/.env.example`.

- `DATABASE_URL`: PostgreSQL/Supabase URL. Defaults to local SQLite.
- `CORS_ORIGINS`: comma-separated frontend origins.
- `MODEL_VERSION`: model audit label.
- `DEMO_ANALYST_ID`: default demo analyst identity.

## Limitations

This is a student portfolio implementation. It is suitable for explaining fraud operations architecture, model inference, evidence generation, and case workflows, but it is not a bank-grade production risk system.

## Python-only dashboard

The project now includes a no-build dashboard served directly by FastAPI. This avoids npm/Vite problems on systems where Node tooling is unavailable.

Run only:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Then open:

```text
http://127.0.0.1:8000/
```

The previous React/Vite source remains in `frontend/` as an optional reference, but it is no longer required to run the portfolio demo.
