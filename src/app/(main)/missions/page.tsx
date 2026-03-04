import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Target, Zap } from "lucide-react";
import {
  formatRelativeTime,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Missions",
  description: "Manage your AI research missions.",
};

interface MissionsPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "info" | "primary" | "default"; label: string }> = {
    RUNNING: { variant: "info", label: "Running" },
    QUEUED: { variant: "warning", label: "Queued" },
    COMPLETED: { variant: "success", label: "Complete" },
    FAILED: { variant: "danger", label: "Failed" },
    CANCELLED: { variant: "default", label: "Cancelled" },
    DRAFT: { variant: "default", label: "Draft" },
  };
  const entry = map[status] || { variant: "default" as const, label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export default async function MissionsPage({ searchParams }: MissionsPageProps) {
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

  const params = await searchParams;
  const statusFilter = params.status;

  const where: Record<string, unknown> = { userId: user.id };
  if (statusFilter && statusFilter !== "all") {
    where.status = statusFilter;
  }

  const missions = await db.mission.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      deal: { select: { name: true } },
      _count: { select: { findings: true } },
    },
  });

  const statuses = [
    ["all", "All"],
    ["DRAFT", "Draft"],
    ["QUEUED", "Queued"],
    ["RUNNING", "Running"],
    ["COMPLETED", "Completed"],
    ["FAILED", "Failed"],
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="section-title mb-1">Research Operations</p>
          <h1 className="font-serif text-2xl font-semibold text-cream">Missions</h1>
          <p className="mt-1 text-sm text-muted">
            AI-powered research missions for your deals.
          </p>
        </div>
        <Link href="/missions/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Mission
          </Button>
        </Link>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        {statuses.map(([key, label]) => (
          <Link
            key={key}
            href={key === "all" ? "/missions" : `/missions?status=${key}`}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-semibold tracking-wide border transition-colors ${
              (key === "all" && !statusFilter) || statusFilter === key
                ? "bg-gold/10 text-gold border-gold/30"
                : "text-muted-2 border-border hover:text-cream-2 hover:border-border-2"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Missions Grid */}
      {missions.length === 0 ? (
        <div className="rounded-lg border border-border bg-navy-2 py-16 text-center">
          <Target className="h-12 w-12 text-muted-2 mx-auto mb-4" />
          <h3 className="font-serif text-lg font-semibold text-cream mb-2">
            No missions found
          </h3>
          <p className="text-sm text-muted mb-6">
            {statusFilter
              ? "Try adjusting your filter or create a new mission."
              : "Launch your first AI research mission to get started."}
          </p>
          <Link href="/missions/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Mission
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {missions.map((mission) => (
            <Link key={mission.id} href={`/missions/${mission.id}`}>
              <div className="rounded-lg border border-border bg-navy-2 p-5 gold-accent transition-all hover:border-border-2 h-full">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-mono text-sm font-semibold text-cream-2 truncate pr-2">
                    {mission.title}
                  </h3>
                  <StatusBadge status={mission.status} />
                </div>

                {mission.objective && (
                  <p className="text-xs text-muted line-clamp-2 mb-4">
                    {mission.objective}
                  </p>
                )}

                <div className="flex items-center gap-3 mb-3">
                  {mission.deal && (
                    <Badge variant="secondary">{mission.deal.name}</Badge>
                  )}
                  {mission.mode && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                      <Zap className="h-3 w-3" />
                      {mission.mode}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[11px] text-muted pt-3 border-t border-border">
                  <span>{mission._count.findings} findings</span>
                  {mission.totalTokensUsed > 0 && (
                    <span>
                      {(mission.totalTokensUsed / 1000).toFixed(1)}k tokens
                    </span>
                  )}
                  {mission.confidenceScore !== null && (
                    <span>
                      {Math.round(Number(mission.confidenceScore) * 100)}% confidence
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-muted-2 mt-3">
                  Updated {formatRelativeTime(mission.updatedAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
