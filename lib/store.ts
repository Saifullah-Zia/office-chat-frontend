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
  },

  users: [],
  setUsers: (users) => set({ users }),

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
  setConversations: (conversations) => set({ conversations }),
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
      if (current.some((m) => m.id === msg.id)) return s;
      return {
        messagesByConv: {
          ...s.messagesByConv,
          [msg.conversationId]: [...current, msg],
        },
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
