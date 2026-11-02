"use client";

import { useEffect, useState } from "react";
import { X, Zap, Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { apiDelete, apiErrorMessage, apiPost, apiPut } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { QuickReply, invalidateQuickReplies, loadQuickReplies } from "@/lib/templates";

interface Draft { id?: number; shortcut: string; title: string; content: string; shared: boolean }
const EMPTY: Draft = { shortcut: "", title: "", content: "", shared: false };

/** Create, edit and delete quick replies (inserted in the composer with "/shortcut"). */
export default function QuickRepliesModal({ onClose, onChanged }: { onClose: () => void; onChanged: (list: QuickReply[]) => void }) {
  useEscapeKey(onClose);
  const isAdmin = useStore((s) => s.userRole) === "ADMIN";
  const [list, setList] = useState<QuickReply[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadQuickReplies().then(setList); }, []);

  const refresh = async () => {
    invalidateQuickReplies();
    const fresh = await loadQuickReplies();
    setList(fresh);
    onChanged(fresh);
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body = { shortcut: draft.shortcut, title: draft.title, content: draft.content, shared: draft.shared };
      if (draft.id) await apiPut(`/api/templates/${draft.id}`, body);
      else await apiPost("/api/templates", body);
      setDraft(null);
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: QuickReply) => {
    if (!confirm(`Delete /${t.shortcut}?`)) return;
    try {
      await apiDelete(`/api/templates/${t.id}`);
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't delete.");
    }
  };

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-card" role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={(e) => e.stopPropagation()}>
        <header className="qr-header">
          <h3 id="qr-title"><Zap size={16} /> Quick replies</h3>
          <button type="button" className="qr-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="qr-body">
          {draft ? (
            <div className="qr-form">
              <label>Shortcut
                <div className="qr-shortcut"><span>/</span>
                  <input value={draft.shortcut} maxLength={30} placeholder="thanks" autoFocus
                    onChange={(e) => setDraft({ ...draft, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
                </div>
              </label>
              <label>Name (optional)
                <input value={draft.title} maxLength={80} placeholder="Thank-you reply" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <label>Reply text
                <textarea rows={5} maxLength={5000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
              </label>
              {isAdmin && !draft.id && (
                <label className="qr-check">
                  <input type="checkbox" checked={draft.shared} onChange={(e) => setDraft({ ...draft, shared: e.target.checked })} />
                  Share with everyone in the company
                </label>
              )}
              {error && <p className="qr-error" role="alert">{error}</p>}
              <div className="qr-actions">
                <button type="button" className="qr-btn" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
                <button type="button" className="qr-btn qr-btn--primary" disabled={busy || !draft.shortcut || !draft.content.trim()} onClick={save}>
                  {busy && <Loader2 size={14} className="spin" />} Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="qr-hint">Type <kbd>/</kbd> in any chat to pick one. Enter or Tab inserts it.</p>
              {error && <p className="qr-error" role="alert">{error}</p>}
              {list === null ? <p className="qr-hint"><Loader2 size={14} className="spin" /> Loading…</p> : list.length === 0 ? (
                <p className="qr-empty">No quick replies yet.</p>
              ) : (
                <ul className="qr-list">
                  {list.map((t) => (
                    <li key={t.id}>
                      <div className="qr-item-text">
                        <span className="qr-item-top"><code>/{t.shortcut}</code> {t.title !== t.shortcut && t.title}
                          {t.shared && <span className="qr-pill"><Users size={11} /> Shared</span>}</span>
                        <span className="qr-item-preview">{t.content}</span>
                      </div>
                      {t.editable && (
                        <>
                          <button type="button" className="qr-icon" aria-label={`Edit /${t.shortcut}`}
                            onClick={() => setDraft({ id: t.id, shortcut: t.shortcut, title: t.title, content: t.content, shared: t.shared })}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="qr-icon qr-icon--danger" aria-label={`Delete /${t.shortcut}`} onClick={() => remove(t)}>
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="qr-btn qr-btn--primary qr-new" onClick={() => setDraft(EMPTY)}><Plus size={15} /> New quick reply</button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .qr-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .qr-card { width: 100%; max-width: 480px; max-height: 85vh; display: flex; flex-direction: column; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .qr-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .qr-header h3 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--text-primary); }
        .qr-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.35rem; border-radius: 6px; flex-shrink: 0; }
        .qr-icon:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .qr-icon--danger:hover { color: var(--danger); }
        .qr-body { padding: 0.9rem 1rem 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
        .qr-hint { margin: 0; display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--text-muted); }
        .qr-hint kbd { padding: 0 0.35rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-secondary); }
        .qr-empty { margin: 0; padding: 1.25rem; text-align: center; color: var(--text-faint); font-size: 0.85rem; }
        .qr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
        .qr-list li { display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 0.6rem; border: 1px solid var(--border); border-radius: 10px; }
        .qr-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
        .qr-item-top { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); flex-wrap: wrap; }
        .qr-item-top code { color: var(--accent); }
        .qr-pill { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.65rem; padding: 1px 6px; border-radius: 999px; background: var(--bg-tertiary); color: var(--text-muted); }
        .qr-item-preview { font-size: 0.78rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .qr-form { display: flex; flex-direction: column; gap: 0.65rem; }
        .qr-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
        .qr-form input, .qr-form textarea { padding: 0.5rem 0.65rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-weight: 400; font-size: 0.86rem; }
        .qr-form textarea { resize: vertical; }
        .qr-shortcut { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-secondary); padding-left: 0.6rem; color: var(--accent); font-weight: 700; }
        .qr-shortcut input { flex: 1; border: none; background: none; padding-left: 0.15rem; }
        .qr-form .qr-check { flex-direction: row; align-items: center; gap: 0.45rem; font-weight: 500; }
        .qr-error { margin: 0; color: var(--danger); font-size: 0.8rem; }
        .qr-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
        .qr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.5rem 0.9rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        .qr-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .qr-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .qr-new { align-self: flex-start; }
      `}</style>
    </div>
  );
}
