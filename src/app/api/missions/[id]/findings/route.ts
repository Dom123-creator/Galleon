import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const mission = await db.mission.findFirst({ where: { id, userId: user.id } });
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const confidence = searchParams.get("confidence");
    const category = searchParams.get("category");
    const flagged = searchParams.get("flagged");

    const where: Record<string, unknown> = { missionId: id };
    if (confidence) where.confidence = confidence;
    if (category) where.category = category;
    if (flagged === "true") where.isFlagged = true;

    const findings = await db.finding.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        document: { select: { fileName: true, documentType: true } },
      },
    });

    return NextResponse.json({ findings, total: findings.length });
  } catch (error) {
    console.error("List findings error:", error);
    return NextResponse.json({ error: "Failed to list findings" }, { status: 500 });
  }
}
