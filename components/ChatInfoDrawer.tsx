"use client";

import { useState } from "react";
import { X, Users, Mail, Building, FileText, Download, UserPlus, UserMinus, ShieldCheck, Bell, BellOff, Lock, Volume2 } from "lucide-react";
import { ConversationResponse, MemberResponse, AttachmentResponse, UserResponse } from "@/types";
import Avatar from "./Avatar";
import { useStore } from "@/lib/store";
import { apiPost, apiPut, apiDelete } from "@/lib/api";

interface ChatInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationResponse;
  myUserId: number | null;
  onlineUserIds: Set<number>;
  sharedAttachments: AttachmentResponse[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatInfoDrawer({
  isOpen,
  onClose,
  conversation,
  myUserId,
  onlineUserIds,
  sharedAttachments,
}: ChatInfoDrawerProps) {
  const [fileTab, setFileTab] = useState<"ALL" | "PHOTOS" | "DOCS">("ALL");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const users = useStore((s) => s.users);
  const userRole = useStore((s) => s.userRole);
  const upsertConversation = useStore((s) => s.upsertConversation);

  if (!isOpen) return null;

  const isGroup = conversation.type === "GROUP";
  const isAdmin = userRole === "ADMIN" || conversation.members.some((m) => m.id === myUserId && m.role === "ADMIN");

  const otherMember: MemberResponse | undefined = !isGroup
    ? conversation.members.find((m) => m.id !== myUserId)
    : undefined;

  const title = isGroup
    ? conversation.name ?? "Group Chat"
    : otherMember?.name ?? "Direct Message";

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  // Filter users who can be added to this group
  const existingMemberIds = new Set(conversation.members.map((m) => m.id));
  const availableUsers = users.filter((u) => !existingMemberIds.has(u.id));

  const filteredAttachments = sharedAttachments.filter((att) => {
    const isImage = (att.contentType ?? att.mimeType ?? "").startsWith("image/");
    if (fileTab === "PHOTOS") return isImage;
    if (fileTab === "DOCS") return !isImage;
    return true;
  });

  const handleAddMember = async (user: UserResponse) => {
    setLoadingId(user.id);
    try {
      const updated = await apiPost<ConversationResponse>(`/api/conversations/${conversation.id}/members`, {
        userId: user.id,
      });
      upsertConversation(updated);
      setIsAddingMember(false);
    } catch (err) {
      console.error("Failed to add member:", err);
      alert("Failed to add member to group.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm("Are you sure you want to remove this member from the group?")) return;
    setLoadingId(memberId);
    try {
      const updated = await apiDelete<ConversationResponse>(`/api/conversations/${conversation.id}/members/${memberId}`);
      upsertConversation(updated);
    } catch (err) {
      console.error("Failed to remove member:", err);
      alert("Failed to remove member.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleMute = async (durationHours: number) => {
    try {
      const updated = await apiPost<ConversationResponse>(`/api/conversations/${conversation.id}/mute`, { durationHours });
      upsertConversation(updated);
    } catch (err) {
      console.error("Failed to mute conversation:", err);
    }
  };

  const handleTogglePermissions = async (onlyAdmins: boolean, isAnnounce: boolean) => {
    try {
      const updated = await apiPut<ConversationResponse>(`/api/conversations/${conversation.id}/permissions`, {
        onlyAdminsCanPost: onlyAdmins,
        isAnnouncement: isAnnounce,
      });
      upsertConversation(updated);
    } catch (err) {
      console.error("Failed to update permissions:", err);
      alert("Failed to update group settings.");
    }
  };

  return (
    <aside className="cid-drawer">
      <header className="cid-header">
        <h3>Details</h3>
        <button type="button" className="cid-close" onClick={onClose} aria-label="Close details">
          <X size={18} />
        </button>
      </header>

      <div className="cid-content">
        {/* Main Header / Hero */}
        <div className="cid-hero">
          {isGroup ? (
            <div className="cid-group-icon">
              <Users size={32} />
            </div>
          ) : (
            <Avatar name={title} size={72} online={otherMember ? onlineUserIds.has(otherMember.id) : false} />
          )}
          <h2 className="cid-name">{title}</h2>
          <span className="cid-sub">
            {isGroup ? `${conversation.members.length} members` : otherMember?.role ?? "User"}
          </span>
        </div>

        {/* Notifications & Mute Section */}
        <div className="cid-section">
          <h4 className="cid-section-title">Notifications</h4>
          {conversation.mutedUntil && new Date(conversation.mutedUntil).getTime() > Date.now() ? (
            <div className="cid-muted-banner">
              <BellOff size={16} />
              <span>Notifications muted</span>
              <button type="button" className="cid-unmute-btn" onClick={() => handleMute(0)}>
                Unmute
              </button>
            </div>
          ) : (
            <div className="cid-mute-options">
              <span className="cid-mute-label">Mute notifications for:</span>
              <div className="cid-mute-btns">
                <button type="button" className="cid-mute-chip" onClick={() => handleMute(8)}>
                  8 Hours
                </button>
                <button type="button" className="cid-mute-chip" onClick={() => handleMute(168)}>
                  1 Week
                </button>
                <button type="button" className="cid-mute-chip" onClick={() => handleMute(99999)}>
                  Always
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Group Admin Permissions */}
        {isGroup && isAdmin && (
          <div className="cid-section">
            <h4 className="cid-section-title">Group Settings</h4>
            <div className="cid-toggle-row">
              <div className="cid-toggle-label">
                <Lock size={15} />
                <div>
                  <span className="cid-toggle-title">Only Admins Can Post</span>
                  <span className="cid-toggle-sub">Restrict sending messages to group admins</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={conversation.onlyAdminsCanPost ?? false}
                onChange={(e) =>
                  handleTogglePermissions(e.target.checked, conversation.isAnnouncement ?? false)
                }
              />
            </div>

            <div className="cid-toggle-row">
              <div className="cid-toggle-label">
                <Volume2 size={15} />
                <div>
                  <span className="cid-toggle-title">Announcement Channel</span>
                  <span className="cid-toggle-sub">Broadcast-only mode for announcements</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={conversation.isAnnouncement ?? false}
                onChange={(e) =>
                  handleTogglePermissions(conversation.onlyAdminsCanPost ?? false, e.target.checked)
                }
              />
            </div>
          </div>
        )}

        {/* Direct Chat Info */}
        {!isGroup && otherMember && (
          <div className="cid-section">
            <h4 className="cid-section-title">User Info</h4>
            <div className="cid-info-row">
              <Mail size={16} className="cid-info-icon" />
              <span>{otherMember.email}</span>
            </div>
            {otherMember.department && (
              <div className="cid-info-row">
                <Building size={16} className="cid-info-icon" />
                <span>{otherMember.department}</span>
              </div>
            )}
          </div>
        )}

        {/* Group Members List & Admin Actions */}
        {isGroup && (
          <div className="cid-section">
            <div className="cid-member-header">
              <h4 className="cid-section-title">Members ({conversation.members.length})</h4>
              {isAdmin && (
                <button
                  type="button"
                  className="cid-add-btn"
                  onClick={() => setIsAddingMember(!isAddingMember)}
                >
                  <UserPlus size={14} /> Add
                </button>
              )}
            </div>

            {/* Add Member Dropdown Selector */}
            {isAddingMember && (
              <div className="cid-add-box">
                <span className="cid-add-title">Select User to Add:</span>
                {availableUsers.length === 0 ? (
                  <p className="cid-empty-users">All available users are in this group</p>
                ) : (
                  <div className="cid-add-list">
                    {availableUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="cid-add-user-item"
                        disabled={loadingId === u.id}
                        onClick={() => handleAddMember(u)}
                      >
                        <Avatar name={u.name} size={24} />
                        <span className="cid-add-user-name">{u.name}</span>
                        <UserPlus size={14} className="cid-add-icon" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="cid-members-list">
              {conversation.members.map((m) => {
                const isOnline = onlineUserIds.has(m.id);
                const isMe = m.id === myUserId;
                const memberIsAdmin = m.role === "ADMIN";

                return (
                  <div key={m.id} className="cid-member-item">
                    <Avatar name={m.name} size={32} online={isOnline} />
                    <div className="cid-member-info">
                      <div className="cid-name-row">
                        <span className="cid-member-name">
                          {m.name} {isMe && "(You)"}
                        </span>
                        {memberIsAdmin && (
                          <span className="cid-admin-badge" title="Group Admin">
                            <ShieldCheck size={12} /> Admin
                          </span>
                        )}
                      </div>
                      <span className="cid-member-sub">{m.email}</span>
                    </div>

                    {/* Admin Management Actions */}
                    {isAdmin && !isMe && (
                      <div className="cid-member-actions">
                        <button
                          type="button"
                          className="cid-action-btn cid-action-btn--remove"
                          onClick={() => handleRemoveMember(m.id)}
                          disabled={loadingId === m.id}
                          title="Remove from group"
                        >
                          <UserMinus size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Shared Attachments Categorized Gallery */}
        <div className="cid-section">
          <div className="cid-gallery-header">
            <h4 className="cid-section-title">Shared Gallery</h4>
            <div className="cid-tabs">
              {(["ALL", "PHOTOS", "DOCS"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`cid-tab ${fileTab === t ? "cid-tab--active" : ""}`}
                  onClick={() => setFileTab(t)}
                >
                  {t === "ALL" ? "All" : t === "PHOTOS" ? "Photos" : "Docs"}
                </button>
              ))}
            </div>
          </div>

          {filteredAttachments.length === 0 ? (
            <p className="cid-empty-files">No {fileTab.toLowerCase()} shared yet</p>
          ) : (
            <div className="cid-files-list">
              {filteredAttachments.map((att) => {
                const downloadUrl = att.downloadUrl.startsWith("http")
                  ? att.downloadUrl
                  : `${API_BASE}${att.downloadUrl}`;
                const name = att.filename ?? att.fileName ?? att.originalName ?? "File";
                const bytes = att.size ?? att.fileSize ?? 0;

                return (
                  <a
                    key={att.id}
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cid-file-card"
                  >
                    <FileText size={18} className="cid-file-icon" />
                    <div className="cid-file-meta">
                      <span className="cid-file-name">{name}</span>
                      <span className="cid-file-size">{formatFileSize(bytes)}</span>
                    </div>
                    <Download size={14} className="cid-file-dl" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .cid-drawer {
          width: 310px;
          height: 100%;
          background: var(--bg-primary);
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          z-index: 10;
        }
        .cid-header {
          height: 64px;
          padding: 0 1.25rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .cid-header h3 {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .cid-close {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.35rem;
          border-radius: 6px;
        }
        .cid-close:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        .cid-content {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .cid-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.5rem;
        }
        .cid-group-icon {
          width: 72px;
          height: 72px;
          border-radius: 20px;
          background: linear-gradient(135deg, var(--accent-muted), var(--accent-deep));
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cid-name {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .cid-sub {
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .cid-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .cid-section-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
        }
        .cid-member-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .cid-add-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent);
          background: var(--accent-soft);
          border: none;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .cid-add-btn:hover {
          background: var(--accent-muted);
        }
        .cid-add-box {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .cid-add-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-tertiary);
        }
        .cid-empty-users {
          font-size: 0.75rem;
          color: var(--text-faint);
          margin: 0;
        }
        .cid-add-list {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          max-height: 140px;
          overflow-y: auto;
        }
        .cid-add-user-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
          border: none;
          background: var(--bg-primary);
          cursor: pointer;
          text-align: left;
          transition: background 0.12s;
        }
        .cid-add-user-item:hover {
          background: var(--accent-soft);
        }
        .cid-add-user-name {
          flex: 1;
          font-size: 0.78125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .cid-add-icon {
          color: var(--accent);
        }

        .cid-muted-banner {
          display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
          padding: 0.5rem 0.75rem; background: var(--warning-soft); border: 1px solid var(--warning-border);
          color: var(--warning); border-radius: 10px; font-size: 0.8125rem; font-weight: 600;
        }
        .cid-unmute-btn {
          background: var(--warning); color: #fff; border: none; padding: 0.25rem 0.6rem;
          border-radius: 6px; font-size: 0.75rem; cursor: pointer; font-weight: 600;
        }
        .cid-mute-options { display: flex; flex-direction: column; gap: 0.4rem; }
        .cid-mute-label { font-size: 0.75rem; color: var(--text-muted); }
        .cid-mute-btns { display: flex; gap: 0.4rem; }
        .cid-mute-chip {
          flex: 1; padding: 0.35rem; border-radius: 8px; border: 1px solid var(--border);
          background: var(--bg-secondary); color: var(--text-primary); font-size: 0.75rem;
          font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .cid-mute-chip:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

        .cid-toggle-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.5rem 0; border-bottom: 1px solid var(--border);
        }
        .cid-toggle-label { display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary); }
        .cid-toggle-title { font-size: 0.8125rem; font-weight: 600; display: block; }
        .cid-toggle-sub { font-size: 0.7rem; color: var(--text-muted); display: block; }

        .cid-info-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.84375rem;
          color: var(--text-secondary);
        }
        .cid-info-icon {
          color: var(--text-muted);
        }
        .cid-members-list {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }
        .cid-member-item {
          display: flex;
          align-items: center;
          gap: 0.625rem;
        }
        .cid-member-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .cid-name-row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .cid-member-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .cid-admin-badge {
          font-size: 0.625rem;
          font-weight: 700;
          color: var(--success-text);
          background: var(--success-soft);
          padding: 1px 5px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .cid-member-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .cid-member-actions {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .cid-action-btn {
          border: none;
          background: none;
          padding: 0.3rem;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .cid-action-btn--remove {
          color: var(--danger);
          background: var(--danger-soft);
        }
        .cid-action-btn--remove:hover {
          background: var(--danger-hover);
          color: var(--danger-deep);
        }

        .cid-gallery-header {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem;
        }
        .cid-tabs {
          display: flex; gap: 2px; background: var(--bg-tertiary); padding: 2px; border-radius: 6px;
        }
        .cid-tab {
          border: none; background: transparent; font-size: 0.6875rem; font-weight: 600;
          color: var(--text-muted); padding: 2px 6px; border-radius: 4px; cursor: pointer; transition: all 0.1s;
        }
        .cid-tab--active {
          background: var(--bg-primary); color: var(--accent); box-shadow: var(--shadow-sm);
        }
        .cid-empty-files {
          font-size: 0.8125rem;
          color: var(--text-faint);
          margin: 0;
        }
        .cid-files-list {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .cid-file-card {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.5rem 0.625rem;
          border-radius: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          text-decoration: none;
          transition: background 0.12s;
        }
        .cid-file-card:hover {
          background: var(--bg-tertiary);
        }
        .cid-file-icon {
          color: var(--accent);
        }
        .cid-file-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .cid-file-name {
          font-size: 0.78125rem;
          font-weight: 600;
          color: var(--text-primary);
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .cid-file-size {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .cid-file-dl {
          color: var(--text-faint);
        }
      `}</style>
    </aside>
  );
}
