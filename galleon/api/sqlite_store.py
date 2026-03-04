"""
galleon/api/sqlite_store.py
SQLite persistence layer — survives server restarts without requiring Postgres.

Pattern: load into memory on startup, write-through on mutations.
DB path: galleon/data/galleon.db (WAL mode, thread-safe).
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

_HERE = Path(__file__).parent
_DATA_DIR = _HERE.parent / "data"
DB_PATH = _DATA_DIR / "galleon.db"

_conn: Optional[sqlite3.Connection] = None
_lock = threading.Lock()


# ── Init ─────────────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create tables if they don't exist. Call once at startup."""
    global _conn
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    _conn.execute("PRAGMA journal_mode=WAL")
    _conn.execute("PRAGMA foreign_keys=ON")
    _conn.row_factory = sqlite3.Row

    _conn.executescript("""
    CREATE TABLE IF NOT EXISTS alerts (
        id            TEXT PRIMARY KEY,
        alert_type    TEXT,
        source_bdc    TEXT,
        company_name  TEXT,
        message       TEXT,
        severity      TEXT,
        details       TEXT,
        read          INTEGER DEFAULT 0,
        created_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS deal_reviews (
        id            TEXT PRIMARY KEY,
        company_name  TEXT,
        company_id    TEXT,
        status        TEXT,
        assignee      TEXT,
        notes         TEXT,
        priority      TEXT,
        created_at    TEXT,
        updated_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT,
        seq             INTEGER,
        role            TEXT,
        content         TEXT,
        created_at      TEXT,
        PRIMARY KEY (conversation_id, seq)
    );

    CREATE TABLE IF NOT EXISTS temporal_snapshots (
        normalized_name TEXT,
        period          TEXT,
        source_bdc      TEXT,
        company_name    TEXT,
        fair_value_usd  REAL,
        cost_basis_usd  REAL,
        pricing_spread  TEXT,
        non_accrual     INTEGER DEFAULT 0,
        facility_type   TEXT,
        sector          TEXT,
        PRIMARY KEY (normalized_name, period, source_bdc)
    );

    CREATE TABLE IF NOT EXISTS bdc_index (
        company_name    TEXT,
        source_bdc      TEXT,
        sector          TEXT,
        facility_type   TEXT,
        pricing_spread  TEXT,
        maturity_date   TEXT,
        fair_value_usd  REAL,
        cost_basis_usd  REAL,
        non_accrual     INTEGER DEFAULT 0,
        filing_date     TEXT,
        extra           TEXT,
        PRIMARY KEY (company_name, source_bdc)
    );

    CREATE TABLE IF NOT EXISTS pipelines (
        id          TEXT PRIMARY KEY,
        status      TEXT,
        result      TEXT,
        company_id  TEXT,
        created_at  TEXT,
        updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS known_filings (
        cik             TEXT PRIMARY KEY,
        last_accession  TEXT,
        updated_at      TEXT
    );

    CREATE TABLE IF NOT EXISTS metadata (
        key   TEXT PRIMARY KEY,
        value TEXT
    );
    """)
    _conn.commit()
    print(f"[sqlite_store] Initialized DB at {DB_PATH}")


def _get_conn() -> sqlite3.Connection:
    if _conn is None:
        raise RuntimeError("sqlite_store.init_db() not called")
    return _conn


# ── Alerts ───────────────────────────────────────────────────────────────────

def load_alerts() -> List[Dict]:
    """Load all alerts from DB, ordered by created_at desc."""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM alerts ORDER BY created_at DESC").fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["read"] = bool(d["read"])
        d["details"] = json.loads(d["details"]) if d["details"] else {}
        results.append(d)
    return results


def save_alert(alert: Dict) -> None:
    """Insert or replace a single alert."""
    conn = _get_conn()
    with _lock:
        conn.execute(
            """INSERT OR REPLACE INTO alerts
               (id, alert_type, source_bdc, company_name, message, severity, details, read, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                alert["id"], alert.get("alert_type"), alert.get("source_bdc"),
                alert.get("company_name"), alert.get("message"), alert.get("severity"),
                json.dumps(alert.get("details", {})), int(alert.get("read", False)),
                alert.get("created_at"),
            ),
        )
        conn.commit()


def update_alert_read(alert_id: str, read: bool = True) -> None:
    """Mark a single alert as read/unread."""
    conn = _get_conn()
    with _lock:
        conn.execute("UPDATE alerts SET read = ? WHERE id = ?", (int(read), alert_id))
        conn.commit()


def mark_all_alerts_read() -> None:
    """Mark all alerts as read."""
    conn = _get_conn()
    with _lock:
        conn.execute("UPDATE alerts SET read = 1 WHERE read = 0")
        conn.commit()


# ── Deal Reviews ─────────────────────────────────────────────────────────────

def load_deal_reviews() -> Dict[str, Dict]:
    """Load all deal reviews as {id: review_dict}."""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM deal_reviews ORDER BY created_at DESC").fetchall()
    return {r["id"]: dict(r) for r in rows}


def save_deal_review(review: Dict) -> None:
    """Insert or replace a deal review."""
    conn = _get_conn()
    with _lock:
        conn.execute(
            """INSERT OR REPLACE INTO deal_reviews
               (id, company_name, company_id, status, assignee, notes, priority, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                review["id"], review.get("company_name"), review.get("company_id"),
                review.get("status"), review.get("assignee"), review.get("notes"),
                review.get("priority"), review.get("created_at"), review.get("updated_at"),
            ),
        )
        conn.commit()


# ── Conversations ────────────────────────────────────────────────────────────

def load_conversations() -> Dict[str, List[Dict]]:
    """Load all conversations as {conversation_id: [messages]}."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT conversation_id, role, content FROM conversations ORDER BY conversation_id, seq"
    ).fetchall()
    convos: Dict[str, List[Dict]] = {}
    for r in rows:
        cid = r["conversation_id"]
        convos.setdefault(cid, []).append({"role": r["role"], "content": r["content"]})
    return convos


def append_message(conversation_id: str, role: str, content: str) -> None:
    """Append a message to a conversation."""
    conn = _get_conn()
    with _lock:
        row = conn.execute(
            "SELECT COALESCE(MAX(seq), -1) FROM conversations WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()
        next_seq = row[0] + 1
        conn.execute(
            """INSERT INTO conversations (conversation_id, seq, role, content, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (conversation_id, next_seq, role, content, datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()


# ── Temporal Snapshots ───────────────────────────────────────────────────────

def load_snapshots() -> Dict[str, List[Dict]]:
    """Load all temporal snapshots as {normalized_name: [snapshots]}."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM temporal_snapshots ORDER BY normalized_name, period"
    ).fetchall()
    result: Dict[str, List[Dict]] = {}
    for r in rows:
        d = dict(r)
        norm = d.pop("normalized_name")
        d["non_accrual"] = bool(d["non_accrual"])
        result.setdefault(norm, []).append(d)
    return result


def save_snapshots_bulk(snapshots: Dict[str, List[Dict]]) -> None:
    """Bulk save all temporal snapshots (replaces existing)."""
    conn = _get_conn()
    with _lock:
        conn.execute("DELETE FROM temporal_snapshots")
        for norm, snaps in snapshots.items():
            for s in snaps:
                conn.execute(
                    """INSERT OR REPLACE INTO temporal_snapshots
                       (normalized_name, period, source_bdc, company_name,
                        fair_value_usd, cost_basis_usd, pricing_spread,
                        non_accrual, facility_type, sector)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        norm, s.get("period"), s.get("source_bdc"), s.get("company_name"),
                        s.get("fair_value_usd"), s.get("cost_basis_usd"),
                        s.get("pricing_spread"), int(s.get("non_accrual", False)),
                        s.get("facility_type"), s.get("sector"),
                    ),
                )
        conn.commit()


# ── BDC Index ────────────────────────────────────────────────────────────────

def load_bdc_index() -> List[Dict]:
    """Load flat BDC index from SQLite."""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM bdc_index").fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["non_accrual"] = bool(d["non_accrual"])
        extra = d.pop("extra", None)
        if extra:
            d.update(json.loads(extra))
        results.append(d)
    return results


def save_bdc_index(flat_index: List[Dict], last_indexed: Optional[str] = None) -> None:
    """Bulk save the BDC flat index (replaces existing)."""
    conn = _get_conn()
    _KNOWN_COLS = {
        "company_name", "source_bdc", "sector", "facility_type",
        "pricing_spread", "maturity_date", "fair_value_usd", "cost_basis_usd",
        "non_accrual", "filing_date",
    }
    with _lock:
        conn.execute("DELETE FROM bdc_index")
        for co in flat_index:
            extra_keys = {k: v for k, v in co.items() if k not in _KNOWN_COLS and k != "_placeholder"}
            conn.execute(
                """INSERT OR REPLACE INTO bdc_index
                   (company_name, source_bdc, sector, facility_type, pricing_spread,
                    maturity_date, fair_value_usd, cost_basis_usd, non_accrual,
                    filing_date, extra)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    co.get("company_name"), co.get("source_bdc"), co.get("sector"),
                    co.get("facility_type"), co.get("pricing_spread"), co.get("maturity_date"),
                    co.get("fair_value_usd"), co.get("cost_basis_usd"),
                    int(co.get("non_accrual", False)), co.get("filing_date"),
                    json.dumps(extra_keys) if extra_keys else None,
                ),
            )
        if last_indexed:
            conn.execute(
                "INSERT OR REPLACE INTO metadata (key, value) VALUES ('bdc_last_indexed', ?)",
                (last_indexed,),
            )
        conn.commit()


def load_bdc_last_indexed() -> Optional[str]:
    """Load the last_indexed timestamp from metadata."""
    conn = _get_conn()
    row = conn.execute("SELECT value FROM metadata WHERE key = 'bdc_last_indexed'").fetchone()
    return row[0] if row else None


# ── Pipelines ────────────────────────────────────────────────────────────────

def load_pipelines() -> Dict[str, Dict]:
    """Load all pipelines as {id: pipeline_dict}."""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM pipelines ORDER BY created_at DESC").fetchall()
    results = {}
    for r in rows:
        d = dict(r)
        if d.get("result"):
            d["result"] = json.loads(d["result"])
        results[d["id"]] = d
    return results


def save_pipeline(pipeline: Dict) -> None:
    """Insert or replace a pipeline record."""
    conn = _get_conn()
    result = pipeline.get("result")
    if isinstance(result, dict):
        result = json.dumps(result)
    with _lock:
        conn.execute(
            """INSERT OR REPLACE INTO pipelines
               (id, status, result, company_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                pipeline.get("pipeline_id") or pipeline.get("id"),
                pipeline.get("status"),
                result,
                pipeline.get("company_id"),
                pipeline.get("created_at") or pipeline.get("started_at"),
                pipeline.get("updated_at") or datetime.utcnow().isoformat() + "Z",
            ),
        )
        conn.commit()


# ── Known Filings ────────────────────────────────────────────────────────────

def load_known_filings() -> Dict[str, str]:
    """Load known filings as {cik: last_accession}."""
    conn = _get_conn()
    rows = conn.execute("SELECT cik, last_accession FROM known_filings").fetchall()
    return {r["cik"]: r["last_accession"] for r in rows}


def save_known_filing(cik: str, last_accession: str) -> None:
    """Insert or replace a known filing."""
    conn = _get_conn()
    with _lock:
        conn.execute(
            "INSERT OR REPLACE INTO known_filings (cik, last_accession, updated_at) VALUES (?, ?, ?)",
            (cik, last_accession, datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()
