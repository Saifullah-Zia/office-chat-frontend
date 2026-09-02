"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { useStore } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import { useCallManager } from "@/hooks/useCallManager";
import IncomingCallOverlay from "@/components/IncomingCallOverlay";
import CallWindow from "@/components/CallWindow";
import { CallContext } from "@/context/CallContext";
import { CallType } from "@/types/call";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // On mount: read auth from localStorage, redirect if missing
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    // Load user info into Zustand for components to use
    useStore.getState().loadUserFromStorage();
    setReady(true);
  }, [router]);

  const userId = useStore((s) => s.userId);
  const incomingCallTypeRef = useRef<CallType>("AUDIO");

  const {
    activeCall,
    incomingSignal,
    localStream,
    remoteStream,
    isMuted,
    isCamOff,
    initiateCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
  } = useCallManager(userId);

  // Don't render until we've verified auth
  if (!ready) return null;

  return (
    <CallContext.Provider value={{ initiateCall }}>
      <div className="chat-layout-shell">
        <Sidebar />
        <main className="chat-layout-main">{children}</main>

        {incomingSignal && !activeCall && (
          <IncomingCallOverlay
            signal={incomingSignal}
            callType={incomingCallTypeRef.current}
            onAccept={() => acceptCall(incomingSignal, incomingCallTypeRef.current)}
            onReject={() => rejectCall(incomingSignal)}
          />
        )}

        {activeCall && (
          <CallWindow
            activeCall={activeCall}
            localStream={localStream}
            remoteStream={remoteStream}
            isMuted={isMuted}
            isCamOff={isCamOff}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onHangup={hangup}
          />
        )}

        <style>{`
          .chat-layout-shell {
            display: flex;
            height: 100svh;
            width: 100vw;
            overflow: hidden;
            background: #f8f9fb;
          }
          .chat-layout-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
            height: 100%;
            overflow: hidden;
          }
        `}</style>
      </div>
    </CallContext.Provider>
  );
}
