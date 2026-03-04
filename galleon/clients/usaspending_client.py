"""
galleon/clients/usaspending_client.py
─────────────────────────────────────
USASpending.gov API client for federal awards search.

API base: https://api.usaspending.gov/api/v2/
No API key required. Covers contracts, grants, loans, direct payments.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests

API_BASE = "https://api.usaspending.gov/api/v2"
HEADERS = {"Content-Type": "application/json"}
_last_request_time = 0.0
RATE_LIMIT_DELAY = 0.25


def _rate_limit() -> None:
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < RATE_LIMIT_DELAY:
        time.sleep(RATE_LIMIT_DELAY - elapsed)
    _last_request_time = time.time()


def _safe_post(url: str, payload: Dict, timeout: int = 20) -> Optional[Dict]:
    _rate_limit()
    try:
        r = requests.post(url, json=payload, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"[usaspending_client] Request failed: {exc}")
        return None


def _safe_get(url: str, params: Optional[Dict] = None, timeout: int = 15) -> Optional[Dict]:
    _rate_limit()
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"[usaspending_client] GET failed: {exc}")
        return None


# Award type code mapping
AWARD_TYPE_MAP = {
    "contracts": ["A", "B", "C", "D"],
    "grants": ["02", "03", "04", "05"],
    "loans": ["07", "08", "09", "10", "11"],
    "direct_payments": ["06"],
}


def search_awards(
    query: str,
    award_type: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search federal awards by keyword.

    Args:
        query: Keyword search (company name, topic, etc.)
        award_type: Optional filter — "contracts", "grants", "loans", "direct_payments"
        limit: Max results to return

    Returns: list of {award_id, recipient, award_amount, awarding_agency, description, start_date, award_type}.
    """
    if not query.strip():
        return []

    filters: Dict[str, Any] = {"keywords": [query.strip()]}
    if award_type and award_type in AWARD_TYPE_MAP:
        filters["award_type_codes"] = AWARD_TYPE_MAP[award_type]

    payload = {
        "filters": filters,
        "fields": [
            "Award ID",
            "Recipient Name",
            "Award Amount",
            "Start Date",
            "Description",
            "Awarding Agency",
            "Award Type",
            "CFDA Number",
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
        results.append({
            "award_id": row.get("Award ID", ""),
            "recipient": row.get("Recipient Name", ""),
            "award_amount": row.get("Award Amount"),
            "awarding_agency": row.get("Awarding Agency", ""),
            "description": row.get("Description", ""),
            "start_date": row.get("Start Date", ""),
            "award_type": row.get("Award Type", ""),
            "cfda_number": row.get("CFDA Number", ""),
            "source": "USASpending",
        })
    return results


def get_recipient_profile(name: str) -> Optional[Dict[str, Any]]:
    """
    Search for a recipient profile by name.
    Returns: {name, duns, total_amount, award_count} or None.
    """
    if not name.strip():
        return None

    data = _safe_get(
        f"{API_BASE}/recipient/",
        params={"keyword": name.strip(), "limit": 1},
    )
    if not data:
        return None

    results = data.get("results", [])
    if not results:
        return None

    r = results[0]
    return {
        "name": r.get("name", ""),
        "duns": r.get("duns"),
        "uei": r.get("uei"),
        "total_amount": r.get("amount"),
        "award_count": r.get("count"),
        "source": "USASpending",
    }
