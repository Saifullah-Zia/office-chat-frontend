"use client";

import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { AuditLogEntry } from "@/types";

const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "MESSAGE_DELETED_BY_ADMIN", label: "Messages deleted by admin" },
  { value: "MEMBER_ADDED", label: "Members added" },
  { value: "MEMBER_REMOVED", label: "Members removed" },
  { value: "MEMBER_LEFT", label: "Members left" },
  { value: "GROUP_CREATED", label: "Groups created" },
  { value: "GROUP_ADMIN_GRANTED", label: "Group admins granted" },
  { value: "GROUP_ADMIN_REVOKED", label: "Group admins revoked" },
  { value: "GROUP_SETTINGS_CHANGED", label: "Group settings changed" },
  { value: "USER_DEACTIVATED", label: "Users deactivated" },
  { value: "USER_REACTIVATED", label: "Users reactivated" },
  { value: "USER_ROLE_CHANGED", label: "Roles changed" },
  { value: "REPORT_RESOLVED", label: "Reports resolved" },
  { value: "REPORT_DISMISSED", label: "Reports dismissed" },
];

interface AuditPage {
  items: AuditLogEntry[];
  page: number;
  totalPages: number;
  total: number;
}

function humanize(action: string) {
  return action.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<AuditPage>("/api/admin/audit", { page, size: 50, action: action || undefined })
      .then((d) => { if (!cancelled) { setData(d); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [action, page]);

  return (
    <div className="aud">
      <div className="aud-bar">
        <select
          className="aud-select"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0); setData(null); }}
          aria-label="Filter by action"
        >
          {ACTION_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {data && <span className="aud-total">{data.total} entries</span>}
      </div>

      <div className="aud-list">
        {error ? (
          <p className="aud-empty">Couldn&apos;t load the audit log.</p>
        ) : !data ? (
          <p className="aud-empty"><Loader2 size={14} className="spin" /> Loading…</p>
        ) : data.items.length === 0 ? (
          <div className="aud-empty-state"><History size={30} /><p>Nothing logged yet</p></div>
        ) : (
          data.items.map((e) => (
            <div key={e.id} className="aud-row">
              <div className="aud-row-head">
                <span className="aud-action">{humanize(e.action)}</span>
                <time className="aud-when">
                  {new Date(e.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
              </div>
              <p className="aud-details"><strong>{e.actorName}</strong>{e.details ? ` — ${e.details}` : ""}</p>
            </div>
          ))
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="aud-pager">
          <button type="button" disabled={page === 0} onClick={() => { setPage((p) => p - 1); setData(null); }}>Newer</button>
          <span>Page {page + 1} of {data.totalPages}</span>
          <button type="button" disabled={page + 1 >= data.totalPages} onClick={() => { setPage((p) => p + 1); setData(null); }}>Older</button>
        </div>
      )}

      <style>{`
        .aud { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .aud-bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.25rem 0.5rem; }
        .aud-select {
          flex: 1; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary);
          border-radius: 8px; padding: 0.4rem 0.6rem; font-size: 0.8rem;
        }
        .aud-total { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
        .aud-list { flex: 1; overflow-y: auto; padding: 0.25rem 1.25rem 1rem; display: flex; flex-direction: column; }
        .aud-row { padding: 0.55rem 0; border-bottom: 1px solid var(--border); }
        .aud-row-head { display: flex; justify-content: space-between; gap: 0.5rem; }
        .aud-action { font-size: 0.78rem; font-weight: 700; color: var(--accent); }
        .aud-when { font-size: 0.72rem; color: var(--text-faint); white-space: nowrap; }
        .aud-details { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--text-secondary); word-break: break-word; }
        .aud-details strong { color: var(--text-primary); }
        .aud-empty { display: flex; align-items: center; gap: 0.4rem; color: var(--text-faint); font-size: 0.82rem; }
        .aud-empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2.5rem 0; color: var(--text-faint); }
        .aud-empty-state p { margin: 0; font-weight: 600; }
        .aud-pager {
          display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1.25rem;
          border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted);
        }
        .aud-pager button {
          border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary);
          border-radius: 8px; padding: 0.3rem 0.7rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;
        }
        .aud-pager button:disabled { opacity: 0.4; cursor: default; }
      `}</style>
    </div>
  );
}
