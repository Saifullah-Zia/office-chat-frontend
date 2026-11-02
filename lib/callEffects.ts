import type AgoraRTCType from "agora-rtc-sdk-ng";
import type { AIDenoiserExtension } from "agora-extension-ai-denoiser";
import type VirtualBackgroundExtension from "agora-extension-virtual-background";

/**
 * Call effects: AI noise suppression (mic) and background blur (camera), via Agora's extensions.
 * Loaded on first use and registered once; null when the browser can't run them.
 */

export interface CallEffectPrefs { noise: boolean; blur: boolean }
const KEY = "office-chat-call-effects";

export function getEffectPrefs(): CallEffectPrefs {
  try {
    return { noise: true, blur: false, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { noise: true, blur: false };
  }
}

export function setEffectPref(key: keyof CallEffectPrefs, on: boolean) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getEffectPrefs(), [key]: on })); } catch {}
}

export interface CallEffectExtensions {
  denoiser: AIDenoiserExtension | null;
  blur: VirtualBackgroundExtension | null;
}

let loaded: Promise<CallEffectExtensions> | null = null;

export function loadCallEffects(AgoraRTC: typeof AgoraRTCType): Promise<CallEffectExtensions> {
  loaded ??= (async () => {
    const result: CallEffectExtensions = { denoiser: null, blur: null };
    try {
      const { AIDenoiserExtension } = await import("agora-extension-ai-denoiser");
      // WASM engine served from public/agora-denoiser (copied by scripts/copy-agora-assets.mjs)
      const ext = new AIDenoiserExtension({ assetsPath: "/agora-denoiser" });
      if (ext.checkCompatibility()) {
        AgoraRTC.registerExtensions([ext]);
        result.denoiser = ext;
      }
    } catch (err) {
      console.warn("Noise suppression unavailable:", err);
    }
    try {
      const VirtualBackground = (await import("agora-extension-virtual-background")).default;
      const ext = new VirtualBackground();
      if (ext.checkCompatibility()) {
        AgoraRTC.registerExtensions([ext]);
        result.blur = ext;
      }
    } catch (err) {
      console.warn("Background blur unavailable:", err);
    }
    return result;
  })();
  return loaded;
}
