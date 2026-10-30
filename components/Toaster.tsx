"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT } from "@/lib/toast";

interface Toast {
  id: number;
  text: string;
}

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      const id = Date.now() + Math.random();
      setToasts((t) => (t.some((x) => x.text === text) ? t : [...t.slice(-2), { id, text }]));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="tst-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="tst">{t.text}</div>
      ))}
      <style>{`
        .tst-wrap {
          position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 1200;
          display: flex; flex-direction: column; gap: 8px; align-items: center; width: max-content; max-width: calc(100vw - 32px);
        }
        .tst {
          background: var(--text-primary); color: var(--bg-primary); padding: 0.6rem 1rem; border-radius: 10px;
          font-size: 0.84rem; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
