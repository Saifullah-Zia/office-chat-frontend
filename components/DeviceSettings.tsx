"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Video, Volume2 } from "lucide-react";
import {
  DeviceKind, DeviceList, canChooseSpeaker, deviceLabel, getPreferredDevices, listDevices, setPreferredDevice,
} from "@/lib/devices";

const EMPTY: DeviceList = { mic: [], camera: [], speaker: [] };

/**
 * Mic / camera / speaker pickers. In Settings (test=true) it also shows a camera preview, a live mic
 * level and a speaker test. In a call (onSwitch) changes apply immediately.
 */
export default function DeviceSettings({ test = false, onSwitch }: { test?: boolean; onSwitch?: (kind: DeviceKind, id: string) => void }) {
  const [devices, setDevices] = useState<DeviceList>(EMPTY);
  const [chosen, setChosen] = useState<Partial<Record<DeviceKind, string>>>(getPreferredDevices);
  const [level, setLevel] = useState(0);
  const [denied, setDenied] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Device list, refreshed when something is plugged in or out.
  useEffect(() => {
    let alive = true;
    const load = () => listDevices(test).then((d) => {
      if (!alive) return;
      setDevices(d);
      setDenied(d.mic.length > 0 && d.mic.every((m) => !m.label));
    }).catch(() => {});
    load();
    navigator.mediaDevices?.addEventListener("devicechange", load);
    return () => { alive = false; navigator.mediaDevices?.removeEventListener("devicechange", load); };
  }, [test]);

  // Settings only: live camera preview and mic level for the chosen devices.
  useEffect(() => {
    if (!test) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let alive = true;
    navigator.mediaDevices.getUserMedia({
      audio: chosen.mic ? { deviceId: { exact: chosen.mic } } : true,
      video: devices.camera.length > 0 ? (chosen.camera ? { deviceId: { exact: chosen.camera } } : true) : false,
    }).then((s) => {
      if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setLevel(Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 80));
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => { if (alive) setDenied(true); });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [test, chosen.mic, chosen.camera, devices.camera.length]);

  const choose = (kind: DeviceKind, id: string) => {
    setPreferredDevice(kind, id);
    setChosen((c) => ({ ...c, [kind]: id }));
    onSwitch?.(kind, id);
  };

  /** Short two-note chime through the chosen speaker. */
  const testSpeaker = async () => {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.4);
      osc.connect(gain).connect(dest);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.4);
    });
    const audio = new Audio();
    audio.srcObject = dest.stream;
    const sink = chosen.speaker;
    if (sink && canChooseSpeaker()) await (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(sink).catch(() => {});
    await audio.play().catch(() => {});
    setTimeout(() => { audio.pause(); ctx.close().catch(() => {}); }, 900);
  };

  const row = (kind: DeviceKind, icon: React.ReactNode, label: string) => (
    <label className="dvs-row">
      <span className="dvs-label">{icon} {label}</span>
      <select value={chosen[kind] ?? ""} onChange={(e) => choose(kind, e.target.value)} disabled={devices[kind].length === 0}>
        <option value="">{devices[kind].length === 0 ? "None found" : "System default"}</option>
        {devices[kind].map((d, i) => <option key={d.deviceId} value={d.deviceId}>{deviceLabel(d, i, kind)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="dvs">
      {denied && <p className="dvs-warn">Allow microphone and camera access in your browser to see your devices.</p>}
      {row("mic", <Mic size={15} />, "Microphone")}
      {test && (
        <div className="dvs-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <div style={{ width: `${level * 100}%` }} />
        </div>
      )}
      {row("camera", <Video size={15} />, "Camera")}
      {test && devices.camera.length > 0 && <video ref={videoRef} className="dvs-preview" autoPlay muted playsInline />}
      {canChooseSpeaker() && row("speaker", <Volume2 size={15} />, "Speaker")}
      {test && <button type="button" className="dvs-test" onClick={testSpeaker}><Volume2 size={14} /> Test speaker</button>}

      <style>{`
        .dvs { display: flex; flex-direction: column; gap: 0.55rem; }
        .dvs-row { display: flex; flex-direction: column; gap: 0.25rem; }
        .dvs-label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
        .dvs-row select { width: 100%; padding: 0.45rem 0.55rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.82rem; }
        .dvs-meter { height: 6px; border-radius: 3px; background: var(--bg-tertiary); overflow: hidden; }
        .dvs-meter div { height: 100%; background: #16a34a; transition: width 0.08s linear; }
        .dvs-preview { width: 100%; max-height: 180px; border-radius: 10px; background: #000; object-fit: cover; transform: scaleX(-1); }
        .dvs-test { align-self: flex-start; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem; font-weight: 600; cursor: pointer; }
        .dvs-warn { margin: 0; font-size: 0.78rem; color: var(--danger); }
      `}</style>
    </div>
  );
}
