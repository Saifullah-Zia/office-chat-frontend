/**
 * Per-browser display & notification preferences. Applied as attributes on <html>
 * (see the inline script in app/layout.tsx, which applies them before first paint).
 */

export type FontSize = "small" | "medium" | "large" | "xlarge";
export type Wallpaper = "none" | "dots" | "grid" | "sky" | "sunset" | "mint";

const FONT_KEY = "office-chat-font-size";
const WALLPAPER_KEY = "office-chat-wallpaper";
const SOUND_KEY = "office-chat-sound";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export function getFontSize(): FontSize {
  const v = read(FONT_KEY);
  return v === "small" || v === "large" || v === "xlarge" ? v : "medium";
}

export function setFontSize(size: FontSize) {
  write(FONT_KEY, size === "medium" ? null : size);
  if (size === "medium") document.documentElement.removeAttribute("data-font-size");
  else document.documentElement.setAttribute("data-font-size", size);
}

export function getWallpaper(): Wallpaper {
  const v = read(WALLPAPER_KEY);
  return v === "dots" || v === "grid" || v === "sky" || v === "sunset" || v === "mint" ? v : "none";
}

export function setWallpaper(w: Wallpaper) {
  write(WALLPAPER_KEY, w === "none" ? null : w);
  if (w === "none") document.documentElement.removeAttribute("data-wallpaper");
  else document.documentElement.setAttribute("data-wallpaper", w);
}

// ── Do Not Disturb ───────────────────────────────────────────────────
// Silences message sounds and desktop notifications (unread badges still update).

const DND_UNTIL_KEY = "office-chat-dnd-until";
const QUIET_KEY = "office-chat-quiet-hours";

export interface QuietHours {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  weekends: boolean; // also quiet all day Sat/Sun
}

const DEFAULT_QUIET: QuietHours = { enabled: false, start: "19:00", end: "08:00", weekends: false };

export function getQuietHours(): QuietHours {
  try {
    const raw = read(QUIET_KEY);
    return raw ? { ...DEFAULT_QUIET, ...JSON.parse(raw) } : DEFAULT_QUIET;
  } catch {
    return DEFAULT_QUIET;
  }
}

export function setQuietHours(q: QuietHours) {
  write(QUIET_KEY, JSON.stringify(q));
}

/** Epoch ms until which notifications are paused, or null. */
export function getDndUntil(): number | null {
  const v = Number(read(DND_UNTIL_KEY));
  return v && v > Date.now() ? v : null;
}

export function setDndUntil(until: number | null) {
  write(DND_UNTIL_KEY, until ? String(until) : null);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function inQuietHours(now: Date, q: QuietHours): boolean {
  if (!q.enabled) return false;
  const day = now.getDay();
  if (q.weekends && (day === 0 || day === 6)) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = minutesOf(q.start);
  const end = minutesOf(q.end);
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end; // handles overnight ranges
}

/**
 * True when message sounds/notifications should be suppressed: a manual pause, quiet hours,
 * or a "Focus / DND" work status.
 */
export function isDndActive(workStatusText?: string | null): boolean {
  if (typeof window === "undefined") return false;
  if (getDndUntil()) return true;
  if (workStatusText && /dnd|do not disturb|focus/i.test(workStatusText)) return true;
  return inQuietHours(new Date(), getQuietHours());
}

/** Message sound on/off (defaults to on). */
export function isSoundEnabled(): boolean {
  return typeof window === "undefined" ? true : read(SOUND_KEY) !== "off";
}

export function setSoundEnabled(on: boolean) {
  write(SOUND_KEY, on ? null : "off");
}
