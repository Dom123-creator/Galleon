"""
galleon/pipeline/llm_extractor.py
LLM-powered extraction for covenants, waterfalls, and amendments.

Uses Claude Haiku for structured extraction from credit documents.
Gracefully falls back to empty results when ANTHROPIC_API_KEY is not set.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, asdict
from typing import List, Optional


ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")


@dataclass
class ExtractionResult:
    field_name: str
    field_category: str
    raw_value: str
    normalized_value: Optional[str] = None
    numeric_value: Optional[float] = None
    confidence_score: float = 0.85
    extraction_method: str = "llm_claude_haiku"
    source_section: Optional[str] = None
    source_snippet: Optional[str] = None


class LlmExtractor:
    """Extract structured data from credit documents using Claude Haiku."""

    def __init__(self, text: str, filename: str = ""):
        self.text = text
        self.filename = filename
        self._client = None
        if ANTHROPIC_API_KEY:
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            except ImportError:
                pass

    def _find_sections(self, keywords: List[str], max_chars: int = 8000) -> str:
        """Find relevant text chunks containing keywords."""
        lower_text = self.text.lower()
        chunks = []
        for kw in keywords:
            idx = lower_text.find(kw.lower())
            if idx >= 0:
                start = max(0, idx - 500)
                end = min(len(self.text), idx + max_chars)
                chunks.append(self.text[start:end])

        if not chunks:
            # Return first max_chars of document as fallback
            return self.text[:max_chars]

        combined = "\n---\n".join(chunks)
        return combined[:max_chars * 2]

    def _call_claude(self, prompt: str, text_chunk: str) -> Optional[str]:
        """Call Claude Haiku for extraction."""
        if not self._client:
            return None

        try:
            msg = self._client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2048,
                temperature=0,
                messages=[{
                    "role": "user",
                    "content": f"{prompt}\n\n---\nDOCUMENT TEXT:\n{text_chunk}"
                }],
            )
            return msg.content[0].text if msg.content else None
        except Exception as exc:
            print(f"[llm_extractor] Claude call failed: {exc}")
            return None

    def extract_covenants(self) -> List[ExtractionResult]:
        """Extract financial covenants from the document."""
        section_text = self._find_sections([
            "financial covenant", "covenant", "maintenance covenant",
            "leverage ratio", "interest coverage", "debt service",
            "fixed charge", "minimum ebitda", "maximum leverage",
        ])

        prompt = """Extract all financial covenants from this credit document.
For each covenant, return a JSON array of objects with:
- covenant_type: (e.g., "Maximum Leverage Ratio", "Minimum Interest Coverage", "Minimum Fixed Charge Coverage", "Maximum Total Debt", "Minimum EBITDA")
- threshold: the numeric threshold or limit (e.g., "4.50x", "1.25x", "$10,000,000")
- test_frequency: how often tested (e.g., "Quarterly", "Annually", "Monthly")
- cure_period: days to cure if breached (e.g., "30 days", "None specified")

Return ONLY a JSON array. If no covenants found, return [].
Example: [{"covenant_type":"Maximum Leverage Ratio","threshold":"4.50x","test_frequency":"Quarterly","cure_period":"30 days"}]"""

        result = self._call_claude(prompt, section_text)
        if not result:
            return []

        return self._parse_covenant_results(result)

    def _parse_covenant_results(self, raw: str) -> List[ExtractionResult]:
        """Parse Claude's covenant extraction response."""
        try:
            # Find JSON array in response
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if not match:
                return []
            items = json.loads(match.group())
        except (json.JSONDecodeError, AttributeError):
            return []

        results = []
        for item in items:
            cov_type = item.get("covenant_type", "")
            threshold = item.get("threshold", "")
            if not cov_type:
                continue

            results.append(ExtractionResult(
                field_name=f"covenant_{cov_type.lower().replace(' ', '_')}",
                field_category="covenant",
                raw_value=f"{cov_type}: {threshold}",
                normalized_value=threshold,
                numeric_value=_parse_numeric(threshold),
                confidence_score=0.85,
                extraction_method="llm_claude_haiku",
                source_section="Financial Covenants",
                source_snippet=f"Test: {item.get('test_frequency', 'N/A')}, Cure: {item.get('cure_period', 'N/A')}",
            ))

        return results

    def extract_waterfall(self) -> List[ExtractionResult]:
        """Extract priority of payments / waterfall structure."""
        section_text = self._find_sections([
            "priority of payments", "waterfall", "application of proceeds",
            "order of priority", "distribution waterfall",
            "first, to", "second, to", "third, to",
        ])

        prompt = """Extract the priority of payments (waterfall) from this credit document.
For each tier, return a JSON array of objects with:
- priority: integer (1, 2, 3, etc.)
- payee: who receives payment (e.g., "Administrative Agent", "Senior Lenders", "Mezzanine Lenders")
- description: brief description of the payment
- cap_or_limit: any cap or limit on the payment (e.g., "$500,000 per annum", "Pro rata", "None")

Return ONLY a JSON array. If no waterfall found, return [].
Example: [{"priority":1,"payee":"Administrative Agent","description":"Agent fees and expenses","cap_or_limit":"$500,000 per annum"}]"""

        result = self._call_claude(prompt, section_text)
        if not result:
            return []

        return self._parse_waterfall_results(result)

    def _parse_waterfall_results(self, raw: str) -> List[ExtractionResult]:
        """Parse Claude's waterfall extraction response."""
        try:
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if not match:
                return []
            items = json.loads(match.group())
        except (json.JSONDecodeError, AttributeError):
            return []

        results = []
        for item in items:
            priority = item.get("priority", 0)
            payee = item.get("payee", "")
            if not payee:
                continue

            results.append(ExtractionResult(
                field_name=f"waterfall_tier_{priority}",
                field_category="waterfall",
                raw_value=f"Priority {priority}: {payee} — {item.get('description', '')}",
                normalized_value=payee,
                confidence_score=0.85,
                extraction_method="llm_claude_haiku",
                source_section="Priority of Payments",
                source_snippet=f"Cap: {item.get('cap_or_limit', 'N/A')}",
            ))

        return results

    def extract_amendments(self) -> List[ExtractionResult]:
        """Extract amendment history from the document."""
        section_text = self._find_sections([
            "amendment", "first amendment", "second amendment",
            "amended and restated", "modification", "waiver",
            "consent and amendment",
        ])

        prompt = """Extract all amendments or modifications mentioned in this credit document.
For each amendment, return a JSON array of objects with:
- amendment_number: (e.g., "First", "Second", "Third", or "1", "2", "3")
- effective_date: date the amendment took effect (e.g., "2024-03-15", or "March 15, 2024")
- changes: array of strings describing what changed
- summary: one-sentence summary

Return ONLY a JSON array. If no amendments found, return [].
Example: [{"amendment_number":"First","effective_date":"2024-03-15","changes":["Increased revolving commitment to $50M","Extended maturity to 2029"],"summary":"Upsized facility and extended maturity."}]"""

        result = self._call_claude(prompt, section_text)
        if not result:
            return []

        return self._parse_amendment_results(result)

    def _parse_amendment_results(self, raw: str) -> List[ExtractionResult]:
        """Parse Claude's amendment extraction response."""
        try:
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if not match:
                return []
            items = json.loads(match.group())
        except (json.JSONDecodeError, AttributeError):
            return []

        results = []
        for item in items:
            num = item.get("amendment_number", "")
            date = item.get("effective_date", "")
            summary = item.get("summary", "")
            changes = item.get("changes", [])

            if not num and not date:
                continue

            results.append(ExtractionResult(
                field_name=f"amendment_{str(num).lower().replace(' ', '_')}",
                field_category="amendment",
                raw_value=f"Amendment {num} ({date}): {summary}",
                normalized_value=summary,
                confidence_score=0.85,
                extraction_method="llm_claude_haiku",
                source_section="Amendments",
                source_snippet="; ".join(changes[:3]) if changes else None,
            ))

        return results


def _parse_numeric(val: str) -> Optional[float]:
    """Try to extract a numeric value from a string like '4.50x' or '$10M'."""
    if not val:
        return None
    clean = val.replace(",", "").replace("$", "").replace("x", "").strip()
    # Handle M/B suffixes
    multiplier = 1.0
    if clean.upper().endswith("M"):
        multiplier = 1_000_000
        clean = clean[:-1]
    elif clean.upper().endswith("B"):
        multiplier = 1_000_000_000
        clean = clean[:-1]
    try:
        return float(clean) * multiplier
    except ValueError:
        return None
