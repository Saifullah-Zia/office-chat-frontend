"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import { apiErrorMessage, apiPost } from "@/lib/api";
import AuthCard from "@/components/AuthCard";

/** "Forgot password?": emails a one-time reset link (same answer whether or not the account exists). */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ message: string }>("/api/auth/forgot-password", { email: email.trim() });
      setSent(r.message);
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't send the email. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard icon={<Mail size={22} />} title="Forgot your password?"
      subtitle={sent ? undefined : "Enter your work email and we'll send you a link to choose a new password."}>
      {sent ? (
        <p className="auc-ok">{sent} The link works once and expires in 30 minutes. Check your spam folder too.</p>
      ) : (
        <form onSubmit={submit}>
          <label className="auc-field">Email
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          {error && <p className="auc-error" role="alert">{error}</p>}
          <button type="submit" className="auc-btn" disabled={busy || !email.trim()}>
            {busy && <Loader2 size={14} className="spin" />} Send reset link
          </button>
        </form>
      )}
      <Link href="/login" className="auc-link"><ArrowLeft size={14} /> Back to sign in</Link>
      <p className="auc-sub" style={{ marginTop: "0.75rem", marginBottom: 0 }}>No email arriving? An admin can also reset your password.</p>
    </AuthCard>
  );
}
