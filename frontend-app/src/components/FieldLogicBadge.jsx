import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const TYPES = ["auto", "conditional", "carried", "validated"];

export default function FieldLogicBadge({ type, title }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, below: false });
  const ref = useRef(null);

  if (!TYPES.includes(type)) return null;

  const show = () => {
    if (!title || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const below = r.top < 72;
    setPos({
      top: below ? r.bottom : r.top,
      left: r.left + r.width / 2,
      below,
    });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <span
      ref={ref}
      className={`fl-badge fl-badge--${type}`}
      aria-label={title || type}
      tabIndex={title ? 0 : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Info size={13} strokeWidth={2.25} aria-hidden="true" />
      {open && title && createPortal(
        <span
          className={`fl-badge-popup${pos.below ? " fl-badge-popup--below" : ""}`}
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
        >
          {title}
        </span>,
        document.body
      )}
    </span>
  );
}

export function FieldLogicLegend() {
  return (
    <div className="fl-legend" role="note">
      <span className="fl-legend-item">
        <FieldLogicBadge type="auto" /> Auto-calculated
      </span>
      <span className="fl-legend-item">
        <FieldLogicBadge type="conditional" /> Depends on another answer
      </span>
      <span className="fl-legend-item">
        <FieldLogicBadge type="carried" /> Carried from another form
      </span>
      <span className="fl-legend-item">
        <FieldLogicBadge type="validated" /> Checked against another field
      </span>
    </div>
  );
}
