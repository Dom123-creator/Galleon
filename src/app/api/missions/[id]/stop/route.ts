import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { activeMissions } from "../start/route";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const mission = await db.mission.findFirst({ where: { id, userId: user.id } });
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    if (mission.status !== "RUNNING") {
      return NextResponse.json({ error: "Mission is not running" }, { status: 400 });
    }

    // Abort the mission
    const controller = activeMissions.get(id);
    if (controller) {
      controller.abort();
      activeMissions.delete(id);
    }

    await db.mission.update({
      where: { id },
      data: { status: "CANCELED", completedAt: new Date() },
    });

    return NextResponse.json({ status: "canceled", missionId: id });
  } catch (error) {
    console.error("Stop mission error:", error);
    return NextResponse.json({ error: "Failed to stop mission" }, { status: 500 });
  }
}
