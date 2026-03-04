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
import {
  Plus,
  Briefcase,
  FileText,
  AlertTriangle,
  Target,
} from "lucide-react";
import {
  SECTOR_DISPLAY_NAMES,
  getDealStatusColor,
  formatLargeNumber,
  formatRelativeTime,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deals",
  description: "Manage your private credit deals and pipeline.",
};

interface DealsPageProps {
  searchParams: Promise<{
    sector?: string;
    status?: string;
  }>;
}

export default async function DealsPage({ searchParams }: DealsPageProps) {
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
  const sectorFilter = params.sector;
  const statusFilter = params.status;

  const where: Record<string, unknown> = { userId: user.id };
  if (sectorFilter && sectorFilter !== "all") {
    where.sector = sectorFilter;
  }
  if (statusFilter && statusFilter !== "all") {
    where.status = statusFilter;
  }

  const deals = await db.deal.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          documents: true,
          findings: true,
          missions: true,
        },
      },
    },
  });

  const sectors = Object.entries(SECTOR_DISPLAY_NAMES);
  const statuses = [
    ["PROSPECT", "Prospect"],
    ["UNDER_REVIEW", "Under Review"],
    ["ACTIVE_RESEARCH", "Active Research"],
    ["AUDIT_COMPLETE", "Audit Complete"],
    ["ARCHIVED", "Archived"],
  ];

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Deals</h1>
            <p className="text-slate-600">
              Track and manage your private credit pipeline.
            </p>
          </div>
          <Link href="/deals/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Deal
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Sector
            </label>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/deals"
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  !sectorFilter || sectorFilter === "all"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                }`}
              >
                All
              </Link>
              {sectors.map(([key, label]) => (
                <Link
                  key={key}
                  href={`/deals?sector=${key}${statusFilter ? `&status=${statusFilter}` : ""}`}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    sectorFilter === key
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/deals${sectorFilter ? `?sector=${sectorFilter}` : ""}`}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  !statusFilter || statusFilter === "all"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                }`}
              >
                All
              </Link>
              {statuses.map(([key, label]) => (
                <Link
                  key={key}
                  href={`/deals?status=${key}${sectorFilter ? `&sector=${sectorFilter}` : ""}`}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    statusFilter === key
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Deals Grid */}
        {deals.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Briefcase className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No deals found
              </h3>
              <p className="text-slate-500 mb-6">
                {sectorFilter || statusFilter
                  ? "Try adjusting your filters or create a new deal."
                  : "Get started by creating your first deal."}
              </p>
              <Link href="/deals/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Deal
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {deals.map((deal) => (
              <Link key={deal.id} href={`/deals/${deal.id}`}>
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-slate-900 truncate pr-2">
                        {deal.name}
                      </h3>
                      <Badge className={getDealStatusColor(deal.status)}>
                        {deal.status.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    {deal.borrowerName && (
                      <p className="text-sm text-slate-500 mb-1">
                        Borrower: {deal.borrowerName}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mb-4">
                      <Badge variant="secondary">
                        {SECTOR_DISPLAY_NAMES[deal.sector] || deal.sector}
                      </Badge>
                      {deal.dealSize && (
                        <span className="text-sm font-medium text-slate-700">
                          {formatLargeNumber(Number(deal.dealSize))}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {deal._count.documents} docs
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {deal._count.findings} findings
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="h-3.5 w-3.5" />
                        {deal._count.missions} missions
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-3">
                      Updated {formatRelativeTime(deal.updatedAt)}
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
