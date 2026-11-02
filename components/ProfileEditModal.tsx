"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, Trash2, Loader2, UserCircle2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiPostForm, apiPut } from "@/lib/api";
import { useStore } from "@/lib/store";
import { updateStoredName } from "@/lib/auth";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { UserResponse } from "@/types";
import Avatar from "./Avatar";

const FRAME = 240;   // crop circle, CSS px
const OUTPUT = 512;  // uploaded square, px

interface Crop { img: HTMLImageElement; url: string; zoom: number; x: number; y: number }

/** Edit my photo (with a circular crop), name, job title and department. */
export default function ProfileEditModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const userId = useStore((s) => s.userId);
  const me = useStore((s) => s.users.find((u) => u.id === s.userId));
  const upsertUser = useStore((s) => s.upsertUser);
  const myName = useStore((s) => s.userName);
  const [name, setName] = useState(me?.name ?? myName ?? "");
  const [jobTitle, setJobTitle] = useState(me?.jobTitle ?? "");
  const [department, setDepartment] = useState(me?.department ?? "");
  const [crop, setCrop] = useState<Crop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Free the preview URL when the picked image changes (not on every pan/zoom).
  const cropUrl = crop?.url;
  useEffect(() => () => { if (cropUrl) URL.revokeObjectURL(cropUrl); }, [cropUrl]);

  // Image size on screen at a zoom level (1 = just covers the circle).
  const size = (c: Crop, zoom = c.zoom) => {
    const base = Math.max(FRAME / c.img.naturalWidth, FRAME / c.img.naturalHeight) * zoom;
    return { w: c.img.naturalWidth * base, h: c.img.naturalHeight * base };
  };
  // Keep the circle fully covered by the image.
  const clamp = (c: Crop, x: number, y: number, zoom = c.zoom) => {
    const { w, h } = size(c, zoom);
    return { x: Math.min(0, Math.max(FRAME - w, x)), y: Math.min(0, Math.max(FRAME - h, y)) };
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("Choose a JPG, PNG or WebP image."); return; }
    setError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c: Crop = { img, url, zoom: 1, x: 0, y: 0 };
      const { w, h } = size(c);
      setCrop({ ...c, x: (FRAME - w) / 2, y: (FRAME - h) / 2 }); // centred
    };
    img.onerror = () => setError("That image couldn't be opened.");
    img.src = url;
  };

  const setZoom = (zoom: number) => {
    if (!crop) return;
    // Zoom around the centre of the circle.
    const before = size(crop), after = size(crop, zoom);
    const cx = (FRAME / 2 - crop.x) / before.w, cy = (FRAME / 2 - crop.y) / before.h;
    setCrop({ ...crop, zoom, ...clamp(crop, FRAME / 2 - cx * after.w, FRAME / 2 - cy * after.h, zoom) });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let updated: UserResponse | null = null;
      if (crop) {
        const { w, h } = size(crop);
        const k = OUTPUT / FRAME;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = OUTPUT;
        canvas.getContext("2d")!.drawImage(crop.img, crop.x * k, crop.y * k, w * k, h * k);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
        if (!blob) throw new Error("Couldn't prepare the photo.");
        const form = new FormData();
        form.append("file", blob, "avatar.jpg");
        updated = await apiPostForm<UserResponse>("/api/users/me/photo", form);
      }
      const newName = name.trim().replace(/\s+/g, " ");
      if (newName.length < 2) throw new Error("Enter your name (at least 2 characters).");
      if ((me?.name ?? myName ?? "") !== newName || (me?.jobTitle ?? "") !== jobTitle.trim()
          || (me?.department ?? "") !== department.trim()) {
        updated = await apiPut<UserResponse>("/api/users/me/profile",
          { name: newName, jobTitle: jobTitle.trim(), department: department.trim() });
        updateStoredName(updated.name);
      }
      if (updated) upsertUser(updated);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err) ?? (err instanceof Error ? err.message : "Couldn't save your profile."));
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    try {
      upsertUser(await apiDelete<UserResponse>("/api/users/me/photo"));
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't remove the photo.");
    } finally {
      setBusy(false);
    }
  };

  const dims = crop ? size(crop) : null;

  return (
    <div className="pem-overlay" onClick={onClose}>
      <div className="pem-card" role="dialog" aria-modal="true" aria-labelledby="pem-title" onClick={(e) => e.stopPropagation()}>
        <header className="pem-header">
          <h3 id="pem-title"><UserCircle2 size={18} /> Edit profile</h3>
          <button type="button" className="pem-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="pem-body">
          {crop && dims ? (
            <>
              <div
                className="pem-crop"
                style={{ width: FRAME, height: FRAME }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }; }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (d) setCrop({ ...crop, ...clamp(crop, d.x + e.clientX - d.px, d.y + e.clientY - d.py) });
                }}
                onPointerUp={() => { drag.current = null; }}
                aria-label="Drag to position your photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={crop.url} alt="" draggable={false}
                  style={{ width: dims.w, height: dims.h, transform: `translate(${crop.x}px, ${crop.y}px)` }} />
              </div>
              <label className="pem-zoom">
                Zoom
                <input type="range" min={1} max={3} step={0.01} value={crop.zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              </label>
              <p className="pem-hint">Drag the photo to position it.</p>
            </>
          ) : (
            <div className="pem-current">
              <Avatar userId={userId} name={me?.name ?? "Me"} size={120} />
            </div>
          )}

          <div className="pem-photo-actions">
            <button type="button" className="pem-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Camera size={15} /> {me?.profilePicUrl || crop ? "Choose another photo" : "Upload photo"}
            </button>
            {me?.profilePicUrl && !crop && (
              <button type="button" className="pem-btn pem-btn--danger" onClick={removePhoto} disabled={busy}>
                <Trash2 size={15} /> Remove
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>

          <label className="pem-field">
            <span>Name</span>
            <input value={name} maxLength={100} placeholder="Your full name" autoComplete="name" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="pem-field">
            <span>Job title</span>
            <input value={jobTitle} maxLength={100} placeholder="e.g. Senior Designer" onChange={(e) => setJobTitle(e.target.value)} />
          </label>
          <label className="pem-field">
            <span>Department</span>
            <input value={department} maxLength={100} placeholder="e.g. Billing" onChange={(e) => setDepartment(e.target.value)} />
          </label>
          {error && <p className="pem-error" role="alert">{error}</p>}
        </div>

        <footer className="pem-footer">
          <button type="button" className="pem-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="pem-btn pem-btn--primary" onClick={save} disabled={busy}>
            {busy && <Loader2 size={14} className="spin" />} Save
          </button>
        </footer>
      </div>

      <style>{`
        .pem-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .pem-card { width: 100%; max-width: 400px; max-height: 92vh; overflow-y: auto; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .pem-header { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1rem; border-bottom: 1px solid var(--border); }
        .pem-header h3 { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--text-primary); }
        .pem-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .pem-body { padding: 1.1rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
        .pem-current { padding: 0.5rem 0; }
        .pem-crop { position: relative; overflow: hidden; border-radius: 50%; cursor: grab; touch-action: none; background: var(--bg-tertiary); box-shadow: 0 0 0 4px var(--accent-soft); }
        .pem-crop:active { cursor: grabbing; }
        .pem-crop img { position: absolute; top: 0; left: 0; max-width: none; user-select: none; pointer-events: none; }
        .pem-zoom { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; color: var(--text-secondary); width: ${FRAME}px; }
        .pem-zoom input { flex: 1; accent-color: var(--accent); }
        .pem-hint { margin: 0; font-size: 0.75rem; color: var(--text-muted); }
        .pem-photo-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
        .pem-field { display: flex; flex-direction: column; gap: 0.3rem; width: 100%; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); }
        .pem-field input { padding: 0.55rem 0.7rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-weight: 400; font-size: 0.9rem; }
        .pem-field input:focus { outline: none; border-color: var(--accent); }
        .pem-error { margin: 0; align-self: stretch; font-size: 0.8rem; color: var(--danger); }
        .pem-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
        .pem-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.85rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        .pem-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .pem-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .pem-btn--danger { color: var(--danger); }
      `}</style>
    </div>
  );
}
