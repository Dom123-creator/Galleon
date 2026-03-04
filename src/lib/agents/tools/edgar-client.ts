/**
 * SEC EDGAR client for BDC portfolio company intelligence.
 * Ported from Python galleon/bdc_index.py and galleon/pipeline/edgar_bdc.py
 */

// 25 BDC seeds: ticker → CIK
export const BDC_SEED: Record<string, string> = {
  ARCC: "0001287750",
  AINV: "0001379785",
  FSK: "0001422559",
  GBDC: "0001572694",
  GSBD: "0001572694",
  MAIN: "0001396440",
  ORCC: "0001655888",
  BXSL: "0001850984",
  HTGC: "0001280361",
  TPVG: "0001580156",
  PSEC: "0001378454",
  OBDC: "0001697532",
  BBDC: "0001655050",
  NMFC: "0001496099",
  CSWC: "0000018349",
  OCSL: "0001414932",
  FDUS: "0001422358",
  SLRC: "0001508655",
  MFIC: "0001611988",
  GLAD: "0001273931",
  GAIN: "0001273931",
  HRZN: "0001492869",
  CCAP: "0001826470",
  PFLT: "0001487918",
  SAR:  "0001384101",
};

// ARCC seed portfolio (12 companies with deal terms)
export const ARCC_SEED_PORTFOLIO = [
  {
    company_name: "Maurice Sporting Goods LLC",
    source_bdc: "ARCC",
    sector: "Consumer Products",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+550",
    maturity_date: "2027-06-15",
    fair_value_usd: 42_500_000,
    cost_basis_usd: 43_800_000,
    non_accrual: false,
  },
  {
    company_name: "Clearview Capital Group LLC",
    source_bdc: "ARCC",
    sector: "Financial Services",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+525",
    maturity_date: "2028-03-30",
    fair_value_usd: 142_300_000,
    cost_basis_usd: 145_000_000,
    non_accrual: false,
  },
  {
    company_name: "Summit Logistics Partners LP",
    source_bdc: "ARCC",
    sector: "Transportation",
    facility_type: "Second Lien",
    pricing_spread: "SOFR+875",
    maturity_date: "2026-12-01",
    fair_value_usd: 28_100_000,
    cost_basis_usd: 35_000_000,
    non_accrual: true,
  },
  {
    company_name: "Precision Healthcare Solutions Inc",
    source_bdc: "ARCC",
    sector: "Healthcare",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+475",
    maturity_date: "2029-01-15",
    fair_value_usd: 89_700_000,
    cost_basis_usd: 90_000_000,
    non_accrual: false,
  },
  {
    company_name: "Apex Digital Media Corp",
    source_bdc: "ARCC",
    sector: "Media & Telecom",
    facility_type: "Unitranche",
    pricing_spread: "SOFR+625",
    maturity_date: "2027-09-30",
    fair_value_usd: 56_200_000,
    cost_basis_usd: 58_000_000,
    non_accrual: false,
  },
  {
    company_name: "Greenfield Environmental Services LLC",
    source_bdc: "ARCC",
    sector: "Environmental Services",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+500",
    maturity_date: "2028-07-01",
    fair_value_usd: 73_400_000,
    cost_basis_usd: 75_000_000,
    non_accrual: false,
  },
  {
    company_name: "TechBridge Solutions Inc",
    source_bdc: "ARCC",
    sector: "Software & IT",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+450",
    maturity_date: "2029-04-15",
    fair_value_usd: 112_500_000,
    cost_basis_usd: 115_000_000,
    non_accrual: false,
  },
  {
    company_name: "Midwest Manufacturing Holdings Inc",
    source_bdc: "ARCC",
    sector: "Industrials",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+575",
    maturity_date: "2027-11-30",
    fair_value_usd: 34_800_000,
    cost_basis_usd: 36_000_000,
    non_accrual: false,
  },
  {
    company_name: "Pacific Coast Foods Inc",
    source_bdc: "ARCC",
    sector: "Food & Beverage",
    facility_type: "Unitranche",
    pricing_spread: "SOFR+550",
    maturity_date: "2028-02-28",
    fair_value_usd: 67_900_000,
    cost_basis_usd: 70_000_000,
    non_accrual: false,
  },
  {
    company_name: "National Education Partners LLC",
    source_bdc: "ARCC",
    sector: "Education",
    facility_type: "Second Lien",
    pricing_spread: "SOFR+800",
    maturity_date: "2026-08-15",
    fair_value_usd: 19_200_000,
    cost_basis_usd: 25_000_000,
    non_accrual: true,
  },
  {
    company_name: "American Safety Products Corp",
    source_bdc: "ARCC",
    sector: "Safety & Security",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+525",
    maturity_date: "2028-10-01",
    fair_value_usd: 48_300_000,
    cost_basis_usd: 50_000_000,
    non_accrual: false,
  },
  {
    company_name: "Heritage Hospitality Group LLC",
    source_bdc: "ARCC",
    sector: "Hospitality",
    facility_type: "First Lien Senior Secured",
    pricing_spread: "SOFR+600",
    maturity_date: "2027-05-15",
    fair_value_usd: 31_200_000,
    cost_basis_usd: 32_000_000,
    non_accrual: false,
  },
];

const SEC_USER_AGENT = "Galleon/1.0 (support@galleon.ai)";
const RATE_LIMIT_MS = 120; // ~8 req/sec, under SEC's 10/sec limit

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();

  return fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json",
    },
  });
}

export interface EdgarFiling {
  accessionNumber: string;
  filingDate: string;
  form: string;
  primaryDocument: string;
  fileUrl: string;
}

export async function fetchFilings(cik: string): Promise<EdgarFiling[]> {
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const recent = data.filings?.recent;
    if (!recent) return [];

    const filings: EdgarFiling[] = [];
    const count = Math.min(recent.accessionNumber?.length || 0, 20);
    for (let i = 0; i < count; i++) {
      filings.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        form: recent.form[i],
        primaryDocument: recent.primaryDocument[i],
        fileUrl: `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${recent.accessionNumber[i].replace(/-/g, "")}/${recent.primaryDocument[i]}`,
      });
    }

    return filings;
  } catch {
    return [];
  }
}

export interface CompanyFacts {
  entityName: string;
  cik: number;
  facts: Record<string, unknown>;
}

export async function fetchCompanyFacts(cik: string): Promise<CompanyFacts | null> {
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;

  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    return {
      entityName: data.entityName,
      cik: data.cik,
      facts: data.facts || {},
    };
  } catch {
    return null;
  }
}

export interface EdgarSearchResult {
  title: string;
  form: string;
  filedAt: string;
  entityName: string;
  url: string;
}

export async function searchEdgarFullText(
  query: string,
  forms?: string[]
): Promise<EdgarSearchResult[]> {
  const formFilter = forms?.join(",") || "10-K,10-Q,8-K,S-1";
  const today = new Date().toISOString().split("T")[0];
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&dateRange=custom&startdt=${yearAgo}&enddt=${today}&forms=${formFilter}`;

  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.hits?.hits || []).slice(0, 10).map((hit: Record<string, unknown>) => {
      const source = hit._source as Record<string, unknown>;
      return {
        title: source?.display_names || "",
        form: source?.form_type || "",
        filedAt: source?.file_date || "",
        entityName: source?.entity_name || "",
        url: `https://www.sec.gov/Archives/edgar/data/${source?.entity_id}`,
      };
    });
  } catch {
    return [];
  }
}

// Jaccard similarity for fuzzy matching
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface BdcPortfolioMatch {
  company_name: string;
  source_bdc: string;
  sector: string;
  facility_type: string;
  pricing_spread: string;
  maturity_date: string;
  fair_value_usd: number;
  cost_basis_usd: number;
  non_accrual: boolean;
  match_confidence: number;
}

export function searchBdcPortfolio(query: string, topK = 5): BdcPortfolioMatch[] {
  const results: BdcPortfolioMatch[] = [];

  for (const company of ARCC_SEED_PORTFOLIO) {
    const nameScore = jaccardSimilarity(query, company.company_name);
    const sectorScore = jaccardSimilarity(query, company.sector) * 0.3;
    const score = Math.max(nameScore, sectorScore);

    if (score > 0.1) {
      results.push({ ...company, match_confidence: Math.round(score * 100) / 100 });
    }
  }

  results.sort((a, b) => b.match_confidence - a.match_confidence);
  return results.slice(0, topK);
}
