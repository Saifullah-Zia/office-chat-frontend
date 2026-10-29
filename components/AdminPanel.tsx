"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Shield, ShieldOff, UserX, UserCheck, ChevronDown } from "lucide-react";
import { apiGet, apiDelete, apiPut } from "@/lib/api";
import { UserResponse, Role } from "@/types";
import Avatar from "./Avatar";

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
  onUsersChanged: () => void;
}

export default function AdminPanel({ open, onClose, onUsersChanged }: AdminPanelProps) {
  const [allUsers, setAllUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const users = await apiGet<UserResponse[]>("/api/users/admin/all");
      setAllUsers(users);
    } catch (err) {
      console.error("Failed to fetch admin users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchUsers();
  }, [open, fetchUsers]);

  const handleDeactivate = async (userId: number) => {
    setActionLoading(userId);
    try {
      await apiDelete(`/api/users/admin/${userId}`);
      await fetchUsers();
      onUsersChanged();
    } catch (err) {
      console.error("Failed to deactivate user:", err);
      alert("Failed to deactivate user");
    } finally {
      setActionLoading(null);
      setConfirmDelete(null);
    }
  };

  const handleReactivate = async (userId: number) => {
    setActionLoading(userId);
    try {
      await apiPut(`/api/users/admin/${userId}/reactivate`);
      await fetchUsers();
      onUsersChanged();
    } catch (err) {
      console.error("Failed to reactivate user:", err);
      alert("Failed to reactivate user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (userId: number, newRole: Role) => {
    setActionLoading(userId);
    try {
      await apiPut(`/api/users/admin/${userId}/role`, { role: newRole });
      await fetchUsers();
      onUsersChanged();
    } catch (err) {
      console.error("Failed to change role:", err);
      alert("Failed to change role");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = allUsers.filter((u) => {
    if (filter === "active") return u.active;
    if (filter === "inactive") return !u.active;
    return true;
  });

  if (!open) return null;

  return (
    <>
      <div className="ap-backdrop" onClick={onClose} />
      <div className="ap-panel">
        {/* Header */}
        <div className="ap-header">
          <div className="ap-header-left">
            <Shield size={20} />
            <h2>Admin Panel</h2>
          </div>
          <button className="ap-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Stats bar */}
        <div className="ap-stats">
          <div className="ap-stat">
            <span className="ap-stat-num">{allUsers.filter((u) => u.active).length}</span>
            <span className="ap-stat-label">Active</span>
          </div>
          <div className="ap-stat ap-stat--warn">
            <span className="ap-stat-num">{allUsers.filter((u) => !u.active).length}</span>
            <span className="ap-stat-label">Deactivated</span>
          </div>
          <div className="ap-stat">
            <span className="ap-stat-num">{allUsers.filter((u) => u.role === "ADMIN").length}</span>
            <span className="ap-stat-label">Admins</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="ap-filters">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              className={`ap-filter-btn ${filter === f ? "ap-filter-btn--on" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ap-filter-count">
                {f === "all" ? allUsers.length : f === "active" ? allUsers.filter((u) => u.active).length : allUsers.filter((u) => !u.active).length}
              </span>
            </button>
          ))}
        </div>

        {/* User list */}
        <div className="ap-list">
          {loading ? (
            <div className="ap-loading">Loading users...</div>
          ) : filtered.length === 0 ? (
            <div className="ap-empty">No users found</div>
          ) : (
            filtered.map((user) => (
              <div key={user.id} className={`ap-user ${!user.active ? "ap-user--inactive" : ""}`}>
                <div className="ap-user-left">
                  <div className="ap-avatar-wrap">
                    <Avatar name={user.name} size={40} />
                    {!user.active && <span className="ap-deactivated-badge">✕</span>}
                  </div>
                  <div className="ap-user-info">
                    <div className="ap-user-name-row">
                      <span className="ap-user-name">{user.name}</span>
                      <span className={`ap-role-badge ${user.role === "ADMIN" ? "ap-role-badge--admin" : ""}`}>
                        {user.role}
                      </span>
                    </div>
                    <span className="ap-user-email">{user.email}</span>
                    {user.department && <span className="ap-user-dept">{user.department}</span>}
                  </div>
                </div>

                <div className="ap-user-actions">
                  {/* Role toggle */}
                  <div className="ap-role-select">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                      disabled={actionLoading === user.id}
                      className="ap-select"
                    >
                      <option value="EMPLOYEE">Employee</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <ChevronDown size={12} className="ap-select-icon" />
                  </div>

                  {/* Activate / Deactivate */}
                  {user.active ? (
                    confirmDelete === user.id ? (
                      <div className="ap-confirm-row">
                        <span className="ap-confirm-text">Delete?</span>
                        <button
                          className="ap-btn ap-btn--danger"
                          onClick={() => handleDeactivate(user.id)}
                          disabled={actionLoading === user.id}
                        >
                          Yes
                        </button>
                        <button
                          className="ap-btn ap-btn--ghost"
                          onClick={() => setConfirmDelete(null)}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        className="ap-btn ap-btn--danger-outline"
                        onClick={() => setConfirmDelete(user.id)}
                        disabled={actionLoading === user.id}
                        title="Deactivate user"
                      >
                        <UserX size={14} />
                      </button>
                    )
                  ) : (
                    <button
                      className="ap-btn ap-btn--success"
                      onClick={() => handleReactivate(user.id)}
                      disabled={actionLoading === user.id}
                      title="Reactivate user"
                    >
                      <UserCheck size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        .ap-backdrop {
          position: fixed; inset: 0; z-index: 999;
          background: var(--bg-overlay);
          backdrop-filter: blur(6px);
        }
        .ap-panel {
          position: fixed; top: 50%; left: 50%; z-index: 1000;
          transform: translate(-50%, -50%);
          width: min(560px, 92vw); max-height: 85vh;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          display: flex; flex-direction: column;
          box-shadow: var(--shadow-xl);
          animation: ap-in 0.25s ease;
          overflow: hidden;
        }
        @keyframes ap-in {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
        }

        .ap-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
        }
        .ap-header-left {
          display: flex; align-items: center; gap: 0.6rem;
          color: var(--accent);
        }
        .ap-header-left h2 {
          margin: 0; font-size: 1.05rem; font-weight: 700;
          color: var(--text-primary);
        }
        .ap-close {
          background: none; border: none;
          color: var(--text-muted); cursor: pointer;
          padding: 6px; border-radius: var(--radius-sm);
          transition: all 0.15s;
        }
        .ap-close:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .ap-stats {
          display: flex; gap: 0.75rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
        }
        .ap-stat {
          flex: 1; text-align: center;
          padding: 0.6rem 0.5rem;
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
        }
        .ap-stat--warn .ap-stat-num { color: var(--danger); }
        .ap-stat-num {
          display: block; font-size: 1.4rem; font-weight: 700;
          color: var(--accent);
        }
        .ap-stat-label {
          font-size: 0.68rem; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.5px;
          margin-top: 2px;
        }

        .ap-filters {
          display: flex; gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .ap-filter-btn {
          padding: 0.35rem 0.75rem; border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted); font-size: 0.78rem;
          cursor: pointer;
          display: flex; align-items: center; gap: 0.4rem;
          transition: all 0.15s; font-weight: 500;
        }
        .ap-filter-btn:hover {
          background: var(--bg-inset);
          color: var(--text-primary);
        }
        .ap-filter-btn--on {
          background: var(--accent); color: var(--text-on-accent);
          border-color: var(--accent); font-weight: 600;
        }
        .ap-filter-count {
          background: rgba(255,255,255,0.2);
          padding: 0 0.35rem; border-radius: 6px;
          font-size: 0.68rem; font-weight: 600;
        }
        .ap-filter-btn:not(.ap-filter-btn--on) .ap-filter-count {
          background: var(--border);
          color: var(--text-tertiary);
        }

        .ap-list {
          flex: 1; overflow-y: auto;
          padding: 0.5rem 1rem;
        }
        .ap-loading, .ap-empty {
          text-align: center; padding: 2rem;
          color: var(--text-faint); font-size: 0.85rem;
        }

        .ap-user {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.75rem 0.65rem; border-radius: var(--radius-lg);
          transition: background 0.15s;
        }
        .ap-user:hover { background: var(--bg-hover); }
        .ap-user--inactive { opacity: 0.5; }
        .ap-user-left {
          display: flex; align-items: center; gap: 0.75rem;
          flex: 1; min-width: 0;
        }
        .ap-avatar-wrap { position: relative; flex-shrink: 0; }
        .ap-deactivated-badge {
          position: absolute; bottom: -2px; right: -2px;
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--danger); color: #fff;
          font-size: 9px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid var(--surface-card);
        }
        .ap-user-info { min-width: 0; }
        .ap-user-name-row {
          display: flex; align-items: center; gap: 0.5rem;
        }
        .ap-user-name {
          font-weight: 600; font-size: 0.875rem;
          color: var(--text-primary);
        }
        .ap-role-badge {
          font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;
          background: var(--bg-tertiary); color: var(--text-muted);
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
          border: 1px solid var(--border-subtle);
        }
        .ap-role-badge--admin {
          background: rgba(168,85,247,0.12); color: #a855f7;
          border-color: rgba(168,85,247,0.2);
        }
        .ap-user-email {
          font-size: 0.75rem; color: var(--text-muted);
          display: block; margin-top: 1px;
        }
        .ap-user-dept {
          font-size: 0.7rem; color: var(--accent);
          display: block; margin-top: 1px;
        }

        .ap-user-actions {
          display: flex; align-items: center; gap: 0.5rem;
          flex-shrink: 0;
        }

        .ap-role-select {
          position: relative; display: inline-flex; align-items: center;
        }
        .ap-select {
          appearance: none;
          padding: 0.35rem 1.6rem 0.35rem 0.6rem;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--bg-primary); color: var(--text-primary);
          font-size: 0.75rem; font-weight: 500;
          cursor: pointer; outline: none;
          transition: border-color 0.15s;
        }
        .ap-select:focus { border-color: var(--accent); }
        .ap-select-icon {
          position: absolute; right: 6px;
          pointer-events: none; color: var(--text-faint);
        }

        .ap-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 0.35rem 0.6rem; border-radius: var(--radius-sm);
          border: none; font-size: 0.75rem; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
        }
        .ap-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ap-btn--danger { background: var(--danger); color: #fff; }
        .ap-btn--danger:hover:not(:disabled) { background: #dc2626; }
        .ap-btn--danger-outline {
          background: none;
          border: 1px solid rgba(239,68,68,0.3);
          color: var(--danger);
        }
        .ap-btn--danger-outline:hover:not(:disabled) {
          background: var(--danger-soft);
        }
        .ap-btn--success { background: var(--success); color: #fff; }
        .ap-btn--success:hover:not(:disabled) { background: #16a34a; }
        .ap-btn--ghost {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
        }
        .ap-btn--ghost:hover { background: var(--bg-inset); }

        .ap-confirm-row {
          display: flex; align-items: center; gap: 0.35rem;
        }
        .ap-confirm-text {
          font-size: 0.72rem; color: var(--danger); font-weight: 600;
        }
      `}</style>
    </>
  );
}
