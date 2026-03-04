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
    sqlite_ok: bool = False
    bdc_index_companies: int = 0
    monitor_running: bool = False
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


# ── Field Lineage ────────────────────────────────────────────────────────

class FieldLineageOut(BaseModel):
    field_name: str
    company_id: str
    candidates: List[FieldValueOut] = []
    winner: Optional[FieldValueOut] = None
    resolution_method: Optional[str] = None


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


class ConflictCandidateOut(BaseModel):
    source: str
    value: Optional[str] = None
    confidence: float = 0.0


class ConflictDetailOut(BaseModel):
    id: str
    company: Optional[str] = None
    field: str
    candidates: List[ConflictCandidateOut] = []
    winner: Optional[str] = None
    resolution_method: Optional[str] = None
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


# ── BDC Universe ──────────────────────────────────────────────────────────────

class CompanySearchResult(BaseModel):
    company_name: str
    source_bdc: str
    sector: Optional[str] = None
    facility_type: Optional[str] = None
    pricing_spread: Optional[str] = None
    maturity_date: Optional[str] = None
    fair_value_usd: Optional[float] = None
    cost_basis_usd: Optional[float] = None
    non_accrual: bool = False
    match_confidence: float


class BdcSummary(BaseModel):
    ticker: str
    name: str
    cik: str
    company_count: int
    last_indexed: Optional[str] = None


# ── Assistant ─────────────────────────────────────────────────────────────────

# ── FDIC ─────────────────────────────────────────────────────────────────────

class FdicInstitutionOut(BaseModel):
    name: str
    cert: str
    city: Optional[str] = None
    state: Optional[str] = None
    total_assets: Optional[float] = None
    roa: Optional[float] = None
    equity_capital: Optional[float] = None
    active: bool = True
    source: str = "FDIC"


class FdicFinancialsOut(BaseModel):
    report_date: str
    total_assets: Optional[float] = None
    net_income: Optional[float] = None
    roa: Optional[float] = None
    tier1_capital_ratio: Optional[float] = None
    equity_capital: Optional[float] = None
    cert: str
    source: str = "FDIC"


class FdicFailureOut(BaseModel):
    name: str
    cert: str
    city_state: Optional[str] = None
    state: Optional[str] = None
    closing_date: Optional[str] = None
    acquiring_institution: Optional[str] = None
    source: str = "FDIC"


# ── USASpending / SBA ────────────────────────────────────────────────────────

class UsaSpendingAwardOut(BaseModel):
    award_id: str
    recipient: str
    award_amount: Optional[float] = None
    awarding_agency: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    award_type: Optional[str] = None
    cfda_number: Optional[str] = None
    source: str = "USASpending"


class SbaLoanOut(BaseModel):
    recipient: str
    award_amount: Optional[float] = None
    award_date: Optional[str] = None
    description: Optional[str] = None
    cfda_program: Optional[str] = None
    award_id: Optional[str] = None
    awarding_agency: Optional[str] = None
    is_sba_program: bool = False
    source: str = "USASpending-SBA"


class RecipientProfileOut(BaseModel):
    name: str
    duns: Optional[str] = None
    uei: Optional[str] = None
    total_amount: Optional[float] = None
    award_count: Optional[int] = None
    source: str = "USASpending"


# ── OpenCorporates ───────────────────────────────────────────────────────────

class OpenCorpCompanyOut(BaseModel):
    name: str
    company_number: Optional[str] = None
    jurisdiction: Optional[str] = None
    status: Optional[str] = None
    incorporation_date: Optional[str] = None
    registered_address: Optional[str] = None
    opencorporates_url: Optional[str] = None
    source: str = "OpenCorporates"


class OpenCorpOfficerOut(BaseModel):
    name: str
    company_name: Optional[str] = None
    position: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    jurisdiction: Optional[str] = None
    opencorporates_url: Optional[str] = None
    source: str = "OpenCorporates"


# ── UCC ──────────────────────────────────────────────────────────────────────

class UccFilingOut(BaseModel):
    filing_type: str
    debtor: Optional[str] = None
    secured_party: Optional[str] = None
    filing_date: Optional[str] = None
    jurisdiction: Optional[str] = None
    source: str
    description: Optional[str] = None


# ── Multi-Source Search ──────────────────────────────────────────────────────

class MultiSourceSearchOut(BaseModel):
    query: str
    fdic: Optional[List[FdicInstitutionOut]] = None
    usaspending: Optional[List[UsaSpendingAwardOut]] = None
    opencorporates: Optional[List[OpenCorpCompanyOut]] = None
    ucc: Optional[List[UccFilingOut]] = None
    bdc: Optional[List[CompanySearchResult]] = None
    sources_queried: List[str] = []


# ── Assistant ────────────────────────────────────────────────────────────────

class AssistantChatIn(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    session_context: Optional[Dict[str, Any]] = {}


class AssistantChatOut(BaseModel):
    response: str
    conversation_id: str
    action: Optional[str] = None
    action_params: Optional[Dict[str, Any]] = {}
    company_matches: Optional[List[CompanySearchResult]] = None


# ── Cross-Reference Graph ────────────────────────────────────────────────────

class CrossRefHolder(BaseModel):
    source_bdc: str
    fair_value_usd: Optional[float] = None
    cost_basis_usd: Optional[float] = None
    pricing_spread: Optional[str] = None
    facility_type: Optional[str] = None
    filing_date: Optional[str] = None


class CrossRefCompany(BaseModel):
    canonical_name: str
    holder_count: int
    holders: List[CrossRefHolder] = []
    fv_range_pct: float = 0.0
    total_exposure_usd: float = 0.0
    sectors: List[str] = []


class CrossRefStats(BaseModel):
    cross_held_companies: int = 0
    avg_holders: float = 0
    max_discrepancy_pct: float = 0
    top_discrepancy_company: Optional[str] = None
    total_shared_exposure: float = 0


# ── Temporal Analysis ────────────────────────────────────────────────────────

class TemporalSnapshot(BaseModel):
    period: str
    source_bdc: str
    fair_value_usd: Optional[float] = None
    cost_basis_usd: Optional[float] = None
    pricing_spread: Optional[str] = None
    non_accrual: bool = False


class CompanyTimeline(BaseModel):
    company_name: str
    snapshots: List[TemporalSnapshot] = []
    fv_trend: str = "unknown"
    quarters_declining: int = 0


class EarlyWarning(BaseModel):
    company_name: str
    source_bdc: str
    quarters_declining: int
    fv_change_pct: float
    current_fv: float
    severity: str


class TemporalStats(BaseModel):
    companies_tracked: int = 0
    total_snapshots: int = 0
    bdcs_with_temporal: int = 0
    warnings_count: int = 0
    critical_warnings: int = 0
    build_status: Dict[str, str] = {}


# ── LLM Extraction ──────────────────────────────────────────────────────────

class CovenantOut(BaseModel):
    covenant_type: str
    threshold: Optional[str] = None
    test_frequency: Optional[str] = None
    cure_period: Optional[str] = None
    source_document: Optional[str] = None
    confidence_score: float = 0.85


class WaterfallTier(BaseModel):
    priority: int
    payee: str
    description: Optional[str] = None
    cap_or_limit: Optional[str] = None


class AmendmentRecord(BaseModel):
    amendment_number: Optional[str] = None
    effective_date: Optional[str] = None
    changes: List[str] = []
    summary: Optional[str] = None


# ── EDGAR Monitor ────────────────────────────────────────────────────────────

class FilingAlert(BaseModel):
    id: str
    alert_type: str
    source_bdc: Optional[str] = None
    company_name: Optional[str] = None
    message: str
    severity: str = "info"
    details: Dict[str, Any] = {}
    read: bool = False
    created_at: str


class MonitorStatus(BaseModel):
    running: bool = False
    last_poll: Optional[str] = None
    alerts_count: int = 0
    unread_count: int = 0
    tracked_bdcs: int = 25
    known_filings: int = 0


# ── Workflow ─────────────────────────────────────────────────────────────────

class DealReview(BaseModel):
    id: str
    company_name: str
    company_id: Optional[str] = None
    status: str = "pending"
    assignee: Optional[str] = None
    notes: Optional[str] = None
    priority: str = "medium"
    created_at: str
    updated_at: str


class DealReviewCreate(BaseModel):
    company_name: str
    company_id: Optional[str] = None
    assignee: Optional[str] = None
    notes: Optional[str] = None
    priority: str = "medium"


class DealReviewUpdate(BaseModel):
    status: Optional[str] = None
    assignee: Optional[str] = None
    notes: Optional[str] = None
    priority: Optional[str] = None


class ConcentrationLimit(BaseModel):
    dimension: str
    name: str
    current_exposure_usd: float = 0
    limit_pct: float = 0
    current_pct: float = 0
    breached: bool = False


class ExposureReport(BaseModel):
    total_portfolio_usd: float = 0
    by_sector: Dict[str, float] = {}
    by_bdc: Dict[str, float] = {}
    by_facility_type: Dict[str, float] = {}
    non_accrual_exposure_usd: float = 0
    concentration_alerts: List[ConcentrationLimit] = []
