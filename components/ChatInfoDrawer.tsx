"use client";

import { X, Users, Mail, Building, FileText, Download } from "lucide-react";
import { ConversationResponse, MemberResponse, AttachmentResponse } from "@/types";
import Avatar from "./Avatar";

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
  if (!isOpen) return null;

  const isGroup = conversation.type === "GROUP";
  const otherMember: MemberResponse | undefined = !isGroup
    ? conversation.members.find((m) => m.id !== myUserId)
    : undefined;

  const title = isGroup
    ? conversation.name ?? "Group Chat"
    : otherMember?.name ?? "Direct Message";

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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

        {/* Group Members List */}
        {isGroup && (
          <div className="cid-section">
            <h4 className="cid-section-title">Members ({conversation.members.length})</h4>
            <div className="cid-members-list">
              {conversation.members.map((m) => {
                const isOnline = onlineUserIds.has(m.id);
                const isMe = m.id === myUserId;
                return (
                  <div key={m.id} className="cid-member-item">
                    <Avatar name={m.name} size={32} online={isOnline} />
                    <div className="cid-member-info">
                      <span className="cid-member-name">
                        {m.name} {isMe && "(You)"}
                      </span>
                      <span className="cid-member-sub">{m.role || m.email}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Shared Attachments */}
        <div className="cid-section">
          <h4 className="cid-section-title">Shared Files ({sharedAttachments.length})</h4>
          {sharedAttachments.length === 0 ? (
            <p className="cid-empty-files">No files shared yet</p>
          ) : (
            <div className="cid-files-list">
              {sharedAttachments.map((att) => {
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
          width: 300px;
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
          margin: 0 0 0.25rem;
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
          gap: 0.5rem;
        }
        .cid-member-item {
          display: flex;
          align-items: center;
          gap: 0.625rem;
        }
        .cid-member-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .cid-member-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #0f172a;
        }
        .cid-member-sub {
          font-size: 0.75rem;
          color: #64748b;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
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
