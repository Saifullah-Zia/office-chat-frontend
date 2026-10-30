"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Phone, Video, Send, Paperclip, Mic, X, Loader2, Users, Search, Smile, Info, CornerDownRight, Vote, Pin, ChevronRight,
  ChevronDown, Clock, ChevronLeft, Timer, Plus,
} from "lucide-react";
import { ScheduleMessageModal, formatWhen } from "./PlannerModals";
import ThreadPanel from "./ThreadPanel";
import { showToast } from "@/lib/toast";
import { formatLastSeen } from "@/lib/time";
import { useStore } from "@/lib/store";
import { apiGet, apiPost, apiPostForm, apiDelete } from "@/lib/api";
import {
  ConversationResponse, MessageResponse, MessageRequest, ScheduledMessageView,
  AttachmentResponse, TypingEvent, TypingRequest, MemberResponse,
} from "@/types";
import { subscribe, publish, Topics, Destinations } from "@/lib/socket";
import MessageBubble from "./MessageBubble";
import VoiceRecorder from "./VoiceRecorder";
import Avatar from "./Avatar";
import EmojiPicker from "./EmojiPicker";
import ChatInfoDrawer from "./ChatInfoDrawer";
import CreatePollModal from "./CreatePollModal";
import { useCallContext } from "@/context/CallContext";
import { playMessageChime } from "@/lib/sound";
import { desktopNotify } from "@/lib/notify";

const EMPTY_MESSAGES: MessageResponse[] = [];
const PAGE_SIZE = 30;
const EMPTY_TYPING = new Set<string>();

interface ChatWindowProps {
  conversationId: number;
}

function formatDateHeader(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function ChatWindow({ conversationId }: ChatWindowProps) {
  const userId = useStore((s) => s.userId);
  const userName = useStore((s) => s.userName);
  const conversations = useStore((s) => s.conversations);
  const activeConv = conversations.find((c) => c.id === conversationId);

  const selectConvMessages = useCallback(
    (s: { messagesByConv: Record<number, MessageResponse[]> }) =>
      s.messagesByConv[conversationId] ?? EMPTY_MESSAGES,
    [conversationId]
  );
  const messages = useStore(selectConvMessages);
  const setMessages = useStore((s) => s.setMessages);
  const addMessage = useStore((s) => s.addMessage);

  const onlineUserIds = useStore((s) => s.onlineUserIds);
  const statusesByUserId = useStore((s) => s.statusesByUserId);

  const selectConvTyping = useCallback(
    (s: { typingByConv: Record<number, Set<string>> }) =>
      s.typingByConv[conversationId] ?? EMPTY_TYPING,
    [conversationId]
  );
  const typingUsers = useStore(selectConvTyping);
  const setTyping = useStore((s) => s.setTyping);

  const { initiateCall, initiateGroupCall, inCall } = useCallContext();

  const [text, setText] = useState(() => useStore.getState().drafts[conversationId] ?? "");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [threadRootId, setThreadRootId] = useState<number | null>(null);
  const [isComposerMenuOpen, setIsComposerMenuOpen] = useState(false);
  const hasDraftToSend = !!text.trim() || selectedFiles.length > 0;
  const [scheduledHere, setScheduledHere] = useState<ScheduledMessageView[]>([]);
  const [showScheduledList, setShowScheduledList] = useState(false);
  // Lets the history loader (declared earlier) call jumpToMessage (declared later).
  const jumpToMessageRef = useRef<((id: number) => void) | null>(null);
  const setDraft = useStore((s) => s.setDraft);
  const requestEdit = useStore((s) => s.requestEdit);
  const [replyMessage, setReplyMessage] = useState<MessageResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Drawer State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(0);

  const userRole = useStore((s) => s.userRole);
  const isConvAdmin =
    userRole === "ADMIN" ||
    (activeConv?.adminIds
      ? userId !== null && activeConv.adminIds.includes(userId)
      : !!activeConv?.members.some((m) => m.id === userId && m.role === "ADMIN"));
  const isReadOnly = (activeConv?.onlyAdminsCanPost || activeConv?.isAnnouncement) && !isConvAdmin;
  const isBlocked = !!(activeConv?.blockedByMe || activeConv?.blockedMe);
  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // History paging, unread line & jump-to-latest
  const prependMessages = useStore((s) => s.prependMessages);
  const lastSeenByUserId = useStore((s) => s.lastSeenByUserId);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [unreadAnchor, setUnreadAnchor] = useState<{ id: number; count: number } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const hasMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const lastMsgIdRef = useRef<number | null>(null);
  const initialScrollRef = useRef(false);
  const restoreScrollRef = useRef<{ height: number; top: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState<number>(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine other member info for direct chats
  const otherMember: MemberResponse | undefined = useMemo(() => {
    if (activeConv?.type === "DIRECT") {
      return activeConv.members.find((m) => m.id !== userId);
    }
    return undefined;
  }, [activeConv, userId]);

  const title = useMemo(() => {
    if (activeConv?.type === "GROUP") return activeConv.name ?? "Group Chat";
    return otherMember?.name ?? "Direct Message";
  }, [activeConv, otherMember]);

  const isOnline = otherMember ? onlineUserIds.has(otherMember.id) : false;

  // Filter messages by search query if search is open
  const filteredMessages = useMemo(() => {
    if (!isSearchOpen || !searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q)
    );
  }, [messages, isSearchOpen, searchQuery]);

  // Load message history & mark conversation read
  useEffect(() => {
    if (!conversationId || isNaN(conversationId)) return;
    setIsLoading(true);
    setHasMore(false);
    hasMoreRef.current = false;
    setUnreadAnchor(null);
    setNewWhileAway(0);
    setShowJump(false);
    isAtBottomRef.current = true;
    lastMsgIdRef.current = null;

    // Capture the unread count before clearing it, to place the "unread messages" line.
    const unreadAtOpen =
      useStore.getState().conversations.find((c) => c.id === conversationId)?.unreadCount ?? 0;
    useStore.getState().clearUnread(conversationId);
    apiPost(`/api/conversations/${conversationId}/read`).catch(() => {});

    apiGet<MessageResponse[]>(`/api/conversations/${conversationId}/messages`, { size: PAGE_SIZE })
      .then((msgs) => {
        setMessages(conversationId, msgs);
        const more = msgs.length === PAGE_SIZE;
        setHasMore(more);
        hasMoreRef.current = more;
        if (unreadAtOpen > 0) {
          const fromOthers = msgs.filter((m) => m.senderId !== userId);
          const first = fromOthers.slice(-unreadAtOpen)[0];
          if (first) setUnreadAnchor({ id: first.id, count: unreadAtOpen });
        }
        initialScrollRef.current = true;
        setIsLoading(false);

        // Opened from search / mentions / tasks / reminders: scroll to that message.
        const jump = useStore.getState().pendingJump;
        if (jump && jump.conversationId === conversationId) {
          useStore.getState().clearPendingJump();
          setTimeout(() => jumpToMessageRef.current?.(jump.messageId), 120);
        }
      })
      .catch((err) => {
        console.error("Failed to load messages:", err);
        setIsLoading(false);
      });

    apiGet<ScheduledMessageView[]>("/api/scheduled", { conversationId })
      .then(setScheduledHere)
      .catch(() => {});
  }, [conversationId, setMessages, userId]);

  // Load the page of messages older than the oldest one on screen.
  const loadOlder = async (): Promise<boolean> => {
    if (loadingOlderRef.current || !hasMoreRef.current) return false;
    const current = useStore.getState().messagesByConv[conversationId] ?? [];
    if (current.length === 0) return false;

    loadingOlderRef.current = true;
    setIsLoadingOlder(true);
    try {
      const older = await apiGet<MessageResponse[]>(`/api/conversations/${conversationId}/messages`, {
        size: PAGE_SIZE,
        before: current[0].id,
      });
      const more = older.length === PAGE_SIZE;
      hasMoreRef.current = more;
      setHasMore(more);
      if (older.length > 0) {
        const body = bodyRef.current;
        restoreScrollRef.current = body ? { height: body.scrollHeight, top: body.scrollTop } : null;
        prependMessages(conversationId, older);
      }
      return older.length > 0;
    } catch (err) {
      console.error("Failed to load older messages:", err);
      return false;
    } finally {
      loadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  };

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    setNewWhileAway(0);
  };

  const handleBodyScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    isAtBottomRef.current = atBottom;
    setShowJump(!atBottom);
    if (atBottom) setNewWhileAway(0);
    if (body.scrollTop < 120 && !(isSearchOpen && searchQuery)) loadOlder();
  };

  // Keep the viewport steady when older messages are added above it,
  // and do the initial jump (to the unread line, or the bottom) after first render.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    if (restoreScrollRef.current) {
      const { height, top } = restoreScrollRef.current;
      body.scrollTop = body.scrollHeight - height + top;
      restoreScrollRef.current = null;
      return;
    }

    if (initialScrollRef.current && !isLoading) {
      initialScrollRef.current = false;
      const anchorEl = unreadAnchor ? document.getElementById(`msg-${unreadAnchor.id}`) : null;
      if (anchorEl) anchorEl.scrollIntoView({ block: "start" });
      else body.scrollTop = body.scrollHeight;
      lastMsgIdRef.current = messages[messages.length - 1]?.id ?? null;
    }
  }, [messages, isLoading, unreadAnchor]);

  // Subscribe to realtime conversation updates & typing events via STOMP
  useEffect(() => {
    if (!conversationId) return;
    let subMsg: { unsubscribe: () => void } | null = null;
    let subTyping: { unsubscribe: () => void } | null = null;
    let subRead: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        subMsg = await subscribe(Topics.conversation(conversationId), (frame) => {
          const msg: MessageResponse = JSON.parse(frame.body);
          addMessage(msg);
          if (msg.senderId !== userId) {
            const isMuted = activeConv?.mutedUntil && new Date(activeConv.mutedUntil).getTime() > Date.now();
            if (!isMuted) {
              playMessageChime();
              desktopNotify(msg.senderName, msg.content || "Sent an attachment", { tag: `conv-${msg.conversationId}` });
            }
          }
        });

        subTyping = await subscribe(Topics.typing(conversationId), (frame) => {
          const ev: TypingEvent = JSON.parse(frame.body);
          if (ev.userId !== userId) {
            setTyping(conversationId, ev.userName, ev.typing);
          }
        });

        subRead = await subscribe(`/topic/conversation.${conversationId}.read`, (frame) => {
          const ev = JSON.parse(frame.body);
          if (ev.userId !== userId) {
            useStore.getState().markAllAsReadInConversation(conversationId);
          }
        });
      } catch (err) {
        console.error("STOMP conversation subscription error:", err);
      }
    })();

    return () => {
      subMsg?.unsubscribe();
      subTyping?.unsubscribe();
      subRead?.unsubscribe();
    };
  }, [conversationId, userId, addMessage, setTyping]);

  // Refresh this chat's block state when either side blocks/unblocks
  useEffect(() => {
    if (!conversationId || !userId) return;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        sub = await subscribe("/topic/user.block", (frame) => {
          const ev: { blockerId: number; blockedId: number } = JSON.parse(frame.body);
          if (ev.blockerId !== userId && ev.blockedId !== userId) return;
          apiGet<ConversationResponse>(`/api/conversations/${conversationId}`)
            .then((conv) => useStore.getState().upsertConversation(conv))
            .catch(() => {});
        });
      } catch (err) {
        console.error("STOMP block subscription error:", err);
      }
    })();
    return () => sub?.unsubscribe();
  }, [conversationId, userId]);

  const jumpToMessage = async (messageId: number) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    const nextFrame = () => new Promise((r) => setTimeout(r, 50));
    await nextFrame(); // let the full (unfiltered) list render

    // Starred messages can be older than what's loaded — page back until we find it.
    let el = document.getElementById(`msg-${messageId}`);
    for (let i = 0; !el && i < 30; i++) {
      if (!(await loadOlder())) break;
      await nextFrame();
      el = document.getElementById(`msg-${messageId}`);
    }
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("cw-msg-anchor--flash");
    setTimeout(() => el?.classList.remove("cw-msg-anchor--flash"), 1600);
  };
  useEffect(() => {
    jumpToMessageRef.current = jumpToMessage;
  });

  // New message at the bottom: follow it if we're at the bottom (or sent it), else count it.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || isLoading || last.id === lastMsgIdRef.current) return;
    const isNew = lastMsgIdRef.current !== null;
    lastMsgIdRef.current = last.id;
    if (!isNew) return;

    if (isAtBottomRef.current || last.senderId === userId) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setNewWhileAway((n) => n + 1);
    }
  }, [messages, isLoading, userId]);

  // Keep the typing indicator visible only when already at the bottom
  useEffect(() => {
    if (typingUsers.size > 0 && isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [typingUsers]);

  // Handle Typing Notification
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const members = activeConv?.members ?? [];
    const list: { id: number | string; name: string; isSpecial?: boolean; sub?: string }[] = [];

    if (activeConv?.type === "GROUP") {
      list.push({ id: "all", name: "all", isSpecial: true, sub: "Notify everyone in this channel" });
      list.push({ id: "here", name: "here", isSpecial: true, sub: "Notify active colleagues" });
    }

    members.forEach((m) => {
      if (m.id !== userId) {
        list.push({ id: m.id, name: m.name, sub: m.department || m.email });
      }
    });

    return list.filter((c) => c.name.toLowerCase().includes(mentionQuery));
  }, [mentionQuery, activeConv, userId]);

  const insertMention = (name: string) => {
    const val = text;
    const cursorPos = inputRef.current?.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const textAfter = val.slice(cursorPos);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex !== -1) {
      const newText = textBefore.slice(0, atIndex) + "@" + name + " " + textAfter;
      setText(newText);
      setMentionQuery(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && mentionCandidates.length === 0 && !text && editLastOwnMessage()) {
      e.preventDefault();
      return;
    }
    if (mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
  };

  const notifyTyping = useCallback((isTyping: boolean) => {
    publish(Destinations.typing(conversationId), {
      conversationId,
      userId: userId ?? 0,
      userName: userName ?? "User",
      typing: isTyping,
    } satisfies TypingRequest).catch(() => {});
  }, [conversationId, userId, userName]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart ?? val.length;
    setText(val);
    notifyTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      notifyTyping(false);
    }, 2500);

    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9_\-\.]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  // Persist the composer text as this chat's draft
  useEffect(() => {
    setDraft(conversationId, text);
  }, [conversationId, text, setDraft]);

  const MAX_FILES = 10;
  const addFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...Array.from(files)].slice(0, MAX_FILES));
  };

  // Handle Send Message — each file becomes its own message; the text rides on the first one.
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let trimmed = text.trim();
    if ((!trimmed && selectedFiles.length === 0) || isUploading) return;

    if (replyMessage) {
      trimmed = `Replying to ${replyMessage.senderName}: "${replyMessage.content.slice(0, 40)}..."\n${trimmed}`;
    }

    const attachmentIds: number[] = [];
    if (selectedFiles.length > 0) {
      setIsUploading(true);
      try {
        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("conversationId", conversationId.toString());
          const att = await apiPostForm<AttachmentResponse>("/api/files/upload", formData);
          attachmentIds.push(att.id);
        }
      } catch (err) {
        console.error("Failed to upload file:", err);
        alert("A file failed to upload. Nothing was sent.");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const payloads: MessageRequest[] =
      attachmentIds.length === 0
        ? [{ conversationId, content: trimmed }]
        : attachmentIds.map((attachmentId, i) => ({
            conversationId,
            content: i === 0 ? trimmed : "",
            attachmentId,
          }));

    setText("");
    setSelectedFiles([]);
    setReplyMessage(null);
    notifyTyping(false);

    for (const payload of payloads) {
      try {
        const sent = await apiPost<MessageResponse>(`/api/conversations/${conversationId}/messages`, payload);
        addMessage(sent);
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    }
  };

  // ── Drag & drop / paste files ──────────────────────────────────────
  const canCompose = !isReadOnly && !isBlocked;
  const handleDragEnter = (e: React.DragEvent) => {
    if (!canCompose || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  // ── Keyboard shortcuts scoped to the open chat ─────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      if (e.key === "Escape") {
        if (document.querySelector('[role="dialog"]')) return; // let open dialogs handle it
        if (showEmojiPicker) setShowEmojiPicker(false);
        else if (replyMessage) setReplyMessage(null);
        else if (isSearchOpen) { setIsSearchOpen(false); setSearchQuery(""); }
        else if (isDrawerOpen) setIsDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showEmojiPicker, replyMessage, isSearchOpen, isDrawerOpen]);

  // ↑ in an empty composer edits your last text message (if still inside the 15-minute window)
  const editLastOwnMessage = () => {
    // Only called from a keydown handler, never during render.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 15 * 60 * 1000;
    const last = [...messages].reverse().find(
      (m) => m.senderId === userId && !m.deleted && m.type === "TEXT" && new Date(m.createdAt).getTime() > cutoff
    );
    if (!last) return false;
    requestEdit(last.id);
    jumpToMessage(last.id);
    return true;
  };

  const handleSendVoiceMessage = async (req: MessageRequest) => {
    try {
      const payload: MessageRequest = {
        conversationId,
        ...req,
      };
      const sent = await apiPost<MessageResponse>(`/api/conversations/${conversationId}/messages`, payload);
      addMessage(sent);
    } catch (err) {
      console.error("Failed to send voice message:", err);
    }
  };

  const typingArray = Array.from(typingUsers);

  // Group filtered messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; msgs: MessageResponse[] }[] = [];
    let currentDate = "";

    filteredMessages.forEach((msg) => {
      const dateStr = formatDateHeader(msg.createdAt);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({ date: dateStr, msgs: [msg] });
      } else {
        groups[groups.length - 1].msgs.push(msg);
      }
    });

    return groups;
  }, [filteredMessages]);

  // ── Tab Badge: update document.title with total unread count ────
  const totalUnread = useStore((s) =>
    s.conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)
  );
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? "99+" : totalUnread}) Office Chat` : "Office Chat";
  }, [totalUnread]);

  // Reset unread on tab focus
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && conversationId) {
        useStore.getState().clearUnread(conversationId);
        apiPost(`/api/conversations/${conversationId}/read`).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [conversationId]);

  return (
    <div className="cw-root">
      <div
        className="cw-shell"
        onDragEnter={handleDragEnter}
        onDragOver={(e) => { if (isDragging) e.preventDefault(); }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="cw-drop-overlay">
            <Paperclip size={28} />
            <span>Drop files to attach (up to {MAX_FILES})</span>
          </div>
        )}
        {/* Top Header */}
        <header className="cw-header">
          <button
            type="button"
            className="cw-back-btn"
            aria-label="Back to chats"
            onClick={() => useStore.getState().setActiveConversation(null)}
          >
            <ChevronLeft size={22} />
          </button>
          <div
            className="cw-header-left cw-header-left--clickable"
            role="button"
            tabIndex={0}
            title={activeConv?.type === "GROUP" ? "Group info" : "Contact info"}
            onClick={() => { setThreadRootId(null); setIsDrawerOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setIsDrawerOpen(true);
            }}
          >
            {activeConv?.type === "GROUP" ? (
              <div className="cw-group-avatar">
                <Users size={20} />
              </div>
            ) : (
              <Avatar name={title} src={otherMember?.profilePicUrl} size={40} online={isOnline} />
            )}

            <div className="cw-header-info">
              <h1 className="cw-title">{title}</h1>
              <span className="cw-status">
                {activeConv?.retentionDays ? (
                  <span className="cw-retention-tag" title={`Disappearing messages: ${activeConv.retentionDays === 1 ? "24 hours" : `${activeConv.retentionDays} days`}`}>
                    <Timer size={12} /> {activeConv.retentionDays === 1 ? "24h" : `${activeConv.retentionDays}d`}
                  </span>
                ) : null}
                {activeConv?.type === "GROUP"
                  ? `${activeConv.members.length} members: ${activeConv.members.map((m) => m.name).join(", ")}`
                  : isOnline
                  ? "Online"
                  : formatLastSeen(otherMember ? lastSeenByUserId[otherMember.id] ?? otherMember.lastSeenAt : null)}
              </span>
            </div>
          </div>

          <div className="cw-header-actions">
            {/* In-Chat Search Bar Toggle */}
            <button
              className={`cw-action-btn ${isSearchOpen ? "cw-action-btn--active" : ""}`}
              title="Search in conversation"
              onClick={() => {
                setIsSearchOpen(!isSearchOpen);
                if (isSearchOpen) setSearchQuery("");
              }}
            >
              <Search size={18} />
            </button>

            {activeConv?.type === "GROUP" && !isReadOnly && (
              <>
                <button
                  className="cw-action-btn"
                  title="Start group voice call"
                  disabled={inCall}
                  onClick={() =>
                    initiateGroupCall(conversationId, title, activeConv.members.map((m) => m.id), "AUDIO")
                  }
                >
                  <Phone size={18} />
                </button>
                <button
                  className="cw-action-btn cw-action-btn--primary"
                  title="Start group video call"
                  disabled={inCall}
                  onClick={() =>
                    initiateGroupCall(conversationId, title, activeConv.members.map((m) => m.id), "VIDEO")
                  }
                >
                  <Video size={18} />
                </button>
              </>
            )}

            {activeConv?.type === "DIRECT" && otherMember && !isBlocked && (
              <>
                <button
                  className="cw-action-btn"
                  title="Start voice call"
                  onClick={() =>
                    initiateCall(conversationId, otherMember.id, otherMember.name, "AUDIO")
                  }
                >
                  <Phone size={18} />
                </button>
                <button
                  className="cw-action-btn cw-action-btn--primary"
                  title="Start video call"
                  onClick={() =>
                    initiateCall(conversationId, otherMember.id, otherMember.name, "VIDEO")
                  }
                >
                  <Video size={18} />
                </button>
              </>
            )}

            {/* Info Drawer Toggle */}
            <button
              className={`cw-action-btn ${isDrawerOpen ? "cw-action-btn--active" : ""}`}
              title="View details"
              onClick={() => { setThreadRootId(null); setIsDrawerOpen(!isDrawerOpen); }}
            >
              <Info size={18} />
            </button>
          </div>
        </header>

        {/* In-Chat Search Sub-Header Bar */}
        {isSearchOpen && (
          <div className="cw-search-subbar">
            <Search size={15} className="cw-search-subicon" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cw-search-subinput"
              autoFocus
            />
            {searchQuery && (
              <span className="cw-search-count">
                {filteredMessages.length} match{filteredMessages.length !== 1 ? "es" : ""}
              </span>
            )}
            <button
              type="button"
              className="cw-search-subclose"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Pinned Messages Banner */}
        {pinnedMessages.length > 0 && (
          <div className="cw-pinned-banner">
            <Pin size={15} className="cw-pinned-icon" />
            <div className="cw-pinned-content">
              <span className="cw-pinned-title">Pinned Message</span>
              <span className="cw-pinned-text">
                {pinnedMessages[pinnedIndex % pinnedMessages.length].senderName}:{" "}
                {pinnedMessages[pinnedIndex % pinnedMessages.length].content || "Attachment"}
              </span>
            </div>
            {pinnedMessages.length > 1 && (
              <button
                type="button"
                className="cw-pinned-next"
                onClick={() => setPinnedIndex((prev) => (prev + 1) % pinnedMessages.length)}
              >
                {pinnedMessages.length} pinned <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}

        {/* Message History Area */}
        <div className="cw-body" ref={bodyRef} onScroll={handleBodyScroll}>
          {!isLoading && filteredMessages.length > 0 && !(isSearchOpen && searchQuery) && (
            <div className="cw-history-edge">
              {isLoadingOlder ? (
                <span className="cw-history-loading"><Loader2 size={14} className="spin" /> Loading older messages…</span>
              ) : hasMore ? (
                <button type="button" className="cw-history-btn" onClick={() => loadOlder()}>
                  Load older messages
                </button>
              ) : (
                <span className="cw-history-start">Start of conversation</span>
              )}
            </div>
          )}
          {isLoading ? (
            /* ── Skeleton Loading State ── */
            <div className="cw-skeleton-container">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`cw-skeleton-row ${i % 2 === 0 ? "cw-skeleton-row--left" : "cw-skeleton-row--right"}`}>
                  {i % 2 === 0 && <div className="skeleton skeleton-circle" style={{ width: 32, height: 32, flexShrink: 0 }} />}
                  <div className="cw-skeleton-bubble">
                    <div className="skeleton skeleton-text--lg" style={{ width: `${60 + Math.random() * 40}%` }} />
                    <div className="skeleton skeleton-text" style={{ width: `${40 + Math.random() * 30}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="cw-empty">
              <div className="cw-empty-icon">
                <Users size={32} />
              </div>
              <p className="cw-empty-title">
                {isSearchOpen && searchQuery ? "No matching messages" : "Start the conversation"}
              </p>
              <p className="cw-empty-sub">
                {isSearchOpen && searchQuery
                  ? "Try searching for a different word"
                  : "Send a message to kick off the chat!"}
              </p>
            </div>
          ) : (
            groupedMessages.map((group, gIdx) => (
              <div key={gIdx} className="cw-date-group">
                <div className="cw-date-divider">
                  <span>{group.date}</span>
                </div>
                {group.msgs.map((msg) => (
                  <div key={msg.id} id={`msg-${msg.id}`} className="cw-msg-anchor">
                    {unreadAnchor?.id === msg.id && (
                      <div className="cw-unread-divider">
                        <span>
                          {unreadAnchor.count} unread message{unreadAnchor.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      isMine={msg.senderId === userId}
                      onReply={(m) => setReplyMessage(m)}
                      onOpenThread={(m) => { setIsDrawerOpen(false); setThreadRootId(m.id); }}
                    />
                  </div>
                ))}
              </div>
            ))
          )}

          {/* Typing indicator */}
          {typingArray.length > 0 && (
            <div className="cw-typing">
              <Avatar name={typingArray[0]} size={22} />
              <span className="cw-typing-dots">
                <span />
                <span />
                <span />
              </span>
              <span className="cw-typing-text">
                {typingArray.join(", ")} {typingArray.length === 1 ? "is" : "are"} typing...
              </span>
            </div>
          )}

          <div ref={bottomRef} />

          {showJump && !isLoading && (
            <button
              type="button"
              className="cw-jump-btn"
              onClick={() => scrollToBottom()}
              title="Jump to latest"
              aria-label="Jump to latest message"
            >
              {newWhileAway > 0 && <span className="cw-jump-badge">{newWhileAway}</span>}
              <ChevronDown size={20} />
            </button>
          )}
        </div>

        {/* Scheduled messages for this chat */}
        {scheduledHere.length > 0 && (
          <div className="cw-scheduled-bar">
            <button type="button" className="cw-scheduled-toggle" onClick={() => setShowScheduledList((v) => !v)}>
              <Clock size={14} /> {scheduledHere.length} scheduled message{scheduledHere.length !== 1 ? "s" : ""}
              <ChevronDown size={14} style={{ transform: showScheduledList ? "rotate(180deg)" : undefined }} />
            </button>
            {showScheduledList && (
              <ul className="cw-scheduled-list">
                {scheduledHere.map((s) => (
                  <li key={s.id}>
                    <div>
                      <span className="cw-scheduled-when">{formatWhen(s.sendAt)}</span>
                      <span className="cw-scheduled-text">{s.content}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiDelete(`/api/scheduled/${s.id}`).catch(() => {});
                        setScheduledHere((list) => list.filter((x) => x.id !== s.id));
                      }}
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="cw-input-area">
          {/* Reply Quote Bar */}
          {replyMessage && (
            <div className="cw-reply-pill">
              <CornerDownRight size={14} className="cw-reply-icon" />
              <div className="cw-reply-info">
                <span className="cw-reply-sender">Replying to {replyMessage.senderName}</span>
                <span className="cw-reply-text">{replyMessage.content}</span>
              </div>
              <button
                type="button"
                className="cw-reply-remove"
                onClick={() => setReplyMessage(null)}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Selected files preview pills */}
          {selectedFiles.length > 0 && (
            <div className="cw-file-pills">
              {selectedFiles.map((file, i) => (
                <div key={`${file.name}-${i}`} className="cw-file-pill">
                  <Paperclip size={14} />
                  <span className="cw-file-name">{file.name}</span>
                  <button
                    type="button"
                    className="cw-file-remove"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setSelectedFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeConv?.blockedByMe ? (
            <div className="cw-readonly-bar">
              You blocked {otherMember?.name ?? "this contact"}.{" "}
              <button type="button" className="cw-readonly-link" onClick={() => { setThreadRootId(null); setIsDrawerOpen(true); }}>
                Unblock from contact info
              </button>
            </div>
          ) : activeConv?.blockedMe ? (
            <div className="cw-readonly-bar">
              🚫 You can&apos;t send messages to this contact
            </div>
          ) : isReadOnly ? (
            <div className="cw-readonly-bar">
              🔒 Only administrators can send messages in this channel
            </div>
          ) : isRecordingVoice ? (
            <VoiceRecorder
              conversationId={conversationId}
              onSendVoiceMessage={handleSendVoiceMessage}
              onCancel={() => setIsRecordingVoice(false)}
            />
          ) : (
            <form onSubmit={handleSend} className="cw-form">
              <input
                type="file"
                multiple
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = ""; // allow picking the same file again
                }}
              />

              {/* Phones: one "+" button holds attach / poll / send later */}
              <div className="cw-more cw-mobile-only">
                <button
                  type="button"
                  className={`cw-input-btn cw-more-btn ${isComposerMenuOpen ? "cw-more-btn--open" : ""}`}
                  onClick={() => setIsComposerMenuOpen((v) => !v)}
                  aria-label="More options"
                  aria-expanded={isComposerMenuOpen}
                >
                  <Plus size={22} />
                </button>
                {isComposerMenuOpen && (
                  <>
                    <div className="cw-more-backdrop" onClick={() => setIsComposerMenuOpen(false)} />
                    <div className="cw-more-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setIsComposerMenuOpen(false); fileInputRef.current?.click(); }}>
                        <span className="cw-more-icon cw-more-icon--file"><Paperclip size={18} /></span> Photo or file
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setIsComposerMenuOpen(false); setIsPollModalOpen(true); }}>
                        <span className="cw-more-icon cw-more-icon--poll"><Vote size={18} /></span> Poll
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!text.trim() || selectedFiles.length > 0}
                        onClick={() => { setIsComposerMenuOpen(false); setIsScheduleOpen(true); }}
                      >
                        <span className="cw-more-icon cw-more-icon--later"><Clock size={18} /></span>
                        {text.trim() ? "Send later" : "Send later (type a message first)"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                className="cw-input-btn cw-desktop-only"
                onClick={() => fileInputRef.current?.click()}
                title="Attach File"
              >
                <Paperclip size={20} />
              </button>

              <button
                type="button"
                className="cw-input-btn cw-desktop-only"
                onClick={() => setIsPollModalOpen(true)}
                title="Create Poll"
              >
                <Vote size={20} />
              </button>

              <div className="cw-input-wrapper">
                {/* Mention Popover */}
                {mentionCandidates.length > 0 && (
                  <div className="cw-mention-popover">
                    <div className="cw-mention-header">Mentions</div>
                    {mentionCandidates.map((c, i) => (
                      <button
                        key={String(c.id)}
                        type="button"
                        className={`cw-mention-item ${i === mentionIndex ? "cw-mention-item--active" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertMention(c.name);
                        }}
                      >
                        <div className="cw-mention-left">
                          {c.isSpecial ? (
                            <span style={{ fontSize: "1.1rem" }}>{c.name === "all" ? "📢" : "👋"}</span>
                          ) : (
                            <Avatar name={c.name} size={24} />
                          )}
                          <span className={`cw-mention-name ${c.isSpecial ? "cw-mention-name--special" : ""}`}>
                            @{c.name}
                          </span>
                        </div>
                        {c.sub && <span className="cw-mention-sub">{c.sub}</span>}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  ref={inputRef}
                  type="text"
                  className="cw-text-input"
                  placeholder={`Message ${title}...`}
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={handleInputKeyDown}
                  onPaste={handlePaste}
                />

                {/* Emoji Picker Trigger */}
                <div className="cw-emoji-container">
                  <button
                    type="button"
                    className="cw-input-btn"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    title="Insert Emoji"
                  >
                    <Smile size={20} />
                  </button>

                  {showEmojiPicker && (
                    <EmojiPicker
                      onSelectEmoji={(emoji) => setText((prev) => prev + emoji)}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}
                </div>
              </div>

              {/* Phones show the mic only while there's nothing to send (WhatsApp-style) */}
              <button
                type="button"
                className={`cw-input-btn ${hasDraftToSend ? "cw-desktop-only" : ""}`}
                onClick={() => setIsRecordingVoice(true)}
                title="Record Voice Note"
                aria-label="Record voice note"
              >
                <Mic size={20} />
              </button>

              <button
                type="button"
                className="cw-input-btn cw-desktop-only"
                onClick={() => setIsScheduleOpen(true)}
                disabled={!text.trim() || selectedFiles.length > 0}
                title={selectedFiles.length > 0 ? "Files can't be scheduled yet" : "Send later"}
              >
                <Clock size={19} />
              </button>

              <button
                type="submit"
                disabled={(!text.trim() && selectedFiles.length === 0) || isUploading}
                className={`cw-send-btn ${hasDraftToSend || isUploading ? "" : "cw-desktop-only"}`}
                aria-label="Send message"
              >
                {isUploading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
              </button>
            </form>
          )}
        </div>
      </div>

      {isScheduleOpen && (
        <ScheduleMessageModal
          conversationId={conversationId}
          initialText={text}
          onClose={() => setIsScheduleOpen(false)}
          onScheduled={(s) => {
            setScheduledHere((list) => [...list, s].sort((a, b) => a.sendAt.localeCompare(b.sendAt)));
            setText("");
            setReplyMessage(null);
            showToast(`Scheduled for ${formatWhen(s.sendAt)}`);
          }}
        />
      )}

      {threadRootId !== null && (
        <ThreadPanel
          key={threadRootId}
          conversationId={conversationId}
          rootId={threadRootId}
          canPost={!isReadOnly && !isBlocked}
          onClose={() => setThreadRootId(null)}
        />
      )}

      {/* Sliding Info Right Drawer */}
      {activeConv && isDrawerOpen && threadRootId === null && (
        <ChatInfoDrawer
          key={activeConv.id}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          conversation={activeConv}
          myUserId={userId}
          onlineUserIds={onlineUserIds}
          messages={messages}
          onOpenSearch={() => setIsSearchOpen(true)}
          onJumpToMessage={jumpToMessage}
        />
      )}

      <style>{`
        .cw-root {
          flex: 1; display: flex; height: 100%; min-width: 0; position: relative; overflow: hidden;
        }
        .cw-shell {
          flex: 1; display: flex; flex-direction: column; height: 100%; min-width: 0; background: var(--bg-primary);
          position: relative;
        }
        .cw-drop-overlay {
          position: absolute; inset: 8px; z-index: 40; border: 2px dashed var(--accent); border-radius: 16px;
          background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;
          color: var(--accent); font-weight: 600; pointer-events: none;
        }
        .cw-file-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .cw-scheduled-bar { border-top: 1px solid var(--border); background: var(--bg-primary); padding: 0.35rem 1.5rem; }
        .cw-scheduled-toggle {
          display: inline-flex; align-items: center; gap: 0.35rem; background: none; border: none; cursor: pointer;
          font-size: 0.78rem; font-weight: 600; color: var(--accent); padding: 0.2rem 0;
        }
        .cw-scheduled-list { list-style: none; margin: 0.25rem 0 0.35rem; display: flex; flex-direction: column; gap: 0.3rem; max-height: 160px; overflow-y: auto; }
        .cw-scheduled-list li {
          display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0.6rem;
          border: 1px solid var(--border); border-radius: 8px; background: var(--bg-secondary);
        }
        .cw-scheduled-list li > div { min-width: 0; display: flex; flex-direction: column; }
        .cw-scheduled-when { font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
        .cw-scheduled-text { font-size: 0.8rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-scheduled-list button {
          border: 1px solid var(--border); background: var(--bg-primary); color: var(--danger); font-size: 0.72rem;
          font-weight: 600; padding: 0.25rem 0.55rem; border-radius: 6px; cursor: pointer; flex-shrink: 0;
        }
        .cw-input-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .cw-header {
          height: 64px; padding: 0 1.5rem; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          background: var(--bg-primary); flex-shrink: 0;
        }
        .cw-header-left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
        .cw-back-btn { display: none; background: none; border: none; color: var(--text-secondary); padding: 0.3rem; margin-left: -0.5rem; cursor: pointer; border-radius: 8px; }
        @media (max-width: 768px) {
          .cw-back-btn { display: flex; }
          .cw-header { padding: 0 0.75rem; gap: 0.25rem; }
          .cw-body { padding: 0.75rem; }
          .cw-header-actions { gap: 0.15rem; }
          .cw-status { max-width: 40vw; }
        }
        .cw-retention-tag { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--accent); margin-right: 0.35rem; }
        .cw-header-left--clickable { cursor: pointer; border-radius: 10px; padding: 0.25rem 0.5rem 0.25rem 0.25rem; margin-left: -0.25rem; }
        .cw-header-left--clickable:hover { background: var(--bg-secondary); }
        .cw-msg-anchor { display: flex; flex-direction: column; border-radius: 12px; transition: background 0.4s; }
        .cw-msg-anchor--flash { background: var(--accent-soft); }
        .cw-history-edge { display: flex; justify-content: center; padding: 0.25rem 0 0.5rem; }
        .cw-history-btn {
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: 999px;
          padding: 0.3rem 0.85rem; font-size: 0.75rem; font-weight: 600; color: var(--accent); cursor: pointer;
        }
        .cw-history-btn:hover { background: var(--accent-soft); }
        .cw-history-loading, .cw-history-start {
          display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--text-faint);
        }
        .cw-unread-divider {
          display: flex; justify-content: center; margin: 0.75rem 0;
          background: var(--accent-soft); border-radius: 8px; padding: 0.3rem 0;
        }
        .cw-unread-divider span {
          font-size: 0.72rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em;
        }
        .cw-jump-btn {
          position: sticky; bottom: 0.5rem; align-self: flex-end; margin-top: -42px; flex-shrink: 0;
          width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--border);
          background: var(--bg-primary); color: var(--text-secondary); box-shadow: var(--shadow-md, 0 4px 14px rgba(0,0,0,0.15));
          display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 5;
        }
        .cw-jump-btn:hover { color: var(--accent); }
        .cw-jump-badge {
          position: absolute; top: -6px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px;
          border-radius: 999px; background: var(--accent); color: #fff; font-size: 0.6875rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }
        .cw-readonly-link {
          background: none; border: none; padding: 0; color: var(--accent); font-weight: 600;
          cursor: pointer; font-size: inherit;
        }
        .cw-group-avatar {
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg, var(--accent-muted), var(--accent-deep));
          color: var(--accent); display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .cw-header-info { display: flex; flex-direction: column; min-width: 0; }
        .cw-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-status { font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-header-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
        .cw-action-btn {
          width: 36px; height: 36px; border-radius: 8px; background: var(--bg-tertiary);
          color: var(--text-tertiary); display: flex; align-items: center; justify-content: center;
          transition: background 0.15s; border: none; cursor: pointer;
        }
        .cw-action-btn:hover:not(:disabled) { background: var(--bg-inset); color: var(--text-primary); }
        .cw-action-btn--active { background: var(--accent-muted); color: var(--accent); }
        .cw-action-btn--primary { background: var(--accent-muted); color: var(--accent); }
        .cw-action-btn--primary:hover:not(:disabled) { background: var(--accent-deep); }

        .cw-search-subbar {
          display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem;
          background: var(--bg-secondary); border-bottom: 1px solid var(--border); position: relative;
        }
        .cw-search-subicon { color: var(--text-faint); }
        .cw-search-subinput {
          flex: 1; border: none; background: none; font-size: 0.84375rem; color: var(--text-primary); outline: none;
        }
        .cw-search-count { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }
        .cw-search-subclose { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; }

        .cw-pinned-banner {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.5rem 1.25rem; background: var(--surface-card);
          border-bottom: 1px solid var(--border); z-index: 5;
        }
        .cw-pinned-icon { color: var(--accent); flex-shrink: 0; }
        .cw-pinned-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cw-pinned-title { font-size: 0.6875rem; font-weight: 700; color: var(--accent); text-transform: uppercase; }
        .cw-pinned-text {
          font-size: 0.8125rem; color: var(--text-primary); font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cw-pinned-next {
          background: var(--bg-secondary); border: 1px solid var(--border);
          color: var(--text-muted); padding: 0.25rem 0.6rem; border-radius: 999px;
          font-size: 0.72rem; font-weight: 600; cursor: pointer;
          display: flex; align-items: center; gap: 0.25rem;
        }
        .cw-search-subclose:hover { color: var(--text-primary); }

        .cw-body {
          flex: 1; overflow-y: auto; overflow-x: hidden; padding: 1.5rem;
          display: flex; flex-direction: column; background: var(--chat-wallpaper, var(--bg-secondary));
        }

        /* Skeleton loading */
        .cw-skeleton-container { display: flex; flex-direction: column; gap: 1.25rem; padding: 1rem 0; }
        .cw-skeleton-row { display: flex; align-items: flex-end; gap: 0.5rem; }
        .cw-skeleton-row--left { justify-content: flex-start; }
        .cw-skeleton-row--right { justify-content: flex-end; }
        .cw-skeleton-bubble { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 1rem; border-radius: 16px; background: var(--bg-tertiary); min-width: 120px; max-width: 260px; width: 45%; }

        .cw-empty {
          margin: auto; text-align: center; color: var(--text-faint); display: flex;
          flex-direction: column; align-items: center; max-width: 280px;
        }
        .cw-empty-icon {
          width: 56px; height: 56px; border-radius: 16px; background: var(--accent-soft);
          color: var(--accent); display: flex; align-items: center; justify-content: center;
          margin-bottom: 1rem;
        }
        .cw-empty-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.25rem; }
        .cw-empty-sub { font-size: 0.8125rem; color: var(--text-muted); margin: 0; }

        .cw-date-group { display: flex; flex-direction: column; }
        .cw-date-divider {
          display: flex; align-items: center; justify-content: center;
          margin: 1rem 0 0.75rem; position: relative;
        }
        .cw-date-divider::before {
          content: ""; position: absolute; left: 0; right: 0; top: 50%;
          height: 1px; background: var(--border); z-index: 0;
        }
        .cw-date-divider span {
          position: relative; z-index: 1; background: var(--bg-primary);
          border: 1px solid var(--border); border-radius: 999px;
          padding: 0.2rem 0.75rem; font-size: 0.6875rem; font-weight: 600;
          color: var(--text-muted); box-shadow: var(--shadow-sm);
        }

        .cw-typing {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;
        }
        .cw-typing-dots { display: flex; gap: 3px; }
        .cw-typing-dots span {
          width: 4px; height: 4px; border-radius: 50%; background: var(--text-faint);
          animation: typingPulse 1s infinite alternate;
        }
        .cw-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .cw-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingPulse { from { opacity: 0.3; } to { opacity: 1; } }

        .cw-input-area {
          padding: 1rem 1.25rem; background: var(--surface-card);
          border-top: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 0.75rem;
          position: relative;
        }

        .cw-readonly-bar {
          padding: 0.85rem; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: 12px;
          text-align: center; font-size: 0.875rem; color: var(--text-muted);
          font-weight: 500;
        }
        .cw-reply-pill {
          display: flex; align-items: center; gap: 0.625rem;
          background: var(--bg-tertiary); border-left: 3px solid var(--accent);
          padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.8125rem;
        }
        .cw-reply-icon { color: var(--accent); flex-shrink: 0; }
        .cw-reply-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cw-reply-sender { font-weight: 700; color: var(--accent); font-size: 0.75rem; }
        .cw-reply-text { color: var(--text-tertiary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size: 0.8125rem; }
        .cw-reply-remove { background: none; border: none; color: var(--text-faint); cursor: pointer; }

        .cw-file-pill {
          display: inline-flex; align-items: center; gap: 0.5rem;
          background: var(--info-soft); color: var(--info); border: 1px solid var(--info-border);
          padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.8125rem;
          align-self: flex-start;
        }
        .cw-file-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-file-remove { color: var(--info); cursor: pointer; display: flex; background: none; border: none; }
        .cw-form { display: flex; align-items: center; gap: 0.75rem; width: 100%; }
        .cw-input-btn { color: var(--text-muted); padding: 0.5rem; border-radius: 8px; background: none; border: none; cursor: pointer; display: flex; }
        .cw-input-btn:hover { color: var(--text-primary); background: var(--bg-tertiary); }
        .cw-input-wrapper { flex: 1; display: flex; align-items: center; position: relative; }
        .cw-mention-popover {
          position: absolute; bottom: calc(100% + 8px); left: 0; right: 0;
          background: var(--surface-card, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          box-shadow: var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15));
          max-height: 220px; overflow-y: auto; z-index: 50;
          padding: 0.35rem; display: flex; flex-direction: column; gap: 2px;
        }
        .cw-mention-header {
          font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-muted, #94a3b8);
          padding: 0.35rem 0.6rem 0.2rem;
        }
        .cw-mention-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.4rem 0.6rem; border-radius: 8px; border: none; background: transparent;
          cursor: pointer; transition: background 0.12s; text-align: left; width: 100%;
        }
        .cw-mention-item:hover, .cw-mention-item--active {
          background: var(--bg-secondary, #f8fafc);
        }
        .cw-mention-left {
          display: flex; align-items: center; gap: 0.5rem; min-width: 0;
        }
        .cw-mention-name {
          font-size: 0.84375rem; font-weight: 600; color: var(--text-primary, #0f172a);
        }
        .cw-mention-name--special {
          color: var(--accent, #4f46e5); font-weight: 700;
        }
        .cw-mention-sub {
          font-size: 0.72rem; color: var(--text-muted, #64748b);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;
        }
        .cw-text-input {
          width: 100%; padding: 0.75rem 2.75rem 0.75rem 1rem; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: 12px; font-size: 0.9375rem; color: var(--text-primary);
        }
        .cw-text-input:focus { border-color: var(--accent); background: var(--bg-primary); outline: none; }
        .cw-emoji-container { position: absolute; right: 0.35rem; display: flex; align-items: center; }
        .cw-send-btn {
          width: 42px; height: 42px; border-radius: 12px; border: none;
          background: var(--accent); color: var(--text-on-accent); display: flex;
          align-items: center; justify-content: center; transition: background 0.15s; cursor: pointer;
        }
        .cw-send-btn:hover:not(:disabled) { background: var(--accent-hover); }
        .cw-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cw-input-wrapper { min-width: 0; }

        /* ── Composer: phone layout ── */
        .cw-mobile-only { display: none; }
        .cw-more { position: relative; }
        .cw-more-btn { transition: transform 0.15s; }
        .cw-more-btn--open { transform: rotate(45deg); color: var(--accent); }
        .cw-more-backdrop { position: fixed; inset: 0; z-index: 40; }
        .cw-more-menu {
          position: absolute; bottom: calc(100% + 10px); left: 0; z-index: 41; min-width: 220px; padding: 6px;
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: 14px;
          box-shadow: var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.18)); display: flex; flex-direction: column;
        }
        .cw-more-menu button {
          display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.65rem; border: none; background: none;
          border-radius: 10px; font-size: 0.9rem; font-weight: 500; color: var(--text-primary); text-align: left; cursor: pointer;
        }
        .cw-more-menu button:hover:not(:disabled) { background: var(--bg-secondary); }
        .cw-more-menu button:disabled { opacity: 0.5; cursor: not-allowed; }
        .cw-more-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
        .cw-more-icon--file { background: #7c3aed; }
        .cw-more-icon--poll { background: #0891b2; }
        .cw-more-icon--later { background: #d97706; }

        @media (max-width: 768px) {
          .cw-desktop-only { display: none !important; }
          .cw-mobile-only { display: flex; }
          .cw-input-area { padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom)); gap: 0.5rem; }
          .cw-form { gap: 0.35rem; }
          .cw-input-btn { padding: 0.45rem; }
          .cw-text-input { padding: 0.65rem 2.5rem 0.65rem 0.85rem; border-radius: 22px; font-size: 1rem; }
          .cw-send-btn { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; }
          .cw-scheduled-bar { padding: 0.35rem 0.75rem; }
          .cw-file-name { max-width: 140px; }
        }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      
      <CreatePollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        conversationId={conversationId!}
        onPollCreated={(msg) => addMessage(msg)}
      />
    </div>
  );
}
