function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function canUseWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function subscribeWebPush(): Promise<{ ok: boolean; error?: string }> {
  if (!canUseWebPush()) {
    return { ok: false, error: "Este navegador no admite avisos con la app cerrada." };
  }

  const registration = await navigator.serviceWorker.ready;
  const vapidRes = await fetch("/api/push/vapid");
  if (!vapidRes.ok) {
    return { ok: false, error: "Faltan las claves de avisos en el servidor." };
  }
  const { publicKey } = (await vapidRes.json()) as { publicKey?: string };
  if (!publicKey) {
    return { ok: false, error: "Falta la clave pública de avisos." };
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Hay que permitir notificaciones en el teléfono." };
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string; sql?: boolean } | null;
    return {
      ok: false,
      error: data?.error ?? "No se pudo guardar la suscripción.",
    };
  }

  return { ok: true };
}
