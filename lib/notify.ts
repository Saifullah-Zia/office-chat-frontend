import { useStore } from "@/lib/store";
import { isDndActive } from "@/lib/preferences";
import { isScreenLocked } from "@/lib/idleLock";
import { showToast } from "@/lib/toast";

/** False while Do Not Disturb (manual pause, quiet hours or a Focus/DND status) is on. */
export function shouldAlert(): boolean {
  return !isDndActive(useStore.getState().userStatus?.text);
}

/** Desktop notification when the tab isn't focused, respecting DND. */
export function desktopNotify(
  title: string,
  body: string,
  opts: { tag?: string; onClick?: () => void; force?: boolean } = {}
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!opts.force && (!shouldAlert() || document.hasFocus())) return;
  // Screen locked for inactivity: don't put message text on a shared PC's screen.
  if (isScreenLocked()) { title = "Office Chat"; body = "You have new activity. Unlock to see it."; }
  try {
    // renotify: a repeat with the same tag pops up again instead of silently replacing the last one.
    const options = { body, tag: opts.tag, ...(opts.tag ? { renotify: true } : {}) } as NotificationOptions;
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  } catch {}
}

/**
 * A new chat message arrived on the open connection. Shown through the service worker, which also shows
 * the server's push for the same message: whichever comes second sees the message id and stays quiet, so
 * it's never lost if the push doesn't come and never shown twice if it does.
 * With the app in front, a pop-up from Windows is out of place: a toast inside the app (toastInApp).
 */
export function messageNotify(
  title: string,
  body: string,
  ids: { conversationId: number; messageId: number },
  opts: { toastInApp?: boolean } = {}
) {
  if (typeof window === "undefined" || !shouldAlert()) return;
  if (document.hasFocus()) {
    if (opts.toastInApp && !isScreenLocked()) showToast(`💬 ${title}: ${body.length > 80 ? body.slice(0, 80) + "…" : body}`);
    return;
  }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const tag = `conv-${ids.conversationId}`;
  const fallback = () => desktopNotify(title, body, { tag, onClick: () => useStore.getState().openChatAt(ids.conversationId, ids.messageId) });
  if (!("serviceWorker" in navigator)) return fallback();
  navigator.serviceWorker.getRegistration()
    .then(async (reg) => {
      if (!reg) return fallback();
      const shown = await reg.getNotifications({ tag });
      if (shown.some((x) => x.data?.messageId === ids.messageId)) return;
      const locked = isScreenLocked();
      await reg.showNotification(locked ? "Office Chat" : title, {
        body: locked ? "You have new activity. Unlock to see it." : body,
        tag,
        renotify: true,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: ids,
      } as NotificationOptions);
    })
    .catch(fallback);
}
