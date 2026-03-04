"""
galleon/clients/sba_client.py
─────────────────────────────
SBA loan data client via USASpending.gov API.

SBA programs are identified by CFDA prefixes 59.xxx.
API base: https://api.usaspending.gov/api/v2/
No API key required.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests

API_BASE = "https://api.usaspending.gov/api/v2"
HEADERS = {"Content-Type": "application/json"}
_last_request_time = 0.0
RATE_LIMIT_DELAY = 0.25

# SBA CFDA program prefixes
SBA_CFDA_PREFIXES = ["59."]


def _rate_limit() -> None:
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < RATE_LIMIT_DELAY:
        time.sleep(RATE_LIMIT_DELAY - elapsed)
    _last_request_time = time.time()


def _safe_post(url: str, payload: Dict, timeout: int = 20) -> Optional[Dict]:
    """POST with rate limiting and silent error handling."""
    _rate_limit()
    try:
        r = requests.post(url, json=payload, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"[sba_client] Request failed: {exc}")
        return None


def search_sba_loans(recipient_name: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search SBA loan awards by recipient name.
    Uses USASpending spending_by_award endpoint filtered to CFDA 59.xxx (SBA programs).
    Returns: list of {recipient, award_amount, award_date, description, cfda_program, award_id}.
    """
    if not recipient_name.strip():
        return []

    payload = {
        "filters": {
            "keywords": [recipient_name.strip()],
            "award_type_codes": ["07", "08", "09", "10", "11"],  # loans
        },
        "fields": [
            "Award ID",
            "Recipient Name",
            "Award Amount",
            "Start Date",
            "Description",
            "CFDA Number",
            "Awarding Agency",
        ],
        "page": 1,
        "limit": limit,
        "sort": "Award Amount",
        "order": "desc",
    }

    data = _safe_post(f"{API_BASE}/search/spending_by_award/", payload)
    if not data:
        return []

    results = []
    for row in data.get("results", []):
        cfda = row.get("CFDA Number") or ""
        # Include all results but flag SBA-specific ones
        is_sba = any(cfda.startswith(p) for p in SBA_CFDA_PREFIXES)
        results.append({
            "recipient": row.get("Recipient Name", ""),
            "award_amount": row.get("Award Amount"),
            "award_date": row.get("Start Date", ""),
            "description": row.get("Description", ""),
            "cfda_program": cfda,
            "award_id": row.get("Award ID", ""),
            "awarding_agency": row.get("Awarding Agency", ""),
            "is_sba_program": is_sba,
            "source": "USASpending-SBA",
        })
    return results
