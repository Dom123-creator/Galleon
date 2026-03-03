import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { dataSourceUpdateSchema } from "@/lib/validations";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const dataSource = await db.dataSource.findFirst({ where: { id, userId: user.id } });
    if (!dataSource) return NextResponse.json({ error: "Data source not found" }, { status: 404 });

    return NextResponse.json(dataSource);
  } catch (error) {
    console.error("Get data source error:", error);
    return NextResponse.json({ error: "Failed to get data source" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const existing = await db.dataSource.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Data source not found" }, { status: 404 });

    const body = await req.json();
    const validation = dataSourceUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    const dataSource = await db.dataSource.update({ where: { id }, data: validation.data as Parameters<typeof db.dataSource.update>[0]["data"] });

    return NextResponse.json(dataSource);
  } catch (error) {
    console.error("Update data source error:", error);
    return NextResponse.json({ error: "Failed to update data source" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const existing = await db.dataSource.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Data source not found" }, { status: 404 });

    await db.dataSource.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete data source error:", error);
    return NextResponse.json({ error: "Failed to delete data source" }, { status: 500 });
  }
}
