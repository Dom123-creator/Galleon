"""
galleon/clients/opencorporates_client.py
────────────────────────────────────────
OpenCorporates API client for company registry data.

API base: https://api.opencorporates.com/v0.4/
Free tier: 500 req/month, no API key. Rate limit: 1 req/sec.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests

API_BASE = "https://api.opencorporates.com/v0.4"
HEADERS = {"Accept": "application/json"}
_last_request_time = 0.0
RATE_LIMIT_DELAY = 1.1  # 1 req/sec for free tier


def _rate_limit() -> None:
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < RATE_LIMIT_DELAY:
        time.sleep(RATE_LIMIT_DELAY - elapsed)
    _last_request_time = time.time()


def _safe_get(url: str, params: Optional[Dict] = None, timeout: int = 15) -> Optional[Dict]:
    _rate_limit()
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"[opencorporates_client] Request failed: {exc}")
        return None


def search_companies(
    query: str,
    jurisdiction: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search OpenCorporates for companies by name.

    Args:
        query: Company name search
        jurisdiction: Optional jurisdiction code (e.g., "us_de", "gb")
        limit: Max results (API max per page = 30)

    Returns: list of {name, company_number, jurisdiction, status, incorporation_date, registered_address, opencorporates_url}.
    """
    if not query.strip():
        return []

    params: Dict[str, Any] = {
        "q": query.strip(),
        "per_page": min(limit, 30),
    }
    if jurisdiction:
        params["jurisdiction_code"] = jurisdiction

    data = _safe_get(f"{API_BASE}/companies/search", params=params)
    if not data:
        return []

    companies = data.get("results", {}).get("companies", [])
    results = []
    for item in companies:
        co = item.get("company", {})
        addr = co.get("registered_address", {}) or {}
        results.append({
            "name": co.get("name", ""),
            "company_number": co.get("company_number", ""),
            "jurisdiction": co.get("jurisdiction_code", ""),
            "status": co.get("current_status", ""),
            "incorporation_date": co.get("incorporation_date", ""),
            "registered_address": _format_address(addr),
            "opencorporates_url": co.get("opencorporates_url", ""),
            "source": "OpenCorporates",
        })
    return results


def get_officers(
    company_number: str,
    jurisdiction: str,
) -> List[Dict[str, Any]]:
    """
    Get officers/directors of a company.

    Args:
        company_number: The company registration number
        jurisdiction: Jurisdiction code (e.g., "us_de")

    Returns: list of {name, position, start_date, end_date}.
    """
    if not company_number or not jurisdiction:
        return []

    data = _safe_get(
        f"{API_BASE}/companies/{jurisdiction}/{company_number}"
    )
    if not data:
        return []

    company = data.get("results", {}).get("company", {})
    officers_list = company.get("officers", [])

    results = []
    for item in officers_list:
        off = item.get("officer", {})
        results.append({
            "name": off.get("name", ""),
            "position": off.get("position", ""),
            "start_date": off.get("start_date", ""),
            "end_date": off.get("end_date"),
            "source": "OpenCorporates",
        })
    return results


def search_officers(name: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search for corporate officers by name.

    Returns: list of {name, company_name, position, jurisdiction}.
    """
    if not name.strip():
        return []

    data = _safe_get(
        f"{API_BASE}/officers/search",
        params={"q": name.strip(), "per_page": min(limit, 30)},
    )
    if not data:
        return []

    officers = data.get("results", {}).get("officers", [])
    results = []
    for item in officers:
        off = item.get("officer", {})
        co = off.get("company", {}) or {}
        results.append({
            "name": off.get("name", ""),
            "company_name": co.get("name", ""),
            "position": off.get("position", ""),
            "jurisdiction": co.get("jurisdiction_code", ""),
            "opencorporates_url": off.get("opencorporates_url", ""),
            "source": "OpenCorporates",
        })
    return results


def _format_address(addr: Dict) -> str:
    """Format an OpenCorporates address dict into a single string."""
    parts = [
        addr.get("street_address", ""),
        addr.get("locality", ""),
        addr.get("region", ""),
        addr.get("postal_code", ""),
        addr.get("country", ""),
    ]
    return ", ".join(p for p in parts if p)
