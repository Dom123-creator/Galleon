import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteFile, extractS3Key } from "@/lib/s3";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const document = await db.document.findFirst({
      where: { id, userId: user.id },
      include: {
        deal: { select: { name: true, slug: true } },
        findings: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    return NextResponse.json(document);
  } catch (error) {
    console.error("Get document error:", error);
    return NextResponse.json({ error: "Failed to get document" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const document = await db.document.findFirst({ where: { id, userId: user.id } });
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    // Delete from S3
    const s3Key = extractS3Key(document.fileUrl);
    if (s3Key) {
      await deleteFile(s3Key).catch(console.error);
    }

    await db.document.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
