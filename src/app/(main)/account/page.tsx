import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AccountSettings } from "./account-settings";
import { SubscriptionManagement } from "./subscription-management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account Settings",
  description: "Manage your Galleon account settings and subscription.",
};

export default async function AccountPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      subscription: true,
    },
  });

  if (!user) {
    redirect("/sign-in");
  }

  const tierLabels: Record<string, string> = {
    ANALYST: "Analyst",
    PROFESSIONAL: "Professional",
    ENTERPRISE: "Enterprise",
  };

  const statusLabels: Record<string, string> = {
    ACTIVE: "Active",
    TRIALING: "Trial",
    PAST_DUE: "Past Due",
    CANCELED: "Canceled",
    UNPAID: "Unpaid",
    INCOMPLETE: "Incomplete",
    INCOMPLETE_EXPIRED: "Expired",
    PAUSED: "Paused",
  };

  const statusVariants: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
    ACTIVE: "success",
    TRIALING: "info",
    PAST_DUE: "warning",
    CANCELED: "danger",
    UNPAID: "danger",
    INCOMPLETE: "warning",
    INCOMPLETE_EXPIRED: "danger",
    PAUSED: "warning",
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:px-9">
      <p className="section-title mb-1">Settings</p>
      <h1 className="font-serif text-2xl font-semibold text-cream mb-8">
        Account
      </h1>

      {/* Subscription Status */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden mb-6">
        <div className="border-b border-border px-5 py-3">
          <h2 className="section-title">Subscription</h2>
          <p className="text-xs text-muted mt-1">Manage your Galleon subscription and billing</p>
        </div>
        <div className="p-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Current Plan</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-cream-2">
                  {tierLabels[user.subscriptionTier] || user.subscriptionTier}
                </span>
                <Badge variant={statusVariants[user.subscriptionStatus] || "default"}>
                  {statusLabels[user.subscriptionStatus] || user.subscriptionStatus}
                </Badge>
              </div>
            </div>

            {user.subscription && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">
                    {user.subscription.cancelAtPeriodEnd
                      ? "Access Until"
                      : "Next Billing Date"}
                  </span>
                  <span className="font-mono text-sm text-cream-2">
                    {formatDate(user.subscription.currentPeriodEnd)}
                  </span>
                </div>

                {user.subscription.trialEnd &&
                  new Date(user.subscription.trialEnd) > new Date() && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted">Trial Ends</span>
                      <span className="font-mono text-sm text-cream-2">
                        {formatDate(user.subscription.trialEnd)}
                      </span>
                    </div>
                  )}

                {user.subscription.cancelAtPeriodEnd && (
                  <div className="rounded-lg border border-g-amber/30 bg-g-amber/10 p-3 text-sm text-g-amber">
                    Your subscription is set to cancel at the end of the
                    billing period. You will continue to have access until{" "}
                    {formatDate(user.subscription.currentPeriodEnd)}.
                  </div>
                )}
              </>
            )}

            {user.subscriptionTier === "ANALYST" && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Missions This Month</span>
                <span className="font-mono text-sm text-cream-2">
                  {user.monthlyMissionsUsed ?? 0} / 5 used
                </span>
              </div>
            )}

            <SubscriptionManagement
              tier={user.subscriptionTier}
              hasSubscription={!!user.subscription}
              cancelAtPeriodEnd={user.subscription?.cancelAtPeriodEnd || false}
            />
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden mb-6">
        <div className="border-b border-border px-5 py-3">
          <h2 className="section-title">Profile</h2>
          <p className="text-xs text-muted mt-1">Update your account preferences</p>
        </div>
        <div className="p-5">
          <AccountSettings
            name={user.name || ""}
            email={user.email}
            emailNotifications={user.emailNotifications}
            newContentAlerts={user.newContentAlerts}
          />
        </div>
      </div>

      {/* Account Info */}
      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h2 className="section-title">Account Information</h2>
        </div>
        <div className="p-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Email</span>
              <span className="font-mono text-sm text-cream-2">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Member Since</span>
              <span className="font-mono text-sm text-cream-2">
                {formatDate(user.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
