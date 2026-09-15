import React, { useState, useEffect, useRef } from "react";
import { Clock } from "lucide-react";

/**
 * 24-hour clock picker (HH:MM or HH:MM:SS). No AM/PM — hours are always 0–23.
 */
export default function ModernTimeInput({
  hour,
  minute,
  second,
  onChange,
  disabled = false,
  withSeconds = true,
  placeholder = "HH:MM:SS",
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const h = hour === "" || hour === undefined || hour === null ? "" : String(hour).padStart(2, "0");
  const m = minute === "" || minute === undefined || minute === null ? "" : String(minute).padStart(2, "0");
  const s = second === "" || second === undefined || second === null ? "" : String(second).padStart(2, "0");
  const display = withSeconds
    ? ((h || m || s) ? `${h || "00"}:${m || "00"}:${s || "00"}` : "")
    : ((h || m) ? `${h || "00"}:${m || "00"}` : "");

  useEffect(() => {
    if (!open) return;
    const onClickOutside = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minSecOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  const pick = (part, val) => {
    const curH = hour === "" || hour == null ? 0 : Number(hour);
    const curM = minute === "" || minute == null ? 0 : Number(minute);
    const curS = second === "" || second == null ? 0 : Number(second);
    if (part === "h") onChange(Number(val), curM, withSeconds ? curS : 0);
    else if (part === "m") onChange(curH, Number(val), withSeconds ? curS : 0);
    else onChange(curH, curM, Number(val));
  };

  const Column = ({ part, label, options, current }) => (
    <div className="mt-popover-col">
      <div className="mt-popover-label">{label}</div>
      <div className="mt-popover-list">
        {options.map(v => (
          <div
            key={v}
            className={`mt-popover-item${current === v ? " mt-popover-item-active" : ""}`}
            onClick={() => pick(part, v)}
          >
            {v}
          </div>
        ))}
      </div>
    </div>
  );

  const ph = withSeconds ? placeholder : "HH:MM";

  return (
    <div className="mt-wrap" ref={wrapRef}>
      <div
        className={`mt-display${disabled ? " mt-disabled" : ""}`}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        <span className={`mt-display-value${display ? "" : " mt-display-placeholder"}`}>
          {display || ph}
        </span>
        <Clock size={16} className="mt-clock-btn" />
      </div>
      {open && !disabled && (
        <div className="mt-popover">
          <Column part="h" label="HH (24h)" options={hourOptions} current={h} />
          <Column part="m" label="MM" options={minSecOptions} current={m} />
          {withSeconds && (
            <Column part="s" label="SS" options={minSecOptions} current={s} />
          )}
        </div>
      )}
    </div>
  );
}
