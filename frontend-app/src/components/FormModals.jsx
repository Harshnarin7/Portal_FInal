/**
 * FormModals — Missing fields modal + Draft saved modal for all forms
 *
 * Props:
 *   session          (from useFormSession)
 *   onKeepEditing    (called when "Keep Editing" clicked in draft modal)
 *   onGoToDashboard  (called when "Go to Dashboard" clicked)
 */
import React from "react";
import { useNavigate } from "react-router-dom";

export default function FormModals({ session, onKeepEditing, onGoToDashboard }) {
  const navigate = useNavigate();
  const {
    showMissingModal, setShowMissingModal,
    missingFields,
    showDraftModal, setShowDraftModal,
  } = session;

  const handleDashboard = onGoToDashboard || (() => navigate("/dashboard"));
  const handleKeepEditing = onKeepEditing || (() => setShowDraftModal(false));

  return (
    <>
      {/* ── Missing fields modal ── */}
      {showMissingModal && (
        <div className="modal-overlay" onClick={() => setShowMissingModal(false)}>
          <div className="mf-modal" onClick={e => e.stopPropagation()}>
            <div className="mf-modal-header">
              <div className="mf-modal-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div className="mf-modal-text">
                <h3 className="mf-modal-title">Required fields missing</h3>
                <p className="mf-modal-sub">
                  {missingFields.length} field{missingFields.length !== 1 ? "s" : ""} need attention before saving
                </p>
              </div>
              <button className="mf-modal-close" onClick={() => setShowMissingModal(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="mf-modal-list">
              {missingFields.map((f, i) => (
                <div key={i} className="mf-modal-item">
                  <span className="mf-modal-num">{i + 1}</span>
                  <span className="mf-modal-label">
                    {typeof f === "string" ? f : f.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mf-modal-footer">
              <button className="mf-btn-secondary" onClick={() => setShowMissingModal(false)}>
                Dismiss
              </button>
              <button className="mf-btn-primary" onClick={() => {
                setShowMissingModal(false);
                // Scroll to first error field
                setTimeout(() => {
                  const first = missingFields[0];
                  const name = typeof first === "string" ? first : first?.fieldName;
                  const el = name ? document.querySelector(`[name="${name}"], #${name}`) : null;
                  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus?.(); }
                }, 100);
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Go to first error
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Draft saved modal ── */}
      {showDraftModal && (
        <div className="modal-overlay">
          <div className="mf-modal">
            <div className="mf-modal-header">
              <div className="mf-modal-icon-wrap" style={{ background:"#f0fdf4", borderColor:"#bbf7d0" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
              </div>
              <div className="mf-modal-text">
                <h3 className="mf-modal-title">Draft Saved</h3>
                <p className="mf-modal-sub">
                  Your progress has been saved. Return any time to complete this form.
                </p>
              </div>
            </div>
            <div className="mf-modal-footer">
              <button className="mf-btn-secondary" onClick={handleKeepEditing}>
                Keep Editing
              </button>
              <button className="mf-btn-primary" onClick={handleDashboard}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
