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
import { FileText, Upload, HardDrive } from "lucide-react";
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
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
          <p className="text-slate-600">
            Upload and manage documents for AI analysis.
          </p>
        </div>

        {/* Upload Area */}
        <DocumentUploadArea />

        {/* Document List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-slate-500" />
              All Documents ({documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  No documents yet
                </h3>
                <p className="text-slate-500">
                  Upload credit agreements, financial statements, or other deal
                  documents to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">
                        File Name
                      </th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">
                        Type
                      </th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">
                        Deal
                      </th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">
                        Size
                      </th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">
                        Status
                      </th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">
                        Date
                      </th>
                      <th className="text-right p-3 text-sm font-semibold text-slate-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="text-sm font-medium text-slate-900 truncate max-w-[200px]">
                              {doc.fileName}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-slate-600">
                            {doc.documentType}
                          </span>
                        </td>
                        <td className="p-3">
                          {doc.deal ? (
                            <Link
                              href={`/deals/${doc.deal.id}`}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              {doc.deal.name}
                            </Link>
                          ) : (
                            <span className="text-sm text-slate-400">--</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-slate-600">
                            {doc.fileSize ? formatFileSize(doc.fileSize) : "--"}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge variant={statusVariants[doc.status] || "secondary"}>
                            {doc.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-slate-500">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
