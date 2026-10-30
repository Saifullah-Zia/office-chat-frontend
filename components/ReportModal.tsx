"use client";

import { useEffect, useState } from "react";
import { Flag, X, Loader2, CheckCircle2 } from "lucide-react";
import { apiPost, apiErrorMessage } from "@/lib/api";
import { ReportReason } from "@/types";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam",
  HARASSMENT: "Harassment or bullying",
  INAPPROPRIATE: "Inappropriate content",
  IMPERSONATION: "Impersonation or fraud",
  SECURITY: "Security concern (phishing, malware)",
  OTHER: "Something else",
};

interface ReportModalProps {
  /** Report a specific message (the sender is reported) … */
  messageId?: number;
  messagePreview?: string;
  /** … or a person directly. */
  targetUserId?: number;
  targetName: string;
  /** Offer "Also block" (direct chats). Called after the report is sent. */
  onBlock?: () => void;
  onClose: () => void;
}

export default function ReportModal({ messageId, messagePreview, targetUserId, targetName, onBlock, onClose }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      await apiPost("/api/reports", { messageId, targetUserId, reason, details: details.trim() || undefined });
      if (alsoBlock && onBlock) onBlock();
      setDone(true);
    } catch (err: unknown) {
      setError(apiErrorMessage(err) ?? "Couldn't send the report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rpm-overlay" onClick={onClose}>
      <div className="rpm-modal" role="dialog" aria-modal="true" aria-label="Report" onClick={(e) => e.stopPropagation()}>
        <header className="rpm-header">
          <h3><Flag size={16} /> {messageId ? "Report message" : `Report ${targetName}`}</h3>
          <button type="button" className="rpm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {done ? (
          <div className="rpm-done">
            <CheckCircle2 size={36} />
            <p>Thanks — your report was sent to the admins.</p>
            <span>{targetName} won&apos;t be told who reported them.</span>
            <button type="button" className="rpm-submit" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="rpm-body">
              {messagePreview && <blockquote className="rpm-quote">{messagePreview}</blockquote>}
              <p className="rpm-label">Why are you reporting this?</p>
              <div className="rpm-reasons" role="radiogroup">
                {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
                  <label key={r} className={`rpm-reason ${reason === r ? "rpm-reason--on" : ""}`}>
                    <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
                    {REPORT_REASON_LABELS[r]}
                  </label>
                ))}
              </div>
              <textarea
                className="rpm-details"
                placeholder="Anything else the admins should know? (optional)"
                maxLength={2000}
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
              {onBlock && (
                <label className="rpm-block">
                  <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
                  Also block {targetName}
                </label>
              )}
              {error && <p className="rpm-error">{error}</p>}
            </div>
            <footer className="rpm-footer">
              <button type="button" className="rpm-cancel" onClick={onClose}>Cancel</button>
              <button type="button" className="rpm-submit" disabled={!reason || sending} onClick={submit}>
                {sending && <Loader2 size={14} className="spin" />} Send report
              </button>
            </footer>
          </>
        )}
      </div>

      <style>{`
        .rpm-overlay {
          position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .rpm-modal {
          width: 100%; max-width: 420px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden;
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px;
          box-shadow: var(--shadow-lg, 0 20px 50px rgba(0,0,0,0.25));
        }
        .rpm-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .rpm-header h3 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1rem; color: var(--danger); }
        .rpm-close { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .rpm-close:hover { background: var(--bg-tertiary); }
        .rpm-body { padding: 0.85rem 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; }
        .rpm-quote {
          margin: 0; padding: 0.5rem 0.7rem; border-left: 3px solid var(--danger); background: var(--bg-secondary);
          border-radius: 8px; font-size: 0.82rem; color: var(--text-secondary); word-break: break-word;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .rpm-label { margin: 0; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
        .rpm-reasons { display: flex; flex-direction: column; gap: 0.3rem; }
        .rpm-reason {
          display: flex; align-items: center; gap: 0.55rem; padding: 0.5rem 0.65rem; border: 1px solid var(--border);
          border-radius: 10px; font-size: 0.84rem; color: var(--text-primary); cursor: pointer;
        }
        .rpm-reason--on { border-color: var(--danger); background: var(--danger-soft); }
        .rpm-reason input { accent-color: var(--danger); }
        .rpm-details {
          border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.65rem; font: inherit; font-size: 0.84rem;
          background: var(--bg-secondary); color: var(--text-primary); resize: vertical; outline: none;
        }
        .rpm-details:focus { border-color: var(--accent); }
        .rpm-block { display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; color: var(--text-primary); }
        .rpm-error { margin: 0; color: var(--danger); font-size: 0.8rem; }
        .rpm-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
        .rpm-cancel {
          border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary);
          border-radius: 10px; padding: 0.5rem 0.9rem; font-weight: 600; font-size: 0.84rem; cursor: pointer;
        }
        .rpm-submit {
          display: inline-flex; align-items: center; gap: 0.4rem; border: none; background: var(--danger); color: #fff;
          border-radius: 10px; padding: 0.5rem 1rem; font-weight: 600; font-size: 0.84rem; cursor: pointer;
        }
        .rpm-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .rpm-done { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.5rem; padding: 1.75rem 1.25rem; color: var(--success-text); }
        .rpm-done p { margin: 0; font-weight: 700; color: var(--text-primary); }
        .rpm-done span { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; }
      `}</style>
    </div>
  );
}
