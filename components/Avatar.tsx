"use client";

import { useMemo } from "react";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  online?: boolean;
  className?: string;
}

const PALETTE = [
  ["#4f7df3", "#fff"], // blue
  ["#7c3aed", "#fff"], // violet
  ["#0891b2", "#fff"], // cyan
  ["#15803d", "#fff"], // green
  ["#b45309", "#fff"], // amber
  ["#be123c", "#fff"], // rose
  ["#0f766e", "#fff"], // teal
  ["#6d28d9", "#fff"], // purple
];

function nameToIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % PALETTE.length;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ src, name, size = 36, online, className = "" }: AvatarProps) {
  const [bg, fg] = useMemo(() => PALETTE[nameToIndex(name)], [name]);
  const text = useMemo(() => initials(name), [name]);
  const fontSize = Math.max(10, Math.round(size * 0.38));
  const badgeSize = Math.round(size * 0.28);

  return (
    <div
      className={`av-wrap ${className}`}
      style={{ width: size, height: size }}
      aria-label={name}
      role="img"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="av-img" width={size} height={size} />
      ) : (
        <div
          className="av-init"
          style={{ background: bg, color: fg, fontSize }}
        >
          {text}
        </div>
      )}

      {online !== undefined && (
        <span
          className={`av-dot ${online ? "av-dot--online" : "av-dot--offline"}`}
          style={{ width: badgeSize, height: badgeSize }}
          aria-label={online ? "Online" : "Offline"}
        />
      )}

      <style>{`
        .av-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .av-img {
          width: 100%; height: 100%;
          border-radius: 50%; object-fit: cover;
        }
        .av-init {
          width: 100%; height: 100%;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; letter-spacing: -0.01em;
          user-select: none;
        }
        .av-dot {
          position: absolute;
          bottom: 1px; right: 1px;
          border-radius: 50%;
          border: 2px solid #fff;
        }
        .av-dot--online  { background: #22c55e; }
        .av-dot--offline { background: #d1d5db; }
      `}</style>
    </div>
  );
}
