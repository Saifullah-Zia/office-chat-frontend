"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare, Users, Search, LogOut, Plus, UsersRound, Hash,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { apiGet, apiPost } from "@/lib/api";
import { ConversationResponse, UserResponse, PresenceEvent, MemberResponse } from "@/types";
import { subscribe, Topics } from "@/lib/socket";
import Avatar from "./Avatar";
import AddUserModal from "./AddUserModal";
import CreateGroupModal from "./CreateGroupModal";

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

/* ── component ────────────────────────────────────────────────────────── */

export default function Sidebar() {
  const router = useRouter();

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

  const [tab, setTab]                     = useState<"chats" | "directory">("chats");
  const [search, setSearch]               = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen]     = useState(false);

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
         u.email.toLowerCase().includes(search.toLowerCase()))
    ),
  [users, search, userId]);

  /* ── handlers ────────────────────────────────────────────────────── */
  const handleLogout = () => {
    const { clearAuth } = require("@/lib/auth");
    clearAuth();
    router.replace("/login");
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
          {userRole === "ADMIN" && (
            <button className="sb-icon-btn" onClick={() => setIsAddUserOpen(true)} title="Add Employee">
              <Plus size={16} />
            </button>
          )}
          <button className="sb-icon-btn sb-icon-btn--accent" onClick={() => setIsGroupOpen(true)} title="Create Group">
            <UsersRound size={16} />
          </button>
        </div>
      </div>

      {/* search */}
      <div className="sb-search">
        <Search size={15} className="sb-search-icon" />
        <input type="text" placeholder="Search conversations..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* tabs */}
      <div className="sb-tabs">
        <button className={`sb-tab ${tab === "chats" ? "sb-tab--on" : ""}`} onClick={() => setTab("chats")}>
          <MessageSquare size={14} /> Chats
        </button>
        <button className={`sb-tab ${tab === "directory" ? "sb-tab--on" : ""}`} onClick={() => setTab("directory")}>
          <Users size={14} /> Directory
        </button>
      </div>

      {/* list */}
      <div className="sb-list">
        {tab === "chats" ? (
          sortedConvs.length === 0 ? (
            <p className="sb-empty">No conversations yet</p>
          ) : (
            sortedConvs.map((conv) => {
              const name    = getDisplayName(conv, userId);
              const other   = getOtherMember(conv, userId);
              const isOnline = other ? onlineUserIds.has(other.id) : false;
              const active  = conv.id === activeConversationId;
              const isGroup = conv.type === "GROUP";

              const handleSelectConv = (convId: number) => {
                if (!convId) return;
                setActiveConversation(convId);
                useStore.getState().clearUnread(convId);
                apiPost(`/api/conversations/${convId}/read`).catch(() => {});
              };

              return (
                <button key={conv.id} className={`sb-item ${active ? "sb-item--active" : ""}`} onClick={() => handleSelectConv(conv.id)}>
                  <div className="sb-item-avatar">
                    {isGroup ? (
                      <div className="sb-group-icon"><Hash size={18} /></div>
                    ) : (
                      <Avatar name={name} size={42} online={isOnline} />
                    )}
                  </div>
                  <div className="sb-item-body">
                    <div className="sb-item-top">
                      <span className="sb-item-name">{name}</span>
                      <span className="sb-item-time">{relativeTime(conv.lastMessageAt)}</span>
                    </div>
                    <div className="sb-item-bottom">
                      <span className="sb-item-preview">
                        {conv.lastMessagePreview || (isGroup ? `${conv.members.length} members` : "Start chatting")}
                      </span>
                      {conv.unreadCount > 0 && <span className="sb-badge">{conv.unreadCount > 99 ? "99+" : conv.unreadCount}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )
        ) : (
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
        )}
      </div>

      {/* user footer */}
      <div className="sb-footer">
        <Avatar name={userName ?? "User"} size={36} />
        <div className="sb-footer-info">
          <span className="sb-footer-name">{userName ?? "User"}</span>
          <span className="sb-footer-role">{userRole}</span>
        </div>
        <button className="sb-logout" onClick={handleLogout} title="Log out"><LogOut size={16} /></button>
      </div>

      {/* modals */}
      <AddUserModal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} onUserAdded={(u) => setUsers([...users, u])} />
      <CreateGroupModal isOpen={isGroupOpen} onClose={() => setIsGroupOpen(false)} users={users.filter((u) => u.id !== userId)} onGroupCreated={handleGroupCreated} />

      <style>{`
        .sb { width:320px;height:100%;background:#fff;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;flex-shrink:0; }

        .sb-brand { padding:1rem 1rem 0.5rem;display:flex;align-items:center;justify-content:space-between; }
        .sb-brand-left { display:flex;align-items:center;gap:0.5rem; }
        .sb-logo { width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;display:flex;align-items:center;justify-content:center; }
        .sb-brand h1 { font-size:1.125rem;font-weight:800;color:#0f172a;margin:0;letter-spacing:-0.02em; }
        .sb-brand-actions { display:flex;gap:0.25rem; }
        .sb-icon-btn { width:30px;height:30px;border-radius:8px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;transition:all 0.15s; }
        .sb-icon-btn:hover { background:#e2e8f0;color:#0f172a; }
        .sb-icon-btn--accent { background:#eef2ff;color:#4f46e5; }
        .sb-icon-btn--accent:hover { background:#e0e7ff; }

        .sb-search { margin:0.5rem 1rem;position:relative; }
        .sb-search-icon { position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none; }
        .sb-search input { width:100%;padding:0.5rem 0.75rem 0.5rem 2.25rem;background:#f8fafc;border:1.5px solid #e5e7eb;border-radius:10px;font-size:0.8125rem;color:#0f172a;transition:border-color 0.15s; }
        .sb-search input:focus { border-color:#4f46e5;background:#fff;outline:none; }

        .sb-tabs { display:flex;gap:0.25rem;margin:0.25rem 1rem 0.5rem;background:#f1f5f9;border-radius:10px;padding:3px; }
        .sb-tab { flex:1;display:flex;align-items:center;justify-content:center;gap:0.3rem;padding:0.4rem;border-radius:8px;font-size:0.75rem;font-weight:600;color:#64748b;transition:all 0.15s; }
        .sb-tab--on { background:#fff;color:#4f46e5;box-shadow:0 1px 3px rgba(0,0,0,0.06); }

        .sb-list { flex:1;overflow-y:auto;padding:0 0.5rem; }
        .sb-empty { padding:3rem 1rem;text-align:center;font-size:0.8125rem;color:#94a3b8; }

        .sb-item { display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.625rem;border-radius:12px;text-align:left;transition:background 0.12s;width:100%;cursor:pointer; }
        .sb-item:hover { background:#f8fafc; }
        .sb-item--active { background:#eef2ff !important; }
        .sb-item-avatar { flex-shrink:0; }
        .sb-group-icon { width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#e0e7ff,#c7d2fe);color:#4f46e5;display:flex;align-items:center;justify-content:center;font-weight:700; }
        .sb-item-body { flex:1;min-width:0;display:flex;flex-direction:column;gap:0.15rem; }
        .sb-item-top { display:flex;align-items:center;justify-content:space-between; }
        .sb-item-name { font-size:0.875rem;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sb-item-time { font-size:0.6875rem;color:#94a3b8;flex-shrink:0; }
        .sb-item-bottom { display:flex;align-items:center;justify-content:space-between; }
        .sb-item-preview { font-size:0.75rem;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0; }
        .sb-item-role-pill { font-size:0.625rem;font-weight:600;color:#4f46e5;background:#eef2ff;padding:0.1rem 0.4rem;border-radius:4px;flex-shrink:0; }
        .sb-badge { background:#4f46e5;color:#fff;font-size:0.6875rem;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 0.35rem;flex-shrink:0; }

        .sb-footer { padding:0.75rem 1rem;border-top:1px solid #e5e7eb;display:flex;align-items:center;gap:0.75rem; }
        .sb-footer-info { flex:1;min-width:0;display:flex;flex-direction:column; }
        .sb-footer-name { font-size:0.8125rem;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sb-footer-role { font-size:0.6875rem;color:#64748b;text-transform:capitalize; }
        .sb-logout { width:32px;height:32px;border-radius:8px;color:#94a3b8;display:flex;align-items:center;justify-content:center;transition:all 0.15s; }
        .sb-logout:hover { color:#ef4444;background:#fef2f2; }
      `}</style>
    </aside>
  );
}
