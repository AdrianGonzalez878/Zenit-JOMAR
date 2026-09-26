export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Receiver } from "@upstash/qstash";
import { createServiceClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/ai/prompts/system";
import { buildAIMessageHistory } from "@/lib/ai/conversation";
import {
  customerWantsPhotos,
  findLotsForPhotos,
  firstPhotoUrl,
  formatLotsParaIA,
  lotDisplayName,
} from "@/lib/lots/catalog";
import { sendImageMessage, sendTextMessage } from "@/lib/whatsapp/client";
import type { Lot } from "@/types";

interface ProcessPayload {
  message: { id: string; from: string; text: { body: string } };
  customerName: string;
  phoneNumberId: string;
}

async function verifyQStashSignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!signature || !currentSigningKey || !nextSigningKey) return false;

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey,
  });

  try {
    return await receiver.verify({
      signature,
      body: rawBody,
    });
  } catch (error) {
    console.error("QStash signature verification failed:", error);
    return false;
  }
}

async function incrementConversationUnread(
  supabase: ReturnType<typeof createServiceClient>,
  conversation: { id: string; unread_count?: number | null }
) {
  const { error: unreadError } = await supabase.rpc("increment_conversation_unread", {
    conv_id: conversation.id,
  });

  if (unreadError) {
    const { error: fallbackError } = await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count ?? 0) + 1,
      })
      .eq("id", conversation.id);

    if (fallbackError) {
      console.error("Error incrementing unread count:", fallbackError);
    }
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const isValid = await verifyQStashSignature(request, rawBody);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload: ProcessPayload = JSON.parse(rawBody);
  const { message, customerName, phoneNumberId } = payload;
  if (
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID
  ) {
    return NextResponse.json({ status: "ignored_other_number" });
  }
  const assistantName = process.env.NEXT_PUBLIC_ASSISTANT_NAME ?? "ARGI";
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "JOMAR";

  const supabase = createServiceClient();

  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("customer_phone", message.from)
    .single();

  if (!conversation) {
    const { data: newConversation } = await supabase
      .from("conversations")
      .insert({
        customer_phone: message.from,
        customer_name: customerName,
        status: "ai_active",
      })
      .select()
      .single();
    conversation = newConversation;
  }

  if (!conversation) {
    return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });
  }

  const { data: existingMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("whatsapp_message_id", message.id)
    .maybeSingle();

  if (existingMessage) {
    return NextResponse.json({ status: "already_processed" });
  }

  if (conversation.status === "paused") {
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      sender: "customer",
      content: message.text.body,
      whatsapp_message_id: message.id,
    });

    if (insertError) {
      console.error("Error saving paused customer message:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await incrementConversationUnread(supabase, conversation);
    return NextResponse.json({ status: "paused" });
  }

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    sender: "customer",
    content: message.text.body,
    whatsapp_message_id: message.id,
  });

  if (insertError) {
    console.error("Error saving customer message:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await incrementConversationUnread(supabase, conversation);

  const { data: recentHistory } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const history = [...(recentHistory ?? [])].reverse();
  const historyText = history.map((m) => m.content).join("\n");

  const { data: lotsData, error: lotsError } = await supabase
    .from("lots")
    .select("*")
    .order("zone", { ascending: true })
    .order("code", { ascending: true });

  if (lotsError) {
    console.error("Error fetching lots:", lotsError);
  }

  const lots = (lotsData ?? []) as Lot[];
  const lotsContext = formatLotsParaIA(lots);

  const messages = buildAIMessageHistory(history, message.text.body);
  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    system: buildSystemPrompt(lotsContext),
    messages,
  });
  console.log("AI response length:", result.text?.length);

  const aiResponse =
    result.text?.trim() ||
    `Hola, soy ${assistantName}, la asistente virtual de ${businessName}. En este momento tengo problemas para generar una respuesta. Un asesor te contacta en breve.`;

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    sender: "ai",
    content: aiResponse,
  });

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  await sendTextMessage({ to: message.from, message: aiResponse });

  const lotsToPhoto = customerWantsPhotos(message.text.body)
    ? findLotsForPhotos(message.text.body, aiResponse, historyText, lots, 2)
    : [];

  for (const lot of lotsToPhoto) {
    const imageUrl = firstPhotoUrl(lot);
    if (!imageUrl) continue;

    const captionParts = [
      lotDisplayName(lot),
      `Código ${lot.code} · ${lot.zone} · ${lot.area_m2} m²`,
    ];
    if (lot.maps_url) captionParts.push(lot.maps_url);
    const caption = captionParts.join("\n");

    try {
      await sendImageMessage({
        to: message.from,
        imageUrl,
        caption,
      });

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        sender: "ai",
        content: caption,
        media_url: imageUrl,
      });
    } catch (error) {
      console.error("Error sending lot image:", lot.code, error);
    }
  }

  return NextResponse.json({ status: "ok" });
}
