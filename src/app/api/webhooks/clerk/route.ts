import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

// Clerk webhook handler for user sync
export async function POST(req: Request) {
  // Get the headers
  const headersList = await headers();
  const svixId = headersList.get("svix-id");
  const svixTimestamp = headersList.get("svix-timestamp");
  const svixSignature = headersList.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    );
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify webhook signature
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const wh = new Webhook(webhookSecret);
  let event: WebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  // Handle the event
  const eventType = event.type;

  try {
    switch (eventType) {
      case "user.created":
        await handleUserCreated(event.data);
        break;

      case "user.updated":
        await handleUserUpdated(event.data);
        break;

      case "user.deleted":
        await handleUserDeleted(event.data);
        break;

      default:
        console.log(`Unhandled Clerk event type: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Error processing Clerk webhook ${eventType}:`, error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Type for Clerk user data
interface ClerkUserData {
  id: string;
  email_addresses: { email_address: string; id: string }[];
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

async function handleUserCreated(data: ClerkUserData) {
  const email = data.email_addresses[0]?.email_address;

  if (!email) {
    console.error("No email found for user:", data.id);
    return;
  }

  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

  // Create user in database
  const user = await db.user.create({
    data: {
      clerkId: data.id,
      email,
      name,
      imageUrl: data.image_url,
    },
  });

  // Send welcome email
  try {
    await sendWelcomeEmail(email, name || undefined);
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    // Don't fail the webhook if email fails
  }

  // Update daily metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.dailyMetrics.upsert({
    where: { date: today },
    create: { date: today, newUsers: 1 },
    update: { newUsers: { increment: 1 } },
  });

  console.log(`User created in database: ${user.id}`);
}

async function handleUserUpdated(data: ClerkUserData) {
  const email = data.email_addresses[0]?.email_address;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

  await db.user.update({
    where: { clerkId: data.id },
    data: {
      email: email || undefined,
      name,
      imageUrl: data.image_url,
    },
  });

  console.log(`User updated: ${data.id}`);
}

async function handleUserDeleted(data: { id?: string }) {
  if (!data.id) return;

  // Delete user and cascade related records
  await db.user.delete({
    where: { clerkId: data.id },
  });

  console.log(`User deleted: ${data.id}`);
}
