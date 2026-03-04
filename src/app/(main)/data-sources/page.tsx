import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
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

  // Enterprise-only gate
  if (user.subscriptionTier !== "ENTERPRISE") {
    return (
      <div className="bg-slate-50 min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 mb-6">
            <Lock className="h-10 w-10 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">
            Enterprise Feature
          </h1>
          <p className="text-slate-600 mb-8 max-w-lg mx-auto">
            Custom data source integrations are available on the Enterprise plan.
            Connect proprietary databases, market data feeds, and internal
            systems to supercharge your AI agents.
          </p>
          <Link href="/pricing">
            <Button>View Enterprise Plan</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Fetch data sources for enterprise users
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
    CONNECTED: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      variant: "success",
    },
    DISCONNECTED: {
      icon: <XCircle className="h-4 w-4" />,
      variant: "danger",
    },
    SYNCING: {
      icon: <RefreshCw className="h-4 w-4 animate-spin" />,
      variant: "warning",
    },
    PENDING: {
      icon: <Clock className="h-4 w-4" />,
      variant: "secondary",
    },
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Data Sources</h1>
            <p className="text-slate-600">
              Connect external data to enhance agent research.
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Data Source
          </Button>
        </div>

        {/* Available Integrations */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="border-dashed border-2 border-slate-300 hover:border-blue-400 transition-colors cursor-pointer">
            <CardContent className="p-6 text-center">
              <Globe className="h-10 w-10 text-blue-500 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900">REST API</h3>
              <p className="text-sm text-slate-500 mt-1">
                Connect any REST API endpoint for market data or internal
                systems.
              </p>
            </CardContent>
          </Card>

          <Card className="border-dashed border-2 border-slate-300 hover:border-blue-400 transition-colors cursor-pointer">
            <CardContent className="p-6 text-center">
              <Database className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900">Database</h3>
              <p className="text-sm text-slate-500 mt-1">
                Direct connection to PostgreSQL, MySQL, or other databases.
              </p>
            </CardContent>
          </Card>

          <Card className="border-dashed border-2 border-slate-300 hover:border-blue-400 transition-colors cursor-pointer">
            <CardContent className="p-6 text-center">
              <FileSearch className="h-10 w-10 text-purple-500 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900">File System</h3>
              <p className="text-sm text-slate-500 mt-1">
                S3, Azure Blob, or GCS bucket for document ingestion.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Configured Sources */}
        <Card>
          <CardHeader>
            <CardTitle>Configured Sources</CardTitle>
            <CardDescription>
              Active data source connections for your organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dataSources.length === 0 ? (
              <div className="text-center py-12">
                <Database className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  No data sources configured
                </h3>
                <p className="text-slate-500 mb-6">
                  Add a data source to start enriching your agent research with
                  external data.
                </p>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Source
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {dataSources.map((source) => {
                  const config = statusConfig[source.status] || statusConfig.PENDING;
                  return (
                    <div
                      key={source.id}
                      className="flex items-center justify-between py-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          {sourceTypeIcons[source.type] || (
                            <Database className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {source.name}
                          </p>
                          <p className="text-sm text-slate-500">
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
                        <Button variant="outline" size="sm">
                          Configure
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
