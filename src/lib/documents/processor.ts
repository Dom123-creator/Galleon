import { db } from "@/lib/db";
import { parseDocument } from "./parser";
import { classifyDocument } from "./classifier";

export async function processDocument(documentId: string): Promise<void> {
  // Update status to processing
  await db.document.update({
    where: { id: documentId },
    data: { status: "PROCESSING" },
  });

  try {
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    // Download file from S3
    const response = await fetch(document.fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse document
    const parseResult = await parseDocument(buffer, document.mimeType, document.fileName);

    // Classify document type
    const documentType = await classifyDocument(parseResult.content, document.fileName);

    // Update document with parsed content
    await db.document.update({
      where: { id: documentId },
      data: {
        status: "PARSED",
        parsedContent: parseResult.content,
        parsedMetadata: parseResult.metadata as Record<string, string>,
        pageCount: parseResult.pageCount,
        documentType,
      },
    });
  } catch (error) {
    await db.document.update({
      where: { id: documentId },
      data: {
        status: "FAILED",
        processingError: error instanceof Error ? error.message : "Processing failed",
      },
    });
    throw error;
  }
}
