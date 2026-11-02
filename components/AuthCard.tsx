import type { ReactNode } from "react";

/** Centered card for the small account pages (change, forgot and reset password). */
export default function AuthCard({ icon, title, subtitle, children }: {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="auc">
      <div className="auc-card">
        <div className="auc-icon">{icon}</div>
        <h1>{title}</h1>
        {subtitle && <p className="auc-sub">{subtitle}</p>}
        {children}
      </div>
      <style>{`
        .auc { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1rem; background: var(--bg-secondary); }
        .auc-card { width: 100%; max-width: 400px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 18px; padding: 1.75rem 1.5rem; box-shadow: 0 20px 40px rgba(0,0,0,0.08); }
        .auc-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 0.9rem; }
        .auc h1 { margin: 0; font-size: 1.3rem; color: var(--text-primary); }
        .auc-sub { margin: 0.35rem 0 1.25rem; font-size: 0.86rem; color: var(--text-muted); line-height: 1.45; }
        .auc-link { margin-top: 1rem; display: inline-flex; align-items: center; gap: 0.35rem; background: none; border: none; color: var(--accent); font-size: 0.84rem; font-weight: 600; cursor: pointer; padding: 0; text-decoration: none; }
        .auc-field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.75rem; }
        .auc-field input { padding: 0.6rem 0.75rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-weight: 400; font-size: 0.92rem; }
        .auc-field input:focus { outline: none; border-color: var(--accent); }
        .auc-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.65rem 1rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.9rem; cursor: pointer; }
        .auc-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .auc-ok { margin: 0; padding: 0.75rem; border-radius: 10px; background: var(--success-soft, #dcfce7); color: var(--success-text, #166534); font-size: 0.86rem; line-height: 1.45; }
        .auc-error { margin: 0 0 0.75rem; font-size: 0.82rem; color: var(--danger); }
      `}</style>
    </main>
  );
}
