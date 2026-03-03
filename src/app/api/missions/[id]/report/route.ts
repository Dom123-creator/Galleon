import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const mission = await db.mission.findFirst({
      where: { id, userId: user.id },
      include: {
        deal: true,
        findings: {
          orderBy: { confidence: "asc" },
          include: {
            document: { select: { fileName: true, documentType: true } },
          },
        },
        agentTasks: { orderBy: { sequenceNumber: "asc" } },
      },
    });

    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    if (mission.status !== "COMPLETED") {
      return NextResponse.json({ error: "Mission is not yet completed" }, { status: 400 });
    }

    // Return structured report data
    const report = {
      mission: {
        title: mission.title,
        objective: mission.objective,
        status: mission.status,
        startedAt: mission.startedAt,
        completedAt: mission.completedAt,
        confidenceScore: mission.confidenceScore,
      },
      deal: mission.deal ? {
        name: mission.deal.name,
        borrowerName: mission.deal.borrowerName,
        lenderName: mission.deal.lenderName,
        dealSize: mission.deal.dealSize,
        sector: mission.deal.sector,
      } : null,
      summary: mission.summary,
      recommendation: mission.recommendation,
      findings: mission.findings.map((f) => ({
        title: f.title,
        content: f.content,
        category: f.category,
        confidence: f.confidence,
        sourceText: f.sourceText,
        sourceUrl: f.sourceUrl,
        isFlagged: f.isFlagged,
        flagReason: f.flagReason,
        verifiedBy: f.verifiedBy,
        document: f.document,
      })),
      agentTasks: mission.agentTasks.map((t) => ({
        agentType: t.agentType,
        description: t.taskDescription,
        status: t.status,
        tokensUsed: t.tokensUsed,
      })),
      usage: {
        totalTokensUsed: mission.totalTokensUsed,
        totalApiCalls: mission.totalApiCalls,
      },
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error("Get report error:", error);
    return NextResponse.json({ error: "Failed to get report" }, { status: 500 });
  }
}
