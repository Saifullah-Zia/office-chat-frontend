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
}

export interface ConversationResponse {
  id: number;
  type: ConversationType;
  name: string | null;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  members: MemberResponse[];
}

export type MessageType = "TEXT" | "IMAGE" | "FILE" | "VOICE" | "AUDIO";

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
  attachments: AttachmentResponse[];
  reactions?: Record<string, number>;
  reactionDetails?: ReactionDetailResponse[];
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
