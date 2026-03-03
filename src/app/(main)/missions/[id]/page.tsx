import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
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
  Monitor,
  Target,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Zap,
} from "lucide-react";
import {
  getMissionStatusColor,
  CONFIDENCE_COLORS,
  formatDate,
  formatRelativeTime,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

interface MissionDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: MissionDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const mission = await db.mission.findUnique({
    where: { id },
    select: { title: true },
  });

  return {
    title: mission ? `${mission.title} - Mission` : "Mission Not Found",
  };
}

export default async function MissionDetailPage({
  params,
}: MissionDetailPageProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    redirect("/sign-in");
  }

  const { id } = await params;

  const mission = await db.mission.findUnique({
    where: { id, userId: user.id },
    include: {
      deal: { select: { id: true, name: true } },
      findings: {
        orderBy: { createdAt: "desc" },
      },
      agentTasks: {
        orderBy: { startedAt: "asc" },
      },
    },
  });

  if (!mission) {
    notFound();
  }

  const isRunning = ["RUNNING", "QUEUED"].includes(mission.status);

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/missions"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Missions
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {mission.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge className={getMissionStatusColor(mission.status)}>
                {mission.status}
              </Badge>
              {mission.mode && (
                <Badge variant="secondary">
                  <Zap className="h-3 w-3 mr-1" />
                  {mission.mode}
                </Badge>
              )}
              {mission.deal && (
                <Link href={`/deals/${mission.deal.id}`}>
                  <Badge variant="secondary" className="hover:bg-slate-200">
                    {mission.deal.name}
                  </Badge>
                </Link>
              )}
              {mission.confidenceScore !== null && (
                <Badge variant="secondary">
                  {Math.round(Number(mission.confidenceScore) * 100)}% confidence
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {isRunning && (
              <Link href={`/command-center/${mission.id}`}>
                <Button>
                  <Monitor className="h-4 w-4 mr-2" />
                  Command Center
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Mission Info */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {mission.startedAt && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Started
                </p>
                <p className="font-medium text-slate-900 mt-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  {formatDate(mission.startedAt)}
                </p>
              </CardContent>
            </Card>
          )}
          {mission.completedAt && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Completed
                </p>
                <p className="font-medium text-slate-900 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {formatDate(mission.completedAt)}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Findings
              </p>
              <p className="font-medium text-slate-900 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                {mission.findings.length}
              </p>
            </CardContent>
          </Card>
          {mission.totalTokensUsed > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Tokens Used
                </p>
                <p className="font-medium text-slate-900 mt-1">
                  {(mission.totalTokensUsed / 1000).toFixed(1)}k
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Objective */}
        {mission.objective && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-slate-500" />
                Objective
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap">
                {mission.objective}
              </p>
              {mission.successCriteria && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                    Success Criteria
                  </p>
                  <p className="text-slate-700 whitespace-pre-wrap">
                    {mission.successCriteria}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {mission.summary && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-500" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {mission.summary}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Recommendation */}
        {mission.recommendation && (
          <Card className="mb-8 border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-900 whitespace-pre-wrap leading-relaxed">
                {mission.recommendation}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Findings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-slate-500" />
              Findings ({mission.findings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mission.findings.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                {isRunning
                  ? "Agents are working. Findings will appear here."
                  : "No findings generated for this mission."}
              </p>
            ) : (
              <div className="space-y-4">
                {mission.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-slate-900">
                        {finding.title}
                      </h4>
                      <Badge
                        className={
                          CONFIDENCE_COLORS[finding.confidence] ||
                          "bg-slate-100 text-slate-800"
                        }
                      >
                        {finding.confidence}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                      {finding.content}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>Category: {finding.category}</span>
                      {finding.sourceUrl && (
                        <span>Source: {finding.sourceUrl}</span>
                      )}
                      <span>{formatRelativeTime(finding.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Task Timeline */}
        {mission.agentTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-slate-500" />
                Agent Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mission.agentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-4 relative"
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-3 w-3 rounded-full mt-1.5 ${
                          task.status === "COMPLETED"
                            ? "bg-emerald-500"
                            : task.status === "RUNNING"
                              ? "bg-blue-500 animate-pulse"
                              : task.status === "FAILED"
                                ? "bg-red-500"
                                : "bg-slate-300"
                        }`}
                      />
                      <div className="w-px h-full bg-slate-200 min-h-[24px]" />
                    </div>
                    <div className="pb-4 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {task.agentType}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {task.status}
                        </span>
                      </div>
                      {task.taskDescription && (
                        <p className="text-sm text-slate-600">
                          {task.taskDescription}
                        </p>
                      )}
                      {task.result && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {JSON.stringify(task.result)}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {task.startedAt
                          ? formatRelativeTime(task.startedAt)
                          : "Pending"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
