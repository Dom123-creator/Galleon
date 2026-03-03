"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface PricingCardProps {
  tier: "ANALYST" | "PROFESSIONAL" | "ENTERPRISE";
  name: string;
  description: string;
  price: number;
  interval?: "month" | "year";
  features: readonly string[];
  isCurrentPlan: boolean;
  isPopular?: boolean;
  userId: string | null;
  priceId?: string;
}

export function PricingCard({
  tier,
  name,
  description,
  price,
  interval = "month",
  features,
  isCurrentPlan,
  isPopular,
  userId,
  priceId,
}: PricingCardProps) {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!priceId) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, tier }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      addToast({
        type: "error",
        title: "Something went wrong",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-white p-8",
        isPopular
          ? "border-blue-500 shadow-xl shadow-blue-500/10"
          : "border-slate-200",
        isCurrentPlan && "ring-2 ring-emerald-500"
      )}
    >
      {isPopular && (
        <Badge
          variant="primary"
          className="absolute -top-3 left-1/2 -translate-x-1/2"
        >
          Most Popular
        </Badge>
      )}

      {isCurrentPlan && (
        <Badge
          variant="success"
          className="absolute -top-3 right-4"
        >
          Current Plan
        </Badge>
      )}

      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>

        <div className="mt-6">
          <span className="text-4xl font-bold text-slate-900">
            ${price}
          </span>
          {price > 0 && (
            <span className="text-slate-500">/{interval}</span>
          )}
        </div>

        {tier !== "ANALYST" && (
          <p className="mt-2 text-sm text-emerald-600">
            7-day free trial included
          </p>
        )}
      </div>

      <ul className="mt-8 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-slate-600">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {isCurrentPlan ? (
          <Button variant="outline" className="w-full" disabled>
            Current Plan
          </Button>
        ) : tier === "ANALYST" ? (
          <Link href="/sign-up">
            <Button variant="outline" className="w-full">
              Get Started
            </Button>
          </Link>
        ) : !userId ? (
          <Link href="/sign-up">
            <Button
              variant={isPopular ? "primary" : "outline"}
              className="w-full"
            >
              Start Free Trial
            </Button>
          </Link>
        ) : (
          <Button
            variant={isPopular ? "primary" : "outline"}
            className="w-full"
            onClick={handleSubscribe}
            isLoading={isLoading}
          >
            {isLoading ? "Loading..." : "Start Free Trial"}
          </Button>
        )}
      </div>
    </div>
  );
}
