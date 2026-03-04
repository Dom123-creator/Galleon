import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  cancelSubscription,
  resumeSubscription,
  updateSubscription,
} from "@/lib/stripe";
import { subscriptionActionSchema } from "@/lib/validations";

// Get current user's subscription status
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      tier: user.subscriptionTier,
      status: user.subscriptionStatus,
      subscription: user.subscription
        ? {
            id: user.subscription.id,
            tier: user.subscription.tier,
            status: user.subscription.status,
            currentPeriodEnd: user.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
            trialEnd: user.subscription.trialEnd,
          }
        : null,
      usage: {
        missionsUsedThisMonth: user.monthlyMissionsUsed,
        limit: user.subscriptionTier === "ANALYST" ? 5 : null,
      },
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    return NextResponse.json(
      { error: "Failed to get subscription" },
      { status: 500 }
    );
  }
}

// Update subscription (cancel, resume, upgrade, downgrade)
export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validation = subscriptionActionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { action, newPriceId } = validation.data;

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

    if (!user.subscription) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    const subscriptionId = user.subscription.stripeSubscriptionId;

    switch (action) {
      case "cancel":
        await cancelSubscription(subscriptionId);
        await db.subscription.update({
          where: { id: user.subscription.id },
          data: { cancelAtPeriodEnd: true },
        });
        return NextResponse.json({
          message: "Subscription will be canceled at the end of the billing period",
        });

      case "resume":
        await resumeSubscription(subscriptionId);
        await db.subscription.update({
          where: { id: user.subscription.id },
          data: { cancelAtPeriodEnd: false },
        });
        return NextResponse.json({
          message: "Subscription has been resumed",
        });

      case "upgrade":
      case "downgrade":
        if (!newPriceId) {
          return NextResponse.json(
            { error: "New price ID required for plan change" },
            { status: 400 }
          );
        }
        await updateSubscription(subscriptionId, newPriceId);
        return NextResponse.json({
          message: `Subscription ${action}d successfully`,
        });

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Update subscription error:", error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
