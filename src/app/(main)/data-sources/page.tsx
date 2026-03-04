import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  Globe,
  FileSearch,
  Lock,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Sources",
  description: "Manage external data source integrations.",
};

export default async function DataSourcesPage() {
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

  if (user.subscriptionTier !== "ENTERPRISE") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 lg:px-9 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-navy-3 mb-6">
          <Lock className="h-8 w-8 text-muted-2" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-cream mb-4">
          Enterprise Feature
        </h1>
        <p className="text-sm text-muted mb-8 max-w-lg mx-auto">
          Custom data source integrations are available on the Enterprise plan.
          Connect proprietary databases, market data feeds, and internal
          systems to supercharge your AI agents.
        </p>
        <Link href="/pricing">
          <Button>View Enterprise Plan</Button>
        </Link>
      </div>
    );
  }

  let dataSources: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastSyncAt: Date | null;
    config: unknown;
    createdAt: Date;
  }> = [];

  try {
    dataSources = await db.dataSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    // Table may not exist yet
  }

  const sourceTypeIcons: Record<string, React.ReactNode> = {
    API: <Globe className="h-5 w-5" />,
    DATABASE: <Database className="h-5 w-5" />,
    FILE_SYSTEM: <FileSearch className="h-5 w-5" />,
  };

  const statusConfig: Record<
    string,
    { icon: React.ReactNode; variant: "success" | "danger" | "warning" | "secondary" }
  > = {
    CONNECTED: { icon: <CheckCircle2 className="h-4 w-4" />, variant: "success" },
    DISCONNECTED: { icon: <XCircle className="h-4 w-4" />, variant: "danger" },
    SYNCING: { icon: <RefreshCw className="h-4 w-4 animate-spin" />, variant: "warning" },
    PENDING: { icon: <Clock className="h-4 w-4" />, variant: "secondary" },
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="section-title mb-1">Integrations</p>
          <h1 className="font-serif text-2xl font-semibold text-cream">Data Sources</h1>
          <p className="mt-1 text-sm text-muted">
            Connect external data to enhance agent research.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Data Source
        </Button>
      </div>

      {/* Available Integrations */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {[
          { icon: Globe, color: "text-g-blue", title: "REST API", desc: "Connect any REST API endpoint for market data or internal systems." },
          { icon: Database, color: "text-g-green", title: "Database", desc: "Direct connection to PostgreSQL, MySQL, or other databases." },
          { icon: FileSearch, color: "text-g-purple", title: "File System", desc: "S3, Azure Blob, or GCS bucket for document ingestion." },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-lg border-2 border-dashed border-border hover:border-gold/30 transition-colors cursor-pointer p-6 text-center"
          >
            <item.icon className={`h-8 w-8 ${item.color} mx-auto mb-3`} />
            <h3 className="font-mono text-sm font-semibold text-cream-2">{item.title}</h3>
            <p className="text-xs text-muted mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Configured Sources */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h2 className="section-title">Configured Sources</h2>
          <p className="text-xs text-muted mt-1">Active data source connections for your organization.</p>
        </div>
        <div className="p-4">
          {dataSources.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 text-muted-2 mx-auto mb-4" />
              <h3 className="font-serif text-lg font-semibold text-cream mb-2">
                No data sources configured
              </h3>
              <p className="text-sm text-muted mb-6">
                Add a data source to start enriching your agent research.
              </p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Source
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {dataSources.map((source) => {
                const config = statusConfig[source.status] || statusConfig.PENDING;
                return (
                  <div key={source.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-navy-3 text-muted">
                        {sourceTypeIcons[source.type] || <Database className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-mono text-sm text-cream-2">{source.name}</p>
                        <p className="text-[11px] text-muted">
                          {source.type} &middot;{" "}
                          {source.lastSyncAt
                            ? `Last sync: ${new Date(source.lastSyncAt).toLocaleDateString()}`
                            : "Never synced"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={config.variant}>
                        <span className="flex items-center gap-1">
                          {config.icon}
                          {source.status}
                        </span>
                      </Badge>
                      <Button variant="outline" size="sm">Configure</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
