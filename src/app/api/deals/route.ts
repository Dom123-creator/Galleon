import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { dealCreateSchema, dealFilterSchema } from "@/lib/validations";
import { generateSlug } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const filters = dealFilterSchema.parse(Object.fromEntries(searchParams));

    const where: Record<string, unknown> = { userId: user.id };
    if (filters.sector) where.sector = filters.sector;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { borrowerName: { contains: filters.search, mode: "insensitive" } },
        { lenderName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      db.deal.findMany({
        where,
        orderBy: { [filters.sortBy]: filters.sortDir },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          _count: { select: { documents: true, missions: true, findings: true } },
        },
      }),
      db.deal.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
      hasMore: filters.page * filters.limit < total,
    });
  } catch (error) {
    console.error("List deals error:", error);
    return NextResponse.json({ error: "Failed to list deals" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();
    const validation = dealCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    const data = validation.data;
    let slug = generateSlug(data.name);

    // Ensure unique slug
    const existing = await db.deal.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const deal = await db.deal.create({
      data: {
        ...data,
        slug,
        dealSize: data.dealSize || undefined,
        sourceUrl: data.sourceUrl || undefined,
        userId: user.id,
      },
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    console.error("Create deal error:", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
