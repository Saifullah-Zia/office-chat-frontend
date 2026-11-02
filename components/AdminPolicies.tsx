"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, Lock } from "lucide-react";
import { apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import { showToast } from "@/lib/toast";

type Mode = "off" | "warn" | "block";

const MODES: { value: Mode; label: string; help: string }[] = [
  { value: "off", label: "Off", help: "Messages aren't checked." },
  { value: "warn", label: "Warn", help: "The sender is asked to confirm before it's sent. Overrides are logged." },
  { value: "block", label: "Block", help: "The message isn't sent. Attempts are logged in the audit log." },
];

const LOCK_OPTIONS = [0, 5, 10, 15, 30, 60, 120];

/** Company-wide policies: data-loss prevention for outgoing messages, and the inactivity screen lock. */
export default function AdminPolicies() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockMinutes, setLockMinutes] = useState<number | null>(null);

  useEffect(() => {
    apiGet<{ mode: Mode }>("/api/admin/dlp").then((r) => setMode(r.mode)).catch(() => setMode("warn"));
    apiGet<{ minutes: number }>("/api/policies/idle-lock").then((r) => setLockMinutes(r.minutes)).catch(() => setLockMinutes(30));
  }, []);

  const changeLock = async (next: number) => {
    const prev = lockMinutes;
    setLockMinutes(next);
    setSaving(true);
    try {
      await apiPut("/api/admin/idle-lock", { minutes: next });
      showToast(next === 0 ? "Screen lock turned off" : `Screens now lock after ${next} minutes of inactivity`);
    } catch (err) {
      setLockMinutes(prev);
      showToast(apiErrorMessage(err) ?? "Couldn't save the policy.");
    } finally {
      setSaving(false);
    }
  };

  const change = async (next: Mode) => {
    const prev = mode;
    setMode(next);
    setSaving(true);
    try {
      await apiPut("/api/admin/dlp", { mode: next });
      showToast("Policy saved");
    } catch (err) {
      setMode(prev);
      showToast(apiErrorMessage(err) ?? "Couldn't save the policy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="apo">
      <section className="apo-card">
        <h4><ShieldAlert size={16} /> Sensitive data in messages</h4>
        <p className="apo-note">
          Checks every message for card numbers, ID numbers (CNIC, SSN), bank accounts (IBAN), typed-out passwords and secret keys.
        </p>
        {mode === null ? (
          <p className="apo-note"><Loader2 size={14} className="spin" /> Loading…</p>
        ) : (
          <div className="apo-options" role="radiogroup" aria-label="Data-loss prevention mode">
            {MODES.map((m) => (
              <label key={m.value} className={`apo-option ${mode === m.value ? "apo-option--on" : ""}`}>
                <input type="radio" name="dlp-mode" value={m.value} checked={mode === m.value} disabled={saving} onChange={() => change(m.value)} />
                <span><b>{m.label}</b><small>{m.help}</small></span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="apo-card">
        <h4><Lock size={16} /> Screen lock after inactivity</h4>
        <p className="apo-note">
          After this long with no mouse or keyboard activity, Office Chat locks and asks for the password again.
          It never locks during a call. Takes effect when people next open or refresh the app.
        </p>
        {lockMinutes === null ? (
          <p className="apo-note"><Loader2 size={14} className="spin" /> Loading…</p>
        ) : (
          <select
            className="apo-select"
            value={lockMinutes}
            disabled={saving}
            onChange={(e) => changeLock(Number(e.target.value))}
            aria-label="Lock after"
          >
            {LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>{m === 0 ? "Off (never lock)" : m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>
            ))}
          </select>
        )}
      </section>

      <style>{`
        .apo { padding: 1rem 1.25rem 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem; }
        .apo-select { align-self: flex-start; padding: 0.5rem 0.7rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 0.85rem; }
        .apo-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .apo-card h4 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 0.9rem; color: var(--text-primary); }
        .apo-note { margin: 0; display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--text-muted); }
        .apo-options { display: flex; flex-direction: column; gap: 0.4rem; }
        .apo-option { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem 0.7rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-primary); cursor: pointer; }
        .apo-option--on { border-color: var(--accent); background: var(--accent-soft); }
        .apo-option input { margin-top: 0.2rem; accent-color: var(--accent); }
        .apo-option span { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.85rem; color: var(--text-primary); }
        .apo-option small { font-size: 0.75rem; color: var(--text-muted); }
      `}</style>
    </div>
  );
}
