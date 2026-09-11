"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Trash2, Send, Loader2, Pause, Play } from "lucide-react";
import { apiPostForm } from "@/lib/api";
import { AttachmentResponse, MessageRequest } from "@/types";

interface VoiceRecorderProps {
  conversationId: number;
  onSendVoiceMessage: (req: MessageRequest) => Promise<void>;
  onCancel: () => void;
}

const MAX_DURATION_SECS = 300; // 5 minutes
const WARNING_SECS = 30;
const NUM_BARS = 24;

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const isFirefox = typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("firefox");
  const candidates = isFirefox
    ? ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/ogg", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  console.warn("[VoiceRecorder] No explicit Opus container supported by MediaRecorder; falling back to default browser mimeType.");
  return "";
}

function getFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export default function VoiceRecorder({
  conversationId,
  onSendVoiceMessage,
  onCancel,
}: VoiceRecorderProps) {
  const [seconds, setSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [liveBars, setLiveBars] = useState<number[]>(() => Array(NUM_BARS).fill(0.15));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const mimeTypeRef = useRef<string>("audio/webm");
  const stoppingRef = useRef(false); // guard against double-stop (send/timeout)

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  // Animate live waveform from AnalyserNode
  const animateBars = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const blockSize = Math.floor(dataArray.length / NUM_BARS);
    const bars: number[] = [];
    for (let i = 0; i < NUM_BARS; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = start; j < start + blockSize && j < dataArray.length; j++) {
        sum += dataArray[j];
      }
      const avg = sum / blockSize / 255;
      bars.push(0.1 + avg * 0.9);
    }
    setLiveBars(bars);
    animFrameRef.current = requestAnimationFrame(animateBars);
  }, []);

  useEffect(() => {
    // ── StrictMode guard ──
    // React 18 dev-mode StrictMode intentionally mounts effects twice
    // (run → cleanup → run) to surface bugs like this one. Because
    // getUserMedia() is async, the first run's cleanup can fire BEFORE
    // its stream promise resolves, so `stream` is still null and never
    // gets stopped — leaving a live mic stream + MediaRecorder running
    // in the background while a second one starts on top of it. Both
    // recorders then push chunks into the same shared array, producing
    // a malformed, doubled/echoey/mistimed recording.
    //
    // `cancelled` closes that race: if cleanup already ran by the time
    // getUserMedia() resolves, we kill the stream immediately instead
    // of continuing setup.
    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;

    (async () => {
      try {
        // ── Clean natural mic capture ──
        // Native sample rate (no explicit sampleRate constraint) prevents
        // pitch stretching / slow playback. autoGainControl: false avoids
        // hollow volume pumping.
        const s = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });

        // If this effect instance was already cleaned up (StrictMode's
        // first pass) before getUserMedia resolved, discard this stream
        // entirely and do not set up a recorder.
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;

        // Log and verify applied track settings
        const track = stream.getAudioTracks()[0];
        if (track) {
          console.log("[VoiceRecorder] Applied track settings:", track.getSettings());
        }

        // ── Side-chain analyser for waveform visualization only ──
        // (source -> analyser only; never connected to audioCtx.destination,
        // so this cannot cause live mic-to-speaker echo)
        const trackSampleRate = track?.getSettings().sampleRate;
        audioCtx = trackSampleRate ? new AudioContext({ sampleRate: trackSampleRate }) : new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Detect best supported container
        const preferredMime = getSupportedMimeType();
        const recorderOptions: MediaRecorderOptions = {};
        if (preferredMime) {
          recorderOptions.mimeType = preferredMime;
        }

        recorder = new MediaRecorder(stream, recorderOptions);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        // Store actual instantiated recorder mimeType for accurate file extension & Content-Type
        mimeTypeRef.current = recorder.mimeType || preferredMime || "audio/webm";
        console.log("[VoiceRecorder] Actual recorder mimeType:", mimeTypeRef.current);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        // ── onstop set ONCE during init to avoid race conditions ──
        recorder.onstop = async () => {
          try {
            const rawMime = mimeTypeRef.current;
            const cleanMime = rawMime.split(";")[0].trim() || "audio/webm";
            const ext = getFileExtension(cleanMime);
            const audioBlob = new Blob(chunksRef.current, { type: cleanMime });

            // Skip empty recordings (user cancelled instantly)
            if (audioBlob.size < 100) {
              setIsUploading(false);
              onCancel();
              return;
            }

            const file = new File([audioBlob], `voice_note_${Date.now()}.${ext}`, {
              type: cleanMime,
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

        recorder.start(250);

        // Start timer based on exact wall-clock timestamp (prevents skipping 1,2,4,6)
        const startTime = Date.now();
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setSeconds(elapsed);
          if (elapsed >= MAX_DURATION_SECS) {
            handleStopAndSendInternal();
          }
        }, 250);

        // Start live waveform animation
        animFrameRef.current = requestAnimationFrame(animateBars);
      } catch (err) {
        if (!cancelled) {
          console.error("Microphone access failed:", err);
          alert("Microphone access denied or unavailable.");
          onCancel();
        }
      }
    })();

    return () => {
      cancelled = true; // ← marks this effect instance dead; the core fix

      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        // Detach handlers before stopping so a stray onstop from a
        // cleaned-up instance can never fire and upload a stale/empty blob.
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;

      // Also guard the locally-scoped recorder var directly, in case
      // getUserMedia resolved after `cancelled` was set but this
      // particular closure's recorder was still created (defensive;
      // in practice the `if (cancelled) return;` above prevents this).
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }

      stream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close();
      analyserRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const remaining = MAX_DURATION_SECS - seconds;
  const isNearLimit = remaining <= WARNING_SECS && remaining > 0;

  const handleStopAndSendInternal = async () => {
    // Guard: prevent double-fire from timer + button
    if (stoppingRef.current) return;
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    stoppingRef.current = true;
    setIsUploading(true);

    // Stop animation & timer
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    // Flush any buffered data, then stop
    try {
      mediaRecorderRef.current.requestData();
    } catch {
      // requestData may throw if already stopped — safe to ignore
    }
    mediaRecorderRef.current.stop();
  };

  const handleStopAndSend = async () => {
    await handleStopAndSendInternal();
  };

  return (
    <div className="vr-shell">
      <div className="vr-indicator">
        <span className="vr-dot" />
        <span className={`vr-timer ${isNearLimit ? "vr-timer--warn" : ""}`}>
          {formatTimer(seconds)}
        </span>
        {isNearLimit && (
          <span className="vr-remaining">({remaining}s left)</span>
        )}
      </div>

      <div className="vr-bars">
        {liveBars.map((h, i) => (
          <span
            key={i}
            className="vr-bar"
            style={{ height: `${h * 100}%` }}
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
          className="vr-btn vr-btn--pause"
          onClick={togglePause}
          disabled={isUploading}
          title={isPaused ? "Resume recording" : "Pause recording"}
          aria-label={isPaused ? "Resume recording" : "Pause recording"}
        >
          {isPaused ? <Play size={18} /> : <Pause size={18} />}
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
        .vr-timer { font-size: 0.875rem; font-weight: 700; color: #1e1b4b; min-width: 36px; font-variant-numeric: tabular-nums; }
        .vr-timer--warn { color: #ef4444; animation: vr-pulse 0.8s ease-in-out infinite; }
        .vr-remaining { font-size: 0.6875rem; color: #ef4444; font-weight: 600; }

        .vr-bars {
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          gap: 2px; height: 28px;
        }
        .vr-bar {
          flex: 1;
          max-width: 4px;
          background: #4f46e5;
          border-radius: 2px;
          transition: height 0.08s ease-out;
        }

        .vr-actions { display: flex; align-items: center; gap: 0.5rem; }
        .vr-btn {
          width: 36px; height: 36px; border-radius: 50%;
          border: none; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.15s;
        }
        .vr-btn--trash { background: #fee2e2; color: #ef4444; }
        .vr-btn--pause { background: #e0e7ff; color: #4f46e5; }
        .vr-btn--send { background: #4f46e5; color: #ffffff; }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
