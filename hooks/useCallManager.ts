"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { subscribe, publish, Topics } from "@/lib/socket";
import { ActiveCall, CallSignal, CallType } from "@/types/call";
import { useStore } from "@/lib/store";

export function useCallManager(myUserId: number | null) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<CallSignal | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const myUserName = useStore((s) => s.userName);

  // Initialize peer connection with STUN server
  const createPeerConnection = useCallback((remoteUserId: number, conversationId: number) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && myUserId) {
        publish(Topics.userQueue(remoteUserId), {
          type: "ICE_CANDIDATE",
          fromUserId: myUserId,
          fromUserName: myUserName ?? "User",
          toUserId: remoteUserId,
          conversationId,
          candidate: JSON.stringify(event.candidate),
        } satisfies CallSignal).catch(console.error);
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [myUserId, myUserName]);

  // Clean up call state
  const hangup = useCallback(() => {
    if (activeCall && myUserId) {
      publish(Topics.userQueue(activeCall.remoteUserId), {
        type: "HANGUP",
        fromUserId: myUserId,
        fromUserName: myUserName ?? "User",
        toUserId: activeCall.remoteUserId,
        conversationId: activeCall.conversationId,
      } satisfies CallSignal).catch(() => {});
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingSignal(null);
    setIsMuted(false);
    setIsCamOff(false);
  }, [activeCall, myUserId, myUserName]);

  // Handle incoming signaling messages
  useEffect(() => {
    if (!myUserId) return;
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        sub = await subscribe(Topics.userQueue(myUserId), async (frame) => {
          const signal: CallSignal = JSON.parse(frame.body);
          if (signal.fromUserId === myUserId) return;

          if (signal.type === "OFFER") {
            setIncomingSignal(signal);
          } else if (signal.type === "ANSWER" && pcRef.current) {
            if (signal.sdp) {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
            }
          } else if (signal.type === "ICE_CANDIDATE" && pcRef.current) {
            if (signal.candidate) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(JSON.parse(signal.candidate)));
            }
          } else if (signal.type === "HANGUP") {
            hangup();
          }
        });
      } catch (err) {
        console.error("Call signaling subscription error:", err);
      }
    })();

    return () => {
      sub?.unsubscribe();
    };
  }, [myUserId, hangup]);

  // Initiate outgoing call
  const initiateCall = useCallback(async (
    conversationId: number,
    remoteUserId: number,
    remoteUserName: string,
    type: CallType
  ) => {
    if (!myUserId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "VIDEO",
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(remoteUserId, conversationId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setActiveCall({
        conversationId,
        remoteUserId,
        remoteUserName,
        callType: type,
        isInitiator: true,
      });

      await publish(Topics.userQueue(remoteUserId), {
        type: "OFFER",
        fromUserId: myUserId,
        fromUserName: myUserName ?? "User",
        toUserId: remoteUserId,
        conversationId,
        sdp: offer.sdp,
        callType: type,
      } satisfies CallSignal);
    } catch (err) {
      console.error("Failed to initiate call:", err);
      alert("Could not access camera/microphone.");
      hangup();
    }
  }, [myUserId, myUserName, createPeerConnection, hangup]);

  // Accept incoming call
  const acceptCall = useCallback(async (signal: CallSignal, callType: CallType) => {
    if (!myUserId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "VIDEO",
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(signal.fromUserId, signal.conversationId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      setActiveCall({
        conversationId: signal.conversationId,
        remoteUserId: signal.fromUserId,
        remoteUserName: signal.fromUserName,
        callType,
        isInitiator: false,
      });
      setIncomingSignal(null);

      await publish(Topics.userQueue(signal.fromUserId), {
        type: "ANSWER",
        fromUserId: myUserId,
        fromUserName: myUserName ?? "User",
        toUserId: signal.fromUserId,
        conversationId: signal.conversationId,
        sdp: answer.sdp,
      } satisfies CallSignal);
    } catch (err) {
      console.error("Failed to accept call:", err);
      hangup();
    }
  }, [myUserId, myUserName, createPeerConnection, hangup]);

  // Reject incoming call
  const rejectCall = useCallback((signal: CallSignal) => {
    if (myUserId) {
      publish(Topics.userQueue(signal.fromUserId), {
        type: "HANGUP",
        fromUserId: myUserId,
        fromUserName: myUserName ?? "User",
        toUserId: signal.fromUserId,
        conversationId: signal.conversationId,
      } satisfies CallSignal).catch(() => {});
    }
    setIncomingSignal(null);
  }, [myUserId, myUserName]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOff(!videoTrack.enabled);
      }
    }
  }, []);

  return {
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
  };
}
