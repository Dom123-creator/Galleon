import { Metadata } from "next";
import { Check, X } from "lucide-react";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SUBSCRIPTION_TIERS } from "@/lib/stripe";
import { cn } from "@/lib/utils";
import { PricingCard } from "./pricing-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Choose the Galleon plan that fits your private credit research needs.",
};

export default async function PricingPage() {
  const { userId } = await auth();

  let currentTier = "ANALYST";
  let subscriptionStatus = null;

  if (userId) {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { subscription: true },
    });

    if (user) {
      currentTier = user.subscriptionTier;
      subscriptionStatus = user.subscription?.status;
    }
  }

  return (
    <div className="bg-slate-50">
      {/* Header */}
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
            Start with Analyst to explore, upgrade to Professional for full AI
            agent access, or contact us for Enterprise.
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Analyst Tier */}
          <PricingCard
            tier="ANALYST"
            name={SUBSCRIPTION_TIERS.ANALYST.name}
            description={SUBSCRIPTION_TIERS.ANALYST.description}
            price={SUBSCRIPTION_TIERS.ANALYST.price}
            interval="month"
            features={SUBSCRIPTION_TIERS.ANALYST.features}
            isCurrentPlan={currentTier === "ANALYST"}
            userId={userId}
            priceId={process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_ID}
          />

          {/* Professional Tier */}
          <PricingCard
            tier="PROFESSIONAL"
            name={SUBSCRIPTION_TIERS.PROFESSIONAL.name}
            description={SUBSCRIPTION_TIERS.PROFESSIONAL.description}
            price={SUBSCRIPTION_TIERS.PROFESSIONAL.price}
            interval="month"
            features={SUBSCRIPTION_TIERS.PROFESSIONAL.features}
            isCurrentPlan={currentTier === "PROFESSIONAL"}
            isPopular
            userId={userId}
            priceId={process.env.NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID}
          />

          {/* Enterprise Tier */}
          <PricingCard
            tier="ENTERPRISE"
            name={SUBSCRIPTION_TIERS.ENTERPRISE.name}
            description={SUBSCRIPTION_TIERS.ENTERPRISE.description}
            price={SUBSCRIPTION_TIERS.ENTERPRISE.price}
            interval="year"
            features={SUBSCRIPTION_TIERS.ENTERPRISE.features}
            isCurrentPlan={currentTier === "ENTERPRISE"}
            userId={userId}
            priceId={process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID}
          />
        </div>
      </div>

      {/* Feature Comparison */}
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
          Compare Plans
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-xl border border-slate-200">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left p-4 font-semibold text-slate-900">
                  Feature
                </th>
                <th className="text-center p-4 font-semibold text-slate-900">
                  Analyst
                </th>
                <th className="text-center p-4 font-semibold text-slate-900 bg-blue-50">
                  Professional
                </th>
                <th className="text-center p-4 font-semibold text-slate-900">
                  Enterprise
                </th>
              </tr>
            </thead>
            <tbody>
              <FeatureRow
                feature="Missions per month"
                analyst="5"
                professional="Unlimited"
                enterprise="Unlimited"
              />
              <FeatureRow
                feature="Documents per month"
                analyst="50"
                professional="Unlimited"
                enterprise="Unlimited"
              />
              <FeatureRow
                feature="Deal tracking"
                analyst={true}
                professional={true}
                enterprise={true}
              />
              <FeatureRow
                feature="Basic document parsing"
                analyst={true}
                professional={true}
                enterprise={true}
              />
              <FeatureRow
                feature="AI agent access"
                analyst={false}
                professional={true}
                enterprise={true}
              />
              <FeatureRow
                feature="Command Center (real-time)"
                analyst={false}
                professional={true}
                enterprise={true}
              />
              <FeatureRow
                feature="Advanced document analysis"
                analyst={false}
                professional={true}
                enterprise={true}
              />
              <FeatureRow
                feature="API access"
                analyst={false}
                professional={false}
                enterprise={true}
              />
              <FeatureRow
                feature="Custom data source integrations"
                analyst={false}
                professional={false}
                enterprise={true}
              />
              <FeatureRow
                feature="Team collaboration"
                analyst={false}
                professional={false}
                enterprise={true}
              />
              <FeatureRow
                feature="SSO / SAML"
                analyst={false}
                professional={false}
                enterprise={true}
              />
              <FeatureRow
                feature="Priority support"
                analyst={false}
                professional={true}
                enterprise={true}
              />
              <FeatureRow
                feature="Dedicated account manager"
                analyst={false}
                professional={false}
                enterprise={true}
                isLast
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-white border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            <FaqItem
              question="How does the free trial work?"
              answer="When you sign up for Professional, you get 7 days free to try all AI agent features. You won't be charged until the trial ends, and you can cancel anytime."
            />
            <FaqItem
              question="Can I switch plans?"
              answer="Yes! You can upgrade or downgrade at any time. When you upgrade, you'll be charged the prorated difference. When you downgrade, you'll receive credit toward future payments."
            />
            <FaqItem
              question="What happens if I hit my mission limit on Analyst?"
              answer="You'll be notified when you approach your monthly limit. You can upgrade to Professional at any time for unlimited missions and full AI agent access."
            />
            <FaqItem
              question="Is my deal data secure?"
              answer="Absolutely. All data is encrypted at rest and in transit. Enterprise customers get dedicated infrastructure. Your proprietary information never trains our models."
            />
            <FaqItem
              question="Do you offer team or institutional plans?"
              answer="Yes! Contact us at enterprise@galleon.ai for custom pricing on team subscriptions with dedicated support and SLA guarantees."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  feature,
  analyst,
  professional,
  enterprise,
  isLast = false,
}: {
  feature: string;
  analyst: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
  isLast?: boolean;
}) {
  const renderValue = (value: boolean | string) => {
    if (typeof value === "string") {
      return <span className="text-sm text-slate-600">{value}</span>;
    }
    return value ? (
      <Check className="h-5 w-5 text-emerald-500 mx-auto" />
    ) : (
      <X className="h-5 w-5 text-slate-300 mx-auto" />
    );
  };

  return (
    <tr className={cn(!isLast && "border-b border-slate-100")}>
      <td className="p-4 text-sm text-slate-700">{feature}</td>
      <td className="p-4 text-center">{renderValue(analyst)}</td>
      <td className="p-4 text-center bg-blue-50">
        {renderValue(professional)}
      </td>
      <td className="p-4 text-center">{renderValue(enterprise)}</td>
    </tr>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900">{question}</h3>
      <p className="mt-2 text-slate-600">{answer}</p>
    </div>
  );
}
