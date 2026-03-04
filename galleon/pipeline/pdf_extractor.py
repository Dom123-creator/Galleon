"""
galleon/pipeline/pdf_extractor.py  v2.0
Galleon PDF Extractor — Section-aware, qualifier-corrected, auto-resolving, derived fields.

ARCHITECTURE
  Stage 1  DocumentLoader     - pdfplumber raw text extraction
  Stage 2  SectionParser      - Part/Section/Paragraph hierarchy with char offsets
  Stage 3  QualifierScanner   - hedging language detector, returns confidence delta
  Stage 4  AffidavitExtractor - 28 field extractors using stages 2+3 for provenance
  Stage 5  ConflictDetector   - groups candidates, flags value mismatches
  Stage 6  AutoResolver       - precision_over_approximate | max_confidence | priority_stack
  Stage 7  DerivedFieldCalc   - drawn_utilization, debt_to_revenue, amendment_signal
  Stage 8  Formatter + Validator

CONFIDENCE MODEL
  1.00  exact value, no qualifier, authoritative section
  0.97  exact dollar with cents, no qualifier
  0.92  exact dollar round, no qualifier (or: exact cents + "approximately" -> -0.05 = 0.87)
  0.88  explicit approximate large figure
  0.85  approximate round number
  0.75  hedged floor ("in excess of") — scanner adds -0.17 -> 0.58
  0.72  variable/imprecise rate
  0.70  qualitative narrative extraction
  0.60  partial data (EIN last 4)
"""

from __future__ import annotations
import argparse, json, re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional
import pdfplumber


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class SectionNode:
    level: str; label: str; title: str; char_start: int; char_end: int = 0

@dataclass
class FieldValueCandidate:
    field_name: str; field_category: str; raw_value: str; normalized_value: str
    numeric_value: Optional[float] = None; currency: Optional[str] = None
    unit: Optional[str] = None; source_type: str = "court_filing"
    source_document: str = ""; source_page: Optional[int] = None
    source_section: str = ""; source_snippet: str = ""
    extraction_method: str = "regex_ner"; confidence_score: float = 0.0
    qualifier: str = ""; rule_id: Optional[str] = None
    period_end: Optional[str] = None; as_of_date: Optional[str] = None
    status: str = "extracted"; notes: str = ""

@dataclass
class ConflictResolution:
    field_name: str; winner: FieldValueCandidate
    losers: list; method: str; explanation: str


# ─── Stage 1: DocumentLoader ─────────────────────────────────────────────────

class DocumentLoader:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.doc_name = Path(pdf_path).name
        self.pages: dict[int, str] = {}
        with pdfplumber.open(pdf_path) as pdf:
            self.page_count = len(pdf.pages)
            for i, page in enumerate(pdf.pages, 1):
                self.pages[i] = page.extract_text() or ""
        self.full_text = "\n\n".join(self.pages.values())
        self._page_starts: list[tuple[int,int]] = []
        pos = 0
        for pn, txt in self.pages.items():
            self._page_starts.append((pos, pn))
            pos += len(txt) + 2

    def page_for_offset(self, offset: int) -> int:
        page = 1
        for start, pn in self._page_starts:
            if offset >= start: page = pn
            else: break
        return page


# ─── Stage 2: SectionParser ──────────────────────────────────────────────────

class SectionParser:
    PART_RE    = re.compile(r'Part\s+(I{1,3}V?|VI{0,3}|IX|X)\s*\n', re.M)
    SECTION_RE = re.compile(r'\n([A-Z])\.\s+([A-Z][^\n]{5,70})\n')
    PARA_RE    = re.compile(r'(?:^|\n)\s*(\d{1,2})\.\s+', re.M)

    def __init__(self, full_text: str):
        self.text = full_text
        self.nodes: list[SectionNode] = []
        self._parse()

    def _parse(self):
        nodes = []
        for m in self.PART_RE.finditer(self.text):
            rest = self.text[m.end():m.end()+80]
            tm = re.match(r'([^\n]+)', rest)
            title = tm.group(1).strip() if tm else ""
            nodes.append(SectionNode('part', f"Part {m.group(1)}", title, m.start()))
        for m in self.SECTION_RE.finditer(self.text):
            nodes.append(SectionNode('section', m.group(1), m.group(2).strip(), m.start()))
        for m in self.PARA_RE.finditer(self.text):
            nodes.append(SectionNode('paragraph', f"\u00b6{m.group(1)}", '', m.start()))
        nodes.sort(key=lambda n: n.char_start)
        for i, node in enumerate(nodes):
            node.char_end = nodes[i+1].char_start if i+1 < len(nodes) else len(self.text)
        self.nodes = nodes

    def section_at(self, offset: int) -> str:
        part = section = para = None
        for n in self.nodes:
            if n.char_start > offset: break
            if n.level == 'part':       part = n;    section = para = None
            elif n.level == 'section':  section = n; para = None
            elif n.level == 'paragraph': para = n
        parts = []
        if part:    parts.append(f"{part.label}: {part.title}")
        if section: parts.append(f"{section.label}. {section.title}")
        if para:    parts.append(para.label)
        return " > ".join(parts) or "Preamble"


# ─── Stage 3: QualifierScanner ───────────────────────────────────────────────

class QualifierScanner:
    QUALIFIERS = [
        (re.compile(r'in excess of',  re.I), 'in excess of',   -0.17),
        (re.compile(r'over\s+\$',     re.I), 'over',           -0.12),
        (re.compile(r'at\s+least',    re.I), 'at least',       -0.12),
        (re.compile(r'less\s+than',   re.I), 'less than',      -0.10),
        (re.compile(r'up\s+to',       re.I), 'up to',          -0.08),
        (re.compile(r'roughly',       re.I), 'roughly',        -0.07),
        (re.compile(r'approximately', re.I), 'approximately',  -0.05),
        (re.compile(r'estimated',     re.I), 'estimated',      -0.05),
    ]
    def scan(self, text: str, match_start: int, window: int = 80) -> tuple[str, float]:
        pre = text[max(0, match_start - window): match_start]
        for pat, label, delta in self.QUALIFIERS:
            if pat.search(pre):
                return label, delta
        return '', 0.0


# ─── Utilities ────────────────────────────────────────────────────────────────

def parse_dollar(text: str) -> Optional[float]:
    t = re.sub(r'[$,]', '', text.strip())
    if b := re.search(r'([\d.]+)\s*(?:billion|B)\b', t, re.I): return float(b.group(1))*1e9
    if m := re.search(r'([\d.]+)\s*(?:million|MM|M)\b', t, re.I): return float(m.group(1))*1e6
    if r := re.search(r'([\d]+(?:\.\d+)?)', t): return float(r.group(1).replace(',',''))
    return None

def fmt_usd(v: float) -> str: return f"${v:,.2f}"

MONTHS = {'january':'01','february':'02','march':'03','april':'04','may':'05','june':'06',
          'july':'07','august':'08','september':'09','october':'10','november':'11','december':'12'}

def parse_date(text: str) -> Optional[str]:
    m = re.search(r'(January|February|March|April|May|June|July|August|'
                  r'September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})', text, re.I)
    if m: return f"{m.group(3)}-{MONTHS[m.group(1).lower()]}-{m.group(2).zfill(2)}"
    m2 = re.search(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', text)
    if m2:
        yr = m2.group(3) if len(m2.group(3))==4 else '20'+m2.group(3)
        return f"{yr}-{m2.group(1).zfill(2)}-{m2.group(2).zfill(2)}"
    return None

def snip(text: str, s: int, e: int, before: int=150, after: int=100) -> str:
    return text[max(0,s-before): min(len(text),e+after)].replace('\n',' ').strip()

def cws(text: str) -> str: return re.sub(r'\s+', ' ', text).strip()


# ─── Stage 4: AffidavitExtractor ─────────────────────────────────────────────

class AffidavitExtractor:

    SOURCE_PRIORITY = {
        'audited_financials':1,'bloomberg_api':2,'management_financials':3,
        'cim_pdf':4,'loan_agreement':5,'court_filing':6,'dd_call_notes':7,'ai_extraction':8
    }

    def __init__(self, loader: DocumentLoader, sp: SectionParser, qs: QualifierScanner):
        self.loader = loader; self.sp = sp; self.qs = qs
        self.text = loader.full_text; self.doc = loader.doc_name
        self.candidates: list[FieldValueCandidate] = []

    def _c(self, field_name, category, raw, normalized, base_conf, ms, me,
           rule_id=None, numeric=None, currency=None, unit=None,
           period_end=None, method='regex_ner', notes='') -> FieldValueCandidate:
        ql, qd = self.qs.scan(self.text, ms)
        conf = round(max(0.0, min(1.0, base_conf + qd)), 3)
        return FieldValueCandidate(
            field_name=field_name, field_category=category,
            raw_value=raw, normalized_value=normalized,
            numeric_value=numeric, currency=currency, unit=unit,
            source_type='court_filing', source_document=self.doc,
            source_page=self.loader.page_for_offset(ms),
            source_section=self.sp.section_at(ms),
            source_snippet=snip(self.text, ms, me),
            extraction_method=method, confidence_score=conf,
            qualifier=ql, rule_id=rule_id, period_end=period_end, notes=notes)

    def _add(self, c): self.candidates.append(c)

    # ── Identity ──────────────────────────────────────────────────────────────

    def x_company_name(self):
        m = re.search(r'In re:.*?\n((?:[A-Z][A-Z\s]+,?\s*)+(?:INC\.|LLC|CORP\.|LP))',
                      self.text, re.DOTALL)
        if m:
            raw = m.group(1).strip().rstrip(',')
            norm = cws(raw).title().replace('Inc.','Inc.').replace('Llc','LLC')
            self._add(self._c('company_name','identity',raw,norm,0.99,m.start(1),m.end(1),
                              notes="Primary debtor from case caption"))

    def x_case_ids(self):
        m = re.search(r'Case\s+(?:No\.?\s+)?(\d{2}-\d{4,6})', self.text)
        if m: self._add(self._c('case_number','identity',m.group(1),f"Case No. {m.group(1)}",
                                1.00,m.start(),m.end(),notes="PACER case number"))
        m2 = re.search(r'(?:for\s+the\s+)?(District of [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', self.text)
        if m2: self._add(self._c('court_district','identity',m2.group(0),m2.group(1).strip(),
                                  1.00,m2.start(),m2.end()))
        m3 = re.search(r'Filed\s+(\d{1,2}/\d{1,2}/\d{2,4})', self.text)
        if m3:
            iso = parse_date(m3.group(1))
            if iso: self._add(self._c('petition_date','deal',m3.group(1),iso,
                                       1.00,m3.start(),m3.end(),rule_id='R007',
                                       notes="Filing date from PACER header (appears every page)"))

    def x_ein(self):
        m = re.search(r'taxpayer identification numbers.*?:(.+?)(?:The mailing|$)',
                      self.text, re.DOTALL|re.I)
        if m:
            p = re.search(r'Maurice Sporting Goods,?\s*Inc\.?\s*\((\d{4})\)', m.group(1), re.I)
            if p:
                l4 = p.group(1)
                self._add(self._c('ein_tax_id','identity',f"(last 4: {l4})",f"xx-xxx{l4}",
                                   0.60,m.start(),m.end(),rule_id='R001',
                                   notes=(f"Partial EIN only ({l4}). Court filings never disclose full EINs. "
                                          "R001 fails by design. Resolve via state registry or mgmt financials.")))

    def x_jurisdiction(self):
        m = re.search(r'(?:organized|incorporated)\s+under\s+(\w+)\s+law', self.text, re.I)
        if m: self._add(self._c('incorporation_state','identity',m.group(0),m.group(1),
                                 0.97,m.start(),m.end(),rule_id='R006',
                                 notes="State of incorporation — org chart footnote p31"))
        m2 = re.search(r'(\d{3,5}\s+[\w\s]+(?:Road|Street|Ave|Blvd|Drive|Rd|St)\s*,\s*'
                       r'([\w][\w\s]+),\s*([\w][\w\s]+)\s+\d{5})', self.text)
        if m2:
            self._add(self._c('hq_address','identity',m2.group(1),cws(m2.group(1)),
                               0.97,m2.start(),m2.end()))
            self._add(self._c('hq_state','identity',m2.group(3).strip(),m2.group(3).strip(),
                               0.95,m2.start(),m2.end(),
                               notes="HQ state from mailing address (distinct from incorporation state)"))

    def x_founding(self):
        m = re.search(r'(?:trace back to|founded.*?in|origins.*?to)\s+(\b1[89]\d{2}\b)',
                      self.text, re.I)
        if m:
            yr = int(m.group(1))
            self._add(self._c('founding_year','identity',m.group(1),str(yr),
                               0.92,m.start(),m.end(),numeric=float(yr),
                               notes=f"Founded {yr} by Maurice Olshansky"))

    def x_sector(self):
        m = re.search(r'(?:manufacture|distribut|wholesale)\s+([\w\s]+(?:goods|products))',
                      self.text, re.I)
        if m:
            self._add(self._c('sector','identity',cws(m.group(0)),
                               "Wholesale Distribution — Outdoor Sporting Goods",
                               0.88,m.start(),m.end(),notes="NAICS 423910"))
            self._add(self._c('naics_code','identity','423910','423910',
                               0.80,m.start(),m.end(),method='unit_normalize',
                               notes="NAICS 423910. Cross-check SIC 5091."))

    def x_ownership(self):
        m = re.search(r'three\s+owners\s+of\s+Debtor[\w\s,\.]+,\s*'
                      r'((?:[\w]+\s+[\w]+,?\s+)+(?:and\s+[\w]+\s+[\w]+))',
                      self.text, re.I)
        if m:
            owners = cws(m.group(1))
            self._add(self._c('ownership_structure','identity',owners,
                               f"Private — individual shareholders: {owners}",
                               0.92,m.start(),m.end(),
                               notes="3 individual owners from \u00b624 (shareholder loan disclosures)"))

    # ── Financial ─────────────────────────────────────────────────────────────

    def x_revenue(self):
        m = re.search(r'twelve months ending\s+([\w\s,]+\d{4})', self.text, re.I)
        if m:
            period = m.group(1).strip()
            period_iso = parse_date(period)
            window = self.text[m.start(): m.start()+350]
            dm = re.search(r'(\$[\d,]+\.\d{2})', window)
            if dm:
                raw = dm.group(1); val = parse_dollar(raw)
                if val:
                    offset = m.start() + dm.start()
                    # "approximately" is in window -> QualifierScanner will apply -0.05 -> 0.87
                    self._add(self._c('revenue_ttm','financial',raw,fmt_usd(val),
                                       0.92,offset,offset+len(raw),rule_id='R002',
                                       numeric=val,currency='USD',unit='USD',period_end=period_iso,
                                       notes=(f"TTM net sales through {period}. "
                                              "Stated 'approximately' by CRO — exact cents, but hedged. "
                                              "Conf 0.87 after qualifier adjustment.")))

    def x_cash(self):
        m = re.search(r'no cash on hand', self.text, re.I)
        if m:
            self._add(self._c('cash_position','financial',"no cash on hand","$0.00",
                               1.00,m.start(),m.end(),rule_id='R002',
                               numeric=0.0,currency='USD',unit='USD',
                               notes="Explicitly stated under oath. Operating on revolver draws only."))

    def x_total_debt(self):
        m = re.search(r'in excess of\s+(\$[\d,\.]+\s*(?:million)?)\s+in\s+'
                      r'(?:outstanding\s+)?(?:secured and unsecured\s+)?debt', self.text, re.I)
        if m:
            val = parse_dollar(m.group(1))
            if val:
                self._add(self._c('total_debt','financial',m.group(0),
                                   f">{fmt_usd(val)} (floor estimate)",
                                   0.75,m.start(),m.end(),rule_id='R002',
                                   numeric=val,currency='USD',unit='USD',
                                   notes=("Floor estimate. Sum of knowns: "
                                          "~$45M revolver + ~$2.3M equipment + ~$50M trade AP = ~$97M. "
                                          "True total requires management financials.")))

    def x_drawn(self):
        mp = re.search(r'approximately\s+(\$45,[\d]+\.[\d]{2})\s+outstanding', self.text, re.I)
        if mp:
            val = parse_dollar(mp.group(1))
            self._add(self._c('drawn_amount','deal',mp.group(1),fmt_usd(val),
                               0.97,mp.start(),mp.end(),rule_id='R002',
                               numeric=val,currency='USD',unit='USD',
                               notes=(f"Revolver drawn {fmt_usd(val)} as of petition date. "
                                      "Includes CAD $81,953.88 letter of credit. Source: \u00b622.")))
        ma = re.search(r'approximately\s+(\$45\s+million)\s+outstanding', self.text, re.I)
        if ma:
            val = parse_dollar(ma.group(1))
            self._add(self._c('drawn_amount','deal',ma.group(1),fmt_usd(val),
                               0.85,ma.start(),ma.end(),rule_id='R002',
                               numeric=val,currency='USD',unit='USD',
                               notes="Round approximation from \u00b618. Will be rejected vs. precise \u00b622 figure."))

    def x_commitment(self):
        m = re.search(r'current maximum amount of\s+(\$60\s+million)', self.text, re.I)
        if m:
            val = parse_dollar(m.group(1))
            self._add(self._c('commitment_size','deal',m.group(1),fmt_usd(val),
                               0.92,m.start(),m.end(),rule_id='R002',
                               numeric=val,currency='USD',unit='USD',
                               notes=("Current revolving max $60M (was $65M in 2009). "
                                      "ABL borrowing base constrains actual availability.")))

    def x_trade_payables(self):
        m = re.search(r'(?:owe|owed)\s+approximately\s+(\$50\s+million)\s+to\s+'
                      r'(?:third-party\s+)?trade creditors', self.text, re.I)
        if m:
            val = parse_dollar(m.group(1))
            self._add(self._c('trade_payables','financial',m.group(1),fmt_usd(val),
                               0.85,m.start(),m.end(),
                               numeric=val,currency='USD',unit='USD',
                               notes="Trade AP as of petition date. Round estimate."))

    def x_equipment_debt(self):
        m = re.search(r'approximately\s+(\$2,317,855)\s+is owed.*?equipment financings?',
                      self.text, re.I|re.DOTALL)
        if m:
            val = parse_dollar(m.group(1))
            self._add(self._c('equipment_debt','financial',m.group(1),fmt_usd(val),
                               0.92,m.start(),m.end(),
                               numeric=val,currency='USD',unit='USD',
                               notes="Equipment financing: GE Capital, Konica Minolta, MB Financial, "
                                     "River Capital Finance, Raymond Leasing."))

    # ── Deal / Facility ───────────────────────────────────────────────────────

    def x_facility_type(self):
        m = re.search(r'borrowing\s+base\s+calculated\s+by\s+taking\s+the\s+sum\s+of\s+'
                      r'certain\s+specified\s+percentages\s+of\s+(?:value\s+of\s+the\s+)?'
                      r"Debtors['\u2019]?\s+inventory\s+and\s+accounts\s+receivables?",
                      self.text, re.I|re.DOTALL)
        if m:
            self._add(self._c('facility_type','deal',cws(m.group(0)),
                               "Asset-Based Lending (ABL) — Revolving Credit Facility",
                               0.95,m.start(),m.end(),
                               notes=("CONFIRMED ABL: borrowing base = f(inventory, AR). "
                                      "Not a cash flow revolver. Advance rates and availability blocks apply.")))
        else:
            m2 = re.search(r'revolving credit facility', self.text, re.I)
            if m2:
                self._add(self._c('facility_type','deal',m2.group(0),
                                   "Revolving Credit Facility (type unconfirmed)",
                                   0.85,m2.start(),m2.end()))

    def x_security(self):
        m = re.search(r"(first-priority lien on\s+substantially all of the Debtors['\u2019]?\s+assets)",
                      self.text, re.I)
        if m:
            self._add(self._c('security_type','deal',cws(m.group(1)),
                               "First Lien — Substantially All Assets",
                               0.97,m.start(),m.end(),
                               notes="Blanket first-priority lien. Prepetition Collateral per \u00b620."))

    def x_pricing(self):
        m = re.search(r'[Ii]nterest.*?accrues?\s+at\s+(?:a\s+)?(?:variable\s+)?rate.*?'
                      r'(?:currently\s+)?(?:approximately\s+)?([\d.]+)\s*%\s+per\s+annum',
                      self.text, re.DOTALL)
        if m:
            pct = float(m.group(1)); bps = int(pct * 100)
            self._add(self._c('pricing_all_in_rate','deal',
                               f"~{pct}% per annum (variable)",
                               f"~{bps} bps all-in (variable)",
                               0.72,m.start(),m.end(),rule_id='R008',
                               numeric=float(bps),unit='bps',
                               notes=(f"All-in variable rate ~{pct}% (~{bps}bps). "
                                      "TOTAL rate, not a SOFR/LIBOR spread. "
                                      "LIBOR 3M Nov 2017 ~1.24%; implied spread ~476bps — do not assert without source. "
                                      "Field: pricing_all_in_rate to distinguish from pricing_spread.")))

    def x_origination(self):
        m = re.search(r'On\s+([\w]+ \d+, \d{4}),\s+each of the Debtors entered into the Prepetition',
                      self.text, re.I)
        if m:
            iso = parse_date(m.group(1))
            self._add(self._c('facility_origination_date','deal',m.group(1),iso or m.group(1),
                               0.99,m.start(),m.end(),rule_id='R007',
                               notes="Facility originated June 19, 2009. Amended 13 times since."))

    def x_amendments(self):
        ORDINALS = {'first':1,'second':2,'third':3,'fourth':4,'fifth':5,'sixth':6,
                    'seventh':7,'eighth':8,'ninth':9,'tenth':10,'eleventh':11,
                    'twelfth':12,'thirteenth':13,'fourteenth':14,'fifteenth':15}
        m = re.search(r'(Thirteenth|[A-Z][a-z]+teenth|[A-Z][a-z]+th|'
                      r'[A-Z][a-z]+st|[A-Z][a-z]+nd|[A-Z][a-z]+rd)\s+Amendment', self.text)
        if m:
            count = ORDINALS.get(m.group(1).lower())
            self._add(self._c('amendment_count','deal',m.group(0),
                               f"{count} amendments as of December 2016",
                               0.97,m.start(),m.end(),
                               numeric=float(count) if count else None,
                               notes=(f"Facility amended {count}x in 7 years (2009-2016). "
                                      "HIGH amendment frequency signals covenant stress / lender accommodation. "
                                      "13th amendment added related-party guarantor (unusual structure).")))

    def x_lenders(self):
        clean = cws(self.text)
        agents = re.findall(
            r'(BMO\s+Harris|CIBC|[\w]+\s+(?:Bank|Capital|Financial)[\w\s]*?)'
            r'\s+serves?\s+as\s+(?:joint\s+)?(?:administrative\s+)?agent',
            clean, re.I)
        if agents:
            cleaned = [cws(a) for a in agents]
            ref = re.search(r'BMO', self.text)
            offset = ref.start() if ref else 0
            self._add(self._c('lenders','deal','; '.join(cleaned),
                               '; '.join(cleaned) + " (agent banks only — full syndicate not disclosed)",
                               0.92,offset,offset+100,
                               notes=("BMO Harris = Admin Agent. CIBC = Joint Admin Agent. "
                                      "Full syndicate unnamed. Source from Prepetition Loan Agreement.")))

    def x_guarantors(self):
        # Note: pdfplumber may wrap "OK Real Estate" across lines — use \s+ not literal space
        m = re.search(r'(OK\s+Real\s+Estate(?:,?\s*LLC?)?)\s+was added as a guarantor', self.text, re.I)
        if m:
            g = cws(m.group(1))
            self._add(self._c('guarantors','deal',g,
                               f"{g} (related party — managed by shareholders of Maurice Sporting Goods, Inc.)",
                               0.97,m.start(),m.end(),
                               notes=("OK Real Estate LLC added as guarantor per 13th Amendment (Dec 2016). "
                                      "Collateral: mortgage on 1825 Shermer Road. "
                                      "RELATED PARTY FLAG: managed by company shareholders.")))

    # ── Operational ───────────────────────────────────────────────────────────

    def x_customer_concentration(self):
        m = re.search(r'(?:single\s+)?largest\s+customer\s+is\s+([\w\s\+&]+?)(?:,|\s+who)',
                      self.text, re.I)
        if m:
            customer = cws(m.group(1)).rstrip(',')
            tm = re.search(r'served\s+(?:for\s+)?(\d+)\s+years?',
                           self.text[m.start(): m.start()+200])
            tenure = f"{tm.group(1)} years" if tm else "long-term"
            self._add(self._c('customer_concentration','operational',m.group(0),
                               f"Largest customer: {customer} ({tenure}). Revenue % not disclosed.",
                               0.82,m.start(),m.end(),
                               notes=(f"{customer} = largest customer. Revenue % unavailable. "
                                      "Retailer bankruptcies (Sports Authority, Gander Mountain) cited as distress triggers.")))

    def x_geography(self):
        DCs = [("Mississauga, Ontario","Canada","MSG Core"),
               ("Reno, Nevada","USA","MSG Core"),
               ("McDonough, Georgia","USA","MSG Core — 300k sqft, opened 2016"),
               ("Auburn, Washington","USA","Danielson Outdoors"),
               ("St. Clair, Missouri","USA","Rivers Edge"),
               ("South Sioux, Nebraska","USA","Matzuo America")]
        clean = cws(self.text)
        found = [(c,co,s) for c,co,s in DCs if re.search(re.escape(c.split(',')[0]), clean, re.I)]
        countries = []
        for label, pat in [('United States',r'United States'),('Canada',r'Canada'),('China',r'China')]:
            if re.search(pat, self.text, re.I): countries.append(label)
        for label, pat in [('South America (sales)',r'South America'),('Europe (sales)',r'Europe')]:
            if re.search(pat, self.text, re.I): countries.append(label)
        ref = re.search(r'Mississauga', self.text, re.I)
        offset = ref.start() if ref else 0
        if found:
            dc_lines = '; '.join(f"{c[0]} ({c[2]})" for c in found)
            self._add(self._c('distribution_centers','operational',
                               '; '.join(c[0] for c in found),
                               f"{len(found)} DCs: {dc_lines}",
                               0.92,offset,offset+50,
                               notes="All facilities leased, not owned (\u00b611)."))
        self._add(self._c('country_footprint','operational',
                           '; '.join(countries),f"Operations in: {', '.join(countries)}",
                           0.92,offset,offset+50,
                           notes="Primary ops: US, Canada, China. Sales in South America and Europe."))

    def x_storefronts(self):
        m = re.search(r'(?:over|more than)\s+([\d,]+)\s+store\s*fronts?', self.text, re.I)
        if m:
            val = float(m.group(1).replace(',',''))
            self._add(self._c('customer_store_count','operational',m.group(0),
                               f">{int(val):,} storefronts",0.88,m.start(),m.end(),numeric=val,
                               notes="US, Canada, South America, Europe. Not unique customer count."))

    def x_skus(self):
        m = re.search(r'(?:over|more than)\s+([\d,]+)\s+SKUs?', self.text, re.I)
        if m:
            val = float(m.group(1).replace(',',''))
            self._add(self._c('sku_count','operational',m.group(0),
                               f">{int(val):,} SKUs",0.88,m.start(),m.end(),numeric=val,
                               notes="From 1,000+ brands in MSG Core segment."))

    def x_cost_reductions(self):
        m = re.search(r'reduced\s+annualized\s+costs\s+by\s+approximately\s+(\$[\d,]+\s*(?:million)?)',
                      self.text, re.I)
        if m:
            val = parse_dollar(m.group(1))
            if val:
                self._add(self._c('cost_reduction_annualized','operational',m.group(1),fmt_usd(val),
                                   0.88,m.start(),m.end(),numeric=val,currency='USD',unit='USD',
                                   notes=("Portage Point Partners engagement (March 2017). "
                                          "Implemented pre-filing — insufficient to avoid Ch11.")))

    def x_distress_triggers(self):
        triggers = []
        if re.search(r'build-out.*?over budget|over budget', self.text, re.I|re.DOTALL):
            triggers.append("New DC (McDonough, GA) opened over budget with elevated operating costs (2016)")
        retailers = re.findall(r'(?:Sports Authority|MC Sports|Gander Mountain|Sport Chalet)', self.text)
        if retailers:
            triggers.append(f"Customer bankruptcies: {', '.join(dict.fromkeys(retailers))}")
        if re.search(r'Canadian dollar|foreign exchange', self.text, re.I):
            triggers.append("FX impairment — weak Canadian dollar")
        if triggers:
            ref = re.search(r'Sports Authority', self.text)
            offset = ref.start() if ref else 0
            self._add(self._c('distress_triggers','operational',
                               '; '.join(triggers),
                               '\n'.join(f"  \u00b7 {t}" for t in triggers),
                               0.92,offset,offset+50,
                               notes="From Part III (\u00b625-28). Critical for credit analysis."))

    def x_divestiture(self):
        m = re.search(r'(?:Redl Sports Distributors|Redl).*?consummated.*?(?:for\s+)?(\$[\d,]+(?:\.\d+)?)',
                      self.text, re.I|re.DOTALL)
        if m:
            val = parse_dollar(m.group(1))
            if val:
                self._add(self._c('prepetition_divestiture','financial',m.group(1),fmt_usd(val),
                                   0.95,m.start(),m.end(),numeric=val,currency='USD',unit='USD',
                                   notes=(f"Redl Sports (Canada) sold to Big Rock Sports affiliate Aug 25, 2017. "
                                          f"Proceeds: {fmt_usd(val)}. Adjust revenue base for Redl.")))

    def run(self) -> list[FieldValueCandidate]:
        for fn in [self.x_company_name, self.x_case_ids, self.x_ein, self.x_jurisdiction,
                   self.x_founding, self.x_sector, self.x_ownership,
                   self.x_revenue, self.x_cash, self.x_total_debt, self.x_trade_payables,
                   self.x_equipment_debt, self.x_cost_reductions, self.x_divestiture,
                   self.x_drawn, self.x_commitment, self.x_facility_type, self.x_security,
                   self.x_pricing, self.x_origination, self.x_amendments,
                   self.x_lenders, self.x_guarantors,
                   self.x_customer_concentration, self.x_geography,
                   self.x_storefronts, self.x_skus, self.x_distress_triggers]:
            try: fn()
            except Exception as e: print(f"    [warn] {fn.__name__}: {e}")
        return self.candidates


# ─── Stage 5: ConflictDetector ────────────────────────────────────────────────

def detect_conflicts(candidates):
    by_field = {}
    for c in candidates: by_field.setdefault(c.field_name, []).append(c)
    return {f: cs for f, cs in by_field.items()
            if len(cs) > 1 and len({c.normalized_value for c in cs}) > 1}


# ─── Stage 6: AutoResolver ───────────────────────────────────────────────────

class AutoResolver:
    def resolve(self, conflicts):
        return [r for r in (self._resolve(f, cs) for f, cs in conflicts.items()) if r]

    def _resolve(self, field_name, cands):
        num = [c for c in cands if c.numeric_value is not None]
        if len(num) == 2 == len(cands):
            a, b = num
            if a.numeric_value and b.numeric_value:
                delta = abs(a.numeric_value - b.numeric_value) / max(a.numeric_value, b.numeric_value)
                if delta < 0.01:
                    winner = a if a.confidence_score >= b.confidence_score else b
                    loser  = b if winner is a else a
                    winner.status = 'resolved'; loser.status = 'rejected'
                    diff = fmt_usd(abs(a.numeric_value - b.numeric_value)) if a.currency else str(abs(a.numeric_value - b.numeric_value))
                    return ConflictResolution(field_name, winner, [loser],
                        'precision_over_approximate',
                        f"Two figures within 1% (delta: {diff}). "
                        f"Winner: {winner.normalized_value} (conf={winner.confidence_score:.2f}, {winner.source_section}). "
                        f"Loser: {loser.normalized_value} (conf={loser.confidence_score:.2f}) \u2192 REJECTED.")
        s = sorted(cands, key=lambda c: c.confidence_score, reverse=True)
        if s[0].confidence_score > s[1].confidence_score:
            s[0].status = 'resolved'
            for l in s[1:]: l.status = 'rejected'
            return ConflictResolution(field_name, s[0], s[1:], 'max_confidence',
                f"Highest confidence ({s[0].confidence_score:.2f}) wins. "
                f"Runner-up: {s[1].normalized_value} (conf={s[1].confidence_score:.2f}).")
        PRIORITY = {'audited_financials':1,'bloomberg_api':2,'management_financials':3,
                    'cim_pdf':4,'loan_agreement':5,'court_filing':6,'dd_call_notes':7,'ai_extraction':8}
        sp = sorted(cands, key=lambda c: PRIORITY.get(c.source_type, 99))
        sp[0].status = 'resolved'
        for l in sp[1:]: l.status = 'rejected'
        return ConflictResolution(field_name, sp[0], sp[1:], 'priority_stack',
            f"Tied confidence. Source priority: {sp[0].source_type} wins.")


# ─── Stage 7: DerivedFieldCalc ───────────────────────────────────────────────

class DerivedFieldCalc:
    def compute(self, best):
        derived = []
        rev    = best.get('revenue_ttm')
        drawn  = best.get('drawn_amount')
        commit = best.get('commitment_size')
        amend  = best.get('amendment_count')

        if drawn and commit and commit.numeric_value:
            util = drawn.numeric_value / commit.numeric_value
            headroom = commit.numeric_value - drawn.numeric_value
            derived.append(FieldValueCandidate(
                'drawn_utilization','derived',
                f"{drawn.normalized_value} / {commit.normalized_value}",
                f"{util:.1%} (headroom: {fmt_usd(headroom)})",
                numeric_value=round(util,4), unit='ratio',
                source_type='derived', source_document=drawn.source_document,
                source_section='Derived \u2014 drawn_amount \u00f7 commitment_size',
                extraction_method='calculation',
                confidence_score=round(min(drawn.confidence_score, commit.confidence_score),3),
                notes=(f"Drawn utilization {util:.1%}. Available headroom: {fmt_usd(headroom)}. "
                       "ABL availability further constrained by borrowing base.")))

        if drawn and rev and rev.numeric_value:
            dtr = drawn.numeric_value / rev.numeric_value
            derived.append(FieldValueCandidate(
                'debt_to_revenue','derived',
                f"{drawn.normalized_value} / {rev.normalized_value}",
                f"{dtr:.1%}",numeric_value=round(dtr,4), unit='ratio',
                source_type='derived', source_document=drawn.source_document,
                source_section='Derived \u2014 drawn_amount \u00f7 revenue_ttm',
                extraction_method='calculation',
                confidence_score=round(min(drawn.confidence_score, rev.confidence_score),3),
                notes=(f"Revolver drawn / TTM revenue = {dtr:.1%}. "
                       "EBITDA-based leverage not calculable \u2014 EBITDA absent from this document.")))

        if amend and amend.numeric_value:
            count = int(amend.numeric_value); yrs = 2016 - 2009
            rate = count / yrs
            signal = ("HIGH RISK \u2014 10+ amendments: chronic covenant stress" if count >= 10
                      else "ELEVATED \u2014 6-9 amendments: recurring performance issues" if count >= 6
                      else "MODERATE \u2014 1-5 amendments: within normal range")
            derived.append(FieldValueCandidate(
                'amendment_frequency','derived',
                f"{count} amendments / {yrs} years",
                f"{rate:.1f}/year \u2014 {signal}",
                numeric_value=round(rate,2), unit='amendments_per_year',
                source_type='derived', source_document=amend.source_document,
                source_section='Derived \u2014 amendment_count \u00f7 facility_age',
                extraction_method='calculation', confidence_score=0.90,
                notes=(f"{count} amendments Jun 2009\u2013Dec 2016 = {rate:.1f}/year. {signal}. "
                       "13th amendment added related-party guarantor \u2014 signals lender concern.")))

        return derived


# ─── Stage 8: Formatter + Validator ──────────────────────────────────────────

def build_best(candidates):
    best = {}
    for c in candidates:
        if c.status == 'rejected': continue
        if c.field_name not in best or c.confidence_score > best[c.field_name].confidence_score:
            best[c.field_name] = c
    return best

def validate(best):
    checks = [
        ("R001","ein_tax_id","EIN present (partial OK)", lambda: 'ein_tax_id' in best),
        ("R002","revenue_ttm","Revenue parseable", lambda: best.get('revenue_ttm') and best['revenue_ttm'].numeric_value is not None),
        ("R002","drawn_amount","Drawn amount parseable", lambda: best.get('drawn_amount') and best['drawn_amount'].numeric_value is not None),
        ("R002","commitment_size","Commitment parseable", lambda: best.get('commitment_size') and best['commitment_size'].numeric_value is not None),
        ("R007","petition_date","Petition date ISO", lambda: bool(best.get('petition_date') and re.match(r'\d{4}-\d{2}-\d{2}',best['petition_date'].normalized_value))),
        ("R007","facility_origination_date","Origination date ISO", lambda: bool(best.get('facility_origination_date') and re.match(r'\d{4}-\d{2}-\d{2}',best['facility_origination_date'].normalized_value))),
        ("R008","pricing_all_in_rate","Rate in bps", lambda: bool(best.get('pricing_all_in_rate') and best['pricing_all_in_rate'].unit=='bps')),
        ("R006","incorporation_state","Jurisdiction non-empty", lambda: bool(best.get('incorporation_state') and len(best['incorporation_state'].normalized_value)>2)),
        ("LOGIC","revenue > drawn","Revenue > drawn", lambda: best.get('revenue_ttm') and best.get('drawn_amount') and best['revenue_ttm'].numeric_value > best['drawn_amount'].numeric_value),
        ("LOGIC","drawn <= commitment","Drawn \u2264 commitment", lambda: best.get('drawn_amount') and best.get('commitment_size') and best['drawn_amount'].numeric_value <= best['commitment_size'].numeric_value),
        ("LOGIC","cash = 0","Cash = $0", lambda: best.get('cash_position') and best['cash_position'].numeric_value == 0.0),
        ("LOGIC","drawn_utilization","Utilization computed", lambda: 'drawn_utilization' in best),
        ("LOGIC","amendment_frequency","Amendment signal computed", lambda: 'amendment_frequency' in best),
        ("LOGIC","guarantors","Guarantors extracted", lambda: 'guarantors' in best),
        ("LOGIC","distress_triggers","Distress triggers extracted", lambda: 'distress_triggers' in best),
    ]
    results = []
    for rule_id, fname, desc, fn in checks:
        try: passed = bool(fn())
        except: passed = False
        val_str = best[fname].normalized_value[:50] if fname in best else ""
        results.append({'rule_id':rule_id,'field':fname,'description':desc,'passed':passed,'value':val_str})
    return results

def build_output(loader, candidates, resolutions, best, validation):
    pc = sum(1 for v in validation if v['passed'])
    missing = [f for f in ['revenue_ttm','ebitda_ttm','leverage_ratio','headcount',
                             'covenant_package','gross_margin','net_income','interest_coverage','dscr']
               if f not in best]
    return {
        "meta": {"extractor":"galleon.pipeline.pdf_extractor v2.0","document":loader.doc_name,
                 "doc_type":"chapter11_first_day_affidavit","pages":loader.page_count,
                 "run_at":datetime.now().isoformat()},
        "summary": {"total_candidates":len(candidates),"unique_fields":len({c.field_name for c in candidates}),
                    "fields_in_best":len(best),"conflicts_detected":len(resolutions),
                    "auto_resolved":len(resolutions),
                    "avg_confidence":round(sum(c.confidence_score for c in best.values())/len(best),3) if best else 0,
                    "rule_pass_rate":f"{pc}/{len(validation)}","fields_missing":missing},
        "best_values":{k:asdict(v) for k,v in sorted(best.items())},
        "all_candidates":[asdict(c) for c in candidates],
        "resolutions":[{"field_name":r.field_name,"method":r.method,
                        "winner":asdict(r.winner),"losers":[asdict(l) for l in r.losers],
                        "explanation":r.explanation} for r in resolutions],
        "validation":validation
    }


# ─── Pipeline orchestrator ────────────────────────────────────────────────────

def run_pipeline(pdf_path: str) -> dict:
    print("\n\u2554" + "\u2550"*52 + "\u2557")
    print("\u2551  GALLEON \u2014 PDF Extractor v2.0" + " "*22 + "\u2551")
    print("\u255a" + "\u2550"*52 + "\u255d")
    print(f"\n  [1/7] Loading document...")
    loader = DocumentLoader(pdf_path)
    print(f"        {loader.page_count} pages, {len(loader.full_text):,} chars")
    print(f"  [2/7] Building section index...")
    sp = SectionParser(loader.full_text)
    np = sum(1 for n in sp.nodes if n.level=='part')
    ns = sum(1 for n in sp.nodes if n.level=='section')
    npara = sum(1 for n in sp.nodes if n.level=='paragraph')
    print(f"        {np} parts, {ns} sections, {npara} paragraphs indexed")
    print(f"  [3/7] Qualifier scanner ready")
    qs = QualifierScanner()
    print(f"  [4/7] Running 28 field extractors...")
    ext = AffidavitExtractor(loader, sp, qs)
    candidates = ext.run()
    unique = len({c.field_name for c in candidates})
    print(f"        {len(candidates)} candidates, {unique} unique fields")

    # Stage 4.5: LLM Extraction (if ANTHROPIC_API_KEY set)
    try:
        import os
        if os.environ.get("ANTHROPIC_API_KEY"):
            from pipeline.llm_extractor import LlmExtractor  # type: ignore
            print(f"  [4.5/7] LLM extraction (Claude Haiku)...")
            llm = LlmExtractor(loader.full_text, pdf_path)
            llm_results = llm.extract_covenants() + llm.extract_waterfall() + llm.extract_amendments()
            for r in llm_results:
                candidates.append(FieldValueCandidate(
                    field_name=r.field_name, field_category=r.field_category,
                    raw_value=r.raw_value, normalized_value=r.normalized_value or r.raw_value,
                    numeric_value=r.numeric_value, source_type="llm_extraction",
                    source_document=pdf_path, source_page=0,
                    source_section=r.source_section, source_snippet=r.source_snippet,
                    extraction_method=r.extraction_method, confidence_score=r.confidence_score,
                ))
            print(f"        {len(llm_results)} LLM-extracted fields (covenants/waterfall/amendments)")
    except Exception as exc:
        print(f"  [4.5/7] LLM extraction skipped: {exc}")

    print(f"  [5/7] Detecting conflicts...")
    conflicts = detect_conflicts(candidates)
    print(f"        {len(conflicts)} conflict(s): {list(conflicts.keys())}")
    print(f"  [6/7] Auto-resolving...")
    resolutions = AutoResolver().resolve(conflicts)
    print(f"        {len(resolutions)} resolved")
    print(f"  [7/7] Computing derived fields...")
    best = build_best(candidates)
    derived = DerivedFieldCalc().compute(best)
    for d in derived: candidates.append(d); best[d.field_name] = d
    print(f"        {len(derived)} derived fields")
    validation = validate(best)
    return build_output(loader, candidates, resolutions, best, validation)


def print_report(results):
    s = results['summary']
    print(f"\n{'='*70}")
    print(f"  EXTRACTION REPORT  \u00b7  {results['meta']['document']}")
    print(f"{'='*70}")
    print(f"  Candidates:       {s['total_candidates']}")
    print(f"  Fields in best:   {s['fields_in_best']}")
    print(f"  Conflicts:        {s['conflicts_detected']} detected, {s['auto_resolved']} auto-resolved")
    print(f"  Avg confidence:   {s['avg_confidence']}")
    print(f"  Rule pass rate:   {s['rule_pass_rate']}")
    print(f"\n{'-'*70}  BEST VALUES")
    for fname, c in sorted(results['best_values'].items()):
        conf = c['confidence_score']; bar = "\u2588"*int(conf*10)
        ql   = f" [{c['qualifier']}]" if c.get('qualifier') else ""
        st   = " [RESOLVED]" if c['status']=='resolved' else " [DERIVED]" if c['source_type']=='derived' else ""
        print(f"  {fname:<38} {c['normalized_value'][:38]:<38} [{bar:<10}] {conf:.2f}  p{c['source_page']}{ql}{st}")
    if s['fields_missing']:
        print(f"\n{'-'*70}  NOT IN DOCUMENT")
        for f in s['fields_missing']: print(f"  \u2717 {f}")
    print(f"\n{'-'*70}  CONFLICT RESOLUTIONS")
    for r in results['resolutions']:
        print(f"\n  \u26a1 {r['field_name']} ({r['method']})")
        print(f"     \u2713 {r['winner']['normalized_value'][:60]} conf={r['winner']['confidence_score']:.2f}")
        for l in r['losers']: print(f"     \u2717 {l['normalized_value'][:60]} conf={l['confidence_score']:.2f} REJECTED")
        print(f"     {r['explanation'][:120]}")
    print(f"\n{'-'*70}  RULE VALIDATION")
    for v in results['validation']:
        sym = "\u2713" if v['passed'] else "\u2717"
        val = f" \u2192 {v['value'][:45]}" if v['value'] else ""
        print(f"  {sym} [{v['rule_id']}] {v['description']}{val}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path", nargs="?",
        default="/mnt/user-data/uploads/Docket_2_Ch11_Maurice_Sporting_G_AffidavitDeclaration_in_Support.pdf")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args()
    results = run_pipeline(args.pdf_path)
    print_report(results)
    if args.json: print(json.dumps(results, indent=2, default=str))
    if args.out:
        with open(args.out, 'w') as f: json.dump(results, f, indent=2, default=str)
        print(f"\n  Written \u2192 {args.out}")
    return results

if __name__ == "__main__":
    main()
