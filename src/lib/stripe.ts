import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return stripeInstance;
}

export const stripe = {
  webhooks: {
    constructEvent(body: string, signature: string, secret: string) {
      return getStripe().webhooks.constructEvent(body, signature, secret);
    },
  },
};

// Subscription tier configuration
export const SUBSCRIPTION_TIERS = {
  ANALYST: {
    name: "Analyst",
    description: "Manual tools for individual researchers",
    price: 99,
    priceId: process.env.STRIPE_ANALYST_PRICE_ID,
    features: [
      "Manual deal research tools",
      "50 documents per month",
      "5 missions per month",
      "Basic document parsing",
      "Deal tracking dashboard",
      "Email support",
    ],
    limits: {
      missionsPerMonth: 5,
      documentsPerMonth: 50,
      agentAccess: false,
    },
  },
  PROFESSIONAL: {
    name: "Professional",
    description: "Full AI agent access for power users",
    price: 499,
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
    features: [
      "Everything in Analyst",
      "Unlimited missions",
      "Full AI agent access",
      "Command Center (real-time)",
      "Unlimited documents",
      "Advanced document analysis",
      "Priority support",
    ],
    limits: {
      missionsPerMonth: Infinity,
      documentsPerMonth: Infinity,
      agentAccess: true,
    },
  },
  ENTERPRISE: {
    name: "Enterprise",
    description: "Custom solutions for institutional teams",
    price: 0, // Custom pricing
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    features: [
      "Everything in Professional",
      "API access",
      "Team collaboration",
      "Custom data source integrations",
      "SLA guarantee",
      "Dedicated account manager",
      "SSO / SAML",
    ],
    limits: {
      missionsPerMonth: Infinity,
      documentsPerMonth: Infinity,
      agentAccess: true,
    },
  },
} as const;

export type SubscriptionTierKey = keyof typeof SUBSCRIPTION_TIERS;

export const TRIAL_PERIOD_DAYS = 7;
export const GRACE_PERIOD_DAYS = 3;

export async function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  trialPeriodDays = TRIAL_PERIOD_DAYS,
  metadata = {},
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: trialPeriodDays,
      metadata,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

export async function createPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function getOrCreateStripeCustomer({
  email,
  name,
  userId,
}: {
  email: string;
  name?: string;
  userId: string;
}): Promise<string> {
  const existingCustomers = await getStripe().customers.list({
    email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0].id;
  }

  const customer = await getStripe().customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId,
    },
  });

  return customer.id;
}

export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function resumeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);

  return getStripe().subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    proration_behavior: "create_prorations",
  });
}

export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.retrieve(subscriptionId);
}

export function mapStripeStatus(
  status: Stripe.Subscription.Status
): string {
  const statusMap: Record<Stripe.Subscription.Status, string> = {
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    unpaid: "UNPAID",
    trialing: "TRIALING",
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE_EXPIRED",
    paused: "PAUSED",
  };

  return statusMap[status] || "ACTIVE";
}

export function mapPriceToTier(priceId: string): string {
  if (priceId === process.env.STRIPE_ANALYST_PRICE_ID) {
    return "ANALYST";
  }
  if (priceId === process.env.STRIPE_PROFESSIONAL_PRICE_ID) {
    return "PROFESSIONAL";
  }
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
    return "ENTERPRISE";
  }
  return "ANALYST";
}
