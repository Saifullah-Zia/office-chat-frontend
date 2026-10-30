export type Role = "ADMIN" | "EMPLOYEE";

export interface AuthResponse {
  token: string;
  userId: number;
  name: string;
  email: string;
  role: Role;
  /** Two-step verification: password accepted, now send the code with this token. */
  mfaRequired?: boolean;
  mfaToken?: string | null;
}

export interface LoginRequest {
  email: string;
  password?: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password?: string;
  role?: Role;
  department?: string;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  department?: string;
  profilePicUrl?: string;
  workStatus?: string;
  createdAt?: string;
  lastSeenAt?: string | null;
}

export type ConversationType = "DIRECT" | "GROUP";

/** Backend sends UserResponse objects inside members */
export interface MemberResponse {
  id: number;
  name: string;
  email: string;
  department?: string;
  role?: Role;
  profilePicUrl?: string;
  workStatus?: string;
  lastSeenAt?: string | null;
}

export interface ConversationResponse {
  id: number;
  type: ConversationType;
  name: string | null;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  onlyAdminsCanPost?: boolean;
  isAnnouncement?: boolean;
  mutedUntil?: string | null;
  members: MemberResponse[];
  /** Per-group admins (separate from the global account role) */
  adminIds?: number[];
  /** DIRECT only: I blocked the other member */
  blockedByMe?: boolean;
  /** DIRECT only: the other member blocked me */
  blockedMe?: boolean;
  /** Pinned to the top of my chat list */
  pinned?: boolean;
  /** In my "Archived" section */
  archived?: boolean;
  description?: string | null;
  /** Listed in the public channel browser */
  isPublic?: boolean;
  /** Disappearing messages, in days (null = off) */
  retentionDays?: number | null;
  /** Join-link code; only sent to group admins */
  inviteCode?: string | null;
}

export type MessageType = "TEXT" | "IMAGE" | "FILE" | "VOICE" | "AUDIO" | "POLL";

export interface PollOptionResponse {
  id: number;
  optionText: string;
  voteCount: number;
  votedByMe: boolean;
  voterNames: string[];
}

export interface PollResponse {
  id: number;
  messageId: number;
  question: string;
  multipleAnswers: boolean;
  totalVotes: number;
  options: PollOptionResponse[];
}

export interface AttachmentResponse {
  id: number;
  messageId: number;
  filename: string;
  fileName?: string;
  originalName: string;
  contentType: string;
  mimeType?: string;
  size: number;
  fileSize?: number;
  downloadUrl: string;
  createdAt: string;
}

export interface ReactionDetailResponse {
  userId: number;
  userName: string;
  emoji: string;
}

export interface MessageResponse {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  content: string;
  type: MessageType;
  createdAt: string;
  editedAt?: string;
  edited?: boolean;
  deleted?: boolean;
  pinned?: boolean;
  forwarded?: boolean;
  /** Set on replies inside a thread. */
  threadRootId?: number | null;
  /** Set on thread roots. */
  threadReplyCount?: number;
  threadLastReplyAt?: string | null;
  attachments: AttachmentResponse[];
  reactions?: Record<string, number>;
  reactionDetails?: ReactionDetailResponse[];
  poll?: PollResponse;
  read: boolean;
  delivered: boolean;
}

export interface MessageRequest {
  conversationId?: number;
  content: string;
  type?: MessageType;
  attachmentId?: number;
}

export interface TypingRequest {
  conversationId: number;
  userId: number;
  userName: string;
  typing: boolean;
}

export interface TypingEvent {
  conversationId: number;
  userId: number;
  userName: string;
  typing: boolean;
}

export interface PresenceEvent {
  userId: number;
  status: "ONLINE" | "OFFLINE";
  /** Set on OFFLINE events */
  lastSeenAt?: string | null;
}

export type CallType = "AUDIO" | "VIDEO";
export type CallStatus = "RINGING" | "ACCEPTED" | "REJECTED" | "ENDED" | "MISSED";

export interface CallResponse {
  id: number;
  conversationId: number;
  initiatorId: number;
  initiatorName: string;
  type: CallType;
  status: CallStatus | string;
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
}

export interface ReadReceipt {
  userId: number;
  name: string;
  read: boolean;
  readAt?: string | null;
}

export type ReportReason = "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "IMPERSONATION" | "SECURITY" | "OTHER";
export type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export interface ReportView {
  id: number;
  reporterId: number;
  reporterName: string;
  targetUserId: number;
  targetUserName: string;
  messageId?: number | null;
  conversationId?: number | null;
  messageSnapshot?: string | null;
  reason: ReportReason;
  details?: string | null;
  status: ReportStatus;
  resolvedByName?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AuditLogEntry {
  id: number;
  actorId?: number | null;
  actorName: string;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  details?: string | null;
  createdAt: string;
}

export interface LinkPreview {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export interface ScheduledMessageView {
  id: number;
  conversationId: number;
  content: string;
  sendAt: string;
  status: "PENDING" | "SENT" | "CANCELLED" | "FAILED";
}

export interface ReminderView {
  id: number;
  messageId?: number | null;
  conversationId?: number | null;
  note?: string | null;
  messageSnippet?: string | null;
  messageSender?: string | null;
  remindAt: string;
  status: "PENDING" | "FIRED" | "DONE" | "CANCELLED";
}

export interface TaskView {
  id: number;
  title: string;
  notes?: string | null;
  conversationId?: number | null;
  messageId?: number | null;
  createdBy: number;
  createdByName: string;
  assigneeId: number;
  assigneeName: string;
  dueAt?: string | null;
  status: "OPEN" | "DONE";
  createdAt: string;
  completedAt?: string | null;
}

export interface CreateGroupRequest {
  name: string;
  memberIds: number[];
  description?: string;
  isPublic?: boolean;
}
