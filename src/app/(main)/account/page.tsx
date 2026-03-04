import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">
          Account Settings
        </h1>

        {/* Subscription Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              Manage your Galleon subscription and billing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Current Plan</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">
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
                    <span className="text-slate-600">
                      {user.subscription.cancelAtPeriodEnd
                        ? "Access Until"
                        : "Next Billing Date"}
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatDate(user.subscription.currentPeriodEnd)}
                    </span>
                  </div>

                  {user.subscription.trialEnd &&
                    new Date(user.subscription.trialEnd) > new Date() && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Trial Ends</span>
                        <span className="font-medium text-slate-900">
                          {formatDate(user.subscription.trialEnd)}
                        </span>
                      </div>
                    )}

                  {user.subscription.cancelAtPeriodEnd && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                      Your subscription is set to cancel at the end of the
                      billing period. You will continue to have access until{" "}
                      {formatDate(user.subscription.currentPeriodEnd)}.
                    </div>
                  )}
                </>
              )}

              {user.subscriptionTier === "ANALYST" && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Missions This Month</span>
                  <span className="font-medium text-slate-900">
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
          </CardContent>
        </Card>

        {/* Account Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your account preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountSettings
              name={user.name || ""}
              email={user.email}
              emailNotifications={user.emailNotifications}
              newContentAlerts={user.newContentAlerts}
            />
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Email</span>
                <span className="font-medium text-slate-900">{user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Member Since</span>
                <span className="font-medium text-slate-900">
                  {formatDate(user.createdAt)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
