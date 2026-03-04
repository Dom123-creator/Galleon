import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Target, Zap } from "lucide-react";
import {
  getMissionStatusColor,
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
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Missions</h1>
            <p className="text-slate-600">
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
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                (key === "all" && !statusFilter) || statusFilter === key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Missions Grid */}
        {missions.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Target className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No missions found
              </h3>
              <p className="text-slate-500 mb-6">
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
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {missions.map((mission) => (
              <Link key={mission.id} href={`/missions/${mission.id}`}>
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-slate-900 truncate pr-2">
                        {mission.title}
                      </h3>
                      <Badge className={getMissionStatusColor(mission.status)}>
                        {mission.status}
                      </Badge>
                    </div>

                    {mission.objective && (
                      <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                        {mission.objective}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mb-3">
                      {mission.deal && (
                        <Badge variant="secondary">{mission.deal.name}</Badge>
                      )}
                      {mission.mode && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Zap className="h-3 w-3" />
                          {mission.mode}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
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

                    <p className="text-xs text-slate-400 mt-3">
                      Updated {formatRelativeTime(mission.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
