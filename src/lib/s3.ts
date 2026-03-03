import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET!;

// File type configurations
export const FILE_CONFIGS = {
  document: {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    folder: "documents",
  },
  report: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ["application/pdf"],
    folder: "reports",
  },
  thumbnail: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    folder: "thumbnails",
  },
} as const;

export type FileType = keyof typeof FILE_CONFIGS;

// Generate a unique filename
export function generateFileName(
  originalName: string,
  fileType: FileType
): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split(".").pop();
  return `${FILE_CONFIGS[fileType].folder}/${timestamp}-${randomString}.${extension}`;
}

// Generate presigned URL for upload
export async function generateUploadUrl(
  fileName: string,
  contentType: string,
  expiresIn = 3600 // 1 hour
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  // Construct the CDN URL (using CloudFront if configured, otherwise S3 URL)
  const cdnDomain = process.env.AWS_CLOUDFRONT_DOMAIN;
  const fileUrl = cdnDomain
    ? `https://${cdnDomain}/${fileName}`
    : `https://${BUCKET_NAME}.s3.amazonaws.com/${fileName}`;

  return { uploadUrl, fileUrl };
}

// Generate presigned URL for download
export async function generateDownloadUrl(
  fileKey: string,
  expiresIn = 3600,
  fileName?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileKey,
    ResponseContentDisposition: fileName
      ? `attachment; filename="${fileName}"`
      : undefined,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

// Upload file directly (for server-side uploads)
export async function uploadFile(
  file: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: file,
    ContentType: contentType,
    CacheControl: "max-age=31536000",
  });

  await s3Client.send(command);

  const cdnDomain = process.env.AWS_CLOUDFRONT_DOMAIN;
  return cdnDomain
    ? `https://${cdnDomain}/${fileName}`
    : `https://${BUCKET_NAME}.s3.amazonaws.com/${fileName}`;
}

// Delete file
export async function deleteFile(fileKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileKey,
  });

  await s3Client.send(command);
}

// Validate file
export function validateFile(
  file: { size: number; type: string },
  fileType: FileType
): { valid: boolean; error?: string } {
  const config = FILE_CONFIGS[fileType];

  if (file.size > config.maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed (${config.maxSize / (1024 * 1024)}MB)`,
    };
  }

  const allowedTypes = config.allowedTypes as readonly string[];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
}

// Extract S3 key from full URL
export function extractS3Key(url: string): string | null {
  try {
    const urlObj = new URL(url);

    if (process.env.AWS_CLOUDFRONT_DOMAIN && urlObj.hostname.includes(process.env.AWS_CLOUDFRONT_DOMAIN)) {
      return urlObj.pathname.slice(1);
    }

    if (urlObj.hostname.includes("s3.amazonaws.com")) {
      return urlObj.pathname.slice(1);
    }

    return null;
  } catch {
    return null;
  }
}
