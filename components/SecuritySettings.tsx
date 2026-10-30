"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Laptop, Smartphone, Loader2, Copy, Check } from "lucide-react";
import QRCode from "qrcode";
import { apiGet, apiPost, apiDelete, apiErrorMessage } from "@/lib/api";

interface SessionView {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  lastActiveAt?: string | null;
  current: boolean;
}

function describeDevice(ua?: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false };
  const mobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile };
}

function when(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

/** Two-step verification setup + signed-in devices. Rendered inside the Settings window. */
export default function SecuritySettings() {
  const [status, setStatus] = useState<{ enabled: boolean; recoveryCodesLeft: number } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        apiGet<{ enabled: boolean; recoveryCodesLeft: number }>("/api/account/2fa"),
        apiGet<SessionView[]>("/api/account/sessions"),
      ]);
      setStatus(s);
      setSessions(list);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    // Fetches account data; state is set when the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () => run(async () => {
    const s = await apiPost<{ secret: string; otpauthUrl: string }>("/api/account/2fa/setup");
    const qr = await QRCode.toDataURL(s.otpauthUrl, { margin: 1, width: 200 });
    setSetup({ ...s, qr });
    setCode("");
  });

  const confirmSetup = () => run(async () => {
    const res = await apiPost<{ recoveryCodes: string[] }>("/api/account/2fa/enable", { code: code.trim() });
    setRecoveryCodes(res.recoveryCodes);
    setSetup(null);
    setCode("");
    await load();
  });

  const disable = () => run(async () => {
    await apiPost("/api/account/2fa/disable", { password, code: code.trim() });
    setDisabling(false);
    setPassword("");
    setCode("");
    await load();
  });

  const revoke = (id: string) => run(async () => {
    await apiDelete(`/api/account/sessions/${id}`);
    await load();
  });

  const revokeOthers = () => run(async () => {
    await apiPost("/api/account/sessions/revoke-others");
    await load();
  });

  const copyCodes = () => {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="sec">
      {/* ── Two-step verification ── */}
      <div className="sec-block">
        <div className="sec-row">
          <span className="sec-title">
            {status?.enabled ? <ShieldCheck size={16} className="sec-on" /> : <ShieldOff size={16} />}
            Two-step verification
          </span>
          <span className={`sec-pill ${status?.enabled ? "sec-pill--on" : ""}`}>{status?.enabled ? "On" : "Off"}</span>
        </div>
        <p className="sec-note">
          After your password, you&apos;ll also enter a code from an authenticator app (Google Authenticator,
          Microsoft Authenticator, 1Password…). Stops someone who learns your password from signing in.
        </p>

        {recoveryCodes && (
          <div className="sec-recovery">
            <p><strong>Save these recovery codes now.</strong> Each works once if you lose your phone. They won&apos;t be shown again.</p>
            <div className="sec-codes">{recoveryCodes.map((c) => <code key={c}>{c}</code>)}</div>
            <div className="sec-actions">
              <button type="button" className="sec-btn" onClick={copyCodes}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy codes"}</button>
              <button type="button" className="sec-btn sec-btn--primary" onClick={() => setRecoveryCodes(null)}>I&apos;ve saved them</button>
            </div>
          </div>
        )}

        {!status ? null : !status.enabled && !setup ? (
          <button type="button" className="sec-btn sec-btn--primary" disabled={busy} onClick={startSetup}>Turn on</button>
        ) : setup ? (
          <div className="sec-setup">
            <ol>
              <li>Scan this QR code with your authenticator app.</li>
              <li>Enter the 6-digit code it shows to confirm.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for your authenticator app" className="sec-qr" />
            <p className="sec-note">Can&apos;t scan? Enter this key manually: <code className="sec-key">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code></p>
            <div className="sec-actions">
              <input className="sec-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <button type="button" className="sec-btn sec-btn--primary" disabled={busy || code.length !== 6} onClick={confirmSetup}>Confirm</button>
              <button type="button" className="sec-btn" onClick={() => { setSetup(null); setCode(""); }}>Cancel</button>
            </div>
          </div>
        ) : status.enabled && !disabling ? (
          <div className="sec-actions">
            <span className="sec-note">{status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft !== 1 ? "s" : ""} left</span>
            <button type="button" className="sec-btn sec-btn--danger" onClick={() => setDisabling(true)}>Turn off</button>
          </div>
        ) : status.enabled ? (
          <div className="sec-setup">
            <input className="sec-input" type="password" placeholder="Your password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <input className="sec-input" placeholder="Authenticator or recovery code" autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="sec-actions">
              <button type="button" className="sec-btn sec-btn--danger" disabled={busy || !password || code.trim().length < 6} onClick={disable}>Turn off two-step verification</button>
              <button type="button" className="sec-btn" onClick={() => { setDisabling(false); setPassword(""); setCode(""); }}>Cancel</button>
            </div>
          </div>
        ) : null}
        {error && <p className="sec-error">{error}</p>}
      </div>

      {/* ── Sessions ── */}
      <div className="sec-block">
        <div className="sec-row">
          <span className="sec-title">Where you&apos;re signed in</span>
          {sessions && sessions.filter((s) => !s.current).length > 0 && (
            <button type="button" className="sec-link" disabled={busy} onClick={revokeOthers}>Sign out all others</button>
          )}
        </div>
        {sessions === null ? (
          <p className="sec-note"><Loader2 size={13} className="spin" /> Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="sec-note">Sessions from before this update aren&apos;t listed. Sign out and back in to see this device.</p>
        ) : (
          sessions.map((s) => {
            const d = describeDevice(s.userAgent);
            return (
              <div key={s.id} className="sec-session">
                {d.mobile ? <Smartphone size={18} /> : <Laptop size={18} />}
                <div className="sec-session-text">
                  <span className="sec-session-name">{d.label}{s.current && <span className="sec-pill sec-pill--on">This device</span>}</span>
                  <span className="sec-note">{s.ipAddress ?? "Unknown IP"} · active {when(s.lastActiveAt ?? s.createdAt)}</span>
                </div>
                {!s.current && <button type="button" className="sec-link" disabled={busy} onClick={() => revoke(s.id)}>Sign out</button>}
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .sec { display: flex; flex-direction: column; gap: 0.75rem; }
        .sec-block { border: 1px solid var(--border); border-radius: 12px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .sec-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .sec-title { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.86rem; font-weight: 700; color: var(--text-primary); }
        .sec-on { color: var(--success-text); }
        .sec-note { margin: 0; font-size: 0.76rem; color: var(--text-muted); line-height: 1.4; display: inline-flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
        .sec-pill { font-size: 0.68rem; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--bg-tertiary); color: var(--text-muted); margin-left: 0.4rem; }
        .sec-pill--on { background: var(--success-soft); color: var(--success-text); }
        .sec-actions { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
        .sec-btn { display: inline-flex; align-items: center; gap: 0.3rem; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.78rem; font-weight: 600; cursor: pointer; align-self: flex-start; }
        .sec-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sec-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .sec-btn--danger { color: var(--danger); border-color: var(--danger); }
        .sec-link { border: none; background: none; color: var(--danger); font-size: 0.76rem; font-weight: 600; cursor: pointer; }
        .sec-setup { display: flex; flex-direction: column; gap: 0.5rem; }
        .sec-setup ol { margin: 0; padding-left: 1.1rem; font-size: 0.8rem; color: var(--text-secondary); }
        .sec-qr { width: 180px; height: 180px; border-radius: 8px; background: #fff; padding: 6px; align-self: center; }
        .sec-key { font-size: 0.78rem; background: var(--bg-tertiary); padding: 2px 6px; border-radius: 6px; word-break: break-all; }
        .sec-input { border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; padding: 0.4rem 0.6rem; font: inherit; font-size: 0.85rem; min-width: 0; flex: 1; }
        .sec-recovery { background: var(--warning-soft, #fef3c7); border: 1px solid var(--warning-border, #fcd34d); border-radius: 10px; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .sec-recovery p { margin: 0; font-size: 0.78rem; color: var(--text-primary); }
        .sec-codes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.3rem; }
        .sec-codes code { font-size: 0.82rem; background: var(--bg-primary); border-radius: 6px; padding: 0.25rem 0.4rem; text-align: center; letter-spacing: 0.05em; }
        .sec-error { margin: 0; font-size: 0.78rem; color: var(--danger); }
        .sec-session { display: flex; align-items: center; gap: 0.6rem; padding: 0.35rem 0; color: var(--text-secondary); }
        .sec-session-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .sec-session-name { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); display: inline-flex; align-items: center; }
      `}</style>
    </div>
  );
}
