"use client";

import { useState } from "react";
import { X, Plus, Trash2, Vote, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { MessageResponse } from "@/types";

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  onPollCreated: (msg: MessageResponse) => void;
}

export default function CreatePollModal({
  isOpen,
  onClose,
  conversationId,
  onPollCreated,
}: CreatePollModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multipleAnswers, setMultipleAnswers] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, ""]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question.trim()) {
      alert("Please enter a poll question.");
      return;
    }
    if (validOptions.length < 2) {
      alert("Please provide at least 2 options.");
      return;
    }

    setIsLoading(true);
    try {
      const msg = await apiPost<MessageResponse>(`/api/conversations/${conversationId}/polls`, {
        question: question.trim(),
        multipleAnswers,
        options: validOptions,
      });
      onPollCreated(msg);
      onClose();
      setQuestion("");
      setOptions(["", ""]);
      setMultipleAnswers(false);
    } catch (err) {
      console.error("Failed to create poll:", err);
      alert("Failed to create poll.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="cpm-overlay" onClick={onClose}>
      <div className="cpm-card" onClick={(e) => e.stopPropagation()}>
        <div className="cpm-header">
          <div className="cpm-title-row">
            <Vote size={20} className="cpm-icon" />
            <h3>Create a Poll</h3>
          </div>
          <button type="button" className="cpm-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cpm-form">
          <div className="cpm-field">
            <label htmlFor="poll-question">Poll Question</label>
            <input
              id="poll-question"
              type="text"
              placeholder="Ask a question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="cpm-field">
            <label>Options</label>
            <div className="cpm-options-list">
              {options.map((opt, idx) => (
                <div key={idx} className="cpm-option-row">
                  <input
                    type="text"
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    required
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="cpm-remove-btn"
                      onClick={() => handleRemoveOption(idx)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 6 && (
              <button
                type="button"
                className="cpm-add-option-btn"
                onClick={handleAddOption}
              >
                <Plus size={14} /> Add Option
              </button>
            )}
          </div>

          <div className="cpm-toggle-row">
            <label htmlFor="multiple-answers">Allow multiple answers</label>
            <input
              id="multiple-answers"
              type="checkbox"
              checked={multipleAnswers}
              onChange={(e) => setMultipleAnswers(e.target.checked)}
            />
          </div>

          <div className="cpm-footer">
            <button type="button" className="cpm-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="cpm-submit">
              {isLoading ? <Loader2 size={16} className="spin" /> : "Create Poll"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .cpm-overlay {
          position: fixed; inset: 0; background: var(--bg-overlay);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; animation: fadeIn 0.15s ease;
        }
        .cpm-card {
          width: 90%; max-width: 420px; background: var(--surface-card);
          border-radius: 16px; border: 1px solid var(--border);
          box-shadow: var(--shadow-xl); overflow: hidden; display: flex; flex-direction: column;
        }
        .cpm-header {
          padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }
        .cpm-title-row { display: flex; align-items: center; gap: 0.5rem; }
        .cpm-icon { color: var(--accent); }
        .cpm-header h3 { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); margin: 0; }
        .cpm-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; border-radius: 6px; }

        .cpm-form { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .cpm-field { display: flex; flex-direction: column; gap: 0.4rem; }
        .cpm-field label { font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); }
        .cpm-field input[type="text"] {
          width: 100%; padding: 0.65rem 0.85rem; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: 10px; font-size: 0.875rem;
          color: var(--text-primary); transition: border-color 0.15s;
        }
        .cpm-field input[type="text"]:focus { border-color: var(--accent); background: var(--bg-primary); outline: none; }

        .cpm-options-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .cpm-option-row { display: flex; align-items: center; gap: 0.5rem; }
        .cpm-remove-btn {
          background: var(--danger-soft); color: var(--danger); border: none;
          padding: 0.5rem; border-radius: 8px; cursor: pointer;
        }

        .cpm-add-option-btn {
          display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78125rem;
          font-weight: 600; color: var(--accent); background: var(--accent-soft);
          border: none; padding: 0.4rem 0.75rem; border-radius: 8px; cursor: pointer; align-self: flex-start;
          margin-top: 0.25rem;
        }

        .cpm-toggle-row {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 0.84375rem; font-weight: 500; color: var(--text-secondary);
        }

        .cpm-footer { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
        .cpm-cancel { padding: 0.6rem 1rem; border-radius: 10px; background: var(--bg-tertiary); color: var(--text-muted); font-size: 0.875rem; font-weight: 600; cursor: pointer; }
        .cpm-submit { padding: 0.6rem 1.25rem; border-radius: 10px; background: var(--accent); color: var(--text-on-accent); font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
