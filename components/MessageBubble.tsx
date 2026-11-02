"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageResponse, AttachmentResponse } from "@/types";
import AudioPlayer from "./AudioPlayer";
import PollCard from "./PollCard";
import Avatar from "./Avatar";
import {
  FileText, Download, Check, CheckCheck, Copy, Reply, Edit2, Trash2,
  Check as CheckIcon, X as XIcon, X, Pin, Star, Forward, Info, Flag, AlarmClock, ListTodo, MessagesSquare, Languages, Loader2, ChevronDown, Plus
} from "lucide-react";
import { RemindMeModal, CreateTaskModal } from "./PlannerModals";
import ForwardModal from "./ForwardModal";
import MessageInfoModal from "./MessageInfoModal";
import ReportModal from "./ReportModal";
import ImageViewer, { ViewerImage } from "./ImageViewer";
import LinkPreviewCard, { firstUrl } from "./LinkPreviewCard";
import { apiUrl, downloadHref, isViewableImage, saveFile } from "@/lib/media";
import { apiPost, apiPut, apiDelete, apiErrorMessage } from "@/lib/api";
import { aiEnabled, preferredLanguage } from "@/lib/ai";
import { showToast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import RichTextRenderer from "./RichTextRenderer";
import DocViewerModal from "./DocViewerModal";
import { AckDetailsModal, EditHistoryModal } from "./MessageMetaModals";

interface MessageBubbleProps {
  message: MessageResponse;
  isMine: boolean;
  onReply?: (msg: MessageResponse) => void;
  /** Main timeline only: open this message's thread. */
  onOpenThread?: (msg: MessageResponse) => void;
  /** Announcement groups: acknowledgement state for this post. */
  ack?: { count: number; audience: number; mine: boolean; canViewList: boolean; onAck: () => void };
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

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const MORE_REACTIONS = ["🔥", "🎉", "👏", "✅", "👀", "💯"];

function MenuItem({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" className={`mb-menu-item ${danger ? "mb-menu-item--danger" : ""}`} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}

export default function MessageBubble({ message, isMine, onReply, onOpenThread, ack }: MessageBubbleProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ackListOpen, setAckListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuUp, setMenuUp] = useState(false);
  const [moreEmojis, setMoreEmojis] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = () => { setMenuOpen(false); setMoreEmojis(false); };
  const openMenu = (anchor: HTMLElement) => {
    // Open upward when there isn't room below (messages near the bottom of the chat).
    const r = anchor.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setMenuUp(below < 420 && r.top > below);
    setMenuOpen(true);
  };

  // Close on outside click, Escape, or scroll.
  useEffect(() => {
    if (!menuOpen && !moreEmojis) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) { setMenuOpen(false); setMoreEmojis(false); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); setMoreEmojis(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, moreEmojis]);

  // Move focus into the menu so it works from the keyboard.
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [menuOpen]);

  const [canTranslate, setCanTranslate] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  useEffect(() => {
    let alive = true;
    aiEnabled().then((on) => { if (alive) setCanTranslate(on); });
    return () => { alive = false; };
  }, []);

  const handleTranslate = async () => {
    if (translation) { setShowTranslation((v) => !v); return; }
    setTranslating(true);
    try {
      const res = await apiPost<{ translation: string }>(`/api/messages/${message.id}/translate`, { targetLanguage: preferredLanguage() });
      setTranslation(res.translation);
      setShowTranslation(true);
    } catch (err) {
      showToast(apiErrorMessage(err) ?? "Couldn't translate this message.");
    } finally {
      setTranslating(false);
    }
  };
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [activeEmojiTab, setActiveEmojiTab] = useState<string>("ALL");
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isRemindOpen, setIsRemindOpen] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [viewer, setViewer] = useState<{ images: ViewerImage[]; index: number } | null>(null);
  const linkUrl = !message.deleted && message.type === "TEXT" ? firstUrl(message.content) : null;

  // Open the lightbox with every image in this chat, starting at the clicked one.
  const openImageViewer = (attachmentId: number) => {
    const convMessages = useStore.getState().messagesByConv[message.conversationId] ?? [message];
    const images: ViewerImage[] = [];
    convMessages.forEach((m) => {
      if (m.deleted) return;
      m.attachments?.forEach((a) => {
        if (!isViewableImage(a)) return;
        images.push({
          id: a.id,
          url: apiUrl(a.downloadUrl),
          name: a.filename ?? a.fileName ?? a.originalName ?? "Image",
          sender: m.senderName,
          createdAt: m.createdAt,
        });
      });
    });
    const index = images.findIndex((img) => img.id === attachmentId);
    setViewer({ images, index: Math.max(index, 0) });
  };

  // Keyboard "↑ to edit": enter edit mode once per request aimed at this message.
  const editRequest = useStore((s) => s.editRequest);
  const [handledEditNonce, setHandledEditNonce] = useState<number | null>(null);
  if (editRequest && editRequest.id === message.id && editRequest.nonce !== handledEditNonce) {
    setHandledEditNonce(editRequest.nonce);
    setEditText(message.content);
    setIsEditing(true);
  }
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; isImage?: boolean; isPdf?: boolean } | null>(null);

  const userRole = useStore((s) => s.userRole);
  const currentUserId = useStore((s) => s.userId);
  const currentUserName = useStore((s) => s.userName);
  const starredMessageIds = useStore((s) => s.starredMessageIds);
  const toggleStarMessage = useStore((s) => s.toggleStarMessage);

  const isStarred = starredMessageIds.has(message.id);
  const timeStr = formatTime(message.createdAt);

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
      navigator.clipboard.writeText(message.content).then(() => showToast("Copied")).catch(() => {});
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
  const audioSrc = audioAttachment ? apiUrl(audioAttachment.downloadUrl) : undefined;

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

  // Call log entries: a small centred note, not a bubble (no reactions, edit or menu).
  if (message.type === "CALL") {
    const missed = /Missed|Declined/.test(message.content);
    return (
      <div className={`mb-call-event ${missed ? "mb-call-event--missed" : ""}`} role="note">
        <span>{message.content}</span>
        <time dateTime={message.createdAt}>{timeStr}</time>
        <style>{`
          .mb-call-event {
            align-self: center; display: inline-flex; align-items: center; gap: 0.5rem; margin: 0.35rem auto;
            padding: 0.35rem 0.85rem; border-radius: 999px; background: var(--bg-tertiary); color: var(--text-secondary);
            font-size: 0.8rem; font-weight: 600;
          }
          .mb-call-event--missed { color: var(--danger); background: var(--danger-soft); }
          .mb-call-event time { font-weight: 400; font-size: 0.7rem; opacity: 0.75; }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`mb-container ${isMine ? "mb-container--mine" : "mb-container--theirs"}`}>
      {/* Sender Avatar */}
      {!isMine && (
        <div className="mb-avatar-wrapper">
          <Avatar userId={message.senderId} name={message.senderName} size={30} />
        </div>
      )}

      {/* Bubble Wrapper */}
      <div
        className="mb-wrapper"
        ref={wrapperRef}
        onContextMenu={(e) => {
          if (isDeleted || (e.target as HTMLElement).closest("a, audio, video, input, textarea")) return;
          e.preventDefault();
          openMenu(e.currentTarget);
        }}
      >
        {/* Sender Name */}
        {!isMine && (
          <span className="mb-sender-name">{message.senderName}</span>
        )}

        {/* Forwarded label */}
        {message.forwarded && !isDeleted && (
          <span className="mb-forwarded">
            <Forward size={11} /> Forwarded
          </span>
        )}

        {/* Pinned Badge */}
        {message.pinned && (
          <div className="mb-pinned-badge">
            <Pin size={11} /> Pinned Message
          </div>
        )}

        {/* Hover: quick reactions + menu (WhatsApp-style) */}
        {!isDeleted && (
          <div className={`mb-react-pill ${menuOpen || moreEmojis ? "mb-react-pill--open" : ""}`}>
            {(moreEmojis ? [...QUICK_REACTIONS, ...MORE_REACTIONS] : QUICK_REACTIONS).map((emoji) => (
              <button key={emoji} type="button" className="mb-react-btn" onClick={() => { handleReact(emoji); setMoreEmojis(false); }}
                aria-label={`React with ${emoji}`}>
                {emoji}
              </button>
            ))}
            {!moreEmojis && (
              <button type="button" className="mb-react-btn mb-react-more" onClick={() => setMoreEmojis(true)} aria-label="More reactions">
                <Plus size={16} />
              </button>
            )}
            <span className="mb-react-sep" />
            <button type="button" className="mb-react-btn mb-react-more" onClick={(e) => openMenu(e.currentTarget)}
              aria-label="Message options" aria-haspopup="menu" aria-expanded={menuOpen}>
              <ChevronDown size={17} />
            </button>
          </div>
        )}

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Message options"
            className={`mb-menu ${menuUp ? "mb-menu--up" : ""}`}
            onClick={(e) => { if ((e.target as HTMLElement).closest("[role=menuitem]")) closeMenu(); }}
          >
            {onReply && <MenuItem icon={<Reply size={17} />} label="Reply" onClick={() => onReply(message)} />}
            {onOpenThread && <MenuItem icon={<MessagesSquare size={17} />} label="Reply in thread" onClick={() => onOpenThread(message)} />}
            {message.content && <MenuItem icon={<Copy size={17} />} label="Copy" onClick={handleCopy} />}
            {canTranslate && message.content && message.type !== "POLL" && (
              <MenuItem icon={<Languages size={17} />}
                label={translation ? (showTranslation ? "Show original" : "Show translation") : `Translate to ${preferredLanguage()}`}
                onClick={handleTranslate} />
            )}
            {message.type !== "POLL" && <MenuItem icon={<Forward size={17} />} label="Forward" onClick={() => setIsForwardOpen(true)} />}
            <MenuItem icon={<Pin size={17} />} label={message.pinned ? "Unpin" : "Pin"} onClick={handleTogglePin} />
            <MenuItem icon={<Star size={17} />} label={isStarred ? "Unstar" : "Star"} onClick={() => toggleStarMessage(message)} />
            {isMine && !isVoiceMessage && (
              <MenuItem icon={<Edit2 size={17} />} label="Edit" onClick={() => { setEditText(message.content); setIsEditing(true); }} />
            )}
            {isMine && <MenuItem icon={<Info size={17} />} label="Message info" onClick={() => setIsInfoOpen(true)} />}
            <MenuItem icon={<AlarmClock size={17} />} label="Remind me" onClick={() => setIsRemindOpen(true)} />
            <MenuItem icon={<ListTodo size={17} />} label="Create task" onClick={() => setIsTaskOpen(true)} />
            {!isMine && <MenuItem icon={<Flag size={17} />} label="Report" onClick={() => setIsReportOpen(true)} />}
            {canEditOrDelete && (
              <>
                <div className="mb-menu-sep" role="separator" />
                <MenuItem icon={<Trash2 size={17} />} label="Delete" danger onClick={handleDeleteMessage} />
              </>
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
                  {translating && (
                    <span className="mb-translation-label mb-translating"><Loader2 size={11} className="spin" /> Translating…</span>
                  )}
                  {showTranslation && translation && (
                    <div className="mb-translation">
                      <span className="mb-translation-label"><Languages size={11} /> Translated · <button type="button" onClick={() => setShowTranslation(false)}>Show original only</button></span>
                      <p>{translation}</p>
                    </div>
                  )}
                </div>
              );
            })()}
            {linkUrl && <LinkPreviewCard url={linkUrl} isMine={isMine} />}
          </>
        )}

        {/* Attachments */}
        {!isDeleted && !isVoiceMessage && message.attachments && message.attachments.length > 0 && (
          <div className="mb-attachments">
            {message.attachments.map((att: AttachmentResponse) => {
              const isImage = isViewableImage(att);
              const isPdf = (att.filename ?? att.fileName ?? "").toLowerCase().endsWith(".pdf") || (att.contentType ?? "").includes("pdf");
              const downloadUrl = apiUrl(att.downloadUrl);
              const name = att.filename ?? att.fileName ?? att.originalName ?? "File";
              const bytes = att.size ?? att.fileSize ?? 0;

              return isImage ? (
                <div
                  key={att.id}
                  className="img-preview-box"
                  style={{ cursor: "pointer" }}
                  onClick={() => openImageViewer(att.id)}
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
                    href={downloadHref(downloadUrl)}
                    download={name}
                    className="file-dl-link"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void saveFile(downloadUrl, name); }}
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
            <div className="mb-rm-card" role="dialog" aria-modal="true" aria-label="Reactions" onClick={(e) => e.stopPropagation()}>
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
                      <Avatar userId={r.userId} name={r.userName} size={40} />
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

        {/* Thread summary */}
        {onOpenThread && (message.threadReplyCount ?? 0) > 0 && (
          <button
            type="button"
            className={`mb-thread-link ${isMine ? "mb-thread-link--mine" : ""}`}
            onClick={() => onOpenThread(message)}
          >
            <MessagesSquare size={13} />
            {message.threadReplyCount} repl{message.threadReplyCount === 1 ? "y" : "ies"}
            {message.threadLastReplyAt && <span className="mb-thread-when">· last {formatTime(message.threadLastReplyAt)}</span>}
          </button>
        )}

        {ack && !isDeleted && (
          <div className={`mb-ack ${isMine ? "mb-ack--mine" : ""}`}>
            {!isMine && (ack.mine
              ? <span className="mb-ack-done"><CheckCheck size={13} /> Acknowledged</span>
              : <button type="button" className="mb-ack-btn" onClick={ack.onAck}><CheckIcon size={13} /> Acknowledge</button>)}
            {ack.canViewList
              ? <button type="button" className="mb-ack-count" onClick={() => setAckListOpen(true)}>{ack.count} of {ack.audience} acknowledged</button>
              : <span className="mb-ack-count">{ack.count} of {ack.audience} acknowledged</span>}
          </div>
        )}

        {/* Footer info: time, edited tag, status ticks */}
        <div className={`mb-footer ${isMine ? "mb-footer--mine" : "mb-footer--theirs"}`}>
          {isEdited && !isDeleted && (
            <button type="button" className="mb-edited-tag" onClick={() => setHistoryOpen(true)} title="See edit history">(edited)</button>
          )}
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

      {isForwardOpen && <ForwardModal message={message} onClose={() => setIsForwardOpen(false)} />}
      {isInfoOpen && <MessageInfoModal message={message} onClose={() => setIsInfoOpen(false)} />}
      {historyOpen && <EditHistoryModal messageId={message.id} onClose={() => setHistoryOpen(false)} />}
      {ackListOpen && <AckDetailsModal messageId={message.id} onClose={() => setAckListOpen(false)} />}
      {isReportOpen && (
        <ReportModal
          messageId={message.id}
          messagePreview={message.content || "Attachment"}
          targetName={message.senderName}
          onClose={() => setIsReportOpen(false)}
        />
      )}
      {viewer && <ImageViewer images={viewer.images} startIndex={viewer.index} onClose={() => setViewer(null)} />}
      {isRemindOpen && <RemindMeModal message={message} onClose={() => setIsRemindOpen(false)} />}
      {isTaskOpen && <CreateTaskModal message={message} onClose={() => setIsTaskOpen(false)} />}

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
        .mb-wrapper { display: inline-flex; flex-direction: column; max-width: 100%; position: relative; }

        /* Reaction pill: floats above the bubble, aligned to the bubble side so it never leaves the chat */
        .mb-react-pill {
          position: absolute; top: -40px; z-index: 6;
          display: none; align-items: center; gap: 2px;
          background: var(--surface-card); border: 1px solid var(--border);
          border-radius: 999px; padding: 4px 6px; box-shadow: var(--shadow-md);
          /* Size to its own content, not the (possibly tiny) bubble; wrap only if wider than the screen */
          width: max-content; max-width: calc(100vw - 32px); flex-wrap: wrap;
        }
        .mb-container--mine .mb-react-pill { right: 0; }
        .mb-container--theirs .mb-react-pill { left: 0; }
        .mb-container:hover .mb-react-pill, .mb-react-pill--open { display: flex; }
        .mb-react-btn {
          width: 34px; height: 34px; border: none; background: none; border-radius: 50%;
          font-size: 1.3rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: transform 0.12s, background 0.12s;
        }
        .mb-react-btn:hover { transform: scale(1.18); background: var(--bg-tertiary); }
        .mb-react-more { color: var(--text-muted); background: var(--bg-tertiary); }
        .mb-react-more:hover { transform: none; color: var(--text-primary); }
        .mb-react-sep { width: 1px; height: 22px; background: var(--border); margin: 0 2px; }

        /* Options menu */
        .mb-menu {
          position: absolute; top: 2px; z-index: 30; min-width: 210px;
          background: var(--surface-card); border: 1px solid var(--border); border-radius: 14px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18); padding: 6px 0;
          display: flex; flex-direction: column; animation: mb-menu-in 0.12s ease-out;
        }
        .mb-menu--up { top: auto; bottom: calc(100% + 44px); }
        .mb-container--mine .mb-menu { right: 0; }
        .mb-container--theirs .mb-menu { left: 0; }
        @keyframes mb-menu-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .mb-menu-item {
          display: flex; align-items: center; gap: 0.85rem; width: 100%; padding: 0.6rem 1.1rem;
          background: none; border: none; text-align: left; cursor: pointer;
          font-size: 0.9rem; color: var(--text-primary);
        }
        .mb-menu-item svg { color: var(--text-secondary); flex-shrink: 0; }
        .mb-menu-item:hover, .mb-menu-item:focus-visible { background: var(--bg-tertiary); outline: none; }
        .mb-menu-item--danger, .mb-menu-item--danger svg { color: var(--danger); }
        .mb-menu-sep { height: 1px; background: var(--border); margin: 6px 0; }

        .mb-translation { margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dashed var(--border); }
        .mb-translation p { margin: 0.15rem 0 0; white-space: pre-wrap; word-break: break-word; }
        .mb-translation-label { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.68rem; opacity: 0.75; }
        .mb-translation-label button { background: none; border: none; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font-size: inherit; }
        .mb-starred-tag { color: #eab308; display: inline-flex; align-items: center; }
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
        .mb-thread-link {
          display: inline-flex; align-items: center; gap: 0.3rem; margin: 0.2rem 0.4rem 0; padding: 0.15rem 0.45rem;
          border: none; background: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 700;
          color: var(--accent); align-self: flex-start;
        }
        .mb-thread-link:hover { background: var(--accent-soft); }
        .mb-thread-link--mine { align-self: flex-end; }
        .mb-thread-when { font-weight: 500; color: var(--text-muted); }
        .mb-forwarded {
          display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem; font-style: italic;
          color: var(--text-muted); margin: 0 0.5rem 0.15rem;
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
        .mb-edited-tag { font-style: italic; color: var(--text-muted); background: none; border: none; padding: 0; font-size: inherit; cursor: pointer; text-decoration: underline dotted; }
        .mb-ack { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; flex-wrap: wrap; }
        .mb-ack--mine { justify-content: flex-end; }
        .mb-ack-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid var(--accent); background: var(--accent); color: #fff; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
        .mb-ack-done { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; font-weight: 600; color: var(--success-text, #15803d); }
        .mb-ack-count { background: none; border: none; padding: 0; font-size: 0.72rem; color: var(--text-muted); }
        button.mb-ack-count { cursor: pointer; text-decoration: underline; }
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
