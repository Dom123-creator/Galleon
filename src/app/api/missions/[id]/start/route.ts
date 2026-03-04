import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasAgentAccess } from "@/lib/auth";
import { executeMission } from "@/lib/agents/master-agent";
import { emit } from "@/lib/mission-events";

// Store active mission abort controllers
const activeMissions = new Map<string, AbortController>();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check agent access
    const hasAccess = await hasAgentAccess();
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Agent access requires Professional or Enterprise subscription" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const mission = await db.mission.findFirst({ where: { id, userId: user.id } });
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    if (mission.status === "RUNNING") {
      return NextResponse.json({ error: "Mission is already running" }, { status: 400 });
    }

    if (mission.status === "COMPLETED") {
      return NextResponse.json({ error: "Mission is already completed" }, { status: 400 });
    }

    // Create abort controller for cancellation
    const controller = new AbortController();
    activeMissions.set(id, controller);

    // Pass onEvent callback that emits to event bus
    const onEvent = (event: Parameters<typeof emit>[1]) => emit(id, event);

    // Start mission execution in background
    executeMission(id, controller.signal, onEvent).finally(() => {
      activeMissions.delete(id);
    });

    return NextResponse.json({ status: "started", missionId: id });
  } catch (error) {
    console.error("Start mission error:", error);
    return NextResponse.json({ error: "Failed to start mission" }, { status: 500 });
  }
}

// Export for stop route to access
export { activeMissions };
