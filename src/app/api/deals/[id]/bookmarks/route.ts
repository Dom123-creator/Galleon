import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const bookmark = await db.dealBookmark.create({
      data: {
        userId: user.id,
        dealId: id,
        note: body.note || null,
      },
    });

    return NextResponse.json(bookmark, { status: 201 });
  } catch (error) {
    console.error("Create bookmark error:", error);
    return NextResponse.json({ error: "Failed to create bookmark" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    await db.dealBookmark.delete({
      where: { userId_dealId: { userId: user.id, dealId: id } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete bookmark error:", error);
    return NextResponse.json({ error: "Failed to delete bookmark" }, { status: 500 });
  }
}
