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
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg;codecs=opus";
  return "audio/webm";
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
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        // Set up AnalyserNode for live waveform
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Detect best supported format
        mimeTypeRef.current = getSupportedMimeType();

        const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start(100);

        // Start timer
        timerRef.current = setInterval(() => {
          setSeconds((s) => {
            if (s + 1 >= MAX_DURATION_SECS) {
              // Auto-stop at max duration
              handleStopAndSendInternal();
              return s + 1;
            }
            return s + 1;
          });
        }, 1000);

        // Start live waveform animation
        animFrameRef.current = requestAnimationFrame(animateBars);
      } catch (err) {
        console.error("Microphone access failed:", err);
        alert("Microphone access denied or unavailable.");
        onCancel();
      }
    })();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close();
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
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    setIsUploading(true);

    // Stop animation
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      try {
        const mime = mimeTypeRef.current;
        const ext = getFileExtension(mime);
        const audioBlob = new Blob(chunksRef.current, { type: mime });
        const file = new File([audioBlob], `voice_note_${Date.now()}.${ext}`, {
          type: mime,
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
