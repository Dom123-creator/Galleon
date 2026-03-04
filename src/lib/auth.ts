import { db } from "@/lib/db";
import type { User } from "@prisma/client";

const DEV_MODE =
  !process.env.CLERK_SECRET_KEY ||
  process.env.CLERK_SECRET_KEY === "sk_test_placeholder";

const DEV_CLERK_ID = "dev_user_001";

// Dev-compatible replacement for Clerk's auth() — returns { userId } for API routes
export async function getAuthUserId(): Promise<{ userId: string | null }> {
  if (DEV_MODE) {
    // Ensure dev user exists in DB (routes do their own findUnique by clerkId)
    await getOrCreateDevUser();
    return { userId: DEV_CLERK_ID };
  }
  const { auth } = await import("@clerk/nextjs/server");
  return auth();
}

// Dev user fallback when Clerk keys are placeholders
async function getOrCreateDevUser(): Promise<User> {
  const devClerkId = "dev_user_001";
  let user = await db.user.findUnique({ where: { clerkId: devClerkId } });
  if (!user) {
    user = await db.user.create({
      data: {
        clerkId: devClerkId,
        email: "dev@galleon.local",
        name: "Dev User",
        role: "ADMIN",
        subscriptionTier: "ENTERPRISE",
      },
    });
  }
  return user;
}

// Get current authenticated user from Clerk and sync with database
export async function getCurrentUser(): Promise<User | null> {
  if (DEV_MODE) {
    return getOrCreateDevUser();
  }

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  let user = await db.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    const clerkUser = await currentUser();

    if (!clerkUser) {
      return null;
    }

    user = await db.user.create({
      data: {
        clerkId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
        name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || null,
        imageUrl: clerkUser.imageUrl,
      },
    });
  }

  return user;
}

// Get current user with subscription details
export async function getCurrentUserWithSubscription() {
  if (DEV_MODE) {
    const user = await getOrCreateDevUser();
    return { ...user, subscription: null };
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      subscription: true,
    },
  });

  return user;
}

// Check if user has agent access (PROFESSIONAL or ENTERPRISE)
export async function hasAgentAccess(): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  return (
    user.subscriptionTier === "PROFESSIONAL" ||
    user.subscriptionTier === "ENTERPRISE"
  );
}

// Check if user can create a mission
export async function canCreateMission(): Promise<{ canCreate: boolean; reason?: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return { canCreate: false, reason: "Please sign in to create missions" };
  }

  // Professional and Enterprise have unlimited missions
  if (
    user.subscriptionTier === "PROFESSIONAL" ||
    user.subscriptionTier === "ENTERPRISE"
  ) {
    return { canCreate: true };
  }

  // Check monthly limit for Analyst tier (5/month)
  const now = new Date();
  const lastReset = new Date(user.lastUsageReset);

  if (
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear()
  ) {
    await db.user.update({
      where: { id: user.id },
      data: {
        monthlyMissionsUsed: 0,
        lastUsageReset: now,
      },
    });
    return { canCreate: true };
  }

  if (user.monthlyMissionsUsed >= 5) {
    return {
      canCreate: false,
      reason: "You've reached your monthly limit of 5 missions. Upgrade to Professional for unlimited missions.",
    };
  }

  return { canCreate: true };
}

// Check if user can access a deal
export async function canAccessDeal(dealId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  // Admin can access all deals
  if (user.role === "ADMIN") return true;

  // Users can access their own deals
  const deal = await db.deal.findFirst({
    where: { id: dealId, userId: user.id },
  });

  return !!deal;
}

// Check if user can upload documents
export async function canUploadDocuments(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  // All tiers can upload documents
  return true;
}

// Increment mission usage for Analyst tier
export async function incrementMissionUsage(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) return;

  if (user.subscriptionTier === "ANALYST") {
    await db.user.update({
      where: { id: userId },
      data: {
        monthlyMissionsUsed: user.monthlyMissionsUsed + 1,
      },
    });
  }
}

// Check if current user is admin
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN";
}

// Require authentication
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}

// Require admin
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  if (user.role !== "ADMIN") {
    throw new Error("Admin access required");
  }

  return user;
}
