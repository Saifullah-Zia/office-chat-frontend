"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { apiErrorMessage, apiPost } from "@/lib/api";

const MIN = 8;

/**
 * Current + new password (twice). Used by the forced change after a temporary password
 * and by Settings → Security. The server signs out other devices on success.
 */
export default function ChangePasswordForm({ onDone, currentLabel = "Current password", submitLabel = "Change password", resetToken }: {
  onDone: () => void;
  currentLabel?: string;
  submitLabel?: string;
  /** From an emailed reset link: no current password needed. */
  resetToken?: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem =
    next.length > 0 && next.length < MIN ? `At least ${MIN} characters` :
    confirm.length > 0 && confirm !== next ? "The new passwords don't match" : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!resetToken && !current) || next.length < MIN || next !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      if (resetToken) await apiPost("/api/auth/reset-password", { token: resetToken, newPassword: next });
      else await apiPost("/api/account/password", { currentPassword: current, newPassword: next });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't change the password.");
    } finally {
      setBusy(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <form className="cpf" onSubmit={submit}>
      {!resetToken && (
        <label>{currentLabel}
          <input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
      )}
      <label>New password
        <input type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={MIN} maxLength={128} required />
      </label>
      <label>Confirm new password
        <input type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </label>
      <button type="button" className="cpf-show" onClick={() => setShow((v) => !v)}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? "Hide" : "Show"} passwords
      </button>
      {(problem || error) && <p className="cpf-error" role="alert">{error ?? problem}</p>}
      <button type="submit" className="cpf-submit" disabled={busy || (!resetToken && !current) || next.length < MIN || next !== confirm}>
        {busy && <Loader2 size={14} className="spin" />} {submitLabel}
      </button>
      <p className="cpf-note">{resetToken ? "You'll be signed out everywhere and can sign in with the new password." : "Your other devices will be signed out."}</p>
      <style>{`
        .cpf { display: flex; flex-direction: column; gap: 0.6rem; }
        .cpf label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); }
        .cpf input { padding: 0.55rem 0.7rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-weight: 400; font-size: 0.9rem; }
        .cpf input:focus { outline: none; border-color: var(--accent); }
        .cpf-show { align-self: flex-start; display: inline-flex; align-items: center; gap: 0.3rem; background: none; border: none; padding: 0; color: var(--text-muted); font-size: 0.78rem; cursor: pointer; }
        .cpf-error { margin: 0; font-size: 0.8rem; color: var(--danger); }
        .cpf-submit { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.6rem 1rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.88rem; cursor: pointer; }
        .cpf-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .cpf-note { margin: 0; font-size: 0.74rem; color: var(--text-muted); }
      `}</style>
    </form>
  );
}
