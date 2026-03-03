"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
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
} from "lucide-react";
import {
  cn,
  getMissionStatusColor,
  CONFIDENCE_COLORS,
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

    // Poll every 3 seconds for live updates
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
      <div className="bg-slate-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading Command Center...</p>
        </div>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="bg-slate-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-slate-400 mb-4">{error || "Mission not found"}</p>
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
    <div className="bg-slate-900 min-h-screen text-white">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-full px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href={`/missions/${mission.id}`}
                className="text-slate-400 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg font-bold truncate">{mission.title}</h1>
                <div className="flex items-center gap-2">
                  <Badge className={getMissionStatusColor(mission.status)}>
                    {mission.status}
                  </Badge>
                  {mission.confidenceScore !== null && (
                    <span className="text-xs text-slate-400">
                      {Math.round(mission.confidenceScore * 100)}% confidence
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {mission.findings.length} findings
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchMission}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {canStart && (
                <Button
                  size="sm"
                  onClick={handleStartMission}
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
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
                  className="bg-red-600 hover:bg-red-700"
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
      <div className="flex h-[calc(100vh-65px)]">
        {/* Left Panel - Agent Activity + Findings */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Agent Activity */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-400" />
                Agent Activity
                {isRunning && (
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute h-2 w-2 rounded-full bg-blue-400 opacity-75" />
                    <span className="relative rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mission.agentTasks.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  {isRunning
                    ? "Waiting for agent tasks..."
                    : "No agent activity yet. Start the mission to begin."}
                </p>
              ) : (
                <div className="space-y-3">
                  {mission.agentTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-lg bg-slate-700/50 p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              task.status === "COMPLETED" && "bg-emerald-500",
                              task.status === "RUNNING" &&
                                "bg-blue-500 animate-pulse",
                              task.status === "FAILED" && "bg-red-500",
                              task.status === "PENDING" && "bg-slate-500"
                            )}
                          />
                          <Badge
                            variant="secondary"
                            className="text-xs bg-slate-600 text-slate-200"
                          >
                            {task.agentType}
                          </Badge>
                          <span className="text-xs text-slate-400">
                            {task.taskType}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {task.startedAt
                            ? formatRelativeTime(task.startedAt)
                            : "Queued"}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-sm text-slate-300 mt-1">
                          {task.description}
                        </p>
                      )}
                      {task.output && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-3">
                          {task.output}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Findings */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                Findings ({mission.findings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mission.findings.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  Findings will appear here as agents discover insights.
                </p>
              ) : (
                <div className="space-y-3">
                  {mission.findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded-lg bg-slate-700/50 p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm font-medium text-white">
                          {finding.title}
                        </h4>
                        <Badge
                          className={
                            CONFIDENCE_COLORS[finding.confidence] ||
                            "bg-slate-600 text-slate-200"
                          }
                        >
                          {finding.confidence}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-300">{finding.content}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                        <span>{finding.category}</span>
                        {finding.sourceUrl && (
                          <span>{finding.sourceUrl}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Chat */}
        <div className="w-96 border-l border-slate-700 flex flex-col bg-slate-850 hidden lg:flex">
          <div className="p-4 border-b border-slate-700">
            <h2 className="font-semibold text-slate-200">Mission Chat</h2>
            <p className="text-xs text-slate-400">
              Guide agents and ask questions
            </p>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-8">
                <p>Send a message to interact with the agents.</p>
                <p className="mt-1 text-xs">
                  You can ask questions, provide guidance, or request specific
                  research.
                </p>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "rounded-lg p-3 text-sm max-w-[85%]",
                  msg.role === "user"
                    ? "bg-blue-600 text-white ml-auto"
                    : "bg-slate-700 text-slate-200"
                )}
              >
                <p>{msg.content}</p>
                <p className="text-xs opacity-60 mt-1">
                  {formatRelativeTime(msg.timestamp)}
                </p>
              </div>
            ))}
            {sendingChat && (
              <div className="bg-slate-700 rounded-lg p-3 text-sm max-w-[85%]">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <form
            onSubmit={handleSendChat}
            className="p-4 border-t border-slate-700"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={sendingChat}
              />
              <Button
                type="submit"
                size="sm"
                disabled={sendingChat || !chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
