"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share, X } from "lucide-react";

/** Chrome/Edge/Android's install event (not in the standard TS DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
declare global {
  interface Window { __installPrompt?: BeforeInstallPromptEvent | null }
}

const SHOW_FOR_MS = 10_000;
const KEY = "office-chat-install-prompt";
const DAY = 24 * 60 * 60 * 1000;

function canShowAgain(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { until?: number };
    return !s.until || Date.now() > s.until;
  } catch {
    return true;
  }
}
function snooze(ms: number) {
  try { localStorage.setItem(KEY, JSON.stringify({ until: Date.now() + ms })); } catch {}
}
function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * "Install Office Chat" popup when the app is opened in a browser; disappears after 10 seconds.
 * Chrome/Edge/Android get a real Install button; iPhone/iPad get Add-to-Home-Screen steps.
 * Not shown when already installed; "Not now" hides it for a week, otherwise at most once a day.
 */
export default function InstallPrompt() {
  const [mode, setMode] = useState<"install" | "ios" | null>(null);
  const eventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isInstalled() || !canShowAgain()) return;

    const show = (m: "install" | "ios") => {
      setMode(m);
      snooze(DAY); // a timed-out popup comes back tomorrow at the earliest
      timerRef.current = setTimeout(() => setMode(null), SHOW_FOR_MS);
    };

    // Chrome may have fired the event before React loaded (caught by the script in app/layout.tsx).
    const early = window.__installPrompt;
    if (early) { eventRef.current = early; show("install"); }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      eventRef.current = e as BeforeInstallPromptEvent;
      if (!timerRef.current) show("install");
    };
    const onInstalled = () => { snooze(3650 * DAY); setMode(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iPhone/iPad Safari has no install event: show the manual steps instead.
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    const iosTimer = iOS && !early ? setTimeout(() => show("ios"), 1500) : null;

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const close = (snoozeMs?: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (snoozeMs) snooze(snoozeMs);
    setMode(null);
  };

  const install = async () => {
    const ev = eventRef.current;
    if (!ev) return close();
    close();
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    snooze(outcome === "accepted" ? 3650 * DAY : 7 * DAY);
    eventRef.current = null;
    window.__installPrompt = null;
  };

  if (!mode) return null;

  return (
    <div className="inp" role="dialog" aria-live="polite" aria-label="Install Office Chat">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="inp-icon" width={44} height={44} />
      <div className="inp-text">
        <b>Install Office Chat</b>
        {mode === "install" ? (
          <span>Open it like an app, and get call and message alerts even when it&apos;s closed.</span>
        ) : (
          <span>Tap <Share size={13} className="inp-inline" /> <b>Share</b>, then <b>Add to Home Screen</b>.</span>
        )}
      </div>
      {mode === "install" && (
        <button type="button" className="inp-btn" onClick={install}><Download size={15} /> Install</button>
      )}
      <button type="button" className="inp-close" onClick={() => close(7 * DAY)} aria-label="Not now" title="Not now">
        <X size={16} />
      </button>
      <span className="inp-timer" aria-hidden="true" />
      <style>{`
        .inp {
          position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 2000;
          width: min(440px, calc(100vw - 24px)); display: flex; align-items: center; gap: 0.7rem;
          padding: 0.75rem 0.8rem; border-radius: 16px; overflow: hidden;
          background: var(--bg-primary, #fff); color: var(--text-primary, #0f172a);
          border: 1px solid var(--border, #e2e8f0); box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
          animation: inp-in 0.3s ease-out;
        }
        @keyframes inp-in { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .inp-icon { border-radius: 10px; flex-shrink: 0; }
        .inp-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.8rem; color: var(--text-secondary, #475569); line-height: 1.35; }
        .inp-text b { color: var(--text-primary, #0f172a); }
        .inp-text > b { font-size: 0.92rem; }
        .inp-inline { vertical-align: -2px; }
        .inp-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.85rem; border-radius: 10px; border: none; background: var(--accent, #4f46e5); color: #fff; font-weight: 700; font-size: 0.84rem; cursor: pointer; flex-shrink: 0; }
        .inp-close { background: none; border: none; color: var(--text-muted, #94a3b8); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; flex-shrink: 0; }
        .inp-close:hover { background: var(--bg-tertiary, #f1f5f9); }
        /* Shrinking bar: shows the 10 seconds running out */
        .inp-timer { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: var(--accent, #4f46e5); transform-origin: left; animation: inp-timer ${SHOW_FOR_MS}ms linear forwards; }
        @keyframes inp-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
      `}</style>
    </div>
  );
}
