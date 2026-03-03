import { Metadata } from "next";
import { redirect } from "next/navigation";
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
  Target,
  Briefcase,
  FileText,
  AlertTriangle,
  Plus,
  Upload,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  formatRelativeTime,
  getSectorDisplayName,
  getMissionStatusColor,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Galleon command dashboard.",
};

export default async function DashboardPage() {
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

  const [
    activeMissions,
    totalDeals,
    processedDocs,
    totalFindings,
    recentMissions,
    recentDeals,
  ] = await Promise.all([
    db.mission.count({
      where: {
        userId: user.id,
        status: { in: ["RUNNING", "QUEUED"] },
      },
    }),
    db.deal.count({
      where: {
        userId: user.id,
        status: { in: ["UNDER_REVIEW", "ACTIVE_RESEARCH"] },
      },
    }),
    db.document.count({
      where: {
        userId: user.id,
        status: "INDEXED",
      },
    }),
    db.finding.count({
      where: {
        mission: { userId: user.id },
      },
    }),
    db.mission.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        deal: { select: { name: true } },
        _count: { select: { findings: true } },
      },
    }),
    db.deal.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        _count: { select: { documents: true, missions: true } },
      },
    }),
  ]);

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {user.name || "Analyst"}
          </h1>
          <p className="text-slate-600">
            Here is what is happening across your portfolio.
          </p>
        </div>

        {/* Upgrade Banner */}
        {user.subscriptionTier === "ANALYST" && (
          <div className="mb-8 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="font-semibold">Unlock AI Agents</h3>
                </div>
                <p className="text-blue-100 text-sm max-w-lg">
                  Upgrade to Professional to access the full Command Center,
                  unlimited missions, and autonomous AI agent research.
                </p>
              </div>
              <Link href="/pricing">
                <Button
                  size="sm"
                  className="bg-white text-blue-600 hover:bg-blue-50"
                >
                  Upgrade
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Active Missions</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {activeMissions}
                  </p>
                </div>
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Target className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Deals Under Review</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {totalDeals}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Briefcase className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Docs Processed</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {processedDocs}
                  </p>
                </div>
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <FileText className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Findings</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {totalFindings}
                  </p>
                </div>
                <div className="p-3 bg-amber-100 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <Link href="/missions/new">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Plus className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">New Mission</p>
                  <p className="text-sm text-slate-500">
                    Launch AI research
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/documents">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <Upload className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Upload Document
                  </p>
                  <p className="text-sm text-slate-500">Add to a deal</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/deals/new">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Create Deal</p>
                  <p className="text-sm text-slate-500">
                    Track a new opportunity
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Recent Missions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Missions</CardTitle>
                <Link
                  href="/missions"
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentMissions.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  No missions yet. Launch your first research mission.
                </p>
              ) : (
                <div className="space-y-4">
                  {recentMissions.map((mission) => (
                    <Link
                      key={mission.id}
                      href={`/missions/${mission.id}`}
                      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 -mx-2 px-2 rounded"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {mission.title}
                        </p>
                        <p className="text-sm text-slate-500">
                          {mission.deal?.name || "No deal"} &middot;{" "}
                          {mission._count.findings} findings &middot;{" "}
                          {formatRelativeTime(mission.updatedAt)}
                        </p>
                      </div>
                      <Badge
                        className={getMissionStatusColor(mission.status)}
                      >
                        {mission.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Deals */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Deals</CardTitle>
                <Link
                  href="/deals"
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentDeals.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  No deals yet. Create your first deal to get started.
                </p>
              ) : (
                <div className="space-y-4">
                  {recentDeals.map((deal) => (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 -mx-2 px-2 rounded"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {deal.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {getSectorDisplayName(deal.sector)} &middot;{" "}
                          {deal._count.documents} docs &middot;{" "}
                          {deal._count.missions} missions
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {deal.status.replace(/_/g, " ")}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
