"""
galleon/clients/ucc_client.py
─────────────────────────────
UCC (Uniform Commercial Code) filing aggregator.

No single free UCC API exists. This client aggregates from:
  1. OpenCorporates filings (if available for jurisdiction)
  2. SEC EDGAR full-text search for lien references
  3. Stub for future state-level API integration

Returns best-effort results with source attribution.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests

EDGAR_EFTS_BASE = "https://efts.sec.gov/LATEST/search-index"
EDGAR_HEADERS = {"User-Agent": "Galleon Research contact@galleon.io"}
_last_request_time = 0.0
RATE_LIMIT_DELAY = 0.25


def _rate_limit() -> None:
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < RATE_LIMIT_DELAY:
        time.sleep(RATE_LIMIT_DELAY - elapsed)
    _last_request_time = time.time()


def search_ucc_filings(
    entity_name: str,
    state: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search for UCC filings related to an entity.
    Combines EDGAR lien references + OpenCorporates filings.

    Args:
        entity_name: Company or debtor name
        state: Optional 2-letter state code
        limit: Max results per source

    Returns: list of {filing_type, debtor, secured_party, filing_date, jurisdiction, source, description}.
    """
    if not entity_name.strip():
        return []

    results: List[Dict[str, Any]] = []

    # Source 1: SEC EDGAR full-text search for UCC/lien references
    edgar_results = _search_edgar_liens(entity_name, limit=limit)
    results.extend(edgar_results)

    # Source 2: OpenCorporates filings (if available)
    oc_results = _search_opencorporates_filings(entity_name, state=state, limit=limit)
    results.extend(oc_results)

    return results[:limit]


def _search_edgar_liens(entity_name: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Search EDGAR full-text for UCC and lien references mentioning the entity."""
    _rate_limit()
    try:
        query = f'"UCC" "{entity_name.strip()}"'
        r = requests.get(
            "https://efts.sec.gov/LATEST/search-index",
            params={
                "q": query,
                "dateRange": "custom",
                "startdt": "2015-01-01",
                "enddt": "2026-12-31",
            },
            headers=EDGAR_HEADERS,
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        hits = data.get("hits", {}).get("hits", [])

        results = []
        for hit in hits[:limit]:
            src = hit.get("_source", {})
            names = src.get("display_names") or []
            entity = names[0] if names else src.get("entity_name", "")
            filing_date = src.get("file_date", "")
            form = src.get("form_type", "")
            results.append({
                "filing_type": f"SEC {form} (UCC reference)",
                "debtor": entity_name.strip(),
                "secured_party": entity,
                "filing_date": filing_date,
                "jurisdiction": "Federal (SEC)",
                "source": "EDGAR",
                "description": f"UCC/lien reference found in {form} filing by {entity}",
            })
        return results
    except Exception as exc:
        print(f"[ucc_client] EDGAR lien search failed: {exc}")
        return []


def _search_opencorporates_filings(
    entity_name: str,
    state: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Search OpenCorporates for company filings that may include UCC data."""
    _rate_limit()
    try:
        params: Dict[str, Any] = {
            "q": entity_name.strip(),
            "per_page": min(limit, 10),
        }
        if state:
            params["jurisdiction_code"] = f"us_{state.lower()}"

        r = requests.get(
            "https://api.opencorporates.com/v0.4/companies/search",
            params=params,
            headers={"Accept": "application/json"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()

        companies = data.get("results", {}).get("companies", [])
        results = []
        for item in companies:
            co = item.get("company", {})
            name = co.get("name", "")
            jurisdiction = co.get("jurisdiction_code", "")
            status = co.get("current_status", "")
            inc_date = co.get("incorporation_date", "")

            results.append({
                "filing_type": "Corporate Registration",
                "debtor": name,
                "secured_party": None,
                "filing_date": inc_date,
                "jurisdiction": jurisdiction,
                "source": "OpenCorporates",
                "description": f"{name} — status: {status}, jurisdiction: {jurisdiction}",
            })
        return results
    except Exception as exc:
        print(f"[ucc_client] OpenCorporates filing search failed: {exc}")
        return []
