import { db } from "@/lib/db";

interface ToolCallResult {
  content: string;
  is_error?: boolean;
}

export async function searchDocuments(
  query: string,
  documentType?: string,
  dealId?: string
): Promise<ToolCallResult> {
  try {
    const where: Record<string, unknown> = {
      status: "PARSED",
    };

    if (documentType) {
      where.documentType = documentType;
    }

    if (dealId) {
      where.dealId = dealId;
    }

    // Use Prisma full-text search with PostgreSQL
    const documents = await db.document.findMany({
      where: {
        ...where,
        OR: [
          { parsedContent: { contains: query, mode: "insensitive" } },
          { fileName: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        fileName: true,
        documentType: true,
        parsedContent: true,
        pageCount: true,
        deal: {
          select: { name: true },
        },
      },
      take: 10,
    });

    // Extract relevant snippets
    const results = documents.map((doc) => {
      let snippet = "";
      if (doc.parsedContent) {
        const lowerContent = doc.parsedContent.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const idx = lowerContent.indexOf(lowerQuery);
        if (idx !== -1) {
          const start = Math.max(0, idx - 200);
          const end = Math.min(doc.parsedContent.length, idx + query.length + 200);
          snippet = doc.parsedContent.substring(start, end);
        } else {
          snippet = doc.parsedContent.substring(0, 400);
        }
      }

      return {
        documentId: doc.id,
        fileName: doc.fileName,
        type: doc.documentType,
        dealName: doc.deal?.name,
        pageCount: doc.pageCount,
        snippet,
      };
    });

    return {
      content: JSON.stringify({
        query,
        resultCount: results.length,
        results,
      }),
    };
  } catch (error) {
    return {
      content: `Search error: ${error instanceof Error ? error.message : "Unknown"}`,
      is_error: true,
    };
  }
}
