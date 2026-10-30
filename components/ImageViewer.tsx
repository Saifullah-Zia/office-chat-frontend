"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, ExternalLink } from "lucide-react";
import { downloadHref } from "@/lib/media";

export interface ViewerImage {
  id: number;
  url: string;
  name: string;
  sender?: string;
  createdAt?: string;
}

interface ImageViewerProps {
  images: ViewerImage[];
  startIndex: number;
  onClose: () => void;
}

const ZOOMS = [1, 1.5, 2, 3];

export default function ImageViewer({ images, startIndex, onClose }: ImageViewerProps) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), images.length - 1));
  const [zoomStep, setZoomStep] = useState(0);
  const image = images[index];
  const zoom = ZOOMS[zoomStep];

  const go = (delta: number) => {
    setIndex((i) => Math.min(Math.max(i + delta, 0), images.length - 1));
    setZoomStep(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") { setIndex((i) => Math.max(i - 1, 0)); setZoomStep(0); }
      else if (e.key === "ArrowRight") { setIndex((i) => Math.min(i + 1, images.length - 1)); setZoomStep(0); }
      else if (e.key === "+" || e.key === "=") setZoomStep((z) => Math.min(z + 1, ZOOMS.length - 1));
      else if (e.key === "-") setZoomStep((z) => Math.max(z - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [images.length, onClose]);

  if (!image) return null;

  return (
    <div className="ivw" role="dialog" aria-modal="true" aria-label="Image viewer" onClick={onClose}>
      <header className="ivw-top" onClick={(e) => e.stopPropagation()}>
        <div className="ivw-meta">
          <span className="ivw-name">{image.sender ?? image.name}</span>
          <span className="ivw-sub">
            {image.createdAt
              ? new Date(image.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
              : image.name}
            {images.length > 1 && ` · ${index + 1} of ${images.length}`}
          </span>
        </div>
        <div className="ivw-tools">
          <button type="button" onClick={() => setZoomStep((z) => Math.max(z - 1, 0))} disabled={zoomStep === 0} aria-label="Zoom out"><ZoomOut size={18} /></button>
          <button type="button" onClick={() => setZoomStep((z) => Math.min(z + 1, ZOOMS.length - 1))} disabled={zoomStep === ZOOMS.length - 1} aria-label="Zoom in"><ZoomIn size={18} /></button>
          <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label="Open original"><ExternalLink size={18} /></a>
          <a href={downloadHref(image.url)} download={image.name} aria-label="Download"><Download size={18} /></a>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
      </header>

      <div className="ivw-stage" onClick={(e) => e.stopPropagation()}>
        {index > 0 && (
          <button type="button" className="ivw-nav ivw-nav--prev" onClick={() => go(-1)} aria-label="Previous image"><ChevronLeft size={28} /></button>
        )}
        <div className={`ivw-canvas ${zoom > 1 ? "ivw-canvas--zoomed" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={image.id}
            src={image.url}
            alt={image.name}
            style={{ transform: `scale(${zoom})` }}
            onClick={() => setZoomStep((z) => (z === 0 ? 2 : 0))}
            draggable={false}
          />
        </div>
        {index < images.length - 1 && (
          <button type="button" className="ivw-nav ivw-nav--next" onClick={() => go(1)} aria-label="Next image"><ChevronRight size={28} /></button>
        )}
      </div>

      {images.length > 1 && (
        <div className="ivw-strip" onClick={(e) => e.stopPropagation()}>
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={`ivw-thumb ${i === index ? "ivw-thumb--on" : ""}`}
              onClick={() => { setIndex(i); setZoomStep(0); }}
              aria-label={`Image ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <style>{`
        .ivw {
          position: fixed; inset: 0; z-index: 1100; background: rgba(8, 10, 16, 0.94);
          display: flex; flex-direction: column; color: #f1f5f9;
        }
        .ivw-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem; }
        .ivw-meta { display: flex; flex-direction: column; min-width: 0; }
        .ivw-name { font-weight: 700; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ivw-sub { font-size: 0.75rem; color: #94a3b8; }
        .ivw-tools { display: flex; align-items: center; gap: 0.25rem; }
        .ivw-tools button, .ivw-tools a {
          display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px;
          background: none; border: none; color: #e2e8f0; cursor: pointer;
        }
        .ivw-tools button:hover, .ivw-tools a:hover { background: rgba(255,255,255,0.1); }
        .ivw-tools button:disabled { opacity: 0.35; cursor: default; }
        .ivw-stage { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; }
        .ivw-canvas { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ivw-canvas--zoomed { overflow: auto; }
        .ivw-canvas img {
          max-width: 92%; max-height: 92%; object-fit: contain; transition: transform 0.2s ease; cursor: zoom-in;
          user-select: none;
        }
        .ivw-canvas--zoomed img { cursor: zoom-out; }
        .ivw-nav {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; width: 48px; height: 48px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;
          background: rgba(255,255,255,0.12); color: #fff;
        }
        .ivw-nav:hover { background: rgba(255,255,255,0.22); }
        .ivw-nav--prev { left: 16px; }
        .ivw-nav--next { right: 16px; }
        .ivw-strip { display: flex; gap: 6px; padding: 0.6rem 1rem 0.9rem; overflow-x: auto; justify-content: center; }
        .ivw-thumb {
          flex-shrink: 0; width: 54px; height: 54px; border-radius: 8px; overflow: hidden; padding: 0; cursor: pointer;
          border: 2px solid transparent; opacity: 0.55; background: #1e293b;
        }
        .ivw-thumb--on { border-color: #fff; opacity: 1; }
        .ivw-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        @media (max-width: 600px) {
          .ivw-nav { width: 40px; height: 40px; }
          .ivw-nav--prev { left: 6px; }
          .ivw-nav--next { right: 6px; }
        }
      `}</style>
    </div>
  );
}
