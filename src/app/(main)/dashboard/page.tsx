import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Briefcase,
  FileText,
  AlertTriangle,
  Plus,
  Upload,
  ArrowRight,
  Anchor,
  Compass,
  Shield,
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

/* ── Inline helper components ────────────────────────────── */

function ScoreArc({ value, max = 100, size = 56 }: { value: number; max?: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = Math.PI * r;
  const pct = Math.min(value / max, 1);
  return (
    <svg width={size} height={size / 2 + 4} viewBox={`0 0 ${size} ${size / 2 + 4}`}>
      <path
        d={`M 4 ${size / 2} A ${r} ${r} 0 0 1 ${size - 4} ${size / 2}`}
        fill="none"
        stroke="#1e3358"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d={`M 4 ${size / 2} A ${r} ${r} 0 0 1 ${size - 4} ${size / 2}`}
        fill="none"
        stroke="#c9a84c"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
      />
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        fill="#e8dcc4"
        fontSize="13"
        fontWeight="700"
        fontFamily="'DM Mono', monospace"
      >
        {value}
      </text>
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "info" | "primary" | "default"; label: string }> = {
    RUNNING: { variant: "info", label: "Running" },
    QUEUED: { variant: "warning", label: "Queued" },
    COMPLETED: { variant: "success", label: "Complete" },
    FAILED: { variant: "danger", label: "Failed" },
    CANCELLED: { variant: "default", label: "Cancelled" },
    UNDER_REVIEW: { variant: "warning", label: "Under Review" },
    ACTIVE_RESEARCH: { variant: "info", label: "Active Research" },
    CLOSED_WON: { variant: "success", label: "Closed Won" },
    CLOSED_LOST: { variant: "danger", label: "Closed Lost" },
    DRAFT: { variant: "default", label: "Draft" },
  };
  const entry = map[status] || { variant: "default" as const, label: status.replace(/_/g, " ") };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

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

  const kpis = [
    { label: "Active Missions", value: activeMissions, icon: Target, color: "text-g-blue" },
    { label: "Deals Under Review", value: totalDeals, icon: Briefcase, color: "text-gold" },
    { label: "Docs Processed", value: processedDocs, icon: FileText, color: "text-g-green" },
    { label: "Total Findings", value: totalFindings, icon: AlertTriangle, color: "text-g-amber" },
  ];

  const quickActions = [
    { label: "New Mission", desc: "Launch AI research", href: "/missions/new", icon: Plus, color: "text-g-blue" },
    { label: "Upload Document", desc: "Add to a deal", href: "/documents", icon: Upload, color: "text-g-green" },
    { label: "Create Deal", desc: "Track opportunity", href: "/deals/new", icon: Briefcase, color: "text-gold" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="section-title mb-1">Command Dashboard</p>
          <h1 className="font-serif text-2xl font-semibold text-cream">
            Welcome back, {user.name || "Analyst"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Portfolio overview and active operations.
          </p>
        </div>
        <div className="hidden sm:block">
          <ScoreArc value={activeMissions + totalDeals} max={Math.max(activeMissions + totalDeals, 10)} />
          <p className="label-mono text-center mt-1">Activity</p>
        </div>
      </div>

      {/* ── Coverage Banner ────────────────────────────────── */}
      {user.subscriptionTier === "ANALYST" && (
        <div className="mb-8 rounded-lg border border-gold/20 bg-navy-2 p-5 gold-accent">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Anchor className="mt-0.5 h-5 w-5 text-gold" />
              <div>
                <h3 className="font-serif text-sm font-semibold text-gold">Unlock Full Fleet</h3>
                <p className="mt-1 text-xs text-muted">
                  Upgrade to Professional for unlimited missions, autonomous AI agents, and full Command Center access.
                </p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 rounded border border-gold/30 bg-gold/10 px-4 py-1.5 font-mono text-[11px] font-bold tracking-wide text-gold hover:bg-gold/20 transition-colors"
            >
              Upgrade
            </Link>
          </div>
        </div>
      )}

      {/* ── KPI Grid ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-border bg-navy-2 p-5 gold-accent transition-colors hover:border-border-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="label-mono">{kpi.label}</p>
                <p className="mt-2 font-mono text-2xl font-bold text-cream">
                  {kpi.value}
                </p>
              </div>
              <kpi.icon className={`h-5 w-5 ${kpi.color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick Actions ──────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {quickActions.map((action) => (
          <Link key={action.label} href={action.href}>
            <div className="group flex items-center gap-4 rounded-lg border border-border bg-navy-2 p-4 transition-all hover:border-border-2 hover:bg-navy-3/50 cursor-pointer">
              <div className="rounded border border-border p-2.5 group-hover:border-border-2 transition-colors">
                <action.icon className={`h-4 w-4 ${action.color}`} />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold tracking-wide text-cream-2">
                  {action.label}
                </p>
                <p className="text-[11px] text-muted">{action.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Diamond divider ────────────────────────────────── */}
      <div className="divider-diamond">
        <span className="text-gold/40 text-xs">&#9670;</span>
      </div>

      {/* ── Recent Activity ────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Missions */}
        <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Compass className="h-3.5 w-3.5 text-gold/60" />
              <h2 className="section-title">Recent Missions</h2>
            </div>
            <Link
              href="/missions"
              className="flex items-center gap-1 font-mono text-[10px] tracking-wide text-muted hover:text-gold transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-4">
            {recentMissions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No missions yet. Launch your first research mission.
              </p>
            ) : (
              <div className="space-y-1">
                {recentMissions.map((mission) => (
                  <Link
                    key={mission.id}
                    href={`/missions/${mission.id}`}
                    className="flex items-center justify-between rounded px-3 py-2.5 transition-colors hover:bg-navy-3/60"
                  >
                    <div className="min-w-0 mr-3">
                      <p className="font-mono text-xs font-medium text-cream-2 truncate">
                        {mission.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {mission.deal?.name || "No deal"} &middot;{" "}
                        {mission._count.findings} findings &middot;{" "}
                        {formatRelativeTime(mission.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge status={mission.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Deals */}
        <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-gold/60" />
              <h2 className="section-title">Recent Deals</h2>
            </div>
            <Link
              href="/deals"
              className="flex items-center gap-1 font-mono text-[10px] tracking-wide text-muted hover:text-gold transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-4">
            {recentDeals.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No deals yet. Create your first deal to get started.
              </p>
            ) : (
              <div className="space-y-1">
                {recentDeals.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/deals/${deal.id}`}
                    className="flex items-center justify-between rounded px-3 py-2.5 transition-colors hover:bg-navy-3/60"
                  >
                    <div className="min-w-0 mr-3">
                      <p className="font-mono text-xs font-medium text-cream-2 truncate">
                        {deal.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {getSectorDisplayName(deal.sector)} &middot;{" "}
                        {deal._count.documents} docs &middot;{" "}
                        {deal._count.missions} missions
                      </p>
                    </div>
                    <StatusBadge status={deal.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
