"use client";

import { useState } from "react";
import { MessageResponse, AttachmentResponse } from "@/types";
import AudioPlayer from "./AudioPlayer";
import { FileText, Download, Check, CheckCheck, Copy, Reply } from "lucide-react";

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

export default function MessageBubble({ message, isMine, onReply }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const timeStr = formatTime(message.createdAt);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  const handleReact = (emoji: string) => {
    setReactions((prev) => ({
      ...prev,
      [emoji]: (prev[emoji] ?? 0) + 1,
    }));
  };

  const audioAttachment = message.attachments?.find(
    (a) =>
      (a.contentType ?? a.mimeType ?? "").startsWith("audio/") ||
      (a.filename ?? a.fileName ?? "").endsWith(".webm") ||
      (a.filename ?? a.fileName ?? "").endsWith(".mp3"),
  );
  const isVoiceMessage =
    message.type === "VOICE" || message.type === "AUDIO" || !!audioAttachment;
  const audioSrc = audioAttachment
    ? audioAttachment.downloadUrl.startsWith("http")
      ? audioAttachment.downloadUrl
      : `${API_BASE}${audioAttachment.downloadUrl}`
    : message.content;

  const isRead = message.read ?? false;
  const isDelivered = message.delivered ?? false;

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`mb-row ${isMine ? "mb-row--mine" : "mb-row--theirs"}`}>
      <div className="mb-container">
        {!isMine && (
          <span className="mb-sender-name">{message.senderName}</span>
        )}

        {/* Hover Action Bar */}
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
        </div>

        {isVoiceMessage && audioSrc ? (
          <AudioPlayer src={audioSrc} isMine={isMine} />
        ) : (
          <>
            {message.content && message.content.trim().length > 0 && (
              <div className={`mb-bubble ${isMine ? "mb-bubble--mine" : "mb-bubble--theirs"}`}>
                <p className="mb-text">{message.content}</p>
              </div>
            )}
          </>
        )}

        {!isVoiceMessage && message.attachments && message.attachments.length > 0 && (
          <div className="mb-attachments">
            {message.attachments.map((att: AttachmentResponse) => {
              const isImage = (att.contentType ?? att.mimeType ?? "").startsWith("image/");
              const downloadUrl = att.downloadUrl.startsWith("http")
                ? att.downloadUrl
                : `${API_BASE}${att.downloadUrl}`;
              const name = att.filename ?? att.fileName ?? att.originalName ?? "File";
              const bytes = att.size ?? att.fileSize ?? 0;

              return isImage ? (
                <a
                  key={att.id}
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="img-preview-box"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={downloadUrl} alt={name} className="img-preview" />
                </a>
              ) : (
                <a
                  key={att.id}
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`file-card ${isMine ? "file-card--mine" : "file-card--theirs"}`}
                >
                  <div className="file-icon-box">
                    <FileText size={20} />
                  </div>
                  <div className="file-info">
                    <span className="file-name">{name}</span>
                    <span className="file-size">{formatFileSize(bytes)}</span>
                  </div>
                  <Download size={16} className="file-dl-icon" />
                </a>
              );
            })}
          </div>
        )}

        {Object.keys(reactions).length > 0 && (
          <div className="mb-reaction-row">
            {Object.entries(reactions).map(([emoji, count]) => (
              <span key={emoji} className="mb-reaction-pill">
                {emoji} {count > 1 ? count : ""}
              </span>
            ))}
          </div>
        )}

        <div className={`mb-footer ${isMine ? "mb-footer--mine" : "mb-footer--theirs"}`}>
          <span className="mb-time">{timeStr}</span>
          {isMine && (
            <span className={`mb-ticks ${isRead ? "mb-ticks--read" : isDelivered ? "mb-ticks--delivered" : ""}`}>
              {isRead || isDelivered ? <CheckCheck size={14} /> : <Check size={14} />}
            </span>
          )}
        </div>
      </div>

      <style>{`
        .mb-row {
          display: flex; width: 100%; margin-bottom: 0.75rem; position: relative;
        }
        .mb-row--mine { justify-content: flex-end; }
        .mb-row--theirs { justify-content: flex-start; }

        .mb-container {
          max-width: 70%; display: flex; flex-direction: column; gap: 0.2rem;
          position: relative;
        }

        .mb-action-bar {
          position: absolute;
          top: -12px;
          display: none;
          gap: 0.25rem;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 2px 6px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          z-index: 5;
        }
        .mb-row--mine .mb-action-bar { right: 0; }
        .mb-row--theirs .mb-action-bar { left: 0; }
        .mb-container:hover .mb-action-bar { display: flex; }

        .mb-action-btn {
          background: none; border: none; color: #64748b; padding: 0.25rem;
          border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: color 0.1s, background 0.1s, transform 0.1s;
        }
        .mb-action-btn:hover { color: #4f46e5; background: #e0e7ff; transform: scale(1.15); }
        .mb-emoji-btn { font-size: 0.875rem; }

        .mb-reaction-row {
          display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.15rem;
        }
        .mb-row--mine .mb-reaction-row { justify-content: flex-end; }
        .mb-row--theirs .mb-reaction-row { justify-content: flex-start; }

        .mb-reaction-pill {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 999px;
          padding: 1px 6px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 2px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-weight: 600; color: #334155;
        }

        .mb-sender-name {
          font-size: 0.75rem; font-weight: 600; color: #475569; margin-left: 0.5rem;
        }
        .mb-bubble {
          padding: 0.65rem 1rem; border-radius: 16px;
          word-break: break-word; font-size: 0.9375rem; line-height: 1.45;
        }
        .mb-bubble--mine {
          background: #4f46e5; color: #ffffff; border-bottom-right-radius: 4px;
        }
        .mb-bubble--theirs {
          background: #ffffff; color: #0f172a; border-bottom-left-radius: 4px;
          border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        }
        .mb-text { margin: 0; white-space: pre-wrap; }

        .mb-attachments { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.25rem; }
        .img-preview-box {
          max-width: 280px; border-radius: 12px; overflow: hidden;
          border: 1px solid #e2e8f0; display: block;
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
          background: #4f46e5; color: #ffffff;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
        }
        .file-card--mine .file-icon-box {
          background: rgba(255, 255, 255, 0.2); color: #ffffff;
          padding: 6px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
        }
        .file-card--mine .file-name { color: #ffffff; font-weight: 600; font-size: 0.84rem; }
        .file-card--mine .file-size { color: rgba(255, 255, 255, 0.8); font-size: 0.75rem; }
        .file-card--mine .file-dl-icon { color: #ffffff; opacity: 0.9; }

        .file-card--theirs {
          background: #ffffff; color: #0f172a;
          border: 1px solid #e2e8f0;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
        }
        .file-card--theirs .file-icon-box {
          background: #e0e7ff; color: #4f46e5;
          padding: 6px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
        }
        .file-card--theirs .file-name { color: #0f172a; font-weight: 600; font-size: 0.84rem; }
        .file-card--theirs .file-size { color: #64748b; font-size: 0.75rem; }
        .file-card--theirs .file-dl-icon { color: #64748b; opacity: 0.9; }

        .mb-footer {
          display: flex; align-items: center; gap: 0.35rem; font-size: 0.6875rem; color: #94a3b8;
        }
        .mb-footer--mine { justify-content: flex-end; }
        .mb-footer--theirs { justify-content: flex-start; }
        .mb-ticks { color: #94a3b8; display: inline-flex; align-items: center; }
        .mb-ticks--delivered { color: #94a3b8; }
        .mb-ticks--read { color: #3b82f6; }
      `}</style>
    </div>
  );
}
