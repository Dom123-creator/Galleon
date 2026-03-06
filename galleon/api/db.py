"""
galleon/api/db.py
psycopg2 connection pool + CRUD helpers for the Galleon FastAPI server.

All functions return None / empty results gracefully when DATABASE_URL is not
set or the DB is unreachable — no endpoint should hard-crash due to a missing
DB connection.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime

logger = logging.getLogger("galleon.db")
from typing import Any, Dict, List, Optional

# psycopg2 is optional at import time so the server starts without a DB
try:
    import psycopg2
    import psycopg2.pool
    import psycopg2.extras
    _PSYCOPG2_AVAILABLE = True
except ImportError:
    _PSYCOPG2_AVAILABLE = False


# ── Pool singleton ────────────────────────────────────────────────────────────

_pool: Optional[Any] = None
_pool_lock = threading.Lock()


def get_pool():
    """Return (or lazily create) the connection pool. Returns None if no DB."""
    global _pool
    if _pool is not None:
        return _pool
    if not _PSYCOPG2_AVAILABLE:
        return None
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    with _pool_lock:
        if _pool is None:
            try:
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=1, maxconn=10, dsn=db_url
                )
            except Exception as exc:
                logger.error("Pool creation failed: ", exc)
                return None
    return _pool


def get_conn():
    """Get a connection from the pool. Returns None if unavailable."""
    pool = get_pool()
    if pool is None:
        return None
    try:
        return pool.getconn()
    except Exception as exc:
        logger.error("getconn failed: ", exc)
        return None


def put_conn(conn):
    """Return a connection to the pool."""
    if conn is None:
        return
    pool = get_pool()
    if pool:
        try:
            pool.putconn(conn)
        except Exception:
            pass


def is_connected() -> bool:
    """Quick liveness check."""
    conn = get_conn()
    if conn is None:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        return False
    finally:
        put_conn(conn)


# ── CRUD helpers ──────────────────────────────────────────────────────────────

def upsert_company(
    name: str,
    sector: Optional[str] = None,
    jurisdiction: Optional[str] = None,
    entity_type: Optional[str] = None,
) -> Optional[str]:
    """
    Insert or return existing company UUID.
    Uses pg_trgm-based normalized name match to avoid duplicates.
    Returns the company UUID as a string, or None on failure.
    """
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Check for near-duplicate by normalized name
            cur.execute(
                """
                SELECT id FROM companies
                WHERE normalized_name = lower(regexp_replace(
                    %s,
                    '\\s*(LLC|LP|LLP|Inc\\.|Inc|Corp\\.|Corp|Holdings|Group|'
                    'Partners|Services|Solutions|Technologies|Capital|Company|Co\\.)\\s*$',
                    '', 'gi'
                ))
                LIMIT 1
                """,
                (name,),
            )
            row = cur.fetchone()
            if row:
                return str(row["id"])

            # Insert new company
            cur.execute(
                """
                INSERT INTO companies (canonical_name, sector, jurisdiction, entity_type)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (name, sector, jurisdiction, entity_type),
            )
            row = cur.fetchone()
            conn.commit()
            return str(row["id"]) if row else None
    except Exception as exc:
        conn.rollback()
        logger.error("upsert_company failed: ", exc)
        return None
    finally:
        put_conn(conn)


def insert_document(
    company_id: Optional[str],
    filename: str,
    source_type: str,
    path: str,
    page_count: int = 0,
) -> Optional[str]:
    """Insert a document record, return its UUID."""
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO documents
                    (company_id, file_name, source_type, storage_path, page_count, status)
                VALUES (%s, %s, %s::source_type, %s, %s, 'queued')
                RETURNING id
                """,
                (company_id, filename, source_type, path, page_count),
            )
            row = cur.fetchone()
            conn.commit()
            return str(row["id"]) if row else None
    except Exception as exc:
        conn.rollback()
        logger.error("insert_document failed: ", exc)
        return None
    finally:
        put_conn(conn)


def insert_pipeline(company_id: Optional[str]) -> Optional[str]:
    """Insert a new pipeline record (status=running), return its UUID."""
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO pipelines (company_id, status, started_at)
                VALUES (%s, 'running', NOW())
                RETURNING id
                """,
                (company_id,),
            )
            row = cur.fetchone()
            conn.commit()
            return str(row["id"]) if row else None
    except Exception as exc:
        conn.rollback()
        logger.error("insert_pipeline failed: ", exc)
        return None
    finally:
        put_conn(conn)


def finish_pipeline(pipeline_id: str, stats: Dict[str, Any], success: bool = True) -> None:
    """Update pipeline status and duration on completion."""
    conn = get_conn()
    if conn is None:
        return
    try:
        status = "complete" if success else "failed"
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipelines
                SET status = %s::pipeline_status,
                    completed_at = NOW(),
                    fields_extracted = %s,
                    conflicts_detected = %s,
                    avg_confidence = %s,
                    completeness_pct = %s
                WHERE id = %s
                """,
                (
                    status,
                    stats.get("fields_extracted"),
                    stats.get("conflicts"),
                    stats.get("avg_confidence"),
                    stats.get("completeness_pct"),
                    pipeline_id,
                ),
            )
            conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("finish_pipeline failed: ", exc)
    finally:
        put_conn(conn)


def insert_field_values(
    pipeline_id: Optional[str],
    company_id: Optional[str],
    document_id: Optional[str],
    all_candidates: List[Dict[str, Any]],
) -> int:
    """
    Bulk-insert FieldValueCandidate dicts from pdf_extractor output.
    Returns number of rows inserted.
    """
    conn = get_conn()
    if conn is None:
        return 0
    inserted = 0
    try:
        with conn.cursor() as cur:
            for c in all_candidates:
                if c.get("status") == "rejected":
                    continue
                # Map source_type — fall back to 'court_filing' if not a valid enum value
                source_type = c.get("source_type", "court_filing") or "court_filing"
                extraction_method = c.get("extraction_method", "regex_ner") or "regex_ner"
                field_category = c.get("field_category", "identity") or "identity"

                try:
                    cur.execute(
                        """
                        INSERT INTO field_values (
                            company_id, pipeline_id, document_id,
                            field_name, field_category,
                            raw_value, normalized_value, numeric_value,
                            currency, unit,
                            source_type, source_document, source_page,
                            source_location, source_snippet,
                            extraction_method, confidence_score,
                            rule_id, status, period_end
                        ) VALUES (
                            %s, %s, %s,
                            %s, %s::field_category,
                            %s, %s, %s,
                            %s, %s,
                            %s::source_type, %s, %s,
                            %s, %s,
                            %s::extraction_method, %s,
                            %s, %s::value_status, %s
                        )
                        """,
                        (
                            company_id, pipeline_id, document_id,
                            c.get("field_name"), field_category,
                            c.get("raw_value"), c.get("normalized_value"),
                            c.get("numeric_value"),
                            c.get("currency"), c.get("unit"),
                            source_type,
                            c.get("source_document"), c.get("source_page"),
                            c.get("source_section"), c.get("source_snippet"),
                            extraction_method,
                            c.get("confidence_score", 0.0),
                            c.get("rule_id"),
                            c.get("status", "extracted"),
                            c.get("period_end"),
                        ),
                    )
                    inserted += 1
                except Exception as row_exc:
                    # Skip bad rows, keep going
                    logger.error("insert_field_values row skip: ", row_exc)
                    conn.rollback()
                    # Re-open cursor after rollback
                    cur = conn.cursor()
            conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("insert_field_values failed: ", exc)
    finally:
        put_conn(conn)
    return inserted


def insert_conflicts(
    pipeline_id: Optional[str],
    company_id: Optional[str],
    resolutions: List[Dict[str, Any]],
) -> None:
    """Insert conflict records from pdf_extractor resolutions list."""
    conn = get_conn()
    if conn is None:
        return
    try:
        with conn.cursor() as cur:
            for r in resolutions:
                field_name = r.get("field_name", "unknown")
                field_category = r.get("winner", {}).get("field_category", "identity") or "identity"
                winner = r.get("winner", {})
                losers = r.get("losers", [])
                # Compute a simple delta
                winner_norm = winner.get("normalized_value", "")
                loser_norm = losers[0].get("normalized_value", "") if losers else ""
                delta = f"{winner_norm} vs {loser_norm}" if loser_norm else None

                try:
                    cur.execute(
                        """
                        INSERT INTO field_conflicts
                            (company_id, pipeline_id, field_name, field_category,
                             candidate_ids, value_delta, status)
                        VALUES (%s, %s, %s, %s::field_category, %s, %s, 'open')
                        """,
                        (
                            company_id, pipeline_id, field_name,
                            field_category,
                            [],  # We don't have UUIDs for candidates yet
                            delta,
                        ),
                    )
                except Exception as row_exc:
                    logger.error("insert_conflicts row skip: ", row_exc)
                    conn.rollback()
                    cur = conn.cursor()
            conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("insert_conflicts failed: ", exc)
    finally:
        put_conn(conn)


def upsert_ground_truth(records: List[Dict[str, Any]]) -> int:
    """
    Insert ARCC ground-truth records from edgar_bdc output.
    Returns number of rows upserted.
    """
    conn = get_conn()
    if conn is None:
        return 0
    upserted = 0
    try:
        with conn.cursor() as cur:
            for rec in records:
                try:
                    cur.execute(
                        """
                        INSERT INTO ground_truth_records (
                            galleon_id, source_bdc, edgar_cik, filing_date,
                            company_name, sector,
                            ground_truth_fields, galleon_target_fields,
                            validation_metadata
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (galleon_id) DO UPDATE SET
                            filing_date = EXCLUDED.filing_date,
                            ground_truth_fields = EXCLUDED.ground_truth_fields,
                            validation_metadata = EXCLUDED.validation_metadata,
                            updated_at = NOW()
                        """,
                        (
                            rec.get("galleon_id"),
                            rec.get("source_bdc"),
                            rec.get("edgar_cik"),
                            rec.get("filing_date"),
                            rec.get("company", {}).get("name"),
                            rec.get("company", {}).get("sector"),
                            json.dumps(rec.get("ground_truth", {})),
                            json.dumps(rec.get("galleon_targets", {})),
                            json.dumps(rec.get("validation", {})),
                        ),
                    )
                    upserted += 1
                except Exception as row_exc:
                    logger.error("upsert_ground_truth row skip: ", row_exc)
                    conn.rollback()
                    cur = conn.cursor()
            conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("upsert_ground_truth failed: ", exc)
    finally:
        put_conn(conn)
    return upserted


def rebuild_credit_profile(company_id: str, pipeline_id: str) -> None:
    """Call the DB function rebuild_credit_profile if it exists."""
    conn = get_conn()
    if conn is None:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT rebuild_credit_profile(%s, %s)",
                (company_id, pipeline_id),
            )
            conn.commit()
    except Exception as exc:
        conn.rollback()
        # Function may not exist yet — log and continue
        logger.error("rebuild_credit_profile skipped: ", exc)
    finally:
        put_conn(conn)


# ── Read helpers ──────────────────────────────────────────────────────────────

def list_companies() -> List[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    c.id, c.canonical_name, c.sector,
                    p.completeness_pct,
                    COALESCE(fc.cnt, 0) AS conflicts,
                    p.completed_at AS last_run
                FROM companies c
                LEFT JOIN LATERAL (
                    SELECT completeness_pct, completed_at
                    FROM pipelines
                    WHERE company_id = c.id
                    ORDER BY completed_at DESC NULLS LAST
                    LIMIT 1
                ) p ON TRUE
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS cnt
                    FROM field_conflicts fc2
                    WHERE fc2.company_id = c.id AND fc2.status = 'open'
                ) fc ON TRUE
                WHERE c.is_active = TRUE
                ORDER BY c.created_at DESC
                """
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("list_companies failed: ", exc)
        return []
    finally:
        put_conn(conn)


def get_company(company_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM companies WHERE id = %s", (company_id,)
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        logger.error("get_company failed: ", exc)
        return None
    finally:
        put_conn(conn)


def get_company_fields(
    company_id: str, category: Optional[str] = None
) -> List[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if category:
                cur.execute(
                    """
                    SELECT * FROM field_values
                    WHERE company_id = %s AND is_current = TRUE
                      AND field_category = %s::field_category
                    ORDER BY field_name
                    """,
                    (company_id, category),
                )
            else:
                cur.execute(
                    """
                    SELECT * FROM field_values
                    WHERE company_id = %s AND is_current = TRUE
                    ORDER BY field_category, field_name
                    """,
                    (company_id,),
                )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("get_company_fields failed: ", exc)
        return []
    finally:
        put_conn(conn)


def list_documents() -> List[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    d.id, d.file_name, c.canonical_name AS company,
                    d.status, d.fields_extracted, d.created_at
                FROM documents d
                LEFT JOIN companies c ON c.id = d.company_id
                ORDER BY d.created_at DESC
                """
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("list_documents failed: ", exc)
        return []
    finally:
        put_conn(conn)


def get_document(document_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT d.*, c.canonical_name AS company_name
                FROM documents d
                LEFT JOIN companies c ON c.id = d.company_id
                WHERE d.id = %s
                """,
                (document_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        logger.error("get_document failed: ", exc)
        return None
    finally:
        put_conn(conn)


def get_pipeline(pipeline_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM pipelines WHERE id = %s", (pipeline_id,)
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        logger.error("get_pipeline failed: ", exc)
        return None
    finally:
        put_conn(conn)


def get_pipeline_steps(pipeline_id: str) -> List[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT * FROM pipeline_steps
                WHERE pipeline_id = %s
                ORDER BY step_number
                """,
                (pipeline_id,),
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("get_pipeline_steps failed: ", exc)
        return []
    finally:
        put_conn(conn)


def list_conflicts() -> List[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    fc.id, c.canonical_name AS company,
                    fc.field_name AS field,
                    fc.value_delta AS delta,
                    fc.detected_at,
                    fc.status
                FROM field_conflicts fc
                LEFT JOIN companies c ON c.id = fc.company_id
                ORDER BY fc.detected_at DESC
                """
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("list_conflicts failed: ", exc)
        return []
    finally:
        put_conn(conn)


def resolve_conflict(
    conflict_id: str,
    winner_value_id: str,
    method: str,
    notes: Optional[str] = None,
) -> bool:
    conn = get_conn()
    if conn is None:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO field_resolutions
                    (conflict_id, winner_value_id, method, review_notes)
                VALUES (%s, %s, %s::resolution_method, %s)
                """,
                (conflict_id, winner_value_id, method, notes),
            )
            cur.execute(
                "UPDATE field_conflicts SET status = 'resolved', resolved_at = NOW() WHERE id = %s",
                (conflict_id,),
            )
            conn.commit()
            return True
    except Exception as exc:
        conn.rollback()
        logger.error("resolve_conflict failed: ", exc)
        return False
    finally:
        put_conn(conn)


def list_rules() -> List[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    r.rule_id, r.name, r.field_name, r.rule_type,
                    r.rule_logic, r.base_confidence,
                    ROUND(
                        100.0 * SUM(CASE WHEN re.passed THEN 1 ELSE 0 END)
                        / NULLIF(COUNT(re.id), 0), 1
                    ) AS pass_rate
                FROM rules r
                LEFT JOIN rule_executions re ON re.rule_id = r.rule_id
                WHERE r.is_active = TRUE
                GROUP BY r.rule_id, r.name, r.field_name, r.rule_type,
                         r.rule_logic, r.base_confidence
                ORDER BY r.rule_id
                """
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("list_rules failed: ", exc)
        return []
    finally:
        put_conn(conn)


def list_ground_truth() -> List[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    galleon_id, source_bdc, edgar_cik, filing_date,
                    company_name, sector,
                    ground_truth_fields, galleon_target_fields,
                    validation_metadata
                FROM ground_truth_records
                ORDER BY galleon_id
                """
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("list_ground_truth failed: ", exc)
        return []
    finally:
        put_conn(conn)


def get_ground_truth(gt_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT gtr.*,
                    gtc.accuracy_score, gtc.completeness_score, gtc.field_comparisons
                FROM ground_truth_records gtr
                LEFT JOIN LATERAL (
                    SELECT accuracy_score, completeness_score, field_comparisons
                    FROM ground_truth_comparisons
                    WHERE gt_record_id = gtr.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) gtc ON TRUE
                WHERE gtr.galleon_id = %s
                """,
                (gt_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        logger.error("get_ground_truth failed: ", exc)
        return None
    finally:
        put_conn(conn)


def get_field_candidates(company_id: str, field_name: str) -> List[Dict[str, Any]]:
    """Return all field value candidates for a given company + field (including non-current)."""
    conn = get_conn()
    if conn is None:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT * FROM field_values
                WHERE company_id = %s AND field_name = %s
                ORDER BY confidence_score DESC
                """,
                (company_id, field_name),
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.error("get_field_candidates failed: ", exc)
        return []
    finally:
        put_conn(conn)


def get_conflict_detail(conflict_id: str) -> Optional[Dict[str, Any]]:
    """Return a single conflict with candidate field values."""
    conn = get_conn()
    if conn is None:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT fc.*, c.canonical_name AS company
                FROM field_conflicts fc
                LEFT JOIN companies c ON c.id = fc.company_id
                WHERE fc.id = %s
                """,
                (conflict_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            result = dict(row)
            # Get candidate values for the conflicted field
            cur.execute(
                """
                SELECT fv.normalized_value, fv.source_type, fv.confidence_score
                FROM field_values fv
                WHERE fv.company_id = %s AND fv.field_name = %s
                ORDER BY fv.confidence_score DESC
                """,
                (row["company_id"], row["field_name"]),
            )
            result["candidates"] = [dict(r) for r in cur.fetchall()]
            return result
    except Exception as exc:
        logger.error("get_conflict_detail failed: ", exc)
        return None
    finally:
        put_conn(conn)


def update_document_status(document_id: str, status: str, fields_extracted: int = 0) -> None:
    conn = get_conn()
    if conn is None:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE documents
                SET status = %s::document_status, fields_extracted = %s
                WHERE id = %s
                """,
                (status, fields_extracted, document_id),
            )
            conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("update_document_status failed: ", exc)
    finally:
        put_conn(conn)
