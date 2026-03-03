import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { parse as csvParse } from "csv-parse/sync";

export interface ParseResult {
  content: string;
  pageCount?: number;
  metadata: Record<string, unknown>;
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParseResult> {
  switch (mimeType) {
    case "application/pdf":
      return parsePDF(buffer);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      return parseSpreadsheet(buffer, fileName);
    case "text/csv":
      return parseCSV(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return parseDOCX(buffer);
    case "text/plain":
      return parsePlainText(buffer);
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

async function parsePDF(buffer: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const textResult = await parser.getText();
  const infoResult = await parser.getInfo();
  const result = {
    content: textResult.text,
    pageCount: textResult.total,
    metadata: {
      info: infoResult,
    },
  };
  await parser.destroy();
  return result;
}

function parseSpreadsheet(buffer: Buffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: Record<string, string> = {};
  let fullContent = "";

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    sheets[sheetName] = csv;
    fullContent += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
  }

  return {
    content: fullContent,
    metadata: {
      sheetNames: workbook.SheetNames,
      sheetCount: workbook.SheetNames.length,
      fileName,
    },
  };
}

function parseCSV(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");
  const records = csvParse(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  return {
    content: text,
    metadata: {
      rowCount: records.length,
      columns: records.length > 0 ? Object.keys(records[0]) : [],
    },
  };
}

async function parseDOCX(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    content: result.value,
    metadata: {
      warnings: result.messages.map((m) => m.message),
    },
  };
}

function parsePlainText(buffer: Buffer): ParseResult {
  const content = buffer.toString("utf-8");
  return {
    content,
    metadata: {
      charCount: content.length,
      lineCount: content.split("\n").length,
    },
  };
}
