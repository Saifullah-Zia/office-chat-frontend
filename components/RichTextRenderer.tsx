"use client";

import React, { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

interface RichTextRendererProps {
  content: string;
  isMine?: boolean;
  currentUserName?: string | null;
}

/**
 * Parses markdown-like syntax for office chat:
 * - Code blocks: ```language\ncode\n``` with copy button
 * - Inline code: `code`
 * - Bold: **text** or *text*
 * - Strikethrough: ~text~
 * - URLs: https://...
 * - Mentions: @name, @all, @here
 */
export default function RichTextRenderer({ content, isMine, currentUserName }: RichTextRendererProps) {
  if (!content) return null;

  // Split into code blocks vs regular text
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="rt-wrapper">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Extract code block
          const lines = part.slice(3, -3).replace(/^\r?\n/, "").split("\n");
          let language = "";
          let codeText = part.slice(3, -3);

          if (lines.length > 0 && /^[a-zA-Z0-9_-]+$/.test(lines[0].trim())) {
            language = lines[0].trim();
            codeText = lines.slice(1).join("\n");
          }

          return <CodeBlock key={index} code={codeText} language={language} />;
        }

        // Regular text formatting
        return (
          <span key={index}>
            {formatInlineText(part, currentUserName, isMine)}
          </span>
        );
      })}

      <style>{`
        .rt-wrapper {
          display: inline;
          word-break: break-word;
          line-height: 1.45;
        }
        .rt-code-block {
          position: relative;
          background: #1e1e2e;
          color: #cdd6f4;
          border-radius: 8px;
          margin: 0.35rem 0;
          padding: 0.6rem 0.75rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.8125rem;
          overflow-x: auto;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .rt-code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.35rem;
          font-size: 0.6875rem;
          color: #89b4fa;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .rt-copy-btn {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #a6adc8;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.6875rem;
          transition: background 0.12s, color 0.12s;
        }
        .rt-copy-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }
        .rt-code-pre {
          margin: 0;
          white-space: pre-wrap;
          font-family: inherit;
        }
        .rt-inline-code {
          background: rgba(125, 125, 125, 0.2);
          padding: 1px 5px;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.85em;
        }
        .rt-mention {
          display: inline-block;
          font-weight: 600;
          border-radius: 4px;
          padding: 0 4px;
          margin: 0 1px;
        }
        .rt-mention--mine {
          background: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }
        .rt-mention--theirs {
          background: var(--accent-soft, #eef2ff);
          color: var(--accent, #4f46e5);
        }
        .rt-mention--highlight {
          background: #fef08a !important;
          color: #854d0e !important;
          font-weight: 700;
        }
        .rt-link {
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 2px;
          word-break: break-all;
        }
        .rt-link:hover {
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rt-code-block">
      <div className="rt-code-header">
        <span>{language || "code"}</span>
        <button type="button" className="rt-copy-btn" onClick={handleCopy} title="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="rt-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function formatInlineText(text: string, currentUserName?: string | null, isMine?: boolean): React.ReactNode[] {
  // Regex tokenizes:
  // 1. URLs (http/https)
  // 2. Mentions (@username, @all, @here)
  // 3. Inline code `code`
  // 4. Bold **bold**
  // 5. Italic *italic*
  // 6. Strikethrough ~strike~
  const tokenRegex = /(https?:\/\/[^\s]+)|(@[a-zA-Z0-9_\-\.]+)|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~[^~]+~)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("http://") || token.startsWith("https://")) {
      elements.push(
        <a
          key={match.index}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="rt-link"
          onClick={(e) => e.stopPropagation()}
        >
          {token}
        </a>
      );
    } else if (token.startsWith("@")) {
      const mentionName = token.slice(1).toLowerCase();
      const isMe = currentUserName && currentUserName.toLowerCase().includes(mentionName);
      const isBroad = mentionName === "all" || mentionName === "here" || mentionName === "everyone";
      const highlight = isMe || isBroad;

      elements.push(
        <span
          key={match.index}
          className={`rt-mention ${
            highlight
              ? "rt-mention--highlight"
              : isMine
              ? "rt-mention--mine"
              : "rt-mention--theirs"
          }`}
        >
          {token}
        </span>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      elements.push(
        <code key={match.index} className="rt-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      elements.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      elements.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("~") && token.endsWith("~")) {
      elements.push(<s key={match.index}>{token.slice(1, -1)}</s>);
    } else {
      elements.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

