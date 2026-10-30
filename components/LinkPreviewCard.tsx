"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { LinkPreview } from "@/types";

// Shared across bubbles so the same URL is only fetched once per page load.
const cache = new Map<string, Promise<LinkPreview | null>>();

function loadPreview(url: string): Promise<LinkPreview | null> {
  let p = cache.get(url);
  if (!p) {
    p = apiGet<LinkPreview>("/api/link-preview", { url }).catch(() => null);
    cache.set(url, p);
  }
  return p;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

/** First http(s) URL in a message, trimmed of trailing punctuation. */
export function firstUrl(text?: string | null): string | null {
  const m = text?.match(URL_RE);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : null;
}

interface LinkPreviewCardProps {
  url: string;
  isMine: boolean;
}

export default function LinkPreviewCard({ url, isMine }: LinkPreviewCardProps) {
  const [data, setData] = useState<LinkPreview | null>(null);
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadPreview(url).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [url]);

  // Only show a card when there's something better than the bare URL.
  if (!data || (!data.title && !data.description)) return null;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`lpc ${isMine ? "lpc--mine" : ""}`}
    >
      {data.image && imageOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="lpc-img"
          src={data.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageOk(false)}
        />
      )}
      <div className="lpc-text">
        <span className="lpc-site">{data.siteName ?? data.domain}</span>
        {data.title && <span className="lpc-title">{data.title}</span>}
        {data.description && <span className="lpc-desc">{data.description}</span>}
      </div>

      <style>{`
        .lpc {
          display: flex; flex-direction: column; max-width: 340px; margin-top: 0.3rem; overflow: hidden;
          border-radius: 12px; border: 1px solid var(--border); background: var(--bg-primary); text-decoration: none;
        }
        .lpc--mine { align-self: flex-end; }
        .lpc:hover { background: var(--bg-secondary); }
        .lpc-img { width: 100%; max-height: 170px; object-fit: cover; display: block; background: var(--bg-tertiary); }
        .lpc-text { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.5rem 0.7rem 0.6rem; border-left: 3px solid var(--accent); }
        .lpc-site { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
        .lpc-title {
          font-size: 0.84rem; font-weight: 700; color: var(--text-primary);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .lpc-desc {
          font-size: 0.76rem; color: var(--text-secondary);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
      `}</style>
    </a>
  );
}
