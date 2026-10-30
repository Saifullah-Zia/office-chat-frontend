"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  X, AtSign, ListTodo, AlarmClock, Clock, Loader2, Trash2, CornerDownRight, Plus, Check, BellRing,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ConversationResponse, MessageResponse, ReminderView, ScheduledMessageView, TaskView } from "@/types";
import { CreateTaskModal, formatWhen } from "./PlannerModals";
import Avatar from "./Avatar";

export type ActivityTab = "mentions" | "tasks" | "reminders" | "scheduled";

interface ActivityPanelProps {
  initialTab: ActivityTab;
  onClose: () => void;
  /** Called whenever counts may have changed, so the sidebar badge can refresh. */
  onChanged: () => void;
}

function chatName(convId: number | null | undefined, conversations: ConversationResponse[], myId: number | null) {
  const c = conversations.find((x) => x.id === convId);
  if (!c) return "Chat";
  return c.type === "GROUP" ? c.name ?? "Group" : c.members.find((m) => m.id !== myId)?.name ?? "Direct";
}

function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ActivityPanel({ initialTab, onClose, onChanged }: ActivityPanelProps) {
  const userId = useStore((s) => s.userId);
  const conversations = useStore((s) => s.conversations);
  const openChatAt = useStore((s) => s.openChatAt);

  const [tab, setTab] = useState<ActivityTab>(initialTab);
  const [mentions, setMentions] = useState<MessageResponse[] | null>(null);
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [taskScope, setTaskScope] = useState<"assigned" | "created">("assigned");
  const [reminders, setReminders] = useState<ReminderView[] | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledMessageView[] | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [openedAt] = useState(() => Date.now()); // reference time for "overdue"

  const loadTab = useCallback(async (t: ActivityTab, scope: "assigned" | "created") => {
    try {
      if (t === "mentions") setMentions(await apiGet<MessageResponse[]>("/api/messages/mentions"));
      else if (t === "tasks") setTasks(await apiGet<TaskView[]>("/api/tasks", { scope }));
      else if (t === "reminders") setReminders(await apiGet<ReminderView[]>("/api/reminders"));
      else setScheduled(await apiGet<ScheduledMessageView[]>("/api/scheduled"));
    } catch (err) {
      console.error("Failed to load activity:", err);
      if (t === "mentions") setMentions([]);
      else if (t === "tasks") setTasks([]);
      else if (t === "reminders") setReminders([]);
      else setScheduled([]);
    }
  }, []);

  useEffect(() => {
    // Fetches data; state is only set once the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTab(tab, taskScope);
    if (tab === "mentions") {
      try { localStorage.setItem(`office_mentions_seen_${userId}`, new Date().toISOString()); } catch {}
      onChanged();
    }
  }, [tab, taskScope, loadTab, userId, onChanged]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !isNewTaskOpen) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isNewTaskOpen]);

  const jump = (convId?: number | null, messageId?: number | null) => {
    if (!convId) return;
    openChatAt(convId, messageId);
    onClose();
  };

  const toggleTask = async (t: TaskView) => {
    const next = t.status === "DONE" ? "OPEN" : "DONE";
    setTasks((list) => list?.map((x) => (x.id === t.id ? { ...x, status: next } : x)) ?? null);
    try {
      await apiPut(`/api/tasks/${t.id}`, { status: next });
      onChanged();
    } catch {
      loadTab("tasks", taskScope);
    }
  };

  const deleteTask = async (t: TaskView) => {
    if (!confirm(`Delete the task "${t.title}"?`)) return;
    await apiDelete(`/api/tasks/${t.id}`).catch(() => {});
    loadTab("tasks", taskScope);
    onChanged();
  };

  const finishReminder = async (r: ReminderView, status: "DONE" | "CANCELLED") => {
    await apiPut(`/api/reminders/${r.id}`, { status }).catch(() => {});
    loadTab("reminders", taskScope);
    onChanged();
  };

  const snoozeReminder = async (r: ReminderView) => {
    await apiPost(`/api/reminders/${r.id}/snooze`, { until: new Date(Date.now() + 60 * 60_000).toISOString() }).catch(() => {});
    loadTab("reminders", taskScope);
    onChanged();
  };

  const cancelScheduled = async (s: ScheduledMessageView) => {
    if (!confirm("Cancel this scheduled message?")) return;
    await apiDelete(`/api/scheduled/${s.id}`).catch(() => {});
    loadTab("scheduled", taskScope);
  };

  const loading = <p className="acp-empty"><Loader2 size={14} className="spin" /> Loading…</p>;
  const empty = (icon: ReactNode, text: string, sub?: string) => (
    <div className="acp-empty-state">{icon}<p>{text}</p>{sub && <span>{sub}</span>}</div>
  );

  return (
    <>
      <div className="acp-backdrop" onClick={onClose} />
      <aside className="acp" role="dialog" aria-modal="true" aria-label="Activity">
        <header className="acp-header">
          <h2>Activity</h2>
          <button type="button" className="acp-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="acp-tabs" role="tablist">
          {([
            ["mentions", <AtSign key="i" size={14} />, "Mentions"],
            ["tasks", <ListTodo key="i" size={14} />, "Tasks"],
            ["reminders", <AlarmClock key="i" size={14} />, "Reminders"],
            ["scheduled", <Clock key="i" size={14} />, "Scheduled"],
          ] as const).map(([key, icon, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`acp-tab ${tab === key ? "acp-tab--on" : ""}`} onClick={() => setTab(key)}>
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="acp-list">
          {tab === "mentions" && (
            mentions === null ? loading : mentions.length === 0
              ? empty(<AtSign size={30} />, "No mentions yet", "When someone @mentions you or replies to you, it shows up here.")
              : mentions.map((m) => (
                <button key={m.id} type="button" className="acp-item" onClick={() => jump(m.conversationId, m.threadRootId ?? m.id)}>
                  <Avatar name={m.senderName} size={32} />
                  <div className="acp-item-body">
                    <div className="acp-item-top">
                      <span className="acp-item-title">{m.senderName} <span className="acp-in">in {chatName(m.conversationId, conversations, userId)}</span></span>
                      <span className="acp-time">{ago(m.createdAt)}</span>
                    </div>
                    <p className="acp-snippet">{m.content}</p>
                  </div>
                </button>
              ))
          )}

          {tab === "tasks" && (
            <>
              <div className="acp-subbar">
                <div className="acp-seg">
                  <button type="button" className={taskScope === "assigned" ? "acp-seg--on" : ""} onClick={() => { setTaskScope("assigned"); setTasks(null); }}>Assigned to me</button>
                  <button type="button" className={taskScope === "created" ? "acp-seg--on" : ""} onClick={() => { setTaskScope("created"); setTasks(null); }}>Created by me</button>
                </div>
                <button type="button" className="acp-new" onClick={() => setIsNewTaskOpen(true)}><Plus size={14} /> New</button>
              </div>
              {tasks === null ? loading : tasks.length === 0
                ? empty(<ListTodo size={30} />, "No tasks", "Turn any message into a task from its hover menu.")
                : tasks.map((t) => {
                  const overdue = t.status === "OPEN" && t.dueAt && new Date(t.dueAt).getTime() < openedAt;
                  return (
                    <div key={t.id} className={`acp-task ${t.status === "DONE" ? "acp-task--done" : ""}`}>
                      <button type="button" className={`acp-check ${t.status === "DONE" ? "acp-check--on" : ""}`} onClick={() => toggleTask(t)} aria-label={t.status === "DONE" ? "Mark as not done" : "Mark as done"}>
                        {t.status === "DONE" && <Check size={12} />}
                      </button>
                      <div className="acp-item-body">
                        <span className="acp-task-title">{t.title}</span>
                        {t.notes && <span className="acp-task-notes">{t.notes}</span>}
                        <span className="acp-task-meta">
                          {taskScope === "assigned" ? (t.createdBy === userId ? "Personal" : `From ${t.createdByName}`) : `For ${t.assigneeId === userId ? "me" : t.assigneeName}`}
                          {t.dueAt && <span className={overdue ? "acp-overdue" : ""}> · Due {formatWhen(t.dueAt)}</span>}
                          {t.conversationId && <> · {chatName(t.conversationId, conversations, userId)}</>}
                        </span>
                      </div>
                      <div className="acp-actions">
                        {t.conversationId && (
                          <button type="button" onClick={() => jump(t.conversationId, t.messageId)} title="Open in chat"><CornerDownRight size={14} /></button>
                        )}
                        {t.createdBy === userId && (
                          <button type="button" onClick={() => deleteTask(t)} title="Delete task"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </>
          )}

          {tab === "reminders" && (
            reminders === null ? loading : reminders.length === 0
              ? empty(<AlarmClock size={30} />, "No reminders", "Use “Remind me” on any message.")
              : reminders.map((r) => (
                <div key={r.id} className={`acp-reminder ${r.status === "FIRED" ? "acp-reminder--due" : ""}`}>
                  <div className="acp-item-body">
                    <span className="acp-task-meta">
                      {r.status === "FIRED" ? <><BellRing size={12} /> Due now</> : formatWhen(r.remindAt)}
                      {r.conversationId && <> · {chatName(r.conversationId, conversations, userId)}</>}
                    </span>
                    {r.note && <span className="acp-task-title">{r.note}</span>}
                    {r.messageSnippet && <p className="acp-snippet">{r.messageSender}: {r.messageSnippet}</p>}
                    <div className="acp-btnrow">
                      {r.conversationId && <button type="button" onClick={() => jump(r.conversationId, r.messageId)}>Open</button>}
                      {r.status === "FIRED" ? (
                        <>
                          <button type="button" onClick={() => snoozeReminder(r)}>Snooze 1h</button>
                          <button type="button" className="acp-btn-primary" onClick={() => finishReminder(r, "DONE")}>Done</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => finishReminder(r, "CANCELLED")}>Cancel</button>
                      )}
                    </div>
                  </div>
                </div>
              ))
          )}

          {tab === "scheduled" && (
            scheduled === null ? loading : scheduled.length === 0
              ? empty(<Clock size={30} />, "Nothing scheduled", "Use the clock button next to Send to send a message later.")
              : scheduled.map((s) => (
                <div key={s.id} className="acp-reminder">
                  <div className="acp-item-body">
                    <span className="acp-task-meta">{formatWhen(s.sendAt)} · to {chatName(s.conversationId, conversations, userId)}</span>
                    <p className="acp-snippet">{s.content}</p>
                    <div className="acp-btnrow">
                      <button type="button" onClick={() => jump(s.conversationId)}>Open chat</button>
                      <button type="button" onClick={() => cancelScheduled(s)}>Cancel</button>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </aside>

      {isNewTaskOpen && (
        <CreateTaskModal onClose={() => { setIsNewTaskOpen(false); loadTab("tasks", taskScope); onChanged(); }} />
      )}

      <style>{`
        .acp-backdrop { position: fixed; inset: 0; z-index: 900; background: rgba(15,23,42,0.3); }
        .acp {
          position: fixed; top: 0; right: 0; bottom: 0; z-index: 901; width: min(420px, 100vw);
          background: var(--bg-primary); border-left: 1px solid var(--border); display: flex; flex-direction: column;
          box-shadow: -10px 0 40px rgba(0,0,0,0.12);
        }
        .acp-header { display: flex; align-items: center; justify-content: space-between; padding: 0 1.1rem; height: 60px; border-bottom: 1px solid var(--border); }
        .acp-header h2 { margin: 0; font-size: 1.05rem; color: var(--text-primary); }
        .acp-close { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .acp-close:hover { background: var(--bg-tertiary); }
        .acp-tabs { display: flex; gap: 3px; margin: 0.75rem 1rem 0.25rem; padding: 3px; background: var(--bg-tertiary); border-radius: 10px; }
        .acp-tab { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem; border: none; background: transparent; padding: 0.4rem 0.25rem; border-radius: 8px; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
        .acp-tab--on { background: var(--bg-primary); color: var(--accent); box-shadow: var(--shadow-sm); }
        .acp-list { flex: 1; overflow-y: auto; padding: 0.5rem 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.35rem; }
        .acp-empty { display: flex; align-items: center; gap: 0.4rem; color: var(--text-faint); font-size: 0.82rem; padding: 0.5rem; }
        .acp-empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4rem; padding: 2.5rem 1rem; color: var(--text-faint); }
        .acp-empty-state p { margin: 0; font-weight: 700; color: var(--text-secondary); }
        .acp-empty-state span { font-size: 0.8rem; }
        .acp-item { display: flex; gap: 0.6rem; padding: 0.6rem; border-radius: 10px; border: none; background: none; text-align: left; cursor: pointer; width: 100%; }
        .acp-item:hover { background: var(--bg-hover, var(--bg-secondary)); }
        .acp-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
        .acp-item-top { display: flex; justify-content: space-between; gap: 0.5rem; }
        .acp-item-title { font-size: 0.84rem; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acp-in { font-weight: 500; color: var(--text-muted); }
        .acp-time { font-size: 0.72rem; color: var(--text-faint); flex-shrink: 0; }
        .acp-snippet { margin: 0; font-size: 0.8rem; color: var(--text-secondary); word-break: break-word; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .acp-subbar { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0.25rem 0.5rem; }
        .acp-seg { display: flex; gap: 2px; background: var(--bg-tertiary); padding: 2px; border-radius: 8px; }
        .acp-seg button { border: none; background: transparent; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.74rem; font-weight: 600; color: var(--text-muted); cursor: pointer; }
        .acp-seg .acp-seg--on { background: var(--bg-primary); color: var(--accent); }
        .acp-new { display: inline-flex; align-items: center; gap: 0.25rem; border: none; background: var(--accent); color: #fff; padding: 0.35rem 0.7rem; border-radius: 8px; font-size: 0.76rem; font-weight: 600; cursor: pointer; }
        .acp-task { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem; border-radius: 10px; border: 1px solid var(--border); }
        .acp-task--done .acp-task-title { text-decoration: line-through; color: var(--text-faint); }
        .acp-check { width: 20px; height: 20px; flex-shrink: 0; margin-top: 1px; border-radius: 6px; border: 2px solid var(--border); background: var(--bg-primary); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .acp-check--on { background: var(--success-text, #16a34a); border-color: var(--success-text, #16a34a); }
        .acp-task-title { font-size: 0.86rem; font-weight: 600; color: var(--text-primary); word-break: break-word; }
        .acp-task-notes { font-size: 0.78rem; color: var(--text-secondary); word-break: break-word; }
        .acp-task-meta { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 0.2rem; font-size: 0.72rem; color: var(--text-muted); }
        .acp-overdue { color: var(--danger); font-weight: 700; }
        .acp-actions { display: flex; gap: 2px; }
        .acp-actions button { border: none; background: none; color: var(--text-muted); padding: 0.3rem; border-radius: 6px; cursor: pointer; display: flex; }
        .acp-actions button:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .acp-reminder { padding: 0.65rem; border-radius: 10px; border: 1px solid var(--border); }
        .acp-reminder--due { border-color: var(--accent); background: var(--accent-soft); }
        .acp-btnrow { display: flex; gap: 0.35rem; margin-top: 0.3rem; flex-wrap: wrap; }
        .acp-btnrow button { border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); padding: 0.28rem 0.65rem; border-radius: 7px; font-size: 0.74rem; font-weight: 600; cursor: pointer; }
        .acp-btnrow .acp-btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      `}</style>
    </>
  );
}
