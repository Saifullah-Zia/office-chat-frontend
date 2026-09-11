"use client";

import { useState } from "react";
import { PollResponse } from "@/types";
import { apiPost } from "@/lib/api";
import { Check, Vote, Users } from "lucide-react";

interface PollCardProps {
  poll: PollResponse;
  isMine: boolean;
}

export default function PollCard({ poll, isMine }: PollCardProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [showVoters, setShowVoters] = useState(false);

  const handleVote = async (optionId: number) => {
    setIsVoting(true);
    try {
      await apiPost(`/api/polls/${poll.id}/vote/${optionId}`);
    } catch (err) {
      console.error("Failed to vote:", err);
    } finally {
      setIsVoting(false);
    }
  };

  const totalVotes = poll.totalVotes > 0 ? poll.totalVotes : 1;

  return (
    <div className={`poll-card ${isMine ? "poll-card--mine" : "poll-card--theirs"}`}>
      {/* Poll Header */}
      <div className="poll-header">
        <div className="poll-icon-box">
          <Vote size={18} />
        </div>
        <div className="poll-title-box">
          <h4 className="poll-question">{poll.question}</h4>
          <span className="poll-sub font-mono">
            {poll.multipleAnswers ? "Select one or more" : "Select one option"}
          </span>
        </div>
      </div>

      {/* Options List */}
      <div className="poll-options-list">
        {poll.options.map((opt) => {
          const percent = Math.round((opt.voteCount / totalVotes) * 100);

          return (
            <button
              key={opt.id}
              type="button"
              className={`poll-option-btn ${opt.votedByMe ? "poll-option-btn--voted" : ""}`}
              onClick={() => handleVote(opt.id)}
              disabled={isVoting}
            >
              {/* Progress bar background fill */}
              <div
                className="poll-progress-bar"
                style={{ width: `${percent}%` }}
              />

              <div className="poll-option-content">
                <div className="poll-check-circle">
                  {opt.votedByMe && <Check size={12} />}
                </div>
                <span className="poll-option-text">{opt.optionText}</span>
                <span className="poll-vote-count">{opt.voteCount}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Poll Footer */}
      <div className="poll-footer">
        <span className="poll-total-votes">
          {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
        </span>
        <button
          type="button"
          className="poll-voters-btn"
          onClick={() => setShowVoters(!showVoters)}
        >
          <Users size={12} /> {showVoters ? "Hide votes" : "View votes"}
        </button>
      </div>

      {/* Expanded Voter Names Details */}
      {showVoters && (
        <div className="poll-voters-details">
          {poll.options.map((opt) => (
            <div key={opt.id} className="poll-voter-group">
              <span className="poll-voter-opt-title">{opt.optionText}:</span>
              {opt.voterNames.length === 0 ? (
                <span className="poll-no-voters">No votes yet</span>
              ) : (
                <span className="poll-voter-names">{opt.voterNames.join(", ")}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .poll-card {
          width: 100%; min-width: 260px; max-width: 340px;
          border-radius: 16px; padding: 1rem;
          display: flex; flex-direction: column; gap: 0.85rem;
          box-shadow: var(--shadow-sm);
        }
        .poll-card--mine {
          background: var(--surface-card); border: 1px solid var(--accent-muted);
          color: var(--text-primary);
        }
        .poll-card--theirs {
          background: var(--surface-card); border: 1px solid var(--border);
          color: var(--text-primary);
        }

        .poll-header { display: flex; align-items: center; gap: 0.75rem; }
        .poll-icon-box {
          width: 36px; height: 36px; border-radius: 10px;
          background: var(--accent-soft); color: var(--accent);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .poll-title-box { display: flex; flex-direction: column; min-width: 0; }
        .poll-question { font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); margin: 0; line-height: 1.3; }
        .poll-sub { font-size: 0.6875rem; color: var(--text-muted); }

        .poll-options-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .poll-option-btn {
          position: relative; width: 100%; padding: 0.6rem 0.75rem;
          border-radius: 10px; border: 1px solid var(--border);
          background: var(--bg-secondary); cursor: pointer; overflow: hidden;
          text-align: left; transition: border-color 0.15s;
        }
        .poll-option-btn:hover { border-color: var(--accent); }
        .poll-option-btn--voted { border-color: var(--accent); background: var(--accent-soft); }

        .poll-progress-bar {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: var(--accent-muted); opacity: 0.5;
          transition: width 0.3s ease; z-index: 0;
        }
        .poll-option-content {
          position: relative; z-index: 1; display: flex; align-items: center; gap: 0.5rem;
        }
        .poll-check-circle {
          width: 18px; height: 18px; border-radius: 50%;
          border: 1.5px solid var(--text-muted); display: flex;
          align-items: center; justify-content: center; flex-shrink: 0;
        }
        .poll-option-btn--voted .poll-check-circle {
          border-color: var(--accent); background: var(--accent); color: #fff;
        }
        .poll-option-text { flex: 1; font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); }
        .poll-vote-count { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); }

        .poll-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding-top: 0.35rem; border-top: 1px solid var(--border);
          font-size: 0.75rem; color: var(--text-muted);
        }
        .poll-total-votes { font-weight: 600; }
        .poll-voters-btn {
          background: none; border: none; color: var(--accent);
          font-weight: 600; font-size: 0.75rem; cursor: pointer;
          display: flex; align-items: center; gap: 0.25rem;
        }

        .poll-voters-details {
          display: flex; flex-direction: column; gap: 0.35rem;
          background: var(--bg-secondary); border-radius: 8px; padding: 0.5rem 0.75rem;
          font-size: 0.72rem; border: 1px solid var(--border);
        }
        .poll-voter-group { display: flex; flex-direction: column; gap: 0.1rem; }
        .poll-voter-opt-title { font-weight: 700; color: var(--text-primary); }
        .poll-voter-names { color: var(--text-secondary); }
        .poll-no-voters { color: var(--text-faint); font-style: italic; }
      `}</style>
    </div>
  );
}
