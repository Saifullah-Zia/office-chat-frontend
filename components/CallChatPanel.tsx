"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Paperclip } from "lucide-react";
import { apiErrorMessage, apiGet, postMessage } from "@/lib/api";
import { useStore } from "@/lib/store";
import { showToast } from "@/lib/toast";
import { MessageResponse } from "@/types";
import RichTextRenderer from "./RichTextRenderer";

const EMPTY: MessageResponse[] = [];

/** The call's chat, inside the call window. Messages are the conversation's normal chat. */
export default function CallChatPanel({ conversationId }: { conversationId: number }) {
  const myId = useStore((s) => s.userId);
  const myName = useStore((s) => s.userName);
  const messages = useStore((s) => s.messagesByConv[conversationId] ?? EMPTY);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Load the latest messages and merge with any already here (new ones also arrive live via the store).
  useEffect(() => {
    apiGet<MessageResponse[]>(`/api/conversations/${conversationId}/messages`, { size: 30 })
      .then((list) => {
        const st = useStore.getState();
        const byId = new Map([...list, ...(st.messagesByConv[conversationId] ?? [])].map((m) => [m.id, m]));
        st.setMessages(conversationId, [...byId.values()].sort((a, b) => a.id - b.id));
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const sent = await postMessage<MessageResponse>(`/api/conversations/${conversationId}/messages`, { conversationId, content });
      if (sent) {
        useStore.getState().addMessage(sent);
        setText("");
      }
    } catch (err) {
      showToast(apiErrorMessage(err) ?? "Message not sent.");
    } finally {
      setSending(false);
    }
  };

  const recent = messages.filter((m) => !m.threadRootId).slice(-60);

  return (
    <aside className="ccp" aria-label="Chat in this call">
      <div className="ccp-list" aria-live="polite">
        {recent.length === 0 && <p className="ccp-empty">No messages yet. Links and notes you send here go to the chat.</p>}
        {recent.map((m, i) => {
          const mine = m.senderId === myId;
          const showName = i === 0 || recent[i - 1].senderId !== m.senderId;
          return (
            <div key={m.id} className={`ccp-msg ${mine ? "ccp-msg--mine" : ""}`}>
              {showName && <span className="ccp-name">{mine ? "You" : m.senderName}</span>}
              <div className="ccp-bubble">
                {m.deleted ? <i>This message was deleted</i> : (
                  <>
                    {m.content && <RichTextRenderer content={m.content} isMine={mine} currentUserName={myName ?? undefined} />}
                    {m.attachments?.map((a) => (
                      <span key={a.id} className="ccp-file"><Paperclip size={11} /> {a.fileName ?? a.filename ?? "File"}</span>
                    ))}
                  </>
                )}
                <time>{new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form className="ccp-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message everyone…" maxLength={10000} aria-label="Message" />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Send">
          {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        </button>
      </form>
      <style>{`
        .ccp {
          position: absolute; top: 49px; right: 0; bottom: 84px; width: 300px; max-width: 90%; z-index: 4;
          display: flex; flex-direction: column; background: rgba(15, 23, 42, 0.97); border-left: 1px solid #1e293b;
        }
        .ccp-list { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; }
        .ccp-empty { margin: auto 0; text-align: center; font-size: 0.8rem; color: #94a3b8; }
        .ccp-msg { display: flex; flex-direction: column; align-items: flex-start; max-width: 100%; }
        .ccp-msg--mine { align-items: flex-end; }
        .ccp-name { font-size: 0.7rem; font-weight: 700; color: #94a3b8; margin: 0.35rem 0.2rem 0.1rem; }
        .ccp-bubble { max-width: 92%; padding: 0.4rem 0.6rem; border-radius: 12px; background: #1e293b; color: #f1f5f9; font-size: 0.84rem; word-break: break-word; }
        .ccp-msg--mine .ccp-bubble { background: #4f46e5; }
        .ccp-bubble a { color: #a5b4fc; }
        .ccp-bubble time { display: block; text-align: right; font-size: 0.62rem; opacity: 0.6; margin-top: 0.1rem; }
        .ccp-file { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; opacity: 0.85; }
        .ccp-form { display: flex; gap: 0.4rem; padding: 0.6rem; border-top: 1px solid #1e293b; }
        .ccp-form input { flex: 1; min-width: 0; border: 1px solid #334155; background: #0f172a; color: #f8fafc; border-radius: 10px; padding: 0.5rem 0.65rem; font: inherit; font-size: 0.85rem; outline: none; }
        .ccp-form input:focus { border-color: #6366f1; }
        .ccp-form button { width: 36px; border: none; border-radius: 10px; background: #4f46e5; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .ccp-form button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </aside>
  );
}
