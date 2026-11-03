import type { NativeStatus } from "@/lib/native";

/**
 * Is this phone ready to ring while the app is closed? Shared by Settings → Phone check and the
 * reminder bar (PhoneReadyBanner).
 */

const CONFIRMED_KEY = "office-chat-phone-confirmed";

/** Brands that block closed apps unless "auto-start" is allowed in their own settings. */
export function needsAutoStart(status: NativeStatus | null): boolean {
  return /infinix|tecno|itel|xiaomi|redmi|poco|oppo|realme|oneplus|vivo|iqoo|huawei|honor/.test(status?.manufacturer?.toLowerCase() ?? "");
}

/** A push arrived while the app was closed at least once: proven to work on this phone. */
export function isConfirmed(status: NativeStatus | null): boolean {
  let saved = false;
  try { saved = localStorage.getItem(CONFIRMED_KEY) === "1"; } catch {}
  if (!saved && status?.lastPushAt && status.lastPushAppClosed) {
    try { localStorage.setItem(CONFIRMED_KEY, "1"); } catch {}
    return true;
  }
  return saved;
}

/** True when nothing is known to stop calls from ringing with the app closed. */
export function phoneReady(status: NativeStatus | null): boolean {
  if (!status) return true; // not the Android app
  if (!status.notificationsEnabled || status.hasPushToken === false || !status.batteryUnrestricted) return false;
  return isConfirmed(status) || !needsAutoStart(status);
}

/** The exact steps for this phone's brand (menu names differ a little between versions). */
export function brandTips(status: NativeStatus | null): string | null {
  const b = status?.manufacturer?.toLowerCase() ?? "";
  if (/samsung/.test(b)) {
    return "Samsung: Settings → Battery → Background usage limits → Never sleeping apps → add Office Chat. Also App info → Battery → Unrestricted.";
  }
  if (/xiaomi|redmi|poco/.test(b)) {
    return "Xiaomi: App info → Autostart ON, and Battery saver → No restrictions. In Recents, long-press Office Chat → 🔒 Lock.";
  }
  if (/oppo|realme|oneplus/.test(b)) {
    return "Oppo / Realme / OnePlus: App info → Battery → Allow background activity, and Allow auto launch. In Recents, lock Office Chat 🔒.";
  }
  if (/vivo|iqoo/.test(b)) {
    return "Vivo: i Manager → App manager → Autostart → Office Chat ON. Battery → Background power consumption → Allow.";
  }
  if (/infinix|tecno|itel/.test(b)) {
    return "Infinix / Tecno / itel: Phone Master → Auto-start Management → Office Chat ON, and Phone Master → Protected apps → Office Chat.";
  }
  if (/huawei|honor/.test(b)) {
    return "Huawei / Honor: Phone Manager → App launch → Office Chat → Manage manually → turn all three ON. (Phones without Google services can't receive calls while closed.)";
  }
  return null;
}
