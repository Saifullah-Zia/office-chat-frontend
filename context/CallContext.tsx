"use client";

import { createContext, useContext } from "react";
import { CallType } from "@/types/call";

interface CallContextType {
  initiateCall: (
    conversationId: number,
    remoteUserId: number,
    remoteUserName: string,
    type: CallType
  ) => void;
  /** Rings every member of a group chat into one shared call. */
  initiateGroupCall: (
    conversationId: number,
    groupName: string,
    memberIds: number[],
    type: CallType
  ) => void;
  inCall: boolean;
}

export const CallContext = createContext<CallContextType | null>(null);

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCallContext must be used within a CallContext.Provider");
  }
  return ctx;
}
