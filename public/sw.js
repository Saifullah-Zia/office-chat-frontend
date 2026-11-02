/*
 * Office Chat service worker.
 * - Never caches API calls, websockets or file downloads (always live, always authorised).
 * - Static build assets: cache-first (their URLs are content-hashed).
 * - Pages: network-first, falling back to the last cached copy, then an offline page.
 * - Push: shows new-message notifications while the app is closed; tapping one opens the chat.
 * Registered as /sw.js?dev=1 in development: caching is off there so builds are never stale.
 */
const VERSION = "v1";
const STATIC_CACHE = `office-chat-static-${VERSION}`;
const PAGE_CACHE = `office-chat-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";

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

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { conversationId, messageId } = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        client.postMessage({ type: "open-chat", conversationId, messageId });
        return client.focus();
      }
      const query = conversationId ? `/?chat=${conversationId}${messageId ? `&message=${messageId}` : ""}` : "/";
      return self.clients.openWindow(query);
    })
  );
});
