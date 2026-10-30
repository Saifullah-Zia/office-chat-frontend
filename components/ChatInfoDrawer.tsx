"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  X, Users, Mail, Building, FileText, Download, UserPlus, UserMinus, ShieldCheck, ShieldOff,
  BellOff, Bell, Lock, Volume2, Phone, Video, Search, Star, ChevronRight, ArrowLeft, Image as ImageIcon,
  Link2, Trash2, Ban, LogOut, Eraser, MessageCircle, Info, Briefcase, Flag,
  Timer, Globe, Pencil, Copy, Check, RefreshCw,
} from "lucide-react";
import ImageViewer, { ViewerImage } from "./ImageViewer";
import ReportModal from "./ReportModal";
import { isViewableImage } from "@/lib/media";
import { ConversationResponse, MemberResponse, MessageResponse, UserResponse } from "@/types";
import Avatar from "./Avatar";
import { useStore } from "@/lib/store";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useCallContext } from "@/context/CallContext";
import { formatLastSeen } from "@/lib/time";

interface ChatInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationResponse;
  myUserId: number | null;
  onlineUserIds: Set<number>;
  messages: MessageResponse[];
  onOpenSearch: () => void;
  onJumpToMessage: (messageId: number) => void;
}

type View =
  | { kind: "main" }
  | { kind: "media"; tab: "MEDIA" | "DOCS" | "LINKS" }
  | { kind: "starred" }
  | { kind: "member"; memberId: number };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const URL_REGEX = /https?:\/\/[^\s<>"')]+/g;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function absoluteUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

function isMuted(conv: ConversationResponse): boolean {
  return !!conv.mutedUntil && new Date(conv.mutedUntil).getTime() > Date.now();
}

export default function ChatInfoDrawer({
  isOpen,
  onClose,
  conversation,
  myUserId,
  onlineUserIds,
  messages,
  onOpenSearch,
  onJumpToMessage,
}: ChatInfoDrawerProps) {
  const [view, setView] = useState<View>({ kind: "main" });
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<MemberResponse | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsName, setDetailsName] = useState("");
  const [detailsDesc, setDetailsDesc] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  const users = useStore((s) => s.users);
  const userRole = useStore((s) => s.userRole);
  const conversations = useStore((s) => s.conversations);
  const allStarred = useStore((s) => s.starredMessages);
  const lastSeenByUserId = useStore((s) => s.lastSeenByUserId);
  const statusesByUserId = useStore((s) => s.statusesByUserId);
  const upsertConversation = useStore((s) => s.upsertConversation);
  const removeConversation = useStore((s) => s.removeConversation);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const setMessages = useStore((s) => s.setMessages);
  const { initiateCall } = useCallContext();

  const isGroup = conversation.type === "GROUP";

  const groupAdminIds = useMemo(() => {
    if (conversation.adminIds) return new Set(conversation.adminIds);
    // Older backend without adminIds: fall back to the global role.
    return new Set(conversation.members.filter((m) => m.role === "ADMIN").map((m) => m.id));
  }, [conversation]);

  const iAmAdmin = userRole === "ADMIN" || (myUserId !== null && groupAdminIds.has(myUserId));

  const otherMember: MemberResponse | undefined = !isGroup
    ? conversation.members.find((m) => m.id !== myUserId)
    : undefined;

  // ── Derived media / links / starred ────────────────────────────────
  const { media, docs, links } = useMemo(() => {
    const media: ViewerImage[] = [];
    const docs: { id: number; url: string; name: string; size: number; createdAt: string }[] = [];
    const links: { key: string; url: string; messageId: number; sender: string; createdAt: string }[] = [];

    messages.forEach((m) => {
      if (m.deleted) return;
      m.attachments?.forEach((att) => {
        const name = att.filename ?? att.fileName ?? att.originalName ?? "File";
        const type = att.contentType ?? att.mimeType ?? "";
        if (isViewableImage(att)) {
          media.push({ id: att.id, url: absoluteUrl(att.downloadUrl), name, sender: m.senderName, createdAt: m.createdAt });
        } else if (!type.startsWith("audio/")) {
          docs.push({
            id: att.id,
            url: absoluteUrl(att.downloadUrl),
            name,
            size: att.size ?? att.fileSize ?? 0,
            createdAt: att.createdAt ?? m.createdAt,
          });
        }
      });
      (m.content?.match(URL_REGEX) ?? []).forEach((url, i) =>
        links.push({ key: `${m.id}-${i}`, url, messageId: m.id, sender: m.senderName, createdAt: m.createdAt })
      );
    });

    return { media: media.reverse(), docs: docs.reverse(), links: links.reverse() };
  }, [messages]);

  const starredMessages = useMemo(
    () => allStarred.filter((m) => m.conversationId === conversation.id && !m.deleted),
    [allStarred, conversation.id]
  );

  const commonGroupsWith = (userId: number) =>
    conversations.filter(
      (c) =>
        c.type === "GROUP" &&
        c.members.some((m) => m.id === userId) &&
        c.members.some((m) => m.id === myUserId)
    );

  if (!isOpen) return null;

  // ── Actions ────────────────────────────────────────────────────────
  const run = async (key: string, fn: () => Promise<void>, failMsg: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.error(failMsg, err);
      alert(failMsg);
    } finally {
      setBusy(null);
    }
  };

  const refreshConversation = async () => {
    const updated = await apiGet<ConversationResponse>(`/api/conversations/${conversation.id}`);
    upsertConversation(updated);
  };

  const handleMute = (durationHours: number) =>
    run("mute", async () => {
      const updated = await apiPost<ConversationResponse>(`/api/conversations/${conversation.id}/mute`, { durationHours });
      upsertConversation(updated);
    }, "Failed to update notifications.");

  const handleTogglePermissions = (onlyAdmins: boolean, isAnnounce: boolean) =>
    run("perm", async () => {
      const updated = await apiPut<ConversationResponse>(`/api/conversations/${conversation.id}/permissions`, {
        onlyAdminsCanPost: onlyAdmins,
        isAnnouncement: isAnnounce,
      });
      upsertConversation(updated);
    }, "Failed to update group settings.");

  const handleAddMember = (user: UserResponse) =>
    run(`add-${user.id}`, async () => {
      const updated = await apiPost<ConversationResponse>(`/api/conversations/${conversation.id}/members`, { userId: user.id });
      upsertConversation(updated);
      setIsAddingMember(false);
    }, "Failed to add member to group.");

  const handleRemoveMember = (member: MemberResponse) => {
    if (!confirm(`Remove ${member.name} from "${conversation.name ?? "this group"}"?`)) return;
    run(`remove-${member.id}`, async () => {
      const updated = await apiDelete<ConversationResponse>(`/api/conversations/${conversation.id}/members/${member.id}`);
      upsertConversation(updated);
      setView({ kind: "main" });
    }, "Failed to remove member.");
  };

  const handleSetAdmin = (member: MemberResponse, admin: boolean) =>
    run(`admin-${member.id}`, async () => {
      const updated = await apiPut<ConversationResponse>(
        `/api/conversations/${conversation.id}/members/${member.id}/admin`,
        { admin }
      );
      upsertConversation(updated);
    }, admin ? "Failed to make group admin." : "Failed to dismiss admin.");

  const openDirectWith = async (member: MemberResponse) => {
    const conv = await apiPost<ConversationResponse>("/api/conversations/direct", { otherUserId: member.id });
    upsertConversation(conv);
    return conv;
  };

  const handleMessageMember = (member: MemberResponse) =>
    run(`msg-${member.id}`, async () => {
      const conv = await openDirectWith(member);
      setActiveConversation(conv.id);
      onClose();
    }, "Failed to open chat.");

  const handleCallMember = (member: MemberResponse, type: "AUDIO" | "VIDEO") =>
    run(`call-${member.id}`, async () => {
      const convId = !isGroup && otherMember?.id === member.id ? conversation.id : (await openDirectWith(member)).id;
      initiateCall(convId, member.id, member.name, type);
    }, "Failed to start call.");

  const handleBlockToggle = (member: MemberResponse, currentlyBlocked: boolean) => {
    if (!currentlyBlocked && !confirm(`Block ${member.name}? Blocked contacts can no longer message you in a direct chat.`)) return;
    run(`block-${member.id}`, async () => {
      if (currentlyBlocked) await apiDelete(`/api/users/${member.id}/block`);
      else await apiPost(`/api/users/${member.id}/block`);
      if (!isGroup) await refreshConversation();
      // Keep any other open direct chat with this user in sync.
      const direct = conversations.find(
        (c) => c.type === "DIRECT" && c.id !== conversation.id && c.members.some((m) => m.id === member.id)
      );
      if (direct) {
        const updated = await apiGet<ConversationResponse>(`/api/conversations/${direct.id}`);
        upsertConversation(updated);
      }
    }, currentlyBlocked ? "Failed to unblock." : "Failed to block.");
  };

  const handleClearChat = () => {
    if (!confirm("Clear all messages in this chat? They will be removed for you only.")) return;
    run("clear", async () => {
      const updated = await apiPost<ConversationResponse>(`/api/conversations/${conversation.id}/clear`);
      upsertConversation(updated);
      setMessages(conversation.id, []);
    }, "Failed to clear chat.");
  };

  const handleDeleteChat = () => {
    if (!confirm("Delete this chat? Messages will be removed for you, and the chat reappears if a new message arrives.")) return;
    run("delete", async () => {
      await apiDelete(`/api/conversations/${conversation.id}`);
      removeConversation(conversation.id);
    }, "Failed to delete chat.");
  };

  const handleExitGroup = () => {
    if (myUserId === null) return;
    if (!confirm(`Exit "${conversation.name ?? "this group"}"? You will stop receiving its messages.`)) return;
    run("exit", async () => {
      await apiDelete(`/api/conversations/${conversation.id}/members/${myUserId}`);
      removeConversation(conversation.id);
    }, "Failed to exit group.");
  };

  // ── Reusable fragments ─────────────────────────────────────────────
  const renderNavRow = (icon: ReactNode, label: string, count: number | null, onClick: () => void) => (
    <button type="button" className="cid-nav-row" onClick={onClick}>
      <span className="cid-nav-icon">{icon}</span>
      <span className="cid-nav-label">{label}</span>
      {count !== null && <span className="cid-nav-count">{count}</span>}
      <ChevronRight size={16} className="cid-nav-chevron" />
    </button>
  );

  const renderMediaPreview = () => (
    <div className="cid-card">
      {renderNavRow(<ImageIcon size={17} />, "Media, links and docs", media.length + docs.length + links.length, () =>
        setView({ kind: "media", tab: "MEDIA" })
      )}
      {media.length > 0 && (
        <div className="cid-media-strip">
          {media.slice(0, 4).map((m, i) => (
            <button key={m.id} type="button" className="cid-media-thumb" onClick={() => setViewerIndex(i)} aria-label={`View ${m.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.name} />
            </button>
          ))}
        </div>
      )}
      {renderNavRow(<Star size={17} />, "Starred messages", starredMessages.length, () => setView({ kind: "starred" }))}
    </div>
  );

  const renderNotifications = () => (
    <div className="cid-card">
      <div className="cid-row-static">
        <span className="cid-nav-icon">{isMuted(conversation) ? <BellOff size={17} /> : <Bell size={17} />}</span>
        <span className="cid-nav-label">Mute notifications</span>
        {isMuted(conversation) && (
          <button type="button" className="cid-link-btn" disabled={busy === "mute"} onClick={() => handleMute(0)}>
            Unmute
          </button>
        )}
      </div>
      {isMuted(conversation) ? (
        <p className="cid-muted-note">
          Muted until{" "}
          {new Date(conversation.mutedUntil!).getFullYear() - new Date().getFullYear() > 5
            ? "you unmute"
            : new Date(conversation.mutedUntil!).toLocaleString()}
        </p>
      ) : (
        <div className="cid-mute-btns">
          <button type="button" className="cid-mute-chip" disabled={busy === "mute"} onClick={() => handleMute(8)}>8 hours</button>
          <button type="button" className="cid-mute-chip" disabled={busy === "mute"} onClick={() => handleMute(168)}>1 week</button>
          <button type="button" className="cid-mute-chip" disabled={busy === "mute"} onClick={() => handleMute(99999)}>Always</button>
        </div>
      )}
    </div>
  );

  const renderCommonGroups = (userId: number) => {
    const groups = commonGroupsWith(userId);
    return (
      <div className="cid-card">
        <h4 className="cid-section-title">
          {groups.length} {groups.length === 1 ? "group" : "groups"} in common
        </h4>
        {groups.length === 0 ? (
          <p className="cid-empty">No groups in common</p>
        ) : (
          groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="cid-list-row"
              onClick={() => {
                setActiveConversation(g.id);
                onClose();
              }}
            >
              <div className="cid-mini-group-icon"><Users size={16} /></div>
              <div className="cid-list-text">
                <span className="cid-list-title">{g.name ?? "Group"}</span>
                <span className="cid-list-sub">{g.members.map((m) => (m.id === myUserId ? "You" : m.name)).join(", ")}</span>
              </div>
            </button>
          ))
        )}
      </div>
    );
  };

  const renderAbout = (member: MemberResponse) => {
    const status = statusesByUserId[member.id];
    return (
      <div className="cid-card">
        <h4 className="cid-section-title">About</h4>
        <div className="cid-info-row">
          <Info size={16} className="cid-info-icon" />
          <span>{status ? `${status.emoji} ${status.text}` : "Available"}</span>
        </div>
        <div className="cid-info-row">
          <Mail size={16} className="cid-info-icon" />
          <a href={`mailto:${member.email}`} className="cid-info-link">{member.email}</a>
        </div>
        {member.department && (
          <div className="cid-info-row">
            <Building size={16} className="cid-info-icon" />
            <span>{member.department}</span>
          </div>
        )}
        {member.role && (
          <div className="cid-info-row">
            <Briefcase size={16} className="cid-info-icon" />
            <span>{member.role === "ADMIN" ? "Administrator" : "Employee"}</span>
          </div>
        )}
      </div>
    );
  };

  const renderContactHero = (member: MemberResponse, showSearch: boolean) => {
    const online = onlineUserIds.has(member.id);
    return (
      <div className="cid-hero">
        <Avatar name={member.name} src={member.profilePicUrl} size={96} online={online} />
        <h2 className="cid-name">{member.name}</h2>
        <span className="cid-sub">{member.email}</span>
        <span className={`cid-presence ${online ? "cid-presence--on" : ""}`}>
          {online ? "Online" : formatLastSeen(lastSeenByUserId[member.id] ?? member.lastSeenAt)}
        </span>
        <div className="cid-quick-actions">
          {member.id !== myUserId && isGroup && (
            <button type="button" className="cid-quick" onClick={() => handleMessageMember(member)} disabled={busy === `msg-${member.id}`}>
              <MessageCircle size={18} /><span>Message</span>
            </button>
          )}
          {member.id !== myUserId && (
            <>
              <button type="button" className="cid-quick" onClick={() => handleCallMember(member, "AUDIO")} disabled={!!conversation.blockedByMe || !!conversation.blockedMe}>
                <Phone size={18} /><span>Audio</span>
              </button>
              <button type="button" className="cid-quick" onClick={() => handleCallMember(member, "VIDEO")} disabled={!!conversation.blockedByMe || !!conversation.blockedMe}>
                <Video size={18} /><span>Video</span>
              </button>
            </>
          )}
          {showSearch && (
            <button type="button" className="cid-quick" onClick={() => { onOpenSearch(); onClose(); }}>
              <Search size={18} /><span>Search</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Disappearing messages, group details, invite links ───────────────
  const RETENTION_OPTIONS: { days: number; label: string }[] = [
    { days: 0, label: "Off" },
    { days: 1, label: "24 hours" },
    { days: 7, label: "7 days" },
    { days: 30, label: "30 days" },
    { days: 90, label: "90 days" },
  ];

  const setRetention = (days: number) =>
    run("retention", async () => {
      upsertConversation(await apiPut<ConversationResponse>(`/api/conversations/${conversation.id}/retention`, { days }));
    }, "Couldn't change disappearing messages.");

  const renderDisappearing = (canChange: boolean) => {
    const current = conversation.retentionDays ?? 0;
    const label = RETENTION_OPTIONS.find((o) => o.days === current)?.label ?? `${current} days`;
    return (
      <div className="cid-card">
        <div className="cid-row-static">
          <span className="cid-nav-icon"><Timer size={17} /></span>
          <span className="cid-nav-label">Disappearing messages</span>
          <span className="cid-nav-count">{label}</span>
        </div>
        {canChange ? (
          <div className="cid-mute-btns">
            {RETENTION_OPTIONS.map((o) => (
              <button
                key={o.days}
                type="button"
                className={`cid-mute-chip ${current === o.days ? "cid-mute-chip--on" : ""}`}
                disabled={busy === "retention"}
                onClick={() => current !== o.days && setRetention(o.days)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="cid-muted-note" style={{ margin: 0 }}>Only group admins can change this.</p>
        )}
        {current > 0 && (
          <p className="cid-muted-note" style={{ margin: 0 }}>
            Messages and files older than {label.toLowerCase()} are removed for everyone.
          </p>
        )}
      </div>
    );
  };

  const updateDetails = (patch: { name?: string; description?: string; isPublic?: boolean }) =>
    run("details", async () => {
      upsertConversation(await apiPut<ConversationResponse>(`/api/conversations/${conversation.id}/details`, patch));
    }, "Couldn't update the group.");

  const saveDetails = async () => {
    await updateDetails({ name: detailsName.trim(), description: detailsDesc.trim() });
    setEditingDetails(false);
  };

  const inviteUrl = (code: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/join/${code}`;

  const copyInvite = () => {
    if (!conversation.inviteCode) return;
    navigator.clipboard.writeText(inviteUrl(conversation.inviteCode)).catch(() => {});
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const resetInvite = () => {
    if (conversation.inviteCode && !confirm("Reset the invite link? The current link will stop working.")) return;
    run("invite", async () => {
      upsertConversation(await apiPost<ConversationResponse>(`/api/conversations/${conversation.id}/invite`));
    }, "Couldn't create the invite link.");
  };

  const disableInvite = () =>
    run("invite", async () => {
      upsertConversation(await apiDelete<ConversationResponse>(`/api/conversations/${conversation.id}/invite`));
    }, "Couldn't turn off the invite link.");

  // ── Views ──────────────────────────────────────────────────────────
  const renderDirectMain = (member: MemberResponse) => (
    <>
      {renderContactHero(member, true)}
      {renderAbout(member)}
      {renderMediaPreview()}
      {renderNotifications()}
      {renderDisappearing(true)}
      {renderCommonGroups(member.id)}
      <div className="cid-card cid-danger-card">
        <button type="button" className="cid-danger-row" onClick={handleClearChat} disabled={busy === "clear"}>
          <Eraser size={17} /> Clear chat
        </button>
        <button
          type="button"
          className="cid-danger-row"
          onClick={() => handleBlockToggle(member, !!conversation.blockedByMe)}
          disabled={busy === `block-${member.id}`}
        >
          <Ban size={17} /> {conversation.blockedByMe ? `Unblock ${member.name}` : `Block ${member.name}`}
        </button>
        <button type="button" className="cid-danger-row" onClick={() => setReportTarget(member)}>
          <Flag size={17} /> Report {member.name}
        </button>
        <button type="button" className="cid-danger-row" onClick={handleDeleteChat} disabled={busy === "delete"}>
          <Trash2 size={17} /> Delete chat
        </button>
      </div>
    </>
  );

  const existingMemberIds = new Set(conversation.members.map((m) => m.id));
  const availableUsers = users.filter((u) => !existingMemberIds.has(u.id));
  const sortedMembers = [...conversation.members].sort((a, b) => {
    if (a.id === myUserId) return -1;
    if (b.id === myUserId) return 1;
    const adminDiff = Number(groupAdminIds.has(b.id)) - Number(groupAdminIds.has(a.id));
    return adminDiff || a.name.localeCompare(b.name);
  });

  const renderGroupMain = () => (
    <>
      <div className="cid-hero">
        <div className="cid-group-icon"><Users size={40} /></div>
        <h2 className="cid-name">{conversation.name ?? "Group Chat"}</h2>
        <span className="cid-sub">
          {conversation.isPublic ? "Public channel" : "Group"} · {conversation.members.length} members
        </span>
        {conversation.description && <p className="cid-description">{conversation.description}</p>}
        <div className="cid-quick-actions">
          {iAmAdmin && (
            <button type="button" className="cid-quick" onClick={() => setIsAddingMember((v) => !v)}>
              <UserPlus size={18} /><span>Add</span>
            </button>
          )}
          <button type="button" className="cid-quick" onClick={() => { onOpenSearch(); onClose(); }}>
            <Search size={18} /><span>Search</span>
          </button>
        </div>
      </div>

      {renderMediaPreview()}
      {renderNotifications()}
      {renderDisappearing(iAmAdmin)}

      {iAmAdmin && (
        <div className="cid-card">
          <h4 className="cid-section-title">Group details</h4>
          {editingDetails ? (
            <div className="cid-details-form">
              <input className="cid-field" maxLength={100} value={detailsName} onChange={(e) => setDetailsName(e.target.value)} placeholder="Group name" />
              <textarea className="cid-field" rows={3} maxLength={1000} value={detailsDesc} onChange={(e) => setDetailsDesc(e.target.value)} placeholder="What's this group about? (optional)" />
              <div className="cid-inline-actions">
                <button type="button" className="cid-btn cid-btn--primary" disabled={busy === "details" || !detailsName.trim()} onClick={saveDetails}>Save</button>
                <button type="button" className="cid-btn" onClick={() => setEditingDetails(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="cid-list-row"
              onClick={() => { setDetailsName(conversation.name ?? ""); setDetailsDesc(conversation.description ?? ""); setEditingDetails(true); }}
            >
              <span className="cid-nav-icon"><Pencil size={16} /></span>
              <span className="cid-list-title">Edit name and description</span>
            </button>
          )}
          <label className="cid-toggle-row">
            <div className="cid-toggle-label">
              <Globe size={15} />
              <div>
                <span className="cid-toggle-title">Public channel</span>
                <span className="cid-toggle-sub">Anyone in the company can find and join it</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={!!conversation.isPublic}
              disabled={busy === "details"}
              onChange={(e) => updateDetails({ isPublic: e.target.checked })}
            />
          </label>
        </div>
      )}

      {iAmAdmin && (
        <div className="cid-card">
          <h4 className="cid-section-title">Invite link</h4>
          {conversation.inviteCode ? (
            <>
              <code className="cid-invite-url">{inviteUrl(conversation.inviteCode)}</code>
              <div className="cid-inline-actions">
                <button type="button" className="cid-btn cid-btn--primary" onClick={copyInvite}>
                  {inviteCopied ? <Check size={14} /> : <Copy size={14} />} {inviteCopied ? "Copied" : "Copy link"}
                </button>
                <button type="button" className="cid-btn" disabled={busy === "invite"} onClick={resetInvite}>
                  <RefreshCw size={14} /> Reset
                </button>
                <button type="button" className="cid-btn cid-btn--danger" disabled={busy === "invite"} onClick={disableInvite}>
                  Turn off
                </button>
              </div>
              <p className="cid-muted-note" style={{ margin: 0 }}>Anyone with this link can join. Reset it to make the old link stop working.</p>
            </>
          ) : (
            <button type="button" className="cid-list-row" disabled={busy === "invite"} onClick={resetInvite}>
              <span className="cid-nav-icon"><Link2 size={16} /></span>
              <span className="cid-list-title">Create invite link</span>
            </button>
          )}
        </div>
      )}

      {iAmAdmin && (
        <div className="cid-card">
          <h4 className="cid-section-title">Group settings</h4>
          <label className="cid-toggle-row">
            <div className="cid-toggle-label">
              <Lock size={15} />
              <div>
                <span className="cid-toggle-title">Only admins can send messages</span>
                <span className="cid-toggle-sub">Members can read but not post</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={conversation.onlyAdminsCanPost ?? false}
              disabled={busy === "perm"}
              onChange={(e) => handleTogglePermissions(e.target.checked, conversation.isAnnouncement ?? false)}
            />
          </label>
          <label className="cid-toggle-row">
            <div className="cid-toggle-label">
              <Volume2 size={15} />
              <div>
                <span className="cid-toggle-title">Announcement channel</span>
                <span className="cid-toggle-sub">Broadcast-only mode for announcements</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={conversation.isAnnouncement ?? false}
              disabled={busy === "perm"}
              onChange={(e) => handleTogglePermissions(conversation.onlyAdminsCanPost ?? false, e.target.checked)}
            />
          </label>
        </div>
      )}

      <div className="cid-card">
        <h4 className="cid-section-title">{conversation.members.length} members</h4>

        {iAmAdmin && (
          <button type="button" className="cid-list-row" onClick={() => setIsAddingMember((v) => !v)}>
            <div className="cid-mini-group-icon cid-mini-group-icon--accent"><UserPlus size={16} /></div>
            <div className="cid-list-text"><span className="cid-list-title">Add members</span></div>
          </button>
        )}

        {isAddingMember && (
          <div className="cid-add-box">
            {availableUsers.length === 0 ? (
              <p className="cid-empty">Everyone is already in this group</p>
            ) : (
              availableUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="cid-add-user-item"
                  disabled={busy === `add-${u.id}`}
                  onClick={() => handleAddMember(u)}
                >
                  <Avatar name={u.name} src={u.profilePicUrl} size={26} />
                  <span className="cid-add-user-name">{u.name}</span>
                  <UserPlus size={14} className="cid-add-icon" />
                </button>
              ))
            )}
          </div>
        )}

        {sortedMembers.map((m) => {
          const isMe = m.id === myUserId;
          const status = statusesByUserId[m.id];
          return (
            <button
              key={m.id}
              type="button"
              className="cid-list-row"
              onClick={() => !isMe && setView({ kind: "member", memberId: m.id })}
              disabled={isMe}
            >
              <Avatar name={m.name} src={m.profilePicUrl} size={36} online={onlineUserIds.has(m.id)} />
              <div className="cid-list-text">
                <span className="cid-list-title">{isMe ? "You" : m.name}</span>
                <span className="cid-list-sub">{status ? `${status.emoji} ${status.text}` : m.email}</span>
              </div>
              {groupAdminIds.has(m.id) && <span className="cid-admin-badge"><ShieldCheck size={11} /> Group admin</span>}
            </button>
          );
        })}
      </div>

      <div className="cid-card cid-danger-card">
        <button type="button" className="cid-danger-row" onClick={handleClearChat} disabled={busy === "clear"}>
          <Eraser size={17} /> Clear chat
        </button>
        <button type="button" className="cid-danger-row" onClick={handleExitGroup} disabled={busy === "exit"}>
          <LogOut size={17} /> Exit group
        </button>
      </div>
    </>
  );

  const renderMemberView = (memberId: number) => {
    const member = conversation.members.find((m) => m.id === memberId);
    if (!member) return <p className="cid-empty">This member is no longer in the group.</p>;
    const memberIsAdmin = groupAdminIds.has(member.id);
    return (
      <>
        {renderContactHero(member, false)}
        {renderAbout(member)}
        {renderCommonGroups(member.id)}
        <div className="cid-card cid-danger-card">
          <button type="button" className="cid-danger-row" onClick={() => setReportTarget(member)}>
            <Flag size={17} /> Report {member.name}
          </button>
        </div>
        {iAmAdmin && (
          <div className="cid-card">
            <h4 className="cid-section-title">Group admin actions</h4>
            <button
              type="button"
              className="cid-list-row"
              onClick={() => handleSetAdmin(member, !memberIsAdmin)}
              disabled={busy === `admin-${member.id}`}
            >
              <span className="cid-nav-icon">{memberIsAdmin ? <ShieldOff size={17} /> : <ShieldCheck size={17} />}</span>
              <span className="cid-list-title">{memberIsAdmin ? "Dismiss as admin" : "Make group admin"}</span>
            </button>
            <button
              type="button"
              className="cid-list-row cid-list-row--danger"
              onClick={() => handleRemoveMember(member)}
              disabled={busy === `remove-${member.id}`}
            >
              <span className="cid-nav-icon"><UserMinus size={17} /></span>
              <span className="cid-list-title">Remove from group</span>
            </button>
          </div>
        )}
      </>
    );
  };

  const renderMediaView = (tab: "MEDIA" | "DOCS" | "LINKS") => (
    <>
      <div className="cid-tabs">
        {([["MEDIA", `Media (${media.length})`], ["DOCS", `Docs (${docs.length})`], ["LINKS", `Links (${links.length})`]] as const).map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`cid-tab ${tab === t ? "cid-tab--active" : ""}`}
            onClick={() => setView({ kind: "media", tab: t })}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "MEDIA" && (
        media.length === 0 ? <p className="cid-empty">No media shared yet</p> : (
          <div className="cid-media-grid">
            {media.map((m, i) => (
              <button key={m.id} type="button" className="cid-media-thumb" title={m.name} onClick={() => setViewerIndex(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.name} />
              </button>
            ))}
          </div>
        )
      )}

      {tab === "DOCS" && (
        docs.length === 0 ? <p className="cid-empty">No documents shared yet</p> : (
          <div className="cid-files-list">
            {docs.map((d) => (
              <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="cid-file-card">
                <FileText size={18} className="cid-file-icon" />
                <div className="cid-file-meta">
                  <span className="cid-file-name">{d.name}</span>
                  <span className="cid-file-size">{formatFileSize(d.size)} · {formatShortDate(d.createdAt)}</span>
                </div>
                <Download size={14} className="cid-file-dl" />
              </a>
            ))}
          </div>
        )
      )}

      {tab === "LINKS" && (
        links.length === 0 ? <p className="cid-empty">No links shared yet</p> : (
          <div className="cid-files-list">
            {links.map((l) => (
              <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer" className="cid-file-card">
                <Link2 size={18} className="cid-file-icon" />
                <div className="cid-file-meta">
                  <span className="cid-file-name">{l.url.replace(/^https?:\/\//, "")}</span>
                  <span className="cid-file-size">{l.sender} · {formatShortDate(l.createdAt)}</span>
                </div>
              </a>
            ))}
          </div>
        )
      )}
    </>
  );

  const renderStarredView = () =>
    starredMessages.length === 0 ? (
      <div className="cid-empty-state">
        <Star size={36} />
        <p>No starred messages</p>
        <span>Star a message from its hover menu to find it here later.</span>
      </div>
    ) : (
      <div className="cid-files-list">
        {starredMessages.map((m) => (
          <button
            key={m.id}
            type="button"
            className="cid-starred-item"
            onClick={() => {
              onJumpToMessage(m.id);
              onClose();
            }}
          >
            <div className="cid-starred-head">
              <span className="cid-starred-sender">{m.senderId === myUserId ? "You" : m.senderName}</span>
              <span className="cid-starred-date">{formatShortDate(m.createdAt)}</span>
            </div>
            <span className="cid-starred-body">
              {m.content || (m.attachments?.length ? "📎 Attachment" : m.type === "POLL" ? "📊 Poll" : "Message")}
            </span>
          </button>
        ))}
      </div>
    );

  const headerTitle =
    view.kind === "media" ? "Media, links and docs"
    : view.kind === "starred" ? "Starred messages"
    : view.kind === "member" ? "Contact info"
    : isGroup ? "Group info" : "Contact info";

  return (
    <aside className="cid-drawer">
      <header className="cid-header">
        {view.kind !== "main" ? (
          <button type="button" className="cid-close" onClick={() => setView({ kind: "main" })} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <button type="button" className="cid-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        )}
        <h3>{headerTitle}</h3>
      </header>

      <div className="cid-content">
        {view.kind === "main" && (isGroup ? renderGroupMain() : otherMember ? renderDirectMain(otherMember) : null)}
        {view.kind === "media" && renderMediaView(view.tab)}
        {view.kind === "starred" && renderStarredView()}
        {view.kind === "member" && renderMemberView(view.memberId)}
      </div>

      {viewerIndex !== null && (
        <ImageViewer images={media} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
      {reportTarget && (
        <ReportModal
          targetUserId={reportTarget.id}
          targetName={reportTarget.name}
          onBlock={
            !isGroup && !conversation.blockedByMe
              ? () => apiPost(`/api/users/${reportTarget.id}/block`).then(refreshConversation).catch(() => {})
              : undefined
          }
          onClose={() => setReportTarget(null)}
        />
      )}

      <style>{`
        .cid-drawer {
          width: 340px; height: 100%; background: var(--bg-secondary); border-left: 1px solid var(--border);
          display: flex; flex-direction: column; flex-shrink: 0; z-index: 10;
        }
        .cid-header {
          height: 64px; padding: 0 1rem; border-bottom: 1px solid var(--border); background: var(--bg-primary);
          display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;
        }
        .cid-header h3 { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0; }
        .cid-close {
          background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.35rem;
          border-radius: 6px; display: flex;
        }
        .cid-close:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .cid-content {
          flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem;
        }

        .cid-hero {
          display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.3rem;
          background: var(--bg-primary); border-radius: 14px; padding: 1.25rem 0.75rem 1rem;
          border: 1px solid var(--border);
        }
        .cid-group-icon {
          width: 96px; height: 96px; border-radius: 50%;
          background: linear-gradient(135deg, var(--accent-muted), var(--accent-deep)); color: var(--accent);
          display: flex; align-items: center; justify-content: center;
        }
        .cid-name { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin: 0.4rem 0 0; }
        .cid-sub { font-size: 0.8125rem; color: var(--text-muted); }
        .cid-presence { font-size: 0.75rem; color: var(--text-faint); }
        .cid-presence--on { color: var(--success-text); font-weight: 600; }
        .cid-quick-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; justify-content: center; }
        .cid-quick {
          display: flex; flex-direction: column; align-items: center; gap: 0.25rem; min-width: 68px;
          padding: 0.55rem 0.5rem; border-radius: 10px; border: 1px solid var(--border);
          background: var(--bg-primary); color: var(--accent); cursor: pointer; transition: background 0.15s;
        }
        .cid-quick span { font-size: 0.7rem; font-weight: 600; color: var(--text-secondary); }
        .cid-quick:hover:not(:disabled) { background: var(--accent-soft); }
        .cid-quick:disabled { opacity: 0.45; cursor: not-allowed; }

        .cid-card {
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: 14px;
          padding: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;
        }
        .cid-section-title {
          font-size: 0.75rem; font-weight: 700; color: var(--text-faint); text-transform: uppercase;
          letter-spacing: 0.05em; margin: 0 0 0.25rem;
        }
        .cid-empty { font-size: 0.8125rem; color: var(--text-faint); margin: 0; }

        .cid-nav-row, .cid-row-static, .cid-list-row {
          display: flex; align-items: center; gap: 0.7rem; width: 100%; padding: 0.5rem 0.35rem;
          background: none; border: none; border-radius: 8px; text-align: left; color: var(--text-primary);
        }
        .cid-nav-row, .cid-list-row { cursor: pointer; transition: background 0.12s; }
        .cid-nav-row:hover, .cid-list-row:hover:not(:disabled) { background: var(--bg-tertiary); }
        .cid-list-row:disabled { cursor: default; }
        .cid-nav-icon { color: var(--text-muted); display: flex; }
        .cid-nav-label { flex: 1; font-size: 0.875rem; font-weight: 500; }
        .cid-nav-count { font-size: 0.8125rem; color: var(--text-muted); }
        .cid-nav-chevron { color: var(--text-faint); }
        .cid-link-btn {
          background: none; border: none; color: var(--accent); font-weight: 600; font-size: 0.8125rem; cursor: pointer;
        }
        .cid-muted-note { font-size: 0.75rem; color: var(--text-muted); margin: 0 0 0 2rem; }

        .cid-media-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 0 0.35rem 0.25rem; }
        .cid-media-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
        .cid-media-thumb {
          aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: var(--bg-tertiary); display: block;
          border: none; padding: 0; cursor: zoom-in; width: 100%;
        }
        .cid-media-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .cid-mute-btns { display: flex; gap: 0.4rem; }
        .cid-mute-chip {
          flex: 1; padding: 0.4rem; border-radius: 8px; border: 1px solid var(--border);
          background: var(--bg-secondary); color: var(--text-primary); font-size: 0.75rem;
          font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .cid-mute-chip:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
        .cid-mute-btns { flex-wrap: wrap; }
        .cid-mute-chip--on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
        .cid-description { margin: 0.3rem 0 0; font-size: 0.82rem; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
        .cid-details-form { display: flex; flex-direction: column; gap: 0.4rem; }
        .cid-field { border: 1px solid var(--border); border-radius: 8px; padding: 0.45rem 0.6rem; font: inherit; font-size: 0.84rem; background: var(--bg-secondary); color: var(--text-primary); resize: vertical; outline: none; }
        .cid-field:focus { border-color: var(--accent); }
        .cid-inline-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
        .cid-btn { display: inline-flex; align-items: center; gap: 0.3rem; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); padding: 0.35rem 0.7rem; border-radius: 8px; font-size: 0.76rem; font-weight: 600; cursor: pointer; }
        .cid-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cid-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .cid-btn--danger { color: var(--danger); border-color: var(--danger); }
        .cid-invite-url { display: block; font-size: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; padding: 0.45rem 0.55rem; word-break: break-all; color: var(--text-primary); }

        .cid-info-row {
          display: flex; align-items: center; gap: 0.6rem; font-size: 0.84375rem; color: var(--text-secondary);
          padding: 0.25rem 0.35rem; min-width: 0;
        }
        .cid-info-row span, .cid-info-link { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cid-info-link { color: var(--accent); text-decoration: none; }
        .cid-info-link:hover { text-decoration: underline; }
        .cid-info-icon { color: var(--text-muted); flex-shrink: 0; }

        .cid-mini-group-icon {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center;
          justify-content: center; background: var(--bg-tertiary); color: var(--text-muted);
        }
        .cid-mini-group-icon--accent { background: var(--accent); color: #fff; }
        .cid-list-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cid-list-title {
          font-size: 0.875rem; font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cid-list-sub {
          font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cid-list-row--danger .cid-list-title, .cid-list-row--danger .cid-nav-icon { color: var(--danger); }
        .cid-admin-badge {
          font-size: 0.625rem; font-weight: 700; color: var(--success-text); background: var(--success-soft);
          padding: 2px 6px; border-radius: 999px; display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0;
        }

        .cid-add-box {
          background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px;
          padding: 0.4rem; display: flex; flex-direction: column; gap: 0.25rem; max-height: 200px; overflow-y: auto;
        }
        .cid-add-user-item {
          display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem; border-radius: 6px;
          border: none; background: var(--bg-primary); cursor: pointer; text-align: left;
        }
        .cid-add-user-item:hover { background: var(--accent-soft); }
        .cid-add-user-name { flex: 1; font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); }
        .cid-add-icon { color: var(--accent); }

        .cid-toggle-row {
          display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
          padding: 0.45rem 0.35rem; cursor: pointer;
        }
        .cid-toggle-label { display: flex; align-items: center; gap: 0.6rem; color: var(--text-primary); }
        .cid-toggle-title { font-size: 0.8125rem; font-weight: 600; display: block; }
        .cid-toggle-sub { font-size: 0.7rem; color: var(--text-muted); display: block; }

        .cid-danger-card { padding: 0.35rem; }
        .cid-danger-row {
          display: flex; align-items: center; gap: 0.7rem; width: 100%; padding: 0.65rem 0.6rem;
          background: none; border: none; border-radius: 8px; cursor: pointer; text-align: left;
          color: var(--danger); font-size: 0.875rem; font-weight: 600; transition: background 0.12s;
        }
        .cid-danger-row:hover:not(:disabled) { background: var(--danger-soft); }
        .cid-danger-row:disabled { opacity: 0.5; cursor: wait; }

        .cid-tabs {
          display: flex; gap: 2px; background: var(--bg-tertiary); padding: 3px; border-radius: 10px;
        }
        .cid-tab {
          flex: 1; border: none; background: transparent; font-size: 0.75rem; font-weight: 600;
          color: var(--text-muted); padding: 0.4rem; border-radius: 8px; cursor: pointer;
        }
        .cid-tab--active { background: var(--bg-primary); color: var(--accent); box-shadow: var(--shadow-sm); }

        .cid-files-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .cid-file-card {
          display: flex; align-items: center; gap: 0.625rem; padding: 0.55rem 0.7rem; border-radius: 10px;
          background: var(--bg-primary); border: 1px solid var(--border); text-decoration: none;
        }
        .cid-file-card:hover { background: var(--bg-tertiary); }
        .cid-file-icon { color: var(--accent); flex-shrink: 0; }
        .cid-file-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cid-file-name {
          font-size: 0.8125rem; font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cid-file-size { font-size: 0.6875rem; color: var(--text-muted); }
        .cid-file-dl { color: var(--text-faint); }

        .cid-starred-item {
          display: flex; flex-direction: column; gap: 0.25rem; padding: 0.6rem 0.75rem; text-align: left;
          border-radius: 10px; background: var(--bg-primary); border: 1px solid var(--border); cursor: pointer;
        }
        .cid-starred-item:hover { background: var(--bg-tertiary); }
        .cid-starred-head { display: flex; justify-content: space-between; gap: 0.5rem; }
        .cid-starred-sender { font-size: 0.75rem; font-weight: 700; color: var(--accent); }
        .cid-starred-date { font-size: 0.6875rem; color: var(--text-faint); }
        .cid-starred-body {
          font-size: 0.8125rem; color: var(--text-primary); display: -webkit-box; -webkit-line-clamp: 3;
          -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;
        }
        .cid-empty-state {
          display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.35rem;
          padding: 2.5rem 1rem; color: var(--text-faint);
        }
        .cid-empty-state p { margin: 0.5rem 0 0; font-weight: 700; color: var(--text-secondary); }
        .cid-empty-state span { font-size: 0.8125rem; }
      `}</style>
    </aside>
  );
}
