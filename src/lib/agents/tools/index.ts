import { db } from "@/lib/db";
import type { AgentContext } from "../types";
import { searchDocuments } from "./document-search";
import { scrapePublicRecords, searchNews } from "./web-scraper";

interface ToolCallResult {
  content: string;
  is_error?: boolean;
}

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  context: AgentContext
): Promise<ToolCallResult> {
  try {
    switch (toolName) {
      case "search_documents":
        return await searchDocuments(
          input.query as string,
          input.document_type as string | undefined,
          (input.deal_id as string | undefined) || context.dealId
        );

      case "scrape_public_records":
        return await scrapePublicRecords(
          input.source as string,
          input.query as string,
          input.entity_name as string | undefined
        );

      case "analyze_document": {
        const doc = await db.document.findUnique({
          where: { id: input.document_id as string },
          select: { parsedContent: true, fileName: true, documentType: true, parsedMetadata: true },
        });
        if (!doc) return { content: "Document not found", is_error: true };
        const focusAreas = (input.focus_areas as string[]) || [];
        return {
          content: JSON.stringify({
            fileName: doc.fileName,
            type: doc.documentType,
            contentPreview: doc.parsedContent?.substring(0, 5000) || "No parsed content available",
            metadata: doc.parsedMetadata,
            focusAreas,
          }),
        };
      }

      case "search_news":
        return await searchNews(
          input.query as string,
          (input.days_back as number) || 30
        );

      case "extract_financial_data": {
        const doc = await db.document.findUnique({
          where: { id: input.document_id as string },
          select: { parsedContent: true, fileName: true },
        });
        if (!doc) return { content: "Document not found", is_error: true };
        const metrics = (input.metrics as string[]) || [];

        // Use financial extractor if content is available
        let extractedData = {};
        if (doc.parsedContent) {
          const { extractFinancialData } = await import("./financial-extractor");
          extractedData = extractFinancialData(doc.parsedContent);
        }

        return {
          content: JSON.stringify({
            fileName: doc.fileName,
            requestedMetrics: metrics,
            extracted: extractedData,
            contentPreview: doc.parsedContent?.substring(0, 3000) || "No content available",
          }),
        };
      }

      case "create_finding": {
        const finding = await db.finding.create({
          data: {
            missionId: context.missionId,
            title: input.title as string,
            content: input.content as string,
            category: (input.category as string) || null,
            confidence: (input.confidence as "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED") || "UNVERIFIED",
            sourceText: (input.source_text as string) || null,
            sourcePage: (input.source_page as number) || null,
            sourceUrl: (input.source_url as string) || null,
            documentId: (input.document_id as string) || null,
          },
        });

        context.onEvent?.({
          type: "finding_created",
          data: {
            findingId: finding.id,
            title: finding.title,
            confidence: finding.confidence,
            category: finding.category,
          },
          timestamp: new Date(),
        });

        return {
          content: JSON.stringify({
            status: "created",
            id: finding.id,
            title: finding.title,
            content: finding.content,
            category: finding.category,
            confidence: finding.confidence,
          }),
        };
      }

      case "verify_finding": {
        const finding = await db.finding.findUnique({
          where: { id: input.finding_id as string },
          include: { document: { select: { parsedContent: true, fileName: true } } },
        });
        if (!finding) return { content: "Finding not found", is_error: true };
        return {
          content: JSON.stringify({
            finding: { title: finding.title, content: finding.content, confidence: finding.confidence },
            sourceDocument: finding.document ? { fileName: finding.document.fileName, hasContent: !!finding.document.parsedContent } : null,
            verificationMethod: input.verification_method,
          }),
        };
      }

      case "check_consistency": {
        const findingIds = input.finding_ids as string[];
        const findings = await db.finding.findMany({
          where: { id: { in: findingIds } },
          select: { id: true, title: true, content: true, confidence: true, category: true },
        });
        return { content: JSON.stringify({ findings, count: findings.length }) };
      }

      case "assess_data_quality": {
        const doc = await db.document.findUnique({
          where: { id: input.document_id as string },
          select: { fileName: true, documentType: true, source: true, pageCount: true, status: true },
        });
        if (!doc) return { content: "Document not found", is_error: true };
        return { content: JSON.stringify(doc) };
      }

      case "flag_risk": {
        const flagFindingId = input.finding_id as string | undefined;
        if (flagFindingId) {
          await db.finding.update({
            where: { id: flagFindingId },
            data: {
              isFlagged: true,
              flagReason: input.risk_description as string,
            },
          });
        }
        return {
          content: JSON.stringify({
            status: "flagged",
            findingId: flagFindingId,
            severity: input.severity,
            reason: input.risk_description,
          }),
        };
      }

      case "update_confidence": {
        const ucFindingId = input.finding_id as string;
        const newConfidence = input.new_confidence as "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
        const auditNotes = input.audit_notes as string;

        await db.finding.update({
          where: { id: ucFindingId },
          data: {
            confidence: newConfidence,
            auditNotes,
            verifiedBy: "AUDITOR",
            verifiedAt: new Date(),
          },
        });

        return {
          content: JSON.stringify({
            status: "updated",
            findingId: ucFindingId,
            newConfidence,
            auditNotes,
          }),
        };
      }

      case "create_research_task":
        return {
          content: JSON.stringify({
            status: "task_created",
            description: input.task_description,
          }),
        };

      case "create_audit_task":
        return {
          content: JSON.stringify({
            status: "audit_task_created",
            description: input.task_description,
          }),
        };

      case "get_mission_findings": {
        const where: Record<string, unknown> = { missionId: context.missionId };
        if (input.confidence_filter) {
          where.confidence = input.confidence_filter;
        }
        const findings = await db.finding.findMany({
          where,
          select: { id: true, title: true, content: true, confidence: true, category: true, isFlagged: true },
        });
        return { content: JSON.stringify({ findings, total: findings.length }) };
      }

      case "get_task_status": {
        const where: Record<string, unknown> = { missionId: context.missionId };
        if (input.task_id) where.id = input.task_id;
        const tasks = await db.agentTask.findMany({
          where,
          select: { id: true, agentType: true, status: true, taskDescription: true },
        });
        return { content: JSON.stringify({ tasks }) };
      }

      case "synthesize_report": {
        const reportFindings = await db.finding.findMany({
          where: { missionId: context.missionId },
          orderBy: { createdAt: "asc" },
        });

        const flagged = reportFindings.filter((f) => f.isFlagged);
        const byConfidence = {
          HIGH: reportFindings.filter((f) => f.confidence === "HIGH"),
          MEDIUM: reportFindings.filter((f) => f.confidence === "MEDIUM"),
          LOW: reportFindings.filter((f) => f.confidence === "LOW"),
          UNVERIFIED: reportFindings.filter((f) => f.confidence === "UNVERIFIED"),
        };

        return {
          content: JSON.stringify({
            status: "report_synthesized",
            format: input.format,
            totalFindings: reportFindings.length,
            flaggedRisks: flagged.length,
            confidenceBreakdown: {
              HIGH: byConfidence.HIGH.length,
              MEDIUM: byConfidence.MEDIUM.length,
              LOW: byConfidence.LOW.length,
              UNVERIFIED: byConfidence.UNVERIFIED.length,
            },
            findings: reportFindings.map((f) => ({
              title: f.title,
              content: f.content,
              confidence: f.confidence,
              category: f.category,
              isFlagged: f.isFlagged,
              flagReason: f.flagReason,
              auditNotes: f.auditNotes,
            })),
            flaggedItems: flagged.map((f) => ({
              title: f.title,
              flagReason: f.flagReason,
            })),
          }),
        };
      }

      case "send_user_update": {
        await db.chatMessage.create({
          data: {
            missionId: context.missionId,
            role: "system",
            content: input.message as string,
            metadata: { type: String(input.type) },
          },
        });
        context.onEvent?.({
          type: "chat_message",
          data: { role: "system", content: input.message, type: input.type },
          timestamp: new Date(),
        });
        return { content: "Update sent" };
      }

      case "search_bdc_portfolio": {
        const { searchBdcPortfolio } = await import("./edgar-client");
        const results = searchBdcPortfolio(
          input.query as string,
          (input.top_k as number) || 5
        );
        return { content: JSON.stringify({ results, total: results.length }) };
      }

      default:
        return { content: `Unknown tool: ${toolName}`, is_error: true };
    }
  } catch (error) {
    return {
      content: `Tool error: ${error instanceof Error ? error.message : "Unknown error"}`,
      is_error: true,
    };
  }
}
