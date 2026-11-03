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
