"use client";

import { useEffect, useState } from "react";
import { X, Settings, Sun, Moon, Bell, Keyboard, Type, Image as ImageIcon, Volume2, Shield } from "lucide-react";
import SecuritySettings from "./SecuritySettings";
import type { Theme } from "@/hooks/useTheme";
import {
  FontSize, Wallpaper, getFontSize, setFontSize, getWallpaper, setWallpaper,
  isSoundEnabled, setSoundEnabled, getDndUntil, setDndUntil, getQuietHours, setQuietHours, QuietHours,
} from "@/lib/preferences";

interface SettingsModalProps {
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Default" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
];

const WALLPAPERS: { value: Wallpaper; label: string }[] = [
  { value: "none", label: "None" },
  { value: "dots", label: "Dots" },
  { value: "grid", label: "Grid" },
  { value: "sky", label: "Sky" },
  { value: "sunset", label: "Sunset" },
  { value: "mint", label: "Mint" },
];

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Ctrl + K", action: "Search everything" },
  { keys: "Alt + ↑ / ↓", action: "Previous / next chat" },
  { keys: "Ctrl + Shift + F", action: "Search in this chat" },
  { keys: "↑ (empty message box)", action: "Edit your last message" },
  { keys: "Esc", action: "Close reply, search, panel or dialog" },
  { keys: "Enter", action: "Send message" },
  { keys: "Ctrl + /", action: "Show this list" },
];

type NotifState = NotificationPermission | "unsupported";

function readNotifPermission(): NotifState {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

export default function SettingsModal({ onClose, theme, setTheme }: SettingsModalProps) {
  const [fontSize, setFontSizeState] = useState<FontSize>(getFontSize);
  const [wallpaper, setWallpaperState] = useState<Wallpaper>(getWallpaper);
  const [sound, setSound] = useState(isSoundEnabled);
  const [notif, setNotif] = useState<NotifState>(readNotifPermission);
  const [dndUntil, setDndUntilState] = useState<number | null>(getDndUntil);
  const [quiet, setQuiet] = useState<QuietHours>(getQuietHours);

  const pauseFor = (ms: number | "tomorrow" | null) => {
    let until: number | null = null;
    if (ms === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      until = d.getTime();
    } else if (ms) {
      until = Date.now() + ms;
    }
    setDndUntil(until);
    setDndUntilState(until);
  };

  const updateQuiet = (patch: Partial<QuietHours>) => {
    const next = { ...quiet, ...patch };
    setQuietHours(next);
    setQuiet(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const enableNotifications = async () => {
    if (!("Notification" in window)) return;
    setNotif(await Notification.requestPermission());
  };

  return (
    <div className="stm-overlay" onClick={onClose}>
      <div className="stm-modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="stm-header">
          <h3><Settings size={17} /> Settings</h3>
          <button type="button" className="stm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="stm-body">
          <section className="stm-section">
            <h4>Theme</h4>
            <div className="stm-seg">
              <button type="button" className={theme === "light" ? "stm-on" : ""} onClick={() => setTheme("light")}>
                <Sun size={15} /> Light
              </button>
              <button type="button" className={theme === "dark" ? "stm-on" : ""} onClick={() => setTheme("dark")}>
                <Moon size={15} /> Dark
              </button>
            </div>
          </section>

          <section className="stm-section">
            <h4><Type size={14} /> Text size</h4>
            <div className="stm-seg">
              {FONT_SIZES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={fontSize === f.value ? "stm-on" : ""}
                  onClick={() => { setFontSize(f.value); setFontSizeState(f.value); }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          <section className="stm-section">
            <h4><ImageIcon size={14} /> Chat wallpaper</h4>
            <div className="stm-wallpapers">
              {WALLPAPERS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  className={`stm-wp stm-wp--${w.value} ${wallpaper === w.value ? "stm-wp--on" : ""}`}
                  onClick={() => { setWallpaper(w.value); setWallpaperState(w.value); }}
                  aria-pressed={wallpaper === w.value}
                >
                  <span>{w.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="stm-section">
            <h4><Bell size={14} /> Notifications</h4>
            <label className="stm-row">
              <span><Volume2 size={15} /> Message sound</span>
              <input
                type="checkbox"
                checked={sound}
                onChange={(e) => { setSoundEnabled(e.target.checked); setSound(e.target.checked); }}
              />
            </label>
            <div className="stm-row">
              <span><Bell size={15} /> Desktop notifications</span>
              {notif === "granted" ? (
                <span className="stm-pill stm-pill--ok">On</span>
              ) : notif === "denied" ? (
                <span className="stm-pill">Blocked in browser settings</span>
              ) : notif === "unsupported" ? (
                <span className="stm-pill">Not supported</span>
              ) : (
                <button type="button" className="stm-btn" onClick={enableNotifications}>Turn on</button>
              )}
            </div>
          </section>

          <section className="stm-section">
            <h4><Shield size={14} /> Security</h4>
            <SecuritySettings />
          </section>

          <section className="stm-section">
            <h4><Moon size={14} /> Do Not Disturb</h4>
            <p className="stm-note">
              Silences message sounds and desktop alerts. Unread badges still update. A “Focus / DND” work status also turns this on.
            </p>
            <div className="stm-row">
              <span>{dndUntil ? `Paused until ${new Date(dndUntil).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "Notifications are on"}</span>
              {dndUntil ? (
                <button type="button" className="stm-btn" onClick={() => pauseFor(null)}>Resume</button>
              ) : null}
            </div>
            {!dndUntil && (
              <div className="stm-seg">
                <button type="button" onClick={() => pauseFor(60 * 60_000)}>1 hour</button>
                <button type="button" onClick={() => pauseFor(3 * 60 * 60_000)}>3 hours</button>
                <button type="button" onClick={() => pauseFor("tomorrow")}>Until tomorrow</button>
              </div>
            )}
            <label className="stm-row">
              <span>Quiet hours every day</span>
              <input type="checkbox" checked={quiet.enabled} onChange={(e) => updateQuiet({ enabled: e.target.checked })} />
            </label>
            {quiet.enabled && (
              <>
                <div className="stm-row">
                  <span>From</span>
                  <input type="time" className="stm-time" value={quiet.start} onChange={(e) => updateQuiet({ start: e.target.value })} />
                  <span>to</span>
                  <input type="time" className="stm-time" value={quiet.end} onChange={(e) => updateQuiet({ end: e.target.value })} />
                </div>
                <label className="stm-row">
                  <span>Also quiet all weekend</span>
                  <input type="checkbox" checked={quiet.weekends} onChange={(e) => updateQuiet({ weekends: e.target.checked })} />
                </label>
              </>
            )}
          </section>

          <section className="stm-section">
            <h4><Keyboard size={14} /> Keyboard shortcuts</h4>
            <ul className="stm-shortcuts">
              {SHORTCUTS.map((s) => (
                <li key={s.keys}><kbd>{s.keys}</kbd><span>{s.action}</span></li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <style>{`
        .stm-overlay {
          position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .stm-modal {
          width: 100%; max-width: 460px; max-height: min(720px, 92vh); display: flex; flex-direction: column;
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
          box-shadow: var(--shadow-lg, 0 20px 50px rgba(0,0,0,0.25));
        }
        .stm-header {
          display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1rem;
          border-bottom: 1px solid var(--border);
        }
        .stm-header h3 { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1rem; color: var(--text-primary); }
        .stm-close { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .stm-close:hover { background: var(--bg-tertiary); }
        .stm-body { overflow-y: auto; padding: 0.5rem 1rem 1.1rem; display: flex; flex-direction: column; gap: 1rem; }
        .stm-section h4 {
          display: flex; align-items: center; gap: 0.4rem; margin: 0.5rem 0 0.5rem; font-size: 0.72rem;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint);
        }
        .stm-seg { display: flex; flex-wrap: wrap; gap: 4px; background: var(--bg-tertiary); padding: 3px; border-radius: 10px; }
        .stm-seg button {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; min-width: 70px;
          border: none; background: transparent; padding: 0.45rem 0.5rem; border-radius: 8px; cursor: pointer;
          font-size: 0.8rem; font-weight: 600; color: var(--text-muted);
        }
        .stm-seg button.stm-on { background: var(--bg-primary); color: var(--accent); box-shadow: var(--shadow-sm); }
        .stm-wallpapers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
        .stm-wp {
          height: 58px; border-radius: 10px; border: 2px solid var(--border); cursor: pointer; position: relative;
          display: flex; align-items: flex-end; justify-content: flex-start; padding: 4px 6px; background: var(--bg-secondary);
        }
        .stm-wp span { font-size: 0.7rem; font-weight: 600; color: var(--text-secondary); }
        .stm-wp--on { border-color: var(--accent); }
        .stm-wp--dots { background: radial-gradient(circle, color-mix(in srgb, var(--text-faint) 30%, transparent) 1px, transparent 1.5px) 0 0 / 12px 12px, var(--bg-secondary); }
        .stm-wp--grid {
          background:
            linear-gradient(color-mix(in srgb, var(--text-faint) 16%, transparent) 1px, transparent 1px) 0 0 / 14px 14px,
            linear-gradient(90deg, color-mix(in srgb, var(--text-faint) 16%, transparent) 1px, transparent 1px) 0 0 / 14px 14px,
            var(--bg-secondary);
        }
        .stm-wp--sky { background: linear-gradient(160deg, color-mix(in srgb, #38bdf8 30%, var(--bg-secondary)), var(--bg-secondary)); }
        .stm-wp--sunset { background: linear-gradient(160deg, color-mix(in srgb, #fb923c 30%, var(--bg-secondary)), color-mix(in srgb, #e879f9 24%, var(--bg-secondary))); }
        .stm-wp--mint { background: linear-gradient(160deg, color-mix(in srgb, #34d399 30%, var(--bg-secondary)), var(--bg-secondary)); }
        .stm-row {
          display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.45rem 0;
          font-size: 0.85rem; color: var(--text-primary); cursor: default;
        }
        .stm-row > span:first-child { display: inline-flex; align-items: center; gap: 0.45rem; }
        .stm-pill { font-size: 0.72rem; color: var(--text-muted); background: var(--bg-tertiary); padding: 2px 8px; border-radius: 999px; }
        .stm-pill--ok { color: var(--success-text); background: var(--success-soft); }
        .stm-btn {
          border: none; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.78rem;
          padding: 0.35rem 0.75rem; border-radius: 8px; cursor: pointer;
        }
        .stm-note { margin: 0 0 0.4rem; font-size: 0.76rem; color: var(--text-muted); line-height: 1.4; }
        .stm-time {
          border: 1px solid var(--border); border-radius: 8px; padding: 0.25rem 0.4rem; font: inherit; font-size: 0.8rem;
          background: var(--bg-secondary); color: var(--text-primary);
        }
        .stm-shortcuts { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
        .stm-shortcuts li { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; font-size: 0.82rem; color: var(--text-secondary); }
        .stm-shortcuts kbd {
          font-family: inherit; font-size: 0.72rem; font-weight: 600; color: var(--text-primary);
          background: var(--bg-tertiary); border: 1px solid var(--border); border-bottom-width: 2px;
          padding: 2px 7px; border-radius: 6px; white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
