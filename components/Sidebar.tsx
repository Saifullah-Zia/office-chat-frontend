"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare, Users, Search, LogOut, Plus, UsersRound, Moon, Sun, BellOff, Star, X, Shield,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { ConversationResponse, UserResponse, PresenceEvent, MemberResponse, MessageResponse } from "@/types";
import { subscribe, Topics, disconnectStomp } from "@/lib/socket";
import { clearAuth } from "@/lib/auth";
import Avatar from "./Avatar";
import AddUserModal from "./AddUserModal";
import AdminPanel from "./AdminPanel";
import CreateGroupModal from "./CreateGroupModal";
import { useTheme } from "@/hooks/useTheme";

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
  const { theme, toggleTheme } = useTheme();

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
  const starredMessageIds   = useStore((s) => s.starredMessageIds);
  const messagesByConv      = useStore((s) => s.messagesByConv);
  const statusesByUserId    = useStore((s) => s.statusesByUserId);

  const [tab, setTab]                     = useState<"chats" | "directory" | "starred">("chats");
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
  }, [setConversations, setUsers, initOnline, setActiveConversation]);

  /* ── presence websocket ──────────────────────────────────────────── */
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        sub = await subscribe(Topics.presence(), (frame) => {
          const ev: PresenceEvent = JSON.parse(frame.body);
          if (ev.status === "ONLINE") setOnline(ev.userId);
          else setOffline(ev.userId);
        });
      } catch (err) {
        console.error("Presence subscription error:", err);
      }
    })();
    return () => { sub?.unsubscribe(); };
  }, [setOnline, setOffline]);

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
  const sortedConvs = useMemo(() => {
    const filtered = conversations.filter((c) => {
      const name = getDisplayName(c, userId);
      return name.toLowerCase().includes(search.toLowerCase());
    });
    return filtered.sort((a, b) => {
      const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tB - tA;
    });
  }, [conversations, search, userId]);

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

  const starredList = useMemo(() => {
    const list: { convId: number; convName: string; msg: MessageResponse }[] = [];
    Object.entries(messagesByConv).forEach(([convIdStr, msgs]) => {
      const convId = Number(convIdStr);
      const conv = conversations.find((c) => c.id === convId);
      const convName = conv
        ? conv.type === "GROUP"
          ? conv.name ?? "Group"
          : conv.members.find((m) => m.id !== userId)?.name ?? "Direct"
        : "Chat";

      msgs.forEach((m) => {
        if (starredMessageIds.has(m.id)) {
          list.push({ convId, convName, msg: m });
        }
      });
    });
    return list;
  }, [messagesByConv, starredMessageIds, conversations, userId]);

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

  const handleLogout = () => {
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
          <Star size={13} /> Starred ({starredMessageIds.size})
        </button>
      </div>

      {/* list */}
      <div className="sb-list">
        {tab === "chats" ? (
          sortedConvs.length === 0 ? (
            <p className="sb-empty">No conversations yet</p>
          ) : (
            sortedConvs.map((conv) => {
              const name = getDisplayName(conv, userId);
              const other = getOtherMember(conv, userId);
              const isOnline = other ? onlineUserIds.has(other.id) : false;
              const isActive = conv.id === activeConversationId;
              const isMuted = conv.mutedUntil && new Date(conv.mutedUntil).getTime() > Date.now();

              return (
                <button
                  key={conv.id}
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
                        {conv.lastMessagePreview || "No messages yet"}
                      </span>
                      <div className="sb-item-indicators">
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
                  setActiveConversation(convId);
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
        <button className="sb-theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="sb-logout" onClick={handleLogout} title="Log out"><LogOut size={16} /></button>
      </div>

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
