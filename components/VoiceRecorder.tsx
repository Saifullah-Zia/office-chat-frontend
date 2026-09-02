"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Send, Loader2 } from "lucide-react";
import { apiPostForm } from "@/lib/api";
import { AttachmentResponse, MessageRequest } from "@/types";

interface VoiceRecorderProps {
  conversationId: number;
  onSendVoiceMessage: (req: MessageRequest) => Promise<void>;
  onCancel: () => void;
}

export default function VoiceRecorder({
  conversationId,
  onSendVoiceMessage,
  onCancel,
}: VoiceRecorderProps) {
  const [seconds, setSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start(100);

        timerRef.current = setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      } catch (err) {
        console.error("Microphone access failed:", err);
        alert("Microphone access denied or unavailable.");
        onCancel();
      }
    })();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStopAndSend = async () => {
    if (!mediaRecorderRef.current) return;
    setIsUploading(true);

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([audioBlob], `voice_note_${Date.now()}.webm`, {
          type: "audio/webm",
        });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("conversationId", conversationId.toString());

        const att = await apiPostForm<AttachmentResponse>("/api/files/upload", formData);

        await onSendVoiceMessage({
          conversationId,
          content: "",
          type: "VOICE",
          attachmentId: att.id,
        });

        onCancel();
      } catch (err) {
        console.error("Failed to send voice message:", err);
        alert("Failed to send voice message.");
      } finally {
        setIsUploading(false);
      }
    };

    mediaRecorderRef.current.stop();
  };

  return (
    <div className="vr-shell">
      <div className="vr-indicator">
        <span className="vr-dot" />
        <span className="vr-timer">{formatTimer(seconds)}</span>
      </div>

      <div className="vr-bars">
        {[40, 70, 30, 90, 50, 80, 60, 100, 45, 75, 35, 85].map((h, i) => (
          <span
            key={i}
            className="vr-bar"
            style={{
              height: `${h}%`,
              animationDelay: `${(i % 4) * 0.15}s`,
            }}
          />
        ))}
      </div>

      <div className="vr-actions">
        <button
          type="button"
          className="vr-btn vr-btn--trash"
          onClick={onCancel}
          disabled={isUploading}
          title="Cancel recording"
          aria-label="Cancel recording"
        >
          <Trash2 size={18} />
        </button>

        <button
          type="button"
          className="vr-btn vr-btn--send"
          onClick={handleStopAndSend}
          disabled={isUploading}
          title="Send voice note"
          aria-label="Send voice note"
          id="vr-send-btn"
        >
          {isUploading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </div>

      <style>{`
        .vr-shell {
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 999px;
          padding: 0.4rem 0.6rem 0.4rem 1.25rem;
          box-sizing: border-box;
        }
        .vr-indicator { display: flex; align-items: center; gap: 0.5rem; }
        .vr-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: #ef4444;
          animation: vr-pulse 1.2s ease-in-out infinite;
        }
        @keyframes vr-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.5; }
        }
        .vr-timer { font-size: 0.875rem; font-weight: 700; color: #1e1b4b; min-width: 36px; }

        .vr-bars {
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          gap: 3px; height: 22px;
        }
        .vr-bar {
          width: 3px; background: #4f46e5; border-radius: 2px;
          animation: vr-wave 1s ease-in-out infinite alternate;
        }
        @keyframes vr-wave {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1.1); }
        }

        .vr-actions { display: flex; align-items: center; gap: 0.5rem; }
        .vr-btn {
          width: 36px; height: 36px; border-radius: 50%;
          border: none; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.15s;
        }
        .vr-btn--trash { background: #fee2e2; color: #ef4444; }
        .vr-btn--send { background: #4f46e5; color: #ffffff; }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
