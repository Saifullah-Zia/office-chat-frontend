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
}

export const CallContext = createContext<CallContextType | null>(null);

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCallContext must be used within a CallContext.Provider");
  }
  return ctx;
}
