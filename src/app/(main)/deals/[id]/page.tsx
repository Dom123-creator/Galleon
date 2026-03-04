import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  AlertTriangle,
  Target,
  ArrowLeft,
  ExternalLink,
  Plus,
  Shield,
  Compass,
} from "lucide-react";
import {
  getSectorDisplayName,
  formatLargeNumber,
  formatDate,
  formatRelativeTime,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

interface DealDetailPageProps {
  params: Promise<{ id: string }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "info" | "default"; label: string }> = {
    PROSPECT: { variant: "default", label: "Prospect" },
    UNDER_REVIEW: { variant: "warning", label: "Under Review" },
    ACTIVE_RESEARCH: { variant: "info", label: "Active Research" },
    AUDIT_COMPLETE: { variant: "success", label: "Audit Complete" },
    CLOSED_WON: { variant: "success", label: "Closed Won" },
    CLOSED_LOST: { variant: "danger", label: "Closed Lost" },
    DRAFT: { variant: "default", label: "Draft" },
  };
  const entry = map[status] || { variant: "default" as const, label: status.replace(/_/g, " ") };
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

function MissionStatusBadge({ status }: { status: string }) {
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

export async function generateMetadata({
  params,
}: DealDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const deal = await db.deal.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: deal ? `${deal.name} - Deal` : "Deal Not Found",
  };
}

export default async function DealDetailPage({ params }: DealDetailPageProps) {
  const { userId } = await auth();

  if (!userId) redirect("/sign-in");

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/sign-in");

  const { id } = await params;

  const deal = await db.deal.findUnique({
    where: { id, userId: user.id },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      missions: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { findings: true } } },
      },
      findings: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { mission: { select: { title: true } } },
      },
    },
  });

  if (!deal) notFound();

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
      {/* Back */}
      <Link
        href="/deals"
        className="inline-flex items-center gap-1 text-xs font-mono text-muted hover:text-gold transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Deals
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <p className="section-title mb-1">Deal Detail</p>
          <h1 className="font-serif text-2xl font-semibold text-cream">{deal.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={deal.status} />
            <Badge variant="secondary">{getSectorDisplayName(deal.sector)}</Badge>
            {deal.dealSize && (
              <span className="text-xs font-mono font-medium text-cream-2">
                {formatLargeNumber(Number(deal.dealSize))} {deal.currency || "USD"}
              </span>
            )}
          </div>
          {deal.description && (
            <p className="mt-3 text-sm text-muted max-w-2xl">{deal.description}</p>
          )}
        </div>
        <Link href={`/missions/new?dealId=${deal.id}`}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Mission
          </Button>
        </Link>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {deal.borrowerName && (
          <div className="rounded-lg border border-border bg-navy-2 p-4">
            <p className="label-mono">Borrower</p>
            <p className="font-mono text-sm text-cream-2 mt-1">{deal.borrowerName}</p>
          </div>
        )}
        {deal.lenderName && (
          <div className="rounded-lg border border-border bg-navy-2 p-4">
            <p className="label-mono">Lender</p>
            <p className="font-mono text-sm text-cream-2 mt-1">{deal.lenderName}</p>
          </div>
        )}
        <div className="rounded-lg border border-border bg-navy-2 p-4">
          <p className="label-mono">Created</p>
          <p className="font-mono text-sm text-cream-2 mt-1">{formatDate(deal.createdAt)}</p>
        </div>
        {deal.sourceUrl && (
          <div className="rounded-lg border border-border bg-navy-2 p-4">
            <p className="label-mono">Source</p>
            <a
              href={deal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-gold hover:text-gold-2 mt-1 flex items-center gap-1"
            >
              View Source <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden mb-6">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-gold/60" />
            <h2 className="section-title">Documents ({deal.documents.length})</h2>
          </div>
          <Link href="/documents">
            <Button variant="outline" size="sm">Upload</Button>
          </Link>
        </div>
        <div className="p-4">
          {deal.documents.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              No documents uploaded for this deal yet.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {deal.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-muted-2 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-cream-2 truncate">{doc.fileName}</p>
                      <p className="text-[11px] text-muted">
                        {doc.documentType} &middot; {formatRelativeTime(doc.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={doc.status === "INDEXED" ? "success" : "secondary"}>
                    {doc.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Findings */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden mb-6">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Shield className="h-3.5 w-3.5 text-gold/60" />
          <h2 className="section-title">Findings ({deal.findings.length})</h2>
        </div>
        <div className="p-4">
          {deal.findings.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              No findings yet. Run a mission to generate insights.
            </p>
          ) : (
            <div className="space-y-3">
              {deal.findings.map((finding) => (
                <div key={finding.id} className="rounded-lg border border-border/50 bg-navy-3/30 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-mono text-xs font-medium text-cream-2">{finding.title}</h4>
                    <ConfidenceBadge confidence={finding.confidence} />
                  </div>
                  <p className="text-xs text-muted mb-2">{finding.content}</p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-2">
                    <span>{finding.category}</span>
                    {finding.mission && <span>Mission: {finding.mission.title}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Missions */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Compass className="h-3.5 w-3.5 text-gold/60" />
            <h2 className="section-title">Missions ({deal.missions.length})</h2>
          </div>
          <Link href={`/missions/new?dealId=${deal.id}`}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Mission
            </Button>
          </Link>
        </div>
        <div className="p-4">
          {deal.missions.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              No missions created for this deal yet.
            </p>
          ) : (
            <div className="space-y-1">
              {deal.missions.map((mission) => (
                <Link
                  key={mission.id}
                  href={`/missions/${mission.id}`}
                  className="flex items-center justify-between rounded px-3 py-2.5 transition-colors hover:bg-navy-3/60"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-cream-2 truncate">{mission.title}</p>
                    <p className="text-[11px] text-muted">
                      {mission._count.findings} findings &middot; {formatRelativeTime(mission.updatedAt)}
                    </p>
                  </div>
                  <MissionStatusBadge status={mission.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
