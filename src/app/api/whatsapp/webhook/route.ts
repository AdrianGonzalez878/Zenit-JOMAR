export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { WhatsAppWebhookPayload } from "@/types";
import { Client as QStashClient } from "@upstash/qstash";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verificado por Meta");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const body: WhatsAppWebhookPayload = await request.json();

  const qstash = new QStashClient({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: process.env.QSTASH_URL ?? "https://qstash.upstash.io",
  });

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;

        const messages = change.value.messages;
        if (!messages?.length) continue;

        const incomingPhoneNumberId = change.value.metadata.phone_number_id;
        const jomarPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (!jomarPhoneNumberId || incomingPhoneNumberId !== jomarPhoneNumberId) {
          continue;
        }

        for (const message of messages) {
          if (message.type !== "text") continue;
          if (!message.text?.body?.trim()) continue;

          const customerName =
            change.value.contacts?.[0]?.profile?.name ?? "Cliente";

          await qstash.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/process`,
            body: {
              message,
              customerName,
              phoneNumberId: change.value.metadata.phone_number_id,
            },
          });
        }
      }
    }
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
