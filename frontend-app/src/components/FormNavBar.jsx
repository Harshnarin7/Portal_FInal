/**
 * FormNavBar — shared sticky bottom nav bar for all PORTAL Trial forms
 *
 * Props:
 *   onBack, onSave, onSaveDraft, onNext
 *   backLabel, nextLabel
 *   step, totalSteps          (e.g. step=2, totalSteps=17)
 *   isSaved                   (disables Next if false)
 *   session                   (from useFormSession)
 */
import React from "react";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";

export default function FormNavBar({
  onBack, onSave, onSaveDraft, onNext,
  backLabel = "Back", nextLabel = "Next",
  step = 1, totalSteps = 17,
  isSaved = false,
  session,
}) {
  const { autoSaveStatus, lastSaved, isDirty, relT } = session || {};

  return (
    <div className="form-navigation">

      {/* Back */}
      <button type="button" className="btn btn-secondary btn-outline" onClick={onBack}>
        <ArrowLeft size={15} /> {backLabel}
      </button>

      {/* Save */}
      <button type="button" className="btn btn-save btn-outline-blue" onClick={onSave}>
        <Save size={15} /> Save
      </button>

      {/* Save for Later */}
      {onSaveDraft && (
        <button type="button" className="btn btn-draft" onClick={onSaveDraft}>
          <Save size={15} /> Save for Later
        </button>
      )}

      {/* Auto-save indicator */}
      {session && (
        <div className="autosave-indicator">
          {lastSaved && autoSaveStatus === "idle" && (
            <span className="last-saved-txt">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Saved {relT(lastSaved)}
            </span>
          )}
          {isDirty && autoSaveStatus === "idle" && !lastSaved && (
            <span className="unsaved-dot-pill">
              <span className="unsaved-dot"/>Unsaved changes
            </span>
          )}
          {autoSaveStatus === "saving" && (
            <span className="autosave-pill autosave-pill--saving">
              <span className="autosave-dot autosave-dot--spin"/>Auto-saving…
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="autosave-pill autosave-pill--saved">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Auto-saved
            </span>
          )}
          {autoSaveStatus === "error" && (
            <span className="autosave-pill autosave-pill--error">Auto-save failed</span>
          )}
        </div>
      )}

      {/* Step indicator */}
      <div className="footer-step-indicator">
        <span className="step-text">STEP {step} OF {totalSteps}</span>
        <div className="step-progress-line">
          {Array.from({ length: Math.min(totalSteps, 5) }, (_, i) => (
            <div key={i} className={`progress-segment${i < step ? " active" : ""}`} />
          ))}
        </div>
      </div>

      {/* Next */}
      <button type="button" className="btn btn-primary"
        onClick={onNext} disabled={!isSaved}>
        {nextLabel} <ArrowRight size={15} />
      </button>

    </div>
  );
}
