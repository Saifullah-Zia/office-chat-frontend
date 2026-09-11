"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
} from "agora-rtc-sdk-ng";
import { apiGet } from "@/lib/api";
import { subscribe, publish, Topics } from "@/lib/socket";
import { ActiveCall, CallSignal, CallType } from "@/types/call";
import { useStore } from "@/lib/store";

// Safely load AgoraRTC dynamic import on client-side only (prevents SSR 500 error in Next.js)
async function getAgoraRTC() {
  if (typeof window === "undefined") return null;
  const module = await import("agora-rtc-sdk-ng");
  const AgoraRTC = module.default;
  AgoraRTC.setLogLevel(3); // suppress noisy debug logs
  return AgoraRTC;
}

// Web Audio API Ringtone Generator
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

      osc1.frequency.value = 440;
      osc2.frequency.value = 480;

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

interface AgoraTokenResponse {
  appId: string;
  token: string;
  channelName: string;
  uid: number;
}

export function useCallManager(myUserId: number | null) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<CallSignal | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const myUserName = useStore((s) => s.userName);

  const stopRingtone = useCallback(() => {
    if (ringtoneStopRef.current) {
      ringtoneStopRef.current();
      ringtoneStopRef.current = null;
    }
  }, []);

  const updateCallState = useCallback((patch: Partial<ActiveCall>) => {
    setActiveCall((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

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

    // Unpublish and close local Agora tracks
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.close();
      localAudioTrackRef.current = null;
    }
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.close();
      localVideoTrackRef.current = null;
    }

    // Leave Agora RTC channel
    if (agoraClientRef.current) {
      agoraClientRef.current.leave().catch(() => {});
      agoraClientRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingSignal(null);
    setIsMuted(false);
    setIsCamOff(false);
  }, [activeCall, myUserId, myUserName, stopRingtone]);

  // Setup Agora RTC client instance with event listeners
  const setupAgoraClient = useCallback(async (remoteUserId: number) => {
    const AgoraRTC = await getAgoraRTC();
    if (!AgoraRTC) return null;

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    client.on("user-published", async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);

        if (mediaType === "audio") {
          user.audioTrack?.play();
        }

        // Build remote stream for CallWindow video UI
        const tracks: MediaStreamTrack[] = [];
        if (user.audioTrack) tracks.push(user.audioTrack.getMediaStreamTrack());
        if (user.videoTrack) tracks.push(user.videoTrack.getMediaStreamTrack());

        if (tracks.length > 0) {
          setRemoteStream(new MediaStream(tracks));
        }

        stopRingtone();
        updateCallState({ connectionState: "connected" });

        // Start duration timer
        if (!callTimerRef.current) {
          callTimerRef.current = setInterval(() => {
            setActiveCall((prev) => (prev ? { ...prev, durationSecs: (prev.durationSecs ?? 0) + 1 } : null));
          }, 1000);
        }
      } catch (err) {
        console.error("[Agora] Error subscribing to remote user:", err);
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType === "video") {
        setRemoteStream((prev) => {
          if (!prev) return null;
          const videoTracks = prev.getVideoTracks();
          videoTracks.forEach((t) => prev.removeTrack(t));
          return new MediaStream(prev.getTracks());
        });
      }
    });

    client.on("user-left", () => {
      hangup();
    });

    agoraClientRef.current = client;
    return client;
  }, [stopRingtone, updateCallState, hangup]);

  // Handle WebSocket call signaling
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

            timeoutRef.current = setTimeout(() => {
              stopRingtone();
              setIncomingSignal(null);
            }, 35000);
          } else if (signal.type === "ANSWER") {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            stopRingtone();
            updateCallState({ connectionState: "connected" });
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
  }, [myUserId, hangup, stopRingtone, updateCallState]);

  // Initiate outgoing call
  const initiateCall = useCallback(async (
    conversationId: number,
    remoteUserId: number,
    remoteUserName: string,
    type: CallType
  ) => {
    if (!myUserId) return;

    const channelName = `call_conv_${conversationId}`;

    try {
      const AgoraRTC = await getAgoraRTC();
      if (!AgoraRTC) return;

      // Fetch token from Spring Boot backend
      const { appId, token } = await apiGet<AgoraTokenResponse>(
        `/api/agora/token?channelName=${encodeURIComponent(channelName)}&uid=${myUserId}`
      );

      const effectiveAppId = appId || process.env.NEXT_PUBLIC_AGORA_APP_ID || "";
      if (!effectiveAppId) {
        alert("Agora App ID is missing. Please configure NEXT_PUBLIC_AGORA_APP_ID.");
        return;
      }

      const client = await setupAgoraClient(remoteUserId);
      if (!client) return;

      // Join Agora channel
      await client.join(effectiveAppId, channelName, token || null, myUserId);

      // Create audio & video tracks with native AI noise suppression
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "speech_standard",
        AEC: true,
        ANS: true,
        AGC: true,
      });
      localAudioTrackRef.current = audioTrack;

      const mediaTracks: (IMicrophoneAudioTrack | ICameraVideoTrack)[] = [audioTrack];
      const localMediaTracks: MediaStreamTrack[] = [audioTrack.getMediaStreamTrack()];

      if (type === "VIDEO") {
        const videoTrack = await AgoraRTC.createCameraVideoTrack();
        localVideoTrackRef.current = videoTrack;
        mediaTracks.push(videoTrack);
        localMediaTracks.push(videoTrack.getMediaStreamTrack());
      }

      setLocalStream(new MediaStream(localMediaTracks));

      // Publish tracks to Agora network
      await client.publish(mediaTracks);

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

      timeoutRef.current = setTimeout(() => {
        alert("No answer.");
        hangup();
      }, 30000);

      // Notify recipient via WebSocket so their phone/browser rings
      await publish(Topics.userQueue(remoteUserId), {
        type: "OFFER",
        fromUserId: myUserId,
        fromUserName: myUserName ?? "User",
        toUserId: remoteUserId,
        conversationId,
        sdp: channelName, // pass channelName in sdp field for compatibility
        callType: type,
      } satisfies CallSignal);

    } catch (err) {
      console.error("Failed to initiate call with Agora:", err);
      alert("Could not access camera/microphone or connect to Agora.");
      hangup();
    }
  }, [myUserId, myUserName, setupAgoraClient, hangup]);

  // Accept incoming call
  const acceptCall = useCallback(async (signal: CallSignal, callType: CallType) => {
    if (!myUserId) return;
    stopRingtone();

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const channelName = signal.sdp || `call_conv_${signal.conversationId}`;

    try {
      const AgoraRTC = await getAgoraRTC();
      if (!AgoraRTC) return;

      const { appId, token } = await apiGet<AgoraTokenResponse>(
        `/api/agora/token?channelName=${encodeURIComponent(channelName)}&uid=${myUserId}`
      );

      const effectiveAppId = appId || process.env.NEXT_PUBLIC_AGORA_APP_ID || "";
      const client = await setupAgoraClient(signal.fromUserId);
      if (!client) return;

      await client.join(effectiveAppId, channelName, token || null, myUserId);

      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "speech_standard",
        AEC: true,
        ANS: true,
        AGC: true,
      });
      localAudioTrackRef.current = audioTrack;

      const mediaTracks: (IMicrophoneAudioTrack | ICameraVideoTrack)[] = [audioTrack];
      const localMediaTracks: MediaStreamTrack[] = [audioTrack.getMediaStreamTrack()];

      if (callType === "VIDEO") {
        const videoTrack = await AgoraRTC.createCameraVideoTrack();
        localVideoTrackRef.current = videoTrack;
        mediaTracks.push(videoTrack);
        localMediaTracks.push(videoTrack.getMediaStreamTrack());
      }

      setLocalStream(new MediaStream(localMediaTracks));
      await client.publish(mediaTracks);

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
        sdp: channelName,
      } satisfies CallSignal);

    } catch (err) {
      console.error("Failed to accept call with Agora:", err);
      hangup();
    }
  }, [myUserId, myUserName, setupAgoraClient, hangup, stopRingtone]);

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
    if (localAudioTrackRef.current) {
      const nextMuted = !isMuted;
      localAudioTrackRef.current.setEnabled(!nextMuted);
      setIsMuted(nextMuted);
    }
  }, [isMuted]);

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    if (localVideoTrackRef.current) {
      const nextCamOff = !isCamOff;
      localVideoTrackRef.current.setEnabled(!nextCamOff);
      setIsCamOff(nextCamOff);
    }
  }, [isCamOff]);

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
