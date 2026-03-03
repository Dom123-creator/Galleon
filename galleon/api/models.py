"""
galleon/api/models.py
Pydantic request/response models for the Galleon FastAPI server.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


# ── Health ────────────────────────────────────────────────────────────────────

class HealthOut(BaseModel):
    status: str
    db_connected: bool
    version: str
    timestamp: str


# ── Companies ─────────────────────────────────────────────────────────────────

class CompanyCreate(BaseModel):
    canonical_name: str
    sector: Optional[str] = None
    jurisdiction: Optional[str] = None
    entity_type: Optional[str] = None


class CompanySummary(BaseModel):
    id: str
    name: str
    sector: Optional[str] = None
    completeness: Optional[float] = None
    fields_extracted: Optional[int] = None
    pipeline_status: Optional[str] = None
    conflicts: int = 0
    last_run: Optional[str] = None


class CompanyOut(BaseModel):
    id: str
    canonical_name: str
    sector: Optional[str] = None
    jurisdiction: Optional[str] = None
    entity_type: Optional[str] = None
    is_active: bool = True
    created_at: str


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    filename: str
    company: Optional[str] = None
    status: str
    fields_extracted: int = 0
    created_at: str


# ── Field Values ──────────────────────────────────────────────────────────────

class FieldValueOut(BaseModel):
    id: Optional[str] = None
    field_name: str
    field_category: str
    raw_value: Optional[str] = None
    normalized_value: Optional[str] = None
    numeric_value: Optional[float] = None
    currency: Optional[str] = None
    unit: Optional[str] = None
    source_type: str
    source_document: Optional[str] = None
    source_page: Optional[int] = None
    source_section: Optional[str] = None
    source_snippet: Optional[str] = None
    extraction_method: str
    confidence_score: float
    rule_id: Optional[str] = None
    status: str = "extracted"


# ── Pipeline ──────────────────────────────────────────────────────────────────

class PipelineStepOut(BaseModel):
    step_number: int
    step_name: str
    status: str
    duration_ms: Optional[int] = None
    items_out: Optional[int] = None


class PipelineOut(BaseModel):
    pipeline_id: str
    status: str
    steps: Optional[List[PipelineStepOut]] = None
    fields_extracted: Optional[int] = None
    conflicts: Optional[int] = None
    avg_confidence: Optional[float] = None
    completeness_pct: Optional[float] = None


# ── Conflicts ─────────────────────────────────────────────────────────────────

class ConflictOut(BaseModel):
    id: str
    company: Optional[str] = None
    field: str
    delta: Optional[str] = None
    sources: Optional[List[str]] = None
    detected_at: str


class ConflictResolveRequest(BaseModel):
    winner_value_id: str
    method: str
    notes: Optional[str] = None


# ── Ground Truth / EDGAR ──────────────────────────────────────────────────────

class GroundTruthOut(BaseModel):
    galleon_id: str
    source_bdc: str
    edgar_cik: str
    filing_date: str
    company: Dict[str, Any]
    ground_truth: Dict[str, Any]
    galleon_targets: Dict[str, Any]
    validation: Dict[str, Any]


# ── Benchmark ─────────────────────────────────────────────────────────────────

class BenchmarkSummary(BaseModel):
    records: int
    gt_fields: int
    bdc_coverage: float
    galleon_gap: float
    avg_accuracy: Optional[float] = None
    avg_completeness: Optional[float] = None


# ── Rules ─────────────────────────────────────────────────────────────────────

class RuleOut(BaseModel):
    rule_id: str
    name: str
    field: str
    type: str
    logic: Optional[str] = None
    base_confidence: float
    pass_rate: Optional[float] = None
