"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { apiErrorMessage } from "@/lib/api";
import { showToast } from "@/lib/toast";
import {
  NativeStatus, getNativeStatus, isNativeApp, openNativeAutoStart, openNativeBattery, registerNativePush, sendNativeTest,
} from "@/lib/native";

const TEST_DELAY = 30;

/**
 * Settings → Phone check (Android app only): can calls reach this phone while the app is closed?
 * Shows what could block them, opens the phone's own settings, and sends a test ring after 30s.
 */
export default function PhoneCheck() {
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(() => { getNativeStatus().then(setStatus); }, []);
  useEffect(() => {
    if (!isNativeApp()) return;
    refresh();
    // Coming back from the phone's settings screens: show the new state.
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  if (!isNativeApp()) return null;

  const test = async () => {
    setSending(true);
    try {
      await registerNativePush(); // make sure the server has this phone's current token
      const phones = await sendNativeTest(TEST_DELAY);
      if (phones === 0) {
        showToast("This phone isn't registered for notifications yet. Sign out and in again, then retry.");
      } else {
        showToast(`Test ring in ${TEST_DELAY} seconds. Now close the app (swipe it away) and lock the phone.`);
      }
    } catch (err) {
      showToast(apiErrorMessage(err) ?? "Couldn't send the test.");
    } finally {
      setSending(false);
    }
  };

  const last = status?.lastPushAt ? new Date(status.lastPushAt) : null;
  const brand = status?.manufacturer?.toLowerCase() ?? "";
  const needsAutoStart = /infinix|tecno|itel|xiaomi|redmi|poco|oppo|realme|vivo|huawei|honor|oneplus/.test(brand);

  return (
    <div className="pck">
      <p className="pck-note">Can calls ring when the app is closed? Check these, then send a test.</p>

      <Row ok={status?.notificationsEnabled}
        label={status?.notificationsEnabled ? "Notifications allowed" : "Notifications are off: App info → Notifications → allow"} />
      <Row ok={status?.batteryUnrestricted} label="Battery: not optimised"
        fix={!status?.batteryUnrestricted ? { text: "Fix", onClick: () => openNativeBattery() } : undefined} />
      {needsAutoStart && (
        <Row ok={null} label={`Auto-start allowed (${status?.manufacturer ?? "this phone"} only shows this in its own settings)`}
          fix={{ text: "Open", onClick: () => openNativeAutoStart() }} />
      )}

      <button type="button" className="pck-test" onClick={test} disabled={sending}>
        {sending && <Loader2 size={14} className="spin" />} Send a test ring in {TEST_DELAY} seconds
      </button>
      <p className="pck-note">
        Then close the app and lock the phone. If it rings: calls work when closed. If not: allow auto-start above.
      </p>
      {last && (
        <p className="pck-note">
          Last notification reached this phone: {last.toLocaleString()}
          {status?.lastPushAppClosed ? " (app was closed: ✅ works)" : " (app was open)"}
        </p>
      )}
      {status && <p className="pck-note pck-device">{status.manufacturer} {status.model} · Android {status.android}</p>}

      <style>{`
        .pck { display: flex; flex-direction: column; gap: 0.5rem; }
        .pck-note { margin: 0; font-size: 0.78rem; color: var(--text-muted); }
        .pck-device { font-size: 0.72rem; }
        .pck-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; color: var(--text-primary); }
        .pck-row span { flex: 1; }
        .pck-ok { color: var(--success, #16a34a); }
        .pck-bad { color: var(--warning, #d97706); }
        .pck-fix, .pck-test { padding: 0.35rem 0.7rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .pck-test { align-self: flex-start; display: inline-flex; align-items: center; gap: 0.35rem; background: var(--accent); border-color: var(--accent); color: #fff; padding: 0.5rem 0.85rem; }
        .pck-test:disabled { opacity: 0.6; }
      `}</style>
    </div>
  );
}

function Row({ ok, label, fix }: { ok: boolean | null | undefined; label: string; fix?: { text: string; onClick: () => void } }) {
  return (
    <div className="pck-row">
      {ok ? <CheckCircle2 size={16} className="pck-ok" /> : <AlertTriangle size={16} className="pck-bad" />}
      <span>{label}</span>
      {fix && <button type="button" className="pck-fix" onClick={fix.onClick}>{fix.text}</button>}
    </div>
  );
}
