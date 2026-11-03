import { apiPost } from "@/lib/api";

/**
 * Bridge to the Android app. The app shows this same website and adds what a website can't do:
 * Firebase push that wakes the phone, and a full-screen ringing call screen. In a normal browser
 * none of this runs.
 *
 * The app puts window.OfficeChatAndroid into the page directly (always there). Capacitor's own
 * bridge (window.Capacitor) is used only as a fallback: it's missing when the site's service
 * worker serves the page, which is what hid all of this at first.
 */

/** window.OfficeChatAndroid (WebBridge.java): plain synchronous calls; JSON comes back as text. */
interface AndroidBridge {
  getPushToken(): string;
  setInCall(inCall: boolean): void;
  getStatus(): string;
  openAutoStartSettings(): string;
  openBatterySettings(): void;
  openAppInfo?(): void;
}

interface OfficeChatPlugin {
  getPushToken(): Promise<{ token: string }>;
  setInCall(options: { inCall: boolean }): Promise<void>;
  getStatus(): Promise<NativeStatus>;
  openAutoStartSettings(): Promise<{ opened: string }>;
  openBatterySettings(): Promise<void>;
}

/** What could stop calls from ringing on this phone (Settings → Phone check). */
export interface NativeStatus {
  notificationsEnabled: boolean;
  batteryUnrestricted: boolean;
  /** The phone has its Firebase token (needed before the server can wake it). */
  hasPushToken?: boolean;
  /** When a push last reached this phone (ms; 0 = never), and whether the app was closed then. */
  lastPushAt: number;
  lastPushType: string | null;
  lastPushAppClosed: boolean;
  manufacturer: string;
  model: string;
  android: string;
  appVersion?: string;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { OfficeChat?: OfficeChatPlugin };
}

declare global {
  interface Window {
    OfficeChatAndroid?: AndroidBridge;
    Capacitor?: CapacitorGlobal;
    /** Called by the Android app when it goes to the background / comes back (see socket.ts). */
    __officeChatNativeVisible?: (visible: boolean) => void;
  }
}

function bridge(): AndroidBridge | null {
  return typeof window !== "undefined" ? window.OfficeChatAndroid ?? null : null;
}

function plugin(): OfficeChatPlugin | null {
  if (typeof window === "undefined" || !window.Capacitor?.isNativePlatform?.()) return null;
  return window.Capacitor.Plugins?.OfficeChat ?? null;
}

export function isNativeApp(): boolean {
  return !!bridge() || !!plugin();
}

/** The phone's Firebase token. Right after install it can take a few seconds to exist: keep asking. */
async function pushToken(): Promise<string> {
  for (let i = 0; i < 15; i++) {
    const b = bridge();
    const token = b ? b.getPushToken() : (await plugin()?.getPushToken().catch(() => null))?.token ?? "";
    if (token) return token;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return "";
}

let registeredToken: string | null = null;

/** After sign-in: tell the server this phone's push token (calls and messages then reach it). */
export async function registerNativePush(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const token = await pushToken();
    if (!token) return false;
    await apiPost("/api/push/native/register", { token, platform: "android" });
    registeredToken = token;
    return true;
  } catch (err) {
    console.warn("Couldn't register the phone for notifications:", err);
    return false;
  }
}

/** Phone check (null outside the app). */
export async function getNativeStatus(): Promise<NativeStatus | null> {
  try {
    const b = bridge();
    if (b) return JSON.parse(b.getStatus()) as NativeStatus;
    return (await plugin()?.getStatus()) ?? null;
  } catch {
    return null;
  }
}

export async function openNativeAutoStart(): Promise<string | null> {
  try {
    const b = bridge();
    if (b) return b.openAutoStartSettings();
    return (await plugin()?.openAutoStartSettings())?.opened ?? null;
  } catch {
    return null;
  }
}

export async function openNativeBattery(): Promise<void> {
  try {
    const b = bridge();
    if (b) b.openBatterySettings();
    else await plugin()?.openBatterySettings();
  } catch {}
}

export function openNativeAppInfo(): void {
  try { bridge()?.openAppInfo?.(); } catch {}
}

/** Ask the server to ring this phone after `delaySeconds` (close the app meanwhile). Returns phones reached. */
export async function sendNativeTest(delaySeconds: number): Promise<number> {
  return (await apiPost<{ phones: number }>("/api/push/native/test", { delaySeconds })).phones;
}

/** A call started or ended (the Android app then shows "call in progress" and keeps it alive). */
export function setNativeInCall(inCall: boolean): void {
  try {
    const b = bridge();
    if (b) b.setInCall(inCall);
    else plugin()?.setInCall({ inCall }).catch(() => {});
  } catch {}
}

/** On sign-out: stop pushing to this phone (the next person to sign in here gets their own). */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const token = registeredToken ?? bridge()?.getPushToken() ?? "";
    if (token) await apiPost("/api/push/native/unregister", { token });
  } catch {}
  registeredToken = null;
}
