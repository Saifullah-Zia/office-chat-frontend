"use client";

import { useState } from "react";
import { X, Upload, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { apiErrorMessage, apiPost } from "@/lib/api";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface Row { name: string; email: string; department: string; jobTitle: string; role: string }
interface Result { row: number; email: string; status: "ready" | "created" | "skipped" | "error"; message: string | null; tempPassword: string | null }

const TEMPLATE = "name,email,department,job title,role\nAyesha Khan,ayesha@company.com,HR,HR Manager,EMPLOYEE\nDr. Omar Malik,omar@clinic.com,Cardiology,Cardiologist,PROVIDER\n";

/** RFC 4180-ish: quoted fields, "" escapes, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

function toRows(text: string): Row[] {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return [];
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase().replace(/[\s_]/g, "")));
  const idx = { name: col("name", "fullname"), email: col("email", "emailaddress"), department: col("department", "dept"),
    jobTitle: col("jobtitle", "title"), role: col("role") };
  if (idx.name < 0 || idx.email < 0) throw new Error("The first row must have \"name\" and \"email\" columns.");
  const get = (l: string[], i: number) => (i >= 0 ? (l[i] ?? "").trim() : "");
  return lines.map((l) => ({ name: get(l, idx.name), email: get(l, idx.email), department: get(l, idx.department),
    jobTitle: get(l, idx.jobTitle), role: get(l, idx.role) }));
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Admin: create many accounts from a CSV. Preview first, then import; temp passwords are shown once. */
export default function ImportUsersModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  useEscapeKey(onClose);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [imported, setImported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setResults(null); setImported(false);
    try {
      const parsed = toRows(await file.text());
      if (parsed.length === 0) throw new Error("No people found in the file.");
      setRows(parsed);
      setBusy(true);
      setResults(await apiPost<Result[]>("/api/users/admin/import", { rows: parsed, dryRun: true }));
    } catch (err) {
      setRows(null);
      setError(apiErrorMessage(err) ?? (err instanceof Error ? err.message : "Couldn't read the file."));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!rows) return;
    setBusy(true); setError(null);
    try {
      setResults(await apiPost<Result[]>("/api/users/admin/import", { rows }));
      setImported(true);
      onImported();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const count = (s: Result["status"]) => results?.filter((r) => r.status === s).length ?? 0;
  const created = results?.filter((r) => r.status === "created") ?? [];

  return (
    <div className="imp-overlay" onClick={onClose}>
      <div className="imp-card" role="dialog" aria-modal="true" aria-labelledby="imp-title" onClick={(e) => e.stopPropagation()}>
        <header className="imp-header">
          <h3 id="imp-title"><FileSpreadsheet size={17} /> Import employees from CSV</h3>
          <button type="button" className="imp-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="imp-body">
          {!imported && (
            <>
              <p className="imp-note">
                Columns: <b>name</b>, <b>email</b>, and optionally department, job title, role (EMPLOYEE, PROVIDER or ADMIN).{" "}
                <button type="button" className="imp-link" onClick={() => download("employees-template.csv", TEMPLATE)}>Download a template</button>
              </p>
              <label className="imp-drop">
                <Upload size={18} /> {rows ? `${rows.length} row(s) loaded. Choose another file` : "Choose a CSV file"}
                <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </>
          )}

          {error && <p className="imp-error" role="alert">{error}</p>}
          {busy && !results && <p className="imp-note"><Loader2 size={14} className="spin" /> Checking…</p>}

          {results && (
            <>
              <p className="imp-summary">
                {imported
                  ? <><b>{count("created")}</b> created · {count("skipped")} skipped · {count("error")} with errors</>
                  : <><b>{count("ready")}</b> ready to import · {count("skipped")} already exist · {count("error")} with errors</>}
              </p>
              {imported && created.length > 0 && (
                <div className="imp-warn">
                  Temporary passwords are shown only now. Download them and share each one privately; people can change it after signing in.
                  <button type="button" className="imp-btn imp-btn--primary" onClick={() => download("new-accounts.csv",
                    "email,temporary password\n" + created.map((r) => `${csvCell(r.email)},${r.tempPassword}`).join("\n"))}>
                    <Download size={14} /> Download passwords
                  </button>
                </div>
              )}
              <div className="imp-table-wrap">
                <table className="imp-table">
                  <thead><tr><th>Row</th><th>Email</th><th>Status</th></tr></thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td className="imp-email">{r.email || "—"}</td>
                        <td><span className={`imp-status imp-status--${r.status}`}>{r.status}</span>{r.message && <span className="imp-msg"> {r.message}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <footer className="imp-footer">
          <button type="button" className="imp-btn" onClick={onClose}>{imported ? "Done" : "Cancel"}</button>
          {!imported && (
            <button type="button" className="imp-btn imp-btn--primary" disabled={busy || count("ready") === 0} onClick={runImport}>
              {busy && results && <Loader2 size={14} className="spin" />} Import {count("ready") || ""}
            </button>
          )}
        </footer>
      </div>

      <style>{`
        .imp-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .imp-card { width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .imp-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .imp-header h3 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--text-primary); }
        .imp-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .imp-body { padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; }
        .imp-note { margin: 0; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; font-size: 0.8rem; color: var(--text-muted); }
        .imp-link { background: none; border: none; padding: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; }
        .imp-drop { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1.1rem; border: 2px dashed var(--border); border-radius: 12px; color: var(--text-secondary); font-size: 0.86rem; font-weight: 600; cursor: pointer; }
        .imp-drop:hover { border-color: var(--accent); color: var(--accent); }
        .imp-error { margin: 0; color: var(--danger); font-size: 0.82rem; }
        .imp-summary { margin: 0; font-size: 0.85rem; color: var(--text-primary); }
        .imp-warn { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; padding: 0.7rem; border-radius: 10px; background: var(--warning-soft, #fef3c7); color: var(--text-primary); font-size: 0.8rem; }
        .imp-table-wrap { border: 1px solid var(--border); border-radius: 10px; overflow: auto; max-height: 300px; }
        .imp-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        .imp-table th { position: sticky; top: 0; background: var(--bg-secondary); text-align: left; padding: 0.4rem 0.6rem; color: var(--text-muted); font-weight: 600; }
        .imp-table td { padding: 0.4rem 0.6rem; border-top: 1px solid var(--border); color: var(--text-primary); vertical-align: top; }
        .imp-email { word-break: break-all; }
        .imp-status { font-weight: 700; text-transform: capitalize; }
        .imp-status--ready, .imp-status--created { color: var(--success-text, #15803d); }
        .imp-status--skipped { color: var(--text-muted); }
        .imp-status--error { color: var(--danger); }
        .imp-msg { color: var(--text-muted); }
        .imp-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
        .imp-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        .imp-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .imp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
