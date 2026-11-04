"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorOff, Users, Settings2, WifiOff, Minimize2, Maximize2, Hand, MessageSquare, Maximize, Minimize } from "lucide-react";
import CallChatPanel from "./CallChatPanel";
import { isNativeApp, isNativeDeviceLocked } from "@/lib/native";
import { useStore } from "@/lib/store";
import { getUser } from "@/lib/auth";
import DeviceSettings from "./DeviceSettings";
import { DeviceKind } from "@/lib/devices";
import { ActiveCall, CallParticipant, NetworkQuality, ScreenShare } from "@/types/call";
import Avatar from "./Avatar";

interface CallWindowProps {
  activeCall: ActiveCall;
  localStream: MediaStream | null;
  participants: CallParticipant[];
  /** Other people's shared screens; the newest is shown large. */
  screenShares: ScreenShare[];
  networkQuality: NetworkQuality;
  /** My connection has been poor for a few seconds. */
  connectionUnstable: boolean;
  noiseSuppression: boolean;
  backgroundBlur: boolean;
  onSetNoiseSuppression: (on: boolean) => void;
  onSetBackgroundBlur: (on: boolean) => void;
  myUserId: number | null;
  /** Raised hands by user id (mine included) */
  raisedHands: Set<number>;
  onToggleHand: () => void;
  isMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  myName: string;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onHangup: () => void;
  /** Switch mic / camera / speaker mid-call. */
  onSwitchDevice: (kind: DeviceKind, deviceId: string) => void;
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

/** 4 bars, coloured by Agora's quality score (1 best ... 6 down; 0 = not known yet). */
function SignalBars({ quality }: { quality?: number }) {
  if (!quality) return null;
  const bars = quality <= 1 ? 4 : quality === 2 ? 3 : quality === 3 ? 2 : quality === 4 ? 1 : 0;
  const color = quality <= 2 ? "#22c55e" : quality === 3 ? "#eab308" : quality === 4 ? "#f97316" : "#ef4444";
  const label = ["", "Excellent", "Good", "Poor", "Bad", "Very bad", "Disconnected"][quality] ?? "";
  return (
    <span className="clw-signal" title={`Connection: ${label}`} aria-label={`Connection: ${label}`} role="img">
      {[1, 2, 3, 4].map((i) => <i key={i} style={{ height: 3 + i * 3, background: i <= bars ? color : "rgba(255,255,255,0.25)" }} />)}
    </span>
  );
}

function Tile({ name, videoStream, audioStream, label, muted, mirrored, large, quality, hand }: {
  name: string;
  hand?: boolean;
  quality?: number;
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
    <div className={`clw-tile ${speaking ? "clw-tile--speaking" : ""} ${hand ? "clw-tile--hand" : ""}`}>
      {hand && <span className="clw-hand-badge" aria-label="Hand raised">✋</span>}
      {hasVideo ? (
        <VideoEl stream={videoStream!} mirrored={mirrored} contain={large} />
      ) : (
        <div className="clw-tile-avatar">
          <Avatar name={name} size={large ? 104 : 64} />
        </div>
      )}
      <span className="clw-tile-name">
        {muted && <MicOff size={12} />} {label ?? name} <SignalBars quality={quality} />
      </span>
    </div>
  );
}

export default function CallWindow({
  activeCall,
  localStream,
  participants,
  screenShares,
  networkQuality,
  connectionUnstable,
  noiseSuppression,
  backgroundBlur,
  onSetNoiseSuppression,
  onSetBackgroundBlur,
  myUserId,
  raisedHands,
  onToggleHand,
  isMuted,
  isCamOff,
  isScreenSharing,
  myName,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onHangup,
  onSwitchDevice,
}: CallWindowProps) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  // Full-screen view of a shared screen (browser Fullscreen API; Esc exits)
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageFullscreen, setStageFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setStageFullscreen(!!document.fullscreenElement && document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleStageFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stageRef.current?.requestFullscreen().catch(() => {});
  };
  // Side panel: people list or the call's chat (one at a time)
  const [panel, setPanel] = useState<"people" | "chat" | null>(null);
  const peopleOpen = panel === "people";
  // Chat unread badge: messages from others newer than the last one I saw.
  const latestId = useStore((st) => {
    const list = st.messagesByConv[activeCall.conversationId];
    return list?.length ? list[list.length - 1].id : 0;
  });
  const [seenId, setSeenId] = useState(() => {
    const list = useStore.getState().messagesByConv[activeCall.conversationId];
    return list?.length ? list[list.length - 1].id : 0;
  });
  const unread = useStore((st) => (st.messagesByConv[activeCall.conversationId] ?? [])
    .filter((m) => m.id > seenId && m.senderId !== myUserId && !m.threadRootId).length);
  const togglePanel = (which: "people" | "chat") => {
    if (which === "chat" || panel === "chat") setSeenId(latestId);
    setPanel((cur) => (cur === which ? null : which));
  };
  const myHand = myUserId !== null && raisedHands.has(myUserId);
  // Minimized: a small draggable window so the chat stays usable during the call.
  const [minimizedRaw, setMinimized] = useState(false);
  // Android app, answered from the lock screen: the call shows over the lock screen. Keep it to the
  // call itself (no chats, no minimising into the app) until the phone is unlocked.
  const [phoneLocked, setPhoneLocked] = useState(isNativeDeviceLocked);
  useEffect(() => {
    if (!isNativeApp()) return;
    const t = setInterval(() => setPhoneLocked(isNativeDeviceLocked()), 1_500);
    return () => clearInterval(t);
  }, []);
  const minimized = minimizedRaw && !phoneLocked;
  const [miniPos, setMiniPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const isVideo = activeCall.callType === "VIDEO";
  const statusLabel = getStatusLabel(activeCall, participants.length);
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const showLocalVideo = !!localStream && !isCamOff;
  const presenting = screenShares[screenShares.length - 1];
  const oneToOne = !activeCall.isGroup;
  // Notice shown to employees only. Nothing is actually recorded: it's a reminder to keep calls professional.
  const showRecordingNotice = activeCall.connectionState === "connected" && getUser()?.role === "EMPLOYEE";

  if (minimized) {
    // Best thing to show small: a shared screen, else someone's camera, else the call's avatar.
    const featured = presenting?.stream ?? participants.find((p) => p.videoStream)?.videoStream ?? null;
    const MINI_W = 240, MINI_H = 200;
    return (
      <div
        className="clw-mini"
        role="dialog"
        aria-label={`Call with ${activeCall.remoteUserName} (minimized)`}
        style={miniPos ? { left: miniPos.x, top: miniPos.y, right: "auto", bottom: "auto" } : undefined}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          const r = e.currentTarget.getBoundingClientRect();
          drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setMiniPos({
            x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - MINI_W),
            y: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - MINI_H),
          });
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <div className="clw-mini-video" onDoubleClick={() => setMinimized(false)} title="Double-click to expand">
          {featured ? <VideoEl stream={featured} contain={!!presenting} /> : <Avatar name={activeCall.remoteUserName} size={56} />}
          {presenting && <span className="clw-mini-tag"><Monitor size={11} /> {presenting.name}</span>}
        </div>
        <div className="clw-mini-bar">
          <span className="clw-mini-text">
            <b>{activeCall.remoteUserName}</b>
            <small>{statusLabel}{showRecordingNotice && <span className="clw-mini-rec"> · May be recorded</span>}</small>
          </span>
          <button type="button" className={`clw-mini-btn ${isMuted ? "clw-mini-btn--off" : ""}`} onClick={onToggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"} aria-pressed={isMuted}>
            {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button type="button" className="clw-mini-btn" onClick={() => setMinimized(false)} aria-label="Expand call">
            <Maximize2 size={15} />
          </button>
          <button type="button" className="clw-mini-btn clw-mini-btn--end" onClick={onHangup} aria-label={activeCall.isGroup ? "Leave call" : "End call"}>
            <PhoneOff size={15} />
          </button>
        </div>
        <style>{`
          .clw-mini {
            position: fixed; right: 20px; bottom: 20px; z-index: 1000; width: ${MINI_W}px; height: ${MINI_H}px;
            display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; background: #0f172a; color: #f8fafc;
            border: 1px solid #334155; box-shadow: 0 18px 40px rgba(0,0,0,0.45); cursor: grab; touch-action: none; user-select: none;
          }
          .clw-mini:active { cursor: grabbing; }
          .clw-mini-video { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: #020617; }
          .clw-mini-video video { width: 100%; height: 100%; }
          .clw-mini-tag { position: absolute; top: 6px; left: 6px; display: inline-flex; align-items: center; gap: 0.25rem; padding: 2px 6px; border-radius: 999px; background: rgba(15,23,42,0.8); font-size: 0.65rem; }
          .clw-mini-bar { display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.5rem; border-top: 1px solid #1e293b; }
          .clw-mini-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.15; }
          .clw-mini-text b { font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .clw-mini-text small { font-size: 0.65rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .clw-mini-btn { width: 30px; height: 30px; border-radius: 50%; border: none; background: #1e293b; color: #f8fafc; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
          .clw-mini-btn--off { background: #f8fafc; color: #0f172a; }
          .clw-mini-btn--end { background: #dc2626; }
          @media (max-width: 480px) { .clw-mini { right: 12px; bottom: 76px; } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="clw-overlay" role="dialog" aria-modal="true" aria-label="Call">
      <div className={`clw-card ${activeCall.isGroup ? "clw-card--group" : ""}`}>
        <div className="clw-topbar">
          {activeCall.isGroup && <Users size={15} />}
          <span className="clw-title">{activeCall.remoteUserName}</span>
          <span className="clw-dot">•</span>
          <span className="clw-status">{statusLabel}</span>
          {isScreenSharing && <span className="clw-sharing-pill">You&apos;re sharing your screen</span>}
          <button type="button" className={`clw-people-btn ${peopleOpen ? "clw-people-btn--on" : ""}`}
            onClick={() => togglePanel("people")} aria-expanded={peopleOpen} title="People in this call">
            <Users size={15} /> {participants.length + 1}
            {raisedHands.size > 0 && <span className="clw-people-hands">✋{raisedHands.size}</span>}
          </button>
          {!phoneLocked && (<>
          <button type="button" className={`clw-people-btn clw-chat-btn ${panel === "chat" ? "clw-people-btn--on" : ""}`}
            onClick={() => togglePanel("chat")} aria-expanded={panel === "chat"} title="Chat in this call"
            aria-label={`Chat${unread && panel !== "chat" ? ` (${unread} new)` : ""}`}>
            <MessageSquare size={15} />
            {unread > 0 && panel !== "chat" && <span className="clw-chat-badge">{unread > 9 ? "9+" : unread}</span>}
          </button>
          <button type="button" className="clw-minimize" onClick={() => { setMinimized(true); setDevicesOpen(false); }}
            title="Minimize: keep chatting during the call" aria-label="Minimize call">
            <Minimize2 size={16} />
          </button>
          </>)}
        </div>
        {showRecordingNotice && (
          <div className="clw-rec" role="status"><span className="clw-rec-dot" aria-hidden="true" /> This call may be recorded</div>
        )}

        {panel === "chat" && !phoneLocked && <CallChatPanel conversationId={activeCall.conversationId} />}

        {peopleOpen && (
          <aside className="clw-people" aria-label="People in this call">
            <h4>In this call ({participants.length + 1})</h4>
            <ul>
              {[
                { uid: myUserId ?? -1, name: myName, label: `${myName} (you)`, micOn: !isMuted, camOn: isVideo && !isCamOff, q: networkQuality.me },
                ...participants.map((p) => ({ uid: p.uid, name: p.name, label: p.name, micOn: p.micOn, camOn: p.camOn, q: networkQuality[p.uid] })),
              ]
                // raised hands first, in the order people are listed
                .sort((a, b) => Number(raisedHands.has(b.uid)) - Number(raisedHands.has(a.uid)))
                .map((p) => (
                  <li key={p.uid}>
                    <Avatar userId={p.uid} name={p.name} size={28} />
                    <span className="clw-people-name">{p.label}</span>
                    {raisedHands.has(p.uid) && <span aria-label="Hand raised">✋</span>}
                    <SignalBars quality={p.q} />
                    {p.micOn ? <Mic size={14} aria-label="Mic on" /> : <MicOff size={14} className="clw-off" aria-label="Muted" />}
                    {isVideo && (p.camOn ? <Video size={14} aria-label="Camera on" /> : <VideoOff size={14} className="clw-off" aria-label="Camera off" />)}
                  </li>
                ))}
            </ul>
          </aside>
        )}

        {connectionUnstable && (
          <div className="clw-unstable" role="status">
            <WifiOff size={15} /> Your connection is unstable.
            {isVideo && !isCamOff ? " Turning off your camera can help." : " Others may hear you break up."}
            {isVideo && !isCamOff && <button type="button" onClick={onToggleCamera}>Turn off camera</button>}
          </div>
        )}

        {presenting ? (
          // Someone is presenting: their screen fills the stage, faces in a strip below.
          <div className="clw-present">
            <div className="clw-present-stage" ref={stageRef} onDoubleClick={toggleStageFullscreen}>
              <VideoEl stream={presenting.stream} contain />
              <span className="clw-present-label"><Monitor size={14} /> {presenting.name} is presenting</span>
              <button type="button" className="clw-fullscreen-btn" onClick={toggleStageFullscreen}
                title={stageFullscreen ? "Exit full screen (Esc)" : "View full screen (or double-click)"}
                aria-label={stageFullscreen ? "Exit full screen" : "View shared screen full screen"}>
                {stageFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                <span>{stageFullscreen ? "Exit full screen" : "Full screen"}</span>
              </button>
            </div>
            <div className="clw-strip">
              <Tile name={myName} label={`${myName} (you)`} videoStream={showLocalVideo ? localStream : null} muted={isMuted} mirrored quality={networkQuality.me} hand={myHand} />
              {participants.map((p) => (
                <Tile key={p.uid} name={p.name} videoStream={p.videoStream} audioStream={p.audioStream} quality={networkQuality[p.uid]} hand={raisedHands.has(p.uid)} />
              ))}
            </div>
          </div>
        ) : oneToOne ? (
          // 1:1 — the other person fills the stage, you're picture-in-picture.
          <div className="clw-stage">
            {participants[0] && (participants[0].videoStream || !isVideo) ? (
              <Tile
                name={participants[0].name}
                videoStream={participants[0].videoStream}
                audioStream={participants[0].audioStream}
                quality={networkQuality[participants[0].uid]}
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
                <VideoEl stream={localStream!} mirrored />
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
              mirrored
              quality={networkQuality.me}
              hand={myHand}
            />
            {participants.map((p) => (
              <Tile key={p.uid} name={p.name} videoStream={p.videoStream} audioStream={p.audioStream} quality={networkQuality[p.uid]} hand={raisedHands.has(p.uid)} />
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

          <button
            type="button"
            className={`clw-btn ${myHand ? "clw-btn--active" : ""}`}
            onClick={onToggleHand}
            title={myHand ? "Lower hand" : "Raise hand"}
            aria-pressed={myHand}
          >
            <Hand size={20} />
          </button>

          <div className="clw-devices-wrap">
            <button
              type="button"
              className={`clw-btn ${devicesOpen ? "clw-btn--active" : ""}`}
              onClick={() => setDevicesOpen((v) => !v)}
              title="Microphone, camera and speaker"
              aria-label="Device settings"
              aria-expanded={devicesOpen}
            >
              <Settings2 size={20} />
            </button>
            {devicesOpen && (
              <div className="clw-devices" role="dialog" aria-label="Device settings">
                <div className="clw-fx">
                  <label>
                    <input type="checkbox" checked={noiseSuppression} onChange={(e) => onSetNoiseSuppression(e.target.checked)} />
                    <span><b>Noise suppression</b><small>Filters keyboard, fans and background voices</small></span>
                  </label>
                  {isVideo && (
                    <label>
                      <input type="checkbox" checked={backgroundBlur} disabled={isCamOff} onChange={(e) => onSetBackgroundBlur(e.target.checked)} />
                      <span><b>Blur my background</b><small>Keeps your surroundings private</small></span>
                    </label>
                  )}
                </div>
                <DeviceSettings onSwitch={onSwitchDevice} />
              </div>
            )}
          </div>

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
        .clw-minimize { margin-left: auto; background: none; border: none; color: #cbd5e1; cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .clw-minimize:hover { background: #1e293b; color: #fff; }
        .clw-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .clw-dot { color: #60a5fa; }
        .clw-rec { display: flex; align-items: center; justify-content: center; gap: 0.4rem; flex-shrink: 0; padding: 0.25rem 0.75rem; background: #450a0a; color: #fecaca; font-size: 0.75rem; font-weight: 600; }
        .clw-rec-dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }
        .clw-mini-rec { color: #f87171; font-weight: 600; }
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
        .clw-signal { display: inline-flex; align-items: flex-end; gap: 1px; margin-left: 0.3rem; height: 15px; }
        .clw-signal i { display: block; width: 3px; border-radius: 1px; }
        .clw-unstable {
          display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 1rem;
          background: rgba(234, 179, 8, 0.15); color: #fde68a; font-size: 0.8rem; border-bottom: 1px solid #1e293b;
        }
        .clw-unstable button { margin-left: auto; background: none; border: 1px solid #fde68a; color: #fde68a; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.75rem; cursor: pointer; }
        .clw-tile-name {
          position: absolute; left: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 4px;
          background: rgba(15,23,42,0.75); padding: 3px 9px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
          max-width: calc(100% - 16px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .clw-present { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; }
        .clw-present-stage { position: relative; flex: 1; min-height: 0; border-radius: 14px; overflow: hidden; background: #000; }
        .clw-present-stage video { width: 100%; height: 100%; }
        .clw-fullscreen-btn {
          position: absolute; top: 0.6rem; right: 0.6rem; z-index: 2; display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.35rem 0.7rem; border-radius: 999px; border: none; background: rgba(15, 23, 42, 0.8); color: #f8fafc;
          font-size: 0.78rem; font-weight: 600; cursor: pointer;
        }
        .clw-fullscreen-btn:hover { background: #4f46e5; }
        .clw-present-stage:fullscreen { border-radius: 0; background: #000; }
        .clw-present-stage:fullscreen video { object-fit: contain; }
        .clw-present-label {
          position: absolute; top: 0.6rem; left: 0.6rem; display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.3rem 0.65rem; border-radius: 999px; background: rgba(15, 23, 42, 0.75); font-size: 0.78rem; font-weight: 600;
        }
        .clw-strip { display: flex; gap: 0.5rem; height: 110px; flex-shrink: 0; overflow-x: auto; }
        .clw-strip .clw-tile { width: 160px; min-width: 160px; height: 100%; }
        .clw-devices-wrap { position: relative; }
        .clw-card { position: relative; }
        .clw-people-btn { display: inline-flex; align-items: center; gap: 0.3rem; margin-left: auto; background: #1e293b; border: none; color: #e2e8f0; border-radius: 999px; padding: 0.25rem 0.6rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .clw-people-btn--on { background: #4f46e5; color: #fff; }
        .clw-chat-btn { margin-left: 0.25rem; position: relative; }
        .clw-chat-badge { position: absolute; top: -5px; right: -5px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 0.62rem; display: flex; align-items: center; justify-content: center; }
        .clw-people-hands { margin-left: 0.2rem; }
        .clw-people + .clw-minimize, .clw-people-btn + .clw-minimize { margin-left: 0.25rem; }
        .clw-people {
          position: absolute; top: 49px; right: 0; bottom: 84px; width: 270px; max-width: 85%; z-index: 4;
          background: rgba(15, 23, 42, 0.97); border-left: 1px solid #1e293b; padding: 0.75rem; overflow-y: auto;
        }
        .clw-people h4 { margin: 0 0 0.5rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
        .clw-people ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
        .clw-people li { display: flex; align-items: center; gap: 0.45rem; font-size: 0.84rem; color: #e2e8f0; }
        .clw-people-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .clw-off { color: #f87171; }
        .clw-tile--hand { box-shadow: inset 0 0 0 3px #f59e0b; }
        .clw-hand-badge { position: absolute; top: 0.5rem; right: 0.5rem; z-index: 2; font-size: 1.3rem; animation: clw-wave 1s ease-in-out 2; }
        @keyframes clw-wave { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-15deg); } 75% { transform: rotate(15deg); } }
        .clw-fx { display: flex; flex-direction: column; gap: 0.45rem; padding-bottom: 0.65rem; margin-bottom: 0.65rem; border-bottom: 1px solid var(--border, #e2e8f0); }
        .clw-fx label { display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; }
        .clw-fx input { margin-top: 0.2rem; accent-color: var(--accent); }
        .clw-fx span { display: flex; flex-direction: column; font-size: 0.82rem; }
        .clw-fx small { font-size: 0.7rem; color: var(--text-muted); }
        .clw-devices {
          position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); width: 280px;
          background: var(--bg-primary, #fff); color: var(--text-primary); border-radius: 14px; padding: 0.85rem;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4); z-index: 5;
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
