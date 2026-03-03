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
  FileText,
  AlertTriangle,
  Target,
  ArrowLeft,
  ExternalLink,
  Plus,
} from "lucide-react";
import {
  getDealStatusColor,
  getSectorDisplayName,
  getMissionStatusColor,
  formatLargeNumber,
  formatDate,
  formatRelativeTime,
  CONFIDENCE_COLORS,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

interface DealDetailPageProps {
  params: Promise<{ id: string }>;
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

  const deal = await db.deal.findUnique({
    where: { id, userId: user.id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
      },
      missions: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { findings: true } },
        },
      },
      findings: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          mission: { select: { title: true } },
        },
      },
    },
  });

  if (!deal) {
    notFound();
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/deals"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Deals
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{deal.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge className={getDealStatusColor(deal.status)}>
                {deal.status.replace(/_/g, " ")}
              </Badge>
              <Badge variant="secondary">
                {getSectorDisplayName(deal.sector)}
              </Badge>
              {deal.dealSize && (
                <span className="text-sm font-medium text-slate-700">
                  {formatLargeNumber(Number(deal.dealSize))}{" "}
                  {deal.currency || "USD"}
                </span>
              )}
            </div>
            {deal.description && (
              <p className="mt-3 text-slate-600 max-w-2xl">
                {deal.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link href={`/missions/new?dealId=${deal.id}`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Mission
              </Button>
            </Link>
          </div>
        </div>

        {/* Deal Info */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {deal.borrowerName && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Borrower
                </p>
                <p className="font-medium text-slate-900 mt-1">
                  {deal.borrowerName}
                </p>
              </CardContent>
            </Card>
          )}
          {deal.lenderName && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Lender
                </p>
                <p className="font-medium text-slate-900 mt-1">
                  {deal.lenderName}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Created
              </p>
              <p className="font-medium text-slate-900 mt-1">
                {formatDate(deal.createdAt)}
              </p>
            </CardContent>
          </Card>
          {deal.sourceUrl && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">
                  Source
                </p>
                <a
                  href={deal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:text-blue-700 mt-1 flex items-center gap-1"
                >
                  View Source <ExternalLink className="h-3 w-3" />
                </a>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Documents Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-500" />
                Documents ({deal.documents.length})
              </CardTitle>
              <Link href="/documents">
                <Button variant="outline" size="sm">
                  Upload
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {deal.documents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                No documents uploaded for this deal yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {deal.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {doc.fileName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {doc.documentType} &middot;{" "}
                          {formatRelativeTime(doc.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        doc.status === "INDEXED" ? "success" : "secondary"
                      }
                    >
                      {doc.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Findings Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-slate-500" />
              Findings ({deal.findings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deal.findings.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                No findings yet. Run a mission to generate insights.
              </p>
            ) : (
              <div className="space-y-4">
                {deal.findings.map((finding) => (
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
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Category: {finding.category}</span>
                      {finding.mission && (
                        <span>Mission: {finding.mission.title}</span>
                      )}
                      {finding.sourceUrl && (
                        <span>Source: {finding.sourceUrl}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Missions Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-slate-500" />
                Missions ({deal.missions.length})
              </CardTitle>
              <Link href={`/missions/new?dealId=${deal.id}`}>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  New Mission
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {deal.missions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                No missions created for this deal yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {deal.missions.map((mission) => (
                  <Link
                    key={mission.id}
                    href={`/missions/${mission.id}`}
                    className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {mission.title}
                      </p>
                      <p className="text-sm text-slate-500">
                        {mission._count.findings} findings &middot;{" "}
                        {formatRelativeTime(mission.updatedAt)}
                      </p>
                    </div>
                    <Badge className={getMissionStatusColor(mission.status)}>
                      {mission.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
