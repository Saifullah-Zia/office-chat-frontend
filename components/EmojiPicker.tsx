"use client";

import { useState } from "react";

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    name: "Popular",
    emojis: ["👍", "❤️", "😂", "🔥", "🎉", "🙌", "😊", "👏", "✅", "🚀", "🙏", "😍"],
  },
  {
    name: "Smileys",
    emojis: ["😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😎", "🤩", "🥳"],
  },
  {
    name: "Gestures",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐", "🖖", "👋", "🤝"],
  },
  {
    name: "Work & Objects",
    emojis: ["💻", "📱", "💼", "📊", "📈", "📉", "📁", "📂", "📝", "✏️", "📌", "📍", "🔒", "🔑", "⚡", "💡", "🎯", "🏆"],
  },
];

export default function EmojiPicker({ onSelectEmoji, onClose }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="ep-popover" onClick={(e) => e.stopPropagation()}>
      <div className="ep-header">
        {EMOJI_CATEGORIES.map((cat, idx) => (
          <button
            key={cat.name}
            type="button"
            className={`ep-tab ${activeTab === idx ? "ep-tab--active" : ""}`}
            onClick={() => setActiveTab(idx)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="ep-grid">
        {EMOJI_CATEGORIES[activeTab].emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="ep-emoji-btn"
            onClick={() => {
              onSelectEmoji(emoji);
              onClose();
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      <style>{`
        .ep-popover {
          position: absolute;
          bottom: 100%;
          right: 0;
          margin-bottom: 0.5rem;
          width: 300px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          padding: 0.75rem;
          z-index: 100;
        }
        .ep-header {
          display: flex;
          gap: 0.25rem;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 0.5rem;
          margin-bottom: 0.5rem;
          overflow-x: auto;
        }
        .ep-tab {
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          border: none;
          background: none;
          cursor: pointer;
          white-space: nowrap;
        }
        .ep-tab--active {
          background: #e0e7ff;
          color: #4f46e5;
        }
        .ep-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 0.35rem;
          max-height: 180px;
          overflow-y: auto;
        }
        .ep-emoji-btn {
          font-size: 1.25rem;
          padding: 0.35rem;
          border-radius: 8px;
          border: none;
          background: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s, background 0.1s;
        }
        .ep-emoji-btn:hover {
          background: #f1f5f9;
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
}
