"use client";

import React, { useEffect } from "react";
import { X, Download, FileText, ExternalLink } from "lucide-react";

interface DocViewerModalProps {
  url: string;
  name: string;
  isImage?: boolean;
  isPdf?: boolean;
  onClose: () => void;
}

export default function DocViewerModal({ url, name, isImage, isPdf, onClose }: DocViewerModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="dvm-overlay" onClick={onClose}>
      <div className="dvm-shell" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dvm-header">
          <div className="dvm-title-group">
            <FileText size={18} className="dvm-icon" />
            <span className="dvm-title" title={name}>{name}</span>
          </div>

          <div className="dvm-actions">
            <a
              href={url}
              download={name}
              target="_blank"
              rel="noopener noreferrer"
              className="dvm-btn"
              title="Download file"
            >
              <Download size={16} />
              <span>Download</span>
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="dvm-btn"
              title="Open in new tab"
            >
              <ExternalLink size={16} />
            </a>
            <button type="button" className="dvm-btn dvm-btn--close" onClick={onClose} title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="dvm-body">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className="dvm-image" />
          ) : isPdf ? (
            <iframe
              src={`${url}#toolbar=1`}
              title={name}
              className="dvm-iframe"
            />
          ) : (
            <div className="dvm-unsupported">
              <FileText size={48} className="dvm-unsupported-icon" />
              <p className="dvm-unsupported-title">Preview not available for this file type</p>
              <p className="dvm-unsupported-sub">Click download to view this file on your computer.</p>
              <a href={url} download={name} className="dvm-download-cta">
                <Download size={16} /> Download {name}
              </a>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .dvm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(4px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          animation: dvmFadeIn 0.15s ease;
        }
        .dvm-shell {
          width: 95vw;
          max-width: 1000px;
          height: 88vh;
          background: var(--surface-card, #ffffff);
          border-radius: 16px;
          border: 1px solid var(--border, #e2e8f0);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .dvm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border, #e2e8f0);
          background: var(--bg-primary, #ffffff);
          flex-shrink: 0;
        }
        .dvm-title-group {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          min-width: 0;
          flex: 1;
        }
        .dvm-icon {
          color: var(--accent, #4f46e5);
          flex-shrink: 0;
        }
        .dvm-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary, #0f172a);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dvm-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .dvm-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.4rem 0.75rem;
          background: var(--bg-secondary, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 8px;
          color: var(--text-secondary, #334155);
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          text-decoration: none;
        }
        .dvm-btn:hover {
          background: var(--bg-tertiary, #f1f5f9);
          color: var(--text-primary, #0f172a);
        }
        .dvm-btn--close {
          padding: 0.4rem;
        }
        .dvm-btn--close:hover {
          background: #fee2e2;
          color: #ef4444;
          border-color: #fca5a5;
        }
        .dvm-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary, #0f172a);
          overflow: hidden;
          position: relative;
        }
        .dvm-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          user-select: none;
        }
        .dvm-iframe {
          width: 100%;
          height: 100%;
          border: none;
          background: #ffffff;
        }
        .dvm-unsupported {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2rem;
          color: var(--text-muted, #94a3b8);
        }
        .dvm-unsupported-icon {
          margin-bottom: 1rem;
          opacity: 0.6;
        }
        .dvm-unsupported-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary, #f1f5f9);
          margin-bottom: 0.35rem;
        }
        .dvm-unsupported-sub {
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }
        .dvm-download-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--accent, #4f46e5);
          color: #ffffff;
          padding: 0.6rem 1.2rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.875rem;
          text-decoration: none;
          transition: opacity 0.15s;
        }
        .dvm-download-cta:hover {
          opacity: 0.9;
        }
        @keyframes dvmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

