/**
 * Financial data extraction from document text.
 * Ported from Python galleon/pipeline/pdf_extractor.py
 */

// Parse dollar amounts (supports billions, millions, thousands, raw)
export function parseDollar(text: string): number | null {
  // $1.5 billion, $1.5B
  let m = text.match(/\$\s*([\d,.]+)\s*(?:billion|bn|b)\b/i);
  if (m) return parseFloat(m[1].replace(/,/g, "")) * 1_000_000_000;

  // $1.5 million, $1.5M, $1.5mm
  m = text.match(/\$\s*([\d,.]+)\s*(?:million|mm|m)\b/i);
  if (m) return parseFloat(m[1].replace(/,/g, "")) * 1_000_000;

  // $1,500,000 or $1500000
  m = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (!isNaN(val)) return val;
  }

  return null;
}

// Parse dates in multiple formats
export function parseDate(text: string): string | null {
  // ISO: 2024-01-15
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // US: 01/15/2024 or 1/15/2024
  m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;

  // Written: January 15, 2024 or Jan 15, 2024
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04",
    jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  m = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const monthNum = months[m[1].toLowerCase()];
    if (monthNum) return `${m[3]}-${monthNum}-${m[2].padStart(2, "0")}`;
  }

  return null;
}

// Parse spread (SOFR/LIBOR + basis points)
export function parseSpread(text: string): string | null {
  // SOFR+550, SOFR + 5.50%, L+550, LIBOR+550
  const m = text.match(/(?:SOFR|LIBOR|L)\s*\+\s*([\d.]+)\s*(%|bps)?/i);
  if (m) {
    let bps = parseFloat(m[1]);
    // If it looks like a percentage (e.g., 5.50%), convert to bps label
    if (m[2] === "%" || (bps < 20 && bps > 0)) {
      bps = Math.round(bps * 100);
    }
    const base = text.match(/SOFR/i) ? "SOFR" : "LIBOR";
    return `${base}+${bps}`;
  }
  return null;
}

// Parse EIN (XX-XXXXXXX)
export function parseEin(text: string): string | null {
  const m = text.match(/\b(\d{2}-\d{7})\b/);
  return m ? m[1] : null;
}

// Hedging qualifier patterns with confidence deltas
const QUALIFIER_PATTERNS: { pattern: RegExp; delta: number; label: string }[] = [
  { pattern: /approximately|approx\.?/i, delta: -0.1, label: "approximate" },
  { pattern: /estimated|est\.?/i, delta: -0.15, label: "estimated" },
  { pattern: /unaudited/i, delta: -0.2, label: "unaudited" },
  { pattern: /audited/i, delta: 0.1, label: "audited" },
  { pattern: /preliminary/i, delta: -0.2, label: "preliminary" },
  { pattern: /as\s+(?:of|at)\s+\w+\s+\d/i, delta: 0.05, label: "dated" },
  { pattern: /pro\s*forma/i, delta: -0.15, label: "pro_forma" },
  { pattern: /(?:subject\s+to|pending)\s+(?:audit|review|adjustment)/i, delta: -0.25, label: "subject_to_review" },
];

export function scanQualifiers(
  text: string,
  pos: number
): { qualifiers: string[]; confidenceDelta: number } {
  // Look at a window around the position
  const windowStart = Math.max(0, pos - 100);
  const windowEnd = Math.min(text.length, pos + 100);
  const window = text.substring(windowStart, windowEnd);

  const qualifiers: string[] = [];
  let delta = 0;

  for (const { pattern, delta: d, label } of QUALIFIER_PATTERNS) {
    if (pattern.test(window)) {
      qualifiers.push(label);
      delta += d;
    }
  }

  return { qualifiers, confidenceDelta: delta };
}

// Strip LLC/Inc/Corp/LP suffixes for matching
export function normalizeEntityName(name: string): string {
  return name
    .replace(/\b(LLC|Inc\.?|Corp\.?|Corporation|Company|Co\.?|LP|LLP|Ltd\.?|Limited|Group|Holdings?|Partners?|Enterprises?)\b/gi, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Jaccard token-overlap similarity
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeEntityName(a).toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeEntityName(b).toLowerCase().split(/\s+/).filter(Boolean));

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface ExtractedDollar {
  value: number;
  raw: string;
  position: number;
  qualifiers: string[];
  confidence: number;
}

export interface ExtractedSpread {
  spread: string;
  raw: string;
  position: number;
}

export interface ExtractedDate {
  date: string;
  raw: string;
  position: number;
}

export interface FinancialExtractionResult {
  dollarAmounts: ExtractedDollar[];
  spreads: ExtractedSpread[];
  dates: ExtractedDate[];
  eins: string[];
}

// Master extractor: scans full text for all financial data
export function extractFinancialData(text: string): FinancialExtractionResult {
  const dollarAmounts: ExtractedDollar[] = [];
  const spreads: ExtractedSpread[] = [];
  const dates: ExtractedDate[] = [];
  const einsSet = new Set<string>();

  // Extract dollar amounts
  const dollarRegex = /\$\s*[\d,.]+\s*(?:billion|bn|b|million|mm|m)?/gi;
  let match: RegExpExecArray | null;
  while ((match = dollarRegex.exec(text)) !== null) {
    const value = parseDollar(match[0]);
    if (value !== null && value > 0) {
      const { qualifiers, confidenceDelta } = scanQualifiers(text, match.index);
      dollarAmounts.push({
        value,
        raw: match[0].trim(),
        position: match.index,
        qualifiers,
        confidence: Math.max(0, Math.min(1, 0.8 + confidenceDelta)),
      });
    }
  }

  // Extract spreads
  const spreadRegex = /(?:SOFR|LIBOR|L)\s*\+\s*[\d.]+\s*(%|bps)?/gi;
  while ((match = spreadRegex.exec(text)) !== null) {
    const spread = parseSpread(match[0]);
    if (spread) {
      spreads.push({ spread, raw: match[0].trim(), position: match.index });
    }
  }

  // Extract dates
  const dateRegex = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\w+\s+\d{1,2},?\s+\d{4}/g;
  while ((match = dateRegex.exec(text)) !== null) {
    const date = parseDate(match[0]);
    if (date) {
      dates.push({ date, raw: match[0].trim(), position: match.index });
    }
  }

  // Extract EINs
  const einRegex = /\b\d{2}-\d{7}\b/g;
  while ((match = einRegex.exec(text)) !== null) {
    einsSet.add(match[0]);
  }

  // Sort by position, dedupe dollar amounts that are very close
  dollarAmounts.sort((a, b) => a.position - b.position);
  spreads.sort((a, b) => a.position - b.position);
  dates.sort((a, b) => a.position - b.position);

  return {
    dollarAmounts: dollarAmounts.slice(0, 50), // cap at 50
    spreads: spreads.slice(0, 20),
    dates: dates.slice(0, 30),
    eins: [...einsSet],
  };
}
