"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor } from "lucide-react";
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

function formatDuration(secs: number = 0): string {
  const mins = Math.floor(secs / 60);
  const remainder = secs % 60;
  return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function getStatusLabel(call: ActiveCall): string {
  if (call.connectionState === "connected") {
    return formatDuration(call.durationSecs);
  }
  if (call.connectionState === "ringing") return "Ringing...";
  if (call.connectionState === "reconnecting") return "Reconnecting...";
  if (call.connectionState === "failed") return "Connection failed";
  return "Connecting...";
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
  const [isSharing, setIsSharing] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState<number[]>(() => [0.2, 0.4, 0.6, 0.3, 0.5]);
  const isVideo = activeCall.callType === "VIDEO";
  const statusLabel = getStatusLabel(activeCall);

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

  // Monitor remote caller audio level for live visualizer
  useEffect(() => {
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;
    let audioCtx: AudioContext | null = null;
    let animId = 0;

    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(remoteStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const updateVolume = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const bars = [data[2] / 255, data[5] / 255, data[8] / 255, data[12] / 255, data[15] / 255].map(
          (v) => Math.max(0.15, v)
        );
        setRemoteVolume(bars);
        animId = requestAnimationFrame(updateVolume);
      };
      animId = requestAnimationFrame(updateVolume);
    } catch (e) {
      console.warn("Audio level analyser error:", e);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      audioCtx?.close().catch(() => {});
    };
  }, [remoteStream]);

  const handleShareScreen = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setIsSharing(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = displayStream;
      }
      displayStream.getVideoTracks()[0].onended = () => {
        setIsSharing(false);
        if (localVideoRef.current && localStream) {
          localVideoRef.current.srcObject = localStream;
        }
      };
    } catch (err) {
      console.warn("Screen share cancelled or failed:", err);
      setIsSharing(false);
    }
  };

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
              <div className="cw-avatar-ring">
                <Avatar name={activeCall.remoteUserName} size={104} />
              </div>
              <h3>{activeCall.remoteUserName}</h3>
              <p className="cw-status-text">{statusLabel}</p>

              {/* In-Call Remote Audio Level Bars */}
              <div className="cw-audio-level-bars">
                {remoteVolume.map((vol, i) => (
                  <span key={i} className="cw-audio-bar" style={{ height: `${vol * 22}px` }} />
                ))}
              </div>
            </div>
          )}

          {/* Video Status Header Overlay */}
          {isVideo && (
            <div className="cw-header-badge">
              <span>{activeCall.remoteUserName}</span>
              <span className="cw-badge-dot">•</span>
              <span>{statusLabel}</span>
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
            <>
              <button
                type="button"
                className={`cw-ctl-btn ${isCamOff ? "cw-ctl-btn--off" : ""}`}
                onClick={onToggleCamera}
                title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
              >
                {isCamOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>

              <button
                type="button"
                className={`cw-ctl-btn ${isSharing ? "cw-ctl-btn--active" : ""}`}
                onClick={handleShareScreen}
                title={isSharing ? "Stop Sharing" : "Share Screen"}
              >
                <Monitor size={20} />
              </button>
            </>
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
        .cw-avatar-ring {
          padding: 8px; border-radius: 50%;
          background: rgba(59, 130, 246, 0.15);
          box-shadow: 0 0 30px rgba(59, 130, 246, 0.2);
        }
        .cw-avatar-placeholder h3 { font-size: 1.35rem; font-weight: 700; margin: 0; }
        .cw-status-text {
          font-size: 0.9375rem; color: #60a5fa; margin: 0;
          font-weight: 600; font-variant-numeric: tabular-nums;
        }
        .cw-audio-level-bars {
          display: flex; align-items: center; justify-content: center;
          gap: 3px; height: 24px; margin-top: 0.5rem;
        }
        .cw-audio-bar {
          width: 3px; background: #60a5fa; border-radius: 2px;
          transition: height 0.08s ease-out;
        }
        .cw-header-badge {
          position: absolute; top: 1rem; left: 1rem;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          padding: 0.4rem 0.85rem; border-radius: 999px;
          color: #f8fafc; font-size: 0.8125rem; font-weight: 600;
          display: flex; align-items: center; gap: 0.5rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .cw-badge-dot { color: #60a5fa; }

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
