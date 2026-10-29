import { create } from "zustand";
import {
  ConversationResponse,
  MessageResponse,
  UserResponse,
} from "@/types";
import { getUser } from "@/lib/auth";

/**
 * Zustand store for runtime UI state ONLY.
 * Auth is NOT stored here — it lives in localStorage via lib/auth.ts.
 * No persist middleware = no hydration race conditions.
 */

interface AppState {
  // Auth info (read from localStorage on mount, never persisted by Zustand)
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;

  loadUserFromStorage: () => void;

  // Users directory
  users: UserResponse[];
  setUsers: (users: UserResponse[]) => void;

  // Online presence
  onlineUserIds: Set<number>;
  setOnline: (userId: number) => void;
  setOffline: (userId: number) => void;
  initOnline: (ids: number[]) => void;

  // Conversations
  conversations: ConversationResponse[];
  setConversations: (convs: ConversationResponse[]) => void;
  upsertConversation: (conv: ConversationResponse) => void;
  clearUnread: (convId: number) => void;
  decrementUnread: (convId: number) => void;
  incrementUnread: (convId: number) => void;

  // Active conversation
  activeConversationId: number | null;
  setActiveConversation: (id: number | null) => void;

  // Messages
  messagesByConv: Record<number, MessageResponse[]>;
  setMessages: (convId: number, msgs: MessageResponse[]) => void;
  addMessage: (msg: MessageResponse) => void;
  markAllAsReadInConversation: (convId: number) => void;

  // Typing indicators
  typingByConv: Record<number, Set<string>>;
  setTyping: (convId: number, userName: string, isTyping: boolean) => void;

  // Starred messages
  starredMessageIds: Set<number>;
  toggleStarMessage: (id: number) => void;

  // Work presence status (e.g. In a Meeting, Lunch, Focus Mode)
  userStatus: { emoji: string; text: string } | null;
  setUserStatus: (status: { emoji: string; text: string } | null) => void;
  statusesByUserId: Record<number, { emoji: string; text: string }>;
  setStatusForUser: (userId: number, status: { emoji: string; text: string } | null) => void;

  // Global search modal
  isGlobalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;
}

function parseWorkStatus(raw?: string | null): { emoji: string; text: string } | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Extended_Pictographic}|\u2705|\u270A|\u270B|\u270C|\u270D|\u270F|\u2600-\u26FF|\u2700-\u27BF)\s*(.*)$/u);
  if (match) {
    return { emoji: match[1], text: match[2] || "Busy" };
  }
  return { emoji: "💼", text: trimmed };
}

export const useStore = create<AppState>()((set) => ({
  userId: null,
  userName: null,
  userEmail: null,
  userRole: null,

  loadUserFromStorage: () => {
    const user = getUser();
    if (user) {
      set({
        userId: user.userId,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
      });
    }

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("office_user_status");
        const currentId = user ? user.userId : null;
        if (currentId) {
          const savedStarred = localStorage.getItem("office_starred_msgs_" + currentId) || localStorage.getItem("office_starred_msgs");
          if (savedStarred) {
            set({ starredMessageIds: new Set(JSON.parse(savedStarred)) });
          }
          const savedStatus = localStorage.getItem("office_user_status_" + currentId);
          if (savedStatus) {
            const parsed = JSON.parse(savedStatus);
            set((s) => ({
              userStatus: parsed,
              statusesByUserId: { ...s.statusesByUserId, [currentId]: parsed },
            }));
          } else {
            set({ userStatus: null });
          }
        }
      } catch {}
    }
  },

  users: [],
  setUsers: (users) =>
    set((s) => {
      const nextStatuses = { ...s.statusesByUserId };
      users.forEach((u) => {
        if (u.workStatus) {
          const parsed = parseWorkStatus(u.workStatus);
          if (parsed) nextStatuses[u.id] = parsed;
        }
      });
      return { users, statusesByUserId: nextStatuses };
    }),

  onlineUserIds: new Set<number>(),
  initOnline: (ids) => set({ onlineUserIds: new Set(ids) }),
  setOnline: (userId) =>
    set((s) => ({ onlineUserIds: new Set([...s.onlineUserIds, userId]) })),
  setOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds);
      next.delete(userId);
      return { onlineUserIds: next };
    }),

  conversations: [],
  setConversations: (conversations) =>
    set((s) => {
      const nextStatuses = { ...s.statusesByUserId };
      conversations.forEach((c) => {
        c.members?.forEach((m) => {
          if (m.workStatus) {
            const parsed = parseWorkStatus(m.workStatus);
            if (parsed) nextStatuses[m.id] = parsed;
          }
        });
      });
      return { conversations, statusesByUserId: nextStatuses };
    }),
  upsertConversation: (conv) =>
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conv.id);
      if (exists) {
        return {
          conversations: s.conversations.map((c) =>
            c.id === conv.id ? conv : c,
          ),
        };
      }
      return { conversations: [conv, ...s.conversations] };
    }),
  clearUnread: (convId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, unreadCount: 0 } : c,
      ),
    })),
  decrementUnread: (convId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? { ...c, unreadCount: Math.max(0, c.unreadCount - 1) }
          : c,
      ),
    })),
  incrementUnread: (convId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, unreadCount: c.unreadCount + 1 } : c,
      ),
    })),

  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),

  messagesByConv: {},
  setMessages: (convId, msgs) =>
    set((s) => ({
      messagesByConv: { ...s.messagesByConv, [convId]: msgs },
    })),
  addMessage: (msg) =>
    set((s) => {
      const current = s.messagesByConv[msg.conversationId] ?? [];
      const exists = current.some((m) => m.id === msg.id);
      const updated = exists
        ? current.map((m) => (m.id === msg.id ? msg : m))
        : [...current, msg];

      let preview = msg.content;
      if (msg.deleted) {
        preview = "🚫 This message was deleted";
      } else if (msg.reactionDetails && msg.reactionDetails.length > 0) {
        const latest = msg.reactionDetails[msg.reactionDetails.length - 1];
        const isMe = latest.userId === s.userId;
        const name = isMe ? "You" : latest.userName;
        const snippet = msg.content && msg.content.length > 22 ? `${msg.content.slice(0, 22)}...` : (msg.content || "message");
        preview = `${latest.emoji} ${name} reacted to "${snippet}"`;
      } else if (msg.type === "VOICE" || msg.type === "AUDIO") {
        preview = "🎤 Voice note";
      } else if (msg.type === "IMAGE") {
        preview = "📷 Photo";
      } else if (msg.type === "FILE") {
        preview = "📁 File";
      }

      const updatedConvs = s.conversations.map((c) =>
        c.id === msg.conversationId
          ? { ...c, lastMessagePreview: preview, lastMessageAt: msg.createdAt }
          : c
      );

      return {
        messagesByConv: {
          ...s.messagesByConv,
          [msg.conversationId]: updated,
        },
        conversations: updatedConvs,
      };
    }),
  markAllAsReadInConversation: (convId) =>
    set((s) => {
      const current = s.messagesByConv[convId] ?? [];
      const updated = current.map((m) => ({ ...m, read: true, delivered: true }));
      return {
        messagesByConv: { ...s.messagesByConv, [convId]: updated },
      };
    }),

  typingByConv: {},
  setTyping: (convId, userName, isTyping) =>
    set((s) => {
      const set_ = new Set(s.typingByConv[convId] ?? []);
      if (isTyping) set_.add(userName);
      else set_.delete(userName);
      return { typingByConv: { ...s.typingByConv, [convId]: set_ } };
    }),

  starredMessageIds: new Set<number>(),
  toggleStarMessage: (id) =>
    set((s) => {
      const next = new Set(s.starredMessageIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("office_starred_msgs", JSON.stringify(Array.from(next)));
        } catch {}
      }
      return { starredMessageIds: next };
    }),

  userStatus: null,
  statusesByUserId: {},
  setStatusForUser: (userId, status) =>
    set((s) => {
      const next = { ...s.statusesByUserId };
      if (status) next[userId] = status;
      else delete next[userId];
      return { statusesByUserId: next };
    }),

  setUserStatus: (status) => {
    const currentUserId = useStore.getState().userId;
    if (typeof window !== "undefined" && currentUserId) {
      try {
        const key = "office_user_status_" + currentUserId;
        if (status) localStorage.setItem(key, JSON.stringify(status));
        else localStorage.removeItem(key);
      } catch {}
    }
    set((s) => ({
      userStatus: status,
      statusesByUserId: currentUserId
        ? status
          ? { ...s.statusesByUserId, [currentUserId]: status }
          : (() => {
              const next = { ...s.statusesByUserId };
              delete next[currentUserId];
              return next;
            })()
        : s.statusesByUserId,
    }));
  },

  isGlobalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
}));

// ── Selectors ───────────────────────────────────────────────────────────
const EMPTY_MESSAGES: MessageResponse[] = [];
const EMPTY_TYPING = new Set<string>();

export const selectConversations = (s: AppState) => s.conversations;
export const selectActiveConversation = (s: AppState) =>
  s.conversations.find((c) => c.id === s.activeConversationId) ?? null;
export const selectMessages = (convId: number) => (s: AppState) =>
  s.messagesByConv[convId] ?? EMPTY_MESSAGES;
export const selectTyping = (convId: number) => (s: AppState) =>
  s.typingByConv[convId] ?? EMPTY_TYPING;
export const selectIsOnline = (userId: number) => (s: AppState) =>
  s.onlineUserIds.has(userId);
