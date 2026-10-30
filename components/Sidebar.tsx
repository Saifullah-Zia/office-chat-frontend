"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare, Users, Search, LogOut, Plus, UsersRound, Moon, Sun, BellOff, Star, X, Shield,
  Pin, Archive, ArchiveRestore, MoreVertical, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video,
  Settings, ChevronLeft, CheckCheck, Bell, Hash,
} from "lucide-react";
import ChannelBrowser from "./ChannelBrowser";
import { useStore } from "@/lib/store";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import {
  ConversationResponse, UserResponse, PresenceEvent, MemberResponse, MessageResponse, CallResponse,
  ReminderView, TaskView,
} from "@/types";
import { subscribe, Topics, disconnectStomp } from "@/lib/socket";
import { clearAuth } from "@/lib/auth";
import { playMessageChime } from "@/lib/sound";
import { desktopNotify } from "@/lib/notify";
import { showToast } from "@/lib/toast";
import ActivityPanel, { ActivityTab } from "./ActivityPanel";
import Avatar from "./Avatar";
import AddUserModal from "./AddUserModal";
import AdminPanel from "./AdminPanel";
import CreateGroupModal from "./CreateGroupModal";
import SettingsModal from "./SettingsModal";
import { useTheme } from "@/hooks/useTheme";
import { useCallContext } from "@/context/CallContext";

/* ── helpers ──────────────────────────────────────────────────────────── */

function getDisplayName(conv: ConversationResponse, myUserId: number | null): string {
  if (conv.type === "GROUP") return conv.name ?? "Group Chat";
  const other = conv.members.find((m: MemberResponse) => m.id !== myUserId);
  return other?.name ?? "Unknown";
}

function getOtherMember(conv: ConversationResponse, myUserId: number | null): MemberResponse | undefined {
  if (conv.type === "GROUP") return undefined;
  return conv.members.find((m: MemberResponse) => m.id !== myUserId);
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function callDuration(call: CallResponse): string {
  if (!call.answeredAt || !call.endedAt) return "";
  const secs = Math.max(0, Math.round((new Date(call.endedAt).getTime() - new Date(call.answeredAt).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function isMutedConv(conv: ConversationResponse): boolean {
  return !!conv.mutedUntil && new Date(conv.mutedUntil).getTime() > Date.now();
}

const STATUS_PRESETS = [
  { emoji: "🟢", text: "Available" },
  { emoji: "🗓️", text: "In a Meeting" },
  { emoji: "🥪", text: "Out for Lunch" },
  { emoji: "🔕", text: "Focus Mode / DND" },
  { emoji: "✈️", text: "Out of Office / Leave" },
];

/* ── component ────────────────────────────────────────────────────────── */

export default function Sidebar() {
  const router = useRouter();
  const { theme, setTheme, toggleTheme } = useTheme();
  const { initiateCall } = useCallContext();
  const drafts             = useStore((s) => s.drafts);
  const upsertConversation = useStore((s) => s.upsertConversation);
  const [showArchived, setShowArchived] = useState(false);
  const [menuConvId, setMenuConvId]     = useState<number | null>(null);
  const [calls, setCalls]               = useState<CallResponse[] | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activityTab, setActivityTab]   = useState<ActivityTab | null>(null);
  const [isChannelsOpen, setIsChannelsOpen] = useState(false);
  const [activityCount, setActivityCount] = useState(0);
  const activityUserId = useStore((s) => s.userId);

  /* ── activity badge: unseen mentions + due reminders + open tasks assigned by others ── */
  const refreshActivity = useCallback(async () => {
    const userId = activityUserId;
    if (!userId) return;
    try {
      const [mentions, reminders, tasks] = await Promise.all([
        apiGet<MessageResponse[]>("/api/messages/mentions", { limit: 50 }),
        apiGet<ReminderView[]>("/api/reminders"),
        apiGet<TaskView[]>("/api/tasks", { scope: "assigned" }),
      ]);
      let seen = 0;
      try { seen = new Date(localStorage.getItem(`office_mentions_seen_${userId}`) ?? 0).getTime() || 0; } catch {}
      const unseenMentions = mentions.filter((m) => new Date(m.createdAt).getTime() > seen).length;
      const dueReminders = reminders.filter((r) => r.status === "FIRED").length;
      const openFromOthers = tasks.filter((t) => t.status === "OPEN" && t.createdBy !== userId).length;
      setActivityCount(unseenMentions + dueReminders + openFromOthers);
    } catch {}
  }, [activityUserId]);

  useEffect(() => {
    // Initial badge count; a fetch callback, not a synchronous setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshActivity();
  }, [refreshActivity]);

  /* ── live reminders & task assignments (private queues) ───────────── */
  useEffect(() => {
    if (!activityUserId) return;
    let subR: { unsubscribe: () => void } | null = null;
    let subT: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        subR = await subscribe("/user/queue/reminders", (frame) => {
          const r: ReminderView = JSON.parse(frame.body);
          const text = r.note || (r.messageSnippet ? `${r.messageSender}: ${r.messageSnippet}` : "Reminder");
          showToast(`⏰ Reminder: ${text}`);
          playMessageChime();
          desktopNotify("⏰ Reminder", text, {
            tag: `reminder-${r.id}`,
            onClick: () => r.conversationId && useStore.getState().openChatAt(r.conversationId, r.messageId),
          });
          refreshActivity();
        });
        subT = await subscribe("/user/queue/tasks", (frame) => {
          const t: TaskView = JSON.parse(frame.body);
          showToast(`📋 ${t.createdByName} assigned you a task: ${t.title}`);
          desktopNotify(`New task from ${t.createdByName}`, t.title, { tag: `task-${t.id}` });
          refreshActivity();
        });
      } catch (err) {
        console.error("Activity subscription error:", err);
      }
    })();
    return () => { subR?.unsubscribe(); subT?.unsubscribe(); };
  }, [activityUserId, refreshActivity]);

  const userId    = useStore((s) => s.userId);
  const userName  = useStore((s) => s.userName);
  const userRole  = useStore((s) => s.userRole);

  const conversations       = useStore((s) => s.conversations);
  const setConversations     = useStore((s) => s.setConversations);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const setActiveConversation = useStore((s) => s.setActiveConversation);

  const users    = useStore((s) => s.users);
  const setUsers = useStore((s) => s.setUsers);

  const onlineUserIds = useStore((s) => s.onlineUserIds);
  const initOnline    = useStore((s) => s.initOnline);
  const setOnline     = useStore((s) => s.setOnline);
  const setOffline    = useStore((s) => s.setOffline);

  const userStatus          = useStore((s) => s.userStatus);
  const setUserStatus       = useStore((s) => s.setUserStatus);
  const setStatusForUser    = useStore((s) => s.setStatusForUser);
  const setGlobalSearchOpen = useStore((s) => s.setGlobalSearchOpen);
  const starredMessages     = useStore((s) => s.starredMessages);
  const loadStarred         = useStore((s) => s.loadStarred);
  const setLastSeen         = useStore((s) => s.setLastSeen);
  const statusesByUserId    = useStore((s) => s.statusesByUserId);

  const [tab, setTab]                     = useState<"chats" | "directory" | "starred" | "calls">("chats");
  const [search, setSearch]               = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen]     = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isAdminOpen, setIsAdminOpen]         = useState(false);

  /* ── initial data ────────────────────────────────────────────────── */
  useEffect(() => {
    apiGet<ConversationResponse[]>("/api/conversations")
      .then((convs) => {
        setConversations(convs);
      })
      .catch(console.error);

    apiGet<UserResponse[]>("/api/users")
      .then(setUsers)
      .catch(console.error);

    apiGet<number[]>("/api/presence/online")
      .then((ids) => { if (Array.isArray(ids)) initOnline(ids); })
      .catch(console.error);

    loadStarred();
  }, [setConversations, setUsers, initOnline, setActiveConversation, loadStarred]);

  /* ── presence websocket ──────────────────────────────────────────── */
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        sub = await subscribe(Topics.presence(), (frame) => {
          const ev: PresenceEvent = JSON.parse(frame.body);
          if (ev.status === "ONLINE") setOnline(ev.userId);
          else {
            setOffline(ev.userId);
            setLastSeen(ev.userId, ev.lastSeenAt ?? new Date().toISOString());
          }
        });
      } catch (err) {
        console.error("Presence subscription error:", err);
      }
    })();
    return () => { sub?.unsubscribe(); };
  }, [setOnline, setOffline, setLastSeen]);

  /* ── new messages in ANY of my chats (private queue) ─────────────── */
  useEffect(() => {
    if (!userId) return;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        sub = await subscribe("/user/queue/messages", (frame) => {
          const msg: MessageResponse = JSON.parse(frame.body);
          const state = useStore.getState();
          // The open chat handles its own messages via the conversation topic.
          if (msg.conversationId === state.activeConversationId) return;

          const conv = state.conversations.find((c) => c.id === msg.conversationId);
          if (!conv) {
            // New chat, or one I had deleted that a message brought back.
            apiGet<ConversationResponse>(`/api/conversations/${msg.conversationId}`)
              .then((c) => state.upsertConversation(c))
              .catch(() => {});
          } else {
            state.addMessage(msg);
            if (msg.senderId !== userId) state.incrementUnread(msg.conversationId);
          }

          if (msg.senderId === userId) return;
          const me = (useStore.getState().userName ?? "").toLowerCase();
          const text = (msg.content ?? "").toLowerCase();
          const mentionsMe = (me && (text.includes(`@${me}`) || text.startsWith(`replying to ${me}:`)))
            || (conv?.type === "GROUP" && (text.includes("@all") || text.includes("@here")));
          if (mentionsMe) setActivityCount((n) => n + 1);
          // Mentions still alert in muted chats (like WhatsApp); plain messages don't.
          if (conv && isMutedConv(conv) && !mentionsMe) return;
          playMessageChime();
          desktopNotify(
            conv?.type === "GROUP" ? `${msg.senderName} · ${conv.name ?? "Group"}` : msg.senderName,
            msg.content || "Sent an attachment",
            { tag: `conv-${msg.conversationId}`, onClick: () => useStore.getState().openChatAt(msg.conversationId, msg.id) }
          );
        });
      } catch (err) {
        console.error("Message queue subscription error:", err);
      }
    })();
    return () => { sub?.unsubscribe(); };
  }, [userId]);

  /* ── user status websocket ────────────────────────────────────────── */
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        sub = await subscribe(Topics.userStatus(), (frame) => {
          const ev = JSON.parse(frame.body) as { userId: number; status: string };
          if (ev.userId === userId) return; // skip own status updates
          if (ev.status && ev.status.trim()) {
            // Parse "emoji text" format
            const trimmed = ev.status.trim();
            const match = trimmed.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Extended_Pictographic}|[\u2600-\u27BF])\s*(.*)$/u);
            if (match) {
              setStatusForUser(ev.userId, { emoji: match[1], text: match[2] || "Busy" });
            } else {
              setStatusForUser(ev.userId, { emoji: "💼", text: trimmed });
            }
          } else {
            setStatusForUser(ev.userId, null);
          }
        });
      } catch (err) {
        console.error("User status subscription error:", err);
      }
    })();
    return () => { sub?.unsubscribe(); };
  }, [userId, setStatusForUser]);

  /* ── derived data ────────────────────────────────────────────────── */
  const { sortedConvs, archivedCount, archivedUnread } = useMemo(() => {
    const matches = conversations.filter((c) => {
      const name = getDisplayName(c, userId);
      return name.toLowerCase().includes(search.toLowerCase());
    });
    const archived = conversations.filter((c) => c.archived);
    const list = matches
      .filter((c) => (showArchived ? c.archived : !c.archived))
      .sort((a, b) => {
        if (!showArchived && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tB - tA;
      });
    return {
      sortedConvs: list,
      archivedCount: archived.length,
      archivedUnread: archived.filter((c) => c.unreadCount > 0).length,
    };
  }, [conversations, search, userId, showArchived]);

  /* ── keyboard: Alt+↑/↓ switches chats, Ctrl+/ shows shortcuts ───── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setIsSettingsOpen(true);
        return;
      }
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      if (sortedConvs.length === 0) return;
      e.preventDefault();
      const idx = sortedConvs.findIndex((c) => c.id === activeConversationId);
      const next =
        idx === -1 ? 0 : e.key === "ArrowDown" ? Math.min(idx + 1, sortedConvs.length - 1) : Math.max(idx - 1, 0);
      setActiveConversation(sortedConvs[next].id);
      setTab("chats");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sortedConvs, activeConversationId, setActiveConversation]);

  /* ── call log (loaded when the Calls tab opens) ──────────────────── */
  const openCallsTab = () => {
    setTab("calls");
    apiGet<CallResponse[]>("/api/calls/history")
      .then(setCalls)
      .catch((err) => {
        console.error("Failed to load call history:", err);
        setCalls([]);
      });
  };

  /* ── chat row actions ─────────────────────────────────────────────── */
  const handlePinToggle = async (conv: ConversationResponse) => {
    setMenuConvId(null);
    try {
      upsertConversation(await apiPut<ConversationResponse>(`/api/conversations/${conv.id}/pin`, { pinned: !conv.pinned }));
    } catch (err) {
      console.error("Failed to pin chat:", err);
      alert("Couldn't pin this chat. You can pin up to 5 chats.");
    }
  };

  const handleArchiveToggle = async (conv: ConversationResponse) => {
    setMenuConvId(null);
    try {
      upsertConversation(await apiPut<ConversationResponse>(`/api/conversations/${conv.id}/archive`, { archived: !conv.archived }));
      if (conv.id === activeConversationId && !conv.archived) setActiveConversation(null);
    } catch (err) {
      console.error("Failed to archive chat:", err);
    }
  };

  const handleMarkRead = async (conv: ConversationResponse) => {
    setMenuConvId(null);
    useStore.getState().clearUnread(conv.id);
    apiPost(`/api/conversations/${conv.id}/read`).catch(() => {});
  };

  const filteredUsers = useMemo(() =>
    users.filter(
      (u) =>
        u.id !== userId &&
        (u.name.toLowerCase().includes(search.toLowerCase()) ||
         u.email.toLowerCase().includes(search.toLowerCase()) ||
         (u.department && u.department.toLowerCase().includes(search.toLowerCase())))
    ),
    [users, search, userId]
  );

  const starredList = useMemo(
    () =>
      starredMessages.map((msg) => {
        const conv = conversations.find((c) => c.id === msg.conversationId);
        const convName = conv
          ? conv.type === "GROUP"
            ? conv.name ?? "Group"
            : conv.members.find((m) => m.id !== userId)?.name ?? "Direct"
          : "Chat";
        return { convId: msg.conversationId, convName, msg };
      }),
    [starredMessages, conversations, userId]
  );

  /* ── actions ─────────────────────────────────────────────────────── */
  const handleSelectStatus = async (preset: { emoji: string; text: string } | null) => {
    setUserStatus(preset);
    setShowStatusModal(false);
    try {
      const raw = preset ? preset.emoji + " " + preset.text : "";
      await apiPut("/api/users/status", { status: raw });
      // Refresh users to get updated work status for all members
      apiGet<UserResponse[]>("/api/users").then(setUsers).catch(console.error);
    } catch (err) {
      console.error("Failed to update work status:", err);
    }
  };

  const handleLogout = async () => {
    // End the session server-side too, so this token stops working immediately.
    await apiPost("/api/account/logout").catch(() => {});
    disconnectStomp().catch(() => {});
    clearAuth();
    window.location.href = "/login";
  };

  const handleStartDirect = async (otherUserId: number) => {
    try {
      const conv = await apiPost<ConversationResponse>("/api/conversations/direct", { otherUserId });
      setConversations(
        conversations.some((c) => c.id === conv.id) ? conversations : [conv, ...conversations]
      );
      setActiveConversation(conv.id);
      setTab("chats");
    } catch (err) {
      console.error("Failed to start direct chat:", err);
    }
  };

  const handleGroupCreated = (conv: ConversationResponse) => {
    setConversations([conv, ...conversations]);
    setActiveConversation(conv.id);
    setTab("chats");
  };

  /* ── render ──────────────────────────────────────────────────────── */
  return (
    <aside className="sb">
      {/* brand */}
      <div className="sb-brand">
        <div className="sb-brand-left">
          <div className="sb-logo"><MessageSquare size={18} /></div>
          <h1>Office Chat</h1>
        </div>
        <div className="sb-brand-actions">
          <button
            className="sb-icon-btn"
            onClick={() => setGlobalSearchOpen(true)}
            title="Global Search (Ctrl+K)"
          >
            <Search size={15} />
          </button>
          <button
            className="sb-icon-btn"
            onClick={() => setIsChannelsOpen(true)}
            title="Browse public channels"
            aria-label="Browse public channels"
          >
            <Hash size={15} />
          </button>
          <button
            className="sb-icon-btn sb-activity-btn"
            onClick={() => setActivityTab("mentions")}
            title="Activity: mentions, tasks, reminders, scheduled"
            aria-label={`Activity${activityCount > 0 ? ` (${activityCount} new)` : ""}`}
          >
            <Bell size={15} />
            {activityCount > 0 && <span className="sb-activity-badge">{activityCount > 99 ? "99+" : activityCount}</span>}
          </button>
          {userRole === "ADMIN" && (
            <>
              <button className="sb-icon-btn" onClick={() => setIsAdminOpen(true)} title="Admin Panel">
                <Shield size={15} />
              </button>
              <button className="sb-icon-btn" onClick={() => setIsAddUserOpen(true)} title="Add Employee">
                <Plus size={16} />
              </button>
            </>
          )}
          <button className="sb-icon-btn sb-icon-btn--accent" onClick={() => setIsGroupOpen(true)} title="Create Group">
            <UsersRound size={16} />
          </button>
        </div>
      </div>

      {/* search */}
      <div className="sb-search">
        <Search size={15} className="sb-search-icon" />
        <input
          type="text"
          placeholder="Filter conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* tabs */}
      <div className="sb-tabs">
        <button className={`sb-tab ${tab === "chats" ? "sb-tab--on" : ""}`} onClick={() => setTab("chats")}>
          <MessageSquare size={13} /> Chats
        </button>
        <button className={`sb-tab ${tab === "directory" ? "sb-tab--on" : ""}`} onClick={() => setTab("directory")}>
          <Users size={13} /> Directory
        </button>
        <button className={`sb-tab ${tab === "starred" ? "sb-tab--on" : ""}`} onClick={() => setTab("starred")}>
          <Star size={13} /> Starred ({starredMessages.length})
        </button>
        <button className={`sb-tab ${tab === "calls" ? "sb-tab--on" : ""}`} onClick={openCallsTab}>
          <Phone size={13} /> Calls
        </button>
      </div>

      {/* list */}
      <div className="sb-list">
        {tab === "chats" ? (
          <>
          {showArchived ? (
            <button type="button" className="sb-archived-row" onClick={() => setShowArchived(false)}>
              <ChevronLeft size={16} /> <span>Archived chats</span>
            </button>
          ) : archivedCount > 0 && (
            <button type="button" className="sb-archived-row" onClick={() => setShowArchived(true)}>
              <Archive size={16} /> <span>Archived</span>
              <span className="sb-archived-count">{archivedUnread > 0 ? `${archivedUnread} unread` : archivedCount}</span>
            </button>
          )}
          {sortedConvs.length === 0 ? (
            <p className="sb-empty">{showArchived ? "No archived chats" : "No conversations yet"}</p>
          ) : (
            sortedConvs.map((conv) => {
              const name = getDisplayName(conv, userId);
              const other = getOtherMember(conv, userId);
              const isOnline = other ? onlineUserIds.has(other.id) : false;
              const isActive = conv.id === activeConversationId;
              const isMuted = isMutedConv(conv);
              const draft = !isActive ? drafts[conv.id] : undefined;

              return (
                <div
                  key={conv.id}
                  className="sb-item-row"
                  onContextMenu={(e) => { e.preventDefault(); setMenuConvId(conv.id); }}
                >
                <button
                  className={`sb-item ${isActive ? "sb-item--active" : ""}`}
                  onClick={() => setActiveConversation(conv.id)}
                >
                  <div className="sb-item-avatar">
                    {conv.type === "GROUP" ? (
                      <div className="sb-group-icon">
                        <Users size={20} />
                      </div>
                    ) : (
                      <Avatar name={name} size={42} online={isOnline} />
                    )}
                  </div>
                  <div className="sb-item-body">
                    <div className="sb-item-top">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", minWidth: 0 }}>
  <span className="sb-item-name">{name}</span>
  {other && statusesByUserId[other.id] && (
    <span className="sb-item-status-pill" title={other ? name + ": " + statusesByUserId[other.id].text : ""}>
      {statusesByUserId[other.id].emoji}
    </span>
  )}
</div>
                      <span className="sb-item-time">{relativeTime(conv.lastMessageAt)}</span>
                    </div>
                    <div className="sb-item-bottom">
                      <span className="sb-item-preview">
                        {draft ? (
                          <><span className="sb-draft-label">Draft:</span> {draft}</>
                        ) : (
                          conv.lastMessagePreview || "No messages yet"
                        )}
                      </span>
                      <div className="sb-item-indicators">
                        {conv.pinned && !showArchived && <Pin size={12} className="sb-muted-icon" />}
                        {isMuted && <BellOff size={13} className="sb-muted-icon" />}
                        {conv.unreadCount > 0 && (
                          <span className={`sb-badge ${isMuted ? "sb-badge--muted" : ""}`}>
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`sb-item-menu-btn ${menuConvId === conv.id ? "sb-item-menu-btn--open" : ""}`}
                  aria-label={`Options for ${name}`}
                  onClick={() => setMenuConvId(menuConvId === conv.id ? null : conv.id)}
                >
                  <MoreVertical size={15} />
                </button>
                {menuConvId === conv.id && (
                  <>
                    <div className="sb-menu-backdrop" onClick={() => setMenuConvId(null)} />
                    <div className="sb-item-menu" role="menu">
                      {!conv.archived && (
                        <button type="button" role="menuitem" onClick={() => handlePinToggle(conv)}>
                          <Pin size={14} /> {conv.pinned ? "Unpin chat" : "Pin chat"}
                        </button>
                      )}
                      <button type="button" role="menuitem" onClick={() => handleArchiveToggle(conv)}>
                        {conv.archived ? <><ArchiveRestore size={14} /> Unarchive chat</> : <><Archive size={14} /> Archive chat</>}
                      </button>
                      {conv.unreadCount > 0 && (
                        <button type="button" role="menuitem" onClick={() => handleMarkRead(conv)}>
                          <CheckCheck size={14} /> Mark as read
                        </button>
                      )}
                    </div>
                  </>
                )}
                </div>
              );
            })
          )}
          </>
        ) : tab === "calls" ? (
          calls === null ? (
            <p className="sb-empty">Loading calls…</p>
          ) : calls.length === 0 ? (
            <div className="sb-empty">
              <Phone size={32} style={{ opacity: 0.4, margin: "0 auto 0.5rem" }} />
              <p>No calls yet</p>
            </div>
          ) : (
            calls.map((call) => {
              const conv = conversations.find((c) => c.id === call.conversationId);
              const name = conv ? getDisplayName(conv, userId) : call.initiatorName;
              const other = conv ? getOtherMember(conv, userId) : undefined;
              const outgoing = call.initiatorId === userId;
              const missed = call.status === "MISSED" || call.status === "REJECTED";
              const DirIcon = missed && !outgoing ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
              const duration = callDuration(call);
              return (
                <div key={call.id} className="sb-item sb-call-item">
                  {conv?.type === "GROUP" ? (
                    <div className="sb-group-icon"><Users size={20} /></div>
                  ) : (
                    <Avatar name={name} size={42} online={other ? onlineUserIds.has(other.id) : false} />
                  )}
                  <div className="sb-item-body">
                    <div className="sb-item-top">
                      <span className={`sb-item-name ${missed && !outgoing ? "sb-call-missed" : ""}`}>{name}</span>
                      <span className="sb-item-time">{relativeTime(call.startedAt)}</span>
                    </div>
                    <div className="sb-item-bottom">
                      <span className={`sb-item-preview sb-call-meta ${missed && !outgoing ? "sb-call-missed" : ""}`}>
                        <DirIcon size={13} />
                        {missed ? (outgoing ? "No answer" : "Missed") : outgoing ? "Outgoing" : "Incoming"}
                        {call.type === "VIDEO" ? " video" : " voice"} call{duration && ` · ${duration}`}
                      </span>
                      {other && !conv?.blockedByMe && !conv?.blockedMe && (
                        <div className="sb-item-indicators">
                          <button
                            type="button"
                            className="sb-call-btn"
                            title={`Call ${name} back`}
                            onClick={() => initiateCall(call.conversationId, other.id, other.name, call.type)}
                          >
                            {call.type === "VIDEO" ? <Video size={15} /> : <Phone size={15} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : tab === "directory" ? (
          filteredUsers.length === 0 ? (
            <p className="sb-empty">No team members found</p>
          ) : (
            filteredUsers.map((user) => (
              <button key={user.id} className="sb-item" onClick={() => handleStartDirect(user.id)}>
                <Avatar name={user.name} size={42} online={onlineUserIds.has(user.id)} />
                <div className="sb-item-body">
                  <div className="sb-item-top">
                    <span className="sb-item-name">{user.name}</span>
                    <span className="sb-item-role-pill">{user.role}</span>
                  </div>
                  <div className="sb-item-bottom">
                    <span className="sb-item-preview">{user.department || user.email}</span>
                  </div>
                </div>
              </button>
            ))
          )
        ) : (
          /* Starred list */
          starredList.length === 0 ? (
            <div className="sb-empty">
              <Star size={32} style={{ opacity: 0.4, margin: "0 auto 0.5rem" }} />
              <p>No starred messages yet</p>
              <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>Hover any message and click the Star icon to bookmark it.</span>
            </div>
          ) : (
            starredList.map(({ convId, convName, msg }) => (
              <button
                key={msg.id}
                className="sb-item sb-item--starred"
                onClick={() => {
                  useStore.getState().openChatAt(convId, msg.id);
                  setTab("chats");
                }}
              >
                <div className="sb-item-body">
                  <div className="sb-item-top">
                    <span className="sb-item-name" style={{ color: "var(--accent)" }}>{convName}</span>
                    <span className="sb-item-time">{relativeTime(msg.createdAt)}</span>
                  </div>
                  <span className="sb-item-sender">{msg.senderName}:</span>
                  <p className="sb-item-starred-text">{msg.content || "Attachment"}</p>
                </div>
              </button>
            ))
          )
        )}
      </div>

      {/* user footer */}
      <div className="sb-footer">
        <div
          className="sb-footer-avatar-wrap"
          onClick={() => setShowStatusModal(true)}
          title="Click to set work status"
        >
          <Avatar name={userName ?? "User"} size={36} />
          <span className="sb-status-badge">{userStatus ? userStatus.emoji : "🟢"}</span>
        </div>
        <div
          className="sb-footer-info"
          onClick={() => setShowStatusModal(true)}
          title="Click to set work status"
        >
          <span className="sb-footer-name">{userName ?? "User"}</span>
          <span className="sb-footer-status">
            {userStatus ? `${userStatus.emoji} ${userStatus.text}` : `${userRole} • Available`}
          </span>
        </div>
        <button className="sb-theme-toggle" onClick={() => setIsSettingsOpen(true)} title="Settings (Ctrl + /)" aria-label="Settings">
          <Settings size={16} />
        </button>
        <button className="sb-theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="sb-logout" onClick={handleLogout} title="Log out"><LogOut size={16} /></button>
      </div>

      {isChannelsOpen && <ChannelBrowser onClose={() => setIsChannelsOpen(false)} />}

      {activityTab && (
        <ActivityPanel initialTab={activityTab} onClose={() => setActivityTab(null)} onChanged={refreshActivity} />
      )}

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} theme={theme} setTheme={setTheme} />
      )}

      {/* Work Status Modal */}
      {showStatusModal && (
        <div className="sb-modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="sb-status-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sb-status-modal-header">
              <h3>Set Work Status</h3>
              <button type="button" className="sb-modal-close" onClick={() => setShowStatusModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="sb-status-options">
              {STATUS_PRESETS.map((preset) => (
                <button
                  key={preset.text}
                  type="button"
                  className={`sb-status-option ${userStatus?.text === preset.text ? "sb-status-option--active" : ""}`}
                  onClick={() => handleSelectStatus(preset)}
                >
                  <span className="sb-status-option-emoji">{preset.emoji}</span>
                  <span className="sb-status-option-text">{preset.text}</span>
                </button>
              ))}
            </div>
            {userStatus && (
              <button
                type="button"
                className="sb-clear-status-btn"
                onClick={() => handleSelectStatus(null)}
              >
                Clear status
              </button>
            )}
          </div>
        </div>
      )}

      {/* modals */}
      <AddUserModal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} onUserAdded={(u) => setUsers([...users, u])} />
      <CreateGroupModal isOpen={isGroupOpen} onClose={() => setIsGroupOpen(false)} users={users.filter((u) => u.id !== userId)} onGroupCreated={handleGroupCreated} />
      <AdminPanel
        open={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onUsersChanged={() => apiGet<UserResponse[]>("/api/users").then(setUsers).catch(console.error)}
      />

      <style>{`
        .sb { width:320px;height:100%;background:var(--bg-primary);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0; }

        .sb-brand { padding:1rem 1rem 0.5rem;display:flex;align-items:center;justify-content:space-between; }
        .sb-brand-left { display:flex;align-items:center;gap:0.5rem; }
        .sb-logo { width:32px;height:32px;border-radius:8px;background:var(--accent-gradient);color:var(--text-on-accent);display:flex;align-items:center;justify-content:center; }
        .sb-brand h1 { font-size:1.125rem;font-weight:800;color:var(--text-primary);margin:0;letter-spacing:-0.02em; }
        .sb-brand-actions { display:flex;gap:0.25rem; }
        .sb-icon-btn { width:30px;height:30px;border-radius:8px;background:var(--bg-tertiary);color:var(--text-tertiary);display:flex;align-items:center;justify-content:center;transition:all 0.15s; }
        .sb-icon-btn:hover { background:var(--bg-inset);color:var(--text-primary); }
        .sb-icon-btn--accent { background:var(--accent-soft);color:var(--accent); }
        .sb-icon-btn--accent:hover { background:var(--accent-muted); }

        .sb-search { margin:0.5rem 1rem;position:relative; }
        .sb-search-icon { position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-faint);pointer-events:none; }
        .sb-search input { width:100%;padding:0.5rem 0.75rem 0.5rem 2.25rem;background:var(--bg-secondary);border:1.5px solid var(--border);border-radius:10px;font-size:0.8125rem;color:var(--text-primary);transition:border-color 0.15s; }
        .sb-search input:focus { border-color:var(--accent);background:var(--bg-primary);outline:none; }

        .sb-tabs { display:flex;gap:0.25rem;margin:0.25rem 1rem 0.5rem;background:var(--bg-tertiary);border-radius:10px;padding:3px; }
        .sb-tab { flex:1;display:flex;align-items:center;justify-content:center;gap:0.3rem;padding:0.4rem;border-radius:8px;font-size:0.75rem;font-weight:600;color:var(--text-muted);transition:all 0.15s; cursor:pointer; }
        .sb-tab--on { background:var(--bg-primary);color:var(--accent);box-shadow:var(--shadow-sm); }

        .sb-list { flex:1;overflow-y:auto;padding:0 0.5rem; }
        .sb-empty { padding:3rem 1rem;text-align:center;font-size:0.8125rem;color:var(--text-faint); }

        .sb-item { display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.625rem;border-radius:12px;text-align:left;transition:background 0.12s;width:100%;cursor:pointer; }
        .sb-item:hover { background:var(--bg-hover); }
        .sb-item--active { background:var(--bg-active) !important; }
        .sb-tab { min-width:0;white-space:nowrap;font-size:0.6875rem; }
        .sb-activity-btn { position:relative; }
        .sb-activity-badge {
          position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;
          background:var(--danger);color:#fff;font-size:0.625rem;font-weight:700;display:flex;align-items:center;justify-content:center;
          border:2px solid var(--bg-primary);
        }
        .sb-item-row { position:relative; }
        .sb-item-row .sb-item { padding-right:1.9rem; }
        .sb-item-menu-btn {
          position:absolute;right:0.3rem;top:50%;transform:translateY(-50%);width:26px;height:26px;border-radius:8px;
          display:flex;align-items:center;justify-content:center;color:var(--text-muted);background:var(--bg-primary);
          border:1px solid var(--border);opacity:0;cursor:pointer;transition:opacity 0.12s;
        }
        .sb-item-row:hover .sb-item-menu-btn, .sb-item-menu-btn:focus-visible, .sb-item-menu-btn--open { opacity:1; }
        .sb-menu-backdrop { position:fixed;inset:0;z-index:49; }
        .sb-item-menu {
          position:absolute;right:0.3rem;top:calc(50% + 16px);z-index:50;min-width:170px;padding:4px;
          background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;
          box-shadow:var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.18));display:flex;flex-direction:column;
        }
        .sb-item-menu button {
          display:flex;align-items:center;gap:0.5rem;padding:0.45rem 0.6rem;border-radius:7px;font-size:0.8125rem;
          color:var(--text-primary);text-align:left;cursor:pointer;
        }
        .sb-item-menu button:hover { background:var(--bg-hover); }
        .sb-archived-row {
          display:flex;align-items:center;gap:0.6rem;width:100%;padding:0.55rem 0.75rem;border-radius:10px;
          font-size:0.8125rem;font-weight:600;color:var(--text-secondary);cursor:pointer;
        }
        .sb-archived-row:hover { background:var(--bg-hover); }
        .sb-archived-row span:nth-child(2) { flex:1;text-align:left; }
        .sb-archived-count { font-size:0.72rem;color:var(--accent);font-weight:700; }
        .sb-draft-label { color:var(--danger);font-weight:600; }
        .sb-call-item { cursor:default; }
        .sb-call-meta { display:inline-flex;align-items:center;gap:0.3rem; }
        .sb-call-missed { color:var(--danger) !important; }
        .sb-call-btn {
          width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          color:var(--accent);background:var(--accent-soft);cursor:pointer;
        }
        .sb-call-btn:hover { background:var(--accent-muted); }
        .sb-item-avatar { flex-shrink:0; }
        .sb-group-icon { width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--accent-muted),var(--accent-deep));color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700; }
        .sb-item-body { flex:1;min-width:0;display:flex;flex-direction:column;gap:0.15rem; }
        .sb-item-top { display:flex;align-items:center;justify-content:space-between; }
        .sb-item-name { font-size:0.875rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sb-item-time { font-size:0.6875rem;color:var(--text-faint);flex-shrink:0; }
        .sb-item-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 0.1rem; }
        .sb-item-preview { font-size: 0.8125rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
        .sb-item-indicators { display: flex; align-items: center; gap: 0.35rem; }
        .sb-muted-icon { color: var(--text-muted); }
        .sb-badge { background: var(--accent); color: var(--text-on-accent); font-size: 0.6875rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 999px; min-width: 1.1rem; text-align: center; }
        .sb-badge--muted { background: var(--border); color: var(--text-muted); }
        .sb-item-role-pill { font-size:0.625rem;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:0.1rem 0.4rem;border-radius:4px;flex-shrink:0; }
        .sb-item-status-pill {
          font-size: 0.65rem; font-weight: 600; background: var(--bg-tertiary);
          padding: 1px 6px; border-radius: 999px; color: var(--text-secondary);
          white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px;
        }

        .sb-item--starred { flex-direction:column;align-items:flex-start;gap:0.25rem;padding:0.65rem 0.75rem;border-bottom:1px solid var(--border-subtle); }
        .sb-item-sender { font-size:0.75rem;font-weight:600;color:var(--text-secondary); }
        .sb-item-starred-text { font-size:0.8125rem;color:var(--text-primary);margin:0;line-height:1.35;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }

        .sb-footer { padding:0.75rem 1rem;border-top:1px solid var(--border);display:flex;align-items:center;gap:0.75rem; }
        .sb-footer-avatar-wrap { position:relative;cursor:pointer;flex-shrink:0; }
        .sb-status-badge { position:absolute;bottom:-2px;right:-2px;font-size:0.75rem;line-height:1; }
        .sb-footer-info { flex:1;min-width:0;display:flex;flex-direction:column;cursor:pointer; }
        .sb-footer-name { font-size:0.8125rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sb-footer-status { font-size:0.6875rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sb-theme-toggle { width:32px;height:32px;border-radius:8px;color:var(--text-faint);display:flex;align-items:center;justify-content:center;transition:all 0.15s; }
        .sb-theme-toggle:hover { color:var(--warning);background:var(--bg-tertiary); }
        .sb-logout { width:32px;height:32px;border-radius:8px;color:var(--text-faint);display:flex;align-items:center;justify-content:center;transition:all 0.15s; }
        .sb-logout:hover { color:var(--danger);background:var(--danger-soft); }

        /* Work Status Modal */
        .sb-modal-overlay {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(2px); z-index: 1500;
          display: flex; align-items: center; justify-content: center;
        }
        .sb-status-modal {
          width: 90%; max-width: 320px; background: var(--surface-card, #ffffff);
          border: 1px solid var(--border, #e2e8f0); border-radius: 16px;
          box-shadow: var(--shadow-xl); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
        }
        .sb-status-modal-header {
          display: flex; align-items: center; justify-content: space-between;
        }
        .sb-status-modal-header h3 {
          font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); margin: 0;
        }
        .sb-modal-close {
          background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px;
        }
        .sb-modal-close:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .sb-status-options {
          display: flex; flex-direction: column; gap: 0.35rem;
        }
        .sb-status-option {
          display: flex; align-items: center; gap: 0.75rem; padding: 0.55rem 0.75rem;
          border-radius: 10px; border: 1px solid transparent; background: var(--bg-secondary);
          color: var(--text-primary); font-size: 0.84375rem; font-weight: 500; cursor: pointer;
          transition: all 0.12s; text-align: left;
        }
        .sb-status-option:hover {
          background: var(--bg-tertiary); border-color: var(--border);
        }
        .sb-status-option--active {
          background: var(--accent-soft); color: var(--accent); border-color: var(--accent-deep); font-weight: 700;
        }
        .sb-status-option-emoji { font-size: 1.1rem; }
        .sb-clear-status-btn {
          border: none; background: transparent; color: var(--danger, #ef4444);
          font-size: 0.78125rem; font-weight: 600; padding: 0.4rem; cursor: pointer;
          text-align: center; border-radius: 6px;
        }
        .sb-clear-status-btn:hover { background: var(--danger-soft, #fee2e2); }
      `}</style>
    </aside>
  );
}
