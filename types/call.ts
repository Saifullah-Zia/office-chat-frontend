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
}

export interface ActiveCall {
  conversationId: number;
  remoteUserId: number;
  remoteUserName: string;
  callType: CallType;
  isInitiator: boolean;
  connectionState?: CallConnectionState;
  durationSecs?: number;
}
