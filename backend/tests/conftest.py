import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)
