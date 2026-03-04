"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface SubscriptionManagementProps {
  tier: string;
  hasSubscription: boolean;
  cancelAtPeriodEnd: boolean;
}

export function SubscriptionManagement({
  tier,
  hasSubscription,
  cancelAtPeriodEnd,
}: SubscriptionManagementProps) {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  const handleManageSubscription = async () => {
    setIsLoading(true);
    setAction("manage");

    try {
      const response = await fetch("/api/subscriptions/portal", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to open billing portal");
      }

      window.location.href = data.url;
    } catch (error) {
      addToast({
        type: "error",
        title: "Failed to open billing portal",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
      setIsLoading(false);
      setAction(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your subscription? You'll continue to have access until the end of your billing period.")) {
      return;
    }

    setIsLoading(true);
    setAction("cancel");

    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel subscription");
      }

      addToast({
        type: "success",
        title: "Subscription canceled",
        description: data.message,
      });

      window.location.reload();
    } catch (error) {
      addToast({
        type: "error",
        title: "Failed to cancel subscription",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
      setAction(null);
    }
  };

  const handleResumeSubscription = async () => {
    setIsLoading(true);
    setAction("resume");

    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resume subscription");
      }

      addToast({
        type: "success",
        title: "Subscription resumed",
        description: data.message,
      });

      window.location.reload();
    } catch (error) {
      addToast({
        type: "error",
        title: "Failed to resume subscription",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
      setAction(null);
    }
  };

  if (tier === "FREE") {
    return (
      <div className="pt-4 border-t border-border mt-4">
        <Link href="/pricing">
          <Button variant="primary" className="w-full sm:w-auto">
            Upgrade to Premium
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-border mt-4 flex flex-wrap gap-3">
      <Button
        variant="outline"
        onClick={handleManageSubscription}
        isLoading={isLoading && action === "manage"}
        disabled={isLoading}
      >
        Manage Billing
      </Button>

      {cancelAtPeriodEnd ? (
        <Button
          variant="primary"
          onClick={handleResumeSubscription}
          isLoading={isLoading && action === "resume"}
          disabled={isLoading}
        >
          Resume Subscription
        </Button>
      ) : (
        <Button
          variant="ghost"
          className="text-g-red hover:text-g-red hover:bg-g-red/10"
          onClick={handleCancelSubscription}
          isLoading={isLoading && action === "cancel"}
          disabled={isLoading}
        >
          Cancel Subscription
        </Button>
      )}

      <Link href="/pricing">
        <Button variant="ghost" disabled={isLoading}>
          Change Plan
        </Button>
      </Link>
    </div>
  );
}
