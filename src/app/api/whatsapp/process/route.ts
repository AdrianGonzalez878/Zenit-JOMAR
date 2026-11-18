export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Client as QStashClient, Receiver } from "@upstash/qstash";
import { createServiceClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/ai/prompts/system";
import { buildAIMessageHistory } from "@/lib/ai/conversation";
import {
  customerWantsCroquis,
  customerWantsDevelopmentPhotos,
  customerWantsLocation,
  customerWantsPhotos,
  findLotsForPhotos,
  firstPhotoUrl,
  formatLotsParaIA,
  lotDisplayName,
  ZENIT_MAPS_URL,
} from "@/lib/lots/catalog";
import { developmentPhotos, officialPlanoUrl } from "@/lib/lots/media";
import { sendImageMessage, sendTextMessage } from "@/lib/whatsapp/client";
import {
  ADVISOR_FALLBACK_REASON,
  type AdvisorNeedReason,
} from "@/lib/ai/needs-advisor";
import { sendTeamPush } from "@/lib/push/send";
import { recordConfirmedCall, takenHourKeys } from "@/lib/crm/schedule-call";
import { callSlotOffer } from "@/lib/ai/office-hours";
import type { Lot } from "@/types";

const REPLY_DELAY_SECONDS = 6;

interface IngestPayload {
  mode?: "ingest";
  message: { id: string; from: string; text: { body: string } };
  customerName: string;
  phoneNumberId: string;
}

interface ReplyPayload {
  mode: "reply";
  phoneNumberId: string;
  conversationId: string;
  replyForMessageId: string;
  customerPhone: string;
  customerName: string;
}

type ProcessPayload = IngestPayload | ReplyPayload;

type ServiceClient = ReturnType<typeof createServiceClient>;

type StoredMessage = {
  role: string;
  sender: string;
  content: string;
  media_url: string | null;
  created_at: string;
  whatsapp_message_id: string | null;
};

function toPlainWhatsApp(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^[\t ]*[•]\s+/gm, "")
    .replace(/^[\t ]*[-–—]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitMediaFollowUp(text: string): { lead: string; followUp: string | null } {
  const blocks = text.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  if (blocks.length >= 2) {
    return { lead: blocks[0], followUp: blocks.slice(1).join("\n\n") };
  }
  const inline = text.match(/^([\s\S]+?[.])\s+(¿[\s\S]+)\s*$/);
  if (inline) {
    return { lead: inline[1].trim(), followUp: inline[2].trim() };
  }
  return { lead: text, followUp: null };
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

async function markNeedsAdvisor(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
  reason: AdvisorNeedReason
) {
  const { error } = await supabase
    .from("conversations")
    .update({
      needs_advisor: true,
      needs_advisor_at: new Date().toISOString(),
      needs_advisor_reason: reason,
    })
    .eq("id", conversationId);

  if (error) {
    console.error("Error marking conversation as needs_advisor:", error);
  }
}

function messagePreview(text: string) {
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

async function notifyTeamOfIncoming(options: {
  conversationId: string;
  customerName: string;
  content: string;
  advisorReason?: string | null;
}) {
  try {
    await sendTeamPush({
      title: options.advisorReason ? "Necesita asesor" : `${options.customerName} respondió`,
      body: options.advisorReason
        ? `${options.customerName}: ${options.advisorReason}`
        : messagePreview(options.content),
      conversationId: options.conversationId,
      tag: options.advisorReason
        ? `advisor-${options.conversationId}`
        : `chat-${options.conversationId}`,
    });
  } catch (error) {
    console.error("Error sending team push:", error);
  }
}

function replyClaimId(whatsappMessageId: string) {
  return `reply:${whatsappMessageId}`;
}

async function scheduleBatchedReply(body: ReplyPayload) {
  const qstash = new QStashClient({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: process.env.QSTASH_URL ?? "https://qstash.upstash.io",
  });
  const deduplicationId = `zenit-reply-${createHash("sha256")
    .update(body.replyForMessageId)
    .digest("hex")
    .slice(0, 32)}`;

  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/process`,
    delay: REPLY_DELAY_SECONDS,
    deduplicationId,
    body,
  });
}

async function burstWasContinued(
  supabase: ServiceClient,
  conversationId: string,
  messageId: string,
  createdAt: string
) {
  const { data: newer } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("sender", "customer")
    .gt("created_at", createdAt)
    .limit(1);

  if (newer?.length) return true;

  const { data: sameMoment } = await supabase
    .from("messages")
    .select("whatsapp_message_id")
    .eq("conversation_id", conversationId)
    .eq("sender", "customer")
    .eq("created_at", createdAt);

  const ids = (sameMoment ?? [])
    .map((row) => row.whatsapp_message_id)
    .filter((id): id is string => Boolean(id))
    .sort();

  return ids.length > 1 && ids[ids.length - 1] !== messageId;
}

function pendingCustomerTurn(rows: StoredMessage[]) {
  let lastStaff = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.sender === "ai" || row.sender === "admin" || row.role === "assistant") {
      lastStaff = index;
    }
  }

  const prior = rows.slice(0, lastStaff + 1).filter((row) => !row.media_url && row.content?.trim());
  const pending = rows
    .slice(lastStaff + 1)
    .filter((row) => row.sender === "customer" && row.content?.trim() && !row.whatsapp_message_id?.startsWith("reply:"))
    .map((row) => row.content.trim())
    .filter((text, index, all) => index === 0 || text !== all[index - 1]);

  return {
    prior,
    customerText: pending.join("\n"),
  };
}

async function replyToCustomer(supabase: ServiceClient, payload: ReplyPayload) {
  const assistantName = process.env.NEXT_PUBLIC_ASSISTANT_NAME ?? "Jomarcito";
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "JOMAR";

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", payload.conversationId)
    .single();

  if (!conversation || conversation.status === "paused") {
    return NextResponse.json({ status: conversation ? "paused" : "missing_conversation" });
  }

  const { data: target } = await supabase
    .from("messages")
    .select("created_at, whatsapp_message_id")
    .eq("conversation_id", conversation.id)
    .eq("whatsapp_message_id", payload.replyForMessageId)
    .maybeSingle();

  if (!target?.created_at) {
    return NextResponse.json({ error: "Message not saved yet" }, { status: 500 });
  }

  if (await burstWasContinued(supabase, conversation.id, payload.replyForMessageId, target.created_at)) {
    return NextResponse.json({ status: "superseded" });
  }

  const { data: recentHistory } = await supabase
    .from("messages")
    .select("role, sender, content, media_url, created_at, whatsapp_message_id")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .order("whatsapp_message_id", { ascending: false })
    .limit(30);

  const rows = [...(recentHistory ?? [])].reverse() as StoredMessage[];
  const { prior, customerText } = pendingCustomerTurn(rows);
  if (!customerText.trim()) {
    return NextResponse.json({ status: "empty" });
  }

  const historyText = prior.map((row) => row.content).join("\n");
  const { data: lotsData, error: lotsError } = await supabase
    .from("lots")
    .select("*")
    .order("zone", { ascending: true })
    .order("code", { ascending: true });

  if (lotsError) console.error("Error fetching lots:", lotsError);

  const lots = (lotsData ?? []) as Lot[];
  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    system: buildSystemPrompt(
      formatLotsParaIA(lots),
      conversation.customer_name || payload.customerName,
      callSlotOffer(new Date(), await takenHourKeys(supabase, conversation.id))
    ),
    messages: buildAIMessageHistory(prior, customerText),
  });

  if (await burstWasContinued(supabase, conversation.id, payload.replyForMessageId, target.created_at)) {
    return NextResponse.json({ status: "superseded" });
  }

  const generated = result.text?.trim();
  const usedFallback = !generated;
  const aiResponse = toPlainWhatsApp(
    generated ||
      `Hola, soy ${assistantName}, el asistente virtual de ${businessName}. En este momento tengo problemas para generar una respuesta. Un asesor te contacta en breve.`
  );

  if (usedFallback && !conversation.needs_advisor) {
    await markNeedsAdvisor(supabase, conversation.id, ADVISOR_FALLBACK_REASON);
  }

  const callConfirmed = await recordConfirmedCall(supabase, {
    business: "zenit",
    conversationId: conversation.id,
    customerName: conversation.customer_name || payload.customerName || null,
    customerPhone: conversation.customer_phone,
    customerText,
    assistantText: aiResponse,
    advisorName: "Asesor JOMAR",
  });

  if (callConfirmed && !conversation.needs_advisor && !usedFallback) {
    await markNeedsAdvisor(supabase, conversation.id, "Quiere llamada o visita");
  }

  if (usedFallback || callConfirmed) {
    await notifyTeamOfIncoming({
      conversationId: conversation.id,
      customerName: conversation.customer_name || payload.customerName || conversation.customer_phone,
      content: customerText,
      advisorReason: usedFallback ? ADVISOR_FALLBACK_REASON : "Quiere llamada o visita",
    });
  }

  const wantsAttachment =
    customerWantsDevelopmentPhotos(customerText) ||
    customerWantsCroquis(customerText) ||
    customerWantsLocation(customerText);
  const split = wantsAttachment ? splitMediaFollowUp(aiResponse) : { lead: aiResponse, followUp: null };
  let outbound = split.lead;
  if (customerWantsLocation(customerText) && !/google\.com\/maps|maps\.app\.goo\.gl/i.test(outbound)) {
    outbound = `${outbound}\n\n${ZENIT_MAPS_URL}`;
  }

  const claimId = replyClaimId(payload.replyForMessageId);
  const { error: claimError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    sender: "ai",
    content: outbound,
    whatsapp_message_id: claimId,
  });

  if (claimError) {
    if (claimError.code === "23505") {
      return NextResponse.json({ status: "already_replied" });
    }
    console.error("Error saving assistant message:", claimError);
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (await burstWasContinued(supabase, conversation.id, payload.replyForMessageId, target.created_at)) {
    await supabase.from("messages").delete().eq("whatsapp_message_id", claimId);
    return NextResponse.json({ status: "superseded" });
  }

  try {
    await sendTextMessage({ to: payload.customerPhone, message: outbound });
  } catch (error) {
    console.error("Error sending WhatsApp reply:", error);
    await supabase.from("messages").delete().eq("whatsapp_message_id", claimId);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  if (customerWantsDevelopmentPhotos(customerText)) {
    for (const photo of developmentPhotos()) {
      try {
        await sendImageMessage({ to: payload.customerPhone, imageUrl: photo.url });
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          sender: "ai",
          content: "Foto",
          media_url: photo.url,
        });
      } catch (error) {
        console.error("Error sending development photo:", photo.url, error);
      }
    }
  }

  if (customerWantsCroquis(customerText)) {
    try {
      await sendImageMessage({ to: payload.customerPhone, imageUrl: officialPlanoUrl() });
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        sender: "ai",
        content: "Plano",
        media_url: officialPlanoUrl(),
      });
    } catch (error) {
      console.error("Error sending croquis:", error);
    }
  }

  const lotsToPhoto =
    customerWantsPhotos(customerText) && !customerWantsDevelopmentPhotos(customerText)
      ? findLotsForPhotos(customerText, aiResponse, historyText, lots, 2)
      : [];

  for (const lot of lotsToPhoto) {
    const imageUrl = firstPhotoUrl(lot);
    if (!imageUrl) continue;
    const caption = [
      lotDisplayName(lot),
      `Código ${lot.code} · ${lot.zone} · ${lot.area_m2} m²`,
      lot.maps_url,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await sendImageMessage({ to: payload.customerPhone, imageUrl, caption });
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

  if (split.followUp) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      sender: "ai",
      content: split.followUp,
    });
    try {
      await sendTextMessage({ to: payload.customerPhone, message: split.followUp });
    } catch (error) {
      console.error("Error sending follow-up:", error);
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function ingestCustomerMessage(supabase: ServiceClient, payload: IngestPayload) {
  const { message, customerName } = payload;

  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("customer_phone", message.from)
    .maybeSingle();

  if (!conversation) {
    const { data: created } = await supabase
      .from("conversations")
      .insert({
        customer_phone: message.from,
        customer_name: customerName,
        status: "ai_active",
      })
      .select()
      .single();
    conversation = created;
  }

  if (!conversation) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_phone", message.from)
      .maybeSingle();
    conversation = existing;
  }

  if (!conversation) {
    return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });
  }

  const { data: existingMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("whatsapp_message_id", message.id)
    .maybeSingle();

  let saved = !existingMessage;
  if (!existingMessage) {
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      sender: "customer",
      content: message.text.body,
      whatsapp_message_id: message.id,
    });

    if (insertError && insertError.code !== "23505") {
      console.error("Error saving customer message:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    saved = !insertError;
  }

  if (saved) {
    await incrementConversationUnread(supabase, conversation);
    await notifyTeamOfIncoming({
      conversationId: conversation.id,
      customerName: conversation.customer_name || customerName || conversation.customer_phone,
      content: message.text.body,
      advisorReason: conversation.needs_advisor ? conversation.needs_advisor_reason : null,
    });
  }

  if (conversation.status === "paused") {
    return NextResponse.json({ status: "paused" });
  }

  try {
    await scheduleBatchedReply({
      mode: "reply",
      phoneNumberId: payload.phoneNumberId,
      conversationId: conversation.id,
      replyForMessageId: message.id,
      customerPhone: message.from,
      customerName: conversation.customer_name || customerName || "Cliente",
    });
  } catch (error) {
    console.error("Error scheduling batched reply:", error);
    return NextResponse.json({ error: "Could not schedule reply" }, { status: 500 });
  }

  return NextResponse.json({ status: saved ? "queued" : "already_queued" });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const isValid = await verifyQStashSignature(request, rawBody);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as ProcessPayload;
  if (
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    payload.phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID
  ) {
    return NextResponse.json({ status: "ignored_other_number" });
  }

  const supabase = createServiceClient();
  if (payload.mode === "reply") {
    return replyToCustomer(supabase, payload);
  }
  return ingestCustomerMessage(supabase, payload);
}
