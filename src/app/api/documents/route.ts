import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { documentUploadSchema } from "@/lib/validations";
import { generateUploadUrl, generateFileName, validateFile, FileType } from "@/lib/s3";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const dealId = searchParams.get("dealId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = { userId: user.id };
    if (dealId) where.dealId = dealId;

    const [items, total] = await Promise.all([
      db.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          deal: { select: { name: true, slug: true } },
        },
      }),
      db.document.count({ where }),
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
    console.error("List documents error:", error);
    return NextResponse.json({ error: "Failed to list documents" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();
    const validation = documentUploadSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    const { fileName, fileType, fileSize, uploadType, dealId } = validation.data;

    const fileValidation = validateFile({ size: fileSize, type: fileType }, uploadType as FileType);
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.error }, { status: 400 });
    }

    const uniqueFileName = generateFileName(fileName, uploadType as FileType);
    const { uploadUrl, fileUrl } = await generateUploadUrl(uniqueFileName, fileType);

    // Create document record
    const document = await db.document.create({
      data: {
        userId: user.id,
        dealId: dealId || null,
        fileName,
        fileUrl,
        fileKey: uniqueFileName,
        fileSize,
        mimeType: fileType,
        status: "UPLOADING",
      },
    });

    return NextResponse.json({
      uploadUrl,
      fileUrl,
      key: uniqueFileName,
      documentId: document.id,
    });
  } catch (error) {
    console.error("Upload initiation error:", error);
    return NextResponse.json({ error: "Failed to initiate upload" }, { status: 500 });
  }
}
