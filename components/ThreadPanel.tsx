"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, MessagesSquare } from "lucide-react";
import { apiGet, apiPost, apiErrorMessage } from "@/lib/api";
import { useStore } from "@/lib/store";
import { MessageResponse } from "@/types";
import MessageBubble from "./MessageBubble";

interface ThreadPanelProps {
  conversationId: number;
  rootId: number;
  canPost: boolean;
  onClose: () => void;
}

const EMPTY: MessageResponse[] = [];

/** Side panel showing one message and its replies, with its own composer. */
export default function ThreadPanel({ conversationId, rootId, canPost, onClose }: ThreadPanelProps) {
  const userId = useStore((s) => s.userId);
  const messages = useStore((s) => s.threadMessagesByRoot[rootId] ?? EMPTY);
  const setThreadMessages = useStore((s) => s.setThreadMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<MessageResponse[]>(`/api/conversations/${conversationId}/messages/${rootId}/thread`)
      .then((list) => { if (!cancelled) setThreadMessages(rootId, list); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => {
      cancelled = true;
      // Drop the cache so replies to a closed thread don't pile up in memory.
      const next = { ...useStore.getState().threadMessagesByRoot };
      delete next[rootId];
      useStore.setState({ threadMessagesByRoot: next });
    };
  }, [conversationId, rootId, setThreadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const reply = await apiPost<MessageResponse>(`/api/conversations/${conversationId}/messages/${rootId}/thread`, { content });
      useStore.getState().addMessage(reply);
      setText("");
    } catch (err) {
      alert(apiErrorMessage(err) ?? "Couldn't send the reply.");
    } finally {
      setSending(false);
    }
  };

  const [root, ...replies] = messages;

  return (
    <aside className="thp" aria-label="Thread">
      <header className="thp-header">
        <h3><MessagesSquare size={17} /> Thread</h3>
        <button type="button" className="thp-close" onClick={onClose} aria-label="Close thread"><X size={18} /></button>
      </header>

      <div className="thp-body">
        {loadError ? (
          <p className="thp-empty">This thread couldn&apos;t be loaded.</p>
        ) : !root ? (
          <p className="thp-empty"><Loader2 size={14} className="spin" /> Loading…</p>
        ) : (
          <>
            <MessageBubble message={root} isMine={root.senderId === userId} />
            <div className="thp-divider">
              <span>{replies.length === 0 ? "No replies yet" : `${replies.length} repl${replies.length === 1 ? "y" : "ies"}`}</span>
            </div>
            {replies.map((m) => (
              <MessageBubble key={m.id} message={m} isMine={m.senderId === userId} />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {canPost && root && !root.deleted ? (
        <form className="thp-form" onSubmit={send}>
          <input
            className="thp-input"
            placeholder="Reply in thread…"
            maxLength={10000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button type="submit" className="thp-send" disabled={!text.trim() || sending} aria-label="Send reply">
            {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          </button>
        </form>
      ) : (
        <p className="thp-readonly">You can&apos;t reply in this chat.</p>
      )}

      <style>{`
        .thp { width: 380px; max-width: 100%; height: 100%; display: flex; flex-direction: column; flex-shrink: 0; background: var(--bg-primary); border-left: 1px solid var(--border); }
        .thp-header { height: 64px; padding: 0 1rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .thp-header h3 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1rem; color: var(--text-primary); }
        .thp-close { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.35rem; border-radius: 6px; }
        .thp-close:hover { background: var(--bg-tertiary); }
        .thp-body { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; background: var(--chat-wallpaper, var(--bg-secondary)); }
        .thp-divider { display: flex; align-items: center; gap: 0.6rem; margin: 0.75rem 0; color: var(--text-faint); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .thp-divider::before, .thp-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
        .thp-empty { display: flex; align-items: center; gap: 0.4rem; color: var(--text-faint); font-size: 0.85rem; }
        .thp-form { display: flex; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--border); }
        .thp-input { flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: 12px; padding: 0.6rem 0.8rem; font: inherit; font-size: 0.9rem; background: var(--bg-secondary); color: var(--text-primary); outline: none; }
        .thp-input:focus { border-color: var(--accent); }
        .thp-send { width: 40px; border-radius: 12px; border: none; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .thp-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .thp-readonly { margin: 0; padding: 0.85rem; border-top: 1px solid var(--border); text-align: center; font-size: 0.82rem; color: var(--text-muted); }
        @media (max-width: 900px) { .thp { position: absolute; inset: 0; width: 100%; z-index: 30; } }
      `}</style>
    </aside>
  );
}
