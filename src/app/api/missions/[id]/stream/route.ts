import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SSEStream, createSSEResponse, agentEventToSSE } from "@/lib/sse";
import { subscribe } from "@/lib/mission-events";

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

  // If mission already terminal, send status and close
  if (["COMPLETED", "FAILED", "CANCELED"].includes(mission.status)) {
    stream.send("mission_status", {
      status: mission.status,
      completedAt: mission.completedAt?.toISOString(),
    });
    stream.close();
    return createSSEResponse(stream);
  }

  // Subscribe to real-time events from the event bus
  const unsubscribe = subscribe(id, (event) => {
    if (stream.isClosed) {
      unsubscribe();
      return;
    }

    const sse = agentEventToSSE(event);
    stream.send(sse.type, sse.data);

    // Auto-close on terminal mission status
    if (event.type === "mission_status") {
      const status = event.data?.status as string;
      if (["COMPLETED", "FAILED", "CANCELED"].includes(status)) {
        clearInterval(heartbeatInterval);
        clearInterval(fallbackPoll);
        stream.close();
        unsubscribe();
      }
    }
  });

  // Heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    if (stream.isClosed) {
      clearInterval(heartbeatInterval);
      clearInterval(fallbackPoll);
      unsubscribe();
      return;
    }
    stream.send("heartbeat", { timestamp: new Date().toISOString() });
  }, 30000);

  // Fallback poll every 10s in case event bus misses terminal state
  const fallbackPoll = setInterval(async () => {
    if (stream.isClosed) {
      clearInterval(fallbackPoll);
      return;
    }

    try {
      const currentMission = await db.mission.findUnique({
        where: { id },
        select: { status: true, completedAt: true },
      });

      if (currentMission && ["COMPLETED", "FAILED", "CANCELED"].includes(currentMission.status)) {
        stream.send("mission_status", {
          status: currentMission.status,
          completedAt: currentMission.completedAt?.toISOString(),
        });
        clearInterval(fallbackPoll);
        clearInterval(heartbeatInterval);
        stream.close();
        unsubscribe();
      }
    } catch {
      // Ignore polling errors
    }
  }, 10000);

  return createSSEResponse(stream);
}
