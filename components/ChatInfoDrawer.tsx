"use client";

import { useState } from "react";
import { X, Users, Mail, Building, FileText, Download, UserPlus, UserMinus, ShieldCheck } from "lucide-react";
import { ConversationResponse, MemberResponse, AttachmentResponse, UserResponse } from "@/types";
import Avatar from "./Avatar";
import { useStore } from "@/lib/store";
import { apiPost, apiDelete } from "@/lib/api";

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
          background: #ffffff;
          border-left: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          z-index: 10;
        }
        .cid-header {
          height: 64px;
          padding: 0 1.25rem;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .cid-header h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .cid-close {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 0.35rem;
          border-radius: 6px;
        }
        .cid-close:hover {
          background: #f1f5f9;
          color: #0f172a;
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
          background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cid-name {
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .cid-sub {
          font-size: 0.8125rem;
          color: #64748b;
        }
        .cid-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .cid-section-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #94a3b8;
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
          color: #4f46e5;
          background: #e0e7ff;
          border: none;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .cid-add-btn:hover {
          background: #c7d2fe;
        }
        .cid-add-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 0.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .cid-add-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
        }
        .cid-empty-users {
          font-size: 0.75rem;
          color: #94a3b8;
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
          background: #ffffff;
          cursor: pointer;
          text-align: left;
          transition: background 0.12s;
        }
        .cid-add-user-item:hover {
          background: #e0e7ff;
        }
        .cid-add-user-name {
          flex: 1;
          font-size: 0.78125rem;
          font-weight: 600;
          color: #0f172a;
        }
        .cid-add-icon {
          color: #4f46e5;
        }

        .cid-info-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.84375rem;
          color: #334155;
        }
        .cid-info-icon {
          color: #64748b;
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
          color: #0f172a;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .cid-admin-badge {
          font-size: 0.625rem;
          font-weight: 700;
          color: #15803d;
          background: #dcfce7;
          padding: 1px 5px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .cid-member-sub {
          font-size: 0.75rem;
          color: #64748b;
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
          color: #ef4444;
          background: #fee2e2;
        }
        .cid-action-btn--remove:hover {
          background: #fca5a5;
          color: #991b1b;
        }

        .cid-gallery-header {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem;
        }
        .cid-tabs {
          display: flex; gap: 2px; background: #f1f5f9; padding: 2px; border-radius: 6px;
        }
        .cid-tab {
          border: none; background: transparent; font-size: 0.6875rem; font-weight: 600;
          color: #64748b; padding: 2px 6px; border-radius: 4px; cursor: pointer; transition: all 0.1s;
        }
        .cid-tab--active {
          background: #ffffff; color: #4f46e5; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .cid-empty-files {
          font-size: 0.8125rem;
          color: #94a3b8;
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
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          text-decoration: none;
          transition: background 0.12s;
        }
        .cid-file-card:hover {
          background: #f1f5f9;
        }
        .cid-file-icon {
          color: #4f46e5;
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
          color: #0f172a;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .cid-file-size {
          font-size: 0.6875rem;
          color: #64748b;
        }
        .cid-file-dl {
          color: #94a3b8;
        }
      `}</style>
    </aside>
  );
}
