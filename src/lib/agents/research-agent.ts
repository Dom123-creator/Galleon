import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { createAgentCompletion } from "@/lib/anthropic";
import type { AgentContext, AgentResult, FindingData } from "./types";
import { executeToolCall } from "./tools";

const MAX_ITERATIONS = 20;

export async function executeResearchTask(
  context: AgentContext,
  taskDescription: string
): Promise<AgentResult> {
  const findings: FindingData[] = [];
  let tokensUsed = 0;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research Task: ${taskDescription}\n\nMission ID: ${context.missionId}${context.dealId ? `\nDeal ID: ${context.dealId}` : ""}`,
    },
  ];

  context.onEvent?.({
    type: "agent_started",
    agentType: "RESEARCH",
    data: { taskDescription },
    timestamp: new Date(),
  });

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (context.signal?.aborted) {
      return { success: false, findings, tokensUsed, error: "Canceled" };
    }

    const response = await createAgentCompletion("RESEARCH", messages, context.signal);
    tokensUsed += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    context.onEvent?.({
      type: "agent_progress",
      agentType: "RESEARCH",
      data: { iteration: i + 1, stopReason: response.stop_reason },
      timestamp: new Date(),
    });

    // Check if we're done
    if (response.stop_reason === "end_turn") {
      const textContent = response.content.find((b) => b.type === "text");
      if (textContent && textContent.type === "text") {
        context.onEvent?.({
          type: "agent_completed",
          agentType: "RESEARCH",
          data: { summary: textContent.text, findingsCount: findings.length },
          timestamp: new Date(),
        });
      }
      break;
    }

    // Process tool calls
    if (response.stop_reason === "tool_use") {
      // Add assistant response to messages
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeToolCall(
            block.name,
            block.input as Record<string, unknown>,
            context
          );

          // If this was a create_finding call, capture the finding
          if (block.name === "create_finding" && !result.is_error) {
            const input = block.input as Record<string, unknown>;
            const finding: FindingData = {
              title: input.title as string,
              content: input.content as string,
              category: input.category as string | undefined,
              confidence: (input.confidence as FindingData["confidence"]) || "UNVERIFIED",
              sourceText: input.source_text as string | undefined,
              sourcePage: input.source_page as number | undefined,
              sourceUrl: input.source_url as string | undefined,
              documentId: input.document_id as string | undefined,
            };
            findings.push(finding);

            // Save finding to DB
            await db.finding.create({
              data: {
                missionId: context.missionId,
                dealId: context.dealId,
                documentId: finding.documentId,
                title: finding.title,
                content: finding.content,
                category: finding.category,
                confidence: finding.confidence,
                sourceText: finding.sourceText,
                sourcePage: finding.sourcePage,
                sourceUrl: finding.sourceUrl,
              },
            });

            context.onEvent?.({
              type: "finding_created",
              agentType: "RESEARCH",
              data: { title: finding.title, confidence: finding.confidence },
              timestamp: new Date(),
            });
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
