import { Metadata } from "next";
import Link from "next/link";
import { Users, Target, FileText, DollarSign, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard",
};

export default async function AdminDashboardPage() {
  // Fetch metrics
  const [
    totalUsers,
    premiumUsers,
    totalMissions,
    completedMissions,
    totalDeals,
    recentUsers,
    recentMissions,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({
      where: { subscriptionTier: { not: "ANALYST" } },
    }),
    db.mission.count(),
    db.mission.count({ where: { status: "COMPLETED" } }),
    db.deal.count(),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        createdAt: true,
      },
    }),
    db.mission.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        totalTokensUsed: true,
        createdAt: true,
      },
    }),
  ]);

  // Calculate MRR (Monthly Recurring Revenue)
  const analystCount = await db.user.count({
    where: { subscriptionTier: "ANALYST" },
  });
  const professionalCount = await db.user.count({
    where: { subscriptionTier: "PROFESSIONAL" },
  });
  const enterpriseCount = await db.user.count({
    where: { subscriptionTier: "ENTERPRISE" },
  });
  const mrr = analystCount * 99 + professionalCount * 499;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600">Welcome to the Galleon admin panel</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Users</p>
                <p className="text-2xl font-bold text-slate-900">{totalUsers}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {premiumUsers} paid subscribers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Missions</p>
                <p className="text-2xl font-bold text-slate-900">{totalMissions}</p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Target className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {completedMissions} completed &middot; {totalDeals} deals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">MRR</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${mrr.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              ${(mrr * 12).toLocaleString()} ARR
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Conversion Rate</p>
                <p className="text-2xl font-bold text-slate-900">
                  {totalUsers > 0
                    ? ((premiumUsers / totalUsers) * 100).toFixed(1)
                    : 0}
                  %
                </p>
              </div>
              <div className="p-3 bg-amber-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Analyst to paid</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {user.name || user.email}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDate(user.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      user.subscriptionTier === "ANALYST"
                        ? "secondary"
                        : user.subscriptionTier === "ENTERPRISE"
                          ? "premium"
                          : "primary"
                    }
                  >
                    {user.subscriptionTier}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Missions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Missions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentMissions.map((mission) => (
                <div
                  key={mission.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <p className="font-medium text-slate-900 line-clamp-1">
                      {mission.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {mission.totalTokensUsed > 0
                        ? `${(mission.totalTokensUsed / 1000).toFixed(1)}k tokens`
                        : "0 tokens"}{" "}
                      &middot; {formatDate(mission.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      mission.status === "COMPLETED"
                        ? "success"
                        : mission.status === "DRAFT"
                          ? "secondary"
                          : mission.status === "RUNNING"
                            ? "primary"
                            : "warning"
                    }
                  >
                    {mission.status}
                  </Badge>
                </div>
              ))}
            </div>
            <Link
              href="/admin/missions"
              className="block text-center text-sm text-blue-600 hover:text-blue-700 mt-4"
            >
              View all missions
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
