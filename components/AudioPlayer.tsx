"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

interface AudioPlayerProps {
  src: string;
  isMine: boolean;
}

export default function AudioPlayer({ src, isMine }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const val = Number(e.target.value);
    const newTime = (val / 100) * (duration || 0);
    audioRef.current.currentTime = newTime;
    setProgress(val);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === 0) return "0:00";
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <div className={`ap-shell ${isMine ? "ap-shell--mine" : "ap-shell--theirs"}`}>
      <button
        type="button"
        className={`ap-btn ${isMine ? "ap-btn--mine" : "ap-btn--theirs"}`}
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
      </button>

      <div className="ap-track-group">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSeek}
          className="ap-slider"
        />
        <span className="ap-time">{formatTime(duration)}</span>
      </div>

      <style>{`
        .ap-shell {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-radius: 14px;
          min-width: 200px;
        }
        .ap-shell--mine { background: #3b82f6; color: #fff; }
        .ap-shell--theirs { background: #f1f5f9; color: #1e293b; }

        .ap-btn {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: transform 0.1s;
        }
        .ap-btn:hover { transform: scale(1.05); }
        .ap-btn--mine { background: #ffffff; color: #3b82f6; }
        .ap-btn--theirs { background: #3b82f6; color: #ffffff; }

        .ap-track-group {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .ap-slider {
          width: 100%;
          height: 4px;
          border-radius: 2px;
          accent-color: currentColor;
          cursor: pointer;
        }
        .ap-time {
          font-size: 0.75rem;
          opacity: 0.85;
          align-self: flex-end;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
