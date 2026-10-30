"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, CheckCircle2, XCircle, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { apiGet, apiPut, apiDelete } from "@/lib/api";
import { ReportView, ReportStatus } from "@/types";
import { REPORT_REASON_LABELS } from "./ReportModal";

interface AdminReportsProps {
  onCountChange: (openCount: number) => void;
}

function when(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

export default function AdminReports({ onCountChange }: AdminReportsProps) {
  const [status, setStatus] = useState<ReportStatus | "ALL">("OPEN");
  const [reports, setReports] = useState<ReportView[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async (s: ReportStatus | "ALL") => {
    setReports(null);
    try {
      setReports(await apiGet<ReportView[]>("/api/admin/reports", { status: s }));
    } catch (err) {
      console.error("Failed to load reports:", err);
      setReports([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet<ReportView[]>("/api/admin/reports", { status })
      .then((r) => { if (!cancelled) setReports(r); })
      .catch(() => { if (!cancelled) setReports([]); });
    return () => { cancelled = true; };
  }, [status]);

  const refreshCount = () =>
    apiGet<{ open: number }>("/api/admin/reports/count").then((r) => onCountChange(r.open)).catch(() => {});

  const resolve = async (report: ReportView, next: ReportStatus) => {
    setBusyId(report.id);
    try {
      await apiPut(`/api/admin/reports/${report.id}`, { status: next, note: notes[report.id] ?? "" });
      await load(status);
      refreshCount();
    } catch (err) {
      console.error("Failed to update report:", err);
      alert("Couldn't update the report.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteMessageAndResolve = async (report: ReportView) => {
    if (!report.messageId || !report.conversationId) return;
    if (!confirm(`Delete this message from ${report.targetUserName} for everyone and resolve the report?`)) return;
    setBusyId(report.id);
    try {
      await apiDelete(`/api/conversations/${report.conversationId}/messages/${report.messageId}`);
      await apiPut(`/api/admin/reports/${report.id}`, {
        status: "RESOLVED",
        note: notes[report.id] || "Message deleted by admin",
      });
      await load(status);
      refreshCount();
    } catch (err) {
      console.error("Failed to delete message:", err);
      alert("Couldn't delete the message.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="arp">
      <div className="arp-filters">
        {(["OPEN", "RESOLVED", "DISMISSED", "ALL"] as const).map((s) => (
          <button key={s} type="button" className={`arp-chip ${status === s ? "arp-chip--on" : ""}`} onClick={() => setStatus(s)}>
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="arp-list">
        {reports === null ? (
          <p className="arp-empty"><Loader2 size={14} className="spin" /> Loading reports…</p>
        ) : reports.length === 0 ? (
          <div className="arp-empty-state">
            <Flag size={30} />
            <p>No {status === "ALL" ? "" : status.toLowerCase()} reports</p>
          </div>
        ) : (
          reports.map((r) => (
            <article key={r.id} className={`arp-card arp-card--${r.status.toLowerCase()}`}>
              <header className="arp-card-head">
                <span className="arp-reason">{REPORT_REASON_LABELS[r.reason] ?? r.reason}</span>
                <span className="arp-when">{when(r.createdAt)}</span>
              </header>
              <p className="arp-line">
                <strong>{r.reporterName}</strong> reported <strong>{r.targetUserName}</strong>
                {r.messageId ? " for a message" : ""}
              </p>
              {r.messageSnapshot && <blockquote className="arp-quote">{r.messageSnapshot}</blockquote>}
              {r.details && <p className="arp-details">“{r.details}”</p>}

              {r.status === "OPEN" ? (
                <>
                  <input
                    className="arp-note"
                    placeholder="Resolution note (optional)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                  <div className="arp-actions">
                    <button type="button" className="arp-btn arp-btn--ok" disabled={busyId === r.id} onClick={() => resolve(r, "RESOLVED")}>
                      <CheckCircle2 size={14} /> Resolve
                    </button>
                    <button type="button" className="arp-btn" disabled={busyId === r.id} onClick={() => resolve(r, "DISMISSED")}>
                      <XCircle size={14} /> Dismiss
                    </button>
                    {r.messageId && (
                      <button type="button" className="arp-btn arp-btn--danger" disabled={busyId === r.id} onClick={() => deleteMessageAndResolve(r)}>
                        <Trash2 size={14} /> Delete message
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="arp-resolved">
                  <span>
                    {r.status === "RESOLVED" ? "Resolved" : "Dismissed"} by {r.resolvedByName ?? "admin"} · {when(r.resolvedAt)}
                    {r.resolutionNote ? ` — ${r.resolutionNote}` : ""}
                  </span>
                  <button type="button" className="arp-btn" disabled={busyId === r.id} onClick={() => resolve(r, "OPEN")}>
                    <RotateCcw size={13} /> Reopen
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <style>{`
        .arp { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .arp-filters { display: flex; gap: 0.4rem; padding: 0.75rem 1.25rem 0.5rem; flex-wrap: wrap; }
        .arp-chip {
          border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-muted);
          padding: 0.3rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; cursor: pointer;
        }
        .arp-chip--on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .arp-list { flex: 1; overflow-y: auto; padding: 0.25rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .arp-empty { display: flex; align-items: center; gap: 0.4rem; color: var(--text-faint); font-size: 0.82rem; }
        .arp-empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2.5rem 0; color: var(--text-faint); }
        .arp-empty-state p { margin: 0; font-weight: 600; }
        .arp-card {
          border: 1px solid var(--border); border-left: 3px solid var(--warning, #f59e0b); border-radius: 12px;
          padding: 0.75rem; background: var(--bg-primary); display: flex; flex-direction: column; gap: 0.4rem;
        }
        .arp-card--resolved { border-left-color: var(--success-text, #16a34a); }
        .arp-card--dismissed { border-left-color: var(--text-faint); }
        .arp-card-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
        .arp-reason {
          font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--danger); background: var(--danger-soft); padding: 2px 8px; border-radius: 999px;
        }
        .arp-when { font-size: 0.72rem; color: var(--text-faint); }
        .arp-line { margin: 0; font-size: 0.84rem; color: var(--text-secondary); }
        .arp-line strong { color: var(--text-primary); }
        .arp-quote {
          margin: 0; padding: 0.45rem 0.6rem; border-left: 3px solid var(--border); background: var(--bg-secondary);
          border-radius: 6px; font-size: 0.8rem; color: var(--text-primary); white-space: pre-wrap; word-break: break-word;
          max-height: 120px; overflow-y: auto;
        }
        .arp-details { margin: 0; font-size: 0.8rem; color: var(--text-muted); font-style: italic; word-break: break-word; }
        .arp-note {
          border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary);
          border-radius: 8px; padding: 0.4rem 0.6rem; font-size: 0.8rem; outline: none;
        }
        .arp-note:focus { border-color: var(--accent); }
        .arp-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .arp-btn {
          display: inline-flex; align-items: center; gap: 0.3rem; border: 1px solid var(--border); background: var(--bg-primary);
          color: var(--text-secondary); font-size: 0.75rem; font-weight: 600; padding: 0.35rem 0.65rem; border-radius: 8px; cursor: pointer;
        }
        .arp-btn:disabled { opacity: 0.5; cursor: wait; }
        .arp-btn--ok { color: var(--success-text); border-color: var(--success-text); }
        .arp-btn--danger { color: var(--danger); border-color: var(--danger); }
        .arp-resolved { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.75rem; color: var(--text-muted); }
      `}</style>
    </div>
  );
}
