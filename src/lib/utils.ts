import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge Tailwind classes safely
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format currency
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format large numbers (e.g., deal sizes)
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num}`;
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Format date for display
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Format relative time
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(d);
}

// Generate slug from title
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Truncate text
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

// Sector display names
export const SECTOR_DISPLAY_NAMES: Record<string, string> = {
  DIRECT_LENDING: "Direct Lending",
  DISTRESSED_DEBT: "Distressed Debt",
  MEZZANINE: "Mezzanine",
  VENTURE_DEBT: "Venture Debt",
  REAL_ESTATE_DEBT: "Real Estate Debt",
  INFRASTRUCTURE_DEBT: "Infrastructure Debt",
  CLO: "CLO",
  SPECIALTY_FINANCE: "Specialty Finance",
  ASSET_BACKED: "Asset-Backed",
  OTHER: "Other",
};

export function getSectorDisplayName(sector: string): string {
  return SECTOR_DISPLAY_NAMES[sector] || sector;
}

// Confidence colors for badges
export const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-orange-100 text-orange-800",
  UNVERIFIED: "bg-slate-100 text-slate-800",
};

// Mission status colors
export function getMissionStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-800",
    QUEUED: "bg-blue-100 text-blue-800",
    RUNNING: "bg-indigo-100 text-indigo-800",
    PAUSED: "bg-amber-100 text-amber-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-red-100 text-red-800",
    CANCELED: "bg-slate-100 text-slate-800",
  };
  return colors[status] || "bg-slate-100 text-slate-800";
}

// Deal status colors
export function getDealStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PROSPECT: "bg-slate-100 text-slate-800",
    UNDER_REVIEW: "bg-blue-100 text-blue-800",
    ACTIVE_RESEARCH: "bg-indigo-100 text-indigo-800",
    AUDIT_COMPLETE: "bg-emerald-100 text-emerald-800",
    ARCHIVED: "bg-slate-100 text-slate-600",
  };
  return colors[status] || "bg-slate-100 text-slate-800";
}

// Rate limit key generator
export function getRateLimitKey(identifier: string, action: string): string {
  return `rate_limit:${action}:${identifier}`;
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Safe JSON parse
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Debounce function
export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: Parameters<T>) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
