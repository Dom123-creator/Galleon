import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { missionCreateSchema } from "@/lib/validations";
import { canCreateMission, incrementMissionUsage } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");

    const where: Record<string, unknown> = { userId: user.id };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.mission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          deal: { select: { name: true, slug: true } },
          _count: { select: { agentTasks: true, findings: true } },
        },
      }),
      db.mission.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error("List missions error:", error);
    return NextResponse.json({ error: "Failed to list missions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check mission limit
    const { canCreate, reason } = await canCreateMission();
    if (!canCreate) {
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    const body = await req.json();
    const validation = missionCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    const data = validation.data;

    // Verify deal exists if provided
    if (data.dealId) {
      const deal = await db.deal.findFirst({ where: { id: data.dealId, userId: user.id } });
      if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const { scope, ...rest } = data;
    const mission = await db.mission.create({
      data: {
        ...rest,
        ...(scope !== undefined && { scope: scope as Record<string, string> }),
        userId: user.id,
      },
    });

    await incrementMissionUsage(user.id);

    return NextResponse.json(mission, { status: 201 });
  } catch (error) {
    console.error("Create mission error:", error);
    return NextResponse.json({ error: "Failed to create mission" }, { status: 500 });
  }
}
