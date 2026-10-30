import { useStore } from "@/lib/store";
import { isDndActive } from "@/lib/preferences";

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
  try {
    const n = new Notification(title, { body, tag: opts.tag });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  } catch {}
}
