import { apiPost } from "@/lib/api";

/**
 * Bridge to the Android app (Capacitor). The app shows this same website, and adds a small native
 * plugin, "OfficeChat", for what a website can't do: Firebase push that wakes the phone, and a
 * full-screen ringing call screen. In a normal browser none of this runs.
 */

interface OfficeChatPlugin {
  /** The phone's Firebase (FCM) token, for the server to push to. */
  getPushToken(): Promise<{ token: string }>;
  /** Keeps a call (and the microphone) going while the app is in the background. */
  setInCall(options: { inCall: boolean }): Promise<void>;
  getStatus(): Promise<NativeStatus>;
  openAutoStartSettings(): Promise<{ opened: "autostart" | "phone-manager" | "app-info" }>;
  openBatterySettings(): Promise<void>;
}

/** What could stop calls from ringing on this phone (Settings → Phone check). */
export interface NativeStatus {
  notificationsEnabled: boolean;
  batteryUnrestricted: boolean;
  /** When a push last reached this phone (ms; 0 = never), and whether the app was closed then. */
  lastPushAt: number;
  lastPushType: string | null;
  lastPushAppClosed: boolean;
  manufacturer: string;
  model: string;
  android: string;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { OfficeChat?: OfficeChatPlugin };
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
    /** Called by the Android app when it goes to the background / comes back (see socket.ts). */
    __officeChatNativeVisible?: (visible: boolean) => void;
  }
}

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
}

function plugin(): OfficeChatPlugin | null {
  return isNativeApp() ? window.Capacitor?.Plugins?.OfficeChat ?? null : null;
}

let registeredToken: string | null = null;

/** After sign-in: tell the server this phone's push token (calls and messages then reach it). */
export async function registerNativePush(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    const { token } = await p.getPushToken();
    if (!token) return;
    await apiPost("/api/push/native/register", { token, platform: "android" });
    registeredToken = token;
  } catch (err) {
    console.warn("Couldn't register the phone for notifications:", err);
  }
}

/** Phone check (null outside the app, or in an older app version without it). */
export async function getNativeStatus(): Promise<NativeStatus | null> {
  try { return (await plugin()?.getStatus()) ?? null; } catch { return null; }
}
export async function openNativeAutoStart(): Promise<string | null> {
  try { return (await plugin()?.openAutoStartSettings())?.opened ?? null; } catch { return null; }
}
export async function openNativeBattery(): Promise<void> {
  try { await plugin()?.openBatterySettings(); } catch {}
}
/** Ask the server to ring this phone after `delaySeconds` (close the app meanwhile). Returns phones reached. */
export async function sendNativeTest(delaySeconds: number): Promise<number> {
  return (await apiPost<{ phones: number }>("/api/push/native/test", { delaySeconds })).phones;
}

/** A call started or ended (the Android app then shows "call in progress" and keeps it alive). */
export function setNativeInCall(inCall: boolean): void {
  plugin()?.setInCall({ inCall }).catch(() => {});
}

/** On sign-out: stop pushing to this phone (the next person to sign in here gets their own). */
export async function unregisterNativePush(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    const token = registeredToken ?? (await p.getPushToken()).token;
    if (token) await apiPost("/api/push/native/unregister", { token });
  } catch {}
  registeredToken = null;
}
