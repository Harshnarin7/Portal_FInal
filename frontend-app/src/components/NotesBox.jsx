// NotesBox.jsx — Shared optional notes component for all PORTAL Trial forms
import React, { useState, useEffect } from "react";
import "./NotesBox.css";

export default function NotesBox({ formKey }) {
  const storageKey = formKey ? `notes_${formKey}` : null;
  const MAX = 500;

  const [notes, setNotes] = useState(() => {
    if (!storageKey) return "";
    return localStorage.getItem(storageKey) || "";
  });
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    if (notes) localStorage.setItem(storageKey, notes);
    else        localStorage.removeItem(storageKey);
  }, [notes, storageKey]);

  const clear = () => {
    setNotes("");
    if (storageKey) localStorage.removeItem(storageKey);
  };

  const pct = Math.min((notes.length / MAX) * 100, 100);
  const isNearLimit = notes.length >= MAX * 0.8;
  const isAtLimit   = notes.length >= MAX;

  return (
    <div className={`nb-wrap${notes ? " nb-wrap--filled" : ""}${focused ? " nb-wrap--focused" : ""}`}>
      {/* Header */}
      <div className="nb-header">
        <div className="nb-header-left">
          <div className="nb-icon-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div>
            <div className="nb-title-row">
              <span className="nb-title">Notes</span>
              <span className="nb-badge">Optional</span>
            </div>
            <p className="nb-subtitle">Add remarks, observations, or follow-up reminders. Not required for submission.</p>
          </div>
        </div>
        {notes.length > 0 && (
          <button type="button" className="nb-clear-btn" onClick={clear}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Textarea */}
      <div className="nb-body">
        <textarea
          className="nb-textarea"
          placeholder="e.g. Mother anxious during screening, follow-up required, special observations…"
          value={notes}
          maxLength={MAX}
          onChange={e => setNotes(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={3}
        />

        {/* Footer */}
        <div className="nb-footer">
          <div className="nb-progress-bar">
            <div
              className={`nb-progress-fill${isNearLimit ? " nb-progress-fill--warn" : ""}${isAtLimit ? " nb-progress-fill--limit" : ""}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`nb-count${isNearLimit ? " nb-count--warn" : ""}${isAtLimit ? " nb-count--limit" : ""}`}>
            {notes.length} / {MAX}
          </span>
        </div>
      </div>
    </div>
  );
}
