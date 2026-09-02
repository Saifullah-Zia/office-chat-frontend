"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { ActiveCall } from "@/types/call";
import Avatar from "./Avatar";

interface CallWindowProps {
  activeCall: ActiveCall;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCamOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
}

export default function CallWindow({
  activeCall,
  localStream,
  remoteStream,
  isMuted,
  isCamOff,
  onToggleMute,
  onToggleCamera,
  onHangup,
}: CallWindowProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const isVideo = activeCall.callType === "VIDEO";

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="cw-overlay">
      <div className="cw-card">
        {/* Remote View / Avatar */}
        <div className="cw-remote-container">
          {isVideo && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="cw-remote-video"
            />
          ) : (
            <div className="cw-avatar-placeholder">
              <Avatar name={activeCall.remoteUserName} size={96} />
              <h3>{activeCall.remoteUserName}</h3>
              <p>In Call...</p>
            </div>
          )}

          {/* Local PIP Video */}
          {isVideo && localStream && (
            <div className="cw-pip">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`cw-pip-video ${isCamOff ? "hidden" : ""}`}
              />
              {isCamOff && (
                <div className="cw-pip-off">Camera Off</div>
              )}
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="cw-controls">
          <button
            type="button"
            className={`cw-ctl-btn ${isMuted ? "cw-ctl-btn--off" : ""}`}
            onClick={onToggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {isVideo && (
            <button
              type="button"
              className={`cw-ctl-btn ${isCamOff ? "cw-ctl-btn--off" : ""}`}
              onClick={onToggleCamera}
              title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isCamOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          )}

          <button
            type="button"
            className="cw-ctl-btn cw-ctl-btn--hangup"
            onClick={onHangup}
            title="End Call"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>

      <style>{`
        .cw-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
        }
        .cw-card {
          width: 100%; max-width: 720px; height: 480px;
          background: #0f172a; border-radius: 24px;
          overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
          position: relative; border: 1px solid #334155;
        }
        .cw-remote-container {
          flex: 1; position: relative; background: #020617;
          display: flex; align-items: center; justify-content: center;
        }
        .cw-remote-video {
          width: 100%; height: 100%; object-fit: cover;
        }
        .cw-avatar-placeholder {
          display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
          color: #f8fafc;
        }
        .cw-avatar-placeholder h3 { font-size: 1.25rem; font-weight: 700; margin: 0; }
        .cw-avatar-placeholder p { font-size: 0.875rem; color: #94a3b8; margin: 0; }
        .cw-pip {
          position: absolute; bottom: 1rem; right: 1rem;
          width: 140px; height: 95px; border-radius: 12px;
          overflow: hidden; border: 2px solid #3b82f6; background: #1e293b;
        }
        .cw-pip-video { width: 100%; height: 100%; object-fit: cover; }
        .cw-pip-video.hidden { display: none; }
        .cw-pip-off {
          width: 100%; height: 100%; display: flex; align-items: center;
          justify-content: center; font-size: 0.75rem; color: #94a3b8;
        }
        .cw-controls {
          height: 72px; background: #1e293b; display: flex;
          align-items: center; justify-content: center; gap: 1.5rem;
          border-top: 1px solid #334155;
        }
        .cw-ctl-btn {
          width: 44px; height: 44px; border-radius: 50%; border: none;
          background: #334155; color: #f8fafc; display: flex;
          align-items: center; justify-content: center; cursor: pointer;
          transition: background 0.15s, transform 0.15s;
        }
        .cw-ctl-btn:hover { transform: scale(1.05); }
        .cw-ctl-btn--off { background: #dc2626; color: #fff; }
        .cw-ctl-btn--hangup { background: #ef4444; color: #fff; }
        .cw-ctl-btn--hangup:hover { background: #dc2626; }
      `}</style>
    </div>
  );
}
