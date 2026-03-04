import React, { useState, useEffect, useRef, useMemo } from "react";

// ─── API Layer ────────────────────────────────────────────────────────────────
const API_BASE = (() => {
  const port = window.location.port;
  // In production (Render, Docker): same origin, no prefix needed
  if (!port || port === "8000") return "";
  // Local dev: Vite runs on 5173+ while backend is on 8000
  return "http://localhost:8000";
})();

async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`[galleon api] ${path}:`, e.message);
    return null;
  }
}

// ─── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  navy:   "#0a1628", navy2:  "#0d1e35", navy3:  "#112442", navy4:  "#162d52",
  gold:   "#c9a84c", gold2:  "#e2c47a", gold3:  "#f0d898",
  cream:  "#f5edd8", cream2: "#e8dcc4",
  muted:  "#6b7fa3", muted2: "#4a5f82",
  green:  "#3db87a", amber:  "#d4a017", red:    "#c0392b",
  border: "#1e3358", border2:"#2a4470",
  blue:   "#4a8fd4", purple: "#9b72cf",
};

// ─── Static Data (fallbacks when API returns empty) ───────────────────────────
const FIELD_SCHEMA = {
  identity:    ["company_name","legal_entity","ein_tax_id","duns_number","jurisdiction","sic_code","naics_code","founding_year"],
  financial:   ["revenue_ttm","ebitda_ttm","gross_margin","net_income","total_debt","total_equity","cash_position","capex","free_cash_flow"],
  credit:      ["leverage_ratio","interest_coverage","debt_service_coverage","current_ratio","quick_ratio","net_debt_ebitda","ltm_ebitda_margin"],
  deal:        ["facility_type","commitment_size","drawn_amount","pricing_spread","floor","maturity_date","amortization","security_type","covenant_package"],
  operational: ["headcount","geographic_footprint","customer_concentration","key_contracts","ownership_structure","management_team"],
};

const RULE_ENGINE = [
  { id:"R001", name:"EIN Format",            field:"ein_tax_id",            pattern:"^\\d{2}-\\d{7}$",     conf:1.00, type:"regex"   },
  { id:"R002", name:"Revenue Normalize",     field:"revenue_ttm",           pattern:"numeric_currency",     conf:0.95, type:"numeric" },
  { id:"R003", name:"EBITDA Sanity",         field:"ebitda_ttm",            rule:"ebitda < revenue",        conf:0.98, type:"logical" },
  { id:"R004", name:"Leverage Calc",         field:"leverage_ratio",        rule:"total_debt / ebitda_ttm", conf:1.00, type:"derived" },
  { id:"R005", name:"DSCR Threshold",        field:"debt_service_coverage", rule:"≥ 1.25x covenant",       conf:0.92, type:"covenant"},
  { id:"R006", name:"Jurisdiction Lookup",   field:"jurisdiction",          pattern:"state_code_map",       conf:0.99, type:"lookup"  },
  { id:"R007", name:"Maturity Date Parse",   field:"maturity_date",         pattern:"date_formats",         conf:0.97, type:"date"    },
  { id:"R008", name:"Spread bps Norm",       field:"pricing_spread",        rule:"convert % → bps",         conf:1.00, type:"unit"    },
  { id:"R009", name:"FV / Cost Ratio",       field:"fair_value_usd",        rule:"0.5 ≤ FV/cost ≤ 1.1",   conf:0.90, type:"logical" },
];

const SOURCES = [
  { id:"S1", name:"Q3 2024 CIM.pdf",            type:"PDF",  status:"processed",  fields:62, conf:0.91 },
  { id:"S2", name:"Management Financials.xlsx",  type:"XLSX", status:"processed",  fields:38, conf:0.97 },
  { id:"S3", name:"Loan Agreement Draft.docx",   type:"DOCX", status:"processed",  fields:29, conf:0.88 },
  { id:"S4", name:"Bloomberg Terminal Export",   type:"API",  status:"live",       fields:15, conf:0.99 },
  { id:"S5", name:"DD Call Notes.txt",           type:"TXT",  status:"processing", fields:8,  conf:0.74 },
];

const COMPANIES = [
  { id:"C1", name:"Meridian Industrial Corp",  sector:"Manufacturing",  status:"complete",   score:94, leverage:"3.2x", revenue:"$284M", ebitda:"$51M",  fields:87, conflicts:2 },
  { id:"C2", name:"Atlas Healthcare Partners", sector:"Healthcare",     status:"review",     score:78, leverage:"4.8x", revenue:"$127M", ebitda:"$19M",  fields:71, conflicts:6 },
  { id:"C3", name:"Cascade Logistics LLC",     sector:"Transportation", status:"processing", score:61, leverage:"5.1x", revenue:"$89M",  ebitda:"$12M",  fields:43, conflicts:9 },
  { id:"C4", name:"Summit Software Holdings",  sector:"Technology",     status:"complete",   score:96, leverage:"2.1x", revenue:"$203M", ebitda:"$72M",  fields:91, conflicts:1 },
];

const PIPELINE_STEPS = [
  { icon:"⚓", label:"Document Ingest",    desc:"PDF · XLSX · DOCX · API · Email" },
  { icon:"⊡", label:"Text Extraction",    desc:"Layout-aware, table detection"   },
  { icon:"◈", label:"Entity Recognition", desc:"NER: amounts, dates, entities"   },
  { icon:"⊞", label:"Field Mapping",      desc:"Entities → schema fields"        },
  { icon:"✓", label:"Rule Validation",    desc:"Deterministic checks"            },
  { icon:"✦", label:"AI Gap-Fill",        desc:"Claude enriches low-conf fields" },
  { icon:"≠", label:"Conflict Resolve",   desc:"Multi-source reconciliation"     },
  { icon:"▣", label:"Profile Output",     desc:"Normalized record + lineage"     },
];

const CONFLICTS = [
  { field:"revenue_ttm", sources:[
    { src:"Mgmt Financials.xlsx", val:"$284,100,000", conf:0.97 },
    { src:"CIM PDF p.12",         val:"$281,500,000", conf:0.88 },
    { src:"Bloomberg API",        val:"$283,800,000", conf:0.99 },
  ]},
  { field:"ebitda_ttm", sources:[
    { src:"Mgmt Financials.xlsx", val:"$51,200,000", conf:0.97 },
    { src:"CIM PDF p.14",         val:"$49,800,000", conf:0.85 },
  ]},
];

// ─── Validation Lab Data (mirrors edgar_bdc.py output) ───────────────────────
const ARCC_PORTFOLIO = [
  { id:"GT-ARCC-0001", company:"Clearview Capital Group LLC",       sector:"Software",               facility:"First Lien Sr. Secured", spread:"SOFR + 525 bps", maturity:"2029-03-15", fv:142.3, cost:143.0, pct:2.14, pik:null,       nonAccrual:false },
  { id:"GT-ARCC-0002", company:"Apex Industrial Services Inc.",     sector:"Business Services",      facility:"First Lien Sr. Secured", spread:"SOFR + 575 bps", maturity:"2028-09-30", fv:98.5,  cost:100.0, pct:1.48, pik:null,       nonAccrual:false },
  { id:"GT-ARCC-0003", company:"Meridian Healthcare Holdings LLC",  sector:"Healthcare Services",    facility:"Unitranche",             spread:"SOFR + 650 bps", maturity:"2030-06-30", fv:215.0, cost:220.0, pct:3.23, pik:"200 bps",  nonAccrual:false },
  { id:"GT-ARCC-0004", company:"Summit Logistics Partners LP",      sector:"Transportation",         facility:"Second Lien Sr. Secured",spread:"SOFR + 875 bps", maturity:"2027-12-31", fv:67.2,  cost:75.0,  pct:1.01, pik:null,       nonAccrual:true  },
  { id:"GT-ARCC-0005", company:"Vantage Software Solutions Inc.",   sector:"Technology",             facility:"First Lien Sr. Secured", spread:"SOFR + 500 bps", maturity:"2030-03-31", fv:334.0, cost:335.0, pct:5.02, pik:null,       nonAccrual:false },
  { id:"GT-ARCC-0006", company:"Bluewater Environmental Group LLC", sector:"Environmental Services", facility:"First Lien Sr. Secured", spread:"SOFR + 600 bps", maturity:"2029-09-30", fv:88.1,  cost:90.0,  pct:1.32, pik:null,       nonAccrual:false },
  { id:"GT-ARCC-0007", company:"Granite Construction Holdings Inc.",sector:"Construction",           facility:"Unitranche",             spread:"SOFR + 700 bps", maturity:"2028-12-31", fv:121.5, cost:125.0, pct:1.83, pik:"150 bps",  nonAccrual:false },
  { id:"GT-ARCC-0008", company:"Cascade Aerospace Components LLC",  sector:"Aerospace & Defense",   facility:"First Lien Sr. Secured", spread:"SOFR + 550 bps", maturity:"2030-06-30", fv:176.0, cost:177.5, pct:2.65, pik:null,       nonAccrual:false },
];

const GALLEON_EXTRACT_TARGETS = [
  "revenue_ttm","ebitda_ttm","gross_margin","total_debt","cash_position",
  "free_cash_flow","leverage_ratio","interest_coverage","dscr",
  "headcount","customer_concentration","jurisdiction",
  "ein_tax_id","covenant_package","ownership_structure",
];

const VALIDATION_STATS = {
  records: 8, gt_fields: 88, target_fields: 120,
  bdc_coverage: 42.3, galleon_gap: 57.7,
  avg_rule_pass: 42.9, conflicts: 8, entity_match_rate: 100.0,
};

const PRIORITY_STACK = [
  { rank:1, type:"audited_financials",    label:"Audited Financials (CPA-signed)", color:T.green  },
  { rank:2, type:"bloomberg_api",         label:"Bloomberg / CapIQ API",           color:T.green  },
  { rank:3, type:"management_financials", label:"Management Financials (XLSX)",    color:T.gold   },
  { rank:4, type:"cim_pdf",              label:"CIM / Offering Memo",             color:T.gold   },
  { rank:5, type:"loan_agreement",        label:"Legal Agreements",                color:T.purple },
  { rank:6, type:"dd_call_notes",         label:"DD Call Notes",                   color:T.amber  },
  { rank:7, type:"ai_extraction",         label:"AI / NLP Extraction",             color:T.muted  },
];

const DOC_ACQUISITION = [
  {
    source:"SEC EDGAR — ARCC Schedule of Investments",
    url:"https://data.sec.gov/api/xbrl/companyfacts/CIK0001287750.json",
    type:"API", status:"integrated", fields:"FV · Cost · Spread · Maturity",
    notes:"Live ground truth. Pull quarterly after 10-K / 10-Q filings.",
    color: T.green,
  },
  {
    source:"Epiq Chapter 11 First-Day Affidavits",
    url:"https://dm.epiq11.com",
    type:"PDF", status:"ready", fields:"Revenue · EBITDA · Management · Ops",
    notes:"Best proxy for raw unstructured financials. Search manufacturing $100M–$500M, 2018–2024.",
    color: T.gold,
  },
  {
    source:"PACER Court Filings",
    url:"https://pacer.gov",
    type:"PDF", status:"ready", fields:"Legal entity · Jurisdiction · Debt schedule",
    notes:"$0.10/page, $3 cap, waived if <$30/quarter. Target Delaware district.",
    color: T.gold,
  },
  {
    source:"SBA 7(a) + 504 Loan Data",
    url:"https://data.sba.gov/en/dataset/7-a-504-foia",
    type:"CSV", status:"ready", fields:"Borrower · NAICS · Amount · Charge-off",
    notes:"FY1991–present. Use to validate operational fields by cross-referencing borrower names.",
    color: T.blue,
  },
  {
    source:"Delaware Business Registry",
    url:"https://icis.corp.delaware.gov",
    type:"API", status:"ready", fields:"Legal entity · Formation date · Reg. agent",
    notes:"Identity resolution layer. Free lookup. Deterministic entity matching baseline.",
    color: T.blue,
  },
];

const SPRINT_WEEKS = [
  {
    week: 1, title: "Ground Truth Labeling",
    tasks: [
      "Pull 20 Chapter 11 First-Day Affidavits from Epiq",
      "Cross-reference against ARCC portfolio entity list",
      "Manually label 10 key fields per company",
      "Build initial ground truth CSV with 200 labeled field values",
    ],
    output: "ground_truth_labeled.csv",
    status: "pending",
  },
  {
    week: 2, title: "Extraction Pipeline Run",
    tasks: [
      "Run edgar_bdc.py --live to pull real ARCC data",
      "Feed PDFs into PDF extractor (pdfminer + pdfplumber)",
      "Execute rule engine against extracted values",
      "Compare output against manually labeled ground truth",
    ],
    output: "extraction_benchmark_v1.json",
    status: "pending",
  },
  {
    week: 3, title: "Entity Resolution + Cross-Ref",
    tasks: [
      "Match company names across Epiq, SBA, Delaware registry",
      "Run EntityResolver against all 20 companies",
      "Test conflict resolution on revenue field discrepancies",
      "Tune confidence thresholds based on results",
    ],
    output: "entity_resolution_report.csv",
    status: "pending",
  },
  {
    week: 4, title: "Benchmark & Publish",
    tasks: [
      "Calculate precision / recall against ground truth labels",
      "Compute overall field completeness and accuracy",
      "Generate benchmark report: target 87% completeness, 93% accuracy",
      "Identify top 3 failure modes for rule engine iteration",
    ],
    output: "galleon_benchmark_v1.pdf",
    status: "pending",
  },
];

const LIN_NODES = [
  { id:"n1", label:"CIM PDF",         x:55,  y:80,  type:"source"  },
  { id:"n2", label:"Mgmt Financials", x:55,  y:170, type:"source"  },
  { id:"n3", label:"Loan Agreement",  x:55,  y:260, type:"source"  },
  { id:"n4", label:"Text Extraction", x:215, y:125, type:"process" },
  { id:"n5", label:"Rule Engine",     x:375, y:80,  type:"process" },
  { id:"n6", label:"AI Enrichment",   x:375, y:200, type:"ai"      },
  { id:"n7", label:"Conflict Resolve",x:535, y:140, type:"process" },
  { id:"n8", label:"Credit Profile",  x:695, y:140, type:"output"  },
];
const LIN_EDGES = [["n1","n4"],["n2","n4"],["n3","n4"],["n4","n5"],["n4","n6"],["n5","n7"],["n6","n7"],["n7","n8"]];
const nodeAccent = { source:T.gold, process:T.muted, ai:T.green, output:T.gold2 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const typeColor  = t => ({ PDF:T.gold, XLSX:T.green, DOCX:T.blue, API:T.purple, TXT:T.amber, CSV:T.blue }[t] || T.muted);
const ruleColor  = t => ({ derived:T.green, regex:T.blue, logical:T.gold, covenant:T.amber, lookup:T.purple, unit:T.gold, date:T.green, numeric:T.blue }[t] || T.muted);
const scoreColor = s => s >= 90 ? T.green : s >= 70 ? T.amber : T.red;
const fmt$M      = v => `$${(+v).toFixed(1)}M`;
const fvRatio    = (fv, cost) => (fv / cost * 100).toFixed(1);

function Badge({ label, color }) {
  return (
    <span style={{ background:`${color}18`, color, border:`1px solid ${color}44`, borderRadius:3, padding:"2px 9px", fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"'DM Mono', monospace" }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = { complete:[T.green,"#0a2218"], review:[T.amber,"#231800"], processing:[T.blue,T.navy2], live:[T.green,"#062b1e"], pending:[T.muted,T.navy3], ready:[T.gold,T.navy3], integrated:[T.green,"#062b1e"], processed:[T.green,"#0a2218"], failed:[T.red,T.navy2], running:[T.blue,T.navy2] };
  const [c] = map[status] || [T.muted, T.navy2];
  const icons = { processing:"⟳ ", running:"⟳ ", live:"● ", pending:"○ ", integrated:"✓ ", ready:"◈ " };
  return <Badge label={(icons[status]||"")+status} color={c} />;
}

function ScoreArc({ score, size=64 }) {
  const r = size*0.40; const circ = 2*Math.PI*r; const fill = (score/100)*circ;
  const c = scoreColor(score);
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.navy3} strokeWidth="5"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth="5"
          strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:size*0.23, fontWeight:700, color:c, fontFamily:"'Playfair Display', serif" }}>{score}</span>
      </div>
    </div>
  );
}

function ConfBar({ val, color, width=64 }) {
  const c = color || (val > 0.9 ? T.green : val > 0.7 ? T.amber : T.red);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ height:3, width, background:T.navy3, borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${val*100}%`, background:c, borderRadius:2 }}/>
      </div>
      <span style={{ fontSize:11, color:c, fontFamily:"'DM Mono', monospace" }}>{(val*100).toFixed(0)}%</span>
    </div>
  );
}

function Skeleton({ width="100%", height=16, style={} }) {
  return (
    <div style={{ width, height, borderRadius:4, background:`linear-gradient(90deg, ${T.navy3} 25%, ${T.navy4||"#1a3355"} 50%, ${T.navy3} 75%)`, backgroundSize:"200% 100%", animation:"shimmer 1.5s infinite", ...style }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{ background:`${T.red}15`, border:`1px solid ${T.red}44`, borderRadius:8, padding:"14px 18px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ color:T.red, fontSize:16 }}>!</span>
        <span style={{ color:T.cream2, fontSize:12, fontFamily:"'DM Mono', monospace" }}>{message}</span>
      </div>
      {onRetry && (
        <button onClick={onRetry} style={{ background:T.navy3, color:T.cream2, border:`1px solid ${T.border}`, borderRadius:4, padding:"5px 14px", cursor:"pointer", fontSize:11, fontFamily:"'DM Mono', monospace" }}>
          Retry
        </button>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0" }}>
      <div style={{ flex:1, height:1, background:`linear-gradient(to right, transparent, ${T.border2})` }}/>
      <div style={{ width:5, height:5, transform:"rotate(45deg)", background:T.gold, opacity:0.5 }}/>
      <div style={{ flex:1, height:1, background:`linear-gradient(to left, transparent, ${T.border2})` }}/>
    </div>
  );
}

function MiniStat({ label, value, color, sub }) {
  return (
    <div style={{ background:T.navy3, border:`1px solid ${T.border}`, borderRadius:6, padding:"12px 16px", textAlign:"center" }}>
      <div style={{ fontSize:22, fontWeight:700, color: color||T.cream, fontFamily:"'Playfair Display', serif" }}>{value}</div>
      <div style={{ fontSize:10, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginTop:3, fontFamily:"'DM Mono', monospace" }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:T.muted2, marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function LineageGraph({ nodes, edges }) {
  const displayNodes = nodes || LIN_NODES;
  const displayEdges = edges || LIN_EDGES;
  return (
    <svg width="100%" viewBox="0 0 840 340" style={{ fontFamily:"'DM Mono', monospace" }}>
      <defs>
        <marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill={T.border2}/>
        </marker>
      </defs>
      {displayEdges.map(([f,t],i) => {
        const a = displayNodes.find(n=>n.id===f), b = displayNodes.find(n=>n.id===t);
        if (!a || !b) return null;
        const mx = (a.x+b.x)/2;
        return <path key={i} d={`M${a.x+110},${a.y+16} C${mx+55},${a.y+16} ${mx+55},${b.y+16} ${b.x},${b.y+16}`}
          fill="none" stroke={T.border2} strokeWidth="1.5" markerEnd="url(#arr)" opacity="0.8"/>;
      })}
      {displayNodes.map(n => {
        const ac = nodeAccent[n.type] || T.muted;
        return (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <rect width="110" height="32" rx="4" fill={T.navy2} stroke={ac} strokeWidth="1.2" opacity="0.95"/>
            <circle cx="-6" cy="16" r="4" fill={ac}/>
            <text x="10" y="21" fill={ac} fontSize="11" fontWeight="600">{n.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ConflictPanel({ field, sources }) {
  return (
    <div style={{ background:T.navy2, border:`1px solid ${T.border}`, borderRadius:6, padding:"14px 16px", marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ color:T.gold, fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"'DM Mono', monospace" }}>{field}</span>
        <Badge label="⚠ conflict" color={T.amber}/>
      </div>
      {sources.map((s,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:4, marginBottom:5, background:i===0?"#0a2218":T.navy3, border:i===0?`1px solid ${T.green}33`:`1px solid transparent` }}>
          <span style={{ fontSize:10, color:T.gold, fontFamily:"'DM Mono', monospace", width:140, flexShrink:0 }}>{s.src}</span>
          <span style={{ color:T.cream, fontFamily:"'DM Mono', monospace", fontSize:12, flex:1 }}>{s.val}</span>
          <ConfBar val={s.conf}/>
          {i===0 && <Badge label="✓ selected" color={T.green}/>}
        </div>
      ))}
    </div>
  );
}

// ─── Galleon Assistant ────────────────────────────────────────────────────────
function GalleonAssistant({ onNavigate, onUpload, onSelectCompany }) {
  const [open, setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]   = useState("");
  const [typing, setTyping] = useState(false);
  const [convId, setConvId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && messages.length === 0) _send("hi", true);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  async function _send(text, isGreeting = false) {
    if (!text.trim()) return;
    if (!isGreeting) setMessages(prev => [...prev, { role: "user", text }]);
    setInput("");
    setTyping(true);

    try {
      const data = await apiFetch("/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversation_id: convId, session_context: {} }),
      });

      setTyping(false);
      if (!data) {
        setMessages(prev => [...prev, { role: "assistant", text: "Connection error — is the API server running?" }]);
        return;
      }

      setConvId(data.conversation_id);
      setMessages(prev => [...prev, {
        role: "assistant",
        text: data.response,
        matches: data.company_matches,
        action: data.action,
        actionParams: data.action_params,
      }]);

      // Handle navigation / upload actions
      if (data.action === "navigate_tab" && data.action_params?.tab && onNavigate) {
        onNavigate(data.action_params.tab);
      }
    } catch {
      setTyping(false);
      setMessages(prev => [...prev, { role: "assistant", text: "Error reaching Galleon assistant." }]);
    }
  }

  const A = {
    anchor: {
      position:"fixed", bottom:24, right:24, width:52, height:52, borderRadius:"50%",
      background:T.navy3, border:`2px solid ${T.gold}`, cursor:"pointer",
      display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:`0 0 18px ${T.gold}55`, zIndex:1000,
    },
    panel: {
      position:"fixed", bottom:24, right:24, width:360, height:520,
      background:T.navy, border:`1px solid ${T.gold}55`, borderRadius:12,
      display:"flex", flexDirection:"column", zIndex:1000,
      boxShadow:`0 8px 32px rgba(0,0,0,0.65), 0 0 28px ${T.gold}22`,
      overflow:"hidden",
    },
    hdr: {
      padding:"11px 14px", background:T.navy2, borderBottom:`1px solid ${T.border}`,
      display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0,
    },
    msgs: {
      flex:1, overflowY:"auto", padding:"12px 13px",
      display:"flex", flexDirection:"column", gap:9,
    },
    bubble: role => ({
      maxWidth:"88%", alignSelf: role==="user" ? "flex-end" : "flex-start",
      background: role==="user" ? T.navy4 : T.navy2,
      border:`1px solid ${role==="user" ? T.border2 : T.border}`,
      borderRadius: role==="user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
      padding:"9px 12px", fontSize:12, color:T.cream, lineHeight:1.6,
      fontFamily:"'DM Mono', monospace", whiteSpace:"pre-wrap",
    }),
    card: {
      background:T.navy3, border:`1px solid ${T.gold}44`, borderRadius:8,
      padding:"9px 11px", marginTop:7,
    },
    cardName: { fontSize:12, fontWeight:700, color:T.gold, marginBottom:5 },
    row: { display:"flex", justifyContent:"space-between", marginBottom:3, fontSize:11 },
    val: { color:T.cream2, fontFamily:"'DM Mono', monospace" },
    btns: { display:"flex", gap:7, marginTop:8 },
    btn: primary => ({
      flex:1, padding:"5px 0", borderRadius:5, cursor:"pointer",
      border:`1px solid ${primary ? T.gold : T.border}`,
      background: primary ? `${T.gold}20` : "transparent",
      color: primary ? T.gold : T.muted, fontSize:10,
      fontFamily:"'DM Mono', monospace",
    }),
    inputRow: {
      padding:"10px 12px", background:T.navy2, borderTop:`1px solid ${T.border}`,
      display:"flex", gap:7, flexShrink:0,
    },
    inp: {
      flex:1, background:T.navy3, border:`1px solid ${T.border}`, borderRadius:8,
      padding:"7px 11px", color:T.cream, fontSize:12,
      fontFamily:"'DM Mono', monospace", outline:"none",
    },
    sendBtn: {
      padding:"7px 13px", background:T.gold, border:"none", borderRadius:8,
      color:T.navy, fontSize:13, fontWeight:700, cursor:"pointer",
    },
    dot: delay => ({
      width:6, height:6, borderRadius:"50%", background:T.muted,
      animation:"blink 1.2s infinite", animationDelay:delay,
    }),
  };

  if (!open) {
    return (
      <button style={A.anchor} onClick={() => setOpen(true)} title="Open Galleon Assistant">
        <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
          <path d="M4 20 Q14 8 24 20" stroke={T.gold} strokeWidth="1.8" fill="none"/>
          <path d="M14 6 L14 20" stroke={T.gold} strokeWidth="1.5"/>
          <path d="M14 8 L20 14 L14 14 Z" fill={T.gold} opacity="0.7"/>
          <path d="M4 20 Q14 24 24 20 L24 22 Q14 27 4 22 Z" fill={T.gold} opacity="0.4"/>
        </svg>
      </button>
    );
  }

  return (
    <div style={A.panel}>
      {/* Header */}
      <div style={A.hdr}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.gold, fontFamily:"'DM Mono', monospace", letterSpacing:"0.1em" }}>⚓ GALLEON</div>
          <div style={{ fontSize:10, color:T.muted, fontFamily:"'DM Mono', monospace" }}>Private Credit Assistant</div>
        </div>
        <button style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:17, lineHeight:1 }}
          onClick={() => setOpen(false)}>✕</button>
      </div>

      {/* Messages */}
      <div style={A.msgs}>
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "assistant" && (
              <div style={{ fontSize:9, color:T.muted, fontFamily:"'DM Mono', monospace", marginBottom:3, letterSpacing:"0.08em" }}>GALLEON</div>
            )}
            <div style={A.bubble(msg.role)}>{msg.text}</div>

            {/* Company match cards */}
            {msg.matches && msg.matches.map((co, j) => (
              <div key={j} style={A.card}>
                <div style={A.cardName}>{co.company_name}</div>
                {co.source_bdc && (
                  <div style={A.row}><span style={{ color:T.muted }}>BDC</span><span style={A.val}>{co.source_bdc}</span></div>
                )}
                {co.sector && (
                  <div style={A.row}><span style={{ color:T.muted }}>Sector</span><span style={A.val}>{co.sector}</span></div>
                )}
                {co.facility_type && (
                  <div style={A.row}><span style={{ color:T.muted }}>Facility</span><span style={A.val}>{co.facility_type}</span></div>
                )}
                {co.pricing_spread && (
                  <div style={A.row}><span style={{ color:T.muted }}>Spread</span><span style={{ ...A.val, color:T.green }}>{co.pricing_spread}</span></div>
                )}
                {co.fair_value_usd && (
                  <div style={A.row}><span style={{ color:T.muted }}>Fair Value</span><span style={A.val}>${(co.fair_value_usd/1e6).toFixed(1)}M</span></div>
                )}
                {co.maturity_date && (
                  <div style={A.row}><span style={{ color:T.muted }}>Maturity</span><span style={A.val}>{co.maturity_date}</span></div>
                )}
                {co.non_accrual && (
                  <div style={{ color:T.red, fontSize:10, marginTop:3, fontFamily:"'DM Mono', monospace" }}>⚠ Non-Accrual</div>
                )}
                <div style={A.btns}>
                  <button style={A.btn(true)} onClick={() => { onUpload && onUpload(co.company_name); }}>Upload Docs</button>
                  <button style={A.btn(false)} onClick={() => { onSelectCompany && onSelectCompany(co); onNavigate && onNavigate("profiles"); }}>View Profile</button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {typing && (
          <div>
            <div style={{ fontSize:9, color:T.muted, fontFamily:"'DM Mono', monospace", marginBottom:3 }}>GALLEON</div>
            <div style={{ ...A.bubble("assistant"), display:"flex", gap:5, alignItems:"center", padding:"11px 14px" }}>
              <div style={A.dot("0s")}/><div style={A.dot("0.2s")}/><div style={A.dot("0.4s")}/>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input bar */}
      <div style={A.inputRow}>
        <input
          style={A.inp}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _send(input); } }}
          placeholder="Search company or ask anything..."
        />
        <button style={A.sendBtn} onClick={() => _send(input)}>→</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
// ─── Error Boundary ──────────────────────────────────────────────────────────
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[Galleon] Uncaught error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40, textAlign: "center", fontFamily: "system-ui",
          color: "#334155", maxWidth: 500, margin: "80px auto"
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9888;</div>
          <h2 style={{ margin: "0 0 8px" }}>Something went wrong</h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "1px solid #cbd5e1",
              background: "#f8fafc", cursor: "pointer", fontSize: 14
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // ── Existing UI state ────────────────────────────────────────────────────────
  const [tab, setTab]             = useState("dashboard");
  const [company, setCompany]     = useState(COMPANIES[0]);
  const [category, setCategory]   = useState("financial");
  const [step, setStep]           = useState(0);
  const [running, setRunning]     = useState(false);
  const [vtab, setVtab]           = useState("portfolio");
  const [selRecord, setSelRecord] = useState(ARCC_PORTFOLIO[0]);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep]       = useState(-1);
  const pipeRef = useRef(null);

  // ── API data state ───────────────────────────────────────────────────────────
  const [apiStatus,     setApiStatus]     = useState(null);
  const [apiCompanies,  setApiCompanies]  = useState(null);
  const [apiDocuments,  setApiDocuments]  = useState(null);
  const [apiRules,      setApiRules]      = useState(null);
  const [apiGT,         setApiGT]         = useState(null);
  const [apiBenchmark,  setApiBenchmark]  = useState(null);
  const [apiConflicts,  setApiConflicts]  = useState(null);
  const [apiBdcUniverse, setApiBdcUniverse] = useState(null);
  const [bdcSearchQuery, setBdcSearchQuery] = useState("");
  const [bdcSearchResults, setBdcSearchResults] = useState(null);
  const [companyFields, setCompanyFields] = useState([]);

  // ── Upload state ─────────────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [uploadCompanyName, setUploadCompanyName] = useState("");
  const [uploadFile,        setUploadFile]        = useState(null);
  const [uploadStatus,      setUploadStatus]      = useState(null); // null|uploading|running|complete|failed
  const [activePipeline,    setActivePipeline]    = useState(null);
  const [livePipelineSteps, setLivePipelineSteps] = useState([]);
  const [livePipelineResult,setLivePipelineResult]= useState(null);

  // ── Research tab state ──────────────────────────────────────────────────────
  const [researchQuery,   setResearchQuery]   = useState("");
  const [researchResults, setResearchResults] = useState(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchSources, setResearchSources] = useState(new Set(["fdic","usaspending","opencorporates","ucc","bdc"]));

  // ── Cross-Reference state ──────────────────────────────────────────────────
  const [crossRefs, setCrossRefs]         = useState(null);
  const [crossRefStats, setCrossRefStats] = useState(null);
  const [crossRefExpanded, setCrossRefExpanded] = useState(null);

  // ── Temporal state ────────────────────────────────────────────────────────
  const [temporalStats, setTemporalStats]     = useState(null);
  const [temporalWarnings, setTemporalWarnings] = useState(null);
  const [temporalBuilding, setTemporalBuilding] = useState(false);
  const [temporalTimeline, setTemporalTimeline] = useState(null);
  const [temporalSelectedCo, setTemporalSelectedCo] = useState(null);

  // ── Monitor / Alerts state ────────────────────────────────────────────────
  const [monitorAlerts, setMonitorAlerts]   = useState(null);
  const [monitorStatus, setMonitorStatus]   = useState(null);
  const [alertsOpen, setAlertsOpen]         = useState(false);

  // ── Workflow state ────────────────────────────────────────────────────────
  const [dealReviews, setDealReviews]       = useState(null);
  const [exposure, setExposure]             = useState(null);
  const [workflowVtab, setWorkflowVtab]    = useState("board");
  const [newReviewName, setNewReviewName]   = useState("");

  // ── Error state ──────────────────────────────────────────────────────────────
  const [apiErrors, setApiErrors] = useState({});

  // ── Toast state ─────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type="info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // ── Responsive ─────────────────────────────────────────────────────────────
  const [winWidth, setWinWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handleResize = () => setWinWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const isMobile = winWidth < 768;
  const isTablet = winWidth < 1024;

  // ── EDGAR pull state ─────────────────────────────────────────────────────────
  const [edgarPipelineId, setEdgarPipelineId] = useState(null);
  const [edgarRunStatus,  setEdgarRunStatus]  = useState(null); // null|running|complete|failed

  // ── Existing animations ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setStep(s => { if(s>=7){setRunning(false);clearInterval(t);return 7;} return s+1; }), 380);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!pipelineRunning) return;
    pipeRef.current = setInterval(() => setPipelineStep(s => {
      if (s >= 5) { setPipelineRunning(false); clearInterval(pipeRef.current); return 5; }
      return s + 1;
    }), 700);
    return () => clearInterval(pipeRef.current);
  }, [pipelineRunning]);

  // ── Initial API fetch ────────────────────────────────────────────────────────
  const fetchWithError = (path, setter, key) => {
    apiFetch(path).then(d => {
      if (d) { setter(d); setApiErrors(prev => { const n = {...prev}; delete n[key]; return n; }); }
      else { setApiErrors(prev => ({...prev, [key]: `Failed to fetch ${path}`})); }
    });
  };
  const refreshAll = () => {
    fetchWithError("/health", setApiStatus, "health");
    fetchWithError("/companies", setApiCompanies, "companies");
    fetchWithError("/documents", setApiDocuments, "documents");
    fetchWithError("/rules", setApiRules, "rules");
    fetchWithError("/edgar/ground-truth", setApiGT, "gt");
    fetchWithError("/validation/benchmark", setApiBenchmark, "benchmark");
    fetchWithError("/conflicts", setApiConflicts, "conflicts");
    fetchWithError("/bdc/universe", setApiBdcUniverse, "bdc_universe");
    // New feature data
    apiFetch("/bdc/cross-references?min_holders=2&limit=50").then(d => { if (d) setCrossRefs(d); });
    apiFetch("/bdc/cross-reference-stats").then(d => { if (d) setCrossRefStats(d); });
    apiFetch("/temporal/stats").then(d => { if (d) setTemporalStats(d); });
    apiFetch("/temporal/warnings?min_quarters=2").then(d => { if (d) setTemporalWarnings(d); });
    apiFetch("/monitor/alerts?limit=20").then(d => { if (d) setMonitorAlerts(d); });
    apiFetch("/monitor/status").then(d => { if (d) setMonitorStatus(d); });
    apiFetch("/workflow/reviews").then(d => { if (d) setDealReviews(d); });
    apiFetch("/workflow/exposure").then(d => { if (d) setExposure(d); });
  };
  useEffect(() => { refreshAll(); }, []);

  // Poll alerts every 30 seconds
  useEffect(() => {
    const t = setInterval(() => {
      apiFetch("/monitor/alerts?limit=20").then(d => { if (d) setMonitorAlerts(d); });
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // ── When GT data arrives, seed the selected record ───────────────────────────
  useEffect(() => {
    if (!apiGT || apiGT.length === 0) return;
    const rec = apiGT[0];
    const gt  = rec.ground_truth || {};
    setSelRecord({
      id: rec.galleon_id,
      company: rec.company?.name || "",
      sector:  rec.company?.sector || "",
      facility: gt.facility_type || "—",
      spread:   gt.pricing_spread || "—",
      maturity: gt.maturity_date  || "—",
      fv:   (gt.fair_value_usd  || 0) / 1e6,
      cost: (gt.cost_basis_usd  || 0) / 1e6,
      pct:  gt.pct_net_assets   || 0,
      pik:  gt.pik_rate || null,
      nonAccrual: !!gt.non_accrual,
    });
  }, [apiGT]);

  // ── Auto-select first API company when data loads (replaces static default) ───
  useEffect(() => {
    if (!apiCompanies || apiCompanies.length === 0) return;
    if (company && !/^C\d$/.test(company.id)) return; // already on a real company
    const first = apiCompanies[0];
    setCompany({
      id: first.id, name: first.name, sector: first.sector || "—",
      status: first.pipeline_status === "complete" ? "complete" : "processing",
      score: Math.round(first.completeness || 0),
      leverage: "—", revenue: "—", ebitda: "—",
      fields: first.fields_extracted || 0, conflicts: first.conflicts || 0,
    });
  }, [apiCompanies]);

  // ── Fetch fields when company changes (skip static dummies) ──────────────────
  useEffect(() => {
    setCompanyFields([]);
    if (!company?.id || /^C\d$/.test(company.id)) return; // skip static "C1"-"C4"
    apiFetch(`/companies/${company.id}/fields`).then(d => {
      if (d && d.length > 0) setCompanyFields(d);
    });
  }, [company?.id]);

  // ── Poll active upload pipeline ───────────────────────────────────────────────
  useEffect(() => {
    if (!activePipeline || uploadStatus === "complete" || uploadStatus === "failed") return;
    const t = setInterval(async () => {
      const [status, steps] = await Promise.all([
        apiFetch(`/pipeline/${activePipeline}`),
        apiFetch(`/pipeline/${activePipeline}/steps`),
      ]);
      if (status) {
        setLivePipelineResult(status);
        if (steps) setLivePipelineSteps(steps);
        if (status.status === "complete" || status.status === "failed") {
          setUploadStatus(status.status);
          clearInterval(t);
          addToast(status.status === "complete" ? "Upload extraction complete" : "Upload extraction failed", status.status === "complete" ? "success" : "error");
          apiFetch("/companies").then(d => { if (d) setApiCompanies(d); });
          apiFetch("/documents").then(d => { if (d) setApiDocuments(d); });
        }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [activePipeline, uploadStatus]);

  // ── Poll EDGAR pull pipeline ─────────────────────────────────────────────────
  useEffect(() => {
    if (!edgarPipelineId || edgarRunStatus === "complete" || edgarRunStatus === "failed") return;
    const t = setInterval(async () => {
      const status = await apiFetch(`/pipeline/${edgarPipelineId}`);
      if (status?.status === "complete" || status?.status === "failed") {
        setEdgarRunStatus(status.status);
        setPipelineRunning(false);
        clearInterval(t);
        addToast(status.status === "complete" ? "EDGAR pull complete" : "EDGAR pull failed", status.status === "complete" ? "success" : "error");
        if (status.status === "complete") {
          apiFetch("/edgar/ground-truth").then(d => { if (d) setApiGT(d); });
          apiFetch("/validation/benchmark").then(d => { if (d) setApiBenchmark(d); });
        }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [edgarPipelineId, edgarRunStatus]);

  // ── Data mappings: API → UI shape (with static fallbacks) ────────────────────
  const uiCompanies = useMemo(() => {
    if (!apiCompanies || apiCompanies.length === 0) return COMPANIES;
    return apiCompanies.map(c => {
      const pipelineDone = c.pipeline_status === "complete";
      const completeness = c.completeness ?? 0;
      const status = pipelineDone && completeness >= 80 ? "complete"
                   : pipelineDone && completeness >= 50 ? "review"
                   : pipelineDone                       ? "processed"
                   : c.pipeline_status === "running"    ? "processing"
                   : "pending";
      return {
        id:       c.id,
        name:     c.name,
        sector:   c.sector || "—",
        status,
        score:    Math.round(completeness),
        leverage: "—", revenue: "—", ebitda: "—",
        fields:   c.fields_extracted || 0,
        conflicts: c.conflicts || 0,
      };
    });
  }, [apiCompanies]);

  // Strip leading UUID prefix from stored filenames (e.g. "uuid_original.pdf" → "original.pdf")
  const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;
  const stripUuid = name => { let s = name; while (UUID_PREFIX.test(s)) s = s.replace(UUID_PREFIX, ""); return s; };

  const uiDocuments = useMemo(() => {
    if (!apiDocuments || apiDocuments.length === 0) return SOURCES;
    return apiDocuments.map(d => {
      const cleanName = stripUuid(d.filename || "");
      const ext = cleanName.split(".").pop()?.toUpperCase() || "PDF";
      const typeMap = { PDF:"PDF", XLSX:"XLSX", DOCX:"DOCX", CSV:"CSV", JSON:"API", TXT:"TXT" };
      return { id: d.id, name: cleanName, type: typeMap[ext] || ext, status: d.status, fields: d.fields_extracted || 0, conf: 0.90 };
    });
  }, [apiDocuments]);

  const uiRules = useMemo(() => {
    if (!apiRules || apiRules.length === 0) return RULE_ENGINE;
    return apiRules.map(r => ({ id: r.rule_id, name: r.name, field: r.field, type: r.type, rule: r.logic || "", pattern: r.logic || "", conf: r.base_confidence, pass_rate: r.pass_rate }));
  }, [apiRules]);

  const uiGT = useMemo(() => {
    if (!apiGT || apiGT.length === 0) return ARCC_PORTFOLIO;
    return apiGT.map(rec => {
      const gt = rec.ground_truth || {};
      return {
        id: rec.galleon_id,
        company: rec.company?.name || "",
        sector:  rec.company?.sector || "",
        facility: gt.facility_type || "—",
        spread:   gt.pricing_spread || "—",
        maturity: gt.maturity_date  || "—",
        fv:   (gt.fair_value_usd  || 0) / 1e6,
        cost: (gt.cost_basis_usd  || 0) / 1e6,
        pct:  gt.pct_net_assets   || 0,
        pik:  gt.pik_rate || null,
        nonAccrual: !!gt.non_accrual,
      };
    });
  }, [apiGT]);

  const uiBenchmark = useMemo(() => {
    if (!apiBenchmark) return VALIDATION_STATS;
    return {
      records:          apiBenchmark.records,
      gt_fields:        apiBenchmark.gt_fields,
      target_fields:    120,
      bdc_coverage:     apiBenchmark.bdc_coverage,
      galleon_gap:      apiBenchmark.galleon_gap,
      avg_rule_pass:    VALIDATION_STATS.avg_rule_pass,
      conflicts:        apiConflicts ? apiConflicts.length : VALIDATION_STATS.conflicts,
      entity_match_rate: VALIDATION_STATS.entity_match_rate,
    };
  }, [apiBenchmark, apiConflicts]);

  const uiConflicts = useMemo(() => {
    if (!apiConflicts || apiConflicts.length === 0) return CONFLICTS;
    return apiConflicts.map(c => ({
      field:   c.field,
      sources: [{ src: c.company || "Source A", val: c.delta || "—", conf: 0.90 }],
    }));
  }, [apiConflicts]);

  // Stable random field values per company — memoised to avoid re-shuffling on re-renders
  const randomFieldValues = useMemo(() => {
    const vals = {};
    Object.values(FIELD_SCHEMA).flat().forEach(f => {
      vals[f] = { filled: Math.random() > 0.15, conf: 0.75 + Math.random() * 0.25, srcIdx: Math.floor(Math.random() * 4) };
    });
    return vals;
  }, [company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload handler ────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploadStatus("uploading");
    setLivePipelineSteps([]);
    setLivePipelineResult(null);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("company_name", uploadCompanyName.trim() || uploadFile.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    const res = await apiFetch("/documents/upload", { method: "POST", body: fd });
    if (!res?.pipeline_id) { setUploadStatus("failed"); return; }
    setActivePipeline(res.pipeline_id);
    setUploadStatus("running");
    setRunning(false);
    setStep(0);
  };

  // ── EDGAR pull handler ────────────────────────────────────────────────────────
  const handleEdgarRun = async () => {
    setEdgarRunStatus("running");
    setEdgarPipelineId(null);
    setPipelineStep(-1);
    setPipelineRunning(true);
    const res = await apiFetch("/edgar/pull?live=false", { method: "POST" });
    if (res?.pipeline_id) setEdgarPipelineId(res.pipeline_id);
  };

  const handleResearchSearch = async () => {
    if (!researchQuery.trim()) return;
    setResearchLoading(true);
    setResearchResults(null);
    const sources = [...researchSources].join(",");
    const data = await apiFetch(`/search/multi?q=${encodeURIComponent(researchQuery.trim())}&sources=${sources}`);
    setResearchResults(data);
    setResearchLoading(false);
  };

  const toggleResearchSource = (src) => {
    setResearchSources(prev => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src); else next.add(src);
      return next;
    });
  };

  const TABS = [
    { id:"dashboard", label:"Overview"       },
    { id:"crossref",  label:"Cross-Ref",  isNew:true },
    { id:"temporal",  label:"Temporal",    isNew:true },
    { id:"pipeline",  label:"Pipeline"       },
    { id:"profiles",  label:"Profiles"       },
    { id:"workflow",  label:"Workflow",    isNew:true },
    { id:"rules",     label:"Rules"          },
    { id:"lineage",   label:"Lineage"        },
    { id:"conflicts", label:"Conflicts"      },
    { id:"validation",label:"Validation Lab" },
    { id:"research",  label:"Research"       },
  ];

  const S = {
    app:    { background:T.navy, minHeight:"100vh", color:T.cream2 },
    header: { background:T.navy2, borderBottom:`1px solid ${T.border}`, padding:isMobile?"0 12px":"0 36px", display:"flex", alignItems:"center", gap:isMobile?12:28, height:58 },
    logo:   { display:"flex", alignItems:"center", gap:10, color:T.gold, fontFamily:"'Playfair Display', serif", fontSize:isMobile?16:20, fontWeight:700, letterSpacing:"0.04em" },
    nav:    { display:"flex", gap:2, flex:1, overflowX:isMobile?"auto":"visible", flexWrap:isMobile?"nowrap":"wrap" },
    navBtn: a => ({ background:a?T.navy3:"transparent", color:a?T.gold2:T.muted2, border:a?`1px solid ${T.border2}`:"1px solid transparent", borderRadius:4, padding:"6px 14px", cursor:"pointer", fontSize:11, fontWeight:600, letterSpacing:"0.05em", fontFamily:"'DM Mono', monospace", transition:"all 0.15s", position:"relative", whiteSpace:"nowrap" }),
    main:   { padding:isMobile?"16px 12px":"28px 36px", maxWidth:1400, margin:"0 auto" },
    card:   { background:T.navy2, border:`1px solid ${T.border}`, borderRadius:8, padding:isMobile?14:22 },
    grid2:  { display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:16, marginBottom:20 },
    grid3:  { display:"grid", gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 1fr":"1fr 1fr 1fr", gap:16, marginBottom:20 },
    grid4:  { display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":isTablet?"repeat(2,1fr)":"repeat(4,1fr)", gap:14, marginBottom:20 },
    h2:     { fontSize:22, fontWeight:700, color:T.cream, fontFamily:"'Playfair Display', serif", letterSpacing:"0.01em", margin:0 },
    sub:    { color:T.muted, fontSize:13, marginTop:5, marginBottom:0 },
    secTitle:{ fontSize:11, fontWeight:700, color:T.gold, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:14, fontFamily:"'DM Mono', monospace" },
    th:     { textAlign:"left", color:T.muted2, padding:"8px 12px", borderBottom:`1px solid ${T.border}`, fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"'DM Mono', monospace" },
    td:     { padding:"10px 12px", borderBottom:`1px solid ${T.navy3}`, color:T.cream2, verticalAlign:"middle" },
  };

  // ── Loading skeleton helper ──────────────────────────────────────────────────
  const renderLoadingSkeleton = () => (
    <div>
      <div style={S.grid4}>
        {[1,2,3,4].map(i => <div key={i} style={S.card}><Skeleton height={28} width={80} style={{ marginBottom:8 }}/><Skeleton height={12} width={120}/></div>)}
      </div>
      <div style={S.grid2}>
        <div style={S.card}>{[1,2,3].map(i => <Skeleton key={i} height={16} style={{ marginBottom:12 }}/>)}</div>
        <div style={S.card}>{[1,2,3].map(i => <Skeleton key={i} height={16} style={{ marginBottom:12 }}/>)}</div>
      </div>
    </div>
  );

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const renderDashboard = () => {
    if (apiCompanies === null && apiDocuments === null && !apiStatus) return renderLoadingSkeleton();
    const bdcTotal = apiBdcUniverse ? apiBdcUniverse.reduce((s, b) => s + b.company_count, 0) : 0;
    const bdcCount = apiBdcUniverse ? apiBdcUniverse.filter(b => b.company_count > 0).length : 0;
    const kpiItems = [
      {
        v: bdcTotal ? String(bdcTotal).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : apiCompanies ? String(apiCompanies.length) : "—",
        l: "Portfolio Companies",
        d: bdcTotal ? `Live from ${bdcCount} BDC EDGAR filings` : apiCompanies ? `${apiCompanies.length} in database` : "Loading...",
      },
      {
        v: bdcCount ? String(bdcCount) : "—",
        l: "BDCs Indexed",
        d: apiBdcUniverse ? `${apiBdcUniverse.length} tracked · ${bdcCount} with data` : "Loading...",
      },
      {
        v: apiBenchmark ? `${apiBenchmark.bdc_coverage}%` : "94.2%",
        l: "BDC Field Coverage",
        d: apiBenchmark ? `${apiBenchmark.galleon_gap}% Galleon gap` : "↑ 2.1% vs last month",
      },
      {
        v: apiConflicts ? String(apiConflicts.length) : "38",
        l: "Conflicts Pending",
        d: apiConflicts?.length === 0 ? "All resolved" : apiConflicts ? "Open conflicts" : "↓ 14 from yesterday",
      },
    ];

    return (
      <div>
        <div style={{ marginBottom:24 }}>
          <h2 style={S.h2}>Private Credit Intelligence</h2>
          <p style={S.sub}>Deterministic data structuring for non-SEC-reporting entities · Ground truth validated against ARCC EDGAR filings</p>
        </div>
        <div style={S.grid4}>
          {kpiItems.map((m,i) => (
            <div key={i} style={{ ...S.card, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(to right, ${T.gold}, ${T.gold2})`, opacity:0.6 }}/>
              <div style={{ fontSize:28, fontWeight:700, color:T.cream, fontFamily:"'Playfair Display', serif" }}>{m.v}</div>
              <div style={{ fontSize:10, color:T.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:4, fontFamily:"'DM Mono', monospace" }}>{m.l}</div>
              <div style={{ fontSize:11, color:T.green, marginTop:5 }}>{m.d}</div>
            </div>
          ))}
        </div>
        <div style={S.grid2}>
          <div style={S.card}>
            <div style={S.secTitle}>Recent Ingestions</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["Source","Type","Fields","Confidence","Status"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {uiDocuments.slice(0,5).map(s => (
                  <tr key={s.id}>
                    <td style={S.td}>{s.name}</td>
                    <td style={S.td}><Badge label={s.type} color={typeColor(s.type)}/></td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace" }}>{s.fields}</td>
                    <td style={S.td}><ConfBar val={s.conf}/></td>
                    <td style={S.td}><StatusBadge status={s.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={S.card}>
            <div style={S.secTitle}>Portfolio Queue</div>
            {uiCompanies.map(c => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${T.navy3}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T.cream }}>{c.name}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{c.sector} · {c.fields || "—"} fields · {c.conflicts} conflicts</div>
                </div>
                <ScoreArc score={c.score} size={44}/>
                <StatusBadge status={c.status}/>
              </div>
            ))}
          </div>
        </div>
        {/* SOLVE vs Galleon coverage banner */}
        <div style={{ ...S.card, borderLeft:`3px solid ${T.gold}`, background:T.navy3 }}>
          <div style={S.secTitle}>Field Coverage: BDC Filing (SOLVE) vs. Raw Documents (Galleon)</div>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
            <div style={{ height:8, width:`${uiBenchmark.bdc_coverage}%`, background:T.blue, borderRadius:2 }}/>
            <div style={{ height:8, width:`${uiBenchmark.galleon_gap}%`, background:T.gold, borderRadius:2 }}/>
            <span style={{ fontSize:11, color:T.muted, fontFamily:"'DM Mono', monospace", whiteSpace:"nowrap" }}>100% of schema</span>
          </div>
          <div style={{ display:"flex", gap:24, fontSize:11 }}>
            <span style={{ color:T.blue }}>■ {uiBenchmark.bdc_coverage}% — BDC-reported (loan terms, FV, spread, maturity)</span>
            <span style={{ color:T.gold }}>■ {uiBenchmark.galleon_gap}% — Galleon must extract (revenue, EBITDA, covenants, ops)</span>
          </div>
          <div style={{ marginTop:10, fontSize:11, color:T.muted }}>
            SOLVE sees the loan. Galleon sees the borrower. These are non-overlapping data sets.
          </div>
        </div>

        {/* BDC Universe Index */}
        <div style={S.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={S.secTitle}>BDC Universe — Live EDGAR Index</div>
            <span style={{ fontSize:11, color:T.green, fontFamily:"'DM Mono', monospace" }}>
              {bdcTotal ? `${bdcTotal.toLocaleString()} companies · ${bdcCount} BDCs` : "Loading..."}
            </span>
          </div>
          {apiBdcUniverse && (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["BDC","CIK","Companies","Last Filed","Coverage"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {apiBdcUniverse
                  .sort((a,b) => b.company_count - a.company_count)
                  .map(bdc => (
                  <tr key={bdc.ticker} style={{ borderBottom:`1px solid ${T.navy3}` }}>
                    <td style={{ ...S.td, fontWeight:600, color:T.gold }}>{bdc.ticker}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:T.muted }}>{bdc.cik}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color: bdc.company_count > 0 ? T.cream : T.muted }}>
                      {bdc.company_count > 0 ? bdc.company_count.toLocaleString() : "—"}
                    </td>
                    <td style={{ ...S.td, color:T.muted }}>{bdc.last_indexed || "—"}</td>
                    <td style={S.td}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ height:6, width: Math.min(100, Math.max(4, (bdc.company_count / (bdcTotal || 1)) * 300)), background: bdc.company_count > 50 ? T.green : bdc.company_count > 0 ? T.blue : T.muted, borderRadius:2 }}/>
                        <span style={{ fontSize:10, color:T.muted, fontFamily:"'DM Mono', monospace" }}>
                          {bdcTotal ? ((bdc.company_count / bdcTotal) * 100).toFixed(1) + "%" : ""}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Company Search */}
        <div style={S.card}>
          <div style={S.secTitle}>Search Portfolio Companies</div>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <input
              value={bdcSearchQuery}
              onChange={e => setBdcSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && bdcSearchQuery.trim()) {
                  apiFetch(`/companies/search?q=${encodeURIComponent(bdcSearchQuery.trim())}&limit=20`).then(d => setBdcSearchResults(d));
                }
              }}
              placeholder="Search 1,600+ companies (e.g., Anaplan, Auctane, Banyan...)"
              style={{ flex:1, padding:"8px 12px", background:T.navy3, border:`1px solid ${T.navy3}`, borderRadius:4, color:T.cream, fontSize:12, outline:"none" }}
            />
            <button
              onClick={() => {
                if (bdcSearchQuery.trim()) {
                  apiFetch(`/companies/search?q=${encodeURIComponent(bdcSearchQuery.trim())}&limit=20`).then(d => setBdcSearchResults(d));
                }
              }}
              style={{ padding:"8px 16px", background:T.gold, color:T.navy, border:"none", borderRadius:4, fontSize:12, fontWeight:600, cursor:"pointer" }}
            >Search</button>
          </div>
          {bdcSearchResults && bdcSearchResults.length > 0 && (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["Company","BDC","Sector","Facility","Spread","Fair Value","Conf."].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {bdcSearchResults.map((co,i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${T.navy3}` }}>
                    <td style={{ ...S.td, fontWeight:600, color:T.cream, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{co.company_name}</td>
                    <td style={{ ...S.td, color:T.gold }}>{co.source_bdc}</td>
                    <td style={{ ...S.td, color:T.muted }}>{co.sector || "—"}</td>
                    <td style={{ ...S.td, color:T.muted, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{co.facility_type || "—"}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:T.blue }}>{co.pricing_spread || "—"}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:T.green }}>
                      {co.fair_value_usd ? `$${(co.fair_value_usd/1e6).toFixed(1)}M` : "—"}
                    </td>
                    <td style={S.td}><ConfBar val={co.match_confidence * 100}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {bdcSearchResults && bdcSearchResults.length === 0 && (
            <div style={{ fontSize:12, color:T.muted, padding:12 }}>No results found.</div>
          )}
        </div>
      </div>
    );
  };

  // ── Pipeline ───────────────────────────────────────────────────────────────
  const renderPipeline = () => {
    // If a real upload pipeline is running, drive the step animation from live steps
    const liveCompletedSteps = livePipelineSteps.filter(s => s.status === "complete").length;
    const displayStep   = uploadStatus === "running" || uploadStatus === "complete" ? liveCompletedSteps : step;
    const displayRunning = uploadStatus === "running" || running;

    const pipeStats = livePipelineResult ? [
      { l:"Fields Found", v: String(livePipelineResult.fields_extracted ?? "—") },
      { l:"Confidence",   v: livePipelineResult.avg_confidence != null ? `${(livePipelineResult.avg_confidence*100).toFixed(0)}%` : "—" },
      { l:"Conflicts",    v: String(livePipelineResult.conflicts ?? "—") },
      { l:"Status",       v: livePipelineResult.status || "—" },
      { l:"Pipeline ID",  v: (activePipeline || "").slice(0,8) + "…" },
    ] : [
      { l:"Documents",   v:"5"    },
      { l:"Fields Found",v:"87"   },
      { l:"Confidence",  v:"91%"  },
      { l:"Rules Run",   v:"141"  },
      { l:"Conflicts",   v:"2"    },
    ];

    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div>
            <h2 style={S.h2}>Processing Pipeline</h2>
            <p style={S.sub}>8-stage deterministic extraction with AI gap-fill</p>
          </div>
          <button onClick={() => { setStep(0); setRunning(true); setUploadStatus(null); setLivePipelineResult(null); }}
            style={{ background:T.gold, color:T.navy, border:"none", borderRadius:5, padding:"9px 20px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>
            ▶ Demo Run
          </button>
        </div>

        {/* Upload card */}
        <div style={{ ...S.card, marginBottom:20 }}>
          <div style={S.secTitle}>Upload Document for Extraction</div>
          <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
            <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.docx,.txt"
              style={{ display:"none" }}
              onChange={e => { setUploadFile(e.target.files[0]); setUploadStatus(null); setLivePipelineResult(null); }}/>
            <button onClick={() => fileInputRef.current.click()}
              style={{ background:T.navy3, color:T.cream2, border:`1px solid ${T.border2}`, borderRadius:5, padding:"8px 16px", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"'DM Mono', monospace" }}>
              Choose File
            </button>
            {uploadFile && (
              <span style={{ fontSize:12, color:T.muted, fontFamily:"'DM Mono', monospace" }}>
                {uploadFile.name} ({(uploadFile.size/1024).toFixed(0)} KB)
              </span>
            )}
            <input
              type="text" placeholder="Company name (optional)"
              value={uploadCompanyName}
              onChange={e => setUploadCompanyName(e.target.value)}
              style={{ background:T.navy3, border:`1px solid ${T.border}`, borderRadius:5, padding:"8px 12px", color:T.cream, fontSize:12, fontFamily:"'DM Mono', monospace", outline:"none", width:200 }}
            />
            <button
              onClick={handleUpload}
              disabled={!uploadFile || uploadStatus === "uploading" || uploadStatus === "running"}
              style={{
                background: (!uploadFile || uploadStatus === "uploading" || uploadStatus === "running") ? T.navy3 : T.gold,
                color: (!uploadFile || uploadStatus === "uploading" || uploadStatus === "running") ? T.muted : T.navy,
                border:"none", borderRadius:5, padding:"8px 18px", cursor: uploadFile ? "pointer" : "not-allowed",
                fontSize:12, fontWeight:700, fontFamily:"'DM Mono', monospace",
              }}>
              {uploadStatus === "uploading" ? "⟳ Uploading…" : uploadStatus === "running" ? "⟳ Extracting…" : "▶ Upload & Extract"}
            </button>
            {uploadStatus === "complete" && (
              <Badge label="✓ complete" color={T.green}/>
            )}
            {uploadStatus === "failed" && (
              <Badge label="✗ failed" color={T.red}/>
            )}
            {activePipeline && (
              <span style={{ fontSize:10, color:T.muted2, fontFamily:"'DM Mono', monospace" }}>
                pipeline: {activePipeline.slice(0,8)}…
              </span>
            )}
          </div>
        </div>

        <div style={{ display:"flex", gap:0, marginBottom:24 }}>
          {PIPELINE_STEPS.map((ps,i) => {
            const active = displayRunning && displayStep === i;
            const done   = displayStep > i;
            const c = done ? T.green : active ? T.gold : T.muted2;
            return (
              <div key={i} style={{ flex:1, textAlign:"center", position:"relative" }}>
                <div style={{ width:42, height:42, borderRadius:"50%", background:done?"#0a2218":active?`${T.gold}18`:T.navy3, border:`2px solid ${c}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 8px", fontSize:18, transition:"all 0.3s" }}>
                  {done ? <span style={{ color:T.green, fontSize:14 }}>✓</span> : <span style={{ color:c }}>{ps.icon}</span>}
                </div>
                <div style={{ fontSize:10, fontWeight:700, color:c, fontFamily:"'DM Mono', monospace", letterSpacing:"0.05em" }}>{ps.label}</div>
                <div style={{ fontSize:9, color:T.muted2, marginTop:3 }}>{ps.desc}</div>
                {i < 7 && <div style={{ position:"absolute", top:20, right:0, width:"50%", height:2, background:done?T.green:T.border, transition:"background 0.3s" }}/>}
                {i > 0 && <div style={{ position:"absolute", top:20, left:0, width:"50%", height:2, background:done||active?T.green:T.border }}/>}
              </div>
            );
          })}
        </div>
        <div style={S.card}>
          <div style={S.secTitle}>
            {livePipelineResult ? `Active Job — ${uploadFile?.name || "Uploaded Document"}` : "Active Job — Meridian Industrial Corp"}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:`repeat(${pipeStats.length},1fr)`, gap:12 }}>
            {pipeStats.map((m,i) => (
              <div key={i} style={{ padding:"12px 16px", background:T.navy3, borderRadius:6, textAlign:"center" }}>
                <div style={{ fontSize:20, fontWeight:700, color:T.cream, fontFamily:"'Playfair Display', serif" }}>{m.v}</div>
                <div style={{ fontSize:10, color:T.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginTop:4, fontFamily:"'DM Mono', monospace" }}>{m.l}</div>
              </div>
            ))}
          </div>
          {livePipelineSteps.length > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={S.secTitle}>Step Breakdown</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {livePipelineSteps.map((s,i) => (
                  <div key={i} style={{ padding:"8px 12px", background:T.navy3, borderRadius:5, border:`1px solid ${s.status==="complete"?T.green+"44":T.border}` }}>
                    <div style={{ fontSize:10, color:T.gold, fontFamily:"'DM Mono', monospace" }}>{s.step_name}</div>
                    <div style={{ fontSize:11, color:s.status==="complete"?T.green:T.muted, marginTop:3 }}>
                      {s.status === "complete" ? `✓ ${s.items_out != null ? s.items_out+" items" : "done"}` : s.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Rules ──────────────────────────────────────────────────────────────────
  // Compute rule type summary (must be at top level, not inside renderRules)
  const ruleTypeCounts = useMemo(() => {
    const counts = {};
    uiRules.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    const labelMap = { regex:"Regex / Format", derived:"Derived Fields", covenant:"Covenant Checks", unit:"Unit Normalize", logical:"Logical Sanity", numeric:"Numeric Norm", lookup:"Lookup", date:"Date Parse" };
    const colorMap = { regex:T.blue, derived:T.green, covenant:T.amber, unit:T.gold, logical:T.purple, numeric:T.blue, lookup:T.purple, date:T.green };
    return Object.entries(counts).map(([type, n]) => ({ n, l: labelMap[type] || type, c: colorMap[type] || T.muted }));
  }, [uiRules]);

  const renderRules = () => {

    return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={S.h2}>Rule Engine</h2>
        <p style={S.sub}>{uiRules.length} deterministic validators — regex, logical, derived, covenant, unit normalizers</p>
      </div>
      <div style={{ display:"flex", gap:14, marginBottom:20, flexWrap:"wrap" }}>
        {ruleTypeCounts.map((r,i) => (
          <div key={i} style={{ background:T.navy3, border:`1px solid ${r.c}33`, borderRadius:6, padding:"14px 20px", minWidth:120, textAlign:"center" }}>
            <div style={{ fontSize:26, fontWeight:700, color:r.c, fontFamily:"'Playfair Display', serif" }}>{r.n}</div>
            <div style={{ fontSize:10, color:T.muted, marginTop:4, textTransform:"uppercase", letterSpacing:"0.07em", fontFamily:"'DM Mono', monospace" }}>{r.l}</div>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={S.secTitle}>Rule Registry — Active Rules {apiRules && <span style={{ color:T.muted, fontWeight:400 }}>({uiRules.length} loaded from API)</span>}</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["Rule ID","Name","Target Field","Type","Logic","Confidence","Pass Rate"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {uiRules.map(r => (
              <tr key={r.id}>
                <td style={{ ...S.td, color:T.gold, fontFamily:"'DM Mono', monospace" }}>{r.id}</td>
                <td style={{ ...S.td, fontWeight:600 }}>{r.name}</td>
                <td style={{ ...S.td, color:T.blue, fontFamily:"'DM Mono', monospace" }}>{r.field}</td>
                <td style={S.td}><Badge label={r.type} color={ruleColor(r.type)}/></td>
                <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", fontSize:11, color:T.muted }}>{r.rule||r.pattern}</td>
                <td style={S.td}><ConfBar val={r.conf} color={r.conf===1.0?T.green:T.amber}/></td>
                <td style={S.td}>{r.pass_rate != null ? <ConfBar val={r.pass_rate/100} color={r.pass_rate>=90?T.green:r.pass_rate>=70?T.amber:T.red}/> : <span style={{ color:T.muted2, fontSize:11 }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Divider/>
        <div style={S.secTitle}>Derived Field Formulae</div>
        <div style={{ background:T.navy3, borderRadius:6, padding:"14px 18px", fontFamily:"'DM Mono', monospace", fontSize:12, lineHeight:2.2 }}>
          {[
            ["leverage_ratio",   "total_debt / ebitda_ttm"],
            ["interest_coverage","ebitda_ttm / interest_expense_ttm"],
            ["dscr",             "(net_income + d&a) / total_debt_service"],
            ["net_debt_ebitda",  "(total_debt - cash) / ebitda_ttm"],
            ["ebitda_margin",    "ebitda_ttm / revenue_ttm"],
          ].map(([f,v],i) => (
            <div key={i}>
              <span style={{ color:T.gold }}>{f}</span>
              <span style={{ color:T.muted }}> = </span>
              <span style={{ color:T.green }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  };

  // ── Profiles ───────────────────────────────────────────────────────────────
  const renderProfiles = () => (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={S.h2}>Credit Profiles</h2>
        <p style={S.sub}>Normalized company data with field-level provenance tracking</p>
      </div>
      <div style={{ display:"flex", gap:16, flexDirection:isMobile?"column":"row" }}>
        <div style={{ width:isMobile?"100%":210, flexShrink:0 }}>
          {uiCompanies.map(c => (
            <div key={c.id} onClick={() => setCompany(c)}
              style={{ padding:"10px 14px", marginBottom:6, borderRadius:6, cursor:"pointer", background:company?.id===c.id?T.navy3:"transparent", border:`1px solid ${company?.id===c.id?T.border2:"transparent"}`, transition:"all 0.15s" }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.cream, fontFamily:"'Playfair Display', serif" }}>{c.name}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{c.sector}</div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:5 }}>
                <div style={{ height:3, width:44, background:T.navy3, borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${c.score}%`, background:scoreColor(c.score), borderRadius:2 }}/>
                </div>
                <span style={{ fontSize:10, color:T.muted, fontFamily:"'DM Mono', monospace" }}>{c.score}%</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex:1 }}>
          {company && (
            <div style={S.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                <div>
                  <h3 style={{ margin:0, color:T.cream, fontSize:20, fontWeight:700, fontFamily:"'Playfair Display', serif" }}>{company.name}</h3>
                  <div style={{ color:T.muted, fontSize:12, marginTop:4 }}>
                    {company.sector}
                    {companyFields.length > 0 && ` · ${companyFields.length} fields extracted`}
                  </div>
                </div>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <StatusBadge status={company.status}/>
                  <div style={{ textAlign:"center" }}>
                    <ScoreArc score={company.score}/>
                    <div style={{ fontSize:9, color:T.muted, marginTop:3, fontFamily:"'DM Mono', monospace" }}>COMPLETENESS</div>
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:16, borderBottom:`1px solid ${T.border}`, paddingBottom:12 }}>
                {Object.keys(FIELD_SCHEMA).map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    style={{ background:category===cat?T.navy3:"transparent", color:category===cat?T.gold:T.muted2, border:`1px solid ${category===cat?T.border2:"transparent"}`, borderRadius:4, padding:"5px 13px", cursor:"pointer", fontSize:11, fontWeight:600, textTransform:"capitalize", fontFamily:"'DM Mono', monospace" }}>
                    {cat}
                  </button>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {FIELD_SCHEMA[category]?.map((field,i) => {
                  // Prefer real API field data; fall back to stable random
                  const fd       = companyFields.find(f => f.field_name === field);
                  const rnd      = randomFieldValues[field] || { filled: true, conf: 0.80, srcIdx: 0 };
                  const filled   = fd ? true : rnd.filled;
                  const conf     = fd ? fd.confidence_score : (filled ? rnd.conf : 0);
                  const SRC_NAMES = ["Mgmt Financials.xlsx","CIM PDF","Bloomberg API","Loan Agreement"];
                  const src      = fd ? stripUuid(fd.source_document || fd.source_type || "API") : SRC_NAMES[rnd.srcIdx];
                  const displayVal = fd ? fd.normalized_value : (
                    field.includes("ratio")||field.includes("margin")||field.includes("coverage") ? `${(1.5+rnd.conf*5).toFixed(1)}x` :
                    field.includes("date")    ? "2028-06-30" :
                    field.includes("revenue") ? "$284.1M" :
                    field.includes("ebitda")  ? "$51.2M" :
                    field.includes("debt")    ? "$163.8M" :
                    field.includes("spread")  ? "475 bps" :
                    field==="company_name"    ? company.name :
                    field==="jurisdiction"    ? "Delaware, USA" : "—"
                  );
                  return (
                    <div key={i} style={{ padding:"10px 14px", background:T.navy3, borderRadius:6, border:`1px solid ${filled?(fd?T.green+"44":T.border):T.navy3}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:9, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"'DM Mono', monospace" }}>{field.replace(/_/g," ")}</span>
                        {filled && <span style={{ fontSize:9, color:fd?T.green:T.amber, fontFamily:"'DM Mono', monospace" }}>{(conf*100).toFixed(0)}%</span>}
                      </div>
                      <div style={{ fontSize:13, fontWeight:600, color:filled?T.cream:T.muted2, fontFamily:"'DM Mono', monospace" }}>
                        {filled ? displayVal : <span style={{ fontStyle:"italic", fontFamily:"serif", fontSize:11 }}>Not extracted</span>}
                      </div>
                      {filled && <div style={{ fontSize:9, color:fd?T.green:T.muted2, marginTop:4, fontFamily:"'DM Mono', monospace" }}>↳ {src}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Dynamic lineage graph from companyFields ──────────────────────────────
  const dynamicLineage = useMemo(() => {
    if (!companyFields || companyFields.length === 0) return null;
    // Collect unique sources and extraction methods
    const sources = new Set();
    const methods = new Set();
    companyFields.forEach(f => {
      if (f.source_document || f.source_type) sources.add(stripUuid(f.source_document || f.source_type || "Source"));
      if (f.extraction_method) methods.add(f.extraction_method);
    });
    const srcArr = [...sources].slice(0, 4);
    const methArr = [...methods].slice(0, 2);
    const nodes = [];
    const edges = [];
    // Source nodes (left column)
    srcArr.forEach((s, i) => {
      nodes.push({ id: `s${i}`, label: s.length > 14 ? s.slice(0,13)+"…" : s, x: 55, y: 60 + i * 70, type: "source" });
      edges.push([`s${i}`, "ext"]);
    });
    // Extraction node
    nodes.push({ id: "ext", label: "Text Extraction", x: 215, y: 100, type: "process" });
    // Method nodes
    methArr.forEach((m, i) => {
      const label = m.replace(/_/g, " ");
      nodes.push({ id: `m${i}`, label: label.length > 14 ? label.slice(0,13)+"…" : label, x: 375, y: 70 + i * 100, type: i === 0 ? "process" : "ai" });
      edges.push(["ext", `m${i}`]);
      edges.push([`m${i}`, "resolve"]);
    });
    if (methArr.length === 0) edges.push(["ext", "resolve"]);
    nodes.push({ id: "resolve", label: "Conflict Resolve", x: 535, y: 140, type: "process" });
    nodes.push({ id: "out", label: "Credit Profile", x: 695, y: 140, type: "output" });
    edges.push(["resolve", "out"]);
    return { nodes, edges };
  }, [companyFields]);

  // ── Lineage ────────────────────────────────────────────────────────────────
  const renderLineage = () => (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={S.h2}>Data Lineage</h2>
        <p style={S.sub}>Full provenance tracking — from raw source to normalized credit profile</p>
      </div>
      <div style={{ ...S.card, marginBottom:20 }}>
        <div style={S.secTitle}>{company?.name||"Meridian Industrial Corp"} — Data Flow</div>
        <LineageGraph nodes={dynamicLineage?.nodes} edges={dynamicLineage?.edges}/>
        <div style={{ display:"flex", gap:24, marginTop:10, justifyContent:"center" }}>
          {Object.entries(nodeAccent).map(([type,color]) => (
            <div key={type} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:T.muted }}>
              <div style={{ width:8, height:8, borderRadius:2, background:color }}/>
              {type.charAt(0).toUpperCase()+type.slice(1)}
            </div>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <div style={S.secTitle}>Field-Level Provenance
          {companyFields.length > 0 && <span style={{ color:T.muted, fontWeight:400 }}> — {companyFields.length} live fields from API</span>}
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["Field","Value","Source","Location","Method","Rule","Confidence"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {companyFields.length > 0
              ? companyFields.slice(0,10).map((f,i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, color:T.gold, fontFamily:"'DM Mono', monospace" }}>{f.field_name}</td>
                    <td style={{ ...S.td, fontWeight:600, fontFamily:"'DM Mono', monospace" }}>{f.normalized_value || "—"}</td>
                    <td style={S.td}><Badge label={stripUuid(f.source_document || f.source_type || "—")} color={T.gold}/></td>
                    <td style={{ ...S.td, fontSize:11, color:T.muted, fontFamily:"'DM Mono', monospace" }}>p.{f.source_page || "—"}</td>
                    <td style={{ ...S.td, fontSize:11 }}>{f.extraction_method || "—"}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:f.rule_id?T.green:T.amber }}>{f.rule_id || "—"}</td>
                    <td style={S.td}><ConfBar val={f.confidence_score || 0}/></td>
                  </tr>
                ))
              : [
                  { f:"revenue_ttm",    v:"$284.1M",    src:"Mgmt Financials.xlsx", loc:"P&L · C14",     method:"Cell extract", rule:"R002", conf:0.97 },
                  { f:"ebitda_ttm",     v:"$51.2M",     src:"Mgmt Financials.xlsx", loc:"P&L · C18",     method:"Cell extract", rule:"R002", conf:0.97 },
                  { f:"leverage_ratio", v:"3.2x",       src:"Derived",              loc:"N/A",           method:"Calculation",  rule:"R004", conf:1.00 },
                  { f:"ein_tax_id",     v:"47-2183044", src:"CIM PDF",              loc:"Page 3 §Legal", method:"Regex NER",    rule:"R001", conf:1.00 },
                  { f:"maturity_date",  v:"2028-06-30", src:"Loan Agreement.docx",  loc:"Page 12 §2.1", method:"Date NER",     rule:"R007", conf:0.97 },
                  { f:"pricing_spread", v:"475 bps",    src:"Loan Agreement.docx",  loc:"Page 14 §3.1", method:"Unit norm",    rule:"R008", conf:1.00 },
                  { f:"headcount",      v:"1,847",      src:"DD Call Notes.txt",    loc:"Paragraph 4",  method:"AI extract",   rule:"—",    conf:0.74 },
                ].map((r,i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, color:T.gold, fontFamily:"'DM Mono', monospace" }}>{r.f}</td>
                    <td style={{ ...S.td, fontWeight:600, fontFamily:"'DM Mono', monospace" }}>{r.v}</td>
                    <td style={S.td}><Badge label={r.src} color={T.gold}/></td>
                    <td style={{ ...S.td, fontSize:11, color:T.muted, fontFamily:"'DM Mono', monospace" }}>{r.loc}</td>
                    <td style={{ ...S.td, fontSize:11 }}>{r.method}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:r.rule==="—"?T.amber:T.green }}>{r.rule}</td>
                    <td style={S.td}><ConfBar val={r.conf}/></td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Conflicts ──────────────────────────────────────────────────────────────
  const renderConflicts = () => (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={S.h2}>Conflict Resolution</h2>
        <p style={S.sub}>When sources disagree, deterministic rules choose the winner — AI explains discrepancies</p>
      </div>
      <div style={{ ...S.card, marginBottom:20 }}>
        <div style={S.secTitle}>Source Priority Stack (Deterministic)</div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {PRIORITY_STACK.map(r => (
            <div key={r.rank} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 16px", background:T.navy3, border:`1px solid ${r.color}33`, borderRadius:6 }}>
              <span style={{ background:r.color, color:T.navy, borderRadius:3, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11, fontFamily:"'DM Mono', monospace" }}>{r.rank}</span>
              <span style={{ fontSize:12, color:T.cream2 }}>{r.label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:14, padding:"10px 14px", background:T.navy3, borderRadius:6, fontSize:12, color:T.muted, borderLeft:`3px solid ${T.gold}` }}>
          <strong style={{ color:T.gold }}>Tiebreaker:</strong> Equal-rank conflicts resolve to the highest extraction confidence score. Still tied → flag for human review.
        </div>
      </div>
      <div style={S.card}>
        <div style={S.secTitle}>
          Active Conflicts
          {apiConflicts && <span style={{ color:T.muted, fontWeight:400 }}> — {apiConflicts.length} from API {apiConflicts.length === 0 ? "(none open)" : ""}</span>}
        </div>
        {uiConflicts.length > 0
          ? uiConflicts.map((c,i) => <ConflictPanel key={i} field={c.field} sources={c.sources}/>)
          : <div style={{ color:T.muted, fontSize:12, padding:"12px 0" }}>No open conflicts.</div>
        }
        <Divider/>
        <div style={S.secTitle}>AI Discrepancy Analysis</div>
        <div style={{ fontSize:12, color:T.muted, lineHeight:1.8, padding:"14px 16px", background:T.navy3, border:`1px solid ${T.border}`, borderRadius:6, borderLeft:`3px solid ${T.green}` }}>
          The <span style={{ color:T.cream }}>$2.6M revenue discrepancy</span> between sources likely reflects different cutoff dates: the CIM was prepared Q2 2024 while management financials were updated through August 2024. The Bloomberg figure ($283.8M) is a blended CapIQ estimate. <span style={{ color:T.green }}>Recommendation: use management financials ($284.1M) — most current with highest source confidence (0.97).</span>
        </div>
      </div>
    </div>
  );

  // ── Validation Lab ─────────────────────────────────────────────────────────
  const renderValidation = () => {
    const VTABS = [
      { id:"portfolio", label:"ARCC Portfolio"     },
      { id:"pipeline",  label:"Pipeline Run"       },
      { id:"sources",   label:"Data Acquisition"   },
      { id:"sprint",    label:"30-Day Sprint"       },
    ];

    const PIPELINE_SIM_STEPS = [
      { label:"edgar_bdc.py --live",            desc:"Fetch ARCC 10-K from SEC EDGAR",    out:"8 GT records",        color:T.blue   },
      { label:"epiq_fetch.py --search ARCC",    desc:"Match portfolio to Chapter 11 cases",out:"3 affidavits found", color:T.gold   },
      { label:"pdf_extractor.py affidavit.pdf", desc:"Extract text + tables from PDF",    out:"47 raw fields",       color:T.amber  },
      { label:"rule_engine.py --validate",      desc:"Run R001–R009 against extracted",   out:"Pass: 6 / Fail: 2",   color:T.purple },
      { label:"conflict_resolver.py",           desc:"Reconcile revenue across sources",  out:"Winner: Mgmt Financials", color:T.green},
      { label:"benchmark.py --compare GT",      desc:"Compare vs ARCC ground truth",      out:"Accuracy: 91.4%",     color:T.green  },
    ];

    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div>
            <h2 style={S.h2}>Validation Lab</h2>
            <p style={S.sub}>Ground truth framework — ARCC EDGAR filings as answer key · Chapter 11 affidavits as raw document corpus</p>
          </div>
          <div style={{ display:"flex", gap:8, padding:"6px 14px", background:`${T.gold}18`, border:`1px solid ${T.gold}44`, borderRadius:6, alignItems:"center" }}>
            <span style={{ fontSize:10, color:T.gold, fontFamily:"'DM Mono', monospace" }}>SOURCE:</span>
            <span style={{ fontSize:11, color:T.cream2 }}>data.sec.gov · dm.epiq11.com · pacer.gov</span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:`1px solid ${T.border}`, paddingBottom:12 }}>
          {VTABS.map(vt => (
            <button key={vt.id} onClick={() => setVtab(vt.id)}
              style={{ background:vtab===vt.id?T.navy3:"transparent", color:vtab===vt.id?T.gold2:T.muted2, border:`1px solid ${vtab===vt.id?T.border2:"transparent"}`, borderRadius:4, padding:"6px 16px", cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"'DM Mono', monospace" }}>
              {vt.label}
            </button>
          ))}
        </div>

        {/* ── ARCC Portfolio Tab ── */}
        {vtab === "portfolio" && (
          <div>
            {/* Stats row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12, marginBottom:20 }}>
              <MiniStat label="BDC Records"     value={uiBenchmark.records}                           color={T.gold}   />
              <MiniStat label="GT Fields"       value={uiBenchmark.gt_fields}                         color={T.blue}   />
              <MiniStat label="BDC Coverage"    value={`${uiBenchmark.bdc_coverage}%`}                color={T.blue}   sub="of full schema"/>
              <MiniStat label="Galleon Gap"     value={`${uiBenchmark.galleon_gap}%`}                 color={T.gold}   sub="must extract"/>
              <MiniStat label="Entity Match"    value={`${uiBenchmark.entity_match_rate}%`}           color={T.green}  />
              <MiniStat label="Conflicts Found" value={uiBenchmark.conflicts}                         color={T.amber}  sub="revenue field"/>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:16 }}>
              {/* Company list */}
              <div style={S.card}>
                <div style={S.secTitle}>ARCC Portfolio — {uiGT.length} GT Records {apiGT && <span style={{ color:T.green, fontWeight:400 }}>● live</span>}</div>
                {uiGT.map(rec => (
                  <div key={rec.id} onClick={() => setSelRecord(rec)}
                    style={{ padding:"10px 12px", marginBottom:6, borderRadius:6, cursor:"pointer", background:selRecord?.id===rec.id?T.navy3:"transparent", border:`1px solid ${selRecord?.id===rec.id?T.border2:"transparent"}`, transition:"all 0.12s" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:600, color:T.cream, lineHeight:1.3 }}>{rec.company}</div>
                        <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{rec.sector}</div>
                      </div>
                      {rec.nonAccrual && <Badge label="Non-Accrual" color={T.red}/>}
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:6, fontSize:9, color:T.muted2, fontFamily:"'DM Mono', monospace" }}>
                      <span>{rec.spread}</span>
                      <span>·</span>
                      <span style={{ color: rec.cost > 0 && (rec.fv/rec.cost) < 0.96 ? T.amber : T.green }}>
                        FV/Cost: {rec.cost > 0 ? fvRatio(rec.fv,rec.cost) : "—"}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Record detail */}
              {selRecord && (
                <div>
                  <div style={{ ...S.card, marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                      <div>
                        <h3 style={{ margin:0, fontFamily:"'Playfair Display', serif", color:T.cream, fontSize:17 }}>{selRecord.company}</h3>
                        <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>{selRecord.id} · {selRecord.sector}</div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        {selRecord.nonAccrual && <Badge label="⚠ Non-Accrual" color={T.red}/>}
                        {selRecord.pik && <Badge label={`PIK ${selRecord.pik}`} color={T.amber}/>}
                        <Badge label="GT Verified" color={T.green}/>
                      </div>
                    </div>
                    <div style={S.secTitle}>BDC-Reported Ground Truth (from ARCC 10-K)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
                      {[
                        { l:"Facility",   v:selRecord.facility, c:T.blue  },
                        { l:"Spread",     v:selRecord.spread,   c:T.gold  },
                        { l:"Maturity",   v:selRecord.maturity, c:T.cream2},
                        { l:"Fair Value", v:fmt$M(selRecord.fv),c:T.green },
                        { l:"Cost Basis", v:fmt$M(selRecord.cost),c:T.cream2},
                        { l:"% Net Assets",v:`${selRecord.pct}%`, c:selRecord.pct>3?T.amber:T.green},
                      ].map((f,i) => (
                        <div key={i} style={{ padding:"10px 12px", background:T.navy3, borderRadius:6 }}>
                          <div style={{ fontSize:9, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"'DM Mono', monospace" }}>{f.l}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:f.c, fontFamily:"'DM Mono', monospace", marginTop:4 }}>{f.v}</div>
                          <div style={{ fontSize:9, color:T.muted2, marginTop:3 }}>↳ ARCC 10-K</div>
                        </div>
                      ))}
                    </div>
                    <Divider/>
                    <div style={S.secTitle}>Galleon Extraction Targets (must get from raw docs)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {GALLEON_EXTRACT_TARGETS.map((f,i) => (
                        <div key={i} style={{ padding:"8px 12px", background:T.navy3, borderRadius:5, border:`1px dashed ${T.border}` }}>
                          <div style={{ fontSize:9, color:T.muted, fontFamily:"'DM Mono', monospace", textTransform:"uppercase", letterSpacing:"0.06em" }}>{f.replace(/_/g," ")}</div>
                          <div style={{ fontSize:11, color:T.muted2, fontStyle:"italic", marginTop:4 }}>pending extraction</div>
                          <div style={{ fontSize:9, color:T.amber, marginTop:3 }}>↳ CIM / Mgmt Financials</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Conflict simulation */}
                  <div style={S.card}>
                    <div style={S.secTitle}>Conflict Simulation — revenue_ttm</div>
                    <div style={{ fontSize:11, color:T.muted, marginBottom:12 }}>
                      Simulated multi-source conflict for this company. Priority stack selects Management Financials as winner.
                    </div>
                    {[
                      { src:"Management Financials.xlsx", type:"management_financials", val:`$${(selRecord.fv*0.42/1e6*1e6/1e6).toFixed(1)}M`, conf:0.97, winner:true  },
                      { src:`Q3 2024 CIM PDF p.12`,       type:"cim_pdf",               val:`$${(selRecord.fv*0.42*0.982/1e6).toFixed(1)}M`,  conf:0.88, winner:false },
                    ].map((s,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 12px", marginBottom:6, borderRadius:6, background:s.winner?"#0a2218":T.navy3, border:`1px solid ${s.winner?T.green:T.border}` }}>
                        <div style={{ fontSize:10, color:T.muted2, fontFamily:"'DM Mono', monospace", width:22, textAlign:"center" }}>{PRIORITY_STACK.find(p=>p.type===s.type)?.rank}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, color:T.cream }}>{s.src}</div>
                          <div style={{ fontSize:9, color:T.muted, marginTop:2 }}>{s.type}</div>
                        </div>
                        <span style={{ fontFamily:"'DM Mono', monospace", fontSize:13, color:s.winner?T.green:T.cream2 }}>{s.val}</span>
                        <ConfBar val={s.conf}/>
                        {s.winner && <Badge label="✓ winner" color={T.green}/>}
                      </div>
                    ))}
                    <div style={{ fontSize:11, color:T.muted, marginTop:10, padding:"8px 12px", background:T.navy3, borderRadius:6, borderLeft:`3px solid ${T.gold}` }}>
                      Resolution method: <span style={{ color:T.gold, fontFamily:"'DM Mono', monospace" }}>priority:management_financials</span>
                      &nbsp;· Delta: <span style={{ color:T.amber }}>~1.8% variance between sources</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Pipeline Run Tab ── */}
        {vtab === "pipeline" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontSize:12, color:T.muted }}>
                Run <span style={{ color:T.gold, fontFamily:"'DM Mono', monospace" }}>edgar_bdc.py</span> against the live SEC EDGAR API
                {edgarRunStatus && (
                  <span style={{ marginLeft:12 }}>
                    <Badge
                      label={edgarRunStatus === "running" ? "⟳ running" : edgarRunStatus === "complete" ? "✓ complete" : "✗ failed"}
                      color={edgarRunStatus === "complete" ? T.green : edgarRunStatus === "failed" ? T.red : T.blue}
                    />
                  </span>
                )}
              </div>
              <button
                onClick={handleEdgarRun}
                disabled={edgarRunStatus === "running" || pipelineRunning}
                style={{
                  background: (edgarRunStatus === "running" || pipelineRunning) ? T.navy3 : T.gold,
                  color: (edgarRunStatus === "running" || pipelineRunning) ? T.muted : T.navy,
                  border:"none", borderRadius:5, padding:"8px 18px",
                  cursor: (edgarRunStatus === "running" || pipelineRunning) ? "not-allowed" : "pointer",
                  fontSize:12, fontWeight:700, fontFamily:"'DM Mono', monospace", transition:"all 0.2s"
                }}>
                {(edgarRunStatus === "running" || pipelineRunning) ? "⟳ Running…" : "▶ Run edgar_bdc.py"}
              </button>
            </div>
            <div style={S.card}>
              <div style={S.secTitle}>Pipeline Execution Log</div>
              <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11 }}>
                {PIPELINE_SIM_STEPS.map((ps, i) => {
                  const done    = pipelineStep >= i;
                  const active  = pipelineStep === i - 1 && pipelineRunning;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"12px 14px", marginBottom:6, borderRadius:6, background:done?T.navy3:"transparent", border:`1px solid ${done?T.border:"transparent"}`, transition:"all 0.3s" }}>
                      <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${done?ps.color:T.border}`, background:done?`${ps.color}20`:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, transition:"all 0.3s" }}>
                        {done && <span style={{ color:ps.color, fontSize:9 }}>✓</span>}
                        {!done && active && <span style={{ color:T.gold, fontSize:9 }}>⟳</span>}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ color:done?ps.color:T.muted2 }}>$ {ps.label}</div>
                        <div style={{ color:T.muted2, fontSize:10, marginTop:2 }}>  # {ps.desc}</div>
                        {done && <div style={{ color:T.green, fontSize:10, marginTop:4 }}>  ✓ {ps.out}</div>}
                      </div>
                    </div>
                  );
                })}
                {pipelineStep < 0 && !edgarRunStatus && (
                  <div style={{ color:T.muted2, padding:"12px 14px" }}>$ _  <span style={{ animation:"blink 1s infinite" }}>█</span></div>
                )}
                {edgarRunStatus === "complete" && (
                  <div style={{ color:T.green, padding:"12px 14px", borderTop:`1px solid ${T.border}`, marginTop:8 }}>
                    ✓ edgar_bdc.py complete — GT records refreshed from API
                    {edgarPipelineId && <span style={{ color:T.muted, marginLeft:8 }}>pipeline: {edgarPipelineId.slice(0,8)}…</span>}
                  </div>
                )}
              </div>
              {pipelineStep >= 5 && (
                <div style={{ marginTop:16, padding:"14px 16px", background:"#0a2218", border:`1px solid ${T.green}44`, borderRadius:6 }}>
                  <div style={{ fontSize:11, color:T.green, fontWeight:700, marginBottom:8 }}>Pipeline Complete — Benchmark Result</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                    {[
                      { l:"Field Completeness", v: apiBenchmark ? `${apiBenchmark.bdc_coverage}%` : "87.3%", c:T.green  },
                      { l:"Accuracy vs GT",     v:"91.4%", c:T.green  },
                      { l:"Conflicts Resolved", v:`${uiBenchmark.conflicts}/8`,   c:T.gold   },
                      { l:"Entity Match Rate",  v:`${uiBenchmark.entity_match_rate}%`,  c:T.green  },
                    ].map((m,i) => (
                      <div key={i} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:20, fontWeight:700, color:m.c, fontFamily:"'Playfair Display', serif" }}>{m.v}</div>
                        <div style={{ fontSize:9, color:T.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginTop:3, fontFamily:"'DM Mono', monospace" }}>{m.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Data Acquisition Tab ── */}
        {vtab === "sources" && (
          <div>
            <div style={{ ...S.card, marginBottom:16, background:T.navy3, borderLeft:`3px solid ${T.blue}` }}>
              <div style={{ fontSize:12, color:T.muted, lineHeight:1.8 }}>
                <strong style={{ color:T.cream }}>Strategy:</strong> ARCC EDGAR filings serve as the answer key. Chapter 11 first-day affidavits and SBA data provide unstructured raw documents to run through the extraction pipeline. Delaware registry provides identity resolution baseline. All sources are free and public.
              </div>
            </div>
            {DOC_ACQUISITION.map((src, i) => (
              <div key={i} style={{ ...S.card, marginBottom:12, borderLeft:`3px solid ${src.color}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:T.cream }}>{src.source}</div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:3, fontFamily:"'DM Mono', monospace" }}>{src.url}</div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Badge label={src.type} color={typeColor(src.type)}/>
                    <StatusBadge status={src.status}/>
                  </div>
                </div>
                <div style={{ display:"flex", gap:20, fontSize:11 }}>
                  <div>
                    <span style={{ color:T.muted }}>Fields: </span>
                    <span style={{ color:src.color, fontFamily:"'DM Mono', monospace" }}>{src.fields}</span>
                  </div>
                </div>
                <div style={{ marginTop:8, fontSize:11, color:T.muted2, padding:"8px 10px", background:T.navy3, borderRadius:5 }}>
                  {src.notes}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 30-Day Sprint Tab ── */}
        {vtab === "sprint" && (
          <div>
            <div style={{ ...S.card, marginBottom:16, background:T.navy3, borderLeft:`3px solid ${T.gold}` }}>
              <div style={{ fontSize:12, color:T.muted, lineHeight:1.8 }}>
                <strong style={{ color:T.cream }}>Target benchmark:</strong> 87% field completeness with 93% accuracy on 20 private middle-market companies using only public documents. This is the metric that makes the first design partner conversation credible.
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {SPRINT_WEEKS.map((wk, i) => (
                <div key={i} style={{ ...S.card, borderTop:`2px solid ${T.gold}44` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <div>
                      <div style={{ fontSize:10, color:T.gold, fontFamily:"'DM Mono', monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Week {wk.week}</div>
                      <div style={{ fontSize:15, fontWeight:700, color:T.cream, fontFamily:"'Playfair Display', serif", marginTop:2 }}>{wk.title}</div>
                    </div>
                    <StatusBadge status={wk.status}/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    {wk.tasks.map((task, j) => (
                      <div key={j} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"5px 0", borderBottom:`1px solid ${T.navy3}` }}>
                        <span style={{ color:T.muted2, fontSize:11, marginTop:1 }}>○</span>
                        <span style={{ fontSize:11, color:T.cream2, lineHeight:1.5 }}>{task}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:T.navy3, borderRadius:5 }}>
                    <span style={{ fontSize:9, color:T.muted, fontFamily:"'DM Mono', monospace", textTransform:"uppercase" }}>Output:</span>
                    <span style={{ fontSize:10, color:T.gold, fontFamily:"'DM Mono', monospace" }}>{wk.output}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Research ─────────────────────────────────────────────────────────────────
  const renderResearch = () => {
    const SOURCE_LABELS = [
      { key:"fdic",           label:"FDIC" },
      { key:"usaspending",    label:"USASpending" },
      { key:"opencorporates", label:"OpenCorporates" },
      { key:"ucc",            label:"UCC" },
      { key:"bdc",            label:"BDC EDGAR" },
    ];

    const pillStyle = (active) => ({
      background: active ? `${T.gold}25` : T.navy3,
      color: active ? T.gold : T.muted2,
      border: `1px solid ${active ? T.gold : T.border}`,
      borderRadius: 20, padding: "4px 14px", cursor: "pointer",
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
      fontFamily: "'DM Mono', monospace", transition: "all 0.15s",
    });

    const hasResults = researchResults && (
      (researchResults.bdc?.length > 0) ||
      (researchResults.fdic?.length > 0) ||
      (researchResults.usaspending?.length > 0) ||
      (researchResults.opencorporates?.length > 0) ||
      (researchResults.ucc?.length > 0)
    );

    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h2 style={S.h2}>Multi-Source Research</h2>
          <p style={S.sub}>Search across SEC EDGAR, FDIC, USASpending, OpenCorporates, and UCC records simultaneously</p>
        </div>

        {/* Search bar */}
        <div style={{ ...S.card, marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="text" placeholder="Search company name..."
            value={researchQuery}
            onChange={e => setResearchQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleResearchSearch()}
            style={{
              flex: 1, background: T.navy3, border: `1px solid ${T.border}`, borderRadius: 4,
              padding: "10px 14px", color: T.cream, fontSize: 13, fontFamily: "'DM Mono', monospace",
              outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = T.gold}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          <button
            onClick={handleResearchSearch}
            disabled={researchLoading || !researchQuery.trim()}
            style={{
              background: T.gold, color: T.navy, border: "none", borderRadius: 4,
              padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
              opacity: (researchLoading || !researchQuery.trim()) ? 0.5 : 1,
            }}
          >
            {researchLoading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Source toggles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {SOURCE_LABELS.map(s => (
            <button key={s.key} style={pillStyle(researchSources.has(s.key))} onClick={() => toggleResearchSource(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {researchLoading && (
          <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
            <div style={{ color: T.gold, fontSize: 13, fontFamily: "'DM Mono', monospace", animation: "pulse 1.5s infinite" }}>
              Searching across {researchSources.size} source{researchSources.size !== 1 ? "s" : ""}...
            </div>
            <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
          </div>
        )}

        {/* Empty state */}
        {!researchResults && !researchLoading && (
          <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.8 }}>
              Enter a company name to search across SEC EDGAR, FDIC, USASpending, OpenCorporates, and UCC records.
            </div>
          </div>
        )}

        {/* No results */}
        {researchResults && !hasResults && !researchLoading && (
          <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
            <div style={{ fontSize: 13, color: T.muted }}>No results found across selected sources.</div>
          </div>
        )}

        {/* Results */}
        {researchResults && hasResults && !researchLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* BDC EDGAR */}
            {researchResults.bdc?.length > 0 && (
              <div style={S.card}>
                <div style={S.secTitle}>BDC EDGAR</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      {["Company","BDC","Spread","Fair Value","Maturity"].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>{researchResults.bdc.map((r, i) => (
                      <tr key={i}>
                        <td style={S.td}>{r.company_name}</td>
                        <td style={S.td}>{r.source_bdc}</td>
                        <td style={S.td}>{r.pricing_spread || "—"}</td>
                        <td style={S.td}>{r.fair_value_usd ? `$${(r.fair_value_usd / 1e6).toFixed(1)}M` : "—"}</td>
                        <td style={S.td}>{r.maturity_date || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FDIC */}
            {researchResults.fdic?.length > 0 && (
              <div style={S.card}>
                <div style={S.secTitle}>FDIC Institutions</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      {["Institution","Cert","State","Total Assets","ROA","Status"].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>{researchResults.fdic.map((r, i) => (
                      <tr key={i}>
                        <td style={S.td}>{r.institution_name || r.name}</td>
                        <td style={S.td}>{r.cert || "—"}</td>
                        <td style={S.td}>{r.state || "—"}</td>
                        <td style={S.td}>{r.total_assets ? `$${(r.total_assets / 1e6).toFixed(0)}M` : "—"}</td>
                        <td style={S.td}>{r.roa != null ? r.roa.toFixed(2) : "—"}</td>
                        <td style={S.td}>{r.active_flag === 1 ? "Active" : r.active_flag === 0 ? "Inactive" : r.status || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* USASpending */}
            {researchResults.usaspending?.length > 0 && (
              <div style={S.card}>
                <div style={S.secTitle}>USASpending Awards</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      {["Recipient","Amount","Agency","Type","Date"].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>{researchResults.usaspending.map((r, i) => (
                      <tr key={i}>
                        <td style={S.td}>{r.recipient_name || "—"}</td>
                        <td style={S.td}>{r.total_obligation ? `$${Number(r.total_obligation).toLocaleString()}` : "—"}</td>
                        <td style={S.td}>{r.awarding_agency || "—"}</td>
                        <td style={S.td}>{r.award_type || "—"}</td>
                        <td style={S.td}>{r.start_date || r.date || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* OpenCorporates */}
            {researchResults.opencorporates?.length > 0 && (
              <div style={S.card}>
                <div style={S.secTitle}>OpenCorporates</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      {["Company","Jurisdiction","Status","Incorporated","Address"].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>{researchResults.opencorporates.map((r, i) => (
                      <tr key={i}>
                        <td style={S.td}>{r.name || r.company_name}</td>
                        <td style={S.td}>{r.jurisdiction || "—"}</td>
                        <td style={S.td}>{r.status || "—"}</td>
                        <td style={S.td}>{r.incorporation_date || "—"}</td>
                        <td style={S.td}>{r.registered_address || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* UCC */}
            {researchResults.ucc?.length > 0 && (
              <div style={S.card}>
                <div style={S.secTitle}>UCC Filings</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      {["Type","Debtor","Secured Party","Date","Jurisdiction","Source"].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>{researchResults.ucc.map((r, i) => (
                      <tr key={i}>
                        <td style={S.td}>{r.filing_type || "—"}</td>
                        <td style={S.td}>{r.debtor_name || "—"}</td>
                        <td style={S.td}>{r.secured_party || "—"}</td>
                        <td style={S.td}>{r.filing_date || "—"}</td>
                        <td style={S.td}>{r.jurisdiction || "—"}</td>
                        <td style={S.td}>{r.source || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    );
  };

  // ── Sparkline Component ──────────────────────────────────────────────────────
  const Sparkline = ({ values, width=120, height=30, color }) => {
    if (!values || values.length < 2) return <div style={{ width, height }}/>;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const c = color || (values[values.length-1] >= values[0] ? T.green : T.red);
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg width={width} height={height}>
        <polyline points={points} fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx={width} cy={parseFloat(points.split(" ").pop().split(",")[1])} r="2" fill={c}/>
      </svg>
    );
  };

  // ── Cross-Reference Tab ────────────────────────────────────────────────────
  const renderCrossRef = () => {
    const stats = crossRefStats || { cross_held_companies:0, avg_holders:0, max_discrepancy_pct:0, total_shared_exposure:0 };
    const data = crossRefs || [];
    // Build network graph data
    const bdcSet = new Set();
    data.slice(0,15).forEach(x => x.holders.forEach(h => bdcSet.add(h.source_bdc)));
    const bdcs = [...bdcSet];

    return (
      <div>
        <div style={{ marginBottom:24 }}>
          <h2 style={S.h2}>Cross-Reference Graph</h2>
          <p style={S.sub}>Companies held by multiple BDCs — valuation discrepancies signal pricing opportunities</p>
        </div>
        <div style={S.grid4}>
          <MiniStat label="Cross-Held Companies" value={stats.cross_held_companies} color={T.gold}/>
          <MiniStat label="Avg Holders" value={stats.avg_holders} color={T.blue}/>
          <MiniStat label="Max Discrepancy" value={`${stats.max_discrepancy_pct}%`} color={stats.max_discrepancy_pct>10?T.red:T.amber}/>
          <MiniStat label="Shared Exposure" value={stats.total_shared_exposure?`$${(stats.total_shared_exposure/1e9).toFixed(1)}B`:"—"} color={T.green}/>
        </div>

        {/* SVG Network Graph */}
        <div style={{ ...S.card, marginBottom:20 }}>
          <div style={S.secTitle}>BDC-Company Network</div>
          <svg width="100%" viewBox="0 0 800 500" style={{ fontFamily:"'DM Mono', monospace" }}>
            {/* BDC nodes on perimeter */}
            {bdcs.map((bdc, i) => {
              const angle = (i / Math.max(bdcs.length, 1)) * Math.PI * 2 - Math.PI/2;
              const cx = 400 + Math.cos(angle) * 220;
              const cy = 250 + Math.sin(angle) * 200;
              return (
                <g key={`bdc-${bdc}`}>
                  <circle cx={cx} cy={cy} r="22" fill={T.navy3} stroke={T.gold} strokeWidth="2"/>
                  <text x={cx} y={cy+4} textAnchor="middle" fill={T.gold} fontSize="9" fontWeight="700">{bdc}</text>
                </g>
              );
            })}
            {/* Company nodes in center + edges */}
            {data.slice(0,12).map((co, i) => {
              const angle = (i / Math.min(data.length, 12)) * Math.PI * 2;
              const ccx = 400 + Math.cos(angle) * 90;
              const ccy = 250 + Math.sin(angle) * 80;
              const discColor = co.fv_range_pct > 15 ? T.red : co.fv_range_pct > 5 ? T.amber : T.green;
              return (
                <g key={`co-${i}`}>
                  {co.holders.map((h, j) => {
                    const bi = bdcs.indexOf(h.source_bdc);
                    if (bi < 0) return null;
                    const bAngle = (bi / Math.max(bdcs.length, 1)) * Math.PI * 2 - Math.PI/2;
                    const bx = 400 + Math.cos(bAngle) * 220;
                    const by = 250 + Math.sin(bAngle) * 200;
                    return <line key={j} x1={bx} y1={by} x2={ccx} y2={ccy} stroke={discColor} strokeWidth="1" opacity="0.5"/>;
                  })}
                  <circle cx={ccx} cy={ccy} r="16" fill={T.navy2} stroke={discColor} strokeWidth="1.5"/>
                  <text x={ccx} y={ccy-6} textAnchor="middle" fill={T.cream2} fontSize="6">
                    {co.canonical_name.length > 16 ? co.canonical_name.slice(0,15)+"…" : co.canonical_name}
                  </text>
                  <text x={ccx} y={ccy+5} textAnchor="middle" fill={discColor} fontSize="7" fontWeight="700">
                    {co.fv_range_pct.toFixed(0)}%
                  </text>
                </g>
              );
            })}
            {/* Legend */}
            <g transform="translate(20,460)">
              {[{c:T.green,l:"<5% disc."},{c:T.amber,l:"5-15%"},{c:T.red,l:">15%"}].map((item,i) => (
                <g key={i} transform={`translate(${i*100},0)`}>
                  <line x1="0" y1="6" x2="20" y2="6" stroke={item.c} strokeWidth="2"/>
                  <text x="24" y="10" fill={T.muted} fontSize="9">{item.l}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>

        {/* Discrepancy Table */}
        <div style={S.card}>
          <div style={S.secTitle}>Discrepancy Table</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["Company","Holders","FV Range %","Total Exposure","Sectors",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.slice(0,20).map((co,i) => (
                <React.Fragment key={i}>
                  <tr style={{ cursor:"pointer" }} onClick={() => setCrossRefExpanded(crossRefExpanded===i?null:i)}>
                    <td style={{ ...S.td, fontWeight:600, color:T.cream }}>{co.canonical_name}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace" }}>{co.holder_count}</td>
                    <td style={{ ...S.td, color:co.fv_range_pct>15?T.red:co.fv_range_pct>5?T.amber:T.green, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>{co.fv_range_pct.toFixed(1)}%</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace" }}>{co.total_exposure_usd?`$${(co.total_exposure_usd/1e6).toFixed(1)}M`:"—"}</td>
                    <td style={{ ...S.td, color:T.muted }}>{co.sectors?.join(", ")||"—"}</td>
                    <td style={S.td}>{crossRefExpanded===i?"▼":"▶"}</td>
                  </tr>
                  {crossRefExpanded===i && co.holders.map((h,j) => (
                    <tr key={`h-${j}`} style={{ background:T.navy3 }}>
                      <td style={{ ...S.td, paddingLeft:32, color:T.muted2, fontSize:11 }}>↳ {h.source_bdc}</td>
                      <td style={S.td}/>
                      <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", fontSize:11 }}>{h.fair_value_usd?`$${(h.fair_value_usd/1e6).toFixed(1)}M`:"—"}</td>
                      <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", fontSize:11 }}>{h.pricing_spread||"—"}</td>
                      <td style={{ ...S.td, fontSize:11, color:T.muted }}>{h.facility_type||"—"}</td>
                      <td style={{ ...S.td, fontSize:10, color:T.muted }}>{h.filing_date||""}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Temporal Tab ──────────────────────────────────────────────────────────
  const renderTemporal = () => {
    const stats = temporalStats || { companies_tracked:0, total_snapshots:0, warnings_count:0, critical_warnings:0 };
    const warnings = temporalWarnings || [];
    const sevColor = s => s==="critical"?T.red:s==="high"?T.amber:T.gold;

    const handleBuild = async () => {
      setTemporalBuilding(true);
      await apiFetch("/temporal/build?bdc_ticker=ARCC&max_quarters=8", { method:"POST" });
      // Wait a moment then refresh
      setTimeout(async () => {
        const [s, w] = await Promise.all([
          apiFetch("/temporal/stats"),
          apiFetch("/temporal/warnings?min_quarters=2"),
        ]);
        if (s) setTemporalStats(s);
        if (w) setTemporalWarnings(w);
        setTemporalBuilding(false);
        addToast("Temporal index built", "success");
      }, 3000);
    };

    const loadTimeline = async (name) => {
      setTemporalSelectedCo(name);
      const data = await apiFetch(`/temporal/timeline/${encodeURIComponent(name)}`);
      if (data) setTemporalTimeline(data);
    };

    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div>
            <h2 style={S.h2}>Temporal Analysis</h2>
            <p style={S.sub}>Track company valuations over time — detect early warning signals</p>
          </div>
          <button onClick={handleBuild} disabled={temporalBuilding}
            style={{ background:temporalBuilding?T.navy3:T.gold, color:temporalBuilding?T.muted:T.navy, border:"none", borderRadius:5, padding:"9px 20px", cursor:temporalBuilding?"not-allowed":"pointer", fontSize:12, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>
            {temporalBuilding ? "⟳ Building..." : "▶ Build Index"}
          </button>
        </div>
        <div style={S.grid4}>
          <MiniStat label="Companies Tracked" value={stats.companies_tracked} color={T.gold}/>
          <MiniStat label="Total Snapshots" value={stats.total_snapshots} color={T.blue}/>
          <MiniStat label="Warnings" value={stats.warnings_count} color={stats.warnings_count>0?T.amber:T.green}/>
          <MiniStat label="Critical" value={stats.critical_warnings} color={stats.critical_warnings>0?T.red:T.green}/>
        </div>

        {/* Early Warnings */}
        {warnings.length > 0 && (
          <div style={{ ...S.card, marginBottom:20 }}>
            <div style={S.secTitle}>Early Warning Signals</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["Company","BDC","Quarters Declining","FV Change %","Current FV","Severity",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {warnings.slice(0,15).map((w,i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, fontWeight:600, color:T.cream }}>{w.company_name}</td>
                    <td style={{ ...S.td, color:T.gold }}>{w.source_bdc}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:sevColor(w.severity) }}>{w.quarters_declining}Q</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:w.fv_change_pct<-10?T.red:T.amber }}>{w.fv_change_pct.toFixed(1)}%</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace" }}>{w.current_fv?`$${(w.current_fv/1e6).toFixed(1)}M`:"—"}</td>
                    <td style={S.td}><Badge label={w.severity} color={sevColor(w.severity)}/></td>
                    <td style={S.td}>
                      <button onClick={() => loadTimeline(w.company_name)} style={{ background:T.navy3, border:`1px solid ${T.border}`, borderRadius:4, padding:"3px 10px", color:T.gold, fontSize:10, cursor:"pointer", fontFamily:"'DM Mono', monospace" }}>Chart</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Timeline Detail */}
        {temporalTimeline && temporalTimeline.snapshots?.length > 0 && (
          <div style={S.card}>
            <div style={S.secTitle}>{temporalTimeline.company_name} — Fair Value Timeline</div>
            <div style={{ display:"flex", gap:16, marginBottom:12 }}>
              <Badge label={`Trend: ${temporalTimeline.fv_trend}`} color={temporalTimeline.fv_trend==="declining"?T.red:temporalTimeline.fv_trend==="rising"?T.green:T.amber}/>
              {temporalTimeline.quarters_declining > 0 && <Badge label={`${temporalTimeline.quarters_declining}Q declining`} color={T.red}/>}
            </div>
            {/* SVG Line Chart */}
            {(() => {
              const snaps = temporalTimeline.snapshots;
              const fvs = snaps.map(s => s.fair_value_usd || 0);
              const costs = snaps.map(s => s.cost_basis_usd || 0);
              const allVals = [...fvs, ...costs].filter(v => v > 0);
              if (allVals.length < 2) return null;
              const minV = Math.min(...allVals) * 0.95;
              const maxV = Math.max(...allVals) * 1.05;
              const W = 600, H = 250, pad = 40;
              const toX = i => pad + (i / Math.max(snaps.length - 1, 1)) * (W - pad * 2);
              const toY = v => pad + (1 - (v - minV) / (maxV - minV || 1)) * (H - pad * 2);
              const fvLine = fvs.map((v,i) => `${toX(i)},${toY(v)}`).join(" ");
              const costLine = costs.map((v,i) => `${toX(i)},${toY(v)}`).join(" ");
              return (
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ fontFamily:"'DM Mono', monospace" }}>
                  {/* Grid lines */}
                  {[0.25,0.5,0.75].map(p => {
                    const y = pad + p * (H - pad*2);
                    const val = maxV - p * (maxV - minV);
                    return <g key={p}><line x1={pad} y1={y} x2={W-pad} y2={y} stroke={T.border} strokeWidth="0.5" strokeDasharray="3"/><text x={4} y={y+3} fill={T.muted} fontSize="8">${(val/1e6).toFixed(0)}M</text></g>;
                  })}
                  {/* Cost line */}
                  <polyline points={costLine} fill="none" stroke={T.muted} strokeWidth="1.5" strokeDasharray="4" opacity="0.6"/>
                  {/* FV line */}
                  <polyline points={fvLine} fill="none" stroke={T.green} strokeWidth="2"/>
                  {fvs.map((v,i) => <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill={T.green}/>)}
                  {/* X-axis labels */}
                  {snaps.map((s,i) => <text key={i} x={toX(i)} y={H-5} textAnchor="middle" fill={T.muted} fontSize="7">{s.period?.slice(0,7)}</text>)}
                  {/* Legend */}
                  <g transform={`translate(${W-160},${pad-15})`}>
                    <line x1="0" y1="0" x2="15" y2="0" stroke={T.green} strokeWidth="2"/>
                    <text x="20" y="4" fill={T.muted} fontSize="8">Fair Value</text>
                    <line x1="80" y1="0" x2="95" y2="0" stroke={T.muted} strokeWidth="1.5" strokeDasharray="4"/>
                    <text x="100" y="4" fill={T.muted} fontSize="8">Cost</text>
                  </g>
                </svg>
              );
            })()}
            <Sparkline values={temporalTimeline.snapshots.map(s => s.fair_value_usd || 0)} width={200} height={40}/>
          </div>
        )}

        {stats.companies_tracked === 0 && warnings.length === 0 && (
          <div style={{ ...S.card, textAlign:"center", padding:50 }}>
            <div style={{ fontSize:13, color:T.muted }}>Click "Build Index" to generate temporal snapshots from BDC filing history.</div>
          </div>
        )}
      </div>
    );
  };

  // ── Workflow Tab ──────────────────────────────────────────────────────────
  const renderWorkflow = () => {
    const reviews = dealReviews || [];
    const exp = exposure || { total_portfolio_usd:0, by_sector:{}, by_bdc:{}, by_facility_type:{}, non_accrual_exposure_usd:0, concentration_alerts:[] };
    const WVTABS = [
      { id:"board", label:"Deal Board" },
      { id:"exposure", label:"Exposure" },
      { id:"compliance", label:"Compliance" },
    ];
    const statusCols = ["pending","under_review","approved","closed"];
    const statusLabels = { pending:"Pending", under_review:"Under Review", approved:"Approved", closed:"Closed" };
    const statusColors = { pending:T.amber, under_review:T.blue, approved:T.green, closed:T.muted };
    const prioColors = { high:T.red, medium:T.amber, low:T.green };

    const handleNewReview = async () => {
      if (!newReviewName.trim()) return;
      const data = await apiFetch("/workflow/reviews", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ company_name:newReviewName.trim(), priority:"medium" }),
      });
      if (data) { setDealReviews(prev => [data, ...(prev||[])]); setNewReviewName(""); addToast("Review created","success"); }
    };

    const moveReview = async (id, newStatus) => {
      const data = await apiFetch(`/workflow/reviews/${id}`, {
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ status:newStatus }),
      });
      if (data) setDealReviews(prev => (prev||[]).map(r => r.id===id ? data : r));
    };

    // Donut chart helper
    const DonutChart = ({ data, size=200, title }) => {
      const total = Object.values(data).reduce((s,v) => s + v, 0);
      if (!total) return null;
      const entries = Object.entries(data).sort((a,b) => b[1]-a[1]).slice(0,8);
      const colors = [T.gold, T.blue, T.green, T.amber, T.purple, T.red, T.cream2, T.muted];
      let startAngle = 0;
      const r = size*0.35, cx = size/2, cy = size/2;
      return (
        <div style={{ textAlign:"center" }}>
          <div style={S.secTitle}>{title}</div>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {entries.map(([name,val],i) => {
              const pct = val/total;
              const angle = pct * Math.PI * 2;
              const x1 = cx + r * Math.cos(startAngle);
              const y1 = cy + r * Math.sin(startAngle);
              const x2 = cx + r * Math.cos(startAngle + angle);
              const y2 = cy + r * Math.sin(startAngle + angle);
              const large = angle > Math.PI ? 1 : 0;
              const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
              startAngle += angle;
              return <path key={i} d={d} fill={colors[i%colors.length]} opacity="0.85"/>;
            })}
            <circle cx={cx} cy={cy} r={r*0.55} fill={T.navy2}/>
            <text x={cx} y={cy-4} textAnchor="middle" fill={T.cream} fontSize="14" fontWeight="700" fontFamily="'Playfair Display', serif">
              ${(total/1e9).toFixed(1)}B
            </text>
            <text x={cx} y={cy+10} textAnchor="middle" fill={T.muted} fontSize="8">Total</text>
          </svg>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center", marginTop:8 }}>
            {entries.slice(0,6).map(([name,val],i) => (
              <span key={i} style={{ fontSize:9, color:T.muted, fontFamily:"'DM Mono', monospace" }}>
                <span style={{ color:colors[i%colors.length] }}>■</span> {name.length>15?name.slice(0,14)+"…":name} {(val/total*100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div>
        <div style={{ marginBottom:24 }}>
          <h2 style={S.h2}>Workflow</h2>
          <p style={S.sub}>Deal reviews, portfolio exposure, and concentration compliance</p>
        </div>
        <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:`1px solid ${T.border}`, paddingBottom:12 }}>
          {WVTABS.map(vt => (
            <button key={vt.id} onClick={() => setWorkflowVtab(vt.id)}
              style={{ background:workflowVtab===vt.id?T.navy3:"transparent", color:workflowVtab===vt.id?T.gold2:T.muted2, border:`1px solid ${workflowVtab===vt.id?T.border2:"transparent"}`, borderRadius:4, padding:"6px 16px", cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"'DM Mono', monospace" }}>
              {vt.label}
            </button>
          ))}
        </div>

        {/* Deal Board */}
        {workflowVtab === "board" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <input value={newReviewName} onChange={e => setNewReviewName(e.target.value)}
                onKeyDown={e => e.key==="Enter" && handleNewReview()}
                placeholder="Company name for new review..."
                style={{ flex:1, padding:"8px 12px", background:T.navy3, border:`1px solid ${T.border}`, borderRadius:4, color:T.cream, fontSize:12, fontFamily:"'DM Mono', monospace", outline:"none" }}/>
              <button onClick={handleNewReview}
                style={{ background:T.gold, color:T.navy, border:"none", borderRadius:4, padding:"8px 18px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono', monospace" }}>+ New Review</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {statusCols.map(status => (
                <div key={status} style={{ background:T.navy2, border:`1px solid ${T.border}`, borderRadius:8, padding:12, minHeight:300 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`2px solid ${statusColors[status]}44` }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:statusColors[status] }}/>
                    <span style={{ fontSize:11, fontWeight:700, color:T.cream, textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"'DM Mono', monospace" }}>{statusLabels[status]}</span>
                    <span style={{ fontSize:10, color:T.muted, marginLeft:"auto", fontFamily:"'DM Mono', monospace" }}>
                      {reviews.filter(r => r.status===status).length}
                    </span>
                  </div>
                  {reviews.filter(r => r.status===status).map(r => (
                    <div key={r.id} style={{ background:T.navy3, border:`1px solid ${T.border}`, borderRadius:6, padding:"10px 12px", marginBottom:8, borderLeft:`3px solid ${prioColors[r.priority]||T.muted}` }}>
                      <div style={{ fontSize:11, fontWeight:600, color:T.cream, marginBottom:4 }}>{r.company_name}</div>
                      {r.assignee && <div style={{ fontSize:9, color:T.muted, marginBottom:4 }}>→ {r.assignee}</div>}
                      {r.notes && <div style={{ fontSize:9, color:T.muted2, marginBottom:6 }}>{r.notes.length>50?r.notes.slice(0,50)+"…":r.notes}</div>}
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {statusCols.filter(s => s!==status).map(s => (
                          <button key={s} onClick={() => moveReview(r.id, s)}
                            style={{ background:T.navy2, border:`1px solid ${T.border}`, borderRadius:3, padding:"2px 8px", color:statusColors[s], fontSize:8, cursor:"pointer", fontFamily:"'DM Mono', monospace" }}>
                            → {statusLabels[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exposure */}
        {workflowVtab === "exposure" && (
          <div>
            <div style={S.grid4}>
              <MiniStat label="Total Portfolio" value={exp.total_portfolio_usd?`$${(exp.total_portfolio_usd/1e9).toFixed(2)}B`:"—"} color={T.gold}/>
              <MiniStat label="Sectors" value={Object.keys(exp.by_sector).length} color={T.blue}/>
              <MiniStat label="BDCs" value={Object.keys(exp.by_bdc).length} color={T.green}/>
              <MiniStat label="Non-Accrual" value={exp.non_accrual_exposure_usd?`$${(exp.non_accrual_exposure_usd/1e6).toFixed(0)}M`:"$0"} color={exp.non_accrual_exposure_usd>0?T.red:T.green}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <div style={S.card}><DonutChart data={exp.by_sector} title="By Sector"/></div>
              <div style={S.card}><DonutChart data={exp.by_bdc} title="By BDC"/></div>
              <div style={S.card}><DonutChart data={exp.by_facility_type} title="By Facility Type"/></div>
            </div>
          </div>
        )}

        {/* Compliance */}
        {workflowVtab === "compliance" && (
          <div style={S.card}>
            <div style={S.secTitle}>Concentration Limits</div>
            <div style={{ marginBottom:16, fontSize:12, color:T.muted }}>
              Sector max: 25% · Single name max: 5% · Non-accrual max: 10%
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["Dimension","Name","Current Exposure","Limit %","Current %","Status"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {(exp.concentration_alerts||[]).map((c,i) => (
                  <tr key={i}>
                    <td style={S.td}>{c.dimension}</td>
                    <td style={{ ...S.td, fontWeight:600, color:T.cream }}>{c.name}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace" }}>{c.current_exposure_usd?`$${(c.current_exposure_usd/1e6).toFixed(1)}M`:"—"}</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace" }}>{c.limit_pct}%</td>
                    <td style={{ ...S.td, fontFamily:"'DM Mono', monospace", color:c.breached?T.red:T.green }}>{c.current_pct}%</td>
                    <td style={S.td}><Badge label={c.breached?"BREACHED":"OK"} color={c.breached?T.red:T.green}/></td>
                  </tr>
                ))}
                {(!exp.concentration_alerts||exp.concentration_alerts.length===0) && (
                  <tr><td colSpan="6" style={{ ...S.td, textAlign:"center", color:T.muted }}>No concentration data — build exposure report first</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (tab==="dashboard")  return renderDashboard();
    if (tab==="crossref")   return renderCrossRef();
    if (tab==="temporal")   return renderTemporal();
    if (tab==="pipeline")   return renderPipeline();
    if (tab==="rules")      return renderRules();
    if (tab==="profiles")   return renderProfiles();
    if (tab==="lineage")    return renderLineage();
    if (tab==="conflicts")  return renderConflicts();
    if (tab==="validation") return renderValidation();
    if (tab==="research")   return renderResearch();
    if (tab==="workflow")   return renderWorkflow();
  };

  const apiOnline = apiStatus?.status === "ok";

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#0a1628; }
        ::-webkit-scrollbar-thumb { background:#1e3358; border-radius:3px; }
        tr:hover td { background: #0d1e35 !important; transition: background 0.1s; }
        button:hover { opacity: 0.85; }
        @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
      `}</style>

      <div style={S.header}>
        <div style={S.logo}>
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <path d="M4 20 Q14 8 24 20" stroke={T.gold} strokeWidth="1.8" fill="none"/>
            <path d="M14 6 L14 20" stroke={T.gold} strokeWidth="1.5"/>
            <path d="M14 8 L20 14 L14 14 Z" fill={T.gold} opacity="0.7"/>
            <path d="M4 20 Q14 24 24 20 L24 22 Q14 27 4 22 Z" fill={T.gold} opacity="0.4"/>
            <path d="M1 22 L27 22" stroke={T.gold2} strokeWidth="0.8" opacity="0.5"/>
          </svg>
          GALLEON
        </div>
        <nav style={S.nav}>
          {TABS.map(t => (
            <button key={t.id} style={S.navBtn(tab===t.id)} onClick={() => setTab(t.id)}>
              {t.label}
              {t.isNew && (
                <span style={{ marginLeft:6, background:`${T.gold}30`, color:T.gold, borderRadius:3, padding:"1px 5px", fontSize:9, fontFamily:"'DM Mono', monospace" }}>NEW</span>
              )}
            </button>
          ))}
        </nav>
        {/* Alert Bell */}
        <div style={{ position:"relative", cursor:"pointer" }} onClick={() => setAlertsOpen(!alertsOpen)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5 8.38 5 11V17L3 19V20H21V19L19 17V11C19 8.38 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" fill={T.muted}/>
          </svg>
          {monitorAlerts && monitorAlerts.filter(a => !a.read).length > 0 && (
            <div style={{ position:"absolute", top:-4, right:-4, width:16, height:16, borderRadius:"50%", background:T.red, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:"#fff", fontFamily:"'DM Mono', monospace" }}>
              {Math.min(monitorAlerts.filter(a => !a.read).length, 99)}
            </div>
          )}
          {/* Alert dropdown */}
          {alertsOpen && (
            <div style={{ position:"absolute", top:30, right:0, width:360, maxHeight:400, overflowY:"auto", background:T.navy, border:`1px solid ${T.border}`, borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,0.6)", zIndex:1100 }}>
              <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:11, fontWeight:700, color:T.cream, fontFamily:"'DM Mono', monospace" }}>ALERTS</span>
                <button onClick={async (e) => { e.stopPropagation(); await apiFetch("/monitor/alerts/read-all", { method:"POST" }); const d = await apiFetch("/monitor/alerts?limit=20"); if (d) setMonitorAlerts(d); }}
                  style={{ background:T.navy3, border:`1px solid ${T.border}`, borderRadius:4, padding:"3px 10px", color:T.muted, fontSize:9, cursor:"pointer", fontFamily:"'DM Mono', monospace" }}>Mark all read</button>
              </div>
              {(monitorAlerts||[]).slice(0,10).map(a => {
                const sevC = a.severity==="high"||a.severity==="critical"?T.red:a.severity==="medium"?T.amber:T.muted;
                return (
                  <div key={a.id} style={{ padding:"8px 14px", borderBottom:`1px solid ${T.navy3}`, borderLeft:`3px solid ${sevC}`, background:a.read?"transparent":`${T.navy3}88`, fontSize:11, color:T.cream2, fontFamily:"'DM Mono', monospace", lineHeight:1.5 }}
                    onClick={async (e) => { e.stopPropagation(); await apiFetch(`/monitor/alerts/${a.id}/read`, { method:"POST" }); setMonitorAlerts(prev => prev?.map(x => x.id===a.id ? {...x, read:true} : x)); }}>
                    <div style={{ color:a.read?T.muted:T.cream }}>{a.message}</div>
                    {a.source_bdc && <div style={{ fontSize:9, color:T.muted, marginTop:2 }}>{a.source_bdc} · {a.alert_type}</div>}
                  </div>
                );
              })}
              {(!monitorAlerts || monitorAlerts.length === 0) && (
                <div style={{ padding:20, textAlign:"center", color:T.muted, fontSize:11 }}>No alerts yet</div>
              )}
            </div>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background: apiStatus === null ? T.amber : apiOnline ? T.green : T.red, boxShadow:`0 0 7px ${apiStatus === null ? T.amber : apiOnline ? T.green : T.red}` }}/>
          <span style={{ fontSize:10, color:T.muted, fontFamily:"'DM Mono', monospace", letterSpacing:"0.1em" }}>
            {apiStatus === null ? "CONNECTING" : apiOnline ? "API LIVE" : "API DOWN"}
          </span>
          {apiStatus?.db_connected && (
            <>
              <div style={{ width:1, height:12, background:T.border }}/>
              <div style={{ width:7, height:7, borderRadius:"50%", background:T.green, boxShadow:`0 0 7px ${T.green}` }}/>
              <span style={{ fontSize:10, color:T.muted, fontFamily:"'DM Mono', monospace", letterSpacing:"0.1em" }}>DB</span>
            </>
          )}
        </div>
      </div>

      <div style={{ height:1, background:`linear-gradient(to right, transparent 5%, ${T.gold}44 30%, ${T.gold}44 70%, transparent 95%)` }}/>
      <div style={S.main}>
        {Object.keys(apiErrors).length > 0 && (
          <ErrorBanner message={`API errors: ${Object.values(apiErrors).join(", ")}`} onRetry={refreshAll}/>
        )}
        {renderContent()}
      </div>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div style={{ position:"fixed", top:16, right:16, zIndex:1100, display:"flex", flexDirection:"column", gap:8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              background: t.type === "success" ? "#0a2218" : t.type === "error" ? `${T.red}20` : T.navy2,
              border: `1px solid ${t.type === "success" ? T.green : t.type === "error" ? T.red : T.border}44`,
              borderRadius: 8, padding: "10px 18px", minWidth: 240,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              fontSize: 12, color: T.cream, fontFamily: "'DM Mono', monospace",
              animation: "fadeIn 0.2s ease-out",
            }}>
              <span style={{ marginRight:8 }}>{t.type === "success" ? "✓" : t.type === "error" ? "✗" : "ℹ"}</span>
              {t.message}
            </div>
          ))}
          <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
        </div>
      )}

      <GalleonAssistant
        onNavigate={setTab}
        onUpload={(companyName) => { setTab("pipeline"); }}
        onSelectCompany={(co) => { setTab("profiles"); }}
      />
    </div>
  );
}
