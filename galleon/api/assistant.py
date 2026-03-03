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

# ── Conversation store (in-memory) ────────────────────────────────────────────
_conversations: Dict[str, List[Dict]] = {}  # conversation_id → [messages]

# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT_TEMPLATE = """You are Galleon, a private credit data intelligence assistant.
You help analysts find, extract, and validate financial data for private credit borrowers.

CAPABILITIES (include a JSON action block when appropriate):
- search_companies: search BDC portfolio universe by company name
- navigate_tab: switch UI tab (dashboard/pipeline/rules/profiles/lineage/conflicts/validation)
- open_upload: open the document upload dialog
- show_company: load a specific company profile

When you want to trigger an action, append this at the END of your response only (never mid-sentence):
<action>{{"type": "open_upload", "params": {{}}}}</action>
<action>{{"type": "navigate_tab", "params": {{"tab": "pipeline"}}}}</action>

UNIVERSE: {universe_summary}
ACTIVE COMPANY: {active_company}
EDGAR CONTEXT:
{edgar_context}

BEHAVIORAL GUIDELINES:
- On the very first message (greeting): warmly introduce yourself as Galleon, ask what company or deal the analyst is working on today
- When a company name is mentioned: say you found it (if matched) and present the EDGAR loan terms concisely
- After showing EDGAR data: always suggest uploading financial documents to extract and verify
- For companies NOT in the index: "I don't have EDGAR data for [company] yet. Upload their documents and I'll extract from source."
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

    return _SYSTEM_PROMPT_TEMPLATE.format(
        universe_summary=universe_summary,
        active_company=active_company,
        edgar_context=edgar_context,
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

    # Try Anthropic API first
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            return _claude_chat(message, conversation_id, session_context, company_matches)
        except Exception as exc:
            print(f"[assistant] Claude API error: {exc} — falling back to rule-based")

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
            "I have EDGAR-indexed loan terms for thousands of BDC portfolio companies. "
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
            "(2) guide you through document upload and financial extraction, "
            "(3) verify extracted data against SEC ground truth, "
            "(4) navigate you to any part of the Galleon platform. "
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
        print(f"[assistant] Company search error: {exc}")
        return []


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
