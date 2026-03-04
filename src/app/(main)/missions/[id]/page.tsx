import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Monitor,
  Target,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Zap,
  Shield,
} from "lucide-react";
import {
  formatDate,
  formatRelativeTime,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

interface MissionDetailPageProps {
  params: Promise<{ id: string }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "info" | "default"; label: string }> = {
    RUNNING: { variant: "info", label: "Running" },
    QUEUED: { variant: "warning", label: "Queued" },
    COMPLETED: { variant: "success", label: "Complete" },
    FAILED: { variant: "danger", label: "Failed" },
    DRAFT: { variant: "default", label: "Draft" },
  };
  const entry = map[status] || { variant: "default" as const, label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
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

export async function generateMetadata({ params }: MissionDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const mission = await db.mission.findUnique({ where: { id }, select: { title: true } });
  return { title: mission ? `${mission.title} - Mission` : "Mission Not Found" };
}

export default async function MissionDetailPage({ params }: MissionDetailPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/sign-in");

  const { id } = await params;

  const mission = await db.mission.findUnique({
    where: { id, userId: user.id },
    include: {
      deal: { select: { id: true, name: true } },
      findings: { orderBy: { createdAt: "desc" } },
      agentTasks: { orderBy: { startedAt: "asc" } },
    },
  });

  if (!mission) notFound();

  const isRunning = ["RUNNING", "QUEUED"].includes(mission.status);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
      {/* Back */}
      <Link
        href="/missions"
        className="inline-flex items-center gap-1 text-xs font-mono text-muted hover:text-gold transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Missions
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <p className="section-title mb-1">Mission Detail</p>
          <h1 className="font-serif text-2xl font-semibold text-cream">{mission.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={mission.status} />
            {mission.mode && (
              <Badge variant="secondary">
                <Zap className="h-3 w-3 mr-1" />
                {mission.mode}
              </Badge>
            )}
            {mission.deal && (
              <Link href={`/deals/${mission.deal.id}`}>
                <Badge variant="secondary" className="hover:border-border-2 cursor-pointer">
                  {mission.deal.name}
                </Badge>
              </Link>
            )}
            {mission.confidenceScore !== null && (
              <span className="font-mono text-[11px] text-gold">
                {Math.round(Number(mission.confidenceScore) * 100)}% confidence
              </span>
            )}
          </div>
        </div>
        {isRunning && (
          <Link href={`/command-center/${mission.id}`}>
            <Button>
              <Monitor className="h-4 w-4 mr-2" />
              Command Center
            </Button>
          </Link>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {mission.startedAt && (
          <div className="rounded-lg border border-border bg-navy-2 p-4">
            <p className="label-mono">Started</p>
            <p className="font-mono text-sm text-cream-2 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted" />
              {formatDate(mission.startedAt)}
            </p>
          </div>
        )}
        {mission.completedAt && (
          <div className="rounded-lg border border-border bg-navy-2 p-4">
            <p className="label-mono">Completed</p>
            <p className="font-mono text-sm text-cream-2 mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-g-green" />
              {formatDate(mission.completedAt)}
            </p>
          </div>
        )}
        <div className="rounded-lg border border-border bg-navy-2 p-4">
          <p className="label-mono">Findings</p>
          <p className="font-mono text-sm text-cream-2 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-g-amber" />
            {mission.findings.length}
          </p>
        </div>
        {mission.totalTokensUsed > 0 && (
          <div className="rounded-lg border border-border bg-navy-2 p-4">
            <p className="label-mono">Tokens Used</p>
            <p className="font-mono text-sm text-cream-2 mt-1">
              {(mission.totalTokensUsed / 1000).toFixed(1)}k
            </p>
          </div>
        )}
      </div>

      {/* Objective */}
      {mission.objective && (
        <div className="rounded-lg border border-border bg-navy-2 overflow-hidden mb-6">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Target className="h-3.5 w-3.5 text-gold/60" />
            <h2 className="section-title">Objective</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-cream-2 whitespace-pre-wrap">{mission.objective}</p>
            {mission.successCriteria && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <p className="label-mono mb-2">Success Criteria</p>
                <p className="text-sm text-cream-2 whitespace-pre-wrap">{mission.successCriteria}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {mission.summary && (
        <div className="rounded-lg border border-border bg-navy-2 overflow-hidden mb-6">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <FileText className="h-3.5 w-3.5 text-gold/60" />
            <h2 className="section-title">Summary</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-cream-2 whitespace-pre-wrap leading-relaxed">{mission.summary}</p>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {mission.recommendation && (
        <div className="rounded-lg border border-gold/20 bg-navy-2 overflow-hidden mb-6 gold-accent">
          <div className="flex items-center gap-2 border-b border-gold/10 px-5 py-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-gold" />
            <h2 className="section-title">Recommendation</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-cream whitespace-pre-wrap leading-relaxed">{mission.recommendation}</p>
          </div>
        </div>
      )}

      {/* Findings */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden mb-6">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Shield className="h-3.5 w-3.5 text-gold/60" />
          <h2 className="section-title">Findings ({mission.findings.length})</h2>
        </div>
        <div className="p-4">
          {mission.findings.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              {isRunning
                ? "Agents are working. Findings will appear here."
                : "No findings generated for this mission."}
            </p>
          ) : (
            <div className="space-y-3">
              {mission.findings.map((finding) => (
                <div key={finding.id} className="rounded-lg border border-border/50 bg-navy-3/30 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-mono text-xs font-medium text-cream-2">{finding.title}</h4>
                    <ConfidenceBadge confidence={finding.confidence} />
                  </div>
                  <p className="text-xs text-muted mb-2">{finding.content}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-2">
                    <span>{finding.category}</span>
                    {finding.sourceUrl && <span>{finding.sourceUrl}</span>}
                    <span>{formatRelativeTime(finding.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Timeline */}
      {mission.agentTasks.length > 0 && (
        <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Zap className="h-3.5 w-3.5 text-gold/60" />
            <h2 className="section-title">Agent Activity Timeline</h2>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              {mission.agentTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-4 relative">
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-2.5 w-2.5 rounded-full mt-1.5 ${
                        task.status === "COMPLETED"
                          ? "bg-g-green"
                          : task.status === "RUNNING"
                            ? "bg-g-blue animate-pulse"
                            : task.status === "FAILED"
                              ? "bg-g-red"
                              : "bg-muted-2"
                      }`}
                    />
                    <div className="w-px h-full bg-border min-h-[24px]" />
                  </div>
                  <div className="pb-4 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {task.agentType}
                      </Badge>
                      <span className="text-[11px] text-muted">{task.status}</span>
                    </div>
                    {task.taskDescription && (
                      <p className="text-xs text-cream-2">{task.taskDescription}</p>
                    )}
                    {task.result && (
                      <p className="text-[11px] text-muted mt-1 line-clamp-2">
                        {JSON.stringify(task.result)}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-2 mt-1">
                      {task.startedAt ? formatRelativeTime(task.startedAt) : "Pending"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
