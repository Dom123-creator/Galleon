import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, HardDrive } from "lucide-react";
import { formatDate, formatFileSize } from "@/lib/utils";
import { DocumentUploadArea } from "./document-upload-area";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documents",
  description: "Manage and process your deal documents.",
};

export default async function DocumentsPage() {
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

  const documents = await db.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      deal: { select: { id: true, name: true } },
    },
  });

  const statusVariants: Record<string, "success" | "warning" | "secondary" | "danger"> = {
    PROCESSED: "success",
    PROCESSING: "warning",
    UPLOADED: "secondary",
    FAILED: "danger",
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
      {/* Header */}
      <div className="mb-8">
        <p className="section-title mb-1">Document Vault</p>
        <h1 className="font-serif text-2xl font-semibold text-cream">Documents</h1>
        <p className="mt-1 text-sm text-muted">
          Upload and manage documents for AI analysis.
        </p>
      </div>

      {/* Upload Area */}
      <DocumentUploadArea />

      {/* Document List */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <HardDrive className="h-4 w-4 text-gold/60" />
          <h2 className="section-title">All Documents ({documents.length})</h2>
        </div>
        <div className="p-4">
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-2 mx-auto mb-4" />
              <h3 className="font-serif text-lg font-semibold text-cream mb-2">
                No documents yet
              </h3>
              <p className="text-sm text-muted">
                Upload credit agreements, financial statements, or other deal
                documents to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 label-mono">File Name</th>
                    <th className="text-left p-3 label-mono">Type</th>
                    <th className="text-left p-3 label-mono">Deal</th>
                    <th className="text-left p-3 label-mono">Size</th>
                    <th className="text-left p-3 label-mono">Status</th>
                    <th className="text-left p-3 label-mono">Date</th>
                    <th className="text-right p-3 label-mono">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b border-border/50 hover:bg-navy-3/40 transition-colors"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-2 shrink-0" />
                          <span className="text-xs font-mono font-medium text-cream-2 truncate max-w-[200px]">
                            {doc.fileName}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted font-mono">
                          {doc.documentType}
                        </span>
                      </td>
                      <td className="p-3">
                        {doc.deal ? (
                          <Link
                            href={`/deals/${doc.deal.id}`}
                            className="text-xs font-mono text-gold hover:text-gold-2"
                          >
                            {doc.deal.name}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-2">--</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted font-mono">
                          {doc.fileSize ? formatFileSize(doc.fileSize) : "--"}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge variant={statusVariants[doc.status] || "secondary"}>
                          {doc.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted font-mono">
                          {formatDate(doc.createdAt)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {doc.status === "PARSED" && (
                          <form
                            action={`/api/documents/${doc.id}/process`}
                            method="POST"
                          >
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                            >
                              Process
                            </Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
