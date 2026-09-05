import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { toDateOnlyValue, formatIsoDateMedium, formatStampShort, openNativeDatePicker, NICU_DAY_GRACE_HOUR, nicuDayNumberFromDay1, calendarDateForNicuDay } from "./utils/datetime";
import "./styles/RespCVNeuro.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import SaveSuccessModal from "./components/SaveSuccessModal";
import { useRegisterActiveFormSession } from "./context/ActiveFormSessionContext";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  CheckCircle, AlertCircle, Clock, Check,
  Lock, Send, AlertTriangle, X,
  History, Unlock, AlertOctagon, Edit, ListChecks, Calendar,
} from "lucide-react";

/* ── Day status constants ── */
const STATUS = {
  EMPTY:           "empty",
  DRAFT:           "draft",
  PARTIAL:         "partial",
  COMPLETE:        "complete",
  SUBMITTED:       "submitted",
  LATE:            "late",
};

/* ── Day status visual config ── */
const DAY_STATUS_CONFIG = {
  [STATUS.EMPTY]:    { label: "Not started", color: "#CBD5E1", dot: "#CBD5E1" },
  [STATUS.DRAFT]:    { label: "Partial",     color: "#F59E0B", dot: "#F59E0B" },
  [STATUS.PARTIAL]:  { label: "Partial",     color: "#F59E0B", dot: "#F59E0B" },
  [STATUS.COMPLETE]: { label: "Complete",    color: "#10B981", dot: "#10B981" },
  [STATUS.SUBMITTED]:{ label: "Submitted",   color: "#0F4C81", dot: "#0F4C81" },
  [STATUS.LATE]:     { label: "Late",        color: "#EF4444", dot: "#EF4444" },
};

/* Deduplicated legend entries (one per unique label) */
const LEGEND_ITEMS = [
  { label: "Not started", dot: "#CBD5E1" },
  { label: "Partial",     dot: "#F59E0B" },
  { label: "Complete",    dot: "#10B981" },
  { label: "Submitted",   dot: "#0F4C81" },
  { label: "Late",        dot: "#EF4444" },
  { label: "Locked",      dot: "#94A3B8", lock: true },
];

/** True if this Minimal Monitoring sheet has any numeric 5.1.B bolus entry
 *  (cv_b in entries_json, or the legacy flat fluid_bolus_given column). */
function mmlHasFluidBolus(data) {
  if (!data) return false;
  const hasLeadingNumber = (raw) => {
    if (raw == null || raw === "") return false;
    return /^\s*\d+(?:\.\d+)?/.test(String(raw));
  };
  let entries = data.entries_json;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); } catch (_) { entries = null; }
  }
  const cvB = entries?.cv_b;
  if (Array.isArray(cvB) && cvB.some((e) => hasLeadingNumber(e?.fluid_bolus_given))) {
    return true;
  }
  return hasLeadingNumber(data.fluid_bolus_given);
}

/* Every field captured for a day, grouped by section, for the
   "All Days — Table View" modal (fields run down the rows, days
   run across the columns). */
const TABLE_VIEW_FIELD_GROUPS = [
  {
    section: "General",
    rows: [
      { key: "weight_kg", label: "Weight (kg)" },
    ],
  },
  {
    section: "Respiratory",
    rows: [
      { key: "respiratory_support",       label: "Respiratory Support" },
      { key: "endotracheal_intubation",   label: "Endotracheal Intubation" },
      { key: "support_modes",             label: "Support Modes" },
      { key: "max_fio2",                  label: "Max FiO2", suffix: "%", statusKey: "max_fio2_status" },
      { key: "map_cpap",                  label: "MAP / CPAP", statusKey: "map_cpap_status" },
      { key: "map_cpap_secondary",        label: "MAP / CPAP (2nd value, if both)", statusKey: "map_cpap_secondary_status" },
      { key: "max_flow",                  label: "Max Flow", statusKey: "max_flow_status" },
      { key: "lowest_ph",                 label: "pH (lowest)" },
      { key: "pao2_range",                label: "PaO₂ (lowest–highest)" },
      { key: "paco2_range",               label: "PaCO₂ (lowest–highest)" },
      { key: "apnea_count",               label: "Apnea Count" },
      { key: "desaturation_count",        label: "Desaturation Count" },
      { key: "severe_desaturation_count", label: "Severe Desaturation Count" },
      { key: "supp_o2",             label: "Supplemental O2", bool: true },
      { key: "surfactant",          label: "Surfactant", bool: true },
      { key: "caffeine",            label: "Caffeine", bool: true },
      { key: "extub_attempted",     label: "Extubation Attempted", bool: true },
      { key: "extub_failure",       label: "Extubation Failure", bool: true },
      { key: "pulm_hemorrhage",     label: "Pulmonary Hemorrhage", bool: true },
      { key: "pneumothorax",        label: "Pneumothorax", bool: true },
      { key: "chest_drain",         label: "Chest Drain", bool: true },
      { key: "pphn",                label: "PPHN", bool: true },
      { key: "postnatal_steroids",  label: "Postnatal Steroids", bool: true },
    ],
  },
  {
    section: "Cardiovascular",
    rows: [
      { key: "pda_suspected",       label: "PDA Suspected", bool: true },
      { key: "echo_done",           label: "Echo Done", bool: true },
      { key: "hs_pda",              label: "HS PDA", bool: true },
      { key: "shock",               label: "Shock", bool: true },
      { key: "vasoactive_support",  label: "Vasoactive Support", bool: true },
      { key: "fluid_bolus_given",   label: "Fluid Bolus", bool: true },
      { key: "vasoactive_drugs",    label: "Vasoactive Drugs" },
    ],
  },
  {
    section: "Neurological",
    rows: [
      { key: "cranial_usg",           label: "Cranial USG", bool: true },
      { key: "ivh",                   label: "IVH", ivh: true },
      { key: "pvl_suspected",         label: "PVL Suspected", bool: true },
      { key: "cpvl_confirmed",        label: "cPVL Confirmed", bool: true },
      { key: "ventriculomegaly",      label: "Ventriculomegaly", bool: true },
      { key: "clinical_seizures",     label: "Clinical Seizures", bool: true },
      { key: "eeg_seizures",          label: "EEG Seizures", bool: true },
      { key: "aeds_given",            label: "AEDs Given", bool: true },
      { key: "non_ivh_ich",           label: "Non-IVH ICH", bool: true },
      { key: "meningitis_suspected",  label: "Meningitis Suspected", bool: true },
    ],
  },
  {
    section: "Record",
    rows: [
      { key: "saved_by", label: "Saved By" },
    ],
  },
];

/* Formats a single field's value for one day's data object `d`. */
function formatTableViewValue(d, row) {
  if (row.ivh) {
    return d.ivh === true ? "Yes" : d.ivh === false ? "No" : "—";
  }
  // "Not Recorded / Not Done" (etc.) lives in a sibling *_status column,
  // not in the field itself — check that first, since the underlying
  // value is null whenever a status is set.
  if (row.statusKey && d[row.statusKey]) return d[row.statusKey];
  const v = d[row.key];
  if (row.bool) return v === true ? "Yes" : v === false ? "No" : "—";
  if (v === null || v === undefined || v === "") return "—";
  return row.suffix ? `${v}${row.suffix}` : String(v);
}

/* Given one day's saved record `d`, returns the fields that are still
   blank, grouped by section — reuses the same TABLE_VIEW_FIELD_GROUPS
   key/label map the "All Days" table view already relies on, so the two
   views can never disagree about what counts as "answered". The "Record"
   section is metadata (saved_by), not something a nurse fills in, so it's
   excluded from the missing-fields count. */
function computeMissingFields(d) {
  if (!d) return [];
  return TABLE_VIEW_FIELD_GROUPS
    .filter(group => group.section !== "Record")
    .map(group => ({
      section: group.section,
      labels: group.rows
        .filter(row => formatTableViewValue(d, row) === "—")
        .map(row => row.label),
    }))
    .filter(group => group.labels.length > 0);
}

/* Validates the free-text weight field, which accepts one or more
   comma-separated readings (e.g. "1250g, 1245g" or "1.25kg").
   Returns an error string, or null when valid / empty. */
function validateWeightEntries(str) {
  if (!str || !str.trim()) return null;
  const entries = str.split(",").map(s => s.trim()).filter(Boolean);
  for (const entry of entries) {
    const m = entry.match(/^(\d+(?:\.\d+)?)\s*(g|kg)?$/i);
    if (!m) return `"${entry}" isn't a valid weight — use e.g. 1250g or 1.25kg`;
    const num = parseFloat(m[1]);
    const unit = (m[2] || "g").toLowerCase();
    if (unit === "kg") {
      if (num < 0.2 || num > 8) return `"${entry}" is outside the expected 0.2–8 kg range`;
    } else if (num < 200 || num > 8000) {
      return `"${entry}" is outside the expected 200–8000 g range`;
    }
  }
  return null;
}

/* Derives what the "MAP/CPAP" field should show based on the
   selected respiratory support mode(s):
   - NC / HFNC only  → "NA" (field not applicable)
   - CPAP + a MAP-generating mode together → "BOTH" (show two fields)
   - CPAP alone      → "CPAP"
   - Any other mode alone (NIPPV, SIMV, A/C, PSV, HFOV) → "MAP"
   - Nothing selected yet → null (fall back to default label) */
function getMapCpapMode(modes) {
  if (!modes || modes.length === 0) return null;
  const pressureModes = ["NIPPV", "SIMV", "AC", "PSV", "HFOV"];
  const hasPressureMode = modes.some(m => pressureModes.includes(m));
  const hasCPAP = modes.includes("CPAP");
  if (hasPressureMode && hasCPAP) return "BOTH";
  if (hasPressureMode) return "MAP";
  if (hasCPAP) return "CPAP";
  if (modes.some(m => ["NC", "HFNC"].includes(m))) return "NA";
  return null;
}

/* Validates the MAP/CPAP number field. Range depends on which
   reading is being taken (CPAP vs MAP), since normal MAP runs
   higher than normal CPAP. Returns an error string, or null when
   valid / empty. */
function validateMapCpap(value, mode) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 0) return "Value can't be negative";
  if (mode === "CPAP") {
    if (num < 3 || num > 12) return "CPAP is usually 3–12 cmH₂O — please double-check this value";
  } else if (mode === "MAP") {
    if (num < 4 || num > 30) return "MAP is usually 4–30 cmH₂O — please double-check this value";
  } else if (num > 40) {
    return "This value looks too high for MAP/CPAP — please double-check";
  }
  return null;
}

/* Validates Max FiO2 (%). Room air is 21% and 100% is the physical
   ceiling, so anything outside that band is invalid. */
function validateMaxFio2(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 21) return "Max FiO₂ can't be below 21% (room air)";
  if (num > 100) return "Max FiO₂ can't be above 100%";
  return null;
}

/* Validates Max Gas Flow (L/min). Flags negative values and values
   well outside what's typically used in a NICU. */
function validateMaxFlow(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 0) return "Value can't be negative";
  if (num > 30) return "Max Gas Flow is usually 0–30 L/min — please double-check this value";
  return null;
}

/* Validates the Lowest pH reading. */
function validatePh(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 6.6 || num > 7.8) return "pH is usually 6.6–7.8 — please double-check this value";
  return null;
}

/* Validates a single PaO2/PaCO2 reading (lowest or highest) against
   a physiologically plausible mmHg range. */
function validateBloodGasValue(value, { min, max, label }) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < min || num > max) return `${label} is usually ${min}–${max} mmHg — please double-check`;
  return null;
}

/* Cross-checks that the lowest value isn't greater than the highest. */
function validateRangeOrder(low, high) {
  if (low === "" || high === "" || low == null || high == null) return null;
  const lo = Number(low), hi = Number(high);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo > hi) return "Lowest value can't be greater than highest";
  return null;
}

/* Validates an episode-count field (apnea / desaturation / severe
   desaturation) — must be a non-negative whole number. */
function validateCount(value, { max = 50, label } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (!Number.isInteger(num)) return "Enter a whole number";
  if (num < 0) return "Value can't be negative";
  if (num > max) return `${label ? label + " " : ""}seems unusually high — please double-check`;
  return null;
}

/* Splits the stored "lowest-highest" string (or the literal "Not Done")
   into its three parts for the PaO2/PaCO2 UI. */
function parseRangeField(str) {
  if (!str) return { low: "", high: "", notDone: false };
  if (str.trim().toLowerCase() === "not done") return { low: "", high: "", notDone: true };
  const parts = str.split("-").map(s => s.trim());
  if (parts.length === 2) return { low: parts[0], high: parts[1], notDone: false };
  return { low: str.trim(), high: "", notDone: false }; // legacy single-value fallback
}

/* Recombines the PaO2/PaCO2 UI state back into the stored string format. */
function combineRangeField(low, high, notDone) {
  if (notDone) return "Not Done";
  if (low === "" && high === "") return null;
  return `${low}-${high}`;
}

const NOT_RECORDED_LABEL = "Not Recorded / Not Done";

/* Combines a single free-value field (pH / episode counts) with its
   "Not Recorded / Not Done" toggle back into the stored string. */
function combineSingleField(value, notDone) {
  if (notDone) return NOT_RECORDED_LABEL;
  return value === "" ? null : value;
}

/* Splits a loaded single-value string field into its value + toggle state. */
function parseSingleField(str) {
  if (str === NOT_RECORDED_LABEL) return { value: "", notDone: true };
  return { value: str || "", notDone: false };
}

/* ══════════════════════════════════════════════════════
   HELPER SUB-COMPONENTS
══════════════════════════════════════════════════════ */

function ProgressRing({ percent }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <div className="rcn-ring">
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle className="rcn-ring-bg" cx="29" cy="29" r={r} />
        <circle
          className="rcn-ring-fill"
          cx="29" cy="29" r={r}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
      </svg>
      <span className="rcn-ring-text">{percent}%</span>
    </div>
  );
}

function YNToggle({ value, onChange, disabled }) {
  return (
    <div className="rcn-yn">
      <button
        type="button"
        className={`rcn-yn-btn rcn-yn-yes${value === true ? " rcn-yn-active-yes" : ""}`}
        onClick={() => !disabled && onChange(value === true ? null : true)}
      >Yes</button>
      <button
        type="button"
        className={`rcn-yn-btn rcn-yn-no${value === false ? " rcn-yn-active-no" : ""}`}
        onClick={() => !disabled && onChange(value === false ? null : false)}
      >No</button>
    </div>
  );
}

function YNRow({ label, value, onChange, disabled, hint, autofilled }) {
  return (
    <div className={`rcn-yn-row${autofilled ? " rcn-autofilled-row" : ""}`}>
      <span className="rcn-yn-label">
        {label}
        {autofilled && <span className="rcn-autofill-tag">from Minimal Monitoring</span>}
        {hint && <span className="rcn-yn-hint">{hint}</span>}
      </span>
      <YNToggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function SectionCard({ icon: Icon, iconEmoji, title, answered, total, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="rcn-card">
      <div className="rcn-card-header" onClick={() => setOpen(o => !o)}>
        <div className="rcn-card-header-left">
          <div className="rcn-card-icon-wrap">
            {iconEmoji ? <span className="rcn-card-emoji">{iconEmoji}</span> : <Icon size={20} className="rcn-card-icon" />}
          </div>
          <h3 className="rcn-card-title">{title}</h3>
        </div>
        <div className="rcn-card-header-right">
          <div className="rcn-card-prog-bar">
            <div className="rcn-card-prog-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="rcn-card-prog-text">{answered}/{total}</span>
          <div className={`rcn-chevron${open ? " rcn-chevron-open" : ""}`}>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>
      {open && (
        <>
          <div className="rcn-card-divider" />
          <div className="rcn-card-body">{children}</div>
        </>
      )}
    </div>
  );
}

/* ── Lock Confirmation Modal ── */
function SubmitModal({ day, completionPct, onConfirm, onCancel, submitting }) {
  return (
    <div className="rcn-modal-overlay">
      <div className="rcn-modal">
        <div className="rcn-modal-header">
          <div className="rcn-modal-icon rcn-modal-icon--lock"><Lock size={22} /></div>
          <div>
            <h3 className="rcn-modal-title">Lock Day {day} Data</h3>
            <p className="rcn-modal-subtitle">This record will become read-only</p>
          </div>
          <button className="rcn-modal-close" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="rcn-modal-body">
          <div className="rcn-modal-checklist">
            <div className={`rcn-modal-check ${completionPct === 100 ? "rcn-modal-check--ok" : "rcn-modal-check--warn"}`}>
              {completionPct === 100
                ? <CheckCircle size={15} />
                : <AlertTriangle size={15} />}
              <span>
                {completionPct === 100
                  ? "All fields completed (100%)"
                  : `${completionPct}% complete — some fields unanswered`}
              </span>
            </div>
            <div className="rcn-modal-check rcn-modal-check--ok">
              <CheckCircle size={15} />
              <span>Nurse data entry saved</span>
            </div>
          </div>
          <div className="rcn-modal-warning rcn-modal-warning--lock">
            <Lock size={14} />
            <span>
              After locking, you will not be able to edit this data.
              Are you sure you want to lock Day {day}?
            </span>
          </div>
          {completionPct < 100 && (
            <div className="rcn-modal-warning">
              <AlertTriangle size={14} />
              <span>
                Locking with incomplete data. Ensure missing fields are
                clinically not applicable before proceeding.
              </span>
            </div>
          )}
        </div>
        <div className="rcn-modal-footer">
          <button className="rcn-modal-btn rcn-modal-btn--cancel"
            onClick={onCancel} type="button" disabled={submitting}>
            Cancel
          </button>
          <button className="rcn-modal-btn rcn-modal-btn--lock"
            onClick={onConfirm} type="button" disabled={submitting}>
            {submitting
              ? "Locking…"
              : <><Lock size={14} /> Yes, Lock It</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Postgres TIMESTAMP (no time zone) columns — e.g. override_unlocked_until —
// serialize to JSON with no 'Z'/offset suffix even though the value is UTC
// (set via datetime.utcnow() on the backend). `new Date("...no suffix...")`
// parses that as LOCAL browser time per the JS spec, not UTC — in IST
// (UTC+5:30) that made a just-created 2-hour override compare as already
// expired. Treat any timestamp with no explicit offset as UTC.
function parseUtcTimestamp(value) {
  if (!value) return null;
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? new Date(value) : new Date(value + "Z");
}

export default function RespCVNeuroLog() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const { markFormCompleted, unmarkFormCompleted } = useFormProgress();
  const { patientData } = usePatient();
  const { user } = useAuth();
  const userRole    = user?.role || "site_user";
  const isSuperadmin = (userRole || "").toLowerCase() === "superadmin";
  const isPI         = (userRole || "").toLowerCase() === "site_pi";
  // Audit trail ("History") is superadmin + site PI only — matches the
  // backend's /audit/ role check in routers/audit.py.
  const canViewAudit = isSuperadmin || isPI;
  // Submit button is visible to everyone — no role restriction
  // It only appears when day is saved AND all fields are 100% complete

  /* ── UI state ── */
  const [activeDay, setActiveDay]       = useState(1);
  const [totalDays, setTotalDays]       = useState(14);
  // Day 1 date — manually entered, drives all day date labels.
  // Pre-filled from birth-resuscitation date_of_birth, persisted per enrollment.
  const [day1Date, setDay1Date] = useState(() =>
    enrollmentId ? (localStorage.getItem(`rcn_day1_${enrollmentId}`) || "") : ""
  );
  const [completedDays, setCompletedDays] = useState([]);
  const [dayStatuses, setDayStatuses]     = useState({}); // { [day]: STATUS.* }
  const [dayMeta, setDayMeta]             = useState({}); // { [day]: { pct, savedAt } }
  const [dischargeDay, setDischargeDay]   = useState(null); // day number when discharged
  const [isSaved, setIsSaved]             = useState(false);
  const [isEditing, setIsEditing]         = useState(false);
  const [message, setMessage]             = useState("");
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [savedAt, setSavedAt]             = useState(null);
  const [savedBy, setSavedBy]             = useState("");
  const [submittedAt, setSubmittedAt]     = useState(null);
  const [submittedBy, setSubmittedBy]     = useState("");

  /* ── Day 1 Date — backend-synced lock state ── */
  const [day1DateLockedRemote, setDay1DateLockedRemote] = useState(false);
  const [day1DateSetBy, setDay1DateSetBy]     = useState("");
  const [day1EditArmed, setDay1EditArmed]     = useState(false); // superadmin explicit unlock

  /* ── Audit trail ── */
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditEntries, setAuditEntries]     = useState([]);
  const [auditLoading, setAuditLoading]     = useState(false);

  /* ── All-days table view ── */
  const [showTableView, setShowTableView]   = useState(false);
  const [tableViewRows, setTableViewRows]   = useState([]);
  const [tableViewLoading, setTableViewLoading] = useState(false);

  /* ── Per-day "what's missing" popover (shown on partial/late day pills) ──
     Rendered via a portal at fixed viewport coordinates (not nested inside
     the day strip) because .rcn-timeline scrolls horizontally — any
     non-"visible" overflow-x forces overflow-y to compute as "auto" too
     (per the CSS overflow spec), which would silently clip a popover
     taller than the pill row. Portaling to <body> sidesteps that. */
  const [missingPopoverDay, setMissingPopoverDay] = useState(null); // day number or null
  const [missingPopoverPos, setMissingPopoverPos] = useState(null); // { top, left }
  const [missingFieldsCache, setMissingFieldsCache] = useState({}); // { [day]: [{section, labels:[]}] }
  const [missingLoading, setMissingLoading] = useState(false);
  const missingPopoverRef = useRef(null);
  const missingAnchorRef  = useRef(null); // the badge <button> currently open, so scroll/resize can re-measure it

  /* ── Site-monitor override ── */
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason]       = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideUntil, setOverrideUntil]          = useState(null); // active day's override expiry

  /* ── Patient info ── */
  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    babyUid: "",
    babyName: "",
    motherName: "",
    gestationalAge: "",
    admissionDate: "",
    dischargeDate: "",
    status: "In NICU",
    currentSupport: "None",
  });

  /* ── Weight (2.1) ── */
  const [weightKg, setWeightKg] = useState("");

  /* ── Respiratory state ── */
  const [supportModes, setSupportModes] = useState([]);
  const [respiratorySupport, setRespiratorySupport] = useState(null); // #1
  const [endotrachealIntubation, setEndotrachealIntubation] = useState(null); // #2
  const [mapCpap, setMapCpap]           = useState(""); // #4  (MAP value, or the CPAP value when CPAP is the only pressure mode)
  const [mapCpapStatus, setMapCpapStatus] = useState(null); // "Not Recorded / Not Done"
  const [mapCpapSecondary, setMapCpapSecondary] = useState(""); // #4b (CPAP value, only when CPAP + a MAP-generating mode are both selected)
  const [mapCpapSecondaryStatus, setMapCpapSecondaryStatus] = useState(null);
  const [maxFio2, setMaxFio2]           = useState("");
  const [maxFio2Status, setMaxFio2Status] = useState(null);
  const [maxFlow, setMaxFlow]           = useState("");
  const [maxFlowStatus, setMaxFlowStatus] = useState(null);
  const [lowestPh, setLowestPh]         = useState(""); // #8 — "" | number-as-string | "Not Recorded / Not Done"
  const [lowestPhNotDone, setLowestPhNotDone] = useState(false);
  const [pao2Low, setPao2Low]           = useState(""); // #9
  const [pao2High, setPao2High]         = useState("");
  const [pao2NotDone, setPao2NotDone]   = useState(false);
  const [paco2Low, setPaco2Low]         = useState(""); // #10
  const [paco2High, setPaco2High]       = useState("");
  const [paco2NotDone, setPaco2NotDone] = useState(false);
  const [apneaCount, setApneaCount]             = useState(""); // #13
  const [apneaCountNotDone, setApneaCountNotDone] = useState(false);
  const [desatCount, setDesatCount]             = useState(""); // #14
  const [desatCountNotDone, setDesatCountNotDone] = useState(false);
  const [severeDesatCount, setSevereDesatCount] = useState(""); // #15
  const [severeDesatCountNotDone, setSevereDesatCountNotDone] = useState(false);
  const [respEvents, setRespEvents]     = useState({
    supp_o2: null, surfactant: null, caffeine: null,
    extub_attempted: null, extub_failure: null,
    pulm_hemorrhage: null, pneumothorax: null, chest_drain: null,
    pphn: null, postnatal_steroids: null,
  });

  /* ── Cardiovascular state ── */
  const [cvData, setCvData] = useState({
    pda_suspected: null, echo_done: null, hs_pda: null,
    shock: null, vasoactive_support: null, fluid_bolus_given: null,
  });
  const [vasoactiveDrugs, setVasoactiveDrugs] = useState([]);
  const [bolusAutofilled, setBolusAutofilled] = useState(false);

  /* ── Neurological state ── */
  const [neuroData, setNeuroData] = useState({
    cranial_usg: null, ivh: null,
    pvl_suspected: null, cpvl_confirmed: null, ventriculomegaly: null,
    clinical_seizures: null, eeg_seizures: null, aeds_given: null,
    non_ivh_ich: null, meningitis_suspected: null,
  });

  const currentDayStatus = dayStatuses[activeDay] || STATUS.EMPTY;
  const isSubmitted      = currentDayStatus === STATUS.SUBMITTED;

  /* ── Calendar-based day locking ──
     todayNicuDay = which NICU day is the current *working* day given
     Day 1 Date, using NICU_DAY_GRACE_HOUR so overnight staff still count
     as "today" until that hour. Badges, future-locking, and the default
     tab all use this same number — never a separate midnight calendar
     today vs an 11am landing tab. */
  const todayNicuDay = useMemo(
    () => nicuDayNumberFromDay1(day1Date),
    [day1Date],
  );

  const activeDayDate = useMemo(
    () => calendarDateForNicuDay(day1Date, activeDay),
    [day1Date, activeDay],
  );
  const activeDayDateRef = useRef(activeDayDate);
  activeDayDateRef.current = activeDayDate;

  const isFutureActiveDay = todayNicuDay != null && activeDay > todayNicuDay;
  // Informational only now — locking is manual (see the Lock button below),
  // so a past calendar date no longer forces a day read-only by itself.
  const isPastActiveDay   = todayNicuDay != null && activeDay < todayNicuDay;
  // Same-morning grace window: still used for the Day 1 Date entry window.
  const RCN_LATE_GRACE_HOUR = NICU_DAY_GRACE_HOUR;
  // Site-monitor override reopens an otherwise-locked day for a limited window.
  const isOverrideActiveDay =
    overrideUntil != null && new Date() < parseUtcTimestamp(overrideUntil);

  // Default tab = the same working day todayNicuDay already computed
  // (grace hour included). Do not subtract 1 again here — that used to
  // make the landing tab disagree with badges/future-lock.
  const initialDaySetRef = useRef(false);
  useEffect(() => {
    if (initialDaySetRef.current || todayNicuDay == null) return;
    initialDaySetRef.current = true;
    setActiveDay(todayNicuDay);
  }, [todayNicuDay]);

  const isFieldEditable  =
    // Day 1 Date is mandatory — nurses must set it before any daily field
    // can be filled in, so it's no longer possible to save Day 1 (or any
    // day) data and forget the date. See handleSave for the same guard on
    // the actual save call (independent of `force`).
    !!day1Date &&
    (!isSubmitted || isOverrideActiveDay) &&
    (!isSaved || isEditing) &&
    !isFutureActiveDay;
    // NOTE: locking is now manual only (via the explicit "Lock" button +
    // confirmation modal below), so a past day's calendar date passing no
    // longer forces the record read-only on its own — only isSubmitted
    // (i.e. a nurse/site user explicitly clicked Lock and confirmed) does.

  const applyFluidBolusFromMml = async (recordDate = activeDayDate) => {
    if (!enrollmentId || !recordDate) return;
    if (isFutureActiveDay) return;
    if (isSubmitted && !isOverrideActiveDay) return;
    try {
      const res = await api.get(`/minimal-monitoring/${enrollmentId}/on/${recordDate}`);
      if (activeDayDateRef.current !== recordDate) return;
      const data = res?.data || {};
      if (data.record_date && data.record_date !== recordDate) return;
      if (!mmlHasFluidBolus(data)) return;
      setCvData((p) => {
        if (p.fluid_bolus_given === true) return p;
        setIsEditing(true);
        return { ...p, fluid_bolus_given: true };
      });
      setBolusAutofilled(true);
    } catch (_) { /* Helper 5 optional */ }
  };

  // Day 1 Date drives every day's calendar label and the future/past
  // lock above, so once any daily data exists it must stop moving —
  // editing it after the fact would silently reshuffle which days are
  // "past" vs "future" and could unlock/relock the wrong records.
  // IMPORTANT: only apply that lock once a date has actually been set.
  // Older records where daily data was saved before a date existed (the
  // exact bug this guards against) must stay editable so the nurse can
  // go back and fill it in, instead of being permanently stuck.
  const day1DateLockedLocal = completedDays.length > 0 ||
    Object.values(dayStatuses).some(st => st && st !== STATUS.EMPTY);
  const day1DateLocked = !!day1Date && (day1DateLockedRemote || day1DateLockedLocal) && !day1EditArmed;

  // Day 1 Date entry window: today, or yesterday until 11:00 AM — matches
  // the backend's DAY1_DATE_ENTRY_GRACE_HOUR so a nurse can't pick some
  // unrelated day, and mirrors the same late-shift grace period used for
  // day locking above.
  const day1DateBounds = useMemo(() => {
    const now = new Date();
    const todayStr = toDateOnlyValue(now);
    if (now.getHours() < RCN_LATE_GRACE_HOUR) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { min: toDateOnlyValue(yesterday), max: todayStr };
    }
    return { min: todayStr, max: todayStr };
  }, []);

  /* ── Load patient info ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
      // Day 1 Date — backend is now the source of truth (shared across
      // devices/nurses); localStorage is kept only as an instant-paint cache.
      try {
        const d1Res = await api.get(`/nicu-admission/${enrollmentId}/day1-date`);
        const d1 = d1Res?.data || {};
        setDay1DateLockedRemote(!!d1.locked);
        setDay1DateSetBy(d1.day1_date_set_by || "");
        if (d1.day1_date) {
          setDay1Date(d1.day1_date);
          localStorage.setItem(`rcn_day1_${enrollmentId}`, d1.day1_date);
        }
      } catch (_) {
        // Endpoint optional / older backend — fall back to localStorage value already loaded
      }

      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = res?.data || {};

        // Gestation — start with Form B, then check postnatal-day1 for NBS correction
        // (mirrors FiO2AUC logic exactly)
        let gestWeeks = b?.gestation_weeks;
        let gestDays  = b?.gestation_days ?? 0;
        try {
          const dRes = await api.get(`/postnatal-day1/${enrollmentId}`);
          const d = dRes?.data || {};
          const origTotal = (b?.original_gestation_weeks ?? gestWeeks) * 7
                          + (b?.original_gestation_days  ?? gestDays);
          const nbsTotal  = (d?.gestation_weeks ?? 0) * 7 + (d?.gestation_days ?? 0);
          if (
            d?.ga_method === "NBS" &&
            d?.gestation_weeks != null &&
            Math.abs(nbsTotal - origTotal) > 14
          ) {
            gestWeeks = d.gestation_weeks;
            gestDays  = d.gestation_days ?? 0;
          }
        } catch (_) {}

        const ga = gestWeeks != null
          ? `${gestWeeks}+${gestDays} wks` : "";

        // Calculate discharge day if discharged (only for discharge cutoff)
        let dischDay = null;
        if (b.discharge_date && b.date_of_birth) {
          const admitDate = new Date(b.date_of_birth);
          const dd = new Date(b.discharge_date);
          dischDay = Math.max(1, Math.floor((dd - admitDate) / 86400000) + 1);
          setDischargeDay(dischDay);
        }

        // Start with 14 days shown by default
        // Don't calculate based on birth date - use Day 1 Date instead
        const maxDay = dischDay || 14;

        setPatientInfo(prev => ({
          ...prev,
          enrollmentId,
          babyUid:        b.baby_uid       || "",
          gestationalAge: ga,
          admissionDate:  b.date_of_birth  || "",
          dischargeDate:  b.discharge_date || "",
          status:         b.discharge_date ? "Discharged" : "In NICU",
        }));
        // Don't auto-fill Day 1 date from birth date
        // User must manually set it in the helper form
        // Keep active day at 1 (user manually selects which day to fill)
        setTotalDays(maxDay);
      } catch (_) {}

      // Load PII — mother_first_name, mother_surname, baby_name
      // (PII fields are NOT available on birth-resuscitation response
      //  since they are stored encrypted; the /pii endpoint decrypts them)
      try {
        const piiRes = await api.get(`/pii/enrollment/${enrollmentId}`);
        const p = piiRes?.data || {};
        const motherName = `${p.mother_first_name || ""} ${p.mother_surname || ""}`.trim();
        setPatientInfo(prev => ({
          ...prev,
          motherName: motherName || "",
          babyName:   p.baby_name || "",
        }));
      } catch (_) {}

      // Load summary for all days to populate status indicators
      try {
        const summRes = await api.get(`/resp-cv-neuro/${enrollmentId}/summary`);
        const summaries = summRes?.data || [];
        const newStatuses = {};
        const newMeta     = {};
        summaries.forEach(s => {
          newStatuses[s.nicu_day] = s.submission_status || STATUS.DRAFT;
          newMeta[s.nicu_day]     = { pct: s.completion_pct || 0, savedAt: s.saved_at };
        });
        setDayStatuses(newStatuses);
        setDayMeta(newMeta);
      } catch (_) {
        // Summary endpoint optional — fail silently
      }
    };
    load();
  }, [enrollmentId]);

  /* ── Load saved day data ── */
  useEffect(() => {
    if (!enrollmentId) return;
    let cancelled = false;
    const loadDay = async () => {
      setLoading(true);
      setBolusAutofilled(false);
      try {
        const res = await api.get(`/resp-cv-neuro/${enrollmentId}/${activeDay}`);
        if (cancelled) return;
        const d = res?.data || {};
        if (d && Object.keys(d).length > 0) {
          setWeightKg(d.weight_kg || "");
          setSupportModes(d.support_modes ? d.support_modes.split(",").map(s => s.trim()).filter(Boolean) : []);
          setRespiratorySupport(d.respiratory_support ?? null);
          setEndotrachealIntubation(d.endotracheal_intubation ?? null);
          setMapCpap(d.map_cpap != null ? String(d.map_cpap) : "");
          setMapCpapStatus(d.map_cpap_status ?? null);
          setMapCpapSecondary(d.map_cpap_secondary != null ? String(d.map_cpap_secondary) : "");
          setMapCpapSecondaryStatus(d.map_cpap_secondary_status ?? null);
          setMaxFio2(d.max_fio2 != null ? String(d.max_fio2) : "");
          setMaxFio2Status(d.max_fio2_status ?? null);
          setMaxFlow(d.max_flow != null ? String(d.max_flow) : "");
          setMaxFlowStatus(d.max_flow_status ?? null);
          {
            const phParsed = parseSingleField(d.lowest_ph);
            setLowestPh(phParsed.value); setLowestPhNotDone(phParsed.notDone);
          }
          {
            const pao2Parsed = parseRangeField(d.pao2_range);
            setPao2Low(pao2Parsed.low); setPao2High(pao2Parsed.high); setPao2NotDone(pao2Parsed.notDone);
            const paco2Parsed = parseRangeField(d.paco2_range);
            setPaco2Low(paco2Parsed.low); setPaco2High(paco2Parsed.high); setPaco2NotDone(paco2Parsed.notDone);
          }
          {
            const apneaParsed = parseSingleField(d.apnea_count);
            setApneaCount(apneaParsed.value); setApneaCountNotDone(apneaParsed.notDone);
            const desatParsed = parseSingleField(d.desaturation_count);
            setDesatCount(desatParsed.value); setDesatCountNotDone(desatParsed.notDone);
            const severeParsed = parseSingleField(d.severe_desaturation_count);
            setSevereDesatCount(severeParsed.value); setSevereDesatCountNotDone(severeParsed.notDone);
          }
          setRespEvents({
            supp_o2:           d.supp_o2           ?? null,
            surfactant:        d.surfactant         ?? null,
            caffeine:          d.caffeine           ?? null,
            extub_attempted:   d.extub_attempted    ?? null,
            extub_failure:     d.extub_failure      ?? null,
            pulm_hemorrhage:   d.pulm_hemorrhage    ?? null,
            pneumothorax:      d.pneumothorax       ?? null,
            chest_drain:       d.chest_drain        ?? null,
            pphn:              d.pphn               ?? null,
            postnatal_steroids:d.postnatal_steroids ?? null,
          });
          setCvData({
            pda_suspected:    d.pda_suspected    ?? null,
            echo_done:        d.echo_done        ?? null,
            hs_pda:           d.hs_pda           ?? null,
            pda_medical_rx:   d.pda_medical_rx   ?? null,
            shock:            d.shock            ?? null,
            vasoactive_support: d.vasoactive_support ?? null,
            fluid_bolus_given: d.fluid_bolus_given ?? null,
          });
          setVasoactiveDrugs(d.vasoactive_drugs ? d.vasoactive_drugs.split(",").map(s => s.trim()).filter(Boolean) : []);
          setNeuroData({
            cranial_usg:        d.cranial_usg        ?? null,
            ivh:                d.ivh                ?? null,
            pvl_suspected:      d.pvl_suspected      ?? null,
            cpvl_confirmed:     d.cpvl_confirmed     ?? null,
            ventriculomegaly:   d.ventriculomegaly   ?? null,
            clinical_seizures:  d.clinical_seizures  ?? null,
            eeg_seizures:       d.eeg_seizures       ?? null,
            aeds_given:         d.aeds_given         ?? null,
            non_ivh_ich:        d.non_ivh_ich        ?? null,
            meningitis_suspected: d.meningitis_suspected ?? null,
          });
          // Restore status metadata
          const st = d.submission_status || STATUS.DRAFT;
          setDayStatuses(prev => ({ ...prev, [activeDay]: st }));
          setSavedAt(d.saved_at || null);
          setSavedBy(d.saved_by || "");
          setSubmittedAt(d.submitted_at || null);
          setSubmittedBy(d.submitted_by || "");
          setOverrideUntil(d.override_unlocked_until || null);
          setIsSaved(true);
          // A reload/revisit during a still-active override window must not
          // silently re-lock the fields — isFieldEditable requires isEditing
          // whenever isSaved is true, which this effect always sets true for
          // an existing record.
          setIsEditing(!!d.override_unlocked_until && parseUtcTimestamp(d.override_unlocked_until) > new Date());
          if (!completedDays.includes(activeDay))
            setCompletedDays(prev => [...prev, activeDay]);
        } else {
          resetFormState();
        }
      } catch (err) {
        if (cancelled) return;
        // Always clear — never leave previous day's values in the form.
        resetFormState();
        if (err?.response?.status !== 404) {
          setMessage("❌ Could not load Day " + activeDay + " — save disabled until reload");
          setTimeout(() => setMessage(""), 5000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) await applyFluidBolusFromMml(calendarDateForNicuDay(day1Date, activeDay));
    };
    loadDay();
    return () => { cancelled = true; };
  }, [enrollmentId, activeDay, day1Date]);

  useEffect(() => {
    if (!enrollmentId || !activeDayDate || loading) return;
    if (isFutureActiveDay) return;
    if (isSubmitted && !isOverrideActiveDay) return;
    const tick = () => applyFluidBolusFromMml(activeDayDate);
    const interval = setInterval(tick, 60000);
    const onFocus = () => tick();
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enrollmentId, activeDay, activeDayDate, loading, isSubmitted, isOverrideActiveDay, isFutureActiveDay]);

  const resetFormState = () => {
    setWeightKg("");
    setSupportModes([]);
    setRespiratorySupport(null); setEndotrachealIntubation(null);
    setMapCpap(""); setMapCpapStatus(null);
    setMapCpapSecondary(""); setMapCpapSecondaryStatus(null);
    setMaxFio2(""); setMaxFio2Status(null);
    setMaxFlow(""); setMaxFlowStatus(null);
    setLowestPh(""); setLowestPhNotDone(false);
    setPao2Low(""); setPao2High(""); setPao2NotDone(false);
    setPaco2Low(""); setPaco2High(""); setPaco2NotDone(false);
    setApneaCount(""); setApneaCountNotDone(false);
    setDesatCount(""); setDesatCountNotDone(false);
    setSevereDesatCount(""); setSevereDesatCountNotDone(false);
    setRespEvents({ supp_o2: null, surfactant: null, caffeine: null,
      extub_attempted: null, extub_failure: null,
      pulm_hemorrhage: null, pneumothorax: null, chest_drain: null,
      pphn: null, postnatal_steroids: null });
    setCvData({ pda_suspected: null, echo_done: null, hs_pda: null,
      pda_medical_rx: null, shock: null, vasoactive_support: null, fluid_bolus_given: null });
    setBolusAutofilled(false);
    setVasoactiveDrugs([]);
    setNeuroData({ cranial_usg: null, ivh: null,
      pvl_suspected: null, cpvl_confirmed: null, ventriculomegaly: null,
      clinical_seizures: null, eeg_seizures: null, aeds_given: null,
      non_ivh_ich: null, meningitis_suspected: null });
    setIsSaved(false);
    setIsEditing(false);
    setSavedAt(null); setSavedBy("");
    setSubmittedAt(null); setSubmittedBy("");
    setOverrideUntil(null);
    setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
  };

  /* ── Progress calculation ── */
  // (explicit key arrays used — no generic countAnswered to avoid hidden field bugs)

  // ── RESPIRATORY (spec items 1-22) ────────────────────────
  const RESP_EVENT_KEYS = [
    "surfactant","caffeine",
    "extub_attempted","pulm_hemorrhage","pneumothorax",
    "chest_drain","pphn","postnatal_steroids",
  ]; // items 11,12,16,18-22 = 8 keys (supp_o2 / item 7 and extub_failure / item 17 counted separately below — both gated on other fields)
  const respEventsAnswered = RESP_EVENT_KEYS.filter(k => respEvents[k] !== null).length;
  const isExtubAttemptedYes = respEvents.extub_attempted === true;
  const respSupportIsNo = respiratorySupport === false;
  const isRespSupportYes = respiratorySupport === true;
  const weightError  = validateWeightEntries(weightKg);
  const mapCpapMode  = getMapCpapMode(supportModes);
  const mapCpapModeForCount = mapCpapMode;
  const isMapCpapNA  = mapCpapMode === "NA";
  const isMapCpapBoth = mapCpapMode === "BOTH";
  const mapCpapError = isMapCpapNA || mapCpapStatus ? null : validateMapCpap(mapCpap, isMapCpapBoth ? "MAP" : mapCpapMode);
  const mapCpapSecondaryError = isMapCpapBoth && !mapCpapSecondaryStatus ? validateMapCpap(mapCpapSecondary, "CPAP") : null;
  const maxFio2Error = isRespSupportYes && !maxFio2Status ? validateMaxFio2(maxFio2) : null;
  const maxFlowError = isRespSupportYes && !maxFlowStatus ? validateMaxFlow(maxFlow) : null;
  const phError = lowestPhNotDone ? null : validatePh(lowestPh);
  const pao2LowError  = pao2NotDone ? null : validateBloodGasValue(pao2Low,  { min: 20, max: 600, label: "PaO₂ lowest" });
  const pao2HighError = pao2NotDone ? null : validateBloodGasValue(pao2High, { min: 20, max: 600, label: "PaO₂ highest" });
  const pao2OrderError = pao2NotDone ? null : validateRangeOrder(pao2Low, pao2High);
  const paco2LowError  = paco2NotDone ? null : validateBloodGasValue(paco2Low,  { min: 15, max: 150, label: "PaCO₂ lowest" });
  const paco2HighError = paco2NotDone ? null : validateBloodGasValue(paco2High, { min: 15, max: 150, label: "PaCO₂ highest" });
  const paco2OrderError = paco2NotDone ? null : validateRangeOrder(paco2Low, paco2High);
  const apneaCountError = apneaCountNotDone ? null : validateCount(apneaCount, { max: 50, label: "Apnea episode count" });
  const desatCountError = desatCountNotDone ? null : validateCount(desatCount, { max: 50, label: "Desaturation count" });
  const severeDesatCountError = severeDesatCountNotDone ? null : validateCount(severeDesatCount, { max: 50, label: "Severe desaturation count" })
    || ((!desatCountNotDone && !severeDesatCountNotDone && desatCount !== "" && severeDesatCount !== "" && Number(severeDesatCount) > Number(desatCount))
      ? "Severe desaturations can't exceed total desaturations (#14)"
      : null);
  const respTotal    = 23 + (isMapCpapBoth ? 1 : 0); // weight(2.1) + items 1-22 (+4b when both CPAP & MAP selected)
  const respAnswered = Math.min(
    (weightKg !== "" ? 1 : 0)                      // 2.1 weight
    + (respiratorySupport !== null ? 1 : 0)          // 1
    + (endotrachealIntubation !== null ? 1 : 0)    // 2
    + ((respSupportIsNo || supportModes.length > 0) ? 1 : 0)                        // 3
    + ((respSupportIsNo || mapCpapModeForCount === "NA" || mapCpap !== "" || !!mapCpapStatus) ? 1 : 0) // 4
    + (isMapCpapBoth && (mapCpapSecondary !== "" || !!mapCpapSecondaryStatus) ? 1 : 0)                 // 4b
    + ((respSupportIsNo || maxFio2 !== "" || !!maxFio2Status) ? 1 : 0)                                 // 5
    + ((respSupportIsNo || maxFlow !== "" || !!maxFlowStatus) ? 1 : 0)                                 // 6
    + ((respSupportIsNo || respEvents.supp_o2 !== null) ? 1 : 0)                    // 7
    + ((lowestPh !== "" || lowestPhNotDone) ? 1 : 0)                    // 8
    + ((pao2NotDone || (pao2Low !== "" && pao2High !== "")) ? 1 : 0)   // 9
    + ((paco2NotDone || (paco2Low !== "" && paco2High !== "")) ? 1 : 0) // 10
    + ((apneaCount !== "" || apneaCountNotDone) ? 1 : 0)                  // 13
    + ((desatCount !== "" || desatCountNotDone) ? 1 : 0)                  // 14
    + ((severeDesatCount !== "" || severeDesatCountNotDone) ? 1 : 0)            // 15
    + ((!isExtubAttemptedYes || respEvents.extub_failure !== null) ? 1 : 0)      // 17
    + respEventsAnswered,                          // 11,12,16,18-22
    respTotal
  );

  // ── CARDIOVASCULAR (spec items 23-29) ────────────────────
  // Base always-visible: pda_suspected(23), echo_done(24), hs_pda(25), shock(26),
  //   vasoactive_support(27), fluid_bolus_given(29 Yes/No) = 6.
  // Conditional: vasoactive_drugs(28) only when vasoactive_support===true.
  const CV_KEYS = ["pda_suspected","echo_done","hs_pda","shock","vasoactive_support","fluid_bolus_given"];
  const vasoactiveVisible = cvData.vasoactive_support === true;
  const cvTotal    = (vasoactiveVisible ? 1 : 0) + CV_KEYS.length;
  const cvAnswered = Math.min(
    CV_KEYS.filter(k => cvData[k] !== null).length
    + (vasoactiveVisible && vasoactiveDrugs.length > 0 ? 1 : 0),
    cvTotal
  );

  // ── NEUROLOGICAL (spec items 30-37) ──────────────────────
  // Base fields (always visible): cranial_usg(30), clinical_seizures(34),
  //   eeg_seizures(35), aeds_given(36), non_ivh_ich(37) = 5 fields
  // Conditional on cranial_usg === true: ivh(31), cpvl_confirmed(32),
  //   ventriculomegaly(33) (+3 fields)
  const NEURO_BASE_KEYS = [
    "cranial_usg","clinical_seizures","eeg_seizures","aeds_given","non_ivh_ich",
  ]; // exactly 5
  const NEURO_USG_GATED_KEYS = ["ivh","cpvl_confirmed","ventriculomegaly"]; // exactly 3
  const cranialUsgYes = neuroData.cranial_usg === true;
  const neuroTotal    = 5 + (cranialUsgYes ? 3 : 0);
  const neuroAnswered = Math.min(
    NEURO_BASE_KEYS.filter(k => neuroData[k] !== null).length
    + (cranialUsgYes ? NEURO_USG_GATED_KEYS.filter(k => neuroData[k] !== null).length : 0),
    neuroTotal
  );

  // ── OVERALL ──────────────────────────────────────────────
  const totalAnswered = respAnswered + cvAnswered + neuroAnswered;
  const totalFields   = respTotal + cvTotal + neuroTotal;
  const completionPct = totalFields > 0
    ? Math.min(100, Math.round((totalAnswered / totalFields) * 100))
    : 0;
  // completionPct===100 alone isn't enough once a day has been overridden:
  // isSubmitted stays true for the whole override window (the backend only
  // clears it on an actual re-lock), so without the isOverrideActiveDay
  // check here canSubmit was permanently false during any override —
  // the footer always fell to "Save Correction" and the day could never
  // be re-locked. Allow re-locking while the override window is open.
  const canSubmit = completionPct === 100 && (!isSubmitted || isOverrideActiveDay);

  /* ── Helpers ── */
  const toggleMode = (mode) => {
    if (!isFieldEditable || respiratorySupport !== true) return;
    setSupportModes(prev => {
      const next = prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode];
      const nextMode = getMapCpapMode(next);
      if (nextMode === "NA") { setMapCpap(""); setMapCpapStatus(null); }
      if (nextMode !== "BOTH") setMapCpapSecondary("");
      return next;
    });
  };
  const toggleDrug = (drug) => {
    if (!isFieldEditable) return;
    setVasoactiveDrugs(prev =>
      prev.includes(drug) ? prev.filter(d => d !== drug) : [...prev, drug]
    );
  };
  const setResp   = (k, v) => isFieldEditable && setRespEvents(p => ({ ...p, [k]: v }));
  const setCv = (k, v) => {
    if (!isFieldEditable) return;
    if (k === "fluid_bolus_given") setBolusAutofilled(false);
    setCvData(p => ({ ...p, [k]: v }));
  };
  const setNeuro  = (k, v) => isFieldEditable && setNeuroData(p => ({ ...p, [k]: v }));

  /* ── Save (Nurse) ── */
  const handleSave = async ({ force = false } = {}) => {
    if (!enrollmentId) return false;
    // Day 1 Date is mandatory before anything can be saved — checked here
    // independently of `force` so the Submit path (which force-saves) can't
    // bypass it either.
    if (!day1Date) {
      setMessage("⚠️ Please set Day 1 Date above before saving");
      return false;
    }
    // force: re-save while viewing a saved draft (Submit path) without requiring Edit.
    if (!force && !isFieldEditable) return false;
    if (isSubmitted && !isOverrideActiveDay) return false;
    if (isFutureActiveDay) return false;
    const now = new Date().toISOString();
    const payload = {
      enrollment_id:       enrollmentId,
      nicu_day:            activeDay,
      weight_kg:           weightKg || null,
      support_modes:       supportModes.join(", "),
      respiratory_support: respiratorySupport,
      endotracheal_intubation: endotrachealIntubation,
      map_cpap:            mapCpap !== "" ? Number(mapCpap) : null,
      map_cpap_status:     mapCpapStatus,
      map_cpap_secondary:  mapCpapSecondary !== "" ? Number(mapCpapSecondary) : null,
      map_cpap_secondary_status: mapCpapSecondaryStatus,
      max_fio2:            maxFio2 !== "" ? Number(maxFio2) : null,
      max_fio2_status:     maxFio2Status,
      max_flow:            maxFlow !== "" ? Number(maxFlow) : null,
      max_flow_status:     maxFlowStatus,
      lowest_ph:           combineSingleField(lowestPh, lowestPhNotDone),
      pao2_range:          combineRangeField(pao2Low, pao2High, pao2NotDone),
      paco2_range:         combineRangeField(paco2Low, paco2High, paco2NotDone),
      apnea_count:              combineSingleField(apneaCount, apneaCountNotDone),
      desaturation_count:       combineSingleField(desatCount, desatCountNotDone),
      severe_desaturation_count: combineSingleField(severeDesatCount, severeDesatCountNotDone),
      ...respEvents,
      ...cvData,
      vasoactive_drugs:    vasoactiveDrugs.join(", "),
      ...neuroData,
      submission_status:   STATUS.DRAFT,
      saved_at:            now,
      saved_by:            user?.name || "Nurse",
    };
    try {
      let res;
      if (isSaved) {
        res = await api.put(`/resp-cv-neuro/${enrollmentId}/${activeDay}`, payload);
      } else {
        res = await api.post("/resp-cv-neuro/", payload);
      }
      // Keep the sidebar tick in sync with the *current* state, not just
      // whether it was ever true — data added then deleted before the
      // next save must un-tick the helper, not leave it stuck complete.
      if (completionPct > 0) markFormCompleted("vs6_1");
      else unmarkFormCompleted("vs6_1");
      setIsSaved(true);
      setIsEditing(true);
      setSavedAt(now);
      setSavedBy(user?.name || user?.username || "Nurse");
      // "complete" is a client-only display state (100% answered, not yet
      // submitted) — backend only tracks draft/late/submitted, so completion
      // takes priority; otherwise trust the backend's late-grace/override status.
      const backendStatus = res?.data?.submission_status;
      const newSt = completionPct === 100
        ? STATUS.COMPLETE
        : (backendStatus || STATUS.DRAFT);
      setDayStatuses(prev => ({ ...prev, [activeDay]: newSt }));
      setDayMeta(prev => ({ ...prev, [activeDay]: { pct: completionPct, savedAt: now } }));
      if (!completedDays.includes(activeDay))
        setCompletedDays(prev => [...prev, activeDay]);
      setMessage("✅ Day " + activeDay + " saved successfully");
      setShowSaveSuccess(true);
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      console.error(err?.response?.data || err);
      setMessage("❌ Error saving — please try again");
      return false;
    }
  };

  const handlePrevious = async () => {
    if (isFieldEditable && completionPct > 0) {
      try { await handleSave(); } catch (err) { console.error("Save before back failed:", err); }
    }
    navigate(`/fio2-auc/${enrollmentId}`);
  };

  useRegisterActiveFormSession(() => isFieldEditable, () => {
    // A navigation-triggered flush must not create a phantom blank draft —
    // that silently marks the day non-empty and locks Day 1 Date before the
    // user has entered anything. Only auto-save when something real exists.
    if (completionPct === 0) return Promise.resolve(true);
    return handleSave();
  });

  /* ── Submit ── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Always persist current form state before locking — prevents edit→Submit
      // from locking the previous payload (mobile round-trip data loss).
      const saved = await handleSave({ force: true });
      if (!saved) {
        setMessage("❌ Save failed — submit cancelled");
        setShowModal(false);
        return;
      }
      const now = new Date().toISOString();
      await api.patch(`/resp-cv-neuro/${enrollmentId}/${activeDay}/submit`, {
        submission_status: STATUS.SUBMITTED,
        submitted_at:      now,
        submitted_by:      user?.name || user?.username || "Site User",
      });
      setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.SUBMITTED }));
      setSubmittedAt(now);
      setSubmittedBy(user?.name || user?.username || "Site User");
      // Locking now (even mid-override) ends the override immediately on
      // the backend — mirror that here so the badge/buttons update without
      // needing a refresh.
      setOverrideUntil(null);
      setShowModal(false);
      setMessage("🔒 Day " + activeDay + " submitted and locked");
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      console.error(err?.response?.data || err);
      setMessage("❌ Submission failed — please try again");
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = async () => {
    // Same phantom-blank-draft guard as handlePrevious — clicking Next on
    // an untouched day must not silently POST an empty record.
    if (isFieldEditable && completionPct > 0) {
      try { await handleSave(); } catch (err) { console.error("Save before next failed:", err); }
    }
    navigate(`/infect-gi-hema-log/${enrollmentId}`);
  };

  /* ── Audit trail — superadmin + site PI only, scoped to the active day ── */
  const fetchAuditHistory = async () => {
    setShowAuditModal(true);
    setAuditLoading(true);
    try {
      const res = await api.get("/audit/", {
        params: {
          table_name: "resp_cv_neuro_day_logs",
          enrollment_id: enrollmentId,
          limit: 200,
        },
      });
      const entries = (res?.data || []).filter(e => {
        const day = e.new_values?.nicu_day ?? e.old_values?.nicu_day;
        return day === activeDay;
      });
      setAuditEntries(entries);
    } catch (err) {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  };

  /* ── Mark patient as discharged ── */
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const handleDischarge = async () => {
    setShowDischargeConfirm(false);
    try {
      await api.patch(`/enrollment/${enrollmentId}/discharge`, {
        discharge_date: toDateOnlyValue(new Date()),
        discharge_day:  activeDay,
      });
      setDischargeDay(activeDay);
      setPatientInfo(prev => ({ ...prev, status: "Discharged" }));
      setMessage("✅ Patient marked as discharged from Day " + activeDay);
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      console.error(err?.response?.data || err);
      setMessage("❌ Could not record discharge — please try again");
    }
  };

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  // Past days with genuinely no data at all — surfaced as a "missed" warning.
  const missedDays = days.filter(d =>
    todayNicuDay != null && d < todayNicuDay &&
    (dayStatuses[d] || STATUS.EMPTY) === STATUS.EMPTY
  );

  // Fetches full clinical data for every day that has something saved
  // (status != EMPTY), for the "Table View" overview. Reuses the same
  // per-day endpoint the form itself already uses to load a single day —
  // no new backend endpoint needed, just fetched in parallel for every
  // filled day instead of one at a time.
  const loadTableViewData = async () => {
    setShowTableView(true);
    setTableViewLoading(true);
    try {
      const filledDays = days.filter(d => (dayStatuses[d] || STATUS.EMPTY) !== STATUS.EMPTY);
      const results = await Promise.all(
        filledDays.map(d =>
          api.get(`/resp-cv-neuro/${enrollmentId}/${d}`)
            .then(res => ({ day: d, data: res?.data || null }))
            .catch(() => ({ day: d, data: null }))
        )
      );
      results.sort((a, b) => a.day - b.day);
      setTableViewRows(results.filter(r => r.data));
    } catch (err) {
      console.error("Table view load failed:", err);
    } finally {
      setTableViewLoading(false);
    }
  };

  // Computes a popover position anchored under a badge button, clamped so
  // it never runs off the left/right edges, and flipped above the badge
  // when there isn't enough room below (e.g. a day near the bottom of the
  // screen). POPOVER_MAX_H is a conservative estimate — good enough for
  // flip decisions since a slight misjudgement just means less padding.
  const POPOVER_MAX_H = 260;
  const computeMissingPopoverPos = (anchorEl) => {
    const rect = anchorEl.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left + rect.width / 2, 118), window.innerWidth - 118);
    const roomBelow = window.innerHeight - rect.bottom;
    const top = roomBelow < POPOVER_MAX_H && rect.top > POPOVER_MAX_H
      ? Math.max(8, rect.top - POPOVER_MAX_H - 8)
      : rect.bottom + 8;
    return { top, left };
  };

  // Opens/closes the "what's missing" popover for a day pill. Fetches and
  // caches that day's saved record on first open — cheap, since it only
  // runs for the day the user actually clicks into, not all of them.
  const handleToggleMissing = async (day, e) => {
    e.stopPropagation();
    if (missingPopoverDay === day) { setMissingPopoverDay(null); return; }
    missingAnchorRef.current = e.currentTarget;
    setMissingPopoverPos(computeMissingPopoverPos(e.currentTarget));
    setMissingPopoverDay(day);
    if (missingFieldsCache[day]) return;
    setMissingLoading(true);
    try {
      const res = await api.get(`/resp-cv-neuro/${enrollmentId}/${day}`);
      setMissingFieldsCache(prev => ({ ...prev, [day]: computeMissingFields(res?.data) }));
    } catch {
      setMissingFieldsCache(prev => ({ ...prev, [day]: [] }));
    } finally {
      setMissingLoading(false);
    }
  };

  // Keep the popover glued to its badge while the page (or the day strip)
  // scrolls, instead of just closing it — re-measures the anchor button's
  // live position on every scroll/resize tick. Still closes on an outside
  // click, and on scroll if the anchor has been scrolled out of view
  // entirely (nothing sensible to point at anymore).
  useEffect(() => {
    if (missingPopoverDay === null) return;
    const handlePointerDown = (e) => {
      if (
        missingPopoverRef.current && !missingPopoverRef.current.contains(e.target) &&
        missingAnchorRef.current && !missingAnchorRef.current.contains(e.target)
      ) {
        setMissingPopoverDay(null);
      }
    };
    const reposition = () => {
      const anchor = missingAnchorRef.current;
      if (!anchor || !anchor.isConnected) { setMissingPopoverDay(null); return; }
      const rect = anchor.getBoundingClientRect();
      const offscreen = rect.bottom < 0 || rect.top > window.innerHeight ||
        rect.right < 0 || rect.left > window.innerWidth;
      if (offscreen) { setMissingPopoverDay(null); return; }
      setMissingPopoverPos(computeMissingPopoverPos(anchor));
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [missingPopoverDay]);

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <>
      {/* ── Editing banner (matches FormD pattern) ── */}
      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode Active — changes will be saved when you click Save
        </div>
      )}

      <div className={`rcn-page${isSaved && !isEditing ? " rcn-readonly" : ""}`}>

        {/* ══ PATIENT INFO HEADER ══ */}
        <div className="rcn-patient-header">
          <div className="rcn-patient-header-title">
            <div className="rcn-patient-header-badge">HELPER FORM 2</div>
            <h2 className="rcn-patient-header-form-name">Resp / CV / Neuro Daily Log</h2>
            <p className="rcn-patient-header-subtitle">NICU Day-by-Day Structured Assessment</p>
          </div>
          <div className="rcn-patient-cards">
            <div className="rcn-pcard rcn-pcard--blue">
              <span className="rcn-pcard-icon">🪪</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Enrolment ID</span>
                <span className="rcn-pcard-value">{patientInfo.enrollmentId || "—"}</span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--violet">
              <span className="rcn-pcard-icon">🤱</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Mother's Name</span>
                <span className="rcn-pcard-value rcn-pcard-value--cap">
                  {patientInfo.motherName || "—"}
                </span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--teal">
              <span className="rcn-pcard-icon">🧬</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Gestation</span>
                <span className="rcn-pcard-value">{patientInfo.gestationalAge || "—"}</span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--amber">
              <span className="rcn-pcard-icon">🏷️</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Baby UID</span>
                <span className="rcn-pcard-value">{patientInfo.babyUid || "—"}</span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--rose">
              <span className="rcn-pcard-icon">👶</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Baby Name</span>
                <span className="rcn-pcard-value rcn-pcard-value--cap">
                  {patientInfo.babyName || <span className="rcn-pcard-empty">if available</span>}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ DAY TIMELINE ══ */}
        <div className="rcn-timeline-wrap">
          <div className="rcn-timeline-header">
            <span className="rcn-timeline-label">Days</span>
            <button
              type="button"
              className="rcn-table-view-btn"
              onClick={loadTableViewData}
              title="View all filled days in a single table"
            >
              <History size={13} /> Table View
            </button>
            <div
              className={`rcn-day1-picker${day1DateLocked ? " rcn-day1-picker--locked" : ""}${!day1Date ? " rcn-day1-picker--required" : ""}`}
              role={day1DateLocked ? undefined : "button"}
              tabIndex={day1DateLocked ? -1 : 0}
              aria-label={day1Date ? `Day 1 Date ${formatIsoDateMedium(day1Date)}` : "Day 1 Date, select date"}
              title={day1DateLocked
                ? `Locked — daily data already exists for this baby${day1DateSetBy ? ` (set by ${day1DateSetBy})` : ""}`
                : `Required — today's date, or yesterday's before ${RCN_LATE_GRACE_HOUR}:00 AM`}
              onClick={(e) => {
                if (day1DateLocked || e.target.closest(".rcn-day1-admin-unlock")) return;
                openNativeDatePicker(e.currentTarget.querySelector("input[type='date']"));
              }}
              onKeyDown={(e) => {
                if (day1DateLocked) return;
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
                  Day 1 Date {!day1Date && <span className="rcn-day1-picker-required-mark" title="Required — data cannot be entered until this is set">*</span>}
                </span>
                <span className="rcn-day1-picker-value">
                  {day1Date ? formatIsoDateMedium(day1Date) : "Select date"}
                </span>
              </div>
              <input
                type="date"
                className="rcn-day1-picker-input"
                tabIndex={-1}
                aria-hidden="true"
                value={day1Date}
                readOnly={day1DateLocked}
                disabled={day1DateLocked}
                min={day1EditArmed ? undefined : day1DateBounds.min}
                max={day1EditArmed ? undefined : day1DateBounds.max}
                required
                onChange={async e => {
                  if (day1DateLocked) return;
                  const v = e.target.value;
                  // Nurses may only pick today, or (until the late-grace
                  // cutoff) yesterday — prevents an accidental unrelated
                  // date; superadmin corrections (day1EditArmed) skip this.
                  if (!day1EditArmed && v && (v < day1DateBounds.min || v > day1DateBounds.max)) {
                    setMessage(
                      `⚠️ Day 1 Date must be today's date, or yesterday's before ${RCN_LATE_GRACE_HOUR}:00 AM`
                    );
                    setTimeout(() => setMessage(""), 4000);
                    return;
                  }
                  setDay1Date(v);
                  if (enrollmentId) localStorage.setItem(`rcn_day1_${enrollmentId}`, v);
                  try {
                    await api.put(`/nicu-admission/${enrollmentId}/day1-date`, { day1_date: v });
                    setDay1EditArmed(false);
                    setDay1DateSetBy(user?.username || "");
                  } catch (err) {
                    setMessage("⚠️ Could not save Day 1 Date — " +
                      (err?.response?.data?.detail || "it may already be locked"));
                  }
                }}
              />
              {day1DateLocked && (
                <span
                  className="rcn-day1-picker-lock-chip"
                  title={`Locked — daily data already exists for this baby${day1DateSetBy ? ` (set by ${day1DateSetBy})` : ""}`}
                >
                  <Lock size={11} strokeWidth={2.25} />
                  Locked
                </span>
              )}
              {day1DateLockedRemote && isSuperadmin && !day1EditArmed && (
                <button
                  type="button"
                  className="rcn-day1-admin-unlock"
                  title="Superadmin: unlock Day 1 Date for correction"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(
                      "Changing Day 1 Date after daily data exists can reshuffle which days are " +
                      "counted as past/future for every nurse. Continue only for a genuine correction."
                    )) setDay1EditArmed(true);
                  }}
                >
                  <Unlock size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="rcn-timeline">
            {days.map(d => {
              const isActive    = d === activeDay;
              const isDischarge = dischargeDay && d > dischargeDay;
              const isFuture    = todayNicuDay != null && d > todayNicuDay;
              const isLocked    = isDischarge || isFuture;
              const st          = dayStatuses[d] || STATUS.EMPTY;
              const isMissed    = !isDischarge && missedDays.includes(d);
              const cfg         = DAY_STATUS_CONFIG[st] || DAY_STATUS_CONFIG[STATUS.EMPTY];
              const meta        = dayMeta[d] || {};
              // Only days that are genuinely started-but-incomplete get the
              // "what's missing" badge — a day nobody has touched yet, or one
              // that's already complete/submitted/locked, has nothing to list.
              const showMissingBadge = !isLocked && (st === STATUS.DRAFT || st === STATUS.PARTIAL || st === STATUS.LATE);
              return (
                <div key={d} className="rcn-day-wrap">
                  <button
                    type="button"
                    className={[
                      "rcn-day",
                      isActive    ? "rcn-day--active"    : "",
                      isDischarge ? "rcn-day--discharged": "",
                      isFuture    ? "rcn-day--future"    : "",
                      isMissed    ? "rcn-day--missed"    : "",
                      `rcn-day--${st}`,
                    ].filter(Boolean).join(" ")}
                    onClick={() => !isLocked && setActiveDay(d)}
                    disabled={isFuture}
                    title={
                      isDischarge ? `Day ${d} — Patient discharged`
                      : isFuture   ? `Day ${d} — not available yet (unlocks on its calendar date)`
                      : isMissed   ? `Day ${d} — no data was ever entered (missed)`
                      : `Day ${d} · ${cfg.label}${meta.pct ? ` · ${meta.pct}%` : ""}`
                    }
                  >
                    <span className="rcn-day-label">Day {d}</span>
                    <span className="rcn-day-date">
                      {isDischarge ? "🏠" : (() => {
                        if (!day1Date) return "";
                        const base = new Date(day1Date);
                        base.setDate(base.getDate() + d - 1);
                        return base.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                      })()}
                    </span>
                  </button>
                  {!isActive && !isFuture && !isDischarge && (isMissed || st === STATUS.LATE) && (
                    <span className="rcn-day-badge rcn-day-badge--alert" aria-hidden="true">!</span>
                  )}
                  {!isActive && !isFuture && !isDischarge && !(isMissed || st === STATUS.LATE) && (
                    st === STATUS.COMPLETE || st === STATUS.SUBMITTED || st === STATUS.DRAFT || st === STATUS.PARTIAL
                  ) && (
                    showMissingBadge ? (
                      <button
                        type="button"
                        className="rcn-day-badge rcn-day-badge--list"
                        onClick={(e) => handleToggleMissing(d, e)}
                        title={`Day ${d} — see what's still missing`}
                        aria-label={`See missing fields for Day ${d}`}
                      >
                        <ListChecks size={10} strokeWidth={2.5} />
                      </button>
                    ) : (
                      <span className="rcn-day-badge rcn-day-badge--list" aria-hidden="true">
                        <ListChecks size={10} strokeWidth={2.5} />
                      </span>
                    )
                  )}
                </div>
              );
            })}

            {/* ── Add next day ── */}
            {!dischargeDay && (
              <button
                type="button"
                className="rcn-day-add"
                onClick={() => {
                  const next = totalDays + 1;
                  setTotalDays(next);
                  setActiveDay(next);
                }}
                title={`Add Day ${totalDays + 1}`}
              >
                <span className="rcn-day-add-plus">+</span>
                <span className="rcn-day-add-label">Day</span>
              </button>
            )}
          </div>

          {missingPopoverDay !== null && missingPopoverPos && createPortal(
            <div
              ref={missingPopoverRef}
              className="rcn-day-missing-pop"
              style={{ top: missingPopoverPos.top, left: missingPopoverPos.left }}
            >
              <div className="rcn-day-missing-pop-head">
                <span>Day {missingPopoverDay} — missing fields</span>
                <button
                  type="button"
                  className="rcn-day-missing-pop-close"
                  onClick={() => setMissingPopoverDay(null)}
                  aria-label="Close"
                >
                  <X size={12} />
                </button>
              </div>
              {missingLoading && !missingFieldsCache[missingPopoverDay] ? (
                <p className="rcn-day-missing-pop-empty">Checking day {missingPopoverDay}&hellip;</p>
              ) : !missingFieldsCache[missingPopoverDay] || missingFieldsCache[missingPopoverDay].length === 0 ? (
                <p className="rcn-day-missing-pop-empty">Nothing missing — every field on this day is filled in.</p>
              ) : (
                <div className="rcn-day-missing-pop-body">
                  {missingFieldsCache[missingPopoverDay].map(g => (
                    <div key={g.section} className="rcn-day-missing-pop-group">
                      <p className="rcn-day-missing-pop-section">{g.section}</p>
                      <ul className="rcn-day-missing-pop-list">
                        {g.labels.map(label => <li key={label}>{label}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="rcn-day-missing-pop-goto"
                onClick={() => { setActiveDay(missingPopoverDay); setMissingPopoverDay(null); }}
              >
                Go to Day {missingPopoverDay} <ArrowRight size={12} />
              </button>
            </div>,
            document.body
          )}

          {/* ── Status legend ── */}
          <div className="rcn-timeline-legend">
            <div className="rcn-legend-items">
              {LEGEND_ITEMS.map(item => (
                <span
                  key={item.label}
                  className={`rcn-legend-item rcn-legend-item--${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {item.lock
                    ? <Lock size={11} className="rcn-legend-lock" />
                    : <span className="rcn-legend-dot" style={{ background: item.dot }} />}
                  {item.label}
                </span>
              ))}
            </div>
            <span className="rcn-legend-hint">
              <ListChecks size={12} /> Tap a partial day's badge to see what's missing
            </span>
          </div>

          {/* ── Missed-day alert ── */}
          {missedDays.length > 0 && (
            <div className="rcn-missed-banner">
              <AlertOctagon size={13} />
              <span>
                {missedDays.length} day{missedDays.length > 1 ? "s" : ""} with no data entered
                (Day {missedDays.join(", Day ")}) — still open for entry; lock them manually once reviewed.
              </span>
            </div>
          )}

          {/* ── Day 1 Date required alert — data entry is blocked below until this is set ── */}
          {!day1Date && (
            <div className="rcn-missed-banner">
              <AlertOctagon size={13} />
              <span>
                Set <strong>Day 1 Date</strong> above before entering data — it's required and
                can't be added later once a day has been saved without it.
              </span>
            </div>
          )}
        </div>

        {/* ══ DAILY SUMMARY CARD ══ */}
        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">
              Day {activeDay}
              {isPastActiveDay && !isSubmitted && (
                <span className="rcn-past-day-tag" title="This day's calendar date has passed, but it stays editable until you manually lock it">
                  Past day — still editable
                </span>
              )}
            </h2>
            <div className="rcn-summary-meta">
              <Clock size={13} />
              <span>
                {isSaved ? "Completed" : "Not yet started"}
              </span>
            </div>
            {isSaved && (savedBy || savedAt || submittedBy || submittedAt) && (
              <p className="rcn-summary-provenance">
                {isSubmitted ? (
                  <>
                    Locked by {submittedBy || "Site User"}
                    {submittedAt ? ` · ${formatStampShort(submittedAt)}` : ""}
                    {(savedBy || savedAt) ? (
                      <>
                        {" · "}last saved by {savedBy || "Unknown"}
                        {savedAt ? ` · ${formatStampShort(savedAt)}` : ""}
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    Saved by {savedBy || "Unknown"}
                    {savedAt ? ` · ${formatStampShort(savedAt)}` : ""}
                  </>
                )}
              </p>
            )}
          </div>
          <div className="rcn-summary-right">
            <div className="rcn-summary-sections">
              {[
                { emoji: "🫁", label: "Respiratory",    done: respAnswered,  total: respTotal },
                { emoji: "❤️", label: "Cardiovascular", done: cvAnswered,    total: cvTotal },
                { emoji: "🧠", label: "Neurological",   done: neuroAnswered, total: neuroTotal },
              ].map(s => (
                <div className="rcn-summary-section" key={s.label}>
                  <span className="rcn-summary-section-emoji">{s.emoji}</span>
                  <span className="rcn-summary-section-name">{s.label}</span>
                  <span className="rcn-summary-section-count">
                    {s.done}<span className="rcn-summary-section-total">/{s.total}</span>
                  </span>
                  <div className="rcn-summary-section-bar">
                    <div
                      className="rcn-summary-section-bar-fill"
                      style={{ width: `${s.total > 0 ? (s.done / s.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="rcn-summary-ring-wrap">
              <ProgressRing percent={completionPct} />
              <span className="rcn-summary-ring-label">Complete</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rcn-loading">Loading day {activeDay} data…</div>
        ) : (
          <div className="rcn-sections">

            {/* ── Discharge banner ── */}
            {dischargeDay && activeDay > dischargeDay && (
              <div className="rcn-status-banner rcn-status-banner--discharged">
                <span style={{ fontSize: 18 }}>🏠</span>
                <div className="rcn-status-banner-text">
                  <strong>Patient Discharged</strong>
                  <span>Day {dischargeDay} was the last NICU day. Data entry beyond this point is locked.</span>
                </div>
              </div>
            )}

            {/* ── Status Banner ── */}
            {currentDayStatus === STATUS.SUBMITTED && (
              <div className="rcn-status-banner rcn-status-banner--submitted">
                <Lock size={15} />
                <div className="rcn-status-banner-text">
                  <strong>Day {activeDay} Submitted &amp; Locked</strong>
                  <span>
                    Submitted by {submittedBy || "Site User"}
                    {submittedAt ? ` · ${new Date(submittedAt).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}` : ""}
                  </span>
                </div>
              </div>
            )}

            {/* ── Submit prompt — shown when saved but not yet 100% ── */}
            {isSaved && !isSubmitted && completionPct < 100 && (
              <div className="rcn-status-banner rcn-status-banner--pending">
                <AlertTriangle size={15} />
                <div className="rcn-status-banner-text">
                  <strong>{completionPct}% complete</strong>
                  <span>Fill all fields to unlock the Submit button and lock this day's data</span>
                </div>
                <span className="rcn-status-banner-badge">{totalFields - totalAnswered} remaining</span>
              </div>
            )}

            {/* ════ 2.1 WEIGHT ════ */}
            <div className="rcn-field-group" style={{ marginBottom: 16 }}>
              <label className="rcn-field-label">
                2.1 Weight
                <span className="rcn-field-sub">(all measured weights of the day, chronologically)</span>
              </label>
              <input
                type="text" placeholder="e.g. 1250g, 1245g"
                className={`rcn-text-input${weightError ? " rcn-text-input--error" : ""}`}
                value={weightKg}
                onChange={e => isFieldEditable && setWeightKg(e.target.value)}
                readOnly={!isFieldEditable}
              />
              {weightError && <span className="rcn-field-error">{weightError}</span>}
            </div>

            {/* ════ RESPIRATORY ════ */}
            <SectionCard
              iconEmoji="🫁"
              title="Respiratory Assessment"
              answered={respAnswered}
              total={respTotal}
              defaultOpen={true}
            >
              {/* #1-2 Respiratory support / Endotracheally intubated */}
              <div className="rcn-yn-list">
                <YNRow label="1. Respiratory support" value={respiratorySupport}
                  onChange={v => {
                    if (!isFieldEditable) return;
                    setRespiratorySupport(v);
                    if (v !== true) {
                      setSupportModes([]);
                      setMapCpap("");
                      setMapCpapSecondary("");
                      setMaxFio2("");
                      setMaxFlow("");
                      setResp("supp_o2", null);
                    }
                  }} disabled={!isFieldEditable} />
                <YNRow label="2. Endotracheally intubated" value={endotrachealIntubation}
                  onChange={v => isFieldEditable && setEndotrachealIntubation(v)} disabled={!isFieldEditable} />
              </div>

              {/* #3 Mode Pills — only relevant once Respiratory support = Yes */}
              <div className="rcn-field-group">
                <label className="rcn-field-label">
                  3. Mode
                  <span className="rcn-field-sub">
                    {isRespSupportYes
                      ? "NC, HFNC, CPAP, NIPPV, SIMV, A/C, PSV, HFOV — select all that apply"
                      : "Enabled once Respiratory support (#1) is Yes"}
                  </span>
                </label>
                <div className="rcn-pills">
                  {["NC","HFNC","CPAP","NIPPV","SIMV","AC","PSV","HFOV"].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      className={`rcn-pill${supportModes.includes(mode) ? " rcn-pill--on" : ""}`}
                      onClick={() => toggleMode(mode)}
                      disabled={!isFieldEditable || !isRespSupportYes}
                    >{mode}</button>
                  ))}
                </div>
              </div>

              {/* #4 (+4b) MAP/CPAP, #5 Max FiO2, #6 Max Flow */}
              <div className={`rcn-inputs-row ${isMapCpapBoth ? "rcn-inputs-row--4col" : "rcn-inputs-row--3col"}`}>
                {isMapCpapBoth ? (
                  <>
                    <div className="rcn-input-group">
                      <div className="rcn-field-label-row">
                        <label className="rcn-field-label">4. Max CPAP</label>
                        {isRespSupportYes && (
                          <button type="button"
                            className={`rcn-notdone-toggle${mapCpapSecondaryStatus ? " rcn-notdone-toggle--on" : ""}`}
                            onClick={() => { if (!isFieldEditable) return; setMapCpapSecondaryStatus(v => v ? null : NOT_RECORDED_LABEL); setMapCpapSecondary(""); }}
                            disabled={!isFieldEditable}
                          >{mapCpapSecondaryStatus ? "Undo" : "Not Recorded / Not Done"}</button>
                        )}
                      </div>
                      {mapCpapSecondaryStatus ? (
                        <div className="rcn-num-input rcn-num-input--na">
                          <span className="rcn-na-value">{mapCpapSecondaryStatus}</span>
                        </div>
                      ) : (
                        <>
                          <div className={`rcn-num-input${mapCpapSecondaryError ? " rcn-num-input--error" : ""}`}>
                            <input
                              type="number" placeholder="0"
                              value={mapCpapSecondary}
                              onChange={e => isFieldEditable && isRespSupportYes && setMapCpapSecondary(e.target.value)}
                              readOnly={!isFieldEditable || !isRespSupportYes}
                              disabled={!isRespSupportYes}
                              min="0" max="50" step="0.5"
                            />
                            <span className="rcn-num-unit">cm H₂O</span>
                          </div>
                          {mapCpapSecondaryError && <span className="rcn-field-error">{mapCpapSecondaryError}</span>}
                        </>
                      )}
                    </div>
                    <div className="rcn-input-group">
                      <div className="rcn-field-label-row">
                        <label className="rcn-field-label">4b. Max MAP</label>
                        {isRespSupportYes && (
                          <button type="button"
                            className={`rcn-notdone-toggle${mapCpapStatus ? " rcn-notdone-toggle--on" : ""}`}
                            onClick={() => { if (!isFieldEditable) return; setMapCpapStatus(v => v ? null : NOT_RECORDED_LABEL); setMapCpap(""); }}
                            disabled={!isFieldEditable}
                          >{mapCpapStatus ? "Undo" : "Not Recorded / Not Done"}</button>
                        )}
                      </div>
                      {mapCpapStatus ? (
                        <div className="rcn-num-input rcn-num-input--na">
                          <span className="rcn-na-value">{mapCpapStatus}</span>
                        </div>
                      ) : (
                        <>
                          <div className={`rcn-num-input${mapCpapError ? " rcn-num-input--error" : ""}`}>
                            <input
                              type="number" placeholder="0"
                              value={mapCpap}
                              onChange={e => isFieldEditable && isRespSupportYes && setMapCpap(e.target.value)}
                              readOnly={!isFieldEditable || !isRespSupportYes}
                              disabled={!isRespSupportYes}
                              min="0" max="50" step="0.5"
                            />
                            <span className="rcn-num-unit">cm H₂O</span>
                          </div>
                          {mapCpapError && <span className="rcn-field-error">{mapCpapError}</span>}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rcn-input-group">
                    <div className="rcn-field-label-row">
                      <label className="rcn-field-label">
                        4. {mapCpapMode === "CPAP" ? "Max CPAP" : mapCpapMode === "MAP" ? "Max MAP" : "Max CPAP/MAP"}
                      </label>
                      {isRespSupportYes && !isMapCpapNA && (
                        <button type="button"
                          className={`rcn-notdone-toggle${mapCpapStatus ? " rcn-notdone-toggle--on" : ""}`}
                          onClick={() => { if (!isFieldEditable) return; setMapCpapStatus(v => v ? null : NOT_RECORDED_LABEL); setMapCpap(""); }}
                          disabled={!isFieldEditable}
                        >{mapCpapStatus ? "Undo" : "Not Recorded / Not Done"}</button>
                      )}
                    </div>
                    {isMapCpapNA ? (
                      <div className="rcn-num-input rcn-num-input--na">
                        <span className="rcn-na-value">NA</span>
                        <span className="rcn-num-unit">mode doesn't generate pressure</span>
                      </div>
                    ) : mapCpapStatus ? (
                      <div className="rcn-num-input rcn-num-input--na">
                        <span className="rcn-na-value">{mapCpapStatus}</span>
                      </div>
                    ) : (
                      <>
                        <div className={`rcn-num-input${mapCpapError ? " rcn-num-input--error" : ""}`}>
                          <input
                            type="number" placeholder="0"
                            value={mapCpap}
                            onChange={e => isFieldEditable && isRespSupportYes && setMapCpap(e.target.value)}
                            readOnly={!isFieldEditable || !isRespSupportYes}
                            disabled={!isRespSupportYes}
                            min="0" max="50" step="0.5"
                          />
                          <span className="rcn-num-unit">cm H₂O</span>
                        </div>
                        {mapCpapError && <span className="rcn-field-error">{mapCpapError}</span>}
                      </>
                    )}
                  </div>
                )}
                <div className="rcn-input-group">
                  <div className="rcn-field-label-row">
                    <label className="rcn-field-label">5. Max FiO₂</label>
                    {isRespSupportYes && (
                      <button type="button"
                        className={`rcn-notdone-toggle${maxFio2Status ? " rcn-notdone-toggle--on" : ""}`}
                        onClick={() => { if (!isFieldEditable) return; setMaxFio2Status(v => v ? null : NOT_RECORDED_LABEL); setMaxFio2(""); }}
                        disabled={!isFieldEditable}
                      >{maxFio2Status ? "Undo" : "Not Recorded / Not Done"}</button>
                    )}
                  </div>
                  {maxFio2Status ? (
                    <div className="rcn-num-input rcn-num-input--na">
                      <span className="rcn-na-value">{maxFio2Status}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`rcn-num-input${maxFio2Error ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="21"
                          value={maxFio2}
                          onChange={e => isFieldEditable && isRespSupportYes && setMaxFio2(e.target.value)}
                          min="21" max="100"
                          readOnly={!isFieldEditable || !isRespSupportYes}
                          disabled={!isRespSupportYes}
                        />
                        <span className="rcn-num-unit">%</span>
                      </div>
                      {maxFio2Error && <span className="rcn-field-error">{maxFio2Error}</span>}
                    </>
                  )}
                </div>
                <div className="rcn-input-group">
                  <div className="rcn-field-label-row">
                    <label className="rcn-field-label">6. Max Gas Flow</label>
                    {isRespSupportYes && (
                      <button type="button"
                        className={`rcn-notdone-toggle${maxFlowStatus ? " rcn-notdone-toggle--on" : ""}`}
                        onClick={() => { if (!isFieldEditable) return; setMaxFlowStatus(v => v ? null : NOT_RECORDED_LABEL); setMaxFlow(""); }}
                        disabled={!isFieldEditable}
                      >{maxFlowStatus ? "Undo" : "Not Recorded / Not Done"}</button>
                    )}
                  </div>
                  {maxFlowStatus ? (
                    <div className="rcn-num-input rcn-num-input--na">
                      <span className="rcn-na-value">{maxFlowStatus}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`rcn-num-input${maxFlowError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="0"
                          value={maxFlow}
                          onChange={e => isFieldEditable && isRespSupportYes && setMaxFlow(e.target.value)}
                          min="0" max="30"
                          readOnly={!isFieldEditable || !isRespSupportYes}
                          disabled={!isRespSupportYes}
                        />
                        <span className="rcn-num-unit">L/min</span>
                      </div>
                      {maxFlowError && <span className="rcn-field-error">{maxFlowError}</span>}
                    </>
                  )}
                </div>
              </div>

              {/* #7 Supplemental O2 */}
              <div className="rcn-yn-list">
                <YNRow label="7. Supplemental O₂ >21% (any)" value={respEvents.supp_o2}
                  onChange={v => isRespSupportYes && setResp("supp_o2", v)}
                  disabled={!isFieldEditable || !isRespSupportYes} />
              </div>
              {!isRespSupportYes && (
                <p className="rcn-field-hint">Enabled once Respiratory support (#1) is Yes</p>
              )}

              {/* #8 pH */}
              <div className="rcn-field-group rcn-field-group--narrow">
                <div className="rcn-field-label-row">
                  <label className="rcn-field-label">8. <span className="rcn-field-label--exact-case">pH</span><span className="rcn-field-sub">(lowest of the day)</span></label>
                  <button type="button"
                    className={`rcn-notdone-toggle${lowestPhNotDone ? " rcn-notdone-toggle--on" : ""}`}
                    onClick={() => { if (!isFieldEditable) return; setLowestPhNotDone(v => !v); setLowestPh(""); }}
                    disabled={!isFieldEditable}
                  >{lowestPhNotDone ? "Undo" : "Not Recorded / Not Done"}</button>
                </div>
                {lowestPhNotDone ? (
                  <div className="rcn-num-input rcn-num-input--na">
                    <span className="rcn-na-value">{NOT_RECORDED_LABEL}</span>
                  </div>
                ) : (
                  <>
                    <div className={`rcn-num-input${phError ? " rcn-num-input--error" : ""}`}>
                      <input
                        type="number" placeholder="7.25" step="0.01"
                        value={lowestPh}
                        onChange={e => isFieldEditable && setLowestPh(e.target.value)}
                        readOnly={!isFieldEditable}
                      />
                    </div>
                    {phError && <span className="rcn-field-error">{phError}</span>}
                  </>
                )}
              </div>

              {/* #9 PaO2 */}
              <div className="rcn-field-group">
                <div className="rcn-field-label-row">
                  <label className="rcn-field-label">9. <span className="rcn-field-label--exact-case">PaO₂</span> <span className="rcn-field-sub">(mmHg)</span></label>
                  <button
                    type="button"
                    className={`rcn-notdone-toggle${pao2NotDone ? " rcn-notdone-toggle--on" : ""}`}
                    onClick={() => isFieldEditable && setPao2NotDone(v => !v)}
                    disabled={!isFieldEditable}
                  >{pao2NotDone ? "Undo" : "Not Done"}</button>
                </div>
                {pao2NotDone ? (
                  <button
                    type="button"
                    className="rcn-num-input rcn-num-input--na rcn-num-input--na-clickable"
                    onClick={() => isFieldEditable && setPao2NotDone(false)}
                    disabled={!isFieldEditable}
                    title="Click to enter values instead"
                  >
                    <span className="rcn-na-value">Not Done</span>
                    <span className="rcn-num-unit">tap to change</span>
                  </button>
                ) : (
                  <>
                    <div className="rcn-range-pair">
                      <div className={`rcn-num-input rcn-num-input--sm${pao2LowError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="Lowest"
                          value={pao2Low}
                          onChange={e => isFieldEditable && setPao2Low(e.target.value)}
                          readOnly={!isFieldEditable}
                        />
                      </div>
                      <span className="rcn-range-sep">–</span>
                      <div className={`rcn-num-input rcn-num-input--sm${pao2HighError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="Highest"
                          value={pao2High}
                          onChange={e => isFieldEditable && setPao2High(e.target.value)}
                          readOnly={!isFieldEditable}
                        />
                      </div>
                      <span className="rcn-num-unit">mmHg</span>
                    </div>
                    {(pao2LowError || pao2HighError || pao2OrderError) && (
                      <span className="rcn-field-error">{pao2LowError || pao2HighError || pao2OrderError}</span>
                    )}
                  </>
                )}
              </div>

              {/* #10 PaCO2 */}
              <div className="rcn-field-group">
                <div className="rcn-field-label-row">
                  <label className="rcn-field-label">10. <span className="rcn-field-label--exact-case">PaCO₂</span> <span className="rcn-field-sub">(mmHg)</span></label>
                  <button
                    type="button"
                    className={`rcn-notdone-toggle${paco2NotDone ? " rcn-notdone-toggle--on" : ""}`}
                    onClick={() => isFieldEditable && setPaco2NotDone(v => !v)}
                    disabled={!isFieldEditable}
                  >{paco2NotDone ? "Undo" : "Not Done"}</button>
                </div>
                {paco2NotDone ? (
                  <button
                    type="button"
                    className="rcn-num-input rcn-num-input--na rcn-num-input--na-clickable"
                    onClick={() => isFieldEditable && setPaco2NotDone(false)}
                    disabled={!isFieldEditable}
                    title="Click to enter values instead"
                  >
                    <span className="rcn-na-value">Not Done</span>
                    <span className="rcn-num-unit">tap to change</span>
                  </button>
                ) : (
                  <>
                    <div className="rcn-range-pair">
                      <div className={`rcn-num-input rcn-num-input--sm${paco2LowError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="Lowest"
                          value={paco2Low}
                          onChange={e => isFieldEditable && setPaco2Low(e.target.value)}
                          readOnly={!isFieldEditable}
                        />
                      </div>
                      <span className="rcn-range-sep">–</span>
                      <div className={`rcn-num-input rcn-num-input--sm${paco2HighError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="Highest"
                          value={paco2High}
                          onChange={e => isFieldEditable && setPaco2High(e.target.value)}
                          readOnly={!isFieldEditable}
                        />
                      </div>
                      <span className="rcn-num-unit">mmHg</span>
                    </div>
                    {(paco2LowError || paco2HighError || paco2OrderError) && (
                      <span className="rcn-field-error">{paco2LowError || paco2HighError || paco2OrderError}</span>
                    )}
                  </>
                )}
              </div>

              {/* #11-12 Surfactant, Caffeine */}
              <div className="rcn-yn-list">
                <YNRow label="11. Surfactant given" value={respEvents.surfactant}
                  onChange={v => setResp("surfactant", v)} disabled={!isFieldEditable} />
                <YNRow label="12. Caffeine" value={respEvents.caffeine}
                  onChange={v => setResp("caffeine", v)} disabled={!isFieldEditable} />
              </div>

              {/* #13-15 Apnea, Desaturations, Severe desaturations */}
              <div className="rcn-inputs-row rcn-inputs-row--3col">
                <div className="rcn-input-group">
                  <div className="rcn-field-label-row">
                    <label className="rcn-field-label">13. No of Apnea episodes</label>
                    <button type="button"
                      className={`rcn-notdone-toggle${apneaCountNotDone ? " rcn-notdone-toggle--on" : ""}`}
                      onClick={() => { if (!isFieldEditable) return; setApneaCountNotDone(v => !v); setApneaCount(""); }}
                      disabled={!isFieldEditable}
                    >{apneaCountNotDone ? "Undo" : "Not Recorded / Not Done"}</button>
                  </div>
                  {apneaCountNotDone ? (
                    <div className="rcn-num-input rcn-num-input--na">
                      <span className="rcn-na-value">{NOT_RECORDED_LABEL}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`rcn-num-input${apneaCountError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="0" min="0" step="1"
                          value={apneaCount}
                          onChange={e => isFieldEditable && setApneaCount(e.target.value)}
                          readOnly={!isFieldEditable}
                        />
                      </div>
                      {apneaCountError && <span className="rcn-field-error">{apneaCountError}</span>}
                    </>
                  )}
                </div>
                <div className="rcn-input-group">
                  <div className="rcn-field-label-row">
                    <label className="rcn-field-label">14. No of Desaturations (&lt;91%)</label>
                    <button type="button"
                      className={`rcn-notdone-toggle${desatCountNotDone ? " rcn-notdone-toggle--on" : ""}`}
                      onClick={() => { if (!isFieldEditable) return; setDesatCountNotDone(v => !v); setDesatCount(""); }}
                      disabled={!isFieldEditable}
                    >{desatCountNotDone ? "Undo" : "Not Recorded / Not Done"}</button>
                  </div>
                  {desatCountNotDone ? (
                    <div className="rcn-num-input rcn-num-input--na">
                      <span className="rcn-na-value">{NOT_RECORDED_LABEL}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`rcn-num-input${desatCountError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="0" min="0" step="1"
                          value={desatCount}
                          onChange={e => isFieldEditable && setDesatCount(e.target.value)}
                          readOnly={!isFieldEditable}
                        />
                      </div>
                      {desatCountError && <span className="rcn-field-error">{desatCountError}</span>}
                    </>
                  )}
                </div>
                <div className="rcn-input-group">
                  <div className="rcn-field-label-row">
                    <label className="rcn-field-label">15. No of severe desaturations (&lt;80%)</label>
                    <button type="button"
                      className={`rcn-notdone-toggle${severeDesatCountNotDone ? " rcn-notdone-toggle--on" : ""}`}
                      onClick={() => { if (!isFieldEditable) return; setSevereDesatCountNotDone(v => !v); setSevereDesatCount(""); }}
                      disabled={!isFieldEditable}
                    >{severeDesatCountNotDone ? "Undo" : "Not Recorded / Not Done"}</button>
                  </div>
                  {severeDesatCountNotDone ? (
                    <div className="rcn-num-input rcn-num-input--na">
                      <span className="rcn-na-value">{NOT_RECORDED_LABEL}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`rcn-num-input${severeDesatCountError ? " rcn-num-input--error" : ""}`}>
                        <input
                          type="number" placeholder="0" min="0" step="1"
                          value={severeDesatCount}
                          onChange={e => isFieldEditable && setSevereDesatCount(e.target.value)}
                          readOnly={!isFieldEditable}
                        />
                      </div>
                      {severeDesatCountError && <span className="rcn-field-error">{severeDesatCountError}</span>}
                    </>
                  )}
                </div>
              </div>

              {/* #16-22 remaining respiratory events */}
              <div className="rcn-field-group">
                <div className="rcn-yn-list">
                  <YNRow label="16. Extubation attempted" value={respEvents.extub_attempted}
                    onChange={v => {
                      if (!isFieldEditable) return;
                      setResp("extub_attempted", v);
                      if (v !== true) setResp("extub_failure", null);
                    }} disabled={!isFieldEditable} />
                  <YNRow label="17. Extubation failure (<72h from extubation)" value={respEvents.extub_failure}
                    onChange={v => isExtubAttemptedYes && setResp("extub_failure", v)}
                    disabled={!isFieldEditable || !isExtubAttemptedYes}
                    hint={!isExtubAttemptedYes ? "Enabled once Extubation attempted (#16) is Yes" : null} />
                  {[
                    { k: "pulm_hemorrhage",    l: "18. Pulmonary hemorrhage" },
                    { k: "pneumothorax",       l: "19. Pneumothorax" },
                    { k: "chest_drain",        l: "20. Chest drain in situ" },
                    { k: "pphn",               l: "21. Pulmonary HTN (PPHN)" },
                    { k: "postnatal_steroids", l: "22. Postnatal steroids" },
                  ].map(({ k, l }) => (
                    <YNRow key={k} label={l} value={respEvents[k]}
                      onChange={v => setResp(k, v)} disabled={!isFieldEditable} />
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* ════ CARDIOVASCULAR ════ */}
            <SectionCard
              iconEmoji="❤️"
              title="Cardiovascular Assessment"
              answered={cvAnswered}
              total={cvTotal}
              defaultOpen={true}
            >
              <div className="rcn-yn-list">
                {[
                  { k: "pda_suspected",     l: "23. PDA suspected/confirmed" },
                  { k: "echo_done",         l: "24. Echo done" },
                  { k: "hs_pda",            l: "25. HS-PDA" },
                  { k: "shock",             l: "26. Shock" },
                  { k: "vasoactive_support",l: "27. Vasoactives" },
                ].map(({ k, l }) => (
                  <YNRow key={k} label={l} value={cvData[k]}
                    onChange={v => setCv(k, v)} disabled={!isFieldEditable} />
                ))}
              </div>

              {cvData.vasoactive_support === true && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">28. Vasoactive type (select all that apply)</div>
                  <div className="rcn-pills">
                    {["Dopamine","Dobutamine","Adrenaline","Noradrenaline","Milrinone","Vasopressin"].map(drug => (
                      <button
                        key={drug}
                        type="button"
                        className={`rcn-pill rcn-pill--drug${vasoactiveDrugs.includes(drug) ? " rcn-pill--drug-on" : ""}`}
                        onClick={() => toggleDrug(drug)}
                        disabled={!isFieldEditable}
                      >{drug}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <YNRow key="fluid_bolus_given" label="29. Fluid bolus given" value={cvData.fluid_bolus_given}
                  onChange={v => setCv("fluid_bolus_given", v)} disabled={!isFieldEditable}
                  autofilled={!!bolusAutofilled} />
              </div>
            </SectionCard>

            {/* ════ NEUROLOGICAL ════ */}
            <SectionCard
              iconEmoji="🧠"
              title="Neurological Assessment"
              answered={neuroAnswered}
              total={neuroTotal}
              defaultOpen={true}
            >
              <div className="rcn-yn-list">
                <YNRow label="30. Cranial USG done" value={neuroData.cranial_usg}
                  onChange={v => setNeuro("cranial_usg", v)} disabled={!isFieldEditable} />
              </div>

              {cranialUsgYes && (
                <div className="rcn-subsection">
                  <div className="rcn-yn-list">
                    {[
                      { k: "ivh",              l: "31. IVH (any grade)" },
                      { k: "cpvl_confirmed",   l: "32. cPVL (any grade)" },
                      { k: "ventriculomegaly", l: "33. Ventriculomegaly" },
                    ].map(({ k, l }) => (
                      <YNRow key={k} label={l} value={neuroData[k]}
                        onChange={v => setNeuro(k, v)} disabled={!isFieldEditable} />
                    ))}
                  </div>

                </div>
              )}

              <div className="rcn-yn-list">
                {[
                  { k: "clinical_seizures",     l: "34. Seizures (clinical)" },
                  { k: "eeg_seizures",          l: "35. Seizures (EEG confirmed)" },
                  { k: "aeds_given",            l: "36. AEDs given" },
                  { k: "non_ivh_ich",           l: "37. Non-IVH ICH" },
                ].map(({ k, l }) => (
                  <YNRow key={k} label={l} value={neuroData[k]}
                    onChange={v => setNeuro(k, v)} disabled={!isFieldEditable} />
                ))}
              </div>
            </SectionCard>


          </div>
        )}

        {/* ── Save message ── */}
        {message && (
          <div className={`form-message${message.startsWith("✅") ? " form-message--success" : " form-message--error"}`}>
            {message}
          </div>
        )}

      </div>{/* end rcn-page */}

      {/* ══ SUBMIT MODAL ══ */}
      {showModal && (
        <SubmitModal
          day={activeDay}
          completionPct={completionPct}
          onConfirm={handleSubmit}
          onCancel={() => setShowModal(false)}
          submitting={submitting}
        />
      )}

      {/* ══ TABLE VIEW MODAL ══ */}
      {showTableView && (
        <div className="rcn-modal-overlay" onClick={() => setShowTableView(false)}>
          <div className="rcn-modal rcn-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="rcn-modal-header">
              <div className="rcn-modal-icon"><History size={18} /></div>
              <div>
                <h3 className="rcn-modal-title">All Days — Table View</h3>
                <p className="rcn-modal-subtitle">Every day filled in so far for this baby, side by side</p>
              </div>
              <button className="rcn-modal-close" type="button" onClick={() => setShowTableView(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="rcn-modal-body rcn-table-view-body">
              {tableViewLoading ? (
                <p className="rcn-table-view-empty">Loading all days&hellip;</p>
              ) : tableViewRows.length === 0 ? (
                <p className="rcn-table-view-empty">No days have been filled in yet.</p>
              ) : (
                <div className="rcn-table-view-scroll">
                  <table className="rcn-table-view rcn-table-view--vertical">
                    <thead>
                      <tr>
                        <th className="rcn-table-view-field-header">Field</th>
                        {tableViewRows.map(({ day }) => {
                          const st  = dayStatuses[day] || STATUS.EMPTY;
                          const cfg = DAY_STATUS_CONFIG[st] || DAY_STATUS_CONFIG[STATUS.EMPTY];
                          return (
                            <th key={day} className="rcn-table-view-day-header">
                              <button
                                type="button"
                                className="rcn-table-view-goto-btn"
                                onClick={() => { setActiveDay(day); setShowTableView(false); }}
                                title="Go to this day"
                              >
                                Day {day}
                              </button>
                              <span className="rcn-table-view-day-status">
                                <span className="rcn-table-view-status-dot" style={{ background: cfg.dot }} />
                                {cfg.label}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {TABLE_VIEW_FIELD_GROUPS.map(group => (
                        <React.Fragment key={group.section}>
                          <tr className="rcn-table-view-section-row">
                            <td colSpan={tableViewRows.length + 1}>{group.section}</td>
                          </tr>
                          {group.rows.map(row => (
                            <tr key={row.key}>
                              <td className="rcn-table-view-field-cell">{row.label}</td>
                              {tableViewRows.map(({ day, data: d }) => (
                                <td key={day}>{formatTableViewValue(d, row)}</td>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ AUDIT TRAIL MODAL ══ */}
      {showAuditModal && (
        <div className="rcn-modal-overlay" onClick={() => setShowAuditModal(false)}>
          <div className="rcn-modal" onClick={e => e.stopPropagation()}>
            <div className="rcn-modal-header">
              <div className="rcn-modal-icon"><History size={18} /></div>
              <div>
                <h3 className="rcn-modal-title">Day {activeDay} History</h3>
                <p className="rcn-modal-subtitle">Every save, submit, and override for this day</p>
              </div>
              <button className="rcn-modal-close" type="button" onClick={() => setShowAuditModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="rcn-modal-body">
              {auditLoading ? (
                <div className="rcn-audit-empty">Loading…</div>
              ) : auditEntries.length === 0 ? (
                <div className="rcn-audit-empty">No history recorded for this day yet.</div>
              ) : (
                <div className="rcn-audit-list">
                  {auditEntries.map(e => (
                    <div key={e.id} className="rcn-audit-entry">
                      <div className="rcn-audit-entry-top">
                        <span className="rcn-audit-action">{(e.action || "").replace(/_/g, " ")}</span>
                        <span className="rcn-audit-time">
                          {e.created_at ? new Date(e.created_at).toLocaleString("en-GB") : ""}
                        </span>
                      </div>
                      <span className="rcn-audit-user">by {e.username || "unknown"}</span>
                      {e.new_values?.reason && (
                        <p className="rcn-audit-reason">"{e.new_values.reason}"</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ SITE-MONITOR OVERRIDE MODAL ══ */}
      {showOverrideModal && (
        <div className="rcn-modal-overlay" onClick={() => !overrideSubmitting && setShowOverrideModal(false)}>
          <div className="rcn-modal" onClick={e => e.stopPropagation()}>
            <div className="rcn-modal-header">
              <div className="rcn-modal-icon"><Unlock size={18} /></div>
              <div>
                <h3 className="rcn-modal-title">Override &amp; Unlock Day {activeDay}</h3>
                <p className="rcn-modal-subtitle">Temporarily reopens this locked day for a correction</p>
              </div>
              <button className="rcn-modal-close" type="button" onClick={() => setShowOverrideModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="rcn-modal-body">
              <p style={{ fontSize: 12.5, color: "#475569", marginTop: 0 }}>
                This reopens Day {activeDay} for 2 hours so it can be corrected. The reason below
                is saved to the audit trail.
              </p>
              <textarea
                className="rcn-override-textarea"
                placeholder="Reason for correction (required)…"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
              />
            </div>
            <div className="rcn-modal-footer">
              <button className="rcn-modal-btn rcn-modal-btn--cancel" type="button"
                onClick={() => setShowOverrideModal(false)} disabled={overrideSubmitting}>
                Cancel
              </button>
              <button
                className="rcn-modal-btn rcn-modal-btn--confirm"
                type="button"
                disabled={!overrideReason.trim() || overrideSubmitting}
                onClick={async () => {
                  setOverrideSubmitting(true);
                  try {
                    const res = await api.patch(
                      `/resp-cv-neuro/${enrollmentId}/${activeDay}/override-unlock`,
                      { reason: overrideReason.trim(), hours: 2 }
                    );
                    setOverrideUntil(res?.data?.override_unlocked_until || null);
                    // isFieldEditable also requires isEditing when isSaved is
                    // true (always true for a submitted day) — without this,
                    // the override succeeds server-side but fields still
                    // render read-only and every setter silently no-ops.
                    setIsEditing(true);
                    setOverrideReason("");
                    setShowOverrideModal(false);
                    setMessage(`🔓 Day ${activeDay} reopened for 2 hours`);
                  } catch (err) {
                    setMessage("⚠️ Could not unlock — " + (err?.response?.data?.detail || "try again"));
                  } finally {
                    setOverrideSubmitting(false);
                  }
                }}
              >
                {overrideSubmitting ? "Unlocking…" : "Unlock Day"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ STICKY FOOTER ══ */}
      <div className="form-navigation">

        {/* ← Back */}
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={handlePrevious}>
          <ArrowLeft size={15} /> FiO₂ AUC
        </button>

        {/* History — superadmin + site PI only, any day/lock state */}
        {canViewAudit && (
          <button
            type="button"
            className="rcn-history-btn"
            onClick={fetchAuditHistory}
            title={`View correction history for Day ${activeDay}`}
          >
            <History size={13}/> History
          </button>
        )}

        {/* Save — always visible when editing */}
        {isFieldEditable && (
          <button type="button" className="btn btn-save btn-outline-blue"
            onClick={handleSave}>
            <Save size={15} /> Save
          </button>
        )}

        {/* Edit button — enable editing of saved draft */}
        {isSaved && !isEditing && !isSubmitted && (
          <button
            type="button"
            className="btn btn-edit btn-outline-blue"
            onClick={() => setIsEditing(true)}
            title="Enable editing of saved data"
          >
            <Edit size={13} /> Edit Day {activeDay}
          </button>
        )}

        {/* Save for Later (draft) / manual Lock button / Locked badge —
            locking is explicit and manual only: nothing here auto-locks a
            day just because its calendar date has passed. A day stays
            editable until a user clicks "Lock" and confirms in the modal. */}
        {isOverrideActiveDay ? (
          <>
            <div className="rcn-locked-badge rcn-locked-badge--override" title="Temporarily reopened by a site monitor">
              <Unlock size={13} /> Day {activeDay} Reopened (Override)
            </div>
            {canSubmit ? (
              <button type="button" className="btn btn-lock-day" onClick={() => setShowModal(true)}
                title="Lock this day — you won't be able to edit it after confirming">
                <Lock size={15} /> Lock Day {activeDay}
              </button>
            ) : (
              <button type="button" className="btn btn-draft" onClick={handleSave}>
                <Save size={15} /> Save Correction
              </button>
            )}
          </>
        ) : isSubmitted ? (
          <>
            <div className="rcn-locked-badge">
              <Lock size={13} /> Day {activeDay} Locked
            </div>
            {isSuperadmin && (
              <button
                type="button"
                className="rcn-override-btn"
                onClick={() => setShowOverrideModal(true)}
                title="Reopen this locked day temporarily for a correction"
              >
                <Unlock size={13}/> Override &amp; Unlock
              </button>
            )}
          </>
        ) : isFutureActiveDay ? (
          <div className="rcn-locked-badge" title="Data can only be entered on the day's own calendar date">
            <Lock size={13} /> Day {activeDay} Not Available Yet
          </div>
        ) : canSubmit ? (
          <button
            type="button"
            className="btn btn-lock-day"
            onClick={() => setShowModal(true)}
            title="Lock this day — you won't be able to edit it after confirming"
          >
            <Lock size={15} /> Lock Day {activeDay}
          </button>
        ) : (
          <button type="button" className="btn btn-draft"
            onClick={handleSave}>
            <Save size={15} /> Save for Later
          </button>
        )}


        {/* Step indicator — centre */}
        <div className="footer-step-indicator">
          <span className="step-text">HELPER 2 OF 4</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment" />
            <div className="progress-segment" />
          </div>
        </div>

        {/* Next → */}
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Infect / GI / Hema <ArrowRight size={15} />
        </button>

      </div>
      <SaveSuccessModal
        open={showSaveSuccess}
        onClose={() => setShowSaveSuccess(false)}
        message={`Day ${activeDay} has been saved successfully.`}
      />
    </>
  );
}
