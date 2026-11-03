"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { NativeStatus, getNativeStatus, isNativeApp } from "@/lib/native";
import { phoneReady } from "@/lib/phoneReady";
import PhoneCheck from "./PhoneCheck";

const SNOOZE_KEY = "office-chat-phone-banner-snooze";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Android app only: a reminder bar while this phone isn't ready to ring with the app closed
 * (notifications off, battery optimised, auto-start not proven yet...). "Fix now" opens Phone check,
 * so nobody has to go looking for it. Gone once a test ring reaches the closed app.
 */
export default function PhoneReadyBanner() {
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [snoozed, setSnoozed] = useState(() => {
    try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0); } catch { return false; }
  });

  useEffect(() => {
    if (!isNativeApp()) return;
    const refresh = () => { getNativeStatus().then(setStatus); };
    // Give the phone a moment to register for push after opening.
    const t = setTimeout(refresh, 4_000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const close = () => setOpen(false);

  if (!status || (phoneReady(status) && !open)) return null;

  return (
    <>
      {!snoozed && !open && (
        <div className="prb" role="status">
          <BellRing size={18} className="prb-icon" />
          <span>Calls may not ring while the app is closed on this phone.</span>
          <button type="button" className="prb-fix" onClick={() => setOpen(true)}>Fix now</button>
          <button
            type="button"
            className="prb-later"
            aria-label="Remind me later"
            onClick={() => {
              try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch {}
              setSnoozed(true);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {open && <PhoneCheckDialog onClose={close} />}
      <style>{`
        .prb {
          position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 1100;
          width: min(460px, calc(100vw - 24px)); display: flex; align-items: center; gap: 0.6rem;
          padding: 0.65rem 0.75rem; border-radius: 14px; background: var(--bg-primary);
          border: 1px solid var(--warning, #d97706); box-shadow: 0 12px 32px rgba(15, 23, 42, 0.2);
          font-size: 0.82rem; color: var(--text-primary);
        }
        .prb span { flex: 1; }
        .prb-icon { color: var(--warning, #d97706); flex-shrink: 0; }
        .prb-fix { padding: 0.4rem 0.75rem; border-radius: 9px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 0.8rem; cursor: pointer; flex-shrink: 0; }
        .prb-later { display: flex; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; flex-shrink: 0; }
      `}</style>
    </>
  );
}

function PhoneCheckDialog({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <div className="prd-overlay" onClick={onClose}>
      <div className="prd" role="dialog" aria-modal="true" aria-label="Phone check" onClick={(e) => e.stopPropagation()}>
        <header className="prd-head">
          <b>Make calls ring when the app is closed</b>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <PhoneCheck />
      </div>
      <style>{`
        .prd-overlay { position: fixed; inset: 0; z-index: 1150; background: rgba(15, 23, 42, 0.55); display: flex; align-items: flex-end; justify-content: center; padding: 12px; }
        .prd { width: min(460px, 100%); max-height: 85vh; overflow-y: auto; background: var(--bg-primary); border-radius: 16px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .prd-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; color: var(--text-primary); font-size: 0.95rem; }
        .prd-head button { display: flex; background: none; border: none; color: var(--text-muted); cursor: pointer; }
      `}</style>
    </div>
  );
}
