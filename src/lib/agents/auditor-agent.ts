import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { createAgentCompletion } from "@/lib/anthropic";
import type { AgentContext, AgentResult, FindingData } from "./types";
import { executeToolCall } from "./tools";

const MAX_ITERATIONS = 20;

export async function executeAuditTask(
  context: AgentContext,
  findingIds: string[]
): Promise<AgentResult> {
  const findings: FindingData[] = [];
  let tokensUsed = 0;

  // Fetch findings to audit
  const existingFindings = await db.finding.findMany({
    where: { id: { in: findingIds } },
    include: { document: { select: { fileName: true, parsedContent: true } } },
  });

  const findingsSummary = existingFindings.map((f) => ({
    id: f.id,
    title: f.title,
    content: f.content,
    confidence: f.confidence,
    sourceText: f.sourceText,
    sourceUrl: f.sourceUrl,
    documentName: f.document?.fileName,
  }));

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Audit the following findings for accuracy, consistency, and data quality:\n\n${JSON.stringify(findingsSummary, null, 2)}`,
    },
  ];

  context.onEvent?.({
    type: "agent_started",
    agentType: "AUDITOR",
    data: { findingsToAudit: findingIds.length },
    timestamp: new Date(),
  });

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (context.signal?.aborted) {
      return { success: false, findings, tokensUsed, error: "Canceled" };
    }

    const response = await createAgentCompletion("AUDITOR", messages, context.signal);
    tokensUsed += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    context.onEvent?.({
      type: "agent_progress",
      agentType: "AUDITOR",
      data: { iteration: i + 1, stopReason: response.stop_reason },
      timestamp: new Date(),
    });

    if (response.stop_reason === "end_turn") {
      context.onEvent?.({
        type: "agent_completed",
        agentType: "AUDITOR",
        data: { auditedFindings: findingIds.length },
        timestamp: new Date(),
      });
      break;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeToolCall(
            block.name,
            block.input as Record<string, unknown>,
            context
          );

          // Handle confidence updates
          if (block.name === "update_confidence" && !result.is_error) {
            const input = block.input as Record<string, unknown>;
            await db.finding.update({
              where: { id: input.finding_id as string },
              data: {
                confidence: input.new_confidence as "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED",
                auditNotes: input.audit_notes as string,
                verifiedBy: "AUDITOR",
                verifiedAt: new Date(),
              },
            });
          }

          // Handle risk flags
          if (block.name === "flag_risk" && !result.is_error) {
            const input = block.input as Record<string, unknown>;
            if (input.finding_id) {
              await db.finding.update({
                where: { id: input.finding_id as string },
                data: {
                  isFlagged: true,
                  flagReason: input.risk_description as string,
                },
              });
            }
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result.content,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return { success: true, findings, tokensUsed };
}
