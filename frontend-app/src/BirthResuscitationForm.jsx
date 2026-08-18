import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormA.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import NotesBox from "./components/NotesBox";
import PrintSummaryB from "./components/PrintSummaryB";
import { relativeTime, toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import { isUsableEnrollmentId } from "./utils/enrollmentId";
import { classifyVeryPretermCentile } from "./data/intergrowthVeryPreterm";
import {
  ArrowLeft, ArrowRight, Save, Home, User, Baby, Pencil,
  Heart, Activity, BarChart2, Droplets, AlertTriangle, Shuffle,
  Clock,
} from "lucide-react";

/* ── Safe localStorage helpers ──
   localStorage.setItem coerces its value with String(), so
   localStorage.setItem(key, undefined) silently stores the literal
   string "undefined" — which then reads back as truthy and causes
   requests like PUT /birth-resuscitation/undefined. These helpers
   guard against writing a non-value and against trusting a
   previously-corrupted "undefined"/"null" string on read. */
const getStoredId = (key) => {
  const v = localStorage.getItem(key);
  return v && v !== "undefined" && v !== "null" ? v : null;
};
const setStoredId = (key, value) => {
  if (value === undefined || value === null) return;
  // Never persist the Form B typing stub ("01-") as the case enrollment ID.
  if (key === "current_enrollment_id" && !isUsableEnrollmentId(value)) return;
  localStorage.setItem(key, value);
  // Same-tab listeners (Sidebar / FormProgress) only see custom events —
  // native `storage` does not fire in the writing tab.
  if (key === "current_enrollment_id" || key === "current_screening_id") {
    window.dispatchEvent(new Event("storage"));
  }
};
const clearStoredId = (key) => {
  localStorage.removeItem(key);
  if (key === "current_enrollment_id" || key === "current_screening_id") {
    window.dispatchEvent(new Event("storage"));
  }
};

/* ── Inline SVG icon ── */
const Ic = ({ d, s = 15 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);

/* ── Modern HH:MM time stepper ──
   Two boxed segments (hour, minute) you can type into or nudge with the
   up/down chevrons — no dropdown list (unlike react-datepicker's time
   select) and no native <input type="time"> (whose picker UI/AM-PM
   display depends on the browser/OS locale). Always 24-hour by
   construction: hour just wraps 0–23, there's no AM/PM concept at all.
   Seconds are intentionally NOT part of this — kept as their own
   separate field next to it. */
function ModernTimeInput({ hour, minute, second, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const h = hour === "" || hour === undefined || hour === null ? "" : String(hour).padStart(2, "0");
  const m = minute === "" || minute === undefined || minute === null ? "" : String(minute).padStart(2, "0");
  const s = second === "" || second === undefined || second === null ? "" : String(second).padStart(2, "0");
  const display = (h || m || s) ? `${h || "00"}:${m || "00"}:${s || "00"}` : "";

  useEffect(() => {
    if (!open) return;
    const onClickOutside = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minSecOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  const pick = (part, val) => {
    const curH = hour === "" || hour == null ? 0 : Number(hour);
    const curM = minute === "" || minute == null ? 0 : Number(minute);
    const curS = second === "" || second == null ? 0 : Number(second);
    if (part === "h") onChange(Number(val), curM, curS);
    else if (part === "m") onChange(curH, Number(val), curS);
    else onChange(curH, curM, Number(val));
  };

  const Column = ({ part, label, options, current }) => (
    <div className="mt-popover-col">
      <div className="mt-popover-label">{label}</div>
      <div className="mt-popover-list">
        {options.map(v => (
          <div key={v}
            className={`mt-popover-item${current === v ? " mt-popover-item-active" : ""}`}
            onClick={() => pick(part, v)}>{v}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-wrap" ref={wrapRef}>
      <div className={`mt-display${disabled ? " mt-disabled" : ""}`}
        onClick={() => !disabled && setOpen(o => !o)}>
        <span className={`mt-display-value${display ? "" : " mt-display-placeholder"}`}>
          {display || "HH:MM:SS"}
        </span>
        <Clock size={16} className="mt-clock-btn"/>
      </div>
      {open && !disabled && (
        <div className="mt-popover">
          <Column part="h" label="HH" options={hourOptions} current={h}/>
          <Column part="m" label="MM" options={minSecOptions} current={m}/>
          <Column part="s" label="SS" options={minSecOptions} current={s}/>
        </div>
      )}
    </div>
  );
}

/* ── Yes/No toggle identical to Form A ── */
// FIX: this was a stripped-down copy that rendered different class names
// than the ones FormA.css actually styles (yn-active-yes/yn-active-no
// instead of yn-active, and no yn-pos-N wrapper or yn-thumb div at all) —
// so toggle buttons here showed NO visual feedback whatsoever for which
// option was selected: no background highlight, no active text color,
// nothing. Now identical to ScreeningForm.jsx's working version.
function YesNoToggle({
  label, name, value, onChange, disabled = false,
  yesLabel = "YES", noLabel = "NO",
}) {
  const fire = (val) => {
    if (disabled) return;
    onChange({ target: { name, value: val } });
  };
  // 0 = neither selected yet (no slide position), 1 = Yes, 2 = No
  const pos = value === "Yes" ? 1 : value === "No" ? 2 : 0;
  const wide = yesLabel !== "YES" || noLabel !== "NO";
  return (
    <div className={`yes-no-toggle${disabled ? " yn-disabled" : ""}`}>
      <span className="yes-no-label">{label}</span>
      <div className={`yes-no-buttons yn-pos-${pos}${wide ? " yn-wide" : ""}`}>
        <div className="yn-thumb" aria-hidden="true" />
        <button type="button"
          className={`yn-btn yn-yes${value === "Yes" ? " yn-active" : ""}`}
          onClick={() => fire("Yes")} disabled={disabled}>{yesLabel}</button>
        <button type="button"
          className={`yn-btn yn-no${value === "No" ? " yn-active" : ""}`}
          onClick={() => fire("No")} disabled={disabled}>{noLabel}</button>
      </div>
    </div>
  );
}

/* CRF v1.25+ delivery indications (select all that apply) */
const CRF_INDICATIONS = [
  "pPROM", "PTL", "APH", "Placenta Previa", "PIH", "PE/Imminent Eclampsia", "Other",
];

const padDur = n => String(n).padStart(2, "0");
const parseDurationParts = (value, mode) => {
  const parts = String(value || "").split(":");
  const num = (v, max = 99) => {
    if (v === "" || v === undefined) return "";
    const n = Number(v);
    if (Number.isNaN(n)) return "";
    return padDur(Math.min(max, Math.max(0, n)));
  };
  if (mode === "hms") {
    return { hh: num(parts[0], 999), mm: num(parts[1], 59), ss: num(parts[2], 59) };
  }
  return { mm: num(parts[0], 999), ss: num(parts[1], 59) };
};
const formatDurationHms = value => {
  const { hh, mm, ss } = parseDurationParts(value, "hms");
  if (!hh && !mm && !ss) return "";
  return `${hh || "00"}:${mm || "00"}:${ss || "00"}`;
};
const formatDurationMs = value => {
  const { mm, ss } = parseDurationParts(value, "ms");
  if (!mm && !ss) return "";
  return `${mm || "00"}:${ss || "00"}`;
};
const EXIT_REASON_OPTIONS = [
  "Responded to resuscitation",
  "Required override to 100% O2 or CC",
  "Other",
];
const normalizeTimeForInput = value => {
  if (value === "" || value == null) return "";
  const s = String(value).trim();
  // Accept HH:MM[:SS][.fraction], or ISO-ish "...T12:30:45"
  const m = s.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/);
  if (!m) return s;
  const hh = m[1].padStart(2, "0");
  const mm = m[2];
  const ss = (m[3] ?? "00").padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

/** Clock time HH:MM[:SS] → seconds since midnight (null if unusable). */
const clockTimeToSeconds = value => {
  const normalized = normalizeTimeForInput(value);
  if (!normalized) return null;
  const m = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if ([hours, minutes, seconds].some(n => Number.isNaN(n))) return null;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
};

/** Elapsed cord-clamp seconds from birth clock → clamp clock (wrap past midnight). */
const cordClampElapsedSeconds = (timeOfBirth, cordClampedAt) => {
  const birth = clockTimeToSeconds(timeOfBirth);
  const clamp = clockTimeToSeconds(cordClampedAt);
  if (birth === null || clamp === null) return null;
  let elapsed = clamp - birth;
  if (elapsed < 0) elapsed += 86400;
  return elapsed;
};

function DurationColumn({ label, options, active, onPick, listRef }) {
  return (
    <div className="duration-picker-col">
      <div className="duration-picker-col-label">{label}</div>
      <div className="duration-picker-col-list" ref={listRef}>
        {options.map(opt => (
          <button key={opt} type="button"
            data-value={opt}
            className={`duration-picker-col-item${active === opt ? " is-active" : ""}`}
            onClick={() => onPick(opt)}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Duration picker (HH:MM:SS or MM:SS) ──
   Scroll-column picker paired with a free-text input. */
function DurationPicker({ mode = "hms", value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const hhListRef = useRef(null);
  const mmListRef = useRef(null);
  const ssListRef = useRef(null);

  useEffect(() => {
    const onDocClick = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const parts = parseDurationParts(value, mode);
  const hh = mode === "hms" ? parts.hh : "";
  const mm = mode === "hms" ? parts.mm : parts.mm;
  const ss = parts.ss;

  const apply = (which, v) => {
    const nHh = which === "hh" ? v : hh;
    const nMm = which === "mm" ? v : mm;
    const nSs = which === "ss" ? v : ss;
    onChange(mode === "hms"
      ? `${nHh || "00"}:${nMm || "00"}:${nSs || "00"}`
      : `${nMm || "00"}:${nSs || "00"}`);
  };

  const hourOpts = Array.from({ length: 100 }, (_, i) => padDur(i));
  const minSecOpts = Array.from({ length: 60 }, (_, i) => padDur(i));
  const preview = mode === "hms"
    ? `${hh || "00"}:${mm || "00"}:${ss || "00"}`
    : `${mm || "00"}:${ss || "00"}`;

  useEffect(() => {
    if (!open) return;
    [hhListRef, mmListRef, ssListRef].forEach(ref => {
      const active = ref.current?.querySelector(".is-active");
      active?.scrollIntoView({ block: "center" });
    });
  }, [open, hh, mm, ss]);

  return (
    <div className="duration-picker-wrap" ref={wrapRef}>
      <button type="button" title="Pick duration" disabled={disabled}
        className={`duration-picker-btn${open ? " is-open" : ""}`}
        onClick={() => !disabled && setOpen(o => !o)}>
        <Ic d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </button>
      {open && !disabled && (
        <div className="duration-picker-panel">
          <div className="duration-picker-preview">{preview}</div>
          <div className="duration-picker-columns">
            {mode === "hms" && (
              <>
                <DurationColumn label="HH" options={hourOpts} active={hh || "00"}
                  listRef={hhListRef} onPick={v => apply("hh", v)} />
                <span className="duration-picker-sep">:</span>
              </>
            )}
            <DurationColumn label="MM" options={minSecOpts} active={mm || "00"}
              listRef={mmListRef} onPick={v => apply("mm", v)} />
            <span className="duration-picker-sep">:</span>
            <DurationColumn label="SS" options={minSecOpts} active={ss || "00"}
              listRef={ssListRef} onPick={v => apply("ss", v)} />
          </div>
          <div className="duration-picker-actions">
            <button type="button" className="duration-picker-clear"
              onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
            <button type="button" className="duration-picker-done"
              onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DurationField({ mode, name, value, onChange, disabled, placeholder, maxLength, hasError }) {
  const pattern = mode === "hms"
    ? /^\d{0,3}:?[0-5]?\d?:?[0-5]?\d?$/
    : /^\d{0,3}:?[0-5]?\d?$/;
  const formatOnBlur = () => {
    if (!value) return;
    const formatted = mode === "hms" ? formatDurationHms(value) : formatDurationMs(value);
    if (formatted !== value) onChange(formatted);
  };

  return (
    <div className="duration-field">
      <input type="text" name={name} value={value || ""}
        inputMode="numeric" maxLength={maxLength} placeholder={placeholder}
        readOnly={disabled}
        className={`duration-field-input${hasError ? " input-error" : ""}`}
        onChange={e => { const v = e.target.value; if (pattern.test(v)) onChange(v); }}
        onBlur={formatOnBlur}/>
      <DurationPicker mode={mode} value={value} disabled={disabled} onChange={onChange}/>
    </div>
  );
}

/* ── Intervention select cell ── */
function IntvCell({ value, disabled, onChange }) {

  return (
    <select value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)}
      style={{ width:54, padding:"4px 2px", fontSize:11, borderRadius:5,
               border:"1px solid #e5e7eb", textAlign:"center", fontFamily:"inherit" }}>
      <option value="">—</option>
      <option value="Yes">Y</option>
      <option value="No">N</option>
      <option value="NR">NR</option>
    </select>
  );
}

export default function BirthResuscitationForm() {
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { screeningId } = useParams();
  const [confirmedEnrollmentId, setConfirmedEnrollmentId] = useState(null);
  const { updatePatientData } = usePatient();

  /* ── State ── */
  const [errors,           setErrors]           = useState({});
  const [isSaved,          setIsSaved]          = useState(false);
  const [isEditing,        setIsEditing]        = useState(false);
  const [isFormBLoaded,    setIsFormBLoaded]    = useState(false);
  const [message,          setMessage]          = useState("");
  const [missingFields,    setMissingFields]    = useState([]);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [autoSaveStatus,   setAutoSaveStatus]   = useState("idle");
  const [lastSaved,        setLastSaved]        = useState(null);
  const [isDirty,          setIsDirty]          = useState(false);
  const [isOnline,         setIsOnline]         = useState(navigator.onLine);
  const [offlineQueue,    setOfflineQueue]     = useState(false);
  const [showDraftModal,  setShowDraftModal]   = useState(false);
  const [siteName,        setSiteName]          = useState("");
  const SITE_ID_MAP = {
    PGIMER: "01", GMCH: "02", IOG: "03", AFMC: "04", "GMCH-A": "05", AMC: "06",
  };
  const siteCode = SITE_ID_MAP[siteName] || "00";
  /** Format enrollment ID as `{site}-{A|B|C|D}-{###}` with site autofilled. */
  const formatEnrollmentId = (raw, site = siteCode) => {
    const site2 = String(site || "00").padStart(2, "0").slice(0, 2);
    let cleaned = String(raw || "").toUpperCase().replace(/[^A-D0-9]/g, "");
    if (cleaned.startsWith(site2)) cleaned = cleaned.slice(2);
    else if (/^\d{2}/.test(cleaned)) cleaned = cleaned.slice(2);
    let letter = "";
    let nums = "";
    for (const ch of cleaned) {
      if (!letter && /[A-D]/.test(ch)) letter = ch;
      else if (letter && /[0-9]/.test(ch) && nums.length < 3) nums += ch;
    }
    if (!letter) return `${site2}-`;
    if (!nums) return `${site2}-${letter}-`;
    return `${site2}-${letter}-${nums}`;
  };
  const isCompleteEnrollmentId = (v) => /^\d{2}-[A-D]-\d{3}$/.test(String(v || "").trim());
  const autoSaveTimer   = useRef(null);
  const lastSavedTimer = useRef(null);
  const isInitialRender = useRef(true);
  const formDataRef = useRef(null);
  const buildPayloadRef = useRef(null);
  const isFormBLoadedRef = useRef(false);
  const autoSaveRef = useRef(null);
  const offlineQueueRef = useRef(false);
  /* True only after GET /birth-resuscitation succeeded — so autosave knows
     whether to PUT an existing row or POST a new one. */
  const hasBirthRecordRef = useRef(false);
  const isFieldEditable = !isSaved || isEditing;
  const isPgiSite = siteName === "PGIMER";
  const requiredMark = <span className="required">*</span>;
  const BABY_ADMISSION_RULES = {
    PGIMER: { label: "6. Baby Admission No.", placeholder: "10-digit admission number", min: 10, max: 10, required: true },
    "GMCH-A": { label: "6. MRD Number for Baby", placeholder: "4-6 digit MRD number", min: 4, max: 6 },
    AMC: { label: "6. Baby Admission No. (NICU only)", placeholder: "11-digit admission number if NICU admitted", min: 11, max: 11 },
    GMCH: { label: "6. Baby Admission No.", placeholder: "9-11 digit number", min: 9, max: 11 },
    IOG: { label: "6. Baby MRD No. (same as UID)", placeholder: "Auto-filled from Baby UID, 4-6 digits", min: 4, max: 6 },
  };
  const babyAdmissionRule = BABY_ADMISSION_RULES[siteName] || {
    label: "6. Baby Admission No.",
    placeholder: "Optional",
    min: 0,
    max: 15,
  };
  const babyAdmissionLabel = babyAdmissionRule.required
    ? <>{babyAdmissionRule.label}{requiredMark}</>
    : babyAdmissionRule.label;

  // "Baby Annual No." means something different per site — not just a
  // REDCap-only PGIMER field. GMCH-A has no equivalent number at all;
  // AMC's is really the delivery room logbook serial; IOG's is the SNCU
  // number. Sites with no entry here (GMCH-A, GMCH) don't show the field.
  const BABY_ANNUAL_RULES = {
    PGIMER: { label: "7. Baby Annual No.", placeholder: "4-digit annual number", min: 4, max: 4, numeric: true },
    AMC:    { label: "7. Delivery Room Logbook Serial No.", placeholder: "Logbook serial number", min: 0, max: 20, numeric: false },
    IOG:    { label: "7. SNCU No.", placeholder: "4-digit SNCU number", min: 4, max: 4, numeric: true },
  };
  const babyAnnualRule = BABY_ANNUAL_RULES[siteName] || null;

  const BLANK = {
    /* B1 */
    screening_id:"", enrollment_id:"", screening_datetime:"",
    mother_name_first:"", mother_name_surname:"", maternal_uid:"",
    contact_mother:"", contact_husband:"",
    baby_uid:"", baby_admission_no:"", baby_annual_no:"",
    /* B2 */
    date_of_birth:"", time_of_birth:"",
    gestation_weeks:"", gestation_days:"",
    gestation_rand_weeks:"", gestation_rand_days:"",  // auto-calc from DOB
    birth_weight:"", intrauterine_centile:"", gender:"",
    delivery_mode:"", vaginal_delivery_type:"", lscs_type:"",
    indication_for_delivery:[], indication_for_delivery_other:"",
    indication_edf_detail:"", fetal_indication_detail:"", obstetric_indication_detail:"",
    maternal_complication:"",
    /* B3 — hr_below_100 is CRF Q21 (HR < 100); stored inverted as hr_above_100 */
    poor_resp_efforts:"", poor_muscle_tone:"", hr_below_100:"",
    initial_steps:"", required_resuscitation:"",
    randomised:"", randomisation_date:"", strata:"", blender_letter:"",
    enrollment_reason_not_randomized:"", enrollment_reason_not_randomized_other:"",
    /* B4 */
    ppv_required:"",
    // SIB fields
    sib_peep_with:"", sib_peep_cmh2o:"",
    // T-piece fields
    tpiece_pip:"", tpiece_peep:"", tpiece_flow:"",
    interface_used:"", ppv_duration:"", device_ppv:"",
    intubation:"",
    chest_compression:"", cc_duration:"",
    adrenaline:"", adrenaline_dilution:"", adrenaline_route:"",
    med_doses:"", adrenaline_cumulative:"",
    fluid_bolus:"", fluid_bolus_doses:"", fluid_bolus_cumulative:"",
    placental_transfusion:"", transfusion_method:"",
    cord_clamp_timestamp:"", cord_clamp_time:"",
    time_to_respiration:"",
    spo2_5min:"", time_to_spo2_80:"",
    /* B6 */
    cord_blood_done:"", cord_blood_within_1hr:"", cord_blood_source:"",
    cord_ph:"", cord_sbe:"", cord_pco2:"",
    resus_failure:"",
    spo2_exit_trial_gas:"", total_resus_time:"",
    reason_exit_trial_gas:"", reason_exit_trial_gas_other:"",
    blender_stopped:"", blender_stopped_description:"",
    /* B5 intervention table — Oxygen, CPAP, Apgar only (CRF 48–50) */
    interventions:{
      oxygen:{}, cpap:{}, apgar:{},
    },
  };
  const [formData, setFormData] = useState(BLANK);
  // Live check (not just at Save) — birth can't be recorded as happening
  // before the mother was even screened.
  const birthBeforeScreening = (() => {
    if (!formData.date_of_birth || !formData.time_of_birth || !formData.screening_datetime) return false;
    const birthMoment     = new Date(`${formData.date_of_birth}T${formData.time_of_birth}`);
    const screeningMoment = new Date(formData.screening_datetime);
    if (isNaN(birthMoment) || isNaN(screeningMoment)) return false;
    return birthMoment < screeningMoment;
  })();
  const set = patch => setFormData(p => ({ ...p, ...patch }));
  const handleChange = e => set({ [e.target.name]: e.target.value });

  // Native <input type="time"> defers to the OS/browser locale for its
  // picker UI, which shows AM/PM on many Windows/US-locale setups even
  // though the stored value is 24-hour — lang="en-GB" doesn't reliably
  // override this across Chrome versions. This formats a plain text field
  // into a guaranteed 24-hour HH:MM (or HH:MM:SS) value as the user types.
  // Digit-by-digit formatting is no longer needed for time_of_birth/
  // cord_clamp_timestamp — replaced by the dropdown picker below.

  // Plain HH:MM:SS string helpers backing ModernTimeInput (all three
  // segments now live in the picker itself).
  const getTimePart = (field, part) => {
    const normalized = normalizeTimeForInput(formData[field] || "");
    const [hh, mm, ss] = (normalized || "").split(":");
    return part === "h" ? (hh ?? "") : part === "m" ? (mm ?? "") : (ss ?? "");
  };
  const handleTimeChange = (field, newH, newM, newS) => {
    const hh = newH === null ? "" : String(newH).padStart(2, "0");
    const mm = newM === null ? "" : String(newM).padStart(2, "0");
    const ss = newS === null ? "" : String(newS).padStart(2, "0");
    const next = (hh || mm || ss) ? `${hh || "00"}:${mm || "00"}:${ss || "00"}` : "";
    // Update time + auto-fill field 44 in one write so 44 never stays blank
    // after 43 is entered (also covers HH:MM / ISO time_of_birth from API).
    // Only store elapsed when clinically valid (0–300s); larger values (e.g.
    // midnight-wrap mis-entry) must not autosave or the API returns 422.
    setFormData(p => {
      const updated = { ...p, [field]: next };
      if (field === "time_of_birth" || field === "cord_clamp_timestamp") {
        const birth = field === "time_of_birth" ? next : updated.time_of_birth;
        const clamp = field === "cord_clamp_timestamp" ? next : updated.cord_clamp_timestamp;
        const elapsed = cordClampElapsedSeconds(birth, clamp);
        if (elapsed !== null && elapsed >= 0 && elapsed <= 300) {
          updated.cord_clamp_time = String(elapsed);
        } else if (elapsed !== null) {
          updated.cord_clamp_time = "";
        }
      }
      return updated;
    });
  };

  const endParticipation = formData.required_resuscitation === "No";
  const times = ["1","5","10","15","20"];
  const yn  = v => v === "Yes" ? true : v === "No" ? false : null;
  const num = v => v === "" ? 0 : Number(v);
  const optionalNum = v => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  /** Autosave-safe: omit out-of-range values so draft PUTs don't 422. */
  const optionalNumInRange = (v, min, max) => {
    const n = optionalNum(v);
    if (n === null) return null;
    if (n < min || n > max) return null;
    return n;
  };
  const durationToSeconds = value => {
    if (value === "" || value === null || value === undefined) return null;
    const match = String(value).match(/^(\d{1,3}):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  // HH:MM:SS -> total seconds (field 48 — no separate day/hour breakout needed,
  // hours simply keeps counting past 23 for durations longer than a day)
  const durationHmsToSeconds = value => {
    if (value === "" || value === null || value === undefined) return null;
    const match = String(value).match(/^(\d{1,3}):([0-5]?\d):([0-5]?\d)$/);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  };
  const secondsToDurationHms = value => {
    if (value === "" || value === null || value === undefined) return "";
    const total = Number(value);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (siteName === "IOG" && formData.baby_admission_no !== formData.baby_uid) {
      set({ baby_admission_no: formData.baby_uid || "" });
    }
  }, [siteName, formData.baby_uid, formData.baby_admission_no]); // eslint-disable-line
  const secondsToDuration = value => {
    if (value === "" || value === null || value === undefined) return "";
    const total = Number(value);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  /* ── Gestation at randomization (screening GA + elapsed calendar days) ── */
  useEffect(() => {
    if (!formData.date_of_birth || !formData.screening_datetime || !formData.gestation_weeks) return;
    const screeningGA = Number(formData.gestation_weeks) * 7 + Number(formData.gestation_days || 0);
    const screeningDay = new Date(formData.screening_datetime);
    const birthDay = new Date(`${formData.date_of_birth}T00:00:00`);
    screeningDay.setHours(0, 0, 0, 0);
    birthDay.setHours(0, 0, 0, 0);
    const elapsedDays = Math.max(0, Math.round((birthDay - screeningDay) / 86400000));
    const randomisationGA = screeningGA + elapsedDays;
    const randW = Math.floor(randomisationGA / 7);
    const randD = randomisationGA % 7;
    set({ gestation_rand_weeks: randW, gestation_rand_days: randD });
  }, [formData.date_of_birth, formData.screening_datetime, formData.gestation_weeks, formData.gestation_days]); // eslint-disable-line

  /* ── Intrauterine growth centile (auto, INTERGROWTH-21st Very Preterm) ──
     Uses GA at randomization (= GA at birth) + birth weight + gender against
     the official INTERGROWTH-21st Very Preterm birthweight reference
     (Villar et al. Lancet 2016) to auto-fill field 14. Only covers 24+0-32+6
     weeks and Male/Female — outside that (later GA, or DSD) the field is
     left for manual entry, since this specific chart doesn't apply.
     Tracks the last value it auto-set so a nurse's own manual override is
     never silently clobbered on a later re-render. */
  const lastAutoCentileRef = useRef(null);
  useEffect(() => {
    const weeks = Number(formData.gestation_rand_weeks);
    const days  = Number(formData.gestation_rand_days);
    const weightKg = Number(formData.birth_weight) / 1000;
    const result = classifyVeryPretermCentile(weightKg, weeks, days, formData.gender);
    const current = formData.intrauterine_centile;
    const wasUntouchedOrAuto = current === "" || current === lastAutoCentileRef.current;

    if (!result) {
      // FIX: out of chart range (or missing inputs) — previously this just
      // returned and left whatever number was auto-filled earlier sitting
      // in the field, which looks like a valid answer even though the GA
      // has since moved outside 24+0-32+6 weeks (e.g. after correcting
      // Date of Birth). Clear it, but only if it's a value WE auto-set —
      // never touch something the nurse typed in manually.
      if (wasUntouchedOrAuto && current !== "") set({ intrauterine_centile: "" });
      lastAutoCentileRef.current = null;
      return;
    }

    const autoValue = String(result.lowerPoint);
    if (wasUntouchedOrAuto && current !== autoValue) {
      set({ intrauterine_centile: autoValue });
    }
    lastAutoCentileRef.current = autoValue;
  }, [formData.gestation_rand_weeks, formData.gestation_rand_days, formData.birth_weight, formData.gender]); // eslint-disable-line

  /* ── Strata — auto-derived from Gestation at Randomization ──
     Strata buckets exist purely to split the two eligible GA bands (24–27+6
     vs 28–31+6 weeks); since that number is already computed above from
     data already on file, there's no reason to make the nurse pick it
     manually — that's just a second chance to enter it wrong. Only fills
     in once GA-at-randomization is actually known, and never overwrites a
     value already loaded from a saved record (e.g. one entered before this
     was automated, or a legacy manual edit) unless it's inconsistent with
     the computed GA, so we don't fight a genuine correction. */
  useEffect(() => {
    if (formData.randomised !== "Yes") return;
    if (formData.gestation_rand_weeks === "" || formData.gestation_rand_weeks === null) return;
    const totalDays = Number(formData.gestation_rand_weeks) * 7 + Number(formData.gestation_rand_days || 0);
    const computedStrata = totalDays < (28 * 7) ? "< 28 weeks" : "≥ 28 – 31 weeks";
    if (formData.strata !== computedStrata) set({ strata: computedStrata });
  }, [formData.randomised, formData.gestation_rand_weeks, formData.gestation_rand_days]); // eslint-disable-line

  /* ── Cord-clamping time in seconds from birth (field 44) ── */
  useEffect(() => {
    const elapsed = cordClampElapsedSeconds(
      formData.time_of_birth,
      formData.cord_clamp_timestamp,
    );
    if (elapsed === null) return;
    const valid = elapsed >= 0 && elapsed <= 300;
    const asStr = valid ? String(elapsed) : "";
    if (String(formData.cord_clamp_time ?? "") === asStr) {
      setErrors(p => ({
        ...p,
        cord_clamp_time: valid ? "" : "Must be ≤ 300 sec",
      }));
      return;
    }
    set({ cord_clamp_time: asStr });
    setErrors(p => ({
      ...p,
      cord_clamp_time: valid ? "" : "Must be ≤ 300 sec",
    }));
  }, [formData.time_of_birth, formData.cord_clamp_timestamp]); // eslint-disable-line

  /* ── Online / Offline detection ── */
  useEffect(() => {
    const goOnline  = () => {
      setIsOnline(true);
      // If we had a queued save, flush it now (autoSave read via ref to
      // avoid a temporal-dead-zone reference to the const defined below).
      if (offlineQueueRef.current) {
        setOfflineQueue(false);
        autoSaveRef.current?.();
      }
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  /* ── Unsaved changes — warn on tab close / navigate away ── */
  useEffect(() => {
    const handler = e => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* ── Mark form dirty only after user edits (not on initial load / readonly) ── */
  useEffect(() => {
    if (!isFormBLoaded) return;
    if (isInitialRender.current) { isInitialRender.current = false; return; }
    if (isSaved && !isEditing) return;
    setIsDirty(true);
  }, [formData, isFormBLoaded, isSaved, isEditing]); // eslint-disable-line

  /* ── Refresh "last saved X mins ago" every 30 seconds ── */
  useEffect(() => {
    lastSavedTimer.current = setInterval(() => {
      // force re-render to update the relative time string
      setLastSaved(prev => prev ? new Date(prev) : prev);
    }, 30000);
    return () => clearInterval(lastSavedTimer.current);
  }, []);

  /* ── Relative time ── */
  const relT = relativeTime;

  /* ── Apgar colour ── */
  const apgarCls = v => {
    if(!v&&v!==0)return""; const n=Number(v);
    if(n<=3)return"apgar-red"; if(n<=6)return"apgar-yellow"; return"apgar-green";
  };

  const handleIntv = (type, time, val) =>
    setFormData(p => ({
      ...p,
      interventions: {
        ...p.interventions,
        [type]: { ...(p.interventions?.[type] || {}), [time]: val },
      },
    }));

   /* ── Shared payload builder (used by saveForm, saveDraft, autoSave) ──
      Drafts and auto-saves are just unvalidated saves: empty fields are sent
      as null (all columns are nullable) rather than fabricated sentinel
      values, so partially-filled forms persist without corrupting clinical
      data or tripping the backend range validators. */
  const buildPayloadFrom = useCallback((fd) => {
    return {
      screening_id:        fd.screening_id || null,
      enrollment_id:       fd.enrollment_id || null,
      mother_name_first:   fd.mother_name_first || null,
      mother_name_surname: fd.mother_name_surname || null,
      maternal_uid:        fd.maternal_uid || null,
      contact_mother:      fd.contact_mother || null,
      contact_husband:     fd.contact_husband || null,
      baby_uid:            fd.baby_uid || null,
      baby_admission_no:   fd.baby_admission_no || null,
      baby_annual_no:      fd.baby_annual_no || null,
      gestation_weeks:     optionalNumInRange(fd.gestation_weeks, 18, 42),
      gestation_days:      optionalNumInRange(fd.gestation_days, 0, 6),
      gestation_rand_weeks: optionalNumInRange(fd.gestation_rand_weeks, 18, 42),
      gestation_rand_days: optionalNumInRange(fd.gestation_rand_days, 0, 6),
      birth_weight:        optionalNumInRange(fd.birth_weight, 300, 6000),
      intrauterine_centile: fd.intrauterine_centile || null,
      date_of_birth:       fd.date_of_birth
        ? String(fd.date_of_birth).slice(0, 10) : null,
      time_of_birth:       fd.time_of_birth || null,
      gender:              fd.gender || null,
      indication_for_delivery: (fd.indication_for_delivery || []).join(", ") || null,
      indication_for_delivery_other: fd.indication_for_delivery_other || null,
      indication_edf_detail: fd.indication_edf_detail || null,
      fetal_indication_detail: fd.fetal_indication_detail || null,
      obstetric_indication_detail: fd.obstetric_indication_detail || null,
      delivery_mode:       fd.delivery_mode || null,
      vaginal_delivery_type: fd.vaginal_delivery_type || null,
      lscs_type:           fd.lscs_type || null,
      maternal_complication: fd.maternal_complication || null,
      poor_resp_efforts:   yn(fd.poor_resp_efforts),
      poor_muscle_tone:    yn(fd.poor_muscle_tone),
      /* CRF asks HR < 100; DB column remains hr_above_100 (inverted). */
      hr_above_100:        fd.hr_below_100 === "Yes" ? false
                          : fd.hr_below_100 === "No" ? true
                          : null,
      initial_steps:       yn(fd.initial_steps),
      required_resuscitation: yn(fd.required_resuscitation),
      /* Q23 Required implies PPV (Q29 details) — store as true on that path */
      ppv_required:        fd.required_resuscitation === "Yes" ? true : yn(fd.ppv_required),
      device_ppv:          fd.device_ppv || null,
      sib_peep_with:       fd.sib_peep_with || null,
      sib_peep_cmh2o:      optionalNum(fd.sib_peep_cmh2o),
      tpiece_pip:          optionalNum(fd.tpiece_pip),
      tpiece_peep:         optionalNum(fd.tpiece_peep),
      tpiece_flow:         optionalNum(fd.tpiece_flow),
      interface_used:      fd.interface_used || null,
      intubation:          yn(fd.intubation),
      chest_compression:   yn(fd.chest_compression),
      ppv_duration:        optionalNum(fd.ppv_duration),
      cc_duration:         optionalNum(fd.cc_duration),
      adrenaline:          yn(fd.adrenaline),
      adrenaline_dilution: fd.adrenaline_dilution || null,
      adrenaline_route:    fd.adrenaline_route || null,
      med_doses:           optionalNum(fd.med_doses),
      adrenaline_cumulative: optionalNum(fd.adrenaline_cumulative),
      fluid_bolus:         yn(fd.fluid_bolus),
      fluid_bolus_doses:   optionalNum(fd.fluid_bolus_doses),
      fluid_bolus_cumulative: optionalNum(fd.fluid_bolus_cumulative),
      placental_transfusion: yn(fd.placental_transfusion),
      transfusion_method:  fd.transfusion_method || null,
      cord_clamp_timestamp: fd.cord_clamp_timestamp || null,
      cord_clamp_time:     optionalNumInRange(fd.cord_clamp_time, 0, 300),
      time_to_respiration: durationHmsToSeconds(formatDurationHms(fd.time_to_respiration)),
      spo2_5min:           optionalNumInRange(fd.spo2_5min, 1, 100),
      time_to_spo2_80:     durationToSeconds(formatDurationMs(fd.time_to_spo2_80)),
      randomised:          yn(fd.randomised),
      strata:              fd.strata || null,
      randomisation_date:  fd.randomisation_date
        ? String(fd.randomisation_date).slice(0, 10) : null,
      enrollment_reason_not_randomized: fd.enrollment_reason_not_randomized || null,
      enrollment_reason_not_randomized_other: fd.enrollment_reason_not_randomized_other || null,
      resus_failure:       yn(fd.resus_failure),
      cord_blood_done:     yn(fd.cord_blood_done),
      cord_blood_within_1hr: yn(fd.cord_blood_within_1hr),
      cord_blood_source:   fd.cord_blood_source || null,
      cord_ph:             optionalNumInRange(fd.cord_ph, 6.8, 7.8),
      cord_sbe:            optionalNumInRange(fd.cord_sbe, -30, 30),
      cord_pco2:           optionalNumInRange(fd.cord_pco2, 0, 200),
      spo2_exit_trial_gas: optionalNumInRange(fd.spo2_exit_trial_gas, 1, 100),
      total_resus_time:    (() => {
        const formatted = formatDurationMs(fd.total_resus_time);
        return formatted || null;
      })(),
      reason_exit_trial_gas: fd.reason_exit_trial_gas==="Other"
        ? fd.reason_exit_trial_gas_other : fd.reason_exit_trial_gas,
      blender_stopped:     yn(fd.blender_stopped),
      blender_stopped_description: fd.blender_stopped_description || null,
      interventions:       {
        oxygen: fd.interventions?.oxygen || {},
        cpap: fd.interventions?.cpap || {},
        apgar: fd.interventions?.apgar || {},
      },
    };
  }, []);

  const buildPayload = useCallback(
    () => buildPayloadFrom(formData),
    [formData, buildPayloadFrom]
  );

  formDataRef.current = formData;
  buildPayloadRef.current = buildPayload;
  isFormBLoadedRef.current = isFormBLoaded;
  offlineQueueRef.current = offlineQueue;

  /* ── Validate ── */
  const validate = () => {
    const m = [];
    const add = (label,field) => m.push({label,fieldName:field});
    if(!formData.baby_uid)           add("B1. Baby UID",              "baby_uid");
    if(babyAdmissionRule.required && !formData.baby_admission_no)
      add("B1. Baby Admission No.", "baby_admission_no");
    if(formData.baby_admission_no && !new RegExp(`^\\d{${babyAdmissionRule.min},${babyAdmissionRule.max}}$`).test(formData.baby_admission_no))
      add(`B1. ${babyAdmissionRule.label.replace(/^6\\.\\s*/, "")} must be ${babyAdmissionRule.min === babyAdmissionRule.max ? `${babyAdmissionRule.max}` : `${babyAdmissionRule.min}-${babyAdmissionRule.max}`} digits`, "baby_admission_no");
    if(babyAnnualRule && babyAnnualRule.numeric && formData.baby_annual_no && !new RegExp(`^\\d{${babyAnnualRule.min},${babyAnnualRule.max}}$`).test(formData.baby_annual_no))
      add(`B1. ${babyAnnualRule.label.replace(/^7\.\s*/, "")} must be ${babyAnnualRule.max} digits`, "baby_annual_no");
    if(!formData.date_of_birth)      add("B2. Date of Birth",         "date_of_birth");
    if(!formData.time_of_birth)      add("B2. Time of Birth",         "time_of_birth");
    if(!formData.birth_weight)       add("B2. Birth Weight",          "birth_weight");
    if(formData.birth_weight && (Number(formData.birth_weight)<300 || Number(formData.birth_weight)>6000))
      add("B2. Birth Weight must be 300–6000 g", "birth_weight");
    if(formData.date_of_birth && new Date(`${formData.date_of_birth}T00:00:00`) > new Date())
      add("B2. Date of Birth cannot be in the future", "date_of_birth");
    if(formData.date_of_birth && formData.time_of_birth && formData.screening_datetime) {
      const birthMoment     = new Date(`${formData.date_of_birth}T${formData.time_of_birth}`);
      const screeningMoment = new Date(formData.screening_datetime);
      if (!isNaN(birthMoment) && !isNaN(screeningMoment) && birthMoment < screeningMoment)
        add("B2. Date & Time of Birth cannot be before the Screening Date & Time (Form A)", "time_of_birth");
    }
    if(!formData.gender)             add("B2. Gender",                "gender");
    if(formData.intrauterine_centile!=="" && (Number(formData.intrauterine_centile)<0 || Number(formData.intrauterine_centile)>100))
      add("B2. Intrauterine centile must be 0–100", "intrauterine_centile");
    if(!formData.delivery_mode)      add("B2. Delivery Mode",         "delivery_mode");
    if(formData.delivery_mode==="Vaginal" && !formData.vaginal_delivery_type)
      add("B2. Vaginal Delivery Type", "vaginal_delivery_type");
    if(formData.delivery_mode==="LSCS" && !formData.lscs_type)
      add("B2. LSCS Type", "lscs_type");
    if(!(formData.indication_for_delivery||[]).length)
      add("B2. Indication for Delivery", "indication_for_delivery");
    if((formData.indication_for_delivery||[]).includes("Other") && !formData.indication_for_delivery_other)
      add("B2. Other Delivery Indication", "indication_for_delivery_other");
    if(!formData.poor_resp_efforts)  add("B3. Respiratory Effort",    "poor_resp_efforts");
    if(!formData.poor_muscle_tone)   add("B3. Muscle Tone",           "poor_muscle_tone");
    if(!formData.hr_below_100)       add("B3. HR < 100",              "hr_below_100");
    if(!formData.initial_steps)      add("B3. Initial Steps",         "initial_steps");
    // Q23 only when initial steps = Required
    if(formData.initial_steps==="Yes" && !formData.required_resuscitation)
      add("B3. Does baby require ventilation (PPV)?", "required_resuscitation");
    if(formData.required_resuscitation==="Yes"){
      if(!formData.randomised)       add("B3. Randomised?",           "randomised");
      if(formData.randomised==="Yes"){
        if(!formData.enrollment_id)  add("B3. Enrollment ID",         "enrollment_id");
        else if(!isCompleteEnrollmentId(formData.enrollment_id))
          add(`B3. Enrollment ID must be ${siteCode}-A-001`, "enrollment_id");
        if(!formData.randomisation_date) add("B3. Randomization Date","randomisation_date");
        if(!formData.strata)        add("B3. Strata",                 "strata");
      }
      if(formData.randomised==="No" && !formData.enrollment_reason_not_randomized)
        add("B3. Reason Not Randomized","enrollment_reason_not_randomized");
      if(formData.randomised==="No" && formData.enrollment_reason_not_randomized==="Other" && !formData.enrollment_reason_not_randomized_other)
        add("B3. Other Reason Not Randomized", "enrollment_reason_not_randomized_other");
      if(formData.randomised!=="No"){
      if(!formData.device_ppv)
        add("B4. PPV Device", "device_ppv");
      if(!formData.interface_used)
        add("B4. PPV Interface", "interface_used");
      if(!formData.ppv_duration)
        add("B4. PPV Duration", "ppv_duration");
      if(["Self-inflating bag","Both"].includes(formData.device_ppv) && !formData.sib_peep_with)
        add("B4. SIB PEEP Valve", "sib_peep_with");
      if(formData.sib_peep_with==="Yes" && !formData.sib_peep_cmh2o)
        add("B4. SIB PEEP Value", "sib_peep_cmh2o");
      if(["T-piece","Both"].includes(formData.device_ppv)){
        if(!formData.tpiece_pip) add("B4. T-piece PIP", "tpiece_pip");
        if(!formData.tpiece_peep) add("B4. T-piece PEEP", "tpiece_peep");
        if(!formData.tpiece_flow) add("B4. T-piece Flow", "tpiece_flow");
      }
      if(!formData.intubation)      add("B4. Endotracheal Intubation", "intubation");
      if(!formData.chest_compression) add("B4. Chest Compressions",  "chest_compression");
      if(formData.chest_compression==="Yes" && !formData.cc_duration)
        add("B4. Duration of Chest Compressions", "cc_duration");
      if(!formData.adrenaline)      add("B4. Epinephrine",            "adrenaline");
      if(formData.adrenaline==="Yes" && !formData.adrenaline_dilution)
        add("B4. Epinephrine Dilution", "adrenaline_dilution");
      if(formData.adrenaline==="Yes" && !formData.adrenaline_route)
        add("B4. Epinephrine Route", "adrenaline_route");
      if(!formData.fluid_bolus)     add("B4. Fluid Bolus",            "fluid_bolus");
      if(formData.fluid_bolus==="Yes" && !formData.fluid_bolus_doses)
        add("B4. Fluid Bolus Doses", "fluid_bolus_doses");
      if(formData.fluid_bolus==="Yes" && !formData.fluid_bolus_cumulative)
        add("B4. Fluid Bolus Cumulative Volume/Dose", "fluid_bolus_cumulative");
      if(!formData.placental_transfusion) add("B4. Placental Transfusion", "placental_transfusion");
      if(!formData.transfusion_method)
        add("B4. Placental Transfusion Method", "transfusion_method");
      if(!formData.cord_clamp_timestamp)
        add("B4. Cord Clamp Timestamp", "cord_clamp_timestamp");
      if(formData.time_to_respiration && durationHmsToSeconds(formatDurationHms(formData.time_to_respiration))===null)
        add("B4. Time to Respiratory Efforts must be HH:MM:SS", "time_to_respiration");
      if(formData.time_to_spo2_80 && durationToSeconds(formatDurationMs(formData.time_to_spo2_80))===null)
        add("B4. Time to SpO2 >80% must be MM:SS", "time_to_spo2_80");
      if(formData.total_resus_time && durationToSeconds(formatDurationMs(formData.total_resus_time))===null)
        add("B6. Total time from APGAR timer must be MM:SS", "total_resus_time");
      if(!formData.cord_blood_done) add("B6. Cord Blood Analysis",     "cord_blood_done");
      if(formData.cord_blood_done==="No" && !formData.cord_blood_within_1hr)
        add("B6. Sample Within 1 Hour", "cord_blood_within_1hr");
      if(formData.cord_blood_done==="No" && formData.cord_blood_within_1hr==="Yes"){
        if(!formData.cord_blood_source) add("B6. Cord Blood Source", "cord_blood_source");
      }
      if(formData.cord_blood_done==="Yes" || (formData.cord_blood_done==="No" && formData.cord_blood_within_1hr==="Yes")){
        if(formData.cord_ph==="") add("B6. Cord Blood pH", "cord_ph");
        if(formData.cord_sbe==="") add("B6. Cord Blood SBE", "cord_sbe");
        if(formData.cord_pco2==="") add("B6. Cord Blood pCO2", "cord_pco2");
      }
      if(!formData.resus_failure)
        add("B6. Resuscitation Failure",  "resus_failure");
      if(!formData.reason_exit_trial_gas) add("B6. Reason for Exit",  "reason_exit_trial_gas");
      if(formData.reason_exit_trial_gas==="Other" && !formData.reason_exit_trial_gas_other)
        add("B6. Other Exit Reason", "reason_exit_trial_gas_other");
      if(!formData.blender_stopped) add("B6. PORTAL Blender Status",  "blender_stopped");
      if(formData.blender_stopped==="Yes" && !formData.blender_stopped_description)
        add("B6. Blender Stop Description", "blender_stopped_description");
      }
    }
    return m;
  };

  const scrollToFirstError = missing => {
    if(!missing?.length) return;
    const el = document.querySelector(`[name="${missing[0].fieldName}"], #${missing[0].fieldName}`);
    if(el){el.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>el.focus?.(),400);}
  };

  /* ── Save ── */
  const saveForm = async () => {
    setMessage("");
    const missing = validate();
    if(missing.length>0){setMissingFields(missing);setShowMissingModal(true);return false;}
    const payload = buildPayload();
    try {
      const payloadEid = String(payload.enrollment_id || "").trim();
      const storedEid = String(getStoredId("current_enrollment_id") || "").trim();
      const sid = payload.screening_id || getStoredId("current_screening_id") || "";
      // Prefer the form value when it is complete. Never let a leftover "01-"
      // stub in localStorage override a finished enrollment ID the nurse typed.
      let existingId = "";
      if (isUsableEnrollmentId(payloadEid)) existingId = payloadEid;
      else if (isUsableEnrollmentId(storedEid)) existingId = storedEid;
      else if ((payload.randomised === false || payload.required_resuscitation === false) && sid)
        existingId = `NR-${sid}`;
      if (!existingId) {
        setMessage("❌ Enrollment ID is required before saving.");
        return false;
      }
      // If autosave created a row under a stub ID, treat this as a new create.
      if (isUsableEnrollmentId(payloadEid) && storedEid && payloadEid !== storedEid
          && !isUsableEnrollmentId(storedEid)) {
        hasBirthRecordRef.current = false;
      }
      const body = { ...payload, enrollment_id: existingId };

      const res = hasBirthRecordRef.current
        ? await api.put(`/birth-resuscitation/${existingId}`, body)
        : await api.post("/birth-resuscitation/", body);

      const eid = res.data.enrollment_id;
      const savedSid = res.data.screening_id;
      setStoredId("current_enrollment_id", eid);
      if (savedSid) setStoredId("current_screening_id", savedSid);
      hasBirthRecordRef.current = true;
      window.dispatchEvent(new Event("storage"));

      setIsFormBLoaded(true);
      setMessage("✅ Form B saved successfully");
      setIsSaved(true); setIsEditing(false);
      setLastSaved(new Date()); setIsDirty(false);
      markFormCompleted("form_b");
      updatePatientData({
        enrollment_id:  eid,
        gestation:      `${formData.gestation_weeks}+${formData.gestation_days}`,
        mother_name:    `${formData.mother_name_first} ${formData.mother_name_surname}`,
        birth_weight:   formData.birth_weight,
        dob:            formData.date_of_birth,
        baby_uid:       formData.baby_uid,
      });
      setTimeout(()=>setMessage(""),3000);
      return true;
    } catch(err) {
      console.error("Birth resuscitation form save error:", err);
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(e=>`${e.loc?.slice(-1)[0]} — ${e.msg}`).join("; ")
        : typeof detail==="string" ? detail : err.message;
      setMessage(`❌ Save failed: ${msg}`);
      return false;
    }
  };

  /* ── Save Draft — no validation, saves whatever is filled ── */
  const saveDraft = async () => {
    const payload = buildPayload();
    const payloadEid = String(payload.enrollment_id || "").trim();
    const storedEid = String(getStoredId("current_enrollment_id") || "").trim();
    let existingId = "";
    if (isUsableEnrollmentId(payloadEid)) existingId = payloadEid;
    else if (isUsableEnrollmentId(storedEid)) existingId = storedEid;
    if (!existingId) {
      setMessage("❌ Enter a full Enrollment ID (e.g. 01-A-001) before saving a draft.");
      return;
    }
    if (isUsableEnrollmentId(payloadEid) && storedEid && payloadEid !== storedEid
        && !isUsableEnrollmentId(storedEid)) {
      hasBirthRecordRef.current = false;
    }
    const body = { ...payload, enrollment_id: existingId };

    try {
      const res = hasBirthRecordRef.current
        ? await api.put(`/birth-resuscitation/${existingId}`, body)
        : await api.post("/birth-resuscitation/", body);

      const eid = res.data.enrollment_id;
      const savedSid = res.data.screening_id;
      setStoredId("current_enrollment_id", eid);
      if (savedSid) setStoredId("current_screening_id", savedSid);
      hasBirthRecordRef.current = true;
      window.dispatchEvent(new Event("storage"));

      setShowDraftModal(true);
    } catch (err) {
      /* Parse FastAPI 422 validation errors into readable text */
      console.error("Birth resuscitation draft save error:", err);
      const detail = err?.response?.data?.detail;
      let msg = "Draft save failed.";
      if (Array.isArray(detail)) {
        msg = "Draft save failed: " + detail
          .map(e => `${e.loc?.slice(-1)[0] || "field"} — ${e.msg}`)
          .join("; ");
      } else if (typeof detail === "string") {
        msg = `Draft save failed: ${detail}`;
      } else if (err.message) {
        msg = `Draft save failed: ${err.message}`;
      }
      setMessage(`❌ ${msg}`);
    }
  };

  /* Keep latest flags for the interval callback (avoids stale closures). */
  const isDirtyRef = useRef(false);
  const isSavedRef = useRef(false);
  const isEditingRef = useRef(false);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { isSavedRef.current = isSaved; }, [isSaved]);
  useEffect(() => { isEditingRef.current = isEditing; }, [isEditing]);

  /* ── Auto-save every 10 seconds (silent, no modals, no validation) ──
     Only while editable + dirty — never while viewing a saved form. */
  const autoSave = useCallback(async () => {
    if (isSavedRef.current && !isEditingRef.current) return;
    if (!isDirtyRef.current) return;

    const fd = formDataRef.current;
    if (!fd || !isFormBLoadedRef.current) return;

    const storedId = getStoredId("current_enrollment_id");
    const sid = fd.screening_id || getStoredId("current_screening_id") || "";
    let eid = (storedId || fd.enrollment_id || "").trim();
    // Not randomised / no PPV still sync via NR-{screening_id}.
    if (!eid && sid && (fd.randomised === "No" || fd.required_resuscitation === "No")) {
      eid = `NR-${sid}`;
    }

    /* Need a complete enrollment ID (or NR-*) before creating/updating.
       Do not autosave the typing stub "01-" — that polluted Form C routes. */
    if (!isUsableEnrollmentId(eid)) return;
    if (!hasBirthRecordRef.current && !fd.baby_uid) return;

    if (!navigator.onLine) {
      setOfflineQueue(true);
      return;
    }

    setAutoSaveStatus("saving");
    try {
      const payload = {
        ...buildPayloadFrom(fd),
        enrollment_id: eid,
        screening_id: fd.screening_id || getStoredId("current_screening_id") || null,
      };

      let res;
      if (hasBirthRecordRef.current) {
        res = await api.put(`/birth-resuscitation/${eid}`, payload);
      } else {
        /* No row yet — POST. create_birth_resuscitation upserts if the
           enrollment_id already exists, so this is safe to retry. */
        try {
          res = await api.post("/birth-resuscitation/", payload);
        } catch (postErr) {
          /* Race: another tab/save created the row — fall back to PUT */
          if (postErr?.response?.status === 409 || postErr?.response?.status === 400) {
            res = await api.put(`/birth-resuscitation/${eid}`, payload);
          } else {
            throw postErr;
          }
        }
        hasBirthRecordRef.current = true;
      }

      const newEid = res.data.enrollment_id || eid;
      const savedSid = res.data.screening_id;
      setStoredId("current_enrollment_id", newEid);
      if (savedSid) setStoredId("current_screening_id", savedSid);
      /* Do not setConfirmedEnrollmentId here — that re-triggers the birth
         GET and can overwrite fields the nurse typed after this save. */
      window.dispatchEvent(new Event("storage"));

      setAutoSaveStatus("saved");
      setLastSaved(new Date());
      setIsDirty(false);
      setOfflineQueue(false);
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Birth resuscitation auto-save error:", err?.response?.data || err.message);
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
  }, [buildPayloadFrom]);

  autoSaveRef.current = autoSave;

  /* ── Start 10-second interval once form is loaded (stable — not reset on keystroke) ── */
  useEffect(() => {
    if (!isFormBLoaded) return;
    clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(() => {
      autoSaveRef.current?.();
    }, 10000);
    return () => clearInterval(autoSaveTimer.current);
  }, [isFormBLoaded]);

  /* ── Next ── */
  const handleNext = async () => {
    const ok = await saveForm();
    if(!ok) return;
    const eid = (
      getStoredId("current_enrollment_id")
      || String(formDataRef.current?.enrollment_id || "").trim()
    );
    if(!isUsableEnrollmentId(eid)) {
      setMessage("❌ Enrollment ID not saved — please enter a full ID (e.g. 01-A-001) and save before proceeding");
      return;
    }
    const key = `completedForms_${eid}`;
    const ex  = JSON.parse(localStorage.getItem(key)||"[]");
    if(!ex.includes("form_b")) localStorage.setItem(key,JSON.stringify([...ex,"form_b"]));
    navigate(`/form-c/${eid}`);
  };

  /* ── Load data ── */
  useEffect(()=>{
    if(!confirmedEnrollmentId) return;
    const eid = confirmedEnrollmentId;
    hasBirthRecordRef.current = false;
    api.get(`/birth-resuscitation/${eid}`)
      .then(r=>{
        const d=r.data;
        // contact_* / mother_name_* / maternal_uid live in participant_pii.
        // Prefer values already on the form (from /pii/screening) and fill
        // gaps from the birth GET when the API reattaches PII.
        const { contact_mother, contact_husband, mother_name_first, mother_name_surname, maternal_uid, ...dSafe } = d;
        let reasonExit = d.reason_exit_trial_gas || "";
        let reasonExitOther = "";
        if (reasonExit && !EXIT_REASON_OPTIONS.includes(reasonExit)) {
          reasonExitOther = reasonExit;
          reasonExit = "Other";
        }
        setFormData(p=>({...p,...dSafe,
          maternal_uid:        p.maternal_uid || maternal_uid || "",
          mother_name_first:   p.mother_name_first || mother_name_first || "",
          mother_name_surname: p.mother_name_surname || mother_name_surname || "",
          contact_mother:      p.contact_mother || contact_mother || "",
          contact_husband:     p.contact_husband || contact_husband || "",
          enrollment_id: d.enrollment_id && !String(d.enrollment_id).startsWith("NR-")
            ? formatEnrollmentId(d.enrollment_id, SITE_ID_MAP[p.site_name] || siteCode)
            : (String(p.enrollment_id || "").startsWith("NR-") ? "" : (p.enrollment_id || "")),
          // FIX: GET /birth-resuscitation overlays Form D NBS GA onto
          // gestation_weeks when NBS differs by >2 weeks — that is for
          // forms AFTER Form D only. Form B must keep the original birth/
          // screening GA (exposed as original_gestation_*), otherwise
          // reopening Form B shows NBS values and autosave can permanently
          // overwrite the Form B record.
          gestation_weeks:      (d.original_gestation_weeks != null && d.original_gestation_weeks !== ""
                                  ? d.original_gestation_weeks
                                  : d.gestation_weeks) || p.gestation_weeks,
          gestation_days:       (d.original_gestation_weeks != null && d.original_gestation_weeks !== ""
                                  ? (d.original_gestation_days ?? 0)
                                  : (d.gestation_weeks ? (d.gestation_days ?? p.gestation_days) : p.gestation_days)),
          gestation_rand_weeks: d.gestation_rand_weeks || p.gestation_rand_weeks,
          gestation_rand_days:  d.gestation_rand_weeks ? (d.gestation_rand_days ?? p.gestation_rand_days) : p.gestation_rand_days,
          date_of_birth: d.date_of_birth ? String(d.date_of_birth).slice(0, 10) : p.date_of_birth,
          time_of_birth: normalizeTimeForInput(d.time_of_birth),
          cord_clamp_timestamp: normalizeTimeForInput(d.cord_clamp_timestamp),
          reason_exit_trial_gas: reasonExit,
          reason_exit_trial_gas_other: reasonExitOther,
          poor_resp_efforts: d.poor_resp_efforts===true?"Yes":d.poor_resp_efforts===false?"No":"",
          poor_muscle_tone:  d.poor_muscle_tone===true?"Yes":d.poor_muscle_tone===false?"No":"",
          /* Invert: DB hr_above_100 ↔ CRF "HR < 100" */
          hr_below_100:      d.hr_above_100===true?"No":d.hr_above_100===false?"Yes":"",
          initial_steps:     d.initial_steps===true?"Yes":d.initial_steps===false?"No":"",
          required_resuscitation: d.required_resuscitation===true?"Yes":d.required_resuscitation===false?"No":"",
          ppv_required:      d.ppv_required===true?"Yes":d.ppv_required===false?"No":"",
          intubation:        d.intubation===true?"Yes":d.intubation===false?"No":"",
          chest_compression: d.chest_compression===true?"Yes":d.chest_compression===false?"No":"",
          adrenaline:        d.adrenaline===true?"Yes":d.adrenaline===false?"No":"",
          fluid_bolus:       d.fluid_bolus===true?"Yes":d.fluid_bolus===false?"No":"",
          placental_transfusion: d.placental_transfusion===true?"Yes":d.placental_transfusion===false?"No":"",
          randomised:        d.randomised===true?"Yes":d.randomised===false?"No":"",
          resus_failure:     d.resus_failure===true?"Yes":d.resus_failure===false?"No":"",
          cord_blood_done:   d.cord_blood_done===true?"Yes":d.cord_blood_done===false?"No":"",
          cord_blood_within_1hr: d.cord_blood_within_1hr===true?"Yes":d.cord_blood_within_1hr===false?"No":"",
          interventions:     {
            oxygen: d.interventions?.oxygen || {},
            cpap: d.interventions?.cpap || {},
            apgar: d.interventions?.apgar || {},
          },
          indication_for_delivery: typeof d.indication_for_delivery==="string"
            ? d.indication_for_delivery.split(",").map(v=>v.trim()).filter(Boolean)
            : (d.indication_for_delivery || []),
          blender_stopped:   d.blender_stopped===true?"Yes":d.blender_stopped===false?"No":"",
          time_to_respiration: secondsToDurationHms(d.time_to_respiration),
          time_to_spo2_80:     secondsToDuration(d.time_to_spo2_80),
          // Field 57: MM:SS string (legacy integer minutes → "MM:00")
          total_resus_time: (() => {
            const v = d.total_resus_time;
            if (v == null || v === "") return p.total_resus_time || "";
            const s = String(v).trim();
            if (/^\d{1,3}$/.test(s)) return formatDurationMs(`${Number(s)}:00`);
            return formatDurationMs(s);
          })(),
        }));
        if (d.required_resuscitation === false) {
          localStorage.setItem("enrollment_locked", "true");
          localStorage.setItem("enrollment_lock_reason", "no_ppv");
          window.dispatchEvent(new Event("storage"));
        } else if (d.required_resuscitation === true
                   && localStorage.getItem("enrollment_lock_reason") === "no_ppv") {
          localStorage.removeItem("enrollment_locked");
          localStorage.removeItem("enrollment_lock_reason");
          window.dispatchEvent(new Event("storage"));
        }
        hasBirthRecordRef.current = true;
        isInitialRender.current = true;
        setIsFormBLoaded(true); setIsSaved(true);
      }).catch(err => {
        /* 404 = brand-new Form B for this enrollment — still enable autosave */
        if (err?.response?.status !== 404) {
          setMessage("⚠️ Could not load saved Form B data — please refresh the page.");
        }
        hasBirthRecordRef.current = false;
        isInitialRender.current = true;
        setIsFormBLoaded(true);
      });
  },[confirmedEnrollmentId]);

  useEffect(()=>{
    if(!screeningId) return;
    /* Reset load/autosave state when switching patients */
    setIsFormBLoaded(false);
    hasBirthRecordRef.current = false;
    isInitialRender.current = true;

    // Sync session IDs immediately (before the async screening fetch).
    // Otherwise Sidebar still shows the *previous* patient's enrollment
    // progress (C/D/E green ticks) while Form B already shows this baby.
    setStoredId("current_screening_id", screeningId);
    clearStoredId("current_enrollment_id");
    setConfirmedEnrollmentId(null);

    let cancelled = false;
    const fetch=async()=>{
      try {
        const r=await api.get(`/screenings/by-screening-id/${screeningId}`);
        const d=r.data||{};
        let pii={};
        try {
          const p2 = await api.get(`/pii/screening/${screeningId}`);
          pii = p2.data || {};
        } catch (piiErr) {
          console.warn("Form B: PII by screening failed", screeningId, piiErr?.response?.status || piiErr);
        }
        // Prefer enrollment-linked PII when screening lookup is empty/missing
        // (common after enrollment is assigned and screening_id was never set on the row).
        const piiBlank = !(pii.maternal_uid || pii.mother_first_name || pii.mother_contact || pii.contact_mother);
        if (piiBlank && d.enrollment_id) {
          try {
            const p3 = await api.get(`/pii/enrollment/${d.enrollment_id}`);
            pii = p3.data || pii;
          } catch (e2) {
            console.warn("Form B: PII by enrollment failed", d.enrollment_id, e2?.response?.status || e2);
          }
        }

        // Discard this response if the user has since navigated to a
        // different patient's Form B — otherwise a slow request for the
        // PREVIOUS screening can resolve after the new one and overwrite
        // it with the wrong mother/husband contact numbers.
        if (cancelled) return;

        set({
          screening_id:        d.screening_id||"",
          site_name:           d.site_name||"",
          maternal_uid:        pii.maternal_uid||"",
          mother_name_first:   pii.mother_first_name||"",
          mother_name_surname: pii.mother_surname||"",
          gestation_weeks:     d.gestation_weeks||"",
          gestation_days:      d.gestation_days||"",
          screening_datetime: d.screening_datetime||"",
          contact_mother:  pii.mother_contact||pii.contact_mother||"",
          contact_husband: pii.husband_contact||pii.contact_husband||"",
          ...(d.enrollment_id && !String(d.enrollment_id).startsWith("NR-")
            ? { enrollment_id: formatEnrollmentId(d.enrollment_id, SITE_ID_MAP[d.site_name] || "00") }
            : {}),
        });
        setSiteName(d.site_name || "");

        // Reconcile the cached enrollment id with THIS screening — don't
        // let a stale id from a different, previously-viewed patient carry
        // over. If this screening already has its own enrollment_id (e.g.
        // re-opening an already-enrolled patient), trust that and refresh
        // the cache. If it doesn't (a brand-new/unenrolled screening, like
        // one just created on mobile), clear the cache so the "load saved
        // Form B data" effect below can't pick up someone else's record.
        if (d.enrollment_id) {
          setStoredId("current_enrollment_id", d.enrollment_id);
          setConfirmedEnrollmentId(d.enrollment_id);
          /* Birth-load effect will set isFormBLoaded when GET finishes */
        } else {
          /* Mobile / no-PPV / not-randomised saves use NR-{screeningId}.
             If screening.enrollment_id was never linked, still try that
             placeholder so web Form B shows the synced birth row. */
          let foundNr = false;
          try {
            const nrId = `NR-${screeningId}`;
            const br = await api.get(`/birth-resuscitation/${nrId}`);
            if (!cancelled && br?.data) {
              foundNr = true;
              set({ enrollment_id: nrId });
              setStoredId("current_enrollment_id", nrId);
              setConfirmedEnrollmentId(nrId);
            }
          } catch (_) { /* 404 = no NR row yet */ }
          if (!foundNr && !cancelled) {
            clearStoredId("current_enrollment_id");
            setConfirmedEnrollmentId(null);
            hasBirthRecordRef.current = false;
            isInitialRender.current = true;
            /* No enrollment yet — enable autosave so it can POST once the
               nurse enters enrollment_id + baby_uid */
            setIsFormBLoaded(true);
          }
        }
      }catch(e){
        console.error(e);
        if (!cancelled) {
          hasBirthRecordRef.current = false;
          isInitialRender.current = true;
          setIsFormBLoaded(true);
        }
      }
    };
    fetch();
    return () => { cancelled = true; };
  },[screeningId]); // eslint-disable-line

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */
  return (
    <>
      {/* Offline */}
      {!isOnline && (
        <div className="offline-banner">
          <Ic d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" s={14}/>
          You are offline. Changes will be saved automatically when your connection returns.
          {offlineQueue && <strong> · Save queued.</strong>}
        </div>
      )}
      {isSaved && isEditing && (
        <div className="editing-mode-banner" role="status">
          <span className="editing-mode-icon" aria-hidden="true">
            <Pencil size={14} strokeWidth={2.25} />
          </span>
          <div className="editing-mode-copy">
            <span className="editing-mode-label">Editing mode</span>
            <span className="editing-mode-hint">Unsaved changes will be lost if you navigate away</span>
          </div>
        </div>
      )}

      <form className={`screening-form${isSaved&&!isEditing?" readonly":""}`} onSubmit={e=>e.preventDefault()}>
        <fieldset>
          <div className="form-inner">

            {/* ── PAGE HEADER ── */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={12}/> FORM B</div>
                <h2 className="form-main-title">Birth &amp; Resuscitation</h2>
                <p className="form-main-subtitle">Fill for all consented subjects · CRF Birth &amp; Resuscitation</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && (
                  <button type="button" className="btn-print-form" onClick={()=>window.print()}>
                    <Ic d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" s={13}/> Print
                  </button>
                )}
                {isSaved && (
                  <button type="button"
                    className={`btn-edit-form-header${isEditing?" editing-active":""}`}
                    onClick={()=>setIsEditing(p=>{
                      const next = !p;
                      if (!next) setIsDirty(false);
                      return next;
                    })}>
                    {isEditing?"✓ Done Editing":"Edit Form"}
                  </button>
                )}
                <div className="screening-id-badge">
                  <span className="id-label">Enrollment ID</span>
                  <span className="id-val">{formData.enrollment_id||"—"}</span>
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════
                B1 — IDENTIFICATION
            ════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <User size={15} className="section-header-icon"/>
                  <h3>B1 · Identification</h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>1. Screening ID</label>
                    <input value={formData.screening_id} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>2. Maternal UID</label>
                    <input value={formData.maternal_uid} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>3. Mother's First Name</label>
                    <input value={formData.mother_name_first} readOnly className="readonly-input"/>
                  </div>
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>4. Baby UID<span className="required">*</span></label>
                    <input name="baby_uid" value={formData.baby_uid||""}
                      maxLength={12} inputMode="numeric" placeholder="Up to 12 digits"
                      readOnly={!isFieldEditable}
                      className={errors.baby_uid?"input-error":""}
                      onChange={e=>{
                        if(/^\d{0,12}$/.test(e.target.value)){
                          set({baby_uid:e.target.value});
                          setErrors(p=>({...p,baby_uid:""}));
                        }
                      }}/>
                    {errors.baby_uid&&<div className="field-error">{errors.baby_uid}</div>}
                  </div>
                  <div className="form-group">
                    <label>5. Mobile No. — Mother</label>
                    <input value={formData.contact_mother||""} readOnly className="readonly-input" placeholder="From Form A"/>
                  </div>
                  <div className="form-group">
                    <label>5. Mobile No. — Husband</label>
                    <input value={formData.contact_husband||""} readOnly className="readonly-input" placeholder="From Form A"/>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>{babyAdmissionLabel}</label>
                    <input name="baby_admission_no" value={formData.baby_admission_no||""}
                      maxLength={babyAdmissionRule.max} inputMode="numeric"
                      onChange={e=>{
                        const v = e.target.value;
                        if (/^\d*$/.test(v)) set({ baby_admission_no: v });
                      }}
                      placeholder={babyAdmissionRule.placeholder} readOnly={!isFieldEditable || siteName === "IOG"}/>
                  </div>
                  {babyAnnualRule && (
                    <div className="form-group">
                      <label>{babyAnnualRule.label}</label>
                      <input name="baby_annual_no" value={formData.baby_annual_no||""}
                        maxLength={babyAnnualRule.max || undefined}
                        inputMode={babyAnnualRule.numeric ? "numeric" : "text"}
                        onChange={e=>{
                          const v = e.target.value;
                          if (!babyAnnualRule.numeric || /^\d*$/.test(v)) set({ baby_annual_no: v });
                        }}
                        placeholder={babyAnnualRule.placeholder} readOnly={!isFieldEditable}/>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════
                B2 — BIRTH DETAILS
            ════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Baby size={15} className="section-header-icon"/>
                  <h3>B2 · Birth Details</h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>8. Date of Birth<span className="required">*</span></label>
                    <DatePicker
                      selected={formData.date_of_birth?parseDateOnly(formData.date_of_birth):null}
                      onChange={d=>set({date_of_birth:d?toDateOnlyValue(d):""})}
                      maxDate={new Date()}
                      dateFormat="dd-MM-yyyy" placeholderText="dd-MM-yyyy"
                      readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>9. Time of Birth<span className="required">*</span></label>
                    <ModernTimeInput
                      hour={getTimePart("time_of_birth","h")}
                      minute={getTimePart("time_of_birth","m")}
                      second={getTimePart("time_of_birth","s")}
                      onChange={(h,m,s)=>handleTimeChange("time_of_birth", h, m, s)}
                      disabled={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>10. Gender<span className="required">*</span></label>
                    <select name="gender" value={formData.gender}
                      disabled={!isFieldEditable} onChange={handleChange}>
                      <option value="">-- Select --</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="DSD">DSD</option>
                    </select>
                  </div>
                </div>

                {birthBeforeScreening && (
                  <div className="alert-danger" style={{marginTop:8, marginBottom:8}}>
                    ❌ Date &amp; Time of Birth cannot be before the Screening Date &amp; Time recorded in Form A.
                  </div>
                )}

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>11. Gestation at Screening (auto)</label>
                    <input readOnly className="readonly-input"
                      value={formData.gestation_weeks ? `${formData.gestation_weeks}w ${formData.gestation_days||0}d` : "—"} placeholder="From Form A"/>
                  </div>
                  <div className="form-group">
                    <label>12. Gestation at Randomization (auto from Form A and DOB)</label>
                    <input readOnly className="readonly-input"
                      value={formData.gestation_rand_weeks !== "" ? `${formData.gestation_rand_weeks}w ${formData.gestation_rand_days||0}d` : "—"}
                      placeholder="Auto from DOB"/>
                  </div>
                  <div className="form-group">
                    <label>13. Birth Weight (g)<span className="required">*</span></label>
                    <input type="text" name="birth_weight" value={formData.birth_weight||""}
                      inputMode="numeric" maxLength={4} placeholder="300–6000 g"
                      readOnly={!isFieldEditable}
                      className={errors.birth_weight?"input-error":""}
                      onChange={e=>{
                        if(/^\d{0,4}$/.test(e.target.value)){
                          set({birth_weight:e.target.value});
                          setErrors(p=>({...p,birth_weight:
                            e.target.value===""?"Required":
                            Number(e.target.value)<300?"Must be ≥ 300 g":
                            Number(e.target.value)>6000?"Must be ≤ 6000 g":""}));
                        }
                      }}/>
                    {errors.birth_weight&&<div className="field-error">{errors.birth_weight}</div>}
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>14. Intrauterine Growth Status (centile, auto)</label>
                    <input type="text" name="intrauterine_centile"
                      value={formData.intrauterine_centile||""}
                      inputMode="decimal" placeholder="0–100"
                      onChange={e=>{const v=e.target.value;if(/^\d{0,3}(\.\d{0,2})?$/.test(v)&&(v===""||Number(v)<=100))set({intrauterine_centile:v});}}
                      readOnly={!isFieldEditable}/>
                    <div className="ig-centile-hint">
                      {(() => {
                        const weeks = Number(formData.gestation_rand_weeks);
                        const days  = Number(formData.gestation_rand_days);
                        const weightKg = Number(formData.birth_weight) / 1000;
                        const r = classifyVeryPretermCentile(weightKg, weeks, days, formData.gender);
                        if (r) {
                          const cols = ["3rd","5th","10th","50th","90th","95th","97th"];
                          return (
                            <>
                              <div>Auto (INTERGROWTH-21st Very Preterm) — {r.label}</div>
                              <div className="ig-centile-ref-row">
                                {cols.map((c, i) => (
                                  <span key={c} className="ig-centile-ref-cell">
                                    <span className="ig-centile-ref-label">{c}</span>
                                    <span className="ig-centile-ref-value">{r.row[i].toFixed(2)}kg</span>
                                  </span>
                                ))}
                              </div>
                            </>
                          );
                        }
                        return "Auto-fills once GA at randomization, birth weight and gender (Male/Female) are entered — covers 24+0–32+6 weeks only";
                      })()}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>15. Delivery Mode{requiredMark}</label>
                    <select name="delivery_mode" value={formData.delivery_mode}
                      disabled={!isFieldEditable}
                      onChange={e=>{ handleChange(e); set({vaginal_delivery_type:"",lscs_type:""}); }}>
                      <option value="">-- Select --</option>
                      <option value="Vaginal">Vaginal</option>
                      <option value="LSCS">LSCS</option>
                    </select>
                  </div>
                  <div className="form-group">
                    {formData.delivery_mode==="Vaginal" && (<>
                      <label>16. Vaginal Delivery Type{requiredMark}</label>
                      <select name="vaginal_delivery_type" value={formData.vaginal_delivery_type||""}
                        disabled={!isFieldEditable} onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Spontaneous">Spontaneous</option>
                        <option value="Augmented">Augmented</option>
                        <option value="Induced">Induced</option>
                      </select>
                    </>)}
                    {formData.delivery_mode==="LSCS" && (<>
                      <label>17. LSCS Type{requiredMark}</label>
                      <select name="lscs_type" value={formData.lscs_type||""}
                        disabled={!isFieldEditable} onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Emergency">Emergency</option>
                        <option value="Elective">Elective</option>
                      </select>
                    </>)}
                  </div>
                </div>

                {/* Field 18: Indication — multi-select per CRF */}
                <div className="form-group">
                  <label>18. Indication{requiredMark} <span className="field-note">(select all that apply)</span></label>
                  <div className="multi-checkbox-group">
                    {CRF_INDICATIONS.map(opt => (
                      <label key={opt} className={`multi-check-item${!isFieldEditable?" disabled":""}${(formData.indication_for_delivery||[]).includes(opt)?" checked":""}`}>
                        <input type="checkbox"
                          checked={(formData.indication_for_delivery||[]).includes(opt)}
                          disabled={!isFieldEditable}
                          onChange={()=>{
                            const cur = formData.indication_for_delivery||[];
                            const next = cur.includes(opt) ? cur.filter(x=>x!==opt) : [...cur,opt];
                            set({indication_for_delivery:next});
                          }}/>
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                  {(formData.indication_for_delivery||[]).includes("Other") && (
                    <div className="multi-check-other-row">
                      <input type="text" className="multi-check-other-input" name="indication_for_delivery_other"
                        value={formData.indication_for_delivery_other||""}
                        onChange={handleChange} placeholder="Specify other indication *"
                        readOnly={!isFieldEditable}/>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ════════════════════════════════════════
                B3 — CONDITION AT BIRTH & RANDOMIZATION
            ════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Heart size={15} className="section-header-icon"/>
                  <h3>B3 · Condition at Birth &amp; Randomization</h3>
                </div>
              </div>
              <div className="form-section-body">

                <YesNoToggle label={<>19. Respiratory effort{requiredMark}</>}
                  name="poor_resp_efforts" value={formData.poor_resp_efforts}
                  yesLabel="Absent/poor" noLabel="Normal"
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label={<>20. Muscle tone{requiredMark}</>}
                  name="poor_muscle_tone" value={formData.poor_muscle_tone}
                  yesLabel="Limp/poor" noLabel="Normal"
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label={<>21. HR &lt; 100{requiredMark}</>}
                  name="hr_below_100" value={formData.hr_below_100||""}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label={<>22. Initial steps{requiredMark}</>}
                  name="initial_steps" value={formData.initial_steps}
                  yesLabel="Required" noLabel="Not required"
                  onChange={e=>{
                    handleChange(e);
                    // Q23 only when initial steps are required
                    if (e.target.value === "Yes") {
                      set({ required_resuscitation: "" });
                      if (localStorage.getItem("enrollment_lock_reason") === "no_ppv") {
                        localStorage.removeItem("enrollment_locked");
                        localStorage.removeItem("enrollment_lock_reason");
                        window.dispatchEvent(new Event("storage"));
                      }
                    } else if (e.target.value === "No") {
                      set({
                        required_resuscitation: "No",
                        randomised: "",
                        randomisation_date: "",
                        strata: "",
                        enrollment_reason_not_randomized: "",
                        enrollment_reason_not_randomized_other: "",
                      });
                      localStorage.setItem("enrollment_locked", "true");
                      localStorage.setItem("enrollment_lock_reason", "no_ppv");
                      window.dispatchEvent(new Event("storage"));
                    }
                  }}
                  disabled={!isFieldEditable}/>
                {formData.initial_steps === "Yes" && (
                <YesNoToggle label={<>23. Does baby require ventilation (PPV)?{requiredMark}</>}
                  name="required_resuscitation" value={formData.required_resuscitation}
                  yesLabel="Required" noLabel="Not required"
                  onChange={e=>{
                    handleChange(e);
                    if(e.target.value==="No"){
                      localStorage.setItem("enrollment_locked","true");
                      localStorage.setItem("enrollment_lock_reason", "no_ppv");
                      window.dispatchEvent(new Event("storage"));
                    } else if (e.target.value === "Yes") {
                      if (localStorage.getItem("enrollment_lock_reason") === "no_ppv") {
                        localStorage.removeItem("enrollment_locked");
                        localStorage.removeItem("enrollment_lock_reason");
                        window.dispatchEvent(new Event("storage"));
                      }
                    }
                  }}
                  disabled={!isFieldEditable}/>
                )}

                {formData.required_resuscitation==="No" && (
                  <div className="alert-danger">
                    <AlertTriangle size={16}/>
                    Resuscitation (PPV) not required — Forms D and later stay locked.
                    Complete Forms A–C only, then stop.
                  </div>
                )}

                {formData.required_resuscitation==="Yes" && (
                  <div className="followup-box">
                    <span className="followup-label">Randomization details</span>
                    <div className="form-grid-3">
                        <div className="form-group">
                          <label>24. Randomised?<span className="required">*</span></label>
                        <select name="randomised" value={formData.randomised}
                          disabled={!isFieldEditable}
                          onChange={e=>{
                            handleChange(e);
                            if (e.target.value === "Yes") {
                              const cur = formData.enrollment_id || "";
                              if (!cur || cur.startsWith("NR-") || !cur.startsWith(siteCode)) {
                                set({ enrollment_id: `${siteCode}-` });
                              }
                            }
                          }}>
                          <option value="">-- Select --</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                        </div>
                      {formData.randomised==="Yes" && (<>
                        <div className="form-group">
                          <label>25. Randomization Date<span className="required">*</span></label>
                          <DatePicker
                            selected={formData.randomisation_date?parseDateOnly(formData.randomisation_date):null}
                            onChange={d=>set({randomisation_date:d?toDateOnlyValue(d):""})}
                            maxDate={new Date()}
                            dateFormat="dd-MM-yyyy" placeholderText="dd-MM-yyyy"
                            readOnly={!isFieldEditable}/>
                        </div>
                        <div className="form-group">
                          <label>26. Enrollment ID<span className="required">*</span></label>
                          <input
                            name="enrollment_id"
                            value={formData.enrollment_id||""}
                            onChange={e=>set({ enrollment_id: formatEnrollmentId(e.target.value) })}
                            onFocus={()=>{
                              const cur = formData.enrollment_id || "";
                              if (!cur || cur.startsWith("NR-")) set({ enrollment_id: `${siteCode}-` });
                            }}
                            placeholder={`${siteCode}-A-001`}
                            maxLength={8}
                            autoComplete="off"
                            spellCheck={false}
                            style={{ letterSpacing: "0.06em", fontWeight: 600 }}
                            readOnly={!isFieldEditable}/>
                          <span className="field-note">Site {siteCode} · letter A–D · 3-digit serial</span>
                        </div>
                      </>)}
                    </div>
                    {formData.randomised==="Yes" && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>27. Strata <span className="field-note">(auto, from Gestation at Randomization)</span></label>
                          <input value={formData.strata||""} readOnly className="readonly-input" placeholder="—"/>
                        </div>
                        <div/>
                      </div>
                    )}
                    {formData.randomised==="No" && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>28. Reason Not Randomized<span className="required">*</span></label>
                          <select name="enrollment_reason_not_randomized"
                            value={formData.enrollment_reason_not_randomized||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="GA ≥ 32 weeks">GA ≥ 32 weeks</option>
                            <option value="Trial nurse could not reach">Trial nurse could not reach</option>
                            <option value="Non-trial location">Non-trial location</option>
                            <option value="Missed delivery">Missed delivery</option>
                            <option value="Multiple deliveries">Multiple deliveries</option>
                            <option value="Consent withdrawn">Consent withdrawn</option>
                            <option value="Other">Other</option>
                          </select>
                          {formData.enrollment_reason_not_randomized==="Other" && (
                            <input type="text" name="enrollment_reason_not_randomized_other"
                              value={formData.enrollment_reason_not_randomized_other||""}
                              onChange={handleChange} placeholder="Specify other reason *"
                              readOnly={!isFieldEditable} style={{marginTop:8}}/>
                          )}
                        </div>
                        <div/>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Conditional sections only when resuscitation given and not "No" */}
            {!endParticipation && formData.randomised!=="No" && (<>

              {/* ════════════════════════════════════════
                  B4 — RESUSCITATION INTERVENTIONS
              ════════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <Activity size={15} className="section-header-icon"/>
                    <h3>B4 · Resuscitation Details</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* 29. PPV device details (Q23 Required → B4 path) */}
                  <div className="followup-box" style={{marginTop:0}}>
                    <span className="followup-label">29. PPV (Ventilation)</span>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Device used{requiredMark}</label>
                        <select name="device_ppv" value={formData.device_ppv||""}
                          disabled={!isFieldEditable}
                          onChange={e=>{handleChange(e);set({sib_peep_with:"",sib_peep_cmh2o:"",tpiece_pip:"",tpiece_peep:"",tpiece_flow:""});}}>
                          <option value="">-- Select --</option>
                          <option value="T-piece">T-piece resuscitator</option>
                          <option value="Self-inflating bag">Self-inflating bag (SIB)</option>
                          <option value="Both">Both</option>
                        </select>
                      </div>
                      <div/>
                    </div>
                    {(formData.device_ppv==="Self-inflating bag"||formData.device_ppv==="Both") && (
                      <div className="followup-box">
                        <div className="form-grid-3">
                          <div className="form-group">
                            <label>29a. If SIB{requiredMark}</label>
                            <select name="sib_peep_with" value={formData.sib_peep_with||""}
                              disabled={!isFieldEditable} onChange={handleChange}>
                              <option value="">-- Select --</option>
                              <option value="Yes">With PEEP valve</option>
                              <option value="No">Without PEEP valve</option>
                            </select>
                          </div>
                          {formData.sib_peep_with==="Yes" && (
                            <div className="form-group">
                              <label>PEEP (cm H₂O){requiredMark}</label>
                              <input type="text" name="sib_peep_cmh2o" value={formData.sib_peep_cmh2o||""}
                                inputMode="numeric" maxLength={3} placeholder="cm H₂O" readOnly={!isFieldEditable}
                                onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({sib_peep_cmh2o:e.target.value});}}/>
                            </div>
                          )}
                          <div/>
                        </div>
                      </div>
                    )}
                    {(formData.device_ppv==="T-piece"||formData.device_ppv==="Both") && (
                      <div className="followup-box">
                        <div className="form-grid-3">
                          <div className="form-group">
                            <label>29b. If T-piece — PIP (cm H₂O){requiredMark}</label>
                            <input type="text" name="tpiece_pip" value={formData.tpiece_pip||""}
                              inputMode="numeric" maxLength={3} placeholder="cm H₂O" readOnly={!isFieldEditable}
                              onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_pip:e.target.value});}}/>
                          </div>
                          <div className="form-group">
                            <label>PEEP (cm H₂O){requiredMark}</label>
                            <input type="text" name="tpiece_peep" value={formData.tpiece_peep||""}
                              inputMode="numeric" maxLength={3} placeholder="cm H₂O" readOnly={!isFieldEditable}
                              onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_peep:e.target.value});}}/>
                          </div>
                          <div className="form-group">
                            <label>Flow rate (L/min){requiredMark}</label>
                            <input type="text" name="tpiece_flow" value={formData.tpiece_flow||""}
                              inputMode="numeric" maxLength={3} placeholder="L/min" readOnly={!isFieldEditable}
                              onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_flow:e.target.value});}}/>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>30. Interface{requiredMark}</label>
                        <select name="interface_used" value={formData.interface_used||""}
                          disabled={!isFieldEditable} onChange={handleChange}>
                          <option value="">-- Select --</option>
                          <option value="Mask">Mask</option>
                          <option value="LMA">LMA</option>
                          <option value="Mask + LMA">Mask + LMA</option>
                          <option value="Endotracheal tube">Endotracheal tube</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>31. Duration of PPV (sec){requiredMark} <span className="field-note">from APGAR timer</span></label>
                        <input type="text" name="ppv_duration" value={formData.ppv_duration||""}
                          inputMode="numeric" maxLength={4} placeholder="seconds" readOnly={!isFieldEditable}
                          onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))set({ppv_duration:e.target.value});}}/>
                      </div>
                    </div>
                  </div>

                  {/* 32. Intubation */}
                  <YesNoToggle label={<>32. Endotracheal intubation{requiredMark}</>}
                    name="intubation" value={formData.intubation}
                    onChange={handleChange} disabled={!isFieldEditable}/>

                  {/* 33–34. Chest compressions */}
                  <YesNoToggle label={<>33. Chest compressions{requiredMark}</>}
                    name="chest_compression" value={formData.chest_compression}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({cc_duration:""}); }}
                    disabled={!isFieldEditable}/>
                  {formData.chest_compression==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>34. Duration of CC (sec){requiredMark} <span className="field-note">from APGAR timer</span></label>
                          <input type="text" name="cc_duration" value={formData.cc_duration||""}
                            inputMode="numeric" maxLength={4} placeholder="seconds" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))set({cc_duration:e.target.value});}}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 35–37. Epinephrine */}
                  <YesNoToggle label={<>35. Epinephrine{requiredMark}</>}
                    name="adrenaline" value={formData.adrenaline}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({adrenaline_dilution:"",adrenaline_route:""}); }}
                    disabled={!isFieldEditable}/>
                  {formData.adrenaline==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>36. Dilution{requiredMark}</label>
                          <select name="adrenaline_dilution" value={formData.adrenaline_dilution||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="1:10000">1:10,000</option>
                            <option value="1:1000">1:1,000</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>37. Route{requiredMark}</label>
                          <select name="adrenaline_route" value={formData.adrenaline_route||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Umbilical vein">Umbilical vein</option>
                            <option value="Peripheral vein">Peripheral vein</option>
                            <option value="Intratracheal">Intratracheal</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 38–40. Fluid bolus */}
                  <YesNoToggle label={<>38. Fluid bolus{requiredMark}</>}
                    name="fluid_bolus" value={formData.fluid_bolus}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({fluid_bolus_doses:"",fluid_bolus_cumulative:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.fluid_bolus==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>39. Doses{requiredMark}</label>
                          <input type="text" name="fluid_bolus_doses" value={formData.fluid_bolus_doses||""}
                            inputMode="numeric" maxLength={2} placeholder="doses" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,2}$/.test(e.target.value))set({fluid_bolus_doses:e.target.value});}}/>
                        </div>
                        <div className="form-group">
                          <label>40. Cumulative (ml/mg){requiredMark}</label>
                          <input type="text" name="fluid_bolus_cumulative" value={formData.fluid_bolus_cumulative||""}
                            inputMode="decimal" placeholder="ml/mg" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d*\.?\d{0,2}$/.test(e.target.value))set({fluid_bolus_cumulative:e.target.value});}}/>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 41–44 independent — 42/43/44 are not gated on 41 */}
                  <YesNoToggle label={<>41. Placental transfusion{requiredMark}</>}
                    name="placental_transfusion" value={formData.placental_transfusion}
                    onChange={handleChange}
                    disabled={!isFieldEditable}/>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>42. Method{requiredMark}</label>
                      <select name="transfusion_method" value={formData.transfusion_method||""}
                        disabled={!isFieldEditable}
                        onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Deferred clamping">Deferred clamping</option>
                        <option value="Intact cord milking">Intact cord milking</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>43. Cord clamped at (HH:MM:SS){requiredMark}</label>
                      <ModernTimeInput
                        hour={getTimePart("cord_clamp_timestamp","h")}
                        minute={getTimePart("cord_clamp_timestamp","m")}
                        second={getTimePart("cord_clamp_timestamp","s")}
                        onChange={(h,m,s)=>handleTimeChange("cord_clamp_timestamp", h, m, s)}
                        disabled={!isFieldEditable}/>
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>44. Cord clamping time from birth (sec) <span className="field-note">auto from 9. Time of Birth + 43. Cord clamped at</span></label>
                      <input type="text" name="cord_clamp_time"
                        value={formData.cord_clamp_time === 0 || formData.cord_clamp_time === "0"
                          ? "0"
                          : (formData.cord_clamp_time ?? "")}
                        inputMode="numeric" maxLength={3} placeholder="0–300"
                        readOnly={!isFieldEditable}
                        className={errors.cord_clamp_time?"input-error":""}
                        onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v)&&(v===""||Number(v)<=300))set({cord_clamp_time:v});}}/>
                      {errors.cord_clamp_time&&<div className="field-error">{errors.cord_clamp_time}</div>}
                      {!formData.time_of_birth && formData.cord_clamp_timestamp && (
                        <div className="field-error">Enter 9. Time of Birth first to auto-calculate.</div>
                      )}
                    </div>
                    <div/>
                  </div>

                  {/* Timings 45–47 */}
                  <div className="form-grid-2" style={{marginTop:16}}>
                    <div className="form-group">
                      <label>45. Time to spontaneous respiratory efforts (HH:MM:SS)</label>
                      <DurationField mode="hms" name="time_to_respiration"
                        value={formData.time_to_respiration}
                        disabled={!isFieldEditable}
                        placeholder="HH:MM:SS" maxLength={8}
                        onChange={v => set({ time_to_respiration: v })}/>
                    </div>
                    <div className="form-group">
                      <label>46. SpO₂ at 5 min (%) <span className="field-note">1–100 only</span></label>
                      <input type="text" name="spo2_5min" value={formData.spo2_5min||""}
                        inputMode="numeric" maxLength={3} placeholder="1–100"
                        readOnly={!isFieldEditable}
                        onChange={e=>{
                          const v=e.target.value;
                          // Allow empty, or integer 1–100 (incl. 01–09); block 0 / 00 / >100
                          if (v==="") { set({spo2_5min:v}); return; }
                          if (!/^\d{1,3}$/.test(v)) return;
                          const n=Number(v);
                          if (n>=1 && n<=100) set({spo2_5min:v});
                        }}/>
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>47. Time to SpO₂ &gt; 80% (MM:SS) <span className="field-note">cross-verify with pulse oximeter</span></label>
                      <DurationField mode="ms" name="time_to_spo2_80"
                        value={formData.time_to_spo2_80}
                        disabled={!isFieldEditable}
                        placeholder="MM:SS" maxLength={6}
                        onChange={v => set({ time_to_spo2_80: v })}/>
                    </div>
                    <div/>
                  </div>

                </div>
              </div>

              {/* ════════════════════════════════════════
                  B5 — MINUTE-WISE INTERVENTION TABLE
              ════════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <BarChart2 size={15} className="section-header-icon"/>
                    <h3>B5 · Intervention</h3>
                  </div>
                </div>
                <div className="form-section-body" style={{padding:"14px 0 4px"}}>
                  <div style={{overflowX:"auto",padding:"0 20px"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
                      <thead>
                        <tr style={{background:"#f0f9ff"}}>
                          <th style={{padding:"10px 14px",fontSize:11,fontWeight:700,textTransform:"uppercase",
                            letterSpacing:".06em",color:"#0369a1",textAlign:"left",
                            borderBottom:"2px solid #bae6fd",whiteSpace:"nowrap"}}>Intervention</th>
                          {times.map(t=>(
                            <th key={t} style={{padding:"10px 10px",fontSize:11,fontWeight:700,
                              textTransform:"uppercase",letterSpacing:".06em",color:"#0369a1",
                              textAlign:"center",borderBottom:"2px solid #bae6fd",whiteSpace:"nowrap"}}>
                              {t} min</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {key:"oxygen", label:"48. Oxygen"},
                          {key:"cpap",   label:"49. CPAP"},
                        ].map((row,ri)=>(
                          <tr key={row.key} style={{background:ri%2===0?"#fff":"#f9fafb"}}>
                            <td style={{padding:"9px 14px",fontSize:12,fontWeight:600,color:"#374151",
                              borderBottom:"1px solid #f3f4f6",whiteSpace:"nowrap"}}>{row.label}</td>
                            {times.map(t=>(
                              <td key={t} style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #f3f4f6"}}>
                                <IntvCell
                                  value={formData.interventions[row.key]?.[t]}
                                  disabled={!isFieldEditable}
                                  onChange={v=>handleIntv(row.key,t,v)}/>
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* Apgar row */}
                        <tr style={{background:"#fffbeb"}}>
                          <td style={{padding:"9px 14px",fontSize:12,fontWeight:700,color:"#92400e",
                            borderBottom:"1px solid #fde68a",whiteSpace:"nowrap"}}>50. Apgar score</td>
                          {times.map(t=>(
                            <td key={t} style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #fde68a"}}>
                              <input type="text" inputMode="numeric" maxLength={2} placeholder="0–10"
                                value={formData.interventions.apgar?.[t]||""}
                                readOnly={!isFieldEditable}
                                onChange={e=>{const v=e.target.value;if(/^\d{0,2}$/.test(v)&&(v===""||Number(v)<=10))handleIntv("apgar",t,v);}}
                                className={apgarCls(formData.interventions.apgar?.[t])}
                                style={{width:52,padding:"5px 4px",borderRadius:5,
                                  border:"1px solid #fde68a",textAlign:"center",fontSize:12,fontWeight:700}}/>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ════════════════════════════════════════
                  B6 — CORD BLOOD & RESUSCITATION EXIT
              ════════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <Droplets size={15} className="section-header-icon"/>
                    <h3>B6 · Cord Blood &amp; Resuscitation Exit</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* 51. Cord Blood
                      Branching: 51=Yes -> gases (54). 51=No -> ask 52.
                      52=Yes -> 53 source + 54 gases. 55 resus failure always. */}
                  <YesNoToggle label={<>51. Cord blood analysis{requiredMark}</>}
                    name="cord_blood_done" value={formData.cord_blood_done||""}
                    onChange={e=>{handleChange(e);set({cord_blood_within_1hr:"",cord_blood_source:"",cord_ph:"",cord_sbe:"",cord_pco2:""});}}
                    disabled={!isFieldEditable}/>

                  {formData.cord_blood_done==="No" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>52. If no, within 1 hr of birth sample{requiredMark}</label>
                          <select name="cord_blood_within_1hr" value={formData.cord_blood_within_1hr||""}
                            disabled={!isFieldEditable}
                            onChange={e=>{
                              handleChange(e);
                              if (e.target.value!=="Yes") set({cord_blood_source:"",cord_ph:"",cord_sbe:"",cord_pco2:""});
                            }}>
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 53. Source — when within-1hr sample was taken */}
                  {formData.cord_blood_done==="No" && formData.cord_blood_within_1hr==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>53. Source{requiredMark}</label>
                          <select name="cord_blood_source" value={formData.cord_blood_source||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Capillary">Capillary</option>
                            <option value="Venous">Venous</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 54. pH/SBE/pCO2 — any sample path */}
                  {(formData.cord_blood_done==="Yes" || (formData.cord_blood_done==="No" && formData.cord_blood_within_1hr==="Yes")) && (
                    <div className="followup-box">
                      <div className="form-grid-3">
                        <div className="form-group">
                          <label>54. pH{requiredMark}</label>
                          <input type="text" name="cord_ph" value={formData.cord_ph||""}
                            placeholder="6.8-7.8" readOnly={!isFieldEditable}
                            className={errors.cord_ph?"input-error":""}
                            onChange={e=>{const v=e.target.value;if(/^\d*\.?\d{0,2}$/.test(v)){set({cord_ph:v});setErrors(p=>({...p,cord_ph:v&&(Number(v)<6.8||Number(v)>7.8)?"pH must be 6.8-7.8":""}));}}}/>
                          {errors.cord_ph&&<div className="field-error">{errors.cord_ph}</div>}
                        </div>
                        <div className="form-group">
                          <label>54. SBE{requiredMark}</label>
                          <input type="text" name="cord_sbe" value={formData.cord_sbe||""}
                            placeholder="-30 to +30" readOnly={!isFieldEditable}
                            onChange={e=>{const v=e.target.value;if(/^-?\d*\.?\d{0,1}$/.test(v)&&(v===""||v==="-"||(Number(v)>=-30&&Number(v)<=30)))set({cord_sbe:v});}}/>
                        </div>
                        <div className="form-group">
                          <label>54. pCO₂{requiredMark}</label>
                          <input type="text" name="cord_pco2" value={formData.cord_pco2||""}
                            placeholder="10-100" inputMode="decimal" readOnly={!isFieldEditable}
                            onChange={e=>{const v=e.target.value;if(/^\d{0,3}(\.\d{0,1})?$/.test(v)&&(v===""||v==="."||Number(v)<=200))set({cord_pco2:v});}}/>
                        </div>
                      </div>
                    </div>
                  )}

                  <YesNoToggle label={<>55. Resuscitation failure{requiredMark}</>}
                    name="resus_failure" value={formData.resus_failure}
                    onChange={handleChange} disabled={!isFieldEditable}/>

                  <div className="form-grid-2" style={{marginTop:14}}>
                    <div className="form-group">
                      <label>56. SpO₂ at exit from trial gas (%) <span className="field-note">1–100 only</span></label>
                      <input type="text" name="spo2_exit_trial_gas" value={formData.spo2_exit_trial_gas||""}
                        inputMode="numeric" maxLength={3} placeholder="1–100"
                        readOnly={!isFieldEditable}
                        onChange={e=>{
                          const v=e.target.value;
                          if (v==="") { set({spo2_exit_trial_gas:v}); return; }
                          if (!/^\d{1,3}$/.test(v)) return;
                          const n=Number(v);
                          if (n>=1 && n<=100) set({spo2_exit_trial_gas:v});
                        }}/>
                    </div>
                    <div className="form-group">
                      <label>57. Total time (MM:SS) <span className="field-note">from APGAR timer</span></label>
                      <DurationField mode="ms" name="total_resus_time"
                        value={formData.total_resus_time}
                        disabled={!isFieldEditable}
                        placeholder="MM:SS" maxLength={6}
                        hasError={!!errors.total_resus_time}
                        onChange={v => set({ total_resus_time: v })}/>
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>58. Reason for resuscitation exit{requiredMark}</label>
                      <select name="reason_exit_trial_gas"
                        value={formData.reason_exit_trial_gas||""}
                        disabled={!isFieldEditable} onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Responded to resuscitation">Responded to resuscitation</option>
                        <option value="Required override to 100% O2 or CC">Required override to 100% O2 or CC</option>
                        <option value="Other">Other</option>
                      </select>
                      {formData.reason_exit_trial_gas==="Other" && (
                        <input type="text" name="reason_exit_trial_gas_other"
                          value={formData.reason_exit_trial_gas_other||""}
                          onChange={handleChange} placeholder="Specify *"
                          readOnly={!isFieldEditable} style={{marginTop:8}}/>
                      )}
                    </div>
                    <div/>
                  </div>

                  <YesNoToggle label={<>59. Did the PORTAL blender stop suddenly during use?{requiredMark}</>}
                    name="blender_stopped" value={formData.blender_stopped}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({blender_stopped_description:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.blender_stopped==="Yes" && (
                    <div className="followup-box">
                      <div className="form-group">
                        <label>If yes, describe{requiredMark}</label>
                        <textarea name="blender_stopped_description"
                          value={formData.blender_stopped_description||""}
                          maxLength={1000} rows={3} readOnly={!isFieldEditable}
                          onChange={handleChange} placeholder="Describe what happened"/>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </>)}

            {/* Notes */}
            <NotesBox formKey={`form_b_${(
              (screeningId && screeningId !== "undefined" && screeningId !== "null" && screeningId)
              || formData.screening_id
              || "new"
            )}`}/>

            {message && (
              <div className={`form-message${message.startsWith("✅")?" msg-success":" msg-error"}`}>
                {message}
              </div>
            )}

          </div>
        </fieldset>
      </form>

      {/* ── NAV BAR ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary"
          onClick={()=>navigate(`/form-a/${screeningId}`)}>
          <ArrowLeft size={15}/> Screening
        </button>
        <button type="button" className="btn btn-save" onClick={saveForm}>
          <Save size={15}/> Save
        </button>
        <button type="button" className="btn btn-draft" onClick={saveDraft}>
          <Save size={15}/> Save for Later
        </button>

        {/* Auto-save indicator */}
        <div className="autosave-indicator">
          {lastSaved && autoSaveStatus==="idle" && (
            <span className="last-saved-txt">
              <Ic d="M20 6L9 17l-5-5" s={11}/> Saved {relT(lastSaved)}
            </span>
          )}
          {isDirty && autoSaveStatus==="idle" && !lastSaved && (
            <span className="unsaved-dot-pill"><span className="unsaved-dot"/>Unsaved changes</span>
          )}
          {autoSaveStatus==="saving" && (
            <span className="autosave-pill autosave-pill--saving">
              <span className="autosave-dot autosave-dot--spin"/>Auto-saving…
            </span>
          )}
          {autoSaveStatus==="saved" && (
            <span className="autosave-pill autosave-pill--saved">
              <Ic d="M20 6L9 17l-5-5" s={11}/> Auto-saved
            </span>
          )}
          {autoSaveStatus==="error" && (
            <span className="autosave-pill autosave-pill--error">Auto-save failed</span>
          )}
        </div>

        <div className="footer-step-indicator">
          <span className="step-text">STEP 2 OF 17</span>
          <div className="step-progress-line">
            <div className="progress-segment active"/>
            <div className="progress-segment active"/>
            <div className="progress-segment"/>
            <div className="progress-segment"/>
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Maternal Details <ArrowRight size={15}/>
        </button>
      </div>

      {/* ── Missing fields modal ── */}
      {showMissingModal && (
        <div className="modal-overlay" onClick={()=>setShowMissingModal(false)}>
          <div className="mf-modal" onClick={e=>e.stopPropagation()}>
            <div className="mf-modal-header">
              <div className="mf-modal-icon-wrap">
                <AlertTriangle size={20} color="#f59e0b"/>
              </div>
              <div className="mf-modal-text">
                <h3 className="mf-modal-title">Required fields missing</h3>
                <p className="mf-modal-sub">
                  {missingFields.length} field{missingFields.length!==1?"s":""} need attention before saving
                </p>
              </div>
              <button className="mf-modal-close" onClick={()=>setShowMissingModal(false)}>
                <Ic d="M18 6L6 18M6 6l12 12" s={16}/>
              </button>
            </div>
            <div className="mf-modal-list">
              {missingFields.map((f,i)=>(
                <div key={i} className="mf-modal-item">
                  <span className="mf-modal-num">{i+1}</span>
                  <span className="mf-modal-label">{f.label}</span>
                </div>
              ))}
            </div>
            <div className="mf-modal-footer">
              <button className="mf-btn-secondary" onClick={()=>setShowMissingModal(false)}>Dismiss</button>
              <button className="mf-btn-primary"
                onClick={()=>{setShowMissingModal(false);setTimeout(()=>scrollToFirstError(missingFields),100);}}>
                <Ic d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01" s={13}/>
                Go to first error
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft saved modal */}
      {showDraftModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-icon">💾</div>
            <div className="modal-title">Draft Saved</div>
            <div className="modal-subtext">
              Your progress has been saved. You can return to this form any time to complete it.
            </div>
            <div style={{display:"flex", gap:"10px", marginTop:"16px"}}>
              <button className="modal-btn" style={{background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0"}}
                onClick={() => { setShowDraftModal(false); setIsSaved(true); }}>
                Keep Editing
              </button>
              <button className="modal-btn"
                onClick={() => { setShowDraftModal(false); navigate("/dashboard"); }}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      <PrintSummaryB formData={formData} />
    </>
  );
}
