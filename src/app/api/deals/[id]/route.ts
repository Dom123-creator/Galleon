import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { dealUpdateSchema } from "@/lib/validations";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const deal = await db.deal.findFirst({
      where: { id, userId: user.id },
      include: {
        documents: { orderBy: { createdAt: "desc" }, take: 10 },
        missions: { orderBy: { createdAt: "desc" }, take: 10 },
        findings: { orderBy: { createdAt: "desc" }, take: 20 },
        bookmarks: { where: { userId: user.id } },
        _count: { select: { documents: true, missions: true, findings: true } },
      },
    });

    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    return NextResponse.json(deal);
  } catch (error) {
    console.error("Get deal error:", error);
    return NextResponse.json({ error: "Failed to get deal" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const existing = await db.deal.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const body = await req.json();
    const validation = dealUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    const deal = await db.deal.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json(deal);
  } catch (error) {
    console.error("Update deal error:", error);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const existing = await db.deal.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    await db.deal.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete deal error:", error);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
