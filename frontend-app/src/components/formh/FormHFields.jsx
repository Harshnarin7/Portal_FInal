import React from "react";

/* ─────────────────────────────────────────────────────────────────────────
   FormH visual-refresh components (Reference-image redesign, Aug 2026)

   Design language: "modern clinical SaaS" — soft indigo/lavender accents,
   compact segmented controls, white cards on a near-white canvas. Every
   component here is a DROP-IN replacement — same props / same event shape
   as before — so existing handlers (handleChange, handleCranialUsgChange,
   handleNeuroChange, validateIVH, etc.) work completely unchanged. Only
   the markup/className output changed; no prop contracts changed, so no
   call site elsewhere in FormH.jsx needs to be touched.

   Actual color values live in styles/FormH.css (scoped under
   .formh-modern) rather than as raw Tailwind utility classes, because a
   handful of them need to reliably win against pre-existing !important
   rules in the app's shared stylesheets (UnifiedForms.css etc.) that
   target bare <input>/<select>/<textarea> tags across every form.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * PillSelect — replaces a native <select>. Fires the SAME event shape a
 * native <select onChange> does: { target: { name, value } }. Renders as
 * a compact segmented control (reference spec section J).
 */
export function PillSelect({ label, name, value, options, onChange, onBlur, required, fieldNum, autoFilledFrom, error, touched }) {
  const fire = (val) => {
    onChange({ target: { name, value: val, type: "select-one" } });
  };
  return (
    <div className="fh-field">
      {label && (
        <label className="fh-label">
          {fieldNum && <span className="fh-field-num">{fieldNum}.</span>}
          {label}
          {required && <span className="fh-required">*</span>}
        </label>
      )}
      <div className="fh-segmented" role="group">
        {options.map((opt) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          const isSelected = value === optValue;
          return (
            <button
              key={optValue}
              type="button"
              onClick={() => fire(optValue)}
              onBlur={onBlur ? () => onBlur({ target: { name, value } }) : undefined}
              className={`fh-segmented-btn${isSelected ? " is-selected" : ""}`}
            >
              {isSelected && <span className="fh-segmented-dot" aria-hidden="true" />}
              {optLabel}
            </button>
          );
        })}
      </div>
      {autoFilledFrom && <span className="fh-autofill-tag">from {autoFilledFrom}</span>}
      {touched && error && <div className="fh-error-text">{error}</div>}
    </div>
  );
}

/**
 * ChipMultiSelect — replaces a checkbox-group used for multi-value fields
 * (e.g. "Which AED"). onChange receives the full updated array, same as
 * the inline toggle logic already used for aed_type etc.
 */
export function ChipMultiSelect({ label, options, value = [], onChange, fieldNum }) {
  const toggle = (val) => {
    if (value.includes(val)) onChange(value.filter((v) => v !== val));
    else onChange([...value, val]);
  };
  return (
    <div className="fh-field">
      {label && (
        <label className="fh-label">
          {fieldNum && <span className="fh-field-num">{fieldNum}.</span>}
          {label}
        </label>
      )}
      <div className="fh-chip-row">
        {options.map(({ value: optValue, label: optLabel }) => {
          const isSelected = value.includes(optValue);
          return (
            <button
              key={optValue}
              type="button"
              onClick={() => toggle(optValue)}
              className={`fh-chip${isSelected ? " is-selected" : ""}`}
            >
              {isSelected && <span className="fh-chip-check">✓</span>}
              {optLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Small helper: derive a soft icon-chip background/text/bar color set from
   the accentColor prop already passed at every call site (e.g.
   "bg-violet-500"). Every existing <CollapsibleCard accentColor="bg-x-500"
   .../> call keeps working completely unchanged; this just maps that same
   prop to real hex values applied via inline style, so the icon renders
   inside a soft-tinted circle like the reference (pink circle for IVH,
   indigo for PVL, etc.) without depending on Tailwind generating
   dynamically-named utility classes (which its content scanner can't see
   at build time since the class names would otherwise be built with a
   template literal). Any accent color not in this table falls back to a
   neutral slate tint rather than breaking. */
const ACCENT_CHIP_MAP = {
  "bg-violet-500":  { bar: "#8b5cf6", chipBg: "#f5f3ff", chipText: "#7c3aed" },
  "bg-purple-500":  { bar: "#a855f7", chipBg: "#faf5ff", chipText: "#9333ea" },
  "bg-blue-500":    { bar: "#3b82f6", chipBg: "#eff6ff", chipText: "#2563eb" },
  "bg-indigo-500":  { bar: "#6366f1", chipBg: "#eef2ff", chipText: "#4f46e5" },
  "bg-sky-500":     { bar: "#0ea5e9", chipBg: "#f0f9ff", chipText: "#0284c7" },
  "bg-emerald-500": { bar: "#10b981", chipBg: "#ecfdf5", chipText: "#059669" },
  "bg-teal-500":    { bar: "#14b8a6", chipBg: "#f0fdfa", chipText: "#0d9488" },
  "bg-cyan-500":    { bar: "#06b6d4", chipBg: "#ecfeff", chipText: "#0891b2" },
  "bg-amber-500":   { bar: "#f59e0b", chipBg: "#fffbeb", chipText: "#d97706" },
  "bg-orange-500":  { bar: "#f97316", chipBg: "#fff7ed", chipText: "#ea580c" },
  "bg-rose-500":    { bar: "#f43f5e", chipBg: "#fff1f2", chipText: "#e11d48" },
  "bg-pink-500":    { bar: "#ec4899", chipBg: "#fdf2f8", chipText: "#db2777" },
  "bg-red-500":     { bar: "#ef4444", chipBg: "#fef2f2", chipText: "#dc2626" },
  "bg-lime-500":    { bar: "#84cc16", chipBg: "#f7fee7", chipText: "#65a30d" },
  "bg-green-500":   { bar: "#22c55e", chipBg: "#f0fdf4", chipText: "#16a34a" },
  "bg-fuchsia-500": { bar: "#d946ef", chipBg: "#fdf4ff", chipText: "#c026d3" },
};
function accentToChip(accentColor = "bg-slate-400") {
  return ACCENT_CHIP_MAP[accentColor] || { bar: "#94a3b8", chipBg: "#f1f5f9", chipText: "#475569" };
}

/**
 * CollapsibleCard — accordion section card matching the reference: a thin
 * colored accent bar, a small icon in a soft-tinted circle, the "H1.1"
 * code, the section title, a status pill, and a circular chevron button.
 * Stays fully controlled by the parent's existing `openSection` state
 * (pass `open` + `onToggle`, exactly like before).
 */
export function CollapsibleCard({ code, title, icon, accentColor = "bg-sky-500", summary, statusClass, open, onToggle, children }) {
  const statusColorMap = {
    "status-yes": "fh-badge-yes",
    "status-no": "fh-badge-no",
    "status-empty": "fh-badge-empty",
  };
  const badgeClass = statusColorMap[statusClass] || "fh-badge-empty";
  const { chipBg, chipText, bar } = accentToChip(accentColor);

  return (
    <div className={`fh-card${open ? " is-open" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="fh-card-header"
        aria-expanded={open}
      >
        <span className="fh-card-accent" style={{ background: bar }} aria-hidden="true" />
        {icon && (
          <span className="fh-card-icon" style={{ background: chipBg, color: chipText }} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="fh-card-titles">
          {code && <span className="fh-card-code">{code}</span>}
          <span className="fh-card-title">{title}</span>
        </span>
        {summary && <span className={`fh-badge ${badgeClass}`}>{summary}</span>}
        <span className="fh-chevron" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && <div className="fh-card-body">{children}</div>}
    </div>
  );
}

/** Two/three column responsive row — replaces .form-row for restyled sections. */
export function FieldRow({ children, cols = 2 }) {
  return (
    <div className={`fh-grid fh-grid-${cols}`}>
      {children}
    </div>
  );
}
