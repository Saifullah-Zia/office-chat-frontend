"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { subscribe, publish, Topics } from "@/lib/socket";
import { ActiveCall, CallSignal, CallType, CallConnectionState } from "@/types/call";
import { useStore } from "@/lib/store";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:openrelay.metered.ca:80" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

// Web Audio API Ringtone Generator (no external audio files needed)
function startRingtone(): () => void {
  let audioCtx: AudioContext | null = null;
  let intervalId: NodeJS.Timeout | null = null;

  try {
    audioCtx = new AudioContext();

    const playTone = () => {
      if (!audioCtx || audioCtx.state === "closed") return;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.frequency.value = 440; // A4
      osc2.frequency.value = 480; // North American Ringback

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 1.2);
      osc2.stop(audioCtx.currentTime + 1.2);
    };

    playTone();
    intervalId = setInterval(playTone, 3000);
  } catch (err) {
    console.warn("Ringtone playback error:", err);
  }

  return () => {
    if (intervalId) clearInterval(intervalId);
    audioCtx?.close().catch(() => {});
  };
}

export function useCallManager(myUserId: number | null) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<CallSignal | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const myUserName = useStore((s) => s.userName);

  // Stop ringtone helper
  const stopRingtone = useCallback(() => {
    if (ringtoneStopRef.current) {
      ringtoneStopRef.current();
      ringtoneStopRef.current = null;
    }
  }, []);

  // Update active call state safely
  const updateCallState = useCallback((patch: Partial<ActiveCall>) => {
    setActiveCall((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

  // Create PeerConnection with STUN/TURN and connection state listeners
  const createPeerConnection = useCallback((remoteUserId: number, conversationId: number) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

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

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        stopRingtone();
        updateCallState({ connectionState: "connected" });

        // Start duration timer if not running
        if (!callTimerRef.current) {
          callTimerRef.current = setInterval(() => {
            setActiveCall((prev) => (prev ? { ...prev, durationSecs: (prev.durationSecs ?? 0) + 1 } : null));
          }, 1000);
        }
      } else if (state === "checking") {
        updateCallState({ connectionState: "connecting" });
      } else if (state === "disconnected") {
        updateCallState({ connectionState: "reconnecting" });
      } else if (state === "failed") {
        updateCallState({ connectionState: "failed" });
      }
    };

    pcRef.current = pc;
    return pc;
  }, [myUserId, myUserName, stopRingtone, updateCallState]);

  // Clean up call state completely
  const hangup = useCallback(() => {
    stopRingtone();

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

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
  }, [activeCall, myUserId, myUserName, stopRingtone]);

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
            ringtoneStopRef.current = startRingtone();

            // Auto dismiss incoming overlay after 35s if not answered
            timeoutRef.current = setTimeout(() => {
              stopRingtone();
              setIncomingSignal(null);
            }, 35000);
          } else if (signal.type === "ANSWER" && pcRef.current) {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
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
  }, [myUserId, hangup, stopRingtone]);

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
        connectionState: "ringing",
        durationSecs: 0,
      });

      ringtoneStopRef.current = startRingtone();

      // 30s no-answer timeout
      timeoutRef.current = setTimeout(() => {
        alert("No answer.");
        hangup();
      }, 30000);

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
    stopRingtone();

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

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
        connectionState: "connecting",
        durationSecs: 0,
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
  }, [myUserId, myUserName, createPeerConnection, hangup, stopRingtone]);

  // Reject incoming call
  const rejectCall = useCallback((signal: CallSignal) => {
    stopRingtone();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

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
  }, [myUserId, myUserName, stopRingtone]);

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
