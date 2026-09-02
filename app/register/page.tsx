"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { saveAuth, isAuthenticated } from "@/lib/auth";
import { AuthResponse, RegisterRequest } from "@/types";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RegisterRequest>({
    name: "",
    email: "",
    password: "",
    role: "ADMIN",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated()) {
      router.replace("/");
    }
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiPost<AuthResponse>("/api/auth/register", form);
      saveAuth(data.token, {
        userId: data.userId,
        name: data.name,
        email: data.email,
        role: data.role,
      });
      window.location.href = "/";
    } catch (err: unknown) {
      const e_ = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const serverMsg = e_?.response?.data?.error ?? e_?.response?.data?.message;
      if (serverMsg) {
        setError(serverMsg);
      } else if (e_?.response?.status === 403) {
        setError("Registration is locked. An admin account already exists.");
      } else {
        setError("Registration failed. Please check your details.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-header">
          <h2>Create First Admin Account</h2>
          <p>Initialize your enterprise workspace</p>
        </div>

        {error && <div className="error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field-group">
            <label htmlFor="reg-name">Full Name</label>
            <input id="reg-name" name="name" type="text" required placeholder="System Admin" value={form.name} onChange={handleChange} />
          </div>
          <div className="field-group">
            <label htmlFor="reg-email">Email Address</label>
            <input id="reg-email" name="email" type="email" required placeholder="admin@company.com" value={form.email} onChange={handleChange} />
          </div>
          <div className="field-group">
            <label htmlFor="reg-password">Password</label>
            <div className="password-wrapper">
              <input id="reg-password" name="password" type={showPassword ? "text" : "password"} required placeholder="••••••••" value={form.password} onChange={handleChange} />
              <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={isLoading} className="submit-btn">
            {isLoading ? (<><Loader2 size={18} className="spinner" /> Creating Admin...</>) : "Initialize Organization"}
          </button>
        </form>

        <div className="login-footer">
          <p>Already have an account? <Link href="/login">Sign In</Link></p>
        </div>
      </div>

      <style>{`
        .login-shell { min-height:100vh;width:100vw;display:flex;align-items:center;justify-content:center;background:#0f172a;padding:1.5rem; }
        .login-card { width:100%;max-width:420px;background:#1e293b;border-radius:16px;padding:2.5rem;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);border:1px solid #334155; }
        .login-header h2 { font-size:1.5rem;font-weight:700;color:#f8fafc;margin-bottom:0.5rem; }
        .login-header p { font-size:0.875rem;color:#94a3b8;margin-bottom:1.5rem; }
        .error-alert { background:rgba(239,68,68,0.1);border:1px solid #ef4444;color:#fca5a5;padding:0.75rem 1rem;border-radius:8px;font-size:0.875rem;margin-bottom:1.5rem; }
        .login-form { display:flex;flex-direction:column;gap:1.25rem; }
        .field-group { display:flex;flex-direction:column;gap:0.375rem; }
        .field-group label { font-size:0.875rem;font-weight:500;color:#cbd5e1; }
        .field-group input { width:100%;padding:0.75rem 1rem;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f8fafc;font-size:0.95rem;transition:border-color 0.2s; }
        .field-group input:focus { border-color:#3b82f6; }
        .password-wrapper { position:relative;display:flex;align-items:center; }
        .eye-btn { position:absolute;right:0.75rem;color:#94a3b8; }
        .eye-btn:hover { color:#f8fafc; }
        .submit-btn { margin-top:0.5rem;width:100%;padding:0.875rem;background:#3b82f6;color:white;font-weight:600;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:0.5rem;font-size:1rem;transition:background 0.2s; }
        .submit-btn:hover:not(:disabled) { background:#2563eb; }
        .submit-btn:disabled { opacity:0.7;cursor:not-allowed; }
        .spinner { animation:spin 1s linear infinite; }
        @keyframes spin { from{transform:rotate(0deg);}to{transform:rotate(360deg);} }
        .login-footer { margin-top:1.5rem;text-align:center;font-size:0.875rem;color:#94a3b8; }
        .login-footer a { color:#3b82f6;font-weight:500; }
        .login-footer a:hover { text-decoration:underline; }
      `}</style>
    </div>
  );
}
