"""
galleon/api/assistant.py
────────────────────────
Galleon AI assistant — Claude-powered conversational interface for private credit data.

Provides a context-aware chat API that:
  1. Greets analysts and asks about their current deal
  2. Searches the BDC universe when company names are mentioned
  3. Returns EDGAR-sourced loan terms inline in the conversation
  4. Suggests next actions (upload docs, navigate to tabs)

Falls back to rule-based responses when ANTHROPIC_API_KEY is not set.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("galleon.assistant")

import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Dict, List, Optional

# ── Path setup ────────────────────────────────────────────────────────────────
_HERE = Path(__file__).parent
_GALLEON_ROOT = _HERE.parent
sys.path.insert(0, str(_GALLEON_ROOT))

# ── Conversation store (in-memory, backed by SQLite) ─────────────────────────
_conversations: Dict[str, List[Dict]] = {}  # conversation_id → [messages]

# Try loading persisted conversations from SQLite
try:
    from api.sqlite_store import load_conversations as _db_load_convos, append_message as _db_append_msg
    _saved = _db_load_convos()
    if _saved:
        _conversations.update(_saved)
        logger.info("Loaded %d conversations from SQLite", len(_saved))
    _HAS_SQLITE = True
except Exception:
    _HAS_SQLITE = False

# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT_TEMPLATE = """You are Galleon, a private credit data intelligence assistant.
You help analysts find, extract, and validate financial data for private credit borrowers.

DATA SOURCES AVAILABLE:
- SEC EDGAR: BDC portfolio companies with loan terms (spread, maturity, fair value)
- FDIC: Bank institution data, quarterly financials, failed bank records
- USASpending.gov: Federal contracts, grants, and loan awards
- SBA: Small Business Administration loan data
- OpenCorporates: Corporate registry, incorporation status, officers/directors
- UCC Filings: Liens and security interests (EDGAR + OpenCorporates aggregation)

CAPABILITIES (include a JSON action block when appropriate):
- search_companies: search BDC portfolio universe by company name
- search_multi: search across all data sources simultaneously
- navigate_tab: switch UI tab (dashboard/pipeline/rules/profiles/lineage/conflicts/validation)
- open_upload: open the document upload dialog
- show_company: load a specific company profile

When you want to trigger an action, append this at the END of your response only (never mid-sentence):
<action>{{"type": "open_upload", "params": {{}}}}</action>
<action>{{"type": "navigate_tab", "params": {{"tab": "pipeline"}}}}</action>
<action>{{"type": "search_multi", "params": {{"query": "company name"}}}}</action>

UNIVERSE: {universe_summary}
ACTIVE COMPANY: {active_company}
EDGAR CONTEXT:
{edgar_context}
MULTI-SOURCE CONTEXT:
{multi_source_context}

BEHAVIORAL GUIDELINES:
- On the very first message (greeting): warmly introduce yourself as Galleon, mention you have access to SEC EDGAR, FDIC, USASpending, OpenCorporates, and UCC data, ask what company or deal the analyst is working on today
- When a company name is mentioned: search across available sources and present findings concisely
- After showing data: always suggest uploading financial documents to extract and verify
- For companies NOT in the index: "I don't have EDGAR data for [company] yet, but I can check FDIC, federal awards, and corporate registry. Upload their documents and I'll extract from source."
- When showing results from multiple sources, attribute each finding (e.g., "per FDIC data", "via USASpending")
- Keep responses concise (2-4 sentences). Use private credit terminology naturally.
- Tone: professional, sharp, like a knowledgeable deal analyst colleague

DEAL TERMINOLOGY (use naturally):
BDC, SOFR spread, first lien, unitranche, second lien, PIK, non-accrual,
fair value, cost basis, unrealized G/L, NAV, leverage ratio, DSCR, interest coverage,
covenant package, amortization, facility type, senior secured, mezzanine"""


def _build_system_prompt(session_context: dict) -> str:
    """Build the system prompt with injected universe and session context."""
    # Universe summary
    try:
        from bdc_index import get_universe_summary  # type: ignore
        summary = get_universe_summary()
        universe_summary = (
            f"{summary['bdc_count']} BDCs indexed, "
            f"{summary['company_count']} portfolio companies"
        )
        if summary.get("is_stale"):
            universe_summary += " (index updating)"
    except Exception:
        universe_summary = "indexing in progress"

    # Active company context
    active_company = session_context.get("active_company") or "none selected"

    # EDGAR context from matched companies
    company_matches = session_context.get("company_matches", [])
    if company_matches:
        lines = []
        for co in company_matches[:3]:
            line = f"- {co.get('company_name')} ({co.get('source_bdc', 'BDC')})"
            details = []
            if co.get("facility_type"):
                details.append(co["facility_type"])
            if co.get("pricing_spread"):
                details.append(co["pricing_spread"])
            if co.get("fair_value_usd"):
                details.append(f"FV ${co['fair_value_usd']/1e6:.1f}M")
            if co.get("maturity_date"):
                details.append(f"matures {co['maturity_date']}")
            if co.get("non_accrual"):
                details.append("NON-ACCRUAL")
            if details:
                line += ": " + ", ".join(details)
            lines.append(line)
        edgar_context = "\n".join(lines)
    else:
        edgar_context = "No specific company data loaded yet"

    # Multi-source context from recent searches
    multi_source = session_context.get("multi_source_results", {})
    multi_lines = []
    if multi_source.get("fdic"):
        for inst in multi_source["fdic"][:2]:
            multi_lines.append(f"- FDIC: {inst.get('name', '')} (cert {inst.get('cert', '')}), assets ${inst.get('total_assets', 0):,.0f}k")
    if multi_source.get("usaspending"):
        for aw in multi_source["usaspending"][:2]:
            multi_lines.append(f"- USASpending: {aw.get('recipient', '')} — ${aw.get('award_amount', 0):,.0f} ({aw.get('award_type', '')})")
    if multi_source.get("opencorporates"):
        for co in multi_source["opencorporates"][:2]:
            multi_lines.append(f"- OpenCorporates: {co.get('name', '')} ({co.get('jurisdiction', '')}, {co.get('status', '')})")
    if multi_source.get("ucc"):
        for f in multi_source["ucc"][:2]:
            multi_lines.append(f"- UCC: {f.get('filing_type', '')} — {f.get('debtor', '')} ({f.get('source', '')})")
    multi_source_context = "\n".join(multi_lines) if multi_lines else "No multi-source data loaded yet"

    return _SYSTEM_PROMPT_TEMPLATE.format(
        universe_summary=universe_summary,
        active_company=active_company,
        edgar_context=edgar_context,
        multi_source_context=multi_source_context,
    )


# ── Public API ────────────────────────────────────────────────────────────────

def chat(
    message: str,
    conversation_id: Optional[str],
    session_context: dict,
) -> dict:
    """
    Send a message to the Galleon assistant.
    Returns {response, conversation_id, action, action_params, company_matches}.
    """
    if not conversation_id:
        conversation_id = str(uuid.uuid4())

    # Initialize conversation history
    if conversation_id not in _conversations:
        _conversations[conversation_id] = []

    # Search for companies mentioned in the message
    company_matches = _search_companies_from_message(message)
    if company_matches:
        session_context = {**session_context, "company_matches": company_matches}

    # Search multi-source data for enrichment
    multi_results = _search_multi_sources(message)
    if multi_results:
        session_context = {**session_context, "multi_source_results": multi_results}

    # Try Anthropic API first
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            return _claude_chat(message, conversation_id, session_context, company_matches)
        except Exception as exc:
            logger.warning("Claude API error: %s — falling back to rule-based", exc)

    # Fallback to rule-based
    return _fallback_response(message, conversation_id, company_matches)


# ── Claude API call ───────────────────────────────────────────────────────────

def _claude_chat(
    message: str,
    conversation_id: str,
    session_context: dict,
    company_matches: List[Dict],
) -> dict:
    """Call claude-haiku-4-5-20251001 with Galleon system prompt."""
    import anthropic  # type: ignore

    client = anthropic.Anthropic()
    history = _conversations[conversation_id]

    # Append user message
    history.append({"role": "user", "content": message})
    if _HAS_SQLITE:
        try:
            _db_append_msg(conversation_id, "user", message)
        except Exception:
            pass

    system_prompt = _build_system_prompt(session_context)

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=system_prompt,
        messages=history,
    )

    assistant_text = response.content[0].text

    # Parse any action JSON from response
    action, action_params, clean_text = _parse_action(assistant_text)

    # Persist assistant turn (without raw action tag)
    history.append({"role": "assistant", "content": clean_text})
    if _HAS_SQLITE:
        try:
            _db_append_msg(conversation_id, "assistant", clean_text)
        except Exception:
            pass

    # If company matches found but no explicit action, suggest upload
    if company_matches and not action:
        action = "show_company_results"
        action_params = {"matches": [_serialize_match(m) for m in company_matches]}

    return {
        "response":        clean_text,
        "conversation_id": conversation_id,
        "action":          action,
        "action_params":   action_params or {},
        "company_matches": company_matches or None,
    }


def _parse_action(text: str):
    """Extract <action>…</action> JSON block from assistant response text."""
    action_match = re.search(r"<action>(.*?)</action>", text, re.DOTALL)
    if not action_match:
        return None, None, text.strip()

    action_json = action_match.group(1).strip()
    clean_text = re.sub(r"\s*<action>.*?</action>", "", text, flags=re.DOTALL).strip()

    try:
        action_data = json.loads(action_json)
        return action_data.get("type"), action_data.get("params", {}), clean_text
    except json.JSONDecodeError:
        return None, None, clean_text


# ── Fallback rule-based responses ─────────────────────────────────────────────

def _fallback_response(
    message: str,
    conversation_id: str,
    company_matches: List[Dict],
) -> dict:
    """Rule-based responses when ANTHROPIC_API_KEY is not set."""
    msg_lower = message.lower().strip()
    history = _conversations[conversation_id]
    history.append({"role": "user", "content": message})
    if _HAS_SQLITE:
        try:
            _db_append_msg(conversation_id, "user", message)
        except Exception:
            pass

    action: Optional[str] = None
    action_params: dict = {}

    is_first_message = len(history) == 1
    is_greeting = any(
        w in msg_lower
        for w in ["hi", "hello", "hey", "howdy", "greetings", "good morning", "good afternoon", "sup"]
    )

    # ── Greeting ──────────────────────────────────────────────────────────────
    if (is_greeting or msg_lower in ("hi", "hello")) and is_first_message:
        response = (
            "Hi, I'm Galleon — your private credit data intelligence assistant. "
            "I have access to SEC EDGAR loan terms, FDIC bank data, USASpending federal awards, "
            "OpenCorporates corporate registry, and UCC filing records. "
            "What company or deal are you working on today?"
        )

    # ── Company match found ────────────────────────────────────────────────────
    elif company_matches:
        co = company_matches[0]
        parts = [f"Found **{co['company_name']}** in the {co.get('source_bdc', 'BDC')} portfolio."]
        details = []
        if co.get("facility_type"):
            details.append(f"{co['facility_type']}")
        if co.get("pricing_spread"):
            details.append(f"{co['pricing_spread']}")
        if co.get("fair_value_usd"):
            details.append(f"Fair value ${co['fair_value_usd']/1e6:.1f}M")
        if co.get("maturity_date"):
            details.append(f"matures {co['maturity_date']}")
        if details:
            parts.append(", ".join(details) + ".")
        if co.get("non_accrual"):
            parts.append("⚠ This position is on non-accrual.")
        parts.append("Upload their financial documents to extract and verify the full credit picture.")
        response = " ".join(parts)
        action = "open_upload"
        action_params = {"company_name": co["company_name"]}

    # ── Index not ready ────────────────────────────────────────────────────────
    elif not _index_has_data():
        response = (
            "I'm currently indexing the BDC universe from EDGAR — "
            "this takes about 30 seconds. Try your search again in a moment, "
            "or upload a document directly and I'll extract from source."
        )

    # ── Upload / document requests ─────────────────────────────────────────────
    elif any(w in msg_lower for w in ["upload", "document", "pdf", "file", "attach"]):
        response = "I'll open the document upload panel. Drop in a PDF, Excel, or Word file to start extraction."
        action = "open_upload"

    # ── Help / capabilities ────────────────────────────────────────────────────
    elif any(w in msg_lower for w in ["help", "what can", "capabilities", "feature", "how do"]):
        response = (
            "I can: (1) search 10,000+ private credit borrowers from BDC EDGAR filings, "
            "(2) look up FDIC bank data, USASpending federal awards, and OpenCorporates corporate registry, "
            "(3) search UCC filings and liens across EDGAR and state records, "
            "(4) guide you through document upload and financial extraction, "
            "(5) verify extracted data against SEC ground truth. "
            "Just tell me a company name to get started."
        )

    # ── Navigation requests ────────────────────────────────────────────────────
    elif any(w in msg_lower for w in ["pipeline", "go to pipeline", "show pipeline"]):
        response = "Opening the pipeline view."
        action = "navigate_tab"
        action_params = {"tab": "pipeline"}

    elif any(w in msg_lower for w in ["validation", "ground truth", "benchmark"]):
        response = "Opening the validation lab — here you can see EDGAR ground truth vs. extracted values."
        action = "navigate_tab"
        action_params = {"tab": "validation"}

    elif any(w in msg_lower for w in ["conflict", "conflicts", "discrepancy"]):
        response = "Opening the conflict resolution view."
        action = "navigate_tab"
        action_params = {"tab": "conflicts"}

    # ── No match found ─────────────────────────────────────────────────────────
    else:
        response = (
            f"I searched for '{message}' but didn't find an exact match in our BDC universe index. "
            "The company may not be in a current BDC portfolio, or the name may differ slightly. "
            "Upload their financial documents directly and I'll extract the deal data from source."
        )
        action = "open_upload"
        action_params = {"company_name": message}

    history.append({"role": "assistant", "content": response})
    if _HAS_SQLITE:
        try:
            _db_append_msg(conversation_id, "assistant", response)
        except Exception:
            pass

    return {
        "response":        response,
        "conversation_id": conversation_id,
        "action":          action,
        "action_params":   action_params,
        "company_matches": company_matches or None,
    }


# ── Company search helper ──────────────────────────────────────────────────────

def _search_companies_from_message(message: str) -> List[Dict]:
    """Search the BDC universe for company names mentioned in the message."""
    try:
        from bdc_index import search_universe, _flat_index  # type: ignore
        if not _flat_index:
            return []
        results = search_universe(message.strip(), top_k=3)
        # Only return high-confidence matches
        return [r for r in results if r.get("match_confidence", 0) >= 0.45]
    except Exception as exc:
        logger.error("Company search error: %s", exc)
        return []


def _search_multi_sources(message: str) -> Dict:
    """Search FDIC, OpenCorporates, etc. for entity mentions. Best-effort, silent on failure."""
    msg = message.strip()
    if len(msg) < 3:
        return {}

    # Skip greetings and short commands
    skip_words = {"hi", "hello", "hey", "help", "upload", "pipeline", "validation"}
    if msg.lower() in skip_words:
        return {}

    results: Dict = {}

    # FDIC — only for bank-like queries
    try:
        from clients.fdic_client import search_institutions  # type: ignore
        fdic = search_institutions(msg, limit=3)
        if fdic:
            results["fdic"] = fdic
    except Exception:
        pass

    # OpenCorporates — general corporate lookup
    try:
        from clients.opencorporates_client import search_companies  # type: ignore
        oc = search_companies(msg, limit=3)
        if oc:
            results["opencorporates"] = oc
    except Exception:
        pass

    return results


def _index_has_data() -> bool:
    """Check if the BDC index has been populated."""
    try:
        from bdc_index import _flat_index  # type: ignore
        return bool(_flat_index)
    except Exception:
        return False


def _serialize_match(co: dict) -> dict:
    """Ensure match dict is JSON-serializable."""
    return {
        "company_name":    co.get("company_name"),
        "source_bdc":      co.get("source_bdc"),
        "sector":          co.get("sector"),
        "facility_type":   co.get("facility_type"),
        "pricing_spread":  co.get("pricing_spread"),
        "maturity_date":   co.get("maturity_date"),
        "fair_value_usd":  co.get("fair_value_usd"),
        "cost_basis_usd":  co.get("cost_basis_usd"),
        "non_accrual":     bool(co.get("non_accrual", False)),
        "match_confidence":co.get("match_confidence", 0.0),
    }
