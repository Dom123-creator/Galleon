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

    CREATE TABLE IF NOT EXISTS organizations (
        id                    TEXT PRIMARY KEY,
        name                  TEXT NOT NULL,
        plan                  TEXT DEFAULT 'free',
        seats                 INTEGER DEFAULT 1,
        stripe_customer_id    TEXT,
        stripe_subscription_id TEXT,
        created_at            TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name          TEXT,
        org_id        TEXT REFERENCES organizations(id),
        role          TEXT DEFAULT 'member',
        google_id     TEXT,
        created_at    TEXT,
        last_login    TEXT
    );

    CREATE TABLE IF NOT EXISTS usage (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id     TEXT REFERENCES organizations(id),
        user_id    TEXT REFERENCES users(id),
        action     TEXT,
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        user_id    TEXT REFERENCES users(id),
        created_at TEXT,
        expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invites (
        id          TEXT PRIMARY KEY,
        org_id      TEXT REFERENCES organizations(id),
        email       TEXT,
        role        TEXT DEFAULT 'member',
        invited_by  TEXT,
        token       TEXT UNIQUE,
        status      TEXT DEFAULT 'pending',
        created_at  TEXT,
        expires_at  TEXT,
        accepted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS comments (
        id          TEXT PRIMARY KEY,
        review_id   TEXT,
        user_id     TEXT,
        user_name   TEXT,
        user_role   TEXT,
        body        TEXT,
        created_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_log (
        id          TEXT PRIMARY KEY,
        org_id      TEXT,
        user_id     TEXT,
        user_name   TEXT,
        action      TEXT,
        target_type TEXT,
        target_id   TEXT,
        details     TEXT,
        created_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_activity_org_date ON activity_log (org_id, created_at);
    """)
    _conn.commit()

    # ── Migrations (idempotent) ──────────────────────────────────────────────
    for col, default in [("assignee_id", "TEXT"), ("created_by", "TEXT")]:
        try:
            _conn.execute(f"ALTER TABLE deal_reviews ADD COLUMN {col} {default}")
            _conn.commit()
        except Exception:
            pass  # column already exists

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
               (id, company_name, company_id, status, assignee, notes, priority, created_at, updated_at, assignee_id, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                review["id"], review.get("company_name"), review.get("company_id"),
                review.get("status"), review.get("assignee"), review.get("notes"),
                review.get("priority"), review.get("created_at"), review.get("updated_at"),
                review.get("assignee_id"), review.get("created_by"),
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


# ── Organizations ────────────────────────────────────────────────────────────

def save_org(org: Dict) -> None:
    conn = _get_conn()
    with _lock:
        conn.execute(
            """INSERT OR REPLACE INTO organizations
               (id, name, plan, seats, stripe_customer_id, stripe_subscription_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (org["id"], org["name"], org.get("plan", "free"), org.get("seats", 1),
             org.get("stripe_customer_id"), org.get("stripe_subscription_id"),
             org.get("created_at")),
        )
        conn.commit()


def get_org(org_id: str) -> Optional[Dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM organizations WHERE id = ?", (org_id,)).fetchone()
    return dict(row) if row else None


_ORG_COLUMNS = {"name", "plan", "seats", "stripe_customer_id", "stripe_subscription_id"}


def update_org(org_id: str, updates: Dict) -> None:
    conn = _get_conn()
    safe = {k: v for k, v in updates.items() if k in _ORG_COLUMNS}
    if not safe:
        return
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [org_id]
    with _lock:
        conn.execute(f"UPDATE organizations SET {sets} WHERE id = ?", vals)
        conn.commit()


# ── Users ────────────────────────────────────────────────────────────────────

def save_user(user: Dict) -> None:
    conn = _get_conn()
    with _lock:
        conn.execute(
            """INSERT OR REPLACE INTO users
               (id, email, password_hash, name, org_id, role, google_id, created_at, last_login)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user["id"], user["email"], user.get("password_hash"), user.get("name"),
             user.get("org_id"), user.get("role", "member"), user.get("google_id"),
             user.get("created_at"), user.get("last_login")),
        )
        conn.commit()


def get_user_by_email(email: str) -> Optional[Dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[Dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_google_id(google_id: str) -> Optional[Dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM users WHERE google_id = ?", (google_id,)).fetchone()
    return dict(row) if row else None


_USER_COLUMNS = {"email", "password_hash", "name", "org_id", "role", "google_id", "last_login"}


def update_user(user_id: str, updates: Dict) -> None:
    conn = _get_conn()
    safe = {k: v for k, v in updates.items() if k in _USER_COLUMNS}
    if not safe:
        return
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [user_id]
    with _lock:
        conn.execute(f"UPDATE users SET {sets} WHERE id = ?", vals)
        conn.commit()


def get_org_seats_used(org_id: str) -> int:
    conn = _get_conn()
    row = conn.execute("SELECT COUNT(*) FROM users WHERE org_id = ?", (org_id,)).fetchone()
    return row[0] if row else 0


# ── Usage Tracking ───────────────────────────────────────────────────────────

def increment_usage(org_id: str, user_id: str, action: str) -> None:
    conn = _get_conn()
    with _lock:
        conn.execute(
            "INSERT INTO usage (org_id, user_id, action, created_at) VALUES (?, ?, ?, ?)",
            (org_id, user_id, action, datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()


def get_monthly_usage(org_id: str) -> int:
    conn = _get_conn()
    # Count usage records for current month
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat() + "Z"
    row = conn.execute(
        "SELECT COUNT(*) FROM usage WHERE org_id = ? AND created_at >= ?",
        (org_id, month_start),
    ).fetchone()
    return row[0] if row else 0


# ── Invites ─────────────────────────────────────────────────────────────────

def save_invite(invite: Dict) -> None:
    conn = _get_conn()
    with _lock:
        conn.execute(
            """INSERT OR REPLACE INTO invites
               (id, org_id, email, role, invited_by, token, status, created_at, expires_at, accepted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (invite["id"], invite["org_id"], invite["email"], invite.get("role", "member"),
             invite.get("invited_by"), invite["token"], invite.get("status", "pending"),
             invite.get("created_at"), invite.get("expires_at"), invite.get("accepted_at")),
        )
        conn.commit()


def get_invite_by_token(token: str) -> Optional[Dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM invites WHERE token = ?", (token,)).fetchone()
    return dict(row) if row else None


def list_org_invites(org_id: str) -> List[Dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM invites WHERE org_id = ? ORDER BY created_at DESC", (org_id,)
    ).fetchall()
    return [dict(r) for r in rows]


_INVITE_COLUMNS = {"email", "role", "status", "accepted_at"}


def update_invite(invite_id: str, updates: Dict) -> None:
    conn = _get_conn()
    safe = {k: v for k, v in updates.items() if k in _INVITE_COLUMNS}
    if not safe:
        return
    sets = ", ".join(f"{k} = ?" for k in safe)
    vals = list(safe.values()) + [invite_id]
    with _lock:
        conn.execute(f"UPDATE invites SET {sets} WHERE id = ?", vals)
        conn.commit()


def delete_invite(invite_id: str) -> None:
    conn = _get_conn()
    with _lock:
        conn.execute("DELETE FROM invites WHERE id = ?", (invite_id,))
        conn.commit()


def count_pending_invites(org_id: str) -> int:
    conn = _get_conn()
    row = conn.execute(
        "SELECT COUNT(*) FROM invites WHERE org_id = ? AND status = 'pending'", (org_id,)
    ).fetchone()
    return row[0] if row else 0


# ── Comments ────────────────────────────────────────────────────────────────

def save_comment(comment: Dict) -> None:
    conn = _get_conn()
    with _lock:
        conn.execute(
            """INSERT INTO comments (id, review_id, user_id, user_name, user_role, body, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (comment["id"], comment["review_id"], comment["user_id"],
             comment.get("user_name"), comment.get("user_role"),
             comment["body"], comment["created_at"]),
        )
        conn.commit()


def list_comments_for_review(review_id: str) -> List[Dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM comments WHERE review_id = ? ORDER BY created_at ASC", (review_id,)
    ).fetchall()
    return [dict(r) for r in rows]


def count_comments_by_reviews(review_ids: List[str]) -> Dict[str, int]:
    """Return {review_id: comment_count} for the given review IDs."""
    if not review_ids:
        return {}
    conn = _get_conn()
    placeholders = ",".join("?" for _ in review_ids)
    rows = conn.execute(
        f"SELECT review_id, COUNT(*) as cnt FROM comments WHERE review_id IN ({placeholders}) GROUP BY review_id",
        review_ids,
    ).fetchall()
    return {r["review_id"]: r["cnt"] for r in rows}


# ── Activity Log ────────────────────────────────────────────────────────────

def log_activity(org_id: str, user_id: str, user_name: str, action: str,
                 target_type: str = "", target_id: str = "", details: Optional[Dict] = None) -> None:
    conn = _get_conn()
    import uuid as _uuid
    with _lock:
        conn.execute(
            """INSERT INTO activity_log (id, org_id, user_id, user_name, action, target_type, target_id, details, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(_uuid.uuid4()), org_id, user_id, user_name or "", action,
             target_type, target_id, json.dumps(details) if details else None,
             datetime.utcnow().isoformat() + "Z"),
        )
        conn.commit()


def list_org_activity(org_id: str, limit: int = 50, offset: int = 0) -> List[Dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM activity_log WHERE org_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (org_id, limit, offset),
    ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("details"):
            d["details"] = json.loads(d["details"])
        results.append(d)
    return results


# ── Analytics ───────────────────────────────────────────────────────────────

def get_usage_by_user(org_id: str, month_start: str) -> List[Dict]:
    """Per-user usage counts for a month."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT u.id, u.name, u.email, u.role, COUNT(us.id) as count
           FROM users u LEFT JOIN usage us ON u.id = us.user_id AND us.created_at >= ?
           WHERE u.org_id = ?
           GROUP BY u.id ORDER BY count DESC""",
        (month_start, org_id),
    ).fetchall()
    return [dict(r) for r in rows]


def get_usage_daily_trend(org_id: str, month_start: str) -> List[Dict]:
    """Daily usage counts for a month."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT DATE(created_at) as date, COUNT(*) as count
           FROM usage WHERE org_id = ? AND created_at >= ?
           GROUP BY DATE(created_at) ORDER BY date""",
        (org_id, month_start),
    ).fetchall()
    return [dict(r) for r in rows]


def get_usage_by_action(org_id: str, month_start: str) -> Dict[str, int]:
    """Usage counts by action type for a month."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT action, COUNT(*) as count
           FROM usage WHERE org_id = ? AND created_at >= ?
           GROUP BY action ORDER BY count DESC""",
        (org_id, month_start),
    ).fetchall()
    return {r["action"]: r["count"] for r in rows}


# ── Team ────────────────────────────────────────────────────────────────────

def list_org_users(org_id: str) -> List[Dict]:
    """List all users in an organization."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM users WHERE org_id = ? ORDER BY created_at ASC", (org_id,)
    ).fetchall()
    return [dict(r) for r in rows]
