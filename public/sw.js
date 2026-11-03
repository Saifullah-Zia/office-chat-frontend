/*
 * Office Chat service worker.
 * - Never caches API calls, websockets or file downloads (always live, always authorised).
 * - Static build assets: cache-first (their URLs are content-hashed).
 * - Pages: network-first, falling back to the last cached copy, then an offline page.
 * - Push: shows new-message notifications while the app is closed; tapping one opens the chat.
 * - Calls: a ringing notification with Answer / Decline. The server re-sends it every few seconds (so the
 *   phone keeps sounding and vibrating) and finally clears it, or turns it into "Missed call".
 * Registered as /sw.js?dev=1 in development: caching is off there so builds are never stale.
 * ?api=<backend URL> tells it where to send "Decline" (it has no other way to know).
 */
const VERSION = "v1";
const STATIC_CACHE = `office-chat-static-${VERSION}`;
const PAGE_CACHE = `office-chat-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const SW_PARAMS = new URL(self.location.href).searchParams;
const DEV = SW_PARAMS.get("dev") === "1";
const API_BASE = (SW_PARAMS.get("api") || "").replace(/\/+$/, "");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png", "/icon-512.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("office-chat-") && k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (DEV) return;
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Only handle our own origin; API/websocket traffic goes to the backend origin and is left alone.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }))
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL)))
    );
  }
});

// ── Push notifications ─────────────────────────────────────────────────

/** Is the app open and on screen? Then it rings / notifies by itself. */
function appVisible() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => clients.some((c) => c.visibilityState === "visible" || c.focused));
}

function closeByTag(tag) {
  return self.registration.getNotifications({ tag }).then((list) => list.forEach((n) => n.close()));
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }

  // Incoming call: ring like a phone call. Each re-sent push sounds and vibrates again.
  if (data.type === "call") {
    event.waitUntil(appVisible().then((visible) => {
      if (visible) return;
      return self.registration.showNotification(data.title || "Incoming call", {
        body: data.body || "",
        tag: data.tag,
        renotify: true,
        requireInteraction: true, // stays until answered, declined or cleared
        vibrate: [800, 400, 800, 400, 800],
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        timestamp: Date.now(),
        actions: [
          { action: "answer", title: "✅ Answer" },
          { action: "decline", title: "❌ Decline" },
        ],
        data: { kind: "call", ...data },
      });
    }));
    return;
  }

  // Call answered elsewhere, declined, cancelled or timed out: stop ringing (and say "Missed call").
  if (data.type === "call-cancel") {
    event.waitUntil(closeByTag(data.tag).then(() => appVisible()).then((visible) => {
      if (!data.missed || visible) return;
      return self.registration.showNotification(data.title || "Missed call", {
        body: data.body || "",
        tag: "missed-" + data.conversationId,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { conversationId: data.conversationId },
      });
    }));
    return;
  }

  const title = data.title || "Office Chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // The server only pushes when we look offline; skip it anyway if a window is open and focused.
      if (clients.some((c) => c.focused)) return;
      return self.registration.showNotification(title, {
        body: data.body || "",
        tag: data.tag,
        renotify: !!data.tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { conversationId: data.conversationId, messageId: data.messageId },
      });
    })
  );
});

/**
 * Bring the app to the front at `url`. With reload (calls), an open window is sent to that address
 * instead of only being messaged: a phone freezes pages in the background, and a frozen page never
 * reads the message (tapping "Answer" then did nothing). No window open: opens the installed app.
 */
function openApp(message, url, reload) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
    if (!client) return self.clients.openWindow(url);
    return client.focus()
      .then((focused) => {
        const w = focused || client;
        if (reload && typeof w.navigate === "function") {
          return w.navigate(url).catch(() => { w.postMessage(message); });
        }
        w.postMessage(message);
      })
      .catch(() => self.clients.openWindow(url));
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (data.kind === "call") {
    if (event.action === "decline") {
      // Decline without opening the app (the push carries a token for just this call).
      if (API_BASE && data.callId && data.declineToken) {
        event.waitUntil(fetch(API_BASE + "/api/calls/" + data.callId + "/push-decline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.toUserId, token: data.declineToken }),
        }).catch(() => {}));
      }
      return;
    }
    // "Answer" joins straight away; tapping the notification itself opens the ringing screen.
    const answer = event.action === "answer";
    const param = answer ? "answer" : "ringing";
    event.waitUntil(openApp(
      { type: "call-action", callId: data.callId, conversationId: data.conversationId, answer },
      "/?" + param + "=" + (data.callId || "") + "&conv=" + data.conversationId,
      true,
    ));
    return;
  }

  const { conversationId, messageId } = data;
  const query = conversationId ? "/?chat=" + conversationId + (messageId ? "&message=" + messageId : "") : "/";
  event.waitUntil(openApp({ type: "open-chat", conversationId, messageId }, query));
});
