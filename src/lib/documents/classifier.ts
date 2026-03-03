import { getAnthropicClient, MODEL_CONFIG } from "@/lib/anthropic";
import type { DocumentType } from "@prisma/client";

const CLASSIFICATION_PROMPT = `Classify this document into one of the following types based on its content:
- TERM_SHEET: Loan term sheets, credit facility terms
- CREDIT_MEMO: Credit analysis memos, underwriting memos
- FINANCIAL_STATEMENT: Income statements, balance sheets, cash flow statements
- UCC_FILING: UCC-1 filings, lien records
- COURT_RECORD: Court filings, litigation documents
- NEWS_ARTICLE: News articles, press releases
- REGULATORY_FILING: SEC filings, regulatory submissions
- PROSPECTUS: Offering documents, prospectuses
- PITCH_DECK: Pitch decks, investor presentations
- SPREADSHEET: Financial models, data tables
- OTHER: Anything that doesn't fit the above

Respond with ONLY the document type (e.g., "TERM_SHEET"). No explanation.`;

export async function classifyDocument(
  content: string,
  fileName: string
): Promise<DocumentType> {
  // Quick classification based on filename
  const fileNameLower = fileName.toLowerCase();
  if (fileNameLower.includes("term_sheet") || fileNameLower.includes("term sheet")) return "TERM_SHEET";
  if (fileNameLower.includes("credit_memo") || fileNameLower.includes("credit memo")) return "CREDIT_MEMO";
  if (fileNameLower.includes("ucc")) return "UCC_FILING";
  if (fileNameLower.includes("pitch") || fileNameLower.includes("deck")) return "PITCH_DECK";

  // Use Claude for classification if content is available
  if (content.length < 100) return "OTHER";

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL_CONFIG.model,
      max_tokens: 50,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `${CLASSIFICATION_PROMPT}\n\nFile name: ${fileName}\n\nDocument content (first 2000 chars):\n${content.substring(0, 2000)}`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type === "text") {
      const docType = text.text.trim().toUpperCase() as DocumentType;
      const validTypes: DocumentType[] = [
        "TERM_SHEET", "CREDIT_MEMO", "FINANCIAL_STATEMENT", "UCC_FILING",
        "COURT_RECORD", "NEWS_ARTICLE", "REGULATORY_FILING", "PROSPECTUS",
        "PITCH_DECK", "SPREADSHEET", "OTHER",
      ];
      if (validTypes.includes(docType)) return docType;
    }
  } catch {
    // Fall back to OTHER if classification fails
  }

  return "OTHER";
}
