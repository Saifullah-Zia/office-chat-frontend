/**
 * Shared state for the inactivity screen lock (see components/IdleLock.tsx).
 * Kept in localStorage so every tab locks/unlocks together and a refresh doesn't skip the lock.
 */
export const LOCKED_KEY = "office_screen_locked";
export const ACTIVITY_KEY = "office_last_activity";

export function isScreenLocked(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(LOCKED_KEY) === "1"; } catch { return false; }
}

export function setScreenLocked(locked: boolean) {
  try {
    if (locked) localStorage.setItem(LOCKED_KEY, "1");
    else localStorage.removeItem(LOCKED_KEY);
  } catch {}
}

/** Last activity in any tab (ms). */
export function lastActivity(): number {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now(); } catch { return Date.now(); }
}

export function markActivity() {
  try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch {}
}

export function clearScreenLock() {
  try {
    localStorage.removeItem(LOCKED_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {}
}
