import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { SSEStream, createSSEResponse } from "@/lib/sse";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    return new Response("User not found", { status: 404 });
  }

  const { id } = await params;
  const mission = await db.mission.findFirst({ where: { id, userId: user.id } });
  if (!mission) {
    return new Response("Mission not found", { status: 404 });
  }

  const stream = new SSEStream();

  // Send initial connection event
  stream.send("connected", {
    missionId: id,
    status: mission.status,
    timestamp: new Date().toISOString(),
  });

  // Send heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    if (stream.isClosed) {
      clearInterval(heartbeatInterval);
      return;
    }
    stream.send("heartbeat", { timestamp: new Date().toISOString() });
  }, 30000);

  // Poll for mission updates
  const pollInterval = setInterval(async () => {
    if (stream.isClosed) {
      clearInterval(pollInterval);
      return;
    }

    try {
      const currentMission = await db.mission.findUnique({
        where: { id },
        select: { status: true, completedAt: true },
      });

      if (currentMission && (currentMission.status === "COMPLETED" || currentMission.status === "FAILED" || currentMission.status === "CANCELED")) {
        stream.send("mission_status", {
          status: currentMission.status,
          completedAt: currentMission.completedAt?.toISOString(),
        });
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        stream.close();
      }
    } catch {
      // Ignore polling errors
    }
  }, 2000);

  return createSSEResponse(stream);
}
