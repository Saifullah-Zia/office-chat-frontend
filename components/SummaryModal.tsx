"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, Loader2, Copy, Check } from "lucide-react";
import { apiErrorMessage, apiPost } from "@/lib/api";

/** "Catch me up": an AI summary of the recent messages in this chat. */
export default function SummaryModal({ conversationId, title, onClose }: {
  conversationId: number;
  title: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    apiPost<{ summary: string }>(`/api/conversations/${conversationId}/summary`)
      .then((r) => { if (alive) setSummary(r.summary); })
      .catch((err) => { if (alive) setError(apiErrorMessage(err) ?? "Couldn't summarize this chat."); });
    return () => { alive = false; };
  }, [conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="smm-overlay" onClick={onClose}>
      <div className="smm-card" role="dialog" aria-modal="true" aria-labelledby="smm-title" onClick={(e) => e.stopPropagation()}>
        <header className="smm-header">
          <h3 id="smm-title"><Sparkles size={16} /> Summary of {title}</h3>
          <button type="button" className="smm-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="smm-body" aria-live="polite">
          {error ? (
            <p className="smm-error">{error}</p>
          ) : summary === null ? (
            <p className="smm-muted"><Loader2 size={14} className="spin" /> Reading the recent messages…</p>
          ) : (
            <div className="smm-text">{summary}</div>
          )}
        </div>
        <footer className="smm-footer">
          <span className="smm-muted">AI-generated from the last 200 messages - check important details.</span>
          {summary && (
            <button type="button" className="smm-btn" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
          )}
        </footer>
      </div>
      <style>{`
        .smm-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .smm-card { width: 100%; max-width: 520px; max-height: 85vh; display: flex; flex-direction: column; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-lg, 0 20px 40px rgba(0,0,0,0.2)); }
        .smm-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.9rem 1rem; border-bottom: 1px solid var(--border); }
        .smm-header h3 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 0.98rem; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .smm-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .smm-body { padding: 1rem; overflow-y: auto; }
        .smm-text { white-space: pre-wrap; font-size: 0.9rem; line-height: 1.55; color: var(--text-primary); }
        .smm-muted { margin: 0; display: flex; align-items: center; gap: 0.4rem; font-size: 0.76rem; color: var(--text-muted); }
        .smm-error { margin: 0; font-size: 0.85rem; color: var(--danger); }
        .smm-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
        .smm-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem; font-weight: 600; cursor: pointer; flex-shrink: 0; }
      `}</style>
    </div>
  );
}
