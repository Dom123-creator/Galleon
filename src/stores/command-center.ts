import { create } from "zustand";
import type { AgentEvent } from "@/types";

interface AgentStatus {
  type: string;
  status: "idle" | "running" | "completed" | "error";
  lastUpdate?: string;
}

interface CommandCenterState {
  // Connection
  isConnected: boolean;
  missionId: string | null;

  // Agent statuses
  agentStatuses: Record<string, AgentStatus>;

  // Events
  events: AgentEvent[];

  // Chat
  chatMessages: Array<{ role: string; content: string; createdAt: string }>;
  isSending: boolean;

  // Mission data
  missionStatus: string | null;

  // Actions
  setMissionId: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
  addEvent: (event: AgentEvent) => void;
  updateAgentStatus: (type: string, status: AgentStatus["status"]) => void;
  addChatMessage: (message: { role: string; content: string; createdAt: string }) => void;
  setIsSending: (sending: boolean) => void;
  setMissionStatus: (status: string) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  missionId: null,
  agentStatuses: {
    RESEARCH: { type: "RESEARCH", status: "idle" as const },
    AUDITOR: { type: "AUDITOR", status: "idle" as const },
    MASTER: { type: "MASTER", status: "idle" as const },
  },
  events: [],
  chatMessages: [],
  isSending: false,
  missionStatus: null,
};

export const useCommandCenterStore = create<CommandCenterState>((set) => ({
  ...initialState,

  setMissionId: (id) => set({ missionId: id }),

  setConnected: (connected) => set({ isConnected: connected }),

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
      ...(event.agentType
        ? {
            agentStatuses: {
              ...state.agentStatuses,
              [event.agentType]: {
                type: event.agentType,
                status:
                  event.type === "agent_started"
                    ? "running"
                    : event.type === "agent_completed"
                      ? "completed"
                      : event.type === "agent_error"
                        ? "error"
                        : state.agentStatuses[event.agentType]?.status || "idle",
                lastUpdate: event.timestamp,
              },
            },
          }
        : {}),
    })),

  updateAgentStatus: (type, status) =>
    set((state) => ({
      agentStatuses: {
        ...state.agentStatuses,
        [type]: { ...state.agentStatuses[type], type, status },
      },
    })),

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),

  setIsSending: (sending) => set({ isSending: sending }),

  setMissionStatus: (status) => set({ missionStatus: status }),

  reset: () => set(initialState),
}));
