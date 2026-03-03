import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  generateUploadUrl,
  generateFileName,
  validateFile,
  FileType,
} from "@/lib/s3";
import { fileUploadSchema } from "@/lib/validations";

// Generate presigned URL for client-side upload
export async function POST(req: Request) {
  try {
    await requireAuth();

    const body = await req.json();
    const validation = fileUploadSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { fileName, fileType, fileSize, uploadType } = validation.data;

    const fileValidation = validateFile(
      { size: fileSize, type: fileType },
      uploadType as FileType
    );

    if (!fileValidation.valid) {
      return NextResponse.json(
        { error: fileValidation.error },
        { status: 400 }
      );
    }

    const uniqueFileName = generateFileName(fileName, uploadType as FileType);
    const { uploadUrl, fileUrl } = await generateUploadUrl(
      uniqueFileName,
      fileType
    );

    return NextResponse.json({
      uploadUrl,
      fileUrl,
      key: uniqueFileName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Upload URL generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
