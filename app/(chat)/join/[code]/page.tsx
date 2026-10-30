"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Users, Loader2, Link2Off } from "lucide-react";
import { apiGet, apiPost, apiErrorMessage } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ConversationResponse } from "@/types";

interface InvitePreview {
  conversationId: number;
  name: string;
  description?: string | null;
  memberCount: number;
  isMember: boolean;
}

/** Landing page for group invite links: /join/{code} */
export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params?.code ?? "";
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    apiGet<InvitePreview>(`/api/invites/${encodeURIComponent(code)}`)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((err) => { if (!cancelled) setError(apiErrorMessage(err) ?? "This invite link is invalid or has been reset."); });
    return () => { cancelled = true; };
  }, [code]);

  const open = (conversationId: number) => {
    useStore.getState().setActiveConversation(conversationId);
    router.replace("/");
  };

  const join = async () => {
    setJoining(true);
    try {
      const conv = await apiPost<ConversationResponse>(`/api/invites/${encodeURIComponent(code)}/join`);
      useStore.getState().upsertConversation(conv);
      open(conv.id);
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Couldn't join this group.");
      setJoining(false);
    }
  };

  return (
    <div className="jp">
      <div className="jp-card">
        {error ? (
          <>
            <div className="jp-icon jp-icon--bad"><Link2Off size={30} /></div>
            <h2>Invite link not valid</h2>
            <p>{error}</p>
            <button type="button" className="jp-btn jp-btn--ghost" onClick={() => router.replace("/")}>Back to chats</button>
          </>
        ) : !preview ? (
          <p className="jp-loading"><Loader2 size={18} className="spin" /> Checking invite…</p>
        ) : (
          <>
            <div className="jp-icon"><Users size={30} /></div>
            <p className="jp-eyebrow">You&apos;ve been invited to join</p>
            <h2>{preview.name}</h2>
            <p>{preview.memberCount} member{preview.memberCount !== 1 ? "s" : ""}</p>
            {preview.description && <p className="jp-desc">{preview.description}</p>}
            {preview.isMember ? (
              <button type="button" className="jp-btn" onClick={() => open(preview.conversationId)}>You&apos;re already a member — open chat</button>
            ) : (
              <button type="button" className="jp-btn" disabled={joining} onClick={join}>
                {joining ? <Loader2 size={16} className="spin" /> : null} Join group
              </button>
            )}
          </>
        )}
      </div>
      <style>{`
        .jp { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--bg-secondary); }
        .jp-card { width: 100%; max-width: 400px; text-align: center; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 18px; padding: 2rem 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
        .jp-card h2 { margin: 0; font-size: 1.3rem; color: var(--text-primary); }
        .jp-card p { margin: 0; color: var(--text-muted); font-size: 0.88rem; }
        .jp-eyebrow { font-size: 0.78rem !important; text-transform: uppercase; letter-spacing: 0.05em; }
        .jp-desc { color: var(--text-secondary) !important; white-space: pre-wrap; }
        .jp-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 0.5rem; }
        .jp-icon--bad { background: var(--danger-soft); color: var(--danger); }
        .jp-btn { margin-top: 0.75rem; display: inline-flex; align-items: center; gap: 0.4rem; border: none; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.9rem; padding: 0.65rem 1.4rem; border-radius: 12px; cursor: pointer; }
        .jp-btn:disabled { opacity: 0.6; cursor: wait; }
        .jp-btn--ghost { background: var(--bg-tertiary); color: var(--text-primary); }
        .jp-loading { display: flex; align-items: center; gap: 0.5rem; }
      `}</style>
    </div>
  );
}
