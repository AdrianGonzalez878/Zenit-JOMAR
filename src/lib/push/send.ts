import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

export type TeamPushPayload = {
  title: string;
  body: string;
  conversationId: string;
  tag?: string;
  badge?: number;
};

async function unreadBadgeCount(
  supabase: ReturnType<typeof createServiceClient>
) {
  const { data, error } = await supabase
    .from("conversations")
    .select("unread_count");
  if (error) {
    console.error("Error counting unread for badge:", error.message);
    return 1;
  }
  const total = (data ?? []).reduce(
    (sum, row) => sum + (row.unread_count ?? 0),
    0
  );
  return Math.max(1, total);
}

function vapidConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY
  );
}

function configureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "https://zenit-jomar.vercel.app",
    publicKey,
    privateKey
  );
  return true;
}

export async function sendTeamPush(payload: TeamPushPayload) {
  if (!vapidConfigured() || !configureVapid()) return { sent: 0 };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("Error reading push subscriptions:", error.message);
    return { sent: 0 };
  }

  const subscriptions = data ?? [];
  if (subscriptions.length === 0) return { sent: 0 };

  const badge = payload.badge ?? (await unreadBadgeCount(supabase));
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    conversationId: payload.conversationId,
    url: `/dashboard?c=${payload.conversationId}`,
    tag: payload.tag ?? `chat-${payload.conversationId}`,
    badge,
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          { TTL: 60 * 60 }
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", row.id);
        } else {
          console.error("Web push failed:", status ?? err);
        }
      }
    })
  );

  return { sent };
}

export async function sendUserPush(userId: string, payload: TeamPushPayload) {
  if (!vapidConfigured() || !configureVapid()) return { sent: 0 };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error("Error reading user push subscriptions:", error.message);
    return { sent: 0 };
  }

  const badge = payload.badge ?? 1;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    conversationId: payload.conversationId,
    url: payload.conversationId ? `/dashboard?c=${payload.conversationId}` : "/dashboard",
    tag: payload.tag ?? "test",
    badge,
  });

  let sent = 0;
  for (const row of data ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
        { TTL: 60 * 60 }
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      } else {
        console.error("Web push failed:", status ?? err);
      }
    }
  }

  return { sent };
}
