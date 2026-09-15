import React from "react";
import { Calendar, Lock } from "lucide-react";
import { formatIsoDateMedium, openNativeDatePicker } from "../../utils/datetime";
import { normalizeHelperDob } from "../../hooks/useHelperDobSyncDay1";

/**
 * Helper 1 / 3 / 4 — DOB is the only editable date; Day 1 = DOB (read-only);
 * active NICU day calendar date is read-only (Day 1 + N − 1).
 */
export default function HelperDobDay1Panel({
  patientDob,
  onPatientDobChange,
  day1Date,
  day1DateLocked,
  activeDay,
  activeDayDate,
  dobDisabled = false,
}) {
  const dobNorm = normalizeHelperDob(patientDob) || normalizeHelperDob(day1Date);

  return (
    <div className="rcn-dob-day-panel">
      <div
        className={`rcn-day1-picker rcn-dob-picker${dobDisabled ? " rcn-day1-picker--locked" : ""}${!dobNorm ? " rcn-day1-picker--required" : ""}`}
        role={dobDisabled ? undefined : "button"}
        tabIndex={dobDisabled ? -1 : 0}
        onClick={(e) => {
          if (dobDisabled) return;
          openNativeDatePicker(e.currentTarget.querySelector("input[type='date']"));
        }}
        onKeyDown={(e) => {
          if (dobDisabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openNativeDatePicker(e.currentTarget.querySelector("input[type='date']"));
          }
        }}
      >
        <span className="rcn-day1-picker-icon" aria-hidden="true">
          <Calendar size={16} strokeWidth={1.75} />
        </span>
        <div className="rcn-day1-picker-body">
          <span className="rcn-day1-picker-label">
            Date of birth *
          </span>
          <span className="rcn-day1-picker-value">
            {dobNorm ? formatIsoDateMedium(dobNorm) : "Select date"}
          </span>
        </div>
        <input
          type="date"
          className="rcn-day1-picker-input"
          tabIndex={-1}
          aria-hidden="true"
          value={dobNorm}
          disabled={dobDisabled}
          readOnly={dobDisabled}
          onChange={(e) => onPatientDobChange?.(e.target.value)}
        />
        {dobDisabled && (
          <span className="rcn-day1-picker-lock-chip" title="Locked — daily data exists">
            <Lock size={11} strokeWidth={2.25} />
            Locked
          </span>
        )}
      </div>

      <div className="rcn-day1-picker rcn-day1-picker--readonly" aria-readonly="true">
        <span className="rcn-day1-picker-icon" aria-hidden="true">
          <Calendar size={16} strokeWidth={1.75} />
        </span>
        <div className="rcn-day1-picker-body">
          <span className="rcn-day1-picker-label">Day 1 date (auto)</span>
          <span className="rcn-day1-picker-value">
            {day1Date ? formatIsoDateMedium(day1Date) : "—"}
          </span>
        </div>
      </div>

      {activeDay != null && activeDayDate && (
        <div className="rcn-day1-picker rcn-day1-picker--readonly" aria-readonly="true">
          <span className="rcn-day1-picker-icon" aria-hidden="true">
            <Calendar size={16} strokeWidth={1.75} />
          </span>
          <div className="rcn-day1-picker-body">
            <span className="rcn-day1-picker-label">Day {activeDay} date (auto)</span>
            <span className="rcn-day1-picker-value">
              {formatIsoDateMedium(activeDayDate)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
