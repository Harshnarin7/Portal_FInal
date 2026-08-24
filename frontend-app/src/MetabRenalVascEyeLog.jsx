import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { toDateOnlyValue } from "./utils/datetime";
import "./styles/RespCVNeuro.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import SaveSuccessModal from "./components/SaveSuccessModal";
import { useRegisterActiveFormSession } from "./context/ActiveFormSessionContext";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  CheckCircle, AlertTriangle, X, Clock,
  Lock, Shield, FileCheck, Copy, Edit,
  AlertOctagon, Unlock, History, RefreshCw, Plus, Trash2,
} from "lucide-react";
import "./styles/MinimalMonitoring.css";

/* ══════════════════════════════════════════════════════
   STATUS CONSTANTS — identical to Helper Forms 2 & 3
══════════════════════════════════════════════════════ */
const STATUS = {
  EMPTY:"empty", DRAFT:"draft", PARTIAL:"partial",
  COMPLETE:"complete", SUBMITTED:"submitted", LATE:"late",
};
const DAY_STATUS_CONFIG = {
  [STATUS.EMPTY]:    { label:"Not started", color:"#CBD5E1", dot:"#CBD5E1" },
  [STATUS.DRAFT]:    { label:"Partial",     color:"#F59E0B", dot:"#F59E0B" },
  [STATUS.PARTIAL]:  { label:"Partial",     color:"#F59E0B", dot:"#F59E0B" },
  [STATUS.COMPLETE]: { label:"Complete",    color:"#10B981", dot:"#10B981" },
  [STATUS.SUBMITTED]:{ label:"Submitted",   color:"#0F4C81", dot:"#0F4C81" },
  [STATUS.LATE]:     { label:"Late",        color:"#EF4444", dot:"#EF4444" },
};
const LEGEND_ITEMS = [
  { label:"Not started", dot:"#CBD5E1" },
  { label:"Partial",     dot:"#F59E0B" },
  { label:"Complete",    dot:"#10B981" },
  { label:"Submitted",   dot:"#0F4C81" },
  { label:"Late",        dot:"#EF4444" },
];

/* Every field captured for a day, grouped by section, for the
   "All Days — Table View" modal (fields run down the rows, days
   run across the columns). Same pattern as Helper Forms 2 & 3. */
const TABLE_VIEW_FIELD_GROUPS = [
  {
    section: "Metabolic",
    rows: [
      { key: "lowest_glucose",        label: "Lowest Glucose", suffix: "mg/dL" },
      { key: "hypoglycemia_episodes", label: "Hypoglycemia Episodes" },
      { key: "hypoglycemia_rx",       label: "Hypoglycemia Rx", bool: true },
      { key: "highest_glucose",       label: "Highest Glucose", suffix: "mg/dL" },
      { key: "insulin",               label: "Hyperglycemia Rx (Insulin)", bool: true },
      { key: "metabolic_acidosis",    label: "Metabolic Acidosis", bool: true },
      { key: "sodium_value",          label: "Sodium Value", suffix: "mmol/L" },
      { key: "potassium_value",       label: "Potassium Value", suffix: "mmol/L" },
      { key: "ionized_calcium_value", label: "Ionized Calcium Value", suffix: "mmol/L" },
      { key: "osteopenia_suspected",  label: "Osteopenia Suspected", bool: true },
    ],
  },
  {
    section: "Renal",
    rows: [
      { key: "aki_suspected",         label: "AKI Suspected", bool: true },
      { key: "creatinine_value",      label: "Serum Creatinine" },
      { key: "urine_output_8am_2pm",  label: "UO 8am–2pm", suffix: " ml/kg/hr" },
      { key: "urine_output_2pm_8pm",  label: "UO 2pm–8pm", suffix: " ml/kg/hr" },
      { key: "urine_output_8pm_8am",  label: "UO 8pm–8am", suffix: " ml/kg/hr" },
      { key: "urine_output_total",    label: "Urine Output Total", suffix: " ml/kg/hr" },
      { key: "dialysis_crrt",         label: "Dialysis/CRRT", bool: true },
    ],
  },
  {
    section: "Thermoregulation",
    rows: [
      { key: "axillary_temperature",  label: "Axillary Temperature", suffix: "°C" },
    ],
  },
  {
    section: "Vascular Access",
    rows: [
      { key: "picc_in_situ",          label: "PICC In Situ", bool: true },
      { key: "uvc_in_situ",           label: "UVC In Situ", bool: true },
      { key: "uac_in_situ",           label: "UAC In Situ", bool: true },
      { key: "peripheral_iv",         label: "Peripheral IV", bool: true },
      { key: "peripheral_arterial",   label: "Peripheral Arterial", bool: true },
      { key: "extravasation_injury",  label: "Extravasation Injury", bool: true },
      { key: "line_complication",     label: "Line Complication", bool: true },
    ],
  },
  {
    section: "Ophthalmology (ROP)",
    rows: [
      { key: "rop_screening_due",     label: "ROP Screening Due", bool: true },
      { key: "rop_screened",          label: "ROP Screened", bool: true },
      { key: "rop_detected",          label: "ROP Detected", bool: true },
      { key: "rop_stage",             label: "ROP Stage" },
      { key: "plus_disease",          label: "Plus Disease", bool: true },
      { key: "rop_treatment",         label: "ROP Treatment", bool: true },
    ],
  },
  {
    section: "Location & Outcome",
    rows: [
      { key: "location",              label: "Location" },
      { key: "survived_the_day",      label: "Survived the Day", bool: true },
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
  const v = d[row.key];
  if (row.bool) return v === true ? "Yes" : v === false ? "No" : "—";
  if (v === null || v === undefined || v === "") return "—";
  return row.suffix ? `${v}${row.suffix}` : String(v);
}

/* ══════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS — identical to Helper Forms 2 & 3
══════════════════════════════════════════════════════ */
function ProgressRing({ percent }) {
  const r = 24, circ = 2 * Math.PI * r;
  return (
    <div className="rcn-ring">
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle className="rcn-ring-bg" cx="29" cy="29" r={r} />
        <circle className="rcn-ring-fill" cx="29" cy="29" r={r}
          strokeDasharray={circ}
          strokeDashoffset={circ - (percent / 100) * circ}
          style={{ transform:"rotate(-90deg)", transformOrigin:"50% 50%" }}
        />
      </svg>
      <span className="rcn-ring-text">{percent}%</span>
    </div>
  );
}

function YNRow({ label, value, onChange, disabled }) {
  return (
    <div className="rcn-yn-row">
      <span className="rcn-yn-label">{label}</span>
      <div className="rcn-yn">
        <button type="button"
          className={`rcn-yn-btn rcn-yn-yes${value === true ? " rcn-yn-active-yes" : ""}`}
          onClick={() => !disabled && onChange(value === true ? null : true)}
          disabled={disabled}>Yes</button>
        <button type="button"
          className={`rcn-yn-btn rcn-yn-no${value === false ? " rcn-yn-active-no" : ""}`}
          onClick={() => !disabled && onChange(value === false ? null : false)}
          disabled={disabled}>No</button>
      </div>
    </div>
  );
}

function NumRow({ label, value, onChange, disabled, unit, placeholder="0" }) {
  return (
    <div className="rcn-yn-row">
      <span className="rcn-yn-label">{label}</span>
      <div className="rcn-num-input" style={{ width:160 }}>
        <input type="number" min="0" step="0.01"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={e => !disabled && onChange(e.target.value === "" ? null : Number(e.target.value))}
          readOnly={disabled}
        />
        {unit && <span className="rcn-num-unit">{unit}</span>}
      </div>
    </div>
  );
}

/** Text/numeric row for creatinine — accepts number | "Not Tested" | "Awaited". */
function GlucoseTextRow({ label, value, onChange, disabled, unit, autofilled, placeholder = "—" }) {
  return (
    <div className={`rcn-yn-row${autofilled ? " rcn-autofilled-row" : ""}`}>
      <span className="rcn-yn-label">
        {label}
        {autofilled && <span className="rcn-autofill-tag">Auto-filled from Helper 5</span>}
      </span>
      <div className={`rcn-num-input${autofilled ? " rcn-num-input--autofill" : ""}`} style={{ width: 180 }}>
        <input
          type="text"
          value={value ?? ""}
          onChange={e => !disabled && onChange(e.target.value === "" ? null : e.target.value)}
          readOnly={disabled}
          placeholder={placeholder}
        />
        {unit && <span className="rcn-num-unit">{unit}</span>}
      </div>
    </div>
  );
}

/** Display-only autofill field (#1/#2/#4) — never a free-text input. */
function ReadonlyAutoField({ label, value, unit, autofilled }) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className={`rcn-yn-row${autofilled ? " rcn-autofilled-row" : ""}`}>
      <span className="rcn-yn-label">
        {label}
        {autofilled && <span className="rcn-autofill-tag">Auto-filled from Helper 5</span>}
      </span>
      <div className={`rcn-readonly-value${autofilled ? " rcn-num-input--autofill" : ""}`}>
        {display}{unit && display !== "—" ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

const pad2 = n => String(n).padStart(2, "0");
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function blankReading(extra = {}) {
  const d = new Date();
  return { id: uid(), date: toDateOnlyValue(d), time: nowTime(d), ...extra };
}

function parseJsonArray(raw) {
  if (!raw) return null;
  try {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(p) && p.length ? p : null;
  } catch (_) {
    return null;
  }
}

/** Summary for electrolyte columns: most recent non-empty value. */
function latestReadingSummary(readings, valueKey = "value") {
  if (!Array.isArray(readings)) return null;
  for (let i = readings.length - 1; i >= 0; i--) {
    const v = readings[i]?.[valueKey];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return null;
}

function deriveMetabolicAcidosis(readings) {
  if (!Array.isArray(readings) || !readings.length) return null;
  let any = false;
  for (const r of readings) {
    if (r?.ph === "" || r?.ph == null) continue;
    const n = Number(r.ph);
    if (!Number.isFinite(n)) continue;
    any = true;
    if (n < 7.2) return true;
  }
  return any ? false : null;
}

function isNumericHighGlucose(v) {
  if (v == null || v === "" || v === "Not Tested" || v === "Not High" || v === "Not Low") return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 180;
}

function computeUrineTotal(a, b, c) {
  const nums = [a, b, c]
    .map(v => (v === null || v === undefined || v === "" ? null : Number(v)))
    .filter(n => Number.isFinite(n));
  if (!nums.length) return null;
  const sum = nums.reduce((s, n) => s + n, 0);
  return String(Math.round(sum * 1000) / 1000);
}

function migrateAkiFromLegacy(d) {
  // KDIGO stage is no longer captured on this form (removed) — this only
  // derives aki_suspected, including from older rows that pre-date the
  // aki_suspected/aki_stage split and only had a combined "N"/"Stage X" value.
  if (d.aki_suspected === true || d.aki_suspected === false) {
    return { aki_suspected: d.aki_suspected };
  }
  if (d.aki_stage === "N") return { aki_suspected: false };
  if (d.aki_stage && String(d.aki_stage).startsWith("Stage")) {
    return { aki_suspected: true };
  }
  return { aki_suspected: null };
}

/** Helper-5-style multi-entry block (date/time + value field(s)). */
function ReadingsBlock({
  code, entries, onChangeEntry, onAdd, onRemove, disabled, blankFactory, children,
}) {
  const list = entries?.length ? entries : [blankFactory ? blankFactory() : blankReading()];
  return (
    <div className="rcn-subsection mml-subblock">
      <div className="mml-subblock-head">
        <span className="mml-subblock-code">{code}</span>
      </div>
      {list.map((entry, idx) => (
        <div className="mml-entry" key={entry.id || idx}>
          <div className="mml-entry-head">
            <div className="mml-entry-meta">
              {list.length > 1 && <span className="mml-entry-badge">#{idx + 1}</span>}
              <label className="mml-meta-field">
                <span>Date</span>
                <input type="date" className="rcn-text-input mml-date-input" value={entry.date || ""}
                  disabled={disabled} onChange={e => onChangeEntry(idx, "date", e.target.value)} />
              </label>
              <label className="mml-meta-field">
                <span>Time</span>
                <input type="time" className="rcn-text-input mml-time-input" value={entry.time || ""}
                  disabled={disabled} onChange={e => onChangeEntry(idx, "time", e.target.value)} />
              </label>
            </div>
            {list.length > 1 && !disabled && (
              <button type="button" className="mml-remove-btn" title="Remove this reading"
                onClick={() => onRemove(idx)}><Trash2 size={14} /></button>
            )}
          </div>
          <div className="rcn-grid-3">{children(entry, idx)}</div>
        </div>
      ))}
      {!disabled && (
        <button type="button" className="mml-add-btn"
          onClick={() => onAdd(blankFactory ? blankFactory() : blankReading())}>
          <Plus size={14} /> Add values
        </button>
      )}
    </div>
  );
}

function SectionCard({ iconEmoji, title, answered, total, children, defaultOpen=true, headerAction=null }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="rcn-card">
      <div className="rcn-card-header" onClick={() => setOpen(o => !o)}>
        <div className="rcn-card-header-left">
          <div className="rcn-card-icon-wrap">
            <span className="rcn-card-emoji">{iconEmoji}</span>
          </div>
          <h3 className="rcn-card-title">{title}</h3>
          {headerAction && (
            <div className="rcn-card-header-action" onClick={e => e.stopPropagation()}>
              {headerAction}
            </div>
          )}
        </div>
        <div className="rcn-card-header-right">
          <div className="rcn-card-prog-bar">
            <div className="rcn-card-prog-fill" style={{ width:`${pct}%` }} />
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

/* ── Helper 5 → Helper 4 glucose autofill ─────────────────────────
   Form 5 met_a[].glucose → Form 4 fields #1, #2, #4.
   Boundaries: <45 low, 45–180 normal, >180 high (inclusive normal). */
const GLUCOSE_LOW_MAX = 45;
const GLUCOSE_HIGH_MIN = 180;

function parseMetAGlucoseReadings(payload) {
  let entries = payload?.entries_json;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); } catch (_) { entries = null; }
  }
  const list = entries?.met_a;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const row of list) {
    const raw = row?.glucose;
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out.push(n);
  }
  return out;
}

function computeGlucoseAutofill(readings) {
  if (!readings.length) {
    return {
      lowest_glucose: "Not Tested",
      hypoglycemia_episodes: 0,
      highest_glucose: "Not Tested",
    };
  }
  const lows = readings.filter(v => v < GLUCOSE_LOW_MAX);
  const highs = readings.filter(v => v > GLUCOSE_HIGH_MIN);
  return {
    lowest_glucose: lows.length
      ? String(Math.min(...lows))
      : "Not Low",
    hypoglycemia_episodes: lows.length,
    highest_glucose: highs.length
      ? String(Math.max(...highs))
      : "Not High",
  };
}

function isEmptyMetabField(v) {
  return v === null || v === undefined || v === "";
}

const listToString = v => Array.isArray(v) ? v.join(",") : (v || "");
const stringToList = v => Array.isArray(v) ? v : String(v || "").split(",").map(s => s.trim()).filter(Boolean);

/* Grade/Stage selection cards — same pattern as IVH Grade in Helper Form 2 */
function StageCards({ options, value, onChange, disabled }) {
  return (
    <div className="rcn-grade-grid">
      {options.map(opt => (
        <div key={opt}
          className={`rcn-grade-card${value === opt ? " rcn-grade-card--on" : ""}${disabled ? " rcn-grade-card--disabled" : ""}`}
          onClick={() => !disabled && onChange(value === opt ? null : opt)}>
          <span className="rcn-grade-roman">{opt}</span>
          <span className="rcn-grade-label">Stage</span>
        </div>
      ))}
    </div>
  );
}

/* Multi-select pills (Dyselectrolytemia type) */
function PillMulti({ options, value=[], onChange, disabled }) {
  const toggle = (opt) => {
    if (disabled) return;
    const next = value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt];
    onChange(next);
  };
  return (
    <div className="rcn-pills">
      {options.map(opt => (
        <button key={opt} type="button"
          className={`rcn-pill${value.includes(opt) ? " rcn-pill--on" : ""}`}
          onClick={() => toggle(opt)} disabled={disabled}>
          {opt}
        </button>
      ))}
    </div>
  );
}

/* Single-select pills (e.g. Location) */
function PillSingle({ options, value, onChange, disabled }) {
  return (
    <div className="rcn-pills">
      {options.map(opt => (
        <button key={opt} type="button"
          className={`rcn-pill${value === opt ? " rcn-pill--on" : ""}`}
          onClick={() => !disabled && onChange(value === opt ? null : opt)}
          disabled={disabled}>
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   HELPER FUNCTIONS FOR GESTATION
══════════════════════════════════════════════════════ */
const totalGestationDays = (weeks, days) => {
  if (weeks === null || weeks === undefined || weeks === "") return null;
  if (days === null || days === undefined || days === "") return null;
  const w = Number(weeks);
  const d = Number(days);
  return Number.isNaN(w) || Number.isNaN(d) ? null : w * 7 + d;
};

const formatGestation = (weeks, days) =>
  weeks !== null && weeks !== undefined && weeks !== "" ? `${weeks}+${days ?? 0} wks` : "";

function SubmitModal({ day, completionPct, onConfirm, onCancel, submitting }) {
  return (
    <div className="rcn-modal-overlay">
      <div className="rcn-modal">
        <div className="rcn-modal-header">
          <div className="rcn-modal-icon"><FileCheck size={22} /></div>
          <div>
            <h3 className="rcn-modal-title">Submit Day {day} Data</h3>
            <p className="rcn-modal-subtitle">This will lock the record for Day {day}</p>
          </div>
          <button className="rcn-modal-close" onClick={onCancel} type="button"><X size={18} /></button>
        </div>
        <div className="rcn-modal-body">
          <div className="rcn-modal-checklist">
            <div className={`rcn-modal-check ${completionPct===100 ? "rcn-modal-check--ok" : "rcn-modal-check--warn"}`}>
              {completionPct===100 ? <CheckCircle size={15}/> : <AlertTriangle size={15}/>}
              <span>{completionPct===100 ? "All fields completed (100%)" : `${completionPct}% complete — some fields unanswered`}</span>
            </div>
            <div className="rcn-modal-check rcn-modal-check--ok">
              <CheckCircle size={15}/><span>Nurse data entry saved</span>
            </div>
            <div className="rcn-modal-check rcn-modal-check--info">
              <Lock size={15}/><span>After submission, nurses cannot edit this day</span>
            </div>
          </div>
          {completionPct < 100 && (
            <div className="rcn-modal-warning">
              <AlertTriangle size={14}/>
              <span>Submitting with incomplete data. Ensure missing fields are clinically not applicable before proceeding.</span>
            </div>
          )}
        </div>
        <div className="rcn-modal-footer">
          <button className="rcn-modal-btn rcn-modal-btn--cancel" onClick={onCancel} type="button" disabled={submitting}>Cancel</button>
          <button className="rcn-modal-btn rcn-modal-btn--submit" onClick={onConfirm} type="button" disabled={submitting}>
            {submitting ? "Submitting…" : <><Shield size={14}/> Confirm &amp; Submit</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyDayModal({ activeDay, availableDays, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="rcn-modal-overlay">
      <div className="rcn-modal">
        <div className="rcn-modal-header">
          <div className="rcn-modal-icon" style={{ background:"#EFF6FF", color:"#0F4C81" }}>
            <Copy size={22}/>
          </div>
          <div>
            <h3 className="rcn-modal-title">Copy from Previous Day</h3>
            <p className="rcn-modal-subtitle">Pre-fill Day {activeDay} with data from an earlier day</p>
          </div>
          <button className="rcn-modal-close" onClick={onCancel} type="button"><X size={18}/></button>
        </div>
        <div className="rcn-modal-body">
          <p className="rcn-copy-hint">Select the day to copy from:</p>
          <div className="rcn-copy-day-grid">
            {availableDays.map(d => (
              <button key={d} type="button"
                className={`rcn-copy-day-btn${selected===d ? " rcn-copy-day-btn--on" : ""}`}
                onClick={() => setSelected(d)}>
                <span className="rcn-copy-day-num">Day {d}</span>
              </button>
            ))}
          </div>
          {availableDays.length === 0 && <div className="rcn-copy-empty">No previous days with saved data found.</div>}
        </div>
        <div className="rcn-modal-footer">
          <button className="rcn-modal-btn rcn-modal-btn--cancel" onClick={onCancel} type="button">Cancel</button>
          <button className="rcn-modal-btn rcn-modal-btn--submit"
            style={{ background: selected ? "linear-gradient(135deg,#0F4C81,#1A5F9E)" : undefined }}
            onClick={() => selected && onConfirm(selected)} disabled={!selected} type="button">
            <Copy size={14}/> Copy Day {selected || "—"}
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

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function MetabRenalVascEyeLog() {
  const { enrollmentId } = useParams();
  const navigate         = useNavigate();
  const { markFormCompleted, unmarkFormCompleted } = useFormProgress();
  const { patientData }  = usePatient();
  const { user }         = useAuth();
  const userRole         = user?.role || "site_user";
  const isSuperadmin     = (userRole || "").toLowerCase() === "superadmin";

  /* ── UI state ── */
  const [activeDay, setActiveDay]         = useState(1);
  // Paper CRF shows NICU days 1–31
  const [totalDays, setTotalDays]         = useState(31);
  // Day 1 date — manually entered, drives all day date labels.
  // NOT auto-filled from birth date. User manually sets in helper form.
  const [day1Date, setDay1Date] = useState(() =>
    enrollmentId ? (localStorage.getItem(`mrve_day1_${enrollmentId}`) || "") : ""
  );
  const [completedDays, setCompletedDays] = useState([]);
  const [dayStatuses, setDayStatuses]     = useState({});
  const [dayMeta, setDayMeta]             = useState({});
  const [dischargeDay, setDischargeDay]   = useState(null);
  const [isSaved, setIsSaved]             = useState(false);
  const [isEditing, setIsEditing]         = useState(false);
  const [message, setMessage]             = useState("");
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [loading, setLoading]             = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [savedAt, setSavedAt]             = useState(null);
  const [savedBy, setSavedBy]             = useState("");
  const [submittedAt, setSubmittedAt]     = useState(null);
  const [submittedBy, setSubmittedBy]     = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceDay, setCopySourceDay] = useState([]);

  /* ── All-days table view ── */
  const [showTableView, setShowTableView]   = useState(false);
  const [tableViewRows, setTableViewRows]   = useState([]);
  const [tableViewLoading, setTableViewLoading] = useState(false);

  /* ── Day 1 Date — backend-synced lock state ── */
  const [day1DateLockedRemote, setDay1DateLockedRemote] = useState(false);
  const [day1DateSetBy, setDay1DateSetBy]     = useState("");
  const [day1EditArmed, setDay1EditArmed]     = useState(false); // superadmin explicit unlock

  /* ── Site-monitor override ── */
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason]       = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideUntil, setOverrideUntil]          = useState(null);

  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    babyUid:"",
    babyName:"",
    motherName:"",
    gestationalAge:"",
    gestationSource:"",
    admissionDate:"",
    dischargeDate:"",
    status:"In NICU",
  });

  /* ═══════════════════════════════════════
     SECTION STATES
  ═══════════════════════════════════════ */

  // ⚡ METABOLIC (4.1, items 1-10)
  const [metabData, setMetabData] = useState({
    lowest_glucose:         null, // #1 autofill
    hypoglycemia_episodes:  null, // #2 autofill
    hypoglycemia_rx:        null, // #3 gated
    highest_glucose:        null, // #4 autofill
    insulin:                null, // #5 gated hyper Rx
    metabolic_acidosis:     null, // #6 derived from ph_readings
    sodium_value:           null, // #7 summary
    potassium_value:        null, // #8 summary
    ionized_calcium_value:  null, // #9 summary
    osteopenia_suspected:   null, // #10
    ph_readings:            [blankReading({ ph: "" })],
    sodium_readings:        [blankReading({ value: "" })],
    potassium_readings:     [blankReading({ value: "" })],
    calcium_readings:       [blankReading({ value: "" })],
  });
  // Tracks which of #1/#2/#4 still show the Helper-5 autofill badge (cleared on manual edit).
  const [glucoseAutofilled, setGlucoseAutofilled] = useState({
    lowest_glucose: false,
    hypoglycemia_episodes: false,
    highest_glucose: false,
  });
  const [glucoseRefreshing, setGlucoseRefreshing] = useState(false);
  const glucoseAutoDoneRef = useRef(null);

  // 💧 RENAL (4.2, items 11-14)
  const [renalData, setRenalData] = useState({
    aki_suspected:          null, // #11 Yes/No
    creatinine_value:       null, // #12 string | Not Tested | Awaited
    urine_output_8am_2pm:   null,
    urine_output_2pm_8pm:   null,
    urine_output_8pm_8am:   null,
    urine_output_total:     null, // derived sum
    dialysis_crrt:          null, // #14
  });

  // 🌡️ THERMOREGULATION (4.3, item 15)
  const [thermoData, setThermoData] = useState({
    axillary_temperature:   null, // #15
  });

  // 📍 LOCATION & OUTCOME (4.6, 4.7)
  const [tailData, setTailData] = useState({
    location:               [], // DR, NICU, Step-down/Nursery, KMC-N, Other — multi-select
    survived_the_day:       null,
  });

  // 🩺 VASCULAR ACCESS
  const [vascData, setVascData] = useState({
    picc_in_situ:          null,
    uvc_in_situ:           null,
    uac_in_situ:           null,
    peripheral_iv:         null,
    peripheral_arterial:   null,
    extravasation_injury:  null,
    line_complication:     null,
  });

  // 👁️ OPHTHALMOLOGY
  const [eyeData, setEyeData] = useState({
    rop_screening_due:     null,
    rop_screened:          null,
    rop_detected:          null,
    rop_stage:             null, // "1"–"5"
    plus_disease:          null,
    rop_treatment:         null,
  });

  /* ── Visibility flags ── */
  const ropYes      = eyeData.rop_detected        === true;

  /* ── Calendar-based day locking ──
     todayNicuDay = which NICU day number corresponds to the real
     device date, given day1Date (manually entered Day 1 Date).
     Days after it are "future" (no data allowed yet); days before
     it are "past" (view-only, even if never submitted).

     IMPORTANT: day1Date is NOT the birth date - it's the manually
     entered "Day 1 Date" in the helper form, which may be different
     from the actual date of birth. */
  const todayNicuDay = useMemo(() => {
    if (!day1Date) return null;
    const base = new Date(day1Date + "T00:00:00");
    if (isNaN(base.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    base.setHours(0, 0, 0, 0);
    return Math.floor((today - base) / 86400000) + 1;
  }, [day1Date]);

  /** Calendar date for the open NICU day (day1Date + activeDay − 1). */
  const activeDayDate = useMemo(() => {
    if (!day1Date) return null;
    const base = new Date(day1Date + "T00:00:00");
    if (isNaN(base.getTime())) return null;
    base.setDate(base.getDate() + activeDay - 1);
    return toDateOnlyValue(base);
  }, [day1Date, activeDay]);

  /** Autofill only when Form 4 is on today's actual calendar date (Form 5 has no history). */
  const isActiveDayToday = useMemo(() => {
    if (!activeDayDate) return false;
    return activeDayDate === toDateOnlyValue(new Date());
  }, [activeDayDate]);

  const isFutureActiveDay = todayNicuDay != null && activeDay > todayNicuDay;
  const isPastActiveDay   = todayNicuDay != null && activeDay < todayNicuDay;
  // Complete by 11:00 AM — yesterday stays editable until then so night
  // shift can finish the prior day (aligned with Helper Forms 2 & 3).
  const MRVE_LATE_GRACE_HOUR = 11;
  const isLateGraceActiveDay =
    todayNicuDay != null && activeDay === todayNicuDay - 1 &&
    new Date().getHours() < MRVE_LATE_GRACE_HOUR;
  // Site-monitor override reopens an otherwise-locked day for a limited window.
  const isOverrideActiveDay =
    overrideUntil != null && new Date() < parseUtcTimestamp(overrideUntil);

  // Default which day's tab opens on first load: before 11am, default to
  // yesterday's (still-open) day; from 11am on, default to today's day.
  // Runs once, so it never fights the nurse's own tab clicks afterward.
  const initialDaySetRef = useRef(false);
  useEffect(() => {
    if (initialDaySetRef.current || todayNicuDay == null) return;
    initialDaySetRef.current = true;
    const beforeGrace = new Date().getHours() < MRVE_LATE_GRACE_HOUR;
    const defaultDay = (beforeGrace && todayNicuDay - 1 >= 1) ? todayNicuDay - 1 : todayNicuDay;
    setActiveDay(defaultDay);
  }, [todayNicuDay]);

  const isSubmitted     = (dayStatuses[activeDay] || STATUS.EMPTY) === STATUS.SUBMITTED;
  const isFieldEditable =
    // Day 1 Date is mandatory — nurses must set it before any daily field
    // can be filled in, so it's no longer possible to save Day 1 (or any
    // day) data and forget the date. See handleSave for the same guard on
    // the actual save call (independent of `force`).
    !!day1Date &&
    (!isSubmitted || isOverrideActiveDay) &&
    (!isSaved || isEditing) &&
    !isFutureActiveDay &&
    // Same fix as Helper Forms 2/3: a past day's window has closed unless
    // it's in the late-entry grace period or a superadmin override reopened
    // it. Without this, fields/Save stayed live on any locked past day.
    (!isPastActiveDay || isLateGraceActiveDay || isOverrideActiveDay);

  // Day 1 Date drives every day's calendar label and the future/past
  // lock above, so once any daily data exists it must stop moving.
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
    if (now.getHours() < MRVE_LATE_GRACE_HOUR) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { min: toDateOnlyValue(yesterday), max: todayStr };
    }
    return { min: todayStr, max: todayStr };
  }, []);

  /* ═══════════════════════════════════════
     PROGRESS — hidden fields excluded
  ═══════════════════════════════════════ */
  const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

  // Metabolic: gated #3/#5; #6–#9 answered via derived/summary values from readings
  const hypoEpisodesNum = (() => {
    const v = metabData.hypoglycemia_episodes;
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  })();
  const hypoRxRequired = hypoEpisodesNum > 0;
  const hyperRxRequired = isNumericHighGlucose(metabData.highest_glucose);
  const extravasationRequired =
    vascData.peripheral_iv === true || vascData.peripheral_arterial === true;
  const ropDue = eyeData.rop_screening_due === true;
  const ropScreenedYes = eyeData.rop_screened === true;

  const METAB_BASE = [
    "lowest_glucose", "hypoglycemia_episodes",
    ...(hypoRxRequired ? ["hypoglycemia_rx"] : []),
    "highest_glucose",
    ...(hyperRxRequired ? ["insulin"] : []),
    "metabolic_acidosis",
    "sodium_value", "potassium_value", "ionized_calcium_value",
    "osteopenia_suspected",
  ];
  const metabTotal   = METAB_BASE.length;
  const metabAnswered= METAB_BASE.filter(k => ans(metabData[k])).length;

  // Renal: #11 Yes/No, #12 creatinine_value, #13 any urine window, #14
  const RENAL_KEYS = [
    "aki_suspected",
    "creatinine_value",
    "urine_output_total",
    "dialysis_crrt",
  ];
  const urineAnswered =
    ans(renalData.urine_output_8am_2pm)
    || ans(renalData.urine_output_2pm_8pm)
    || ans(renalData.urine_output_8pm_8am)
    || ans(renalData.urine_output_total);
  const renalTotal = RENAL_KEYS.length;
  const renalAnswered = RENAL_KEYS.filter(k => {
    if (k === "urine_output_total") return urineAnswered;
    return ans(renalData[k]);
  }).length;

  // Thermoregulation: 1 field (item 15)
  const THERMO_KEYS    = ["axillary_temperature"];
  const thermoTotal    = THERMO_KEYS.length;
  const thermoAnswered = THERMO_KEYS.filter(k => ans(thermoData[k])).length;

  // Vascular: #21 gated on #19 or #20 Yes
  const VASC_KEYS = [
    "picc_in_situ", "uvc_in_situ", "uac_in_situ",
    "peripheral_iv", "peripheral_arterial",
    ...(extravasationRequired ? ["extravasation_injury"] : []),
    "line_complication",
  ];
  const vascTotal    = VASC_KEYS.length;
  const vascAnswered = Math.min(VASC_KEYS.filter(k => ans(vascData[k])).length, vascTotal);

  // Eye: #24 gated on #23 Yes; #25 gated on #24 Yes
  const EYE_BASE = [
    "rop_screening_due",
    ...(ropDue ? ["rop_screened"] : []),
    ...(ropDue && ropScreenedYes ? ["rop_detected"] : []),
  ];
  const eyeTotal  = EYE_BASE.length;
  const eyeAnswered = Math.min(EYE_BASE.filter(k => ans(eyeData[k])).length, eyeTotal);

  // Location & Survived the day: 2 fields (4.6, 4.7)
  const TAIL_KEYS    = ["location","survived_the_day"];
  const tailTotal    = TAIL_KEYS.length;
  const tailAnswered = TAIL_KEYS.filter(k => ans(tailData[k])).length;

  const totalAnswered = metabAnswered + renalAnswered + thermoAnswered + vascAnswered + eyeAnswered + tailAnswered;
  const totalFields   = metabTotal + renalTotal + thermoTotal + vascTotal + eyeTotal + tailTotal;
  const completionPct = totalFields > 0 ? Math.min(100, Math.round((totalAnswered / totalFields) * 100)) : 0;
  const canSubmit     = completionPct === 100 && !isSubmitted;

  /* ── Setters ── */
  const setMetab = (k, v) => {
    if (!isFieldEditable) return;
    setMetabData(p => {
      const next = { ...p, [k]: v };
      if (k === "hypoglycemia_episodes") {
        const n = v === null || v === undefined || v === "" ? 0 : Number(v);
        if (!Number.isFinite(n) || n <= 0) next.hypoglycemia_rx = null;
      }
      if (k === "highest_glucose" && !isNumericHighGlucose(v)) next.insulin = null;
      return next;
    });
  };

  const updateReadingList = (listKey, valueKey, updater) => {
    if (!isFieldEditable) return;
    setMetabData(p => {
      const list = [...(p[listKey] || [])];
      const nextList = updater(list);
      const next = { ...p, [listKey]: nextList };
      if (listKey === "ph_readings") {
        next.metabolic_acidosis = deriveMetabolicAcidosis(nextList);
      } else if (listKey === "sodium_readings") {
        next.sodium_value = latestReadingSummary(nextList, valueKey);
      } else if (listKey === "potassium_readings") {
        next.potassium_value = latestReadingSummary(nextList, valueKey);
      } else if (listKey === "calcium_readings") {
        next.ionized_calcium_value = latestReadingSummary(nextList, valueKey);
      }
      return next;
    });
  };

  const setReadingField = (listKey, idx, key, value, valueKey = "value") => {
    updateReadingList(listKey, valueKey, list => {
      const next = [...list];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };
  const addReading = (listKey, blank, valueKey = "value") => {
    updateReadingList(listKey, valueKey, list => [...(list.length ? list : []), blank]);
  };
  const removeReading = (listKey, idx, valueKey = "value") => {
    updateReadingList(listKey, valueKey, list => {
      if (list.length <= 1) return list;
      const next = [...list];
      next.splice(idx, 1);
      return next;
    });
  };

  const setRenal = (k, v) => {
    if (!isFieldEditable) return;
    setRenalData(p => {
      const next = { ...p, [k]: v };
      if (
        k === "urine_output_8am_2pm"
        || k === "urine_output_2pm_8pm"
        || k === "urine_output_8pm_8am"
      ) {
        next.urine_output_total = computeUrineTotal(
          k === "urine_output_8am_2pm" ? v : p.urine_output_8am_2pm,
          k === "urine_output_2pm_8pm" ? v : p.urine_output_2pm_8pm,
          k === "urine_output_8pm_8am" ? v : p.urine_output_8pm_8am,
        );
      }
      return next;
    });
  };
  const setThermo= (k, v) => isFieldEditable && setThermoData(p => ({ ...p, [k]: v }));
  const setVasc  = (k, v) => {
    if (!isFieldEditable) return;
    setVascData(p => {
      const next = { ...p, [k]: v };
      const iv = k === "peripheral_iv" ? v : next.peripheral_iv;
      const art = k === "peripheral_arterial" ? v : next.peripheral_arterial;
      if (iv !== true && art !== true) next.extravasation_injury = null;
      return next;
    });
  };
  const setEye = (k, v) => {
    if (!isFieldEditable) return;
    setEyeData(p => {
      const next = { ...p, [k]: v };
      if (k === "rop_screening_due" && v !== true) {
        next.rop_screened = null;
        next.rop_detected = null;
        next.rop_stage = null;
        next.plus_disease = null;
        next.rop_treatment = null;
      }
      if (k === "rop_screened" && v !== true) {
        next.rop_detected = null;
        next.rop_stage = null;
        next.plus_disease = null;
        next.rop_treatment = null;
      }
      if (k === "rop_detected" && v !== true) {
        next.rop_stage = null;
        next.plus_disease = null;
        next.rop_treatment = null;
      }
      return next;
    });
  };
  const setTail  = (k, v) => isFieldEditable && setTailData(p => ({ ...p, [k]: v }));

  /* ── Glucose autofill from Helper Form 5 (today's sheet only) ── */
  const metabDataRef = useRef(metabData);
  metabDataRef.current = metabData;

  const applyGlucoseAutofill = async ({ force = false, seed = null } = {}) => {
    if (!enrollmentId || !isActiveDayToday || !activeDayDate) return false;
    try {
      const res = await api.get(`/minimal-monitoring/${enrollmentId}/today`, {
        params: { boundary_hour: 8 },
      });
      const data = res?.data || {};
      // Form 5 may still be on yesterday before 8am — don't pull the wrong day.
      if (data.record_date && data.record_date !== activeDayDate) return false;

      const computed = computeGlucoseAutofill(parseMetAGlucoseReadings(data));
      const base = seed || metabDataRef.current;
      const next = { ...base };
      const flags = {
        lowest_glucose: false,
        hypoglycemia_episodes: false,
        highest_glucose: false,
      };
      for (const key of ["lowest_glucose", "hypoglycemia_episodes", "highest_glucose"]) {
        if (force || isEmptyMetabField(base[key])) {
          next[key] = computed[key];
          flags[key] = true;
        }
      }
      const ep = Number(next.hypoglycemia_episodes);
      if (!Number.isFinite(ep) || ep <= 0) next.hypoglycemia_rx = null;
      if (!isNumericHighGlucose(next.highest_glucose)) next.insulin = null;

      setMetabData(next);
      setGlucoseAutofilled(prev => ({
        lowest_glucose: flags.lowest_glucose ? true : (force ? false : prev.lowest_glucose),
        hypoglycemia_episodes: flags.hypoglycemia_episodes ? true : (force ? false : prev.hypoglycemia_episodes),
        highest_glucose: flags.highest_glucose ? true : (force ? false : prev.highest_glucose),
      }));
      return Object.values(flags).some(Boolean);
    } catch (_) {
      return false;
    }
  };

  const handleRefreshGlucoseFromHelper5 = async () => {
    if (!isActiveDayToday || !isFieldEditable) return;
    setGlucoseRefreshing(true);
    try {
      const ok = await applyGlucoseAutofill({ force: true });
      setMessage(ok
        ? "✅ Glucose fields refreshed from Helper 5"
        : "⚠️ No matching Helper 5 glucose sheet for today");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setGlucoseRefreshing(false);
    }
  };

  /* ── Load patient info ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
      // Day 1 Date — backend is source of truth (shared across
      // devices/nurses); localStorage is kept only as an instant-paint cache.
      try {
        const d1Res = await api.get(`/nicu-admission/${enrollmentId}/day1-date`);
        const d1 = d1Res?.data || {};
        setDay1DateLockedRemote(!!d1.locked);
        setDay1DateSetBy(d1.day1_date_set_by || "");
        if (d1.day1_date) {
          setDay1Date(d1.day1_date);
          localStorage.setItem(`mrve_day1_${enrollmentId}`, d1.day1_date);
        }
      } catch (_) {
        // Endpoint optional / older backend — fall back to localStorage
      }

      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = res?.data || {};
        
        // Load gestation with NBS correction check (same logic as FiO2 form)
        let gestWeeks = b?.gestation_weeks;
        let gestDays = b?.gestation_days ?? 0;
        let gestSource = b?.gestation_source || "Form B";

        try {
          const dRes = await api.get(`/postnatal-day1/${enrollmentId}`);
          const d = dRes?.data || {};
          const originalWeeks = b?.original_gestation_weeks ?? b?.gestation_weeks;
          const originalDays = b?.original_gestation_days ?? b?.gestation_days ?? 0;
          const originalTotal = totalGestationDays(originalWeeks, originalDays);
          const nbsTotal = totalGestationDays(d?.gestation_weeks, d?.gestation_days);
          const useNbs = d?.ga_method === "NBS" && nbsTotal !== null && (
            originalTotal === null || Math.abs(nbsTotal - originalTotal) > 14
          );
          if (useNbs) {
            gestWeeks = d.gestation_weeks;
            gestDays = d.gestation_days ?? 0;
            gestSource = "Form D NBS";
          }
        } catch (_) {
          // Form D not available or no NBS correction — use Form B values
        }

        const ga = formatGestation(gestWeeks, gestDays);

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
          ...prev, enrollmentId,
          babyUid: b.baby_uid || "", 
          gestationalAge: ga,
          gestationSource: gestSource,
          admissionDate: b.date_of_birth || "",
          dischargeDate: b.discharge_date || "",
          status: b.discharge_date ? "Discharged" : "In NICU",
        }));
        // Don't auto-fill Day 1 date from birth date
        // User must manually set it in the helper form
        // Keep active day at 1 (user manually selects which day to fill)
        setTotalDays(maxDay);
      } catch (_) {}

      // Load PII — mother_first_name, mother_surname, baby_name
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

      // Load summary
      try {
        const summRes = await api.get(`/metab-renal-vasc-eye/${enrollmentId}/summary`);
        const sums = summRes?.data || [];
        const newSt = {}, newMeta = {};
        sums.forEach(s => {
          newSt[s.nicu_day]   = s.submission_status || STATUS.DRAFT;
          newMeta[s.nicu_day] = { pct: s.completion_pct || 0, savedAt: s.saved_at };
        });
        setDayStatuses(newSt); setDayMeta(newMeta);
        const maxDay = sums.reduce((m, s) => Math.max(m, s.nicu_day || 0), 0);
        if (maxDay > 31) setTotalDays(maxDay);
      } catch (_) {}
    };
    load();
  }, [enrollmentId]);

  /* ── Load day data ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const loadDay = async () => {
      setLoading(true);
      glucoseAutoDoneRef.current = null;
      setGlucoseAutofilled({
        lowest_glucose: false,
        hypoglycemia_episodes: false,
        highest_glucose: false,
      });
      let loadedMetab = null;
      try {
        const res = await api.get(`/metab-renal-vasc-eye/${enrollmentId}/${activeDay}`);
        const d = res?.data || {};
        if (d && Object.keys(d).length > 0) {
          const aki = migrateAkiFromLegacy(d);
          const phReadings = parseJsonArray(d.ph_readings_json) || [blankReading({ ph: "" })];
          const naReadings = parseJsonArray(d.sodium_readings_json) || [blankReading({ value: "" })];
          const kReadings = parseJsonArray(d.potassium_readings_json) || [blankReading({ value: "" })];
          const caReadings = parseJsonArray(d.calcium_readings_json) || [blankReading({ value: "" })];
          const creatVal = d.creatinine_value
            ?? (d.creatinine != null && d.creatinine !== "" ? String(d.creatinine) : null);
          loadedMetab = {
            lowest_glucose:         d.lowest_glucose         ?? null,
            hypoglycemia_episodes:  d.hypoglycemia_episodes  ?? null,
            hypoglycemia_rx:        d.hypoglycemia_rx        ?? null,
            highest_glucose:        d.highest_glucose        ?? null,
            insulin:                d.insulin                ?? null,
            metabolic_acidosis:     d.metabolic_acidosis ?? deriveMetabolicAcidosis(phReadings),
            sodium_value:           d.sodium_value ?? latestReadingSummary(naReadings),
            potassium_value:        d.potassium_value ?? latestReadingSummary(kReadings),
            ionized_calcium_value:  d.ionized_calcium_value ?? latestReadingSummary(caReadings),
            osteopenia_suspected:   d.osteopenia_suspected   ?? null,
            ph_readings:            phReadings,
            sodium_readings:        naReadings,
            potassium_readings:     kReadings,
            calcium_readings:       caReadings,
          };
          setMetabData(loadedMetab);
          setRenalData({
            aki_suspected:          aki.aki_suspected,
            creatinine_value:       creatVal,
            urine_output_8am_2pm:   d.urine_output_8am_2pm ?? null,
            urine_output_2pm_8pm:   d.urine_output_2pm_8pm ?? null,
            urine_output_8pm_8am:   d.urine_output_8pm_8am ?? null,
            urine_output_total:     d.urine_output_total
              ?? computeUrineTotal(d.urine_output_8am_2pm, d.urine_output_2pm_8pm, d.urine_output_8pm_8am),
            dialysis_crrt:          d.dialysis_crrt      ?? null,
          });
          setThermoData({
            axillary_temperature: d.axillary_temperature ?? null,
          });
          setVascData({
            picc_in_situ:         d.picc_in_situ         ?? null,
            uvc_in_situ:          d.uvc_in_situ          ?? null,
            uac_in_situ:          d.uac_in_situ          ?? null,
            peripheral_iv:        d.peripheral_iv        ?? null,
            peripheral_arterial:  d.peripheral_arterial  ?? null,
            extravasation_injury: d.extravasation_injury ?? null,
            line_complication:    d.line_complication    ?? null,
          });
          setEyeData({
            rop_screening_due: d.rop_screening_due ?? null,
            rop_screened:      d.rop_screened      ?? null,
            rop_detected:      d.rop_detected      ?? null,
            rop_stage:         d.rop_stage         || null,
            plus_disease:      d.plus_disease      ?? null,
            rop_treatment:     d.rop_treatment     ?? null,
          });
          setTailData({
            location:          stringToList(d.location),
            survived_the_day:  d.survived_the_day  ?? null,
          });
          const st = d.submission_status || STATUS.DRAFT;
          setDayStatuses(prev => ({ ...prev, [activeDay]: st }));
          setSavedAt(d.saved_at||null); setSavedBy(d.saved_by||"");
          setSubmittedAt(d.submitted_at||null); setSubmittedBy(d.submitted_by||"");
          setOverrideUntil(d.override_unlocked_until || null);
          setIsSaved(true);
          // A reload/revisit during a still-active override window must not
          // silently re-lock the fields — isFieldEditable requires isEditing
          // whenever isSaved is true, and this effect always sets isSaved
          // true for an existing record.
          const overrideStillActive = !!d.override_unlocked_until && parseUtcTimestamp(d.override_unlocked_until) > new Date();
          setIsEditing(overrideStillActive);
          if (!completedDays.includes(activeDay))
            setCompletedDays(prev => [...prev, activeDay]);
        } else {
          resetFormState();
          loadedMetab = {
            lowest_glucose:null,hypoglycemia_episodes:null,hypoglycemia_rx:null,highest_glucose:null,
            insulin:null,metabolic_acidosis:null,sodium_value:null,potassium_value:null,
            ionized_calcium_value:null,osteopenia_suspected:null,
            ph_readings:[blankReading({ ph: "" })],
            sodium_readings:[blankReading({ value: "" })],
            potassium_readings:[blankReading({ value: "" })],
            calcium_readings:[blankReading({ value: "" })],
          };
        }
      } catch (err) {
        if (err?.response?.status === 404) {
          resetFormState();
          loadedMetab = {
            lowest_glucose:null,hypoglycemia_episodes:null,hypoglycemia_rx:null,highest_glucose:null,
            insulin:null,metabolic_acidosis:null,sodium_value:null,potassium_value:null,
            ionized_calcium_value:null,osteopenia_suspected:null,
            ph_readings:[blankReading({ ph: "" })],
            sodium_readings:[blankReading({ value: "" })],
            potassium_readings:[blankReading({ value: "" })],
            calcium_readings:[blankReading({ value: "" })],
          };
        }
      } finally {
        setLoading(false);
        // Soft autofill into empty glucose fields when this NICU day is calendar-today.
        if (loadedMetab) {
          const dayDate = (() => {
            if (!day1Date) return null;
            const base = new Date(day1Date + "T00:00:00");
            if (isNaN(base.getTime())) return null;
            base.setDate(base.getDate() + activeDay - 1);
            return toDateOnlyValue(base);
          })();
          const today = toDateOnlyValue(new Date());
          if (dayDate && dayDate === today && glucoseAutoDoneRef.current !== activeDay) {
            glucoseAutoDoneRef.current = activeDay;
            // Defer so isActiveDayToday/activeDayDate from next render aren't required —
            // we pass seed and rely on inline date check inside a dedicated call.
            (async () => {
              try {
                const res = await api.get(`/minimal-monitoring/${enrollmentId}/today`, {
                  params: { boundary_hour: 8 },
                });
                const data = res?.data || {};
                if (data.record_date && data.record_date !== dayDate) return;
                const computed = computeGlucoseAutofill(parseMetAGlucoseReadings(data));
                const next = { ...loadedMetab };
                const flags = {
                  lowest_glucose: false,
                  hypoglycemia_episodes: false,
                  highest_glucose: false,
                };
                for (const key of ["lowest_glucose", "hypoglycemia_episodes", "highest_glucose"]) {
                  if (isEmptyMetabField(loadedMetab[key])) {
                    next[key] = computed[key];
                    flags[key] = true;
                  }
                }
                const ep = Number(next.hypoglycemia_episodes);
                if (!Number.isFinite(ep) || ep <= 0) next.hypoglycemia_rx = null;
                if (!isNumericHighGlucose(next.highest_glucose)) next.insulin = null;
                if (Object.values(flags).some(Boolean)) {
                  setMetabData(next);
                  setGlucoseAutofilled(flags);
                  // Keep fields editable so the nurse can review/save autofill.
                  setIsEditing(true);
                }
              } catch (_) { /* Helper 5 optional */ }
            })();
          }
        }
      }
    };
    loadDay();
  }, [enrollmentId, activeDay, day1Date]);

  const resetFormState = () => {
    setMetabData({
      lowest_glucose:null,hypoglycemia_episodes:null,hypoglycemia_rx:null,highest_glucose:null,
      insulin:null,metabolic_acidosis:null,sodium_value:null,potassium_value:null,
      ionized_calcium_value:null,osteopenia_suspected:null,
      ph_readings:[blankReading({ ph: "" })],
      sodium_readings:[blankReading({ value: "" })],
      potassium_readings:[blankReading({ value: "" })],
      calcium_readings:[blankReading({ value: "" })],
    });
    setGlucoseAutofilled({
      lowest_glucose: false,
      hypoglycemia_episodes: false,
      highest_glucose: false,
    });
    setRenalData({
      aki_suspected:null, creatinine_value:null,
      urine_output_8am_2pm:null, urine_output_2pm_8pm:null, urine_output_8pm_8am:null,
      urine_output_total:null, dialysis_crrt:null,
    });
    setThermoData({ axillary_temperature:null });
    setVascData({ picc_in_situ:null,uvc_in_situ:null,uac_in_situ:null,peripheral_iv:null,
      peripheral_arterial:null,extravasation_injury:null,line_complication:null });
    setEyeData({ rop_screening_due:null,rop_screened:null,rop_detected:null,rop_stage:null,plus_disease:null,rop_treatment:null });
    setTailData({ location:[],survived_the_day:null });
    setIsSaved(false); setIsEditing(false);
    setSavedAt(null); setSavedBy(""); setSubmittedAt(null); setSubmittedBy("");
    setOverrideUntil(null);
    setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
  };

  const buildPayload = (now) => {
    const phReadings = metabData.ph_readings || [];
    const naReadings = metabData.sodium_readings || [];
    const kReadings = metabData.potassium_readings || [];
    const caReadings = metabData.calcium_readings || [];
    const acidosis = deriveMetabolicAcidosis(phReadings);
    const naSum = latestReadingSummary(naReadings);
    const kSum = latestReadingSummary(kReadings);
    const caSum = latestReadingSummary(caReadings);
    const urineTotal = computeUrineTotal(
      renalData.urine_output_8am_2pm,
      renalData.urine_output_2pm_8pm,
      renalData.urine_output_8pm_8am,
    );
    const creatVal = renalData.creatinine_value;
    const creatNum = (() => {
      if (creatVal == null || creatVal === "" || creatVal === "Not Tested" || creatVal === "Awaited") return null;
      const n = Number(creatVal);
      return Number.isFinite(n) ? n : null;
    })();
    const {
      ph_readings, sodium_readings, potassium_readings, calcium_readings,
      ...metabFlat
    } = metabData;
    return {
      enrollment_id: enrollmentId,
      nicu_day: activeDay,
      ...metabFlat,
      metabolic_acidosis: acidosis,
      sodium_value: naSum,
      potassium_value: kSum,
      ionized_calcium_value: caSum,
      ph_readings_json: JSON.stringify(phReadings),
      sodium_readings_json: JSON.stringify(naReadings),
      potassium_readings_json: JSON.stringify(kReadings),
      calcium_readings_json: JSON.stringify(caReadings),
      aki_suspected: renalData.aki_suspected,
      creatinine_value: creatVal,
      creatinine: creatNum,
      urine_output_8am_2pm: renalData.urine_output_8am_2pm,
      urine_output_2pm_8pm: renalData.urine_output_2pm_8pm,
      urine_output_8pm_8am: renalData.urine_output_8pm_8am,
      urine_output_total: urineTotal,
      dialysis_crrt: renalData.dialysis_crrt,
      ...thermoData,
      ...vascData,
      ...eyeData,
      ...tailData,
      location: listToString(tailData.location),
      submission_status: STATUS.DRAFT,
      saved_at: now,
      saved_by: user?.name || user?.username || "Nurse",
    };
  };
  /* ── Save ── */
  const handleSave = async ({ force = false } = {}) => {
    if (!enrollmentId) return;
    if (!day1Date) {
      setMessage("⚠️ Please set Day 1 Date above before saving");
      return;
    }
    // force: re-save while viewing a saved draft (Submit path) without
    // requiring Edit — same pattern as Helper Form 2 (RespCVNeuroLog).
    if (!force && !isFieldEditable) return; // future / locked-past / submitted (without override) — nothing to save
    const now = new Date().toISOString();
    try {
      const payload = buildPayload(now);
      isSaved
        ? await api.put(`/metab-renal-vasc-eye/${enrollmentId}/${activeDay}`, payload)
        : await api.post("/metab-renal-vasc-eye/", payload);
      // Keep the sidebar tick in sync with the *current* state, not just
      // whether it was ever true — data added then deleted before the next
      // save must un-tick the helper, not leave it stuck complete.
      if (completionPct > 0) markFormCompleted("metab_renal_vasc_eye");
      else unmarkFormCompleted("metab_renal_vasc_eye");
      setIsSaved(true); setIsEditing(false);
      setSavedAt(now); setSavedBy(user?.name || user?.username || "Nurse");
      const newSt = completionPct===100 ? STATUS.COMPLETE : STATUS.DRAFT;
      setDayStatuses(prev => ({ ...prev, [activeDay]: newSt }));
      setDayMeta(prev => ({ ...prev, [activeDay]: { pct: completionPct, savedAt: now } }));
      if (!completedDays.includes(activeDay))
        setCompletedDays(prev => [...prev, activeDay]);
      setMessage("✅ Day " + activeDay + " saved successfully");
      setShowSaveSuccess(true);
      setTimeout(() => setMessage(""), 3000);
    } catch (_) { setMessage("❌ Error saving — please try again"); }
  };

  const handlePrevious = async () => {
    if (isFieldEditable && completionPct > 0) {
      try { await handleSave(); } catch (err) { console.error("Save before back failed:", err); }
    }
    navigate(`/infect-gi-hema-log/${enrollmentId}`);
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
      // Always save fresh state before locking — `isSaved` only means "this
      // record has been saved at least once," not "nothing has changed
      // since." Skipping the save here silently discarded edits made after
      // a prior save whenever the day reached 100% (confirmed 2026-08-23 on
      // enrollment 01-A-456: Hypoglycemia Rx + Ionized Calcium were entered,
      // completion hit 100%, the UI shows only a Submit button at that
      // point — no separate Save — and the submit locked the stale
      // pre-edit data because isSaved was already true from an earlier
      // save).
      await handleSave({ force: true });
      const now = new Date().toISOString();
      await api.patch(`/metab-renal-vasc-eye/${enrollmentId}/${activeDay}/submit`, {
        submission_status: STATUS.SUBMITTED,
        submitted_at: now,
        submitted_by: user?.name || user?.username || "Site User",
      });
      setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.SUBMITTED }));
      setSubmittedAt(now); setSubmittedBy(user?.name || user?.username || "Site User");
      setShowModal(false);
      setMessage("🔒 Day " + activeDay + " submitted and locked");
      setTimeout(() => setMessage(""), 5000);
    } catch (_) { setMessage("❌ Submission failed"); setShowModal(false); }
    finally { setSubmitting(false); }
  };

  /* ── Next Form (save before navigate) ── */
  const handleNext = async () => {
    // Same phantom-blank-draft guard as handlePrevious / the autosave
    // session flush — clicking Next on an untouched day must not silently
    // POST an empty record and tick the sidebar as complete.
    if (isFieldEditable && completionPct > 0) {
      try { await handleSave(); } catch (err) { console.error("Save before next failed:", err); }
    }
    navigate(`/form-f/${enrollmentId}`);
  };

  /* ── Copy from day ── */
  const handleCopyFromDay = async (sourceDay) => {
    setShowCopyModal(false); setLoading(true);
    try {
      const res = await api.get(`/metab-renal-vasc-eye/${enrollmentId}/${sourceDay}`);
      const d = res?.data || {};
      if (!d || Object.keys(d).length === 0) {
        setMessage(`⚠️ No data for Day ${sourceDay}`);
        setTimeout(() => setMessage(""), 3000); return;
      }
      const aki = migrateAkiFromLegacy(d);
      const phReadings = parseJsonArray(d.ph_readings_json) || [blankReading({ ph: "" })];
      const naReadings = parseJsonArray(d.sodium_readings_json) || [blankReading({ value: "" })];
      const kReadings = parseJsonArray(d.potassium_readings_json) || [blankReading({ value: "" })];
      const caReadings = parseJsonArray(d.calcium_readings_json) || [blankReading({ value: "" })];
      setMetabData({
        lowest_glucose: d.lowest_glucose??null, hypoglycemia_episodes: d.hypoglycemia_episodes??null,
        hypoglycemia_rx: d.hypoglycemia_rx??null, highest_glucose: d.highest_glucose??null,
        insulin: d.insulin??null,
        metabolic_acidosis: d.metabolic_acidosis ?? deriveMetabolicAcidosis(phReadings),
        sodium_value: d.sodium_value ?? latestReadingSummary(naReadings),
        potassium_value: d.potassium_value ?? latestReadingSummary(kReadings),
        ionized_calcium_value: d.ionized_calcium_value ?? latestReadingSummary(caReadings),
        osteopenia_suspected: d.osteopenia_suspected??null,
        ph_readings: phReadings,
        sodium_readings: naReadings,
        potassium_readings: kReadings,
        calcium_readings: caReadings,
      });
      setRenalData({
        aki_suspected: aki.aki_suspected,
        creatinine_value: d.creatinine_value
          ?? (d.creatinine != null && d.creatinine !== "" ? String(d.creatinine) : null),
        urine_output_8am_2pm: d.urine_output_8am_2pm??null,
        urine_output_2pm_8pm: d.urine_output_2pm_8pm??null,
        urine_output_8pm_8am: d.urine_output_8pm_8am??null,
        urine_output_total: d.urine_output_total
          ?? computeUrineTotal(d.urine_output_8am_2pm, d.urine_output_2pm_8pm, d.urine_output_8pm_8am),
        dialysis_crrt: d.dialysis_crrt??null,
      });
      setThermoData({ axillary_temperature: d.axillary_temperature??null });
      setVascData({ picc_in_situ: d.picc_in_situ??null, uvc_in_situ: d.uvc_in_situ??null,
        uac_in_situ: d.uac_in_situ??null, peripheral_iv: d.peripheral_iv??null,
        peripheral_arterial: d.peripheral_arterial??null, extravasation_injury: d.extravasation_injury??null,
        line_complication: d.line_complication??null });
      setEyeData({ rop_screening_due: d.rop_screening_due??null, rop_screened: d.rop_screened??null,
        rop_detected: d.rop_detected??null, rop_stage: d.rop_stage||null,
        plus_disease: d.plus_disease??null, rop_treatment: d.rop_treatment??null });
      setTailData({ location: stringToList(d.location), survived_the_day: d.survived_the_day??null });
      setGlucoseAutofilled({
        lowest_glucose: false,
        hypoglycemia_episodes: false,
        highest_glucose: false,
      });
      setIsSaved(false);
      setMessage(`📋 Copied from Day ${sourceDay} — review and save`);
      setTimeout(() => setMessage(""), 4000);
    } catch (_) {
      setMessage(`❌ Could not load Day ${sourceDay}`);
      setTimeout(() => setMessage(""), 3000);
    } finally { setLoading(false); }
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
  // no new backend endpoint needed. Same pattern as Helper Forms 2 & 3.
  const loadTableViewData = async () => {
    setShowTableView(true);
    setTableViewLoading(true);
    try {
      const filledDays = days.filter(d => (dayStatuses[d] || STATUS.EMPTY) !== STATUS.EMPTY);
      const results = await Promise.all(
        filledDays.map(d =>
          api.get(`/metab-renal-vasc-eye/${enrollmentId}/${d}`)
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

  /* ═══════════════════════════════════════ RENDER ═══════════════════════════════════════ */
  return (
    <>
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
            <div className="rcn-patient-header-badge">HELPER FORM 4</div>
            <h2 className="rcn-patient-header-form-name">Metab-Renal-Vasc-Eye</h2>
            <p className="rcn-patient-header-subtitle">
              Y = Yes, N = No, or enter value where applicable. Complete at the end of 24 hours (11 am).
            </p>
          </div>
          <div className="rcn-patient-cards">
            <div className="rcn-pcard rcn-pcard--blue">
              <span className="rcn-pcard-icon">🪪</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Enrolment ID</span>
                <span className="rcn-pcard-value">{patientInfo.enrollmentId || "—"}</span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--teal">
              <span className="rcn-pcard-icon">🧬</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">
                  Gestation{patientInfo.gestationSource === "Form D NBS" ? " (NBS)" : ""}
                </span>
                <span className="rcn-pcard-value">{patientInfo.gestationalAge || "—"}</span>
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
            <div className="rcn-pcard rcn-pcard--amber">
              <span className="rcn-pcard-icon">🏷️</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Baby UID</span>
                <span className="rcn-pcard-value">{patientInfo.babyUid || "—"}</span>
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
            <div className={`rcn-day1-picker${day1DateLocked ? " rcn-day1-picker--locked" : ""}${!day1Date ? " rcn-day1-picker--required" : ""}`}>
              <label className="rcn-day1-picker-label">
                Day 1 Date {!day1Date && <span className="rcn-day1-picker-required-mark" title="Required — data cannot be entered until this is set">*</span>}
                {day1DateLocked && <Lock size={11} style={{ verticalAlign: "-1px" }} />}
              </label>
              <input
                type="date"
                className="rcn-day1-picker-input"
                value={day1Date}
                readOnly={day1DateLocked}
                disabled={day1DateLocked}
                min={day1EditArmed ? undefined : day1DateBounds.min}
                max={day1EditArmed ? undefined : day1DateBounds.max}
                required
                title={day1DateLocked
                  ? `Locked — daily data already exists for this baby${day1DateSetBy ? ` (set by ${day1DateSetBy})` : ""}`
                  : `Required — today's date, or yesterday's before ${MRVE_LATE_GRACE_HOUR}:00 AM`}
                onChange={async e => {
                  if (day1DateLocked) return;
                  const v = e.target.value;
                  if (!day1EditArmed && v && (v < day1DateBounds.min || v > day1DateBounds.max)) {
                    setMessage(
                      `⚠️ Day 1 Date must be today's date, or yesterday's before ${MRVE_LATE_GRACE_HOUR}:00 AM`
                    );
                    setTimeout(() => setMessage(""), 4000);
                    return;
                  }
                  setDay1Date(v);
                  if (enrollmentId) localStorage.setItem(`mrve_day1_${enrollmentId}`, v);
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
              {day1DateLockedRemote && isSuperadmin && !day1EditArmed && (
                <button
                  type="button"
                  className="rcn-day1-admin-unlock"
                  title="Superadmin: unlock Day 1 Date for correction"
                  onClick={() => {
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
              return (
                <button
                  key={d}
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
                  style={!isActive && !isLocked ? { borderColor: (isMissed ? "#dc2626" : cfg.color) + "66" } : {}}
                >
                  {isMissed && <AlertOctagon size={9} className="rcn-day-missed-flag" />}
                  <span className="rcn-day-d">D</span>
                  <span className="rcn-day-num">{d}</span>
                  {isFuture
                    ? <Lock size={10} className="rcn-day-dot" />
                    : <span className="rcn-day-dot" style={!isActive ? { background: isMissed ? "#dc2626" : cfg.dot } : {}} />
                  }
                  <span className="rcn-day-date">
                    {isDischarge ? "🏠" : (() => {
                      if (!day1Date) return "";
                      const base = new Date(day1Date);
                      base.setDate(base.getDate() + d - 1);
                      return base.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                    })()}
                  </span>
                </button>
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

          <div className="rcn-timeline-legend">
            {LEGEND_ITEMS.map(item => (
              <span key={item.label} className="rcn-legend-item">
                <span className="rcn-legend-dot" style={{ background:item.dot }}/>
                {item.label}
              </span>
            ))}
          </div>

          {/* ── Missed-day alert ── */}
          {missedDays.length > 0 && (
            <div className="rcn-missed-banner">
              <AlertOctagon size={13} />
              <span>
                {missedDays.length} day{missedDays.length > 1 ? "s" : ""} with no data entered
                (Day {missedDays.join(", Day ")}) — these are now permanently locked.
              </span>
            </div>
          )}
        </div>

        {/* ── Summary Card ── */}
        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">Day {activeDay}</h2>
            <div className="rcn-summary-meta">
              <Clock size={13}/>
              <span>{isSaved?"Completed":"Not yet started"} — complete by 11:00 AM</span>
            </div>
            {!isSubmitted && !isFutureActiveDay && !isPastActiveDay && activeDay > 1 && (
              <button type="button" className="rcn-copy-btn"
                onClick={() => {
                  const available = Object.keys(dayStatuses).map(Number)
                    .filter(d => d < activeDay && dayStatuses[d] !== STATUS.EMPTY);
                  setCopySourceDay(available); setShowCopyModal(true);
                }}>
                <Copy size={13}/> Copy from previous day
              </button>
            )}
          </div>
          <div className="rcn-summary-right">
            <div className="rcn-summary-sections">
              {[
                { emoji:"⚡", label:"Metabolic",         done:metabAnswered,  total:metabTotal  },
                { emoji:"💧", label:"Renal",             done:renalAnswered,  total:renalTotal  },
                { emoji:"🌡️", label:"Thermoregulation",  done:thermoAnswered, total:thermoTotal },
                { emoji:"🩺", label:"Vascular",          done:vascAnswered,   total:vascTotal   },
                { emoji:"👁️", label:"Eye",               done:eyeAnswered,    total:eyeTotal    },
                { emoji:"📍", label:"Location",          done:ans(tailData.location) ? 1 : 0, total: 1 },
                { emoji:"✅", label:"Survived",          done:tailData.survived_the_day === true || tailData.survived_the_day === false ? 1 : 0, total: 1 },
              ].map(s => (
                <div className="rcn-summary-section" key={s.label}>
                  <span className="rcn-summary-section-emoji">{s.emoji}</span>
                  <span className="rcn-summary-section-name">{s.label}</span>
                  <span className="rcn-summary-section-count">
                    {s.done}<span className="rcn-summary-section-total">/{s.total}</span>
                  </span>
                  <div className="rcn-summary-section-bar">
                    <div className="rcn-summary-section-bar-fill"
                      style={{ width:`${s.total>0?(s.done/s.total)*100:0}%` }}/>
                  </div>
                </div>
              ))}
            </div>
            <div className="rcn-summary-ring-wrap">
              <ProgressRing percent={completionPct}/>
              <span className="rcn-summary-ring-label">Complete</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rcn-loading">Loading day {activeDay} data…</div>
        ) : (
          <div className="rcn-sections">

            {/* Discharge banner */}
            {dischargeDay && activeDay > dischargeDay && (
              <div className="rcn-status-banner rcn-status-banner--discharged">
                <span style={{fontSize:18}}>🏠</span>
                <div className="rcn-status-banner-text">
                  <strong>Patient Discharged</strong>
                  <span>Day {dischargeDay} was the last NICU day. Data entry beyond this point is locked.</span>
                </div>
              </div>
            )}
            {isSubmitted && (
              <div className="rcn-status-banner rcn-status-banner--submitted">
                <Lock size={15}/>
                <div className="rcn-status-banner-text">
                  <strong>Day {activeDay} Submitted &amp; Locked</strong>
                  <span>Submitted by {submittedBy||"Site User"}{submittedAt?` · ${new Date(submittedAt).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}`:""}</span>
                </div>
              </div>
            )}
            {isSaved && !isSubmitted && completionPct < 100 && (
              <div className="rcn-status-banner rcn-status-banner--pending">
                <AlertTriangle size={15}/>
                <div className="rcn-status-banner-text">
                  <strong>{completionPct}% complete</strong>
                  <span>Fill all fields to unlock the Submit button and lock this day's data</span>
                </div>
                <span className="rcn-status-banner-badge">{totalFields-totalAnswered} remaining</span>
              </div>
            )}

            {/* ════ 4.1 METABOLIC ════ */}
            <SectionCard iconEmoji="⚡" title="4.1 Metabolic"
              answered={metabAnswered} total={metabTotal} defaultOpen={true}
              headerAction={isActiveDayToday ? (
                <button
                  type="button"
                  className="rcn-refresh-helper5"
                  onClick={handleRefreshGlucoseFromHelper5}
                  disabled={!isFieldEditable || glucoseRefreshing}
                  title="Re-sync glucose #1–#4 from Helper Form 5 today's sheet"
                >
                  <RefreshCw size={12} className={glucoseRefreshing ? "rcn-spin" : ""} />
                  {glucoseRefreshing ? "Refreshing…" : "Refresh from Helper 5"}
                </button>
              ) : null}
            >
              <div className="rcn-yn-list">
                <ReadonlyAutoField
                  label="1. Lowest glucose reading (if <45 mg/dL)"
                  value={metabData.lowest_glucose}
                  unit="mg/dL"
                  autofilled={!!glucoseAutofilled.lowest_glucose}
                />
                <ReadonlyAutoField
                  label="2. No of episodes of hypoglycemia"
                  value={metabData.hypoglycemia_episodes}
                  autofilled={!!glucoseAutofilled.hypoglycemia_episodes}
                />
                {hypoRxRequired && (
                  <div className="rcn-conditional-block">
                    <YNRow label="3. Hypoglycemia Rx (required — low reading present)" value={metabData.hypoglycemia_rx}
                      onChange={v=>setMetab("hypoglycemia_rx",v)} disabled={!isFieldEditable}/>
                  </div>
                )}
                <ReadonlyAutoField
                  label="4. Highest glucose reading (if >180 mg/dL)"
                  value={metabData.highest_glucose}
                  unit="mg/dL"
                  autofilled={!!glucoseAutofilled.highest_glucose}
                />
                {hyperRxRequired && (
                  <div className="rcn-conditional-block">
                    <YNRow label="5. Hyperglycemia Rx (Insulin)" value={metabData.insulin}
                      onChange={v=>setMetab("insulin",v)} disabled={!isFieldEditable}/>
                  </div>
                )}

                <div className="rcn-subsection" style={{ marginTop: 8 }}>
                  <div className="rcn-subsection-title">6. Metabolic acidosis (pH&lt;7.2) — enter readings</div>
                  <ReadingsBlock
                    code="pH"
                    entries={metabData.ph_readings}
                    disabled={!isFieldEditable}
                    blankFactory={() => blankReading({ ph: "" })}
                    onChangeEntry={(i, k, v) => setReadingField("ph_readings", i, k, v, "ph")}
                    onAdd={blank => addReading("ph_readings", blank, "ph")}
                    onRemove={i => removeReading("ph_readings", i, "ph")}
                  >
                    {(e, i) => (
                      <div className="rcn-yn-row" style={{ border: "none", padding: "4px 0" }}>
                        <span className="rcn-yn-label">pH</span>
                        <div className="rcn-num-input" style={{ width: 140 }}>
                          <input type="number" step="0.01" value={e.ph ?? ""}
                            disabled={!isFieldEditable}
                            onChange={ev => setReadingField("ph_readings", i, "ph",
                              ev.target.value === "" ? "" : Number(ev.target.value), "ph")} />
                        </div>
                      </div>
                    )}
                  </ReadingsBlock>
                  <div className="rcn-yn-list" style={{ marginTop: 8 }}>
                    <ReadonlyAutoField
                      label="Metabolic acidosis (auto)"
                      value={
                        metabData.metabolic_acidosis === true ? "Yes"
                          : metabData.metabolic_acidosis === false ? "No"
                            : "—"
                      }
                    />
                  </div>
                </div>

                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">7. Sodium value (&lt;135 or &gt;142)</div>
                  <ReadingsBlock
                    code="Na"
                    entries={metabData.sodium_readings}
                    disabled={!isFieldEditable}
                    blankFactory={() => blankReading({ value: "" })}
                    onChangeEntry={(i, k, v) => setReadingField("sodium_readings", i, k, v)}
                    onAdd={blank => addReading("sodium_readings", blank)}
                    onRemove={i => removeReading("sodium_readings", i)}
                  >
                    {(e, i) => (
                      <div className="rcn-yn-row" style={{ border: "none", padding: "4px 0" }}>
                        <span className="rcn-yn-label">Value</span>
                        <div className="rcn-num-input" style={{ width: 140 }}>
                          <input type="number" step="0.01" value={e.value ?? ""}
                            disabled={!isFieldEditable}
                            onChange={ev => setReadingField("sodium_readings", i, "value",
                              ev.target.value === "" ? "" : Number(ev.target.value))} />
                          <span className="rcn-num-unit">mmol/L</span>
                        </div>
                      </div>
                    )}
                  </ReadingsBlock>
                </div>

                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">8. Potassium value (&lt;3.5 or &gt;6)</div>
                  <ReadingsBlock
                    code="K"
                    entries={metabData.potassium_readings}
                    disabled={!isFieldEditable}
                    blankFactory={() => blankReading({ value: "" })}
                    onChangeEntry={(i, k, v) => setReadingField("potassium_readings", i, k, v)}
                    onAdd={blank => addReading("potassium_readings", blank)}
                    onRemove={i => removeReading("potassium_readings", i)}
                  >
                    {(e, i) => (
                      <div className="rcn-yn-row" style={{ border: "none", padding: "4px 0" }}>
                        <span className="rcn-yn-label">Value</span>
                        <div className="rcn-num-input" style={{ width: 140 }}>
                          <input type="number" step="0.01" value={e.value ?? ""}
                            disabled={!isFieldEditable}
                            onChange={ev => setReadingField("potassium_readings", i, "value",
                              ev.target.value === "" ? "" : Number(ev.target.value))} />
                          <span className="rcn-num-unit">mmol/L</span>
                        </div>
                      </div>
                    )}
                  </ReadingsBlock>
                </div>

                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">9. Ionized Calcium value (&lt;0.9 or &gt;1.2)</div>
                  <ReadingsBlock
                    code="iCa"
                    entries={metabData.calcium_readings}
                    disabled={!isFieldEditable}
                    blankFactory={() => blankReading({ value: "" })}
                    onChangeEntry={(i, k, v) => setReadingField("calcium_readings", i, k, v)}
                    onAdd={blank => addReading("calcium_readings", blank)}
                    onRemove={i => removeReading("calcium_readings", i)}
                  >
                    {(e, i) => (
                      <div className="rcn-yn-row" style={{ border: "none", padding: "4px 0" }}>
                        <span className="rcn-yn-label">Value</span>
                        <div className="rcn-num-input" style={{ width: 140 }}>
                          <input type="number" step="0.01" value={e.value ?? ""}
                            disabled={!isFieldEditable}
                            onChange={ev => setReadingField("calcium_readings", i, "value",
                              ev.target.value === "" ? "" : Number(ev.target.value))} />
                          <span className="rcn-num-unit">mmol/L</span>
                        </div>
                      </div>
                    )}
                  </ReadingsBlock>
                </div>

                <YNRow label="10. Osteopenia suspected" value={metabData.osteopenia_suspected}
                  onChange={v=>setMetab("osteopenia_suspected",v)} disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ 4.2 RENAL ════ */}
            <SectionCard iconEmoji="💧" title="4.2 Renal"
              answered={renalAnswered} total={renalTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="11. AKI suspected" value={renalData.aki_suspected}
                  onChange={v=>setRenal("aki_suspected",v)} disabled={!isFieldEditable}/>
              </div>

              <div className="rcn-yn-list" style={{ marginTop: 12 }}>
                <GlucoseTextRow
                  label="12. Serum Creatinine (mg/dL)"
                  value={renalData.creatinine_value}
                  onChange={v => setRenal("creatinine_value", v)}
                  disabled={!isFieldEditable}
                  unit="mg/dL"
                  placeholder="value / Not Tested / Awaited"
                />
                <NumRow label="13a. Urine output 8am → 2pm" value={renalData.urine_output_8am_2pm}
                  onChange={v=>setRenal("urine_output_8am_2pm",v)} disabled={!isFieldEditable}
                  unit="ml/kg/hr"/>
                <NumRow label="13b. Urine output 2pm → 8pm" value={renalData.urine_output_2pm_8pm}
                  onChange={v=>setRenal("urine_output_2pm_8pm",v)} disabled={!isFieldEditable}
                  unit="ml/kg/hr"/>
                <NumRow label="13c. Urine output 8pm → 8am" value={renalData.urine_output_8pm_8am}
                  onChange={v=>setRenal("urine_output_8pm_8am",v)} disabled={!isFieldEditable}
                  unit="ml/kg/hr"/>
                <ReadonlyAutoField
                  label="13. Urine output total (sum)"
                  value={renalData.urine_output_total}
                  unit="ml/kg/hr"
                />
                <YNRow label="14. Dialysis/CRRT" value={renalData.dialysis_crrt}
                  onChange={v=>setRenal("dialysis_crrt",v)} disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ 4.3 THERMOREGULATION ════ */}
            <SectionCard iconEmoji="🌡️" title="4.3 Thermoregulation"
              answered={thermoAnswered} total={thermoTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <NumRow label="15. Axillary Temperature (<36.5 or >37.5)" value={thermoData.axillary_temperature}
                  onChange={v=>setThermo("axillary_temperature",v)} disabled={!isFieldEditable} unit="°C"/>
              </div>
            </SectionCard>

            {/* ════ 4.4 VASCULAR ACCESS ════ */}
            <SectionCard iconEmoji="🩺" title="4.4 Vascular Access"
              answered={vascAnswered} total={vascTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="16. PICC in situ"           value={vascData.picc_in_situ}         onChange={v=>setVasc("picc_in_situ",v)}         disabled={!isFieldEditable}/>
                <YNRow label="17. UVC in situ"            value={vascData.uvc_in_situ}          onChange={v=>setVasc("uvc_in_situ",v)}          disabled={!isFieldEditable}/>
                <YNRow label="18. UAC in situ"            value={vascData.uac_in_situ}          onChange={v=>setVasc("uac_in_situ",v)}          disabled={!isFieldEditable}/>
                <YNRow label="19. Peripheral IV"          value={vascData.peripheral_iv}        onChange={v=>setVasc("peripheral_iv",v)}        disabled={!isFieldEditable}/>
                <YNRow label="20. Peripheral arterial"    value={vascData.peripheral_arterial}  onChange={v=>setVasc("peripheral_arterial",v)}  disabled={!isFieldEditable}/>
                {extravasationRequired && (
                  <div className="rcn-conditional-block">
                    <YNRow label="21. Extravasation injury" value={vascData.extravasation_injury}
                      onChange={v=>setVasc("extravasation_injury",v)} disabled={!isFieldEditable}/>
                  </div>
                )}
                <YNRow label="22. Line complication"      value={vascData.line_complication}    onChange={v=>setVasc("line_complication",v)}    disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ 4.5 OPHTHALMOLOGY ════ */}
            <SectionCard iconEmoji="👁️" title="4.5 Ophthalmology"
              answered={eyeAnswered} total={eyeTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="23. ROP screening due" value={eyeData.rop_screening_due}
                  onChange={v=>setEye("rop_screening_due",v)} disabled={!isFieldEditable}/>
                {ropDue && (
                  <div className="rcn-conditional-block">
                    <YNRow label="24. ROP screened" value={eyeData.rop_screened}
                      onChange={v=>setEye("rop_screened",v)} disabled={!isFieldEditable}/>
                  </div>
                )}
                {ropDue && ropScreenedYes && (
                  <div className="rcn-conditional-block">
                    <YNRow label="25. ROP detected" value={eyeData.rop_detected}
                      onChange={v=>setEye("rop_detected",v)} disabled={!isFieldEditable}/>
                  </div>
                )}
              </div>

              {ropYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">Optional detail (not on paper CRF)</div>
                  <StageCards
                    options={["Stage 1","Stage 2","Stage 3","Stage 4","Stage 5"]}
                    value={eyeData.rop_stage}
                    onChange={v => isFieldEditable && setEyeData(p=>({...p,rop_stage:v}))}
                    disabled={!isFieldEditable}
                  />
                  <div className="rcn-yn-list" style={{marginTop:16}}>
                    <YNRow label="Plus Disease"   value={eyeData.plus_disease}   onChange={v=>setEye("plus_disease",v)}   disabled={!isFieldEditable}/>
                    <YNRow label="ROP Treatment"  value={eyeData.rop_treatment}  onChange={v=>setEye("rop_treatment",v)}  disabled={!isFieldEditable}/>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ════ 4.6 LOCATION ════ */}
            <SectionCard iconEmoji="📍" title="4.6 Location"
              answered={ans(tailData.location) ? 1 : 0} total={1} defaultOpen={true}>
              <PillMulti
                options={["DR","NICU","Step-down/Nursery","KMC-N","Other"]}
                value={tailData.location || []}
                onChange={v => setTail("location", v)}
                disabled={!isFieldEditable}
              />
            </SectionCard>

            {/* ════ 4.7 SURVIVED THE DAY ════ */}
            <SectionCard iconEmoji="✅" title="4.7 Survived the Day"
              answered={tailData.survived_the_day === true || tailData.survived_the_day === false ? 1 : 0}
              total={1} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="Survived the day" value={tailData.survived_the_day}
                  onChange={v=>setTail("survived_the_day",v)} disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

          </div>
        )}

        {message && (
          <div className={`form-message${message.startsWith("✅")||message.startsWith("🔒")?" form-message--success":" form-message--error"}`}>
            {message}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCopyModal && (
        <CopyDayModal activeDay={activeDay} availableDays={copySourceDay}
          onConfirm={handleCopyFromDay} onCancel={() => setShowCopyModal(false)}/>
      )}
      {showModal && (
        <SubmitModal day={activeDay} completionPct={completionPct}
          onConfirm={handleSubmit} onCancel={() => setShowModal(false)} submitting={submitting}/>
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
                      `/metab-renal-vasc-eye/${enrollmentId}/${activeDay}/override-unlock`,
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

      {/* ── Sticky Footer ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={handlePrevious}>
          <ArrowLeft size={15}/> Infect-GI-Hema
        </button>

        {/* Save — always visible when editing */}
        {isFieldEditable && (
          <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSave}>
            <Save size={15}/> Save
          </button>
        )}

        {/* Edit button — enable editing of saved draft */}
        {isSaved && !isEditing && !isSubmitted && !isPastActiveDay && (
          <button
            type="button"
            className="btn btn-edit btn-outline-blue"
            onClick={() => setIsEditing(true)}
            title="Enable editing of saved data"
          >
            <Edit size={13} /> Edit Day {activeDay}
          </button>
        )}

        {/* Submit / status area */}
        {isOverrideActiveDay ? (
          <>
            <div className="rcn-locked-badge rcn-locked-badge--override" title="Temporarily reopened by a site monitor">
              <Unlock size={13} /> Day {activeDay} Reopened (Override)
            </div>
            {canSubmit ? (
              <button type="button" className="btn btn-submit-day" onClick={() => setShowModal(true)}
                title="Submit and lock this day">
                <Shield size={15} /> Submit Day {activeDay}
              </button>
            ) : (
              <button type="button" className="btn btn-draft" onClick={handleSave}>
                <Save size={15} /> Save Correction
              </button>
            )}
          </>
        ) : isSubmitted ? (
          <>
            <div className="rcn-locked-badge"><Lock size={13}/> Day {activeDay} Locked</div>
            {isSuperadmin && (
              <button
                type="button"
                className="rcn-override-btn"
                onClick={() => setShowOverrideModal(true)}
                title="Reopen this submitted day temporarily for a correction"
              >
                <Unlock size={13}/> Override &amp; Unlock
              </button>
            )}
          </>
        ) : isFutureActiveDay ? (
          <div className="rcn-locked-badge" title="Data can only be entered on the day's own calendar date">
            <Lock size={13}/> Day {activeDay} Not Available Yet
          </div>
        ) : isPastActiveDay && isLateGraceActiveDay ? (
          canSubmit ? (
            <button type="button" className="btn btn-submit-day" onClick={() => setShowModal(true)}
              title="Submit and lock this day">
              <Shield size={15}/> Submit Day {activeDay} (Late)
            </button>
          ) : (
            <button type="button" className="btn btn-draft" onClick={handleSave}
              title={`Grace window open until ${MRVE_LATE_GRACE_HOUR}:00 AM`}>
              <Save size={15}/> Save (Late Entry)
            </button>
          )
        ) : isPastActiveDay ? (
          <>
            <div className="rcn-locked-badge" title="This day's window has passed — view only">
              <Lock size={13}/> Day {activeDay} Locked (Past Day)
            </div>
            {isSuperadmin && (
              <button
                type="button"
                className="rcn-override-btn"
                onClick={() => setShowOverrideModal(true)}
                title="Reopen this day temporarily for a correction"
              >
                <Unlock size={13}/> Override &amp; Unlock
              </button>
            )}
          </>
        ) : canSubmit ? (
          <button
            type="button"
            className="btn btn-submit-day"
            onClick={() => setShowModal(true)}
            title="Submit and lock this day"
          >
            <Shield size={15}/> Submit Day {activeDay}
          </button>
        ) : (
          <button type="button" className="btn btn-draft" onClick={handleSave}>
            <Save size={15}/> Save for Later
          </button>
        )}

        <div className="footer-step-indicator">
          <span className="step-text">HELPER 4 OF 4</span>
          <div className="step-progress-line">
            <div className="progress-segment active"/>
            <div className="progress-segment active"/>
            <div className="progress-segment active"/>
            <div className="progress-segment active"/>
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Form F <ArrowRight size={15}/>
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
