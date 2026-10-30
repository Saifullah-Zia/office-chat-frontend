"use client";

import { useEffect, useState } from "react";
import { X, Hash, Search, Loader2, Check } from "lucide-react";
import { apiGet, apiPost, apiErrorMessage } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ConversationResponse } from "@/types";

interface ChannelSummary {
  id: number;
  name: string;
  description?: string | null;
  memberCount: number;
  isMember: boolean;
}

/** Browse and join the company's public channels. */
export default function ChannelBrowser({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [joiningId, setJoiningId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      apiGet<ChannelSummary[]>("/api/channels", { q: query.trim() || undefined })
        .then((c) => { if (!cancelled) setChannels(c); })
        .catch(() => { if (!cancelled) setChannels([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = (id: number) => {
    useStore.getState().setActiveConversation(id);
    onClose();
  };

  const join = async (c: ChannelSummary) => {
    setJoiningId(c.id);
    try {
      const conv = await apiPost<ConversationResponse>(`/api/channels/${c.id}/join`);
      useStore.getState().upsertConversation(conv);
      open(conv.id);
    } catch (err) {
      alert(apiErrorMessage(err) ?? "Couldn't join this channel.");
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="chb-overlay" onClick={onClose}>
      <div className="chb-modal" role="dialog" aria-modal="true" aria-label="Browse channels" onClick={(e) => e.stopPropagation()}>
        <header className="chb-header">
          <h3><Hash size={17} /> Browse channels</h3>
          <button type="button" className="chb-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="chb-search">
          <Search size={15} />
          <input autoFocus placeholder="Search channels" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="chb-list">
          {channels === null ? (
            <p className="chb-empty"><Loader2 size={14} className="spin" /> Loading…</p>
          ) : channels.length === 0 ? (
            <div className="chb-empty-state">
              <Hash size={30} />
              <p>{query ? "No channels match" : "No public channels yet"}</p>
              <span>Group admins can make a group public in its Group info.</span>
            </div>
          ) : (
            channels.map((c) => (
              <div key={c.id} className="chb-item">
                <div className="chb-icon"><Hash size={18} /></div>
                <div className="chb-text">
                  <span className="chb-name">{c.name}</span>
                  {c.description && <span className="chb-desc">{c.description}</span>}
                  <span className="chb-meta">{c.memberCount} member{c.memberCount !== 1 ? "s" : ""}</span>
                </div>
                {c.isMember ? (
                  <button type="button" className="chb-btn chb-btn--ghost" onClick={() => open(c.id)}><Check size={14} /> Open</button>
                ) : (
                  <button type="button" className="chb-btn" disabled={joiningId === c.id} onClick={() => join(c)}>
                    {joiningId === c.id ? <Loader2 size={14} className="spin" /> : null} Join
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <style>{`
        .chb-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .chb-modal { width: 100%; max-width: 480px; max-height: min(640px, 90vh); display: flex; flex-direction: column; overflow: hidden; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-lg, 0 20px 50px rgba(0,0,0,0.25)); }
        .chb-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .chb-header h3 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1rem; color: var(--text-primary); }
        .chb-close { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .chb-close:hover { background: var(--bg-tertiary); }
        .chb-search { margin: 0.75rem 1rem 0.5rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-secondary); color: var(--text-muted); }
        .chb-search input { flex: 1; border: none; outline: none; background: transparent; font-size: 0.875rem; color: var(--text-primary); }
        .chb-list { flex: 1; overflow-y: auto; padding: 0 0.5rem 0.75rem; }
        .chb-empty { display: flex; align-items: center; gap: 0.4rem; color: var(--text-faint); font-size: 0.82rem; padding: 0.75rem; }
        .chb-empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4rem; padding: 2.5rem 1rem; color: var(--text-faint); }
        .chb-empty-state p { margin: 0; font-weight: 700; color: var(--text-secondary); }
        .chb-empty-state span { font-size: 0.8rem; }
        .chb-item { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem; border-radius: 10px; }
        .chb-item:hover { background: var(--bg-secondary); }
        .chb-icon { width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
        .chb-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .chb-name { font-size: 0.88rem; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chb-desc { font-size: 0.78rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .chb-meta { font-size: 0.72rem; color: var(--text-muted); }
        .chb-btn { display: inline-flex; align-items: center; gap: 0.3rem; border: none; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.78rem; padding: 0.4rem 0.85rem; border-radius: 8px; cursor: pointer; flex-shrink: 0; }
        .chb-btn:disabled { opacity: 0.6; cursor: wait; }
        .chb-btn--ghost { background: var(--bg-tertiary); color: var(--text-primary); }
      `}</style>
    </div>
  );
}
