"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, X, MessageSquare, Users, User as UserIcon, CornerDownRight, Calendar } from "lucide-react";
import { useStore } from "@/lib/store";
import Avatar from "./Avatar";
import { apiGet, apiPost } from "@/lib/api";
import { ConversationResponse, MessageResponse } from "@/types";

export default function GlobalSearchModal() {
  const isOpen = useStore((s) => s.isGlobalSearchOpen);
  const setOpen = useStore((s) => s.setGlobalSearchOpen);
  const userId = useStore((s) => s.userId);
  const conversations = useStore((s) => s.conversations);
  const setConversations = useStore((s) => s.setConversations);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const users = useStore((s) => s.users);

  const [query, setQuery] = useState("");
  const [filterConv, setFilterConv] = useState<number | "">("");
  const [filterSender, setFilterSender] = useState<number | "">("");
  const [filterHas, setFilterHas] = useState<"" | "link" | "image" | "file" | "voice">("");
  const [filterDate, setFilterDate] = useState<"any" | "today" | "week" | "month">("any");
  const [serverResults, setServerResults] = useState<MessageResponse[]>([]);
  const [searching, setSearching] = useState(false);
  const openChatAt = useStore((s) => s.openChatAt);

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!isOpen);
      } else if (e.key === "Escape" && isOpen) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setOpen]);

  // Reset query on open
  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  const trimmedQuery = query.trim().toLowerCase();

  // 1. Filtered Conversations
  const matchingConvs = useMemo(() => {
    if (!trimmedQuery) return [];
    return conversations.filter((c) => {
      const name = c.type === "GROUP"
        ? (c.name ?? "Group")
        : (c.members.find((m) => m.id !== userId)?.name ?? "Direct");
      return name.toLowerCase().includes(trimmedQuery);
    }).slice(0, 5);
  }, [conversations, trimmedQuery, userId]);

  // 2. Filtered Colleagues / Users
  const matchingUsers = useMemo(() => {
    if (!trimmedQuery) return [];
    return users.filter((u) => {
      if (u.id === userId) return false;
      return (
        u.name.toLowerCase().includes(trimmedQuery) ||
        u.email.toLowerCase().includes(trimmedQuery) ||
        (u.department && u.department.toLowerCase().includes(trimmedQuery))
      );
    }).slice(0, 5);
  }, [users, trimmedQuery, userId]);

  // 3. Messages — searched on the server across ALL history in my chats, with filters
  const hasFilters = !!(filterConv || filterSender || filterHas || filterDate !== "any");
  useEffect(() => {
    if (!isOpen) return;
    const text = query.trim();
    if (text.length < 2 && !hasFilters) {
      // Nothing to search for; clear results asynchronously to avoid a render cascade.
      const t = setTimeout(() => { setServerResults([]); setSearching(false); }, 0);
      return () => clearTimeout(t);
    }
    const from =
      filterDate === "today" ? new Date(new Date().setHours(0, 0, 0, 0))
      : filterDate === "week" ? new Date(Date.now() - 7 * 86400_000)
      : filterDate === "month" ? new Date(Date.now() - 30 * 86400_000)
      : null;
    let cancelled = false;
    const t = setTimeout(() => {
      setSearching(true);
      apiGet<MessageResponse[]>("/api/messages/search", {
        q: text || undefined,
        conversationId: filterConv || undefined,
        senderId: filterSender || undefined,
        has: filterHas || undefined,
        from: from ? from.toISOString() : undefined,
        limit: 30,
      })
        .then((r) => { if (!cancelled) setServerResults(r); })
        .catch(() => { if (!cancelled) setServerResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isOpen, query, filterConv, filterSender, filterHas, filterDate, hasFilters]);

  const matchingMessages = useMemo(
    () =>
      serverResults.map((m) => {
        const conv = conversations.find((c) => c.id === m.conversationId);
        const convName = conv
          ? conv.type === "GROUP"
            ? conv.name ?? "Group"
            : conv.members.find((mm) => mm.id !== userId)?.name ?? "Direct"
          : "Chat";
        return {
          convId: m.conversationId,
          convName,
          // Thread replies aren't in the main timeline: jump to their thread's first message.
          messageId: m.threadRootId ?? m.id,
          resultId: m.id,
          senderName: m.senderName,
          content: m.content || (m.attachments?.[0] ? `📎 ${m.attachments[0].filename ?? m.attachments[0].fileName ?? "Attachment"}` : ""),
          createdAt: m.createdAt,
        };
      }),
    [serverResults, conversations, userId]
  );

  if (!isOpen) return null;

  const handleSelectConv = (convId: number) => {
    setActiveConversation(convId);
    setOpen(false);
  };

  const handleSelectUser = async (targetUserId: number) => {
    try {
      const existing = conversations.find(
        (c) => c.type === "DIRECT" && c.members.some((m) => m.id === targetUserId)
      );
      if (existing) {
        setActiveConversation(existing.id);
      } else {
        const created = await apiPost<ConversationResponse>("/api/conversations/direct", {
          otherUserId: targetUserId,
        });
        setConversations([created, ...conversations]);
        setActiveConversation(created.id);
      }
      setOpen(false);
    } catch (err) {
      console.error("Failed to start direct conversation:", err);
    }
  };

  const totalResults = matchingConvs.length + matchingUsers.length + matchingMessages.length;

  return (
    <div className="gsm-overlay" onClick={() => setOpen(false)}>
      <div className="gsm-shell" onClick={(e) => e.stopPropagation()}>
        {/* Search Input bar */}
        <div className="gsm-input-bar">
          <Search size={18} className="gsm-search-icon" />
          <input
            type="text"
            className="gsm-input"
            placeholder="Search colleagues, channels, or messages (Ctrl+K)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button type="button" className="gsm-clear-btn" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
          <span className="gsm-badge">ESC</span>
        </div>

        {/* Message filters */}
        <div className="gsm-filters">
          <select value={filterConv} onChange={(e) => setFilterConv(e.target.value ? Number(e.target.value) : "")} aria-label="In chat">
            <option value="">All chats</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.type === "GROUP" ? c.name ?? "Group" : c.members.find((m) => m.id !== userId)?.name ?? "Direct"}
              </option>
            ))}
          </select>
          <select value={filterSender} onChange={(e) => setFilterSender(e.target.value ? Number(e.target.value) : "")} aria-label="From">
            <option value="">Anyone</option>
            {userId && <option value={userId}>Me</option>}
            {users.filter((u) => u.id !== userId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={filterHas} onChange={(e) => setFilterHas(e.target.value as typeof filterHas)} aria-label="Contains">
            <option value="">Any type</option>
            <option value="link">Has link</option>
            <option value="image">Has photo</option>
            <option value="file">Has file</option>
            <option value="voice">Voice note</option>
          </select>
          <select value={filterDate} onChange={(e) => setFilterDate(e.target.value as typeof filterDate)} aria-label="Date">
            <option value="any">Any time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>
          {hasFilters && (
            <button type="button" className="gsm-filter-clear" onClick={() => { setFilterConv(""); setFilterSender(""); setFilterHas(""); setFilterDate("any"); }}>
              Clear
            </button>
          )}
        </div>

        {/* Results list */}
        <div className="gsm-results">
          {!trimmedQuery && !hasFilters ? (
            <div className="gsm-hint">
              <p className="gsm-hint-title">Office Global Search</p>
              <p className="gsm-hint-sub">Type a coworker&apos;s name, department, channel, or message keyword.</p>
            </div>
          ) : totalResults === 0 ? (
            <div className="gsm-empty">
              <p>{searching ? "Searching…" : trimmedQuery ? <>No results found for &ldquo;{query}&rdquo;</> : "No messages match these filters"}</p>
            </div>
          ) : (
            <>
              {/* Channels & Chats */}
              {matchingConvs.length > 0 && (
                <div className="gsm-section">
                  <div className="gsm-section-title">
                    <MessageSquare size={13} />
                    <span>Channels &amp; Chats</span>
                  </div>
                  {matchingConvs.map((conv) => {
                    const name = conv.type === "GROUP"
                      ? (conv.name ?? "Group")
                      : (conv.members.find((m) => m.id !== userId)?.name ?? "Direct");
                    return (
                      <button
                        key={conv.id}
                        type="button"
                        className="gsm-item"
                        onClick={() => handleSelectConv(conv.id)}
                      >
                        <div className="gsm-item-left">
                          <Avatar name={name} size={28} />
                          <div className="gsm-item-info">
                            <span className="gsm-item-name">{name}</span>
                            <span className="gsm-item-sub">
                              {conv.type === "GROUP" ? `${conv.members.length} members` : "Direct Message"}
                            </span>
                          </div>
                        </div>
                        <CornerDownRight size={14} className="gsm-arrow-icon" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Colleagues */}
              {matchingUsers.length > 0 && (
                <div className="gsm-section">
                  <div className="gsm-section-title">
                    <Users size={13} />
                    <span>Colleagues</span>
                  </div>
                  {matchingUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="gsm-item"
                      onClick={() => handleSelectUser(u.id)}
                    >
                      <div className="gsm-item-left">
                        <Avatar name={u.name} size={28} />
                        <div className="gsm-item-info">
                          <span className="gsm-item-name">{u.name}</span>
                          <span className="gsm-item-sub">
                            {u.department ? `${u.department} • ` : ""}{u.email}
                          </span>
                        </div>
                      </div>
                      <span className="gsm-dm-tag">Message</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              {matchingMessages.length > 0 && (
                <div className="gsm-section">
                  <div className="gsm-section-title">
                    <Search size={13} />
                    <span>Messages</span>
                  </div>
                  {matchingMessages.map((m) => (
                    <button
                      key={m.resultId}
                      type="button"
                      className="gsm-item gsm-item--message"
                      onClick={() => { openChatAt(m.convId, m.messageId); setOpen(false); }}
                    >
                      <div className="gsm-msg-header">
                        <span className="gsm-msg-conv">{m.convName}</span>
                        <span className="gsm-msg-sender">• {m.senderName}</span>
                        <span className="gsm-msg-sender">
                          • {new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="gsm-msg-snippet">{m.content}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .gsm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 2500;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 10vh;
          animation: gsmFadeIn 0.12s ease;
        }
        .gsm-shell {
          width: 90%;
          max-width: 620px;
          background: var(--surface-card, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 16px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: gsmSlideDown 0.15s ease;
        }
        .gsm-input-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border, #e2e8f0);
        }
        .gsm-search-icon {
          color: var(--accent, #4f46e5);
          flex-shrink: 0;
        }
        .gsm-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 1rem;
          color: var(--text-primary, #0f172a);
          outline: none;
        }
        .gsm-clear-btn {
          background: none;
          border: none;
          color: var(--text-muted, #94a3b8);
          cursor: pointer;
          display: flex;
          padding: 2px;
        }
        .gsm-clear-btn:hover { color: var(--text-primary, #0f172a); }
        .gsm-badge {
          background: var(--bg-tertiary, #f1f5f9);
          border: 1px solid var(--border, #e2e8f0);
          color: var(--text-muted, #64748b);
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .gsm-filters {
          display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0.55rem 1rem; border-bottom: 1px solid var(--border);
        }
        .gsm-filters select {
          flex: 1 1 120px; min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 0.3rem 0.45rem;
          background: var(--bg-secondary); color: var(--text-primary); font-size: 0.76rem;
        }
        .gsm-filter-clear {
          border: none; background: none; color: var(--accent); font-size: 0.76rem; font-weight: 600; cursor: pointer;
        }
        .gsm-results {
          max-height: 440px;
          overflow-y: auto;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .gsm-hint {
          text-align: center;
          padding: 2.5rem 1rem;
          color: var(--text-muted, #94a3b8);
        }
        .gsm-hint-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary, #0f172a);
          margin-bottom: 0.35rem;
        }
        .gsm-hint-sub { font-size: 0.8125rem; margin: 0; }
        .gsm-empty {
          text-align: center;
          padding: 2rem 1rem;
          font-size: 0.875rem;
          color: var(--text-muted, #94a3b8);
        }
        .gsm-section {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .gsm-section-title {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #94a3b8);
          padding: 0.35rem 0.6rem;
        }
        .gsm-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.55rem 0.75rem;
          border-radius: 10px;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.12s;
          text-align: left;
          width: 100%;
        }
        .gsm-item:hover {
          background: var(--bg-secondary, #f8fafc);
        }
        .gsm-item-left {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
        }
        .gsm-item-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .gsm-item-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary, #0f172a);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gsm-item-sub {
          font-size: 0.75rem;
          color: var(--text-muted, #64748b);
        }
        .gsm-arrow-icon {
          color: var(--text-faint, #94a3b8);
          opacity: 0.6;
        }
        .gsm-dm-tag {
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--accent, #4f46e5);
          background: var(--accent-soft, #eef2ff);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .gsm-item--message {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.2rem;
        }
        .gsm-msg-header {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
        }
        .gsm-msg-conv {
          font-weight: 700;
          color: var(--accent, #4f46e5);
        }
        .gsm-msg-sender {
          color: var(--text-muted, #64748b);
        }
        .gsm-msg-snippet {
          font-size: 0.8125rem;
          color: var(--text-primary, #0f172a);
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
        }
        @keyframes gsmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gsmSlideDown { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

