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
          input.deal_id as string | undefined || context.dealId
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
        return {
          content: JSON.stringify({
            fileName: doc.fileName,
            requestedMetrics: metrics,
            note: "Financial data extraction from parsed content. Metrics should be extracted from the document text.",
            contentPreview: doc.parsedContent?.substring(0, 3000) || "No content available",
          }),
        };
      }

      case "create_finding":
        return {
          content: JSON.stringify({
            status: "created",
            title: input.title,
            confidence: input.confidence,
          }),
        };

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

      case "flag_risk":
        return {
          content: JSON.stringify({
            status: "flagged",
            findingId: input.finding_id,
            severity: input.severity,
          }),
        };

      case "update_confidence":
        return {
          content: JSON.stringify({
            status: "updated",
            findingId: input.finding_id,
            newConfidence: input.new_confidence,
          }),
        };

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

      case "synthesize_report":
        return {
          content: JSON.stringify({
            status: "report_synthesized",
            format: input.format,
          }),
        };

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
