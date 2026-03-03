// ============================================
// Database Types (extends Prisma types)
// ============================================

import type {
  User as PrismaUser,
  Deal as PrismaDeal,
  Document as PrismaDocument,
  Mission as PrismaMission,
  AgentTask as PrismaAgentTask,
  Finding as PrismaFinding,
  ChatMessage as PrismaChatMessage,
  DataSource as PrismaDataSource,
  Subscription as PrismaSubscription,
  DealBookmark as PrismaDealBookmark,
} from "@prisma/client";

export type User = PrismaUser;
export type Deal = PrismaDeal;
export type Document = PrismaDocument;
export type Mission = PrismaMission;
export type AgentTask = PrismaAgentTask;
export type Finding = PrismaFinding;
export type ChatMessage = PrismaChatMessage;
export type DataSource = PrismaDataSource;
export type Subscription = PrismaSubscription;
export type DealBookmark = PrismaDealBookmark;

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

// ============================================
// Deal Types
// ============================================

export interface DealWithRelations extends Deal {
  documents?: Document[];
  missions?: Mission[];
  findings?: Finding[];
  bookmarks?: DealBookmark[];
  _count?: {
    documents: number;
    missions: number;
    findings: number;
  };
}

export interface DealFilters {
  sector?: string;
  status?: string;
  search?: string;
}

// ============================================
// Mission Types
// ============================================

export interface MissionWithRelations extends Mission {
  deal?: Deal | null;
  agentTasks?: AgentTask[];
  findings?: Finding[];
  chatMessages?: ChatMessage[];
  _count?: {
    agentTasks: number;
    findings: number;
    chatMessages: number;
  };
}

// ============================================
// Document Types
// ============================================

export interface DocumentWithRelations extends Document {
  deal?: Deal | null;
  findings?: Finding[];
}

// ============================================
// User Types
// ============================================

export interface UserWithSubscription extends User {
  subscription: Subscription | null;
}

export interface UserStats {
  activeMissions: number;
  totalDeals: number;
  documentsProcessed: number;
  totalFindings: number;
}

// ============================================
// Subscription Types
// ============================================

export type SubscriptionTier = "ANALYST" | "PROFESSIONAL" | "ENTERPRISE";

export type SubscriptionStatus =
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "TRIALING"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "PAUSED";

export interface SubscriptionPlan {
  name: string;
  description: string;
  price: number;
  priceId: string | null;
  interval?: "month" | "year";
  features: string[];
  limits: {
    missionsPerMonth: number;
    documentsPerMonth: number;
    agentAccess: boolean;
  };
}

// ============================================
// Agent Event Types
// ============================================

export type AgentEventType =
  | "agent_started"
  | "agent_progress"
  | "agent_completed"
  | "agent_error"
  | "finding_created"
  | "mission_status"
  | "chat_message";

export interface AgentEvent {
  type: AgentEventType;
  agentType?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ============================================
// Admin Types
// ============================================

export interface DashboardMetrics {
  totalUsers: number;
  activeSubscribers: number;
  mrr: number;
  arr: number;
  totalDeals: number;
  activeMissions: number;
  totalFindings: number;
  totalDocuments: number;
}

export interface FileUploadResult {
  url: string;
  key: string;
  size: number;
  type: string;
}

// ============================================
// Form Types
// ============================================

export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface AccountSettingsData {
  name: string;
  organizationName?: string;
  emailNotifications: boolean;
  newContentAlerts: boolean;
}

// ============================================
// Component Prop Types
// ============================================

export interface DealCardProps {
  deal: DealWithRelations;
  showBookmark?: boolean;
  onBookmarkToggle?: (dealId: string) => void;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// ============================================
// Clerk Types Extension
// ============================================

export interface ClerkUserMetadata {
  stripeCustomerId?: string;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
}
