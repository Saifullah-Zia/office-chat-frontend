/** Preferred call devices (mic, camera, speaker), remembered per browser. Device ids match Agora's. */

export type DeviceKind = "mic" | "camera" | "speaker";

const KEY = "office-chat-devices";
const BROWSER_KIND: Record<DeviceKind, MediaDeviceKind> = { mic: "audioinput", camera: "videoinput", speaker: "audiooutput" };

export function getPreferredDevices(): Partial<Record<DeviceKind, string>> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
}

export function setPreferredDevice(kind: DeviceKind, deviceId: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getPreferredDevices(), [kind]: deviceId })); } catch {}
}

/** Choosing an output device needs setSinkId (Chrome, Edge; not Safari/Firefox on all versions). */
export function canChooseSpeaker(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

export type DeviceList = Record<DeviceKind, MediaDeviceInfo[]>;

/**
 * Lists devices. Browsers hide names until mic/camera permission is granted, so when names are
 * missing we ask once (askPermission) and list again.
 */
export async function listDevices(askPermission = false): Promise<DeviceList> {
  const read = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const pick = (k: DeviceKind) => all.filter((d) => d.kind === BROWSER_KIND[k] && d.deviceId);
    return { mic: pick("mic"), camera: pick("camera"), speaker: pick("speaker") };
  };
  let list = await read();
  const unnamed = [...list.mic, ...list.camera].some((d) => !d.label);
  if (askPermission && unnamed) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: list.camera.length > 0 });
      s.getTracks().forEach((t) => t.stop());
      list = await read();
    } catch { /* permission denied: keep the unnamed list */ }
  }
  return list;
}

export function deviceLabel(d: MediaDeviceInfo, i: number, kind: DeviceKind): string {
  return d.label || `${kind === "mic" ? "Microphone" : kind === "camera" ? "Camera" : "Speaker"} ${i + 1}`;
}
