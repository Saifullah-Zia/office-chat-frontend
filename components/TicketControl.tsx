"use client";

import { useEffect, useRef, useState } from "react";
import { Tag, Check, CircleDot, CheckCircle2, Plus, X, Loader2 } from "lucide-react";
import { apiErrorMessage, apiPut } from "@/lib/api";
import { useStore } from "@/lib/store";
import { showToast } from "@/lib/toast";
import { PRESET_LABELS, STATUS_LABEL, TicketStatus, labelColor } from "@/lib/labels";
import { ConversationResponse } from "@/types";

const MAX_LABELS = 6;

/** Small coloured label chip, used in the chat header and the chat list. */
export function LabelChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const c = labelColor(label);
  return (
    <span className="lbl-chip" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}>
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}><X size={11} /></button>
      )}
    </span>
  );
}

export function StatusChip({ status }: { status: TicketStatus }) {
  return (
    <span className={`lbl-status lbl-status--${status.toLowerCase()}`}>
      {status === "DONE" ? <CheckCircle2 size={11} /> : <CircleDot size={11} />} {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Header button + popover to set a chat's labels ("Denial", "Pending payer"...) and status
 * (Open / Done). Shared by everyone in the chat; providers don't see it.
 */
export default function TicketControl({ conv }: { conv: ConversationResponse }) {
  const upsertConversation = useStore((s) => s.upsertConversation);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const labels = conv.labels ?? [];
  const status = (conv.ticketStatus ?? null) as TicketStatus | null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const save = async (nextLabels: string[], nextStatus: TicketStatus | null) => {
    const prev = conv;
    // Show it straight away; the server's answer (and the live event) confirms it.
    upsertConversation({ ...conv, labels: nextLabels, ticketStatus: nextStatus });
    setSaving(true);
    try {
      upsertConversation(await apiPut<ConversationResponse>(`/api/conversations/${conv.id}/ticket`,
        { labels: nextLabels, status: nextStatus }));
    } catch (err) {
      upsertConversation(prev);
      showToast(apiErrorMessage(err) ?? "Couldn't update the labels.");
    } finally {
      setSaving(false);
    }
  };

  const has = (l: string) => labels.some((x) => x.toLowerCase() === l.toLowerCase());
  const toggle = (l: string) => {
    if (has(l)) return save(labels.filter((x) => x.toLowerCase() !== l.toLowerCase()), status);
    if (labels.length >= MAX_LABELS) { showToast(`A chat can have at most ${MAX_LABELS} labels`); return; }
    // Adding a label to an untracked chat opens it as a ticket.
    return save([...labels, l], status ?? "OPEN");
  };
  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const l = custom.trim().replace(/\s+/g, " ");
    if (!l) return;
    setCustom("");
    if (!has(l)) toggle(l);
  };

  const extra = labels.filter((l) => !PRESET_LABELS.some((p) => p.toLowerCase() === l.toLowerCase()));
  const summary = status || labels.length > 0;

  return (
    <div className="tkc" ref={boxRef}>
      <button
        type="button"
        className={`cw-action-btn tkc-btn ${summary ? "tkc-btn--set" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={summary
          ? `${status ? STATUS_LABEL[status] : "No status"}${labels.length ? ` · ${labels.join(", ")}` : ""}`
            + (conv.ticketUpdatedByName ? ` (updated by ${conv.ticketUpdatedByName})` : "")
          : "Labels & status"}
        aria-label="Labels and status"
        aria-expanded={open}
      >
        {status ? <StatusChip status={status} /> : <Tag size={18} />}
        {labels[0] && <span className="tkc-first"><LabelChip label={labels[0]} /></span>}
        {labels.length > 1 && <span className="tkc-more">+{labels.length - 1}</span>}
      </button>

      {open && (
        <div className="tkc-pop" role="dialog" aria-label="Labels and status">
          <div className="tkc-head">
            <b>Labels &amp; status</b>
            {saving && <Loader2 size={14} className="spin" />}
          </div>
          <p className="tkc-hint">Everyone in this chat sees these. Providers don&apos;t.</p>

          <div className="tkc-seg" role="radiogroup" aria-label="Status">
            {([null, "OPEN", "DONE"] as const).map((s) => (
              <button
                key={s ?? "none"}
                type="button"
                role="radio"
                aria-checked={status === s}
                className={`tkc-seg-btn ${status === s ? "tkc-seg-btn--on" : ""}`}
                onClick={() => status !== s && save(labels, s)}
              >
                {s === null ? "No status" : s === "OPEN" ? <><CircleDot size={13} /> Open</> : <><CheckCircle2 size={13} /> Done</>}
              </button>
            ))}
          </div>

          <div className="tkc-list">
            {[...PRESET_LABELS, ...extra].map((l) => (
              <button key={l} type="button" className="tkc-opt" onClick={() => toggle(l)} aria-pressed={has(l)}>
                <span className="tkc-dot" style={{ background: labelColor(l) }} />
                <span className="tkc-opt-name">{l}</span>
                {has(l) && <Check size={14} className="tkc-check" />}
              </button>
            ))}
          </div>

          <form className="tkc-add" onSubmit={addCustom}>
            <input value={custom} maxLength={30} placeholder="New label…" onChange={(e) => setCustom(e.target.value)} aria-label="New label" />
            <button type="submit" disabled={!custom.trim()} aria-label="Add label"><Plus size={15} /></button>
          </form>

          {conv.ticketUpdatedByName && conv.ticketUpdatedAt && (
            <p className="tkc-hint">Last changed by {conv.ticketUpdatedByName}, {new Date(conv.ticketUpdatedAt).toLocaleString()}</p>
          )}
        </div>
      )}

      <style>{`
        .tkc { position: relative; }
        .tkc-btn { width: auto !important; min-width: 36px; padding: 0 0.4rem; gap: 0.3rem; display: inline-flex; align-items: center; }
        .tkc-more { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); }
        .tkc-pop {
          position: absolute; right: 0; top: calc(100% + 6px); z-index: 60; width: 270px; max-height: 70vh; overflow-y: auto;
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 16px 40px rgba(15,23,42,0.18);
          padding: 0.75rem; display: flex; flex-direction: column; gap: 0.55rem;
        }
        .tkc-head { display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; color: var(--text-primary); }
        .tkc-hint { margin: 0; font-size: 0.72rem; color: var(--text-muted); }
        .tkc-seg { display: flex; background: var(--bg-tertiary); border-radius: 10px; padding: 3px; gap: 2px; }
        .tkc-seg-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; padding: 0.4rem 0.3rem; border: none; border-radius: 8px; background: none; color: var(--text-secondary); font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .tkc-seg-btn--on { background: var(--bg-primary); color: var(--accent); box-shadow: var(--shadow-sm); }
        .tkc-list { display: flex; flex-direction: column; }
        .tkc-opt { display: flex; align-items: center; gap: 0.55rem; padding: 0.42rem 0.4rem; border: none; background: none; border-radius: 8px; cursor: pointer; color: var(--text-primary); font-size: 0.84rem; text-align: left; }
        .tkc-opt:hover { background: var(--bg-secondary); }
        .tkc-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .tkc-opt-name { flex: 1; }
        .tkc-check { color: var(--accent); }
        .tkc-add { display: flex; gap: 0.35rem; }
        .tkc-add input { flex: 1; min-width: 0; padding: 0.42rem 0.6rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-size: 0.82rem; }
        .tkc-add input:focus { outline: none; border-color: var(--accent); }
        .tkc-add button { display: flex; align-items: center; justify-content: center; width: 32px; border-radius: 8px; border: none; background: var(--accent); color: #fff; cursor: pointer; }
        .tkc-add button:disabled { opacity: 0.5; cursor: not-allowed; }
        @media (max-width: 768px) {
          .tkc-first, .tkc-more { display: none; }
          .tkc-pop { position: fixed; left: 12px; right: 12px; top: 64px; width: auto; }
        }
      `}</style>
    </div>
  );
}
