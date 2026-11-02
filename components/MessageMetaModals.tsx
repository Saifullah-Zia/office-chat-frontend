"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, History, CheckCheck, Loader2 } from "lucide-react";
import { apiErrorMessage, apiGet } from "@/lib/api";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import Avatar from "./Avatar";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Fetches once on open; shared by both dialogs below. */
function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    apiGet<T>(url)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(apiErrorMessage(err) ?? "Couldn't load this."); });
    return () => { alive = false; };
  }, [url]);
  return { data, error };
}

function Shell({ title, icon, onClose, children }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode }) {
  useEscapeKey(onClose);
  return (
    <div className="mmm-overlay" onClick={onClose}>
      <div className="mmm-card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="mmm-header">
          <h3>{icon} {title}</h3>
          <button type="button" className="mmm-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="mmm-body">{children}</div>
      </div>
      <style>{`
        .mmm-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .mmm-card { width: 100%; max-width: 440px; max-height: 80vh; display: flex; flex-direction: column; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .mmm-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .mmm-header h3 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 0.98rem; color: var(--text-primary); }
        .mmm-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .mmm-body { padding: 0.9rem 1rem 1.1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
        .mmm-muted { margin: 0; display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--text-muted); }
        .mmm-error { margin: 0; font-size: 0.85rem; color: var(--danger); }
        .mmm-version { border: 1px solid var(--border); border-radius: 10px; padding: 0.6rem 0.75rem; }
        .mmm-version--current { border-color: var(--accent); background: var(--accent-soft); }
        .mmm-version-meta { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem; }
        .mmm-version p { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 0.88rem; color: var(--text-primary); }
        .mmm-group h4 { margin: 0 0 0.4rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
        .mmm-people { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
        .mmm-people li { display: flex; align-items: center; gap: 0.6rem; font-size: 0.86rem; color: var(--text-primary); }
        .mmm-people li span:nth-child(2) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mmm-people time { font-size: 0.72rem; color: var(--text-muted); }
      `}</style>
    </div>
  );
}

interface Version { content: string; since: string; current: boolean }

export function EditHistoryModal({ messageId, onClose }: { messageId: number; onClose: () => void }) {
  const { data, error } = useLoad<Version[]>(`/api/messages/${messageId}/history`);
  return (
    <Shell title="Edit history" icon={<History size={16} />} onClose={onClose}>
      {error ? <p className="mmm-error">{error}</p> : !data ? <p className="mmm-muted"><Loader2 size={14} className="spin" /> Loading…</p> : (
        [...data].reverse().map((v, i) => (
          <div key={i} className={`mmm-version ${v.current ? "mmm-version--current" : ""}`}>
            <div className="mmm-version-meta">{v.current ? "Current" : i === data.length - 1 ? "Original" : "Earlier version"} · {when(v.since)}</div>
            <p>{v.content || <em>(empty)</em>}</p>
          </div>
        ))
      )}
    </Shell>
  );
}

interface AckPerson { userId: number; name: string; at?: string }

export function AckDetailsModal({ messageId, onClose }: { messageId: number; onClose: () => void }) {
  const { data, error } = useLoad<{ acknowledged: AckPerson[]; pending: AckPerson[] }>(`/api/messages/${messageId}/acks`);
  const list = (title: string, people: AckPerson[]) => (
    <div className="mmm-group">
      <h4>{title} ({people.length})</h4>
      {people.length === 0 ? <p className="mmm-muted">No one</p> : (
        <ul className="mmm-people">
          {people.map((p) => (
            <li key={p.userId}>
              <Avatar userId={p.userId} name={p.name} size={28} />
              <span>{p.name}</span>
              {p.at && <time dateTime={p.at}>{when(p.at)}</time>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <Shell title="Acknowledgements" icon={<CheckCheck size={16} />} onClose={onClose}>
      {error ? <p className="mmm-error">{error}</p> : !data ? <p className="mmm-muted"><Loader2 size={14} className="spin" /> Loading…</p> : (
        <>
          {list("Acknowledged", data.acknowledged)}
          {list("Not yet", data.pending)}
        </>
      )}
    </Shell>
  );
}
