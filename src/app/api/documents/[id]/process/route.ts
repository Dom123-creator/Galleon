import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { processDocument } from "@/lib/documents/processor";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const document = await db.document.findFirst({ where: { id, userId: user.id } });
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    if (document.status === "PROCESSING") {
      return NextResponse.json({ error: "Document is already being processed" }, { status: 400 });
    }

    // Process in background (fire and forget)
    processDocument(id).catch((error) => {
      console.error(`Document processing failed for ${id}:`, error);
    });

    return NextResponse.json({ status: "processing", documentId: id });
  } catch (error) {
    console.error("Process document error:", error);
    return NextResponse.json({ error: "Failed to start processing" }, { status: 500 });
  }
}
