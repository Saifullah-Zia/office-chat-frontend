"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
  ILocalVideoTrack,
} from "agora-rtc-sdk-ng";
import { apiGet, apiPost } from "@/lib/api";
import { subscribe, publish, Topics } from "@/lib/socket";
import { ActiveCall, CallParticipant, CallSignal, CallType } from "@/types/call";
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

const RING_TIMEOUT_MS = 30_000;
const GROUP_RING_TIMEOUT_MS = 45_000;

/** Display name for an Agora uid (we use the user id as uid). */
function nameForUid(uid: number): string {
  const s = useStore.getState();
  const u = s.users.find((x) => x.id === uid);
  if (u) return u.name;
  for (const c of s.conversations) {
    const m = c.members.find((x) => x.id === uid);
    if (m) return m.name;
  }
  return `User ${uid}`;
}

export function useCallManager(myUserId: number | null) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<CallSignal | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const screenTrackRef = useRef<ILocalVideoTrack | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Latest call/participants for callbacks registered once (Agora events, STOMP handler).
  const activeCallRef = useRef<ActiveCall | null>(null);
  const participantsRef = useRef<CallParticipant[]>([]);
  const groupInviteesRef = useRef<number[]>([]);

  const myUserName = useStore((s) => s.userName);

  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  const stopRingtone = useCallback(() => {
    if (ringtoneStopRef.current) {
      ringtoneStopRef.current();
      ringtoneStopRef.current = null;
    }
  }, []);

  const clearRingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const updateCallState = useCallback((patch: Partial<ActiveCall>) => {
    setActiveCall((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

  const sendSignal = useCallback((toUserId: number, signal: Omit<CallSignal, "fromUserId" | "fromUserName" | "toUserId">) => {
    if (!myUserId) return Promise.resolve();
    return publish(Topics.userQueue(toUserId), {
      ...signal,
      fromUserId: myUserId,
      fromUserName: myUserName ?? "User",
      toUserId,
    } satisfies CallSignal).catch(() => {});
  }, [myUserId, myUserName]);

  const startDurationTimer = () => {
    if (callTimerRef.current) return;
    callTimerRef.current = setInterval(() => {
      setActiveCall((prev) => (prev ? { ...prev, durationSecs: (prev.durationSecs ?? 0) + 1 } : null));
    }, 1000);
  };

  // Clean up call state completely
  const hangup = useCallback(() => {
    stopRingtone();
    clearRingTimeout();

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    const call = activeCallRef.current;
    if (call && myUserId) {
      if (!call.isGroup) {
        sendSignal(call.remoteUserId, { type: "HANGUP", conversationId: call.conversationId, callId: call.callId });
      } else if (call.isInitiator && participantsRef.current.length === 0) {
        // Nobody joined yet: stop everyone's phone from ringing.
        groupInviteesRef.current.forEach((uid) =>
          sendSignal(uid, { type: "HANGUP", conversationId: call.conversationId, callId: call.callId, isGroup: true })
        );
      }
      // Close the call record (marks MISSED if nobody ever answered).
      if (call.callId && (!call.isGroup || call.isInitiator)) {
        apiPost(`/api/calls/${call.callId}/end`).catch(() => {});
      }
    }

    // Unpublish and close local Agora tracks
    localAudioTrackRef.current?.close();
    localAudioTrackRef.current = null;
    localVideoTrackRef.current?.close();
    localVideoTrackRef.current = null;
    screenTrackRef.current?.close();
    screenTrackRef.current = null;

    // Leave Agora RTC channel
    if (agoraClientRef.current) {
      agoraClientRef.current.removeAllListeners();
      agoraClientRef.current.leave().catch(() => {});
      agoraClientRef.current = null;
    }

    groupInviteesRef.current = [];
    activeCallRef.current = null;
    setLocalStream(null);
    setParticipants([]);
    setActiveCall(null);
    setIncomingSignal(null);
    setIsMuted(false);
    setIsCamOff(false);
    setIsScreenSharing(false);
  }, [myUserId, sendSignal, stopRingtone]);

  // Rebuild one participant's render streams from their current Agora tracks.
  const upsertParticipant = useCallback((user: IAgoraRTCRemoteUser) => {
    const uid = Number(user.uid);
    const videoTrack = user.videoTrack?.getMediaStreamTrack();
    const audioTrack = user.audioTrack?.getMediaStreamTrack();
    const entry: CallParticipant = {
      uid,
      name: nameForUid(uid),
      videoStream: videoTrack ? new MediaStream([videoTrack]) : null,
      audioStream: audioTrack ? new MediaStream([audioTrack]) : null,
    };
    setParticipants((prev) => {
      const others = prev.filter((p) => p.uid !== uid);
      return [...others, entry].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  // Setup Agora RTC client instance with event listeners
  const setupAgoraClient = useCallback(async () => {
    const AgoraRTC = await getAgoraRTC();
    if (!AgoraRTC) return null;

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    client.on("user-joined", (user) => {
      // Someone answered: stop ringing and start the clock even before they publish media.
      stopRingtone();
      clearRingTimeout();
      upsertParticipant(user);
      updateCallState({ connectionState: "connected" });
      startDurationTimer();
    });

    client.on("user-published", async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") user.audioTrack?.play();
        upsertParticipant(user);
        stopRingtone();
        clearRingTimeout();
        updateCallState({ connectionState: "connected" });
        startDurationTimer();
      } catch (err) {
        console.error("[Agora] Error subscribing to remote user:", err);
      }
    });

    client.on("user-unpublished", (user) => {
      upsertParticipant(user);
    });

    client.on("user-left", (user) => {
      const uid = Number(user.uid);
      setParticipants((prev) => prev.filter((p) => p.uid !== uid));
      // A 1:1 call ends when the other person leaves; a group call keeps going.
      if (!activeCallRef.current?.isGroup) hangup();
    });

    client.on("connection-state-change", (state) => {
      if (state === "RECONNECTING") updateCallState({ connectionState: "reconnecting" });
      else if (state === "CONNECTED" && participantsRef.current.length > 0) updateCallState({ connectionState: "connected" });
    });

    agoraClientRef.current = client;
    return client;
  }, [stopRingtone, updateCallState, hangup, upsertParticipant]);

  /** Join the conversation's Agora channel and publish mic (+ camera for video). */
  const joinChannel = useCallback(async (channelName: string, type: CallType) => {
    const AgoraRTC = await getAgoraRTC();
    if (!AgoraRTC || !myUserId) throw new Error("Agora unavailable");

    const { appId, token } = await apiGet<AgoraTokenResponse>(
      `/api/agora/token?channelName=${encodeURIComponent(channelName)}&uid=${myUserId}`
    );
    const effectiveAppId = appId || process.env.NEXT_PUBLIC_AGORA_APP_ID || "";
    if (!effectiveAppId) throw new Error("Agora App ID is missing. Please configure NEXT_PUBLIC_AGORA_APP_ID.");

    const client = await setupAgoraClient();
    if (!client) throw new Error("Agora unavailable");
    await client.join(effectiveAppId, channelName, token || null, myUserId);

    // Audio with native noise suppression / echo cancellation
    const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: "speech_standard",
      AEC: true,
      ANS: true,
      AGC: true,
    });
    localAudioTrackRef.current = audioTrack;

    const tracks: (IMicrophoneAudioTrack | ICameraVideoTrack)[] = [audioTrack];
    if (type === "VIDEO") {
      const videoTrack = await AgoraRTC.createCameraVideoTrack();
      localVideoTrackRef.current = videoTrack;
      tracks.push(videoTrack);
      setLocalStream(new MediaStream([videoTrack.getMediaStreamTrack()]));
    } else {
      setLocalStream(null);
    }
    await client.publish(tracks);
  }, [myUserId, setupAgoraClient]);

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
            // Already in a call: let the caller know we're busy (1:1 only).
            if (activeCallRef.current) {
              if (!signal.isGroup) sendSignal(signal.fromUserId, { type: "HANGUP", conversationId: signal.conversationId, callId: signal.callId });
              return;
            }
            setIncomingSignal(signal);
            ringtoneStopRef.current = startRingtone();
            clearRingTimeout();
            timeoutRef.current = setTimeout(() => {
              stopRingtone();
              setIncomingSignal(null);
            }, signal.isGroup ? GROUP_RING_TIMEOUT_MS + 5_000 : RING_TIMEOUT_MS + 5_000);
          } else if (signal.type === "ANSWER") {
            clearRingTimeout();
            stopRingtone();
            updateCallState({ connectionState: "connected" });
          } else if (signal.type === "HANGUP") {
            // Caller cancelled before we answered.
            setIncomingSignal((cur) => {
              if (cur && cur.fromUserId === signal.fromUserId && cur.conversationId === signal.conversationId) {
                stopRingtone();
                clearRingTimeout();
                return null;
              }
              return cur;
            });
            // In a 1:1 call, the other side hanging up ends it. In groups, Agora's user-left handles it.
            const call = activeCallRef.current;
            if (call && !call.isGroup && call.remoteUserId === signal.fromUserId) hangup();
          }
        });
      } catch (err) {
        console.error("Call signaling subscription error:", err);
      }
    })();

    return () => {
      sub?.unsubscribe();
    };
  }, [myUserId, hangup, stopRingtone, updateCallState, sendSignal]);

  /** Creates the call-log record; failures don't block the call. */
  const logCallStart = async (conversationId: number, type: CallType): Promise<number | null> => {
    try {
      const res = await apiPost<{ id: number }>("/api/calls", { conversationId, type });
      return res.id;
    } catch {
      return null;
    }
  };

  // Initiate outgoing 1:1 call
  const initiateCall = useCallback(async (
    conversationId: number,
    remoteUserId: number,
    remoteUserName: string,
    type: CallType
  ) => {
    if (!myUserId || activeCallRef.current) return;
    const channelName = `call_conv_${conversationId}`;

    try {
      const callId = await logCallStart(conversationId, type);
      const call: ActiveCall = {
        conversationId, remoteUserId, remoteUserName, callType: type,
        isInitiator: true, connectionState: "ringing", durationSecs: 0, callId,
      };
      activeCallRef.current = call;
      setActiveCall(call);

      await joinChannel(channelName, type);
      ringtoneStopRef.current = startRingtone();
      timeoutRef.current = setTimeout(() => {
        if (participantsRef.current.length === 0) hangup();
      }, RING_TIMEOUT_MS);

      // Notify recipient via WebSocket so their phone/browser rings
      await sendSignal(remoteUserId, { type: "OFFER", conversationId, sdp: channelName, callType: type, callId });
    } catch (err) {
      console.error("Failed to initiate call with Agora:", err);
      alert(err instanceof Error && err.message.includes("App ID") ? err.message : "Could not access camera/microphone or connect to the call service.");
      hangup();
    }
  }, [myUserId, joinChannel, hangup, sendSignal]);

  // Start a group call: everyone in the chat is rung and joins the same channel.
  const initiateGroupCall = useCallback(async (
    conversationId: number,
    groupName: string,
    memberIds: number[],
    type: CallType
  ) => {
    if (!myUserId || activeCallRef.current) return;
    const channelName = `call_conv_${conversationId}`;

    try {
      const callId = await logCallStart(conversationId, type);
      const call: ActiveCall = {
        conversationId, remoteUserId: 0, remoteUserName: groupName, callType: type,
        isInitiator: true, connectionState: "ringing", durationSecs: 0, isGroup: true, callId,
      };
      activeCallRef.current = call;
      setActiveCall(call);

      await joinChannel(channelName, type);
      groupInviteesRef.current = memberIds.filter((id) => id !== myUserId);
      ringtoneStopRef.current = startRingtone();
      timeoutRef.current = setTimeout(() => {
        if (participantsRef.current.length === 0) {
          stopRingtone();
          hangup();
        }
      }, GROUP_RING_TIMEOUT_MS);

      await Promise.all(groupInviteesRef.current.map((uid) =>
        sendSignal(uid, { type: "OFFER", conversationId, sdp: channelName, callType: type, callId, isGroup: true, groupName })
      ));
    } catch (err) {
      console.error("Failed to start group call:", err);
      alert("Could not access camera/microphone or connect to the call service.");
      hangup();
    }
  }, [myUserId, joinChannel, hangup, sendSignal, stopRingtone]);

  // Accept incoming call (1:1 or group)
  const acceptCall = useCallback(async (signal: CallSignal, callType: CallType) => {
    if (!myUserId) return;
    stopRingtone();
    clearRingTimeout();

    const channelName = signal.sdp || `call_conv_${signal.conversationId}`;

    try {
      const call: ActiveCall = {
        conversationId: signal.conversationId,
        remoteUserId: signal.isGroup ? 0 : signal.fromUserId,
        remoteUserName: signal.isGroup ? signal.groupName ?? "Group call" : signal.fromUserName,
        callType,
        isInitiator: false,
        connectionState: "connecting",
        durationSecs: 0,
        isGroup: !!signal.isGroup,
        callId: signal.callId,
      };
      activeCallRef.current = call;
      setActiveCall(call);
      setIncomingSignal(null);

      await joinChannel(channelName, callType);
      if (signal.callId) apiPost(`/api/calls/${signal.callId}/accept`).catch(() => {});
      await sendSignal(signal.fromUserId, {
        type: "ANSWER", conversationId: signal.conversationId, sdp: channelName, callId: signal.callId, isGroup: signal.isGroup,
      });
    } catch (err) {
      console.error("Failed to accept call with Agora:", err);
      hangup();
    }
  }, [myUserId, joinChannel, hangup, sendSignal, stopRingtone]);

  // Reject incoming call
  const rejectCall = useCallback((signal: CallSignal) => {
    stopRingtone();
    clearRingTimeout();
    // In a group, declining just stops my ringing; the call continues for others.
    if (!signal.isGroup) {
      sendSignal(signal.fromUserId, { type: "HANGUP", conversationId: signal.conversationId, callId: signal.callId });
      if (signal.callId) apiPost(`/api/calls/${signal.callId}/reject`).catch(() => {});
    }
    setIncomingSignal(null);
  }, [sendSignal, stopRingtone]);

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

  const stopScreenShare = useCallback(async () => {
    const client = agoraClientRef.current;
    const screen = screenTrackRef.current;
    if (!screen) return;
    screenTrackRef.current = null;
    try {
      if (client) await client.unpublish(screen);
    } catch {}
    screen.close();
    // Put the camera back if this is a video call.
    const cam = localVideoTrackRef.current;
    if (cam && client) {
      await client.publish(cam).catch(() => {});
      setLocalStream(new MediaStream([cam.getMediaStreamTrack()]));
    } else {
      setLocalStream(null);
    }
    setIsScreenSharing(false);
  }, []);

  // Share screen to everyone in the call (replaces the camera while sharing).
  const toggleScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      await stopScreenShare();
      return;
    }
    const client = agoraClientRef.current;
    const AgoraRTC = await getAgoraRTC();
    if (!client || !AgoraRTC) return;
    try {
      const created = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1", optimizationMode: "detail" }, "disable");
      const screen = Array.isArray(created) ? created[0] : created;
      const cam = localVideoTrackRef.current;
      if (cam) await client.unpublish(cam).catch(() => {});
      await client.publish(screen);
      screenTrackRef.current = screen;
      screen.on("track-ended", () => { stopScreenShare(); });
      setLocalStream(new MediaStream([screen.getMediaStreamTrack()]));
      setIsScreenSharing(true);
    } catch (err) {
      // User cancelled the browser's picker, or sharing isn't supported.
      console.warn("Screen share cancelled or failed:", err);
    }
  }, [stopScreenShare]);

  return {
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
  };
}
