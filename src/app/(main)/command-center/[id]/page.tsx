"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Play,
  Square,
  Send,
  Zap,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Shield,
  Anchor,
} from "lucide-react";
import {
  cn,
  formatRelativeTime,
} from "@/lib/utils";

interface Mission {
  id: string;
  title: string;
  status: string;
  objective: string;
  confidenceScore: number | null;
  summary: string | null;
  tokensUsed: number;
  findings: Finding[];
  agentTasks: AgentTask[];
}

interface Finding {
  id: string;
  title: string;
  content: string;
  confidence: string;
  category: string;
  sourceUrl: string | null;
  createdAt: string;
}

interface AgentTask {
  id: string;
  agentType: string;
  taskType: string;
  status: string;
  description: string | null;
  output: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, "success" | "warning" | "danger" | "info"> = {
    HIGH: "success",
    MEDIUM: "warning",
    LOW: "danger",
    UNVERIFIED: "info",
  };
  return <Badge variant={map[confidence] || "default"}>{confidence}</Badge>;
}

export default function CommandCenterPage() {
  const params = useParams();
  const router = useRouter();
  const missionId = params.id as string;

  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMission = useCallback(async () => {
    try {
      const res = await fetch(`/api/missions/${missionId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Mission not found");
          return;
        }
        throw new Error("Failed to fetch mission");
      }
      const data = await res.json();
      setMission(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mission");
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    fetchMission();
    pollRef.current = setInterval(fetchMission, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMission]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleStartMission() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (!res.ok) throw new Error("Failed to start mission");
      await fetchMission();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start mission");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStopMission() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (!res.ok) throw new Error("Failed to stop mission");
      await fetchMission();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop mission");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || sendingChat) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setSendingChat(true);

    try {
      const res = await fetch(`/api/missions/${missionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "Message received. Agents are processing.",
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Failed to send message. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSendingChat(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-gold animate-spin mx-auto mb-4" />
          <p className="text-muted font-mono text-sm">Loading Command Center...</p>
        </div>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-g-red mx-auto mb-4" />
          <p className="text-muted mb-4">{error || "Mission not found"}</p>
          <Link href="/missions">
            <Button variant="outline">Back to Missions</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isRunning = ["RUNNING", "QUEUED"].includes(mission.status);
  const canStart = ["DRAFT", "PAUSED"].includes(mission.status);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-navy-2 sticky top-0 z-10">
        <div className="mx-auto max-w-full px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href={`/missions/${mission.id}`}
                className="text-muted hover:text-gold transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="font-serif text-base font-bold text-cream truncate">
                  {mission.title}
                </h1>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      mission.status === "RUNNING" ? "info" :
                      mission.status === "COMPLETED" ? "success" :
                      mission.status === "FAILED" ? "danger" : "default"
                    }
                  >
                    {mission.status}
                  </Badge>
                  {mission.confidenceScore !== null && (
                    <span className="font-mono text-[11px] text-gold">
                      {Math.round(mission.confidenceScore * 100)}% confidence
                    </span>
                  )}
                  <span className="text-[11px] text-muted">
                    {mission.findings.length} findings
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={fetchMission}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {canStart && (
                <Button
                  size="sm"
                  onClick={handleStartMission}
                  disabled={actionLoading}
                  className="bg-g-green/20 text-g-green border border-g-green/30 hover:bg-g-green/30"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Start
                </Button>
              )}
              {isRunning && (
                <Button
                  size="sm"
                  onClick={handleStopMission}
                  disabled={actionLoading}
                  variant="destructive"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4 mr-1" />
                  )}
                  Stop
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 h-[calc(100vh-65px)]">
        {/* Left Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Agent Activity */}
          <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Zap className="h-3.5 w-3.5 text-gold/60" />
              <h2 className="section-title">Agent Activity</h2>
              {isRunning && (
                <span className="flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute h-2 w-2 rounded-full bg-g-blue opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-g-blue" />
                </span>
              )}
            </div>
            <div className="p-4">
              {mission.agentTasks.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">
                  {isRunning
                    ? "Waiting for agent tasks..."
                    : "No agent activity yet. Start the mission to begin."}
                </p>
              ) : (
                <div className="space-y-2">
                  {mission.agentTasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-border/50 bg-navy-3/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              task.status === "COMPLETED" && "bg-g-green",
                              task.status === "RUNNING" && "bg-g-blue animate-pulse",
                              task.status === "FAILED" && "bg-g-red",
                              task.status === "PENDING" && "bg-muted-2"
                            )}
                          />
                          <Badge variant="secondary" className="text-[10px]">
                            {task.agentType}
                          </Badge>
                          <span className="text-[11px] text-muted">{task.taskType}</span>
                        </div>
                        <span className="text-[11px] text-muted-2">
                          {task.startedAt ? formatRelativeTime(task.startedAt) : "Queued"}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-xs text-cream-2 mt-1">{task.description}</p>
                      )}
                      {task.output && (
                        <p className="text-[11px] text-muted mt-1 line-clamp-3">{task.output}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Findings */}
          <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Shield className="h-3.5 w-3.5 text-gold/60" />
              <h2 className="section-title">Findings ({mission.findings.length})</h2>
            </div>
            <div className="p-4">
              {mission.findings.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">
                  Findings will appear here as agents discover insights.
                </p>
              ) : (
                <div className="space-y-2">
                  {mission.findings.map((finding) => (
                    <div key={finding.id} className="rounded-lg border border-border/50 bg-navy-3/30 p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-mono text-xs font-medium text-cream-2">{finding.title}</h4>
                        <ConfidenceBadge confidence={finding.confidence} />
                      </div>
                      <p className="text-xs text-muted">{finding.content}</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-2 mt-2">
                        <span>{finding.category}</span>
                        {finding.sourceUrl && <span>{finding.sourceUrl}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Chat */}
        <div className="w-96 border-l border-border flex flex-col bg-navy-2 hidden lg:flex">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Anchor className="h-3.5 w-3.5 text-gold/60" />
              <h2 className="section-title">Mission Chat</h2>
            </div>
            <p className="text-[11px] text-muted mt-1">Guide agents and ask questions</p>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center text-muted text-xs py-8">
                <p>Send a message to interact with the agents.</p>
                <p className="mt-1 text-muted-2">
                  You can ask questions, provide guidance, or request specific research.
                </p>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "rounded-lg p-3 text-xs max-w-[85%]",
                  msg.role === "user"
                    ? "bg-gold/10 border border-gold/20 text-cream-2 ml-auto"
                    : "bg-navy-3 border border-border text-cream-2"
                )}
              >
                <p>{msg.content}</p>
                <p className="text-[10px] text-muted-2 mt-1">
                  {formatRelativeTime(msg.timestamp)}
                </p>
              </div>
            ))}
            {sendingChat && (
              <div className="bg-navy-3 border border-border rounded-lg p-3 max-w-[85%]">
                <Loader2 className="h-4 w-4 animate-spin text-gold" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendChat} className="p-4 border-t border-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-lg bg-navy-3 border border-border px-3 py-2 text-xs text-cream-2 font-mono placeholder-muted-2 focus:outline-none focus:ring-1 focus:ring-gold/30 focus:border-gold/50"
                disabled={sendingChat}
              />
              <Button
                type="submit"
                size="icon-sm"
                disabled={sendingChat || !chatInput.trim()}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
