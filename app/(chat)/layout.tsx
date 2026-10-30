"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { useStore } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import { useCallManager } from "@/hooks/useCallManager";
import IncomingCallOverlay from "@/components/IncomingCallOverlay";
import CallWindow from "@/components/CallWindow";
import { CallContext } from "@/context/CallContext";
import { CallType } from "@/types/call";
import GlobalSearchModal from "@/components/GlobalSearchModal";
import Toaster from "@/components/Toaster";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // On mount: read auth from localStorage, redirect if missing
  useEffect(() => {
    if (!isAuthenticated()) {
      // Remember an invite link so we can return to it after signing in.
      try {
        if (window.location.pathname.startsWith("/join/")) {
          sessionStorage.setItem("office_after_login", window.location.pathname);
        }
      } catch {}
      router.replace("/login");
      return;
    }
    try {
      const pending = sessionStorage.getItem("office_after_login");
      if (pending && pending.startsWith("/join/") && window.location.pathname === "/") {
        sessionStorage.removeItem("office_after_login");
        router.replace(pending);
      }
    } catch {}
    // Load user info into Zustand for components to use
    useStore.getState().loadUserFromStorage();

    // Request browser push notification permission
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    setReady(true);
  }, [router]);

  const userId = useStore((s) => s.userId);
  const incomingCallTypeRef = useRef<CallType>("AUDIO");

  const userName = useStore((s) => s.userName);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const pathname = usePathname() ?? "/";

  // Installable app: register the service worker (production only — it would cache dev builds).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker registration failed:", err));
  }, []);
  const {
    activeCall,
    incomingSignal,
    localStream,
    participants,
    isMuted,
    isCamOff,
    isScreenSharing,
    initiateCall,
    initiateGroupCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  } = useCallManager(userId);

  // Don't render until we've verified auth
  if (!ready) return null;

  return (
    <CallContext.Provider value={{ initiateCall, initiateGroupCall, inCall: !!activeCall }}>
      <div className={`chat-layout-shell ${activeConversationId || pathname.startsWith("/join") ? "chat-layout-shell--chat-open" : ""}`}>
        <Sidebar />
        <main className="chat-layout-main">{children}</main>

        {incomingSignal && !activeCall && (
          <IncomingCallOverlay
            signal={incomingSignal}
            callType={incomingSignal.callType ?? "AUDIO"}
            onAccept={() => acceptCall(incomingSignal, incomingSignal.callType ?? "AUDIO")}
            onReject={() => rejectCall(incomingSignal)}
          />
        )}

        <GlobalSearchModal />
        <Toaster />

        {activeCall && (
          <CallWindow
            activeCall={activeCall}
            localStream={localStream}
            participants={participants}
            isMuted={isMuted}
            isCamOff={isCamOff}
            isScreenSharing={isScreenSharing}
            myName={userName ?? "You"}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={toggleScreenShare}
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
          /* Phones: one pane at a time — the chat list, or the open chat. */
          @media (max-width: 768px) {
            .chat-layout-shell .sb { width: 100%; border-right: none; }
            .chat-layout-shell--chat-open .sb { display: none; }
            .chat-layout-shell:not(.chat-layout-shell--chat-open) .chat-layout-main { display: none; }
            .cid-drawer { position: absolute; inset: 0; width: 100% !important; z-index: 30; }
          }
        `}</style>
      </div>
    </CallContext.Provider>
  );
}
