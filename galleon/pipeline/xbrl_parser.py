"""
galleon/pipeline/xbrl_parser.py
───────────────────────────────
XBRL Schedule of Investments Parser for BDC EDGAR Filings.

Discovers the latest 10-K for a BDC, fetches the primary filing document,
locates the Schedule of Investments section, and parses company-level
investment rows using inline XBRL tags (ix:nonFraction) and table structure.

The primary filing HTML contains inline XBRL with tags like:
  - InvestmentInterestRate (coupon %)
  - InvestmentBasisSpreadVariableRate (spread %)
  - InvestmentOwnedBalancePrincipalAmount (principal, scale=6 = millions)
  - InvestmentOwnedAtCost (amortized cost)
  - InvestmentOwnedAtFairValue (fair value)

Usage:
    from galleon.pipeline.xbrl_parser import parse_schedule_for_bdc
    companies = parse_schedule_for_bdc("0001287750", "ARCC")
"""

from __future__ import annotations

import re
import time
from typing import Dict, List, Optional, Tuple

import requests

# ── Config ────────────────────────────────────────────────────────────────────

EDGAR_BASE = "https://data.sec.gov"
EDGAR_ARCHIVE = "https://www.sec.gov"  # Archive paths use www.sec.gov with no-padding CIK
HEADERS = {"User-Agent": "Galleon Research contact@galleon.io"}
REQUEST_TIMEOUT = 120  # Large filings can take a while
RATE_LIMIT_SLEEP = 0.11  # SEC 10 req/sec limit


def _cik_for_path(cik: str) -> str:
    """Strip leading zeros from CIK for EDGAR archive URL paths."""
    return cik.lstrip("0") or "0"


# ── EDGAR Discovery ──────────────────────────────────────────────────────────

def find_filings(cik: str, form_types: Optional[List[str]] = None, max_filings: int = 8) -> List[Dict]:
    """
    Fetch /submissions/CIK{cik}.json, return up to max_filings matching form_types.
    Each entry: {accession_number, accession_fmt, filing_date, primary_document, form}.
    """
    if form_types is None:
        form_types = ["10-K", "10-K/A"]
    try:
        time.sleep(RATE_LIMIT_SLEEP)
        url = f"{EDGAR_BASE}/submissions/CIK{cik}.json"
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        data = r.json()

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        primary_docs = recent.get("primaryDocument", [])

        results = []
        for form, date, acc, doc in zip(forms, dates, accessions, primary_docs):
            if form in form_types:
                results.append({
                    "accession_number": acc.replace("-", ""),
                    "accession_fmt": acc,
                    "filing_date": date,
                    "primary_document": doc,
                    "form": form,
                })
                if len(results) >= max_filings:
                    break
        return results
    except Exception as exc:
        print(f"[xbrl_parser] find_filings({cik}) failed: {exc}")
        return []


def find_latest_10k(cik: str) -> Optional[Dict]:
    """
    Fetch /submissions/CIK{cik}.json, find most recent 10-K filing.
    Returns {accession_number, accession_fmt, filing_date, primary_document} or None.
    Thin wrapper around find_filings() for backward compatibility.
    """
    results = find_filings(cik, form_types=["10-K", "10-K/A"], max_filings=1)
    return results[0] if results else None


def _fetch_filing_html(cik: str, accession: str, document: str) -> Optional[str]:
    """Fetch a filing document from EDGAR archives."""
    try:
        time.sleep(RATE_LIMIT_SLEEP)
        url = f"{EDGAR_ARCHIVE}/Archives/edgar/data/{_cik_for_path(cik)}/{accession}/{document}"
        r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.text
    except Exception as exc:
        print(f"[xbrl_parser] Failed to fetch {document}: {exc}")
        return None


# ── Schedule Section Finder ──────────────────────────────────────────────────

def _find_schedule_section(html: str) -> Optional[str]:
    """
    Locate the Schedule of Investments section in a full 10-K filing.
    Returns the HTML substring covering the entire schedule.

    BDC filings have the schedule spanning many pages, each with a
    "SCHEDULE OF INVESTMENTS" header. We find the first occurrence and
    extend to "NOTES TO FINANCIAL STATEMENTS" which follows the schedule.
    """
    # Find the start of the schedule
    patterns = [
        r"SCHEDULE\s+OF\s+INVESTMENTS",
        r"CONSOLIDATED\s+SCHEDULE\s+OF\s+INVESTMENTS",
        r"Schedule\s+of\s+Investments",
    ]
    start_idx = None
    for pattern in patterns:
        m = re.search(pattern, html)
        if m:
            start_idx = m.start()
            break

    if start_idx is None:
        return None

    # Find the last occurrence of "SCHEDULE OF INVESTMENTS" to know the extent
    last_schedule = start_idx
    for m in re.finditer(r"SCHEDULE\s+OF\s+INVESTMENTS", html):
        last_schedule = m.start()

    # End at NOTES TO FINANCIAL STATEMENTS (comes after schedule)
    # or use last_schedule + generous buffer
    end_markers = [
        r"NOTES\s+TO\s+(?:CONSOLIDATED\s+)?FINANCIAL\s+STATEMENTS",
        r"STATEMENTS?\s+OF\s+(?:CONSOLIDATED\s+)?OPERATIONS",
        r"STATEMENTS?\s+OF\s+(?:CONSOLIDATED\s+)?ASSETS\s+AND\s+LIABILITIES",
    ]

    end_idx = last_schedule + 200_000  # buffer after last schedule header
    for marker in end_markers:
        m = re.search(marker, html[last_schedule:])
        if m:
            candidate = last_schedule + m.start()
            if candidate > last_schedule:
                end_idx = candidate
                break

    return html[start_idx:end_idx]


# ── Row Extraction from Filing HTML ──────────────────────────────────────────

# Regex patterns for inline XBRL tags
_IX_PATTERN = re.compile(
    r'<ix:nonFraction[^>]*name="([^"]*)"[^>]*scale="([^"]*)"[^>]*>([^<]+)</ix:nonFraction>'
    r'|'
    r'<ix:nonFraction[^>]*scale="([^"]*)"[^>]*name="([^"]*)"[^>]*>([^<]+)</ix:nonFraction>'
)

# Pattern to find table rows
_TR_PATTERN = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL)

# Pattern to find span text content
_SPAN_TEXT = re.compile(r'<span[^>]*>([^<]*(?:<[^/][^>]*>[^<]*</[^>]*>)*[^<]*)</span>')


def _extract_row_texts(tr_html: str) -> List[str]:
    """Extract meaningful text content from a <tr> element."""
    # Get all td elements
    tds = re.findall(r'<td[^>]*>(.*?)</td>', tr_html, re.DOTALL)
    texts = []
    for td in tds:
        # Extract text from spans and ix tags
        td_clean = re.sub(r'<ix:nonFraction[^>]*>([^<]+)</ix:nonFraction>', r'\1', td)
        td_clean = re.sub(r'<[^>]+>', ' ', td_clean)
        td_clean = td_clean.replace('&#160;', ' ').replace('&amp;', '&').replace('&nbsp;', ' ')
        td_clean = re.sub(r'\s+', ' ', td_clean).strip()
        if td_clean and td_clean != '$':
            texts.append(td_clean)
    return texts


def _extract_ix_values(tr_html: str) -> Dict[str, float]:
    """Extract inline XBRL (ix:nonFraction) values from a table row."""
    values = {}
    for m in re.finditer(
        r'<ix:nonFraction[^>]*?name="([^"]*)"[^>]*?scale="([^"]*)"[^>]*?>([^<]+)</ix:nonFraction>',
        tr_html,
    ):
        name = m.group(1)
        scale = int(m.group(2))
        raw_val = m.group(3).strip().replace(",", "")
        try:
            val = float(raw_val) * (10 ** scale)
        except ValueError:
            continue

        # Map XBRL concept names to our fields
        short_name = name.split(":")[-1] if ":" in name else name
        values[short_name] = val

    # Also handle rate values (scale=-2 means percentage stored as decimal)
    for m in re.finditer(
        r'<ix:nonFraction[^>]*?name="([^"]*)"[^>]*?scale="(-?\d+)"[^>]*?>([^<]+)</ix:nonFraction>',
        tr_html,
    ):
        name = m.group(1)
        scale = int(m.group(2))
        raw_val = m.group(3).strip().replace(",", "")
        short_name = name.split(":")[-1] if ":" in name else name
        if short_name not in values:
            try:
                values[short_name] = float(raw_val) * (10 ** scale)
            except ValueError:
                pass

    return values


def _is_company_name(text: str) -> bool:
    """Heuristic: check if text looks like a company name vs. a label/header."""
    if not text or len(text) < 4:
        return False

    lower = text.lower().strip()

    # Skip known non-company labels
    skip_exact = {
        "software and services", "financial services", "health care equipment and services",
        "commercial and professional services", "insurance", "energy", "transportation",
        "capital goods", "consumer services", "consumer durables and apparel",
        "food and staples retailing", "food, beverage and tobacco",
        "household and personal products", "materials", "media and entertainment",
        "pharmaceuticals, biotechnology and life sciences", "real estate",
        "retailing", "semiconductors and semiconductor equipment",
        "technology hardware and equipment", "telecommunication services",
        "utilities", "automobiles and components", "banks", "diversified financials",
    }
    if lower in skip_exact:
        return False

    # Skip subtotals
    if lower.startswith("total ") or lower.startswith("subtotal"):
        return False
    if "total investments" in lower or "net assets" in lower:
        return False

    # Company names typically contain entity suffixes or specific patterns
    field_labels = {
        "amortized cost", "fair value", "% of net assets", "principal",
        "coupon", "spread", "maturity date", "acquisition date",
        "shares/units", "company", "business description", "investment",
        "reference", "first lien", "second lien", "senior secured",
        "coupon, pik", "% of net assets",
    }
    if lower in field_labels:
        return False

    # Facility type strings and investment instrument types are NOT company names
    facility_keywords = [
        "first lien", "second lien", "senior secured", "subordinated",
        "unitranche", "mezzanine", "revolving", "term loan", "delayed draw",
        "membership unit", "membership interest", "partnership interest",
        "preferred stock", "common stock", "preferred membership",
        "warrant", "equity interest", "class a", "class b",
        "limited partnership", "convertible", "unsecured",
        "pik", "dividends", "interest paid", "taxes", "collections of",
        "supplemental", "cash and cash equivalents", "per share",
        "net change", "net realized", "net unrealized", "provision for",
    ]
    if any(lower.startswith(kw) or lower == kw for kw in facility_keywords):
        return False

    # Should have at least one uppercase letter (company names do)
    if not any(c.isupper() for c in text):
        return False

    # Very short strings are unlikely to be company names
    if len(text.strip()) < 5:
        return False

    return True


def _clean_company_name(raw: str) -> str:
    """Remove footnote references like (13), (4)(6), etc. from company names."""
    # Remove trailing footnote refs: " (13)" or " (4)(6)(9)"
    cleaned = re.sub(r'\s*(?:\(\d+\))+\s*$', '', raw).strip()
    return cleaned


def _is_subtotal_or_header(name: str) -> bool:
    """Filter out subtotal rows and section headers."""
    if not name:
        return True
    lower = name.lower().strip()
    return (
        lower.startswith("total ")
        or lower.startswith("subtotal")
        or "total investments" in lower
        or "net assets" in lower
        or "weighted average" in lower
        or lower == "total"
    )


def _parse_spread_pct(val: float) -> Optional[str]:
    """Convert spread percentage (e.g., 0.0475 or 4.75) to SOFR+475 format."""
    if val <= 0:
        return None
    # If value is already in percentage terms (e.g., 4.75)
    if val > 0.25:
        bps = int(round(val * 100))
    else:
        # Value in decimal (e.g., 0.0475)
        bps = int(round(val * 10000))
    if 100 <= bps <= 2000:
        return f"SOFR+{bps}"
    return None


# ── Main Filing Parser ───────────────────────────────────────────────────────

def parse_filing_html(html: str, bdc_name: str, filing_date: str) -> List[Dict]:
    """
    Parse a full 10-K filing HTML to extract Schedule of Investments companies.
    Uses table row structure and inline XBRL tags for financial data.
    """
    # Find schedule section to limit search scope
    schedule = _find_schedule_section(html)
    if not schedule:
        print(f"[xbrl_parser] Could not find Schedule of Investments in {bdc_name} filing")
        return []

    print(f"[xbrl_parser] {bdc_name}: Schedule section = {len(schedule):,} chars")

    # Strategy: process each <tr> row, identify company name rows,
    # then collect subsequent facility rows with XBRL data
    companies = []
    current_company = None
    current_sector = None
    current_facilities: List[Dict] = []

    for tr_match in _TR_PATTERN.finditer(schedule):
        tr_html = tr_match.group(1)
        texts = _extract_row_texts(tr_html)
        ix_values = _extract_ix_values(tr_html)

        if not texts and not ix_values:
            continue

        # Check for sector header rows (single text, matches known sectors)
        if len(texts) == 1 and not ix_values:
            text = texts[0].strip()
            # Sector headers are typically single-word or short phrases
            if len(text) < 60 and not _is_company_name(text):
                if text[0].isupper() and not any(c.isdigit() for c in text):
                    current_sector = text
                    continue

        # Check if this row has a company name
        first_text = texts[0] if texts else ""
        clean_name = _clean_company_name(first_text)

        if clean_name and _is_company_name(clean_name) and not _is_subtotal_or_header(clean_name):
            # Save previous company if we had one
            if current_company and current_facilities:
                companies.append(_build_company_record(
                    current_company, current_sector, current_facilities,
                    bdc_name, filing_date
                ))

            current_company = clean_name
            current_facilities = []

            # This row might also contain facility data
            facility_type = None
            for t in texts[1:]:
                if any(kw in t.lower() for kw in [
                    "first lien", "second lien", "senior secured", "unitranche",
                    "subordinated", "mezzanine", "equity", "warrant", "preferred",
                    "revolv", "term loan", "delayed draw", "membership",
                    "partnership interest",
                ]):
                    facility_type = t
                    break

            if ix_values or facility_type:
                current_facilities.append({
                    "facility_type": facility_type,
                    "ix_values": ix_values,
                    "texts": texts,
                })

        elif current_company:
            # This might be a facility row for the current company
            facility_type = None
            for t in texts:
                if any(kw in t.lower() for kw in [
                    "first lien", "second lien", "senior secured", "unitranche",
                    "subordinated", "mezzanine", "equity", "warrant", "preferred",
                    "revolv", "term loan", "delayed draw", "membership",
                    "partnership interest",
                ]):
                    facility_type = t
                    break

            if ix_values or facility_type:
                current_facilities.append({
                    "facility_type": facility_type,
                    "ix_values": ix_values,
                    "texts": texts,
                })

    # Don't forget the last company
    if current_company and current_facilities:
        companies.append(_build_company_record(
            current_company, current_sector, current_facilities,
            bdc_name, filing_date
        ))

    # Deduplicate
    if companies:
        companies = _deduplicate_to_companies(companies)

    print(f"[xbrl_parser] Parsed {len(companies)} companies from {bdc_name} filing")
    return companies


def _build_company_record(
    company_name: str,
    sector: Optional[str],
    facilities: List[Dict],
    bdc_name: str,
    filing_date: str,
) -> Dict:
    """Build a company record from collected facility rows."""
    # Aggregate XBRL values across facilities
    total_fv = 0.0
    total_cost = 0.0
    best_spread = None
    best_facility_type = None
    maturity = None
    non_accrual = False

    for fac in facilities:
        ix = fac.get("ix_values", {})

        # Fair value
        fv = ix.get("InvestmentOwnedAtFairValue", 0)
        total_fv += fv

        # Cost
        cost = ix.get("InvestmentOwnedAtCost", 0)
        total_cost += cost

        # Spread (take from the facility with highest fair value)
        spread_val = ix.get("InvestmentBasisSpreadVariableRate")
        if spread_val and (best_spread is None or fv > 0):
            best_spread = _parse_spread_pct(spread_val)

        # Facility type
        ft = fac.get("facility_type")
        if ft and (best_facility_type is None or fv > 0):
            best_facility_type = ft

        # Maturity - extract from texts
        for t in fac.get("texts", []):
            m = re.search(r"(\d{2}/\d{4})", t)
            if m and not maturity:
                parts = m.group(1).split("/")
                maturity = f"{parts[1]}-{parts[0]}-01"

    return {
        "company_name": company_name,
        "sector": sector,
        "facility_type": best_facility_type or "Senior Secured",
        "pricing_spread": best_spread,
        "maturity_date": maturity,
        "fair_value_usd": total_fv if total_fv else None,
        "cost_basis_usd": total_cost if total_cost else None,
        "non_accrual": non_accrual,
        "source_bdc": bdc_name,
        "filing_date": filing_date,
        "_placeholder": False,
    }


def _deduplicate_to_companies(rows: List[Dict]) -> List[Dict]:
    """
    Group rows by company name, pick representative row with highest fair_value_usd,
    sum fair values across facilities for each company.
    """
    by_company: Dict[str, List[Dict]] = {}
    for row in rows:
        name = row.get("company_name", "").strip()
        if not name:
            continue
        key = name.lower()
        by_company.setdefault(key, []).append(row)

    result = []
    for key, group in by_company.items():
        # Pick the row with highest fair value as representative
        best = max(group, key=lambda r: abs(r.get("fair_value_usd") or 0))
        # Sum fair values and cost basis across all entries
        total_fv = sum(r.get("fair_value_usd") or 0 for r in group)
        total_cost = sum(r.get("cost_basis_usd") or 0 for r in group)
        best = dict(best)  # copy
        best["fair_value_usd"] = total_fv if total_fv else best.get("fair_value_usd")
        best["cost_basis_usd"] = total_cost if total_cost else best.get("cost_basis_usd")
        result.append(best)

    return result


# ── Top-Level Entry Point ────────────────────────────────────────────────────

def parse_schedule_for_bdc(cik: str, bdc_name: str, max_retries: int = 2) -> List[Dict]:
    """
    Orchestrate: find_latest_10k → fetch primary document → parse schedule section.

    Returns list of dicts matching existing shape:
        {company_name, sector, facility_type, pricing_spread, maturity_date,
         fair_value_usd, cost_basis_usd, non_accrual, source_bdc, filing_date}

    On any failure (network, parse), returns empty list (caller falls back to seed).
    """
    for attempt in range(max_retries):
        try:
            # Step 1: Find latest 10-K
            filing = find_latest_10k(cik)
            if not filing:
                print(f"[xbrl_parser] No 10-K found for {bdc_name} (CIK {cik})")
                return []

            accession = filing["accession_number"]
            filing_date = filing["filing_date"]
            primary_doc = filing.get("primary_document", "")

            print(f"[xbrl_parser] {bdc_name}: 10-K filed {filing_date}, accession {filing['accession_fmt']}")

            if not primary_doc:
                print(f"[xbrl_parser] {bdc_name}: No primary document found")
                return []

            # Step 2: Fetch primary filing document
            print(f"[xbrl_parser] {bdc_name}: Fetching {primary_doc}...")
            html = _fetch_filing_html(cik, accession, primary_doc)
            if not html:
                print(f"[xbrl_parser] {bdc_name}: Failed to fetch filing HTML")
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                return []

            # Step 3: Parse
            companies = parse_filing_html(html, bdc_name, filing_date)
            if companies:
                return companies

            print(f"[xbrl_parser] {bdc_name}: Parse returned 0 companies (attempt {attempt + 1})")

        except Exception as exc:
            print(f"[xbrl_parser] {bdc_name} attempt {attempt + 1} failed: {exc}")
            if attempt < max_retries - 1:
                time.sleep(1)

    return []
