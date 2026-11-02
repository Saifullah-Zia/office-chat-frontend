"use client";

import { useMemo, useState } from "react";
import { X, Search, Contact, Network, MessageSquare, ChevronLeft, Loader2, Pencil } from "lucide-react";
import { apiErrorMessage, apiPut } from "@/lib/api";
import { useStore } from "@/lib/store";
import { formatLastSeen } from "@/lib/time";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { UserResponse } from "@/types";
import Avatar from "./Avatar";
import HiddenEmail from "./HiddenEmail";

type Tab = "people" | "chart";

/** Everyone in the company: searchable list, profile details, and an org chart built from "reports to". */
export default function DirectoryModal({ onClose, onStartChat }: { onClose: () => void; onStartChat: (userId: number) => void }) {
  useEscapeKey(onClose);
  const users = useStore((s) => s.users);
  const myId = useStore((s) => s.userId);
  const isAdmin = useStore((s) => s.userRole) === "ADMIN";
  const [tab, setTab] = useState<Tab>("people");
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const departments = useMemo(
    () => [...new Set(users.map((u) => u.department).filter((d): d is string => !!d))].sort(),
    [users],
  );
  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => u.active !== false)
      .filter((u) => !dept || u.department === dept)
      .filter((u) => !q || [u.name, u.email, u.jobTitle, u.department].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, query, dept]);

  const selected = selectedId !== null ? byId.get(selectedId) ?? null : null;

  return (
    <div className="dir-overlay" onClick={onClose}>
      <div className="dir-card" role="dialog" aria-modal="true" aria-labelledby="dir-title" onClick={(e) => e.stopPropagation()}>
        <header className="dir-header">
          {selected ? (
            <button type="button" className="dir-icon" onClick={() => setSelectedId(null)} aria-label="Back to directory"><ChevronLeft size={18} /></button>
          ) : null}
          <h3 id="dir-title">{selected ? selected.name : <><Contact size={17} /> People</>}</h3>
          <button type="button" className="dir-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {selected ? (
          <PersonDetail
            person={selected}
            byId={byId}
            users={users}
            isMe={selected.id === myId}
            isAdmin={isAdmin}
            onSelect={setSelectedId}
            onMessage={() => { onStartChat(selected.id); onClose(); }}
          />
        ) : (
          <>
            <div className="dir-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "people"} className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>
                <Contact size={14} /> Directory
              </button>
              <button role="tab" aria-selected={tab === "chart"} className={tab === "chart" ? "on" : ""} onClick={() => setTab("chart")}>
                <Network size={14} /> Org chart
              </button>
            </div>

            {tab === "people" ? (
              <>
                <div className="dir-search">
                  <Search size={15} />
                  <input placeholder="Search name, title, department…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
                </div>
                {departments.length > 0 && (
                  <div className="dir-chips">
                    <button className={!dept ? "on" : ""} onClick={() => setDept(null)}>All</button>
                    {departments.map((d) => (
                      <button key={d} className={dept === d ? "on" : ""} onClick={() => setDept(dept === d ? null : d)}>{d}</button>
                    ))}
                  </div>
                )}
                <ul className="dir-list">
                  {people.length === 0 && <li className="dir-empty">No one matches.</li>}
                  {people.map((u) => <PersonRow key={u.id} person={u} onClick={() => setSelectedId(u.id)} />)}
                </ul>
              </>
            ) : (
              <OrgChart users={users.filter((u) => u.active !== false)} byId={byId} onSelect={setSelectedId} />
            )}
          </>
        )}
      </div>

      <style>{`
        .dir-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .dir-card { width: 100%; max-width: 560px; height: min(720px, 90vh); display: flex; flex-direction: column; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; }
        .dir-header { display: flex; align-items: center; gap: 0.4rem; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        .dir-header h3 { flex: 1; min-width: 0; margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dir-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; padding: 0.3rem; border-radius: 6px; }
        .dir-icon:hover { background: var(--bg-tertiary); }
        .dir-tabs { display: flex; gap: 4px; margin: 0.75rem 1rem 0; padding: 3px; border-radius: 10px; background: var(--bg-tertiary); }
        .dir-tabs button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.35rem; border: none; background: transparent; padding: 0.45rem; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
        .dir-tabs button.on { background: var(--bg-primary); color: var(--accent); box-shadow: var(--shadow-sm); }
        .dir-search { display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 1rem 0; padding: 0 0.7rem; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-secondary); color: var(--text-muted); }
        .dir-search input { flex: 1; min-width: 0; border: none; background: none; padding: 0.55rem 0; color: var(--text-primary); font: inherit; font-size: 0.88rem; outline: none; }
        .dir-chips { display: flex; gap: 0.35rem; overflow-x: auto; padding: 0.6rem 1rem 0; scrollbar-width: none; }
        .dir-chips button { flex-shrink: 0; padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); font-size: 0.75rem; font-weight: 600; cursor: pointer; }
        .dir-chips button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
        .dir-list { list-style: none; margin: 0.5rem 0 0; padding: 0 0.5rem 0.75rem; overflow-y: auto; flex: 1; }
        .dir-empty { padding: 2rem; text-align: center; color: var(--text-faint); font-size: 0.85rem; }
        .dir-row { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.55rem 0.5rem; border: none; background: none; border-radius: 10px; cursor: pointer; text-align: left; }
        .dir-row:hover { background: var(--bg-tertiary); }
        .dir-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .dir-row-name { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dir-row-sub { font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dir-row-status { font-size: 0.72rem; color: var(--text-muted); flex-shrink: 0; max-width: 35%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dir-tree { list-style: none; margin: 0; padding: 0; }
        .dir-tree .dir-tree { margin-left: 1.15rem; padding-left: 0.75rem; border-left: 2px solid var(--border); }
        .dir-chart { overflow: auto; flex: 1; padding: 0.75rem 0.5rem; }
        .dir-detail { flex: 1; overflow-y: auto; padding: 1.25rem 1rem; display: flex; flex-direction: column; gap: 0.9rem; }
        .dir-hero { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; text-align: center; }
        .dir-hero h4 { margin: 0.4rem 0 0; font-size: 1.15rem; color: var(--text-primary); }
        .dir-hero p { margin: 0; font-size: 0.85rem; color: var(--text-secondary); }
        .dir-section h5 { margin: 0 0 0.35rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
        .dir-facts { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.9rem; font-size: 0.85rem; }
        .dir-facts dt { color: var(--text-muted); }
        .dir-facts dd { margin: 0; color: var(--text-primary); min-width: 0; overflow-wrap: anywhere; }
        .dir-link { background: none; border: none; padding: 0; color: var(--accent); font: inherit; cursor: pointer; text-align: left; }
        .dir-actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
        .dir-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        .dir-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .dir-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .dir-form { display: flex; flex-direction: column; gap: 0.6rem; border: 1px solid var(--border); border-radius: 12px; padding: 0.85rem; }
        .dir-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
        .dir-form input, .dir-form select { padding: 0.5rem 0.6rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-weight: 400; font-size: 0.85rem; }
        .dir-error { margin: 0; color: var(--danger); font-size: 0.8rem; }
        @media (max-width: 600px) {
          .dir-overlay { padding: 0; }
          .dir-card { max-width: none; height: 100dvh; border-radius: 0; border: none; }
        }
      `}</style>
    </div>
  );
}

function usePresence(userId: number) {
  const online = useStore((s) => s.onlineUserIds.has(userId));
  const status = useStore((s) => s.statusesByUserId[userId]);
  const lastSeen = useStore((s) => s.lastSeenByUserId[userId]);
  const text = status ? `${status.emoji} ${status.text}` : online ? "Online" : lastSeen ? formatLastSeen(lastSeen) : "";
  return { online, text };
}

function PersonRow({ person, onClick }: { person: UserResponse; onClick: () => void }) {
  const { online, text } = usePresence(person.id);
  return (
    <li>
      <button type="button" className="dir-row" onClick={onClick}>
        <Avatar userId={person.id} name={person.name} src={person.profilePicUrl} size={40} online={online} />
        <span className="dir-row-text">
          <span className="dir-row-name">{person.name}</span>
          <span className="dir-row-sub">{[person.jobTitle, person.department].filter(Boolean).join(" · ") || person.email || (person.role === "PROVIDER" ? "Provider" : "")}</span>
        </span>
        {text && <span className="dir-row-status">{text}</span>}
      </button>
    </li>
  );
}

/** Tree from managerId. People whose manager is missing (or who'd form a loop) start their own branch. */
function OrgChart({ users, byId, onSelect }: { users: UserResponse[]; byId: Map<number, UserResponse>; onSelect: (id: number) => void }) {
  const reportsOf = useMemo(() => {
    const map = new Map<number | null, UserResponse[]>();
    for (const u of users) {
      const parent = u.managerId && byId.has(u.managerId) && u.managerId !== u.id ? u.managerId : null;
      map.set(parent, [...(map.get(parent) ?? []), u]);
    }
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [users, byId]);

  const render = (parent: number | null, seen: Set<number>) => {
    const list = (reportsOf.get(parent) ?? []).filter((u) => !seen.has(u.id));
    if (list.length === 0) return null;
    return (
      <ul className="dir-tree">
        {list.map((u) => (
          <li key={u.id}>
            <PersonRow person={u} onClick={() => onSelect(u.id)} />
            {render(u.id, new Set(seen).add(u.id))}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="dir-chart">
      {users.every((u) => !u.managerId) && (
        <p className="dir-empty">No reporting lines yet. Admins can set who each person reports to from their profile.</p>
      )}
      {render(null, new Set())}
    </div>
  );
}

function PersonDetail({ person, byId, users, isMe, isAdmin, onSelect, onMessage }: {
  person: UserResponse; byId: Map<number, UserResponse>; users: UserResponse[];
  isMe: boolean; isAdmin: boolean; onSelect: (id: number) => void; onMessage: () => void;
}) {
  const { online, text } = usePresence(person.id);
  const manager = person.managerId ? byId.get(person.managerId) : undefined;
  const reports = users.filter((u) => u.managerId === person.id && u.active !== false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="dir-detail">
      <div className="dir-hero">
        <Avatar userId={person.id} name={person.name} src={person.profilePicUrl} size={96} online={online} />
        <h4>{person.name}</h4>
        {person.jobTitle && <p>{person.jobTitle}</p>}
        {text && <p>{text}</p>}
      </div>

      <div className="dir-actions">
        {!isMe && <button type="button" className="dir-btn dir-btn--primary" onClick={onMessage}><MessageSquare size={15} /> Message</button>}
        {isAdmin && !editing && <button type="button" className="dir-btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit details</button>}
      </div>

      {editing ? (
        <AdminEditForm person={person} users={users} onDone={() => setEditing(false)} />
      ) : (
        <dl className="dir-facts">
          <dt>Email</dt><dd>{person.emailHidden ? <HiddenEmail /> : <a className="dir-link" href={`mailto:${person.email}`}>{person.email}</a>}</dd>
          {person.department && <><dt>Department</dt><dd>{person.department}</dd></>}
          <dt>Reports to</dt>
          <dd>{manager ? <button type="button" className="dir-link" onClick={() => onSelect(manager.id)}>{manager.name}</button> : "—"}</dd>
        </dl>
      )}

      {reports.length > 0 && (
        <div className="dir-section">
          <h5>Direct reports ({reports.length})</h5>
          <ul className="dir-tree">
            {reports.map((u) => <PersonRow key={u.id} person={u} onClick={() => onSelect(u.id)} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function AdminEditForm({ person, users, onDone }: { person: UserResponse; users: UserResponse[]; onDone: () => void }) {
  const upsertUser = useStore((s) => s.upsertUser);
  const [jobTitle, setJobTitle] = useState(person.jobTitle ?? "");
  const [department, setDepartment] = useState(person.department ?? "");
  const [managerId, setManagerId] = useState<number | null>(person.managerId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      upsertUser(await apiPut<UserResponse>(`/api/users/admin/${person.id}/profile`, { jobTitle, department, managerId }));
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dir-form">
      <label>Job title<input value={jobTitle} maxLength={100} onChange={(e) => setJobTitle(e.target.value)} /></label>
      <label>Department<input value={department} maxLength={100} onChange={(e) => setDepartment(e.target.value)} /></label>
      <label>
        Reports to
        <select value={managerId ?? ""} onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">No one (top of the chart)</option>
          {users.filter((u) => u.id !== person.id && u.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
            <option key={u.id} value={u.id}>{u.name}{u.jobTitle ? ` · ${u.jobTitle}` : ""}</option>
          ))}
        </select>
      </label>
      {error && <p className="dir-error" role="alert">{error}</p>}
      <div className="dir-actions">
        <button type="button" className="dir-btn" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="button" className="dir-btn dir-btn--primary" onClick={save} disabled={busy}>
          {busy && <Loader2 size={14} className="spin" />} Save
        </button>
      </div>
    </div>
  );
}
