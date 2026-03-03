import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { createAgentCompletion } from "@/lib/anthropic";
import { executeResearchTask } from "./research-agent";
import { executeAuditTask } from "./auditor-agent";
import type { AgentContext, AgentResult, FindingData } from "./types";

const MAX_ITERATIONS = 20;

export async function executeMission(
  missionId: string,
  signal?: AbortSignal,
  onEvent?: AgentContext["onEvent"]
): Promise<void> {
  // Load mission
  const mission = await db.mission.findUnique({
    where: { id: missionId },
    include: { deal: true, user: true },
  });

  if (!mission) throw new Error("Mission not found");

  const context: AgentContext = {
    missionId,
    dealId: mission.dealId || undefined,
    userId: mission.userId,
    signal,
    onEvent,
  };

  // Update mission status
  await db.mission.update({
    where: { id: missionId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  onEvent?.({
    type: "mission_status",
    agentType: "MASTER",
    data: { status: "RUNNING", phase: "planning" },
    timestamp: new Date(),
  });

  try {
    // Phase 1: Master Agent creates a plan
    const planMessages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Mission Objective: ${mission.objective}\n\n${mission.successCriteria ? `Success Criteria: ${mission.successCriteria}\n\n` : ""}${mission.deal ? `Deal: ${mission.deal.name} (${mission.deal.borrowerName || "Unknown borrower"})\nSector: ${mission.deal.sector}\nDeal Size: ${mission.deal.dealSize || "Unknown"}\n\n` : ""}${mission.scope ? `Scope: ${JSON.stringify(mission.scope)}\n\n` : ""}Create a detailed research plan. List the specific research tasks needed.`,
      },
    ];

    const planResponse = await createAgentCompletion("MASTER", planMessages, signal);
    let totalTokens = (planResponse.usage?.input_tokens || 0) + (planResponse.usage?.output_tokens || 0);

    // Extract research tasks from tool calls
    const researchTasks: string[] = [];
    const auditTasks: string[] = [];

    // Process master's plan (simplified - execute tool calls)
    for (const block of planResponse.content) {
      if (block.type === "tool_use") {
        if (block.name === "create_research_task") {
          const input = block.input as Record<string, unknown>;
          researchTasks.push(input.task_description as string);
        } else if (block.name === "create_audit_task") {
          const input = block.input as Record<string, unknown>;
          auditTasks.push(input.task_description as string);
        }
      }
    }

    // If no tool calls, use the text as a single research task
    if (researchTasks.length === 0) {
      researchTasks.push(mission.objective);
    }

    // Phase 2: Execute research tasks in parallel
    onEvent?.({
      type: "mission_status",
      agentType: "MASTER",
      data: { status: "RUNNING", phase: "research", taskCount: researchTasks.length },
      timestamp: new Date(),
    });

    const researchPromises = researchTasks.map(async (task, idx) => {
      // Create agent task record
      const agentTask = await db.agentTask.create({
        data: {
          missionId,
          agentType: "RESEARCH",
          taskDescription: task,
          sequenceNumber: idx,
          status: "RUNNING",
          startedAt: new Date(),
        },
      });

      try {
        const result = await executeResearchTask(context, task);

        await db.agentTask.update({
          where: { id: agentTask.id },
          data: {
            status: result.success ? "COMPLETED" : "FAILED",
            completedAt: new Date(),
            tokensUsed: result.tokensUsed,
            error: result.error,
          },
        });

        return result;
      } catch (error) {
        await db.agentTask.update({
          where: { id: agentTask.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
        return { success: false, findings: [], tokensUsed: 0, error: String(error) } as AgentResult;
      }
    });

    const researchResults = await Promise.allSettled(researchPromises);

    // Collect all findings
    const allFindings: FindingData[] = [];
    for (const result of researchResults) {
      if (result.status === "fulfilled") {
        allFindings.push(...result.value.findings);
        totalTokens += result.value.tokensUsed;
      }
    }

    if (signal?.aborted) {
      await db.mission.update({
        where: { id: missionId },
        data: { status: "CANCELED", completedAt: new Date(), totalTokensUsed: totalTokens },
      });
      return;
    }

    // Phase 3: Audit findings
    onEvent?.({
      type: "mission_status",
      agentType: "MASTER",
      data: { status: "RUNNING", phase: "audit", findingsCount: allFindings.length },
      timestamp: new Date(),
    });

    const missionFindings = await db.finding.findMany({
      where: { missionId },
      select: { id: true },
    });

    if (missionFindings.length > 0) {
      const auditAgentTask = await db.agentTask.create({
        data: {
          missionId,
          agentType: "AUDITOR",
          taskDescription: `Audit ${missionFindings.length} research findings`,
          sequenceNumber: researchTasks.length,
          status: "RUNNING",
          startedAt: new Date(),
        },
      });

      try {
        const auditResult = await executeAuditTask(
          context,
          missionFindings.map((f) => f.id)
        );
        totalTokens += auditResult.tokensUsed;

        await db.agentTask.update({
          where: { id: auditAgentTask.id },
          data: {
            status: auditResult.success ? "COMPLETED" : "FAILED",
            completedAt: new Date(),
            tokensUsed: auditResult.tokensUsed,
          },
        });
      } catch (error) {
        await db.agentTask.update({
          where: { id: auditAgentTask.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    if (signal?.aborted) {
      await db.mission.update({
        where: { id: missionId },
        data: { status: "CANCELED", completedAt: new Date(), totalTokensUsed: totalTokens },
      });
      return;
    }

    // Phase 4: Synthesize recommendation
    onEvent?.({
      type: "mission_status",
      agentType: "MASTER",
      data: { status: "RUNNING", phase: "synthesis" },
      timestamp: new Date(),
    });

    const verifiedFindings = await db.finding.findMany({
      where: { missionId },
    });

    const synthesisMessages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Mission Objective: ${mission.objective}\n\nFindings:\n${JSON.stringify(verifiedFindings.map((f) => ({
          title: f.title,
          content: f.content,
          confidence: f.confidence,
          category: f.category,
          isFlagged: f.isFlagged,
          flagReason: f.flagReason,
        })), null, 2)}\n\nSynthesize a comprehensive recommendation based on these findings. Include a confidence score (0-1).`,
      },
    ];

    const synthesisResponse = await createAgentCompletion("MASTER", synthesisMessages, signal);
    totalTokens += (synthesisResponse.usage?.input_tokens || 0) + (synthesisResponse.usage?.output_tokens || 0);

    let summary = "";
    let recommendation = "";
    for (const block of synthesisResponse.content) {
      if (block.type === "text") {
        summary = block.text;
        recommendation = block.text;
      }
    }

    // Calculate confidence score based on findings
    const highConfidence = verifiedFindings.filter((f) => f.confidence === "HIGH").length;
    const totalFindingsCount = verifiedFindings.length;
    const confidenceScore = totalFindingsCount > 0 ? highConfidence / totalFindingsCount : 0;

    // Update mission as completed
    await db.mission.update({
      where: { id: missionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        summary,
        recommendation,
        confidenceScore,
        totalTokensUsed: totalTokens,
        totalApiCalls: researchTasks.length + 2, // research + audit + synthesis
      },
    });

    onEvent?.({
      type: "mission_status",
      agentType: "MASTER",
      data: { status: "COMPLETED", findingsCount: verifiedFindings.length, confidenceScore },
      timestamp: new Date(),
    });
  } catch (error) {
    await db.mission.update({
      where: { id: missionId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        summary: error instanceof Error ? error.message : "Mission failed",
      },
    });

    onEvent?.({
      type: "agent_error",
      agentType: "MASTER",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
      timestamp: new Date(),
    });
  }
}
