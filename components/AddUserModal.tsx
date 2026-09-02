"use client";

import { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { RegisterRequest, Role, UserResponse } from "@/types";

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded: (newUser: UserResponse) => void;
}

export default function AddUserModal({ isOpen, onClose, onUserAdded }: AddUserModalProps) {
  const [form, setForm] = useState<RegisterRequest>({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
    department: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setError(null);
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((form.password ?? "").length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiPost<{ userId: number; name: string; email: string; role: Role }>(
        "/api/auth/register",
        form,
      );

      const newUser: UserResponse = {
        id: res.userId,
        name: res.name,
        email: res.email,
        department: form.department,
        role: res.role,
        active: true,
        createdAt: new Date().toISOString(),
      };

      onUserAdded(newUser);
      onClose();
      setForm({
        name: "",
        email: "",
        password: "",
        role: "EMPLOYEE",
        department: "",
      });
    } catch (err: unknown) {
      const e_ = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        e_?.response?.data?.error ??
          e_?.response?.data?.message ??
          "Failed to create user account.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="modal-title">Add New Employee</h2>
              <p className="modal-sub">Create an account for a new team member</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-grid">
            <div className="modal-field">
              <label className="modal-label">Full Name</label>
              <input
                name="name"
                type="text"
                placeholder="Bilal Ahmed"
                required
                value={form.name}
                onChange={handleChange}
                className="modal-input"
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Department</label>
              <input
                name="department"
                type="text"
                placeholder="Engineering"
                value={form.department ?? ""}
                onChange={handleChange}
                className="modal-input"
              />
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Work Email</label>
            <input
              name="email"
              type="email"
              placeholder="bilal@company.com"
              required
              value={form.email}
              onChange={handleChange}
              className="modal-input"
            />
          </div>

          <div className="modal-grid">
            <div className="modal-field">
              <label className="modal-label">Role</label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="modal-input"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="modal-field">
              <label className="modal-label">Temporary Password</label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                required
                value={form.password}
                onChange={handleChange}
                className="modal-input"
              />
            </div>
          </div>

          {error && <p className="modal-error">{error}</p>}

          <footer className="modal-footer">
            <button type="button" className="btn-sec" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="btn-pri">
              {isLoading ? <><Loader2 size={16} className="spin" /> Creating…</> : "Add Employee"}
            </button>
          </footer>
        </form>
      </div>

      <style>{`
        .modal-backdrop {
          position: fixed; inset: 0; z-index: 999;
          background: rgba(17, 24, 39, 0.6);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
        }
        .modal-card {
          width: 100%; max-width: 480px; background: #ffffff;
          border-radius: 1.25rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem; border-bottom: 1px solid #f3f4f6;
        }
        .modal-title-group { display: flex; align-items: center; gap: 0.75rem; }
        .modal-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: #eef2ff; color: #4f7df3;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-title { font-size: 1.1rem; font-weight: 700; color: #111827; margin: 0; }
        .modal-sub { font-size: 0.8125rem; color: #6b7280; margin: 0.1rem 0 0; }
        .modal-close { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 0.35rem; border-radius: 6px; }
        .modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
        .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .modal-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .modal-label { font-size: 0.8125rem; font-weight: 600; color: #374151; }
        .modal-input {
          width: 100%; padding: 0.6rem 0.875rem; border: 1.5px solid #e5e7eb;
          border-radius: 0.625rem; font-size: 0.875rem; color: #111827; background: #fff;
          outline: none; box-sizing: border-box;
        }
        .modal-error {
          font-size: 0.8125rem; color: #dc2626; background: #fef2f2;
          border: 1px solid #fecaca; border-radius: 0.5rem; padding: 0.5rem 0.75rem; margin: 0;
        }
        .modal-footer { display: flex; justify-content: flex-end; gap: 0.625rem; margin-top: 0.5rem; }
        .btn-sec { padding: 0.6rem 1.125rem; background: #f3f4f6; color: #374151; border: none; border-radius: 0.625rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
        .btn-pri { display: flex; align-items: center; gap: 0.375rem; padding: 0.6rem 1.25rem; background: #2c3e7a; color: #fff; border: none; border-radius: 0.625rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
