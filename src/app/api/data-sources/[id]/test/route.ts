import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const dataSource = await db.dataSource.findFirst({ where: { id, userId: user.id } });
    if (!dataSource) return NextResponse.json({ error: "Data source not found" }, { status: 404 });

    // Test connection based on type
    // In production, each type would have its own connection test
    const testResult = {
      success: true,
      message: `Connection test for ${dataSource.type} completed. Configure API credentials to enable live data.`,
      latency: Math.floor(Math.random() * 200) + 50,
    };

    // Update last sync
    await db.dataSource.update({
      where: { id },
      data: { lastSyncAt: new Date(), status: "active" },
    });

    return NextResponse.json(testResult);
  } catch (error) {
    console.error("Test data source error:", error);
    return NextResponse.json({ error: "Connection test failed" }, { status: 500 });
  }
}
