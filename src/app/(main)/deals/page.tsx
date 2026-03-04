import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "info" | "primary" | "default"; label: string }> = {
    PROSPECT: { variant: "default", label: "Prospect" },
    UNDER_REVIEW: { variant: "warning", label: "Under Review" },
    ACTIVE_RESEARCH: { variant: "info", label: "Active Research" },
    AUDIT_COMPLETE: { variant: "success", label: "Audit Complete" },
    ARCHIVED: { variant: "default", label: "Archived" },
    CLOSED_WON: { variant: "success", label: "Closed Won" },
    CLOSED_LOST: { variant: "danger", label: "Closed Lost" },
    DRAFT: { variant: "default", label: "Draft" },
  };
  const entry = map[status] || { variant: "default" as const, label: status.replace(/_/g, " ") };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
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
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="section-title mb-1">Deal Pipeline</p>
          <h1 className="font-serif text-2xl font-semibold text-cream">Deals</h1>
          <p className="mt-1 text-sm text-muted">
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
      <div className="space-y-4 mb-8">
        <div>
          <span className="label-mono block mb-2">Sector</span>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/deals"
              className={`px-3 py-1.5 rounded text-[11px] font-mono font-semibold tracking-wide border transition-colors ${
                !sectorFilter || sectorFilter === "all"
                  ? "bg-gold/10 text-gold border-gold/30"
                  : "text-muted-2 border-border hover:text-cream-2 hover:border-border-2"
              }`}
            >
              All
            </Link>
            {sectors.map(([key, label]) => (
              <Link
                key={key}
                href={`/deals?sector=${key}${statusFilter ? `&status=${statusFilter}` : ""}`}
                className={`px-3 py-1.5 rounded text-[11px] font-mono font-semibold tracking-wide border transition-colors ${
                  sectorFilter === key
                    ? "bg-gold/10 text-gold border-gold/30"
                    : "text-muted-2 border-border hover:text-cream-2 hover:border-border-2"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <span className="label-mono block mb-2">Status</span>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/deals${sectorFilter ? `?sector=${sectorFilter}` : ""}`}
              className={`px-3 py-1.5 rounded text-[11px] font-mono font-semibold tracking-wide border transition-colors ${
                !statusFilter || statusFilter === "all"
                  ? "bg-gold/10 text-gold border-gold/30"
                  : "text-muted-2 border-border hover:text-cream-2 hover:border-border-2"
              }`}
            >
              All
            </Link>
            {statuses.map(([key, label]) => (
              <Link
                key={key}
                href={`/deals?status=${key}${sectorFilter ? `&sector=${sectorFilter}` : ""}`}
                className={`px-3 py-1.5 rounded text-[11px] font-mono font-semibold tracking-wide border transition-colors ${
                  statusFilter === key
                    ? "bg-gold/10 text-gold border-gold/30"
                    : "text-muted-2 border-border hover:text-cream-2 hover:border-border-2"
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
        <div className="rounded-lg border border-border bg-navy-2 py-16 text-center">
          <Briefcase className="h-12 w-12 text-muted-2 mx-auto mb-4" />
          <h3 className="font-serif text-lg font-semibold text-cream mb-2">
            No deals found
          </h3>
          <p className="text-sm text-muted mb-6">
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
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`}>
              <div className="rounded-lg border border-border bg-navy-2 p-5 gold-accent transition-all hover:border-border-2 h-full">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-mono text-sm font-semibold text-cream-2 truncate pr-2">
                    {deal.name}
                  </h3>
                  <StatusBadge status={deal.status} />
                </div>

                {deal.borrowerName && (
                  <p className="text-xs text-muted mb-1">
                    Borrower: {deal.borrowerName}
                  </p>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="secondary">
                    {SECTOR_DISPLAY_NAMES[deal.sector] || deal.sector}
                  </Badge>
                  {deal.dealSize && (
                    <span className="text-xs font-mono font-medium text-cream-2">
                      {formatLargeNumber(Number(deal.dealSize))}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[11px] text-muted pt-3 border-t border-border">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {deal._count.documents} docs
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {deal._count.findings} findings
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {deal._count.missions} missions
                  </span>
                </div>

                <p className="text-[11px] text-muted-2 mt-3">
                  Updated {formatRelativeTime(deal.updatedAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
