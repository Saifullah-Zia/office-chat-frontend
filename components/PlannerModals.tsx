"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, Clock, AlarmClock, ListTodo, Loader2, CheckCircle2 } from "lucide-react";
import { apiPost, apiErrorMessage } from "@/lib/api";
import { useStore } from "@/lib/store";
import { MemberResponse, MessageResponse, ScheduledMessageView, TaskView } from "@/types";

// ── Time presets ─────────────────────────────────────────────────────

function at(base: Date, h: number, m = 0): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function presets(): { label: string; date: Date }[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  const list = [
    { label: "In 20 minutes", date: new Date(now.getTime() + 20 * 60_000) },
    { label: "In 1 hour", date: new Date(now.getTime() + 60 * 60_000) },
    { label: "In 3 hours", date: new Date(now.getTime() + 3 * 60 * 60_000) },
    { label: "Tomorrow 9:00 AM", date: at(tomorrow, 9) },
    { label: "Next Monday 9:00 AM", date: at(nextMonday, 9) },
  ];
  const evening = at(now, 17);
  if (evening.getTime() - now.getTime() > 30 * 60_000) list.splice(2, 0, { label: "Today 5:00 PM", date: evening });
  return list;
}

/** "YYYY-MM-DDTHH:MM" in local time, for <input type="datetime-local"> */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatWhen(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface WhenPickerProps {
  value: Date | null;
  onChange: (d: Date | null) => void;
  allowNone?: boolean;
}

export function WhenPicker({ value, onChange, allowNone }: WhenPickerProps) {
  // Computed once when the picker opens, so the preset times stay stable while choosing.
  const [options] = useState(presets);
  const [minInput] = useState(() => toLocalInput(new Date(Date.now() + 60_000)));
  const [custom, setCustom] = useState(false);
  return (
    <div className="wp">
      <div className="wp-chips">
        {allowNone && (
          <button type="button" className={`wp-chip ${value === null && !custom ? "wp-chip--on" : ""}`} onClick={() => { setCustom(false); onChange(null); }}>
            No date
          </button>
        )}
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={`wp-chip ${!custom && value?.getTime() === o.date.getTime() ? "wp-chip--on" : ""}`}
            onClick={() => { setCustom(false); onChange(o.date); }}
          >
            {o.label}
          </button>
        ))}
        <button type="button" className={`wp-chip ${custom ? "wp-chip--on" : ""}`} onClick={() => setCustom(true)}>
          Pick date & time…
        </button>
      </div>
      {custom && (
        <input
          type="datetime-local"
          className="wp-input"
          min={minInput}
          value={value ? toLocalInput(value) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
        />
      )}
      {value && <p className="wp-summary">{formatWhen(value)}</p>}
    </div>
  );
}

// ── Shared modal shell ───────────────────────────────────────────────

function Shell({ title, icon, onClose, children, footer }: {
  title: string; icon: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="plm-overlay" onClick={onClose}>
      <div className="plm-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="plm-header">
          <h3>{icon} {title}</h3>
          <button type="button" className="plm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="plm-body">{children}</div>
        {footer && <footer className="plm-footer">{footer}</footer>}
      </div>
      <style>{`
        .plm-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .plm-modal { width: 100%; max-width: 440px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-lg, 0 20px 50px rgba(0,0,0,0.25)); }
        .plm-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .plm-header h3 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1rem; color: var(--text-primary); }
        .plm-close { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .plm-close:hover { background: var(--bg-tertiary); }
        .plm-body { padding: 0.85rem 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
        .plm-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
        .plm-label { margin: 0; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); }
        .plm-quote { margin: 0; padding: 0.5rem 0.7rem; border-left: 3px solid var(--accent); background: var(--bg-secondary); border-radius: 8px; font-size: 0.82rem; color: var(--text-secondary); word-break: break-word; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .plm-field { border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.65rem; font: inherit; font-size: 0.86rem; background: var(--bg-secondary); color: var(--text-primary); outline: none; width: 100%; }
        .plm-field:focus { border-color: var(--accent); }
        textarea.plm-field { resize: vertical; }
        .plm-error { margin: 0; color: var(--danger); font-size: 0.8rem; }
        .plm-cancel { border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); border-radius: 10px; padding: 0.5rem 0.9rem; font-weight: 600; font-size: 0.84rem; cursor: pointer; }
        .plm-submit { display: inline-flex; align-items: center; gap: 0.4rem; border: none; background: var(--accent); color: #fff; border-radius: 10px; padding: 0.5rem 1rem; font-weight: 600; font-size: 0.84rem; cursor: pointer; }
        .plm-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .plm-done { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4rem; padding: 1rem 0; color: var(--success-text); }
        .plm-done p { margin: 0; font-weight: 700; color: var(--text-primary); }
        .wp { display: flex; flex-direction: column; gap: 0.5rem; }
        .wp-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .wp-chip { border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); padding: 0.35rem 0.7rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .wp-chip--on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .wp-input { border: 1px solid var(--border); border-radius: 10px; padding: 0.45rem 0.6rem; font: inherit; font-size: 0.85rem; background: var(--bg-secondary); color: var(--text-primary); }
        .wp-summary { margin: 0; font-size: 0.8rem; color: var(--accent); font-weight: 600; }
      `}</style>
    </div>
  );
}

// ── Send later ───────────────────────────────────────────────────────

export function ScheduleMessageModal({ conversationId, initialText, onClose, onScheduled }: {
  conversationId: number;
  initialText: string;
  onClose: () => void;
  onScheduled: (s: ScheduledMessageView) => void;
}) {
  const [text, setText] = useState(initialText);
  const [when, setWhen] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!when || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const s = await apiPost<ScheduledMessageView>("/api/scheduled", {
        conversationId, content: text.trim(), sendAt: when.toISOString(),
      });
      onScheduled(s);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't schedule the message.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Send later"
      icon={<Clock size={16} />}
      onClose={onClose}
      footer={<>
        <button type="button" className="plm-cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="plm-submit" disabled={!when || !text.trim() || busy} onClick={submit}>
          {busy && <Loader2 size={14} className="spin" />} Schedule
        </button>
      </>}
    >
      <p className="plm-label">Message</p>
      <textarea className="plm-field" rows={3} maxLength={10000} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <p className="plm-label">When</p>
      <WhenPicker value={when} onChange={setWhen} />
      {error && <p className="plm-error">{error}</p>}
    </Shell>
  );
}

// ── Remind me ────────────────────────────────────────────────────────

export function RemindMeModal({ message, onClose }: { message: MessageResponse; onClose: () => void }) {
  const [when, setWhen] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Date | null>(null);

  const submit = async () => {
    if (!when) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/reminders", { messageId: message.id, note: note.trim() || undefined, remindAt: when.toISOString() });
      setDone(when);
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't set the reminder.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Remind me about this"
      icon={<AlarmClock size={16} />}
      onClose={onClose}
      footer={done ? <button type="button" className="plm-submit" onClick={onClose}>Done</button> : <>
        <button type="button" className="plm-cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="plm-submit" disabled={!when || busy} onClick={submit}>
          {busy && <Loader2 size={14} className="spin" />} Set reminder
        </button>
      </>}
    >
      {done ? (
        <div className="plm-done"><CheckCircle2 size={34} /><p>Reminder set for {formatWhen(done)}</p></div>
      ) : (
        <>
          <blockquote className="plm-quote">{message.senderName}: {message.content || "Attachment"}</blockquote>
          <p className="plm-label">When</p>
          <WhenPicker value={when} onChange={setWhen} />
          <input className="plm-field" placeholder="Note (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="plm-error">{error}</p>}
        </>
      )}
    </Shell>
  );
}

// ── Create task ──────────────────────────────────────────────────────

export function CreateTaskModal({ conversationId, message, onClose }: {
  conversationId?: number;
  message?: MessageResponse;
  onClose: () => void;
}) {
  const userId = useStore((s) => s.userId);
  const conversations = useStore((s) => s.conversations);
  const convId = message?.conversationId ?? conversationId;
  const members: MemberResponse[] = conversations.find((c) => c.id === convId)?.members ?? [];

  const [title, setTitle] = useState(() => (message?.content ?? "").replace(/\s+/g, " ").slice(0, 120));
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState<number | null>(userId);
  const [due, setDue] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<TaskView | null>(null);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const t = await apiPost<TaskView>("/api/tasks", {
        title: title.trim(),
        notes: notes.trim() || undefined,
        conversationId: convId,
        messageId: message?.id,
        assigneeId: assigneeId ?? undefined,
        dueAt: due ? due.toISOString() : undefined,
      });
      setCreated(t);
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't create the task.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="New task"
      icon={<ListTodo size={16} />}
      onClose={onClose}
      footer={created ? <button type="button" className="plm-submit" onClick={onClose}>Done</button> : <>
        <button type="button" className="plm-cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="plm-submit" disabled={!title.trim() || busy} onClick={submit}>
          {busy && <Loader2 size={14} className="spin" />} Create task
        </button>
      </>}
    >
      {created ? (
        <div className="plm-done">
          <CheckCircle2 size={34} />
          <p>Task created{created.assigneeId !== userId ? ` and assigned to ${created.assigneeName}` : ""}</p>
        </div>
      ) : (
        <>
          {message && <blockquote className="plm-quote">{message.senderName}: {message.content || "Attachment"}</blockquote>}
          <p className="plm-label">Task</p>
          <input className="plm-field" placeholder="What needs to be done?" maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className="plm-field" rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {members.length > 0 && (
            <>
              <p className="plm-label">Assign to</p>
              <select className="plm-field" value={assigneeId ?? ""} onChange={(e) => setAssigneeId(Number(e.target.value))}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.id === userId ? `${m.name} (me)` : m.name}</option>
                ))}
              </select>
            </>
          )}
          <p className="plm-label">Due</p>
          <WhenPicker value={due} onChange={setDue} allowNone />
          {error && <p className="plm-error">{error}</p>}
        </>
      )}
    </Shell>
  );
}
