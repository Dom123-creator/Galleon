import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userSettingsSchema } from "@/lib/validations";

// Get user settings
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
      select: {
        name: true,
        email: true,
        emailNotifications: true,
        newContentAlerts: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json(
      { error: "Failed to get settings" },
      { status: 500 }
    );
  }
}

// Update user settings
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
    const validation = userSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, emailNotifications, newContentAlerts } = validation.data;

    const user = await db.user.update({
      where: { clerkId: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(newContentAlerts !== undefined && { newContentAlerts }),
      },
      select: {
        name: true,
        email: true,
        emailNotifications: true,
        newContentAlerts: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
