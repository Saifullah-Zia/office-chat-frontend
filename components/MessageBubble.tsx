"use client";

import { useState } from "react";
import { MessageResponse, AttachmentResponse } from "@/types";
import AudioPlayer from "./AudioPlayer";
import PollCard from "./PollCard";
import Avatar from "./Avatar";
import {
  FileText, Download, Check, CheckCheck, Copy, Reply, Edit2, Trash2,
  Check as CheckIcon, X as XIcon, X, Pin, Star
} from "lucide-react";
import { apiPost, apiPut, apiDelete } from "@/lib/api";
import { useStore } from "@/lib/store";
import RichTextRenderer from "./RichTextRenderer";
import DocViewerModal from "./DocViewerModal";

interface MessageBubbleProps {
  message: MessageResponse;
  isMine: boolean;
  onReply?: (msg: MessageResponse) => void;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseReplyAndContent(rawContent: string): { reply: { sender: string; text: string } | null; text: string } {
  if (!rawContent) return { reply: null, text: "" };
  const match = rawContent.match(/^Replying to ([^:]+):\s*"([^"]*?)(?:\.\.\.)?"\s*\n([\s\S]*)$/);
  if (match) {
    return {
      reply: { sender: match[1], text: match[2] },
      text: match[3],
    };
  }
  return { reply: null, text: rawContent };
}

export default function MessageBubble({ message, isMine, onReply }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [activeEmojiTab, setActiveEmojiTab] = useState<string>("ALL");
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; isImage?: boolean; isPdf?: boolean } | null>(null);

  const userRole = useStore((s) => s.userRole);
  const currentUserId = useStore((s) => s.userId);
  const currentUserName = useStore((s) => s.userName);
  const starredMessageIds = useStore((s) => s.starredMessageIds);
  const toggleStarMessage = useStore((s) => s.toggleStarMessage);

  const isStarred = starredMessageIds.has(message.id);
  const timeStr = formatTime(message.createdAt);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  const isDeleted = message.deleted ?? false;
  const isEdited = message.edited ?? false;
  const reactionsMap = message.reactions ?? {};
  const reactionDetails = message.reactionDetails ?? [];

  const totalReactionsCount = reactionDetails.length;

  const handleReact = async (emoji: string) => {
    try {
      await apiPost(`/api/conversations/${message.conversationId}/messages/${message.id}/reactions`, { emoji });
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }
    setIsSubmittingEdit(true);
    try {
      await apiPut(`/api/conversations/${message.conversationId}/messages/${message.id}`, { content: trimmed });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to edit message:", err);
      alert("Could not edit message (must be within 15 minutes of sending).");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      await apiDelete(`/api/conversations/${message.conversationId}/messages/${message.id}`);
    } catch (err) {
      console.error("Failed to delete message:", err);
      alert("Failed to delete message.");
    }
  };

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const audioAttachment = message.attachments?.find(
    (a) =>
      (a.contentType ?? a.mimeType ?? "").startsWith("audio/") ||
      (a.filename ?? a.fileName ?? "").endsWith(".webm") ||
      (a.filename ?? a.fileName ?? "").endsWith(".mp3") ||
      (a.filename ?? a.fileName ?? "").endsWith(".ogg"),
  );

  const isVoiceMessage = !isDeleted && !!audioAttachment;
  const isTaggedAudioWithoutFile =
    !isDeleted && !audioAttachment && (message.type === "VOICE" || message.type === "AUDIO");
  const audioSrc = audioAttachment
    ? audioAttachment.downloadUrl.startsWith("http")
      ? audioAttachment.downloadUrl
      : `${API_BASE}${audioAttachment.downloadUrl}`
    : undefined;

  const isRead = message.read ?? false;
  const isDelivered = message.delivered ?? false;
  const canEditOrDelete = isMine || userRole === "ADMIN";

  const filteredReactionDetails = reactionDetails.filter((r) =>
    activeEmojiTab === "ALL" ? true : r.emoji === activeEmojiTab
  );

  const handleTogglePin = async () => {
    try {
      await apiPost(`/api/conversations/${message.conversationId}/messages/${message.id}/pin`);
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  };

  return (
    <div className={`mb-container ${isMine ? "mb-container--mine" : "mb-container--theirs"}`}>
      {/* Sender Avatar */}
      {!isMine && (
        <div className="mb-avatar-wrapper">
          <Avatar name={message.senderName} size={30} />
        </div>
      )}

      {/* Bubble Wrapper */}
      <div className="mb-wrapper">
        {/* Sender Name */}
        {!isMine && (
          <span className="mb-sender-name">{message.senderName}</span>
        )}

        {/* Pinned Badge */}
        {message.pinned && (
          <div className="mb-pinned-badge">
            <Pin size={11} /> Pinned Message
          </div>
        )}

        {/* Hover Action Bar */}
        {!isDeleted && (
          <div className="mb-action-bar">
            {["❤️", "👍", "😂", "😮", "😢", "🔥"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="mb-action-btn mb-emoji-btn"
                onClick={() => handleReact(emoji)}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            {message.content && (
              <button
                type="button"
                className="mb-action-btn"
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy message"}
              >
                <Copy size={13} />
              </button>
            )}
            <button
              type="button"
              className={`mb-action-btn ${isStarred ? "mb-action-btn--starred" : ""}`}
              onClick={() => toggleStarMessage(message.id)}
              title={isStarred ? "Unstar message" : "Star message"}
            >
              <Star size={13} fill={isStarred ? "currentColor" : "none"} />
            </button>
            {onReply && (
              <button
                type="button"
                className="mb-action-btn"
                onClick={() => onReply(message)}
                title="Reply"
              >
                <Reply size={13} />
              </button>
            )}
            <button
              type="button"
              className={`mb-action-btn ${message.pinned ? "mb-action-btn--pinned" : ""}`}
              onClick={handleTogglePin}
              title={message.pinned ? "Unpin message" : "Pin message"}
            >
              <Pin size={13} />
            </button>
            {isMine && !isVoiceMessage && (
              <button
                type="button"
                className="mb-action-btn"
                onClick={() => {
                  setEditText(message.content);
                  setIsEditing(true);
                }}
                title="Edit message"
              >
                <Edit2 size={13} />
              </button>
            )}
            {canEditOrDelete && (
              <button
                type="button"
                className="mb-action-btn mb-action-btn--delete"
                onClick={handleDeleteMessage}
                title="Delete message"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}

        {/* Deleted Message Placeholder */}
        {isDeleted ? (
          <div className="mb-bubble mb-bubble--deleted">
            <p className="mb-text mb-text--deleted">🚫 This message was deleted</p>
          </div>
        ) : isEditing ? (
          /* Inline Edit Mode */
          <div className="mb-edit-box">
            <input
              type="text"
              className="mb-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
                if (e.key === "Escape") setIsEditing(false);
              }}
              autoFocus
            />
            <div className="mb-edit-actions">
              <button
                type="button"
                className="mb-edit-btn mb-edit-btn--save"
                onClick={handleSaveEdit}
                disabled={isSubmittingEdit}
                title="Save changes"
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                className="mb-edit-btn mb-edit-btn--cancel"
                onClick={() => setIsEditing(false)}
                title="Cancel"
              >
                <XIcon size={14} />
              </button>
            </div>
          </div>
        ) : isVoiceMessage && audioSrc ? (
          <AudioPlayer src={audioSrc} isMine={isMine} />
        ) : isTaggedAudioWithoutFile ? (
          <div className={`mb-bubble ${isMine ? "mb-bubble--mine" : "mb-bubble--theirs"}`}>
            <p className="mb-text" style={{ opacity: 0.7, fontStyle: "italic" }}>
              🎤 Voice message unavailable
            </p>
          </div>
        ) : message.type === "POLL" && message.poll ? (
          <PollCard poll={message.poll} isMine={isMine} />
        ) : (
          <>
            {message.content && message.content.trim().length > 0 && (() => {
              const parsed = parseReplyAndContent(message.content);
              return (
                <div className={`mb-bubble ${isMine ? "mb-bubble--mine" : "mb-bubble--theirs"}`}>
                  {parsed.reply && (
                    <div className={`mb-quote ${isMine ? "mb-quote--mine" : "mb-quote--theirs"}`}>
                      <span className="mb-quote-sender">{parsed.reply.sender}</span>
                      <span className="mb-quote-text">{parsed.reply.text}</span>
                    </div>
                  )}
                  <RichTextRenderer content={parsed.text} isMine={isMine} currentUserName={currentUserName} />
                </div>
              );
            })()}
          </>
        )}

        {/* Attachments */}
        {!isDeleted && !isVoiceMessage && message.attachments && message.attachments.length > 0 && (
          <div className="mb-attachments">
            {message.attachments.map((att: AttachmentResponse) => {
              const isImage = (att.contentType ?? att.mimeType ?? "").startsWith("image/");
              const isPdf = (att.filename ?? att.fileName ?? "").toLowerCase().endsWith(".pdf") || (att.contentType ?? "").includes("pdf");
              const downloadUrl = att.downloadUrl.startsWith("http")
                ? att.downloadUrl
                : `${API_BASE}${att.downloadUrl}`;
              const name = att.filename ?? att.fileName ?? att.originalName ?? "File";
              const bytes = att.size ?? att.fileSize ?? 0;

              return isImage ? (
                <div
                  key={att.id}
                  className="img-preview-box"
                  style={{ cursor: "pointer" }}
                  onClick={() => setPreviewDoc({ url: downloadUrl, name, isImage: true })}
                  title="Click to view full preview"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={downloadUrl} alt={name} className="img-preview" />
                </div>
              ) : (
                <div
                  key={att.id}
                  className={`file-card ${isMine ? "file-card--mine" : "file-card--theirs"}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setPreviewDoc({ url: downloadUrl, name, isPdf })}
                  title="Click to preview file"
                >
                  <div className="file-icon-box">
                    <FileText size={20} />
                  </div>
                  <div className="file-info">
                    <span className="file-name">{name}</span>
                    <span className="file-size">{formatFileSize(bytes)}</span>
                  </div>
                  <a
                    href={downloadUrl}
                    download={name}
                    className="file-dl-link"
                    onClick={(e) => e.stopPropagation()}
                    title="Download file directly"
                  >
                    <Download size={16} className="file-dl-icon" />
                  </a>
                </div>
              );
            })}
          </div>
        )}

        {/* Reaction Row */}
        {!isDeleted && Object.keys(reactionsMap).length > 0 && (
          <div className="mb-reaction-row">
            {Object.entries(reactionsMap).map(([emoji, count]) => {
              const hasMyReaction = reactionDetails.some(
                (r) => r.userId === currentUserId && r.emoji === emoji
              );

              return (
                <div key={emoji} className="mb-reaction-pill-group">
                  <button
                    type="button"
                    className={`mb-reaction-pill ${hasMyReaction ? "mb-reaction-pill--mine" : ""}`}
                    onClick={() => handleReact(emoji)}
                    title={`Toggle ${emoji} reaction`}
                  >
                    {emoji} {count > 1 ? count : ""}
                  </button>
                  <button
                    type="button"
                    className="mb-reaction-info-btn"
                    onClick={() => {
                      setActiveEmojiTab(emoji);
                      setShowReactionsModal(true);
                    }}
                    title="See who reacted"
                  >
                    🔍
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Reactions Modal */}
        {showReactionsModal && (
          <div className="mb-rm-overlay" onClick={() => setShowReactionsModal(false)}>
            <div className="mb-rm-card" onClick={(e) => e.stopPropagation()}>
              <div className="mb-rm-header">
                <h3>{totalReactionsCount} {totalReactionsCount === 1 ? "reaction" : "reactions"}</h3>
                <button
                  type="button"
                  className="mb-rm-close"
                  onClick={() => setShowReactionsModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Emoji Tabs */}
              <div className="mb-rm-tabs">
                <button
                  type="button"
                  className={`mb-rm-tab ${activeEmojiTab === "ALL" ? "mb-rm-tab--active" : ""}`}
                  onClick={() => setActiveEmojiTab("ALL")}
                >
                  All {totalReactionsCount}
                </button>
                {Object.entries(reactionsMap).map(([emoji, count]) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`mb-rm-tab ${activeEmojiTab === emoji ? "mb-rm-tab--active" : ""}`}
                    onClick={() => setActiveEmojiTab(emoji)}
                  >
                    {emoji} {count}
                  </button>
                ))}
              </div>

              {/* Reacted Users List */}
              <div className="mb-rm-list">
                {filteredReactionDetails.length === 0 ? (
                  <p className="mb-rm-empty">No reactions found</p>
                ) : (
                  filteredReactionDetails.map((r, idx) => (
                    <div key={`${r.userId}-${idx}`} className="mb-rm-item">
                      <Avatar name={r.userName} size={40} />
                      <div className="mb-rm-user-info">
                        <span className="mb-rm-user-name">
                          {r.userName} {r.userId === currentUserId ? "(You)" : ""}
                        </span>
                        <span className="mb-rm-user-sub">Reacted to message</span>
                      </div>
                      <span className="mb-rm-user-emoji">{r.emoji}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer info: time, edited tag, status ticks */}
        <div className={`mb-footer ${isMine ? "mb-footer--mine" : "mb-footer--theirs"}`}>
          {isEdited && !isDeleted && <span className="mb-edited-tag">(edited)</span>}
          {isStarred && (
            <span className="mb-starred-tag" title="Starred message">
              <Star size={10} fill="currentColor" />
            </span>
          )}
          <span className="mb-time">{timeStr}</span>
          {isMine && !isDeleted && (
            <span className={`mb-ticks ${isRead ? "mb-ticks--read" : isDelivered ? "mb-ticks--delivered" : ""}`}>
              {isRead || isDelivered ? <CheckCheck size={14} /> : <Check size={14} />}
            </span>
          )}
        </div>
      </div>

      {previewDoc && (
        <DocViewerModal
          url={previewDoc.url}
          name={previewDoc.name}
          isImage={previewDoc.isImage}
          isPdf={previewDoc.isPdf}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      <style>{`
        .mb-row {
          display: flex; width: 100%; margin-bottom: 0.75rem; position: relative;
        }
        .mb-row--mine { justify-content: flex-end; }
        .mb-row--theirs { justify-content: flex-start; }

        .mb-container {
          max-width: 70%; display: inline-flex; flex-direction: column; gap: 0.2rem;
          position: relative; width: auto; min-width: 0;
        }
        .mb-container--mine { align-self: flex-end; align-items: flex-end; }
        .mb-container--theirs { align-self: flex-start; align-items: flex-start; }

        .mb-avatar-wrapper { flex-shrink: 0; align-self: flex-end; }
        .mb-wrapper { display: inline-flex; flex-direction: column; max-width: 100%; }

        .mb-action-bar {
          position: absolute;
          top: -12px;
          display: none;
          gap: 0.25rem;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 2px 6px;
          box-shadow: var(--shadow-md);
          z-index: 5;
        }
        .mb-row--mine .mb-action-bar { right: 0; }
        .mb-row--theirs .mb-action-bar { left: 0; }
        .mb-container:hover .mb-action-bar { display: flex; }

        .mb-action-btn {
          background: none; border: none; color: var(--text-muted); padding: 0.25rem;
          border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: color 0.1s, background 0.1s, transform 0.1s;
        }
        .mb-action-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .mb-action-btn--pinned { color: var(--accent); background: var(--accent-soft); }
        .mb-action-btn--starred { color: #eab308; background: #fef9c3; }
        .mb-starred-tag { color: #eab308; display: inline-flex; align-items: center; }
        .mb-action-btn--delete:hover { background: var(--danger-soft); color: var(--danger); }
        .mb-pinned-badge {
          display: inline-flex; align-items: center; gap: 0.25rem;
          font-size: 0.6875rem; font-weight: 700; color: var(--accent);
          background: var(--accent-soft); padding: 0.15rem 0.5rem;
          border-radius: 999px; margin-bottom: 0.25rem; align-self: flex-start;
        }
        .mb-emoji-btn { font-size: 0.875rem; }

        .mb-edit-box {
          display: flex; align-items: center; gap: 0.35rem;
          background: var(--bg-secondary); border: 1px solid var(--accent);
          border-radius: 12px; padding: 0.35rem 0.5rem;
        }
        .mb-edit-input {
          flex: 1; border: none; background: none; font-size: 0.875rem; color: var(--text-primary); outline: none;
        }
        .mb-edit-actions { display: flex; gap: 0.25rem; }
        .mb-edit-btn {
          border: none; background: none; padding: 0.25rem; border-radius: 6px; cursor: pointer; display: flex;
        }
        .mb-edit-btn--save { color: var(--success-text); background: var(--success-soft); }
        .mb-edit-btn--cancel { color: var(--text-muted); background: var(--bg-tertiary); }

        .mb-reaction-row {
          display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.2rem;
        }
        .mb-row--mine .mb-reaction-row { justify-content: flex-end; }
        .mb-row--theirs .mb-reaction-row { justify-content: flex-start; }

        .mb-reaction-pill-group {
          display: inline-flex; align-items: center; background: var(--surface-card);
          border: 1px solid var(--border); border-radius: 999px; overflow: hidden;
          box-shadow: var(--shadow-sm); transition: transform 0.12s, border-color 0.12s;
        }
        .mb-reaction-pill-group:hover {
          transform: translateY(-1px); border-color: var(--accent);
        }
        .mb-reaction-pill {
          border: none; background: transparent; padding: 2px 7px; font-size: 0.78125rem;
          display: inline-flex; align-items: center; gap: 3px; font-weight: 600;
          color: var(--text-secondary); cursor: pointer;
        }
        .mb-reaction-pill--mine {
          background: var(--accent-soft); color: var(--accent);
        }
        .mb-reaction-info-btn {
          border: none; background: transparent; border-left: 1px solid var(--border);
          padding: 2px 6px; font-size: 0.65rem; color: var(--text-faint); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .mb-reaction-info-btn:hover {
          background: var(--bg-tertiary); color: var(--text-primary);
        }

        /* Quote Card */
        .mb-quote {
          display: flex; flex-direction: column; gap: 0.15rem;
          padding: 0.35rem 0.65rem; border-radius: 8px; margin-bottom: 0.4rem;
          font-size: 0.78125rem; line-height: 1.35;
        }
        .mb-quote--mine {
          background: rgba(255, 255, 255, 0.18);
          border-left: 3px solid rgba(255, 255, 255, 0.85);
          color: rgba(255, 255, 255, 0.95);
        }
        .mb-quote--theirs {
          background: var(--bg-tertiary, #f1f5f9);
          border-left: 3px solid var(--accent, #4f46e5);
          color: var(--text-secondary, #334155);
        }
        .mb-quote-sender {
          font-weight: 700;
          font-size: 0.75rem;
          color: inherit;
        }
        .mb-quote-text {
          opacity: 0.85;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Reactions Modal */
        .mb-rm-overlay {
          position: fixed; inset: 0; background: var(--bg-overlay);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; animation: fadeIn 0.15s ease;
        }
        .mb-rm-card {
          width: 90%; max-width: 380px; background: var(--surface-card);
          border-radius: 16px; border: 1px solid var(--border);
          box-shadow: var(--shadow-xl); display: flex; flex-direction: column;
          overflow: hidden; animation: scaleUp 0.15s ease;
        }
        .mb-rm-header {
          padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }
        .mb-rm-header h3 {
          font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0;
        }
        .mb-rm-close {
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          padding: 0.25rem; border-radius: 6px;
        }
        .mb-rm-close:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        .mb-rm-tabs {
          display: flex; gap: 0.35rem; padding: 0.5rem 1.25rem;
          border-bottom: 1px solid var(--border); overflow-x: auto;
          background: var(--bg-secondary);
        }
        .mb-rm-tab {
          border: none; background: transparent; font-size: 0.78125rem; font-weight: 600;
          color: var(--text-muted); padding: 0.35rem 0.75rem; border-radius: 999px;
          cursor: pointer; transition: all 0.12s; white-space: nowrap;
        }
        .mb-rm-tab--active {
          background: var(--surface-card); color: var(--accent); box-shadow: var(--shadow-sm);
        }

        .mb-rm-list {
          max-height: 280px; overflow-y: auto; padding: 0.75rem 1.25rem;
          display: flex; flex-direction: column; gap: 0.75rem;
        }
        .mb-rm-empty { font-size: 0.8125rem; color: var(--text-faint); margin: 1rem 0; text-align: center; }
        .mb-rm-item {
          display: flex; align-items: center; gap: 0.75rem;
        }
        .mb-rm-user-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .mb-rm-user-name { font-size: 0.84375rem; font-weight: 600; color: var(--text-primary); }
        .mb-rm-user-sub { font-size: 0.72rem; color: var(--text-muted); }
        .mb-rm-user-emoji { font-size: 1.2rem; }

        .mb-sender-name {
          font-size: 0.75rem; font-weight: 600; color: var(--text-tertiary); margin-left: 0.5rem;
        }
        .mb-bubble {
          display: inline-block; width: auto; max-width: 100%;
          padding: 0.5rem 0.7rem; border-radius: 12px;
          word-break: break-word; font-size: 0.9375rem; line-height: 1.45;
        }
        .mb-bubble--mine {
          background: var(--bubble-mine); color: var(--bubble-mine-text); border-bottom-right-radius: 4px;
        }
        .mb-bubble--theirs {
          background: var(--bubble-theirs); color: var(--bubble-theirs-text); border-bottom-left-radius: 4px;
          border: var(--bubble-theirs-border); box-shadow: var(--bubble-theirs-shadow);
        }
        .mb-bubble--deleted {
          background: var(--bg-tertiary); border: 1px dashed var(--border); border-radius: 12px; padding: 0.5rem 0.85rem;
        }
        .mb-text { margin: 0; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
        .mb-text--deleted { font-style: italic; color: var(--text-muted); font-size: 0.8125rem; }

        .mb-attachments { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.25rem; }
        .img-preview-box {
          max-width: 280px; border-radius: 12px; overflow: hidden;
          border: 1px solid var(--border); display: block;
        }
        .img-preview { width: 100%; height: auto; max-height: 240px; object-fit: cover; display: block; }

        .file-card {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.65rem 0.875rem; border-radius: 14px;
          transition: transform 0.15s, box-shadow 0.15s; text-decoration: none;
          min-width: 220px; max-width: 320px;
        }
        .file-card:hover { transform: translateY(-1px); }
        .file-card--mine {
          background: var(--accent); color: var(--text-on-accent);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
        }
        .file-card--mine .file-icon-box {
          background: rgba(255, 255, 255, 0.2); color: var(--text-on-accent);
          padding: 6px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
        }
        .file-card--mine .file-name { color: var(--text-on-accent); font-weight: 600; font-size: 0.84rem; }
        .file-card--mine .file-size { color: rgba(255, 255, 255, 0.8); font-size: 0.75rem; }
        .file-card--mine .file-dl-icon { color: var(--text-on-accent); opacity: 0.9; }

        .file-card--theirs {
          background: var(--surface-card); color: var(--text-primary);
          border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
        }
        .file-card--theirs .file-icon-box {
          background: var(--accent-muted); color: var(--accent);
          padding: 6px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
        }
        .file-card--theirs .file-name { color: var(--text-primary); font-weight: 600; font-size: 0.84rem; }
        .file-card--theirs .file-size { color: var(--text-muted); font-size: 0.75rem; }
        .file-card--theirs .file-dl-icon { color: var(--text-muted); opacity: 0.9; }

        .file-dl-link {
          display: flex; align-items: center; justify-content: center;
          padding: 4px; border-radius: 6px;
        }
        .file-dl-link:hover {
          background: rgba(0, 0, 0, 0.08);
        }

        .mb-footer {
          display: flex; align-items: center; gap: 0.35rem; font-size: 0.6875rem; color: var(--text-faint);
        }
        .mb-footer--mine { justify-content: flex-end; }
        .mb-footer--theirs { justify-content: flex-start; }
        .mb-edited-tag { font-style: italic; color: var(--text-muted); }
        .mb-time { color: var(--text-faint); }
        .mb-ticks { color: var(--text-faint); display: inline-flex; align-items: center; }
        .mb-ticks--delivered { color: var(--text-faint); }
        .mb-ticks--read { color: var(--info); }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
