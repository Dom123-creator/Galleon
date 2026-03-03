import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { chatMessageSchema } from "@/lib/validations";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const mission = await db.mission.findFirst({ where: { id, userId: user.id } });
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    const body = await req.json();
    const validation = chatMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    // Save user message
    const userMessage = await db.chatMessage.create({
      data: {
        missionId: id,
        role: "user",
        content: validation.data.content,
      },
    });

    // For interactive mode, we could process the message through the agent here
    // For now, acknowledge receipt
    return NextResponse.json(userMessage, { status: 201 });
  } catch (error) {
    console.error("Chat message error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
