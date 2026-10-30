"use client";

import { useState } from "react";
import { X, Users, Check, Search, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { ConversationResponse, UserResponse, CreateGroupRequest } from "@/types";
import Avatar from "./Avatar";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserResponse[];
  onGroupCreated: (newConv: ConversationResponse) => void;
}

export default function CreateGroupModal({
  isOpen,
  onClose,
  users,
  onGroupCreated,
}: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const toggleUser = (userId: number) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a group name.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Please select at least one member for the group.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const payload: CreateGroupRequest = {
        name: name.trim(),
        memberIds: selectedIds,
        description: description.trim() || undefined,
        isPublic,
      };

      const newConv = await apiPost<ConversationResponse>("/api/conversations/group", payload);
      onGroupCreated(newConv);
      onClose();
      setName("");
      setDescription("");
      setIsPublic(false);
      setSelectedIds([]);
    } catch (err: unknown) {
      const e_ = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        e_?.response?.data?.error ??
          e_?.response?.data?.message ??
          "Failed to create group conversation."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon">
              <Users size={20} />
            </div>
            <div>
              <h2 className="modal-title">Create Group Chat</h2>
              <p className="modal-sub">Start a team conversation</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Group Name</label>
            <input
              type="text"
              placeholder="e.g. Project Alpha"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="modal-input"
              required
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Description (optional)</label>
            <input
              type="text"
              placeholder="What's this group about?"
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="modal-input"
            />
          </div>

          <label className="modal-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span className="modal-label" style={{ margin: 0 }}>Public channel — anyone in the company can find and join it</span>
          </label>

          <div className="modal-field">
            <label className="modal-label">Add Members ({selectedIds.length} selected)</label>
            <div className="search-box">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                placeholder="Search team members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {/* User selector list */}
          <div className="user-picker-list">
            {filteredUsers.length === 0 ? (
              <p className="picker-empty">No matching users</p>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedIds.includes(u.id);
                return (
                  <div
                    key={u.id}
                    className={`user-picker-item ${isSelected ? "user-picker-item--selected" : ""}`}
                    onClick={() => toggleUser(u.id)}
                  >
                    <Avatar name={u.name} size={36} />
                    <div className="user-picker-info">
                      <span className="user-picker-name">{u.name}</span>
                      <span className="user-picker-sub">{u.department || u.email}</span>
                    </div>
                    <div className={`checkbox ${isSelected ? "checkbox--checked" : ""}`}>
                      {isSelected && <Check size={14} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {error && <p className="modal-error">{error}</p>}

          <footer className="modal-footer">
            <button type="button" className="btn-sec" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="btn-pri">
              {isLoading ? (
                <>
                  <Loader2 size={16} className="spin" /> Creating…
                </>
              ) : (
                "Create Group"
              )}
            </button>
          </footer>
        </form>
      </div>

      <style>{`
        .modal-backdrop {
          position: fixed; inset: 0; z-index: 999;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
        }
        .modal-card {
          width: 100%; max-width: 480px; background: #ffffff;
          border-radius: 1.25rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
          overflow: hidden; display: flex; flex-direction: column;
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem; border-bottom: 1px solid #f3f4f6;
        }
        .modal-title-group { display: flex; align-items: center; gap: 0.75rem; }
        .modal-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: #eef2ff; color: #4f46e5;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-title { font-size: 1.1rem; font-weight: 700; color: #111827; margin: 0; }
        .modal-sub { font-size: 0.8125rem; color: #6b7280; margin: 0.1rem 0 0; }
        .modal-close { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 0.35rem; border-radius: 6px; }
        .modal-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
        .modal-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .modal-label { font-size: 0.8125rem; font-weight: 600; color: #374151; }
        .modal-input {
          width: 100%; padding: 0.6rem 0.875rem; border: 1.5px solid #e5e7eb;
          border-radius: 0.625rem; font-size: 0.875rem; color: #111827; background: #fff;
          outline: none; box-sizing: border-box;
        }
        .modal-input:focus { border-color: #4f46e5; }
        .search-box { position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; left: 0.75rem; color: #9ca3af; pointer-events: none; }
        .search-input {
          width: 100%; padding: 0.5rem 0.75rem 0.5rem 2.25rem; border: 1px solid #e5e7eb;
          border-radius: 0.5rem; font-size: 0.8125rem; background: #f9fafb;
        }
        .search-input:focus { border-color: #4f46e5; background: #fff; outline: none; }

        .user-picker-list {
          max-height: 200px; overflow-y: auto; display: flex; flex-direction: column;
          gap: 0.25rem; border: 1px solid #f3f4f6; border-radius: 0.625rem; padding: 0.35rem;
        }
        .picker-empty { padding: 1.5rem; text-align: center; font-size: 0.8125rem; color: #9ca3af; margin: 0; }
        .user-picker-item {
          display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem;
          border-radius: 0.5rem; cursor: pointer; transition: background 0.12s;
        }
        .user-picker-item:hover { background: #f8fafc; }
        .user-picker-item--selected { background: #eef2ff; }
        .user-picker-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .user-picker-name { font-size: 0.84375rem; font-weight: 600; color: #111827; }
        .user-picker-sub { font-size: 0.75rem; color: #6b7280; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
        .checkbox {
          width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid #d1d5db;
          display: flex; align-items: center; justify-content: center; color: #fff;
          transition: all 0.12s;
        }
        .checkbox--checked { background: #4f46e5; border-color: #4f46e5; }

        .modal-error {
          font-size: 0.8125rem; color: #dc2626; background: #fef2f2;
          border: 1px solid #fecaca; border-radius: 0.5rem; padding: 0.5rem 0.75rem; margin: 0;
        }
        .modal-footer { display: flex; justify-content: flex-end; gap: 0.625rem; margin-top: 0.25rem; }
        .btn-sec { padding: 0.6rem 1.125rem; background: #f3f4f6; color: #374151; border: none; border-radius: 0.625rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
        .btn-pri { display: flex; align-items: center; gap: 0.375rem; padding: 0.6rem 1.25rem; background: #4f46e5; color: #fff; border: none; border-radius: 0.625rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
