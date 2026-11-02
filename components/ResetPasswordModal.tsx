"use client";

import { useState } from "react";
import { KeyRound, Loader2, Copy, Check, X } from "lucide-react";
import { apiErrorMessage, apiPost } from "@/lib/api";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { UserResponse } from "@/types";

/** Admin: give someone a temporary password (shown once). They must choose a new one at next login. */
export default function ResetPasswordModal({ user, onClose }: { user: UserResponse; onClose: () => void }) {
  useEscapeKey(onClose);
  const [disableTwoFactor, setDisableTwoFactor] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ temporaryPassword: string }>(`/api/users/admin/${user.id}/reset-password`, { disableTwoFactor });
      setTemp(r.temporaryPassword);
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!temp) return;
    navigator.clipboard.writeText(temp).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rpm-overlay" onClick={onClose}>
      <div className="rpm-card" role="dialog" aria-modal="true" aria-labelledby="rpm-title" onClick={(e) => e.stopPropagation()}>
        <header className="rpm-header">
          <h3 id="rpm-title"><KeyRound size={17} /> Reset password</h3>
          <button type="button" className="rpm-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {temp ? (
          <div className="rpm-body">
            <p>Temporary password for <b>{user.name}</b>:</p>
            <div className="rpm-temp">
              <code>{temp}</code>
              <button type="button" onClick={copy} aria-label="Copy password">
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <ul className="rpm-steps">
              <li>Send it to them privately (phone, WhatsApp, in person). It&apos;s shown only now.</li>
              <li>They sign in with it and are asked to choose their own password straight away.</li>
              <li>They&apos;ve been signed out of every device.</li>
            </ul>
            <div className="rpm-actions"><button type="button" className="rpm-btn rpm-btn--primary" onClick={onClose}>Done</button></div>
          </div>
        ) : (
          <div className="rpm-body">
            <p>
              Give <b>{user.name}</b> ({user.email}) a temporary password? Their current password stops working
              and they&apos;re signed out of every device.
            </p>
            <label className="rpm-check">
              <input type="checkbox" checked={disableTwoFactor} onChange={(e) => setDisableTwoFactor(e.target.checked)} />
              <span>Also turn off two-step login<small>Only if they lost the phone with their authenticator app</small></span>
            </label>
            {error && <p className="rpm-error" role="alert">{error}</p>}
            <div className="rpm-actions">
              <button type="button" className="rpm-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="rpm-btn rpm-btn--primary" onClick={reset} disabled={busy}>
                {busy && <Loader2 size={14} className="spin" />} Reset password
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        .rpm-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .rpm-card { width: 100%; max-width: 420px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .rpm-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .rpm-header h3 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--text-primary); }
        .rpm-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .rpm-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.88rem; color: var(--text-primary); }
        .rpm-body p { margin: 0; line-height: 1.45; }
        .rpm-check { display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; }
        .rpm-check input { margin-top: 0.2rem; accent-color: var(--accent); }
        .rpm-check span { display: flex; flex-direction: column; font-size: 0.85rem; }
        .rpm-check small { font-size: 0.74rem; color: var(--text-muted); }
        .rpm-temp { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.7rem; border-radius: 10px; background: var(--bg-secondary); border: 1px dashed var(--accent); }
        .rpm-temp code { flex: 1; font-size: 1.05rem; font-weight: 700; letter-spacing: 0.04em; user-select: all; word-break: break-all; }
        .rpm-temp button { display: inline-flex; align-items: center; gap: 0.3rem; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); border-radius: 8px; padding: 0.35rem 0.6rem; font-size: 0.78rem; cursor: pointer; }
        .rpm-steps { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--text-secondary); }
        .rpm-error { color: var(--danger); font-size: 0.82rem; }
        .rpm-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
        .rpm-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.84rem; font-weight: 600; cursor: pointer; }
        .rpm-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .rpm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
