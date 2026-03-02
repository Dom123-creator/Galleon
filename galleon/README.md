# Galleon — Private Credit Data Extraction Platform

## What This Is
Galleon extracts borrower-level financial intelligence from public documents (Chapter 11 first-day affidavits, court filings, regulatory actions) and cross-references it against BDC schedule of investments data from SEC EDGAR.

**The problem it solves:** BDC filings report 7 fields per portfolio company (name, sector, instrument type, rate, maturity, cost, fair value). Galleon extracts 35+ fields from public source documents — revenue, debt structure, lenders, collateral, guarantors, amendment history, geographic footprint — that exist nowhere else in structured form.

## Architecture

```
SEC EDGAR (BDC filings)          Court filings / PACER
        │                                  │
        ▼                                  ▼
edgar_bdc.py                      pdf_extractor.py
(ground truth engine)             (28-field extractor)
        │                                  │
        └──────────────┬───────────────────┘
                       ▼
              PostgreSQL (schema.sql)
              14 tables, field-level provenance
                       │
                       ▼
              galleon_v2.jsx (React UI)
              6 modules: Dashboard, Pipeline,
              Rules, Profiles, Lineage, Validation Lab
```

## Files

### `/pipeline/edgar_bdc.py` — 871 lines
EDGAR BDC Ground Truth Engine. Pulls ARCC schedule of investments, normalizes into Galleon canonical schema, produces benchmark dataset. Includes:
- GalleonRuleEngine (141 deterministic validators)
- ConflictResolver (priority stack)
- EntityResolver (cross-source deduplication)

**Run:**
```bash
python pipeline/edgar_bdc.py            # offline demo
python pipeline/edgar_bdc.py --live     # hit real SEC EDGAR API
```

### `/pipeline/pdf_extractor.py` — 846 lines
8-stage PDF extraction pipeline. Tested against Maurice Sporting Goods Ch.11 First-Day Affidavit (Case 17-12481).

**Stages:**
1. DocumentLoader — pdfplumber raw text
2. SectionParser — Part/Section/Paragraph hierarchy with char offsets
3. QualifierScanner — detects "approximately", "in excess of" → adjusts confidence
4. AffidavitExtractor — 28 field-specific extractors
5. ConflictDetector — groups duplicate extractions, flags mismatches
6. AutoResolver — precision_over_approximate | max_confidence | priority_stack
7. DerivedFieldCalc — drawn_utilization, debt_to_revenue, amendment_signal
8. Formatter + Validator

**Confidence model:**
- 1.00 = exact value, authoritative section, no qualifier
- 0.97 = exact dollar with cents
- 0.92 = exact round dollar, no qualifier
- 0.85 = approximate round number
- 0.72 = variable/imprecise rate
- 0.60 = partial data

**Run:**
```bash
pip install pdfplumber
python pipeline/pdf_extractor.py path/to/affidavit.pdf
```

### `/db/schema.sql` — 1,061 lines
PostgreSQL 15+ schema. 14 tables, 54 indexes, 4 views, 3 functions, 10 enums.

**Design principle:** Every field value is a record with full provenance. Not "revenue = $259M" but "revenue = $259M, sourced from page 8 ¶17, extracted by rule R002, confidence 0.97, winning over CIM PDF's $257M via priority stack."

**Key tables:**
- `companies` — core entity, one row per borrower
- `documents` — ingested source files
- `field_values` — THE core table, every extracted field with provenance
- `field_conflicts` — when sources disagree
- `field_resolutions` — how each conflict was resolved
- `rules` — 141 deterministic validator registry

**Run:**
```bash
psql -U postgres -d galleon -f db/schema.sql
```

### `/galleon_v2.jsx` — 1,070 lines
React UI. 6 modules:
- **Dashboard** — portfolio overview, validation metrics
- **Pipeline** — 8-step processing view
- **Rules** — 141 validator management
- **Profiles** — normalized company cards
- **Lineage** — DAG provenance visualization
- **Validation Lab** — benchmark runner (Overview, Company Detail, Field Accuracy, Conflict Analysis)

### `/data/ground_truth_arcc.json`
8 ARCC seed portfolio companies. Each has BDC-reported fields (ground truth) + Galleon target fields (extraction pending). Used as benchmark answer keys.

**Stats:**
- 8 companies across 8 sectors
- 88 ground truth fields total
- 120 Galleon target fields
- BDC coverage: 42.3% of schema (7 fields)
- Galleon gap: 57.7% (the fields Galleon fills in)

### `/data/maurice_extraction_v1.json`
Live extraction output from Maurice Sporting Goods First-Day Affidavit (Case 17-12481, Delaware Bankruptcy Court, filed 11/20/2017).

**Results:**
- 23 fields extracted
- 0.893 average confidence
- 1 conflict detected and auto-resolved (drawn_amount: $45M approximate vs $45,156,510.66 exact → exact wins)
- 7/7 validation rules passing

**Sample extracted fields:**
| Field | Value | Confidence |
|---|---|---|
| revenue_ttm | $259,093,158.00 | 0.97 |
| drawn_amount | $45,156,510.66 | 0.97 |
| commitment_size | $60,000,000.00 | 0.92 |
| trade_payables | $50,000,000.00 | 0.85 |
| lenders | BMO Harris, CIBC | 0.88 |
| pricing_spread | ~6% variable | 0.72 |
| petition_date | 2017-11-20 | 1.00 |
| amendment_count | 13 (Thirteenth) | 0.92 |

## Next Steps (Claude Code / Local)

1. **Install dependencies:**
```bash
pip install pdfplumber pandas requests fastapi uvicorn psycopg2-binary
```

2. **Set up database:**
```bash
createdb galleon
psql -d galleon -f db/schema.sql
```

3. **Run live EDGAR pull:**
```bash
python pipeline/edgar_bdc.py --live
```

4. **Run extractor against real Maurice PDF:**
```bash
python pipeline/pdf_extractor.py Docket_2_Ch11_Maurice_Sporting_G_AffidavitDeclaration_in_Support.pdf
```

5. **Generate benchmark number:**
Run extractor against 10 companies with public court filings, cross-reference against ARCC ground truth → produce field completeness % and accuracy %.

6. **Build FastAPI layer** — endpoints connecting pipeline to UI

7. **Wire UI to API** — replace mock data with live queries

## The Benchmark Target
**"87% field completeness, 93% accuracy on revenue and debt metrics across 10 middle-market borrowers using only public documents"**

This number, once generated, is the fundraising slide.

## Context
- **Market:** $1.8T private credit AUM, 145 BDCs, ~8,000 portfolio companies, 7 public fields each
- **Gap:** Revenue, EBITDA, leverage, covenants, headcount — exist nowhere in structured public form
- **Galleon's wedge:** Public document intelligence (court filings, PACER) → structured borrower profiles with field-level provenance
- **Validation strategy:** BDC filings as ground truth answer keys. Cross-reference extraction output against what ARCC reported to SEC.
