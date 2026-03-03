import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { dataSourceCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Enterprise-only feature
    if (user.subscriptionTier !== "ENTERPRISE" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Data sources require Enterprise subscription" }, { status: 403 });
    }

    const dataSources = await db.dataSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(dataSources);
  } catch (error) {
    console.error("List data sources error:", error);
    return NextResponse.json({ error: "Failed to list data sources" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (user.subscriptionTier !== "ENTERPRISE" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Data sources require Enterprise subscription" }, { status: 403 });
    }

    const body = await req.json();
    const validation = dataSourceCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    const dataSource = await db.dataSource.create({
      data: {
        name: validation.data.name,
        type: validation.data.type,
        config: (validation.data.config ?? {}) as Record<string, string>,
        userId: user.id,
      },
    });

    return NextResponse.json(dataSource, { status: 201 });
  } catch (error) {
    console.error("Create data source error:", error);
    return NextResponse.json({ error: "Failed to create data source" }, { status: 500 });
  }
}
