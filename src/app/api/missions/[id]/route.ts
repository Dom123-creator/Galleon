import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { missionUpdateSchema } from "@/lib/validations";

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
        agentTasks: { orderBy: { sequenceNumber: "asc" } },
        findings: { orderBy: { createdAt: "desc" } },
        chatMessages: { orderBy: { createdAt: "asc" } },
        _count: { select: { agentTasks: true, findings: true, chatMessages: true } },
      },
    });

    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    return NextResponse.json(mission);
  } catch (error) {
    console.error("Get mission error:", error);
    return NextResponse.json({ error: "Failed to get mission" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const existing = await db.mission.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    if (existing.status === "RUNNING") {
      return NextResponse.json({ error: "Cannot edit a running mission" }, { status: 400 });
    }

    const body = await req.json();
    const validation = missionUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    const { scope, ...rest } = validation.data;
    const mission = await db.mission.update({
      where: { id },
      data: {
        ...rest,
        ...(scope !== undefined && { scope: scope as Record<string, string> }),
      },
    });

    return NextResponse.json(mission);
  } catch (error) {
    console.error("Update mission error:", error);
    return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const existing = await db.mission.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    if (existing.status === "RUNNING") {
      return NextResponse.json({ error: "Cannot delete a running mission" }, { status: 400 });
    }

    await db.mission.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete mission error:", error);
    return NextResponse.json({ error: "Failed to delete mission" }, { status: 500 });
  }
}
