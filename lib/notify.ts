import { useStore } from "@/lib/store";
import { isDndActive } from "@/lib/preferences";
import { isScreenLocked } from "@/lib/idleLock";

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
    const n = new Notification(title, { body, tag: opts.tag });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  } catch {}
}
