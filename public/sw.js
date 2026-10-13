const SW_VERSION = "push-1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

async function setBadge(count) {
  const value = Math.max(0, Number(count) || 0);
  try {
    if (value > 0 && self.navigator.setAppBadge) {
      await self.navigator.setAppBadge(value);
      return;
    }
    if (self.navigator.clearAppBadge) {
      await self.navigator.clearAppBadge();
      return;
    }
    if (self.navigator.setAppBadge) {
      await self.navigator.setAppBadge(0);
    }
  } catch {
    // El sistema puede no mostrar badge
  }
}

async function nextBadge(explicit) {
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const current = await self.registration.getNotifications();
  return current.length + 1;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Zenit pto JOMAR";
  const options = {
    body: data.body || "Hay un aviso nuevo en el panel",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "zenit",
    data: {
      url: data.url || "/dashboard",
      conversationId: data.conversationId || null,
    },
    vibrate: [120, 60, 120],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      nextBadge(data.badge).then(setBadge),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  const conversationId = event.notification.data?.conversationId || null;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          client.postMessage({ type: "open-conversation", conversationId, url });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    })
  );
});

void SW_VERSION;
