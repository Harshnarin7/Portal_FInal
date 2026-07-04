/**
 * SegmentedToggle — premium toggle for Form D (and future forms)
 * Uses the same .yn-btn/.yes-no-buttons CSS as YesNoToggle (Form A/B).
 *
 * Props:
 *   name        string
 *   value       current value
 *   options     string[] or {label, value}[]
 *   onChange    (name, value) => void
 *   disabled    bool
 *   error       bool   — red outer border when true
 */
import React from "react";

const COLOR = {
  yes:   { bg: "#16a34a", border: "#16a34a" },   // green
  no:    { bg: "#dc2626", border: "#dc2626" },    // red
  other: { bg: "#2563eb", border: "#2563eb" },    // blue
};

function getColor(v) {
  const sv = String(v).toLowerCase();
  if (sv === "yes" || v === true)  return COLOR.yes;
  if (sv === "no"  || v === false) return COLOR.no;
  return COLOR.other;
}

export default function SegmentedToggle({ name, value, options, onChange, disabled, error }) {
  const opts = options.map(o =>
    typeof o === "object" ? o : { label: o, value: o }
  );

  const activeColor = opts.find(o => o.value === value)
    ? getColor(opts.find(o => o.value === value).value)
    : null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        border: `1.5px solid ${error ? "#fca5a5" : activeColor ? activeColor.border : "#e2e8f0"}`,
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0,
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : "auto",
        transition: "border-color 0.18s",
      }}
    >
      {opts.map((opt, idx) => {
        const isActive = value === opt.value;
        const c = getColor(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(name, opt.value)}
            style={{
              height: 34,
              padding: "0 18px",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "Inter, system-ui, sans-serif",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              border: "none",
              borderLeft: idx > 0 ? `1.5px solid ${activeColor && (isActive || opts[idx-1]?.value === value) ? activeColor.border : "#e2e8f0"}` : "none",
              background: isActive ? c.bg : "#ffffff",
              color: isActive ? "#ffffff" : "#94a3b8",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "background 0.18s, color 0.18s, border-color 0.18s",
              whiteSpace: "nowrap",
              outline: "none",
              minWidth: 52,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
