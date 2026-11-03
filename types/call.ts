export type CallType = "AUDIO" | "VIDEO";
export type CallConnectionState = "connecting" | "ringing" | "connected" | "reconnecting" | "failed";

export interface CallSignal {
  /** ENDED comes from the server once the call is closed, so a phone that missed the hang-up still stops. */
  type: "OFFER" | "ANSWER" | "ICE_CANDIDATE" | "HANGUP" | "ENDED";
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
/** A screen share joins the call as its own participant: the sharer's user id plus this offset. */
export const SCREEN_UID_OFFSET = 1_000_000_000;

/**
 * Agora network quality: 0 unknown, 1 excellent, 2 good, 3 poor, 4 bad, 5 very bad, 6 down.
 * Keyed by uid; my own connection is under "me".
 */
export type NetworkQuality = Record<number | "me", number>;

export interface ScreenShare {
  /** The person presenting */
  ownerUid: number;
  name: string;
  stream: MediaStream;
}

export interface CallParticipant {
  uid: number;
  name: string;
  /** Video-only stream for rendering (remote audio plays through Agora directly). */
  videoStream: MediaStream | null;
  /** Audio-only stream, used for the speaking indicator. */
  audioStream: MediaStream | null;
  /** Their mic / camera is on (published). */
  micOn: boolean;
  camOn: boolean;
}
