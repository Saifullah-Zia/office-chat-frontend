export type Role = "ADMIN" | "EMPLOYEE";

export interface AuthResponse {
  token: string;
  userId: number;
  name: string;
  email: string;
  role: Role;
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
  timestamp: string;
}

export interface CreateGroupRequest {
  name: string;
  memberIds: number[];
}
