import React from "react";

export default function SaveSuccessModal({
  open,
  onClose,
  title = "Form Saved",
  message = "Form data has been saved successfully.",
}) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ background: "rgba(15, 23, 42, 0.45)", zIndex: 1200 }}
    >
      <div
        className="mf-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, textAlign: "center" }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: "4px auto 14px",
            borderRadius: "999px",
            display: "grid",
            placeItems: "center",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#2563eb",
            fontSize: 28,
          }}
          aria-hidden="true"
        >
          &#128190;
        </div>
        <h3 className="mf-modal-title" style={{ marginBottom: 8 }}>
          {title}
        </h3>
        <p className="mf-modal-sub" style={{ marginBottom: 20 }}>
          {message}
        </p>
        <div className="mf-modal-footer" style={{ justifyContent: "center" }}>
          <button type="button" className="mf-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
