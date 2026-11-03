"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
  ILocalVideoTrack,
} from "agora-rtc-sdk-ng";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { desktopNotify } from "@/lib/notify";
import { DeviceKind, canChooseSpeaker, getPreferredDevices, setPreferredDevice } from "@/lib/devices";
import { getEffectPrefs, loadCallEffects, setEffectPref } from "@/lib/callEffects";
import type { IAIDenoiserProcessor } from "agora-extension-ai-denoiser";
import type { IVirtualBackgroundProcessor } from "agora-extension-virtual-background";
import { subscribe, publish, Topics, Destinations } from "@/lib/socket";
import { ActiveCall, CallParticipant, CallSignal, CallType, SCREEN_UID_OFFSET, ScreenShare, NetworkQuality } from "@/types/call";
import { useStore } from "@/lib/store";

// Safely load AgoraRTC dynamic import on client-side only (prevents SSR 500 error in Next.js)
async function getAgoraRTC() {
  if (typeof window === "undefined") return null;
  const agora = await import("agora-rtc-sdk-ng");
  const AgoraRTC = agora.default;
  AgoraRTC.setLogLevel(3); // suppress noisy debug logs
  return AgoraRTC;
}

/** Turn a failed call setup into a message that says what's wrong and what to do. */
function describeCallError(err: unknown): string {
  const e = err as { code?: string; name?: string; message?: string; response?: { status?: number } } | null;
  const status = e?.response?.status;
  const code = String(e?.code ?? "");
  const name = String(e?.name ?? "");
  const msg = String(e?.message ?? "");
  if (status === 403) return "You can't call in this chat.";
  if ((status ?? 0) >= 500 || code === "ERR_NETWORK") {
    return "The chat server isn't responding right now. Wait a minute and try again.";
  }
  if (code === "PERMISSION_DENIED" || name === "NotAllowedError" || /permission denied|not allowed/i.test(msg)) {
    return "Microphone/camera access is blocked for this site. Tap the icon left of the address bar → Permissions → allow Microphone (and Camera), then try again.";
  }
  if (code === "NOT_READABLE" || name === "NotReadableError") {
    return "Your microphone or camera is in use by another app (or another call). Close it and try again.";
  }
  if (code === "DEVICE_NOT_FOUND" || name === "NotFoundError") return "No microphone or camera was found on this device.";
  if (/App ID/i.test(msg)) return msg;
  if (/token|dynamic key|vendor key|CAN_NOT_GET_GATEWAY_SERVER|INVALID_PARAMS/i.test(code + " " + msg)) {
    return "The call service refused the connection. The Agora App ID or certificate in Railway/Vercel doesn't match. Ask your admin to check them.";
  }
  return `Couldn't connect the call.${msg ? ` (${code ? code + ": " : ""}${msg})` : ""}`;
}

/**
 * Ringtone: a real audio file on loop. Unlike generated beeps, an audio file keeps playing when the
 * app goes to the background on a phone. Falls back to beeps if the browser blocks playback.
 */
function startRingtone(): () => void {
  let stopped = false;
  let stopBeeps: (() => void) | null = null;
  const audio = typeof Audio !== "undefined" ? new Audio("/ringtone.wav") : null;
  if (audio) {
    audio.loop = true;
    audio.play().catch(() => { if (!stopped) stopBeeps = startBeeps(); });
  } else {
    stopBeeps = startBeeps();
  }
  return () => {
    stopped = true;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    stopBeeps?.();
  };
}

// Web Audio API ringtone (fallback)
function startBeeps(): () => void {
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

/** The parts of an Agora mic/camera/screen track that hangup needs to switch it off for good. */
interface LocalTrack { close: () => void; getMediaStreamTrack: () => MediaStreamTrack }

/**
 * Switch tracks off: stop the device capture itself (the mic light goes off) and close the Agora track.
 * Run again a moment later, because an unmute or device switch that was still in progress when the
 * call ended can reopen the microphone after the first pass.
 */
function releaseTracks(tracks: LocalTrack[]) {
  const release = () => tracks.forEach((t) => {
    try { t.getMediaStreamTrack()?.stop(); } catch {}
    try { t.close(); } catch {}
  });
  release();
  setTimeout(release, 1_500);
  setTimeout(release, 5_000);
}

/** A call ringing for me, as the server reports it (GET /api/calls/incoming). */
interface RingingCall {
  conversationId: number;
  callId: number | null;
  callType: CallType;
  fromUserId: number;
  fromUserName: string;
  isGroup: boolean;
  groupName: string | null;
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
  /** Other people's shared screens (newest last). */
  const [screenShares, setScreenShares] = useState<ScreenShare[]>([]);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>({ me: 0 });
  const [connectionUnstable, setConnectionUnstable] = useState(false);
  /** Raised hands in the current call, by user id (mine included). */
  const [raisedHands, setRaisedHands] = useState<Set<number>>(new Set());
  // Effects: AI noise suppression (mic) and background blur (camera).
  const [noiseSuppression, setNoiseSuppressionState] = useState(false);
  const [backgroundBlur, setBackgroundBlurState] = useState(false);
  const denoiseProcRef = useRef<IAIDenoiserProcessor | null>(null);
  const blurProcRef = useRef<IVirtualBackgroundProcessor | null>(null);
  // Bumped on every hangup. Setup steps that are still awaiting (joining, opening the mic, attaching
  // effects) compare against it and close what they opened instead of leaving the mic on.
  const callEpochRef = useRef(0);
  // True while a call is being started/accepted: a second tap (double-tap on Accept) is ignored
  // instead of joining twice and opening a second microphone that hangup never sees.
  const startingRef = useRef(false);
  // Every mic/camera track and call connection opened since the last hangup, so hangup can
  // close all of them even if a ref was overwritten.
  const openedTracksRef = useRef<Set<LocalTrack>>(new Set());
  const openedClientsRef = useRef<Set<IAgoraRTCClient>>(new Set());
  const badStreakRef = useRef(0);
  const screenClientRef = useRef<IAgoraRTCClient | null>(null);
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
    // Relayed by the server, which checks membership and stamps the real sender.
    return publish(Destinations.callSignal(), {
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

  // Group calls: tell the server I'm in (and keep telling it) so others can see the call and join late.
  const presenceRef = useRef<{ callId: number; timer: ReturnType<typeof setInterval> } | null>(null);
  const startPresence = useCallback((callId: number) => {
    if (presenceRef.current) return;
    const checkIn = () => apiPost(`/api/calls/${callId}/presence`).catch(() => {});
    checkIn();
    presenceRef.current = { callId, timer: setInterval(checkIn, 60_000) };
  }, []);
  const stopPresence = useCallback(() => {
    const p = presenceRef.current;
    if (!p) return;
    clearInterval(p.timer);
    presenceRef.current = null;
    apiDelete(`/api/calls/${p.callId}/presence`).catch(() => {});
  }, []);

  /** Turn AI noise suppression on/off for my mic. Returns whether it's now on. */
  const applyNoiseSuppression = useCallback(async (on: boolean) => {
    const track = localAudioTrackRef.current;
    const AgoraRTC = await getAgoraRTC();
    if (!track || !AgoraRTC) return false;
    try {
      if (!denoiseProcRef.current) {
        if (!on) return false;
        const { denoiser } = await loadCallEffects(AgoraRTC);
        if (!denoiser || localAudioTrackRef.current !== track) return false; // call ended meanwhile
        const proc = denoiser.createProcessor();
        // If the processor fails mid-call, fall back to the plain mic instead of going silent.
        proc.on("pipeerror", () => {
          proc.unpipe();
          track.unpipe();
          track.pipe(track.processorDestination);
          denoiseProcRef.current = null;
          setNoiseSuppressionState(false);
        });
        track.pipe(proc).pipe(track.processorDestination);
        denoiseProcRef.current = proc;
      }
      if (on) await denoiseProcRef.current.enable(); else await denoiseProcRef.current.disable();
      return on;
    } catch (err) {
      console.warn("Noise suppression failed:", err);
      return false;
    }
  }, []);

  /** Turn background blur on/off for my camera. Returns whether it's now on. */
  const applyBackgroundBlur = useCallback(async (on: boolean) => {
    const track = localVideoTrackRef.current;
    const AgoraRTC = await getAgoraRTC();
    if (!track || !AgoraRTC) return false;
    try {
      if (!blurProcRef.current) {
        if (!on) return false;
        const { blur } = await loadCallEffects(AgoraRTC);
        if (!blur) return false;
        const proc = blur.createProcessor();
        await proc.init();
        if (localVideoTrackRef.current !== track) { proc.release().catch(() => {}); return false; } // call ended meanwhile
        proc.setOptions({ type: "blur", blurDegree: 2 });
        track.pipe(proc).pipe(track.processorDestination);
        blurProcRef.current = proc;
      }
      if (on) await blurProcRef.current.enable(); else await blurProcRef.current.disable();
      setLocalStream(new MediaStream([track.getMediaStreamTrack()]));
      return on;
    } catch (err) {
      console.warn("Background blur failed:", err);
      return false;
    }
  }, []);

  // Clean up call state completely
  const hangup = useCallback(() => {
    callEpochRef.current++;
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
      // 1:1: close the call record (MISSED if never answered). Group: the server closes it when the last person leaves.
      if (call.callId && !call.isGroup) {
        apiPost(`/api/calls/${call.callId}/end`).catch(() => {});
      }
      if (call.isGroup) stopPresence();
    }

    // Release effect processors: disconnect track -> processor -> output first, then free them
    // (destroying one that's still connected fails and leaks it).
    const denoiser = denoiseProcRef.current;
    const blurProc = blurProcRef.current;
    denoiseProcRef.current = null;
    blurProcRef.current = null;
    if (denoiser) {
      localAudioTrackRef.current?.unpipe();
      denoiser.unpipe();
      Promise.resolve().then(() => denoiser.disable()).catch(() => {}).finally(() => denoiser.destroy().catch(() => {}));
    }
    if (blurProc) {
      localVideoTrackRef.current?.unpipe();
      blurProc.unpipe();
      Promise.resolve().then(() => blurProc.disable()).catch(() => {}).finally(() => blurProc.release().catch(() => {}));
    }
    setNoiseSuppressionState(false);
    setBackgroundBlurState(false);

    // Switch off and close every local track of this call (mic, camera, screen, and any duplicate).
    releaseTracks([localAudioTrackRef.current, localVideoTrackRef.current, screenTrackRef.current, ...openedTracksRef.current]
      .filter((t): t is NonNullable<typeof t> => !!t));
    openedTracksRef.current.clear();
    localAudioTrackRef.current = null;
    localVideoTrackRef.current = null;
    screenTrackRef.current = null;
    screenClientRef.current?.leave().catch(() => {});
    screenClientRef.current = null;
    setScreenShares([]);
    setNetworkQuality({ me: 0 });
    if (call && myUserId) publish(Destinations.callHand(), { conversationId: call.conversationId, raised: false }).catch(() => {});
    setRaisedHands(new Set());
    setConnectionUnstable(false);
    badStreakRef.current = 0;

    // Leave Agora RTC channel
    if (agoraClientRef.current) {
      agoraClientRef.current.removeAllListeners();
      agoraClientRef.current.leave().catch(() => {});
      agoraClientRef.current = null;
    }
    openedClientsRef.current.forEach((c) => { c.removeAllListeners(); c.leave().catch(() => {}); });
    openedClientsRef.current.clear();

    groupInviteesRef.current = [];
    activeCallRef.current = null;
    setLocalStream(null);
    setParticipants([]);
    setActiveCall(null);
    setIncomingSignal(null);
    setIsMuted(false);
    setIsCamOff(false);
    setIsScreenSharing(false);
  }, [myUserId, sendSignal, stopRingtone, stopPresence]);

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
      micOn: !!user.hasAudio,
      camOn: !!user.hasVideo,
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

    const isScreen = (uid: number) => uid >= SCREEN_UID_OFFSET;
    const removeShare = (uid: number) =>
      setScreenShares((prev) => prev.filter((s) => s.ownerUid !== uid - SCREEN_UID_OFFSET));

    client.on("user-joined", (user) => {
      if (isScreen(Number(user.uid))) return; // someone's screen share, not a person
      // Someone answered: stop ringing and start the clock even before they publish media.
      stopRingtone();
      clearRingTimeout();
      upsertParticipant(user);
      updateCallState({ connectionState: "connected" });
      startDurationTimer();
    });

    client.on("user-published", async (user, mediaType) => {
      const uid = Number(user.uid);
      if (isScreen(uid)) {
        const ownerUid = uid - SCREEN_UID_OFFSET;
        // My own share is shown locally; don't download it back.
        if (ownerUid === useStore.getState().userId || mediaType !== "video") return;
        try {
          await client.subscribe(user, "video");
          const track = user.videoTrack?.getMediaStreamTrack();
          if (!track) return;
          const share: ScreenShare = { ownerUid, name: nameForUid(ownerUid), stream: new MediaStream([track]) };
          setScreenShares((prev) => [...prev.filter((s) => s.ownerUid !== ownerUid), share]);
        } catch (err) {
          console.warn("Couldn't show the shared screen:", err);
        }
        return;
      }
      try {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") {
          user.audioTrack?.play();
          const speaker = getPreferredDevices().speaker;
          if (speaker && canChooseSpeaker()) user.audioTrack?.setPlaybackDevice(speaker).catch(() => {});
        }
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
      if (isScreen(Number(user.uid))) { removeShare(Number(user.uid)); return; }
      upsertParticipant(user);
    });

    client.on("user-left", (user) => {
      const uid = Number(user.uid);
      // A screen share ending is not the person leaving (would otherwise end 1:1 calls).
      if (isScreen(uid)) { removeShare(uid); return; }
      setRaisedHands((prev) => { if (!prev.has(uid)) return prev; const n = new Set(prev); n.delete(uid); return n; });
      setParticipants((prev) => prev.filter((p) => p.uid !== uid));
      // A 1:1 call ends when the other person leaves; a group call keeps going.
      if (!activeCallRef.current?.isGroup) hangup();
    });

    // Every ~2s: my uplink/downlink and everyone else's (shown as signal bars).
    client.on("network-quality", (q) => {
      const next: NetworkQuality = { me: Math.max(q.uplinkNetworkQuality, q.downlinkNetworkQuality) };
      Object.entries(client.getRemoteNetworkQuality()).forEach(([uid, r]) => {
        if (Number(uid) < SCREEN_UID_OFFSET) next[Number(uid)] = Math.max(r.uplinkNetworkQuality, r.downlinkNetworkQuality);
      });
      setNetworkQuality(next);
      // Warn only after two bad readings in a row (~4s), and clear on the first good one.
      badStreakRef.current = next.me >= 4 ? badStreakRef.current + 1 : 0;
      setConnectionUnstable(badStreakRef.current >= 2);
    });

    client.on("connection-state-change", (state) => {
      if (state === "RECONNECTING") updateCallState({ connectionState: "reconnecting" });
      else if (state === "CONNECTED" && participantsRef.current.length > 0) updateCallState({ connectionState: "connected" });
    });

    agoraClientRef.current = client;
    return client;
  }, [stopRingtone, updateCallState, hangup, upsertParticipant]);

  /** Join the conversation's Agora channel and publish mic (+ camera for video). */
  /** Returns false (having released everything) if the call ended while connecting. */
  const joinChannel = useCallback(async (channelName: string, type: CallType): Promise<boolean> => {
    const epoch = callEpochRef.current;
    const ended = () => callEpochRef.current !== epoch;
    const AgoraRTC = await getAgoraRTC();
    if (!AgoraRTC || !myUserId) throw new Error("Agora unavailable");

    // The server only issues tokens for chats I'm in, always for my own user id.
    const tokenUrl = `/api/agora/token?channelName=${encodeURIComponent(channelName)}`;
    const { appId, token } = await apiGet<AgoraTokenResponse>(tokenUrl);
    const effectiveAppId = appId || process.env.NEXT_PUBLIC_AGORA_APP_ID || "";
    if (!effectiveAppId) throw new Error("Agora App ID is missing. Please configure NEXT_PUBLIC_AGORA_APP_ID.");

    const client = await setupAgoraClient();
    if (!client) throw new Error("Agora unavailable");
    openedClientsRef.current.add(client);
    await client.join(effectiveAppId, channelName, token || null, myUserId);
    if (ended()) { client.leave().catch(() => {}); return false; }

    // Tokens are short-lived (2h): fetch a fresh one shortly before expiry so long calls never drop.
    const renewToken = async () => {
      try {
        const fresh = await apiGet<AgoraTokenResponse>(tokenUrl);
        await client.renewToken(fresh.token);
      } catch (err) {
        console.warn("Couldn't renew the call token:", err);
      }
    };
    client.on("token-privilege-will-expire", renewToken);
    client.on("token-privilege-did-expire", renewToken);

    // Preferred devices; if one was unplugged since, fall back to the system default.
    const prefs = getPreferredDevices();
    const withFallback = async <T,>(make: (id?: string) => Promise<T>, id?: string) => {
      try { return await make(id); } catch (err) { if (!id) throw err; return make(undefined); }
    };

    // Audio with native noise suppression / echo cancellation
    const audioTrack = await withFallback((microphoneId) => AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: "speech_standard",
      AEC: true,
      ANS: true,
      AGC: true,
      microphoneId,
    }), prefs.mic);
    openedTracksRef.current.add(audioTrack);
    if (ended()) { audioTrack.close(); client.leave().catch(() => {}); return false; }
    localAudioTrackRef.current?.close(); // never leave an earlier mic running underneath
    localAudioTrackRef.current = audioTrack;

    const tracks: (IMicrophoneAudioTrack | ICameraVideoTrack)[] = [audioTrack];
    if (type === "VIDEO") {
      const videoTrack = await withFallback((cameraId) => AgoraRTC.createCameraVideoTrack({ cameraId }), prefs.camera);
      openedTracksRef.current.add(videoTrack);
      if (ended()) { videoTrack.close(); audioTrack.close(); client.leave().catch(() => {}); return false; }
      localVideoTrackRef.current?.close();
      localVideoTrackRef.current = videoTrack;
      tracks.push(videoTrack);
      setLocalStream(new MediaStream([videoTrack.getMediaStreamTrack()]));
    } else {
      setLocalStream(null);
    }
    await client.publish(tracks);
    if (ended()) return false; // hangup already closed the tracks and left

    // Effects from my saved preferences; failures just leave the plain mic/camera.
    const fx = getEffectPrefs();
    applyNoiseSuppression(fx.noise).then(setNoiseSuppressionState);
    if (type === "VIDEO" && fx.blur) applyBackgroundBlur(true).then(setBackgroundBlurState);
    return true;
  }, [myUserId, setupAgoraClient, applyNoiseSuppression, applyBackgroundBlur]);

  // Raised hands for the call I'm in (members-only topic; the server stamps who raised it).
  const callConversationId = activeCall?.conversationId ?? null;
  useEffect(() => {
    if (callConversationId === null) return;
    let sub: { unsubscribe: () => void } | null = null;
    let alive = true;
    subscribe(`/topic/conversation.${callConversationId}.hand`, (frame) => {
      const ev = JSON.parse(frame.body) as { userId: number; name: string; raised: boolean };
      setRaisedHands((prev) => {
        const n = new Set(prev);
        if (ev.raised) n.add(ev.userId); else n.delete(ev.userId);
        return n;
      });
      if (ev.raised && ev.userId !== myUserId) showToast(`✋ ${ev.name} raised their hand`);
    }).then((s) => { if (alive) sub = s; else s.unsubscribe(); }).catch(() => {});
    return () => { alive = false; sub?.unsubscribe(); };
  }, [callConversationId, myUserId]);

  const toggleHand = useCallback(() => {
    const call = activeCallRef.current;
    if (!call || !myUserId) return;
    const raised = !raisedHands.has(myUserId);
    setRaisedHands((prev) => { const n = new Set(prev); if (raised) n.add(myUserId); else n.delete(myUserId); return n; });
    publish(Destinations.callHand(), { conversationId: call.conversationId, raised }).catch(() => {});
  }, [myUserId, raisedHands]);

  /** In-call toggles; the choice is remembered for next time. */
  const setNoiseSuppression = useCallback(async (on: boolean) => {
    setEffectPref("noise", on);
    setNoiseSuppressionState(await applyNoiseSuppression(on));
  }, [applyNoiseSuppression]);
  const setBackgroundBlur = useCallback(async (on: boolean) => {
    setEffectPref("blur", on);
    setBackgroundBlurState(await applyBackgroundBlur(on));
  }, [applyBackgroundBlur]);

  const incomingRef = useRef<CallSignal | null>(null);
  useEffect(() => { incomingRef.current = incomingSignal; }, [incomingSignal]);

  /** Show the ringing screen and play the ringtone for an incoming call. */
  const ringIncoming = useCallback((signal: CallSignal, notify: boolean) => {
    setIncomingSignal(signal);
    // Tab in the background: also show a desktop notification (respects Do Not Disturb).
    if (notify) {
      desktopNotify(
        signal.callType === "VIDEO" ? "🎥 Incoming video call" : "📞 Incoming voice call",
        signal.isGroup ? `${signal.fromUserName} started a call in ${signal.groupName ?? "a group"}` : `${signal.fromUserName} is calling you`,
        { tag: `call-${signal.conversationId}` },
      );
    }
    stopRingtone();
    ringtoneStopRef.current = startRingtone();
    clearRingTimeout();
    timeoutRef.current = setTimeout(() => {
      stopRingtone();
      setIncomingSignal(null);
    }, signal.isGroup ? GROUP_RING_TIMEOUT_MS + 5_000 : RING_TIMEOUT_MS + 5_000);
  }, [stopRingtone]);

  // Handle WebSocket call signaling
  useEffect(() => {
    if (!myUserId) return;
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        sub = await subscribe(Topics.callQueue(), async (frame) => {
          const signal: CallSignal = JSON.parse(frame.body);
          if (signal.fromUserId === myUserId) return;

          if (signal.type === "OFFER") {
            // Already in a call: let the caller know we're busy (1:1 only).
            if (activeCallRef.current) {
              if (!signal.isGroup) sendSignal(signal.fromUserId, { type: "HANGUP", conversationId: signal.conversationId, callId: signal.callId });
              return;
            }
            // Already ringing for this call (found when the app opened): don't start over.
            if (incomingRef.current?.conversationId === signal.conversationId) return;
            ringIncoming(signal, true);
          } else if (signal.type === "ENDED") {
            // Only that exact call: a new call in the same chat right after must not be cut off.
            const sameCall = (c: { conversationId: number; callId?: number | null } | null) =>
              !!c && (signal.callId ? c.callId === signal.callId : c.conversationId === signal.conversationId);
            if (sameCall(activeCallRef.current)) hangup();
            if (sameCall(incomingRef.current)) {
              stopRingtone();
              clearRingTimeout();
              setIncomingSignal(null);
            }
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
  }, [myUserId, hangup, stopRingtone, updateCallState, sendSignal, ringIncoming]);

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
    if (!myUserId || activeCallRef.current || startingRef.current) return;
    startingRef.current = true;
    const channelName = `call_conv_${conversationId}`;

    try {
      const callId = await logCallStart(conversationId, type);
      const call: ActiveCall = {
        conversationId, remoteUserId, remoteUserName, callType: type,
        isInitiator: true, connectionState: "ringing", durationSecs: 0, callId,
      };
      activeCallRef.current = call;
      setActiveCall(call);

      if (!(await joinChannel(channelName, type))) return;
      ringtoneStopRef.current = startRingtone();
      timeoutRef.current = setTimeout(() => {
        if (participantsRef.current.length === 0) hangup();
      }, RING_TIMEOUT_MS);

      // Notify recipient via WebSocket so their phone/browser rings
      await sendSignal(remoteUserId, { type: "OFFER", conversationId, sdp: channelName, callType: type, callId });
    } catch (err) {
      console.error("Failed to initiate call with Agora:", err);
      alert(describeCallError(err));
      hangup();
    } finally {
      startingRef.current = false;
    }
  }, [myUserId, joinChannel, hangup, sendSignal]);

  // Start a group call: everyone in the chat is rung and joins the same channel.
  const initiateGroupCall = useCallback(async (
    conversationId: number,
    groupName: string,
    memberIds: number[],
    type: CallType
  ) => {
    if (!myUserId || activeCallRef.current || startingRef.current) return;
    startingRef.current = true;
    const channelName = `call_conv_${conversationId}`;

    try {
      const callId = await logCallStart(conversationId, type);
      const call: ActiveCall = {
        conversationId, remoteUserId: 0, remoteUserName: groupName, callType: type,
        isInitiator: true, connectionState: "ringing", durationSecs: 0, isGroup: true, callId,
      };
      activeCallRef.current = call;
      setActiveCall(call);

      if (!(await joinChannel(channelName, type))) return;
      if (callId) startPresence(callId);
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
      alert(describeCallError(err));
      hangup();
    } finally {
      startingRef.current = false;
    }
  }, [myUserId, joinChannel, hangup, sendSignal, stopRingtone, startPresence]);

  // Accept incoming call (1:1 or group)
  const acceptCall = useCallback(async (signal: CallSignal, callType: CallType) => {
    // Ignore a second tap on Accept (or accepting while already in a call).
    if (!myUserId || activeCallRef.current || startingRef.current) return;
    startingRef.current = true;
    stopRingtone();
    clearRingTimeout();

    // Derived from the chat, never taken from the signal (the server only issues tokens for this channel anyway).
    const channelName = `call_conv_${signal.conversationId}`;

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

      if (!(await joinChannel(channelName, callType))) return;
      if (signal.callId) apiPost(`/api/calls/${signal.callId}/accept`).catch(() => {});
      if (signal.isGroup && signal.callId) startPresence(signal.callId);
      await sendSignal(signal.fromUserId, {
        type: "ANSWER", conversationId: signal.conversationId, sdp: channelName, callId: signal.callId, isGroup: signal.isGroup,
      });
    } catch (err) {
      console.error("Failed to accept call with Agora:", err);
      alert(describeCallError(err));
      hangup();
    } finally {
      startingRef.current = false;
    }
  }, [myUserId, joinChannel, hangup, sendSignal, stopRingtone, startPresence]);

  /**
   * The app was opened (or brought back on screen) while a call rings for me — e.g. from the call
   * notification. Show the ringing screen, or answer straight away if "Answer" was tapped.
   */
  const resumeIncomingCall = useCallback(async (answerConversationId: number | null) => {
    if (!myUserId || activeCallRef.current || startingRef.current) return;
    let call: RingingCall | null;
    try {
      call = (await apiGet<{ call: RingingCall | null }>("/api/calls/incoming")).call;
    } catch {
      return;
    }
    if (!call || activeCallRef.current) return;
    const signal: CallSignal = {
      type: "OFFER", conversationId: call.conversationId, fromUserId: call.fromUserId, fromUserName: call.fromUserName,
      toUserId: myUserId, callType: call.callType, callId: call.callId, isGroup: call.isGroup, groupName: call.groupName,
      sdp: `call_conv_${call.conversationId}`,
    };
    if (answerConversationId === call.conversationId) {
      acceptCall(signal, call.callType);
      return;
    }
    if (incomingRef.current?.conversationId === call.conversationId) return;
    ringIncoming(signal, false);
  }, [myUserId, acceptCall, ringIncoming]);

  // Opened from a call notification (?answer= / ?ringing=), told so by the service worker, or brought
  // back on screen while something rings: catch up on the call instead of missing it.
  useEffect(() => {
    if (!myUserId) return;
    const params = new URLSearchParams(window.location.search);
    const conv = Number(params.get("conv")) || null;
    if (params.has("answer") || params.has("ringing")) {
      // Async (fetches the ringing call first); state is only set once it answers.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resumeIncomingCall(params.has("answer") ? conv : null);
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      resumeIncomingCall(null);
    }
    const onVisible = () => { if (document.visibilityState === "visible") resumeIncomingCall(null); };
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "call-action") resumeIncomingCall(e.data.answer ? e.data.conversationId : null);
    };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [myUserId, resumeIncomingCall]);

  // Join a group call that's already running (missed the ring, or rejoining after a drop).
  const joinOngoingCall = useCallback(async (conversationId: number, callId: number, callType: CallType, groupName: string) => {
    if (!myUserId || activeCallRef.current || startingRef.current) return;
    startingRef.current = true;
    const call: ActiveCall = {
      conversationId, remoteUserId: 0, remoteUserName: groupName, callType,
      isInitiator: false, connectionState: "connecting", durationSecs: 0, isGroup: true, callId,
    };
    activeCallRef.current = call;
    setActiveCall(call);
    try {
      if (!(await joinChannel(`call_conv_${conversationId}`, callType))) return;
      startPresence(callId);
    } catch (err) {
      console.error("Failed to join the call:", err);
      alert(describeCallError(err));
      hangup();
    } finally {
      startingRef.current = false;
    }
  }, [myUserId, joinChannel, startPresence, hangup]);

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
  /** Switch mic, camera or speaker during a call (and remember it for next time). */
  const switchDevice = useCallback(async (kind: DeviceKind, deviceId: string) => {
    setPreferredDevice(kind, deviceId);
    try {
      if (kind === "mic") await localAudioTrackRef.current?.setDevice(deviceId);
      if (kind === "camera" && localVideoTrackRef.current) {
        await localVideoTrackRef.current.setDevice(deviceId);
        setLocalStream(new MediaStream([localVideoTrackRef.current.getMediaStreamTrack()]));
      }
      if (kind === "speaker") {
        await Promise.all((agoraClientRef.current?.remoteUsers ?? [])
          .map((u) => u.audioTrack?.setPlaybackDevice(deviceId).catch(() => {})));
      }
    } catch (err) {
      console.warn("Couldn't switch device:", err);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (localVideoTrackRef.current) {
      const nextCamOff = !isCamOff;
      localVideoTrackRef.current.setEnabled(!nextCamOff);
      setIsCamOff(nextCamOff);
    }
  }, [isCamOff]);

  const stopScreenShare = useCallback(async () => {
    const screen = screenTrackRef.current;
    const sc = screenClientRef.current;
    screenTrackRef.current = null;
    screenClientRef.current = null;
    if (sc) await sc.leave().catch(() => {});
    screen?.close();
    setIsScreenSharing(false);
  }, []);

  // Share screen to everyone in the call (replaces the camera while sharing).
  const toggleScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      await stopScreenShare();
      return;
    }
    const call = activeCallRef.current;
    const AgoraRTC = await getAgoraRTC();
    if (!call || !AgoraRTC || !myUserId) return;
    let screen: ILocalVideoTrack | null = null;
    try {
      const created = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1", optimizationMode: "detail" }, "disable");
      const track = Array.isArray(created) ? created[0] : created;
      screen = track;
      // The screen goes out on its own connection so the camera keeps running alongside it.
      const channelName = `call_conv_${call.conversationId}`;
      const tokenUrl = `/api/agora/token?channelName=${encodeURIComponent(channelName)}&screen=true`;
      const { appId, token } = await apiGet<AgoraTokenResponse>(tokenUrl);
      const sc = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      const renew = () => apiGet<AgoraTokenResponse>(tokenUrl).then((t) => sc.renewToken(t.token)).catch(() => {});
      sc.on("token-privilege-will-expire", renew);
      sc.on("token-privilege-did-expire", renew);
      await sc.join(appId || process.env.NEXT_PUBLIC_AGORA_APP_ID || "", channelName, token || null, myUserId + SCREEN_UID_OFFSET);
      await sc.publish(track);
      screenClientRef.current = sc;
      screenTrackRef.current = track;
      track.on("track-ended", () => { stopScreenShare(); }); // browser's own "Stop sharing" bar
      setIsScreenSharing(true);
    } catch (err) {
      screen?.close();
      // User cancelled the browser's picker, or sharing isn't supported.
      console.warn("Screen share cancelled or failed:", err);
    }
  }, [stopScreenShare, myUserId]);

  return {
    activeCall,
    incomingSignal,
    localStream,
    participants,
    screenShares,
    networkQuality,
    connectionUnstable,
    noiseSuppression,
    backgroundBlur,
    raisedHands,
    toggleHand,
    setNoiseSuppression,
    setBackgroundBlur,
    isMuted,
    isCamOff,
    isScreenSharing,
    initiateCall,
    initiateGroupCall,
    joinOngoingCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    switchDevice,
  };
}
