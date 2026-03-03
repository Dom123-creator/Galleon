import type { AgentEvent } from "@/lib/agents/types";

export type SSEEventType =
  | "agent_started"
  | "agent_progress"
  | "agent_completed"
  | "agent_error"
  | "finding_created"
  | "mission_status"
  | "chat_message"
  | "connected"
  | "heartbeat";

export class SSEStream {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private closed = false;

  readonly stream: ReadableStream<Uint8Array>;

  constructor() {
    this.stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.closed = true;
      },
    });
  }

  send(event: SSEEventType, data: unknown): void {
    if (this.closed || !this.controller) return;

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      this.controller.enqueue(this.encoder.encode(message));
    } catch {
      // Stream closed
      this.closed = true;
    }
  }

  close(): void {
    if (this.closed || !this.controller) return;
    this.closed = true;
    try {
      this.controller.close();
    } catch {
      // Already closed
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

export function createSSEResponse(stream: SSEStream): Response {
  return new Response(stream.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function agentEventToSSE(event: AgentEvent): { type: SSEEventType; data: Record<string, unknown> } {
  return {
    type: event.type as SSEEventType,
    data: {
      agentType: event.agentType,
      ...event.data,
      timestamp: event.timestamp.toISOString(),
    },
  };
}
