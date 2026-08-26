import React from "react";

/* ─────────────────────────────────────────────────────────────────────────
   FormH visual-refresh components (pilot: H1 Neurological)

   Design language ported from the Rocket.new mockup (rounded pill/chip
   selectors, accent-bar section cards). Every component here is a DROP-IN
   replacement — same props / same event shape as what FormH.jsx already
   calls — so existing handlers (handleChange, handleCranialUsgChange,
   handleNeuroChange, validateIVH, etc.) work completely unchanged.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * PillSelect — replaces a native <select>. Fires the SAME event shape a
 * native <select onChange> does: { target: { name, value } }. Drop it in
 * anywhere a <select name=... value=... onChange={handleX}> currently is.
 */
export function PillSelect({ label, name, value, options, onChange, onBlur, required, fieldNum, autoFilledFrom, error, touched }) {
  const fire = (val) => {
    onChange({ target: { name, value: val, type: "select-one" } });
  };
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-semibold text-slate-700">
          {fieldNum && <span className="text-slate-400 font-normal mr-1">{fieldNum}.</span>}
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
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
              className={`px-4 py-2 rounded-full border-2 text-sm font-semibold transition-all duration-150 ${
                isSelected
                  ? "border-sky-600 bg-sky-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-sky-400 hover:text-sky-600"
              }`}
            >
              {optLabel}
            </button>
          );
        })}
      </div>
      {autoFilledFrom && <span className="inline-block mt-1 text-xs text-sky-600 font-medium">from {autoFilledFrom}</span>}
      {touched && error && <div className="text-xs text-rose-600 font-medium mt-1">{error}</div>}
    </div>
  );
}

/**
 * ChipMultiSelect — replaces a checkbox-group used for multi-value fields
 * (e.g. "Which AED"). onChange receives the full updated array, same as
 * the inline toggle logic already used for aed_type etc., so it can
 * replace that logic directly.
 */
export function ChipMultiSelect({ label, options, value = [], onChange, fieldNum }) {
  const toggle = (val) => {
    if (value.includes(val)) onChange(value.filter((v) => v !== val));
    else onChange([...value, val]);
  };
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-semibold text-slate-700">
          {fieldNum && <span className="text-slate-400 font-normal mr-1">{fieldNum}.</span>}
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(({ value: optValue, label: optLabel }) => {
          const isSelected = value.includes(optValue);
          return (
            <button
              key={optValue}
              type="button"
              onClick={() => toggle(optValue)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all duration-150 ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {isSelected && <span className="text-indigo-500 text-xs">✓</span>}
              {optLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CollapsibleCard — restyles the existing .card / .card-header-row /
 * .card-body pattern with an accent bar + icon + status summary, while
 * staying fully controlled by the parent's existing `openSection` state
 * (pass `open` + `onToggle`, exactly like the current onClick handlers).
 */
export function CollapsibleCard({ code, title, icon, accentColor = "bg-sky-500", summary, statusClass, open, onToggle, children }) {
  const statusColorMap = {
    "status-yes": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "status-no": "bg-slate-50 text-slate-500 border-slate-200",
    "status-empty": "bg-slate-50 text-slate-400 border-slate-200",
  };
  const badgeClass = statusColorMap[statusClass] || "bg-slate-50 text-slate-500 border-slate-200";

  return (
    <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden mb-4">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className={`w-1 h-8 rounded-full ${accentColor} flex-shrink-0`} />
        {icon && <span className="text-lg flex-shrink-0">{icon}</span>}
        <span className="flex-1 min-w-0">
          {code && <span className="text-xs font-bold text-slate-400 mr-1.5">{code}</span>}
          <span className="text-sm sm:text-base font-bold text-slate-800">{title}</span>
        </span>
        {summary && (
          <span className={`hidden sm:inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeClass}`}>
            {summary}
          </span>
        )}
        <span className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100">{children}</div>}
    </div>
  );
}

/** Two/three column responsive row — replaces .form-row for restyled sections. */
export function FieldRow({ children, cols = 2 }) {
  return (
    <div className={`grid gap-4 ${cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
      {children}
    </div>
  );
}
