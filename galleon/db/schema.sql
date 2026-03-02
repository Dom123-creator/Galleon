-- =============================================================================
-- GALLEON — Provenance-Aware PostgreSQL Schema
-- =============================================================================
-- Version:  1.0.0
-- Engine:   PostgreSQL 15+
-- Encoding: UTF-8
--
-- DESIGN PHILOSOPHY
-- ─────────────────
-- Every field value in Galleon is a *record*, not just a datum.
-- A value without provenance is worthless in credit — you need to know:
--   • Which document did this come from?
--   • Which page / cell / paragraph?
--   • Was it extracted by a rule or by AI?
--   • Was there a conflict with another source, and how was it resolved?
--   • Who last touched it and when?
--
-- That means the unit of storage is not "Meridian Industrial's revenue is $284M"
-- but rather "field revenue_ttm for company C1 has value $284,100,000 sourced
-- from Mgmt Financials.xlsx cell P&L·C14, extracted by rule R002 with
-- confidence 0.97, winning over CIM PDF's $281,500,000 via priority stack".
--
-- TABLE MAP
-- ─────────
--   companies              Core entity — one row per borrower
--   documents              Ingested source files
--   field_values           THE core table — every extracted field with full provenance
--   field_conflicts        When sources disagree — the dispute record
--   field_resolutions      How each conflict was decided
--   rules                  Rule registry (141 deterministic validators)
--   rule_executions        Audit log of every rule run against a field value
--   pipelines              A pipeline run = one company × one set of documents
--   pipeline_steps         8-step execution log per pipeline run
--   ground_truth_records   ARCC EDGAR benchmark records
--   ground_truth_comparisons  Accuracy scoring per field after extraction
--   users                  Analysts who review / override values
--   audit_log              Immutable log of every data change
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy entity matching
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- normalise accented characters


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE field_category AS ENUM (
    'identity', 'deal', 'credit', 'financial', 'derived', 'operational'
);

CREATE TYPE extraction_method AS ENUM (
    'regex_ner',       -- deterministic regex match
    'cell_extract',    -- direct cell reference (XLSX)
    'table_parse',     -- structured table extraction
    'date_ner',        -- date-specific NER
    'unit_normalize',  -- unit conversion (% → bps, $M → raw)
    'calculation',     -- derived field formula
    'ai_extract',      -- LLM extraction (low priority, gap-fill only)
    'manual_entry',    -- analyst override
    'api_pull'         -- structured API (Bloomberg, EDGAR)
);

CREATE TYPE source_type AS ENUM (
    'audited_financials',     -- priority 1 — CPA-signed
    'bloomberg_api',          -- priority 2
    'management_financials',  -- priority 3 — XLSX from management
    'cim_pdf',                -- priority 4 — Confidential Information Memo
    'loan_agreement',         -- priority 5 — legal document
    'dd_call_notes',          -- priority 6 — diligence notes
    'ai_extraction',          -- priority 7 — fallback
    'edgar_filing',           -- BDC ground truth source
    'sba_data',               -- SBA 7(a)/504 data
    'court_filing',           -- Chapter 11 affidavit / PACER
    'state_registry'          -- Delaware / state business registry
);

CREATE TYPE document_type AS ENUM (
    'pdf', 'xlsx', 'docx', 'txt', 'csv', 'json', 'api_response', 'email'
);

CREATE TYPE document_status AS ENUM (
    'queued', 'processing', 'processed', 'failed', 'archived'
);

CREATE TYPE pipeline_status AS ENUM (
    'pending', 'running', 'complete', 'failed', 'review_required'
);

CREATE TYPE resolution_method AS ENUM (
    'priority_stack',         -- deterministic source ranking
    'max_confidence',         -- highest extraction confidence score
    'consensus',              -- all sources agree
    'sole_source',            -- only one source
    'manual_override',        -- analyst decision
    'flagged_for_review'      -- no automatic resolution possible
);

CREATE TYPE conflict_status AS ENUM (
    'open', 'resolved', 'escalated', 'dismissed'
);

CREATE TYPE value_status AS ENUM (
    'extracted',   -- raw from pipeline
    'validated',   -- passed rule engine
    'conflicted',  -- has unresolved conflict
    'resolved',    -- conflict resolved, winner selected
    'overridden',  -- analyst changed the value
    'rejected'     -- failed validation, excluded
);

CREATE TYPE gt_match_status AS ENUM (
    'match',      -- extracted value matches ground truth within tolerance
    'mismatch',   -- outside tolerance
    'missing',    -- Galleon did not extract this field
    'pending'     -- extraction not yet run
);


-- ---------------------------------------------------------------------------
-- companies
-- Core entity table. One row per unique borrower.
-- ---------------------------------------------------------------------------

CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Canonical identity
    canonical_name      TEXT        NOT NULL,
    legal_name          TEXT,
    doing_business_as   TEXT[],                 -- array of known aliases
    ein_tax_id          CHAR(10),               -- format: XX-XXXXXXX
    duns_number         CHAR(9),
    lei_code            CHAR(20),               -- Legal Entity Identifier
    -- Classification
    jurisdiction        TEXT,                   -- 'Delaware', 'Texas', etc.
    sic_code            CHAR(4),
    naics_code          CHAR(6),
    sector              TEXT,
    sub_sector          TEXT,
    founding_year       SMALLINT,
    -- Entity type
    entity_type         TEXT,                   -- LLC, LP, Inc., etc.
    ownership_structure TEXT,                   -- PE-backed, family, public
    -- Status
    is_active           BOOLEAN     DEFAULT TRUE,
    is_public           BOOLEAN     DEFAULT FALSE,
    edgar_cik           TEXT,                   -- if public or BDC portfolio co
    -- Entity resolution metadata
    normalized_name     TEXT        NOT NULL,   -- stripped / lowercased for matching
    name_tokens         TSVECTOR,               -- full-text search vector
    entity_confidence   NUMERIC(4,3),           -- how confident is the dedup
    merged_into         UUID REFERENCES companies(id),  -- if deduplicated
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Entity resolution indexes
CREATE INDEX idx_companies_normalized_name  ON companies (normalized_name);
CREATE INDEX idx_companies_name_tokens      ON companies USING GIN (name_tokens);
CREATE INDEX idx_companies_ein              ON companies (ein_tax_id) WHERE ein_tax_id IS NOT NULL;
CREATE INDEX idx_companies_edgar_cik        ON companies (edgar_cik) WHERE edgar_cik IS NOT NULL;
CREATE INDEX idx_companies_active           ON companies (is_active);
-- Trigram index for fuzzy name matching (replaces SOLVE-style entity dedup)
CREATE INDEX idx_companies_trgm             ON companies USING GIN (canonical_name gin_trgm_ops);

-- Auto-update name_tokens on insert/update
CREATE OR REPLACE FUNCTION update_company_name_tokens()
RETURNS TRIGGER AS $$
BEGIN
    NEW.name_tokens := to_tsvector('english', COALESCE(NEW.canonical_name,'') || ' ' ||
                                               COALESCE(NEW.legal_name,'') || ' ' ||
                                               COALESCE(array_to_string(NEW.doing_business_as,' '),''));
    NEW.normalized_name := lower(regexp_replace(
        COALESCE(NEW.canonical_name,''),
        '\s*(LLC|LP|LLP|Inc\.|Inc|Corp\.|Corp|Holdings|Group|Partners|Services|Solutions|Technologies|Capital|Company|Co\.)\s*$',
        '', 'gi'
    ));
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_name_tokens
    BEFORE INSERT OR UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_company_name_tokens();


-- ---------------------------------------------------------------------------
-- documents
-- Every ingested file. One row per document version.
-- ---------------------------------------------------------------------------

CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    -- File metadata
    filename        TEXT        NOT NULL,
    file_hash       CHAR(64),                   -- SHA-256 for dedup
    file_size_bytes BIGINT,
    doc_type        document_type NOT NULL,
    source_type     source_type   NOT NULL,
    -- Content metadata
    page_count      INTEGER,
    word_count      INTEGER,
    language        CHAR(5)     DEFAULT 'en',
    -- Temporal context
    doc_date        DATE,                       -- date of the document itself
    period_end      DATE,                       -- period covered (e.g. Q3 2024)
    filing_date     DATE,                       -- if SEC filing
    -- Storage
    storage_path    TEXT,                       -- S3 / local path
    storage_bucket  TEXT,
    -- Processing
    status          document_status DEFAULT 'queued',
    processed_at    TIMESTAMPTZ,
    error_message   TEXT,
    -- Extraction config
    extractor_version TEXT,                     -- version of extraction code used
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_company     ON documents (company_id);
CREATE INDEX idx_documents_source_type ON documents (source_type);
CREATE INDEX idx_documents_status      ON documents (status);
CREATE INDEX idx_documents_file_hash   ON documents (file_hash) WHERE file_hash IS NOT NULL;
-- Prevent duplicate ingestion of same file
CREATE UNIQUE INDEX idx_documents_hash_unique ON documents (file_hash) WHERE file_hash IS NOT NULL;


-- ---------------------------------------------------------------------------
-- pipelines
-- One pipeline run = processing one company's full document set.
-- ---------------------------------------------------------------------------

CREATE TABLE pipelines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    -- Run metadata
    run_number      INTEGER     NOT NULL DEFAULT 1,
    triggered_by    UUID,                       -- user id or NULL for system
    trigger_reason  TEXT,                       -- 'new_documents', 'reprocess', 'manual'
    -- Status
    status          pipeline_status DEFAULT 'pending',
    -- Timing
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    -- Results summary
    documents_processed  INTEGER DEFAULT 0,
    fields_extracted     INTEGER DEFAULT 0,
    fields_validated     INTEGER DEFAULT 0,
    conflicts_detected   INTEGER DEFAULT 0,
    conflicts_resolved   INTEGER DEFAULT 0,
    avg_confidence       NUMERIC(4,3),
    completeness_pct     NUMERIC(5,2),
    -- Error handling
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipelines_company    ON pipelines (company_id);
CREATE INDEX idx_pipelines_status     ON pipelines (status);
CREATE INDEX idx_pipelines_started    ON pipelines (started_at DESC);


-- ---------------------------------------------------------------------------
-- pipeline_steps
-- Granular 8-step execution log per pipeline run.
-- ---------------------------------------------------------------------------

CREATE TABLE pipeline_steps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id     UUID        NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    -- Step identity
    step_number     SMALLINT    NOT NULL,       -- 1-8
    step_name       TEXT        NOT NULL,       -- 'ingest','extract','ner', etc.
    -- Timing
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    -- Status
    status          pipeline_status,
    -- Metrics
    items_in        INTEGER,
    items_out       INTEGER,
    items_failed    INTEGER,
    -- Detail
    config          JSONB,                      -- step config at time of run
    metrics         JSONB,                      -- arbitrary step metrics
    error_message   TEXT,
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipeline_steps_pipeline ON pipeline_steps (pipeline_id);
CREATE INDEX idx_pipeline_steps_step     ON pipeline_steps (pipeline_id, step_number);


-- ---------------------------------------------------------------------------
-- rules
-- Deterministic rule registry. 141 rules, each with full metadata.
-- ---------------------------------------------------------------------------

CREATE TABLE rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id         TEXT        NOT NULL UNIQUE,  -- 'R001', 'R002', etc.
    name            TEXT        NOT NULL,
    description     TEXT,
    -- Targeting
    field_name      TEXT        NOT NULL,
    field_category  field_category,
    -- Rule definition
    rule_type       TEXT        NOT NULL,   -- 'regex','numeric','logical','derived',
                                            --  'covenant','lookup','unit','date'
    rule_logic      TEXT,                   -- human-readable: "ebitda < revenue"
    rule_pattern    TEXT,                   -- regex or formula string
    -- Confidence when rule passes
    base_confidence NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    -- Metadata
    is_active       BOOLEAN     DEFAULT TRUE,
    priority        INTEGER     DEFAULT 100, -- lower = runs first
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_field_name ON rules (field_name);
CREATE INDEX idx_rules_active     ON rules (is_active) WHERE is_active = TRUE;

-- Seed the 9 core rules we've built so far
INSERT INTO rules (rule_id, name, description, field_name, field_category, rule_type, rule_logic, rule_pattern, base_confidence) VALUES
('R001', 'EIN Format',          'Validates XX-XXXXXXX format',                      'ein_tax_id',             'identity',    'regex',   NULL,                            '^\\d{2}-\\d{7}$',       1.000),
('R002', 'Revenue Normalize',   'Parses $M, $B, raw number formats to float',       'revenue_ttm',            'financial',   'numeric', 'parseable to float',            'numeric_currency',      0.950),
('R003', 'EBITDA Sanity',       'EBITDA must be less than revenue',                 'ebitda_ttm',             'financial',   'logical', 'ebitda < revenue',              NULL,                    0.980),
('R004', 'Leverage Calc',       'Derives leverage from total_debt / ebitda_ttm',   'leverage_ratio',         'derived',     'derived', 'total_debt / ebitda_ttm',       NULL,                    1.000),
('R005', 'DSCR Threshold',      'DSCR must be >= 1.25x covenant floor',             'dscr',                   'derived',     'covenant','dscr >= 1.25',                  NULL,                    0.920),
('R006', 'Jurisdiction Lookup', 'Validates against known state/territory codes',    'jurisdiction',           'identity',    'lookup',  'state_code_map',                NULL,                    0.990),
('R007', 'Maturity Date Parse', 'Accepts multiple date formats, validates future',  'maturity_date',          'deal',        'date',    'future date',                   'date_formats',          0.970),
('R008', 'Spread bps Norm',     'Normalises SOFR+525, 5.25%, 525bps → integer bps','pricing_spread',         'deal',        'unit',    'convert % → bps',               NULL,                    1.000),
('R009', 'FV / Cost Ratio',     'FV/cost must be 0.50-1.10 for performing loans',   'fair_value_usd',         'credit',      'logical', '0.50 <= fv/cost <= 1.10',       NULL,                    0.900);


-- ---------------------------------------------------------------------------
-- field_values   ← THE core table
-- Every extracted field value with full provenance chain.
-- This is what makes Galleon defensible — not the values, the provenance.
-- ---------------------------------------------------------------------------

CREATE TABLE field_values (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pipeline_id         UUID        REFERENCES pipelines(id),
    document_id         UUID        REFERENCES documents(id),
    -- Field identity
    field_name          TEXT        NOT NULL,
    field_category      field_category NOT NULL,
    -- The actual value (stored as text, typed in application layer)
    raw_value           TEXT,                   -- exactly as extracted from doc
    normalized_value    TEXT,                   -- after unit/format normalization
    numeric_value       NUMERIC(20,6),          -- if numeric field, for sorting/math
    currency            CHAR(3),                -- USD, EUR, etc.
    unit                TEXT,                   -- 'bps', 'USD_millions', '%', 'x'
    -- Provenance
    source_type         source_type NOT NULL,
    source_document     TEXT,                   -- human-readable file name
    source_page         INTEGER,                -- page number in document
    source_location     TEXT,                   -- 'P&L·C14', 'Page 12 §2.1', etc.
    source_snippet      TEXT,                   -- raw text surrounding the value
    -- Extraction metadata
    extraction_method   extraction_method NOT NULL,
    extractor_version   TEXT,
    -- Confidence
    confidence_score    NUMERIC(4,3) NOT NULL,  -- 0.000 – 1.000
    rule_id             TEXT REFERENCES rules(rule_id),  -- rule that validated/derived this
    -- Status
    status              value_status DEFAULT 'extracted',
    is_current          BOOLEAN DEFAULT TRUE,   -- FALSE = superseded by newer extraction
    is_ground_truth     BOOLEAN DEFAULT FALSE,  -- TRUE = from EDGAR/audited source
    -- Period context
    period_end          DATE,                   -- what reporting period this covers
    as_of_date          DATE,                   -- when the source doc was dated
    -- Analyst override
    overridden_by       UUID,                   -- user id
    override_reason     TEXT,
    override_at         TIMESTAMPTZ,
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Primary access patterns
CREATE INDEX idx_fv_company_field     ON field_values (company_id, field_name) WHERE is_current = TRUE;
CREATE INDEX idx_fv_company_all       ON field_values (company_id);
CREATE INDEX idx_fv_pipeline          ON field_values (pipeline_id);
CREATE INDEX idx_fv_document          ON field_values (document_id);
CREATE INDEX idx_fv_status            ON field_values (status);
CREATE INDEX idx_fv_current           ON field_values (is_current) WHERE is_current = TRUE;
CREATE INDEX idx_fv_source_type       ON field_values (source_type);
CREATE INDEX idx_fv_confidence        ON field_values (confidence_score DESC);
CREATE INDEX idx_fv_ground_truth      ON field_values (is_ground_truth) WHERE is_ground_truth = TRUE;
-- Composite: "give me all current financial fields for company X" — most common query
CREATE INDEX idx_fv_company_category  ON field_values (company_id, field_category) WHERE is_current = TRUE;
-- Partial index for conflicted values needing review
CREATE INDEX idx_fv_conflicted        ON field_values (company_id, field_name) WHERE status = 'conflicted';


-- ---------------------------------------------------------------------------
-- field_conflicts
-- When two or more sources report different values for the same field.
-- The dispute record — separate from the resolution.
-- ---------------------------------------------------------------------------

CREATE TABLE field_conflicts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pipeline_id     UUID        REFERENCES pipelines(id),
    -- What's in conflict
    field_name      TEXT        NOT NULL,
    field_category  field_category NOT NULL,
    -- The competing values (FK to field_values)
    -- Array approach: supports 2-N candidates
    candidate_ids   UUID[]      NOT NULL,       -- array of field_value.id
    -- Conflict characterization
    value_delta     TEXT,                       -- human-readable: "$2.6M" or "1.8%"
    value_delta_pct NUMERIC(6,3),              -- percentage difference
    conflict_reason TEXT,                       -- 'different_cutoff_date', 'rounding', etc.
    -- Status
    status          conflict_status DEFAULT 'open',
    -- Timestamps
    detected_at     TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conflicts_company   ON field_conflicts (company_id);
CREATE INDEX idx_conflicts_pipeline  ON field_conflicts (pipeline_id);
CREATE INDEX idx_conflicts_status    ON field_conflicts (status);
CREATE INDEX idx_conflicts_field     ON field_conflicts (company_id, field_name);


-- ---------------------------------------------------------------------------
-- field_resolutions
-- How each conflict was decided. One row per resolved conflict.
-- ---------------------------------------------------------------------------

CREATE TABLE field_resolutions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conflict_id         UUID        NOT NULL REFERENCES field_conflicts(id) ON DELETE CASCADE,
    -- The winning value
    winner_value_id     UUID        NOT NULL REFERENCES field_values(id),
    -- Resolution decision
    method              resolution_method NOT NULL,
    -- Priority stack detail (if method = priority_stack)
    winning_source_type source_type,
    winning_priority    INTEGER,                -- rank in priority stack (1=highest)
    -- AI explanation (generated by LLM)
    ai_explanation      TEXT,                   -- "The $2.6M delta likely reflects..."
    -- Human review
    reviewed_by         UUID,                   -- user id if human reviewed
    review_notes        TEXT,
    -- Timestamps
    resolved_at         TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resolutions_conflict ON field_resolutions (conflict_id);
CREATE INDEX idx_resolutions_winner   ON field_resolutions (winner_value_id);


-- ---------------------------------------------------------------------------
-- rule_executions
-- Audit log of every rule run. Required for debugging extraction failures.
-- ---------------------------------------------------------------------------

CREATE TABLE rule_executions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id     UUID        REFERENCES pipelines(id),
    field_value_id  UUID        REFERENCES field_values(id) ON DELETE CASCADE,
    rule_id         TEXT        NOT NULL REFERENCES rules(rule_id),
    -- Result
    passed          BOOLEAN     NOT NULL,
    confidence_out  NUMERIC(4,3),               -- confidence after rule application
    note            TEXT,                       -- rule-specific message
    -- Input snapshot
    input_value     TEXT,                       -- value as seen by rule
    -- Timing
    executed_at     TIMESTAMPTZ DEFAULT NOW(),
    duration_ms     INTEGER
);

CREATE INDEX idx_rule_exec_pipeline    ON rule_executions (pipeline_id);
CREATE INDEX idx_rule_exec_field_value ON rule_executions (field_value_id);
CREATE INDEX idx_rule_exec_rule        ON rule_executions (rule_id);
CREATE INDEX idx_rule_exec_passed      ON rule_executions (passed);


-- ---------------------------------------------------------------------------
-- credit_profiles   (materialized summary — rebuilt after each pipeline run)
-- Denormalized view of a company's current best-value for every field.
-- This is what the UI queries — fast, flat, always-current.
-- ---------------------------------------------------------------------------

CREATE TABLE credit_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID        NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    -- Identity fields (current best values)
    company_name        TEXT,
    legal_entity        TEXT,
    ein_tax_id          TEXT,
    jurisdiction        TEXT,
    naics_code          TEXT,
    founding_year       SMALLINT,
    -- Deal fields
    facility_type       TEXT,
    commitment_size     NUMERIC(20,2),
    drawn_amount        NUMERIC(20,2),
    pricing_spread      TEXT,                   -- kept as text: "SOFR + 525 bps"
    pricing_spread_bps  INTEGER,                -- normalized integer for math
    floor_bps           INTEGER,
    maturity_date       DATE,
    security_type       TEXT,
    pik_rate_bps        INTEGER,
    covenant_package    TEXT,
    -- Credit fields (BDC-reported ground truth when available)
    fair_value_usd      NUMERIC(20,2),
    cost_basis_usd      NUMERIC(20,2),
    unrealized_gl       NUMERIC(20,2),
    pct_net_assets      NUMERIC(6,3),
    non_accrual         BOOLEAN,
    -- Financial fields (from raw docs — Galleon's value add)
    revenue_ttm         NUMERIC(20,2),
    ebitda_ttm          NUMERIC(20,2),
    gross_margin        NUMERIC(6,3),
    net_income          NUMERIC(20,2),
    total_debt          NUMERIC(20,2),
    total_equity        NUMERIC(20,2),
    cash_position       NUMERIC(20,2),
    capex               NUMERIC(20,2),
    free_cash_flow      NUMERIC(20,2),
    -- Derived fields (calculated by rule engine)
    leverage_ratio      NUMERIC(6,2),
    interest_coverage   NUMERIC(6,2),
    dscr                NUMERIC(6,2),
    net_debt_ebitda     NUMERIC(6,2),
    ebitda_margin       NUMERIC(6,3),
    -- Operational fields
    headcount           INTEGER,
    -- Profile health metrics
    fields_total        INTEGER DEFAULT 0,
    fields_extracted    INTEGER DEFAULT 0,
    fields_validated    INTEGER DEFAULT 0,
    completeness_pct    NUMERIC(5,2),
    avg_confidence      NUMERIC(4,3),
    open_conflicts      INTEGER DEFAULT 0,
    last_pipeline_id    UUID REFERENCES pipelines(id),
    last_pipeline_at    TIMESTAMPTZ,
    -- Period context
    period_end          DATE,
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_company     ON credit_profiles (company_id);
CREATE INDEX idx_profiles_leverage    ON credit_profiles (leverage_ratio) WHERE leverage_ratio IS NOT NULL;
CREATE INDEX idx_profiles_completeness ON credit_profiles (completeness_pct DESC);
CREATE INDEX idx_profiles_updated     ON credit_profiles (updated_at DESC);


-- ---------------------------------------------------------------------------
-- ground_truth_records   (ARCC EDGAR benchmark)
-- One row per ARCC portfolio company — the answer key.
-- ---------------------------------------------------------------------------

CREATE TABLE ground_truth_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID        REFERENCES companies(id),   -- NULL until entity matched
    -- BDC source
    source_bdc          TEXT        NOT NULL DEFAULT 'ARCC',
    edgar_cik           TEXT        NOT NULL,
    galleon_gt_id       TEXT        NOT NULL UNIQUE,            -- 'GT-ARCC-0001'
    filing_date         DATE,
    -- Company identity from filing
    reported_name       TEXT        NOT NULL,
    sector              TEXT,
    -- BDC-reported deal terms (the answer key for deal fields)
    facility_type       TEXT,
    security_type       TEXT,
    pricing_spread_raw  TEXT,                   -- 'SOFR + 525 bps'
    pricing_spread_bps  INTEGER,
    floor_bps           INTEGER,
    maturity_date       DATE,
    fair_value_usd      NUMERIC(20,2),
    cost_basis_usd      NUMERIC(20,2),
    pct_net_assets      NUMERIC(6,3),
    pik_rate_raw        TEXT,
    non_accrual         BOOLEAN DEFAULT FALSE,
    -- Entity resolution result
    entity_matched      BOOLEAN DEFAULT FALSE,
    entity_match_conf   NUMERIC(4,3),
    entity_match_method TEXT,
    -- Validation status
    extraction_status   TEXT DEFAULT 'pending',
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gt_records_company  ON ground_truth_records (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_gt_records_bdc      ON ground_truth_records (source_bdc);
CREATE INDEX idx_gt_records_name     ON ground_truth_records USING GIN (reported_name gin_trgm_ops);


-- ---------------------------------------------------------------------------
-- ground_truth_comparisons
-- After extraction runs, score each field against the GT answer key.
-- ---------------------------------------------------------------------------

CREATE TABLE ground_truth_comparisons (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gt_record_id        UUID        NOT NULL REFERENCES ground_truth_records(id) ON DELETE CASCADE,
    pipeline_id         UUID        REFERENCES pipelines(id),
    -- Field being compared
    field_name          TEXT        NOT NULL,
    -- Ground truth value
    gt_value            TEXT,
    gt_value_numeric    NUMERIC(20,6),
    -- Galleon extracted value
    extracted_value     TEXT,
    extracted_numeric   NUMERIC(20,6),
    extracted_conf      NUMERIC(4,3),
    -- Comparison result
    match_status        gt_match_status DEFAULT 'pending',
    delta_pct           NUMERIC(8,4),           -- % difference if numeric
    tolerance_pct       NUMERIC(6,3) DEFAULT 5.0, -- acceptable tolerance
    -- Notes
    mismatch_reason     TEXT,
    -- Timestamps
    compared_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gt_comp_record   ON ground_truth_comparisons (gt_record_id);
CREATE INDEX idx_gt_comp_pipeline ON ground_truth_comparisons (pipeline_id);
CREATE INDEX idx_gt_comp_field    ON ground_truth_comparisons (field_name);
CREATE INDEX idx_gt_comp_status   ON ground_truth_comparisons (match_status);


-- ---------------------------------------------------------------------------
-- users
-- Analysts who review and override field values.
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT        NOT NULL UNIQUE,
    full_name       TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'analyst',  -- 'analyst','admin','viewer'
    is_active       BOOLEAN     DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- audit_log   (append-only, never updated or deleted)
-- Immutable record of every data change. Required for credit audit trails.
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
    id              BIGSERIAL   PRIMARY KEY,    -- sequential for ordering
    -- Who
    user_id         UUID        REFERENCES users(id),
    -- What
    table_name      TEXT        NOT NULL,
    record_id       UUID        NOT NULL,
    action          TEXT        NOT NULL,       -- 'INSERT','UPDATE','DELETE','OVERRIDE'
    -- Change detail
    field_name      TEXT,                       -- which field changed (if UPDATE)
    old_value       TEXT,
    new_value       TEXT,
    change_reason   TEXT,
    -- Context
    pipeline_id     UUID        REFERENCES pipelines(id),
    session_id      TEXT,
    ip_address      INET,
    -- Timestamp (immutable)
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Audit log is append-only — no UPDATE or DELETE allowed
CREATE INDEX idx_audit_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_user         ON audit_log (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_created      ON audit_log (created_at DESC);
CREATE INDEX idx_audit_pipeline     ON audit_log (pipeline_id) WHERE pipeline_id IS NOT NULL;

-- Revoke UPDATE/DELETE on audit_log for all roles (enforced at DB level)
-- In production: also configure row-level security


-- =============================================================================
-- VIEWS
-- =============================================================================

-- Current best field values per company (UI primary query target)
CREATE VIEW v_company_fields AS
SELECT
    fv.company_id,
    c.canonical_name,
    fv.field_name,
    fv.field_category,
    fv.normalized_value,
    fv.numeric_value,
    fv.unit,
    fv.confidence_score,
    fv.source_type,
    fv.source_document,
    fv.source_page,
    fv.source_location,
    fv.extraction_method,
    fv.rule_id,
    fv.status,
    fv.period_end,
    fv.created_at
FROM field_values fv
JOIN companies c ON c.id = fv.company_id
WHERE fv.is_current = TRUE
ORDER BY fv.company_id, fv.field_category, fv.field_name;

-- Open conflicts needing resolution
CREATE VIEW v_open_conflicts AS
SELECT
    fc.id          AS conflict_id,
    c.canonical_name,
    fc.field_name,
    fc.field_category,
    fc.value_delta,
    fc.value_delta_pct,
    fc.conflict_reason,
    fc.detected_at,
    array_length(fc.candidate_ids, 1) AS source_count
FROM field_conflicts fc
JOIN companies c ON c.id = fc.company_id
WHERE fc.status = 'open'
ORDER BY fc.detected_at DESC;

-- Benchmark summary per GT record
CREATE VIEW v_benchmark_summary AS
SELECT
    gt.galleon_gt_id,
    gt.reported_name,
    gt.sector,
    COUNT(*)                                        AS fields_compared,
    COUNT(*) FILTER (WHERE gtc.match_status='match')    AS fields_matched,
    COUNT(*) FILTER (WHERE gtc.match_status='mismatch') AS fields_mismatched,
    COUNT(*) FILTER (WHERE gtc.match_status='missing')  AS fields_missing,
    ROUND(
        COUNT(*) FILTER (WHERE gtc.match_status='match')::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE gtc.match_status != 'pending'), 0) * 100,
        1
    ) AS accuracy_pct,
    ROUND(
        COUNT(*) FILTER (WHERE gtc.match_status != 'missing' AND gtc.match_status != 'pending')::NUMERIC /
        NULLIF(COUNT(*), 0) * 100,
        1
    ) AS completeness_pct
FROM ground_truth_records gt
LEFT JOIN ground_truth_comparisons gtc ON gtc.gt_record_id = gt.id
GROUP BY gt.id, gt.galleon_gt_id, gt.reported_name, gt.sector;

-- Rule pass rates (tells you which rules are failing most)
CREATE VIEW v_rule_performance AS
SELECT
    r.rule_id,
    r.name,
    r.field_name,
    r.rule_type,
    COUNT(*)                                  AS total_executions,
    COUNT(*) FILTER (WHERE re.passed = TRUE)  AS passed,
    COUNT(*) FILTER (WHERE re.passed = FALSE) AS failed,
    ROUND(AVG(re.confidence_out), 3)          AS avg_confidence_out,
    ROUND(COUNT(*) FILTER (WHERE re.passed = TRUE)::NUMERIC / NULLIF(COUNT(*),0) * 100, 1) AS pass_rate_pct
FROM rules r
LEFT JOIN rule_executions re ON re.rule_id = r.rule_id
WHERE r.is_active = TRUE
GROUP BY r.rule_id, r.name, r.field_name, r.rule_type
ORDER BY pass_rate_pct ASC;


-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Resolve a conflict: mark winner, update field_values, close conflict
CREATE OR REPLACE FUNCTION resolve_conflict(
    p_conflict_id       UUID,
    p_winner_value_id   UUID,
    p_method            resolution_method,
    p_winning_source    source_type,
    p_winning_priority  INTEGER,
    p_ai_explanation    TEXT DEFAULT NULL,
    p_reviewed_by       UUID DEFAULT NULL,
    p_review_notes      TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_resolution_id UUID;
    v_company_id    UUID;
    v_field_name    TEXT;
BEGIN
    -- Get conflict context
    SELECT company_id, field_name
    INTO v_company_id, v_field_name
    FROM field_conflicts
    WHERE id = p_conflict_id;

    -- Insert resolution record
    INSERT INTO field_resolutions (
        conflict_id, winner_value_id, method,
        winning_source_type, winning_priority,
        ai_explanation, reviewed_by, review_notes
    ) VALUES (
        p_conflict_id, p_winner_value_id, p_method,
        p_winning_source, p_winning_priority,
        p_ai_explanation, p_reviewed_by, p_review_notes
    ) RETURNING id INTO v_resolution_id;

    -- Mark all other candidates as superseded
    UPDATE field_values
    SET is_current = FALSE, status = 'rejected', updated_at = NOW()
    WHERE id IN (
        SELECT UNNEST(candidate_ids)
        FROM field_conflicts
        WHERE id = p_conflict_id
    )
    AND id != p_winner_value_id;

    -- Mark winner as resolved and current
    UPDATE field_values
    SET status = 'resolved', is_current = TRUE, updated_at = NOW()
    WHERE id = p_winner_value_id;

    -- Close the conflict
    UPDATE field_conflicts
    SET status = 'resolved', resolved_at = NOW()
    WHERE id = p_conflict_id;

    RETURN v_resolution_id;
END;
$$ LANGUAGE plpgsql;


-- Rebuild credit_profiles for a company after pipeline completes
CREATE OR REPLACE FUNCTION rebuild_credit_profile(p_company_id UUID, p_pipeline_id UUID)
RETURNS VOID AS $$
DECLARE
    v_fields_total     INTEGER;
    v_fields_extracted INTEGER;
    v_fields_validated INTEGER;
    v_completeness     NUMERIC(5,2);
    v_avg_conf         NUMERIC(4,3);
    v_open_conflicts   INTEGER;
BEGIN
    -- Count field stats
    SELECT
        COUNT(*)                                                  AS total,
        COUNT(*) FILTER (WHERE status IN ('extracted','validated','resolved')) AS extracted,
        COUNT(*) FILTER (WHERE status = 'validated')              AS validated,
        AVG(confidence_score)                                     AS avg_conf
    INTO v_fields_total, v_fields_extracted, v_fields_validated, v_avg_conf
    FROM field_values
    WHERE company_id = p_company_id AND is_current = TRUE;

    SELECT COUNT(*) INTO v_open_conflicts
    FROM field_conflicts
    WHERE company_id = p_company_id AND status = 'open';

    v_completeness := CASE WHEN v_fields_total > 0
                     THEN ROUND(v_fields_extracted::NUMERIC / v_fields_total * 100, 2)
                     ELSE 0 END;

    -- Upsert the denormalized profile
    INSERT INTO credit_profiles (
        company_id,
        -- identity
        company_name, legal_entity, ein_tax_id, jurisdiction, naics_code, founding_year,
        -- deal
        facility_type, commitment_size, drawn_amount, pricing_spread, pricing_spread_bps,
        floor_bps, maturity_date, security_type, pik_rate_bps, covenant_package,
        -- credit
        fair_value_usd, cost_basis_usd, unrealized_gl, pct_net_assets, non_accrual,
        -- financial
        revenue_ttm, ebitda_ttm, gross_margin, net_income, total_debt,
        total_equity, cash_position, capex, free_cash_flow,
        -- derived
        leverage_ratio, interest_coverage, dscr, net_debt_ebitda, ebitda_margin,
        -- operational
        headcount,
        -- metrics
        fields_total, fields_extracted, fields_validated, completeness_pct,
        avg_confidence, open_conflicts, last_pipeline_id, last_pipeline_at, updated_at
    )
    SELECT
        p_company_id,
        -- identity
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='company_name'),
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='legal_entity'),
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='ein_tax_id'),
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='jurisdiction'),
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='naics_code'),
        MAX(fv.numeric_value::INTEGER) FILTER (WHERE fv.field_name='founding_year'),
        -- deal
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='facility_type'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='commitment_size'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='drawn_amount'),
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='pricing_spread'),
        MAX(fv.numeric_value::INTEGER) FILTER (WHERE fv.field_name='pricing_spread_bps'),
        MAX(fv.numeric_value::INTEGER) FILTER (WHERE fv.field_name='floor_bps'),
        MAX(fv.normalized_value::DATE) FILTER (WHERE fv.field_name='maturity_date'),
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='security_type'),
        MAX(fv.numeric_value::INTEGER) FILTER (WHERE fv.field_name='pik_rate_bps'),
        MAX(fv.normalized_value) FILTER (WHERE fv.field_name='covenant_package'),
        -- credit
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='fair_value_usd'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='cost_basis_usd'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='unrealized_gl'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='pct_net_assets'),
        BOOL_OR(fv.normalized_value::BOOLEAN) FILTER (WHERE fv.field_name='non_accrual'),
        -- financial
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='revenue_ttm'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='ebitda_ttm'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='gross_margin'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='net_income'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='total_debt'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='total_equity'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='cash_position'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='capex'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='free_cash_flow'),
        -- derived
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='leverage_ratio'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='interest_coverage'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='dscr'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='net_debt_ebitda'),
        MAX(fv.numeric_value)    FILTER (WHERE fv.field_name='ebitda_margin'),
        -- operational
        MAX(fv.numeric_value::INTEGER) FILTER (WHERE fv.field_name='headcount'),
        -- metrics
        v_fields_total, v_fields_extracted, v_fields_validated,
        v_completeness, v_avg_conf, v_open_conflicts,
        p_pipeline_id, NOW(), NOW()
    FROM field_values fv
    WHERE fv.company_id = p_company_id AND fv.is_current = TRUE
    ON CONFLICT (company_id) DO UPDATE SET
        company_name       = EXCLUDED.company_name,
        legal_entity       = EXCLUDED.legal_entity,
        ein_tax_id         = EXCLUDED.ein_tax_id,
        jurisdiction       = EXCLUDED.jurisdiction,
        naics_code         = EXCLUDED.naics_code,
        founding_year      = EXCLUDED.founding_year,
        facility_type      = EXCLUDED.facility_type,
        commitment_size    = EXCLUDED.commitment_size,
        drawn_amount       = EXCLUDED.drawn_amount,
        pricing_spread     = EXCLUDED.pricing_spread,
        pricing_spread_bps = EXCLUDED.pricing_spread_bps,
        floor_bps          = EXCLUDED.floor_bps,
        maturity_date      = EXCLUDED.maturity_date,
        security_type      = EXCLUDED.security_type,
        pik_rate_bps       = EXCLUDED.pik_rate_bps,
        covenant_package   = EXCLUDED.covenant_package,
        fair_value_usd     = EXCLUDED.fair_value_usd,
        cost_basis_usd     = EXCLUDED.cost_basis_usd,
        unrealized_gl      = EXCLUDED.unrealized_gl,
        pct_net_assets     = EXCLUDED.pct_net_assets,
        non_accrual        = EXCLUDED.non_accrual,
        revenue_ttm        = EXCLUDED.revenue_ttm,
        ebitda_ttm         = EXCLUDED.ebitda_ttm,
        gross_margin       = EXCLUDED.gross_margin,
        net_income         = EXCLUDED.net_income,
        total_debt         = EXCLUDED.total_debt,
        total_equity       = EXCLUDED.total_equity,
        cash_position      = EXCLUDED.cash_position,
        capex              = EXCLUDED.capex,
        free_cash_flow     = EXCLUDED.free_cash_flow,
        leverage_ratio     = EXCLUDED.leverage_ratio,
        interest_coverage  = EXCLUDED.interest_coverage,
        dscr               = EXCLUDED.dscr,
        net_debt_ebitda    = EXCLUDED.net_debt_ebitda,
        ebitda_margin      = EXCLUDED.ebitda_margin,
        headcount          = EXCLUDED.headcount,
        fields_total       = EXCLUDED.fields_total,
        fields_extracted   = EXCLUDED.fields_extracted,
        fields_validated   = EXCLUDED.fields_validated,
        completeness_pct   = EXCLUDED.completeness_pct,
        avg_confidence     = EXCLUDED.avg_confidence,
        open_conflicts     = EXCLUDED.open_conflicts,
        last_pipeline_id   = EXCLUDED.last_pipeline_id,
        last_pipeline_at   = EXCLUDED.last_pipeline_at,
        updated_at         = NOW();
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- SEED DATA — ARCC Ground Truth Records (from edgar_bdc.py)
-- =============================================================================

INSERT INTO ground_truth_records (
    galleon_gt_id, source_bdc, edgar_cik, reported_name, sector,
    facility_type, security_type, pricing_spread_raw, pricing_spread_bps, floor_bps,
    maturity_date, fair_value_usd, cost_basis_usd, pct_net_assets, non_accrual
) VALUES
('GT-ARCC-0001','ARCC','0001287750','Clearview Capital Group LLC',       'Software',               'First Lien Senior Secured','Floating Rate Loan','SOFR + 525 bps',525,100,'2029-03-15',142300000,143000000,2.14,FALSE),
('GT-ARCC-0002','ARCC','0001287750','Apex Industrial Services Inc.',     'Business Services',      'First Lien Senior Secured','Floating Rate Loan','SOFR + 575 bps',575,75, '2028-09-30',98500000, 100000000,1.48,FALSE),
('GT-ARCC-0003','ARCC','0001287750','Meridian Healthcare Holdings LLC',  'Healthcare Services',    'Unitranche',               'Floating Rate Loan','SOFR + 650 bps',650,100,'2030-06-30',215000000,220000000,3.23,FALSE),
('GT-ARCC-0004','ARCC','0001287750','Summit Logistics Partners LP',      'Transportation',         'Second Lien Senior Secured','Floating Rate Loan','SOFR + 875 bps',875,150,'2027-12-31',67200000, 75000000, 1.01,TRUE ),
('GT-ARCC-0005','ARCC','0001287750','Vantage Software Solutions Inc.',   'Technology',             'First Lien Senior Secured','Floating Rate Loan','SOFR + 500 bps',500,75, '2030-03-31',334000000,335000000,5.02,FALSE),
('GT-ARCC-0006','ARCC','0001287750','Bluewater Environmental Group LLC', 'Environmental Services', 'First Lien Senior Secured','Floating Rate Loan','SOFR + 600 bps',600,100,'2029-09-30',88100000, 90000000, 1.32,FALSE),
('GT-ARCC-0007','ARCC','0001287750','Granite Construction Holdings Inc.','Construction',           'Unitranche',               'Floating Rate Loan','SOFR + 700 bps',700,125,'2028-12-31',121500000,125000000,1.83,FALSE),
('GT-ARCC-0008','ARCC','0001287750','Cascade Aerospace Components LLC',  'Aerospace & Defense',   'First Lien Senior Secured','Floating Rate Loan','SOFR + 550 bps',550,100,'2030-06-30',176000000,177500000,2.65,FALSE);


-- =============================================================================
-- ROW-LEVEL SECURITY (skeleton — activate in production)
-- =============================================================================

-- ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE field_values    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE credit_profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY analyst_access ON field_values USING (TRUE);  -- refine per fund


-- =============================================================================
-- COMMENTS (documentation in the DB itself)
-- =============================================================================

COMMENT ON TABLE companies              IS 'Core borrower entities. One row per unique company after deduplication.';
COMMENT ON TABLE documents              IS 'Every ingested file. Source of truth for storage paths and processing status.';
COMMENT ON TABLE field_values           IS 'THE core table. Every extracted value with full provenance chain. Never delete — mark is_current=FALSE.';
COMMENT ON TABLE field_conflicts        IS 'Dispute record when two sources disagree on a field. Linked to resolutions.';
COMMENT ON TABLE field_resolutions      IS 'How each conflict was decided. Priority stack method is deterministic.';
COMMENT ON TABLE rules                  IS 'Deterministic rule registry. 141 validators. Every rule has a rule_id traceable to field_values.';
COMMENT ON TABLE rule_executions        IS 'Append-only audit of every rule run. Required for debugging extraction failures.';
COMMENT ON TABLE credit_profiles        IS 'Denormalized current-best-value snapshot. Rebuilt by rebuild_credit_profile() after each pipeline.';
COMMENT ON TABLE ground_truth_records   IS 'ARCC EDGAR filing data. The answer key for benchmarking extraction accuracy.';
COMMENT ON TABLE ground_truth_comparisons IS 'Field-level accuracy scoring after extraction. Drives the benchmark metric.';
COMMENT ON TABLE audit_log              IS 'Immutable append-only audit trail. Never update or delete rows.';
COMMENT ON COLUMN field_values.is_current IS 'Only one row per (company_id, field_name) should have is_current=TRUE at any time. Enforced by application layer.';
COMMENT ON COLUMN field_values.source_snippet IS 'Raw text surrounding the extracted value. Required for human review of extractions.';
COMMENT ON FUNCTION resolve_conflict IS 'Atomic resolution: inserts resolution record, marks losers inactive, closes conflict. Always use this, never raw SQL.';
COMMENT ON FUNCTION rebuild_credit_profile IS 'Rebuilds the denormalized credit_profiles row for a company. Called at end of every pipeline run.';
