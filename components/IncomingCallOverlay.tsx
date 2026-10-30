"use client";

import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { CallSignal, CallType } from "@/types/call";
import Avatar from "./Avatar";

interface IncomingCallOverlayProps {
  signal: CallSignal;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallOverlay({
  signal,
  callType,
  onAccept,
  onReject,
}: IncomingCallOverlayProps) {
  const isVideo = (signal.callType ?? callType) === "VIDEO";

  // Trigger mobile vibration pattern
  useEffect(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([300, 200, 300, 200, 500]);
      } catch {}
    }
  }, []);

  return (
    <div className="ico-backdrop">
      <div className="ico-card">
        <div className="ico-pulse-ring">
          <Avatar name={signal.fromUserName} size={72} />
        </div>

        <h3 className="ico-caller">{signal.fromUserName}</h3>
        <p className="ico-sub">
          {signal.isGroup
            ? `Group ${isVideo ? "video" : "voice"} call · ${signal.groupName ?? "Group"}`
            : `Incoming ${isVideo ? "Video" : "Voice"} Call...`}
        </p>

        <div className="ico-actions">
          <button
            type="button"
            className="ico-btn ico-btn--reject"
            onClick={onReject}
            title="Decline"
            aria-label="Decline call"
          >
            <PhoneOff size={24} />
          </button>

          <button
            type="button"
            className="ico-btn ico-btn--accept"
            onClick={onAccept}
            title="Answer"
            aria-label="Answer call"
          >
            {isVideo ? <Video size={24} /> : <Phone size={24} />}
          </button>
        </div>
      </div>

      <style>{`
        .ico-backdrop {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
        }
        .ico-card {
          width: 100%; max-width: 340px;
          background: #1e293b; border: 1px solid #334155;
          border-radius: 24px; padding: 2.5rem 1.5rem;
          display: flex; flex-direction: column; align-items: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          text-align: center;
        }
        .ico-pulse-ring {
          position: relative; margin-bottom: 1.25rem;
          border-radius: 50%; padding: 6px; background: rgba(59, 130, 246, 0.2);
          animation: ringPulse 1.5s ease-out infinite;
        }
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          70% { box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .ico-caller { font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem; }
        .ico-sub { font-size: 0.875rem; color: #94a3b8; margin-bottom: 2rem; }
        .ico-actions { display: flex; align-items: center; gap: 2rem; }
        .ico-btn {
          width: 56px; height: 56px; border-radius: 50%; border: none;
          display: flex; align-items: center; justify-content: center;
          color: white; cursor: pointer; transition: transform 0.15s, background 0.15s;
        }
        .ico-btn:hover { transform: scale(1.1); }
        .ico-btn--reject { background: #ef4444; }
        .ico-btn--reject:hover { background: #dc2626; }
        .ico-btn--accept { background: #22c55e; }
        .ico-btn--accept:hover { background: #16a34a; }
      `}</style>
    </div>
  );
}
