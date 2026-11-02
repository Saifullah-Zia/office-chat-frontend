"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, User, Users } from "lucide-react";
import { api, apiErrorMessage, apiGet } from "@/lib/api";
import { showToast } from "@/lib/toast";

interface Analytics {
  days: number;
  totals: { users: number; activeAccounts: number; groups: number; directChats: number; messages: number; files: number; storageBytes: number };
  activeUsers: { today: number; week: number; month: number };
  messagesPerDay: { date: string; count: number }[];
  messagesByType: { type: string; count: number }[];
  topSenders: { userId: number; name: string; department: string; count: number }[];
  topGroups: { conversationId: number; name: string; count: number }[];
  messagesInPeriod: number;
  calls: {
    total: number; answered: number; missed: number; video: number; group: number;
    avgDurationSecs: number; totalMinutes: number;
    perDay: { date: string; count: number }[];
    topCallers: { userId: number; name: string; count: number }[];
  };
}

interface ExportableConversation { id: number; type: "GROUP" | "DIRECT"; label: string; memberCount: number; lastMessageAt: string | null }

const RANGES = [7, 30, 90] as const;

const fmt = (n: number) => n.toLocaleString();

/** 75 -> "1m 15s", 3700 -> "1h 1m" */
function formatDurationShort(secs: number) {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), sec = secs % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });

/** Download a conversation's messages as CSV (needs the auth header, so it goes through axios). */
async function exportConversation(id: number) {
  try {
    const res = await api.get<Blob>(`/api/admin/export/conversations/${id}`, { responseType: "blob" });
    const header = String(res.headers["content-disposition"] ?? "");
    const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)?.[1];
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name ? decodeURIComponent(name) : `chat-${id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (err) {
    showToast(apiErrorMessage(err) ?? "Export failed.");
  }
}

/** Single-series daily bar chart: accent bars, 2px gaps, recessive axis, per-bar tooltip. */
function DailyBars({ data, unit = "message" }: { data: { date: string; count: number }[]; unit?: string }) {
  const Unit = unit.charAt(0).toUpperCase() + unit.slice(1);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 600, H = 160, PAD_B = 18, gap = 2;
  const barW = W / data.length;
  const plotH = H - PAD_B;
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className="aa-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${Unit}s per day, peak ${fmt(max)}`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={plotH / 2} y2={plotH / 2} className="aa-grid" />
        <line x1={0} x2={W} y1={plotH} y2={plotH} className="aa-axis" />
        {data.map((d, i) => {
          const h = d.count === 0 ? 0 : Math.max(2, (d.count / max) * (plotH - 6));
          const x = i * barW + gap / 2;
          const w = Math.max(1, barW - gap);
          const r = Math.min(4, w / 2, h);
          // Rounded top, square base anchored to the axis.
          const y = plotH - h;
          const path = h === 0 ? "" :
            `M${x},${plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${plotH} Z`;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              {/* Full-height hit target, larger than the bar */}
              <rect x={i * barW} y={0} width={barW} height={plotH} fill="transparent" />
              {path && <path d={path} className={`aa-bar ${hover === i ? "aa-bar--on" : ""}`} />}
            </g>
          );
        })}
      </svg>
      <div className="aa-xlabels" aria-hidden="true">
        <span>{shortDate(data[0].date)}</span>
        <span>{shortDate(data[data.length - 1].date)}</span>
      </div>
      {hovered && hover !== null && (
        <div className="aa-tooltip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
          <strong>{fmt(hovered.count)}</strong> {unit}{hovered.count === 1 ? "" : "s"}
          <span>{shortDate(hovered.date)}</span>
        </div>
      )}
      <table className="aa-sr-only">
        <caption>{Unit}s per day</caption>
        <thead><tr><th>Date</th><th>{Unit}s</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: { key: number; label: string; sub?: string; count: number; onExport?: () => void }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="aa-card">
      <h4 className="aa-card-title">{title}</h4>
      {rows.length === 0 ? <p className="aa-empty">No activity in this period</p> : (
        <ol className="aa-rank">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="aa-rank-top">
                <span className="aa-rank-label" title={r.label}>{r.label}{r.sub ? <em> · {r.sub}</em> : null}</span>
                <span className="aa-rank-num">{fmt(r.count)}</span>
                {r.onExport && (
                  <button type="button" className="aa-icon-btn" onClick={r.onExport} aria-label={`Export ${r.label} as CSV`} title="Export as CSV">
                    <Download size={13} />
                  </button>
                )}
              </div>
              <div className="aa-rank-track"><div className="aa-rank-fill" style={{ width: `${(r.count / max) * 100}%` }} /></div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function AdminAnalytics() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);
  const [exportQuery, setExportQuery] = useState("");
  const [exportList, setExportList] = useState<ExportableConversation[] | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  // Searchable list of every chat (groups by name, direct chats by participant).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      apiGet<ExportableConversation[]>("/api/admin/export/conversations", { q: exportQuery.trim() || undefined })
        .then((list) => { if (!cancelled) setExportList(list); })
        .catch(() => { if (!cancelled) setExportList([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [exportQuery]);

  useEffect(() => {
    let cancelled = false;
    apiGet<Analytics>("/api/admin/analytics", { days })
      .then((d) => { if (!cancelled) { setData(d); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [days]);

  const runExport = async (id: number) => {
    setExportingId(id);
    await exportConversation(id);
    setExportingId(null);
  };

  if (error) return <p className="aa-empty" style={{ padding: "1.5rem" }}>Analytics couldn&apos;t be loaded.</p>;
  if (!data) return <p className="aa-empty" style={{ padding: "1.5rem" }}><Loader2 size={14} className="spin" /> Loading…</p>;

  const tiles: [string, string][] = [
    ["Active today", fmt(data.activeUsers.today)],
    ["Active this week", fmt(data.activeUsers.week)],
    ["Active this month", fmt(data.activeUsers.month)],
    [`Messages (${data.days}d)`, fmt(data.messagesInPeriod)],
    ["Groups", fmt(data.totals.groups)],
    ["Direct chats", fmt(data.totals.directChats)],
    ["Files", fmt(data.totals.files)],
    ["Storage used", formatBytes(data.totals.storageBytes)],
  ];

  return (
    <div className="aa">
      <div className="aa-filters" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={days === r}
            className={`aa-range ${days === r ? "aa-range--on" : ""}`} onClick={() => setDays(r)}>
            {r} days
          </button>
        ))}
      </div>

      <div className="aa-tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="aa-tile">
            <span className="aa-tile-value">{value}</span>
            <span className="aa-tile-label">{label}</span>
          </div>
        ))}
      </div>

      <section className="aa-card">
        <h4 className="aa-card-title">Messages per day</h4>
        <DailyBars data={data.messagesPerDay} />
      </section>

      <RankList title="Most active people" rows={data.topSenders.map((s) => ({
        key: s.userId, label: s.name, sub: s.department || undefined, count: s.count,
      }))} />
      <RankList title="Busiest groups" rows={data.topGroups.map((g) => ({
        key: g.conversationId, label: g.name, count: g.count, onExport: () => runExport(g.conversationId),
      }))} />
      <RankList title="Message types" rows={data.messagesByType.map((t, i) => ({
        key: i, label: t.type.charAt(0) + t.type.slice(1).toLowerCase(), count: t.count,
      }))} />

      {data.calls && (
        <>
          <h3 className="aa-section">Calls</h3>
          <div className="aa-tiles">
            {([
              ["Calls", fmt(data.calls.total)],
              ["Answered", data.calls.total ? `${Math.round((data.calls.answered / data.calls.total) * 100)}%` : "—"],
              ["Missed", fmt(data.calls.missed)],
              ["Avg length", formatDurationShort(data.calls.avgDurationSecs)],
              ["Talk time", `${fmt(data.calls.totalMinutes)} min`],
              ["Video", data.calls.total ? `${Math.round((data.calls.video / data.calls.total) * 100)}%` : "—"],
              ["Group calls", fmt(data.calls.group)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="aa-tile">
                <span className="aa-tile-value">{value}</span>
                <span className="aa-tile-label">{label}</span>
              </div>
            ))}
          </div>
          <section className="aa-card">
            <h4 className="aa-card-title">Calls per day</h4>
            <DailyBars data={data.calls.perDay} unit="call" />
          </section>
          <RankList title="Who calls most" rows={data.calls.topCallers.map((c) => ({ key: c.userId, label: c.name, count: c.count }))} />
        </>
      )}

      <section className="aa-card">
        <h4 className="aa-card-title">Compliance export</h4>
        <p className="aa-note">Find a chat and download all of its messages as CSV. Each export is recorded in the audit log.</p>
        <input className="aa-input" type="search" placeholder="Search by group name or person…" aria-label="Search conversations"
          value={exportQuery} onChange={(e) => setExportQuery(e.target.value)} />
        <ul className="aa-convs">
          {exportList === null ? (
            <li className="aa-empty"><Loader2 size={14} className="spin" /> Loading…</li>
          ) : exportList.length === 0 ? (
            <li className="aa-empty">No conversations match.</li>
          ) : exportList.map((c) => (
            <li key={c.id}>
              <span className="aa-conv-type">{c.type === "GROUP" ? <Users size={14} /> : <User size={14} />}</span>
              <span className="aa-conv-text">
                <span className="aa-conv-label" title={c.label}>{c.label}</span>
                <span className="aa-conv-sub">
                  {c.type === "GROUP" ? `Group · ${c.memberCount} members` : "Direct chat"}
                  {c.lastMessageAt ? ` · last message ${new Date(c.lastMessageAt).toLocaleDateString()}` : " · no messages"}
                </span>
              </span>
              <button type="button" className="aa-btn" disabled={exportingId !== null} onClick={() => runExport(c.id)}
                aria-label={`Export ${c.label} as CSV`}>
                {exportingId === c.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />} CSV
              </button>
            </li>
          ))}
        </ul>
      </section>

      <style>{`
        .aa { padding: 1rem 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; overflow-y: auto; }
        .aa-filters { display: flex; gap: 0.4rem; }
        .aa-range { padding: 0.35rem 0.75rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .aa-range--on { background: var(--accent); border-color: var(--accent); color: #fff; }
        .aa-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.5rem; }
        .aa-tile { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.15rem; }
        .aa-tile-value { font-size: 1.25rem; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .aa-tile-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; }
        .aa-section { margin: 0.4rem 0 0; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
        .aa-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 0.85rem; }
        .aa-card-title { margin: 0 0 0.6rem; font-size: 0.85rem; font-weight: 700; color: var(--text-primary); }
        .aa-chart { position: relative; }
        .aa-chart svg { width: 100%; height: 160px; display: block; overflow: visible; }
        .aa-grid { stroke: var(--border); stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
        .aa-axis { stroke: var(--border); stroke-width: 1; vector-effect: non-scaling-stroke; }
        .aa-bar { fill: var(--accent); opacity: 0.85; }
        .aa-bar--on { opacity: 1; }
        .aa-xlabels { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }
        .aa-tooltip { position: absolute; top: 0; transform: translateX(-50%); pointer-events: none; background: var(--bg-primary); border: 1px solid var(--border); box-shadow: var(--shadow-sm); border-radius: 8px; padding: 0.3rem 0.5rem; font-size: 0.75rem; color: var(--text-primary); white-space: nowrap; display: flex; gap: 0.35rem; align-items: baseline; }
        .aa-tooltip span { color: var(--text-muted); }
        .aa-rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.55rem; }
        .aa-rank-top { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; }
        .aa-rank-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-weight: 600; }
        .aa-rank-label em { font-style: normal; font-weight: 400; color: var(--text-muted); }
        .aa-rank-num { color: var(--text-secondary); font-variant-numeric: tabular-nums; font-weight: 600; }
        .aa-rank-track { height: 6px; border-radius: 3px; background: var(--bg-tertiary); margin-top: 0.25rem; overflow: hidden; }
        .aa-rank-fill { height: 100%; border-radius: 3px; background: var(--accent); }
        .aa-icon-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.2rem; display: flex; border-radius: 6px; }
        .aa-icon-btn:hover { color: var(--accent); background: var(--bg-tertiary); }
        .aa-empty { margin: 0; display: flex; align-items: center; gap: 0.4rem; color: var(--text-faint); font-size: 0.82rem; }
        .aa-note { margin: 0 0 0.6rem; font-size: 0.78rem; color: var(--text-muted); }
        .aa-convs { list-style: none; margin: 0.6rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; max-height: 320px; overflow-y: auto; }
        .aa-convs li { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.5rem; border-radius: 8px; background: var(--bg-primary); border: 1px solid var(--border); }
        .aa-conv-type { color: var(--text-muted); display: flex; }
        .aa-conv-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .aa-conv-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .aa-conv-sub { font-size: 0.7rem; color: var(--text-muted); }
        .aa-input { flex: 1; min-width: 0; padding: 0.45rem 0.65rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 0.82rem; }
        .aa-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.8rem; border-radius: 8px; border: none; background: var(--accent); color: #fff; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
        .aa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .aa-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      `}</style>
    </div>
  );
}
