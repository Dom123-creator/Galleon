"""
galleon/clients/fdic_client.py
──────────────────────────────
FDIC BankFind Suite API client.

API base: https://banks.data.fdic.gov/api/
No API key required. Rate limit: be courteous (~5 req/sec).

Functions:
  - search_institutions(query) → list of matching banks
  - get_financials(cert_number) → quarterly financial data
  - get_failures(query) → failed bank search
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests

API_BASE = "https://banks.data.fdic.gov/api"
HEADERS = {"Accept": "application/json"}
_last_request_time = 0.0
RATE_LIMIT_DELAY = 0.25  # 4 req/sec max


def _rate_limit() -> None:
    """Ensure minimum delay between requests."""
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < RATE_LIMIT_DELAY:
        time.sleep(RATE_LIMIT_DELAY - elapsed)
    _last_request_time = time.time()


def _safe_get(url: str, params: Optional[Dict] = None, timeout: int = 15) -> Optional[Dict]:
    """GET with rate limiting and silent error handling."""
    _rate_limit()
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"[fdic_client] Request failed: {exc}")
        return None


# ── Public API ────────────────────────────────────────────────────────────────

def search_institutions(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search FDIC institutions by name.
    Returns: list of {name, cert, city, state, total_assets, roa, equity_capital, active}.
    """
    if not query.strip():
        return []

    data = _safe_get(
        f"{API_BASE}/institutions",
        params={
            "search": query.strip(),
            "fields": "REPNM,CERT,CITY,STALP,ASSET,ROA,EQ,ACTIVE",
            "limit": limit,
            "sort_by": "ASSET",
            "sort_order": "DESC",
        },
    )
    if not data:
        return []

    results = []
    for row in data.get("data", []):
        d = row.get("data", {})
        results.append({
            "name": d.get("REPNM", ""),
            "cert": str(d.get("CERT", "")),
            "city": d.get("CITY", ""),
            "state": d.get("STALP", ""),
            "total_assets": d.get("ASSET"),
            "roa": d.get("ROA"),
            "equity_capital": d.get("EQ"),
            "active": d.get("ACTIVE", 0) == 1,
            "source": "FDIC",
        })
    return results


def get_financials(cert_number: str, limit: int = 4) -> List[Dict[str, Any]]:
    """
    Get quarterly financials for a bank by FDIC certificate number.
    Returns: list of {report_date, total_assets, net_income, roa, tier1_ratio, equity_capital}.
    """
    if not cert_number.strip():
        return []

    data = _safe_get(
        f"{API_BASE}/financials",
        params={
            "filters": f"CERT:{cert_number.strip()}",
            "fields": "REPDTE,ASSET,NETINC,ROA,RBCT1J,EQ",
            "sort_by": "REPDTE",
            "sort_order": "DESC",
            "limit": limit,
        },
    )
    if not data:
        return []

    results = []
    for row in data.get("data", []):
        d = row.get("data", {})
        results.append({
            "report_date": d.get("REPDTE", ""),
            "total_assets": d.get("ASSET"),
            "net_income": d.get("NETINC"),
            "roa": d.get("ROA"),
            "tier1_capital_ratio": d.get("RBCT1J"),
            "equity_capital": d.get("EQ"),
            "cert": cert_number,
            "source": "FDIC",
        })
    return results


def get_failures(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search FDIC failed bank list.
    Returns: list of {name, cert, city, state, closing_date, acquiring_institution}.
    """
    if not query.strip():
        return []

    data = _safe_get(
        f"{API_BASE}/failures",
        params={
            "search": query.strip(),
            "fields": "NAME,CERT,CITYST,FAILDATE,PSTALP,SAVESSION",
            "limit": limit,
            "sort_by": "FAILDATE",
            "sort_order": "DESC",
        },
    )
    if not data:
        return []

    results = []
    for row in data.get("data", []):
        d = row.get("data", {})
        results.append({
            "name": d.get("NAME", ""),
            "cert": str(d.get("CERT", "")),
            "city_state": d.get("CITYST", ""),
            "state": d.get("PSTALP", ""),
            "closing_date": d.get("FAILDATE", ""),
            "acquiring_institution": d.get("SAVESSION", ""),
            "source": "FDIC",
        })
    return results
