import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MIN_SEC_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function TimeColumn({ part, label, options, current, onPick }) {
  return (
    <div className="mt-popover-col">
      <div className="mt-popover-label">{label}</div>
      <div
        className="mt-popover-list"
        onWheel={e => e.stopPropagation()}
      >
        {options.map(v => (
          <div
            key={v}
            className={`mt-popover-item${current === v ? " mt-popover-item-active" : ""}`}
            onClick={() => onPick(part, v)}
          >
            {v}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 24-hour clock picker. No AM/PM.
 * format "hms" → HH:MM:SS (hours 0–23)
 * format "hm"  → HH:MM
 * format "ms"  → MM:SS
 * Popover is portaled to document.body so card overflow cannot clip it.
 */
export default function ModernTimeInput({
  hour,
  minute,
  second,
  onChange,
  disabled = false,
  withSeconds = true,
  format,
  placeholder,
  hasError = false,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const mode = format || (withSeconds ? "hms" : "hm");
  const showHours = mode !== "ms";
  const showSeconds = mode !== "hm";

  const h = hour === "" || hour === undefined || hour === null ? "" : String(hour).padStart(2, "0");
  const m = minute === "" || minute === undefined || minute === null ? "" : String(minute).padStart(2, "0");
  const s = second === "" || second === undefined || second === null ? "" : String(second).padStart(2, "0");

  let display = "";
  if (mode === "ms") display = (m || s) ? `${m || "00"}:${s || "00"}` : "";
  else if (mode === "hm") display = (h || m) ? `${h || "00"}:${m || "00"}` : "";
  else display = (h || m || s) ? `${h || "00"}:${m || "00"}:${s || "00"}` : "";

  const ph = placeholder || (mode === "ms" ? "MM:SS" : mode === "hm" ? "HH:MM" : "HH:MM:SS");

  const calcCoords = () => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const popH = 210;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < popH && rect.top > spaceBelow;
    const minW = showHours && showSeconds ? 150 : 108;
    return {
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - minW - 8),
      width: Math.max(rect.width, minW),
      placeAbove,
    };
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      setCoords(null);
      return;
    }
    setCoords(calcCoords());
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const onReposition = e => {
      if (popoverRef.current && e.target && popoverRef.current.contains(e.target)) return;
      setCoords(calcCoords());
    };
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open || !popoverRef.current) return;
    popoverRef.current.querySelectorAll(".mt-popover-item-active").forEach(node => {
      node.scrollIntoView({ block: "center" });
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = e => {
      const inTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const inPopover = popoverRef.current && popoverRef.current.contains(e.target);
      if (!inTrigger && !inPopover) {
        setOpen(false);
        setCoords(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const pick = (part, val) => {
    const curH = hour === "" || hour == null ? 0 : Number(hour);
    const curM = minute === "" || minute == null ? 0 : Number(minute);
    const curS = second === "" || second == null ? 0 : Number(second);
    if (part === "h") onChange(Number(val), curM, showSeconds ? curS : 0);
    else if (part === "m") onChange(showHours ? curH : 0, Number(val), showSeconds ? curS : 0);
    else onChange(showHours ? curH : 0, curM, Number(val));
  };

  const popover = open && !disabled && coords && createPortal(
    <div
      ref={popoverRef}
      className="mt-popover mt-popover-portal"
      onWheel={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top: coords.placeAbove ? undefined : coords.top,
        bottom: coords.placeAbove ? window.innerHeight - coords.top : undefined,
        left: coords.left,
        minWidth: coords.width,
        zIndex: 10050,
      }}
    >
      {showHours && (
        <TimeColumn part="h" label="HH (24h)" options={HOUR_OPTIONS} current={h} onPick={pick} />
      )}
      <TimeColumn part="m" label="MM" options={MIN_SEC_OPTIONS} current={m} onPick={pick} />
      {showSeconds && (
        <TimeColumn part="s" label="SS" options={MIN_SEC_OPTIONS} current={s} onPick={pick} />
      )}
    </div>,
    document.body
  );

  return (
    <div className="mt-wrap" ref={wrapRef}>
      <div
        className={`mt-display${disabled ? " mt-disabled" : ""}${hasError ? " mt-error" : ""}`}
        onClick={toggleOpen}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={e => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        <span className={`mt-display-value${display ? "" : " mt-display-placeholder"}`}>
          {display || ph}
        </span>
        <Clock size={16} className="mt-clock-btn" />
      </div>
      {popover}
    </div>
  );
}
