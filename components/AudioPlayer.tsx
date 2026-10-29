"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Loader2, AlertCircle, Mic } from "lucide-react";
import { getToken } from "@/lib/auth";

interface AudioPlayerProps {
  src: string;
  isMine: boolean;
}

const NUM_BARS = 40;
const SPEEDS = [1, 1.5, 2] as const;

// Joins a base URL and a path without producing a double slash ("http://host//path")
// or a missing slash ("http://hostpath") — both of which cause 404s.
function buildAudioUrl(src: string): string {
  if (src.startsWith("http")) return src;

  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
  const path = src.startsWith("/") ? src : `/${src}`;
  return `${base}${path}`;
}

// ── Audio Cache ──────────────────────────────────────────────────────
// Keeps fetched audio blob URLs + decoded waveform peaks in memory so
// switching conversations or re-mounting doesn't re-fetch from the server.
interface CachedAudio {
  blobUrl: string;
  peaks: number[];
  duration: number;
}
const audioCache = new Map<string, CachedAudio>();

export default function AudioPlayer({ src, isMine }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const blobUrlRef = useRef<string>("");

  const [peaks, setPeaks] = useState<number[]>(() => Array(NUM_BARS).fill(0.3));
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [speedIdx, setSpeedIdx] = useState(0);

  // Fetch audio with auth token, decode waveform, create blob URL
  const loadAudio = useCallback(async () => {
    setLoading(true);
    setError(false);
    setErrorDetail("");

    // Clean up any previous audio element before loading a new one
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Check cache first — skip the entire fetch + decode if we already have it
    const cacheKey = src;
    const cached = audioCache.get(cacheKey);
    if (cached) {
      blobUrlRef.current = cached.blobUrl;
      setPeaks(cached.peaks);
      setDuration(cached.duration);

      const audio = new Audio(cached.blobUrl);
      audioRef.current = audio;
      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration)) setDuration(audio.duration);
      });
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(100);
      });
      audio.addEventListener("error", () => {
        console.warn("AudioPlayer: <audio> element error (cached)", audio.error?.message);
        setError(true);
        setErrorDetail("Playback error");
      });

      setLoading(false);
      return;
    }

    // Not cached — revoke any old non-cached blob
    if (blobUrlRef.current) {
      // Don't revoke if it belongs to the cache
      let isInCache = false;
      audioCache.forEach((v) => { if (v.blobUrl === blobUrlRef.current) isInCache = true; });
      if (!isInCache) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = "";
    }

    try {
      if (!src) {
        throw new Error("No audio src provided");
      }

      const token = getToken();
      const fullUrl = buildAudioUrl(src);

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("AudioPlayer fetching:", fullUrl);
      }

      const response = await fetch(fullUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${fullUrl}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      if (arrayBuffer.byteLength === 0) {
        throw new Error(`Empty response body for ${fullUrl}`);
      }

      // Detect true container format from magic bytes (OggS vs EBML/WebM) to prevent FFmpeg demuxer errors
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 4));
      let detectedType = "";
      if (headerBytes[0] === 0x4f && headerBytes[1] === 0x67 && headerBytes[2] === 0x67 && headerBytes[3] === 0x53) {
        detectedType = "audio/ogg";
      } else if (headerBytes[0] === 0x1a && headerBytes[1] === 0x45 && headerBytes[2] === 0xdf && headerBytes[3] === 0xa3) {
        detectedType = "audio/webm";
      } else {
        const rawContentType = response.headers.get("content-type") || "";
        detectedType = rawContentType.split(";")[0].trim() || "audio/webm";
      }

      const blob = new Blob([arrayBuffer], { type: detectedType });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      // Create audio element — plays blob URL directly for natural sound
      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration)) setDuration(audio.duration);
      });
      audio.addEventListener("durationchange", () => {
        if (isFinite(audio.duration)) setDuration(audio.duration);
      });
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(100);
      });
      audio.addEventListener("error", () => {
        console.warn("AudioPlayer: <audio> element error", audio.error?.message || "Playback error");
        setError(true);
        setErrorDetail("Playback error");
      });

      // Decode waveform peaks and exact duration
      try {
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        if (decoded.duration && isFinite(decoded.duration)) {
          setDuration(decoded.duration);
        }
        const channelData = decoded.getChannelData(0);
        const blockSize = Math.floor(channelData.length / NUM_BARS);
        const waveformPeaks: number[] = [];

        for (let i = 0; i < NUM_BARS; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = start; j < start + blockSize && j < channelData.length; j++) {
            sum += Math.abs(channelData[j]);
          }
          waveformPeaks.push(blockSize > 0 ? sum / blockSize : 0);
        }

        // Normalize to 0.15 - 1.0 range
        const maxPeak = Math.max(...waveformPeaks, 0.01);
        const normalized = waveformPeaks.map((p) => 0.15 + (p / maxPeak) * 0.85);
        setPeaks(normalized);
        audioCtx.close();

        // Store in cache for instant replay on re-mount
        audioCache.set(cacheKey, {
          blobUrl: blobUrl,
          peaks: normalized,
          duration: decoded.duration && isFinite(decoded.duration) ? decoded.duration : 0,
        });
      } catch {
        // If decode fails, keep default peaks
      }

      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("AudioPlayer: failed to load", message);
      setError(true);
      setErrorDetail(message);
      setLoading(false);
    }
  }, [src]);

  useEffect(() => {
    loadAudio();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Don't revoke cached blob URLs — they're reused across mounts
    };
  }, [loadAudio]);

  // Smooth progress animation via rAF
  useEffect(() => {
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused && audioRef.current.duration) {
        setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(tick);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current.ended || progress >= 99) {
        audioRef.current.currentTime = 0;
        setProgress(0);
      }
      audioRef.current.play().catch((err) => {
        console.error("AudioPlayer: play() failed", err);
        setError(true);
        setErrorDetail("Playback blocked or failed");
      });
      setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[next];
    }
  };

  const handleBarClick = (index: number) => {
    if (!audioRef.current || !duration) return;
    const ratio = index / NUM_BARS;
    audioRef.current.currentTime = ratio * duration;
    setProgress(ratio * 100);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs <= 0) return "0:00";
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  const currentTime = audioRef.current?.currentTime ?? 0;
  const displayTime = isPlaying ? formatTime(currentTime) : formatTime(duration);
  const progressRatio = progress / 100;

  // ── Error state ──
  if (error) {
    return (
      <div className={`ap2-shell ${isMine ? "ap2-shell--mine" : "ap2-shell--theirs"}`}>
        <button type="button" className="ap2-play-btn ap2-play-btn--err" onClick={loadAudio} title="Retry">
          <AlertCircle size={16} />
        </button>
        <span className="ap2-err-text" title={errorDetail}>
          Failed to load{errorDetail.includes("404") ? " (not found)" : ""}
        </span>
        <style>{styles}</style>
      </div>
    );
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className={`ap2-shell ${isMine ? "ap2-shell--mine" : "ap2-shell--theirs"}`}>
        <div className="ap2-play-btn ap2-play-btn--loading">
          <Loader2 size={16} className="ap2-spin" />
        </div>
        <div className="ap2-bars-container">
          {peaks.map((h, i) => (
            <span key={i} className="ap2-bar ap2-bar--loading" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // ── Main player ──
  return (
    <div className={`ap2-shell ${isMine ? "ap2-shell--mine" : "ap2-shell--theirs"}`}>
      {/* Mic icon */}
      <Mic size={14} className="ap2-mic-icon" />

      {/* Play/Pause button */}
      <button
        type="button"
        className={`ap2-play-btn ${isMine ? "ap2-play-btn--mine" : "ap2-play-btn--theirs"}`}
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 1 }} />}
      </button>

      {/* Waveform bars */}
      <div className="ap2-bars-container">
        {peaks.map((h, i) => {
          const barRatio = i / NUM_BARS;
          const isFilled = barRatio <= progressRatio;
          return (
            <span
              key={i}
              className={`ap2-bar ${isFilled ? (isMine ? "ap2-bar--filled-mine" : "ap2-bar--filled-theirs") : (isMine ? "ap2-bar--empty-mine" : "ap2-bar--empty-theirs")}`}
              style={{ height: `${h * 100}%` }}
              onClick={() => handleBarClick(i)}
            />
          );
        })}
      </div>

      {/* Time + Speed */}
      <div className="ap2-meta">
        <span className="ap2-time">{displayTime}</span>
        <button type="button" className="ap2-speed-btn" onClick={cycleSpeed} title="Playback speed">
          {SPEEDS[speedIdx]}x
        </button>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .ap2-shell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 16px;
    min-width: 220px;
    max-width: 340px;
    position: relative;
  }
  .ap2-shell--mine { background: #4338ca; color: #fff; }
  .ap2-shell--theirs { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; }

  .ap2-mic-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }

  .ap2-play-btn {
    width: 32px; height: 32px; border-radius: 50%; border: none;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; cursor: pointer;
    transition: transform 0.1s;
  }
  .ap2-play-btn:hover { transform: scale(1.08); }
  .ap2-play-btn--mine { background: #fff; color: #4338ca; }
  .ap2-play-btn--theirs { background: #4f46e5; color: #fff; }
  .ap2-play-btn--err { background: #fca5a5; color: #991b1b; }
  .ap2-play-btn--loading {
    background: transparent; color: inherit; cursor: default;
  }

  .ap2-bars-container {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1.5px;
    height: 28px;
    cursor: pointer;
  }

  .ap2-bar {
    flex: 1;
    border-radius: 1px;
    min-height: 3px;
    transition: background 0.15s;
  }
  .ap2-bar--filled-mine { background: #fff; }
  .ap2-bar--filled-theirs { background: #4f46e5; }
  .ap2-bar--empty-mine { background: rgba(255,255,255,0.3); }
  .ap2-bar--empty-theirs { background: #cbd5e1; }
  .ap2-bar--loading {
    background: currentColor;
    opacity: 0.2;
    animation: ap2-pulse 1.5s ease-in-out infinite;
  }
  @keyframes ap2-pulse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.35; }
  }

  .ap2-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1rem;
    flex-shrink: 0;
  }

  .ap2-time {
    font-size: 0.6875rem;
    font-weight: 600;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
  }

  .ap2-speed-btn {
    font-size: 0.625rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    opacity: 0.75;
    transition: opacity 0.15s, background 0.15s;
    background: rgba(128,128,128,0.2);
    color: inherit;
  }
  .ap2-speed-btn:hover { opacity: 1; }

  .ap2-err-text {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .ap2-spin {
    animation: ap2-spin-anim 0.7s linear infinite;
  }
  @keyframes ap2-spin-anim {
    to { transform: rotate(360deg); }
  }
`;