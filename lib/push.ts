import { apiGet, apiPost } from "@/lib/api";

/**
 * Web Push: notifications for new messages while the app is closed.
 * The service worker (public/sw.js) shows them; the server sends them only to members who are offline.
 */

const OPT_OUT_KEY = "office-chat-push-off";

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The user switched push off in Settings (kept per browser). */
export function pushOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === "1"; } catch { return false; }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission if needed, subscribe this browser and register it with the server. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await apiGet<{ key: string }>("/api/push/vapid-public-key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
  }
  await apiPost("/api/push/subscribe", sub.toJSON());
  try { localStorage.removeItem(OPT_OUT_KEY); } catch {}
  return true;
}

/** Stop push for this browser (on logout, or when switched off in Settings). */
export async function disablePush(optOut = true): Promise<void> {
  if (optOut) {
    try { localStorage.setItem(OPT_OUT_KEY, "1"); } catch {}
  }
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await apiPost("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** On app start: keep this browser's subscription registered if the user already allowed notifications. */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || pushOptedOut() || Notification.permission !== "granted") return;
  await enablePush().catch(() => {});
}
