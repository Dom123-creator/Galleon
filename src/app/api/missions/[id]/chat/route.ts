import { NextResponse } from "next/server";
import { getAuthUserId as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatMessageSchema } from "@/lib/validations";
import { createAgentCompletion } from "@/lib/anthropic";
import { executeToolCall } from "@/lib/agents/tools";
import type Anthropic from "@anthropic-ai/sdk";

const MAX_TOOL_ROUNDS = 5;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const user = await db.user.findUnique({ where: { clerkId: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await params;
    const mission = await db.mission.findFirst({
      where: { id, userId: user.id },
      include: { deal: true },
    });
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    const body = await req.json();
    const validation = chatMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }

    // Save user message
    await db.chatMessage.create({
      data: {
        missionId: id,
        role: "user",
        content: validation.data.content,
      },
    });

    // Load conversation history
    const history = await db.chatMessage.findMany({
      where: { missionId: id },
      orderBy: { createdAt: "asc" },
      take: 50, // cap history to avoid token overflow
    });

    // Build messages for Claude
    const messages: Anthropic.MessageParam[] = [];

    // Add mission context as first user message
    const contextParts = [`Mission: ${mission.objective}`];
    if (mission.deal) {
      contextParts.push(`Deal: ${mission.deal.name} (${mission.deal.borrowerName || "unknown borrower"})`);
    }
    if (mission.summary) {
      contextParts.push(`Current Summary: ${mission.summary}`);
    }

    // Convert chat history to Claude message format
    for (const msg of history) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        messages.push({ role: "assistant", content: msg.content });
      }
      // System messages from agents are included as assistant context
      else if (msg.role === "system") {
        messages.push({ role: "assistant", content: `[Agent Update] ${msg.content}` });
      }
    }

    // Ensure messages alternate properly - if first message isn't user, prepend context
    if (messages.length === 0 || messages[0].role !== "user") {
      messages.unshift({ role: "user", content: contextParts.join("\n") });
    }

    // If no ANTHROPIC_API_KEY, return a helpful fallback
    if (!process.env.ANTHROPIC_API_KEY) {
      const fallback = `I'm the Galleon assistant. I can see your mission "${mission.objective}" but I need an ANTHROPIC_API_KEY to provide AI-powered responses. Set it in your .env file to enable interactive chat.`;

      const assistantMsg = await db.chatMessage.create({
        data: {
          missionId: id,
          role: "assistant",
          content: fallback,
        },
      });

      return NextResponse.json(assistantMsg, { status: 201 });
    }

    // Call Master agent with conversation
    const context = {
      missionId: id,
      dealId: mission.dealId || undefined,
      userId: user.id,
    };

    let response = await createAgentCompletion("MASTER", messages);
    let rounds = 0;

    // Process tool calls in a loop
    while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeToolCall(
            block.name,
            block.input as Record<string, unknown>,
            context
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result.content,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
      response = await createAgentCompletion("MASTER", messages);
    }

    // Extract text response
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        responseText += block.text;
      }
    }

    if (!responseText) {
      responseText = "I've processed your request. Is there anything else you'd like to know about this mission?";
    }

    // Save assistant response
    const assistantMsg = await db.chatMessage.create({
      data: {
        missionId: id,
        role: "assistant",
        content: responseText,
      },
    });

    return NextResponse.json(assistantMsg, { status: 201 });
  } catch (error) {
    console.error("Chat message error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
