"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Loader2, Phone } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { useStore } from "@/lib/store";
import { signOut } from "@/lib/signOut";
import { ACTIVITY_KEY, LOCKED_KEY, isScreenLocked, lastActivity, markActivity, setScreenLocked } from "@/lib/idleLock";
import { isNativeApp } from "@/lib/native";
import Avatar from "./Avatar";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
const WRITE_EVERY_MS = 15_000; // don't hammer localStorage on every mouse move
const CHECK_EVERY_MS = 15_000;
/** How text may reach the unlock box: typed or pasted. Anything else (a browser filling in a saved password) is refused. */
const TYPED_INPUT = /^(insertText|insertCompositionText|insertFromPaste|delete)/;

/**
 * Masked plain-text box instead of type="password": browsers won't recognise it as a login and fill in a
 * saved password, which would let anyone at the PC unlock. Falls back to a real password box where
 * the mask isn't supported, and in the Android app (keyboards learn words typed into plain-text boxes).
 */
function canMaskTextBox(): boolean {
  return !isNativeApp() && typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc");
}

/**
 * Locks the app after a period of no activity (company policy, default 30 min) so patient
 * information isn't left on screen on shared PCs. Unlocking needs the account password.
 * Never locks during a call. Messages and calls keep arriving while locked.
 */
export default function IdleLock({ inCall, ringing }: { inCall: boolean; ringing: boolean }) {
  const userId = useStore((s) => s.userId);
  const userName = useStore((s) => s.userName);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [locked, setLocked] = useState(isScreenLocked);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastWrite = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inCallRef = useRef(inCall);
  useEffect(() => { inCallRef.current = inCall; }, [inCall]);

  useEffect(() => {
    apiGet<{ minutes: number }>("/api/policies/idle-lock")
      .then((r) => setMinutes(r.minutes))
      .catch(() => setMinutes(30));
  }, []);

  const lock = useCallback(() => {
    setScreenLocked(true);
    setLocked(true);
    setPassword("");
    setError(null);
  }, []);

  // Track activity (shared across tabs) and lock when the limit passes.
  useEffect(() => {
    if (!minutes) return; // 0 = turned off by an admin
    markActivity();
    const onActivity = () => {
      if (isScreenLocked()) return;
      const now = Date.now();
      if (now - lastWrite.current > WRITE_EVERY_MS) {
        lastWrite.current = now;
        markActivity();
      }
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(() => {
      if (isScreenLocked()) return;
      // A call counts as activity (people sit still on video calls).
      if (inCallRef.current) { markActivity(); return; }
      if (Date.now() - lastActivity() >= minutes * 60_000) lock();
    }, CHECK_EVERY_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
  }, [minutes, lock]);

  // Another tab locked or unlocked.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCKED_KEY) {
        setLocked(e.newValue === "1");
        setPassword("");
        setError(null);
      }
      if (e.key === ACTIVITY_KEY && e.newValue === null && !isScreenLocked()) markActivity();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (locked) setTimeout(() => inputRef.current?.focus(), 50);
  }, [locked]);

  const unlock = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/account/unlock", { password });
      markActivity();
      setScreenLocked(false);
      setLocked(false);
      setPassword("");
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 429) { await signOut(); return; }
      setError(apiErrorMessage(err) ?? "Couldn't check your password. Try again.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  if (!locked || inCall) return null;

  return (
    <div className="ilk" role="dialog" aria-modal="true" aria-labelledby="ilk-title">
      {/* A div, not a form: nothing here looks like a login for the browser to fill in or remember. */}
      <div className="ilk-card">
        <div className="ilk-icon"><Lock size={20} /></div>
        <Avatar userId={userId} name={userName ?? "Me"} size={72} />
        <h2 id="ilk-title">{userName ?? "Locked"}</h2>
        <p className="ilk-sub">Office Chat was locked after {minutes ?? 30} minutes of inactivity.</p>
        {ringing && <p className="ilk-ring"><Phone size={14} /> Incoming call — unlock to answer</p>}
        <input
          ref={inputRef}
          type={canMaskTextBox() ? "text" : "password"}
          className="ilk-input"
          name="office-chat-unlock"
          placeholder="Type your password"
          autoComplete={canMaskTextBox() ? "off" : "new-password"}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          value={password}
          onChange={(e) => {
            const how = (e.nativeEvent as InputEvent).inputType;
            if (how && TYPED_INPUT.test(how)) setPassword(e.target.value);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); unlock(); } }}
          aria-label="Password"
        />
        {error && <p className="ilk-error" role="alert">{error}</p>}
        <button type="button" className="ilk-btn" onClick={unlock} disabled={!password || busy}>
          {busy && <Loader2 size={15} className="spin" />} Unlock
        </button>
        <button type="button" className="ilk-link" onClick={() => signOut()}>Not you? Sign out</button>
      </div>

      <style>{`
        .ilk {
          position: fixed; inset: 0; z-index: 5000; display: flex; align-items: center; justify-content: center; padding: 1rem;
          /* Solid, not blurred: nothing behind it should be readable. */
          background: var(--bg-secondary, #f1f5f9);
        }
        .ilk-card {
          width: min(360px, 100%); display: flex; flex-direction: column; align-items: center; gap: 0.7rem;
          padding: 1.75rem 1.5rem; border-radius: 18px; background: var(--bg-primary, #fff);
          border: 1px solid var(--border, #e2e8f0); box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
        }
        .ilk-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 0.25rem; }
        .ilk-card h2 { margin: 0.25rem 0 0; font-size: 1.15rem; color: var(--text-primary); }
        .ilk-sub { margin: 0; font-size: 0.82rem; color: var(--text-muted); text-align: center; }
        .ilk-ring { margin: 0; display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 600; color: var(--success, #16a34a); }
        .ilk-input { width: 100%; padding: 0.65rem 0.8rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-size: 0.95rem; }
        .ilk-input[type="text"] { -webkit-text-security: disc; }
        .ilk-input:focus { outline: none; border-color: var(--accent); }
        .ilk-error { margin: 0; align-self: stretch; font-size: 0.8rem; color: var(--danger); }
        .ilk-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.65rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
        .ilk-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ilk-link { background: none; border: none; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
      `}</style>
    </div>
  );
}
