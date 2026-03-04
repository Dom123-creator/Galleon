import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  stripe,
  getOrCreateStripeCustomer,
  createCheckoutSession,
  SUBSCRIPTION_TIERS,
  TRIAL_PERIOD_DAYS,
} from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validations";

// Create a Stripe checkout session for subscription
export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate input
    const validation = checkoutSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { priceId, tier } = validation.data;

    // Get user from database
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { subscription: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if user already has an active subscription
    if (
      user.subscription &&
      ["ACTIVE", "TRIALING"].includes(user.subscription.status)
    ) {
      return NextResponse.json(
        { error: "You already have an active subscription. Please manage it from your account settings." },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      stripeCustomerId = await getOrCreateStripeCustomer({
        email: user.email,
        name: user.name || undefined,
        userId: user.id,
      });

      // Save Stripe customer ID to user
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    // Determine if user has had a trial before
    const hasHadTrial = await db.subscription.findFirst({
      where: {
        userId: user.id,
        trialStart: { not: null },
      },
    });

    // Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl: `${appUrl}/dashboard?subscription=success`,
      cancelUrl: `${appUrl}/pricing?subscription=canceled`,
      trialPeriodDays: hasHadTrial ? 0 : TRIAL_PERIOD_DAYS,
      metadata: {
        userId: user.id,
        tier,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
