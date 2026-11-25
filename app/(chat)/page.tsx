"use client";

import { useStore } from "@/lib/store";
import ChatWindow from "@/components/ChatWindow";

export default function ChatPage() {
  const activeConversationId = useStore((s) => s.activeConversationId);

  if (!activeConversationId) {
    return (
      <div className="empty-state">
        <div className="empty-card">
          <div className="empty-icon-box">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo */}
            <img src="/jcat-icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
          </div>
          <h2>Select a Conversation</h2>
          <p>Choose a chat from the sidebar or start a new direct message to begin</p>
        </div>

        <style>{`
          .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            width: 100%;
            background: #f8fafc;
          }
          .empty-card {
            text-align: center;
            max-width: 360px;
            padding: 2rem;
          }
          .empty-icon-box {
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.25rem;
          }
          .empty-card h2 {
            font-size: 1.25rem;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 0.5rem;
          }
          .empty-card p {
            font-size: 0.875rem;
            color: #64748b;
            line-height: 1.5;
          }
        `}</style>
      </div>
    );
  }

  // Keyed so each chat gets fresh local state (composer text comes from its own draft).
  return <ChatWindow key={activeConversationId} conversationId={activeConversationId} />;
}
