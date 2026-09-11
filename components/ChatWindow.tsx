"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Phone, Video, Send, Paperclip, Mic, X, Loader2, Users, Search, Smile, Info, CornerDownRight, Vote, Pin, ChevronRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { apiGet, apiPost, apiPostForm } from "@/lib/api";
import {
  ConversationResponse, MessageResponse, MessageRequest,
  AttachmentResponse, TypingEvent, TypingRequest, MemberResponse,
} from "@/types";
import { subscribe, publish, Topics, Destinations } from "@/lib/socket";
import MessageBubble from "./MessageBubble";
import VoiceRecorder from "./VoiceRecorder";
import Avatar from "./Avatar";
import EmojiPicker from "./EmojiPicker";
import ChatInfoDrawer from "./ChatInfoDrawer";
import CreatePollModal from "./CreatePollModal";
import { useCallContext } from "@/context/CallContext";
import { playMessageChime } from "@/lib/sound";

const EMPTY_MESSAGES: MessageResponse[] = [];
const EMPTY_TYPING = new Set<string>();

interface ChatWindowProps {
  conversationId: number;
}

function formatDateHeader(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function ChatWindow({ conversationId }: ChatWindowProps) {
  const userId = useStore((s) => s.userId);
  const conversations = useStore((s) => s.conversations);
  const activeConv = conversations.find((c) => c.id === conversationId);

  const selectConvMessages = useCallback(
    (s: { messagesByConv: Record<number, MessageResponse[]> }) =>
      s.messagesByConv[conversationId] ?? EMPTY_MESSAGES,
    [conversationId]
  );
  const messages = useStore(selectConvMessages);
  const setMessages = useStore((s) => s.setMessages);
  const addMessage = useStore((s) => s.addMessage);

  const onlineUserIds = useStore((s) => s.onlineUserIds);

  const selectConvTyping = useCallback(
    (s: { typingByConv: Record<number, Set<string>> }) =>
      s.typingByConv[conversationId] ?? EMPTY_TYPING,
    [conversationId]
  );
  const typingUsers = useStore(selectConvTyping);
  const setTyping = useStore((s) => s.setTyping);

  const { initiateCall } = useCallContext();

  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replyMessage, setReplyMessage] = useState<MessageResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Drawer State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(0);

  const userRole = useStore((s) => s.userRole);
  const isReadOnly = (activeConv?.onlyAdminsCanPost || activeConv?.isAnnouncement) && userRole !== "ADMIN";
  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine other member info for direct chats
  const otherMember: MemberResponse | undefined = useMemo(() => {
    if (activeConv?.type === "DIRECT") {
      return activeConv.members.find((m) => m.id !== userId);
    }
    return undefined;
  }, [activeConv, userId]);

  const title = useMemo(() => {
    if (activeConv?.type === "GROUP") return activeConv.name ?? "Group Chat";
    return otherMember?.name ?? "Direct Message";
  }, [activeConv, otherMember]);

  const isOnline = otherMember ? onlineUserIds.has(otherMember.id) : false;

  // Shared attachments across conversation
  const sharedAttachments: AttachmentResponse[] = useMemo(() => {
    const list: AttachmentResponse[] = [];
    messages.forEach((m) => {
      if (m.attachments && m.attachments.length > 0) {
        list.push(...m.attachments);
      }
    });
    return list;
  }, [messages]);

  // Filter messages by search query if search is open
  const filteredMessages = useMemo(() => {
    if (!isSearchOpen || !searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q)
    );
  }, [messages, isSearchOpen, searchQuery]);

  // Load message history & mark conversation read
  useEffect(() => {
    if (!conversationId || isNaN(conversationId)) return;
    setIsLoading(true);
    useStore.getState().clearUnread(conversationId);
    apiPost(`/api/conversations/${conversationId}/read`).catch(() => {});
    apiGet<MessageResponse[]>(`/api/conversations/${conversationId}/messages`)
      .then((msgs) => {
        setMessages(conversationId, msgs);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load messages:", err);
        setIsLoading(false);
      });
  }, [conversationId, setMessages]);

  // Subscribe to realtime conversation updates & typing events via STOMP
  useEffect(() => {
    if (!conversationId) return;
    let subMsg: { unsubscribe: () => void } | null = null;
    let subTyping: { unsubscribe: () => void } | null = null;
    let subRead: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        subMsg = await subscribe(Topics.conversation(conversationId), (frame) => {
          const msg: MessageResponse = JSON.parse(frame.body);
          addMessage(msg);
          if (msg.senderId !== userId) {
            const isMuted = activeConv?.mutedUntil && new Date(activeConv.mutedUntil).getTime() > Date.now();
            if (!isMuted) {
              playMessageChime();
              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && !document.hasFocus()) {
                try {
                  new Notification(msg.senderName, {
                    body: msg.content || "Sent an attachment",
                  });
                } catch {}
              }
            }
          }
        });

        subTyping = await subscribe(Topics.typing(conversationId), (frame) => {
          const ev: TypingEvent = JSON.parse(frame.body);
          if (ev.userId !== userId) {
            setTyping(conversationId, ev.userName, ev.typing);
          }
        });

        subRead = await subscribe(`/topic/conversation.${conversationId}.read`, (frame) => {
          const ev = JSON.parse(frame.body);
          if (ev.userId !== userId) {
            useStore.getState().markAllAsReadInConversation(conversationId);
          }
        });
      } catch (err) {
        console.error("STOMP conversation subscription error:", err);
      }
    })();

    return () => {
      subMsg?.unsubscribe();
      subTyping?.unsubscribe();
      subRead?.unsubscribe();
    };
  }, [conversationId, userId, addMessage, setTyping]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  // Handle Typing Notification
  const notifyTyping = useCallback((isTyping: boolean) => {
    publish(Destinations.typing(conversationId), {
      conversationId,
      typing: isTyping,
    } satisfies TypingRequest).catch(() => {});
  }, [conversationId]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    notifyTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      notifyTyping(false);
    }, 2500);
  };

  // Handle Send Message
  const handleSend = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let trimmed = text.trim();
    if ((!trimmed && !selectedFile) || isUploading) return;

    if (replyMessage) {
      trimmed = `Replying to ${replyMessage.senderName}: "${replyMessage.content.slice(0, 40)}..."\n${trimmed}`;
    }

    let attachmentId: number | undefined = undefined;

    if (selectedFile) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("conversationId", conversationId.toString());
        const att = await apiPostForm<AttachmentResponse>("/api/files/upload", formData);
        attachmentId = att.id;
      } catch (err) {
        console.error("Failed to upload file:", err);
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    const payload: MessageRequest = {
      conversationId,
      content: trimmed,
      attachmentId,
    };

    setText("");
    setSelectedFile(null);
    setReplyMessage(null);
    notifyTyping(false);

    try {
      const sent = await apiPost<MessageResponse>(`/api/conversations/${conversationId}/messages`, payload);
      addMessage(sent);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }, [text, selectedFile, replyMessage, isUploading, conversationId, notifyTyping, addMessage]);

  const handleSendVoiceMessage = async (req: MessageRequest) => {
    try {
      const payload: MessageRequest = {
        conversationId,
        ...req,
      };
      const sent = await apiPost<MessageResponse>(`/api/conversations/${conversationId}/messages`, payload);
      addMessage(sent);
    } catch (err) {
      console.error("Failed to send voice message:", err);
    }
  };

  const typingArray = Array.from(typingUsers);

  // Group filtered messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; msgs: MessageResponse[] }[] = [];
    let currentDate = "";

    filteredMessages.forEach((msg) => {
      const dateStr = formatDateHeader(msg.createdAt);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({ date: dateStr, msgs: [msg] });
      } else {
        groups[groups.length - 1].msgs.push(msg);
      }
    });

    return groups;
  }, [filteredMessages]);

  // ── Tab Badge: update document.title with total unread count ────
  const totalUnread = useStore((s) =>
    s.conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)
  );
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? "99+" : totalUnread}) Office Chat` : "Office Chat";
  }, [totalUnread]);

  // Reset unread on tab focus
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && conversationId) {
        useStore.getState().clearUnread(conversationId);
        apiPost(`/api/conversations/${conversationId}/read`).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [conversationId]);

  return (
    <div className="cw-root">
      <div className="cw-shell">
        {/* Top Header */}
        <header className="cw-header">
          <div className="cw-header-left">
            {activeConv?.type === "GROUP" ? (
              <div className="cw-group-avatar">
                <Users size={20} />
              </div>
            ) : (
              <Avatar name={title} size={40} online={isOnline} />
            )}

            <div className="cw-header-info">
              <h1 className="cw-title">{title}</h1>
              <span className="cw-status">
                {activeConv?.type === "GROUP"
                  ? `${activeConv.members.length} members: ${activeConv.members.map((m) => m.name).join(", ")}`
                  : isOnline
                  ? "Online"
                  : "Offline"}
              </span>
            </div>
          </div>

          <div className="cw-header-actions">
            {/* In-Chat Search Bar Toggle */}
            <button
              className={`cw-action-btn ${isSearchOpen ? "cw-action-btn--active" : ""}`}
              title="Search in conversation"
              onClick={() => {
                setIsSearchOpen(!isSearchOpen);
                if (isSearchOpen) setSearchQuery("");
              }}
            >
              <Search size={18} />
            </button>

            {activeConv?.type === "DIRECT" && otherMember && (
              <>
                <button
                  className="cw-action-btn"
                  title="Start voice call"
                  onClick={() =>
                    initiateCall(conversationId, otherMember.id, otherMember.name, "AUDIO")
                  }
                >
                  <Phone size={18} />
                </button>
                <button
                  className="cw-action-btn cw-action-btn--primary"
                  title="Start video call"
                  onClick={() =>
                    initiateCall(conversationId, otherMember.id, otherMember.name, "VIDEO")
                  }
                >
                  <Video size={18} />
                </button>
              </>
            )}

            {/* Info Drawer Toggle */}
            <button
              className={`cw-action-btn ${isDrawerOpen ? "cw-action-btn--active" : ""}`}
              title="View details"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            >
              <Info size={18} />
            </button>
          </div>
        </header>

        {/* In-Chat Search Sub-Header Bar */}
        {isSearchOpen && (
          <div className="cw-search-subbar">
            <Search size={15} className="cw-search-subicon" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cw-search-subinput"
              autoFocus
            />
            {searchQuery && (
              <span className="cw-search-count">
                {filteredMessages.length} match{filteredMessages.length !== 1 ? "es" : ""}
              </span>
            )}
            <button
              type="button"
              className="cw-search-subclose"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Pinned Messages Banner */}
        {pinnedMessages.length > 0 && (
          <div className="cw-pinned-banner">
            <Pin size={15} className="cw-pinned-icon" />
            <div className="cw-pinned-content">
              <span className="cw-pinned-title">Pinned Message</span>
              <span className="cw-pinned-text">
                {pinnedMessages[pinnedIndex % pinnedMessages.length].senderName}:{" "}
                {pinnedMessages[pinnedIndex % pinnedMessages.length].content || "Attachment"}
              </span>
            </div>
            {pinnedMessages.length > 1 && (
              <button
                type="button"
                className="cw-pinned-next"
                onClick={() => setPinnedIndex((prev) => (prev + 1) % pinnedMessages.length)}
              >
                {pinnedMessages.length} pinned <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}

        {/* Message History Area */}
        <div className="cw-body">
          {isLoading ? (
            /* ── Skeleton Loading State ── */
            <div className="cw-skeleton-container">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`cw-skeleton-row ${i % 2 === 0 ? "cw-skeleton-row--left" : "cw-skeleton-row--right"}`}>
                  {i % 2 === 0 && <div className="skeleton skeleton-circle" style={{ width: 32, height: 32, flexShrink: 0 }} />}
                  <div className="cw-skeleton-bubble">
                    <div className="skeleton skeleton-text--lg" style={{ width: `${60 + Math.random() * 40}%` }} />
                    <div className="skeleton skeleton-text" style={{ width: `${40 + Math.random() * 30}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="cw-empty">
              <div className="cw-empty-icon">
                <Users size={32} />
              </div>
              <p className="cw-empty-title">
                {isSearchOpen && searchQuery ? "No matching messages" : "Start the conversation"}
              </p>
              <p className="cw-empty-sub">
                {isSearchOpen && searchQuery
                  ? "Try searching for a different word"
                  : "Send a message to kick off the chat!"}
              </p>
            </div>
          ) : (
            groupedMessages.map((group, gIdx) => (
              <div key={gIdx} className="cw-date-group">
                <div className="cw-date-divider">
                  <span>{group.date}</span>
                </div>
                {group.msgs.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isMine={msg.senderId === userId}
                    onReply={(m) => setReplyMessage(m)}
                  />
                ))}
              </div>
            ))
          )}

          {/* Typing indicator */}
          {typingArray.length > 0 && (
            <div className="cw-typing">
              <Avatar name={typingArray[0]} size={22} />
              <span className="cw-typing-dots">
                <span />
                <span />
                <span />
              </span>
              <span className="cw-typing-text">
                {typingArray.join(", ")} {typingArray.length === 1 ? "is" : "are"} typing...
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="cw-input-area">
          {/* Reply Quote Bar */}
          {replyMessage && (
            <div className="cw-reply-pill">
              <CornerDownRight size={14} className="cw-reply-icon" />
              <div className="cw-reply-info">
                <span className="cw-reply-sender">Replying to {replyMessage.senderName}</span>
                <span className="cw-reply-text">{replyMessage.content}</span>
              </div>
              <button
                type="button"
                className="cw-reply-remove"
                onClick={() => setReplyMessage(null)}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Selected file preview pill */}
          {selectedFile && (
            <div className="cw-file-pill">
              <Paperclip size={14} />
              <span className="cw-file-name">{selectedFile.name}</span>
              <button
                type="button"
                className="cw-file-remove"
                onClick={() => setSelectedFile(null)}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {isReadOnly ? (
            <div className="cw-readonly-bar">
              🔒 Only administrators can send messages in this channel
            </div>
          ) : isRecordingVoice ? (
            <VoiceRecorder
              conversationId={conversationId}
              onSendVoiceMessage={handleSendVoiceMessage}
              onCancel={() => setIsRecordingVoice(false)}
            />
          ) : (
            <form onSubmit={handleSend} className="cw-form">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />

              <button
                type="button"
                className="cw-input-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach File"
              >
                <Paperclip size={20} />
              </button>

              <button
                type="button"
                className="cw-input-btn"
                onClick={() => setIsPollModalOpen(true)}
                title="Create Poll"
              >
                <Vote size={20} />
              </button>

              <div className="cw-input-wrapper">
                <input
                  type="text"
                  className="cw-text-input"
                  placeholder={`Message ${title}...`}
                  value={text}
                  onChange={handleTextChange}
                />

                {/* Emoji Picker Trigger */}
                <div className="cw-emoji-container">
                  <button
                    type="button"
                    className="cw-input-btn"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    title="Insert Emoji"
                  >
                    <Smile size={20} />
                  </button>

                  {showEmojiPicker && (
                    <EmojiPicker
                      onSelectEmoji={(emoji) => setText((prev) => prev + emoji)}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}
                </div>
              </div>

              <button
                type="button"
                className="cw-input-btn"
                onClick={() => setIsRecordingVoice(true)}
                title="Record Voice Note"
              >
                <Mic size={20} />
              </button>

              <button
                type="submit"
                disabled={(!text.trim() && !selectedFile) || isUploading}
                className="cw-send-btn"
              >
                {isUploading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Sliding Info Right Drawer */}
      {activeConv && (
        <ChatInfoDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          conversation={activeConv}
          myUserId={userId}
          onlineUserIds={onlineUserIds}
          sharedAttachments={sharedAttachments}
        />
      )}

      <style>{`
        .cw-root {
          flex: 1; display: flex; height: 100%; min-width: 0; position: relative; overflow: hidden;
        }
        .cw-shell {
          flex: 1; display: flex; flex-direction: column; height: 100%; min-width: 0; background: var(--bg-primary);
        }
        .cw-header {
          height: 64px; padding: 0 1.5rem; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          background: var(--bg-primary); flex-shrink: 0;
        }
        .cw-header-left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
        .cw-group-avatar {
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg, var(--accent-muted), var(--accent-deep));
          color: var(--accent); display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .cw-header-info { display: flex; flex-direction: column; min-width: 0; }
        .cw-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-status { font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-header-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
        .cw-action-btn {
          width: 36px; height: 36px; border-radius: 8px; background: var(--bg-tertiary);
          color: var(--text-tertiary); display: flex; align-items: center; justify-content: center;
          transition: background 0.15s; border: none; cursor: pointer;
        }
        .cw-action-btn:hover:not(:disabled) { background: var(--bg-inset); color: var(--text-primary); }
        .cw-action-btn--active { background: var(--accent-muted); color: var(--accent); }
        .cw-action-btn--primary { background: var(--accent-muted); color: var(--accent); }
        .cw-action-btn--primary:hover:not(:disabled) { background: var(--accent-deep); }

        .cw-search-subbar {
          display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem;
          background: var(--bg-secondary); border-bottom: 1px solid var(--border); position: relative;
        }
        .cw-search-subicon { color: var(--text-faint); }
        .cw-search-subinput {
          flex: 1; border: none; background: none; font-size: 0.84375rem; color: var(--text-primary); outline: none;
        }
        .cw-search-count { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }
        .cw-search-subclose { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; }

        .cw-pinned-banner {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.5rem 1.25rem; background: var(--surface-card);
          border-bottom: 1px solid var(--border); z-index: 5;
        }
        .cw-pinned-icon { color: var(--accent); flex-shrink: 0; }
        .cw-pinned-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cw-pinned-title { font-size: 0.6875rem; font-weight: 700; color: var(--accent); text-transform: uppercase; }
        .cw-pinned-text {
          font-size: 0.8125rem; color: var(--text-primary); font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cw-pinned-next {
          background: var(--bg-secondary); border: 1px solid var(--border);
          color: var(--text-muted); padding: 0.25rem 0.6rem; border-radius: 999px;
          font-size: 0.72rem; font-weight: 600; cursor: pointer;
          display: flex; align-items: center; gap: 0.25rem;
        }
        .cw-search-subclose:hover { color: var(--text-primary); }

        .cw-body {
          flex: 1; overflow-y: auto; padding: 1.5rem;
          display: flex; flex-direction: column; background: var(--bg-secondary);
        }

        /* Skeleton loading */
        .cw-skeleton-container { display: flex; flex-direction: column; gap: 1.25rem; padding: 1rem 0; }
        .cw-skeleton-row { display: flex; align-items: flex-end; gap: 0.5rem; }
        .cw-skeleton-row--left { justify-content: flex-start; }
        .cw-skeleton-row--right { justify-content: flex-end; }
        .cw-skeleton-bubble { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 1rem; border-radius: 16px; background: var(--bg-tertiary); min-width: 120px; max-width: 260px; width: 45%; }

        .cw-empty {
          margin: auto; text-align: center; color: var(--text-faint); display: flex;
          flex-direction: column; align-items: center; max-width: 280px;
        }
        .cw-empty-icon {
          width: 56px; height: 56px; border-radius: 16px; background: var(--accent-soft);
          color: var(--accent); display: flex; align-items: center; justify-content: center;
          margin-bottom: 1rem;
        }
        .cw-empty-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.25rem; }
        .cw-empty-sub { font-size: 0.8125rem; color: var(--text-muted); margin: 0; }

        .cw-date-group { display: flex; flex-direction: column; }
        .cw-date-divider {
          display: flex; align-items: center; justify-content: center;
          margin: 1rem 0 0.75rem; position: relative;
        }
        .cw-date-divider::before {
          content: ""; position: absolute; left: 0; right: 0; top: 50%;
          height: 1px; background: var(--border); z-index: 0;
        }
        .cw-date-divider span {
          position: relative; z-index: 1; background: var(--bg-primary);
          border: 1px solid var(--border); border-radius: 999px;
          padding: 0.2rem 0.75rem; font-size: 0.6875rem; font-weight: 600;
          color: var(--text-muted); box-shadow: var(--shadow-sm);
        }

        .cw-typing {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;
        }
        .cw-typing-dots { display: flex; gap: 3px; }
        .cw-typing-dots span {
          width: 4px; height: 4px; border-radius: 50%; background: var(--text-faint);
          animation: typingPulse 1s infinite alternate;
        }
        .cw-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .cw-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingPulse { from { opacity: 0.3; } to { opacity: 1; } }

        .cw-input-area {
          padding: 1rem 1.25rem; background: var(--surface-card);
          border-top: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 0.75rem;
          position: relative;
        }

        .cw-readonly-bar {
          padding: 0.85rem; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: 12px;
          text-align: center; font-size: 0.875rem; color: var(--text-muted);
          font-weight: 500;
        }
        .cw-reply-pill {
          display: flex; align-items: center; gap: 0.625rem;
          background: var(--bg-tertiary); border-left: 3px solid var(--accent);
          padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.8125rem;
        }
        .cw-reply-icon { color: var(--accent); flex-shrink: 0; }
        .cw-reply-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cw-reply-sender { font-weight: 700; color: var(--accent); font-size: 0.75rem; }
        .cw-reply-text { color: var(--text-tertiary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size: 0.8125rem; }
        .cw-reply-remove { background: none; border: none; color: var(--text-faint); cursor: pointer; }

        .cw-file-pill {
          display: inline-flex; align-items: center; gap: 0.5rem;
          background: var(--info-soft); color: var(--info); border: 1px solid var(--info-border);
          padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.8125rem;
          align-self: flex-start;
        }
        .cw-file-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-file-remove { color: var(--info); cursor: pointer; display: flex; background: none; border: none; }
        .cw-form { display: flex; align-items: center; gap: 0.75rem; width: 100%; }
        .cw-input-btn { color: var(--text-muted); padding: 0.5rem; border-radius: 8px; background: none; border: none; cursor: pointer; display: flex; }
        .cw-input-btn:hover { color: var(--text-primary); background: var(--bg-tertiary); }
        .cw-input-wrapper { flex: 1; display: flex; align-items: center; position: relative; }
        .cw-text-input {
          width: 100%; padding: 0.75rem 2.75rem 0.75rem 1rem; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: 12px; font-size: 0.9375rem; color: var(--text-primary);
        }
        .cw-text-input:focus { border-color: var(--accent); background: var(--bg-primary); outline: none; }
        .cw-emoji-container { position: absolute; right: 0.35rem; display: flex; align-items: center; }
        .cw-send-btn {
          width: 42px; height: 42px; border-radius: 12px; border: none;
          background: var(--accent); color: var(--text-on-accent); display: flex;
          align-items: center; justify-content: center; transition: background 0.15s; cursor: pointer;
        }
        .cw-send-btn:hover:not(:disabled) { background: var(--accent-hover); }
        .cw-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      
      <CreatePollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        conversationId={conversationId!}
        onPollCreated={(msg) => addMessage(msg)}
      />
    </div>
  );
}
