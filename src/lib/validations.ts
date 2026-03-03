import { z } from "zod";

// ============================================
// Deal Validations
// ============================================

export const dealCreateSchema = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(200, "Name must be less than 200 characters"),
  description: z
    .string()
    .max(5000, "Description must be less than 5000 characters")
    .optional(),
  borrowerName: z.string().max(200).optional(),
  lenderName: z.string().max(200).optional(),
  dealSize: z.number().positive().optional(),
  currency: z.string().default("USD"),
  sector: z.enum([
    "DIRECT_LENDING", "DISTRESSED_DEBT", "MEZZANINE", "VENTURE_DEBT",
    "REAL_ESTATE_DEBT", "INFRASTRUCTURE_DEBT", "CLO", "SPECIALTY_FINANCE",
    "ASSET_BACKED", "OTHER",
  ]).default("OTHER"),
  tags: z.array(z.string()).max(10).default([]),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  externalId: z.string().max(100).optional(),
});

export const dealUpdateSchema = dealCreateSchema.partial();

export const dealFilterSchema = z.object({
  sector: z.string().optional(),
  status: z.string().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  sortBy: z
    .enum(["createdAt", "name", "dealSize", "status"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================
// Mission Validations
// ============================================

export const missionCreateSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be less than 200 characters"),
  objective: z
    .string()
    .min(20, "Objective must be at least 20 characters")
    .max(5000, "Objective must be less than 5000 characters"),
  successCriteria: z
    .string()
    .max(2000, "Success criteria must be less than 2000 characters")
    .optional(),
  scope: z.record(z.unknown()).optional(),
  mode: z.enum(["AUTONOMOUS", "INTERACTIVE"]).default("AUTONOMOUS"),
  dealId: z.string().cuid().optional(),
});

export const missionUpdateSchema = missionCreateSchema.partial();

// ============================================
// Document Validations
// ============================================

export const documentUploadSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileType: z.string().min(1, "File type is required"),
  fileSize: z.number().int().positive("File size must be positive"),
  uploadType: z.enum(["document", "report"]),
  dealId: z.string().cuid().optional(),
});

// ============================================
// Chat Validations
// ============================================

export const chatMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(5000, "Message must be less than 5000 characters"),
});

// ============================================
// Data Source Validations
// ============================================

export const dataSourceCreateSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  type: z.enum([
    "UCC_FILINGS", "COURT_RECORDS", "SEC_EDGAR", "NEWS_SCRAPER",
    "PREQIN", "SP_LCD", "LSEG", "CUSTOM_API",
  ]),
  config: z.record(z.unknown()).optional(),
});

export const dataSourceUpdateSchema = dataSourceCreateSchema.partial();

// ============================================
// User Validations
// ============================================

export const userSettingsSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .optional(),
  organizationName: z.string().max(200).optional(),
  emailNotifications: z.boolean().optional(),
  newContentAlerts: z.boolean().optional(),
});

// ============================================
// Subscription Validations
// ============================================

export const checkoutSchema = z.object({
  priceId: z.string().min(1, "Price ID is required"),
  tier: z.enum(["ANALYST", "PROFESSIONAL", "ENTERPRISE"]),
});

export const subscriptionActionSchema = z.object({
  action: z.enum(["cancel", "resume", "upgrade", "downgrade"]),
  newPriceId: z.string().optional(),
});

// ============================================
// File Upload Validations
// ============================================

export const fileUploadSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileType: z.string().min(1, "File type is required"),
  fileSize: z.number().int().positive("File size must be positive"),
  uploadType: z.enum(["document", "report", "thumbnail"]),
});

// ============================================
// Contact/Support Validations
// ============================================

export const contactFormSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  email: z.string().email("Invalid email address"),
  subject: z
    .string()
    .min(5, "Subject must be at least 5 characters")
    .max(200, "Subject must be less than 200 characters"),
  message: z
    .string()
    .min(20, "Message must be at least 20 characters")
    .max(5000, "Message must be less than 5000 characters"),
});

// ============================================
// Analytics Validations
// ============================================

export const analyticsEventSchema = z.object({
  eventType: z.string().min(1).max(100),
  eventData: z.record(z.unknown()),
  page: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
});

// ============================================
// Type exports from schemas
// ============================================

export type DealCreateInput = z.infer<typeof dealCreateSchema>;
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;
export type DealFilterInput = z.infer<typeof dealFilterSchema>;
export type MissionCreateInput = z.infer<typeof missionCreateSchema>;
export type MissionUpdateInput = z.infer<typeof missionUpdateSchema>;
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type DataSourceCreateInput = z.infer<typeof dataSourceCreateSchema>;
export type DataSourceUpdateInput = z.infer<typeof dataSourceUpdateSchema>;
export type UserSettingsInput = z.infer<typeof userSettingsSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type SubscriptionActionInput = z.infer<typeof subscriptionActionSchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;
