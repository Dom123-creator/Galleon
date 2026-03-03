import type { AgentType, AgentTaskStatus, FindingConfidence } from "@prisma/client";

export interface AgentContext {
  missionId: string;
  dealId?: string;
  userId: string;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentResult {
  success: boolean;
  findings: FindingData[];
  tokensUsed: number;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string | AgentContentBlock[];
}

export interface AgentContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface FindingData {
  title: string;
  content: string;
  category?: string;
  confidence: FindingConfidence;
  sourceText?: string;
  sourcePage?: number;
  sourceUrl?: string;
  documentId?: string;
}

export type AgentEventType =
  | "agent_started"
  | "agent_progress"
  | "agent_completed"
  | "agent_error"
  | "finding_created"
  | "mission_status"
  | "chat_message";

export interface AgentEvent {
  type: AgentEventType;
  agentType?: AgentType;
  data: Record<string, unknown>;
  timestamp: Date;
}
