"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorOff, Users } from "lucide-react";
import { ActiveCall, CallParticipant } from "@/types/call";
import Avatar from "./Avatar";

interface CallWindowProps {
  activeCall: ActiveCall;
  localStream: MediaStream | null;
  participants: CallParticipant[];
  isMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  myName: string;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onHangup: () => void;
}

function formatDuration(secs: number = 0): string {
  const mins = Math.floor(secs / 60);
  const remainder = secs % 60;
  return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function getStatusLabel(call: ActiveCall, count: number): string {
  if (call.connectionState === "connected") {
    return call.isGroup ? `${formatDuration(call.durationSecs)} · ${count + 1} in call` : formatDuration(call.durationSecs);
  }
  if (call.connectionState === "ringing") return call.isGroup ? "Ringing everyone…" : "Ringing...";
  if (call.connectionState === "reconnecting") return "Reconnecting...";
  if (call.connectionState === "failed") return "Connection failed";
  return "Connecting...";
}

/** Is this audio stream currently audible? Polls an analyser a few times a second. */
function useSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      timer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeaking(avg > 12);
      }, 250);
    } catch {}
    return () => {
      if (timer) clearInterval(timer);
      ctx?.close().catch(() => {});
    };
  }, [stream]);
  return speaking;
}

function VideoEl({ stream, mirrored, contain }: { stream: MediaStream; mirrored?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  // Always muted: remote audio plays through Agora, local audio must never echo.
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className="clw-video"
      style={{ transform: mirrored ? "scaleX(-1)" : undefined, objectFit: contain ? "contain" : "cover" }}
    />
  );
}

function Tile({ name, videoStream, audioStream, label, muted, mirrored, large }: {
  name: string;
  videoStream: MediaStream | null;
  audioStream?: MediaStream | null;
  label?: string;
  muted?: boolean;
  mirrored?: boolean;
  large?: boolean;
}) {
  const speaking = useSpeaking(audioStream ?? null);
  const hasVideo = !!videoStream && videoStream.getVideoTracks().some((t) => t.readyState === "live");
  return (
    <div className={`clw-tile ${speaking ? "clw-tile--speaking" : ""}`}>
      {hasVideo ? (
        <VideoEl stream={videoStream!} mirrored={mirrored} contain={large} />
      ) : (
        <div className="clw-tile-avatar">
          <Avatar name={name} size={large ? 104 : 64} />
        </div>
      )}
      <span className="clw-tile-name">
        {muted && <MicOff size={12} />} {label ?? name}
      </span>
    </div>
  );
}

export default function CallWindow({
  activeCall,
  localStream,
  participants,
  isMuted,
  isCamOff,
  isScreenSharing,
  myName,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onHangup,
}: CallWindowProps) {
  const isVideo = activeCall.callType === "VIDEO";
  const statusLabel = getStatusLabel(activeCall, participants.length);
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const showLocalVideo = !!localStream && (isScreenSharing || !isCamOff);
  const oneToOne = !activeCall.isGroup;

  return (
    <div className="clw-overlay" role="dialog" aria-modal="true" aria-label="Call">
      <div className={`clw-card ${activeCall.isGroup ? "clw-card--group" : ""}`}>
        <div className="clw-topbar">
          {activeCall.isGroup && <Users size={15} />}
          <span className="clw-title">{activeCall.remoteUserName}</span>
          <span className="clw-dot">•</span>
          <span className="clw-status">{statusLabel}</span>
          {isScreenSharing && <span className="clw-sharing-pill">You&apos;re sharing your screen</span>}
        </div>

        {oneToOne ? (
          // 1:1 — the other person fills the stage, you're picture-in-picture.
          <div className="clw-stage">
            {participants[0] && (participants[0].videoStream || !isVideo) ? (
              <Tile
                name={participants[0].name}
                videoStream={participants[0].videoStream}
                audioStream={participants[0].audioStream}
                large
              />
            ) : (
              <div className="clw-waiting">
                <div className="clw-avatar-ring"><Avatar name={activeCall.remoteUserName} size={104} /></div>
                <h3>{activeCall.remoteUserName}</h3>
                <p>{statusLabel}</p>
              </div>
            )}
            {showLocalVideo && (
              <div className="clw-pip">
                <VideoEl stream={localStream!} mirrored={!isScreenSharing} contain={isScreenSharing} />
              </div>
            )}
          </div>
        ) : (
          // Group — everyone in an even grid, you included.
          <div className={`clw-grid clw-grid--${Math.min(participants.length + 1, 9)}`}>
            <Tile
              name={myName}
              label={`${myName} (you)`}
              videoStream={showLocalVideo ? localStream : null}
              muted={isMuted}
              mirrored={!isScreenSharing}
            />
            {participants.map((p) => (
              <Tile key={p.uid} name={p.name} videoStream={p.videoStream} audioStream={p.audioStream} />
            ))}
            {participants.length === 0 && (
              <div className="clw-tile clw-tile--waiting">
                <p>{activeCall.connectionState === "ringing" ? "Waiting for others to join…" : "Connecting…"}</p>
              </div>
            )}
          </div>
        )}

        <div className="clw-controls">
          <button
            type="button"
            className={`clw-btn ${isMuted ? "clw-btn--off" : ""}`}
            onClick={onToggleMute}
            title={isMuted ? "Unmute" : "Mute"}
            aria-pressed={isMuted}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {isVideo && (
            <button
              type="button"
              className={`clw-btn ${isCamOff ? "clw-btn--off" : ""}`}
              onClick={onToggleCamera}
              disabled={isScreenSharing}
              title={isCamOff ? "Turn camera on" : "Turn camera off"}
              aria-pressed={isCamOff}
            >
              {isCamOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          )}

          {canShare && (
            <button
              type="button"
              className={`clw-btn ${isScreenSharing ? "clw-btn--active" : ""}`}
              onClick={onToggleScreenShare}
              title={isScreenSharing ? "Stop sharing" : "Share your screen"}
              aria-pressed={isScreenSharing}
            >
              {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
            </button>
          )}

          <button type="button" className="clw-btn clw-btn--hangup" onClick={onHangup} title={activeCall.isGroup ? "Leave call" : "End call"}>
            <PhoneOff size={20} />
          </button>
        </div>
      </div>

      <style>{`
        .clw-overlay {
          position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .clw-card {
          width: 100%; max-width: 760px; height: min(520px, 92vh); background: #0f172a; border-radius: 24px;
          overflow: hidden; display: flex; flex-direction: column; position: relative; border: 1px solid #334155;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); color: #f8fafc;
        }
        .clw-card--group { max-width: 1040px; height: min(680px, 94vh); }
        .clw-topbar {
          display: flex; align-items: center; gap: 0.5rem; padding: 0.7rem 1rem; font-size: 0.85rem; font-weight: 600;
          border-bottom: 1px solid #1e293b; min-width: 0;
        }
        .clw-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .clw-dot { color: #60a5fa; }
        .clw-status { color: #93c5fd; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .clw-sharing-pill { margin-left: auto; background: #16a34a; color: #fff; font-size: 0.72rem; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
        .clw-stage { flex: 1; position: relative; background: #020617; display: flex; min-height: 0; }
        .clw-stage > .clw-tile { flex: 1; border-radius: 0; }
        .clw-waiting { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem; }
        .clw-waiting h3 { margin: 0; font-size: 1.35rem; }
        .clw-waiting p { margin: 0; color: #60a5fa; font-weight: 600; }
        .clw-avatar-ring { padding: 8px; border-radius: 50%; background: rgba(59,130,246,0.15); box-shadow: 0 0 30px rgba(59,130,246,0.2); }
        .clw-pip {
          position: absolute; bottom: 1rem; right: 1rem; width: 168px; height: 112px; border-radius: 12px;
          overflow: hidden; border: 2px solid #3b82f6; background: #1e293b;
        }
        .clw-grid { flex: 1; min-height: 0; display: grid; gap: 8px; padding: 8px; background: #020617; }
        .clw-grid--1, .clw-grid--2 { grid-template-columns: repeat(2, 1fr); }
        .clw-grid--3, .clw-grid--4 { grid-template-columns: repeat(2, 1fr); grid-auto-rows: 1fr; }
        .clw-grid--5, .clw-grid--6 { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr; }
        .clw-grid--7, .clw-grid--8, .clw-grid--9 { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr; }
        .clw-tile {
          position: relative; background: #1e293b; border-radius: 14px; overflow: hidden; min-height: 0;
          display: flex; align-items: center; justify-content: center; border: 2px solid transparent;
          transition: border-color 0.15s;
        }
        .clw-tile--speaking { border-color: #22c55e; }
        .clw-tile--waiting p { color: #94a3b8; font-size: 0.85rem; }
        .clw-tile-avatar { display: flex; align-items: center; justify-content: center; }
        .clw-video { width: 100%; height: 100%; background: #000; }
        .clw-tile-name {
          position: absolute; left: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 4px;
          background: rgba(15,23,42,0.75); padding: 3px 9px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
          max-width: calc(100% - 16px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .clw-controls {
          height: 72px; background: #1e293b; display: flex; align-items: center; justify-content: center; gap: 1.25rem;
          border-top: 1px solid #334155; flex-shrink: 0;
        }
        .clw-btn {
          width: 46px; height: 46px; border-radius: 50%; border: none; background: #334155; color: #f8fafc;
          display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s, transform 0.15s;
        }
        .clw-btn:hover:not(:disabled) { transform: scale(1.05); }
        .clw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .clw-btn--off { background: #dc2626; color: #fff; }
        .clw-btn--active { background: #16a34a; color: #fff; }
        .clw-btn--hangup { background: #ef4444; color: #fff; }
        .clw-btn--hangup:hover { background: #dc2626; }
        @media (max-width: 640px) {
          .clw-overlay { padding: 0; }
          .clw-card, .clw-card--group { height: 100svh; max-width: none; border-radius: 0; }
          .clw-grid--3, .clw-grid--4, .clw-grid--5, .clw-grid--6, .clw-grid--7, .clw-grid--8, .clw-grid--9 { grid-template-columns: repeat(2, 1fr); }
          .clw-pip { width: 110px; height: 150px; }
        }
      `}</style>
    </div>
  );
}
