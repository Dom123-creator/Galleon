"""Shared test fixtures for Galleon tests."""

import os
import sys
import tempfile
from pathlib import Path

import pytest

# Ensure galleon/ is on the path
_GALLEON_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_GALLEON_ROOT))


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    """Provide a fresh SQLite DB in a temp directory."""
    db_path = tmp_path / "test.db"
    monkeypatch.setattr("api.sqlite_store.DB_PATH", db_path)
    monkeypatch.setattr("api.sqlite_store._DATA_DIR", tmp_path)
    monkeypatch.setattr("api.sqlite_store._conn", None)

    from api.sqlite_store import init_db
    init_db()
    yield db_path

    # Cleanup: close connection
    from api import sqlite_store
    if sqlite_store._conn:
        sqlite_store._conn.close()
        sqlite_store._conn = None


@pytest.fixture()
def client(tmp_db):
    """FastAPI TestClient with a fresh SQLite DB."""
    from fastapi.testclient import TestClient
    from api.main import app
    return TestClient(app)
