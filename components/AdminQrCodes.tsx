"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Ban, Check, Download, Loader2, Pencil, QrCode, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import { isNativeApp } from "@/lib/native";
import { showToast } from "@/lib/toast";

interface QrItem {
  id: number;
  clientName: string;
  targetUrl: string;
  /** Goes through our link, so it can be blocked or pointed elsewhere. */
  managed: boolean;
  blocked: boolean;
  scans: number;
  lastScanAt: string | null;
  createdAt: string;
  /** What the printed code holds. */
  content: string;
}

/** Dark colours only: pale codes don't scan. */
const COLORS = [
  { value: "#000000", label: "Black" },
  { value: "#1e3a8a", label: "Navy" },
  { value: "#581c87", label: "Purple" },
  { value: "#14532d", label: "Green" },
  { value: "#7f1d1d", label: "Maroon" },
];

// Margin 4 is the quiet zone scanners need; Q still reads with about a quarter of the print damaged.
const options = (color: string) => ({ margin: 4, errorCorrectionLevel: "Q" as const, color: { dark: color, light: "#ffffff" } });

function Preview({ content, color }: { content: string; color: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(content, { ...options(color), width: 240 }).then((s) => { if (live) setSrc(s); }).catch(() => {});
    return () => { live = false; };
  }, [content, color]);
  // eslint-disable-next-line @next/next/no-img-element -- generated data URL
  return src ? <img src={src} alt="QR code" className="aqr-img" /> : <span className="aqr-img" />;
}

async function download(item: QrItem, color: string, kind: "svg" | "png") {
  try {
    const name = `qr-${item.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || item.id}.${kind}`;
    let href: string;
    if (kind === "svg") {
      const svg = await QRCode.toString(item.content, { ...options(color), type: "svg" });
      href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    } else {
      href = await QRCode.toDataURL(item.content, { ...options(color), width: 1600 });
    }
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    if (kind === "svg") setTimeout(() => URL.revokeObjectURL(href), 5_000);
  } catch {
    showToast("Couldn't make the QR code file.");
  }
}

/** APP_URL isn't set on the server: phones can't open this address. */
function unreachable(content: string): boolean {
  return content.startsWith("http://localhost");
}

/** QR codes for clients' brochures and business cards. */
export default function AdminQrCodes() {
  const [items, setItems] = useState<QrItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [clientName, setClientName] = useState("");
  const [url, setUrl] = useState("");
  const [managed, setManaged] = useState(true);
  const [color, setColor] = useState(COLORS[0].value);
  const [editing, setEditing] = useState<QrItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [native] = useState(isNativeApp);

  useEffect(() => {
    apiGet<QrItem[]>("/api/admin/qr-codes").then(setItems).catch(() => setFailed(true));
  }, []);

  const replace = (next: QrItem) => setItems((list) => (list ?? []).map((q) => (q.id === next.id ? next : q)));

  const reset = () => { setEditing(null); setClientName(""); setUrl(""); };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      showToast(apiErrorMessage(err) ?? "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => {
    if (editing) {
      replace(await apiPut<QrItem>(`/api/admin/qr-codes/${editing.id}`, { clientName, url }));
      showToast("QR code updated");
    } else {
      const made = await apiPost<QrItem>("/api/admin/qr-codes", { clientName, url, managed });
      setItems((list) => [made, ...(list ?? [])]);
      showToast("QR code created");
    }
    reset();
  });

  const toggleBlocked = (q: QrItem) => {
    if (!q.blocked && !confirm(`Block the QR code for ${q.clientName}? People who scan it will see "This link is currently unavailable".`)) return;
    run(async () => {
      replace(await apiPut<QrItem>(`/api/admin/qr-codes/${q.id}/blocked`, { blocked: !q.blocked }));
      showToast(q.blocked ? "QR code unblocked" : "QR code blocked");
    });
  };

  const remove = (q: QrItem) => {
    const warning = q.managed
      ? "Printed copies will stop working for good. To stop it for a while, use Block instead."
      : "It's only removed from this list. Printed copies keep working.";
    if (!confirm(`Delete the QR code for ${q.clientName}? ${warning}`)) return;
    run(async () => {
      await apiDelete(`/api/admin/qr-codes/${q.id}`);
      setItems((list) => (list ?? []).filter((x) => x.id !== q.id));
      if (editing?.id === q.id) reset();
    });
  };

  return (
    <div className="aqr">
      <form className="aqr-card" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h4><QrCode size={16} /> {editing ? `Edit: ${editing.clientName}` : "New QR code"}</h4>
        <input className="aqr-input" placeholder="Client name" aria-label="Client name" maxLength={100} required
          value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <input className="aqr-input" placeholder="Website, e.g. https://example.com" aria-label="Website" maxLength={500} required
          inputMode="url" autoCapitalize="off" value={url} disabled={!!editing && !editing.managed} onChange={(e) => setUrl(e.target.value)} />
        {!editing && (
          <div className="aqr-types" role="radiogroup" aria-label="Type">
            <label className={`aqr-type ${managed ? "aqr-type--on" : ""}`}>
              <input type="radio" name="aqr-type" checked={managed} onChange={() => setManaged(true)} />
              <span><b>Smart</b><small>Goes through our server. You can block it, change the website and see scans. Stops working if our server is down or our web address changes.</small></span>
            </label>
            <label className={`aqr-type ${!managed ? "aqr-type--on" : ""}`}>
              <input type="radio" name="aqr-type" checked={!managed} onChange={() => setManaged(false)} />
              <span><b>Simple</b><small>Goes straight to the client&apos;s website, without our server. Never expires. Can&apos;t be blocked or changed after printing.</small></span>
            </label>
          </div>
        )}
        <div className="aqr-row">
          <button type="submit" className="aqr-btn aqr-btn--main" disabled={busy || !clientName.trim() || !url.trim()}>
            {busy && <Loader2 size={14} className="spin" />} {editing ? "Save" : "Create QR code"}
          </button>
          {editing && <button type="button" className="aqr-btn" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="aqr-row" role="radiogroup" aria-label="Colour">
        <span className="aqr-note">Colour:</span>
        {COLORS.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={color === c.value} aria-label={c.label} title={c.label}
            className={`aqr-color ${color === c.value ? "aqr-color--on" : ""}`} style={{ background: c.value }} onClick={() => setColor(c.value)} />
        ))}
      </div>
      {native && <p className="aqr-note">To download QR codes, open Jcat Connect on a computer.</p>}

      {failed && <p className="aqr-note">Couldn&apos;t load the QR codes. Close this panel and try again.</p>}
      {!items && !failed && <p className="aqr-note"><Loader2 size={14} className="spin" /> Loading…</p>}
      {items?.length === 0 && <p className="aqr-note">No QR codes yet.</p>}
      {items?.map((q) => (
        <div key={q.id} className="aqr-card aqr-item">
          <Preview content={q.content} color={color} />
          <div className="aqr-info">
            <b>{q.clientName}</b>
            <a href={q.targetUrl} target="_blank" rel="noopener noreferrer">{q.targetUrl}</a>
            <span className="aqr-note">
              {q.managed
                ? <>Smart · <span className={q.blocked ? "aqr-bad" : "aqr-ok"}>{q.blocked ? "Blocked" : "Active"}</span> · {q.scans} scan{q.scans === 1 ? "" : "s"}{q.lastScanAt ? ` · last ${new Date(q.lastScanAt).toLocaleDateString()}` : ""}</>
                : "Simple · can't be blocked"}
            </span>
            {q.managed && unreachable(q.content) && (
              <span className="aqr-warn">This code won&apos;t work on phones: set APP_URL on the server to the website&apos;s address.</span>
            )}
            <div className="aqr-row">
              {!native && <>
                <button type="button" className="aqr-btn" onClick={() => download(q, color, "svg")} title="For printing"><Download size={13} /> SVG</button>
                <button type="button" className="aqr-btn" onClick={() => download(q, color, "png")} title="For WhatsApp, email and websites"><Download size={13} /> PNG</button>
              </>}
              {q.managed && (
                <button type="button" className="aqr-btn" disabled={busy} onClick={() => toggleBlocked(q)}>
                  {q.blocked ? <><Check size={13} /> Unblock</> : <><Ban size={13} /> Block</>}
                </button>
              )}
              <button type="button" className="aqr-btn" aria-label={`Edit ${q.clientName}`} title="Edit"
                onClick={() => { setEditing(q); setClientName(q.clientName); setUrl(q.targetUrl); }}><Pencil size={13} /></button>
              <button type="button" className="aqr-btn" aria-label={`Delete ${q.clientName}`} title="Delete" disabled={busy} onClick={() => remove(q)}><Trash2 size={13} /></button>
            </div>
          </div>
        </div>
      ))}

      <style>{`
        .aqr { padding: 1rem 1.25rem 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem; }
        .aqr-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem; flex-shrink: 0; }
        .aqr-card h4 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 0.9rem; color: var(--text-primary); }
        .aqr-input { width: 100%; padding: 0.55rem 0.7rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 0.85rem; }
        .aqr-input:disabled { opacity: 0.6; }
        .aqr-types { display: flex; flex-direction: column; gap: 0.4rem; }
        .aqr-type { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem 0.7rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-primary); cursor: pointer; }
        .aqr-type--on { border-color: var(--accent); background: var(--accent-soft); }
        .aqr-type input { margin-top: 0.2rem; accent-color: var(--accent); }
        .aqr-type span { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.85rem; color: var(--text-primary); }
        .aqr-type small { font-size: 0.75rem; color: var(--text-muted); }
        .aqr-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
        .aqr-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.6rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .aqr-btn--main { background: var(--accent); border-color: var(--accent); color: #fff; padding: 0.5rem 0.9rem; }
        .aqr-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .aqr-color { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--bg-primary); cursor: pointer; }
        .aqr-color--on { box-shadow: 0 0 0 2px var(--accent); }
        .aqr-note { margin: 0; font-size: 0.78rem; color: var(--text-muted); }
        .aqr-item { flex-direction: row; align-items: flex-start; }
        .aqr-img { width: 108px; height: 108px; border-radius: 8px; background: #fff; flex-shrink: 0; }
        .aqr-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.88rem; color: var(--text-primary); }
        .aqr-info a { color: var(--accent); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .aqr-ok { color: var(--success, #16a34a); font-weight: 700; }
        .aqr-bad { color: var(--danger); font-weight: 700; }
        .aqr-warn { font-size: 0.75rem; color: var(--danger); overflow-wrap: anywhere; }
      `}</style>
    </div>
  );
}
