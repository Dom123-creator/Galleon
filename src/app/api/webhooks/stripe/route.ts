import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, mapStripeStatus, mapPriceToTier } from "@/lib/stripe";
import {
  sendPaymentConfirmationEmail,
  sendPaymentFailedEmail,
} from "@/lib/email";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${errorMessage}`);
    return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 });
  }

  const existingEvent = await db.webhookEvent.findUnique({
    where: { stripeEventId: event.id },
  });

  if (existingEvent?.processed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  await db.webhookEvent.upsert({
    where: { stripeEventId: event.id },
    create: { stripeEventId: event.id, eventType: event.type, payload: event.data.object as object },
    update: {},
  });

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    await db.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: { processed: true, processedAt: new Date() },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook ${event.type}:`, error);
    await db.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const productId = subscription.items.data[0]?.price.product as string;

  const user = await db.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) { console.error(`No user found for Stripe customer: ${customerId}`); return; }

  const tier = mapPriceToTier(priceId);
  const status = mapStripeStatus(subscription.status);

  const sub = subscription as unknown as Record<string, unknown>;
  const periodStart = new Date((sub.current_period_start as number) * 1000);
  const periodEnd = new Date((sub.current_period_end as number) * 1000);

  await db.subscription.create({
    data: {
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeProductId: productId,
      tier: tier as "ANALYST" | "PROFESSIONAL" | "ENTERPRISE",
      status: status as "ACTIVE" | "TRIALING",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
  });

  await db.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: tier as "ANALYST" | "PROFESSIONAL" | "ENTERPRISE",
      subscriptionStatus: status as "ACTIVE" | "TRIALING",
      role: tier === "ENTERPRISE" ? "ENTERPRISE" : "PROFESSIONAL",
    },
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const existingSubscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    include: { user: true },
  });
  if (!existingSubscription) return;

  const priceId = subscription.items.data[0]?.price.id;
  const tier = mapPriceToTier(priceId);
  const status = mapStripeStatus(subscription.status);

  const sub = subscription as unknown as Record<string, unknown>;
  const periodStart = new Date((sub.current_period_start as number) * 1000);
  const periodEnd = new Date((sub.current_period_end as number) * 1000);

  await db.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      stripePriceId: priceId,
      tier: tier as "ANALYST" | "PROFESSIONAL" | "ENTERPRISE",
      status: status as "ACTIVE" | "PAST_DUE" | "CANCELED",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    },
  });

  await db.user.update({
    where: { id: existingSubscription.userId },
    data: {
      subscriptionTier: subscription.status === "canceled" ? "ANALYST" : tier as "ANALYST" | "PROFESSIONAL" | "ENTERPRISE",
      subscriptionStatus: status as "ACTIVE" | "PAST_DUE" | "CANCELED",
      role: subscription.status === "canceled" ? "ANALYST" : tier === "ENTERPRISE" ? "ENTERPRISE" : "PROFESSIONAL",
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const existingSubscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    include: { user: true },
  });
  if (!existingSubscription) return;

  await db.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });

  await db.user.update({
    where: { id: existingSubscription.userId },
    data: { subscriptionTier: "ANALYST", subscriptionStatus: "CANCELED", role: "ANALYST" },
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const inv = invoice as unknown as Record<string, unknown>;
  const subscriptionId = inv.subscription as string | null;
  if (!subscriptionId) return;

  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: { user: true },
  });
  if (!subscription?.user) return;

  await sendPaymentConfirmationEmail(
    subscription.user.email,
    subscription.user.name || undefined,
    subscription.tier,
    invoice.amount_paid || 0,
    subscription.currentPeriodEnd
  );
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const inv = invoice as unknown as Record<string, unknown>;
  const subscriptionId = inv.subscription as string | null;
  if (!subscriptionId) return;

  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: { user: true },
  });
  if (!subscription?.user) return;

  await db.subscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: { status: "PAST_DUE" },
  });

  await db.user.update({
    where: { id: subscription.userId },
    data: { subscriptionStatus: "PAST_DUE" },
  });

  const retryDate = new Date();
  retryDate.setDate(retryDate.getDate() + 3);

  await sendPaymentFailedEmail(subscription.user.email, subscription.user.name || undefined, retryDate);
}
