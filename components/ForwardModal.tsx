"use client";

import { useMemo, useState } from "react";
import { X, Search, Check, Loader2, Forward, Users } from "lucide-react";
import { apiPost } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ConversationResponse, MessageResponse } from "@/types";
import Avatar from "./Avatar";

const MAX_TARGETS = 5;

interface ForwardModalProps {
  message: MessageResponse;
  onClose: () => void;
}

function displayName(conv: ConversationResponse, myId: number | null): string {
  if (conv.type === "GROUP") return conv.name ?? "Group";
  return conv.members.find((m) => m.id !== myId)?.name ?? "Direct Message";
}

function canPostIn(conv: ConversationResponse, myId: number | null, myRole: string | null): boolean {
  if (conv.blockedByMe || conv.blockedMe) return false;
  if (conv.onlyAdminsCanPost || conv.isAnnouncement) {
    return myRole === "ADMIN" || (myId !== null && !!conv.adminIds?.includes(myId));
  }
  return true;
}

export default function ForwardModal({ message, onClose }: ForwardModalProps) {
  const userId = useStore((s) => s.userId);
  const userRole = useStore((s) => s.userRole);
  const conversations = useStore((s) => s.conversations);
  const addMessage = useStore((s) => s.addMessage);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...conversations]
      .filter((c) => canPostIn(c, userId, userRole))
      .filter((c) => !q || displayName(c, userId).toLowerCase().includes(q))
      .sort((a, b) => {
        const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tB - tA;
      });
  }, [conversations, search, userId, userRole]);

  const toggle = (id: number) => {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_TARGETS) {
        setError(`You can forward to up to ${MAX_TARGETS} chats at a time`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSend = async () => {
    if (selected.length === 0) return;
    setIsSending(true);
    setError(null);
    try {
      const sent = await apiPost<MessageResponse[]>(`/api/messages/${message.id}/forward`, {
        conversationIds: selected,
      });
      // Updates previews for chats that aren't open (the open one also gets it over STOMP).
      sent.forEach(addMessage);
      onClose();
    } catch (err) {
      console.error("Failed to forward message:", err);
      setError("Couldn't forward the message. You may not be allowed to post in one of those chats.");
    } finally {
      setIsSending(false);
    }
  };

  const preview =
    message.content ||
    (message.attachments?.length ? `📎 ${message.attachments[0].filename ?? message.attachments[0].originalName ?? "Attachment"}` : "Message");

  return (
    <div className="fwd-overlay" onClick={onClose}>
      <div className="fwd-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Forward message">
        <header className="fwd-header">
          <h3><Forward size={17} /> Forward message</h3>
          <button type="button" className="fwd-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="fwd-preview">{preview}</div>

        <div className="fwd-search">
          <Search size={15} />
          <input
            autoFocus
            placeholder="Search chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="fwd-list">
          {targets.length === 0 ? (
            <p className="fwd-empty">No chats found</p>
          ) : (
            targets.map((c) => {
              const isSel = selected.includes(c.id);
              const name = displayName(c, userId);
              const other = c.type === "DIRECT" ? c.members.find((m) => m.id !== userId) : undefined;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`fwd-item ${isSel ? "fwd-item--on" : ""}`}
                  onClick={() => toggle(c.id)}
                >
                  {c.type === "GROUP" ? (
                    <div className="fwd-group-icon"><Users size={16} /></div>
                  ) : (
                    <Avatar name={name} src={other?.profilePicUrl} size={36} />
                  )}
                  <div className="fwd-item-text">
                    <span className="fwd-item-name">{name}</span>
                    <span className="fwd-item-sub">
                      {c.type === "GROUP" ? `${c.members.length} members` : other?.email}
                    </span>
                  </div>
                  <span className={`fwd-check ${isSel ? "fwd-check--on" : ""}`}>{isSel && <Check size={13} />}</span>
                </button>
              );
            })
          )}
        </div>

        {error && <p className="fwd-error">{error}</p>}

        <footer className="fwd-footer">
          <span className="fwd-count">
            {selected.length === 0 ? "Select chats" : `${selected.length} selected`}
          </span>
          <button type="button" className="fwd-send" disabled={selected.length === 0 || isSending} onClick={handleSend}>
            {isSending ? <Loader2 size={16} className="spin" /> : <Forward size={16} />}
            Forward
          </button>
        </footer>
      </div>

      <style>{`
        .fwd-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); z-index: 1000;
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .fwd-modal {
          width: 100%; max-width: 420px; max-height: min(640px, 90vh); background: var(--bg-primary);
          border-radius: 16px; box-shadow: var(--shadow-lg, 0 20px 50px rgba(0,0,0,0.25));
          display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border);
        }
        .fwd-header {
          display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1rem;
          border-bottom: 1px solid var(--border);
        }
        .fwd-header h3 {
          display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1rem; font-weight: 700;
          color: var(--text-primary);
        }
        .fwd-close {
          background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.3rem;
          border-radius: 6px; display: flex;
        }
        .fwd-close:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .fwd-preview {
          margin: 0.75rem 1rem 0; padding: 0.55rem 0.75rem; border-left: 3px solid var(--accent);
          background: var(--bg-secondary); border-radius: 8px; font-size: 0.8125rem; color: var(--text-secondary);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
          word-break: break-word;
        }
        .fwd-search {
          margin: 0.75rem 1rem 0.5rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
          border: 1px solid var(--border); border-radius: 10px; background: var(--bg-secondary); color: var(--text-muted);
        }
        .fwd-search input {
          flex: 1; border: none; outline: none; background: transparent; font-size: 0.875rem; color: var(--text-primary);
        }
        .fwd-list { flex: 1; overflow-y: auto; padding: 0 0.5rem; }
        .fwd-empty { text-align: center; color: var(--text-faint); font-size: 0.8125rem; padding: 1.5rem 0; }
        .fwd-item {
          display: flex; align-items: center; gap: 0.7rem; width: 100%; padding: 0.5rem; border: none;
          background: none; border-radius: 10px; cursor: pointer; text-align: left;
        }
        .fwd-item:hover { background: var(--bg-secondary); }
        .fwd-item--on { background: var(--accent-soft); }
        .fwd-item--on:hover { background: var(--accent-soft); }
        .fwd-group-icon {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center;
          justify-content: center; background: linear-gradient(135deg, var(--accent-muted), var(--accent-deep));
          color: var(--accent);
        }
        .fwd-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .fwd-item-name {
          font-size: 0.875rem; font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fwd-item-sub {
          font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fwd-check {
          width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; color: #fff;
        }
        .fwd-check--on { background: var(--accent); border-color: var(--accent); }
        .fwd-error { margin: 0.5rem 1rem 0; color: var(--danger); font-size: 0.78rem; }
        .fwd-footer {
          display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem;
          border-top: 1px solid var(--border);
        }
        .fwd-count { font-size: 0.8125rem; color: var(--text-muted); }
        .fwd-send {
          display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; border-radius: 10px;
          border: none; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.875rem; cursor: pointer;
        }
        .fwd-send:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
