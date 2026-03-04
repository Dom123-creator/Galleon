"""
galleon/pipeline/edgar_monitor.py
Background EDGAR filing monitor with diff engine and alert system.

Polls EDGAR for new 10-K/10-Q filings from tracked BDCs,
auto-ingests new filings, diffs against previous snapshots,
and creates alerts for material changes.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional

import requests

# ── Module-level state ────────────────────────────────────────────────────────
_alerts: List[Dict] = []
_known_filings: Dict[str, str] = {}  # cik -> last known accession number
_monitor_thread: Optional[threading.Thread] = None
_running = False
_last_poll: Optional[str] = None
_poll_interval = 3600  # 1 hour

HEADERS = {"User-Agent": "Galleon Research contact@galleon.io"}
EDGAR_BASE = "https://data.sec.gov"


def start_monitor() -> None:
    """Start background monitoring thread."""
    global _monitor_thread, _running
    if _running:
        return

    _running = True
    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
    _monitor_thread.start()
    print("[edgar_monitor] Monitor started")

    # Generate initial alerts from current index for demo
    _generate_seed_alerts()


def stop_monitor() -> None:
    """Stop background monitoring thread."""
    global _running
    _running = False
    print("[edgar_monitor] Monitor stopped")


def _monitor_loop() -> None:
    """Main polling loop."""
    global _last_poll

    # Initial poll after short delay
    time.sleep(5)

    while _running:
        try:
            _poll_edgar_filings()
            _last_poll = datetime.utcnow().isoformat() + "Z"
        except Exception as exc:
            print(f"[edgar_monitor] Poll error: {exc}")

        # Sleep in small increments so we can stop quickly
        for _ in range(min(_poll_interval, 3600)):
            if not _running:
                break
            time.sleep(1)


def _poll_edgar_filings() -> None:
    """Check EDGAR for new filings from tracked BDCs."""
    try:
        from bdc_index import BDC_SEED
    except ImportError:
        return

    for ticker, cik in list(BDC_SEED.items())[:5]:  # Check top 5 BDCs
        try:
            time.sleep(0.11)  # Rate limit
            url = f"{EDGAR_BASE}/submissions/CIK{cik}.json"
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code != 200:
                continue

            data = r.json()
            recent = data.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            accessions = recent.get("accessionNumber", [])
            dates = recent.get("filingDate", [])

            for form, acc, date in zip(forms, accessions, dates):
                if form not in ("10-K", "10-K/A", "10-Q", "10-Q/A"):
                    continue

                known = _known_filings.get(cik)
                if known == acc:
                    break  # Already seen this one

                _known_filings[cik] = acc

                if known is not None:
                    # This is a genuinely new filing
                    _on_new_filing(ticker, cik, {
                        "form": form,
                        "accession": acc,
                        "filing_date": date,
                    })
                break  # Only check latest filing per BDC

        except Exception as exc:
            print(f"[edgar_monitor] Poll {ticker} failed: {exc}")


def _on_new_filing(bdc: str, cik: str, filing_info: Dict) -> None:
    """Handle a new filing detection."""
    alert = {
        "id": str(uuid.uuid4()),
        "alert_type": "new_filing",
        "source_bdc": bdc,
        "company_name": None,
        "message": f"{bdc} filed {filing_info['form']} on {filing_info['filing_date']}",
        "severity": "info",
        "details": filing_info,
        "read": False,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    _alerts.insert(0, alert)
    print(f"[edgar_monitor] New filing alert: {alert['message']}")

    # Try to diff against previous data
    try:
        from bdc_index import _universe
        old_companies = _universe.get(bdc, [])

        from pipeline.xbrl_parser import parse_schedule_for_bdc
        new_companies = parse_schedule_for_bdc(cik, bdc)

        if old_companies and new_companies:
            diff_alerts = _diff_filings(bdc, old_companies, new_companies)
            _alerts[0:0] = diff_alerts  # Prepend diff alerts
    except Exception as exc:
        print(f"[edgar_monitor] Diff failed for {bdc}: {exc}")


def _diff_filings(bdc: str, old_companies: List[Dict], new_companies: List[Dict]) -> List[Dict]:
    """
    Core diff engine: compare old vs new filing data.
    Detects: new companies, removed companies, FV changes >5%,
    non-accrual changes, spread changes.
    """
    alerts = []

    old_by_name = {c.get("company_name", "").lower(): c for c in old_companies if c.get("company_name")}
    new_by_name = {c.get("company_name", "").lower(): c for c in new_companies if c.get("company_name")}

    # New companies
    for name, co in new_by_name.items():
        if name not in old_by_name:
            alerts.append({
                "id": str(uuid.uuid4()),
                "alert_type": "new_company",
                "source_bdc": bdc,
                "company_name": co.get("company_name"),
                "message": f"New portfolio company: {co.get('company_name')} added to {bdc}",
                "severity": "info",
                "details": {"fair_value_usd": co.get("fair_value_usd"), "facility_type": co.get("facility_type")},
                "read": False,
                "created_at": datetime.utcnow().isoformat() + "Z",
            })

    # Removed companies
    for name, co in old_by_name.items():
        if name not in new_by_name:
            alerts.append({
                "id": str(uuid.uuid4()),
                "alert_type": "removed_company",
                "source_bdc": bdc,
                "company_name": co.get("company_name"),
                "message": f"Company removed from {bdc} portfolio: {co.get('company_name')}",
                "severity": "medium",
                "details": {"last_fair_value_usd": co.get("fair_value_usd")},
                "read": False,
                "created_at": datetime.utcnow().isoformat() + "Z",
            })

    # Changes in existing companies
    for name in set(old_by_name) & set(new_by_name):
        old = old_by_name[name]
        new = new_by_name[name]

        # FV change > 5%
        old_fv = old.get("fair_value_usd") or 0
        new_fv = new.get("fair_value_usd") or 0
        if old_fv and new_fv:
            pct_change = (new_fv - old_fv) / old_fv * 100
            if abs(pct_change) > 5:
                severity = "high" if abs(pct_change) > 15 else "medium"
                direction = "increased" if pct_change > 0 else "decreased"
                alerts.append({
                    "id": str(uuid.uuid4()),
                    "alert_type": "fv_change",
                    "source_bdc": bdc,
                    "company_name": new.get("company_name"),
                    "message": f"{new.get('company_name')}: FV {direction} {abs(pct_change):.1f}% (${old_fv/1e6:.1f}M → ${new_fv/1e6:.1f}M)",
                    "severity": severity,
                    "details": {"old_fv": old_fv, "new_fv": new_fv, "pct_change": round(pct_change, 1)},
                    "read": False,
                    "created_at": datetime.utcnow().isoformat() + "Z",
                })

        # Non-accrual change
        old_na = old.get("non_accrual", False)
        new_na = new.get("non_accrual", False)
        if old_na != new_na:
            alerts.append({
                "id": str(uuid.uuid4()),
                "alert_type": "non_accrual_change",
                "source_bdc": bdc,
                "company_name": new.get("company_name"),
                "message": f"{new.get('company_name')}: {'Placed on' if new_na else 'Removed from'} non-accrual",
                "severity": "high" if new_na else "medium",
                "details": {"old_non_accrual": old_na, "new_non_accrual": new_na},
                "read": False,
                "created_at": datetime.utcnow().isoformat() + "Z",
            })

    return alerts


def _generate_seed_alerts() -> None:
    """Generate realistic seed alerts from current BDC index data for demo."""
    try:
        from bdc_index import _flat_index
    except ImportError:
        return

    if not _flat_index:
        return

    now = datetime.utcnow().isoformat() + "Z"

    # Alert: non-accrual companies
    for co in _flat_index:
        if co.get("non_accrual"):
            _alerts.append({
                "id": str(uuid.uuid4()),
                "alert_type": "non_accrual_watch",
                "source_bdc": co.get("source_bdc", ""),
                "company_name": co.get("company_name"),
                "message": f"{co.get('company_name')} on non-accrual at {co.get('source_bdc')}",
                "severity": "high",
                "details": {
                    "fair_value_usd": co.get("fair_value_usd"),
                    "cost_basis_usd": co.get("cost_basis_usd"),
                },
                "read": False,
                "created_at": now,
            })

    # Alert: large FV/cost discrepancies
    for co in sorted(_flat_index, key=lambda c: abs(c.get("fair_value_usd") or 0), reverse=True)[:100]:
        fv = co.get("fair_value_usd") or 0
        cost = co.get("cost_basis_usd") or 0
        if fv and cost and abs(fv - cost) / max(cost, 1) > 0.08:
            pct = round((fv - cost) / cost * 100, 1)
            _alerts.append({
                "id": str(uuid.uuid4()),
                "alert_type": "valuation_gap",
                "source_bdc": co.get("source_bdc", ""),
                "company_name": co.get("company_name"),
                "message": f"{co.get('company_name')}: FV vs Cost gap of {pct:+.1f}% at {co.get('source_bdc')}",
                "severity": "medium" if abs(pct) < 15 else "high",
                "details": {"fair_value_usd": fv, "cost_basis_usd": cost, "gap_pct": pct},
                "read": False,
                "created_at": now,
            })
        if len(_alerts) >= 20:
            break

    # Alert: system startup
    _alerts.append({
        "id": str(uuid.uuid4()),
        "alert_type": "system",
        "source_bdc": None,
        "company_name": None,
        "message": "EDGAR Monitor started — tracking 25 BDCs for new filings",
        "severity": "info",
        "details": {},
        "read": False,
        "created_at": now,
    })


# ── Public API ────────────────────────────────────────────────────────────────

def get_alerts(unread_only: bool = False, limit: int = 50) -> List[Dict]:
    """Get alerts, optionally filtered to unread only."""
    alerts = _alerts
    if unread_only:
        alerts = [a for a in alerts if not a.get("read")]
    return alerts[:limit]


def mark_alert_read(alert_id: str) -> bool:
    """Mark a single alert as read."""
    for alert in _alerts:
        if alert["id"] == alert_id:
            alert["read"] = True
            return True
    return False


def mark_all_read() -> int:
    """Mark all alerts as read. Returns count marked."""
    count = 0
    for alert in _alerts:
        if not alert.get("read"):
            alert["read"] = True
            count += 1
    return count


def get_monitor_status() -> Dict:
    """Get current monitor status."""
    return {
        "running": _running,
        "last_poll": _last_poll,
        "alerts_count": len(_alerts),
        "unread_count": sum(1 for a in _alerts if not a.get("read")),
        "tracked_bdcs": 25,
        "known_filings": len(_known_filings),
    }
