export type CallType = "AUDIO" | "VIDEO";
export type CallConnectionState = "connecting" | "ringing" | "connected" | "reconnecting" | "failed";

export interface CallSignal {
  type: "OFFER" | "ANSWER" | "ICE_CANDIDATE" | "HANGUP";
  fromUserId: number;
  fromUserName: string;
  toUserId: number;
  conversationId: number;
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  callType?: CallType;
  /** Server-side call record id (for the call log). */
  callId?: number | null;
  /** Group call: everyone in the chat is invited to the same channel. */
  isGroup?: boolean;
  groupName?: string | null;
}

export interface ActiveCall {
  conversationId: number;
  /** 1:1 calls: the other person. Group calls: 0. */
  remoteUserId: number;
  /** 1:1: the other person's name. Group: the group's name. */
  remoteUserName: string;
  callType: CallType;
  isInitiator: boolean;
  connectionState?: CallConnectionState;
  durationSecs?: number;
  isGroup?: boolean;
  callId?: number | null;
}

/** Someone else in the call, as seen by this client. */
export interface CallParticipant {
  uid: number;
  name: string;
  /** Video-only stream for rendering (remote audio plays through Agora directly). */
  videoStream: MediaStream | null;
  /** Audio-only stream, used for the speaking indicator. */
  audioStream: MediaStream | null;
}
