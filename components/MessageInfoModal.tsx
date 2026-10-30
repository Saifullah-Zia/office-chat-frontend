"use client";

import { useEffect, useState } from "react";
import { X, CheckCheck, Check, Loader2, Info } from "lucide-react";
import { apiGet } from "@/lib/api";
import { MessageResponse, ReadReceipt } from "@/types";
import Avatar from "./Avatar";

interface MessageInfoModalProps {
  message: MessageResponse;
  onClose: () => void;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MessageInfoModal({ message, onClose }: MessageInfoModalProps) {
  const [receipts, setReceipts] = useState<ReadReceipt[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<ReadReceipt[]>(`/api/conversations/${message.conversationId}/messages/${message.id}/receipts`)
      .then((r) => { if (!cancelled) setReceipts(r); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [message.conversationId, message.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readBy = receipts?.filter((r) => r.read) ?? [];
  const notRead = receipts?.filter((r) => !r.read) ?? [];

  return (
    <div className="mim-overlay" onClick={onClose}>
      <div className="mim-modal" role="dialog" aria-modal="true" aria-label="Message info" onClick={(e) => e.stopPropagation()}>
        <header className="mim-header">
          <h3><Info size={16} /> Message info</h3>
          <button type="button" className="mim-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="mim-preview">
          <span>{message.content || (message.attachments?.length ? "📎 Attachment" : "Message")}</span>
          <time>Sent {formatWhen(message.createdAt)}</time>
        </div>

        <div className="mim-body">
          {error ? (
            <p className="mim-empty">Couldn&apos;t load read receipts.</p>
          ) : !receipts ? (
            <p className="mim-empty"><Loader2 size={14} className="spin" /> Loading…</p>
          ) : (
            <>
              <h4 className="mim-title mim-title--read"><CheckCheck size={14} /> Read by {readBy.length} of {receipts.length}</h4>
              {readBy.length === 0 && <p className="mim-empty">Nobody yet</p>}
              {readBy.map((r) => (
                <div key={r.userId} className="mim-row">
                  <Avatar name={r.name} size={30} />
                  <span className="mim-name">{r.name}</span>
                  <span className="mim-when">{formatWhen(r.readAt)}</span>
                </div>
              ))}

              {notRead.length > 0 && (
                <>
                  <h4 className="mim-title"><Check size={14} /> Not read yet</h4>
                  {notRead.map((r) => (
                    <div key={r.userId} className="mim-row">
                      <Avatar name={r.name} size={30} />
                      <span className="mim-name">{r.name}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .mim-overlay {
          position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .mim-modal {
          width: 100%; max-width: 380px; max-height: min(560px, 90vh); display: flex; flex-direction: column;
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
          box-shadow: var(--shadow-lg, 0 20px 50px rgba(0,0,0,0.25));
        }
        .mim-header {
          display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--border);
        }
        .mim-header h3 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1rem; color: var(--text-primary); }
        .mim-close { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .mim-close:hover { background: var(--bg-tertiary); }
        .mim-preview {
          margin: 0.75rem 1rem 0; padding: 0.6rem 0.75rem; background: var(--accent-soft); border-radius: 10px;
          display: flex; flex-direction: column; gap: 0.25rem;
        }
        .mim-preview span {
          font-size: 0.84rem; color: var(--text-primary); word-break: break-word;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .mim-preview time { font-size: 0.7rem; color: var(--text-muted); }
        .mim-body { overflow-y: auto; padding: 0.5rem 1rem 1rem; }
        .mim-title {
          display: flex; align-items: center; gap: 0.4rem; margin: 0.85rem 0 0.4rem; font-size: 0.72rem;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint);
        }
        .mim-title--read { color: var(--accent); }
        .mim-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.35rem 0; }
        .mim-name { flex: 1; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
        .mim-when { font-size: 0.72rem; color: var(--text-muted); }
        .mim-empty { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-faint); margin: 0.25rem 0; }
      `}</style>
    </div>
  );
}
