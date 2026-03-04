import type { AgentEvent } from "@/lib/agents/types";

type EventCallback = (event: AgentEvent) => void;

const subscribers = new Map<string, Set<EventCallback>>();

export function subscribe(missionId: string, callback: EventCallback): () => void {
  if (!subscribers.has(missionId)) {
    subscribers.set(missionId, new Set());
  }
  subscribers.get(missionId)!.add(callback);

  return () => {
    const subs = subscribers.get(missionId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) subscribers.delete(missionId);
    }
  };
}

export function emit(missionId: string, event: AgentEvent): void {
  const subs = subscribers.get(missionId);
  if (subs) {
    for (const cb of subs) {
      try {
        cb(event);
      } catch {
        // Don't let one subscriber crash others
      }
    }
  }
}
