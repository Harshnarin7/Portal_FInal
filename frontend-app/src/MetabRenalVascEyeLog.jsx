import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { toDateOnlyValue } from "./utils/datetime";
import "./styles/RespCVNeuro.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  CheckCircle, AlertTriangle, X, Clock,
  Lock, Shield, FileCheck, Copy, Edit,
  AlertOctagon, Unlock,
} from "lucide-react";

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

function SectionCard({ iconEmoji, title, answered, total, children, defaultOpen=true }) {
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

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function MetabRenalVascEyeLog() {
  const { enrollmentId } = useParams();
  const navigate         = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData }  = usePatient();
  const { user }         = useAuth();
  const userRole         = user?.role || "site_user";
  const isSuperadmin     = (userRole || "").toLowerCase() === "superadmin";

  /* ── UI state ── */
  const [activeDay, setActiveDay]         = useState(1);
  const [totalDays, setTotalDays]         = useState(14);
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
  const [loading, setLoading]             = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [savedAt, setSavedAt]             = useState(null);
  const [savedBy, setSavedBy]             = useState("");
  const [submittedAt, setSubmittedAt]     = useState(null);
  const [submittedBy, setSubmittedBy]     = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceDay, setCopySourceDay] = useState([]);

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
    lowest_glucose:         null, // #1
    hypoglycemia_episodes:  null, // #2
    hypoglycemia_rx:        null, // #3
    highest_glucose:        null, // #4
    insulin:                null, // #5
    metabolic_acidosis:     null, // #6
    sodium_value:           null, // #7
    potassium_value:        null, // #8
    ionized_calcium_value:  null, // #9
    osteopenia_suspected:   null, // #10
  });

  // 💧 RENAL (4.2, items 11-14)
  const [renalData, setRenalData] = useState({
    aki_stage:              null, // #11 — e.g. "Stage 1/2/3"
    creatinine:             null, // #12 — numeric mg/dL
    urine_output_total:     null, // #13
    dialysis_crrt:          null, // #14
  });

  // 🌡️ THERMOREGULATION (4.3, item 15)
  const [thermoData, setThermoData] = useState({
    axillary_temperature:   null, // #15
  });

  // 📍 LOCATION & OUTCOME (4.6, 4.7)
  const [tailData, setTailData] = useState({
    location:               null, // DR, NICU, Step-down/Nursery, KMC-N, Other
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

  const isFutureActiveDay = todayNicuDay != null && activeDay > todayNicuDay;
  const isPastActiveDay   = todayNicuDay != null && activeDay < todayNicuDay;
  // Same-morning grace window: yesterday's day stays open until 08:00 today
  // so a nurse finishing a late-night shift can still complete it.
  const MRVE_LATE_GRACE_HOUR = 8;
  const isLateGraceActiveDay =
    todayNicuDay != null && activeDay === todayNicuDay - 1 &&
    new Date().getHours() < MRVE_LATE_GRACE_HOUR;
  // Site-monitor override reopens an otherwise-locked day for a limited window.
  const isOverrideActiveDay =
    overrideUntil != null && new Date() < new Date(overrideUntil);

  const isSubmitted     = (dayStatuses[activeDay] || STATUS.EMPTY) === STATUS.SUBMITTED;
  const isFieldEditable =
    (!isSubmitted || isOverrideActiveDay) &&
    (!isSaved || isEditing);

  // Day 1 Date drives every day's calendar label and the future/past
  // lock above, so once any daily data exists it must stop moving.
  const day1DateLockedLocal = completedDays.length > 0 ||
    Object.values(dayStatuses).some(st => st && st !== STATUS.EMPTY);
  const day1DateLocked = (day1DateLockedRemote || day1DateLockedLocal) && !day1EditArmed;

  /* ═══════════════════════════════════════
     PROGRESS — hidden fields excluded
  ═══════════════════════════════════════ */
  const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

  // Metabolic: 10 fields (items 1-10)
  const METAB_BASE   = ["lowest_glucose","hypoglycemia_episodes","hypoglycemia_rx","highest_glucose",
                        "insulin","metabolic_acidosis","sodium_value","potassium_value",
                        "ionized_calcium_value","osteopenia_suspected"];
  const metabTotal   = METAB_BASE.length;
  const metabAnswered= METAB_BASE.filter(k => ans(metabData[k])).length;

  // Renal: 4 fields (items 11-14)
  const RENAL_BASE  = ["aki_stage","creatinine","urine_output_total","dialysis_crrt"];
  const renalTotal  = RENAL_BASE.length;
  const renalAnswered = RENAL_BASE.filter(k => ans(renalData[k])).length;

  // Thermoregulation: 1 field (item 15)
  const THERMO_KEYS    = ["axillary_temperature"];
  const thermoTotal    = THERMO_KEYS.length;
  const thermoAnswered = THERMO_KEYS.filter(k => ans(thermoData[k])).length;

  // Vascular: 7 fields always
  const VASC_KEYS    = ["picc_in_situ","uvc_in_situ","uac_in_situ","peripheral_iv","peripheral_arterial","extravasation_injury","line_complication"];
  const vascTotal    = VASC_KEYS.length;
  const vascAnswered = Math.min(VASC_KEYS.filter(k => ans(vascData[k])).length, vascTotal);

  // Eye: 3 base + 3 conditional
  const EYE_BASE  = ["rop_screening_due","rop_screened","rop_detected"];
  const EYE_ROP   = ["rop_stage","plus_disease","rop_treatment"];
  const eyeTotal  = EYE_BASE.length + (ropYes ? EYE_ROP.length : 0);
  const eyeAnswered = Math.min(
    EYE_BASE.filter(k => ans(eyeData[k])).length
    + (ropYes ? EYE_ROP.filter(k => ans(eyeData[k])).length : 0),
    eyeTotal
  );

  // Location & Survived the day: 2 fields (4.6, 4.7)
  const TAIL_KEYS    = ["location","survived_the_day"];
  const tailTotal    = TAIL_KEYS.length;
  const tailAnswered = TAIL_KEYS.filter(k => ans(tailData[k])).length;

  const totalAnswered = metabAnswered + renalAnswered + thermoAnswered + vascAnswered + eyeAnswered + tailAnswered;
  const totalFields   = metabTotal + renalTotal + thermoTotal + vascTotal + eyeTotal + tailTotal;
  const completionPct = totalFields > 0 ? Math.min(100, Math.round((totalAnswered / totalFields) * 100)) : 0;
  const canSubmit     = completionPct === 100 && !isSubmitted;

  /* ── Setters ── */
  const setMetab = (k, v) => isFieldEditable && setMetabData(p => ({ ...p, [k]: v }));
  const setRenal = (k, v) => isFieldEditable && setRenalData(p => ({ ...p, [k]: v }));
  const setThermo= (k, v) => isFieldEditable && setThermoData(p => ({ ...p, [k]: v }));
  const setVasc  = (k, v) => isFieldEditable && setVascData(p => ({ ...p, [k]: v }));
  const setEye   = (k, v) => isFieldEditable && setEyeData(p => ({ ...p, [k]: v }));
  const setTail  = (k, v) => isFieldEditable && setTailData(p => ({ ...p, [k]: v }));

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
      } catch (_) {}
    };
    load();
  }, [enrollmentId]);

  /* ── Load day data ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const loadDay = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/metab-renal-vasc-eye/${enrollmentId}/${activeDay}`);
        const d = res?.data || {};
        if (d && Object.keys(d).length > 0) {
          setMetabData({
            lowest_glucose:         d.lowest_glucose         ?? null,
            hypoglycemia_episodes:  d.hypoglycemia_episodes  ?? null,
            hypoglycemia_rx:        d.hypoglycemia_rx        ?? null,
            highest_glucose:        d.highest_glucose        ?? null,
            insulin:                d.insulin                ?? null,
            metabolic_acidosis:     d.metabolic_acidosis     ?? null,
            sodium_value:           d.sodium_value           ?? null,
            potassium_value:        d.potassium_value        ?? null,
            ionized_calcium_value:  d.ionized_calcium_value  ?? null,
            osteopenia_suspected:   d.osteopenia_suspected   ?? null,
          });
          setRenalData({
            aki_stage:              d.aki_stage          || null,
            creatinine:             d.creatinine         ?? null,
            urine_output_total:     d.urine_output_total ?? null,
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
            location:          d.location          || null,
            survived_the_day:  d.survived_the_day  ?? null,
          });
          const st = d.submission_status || STATUS.DRAFT;
          setDayStatuses(prev => ({ ...prev, [activeDay]: st }));
          setSavedAt(d.saved_at||null); setSavedBy(d.saved_by||"");
          setSubmittedAt(d.submitted_at||null); setSubmittedBy(d.submitted_by||"");
          setOverrideUntil(d.override_unlocked_until || null);
          setIsSaved(true); setIsEditing(false);
          if (!completedDays.includes(activeDay))
            setCompletedDays(prev => [...prev, activeDay]);
        } else { resetFormState(); }
      } catch (err) {
        if (err?.response?.status === 404) resetFormState();
      } finally { setLoading(false); }
    };
    loadDay();
  }, [enrollmentId, activeDay]);

  const resetFormState = () => {
    setMetabData({ lowest_glucose:null,hypoglycemia_episodes:null,hypoglycemia_rx:null,highest_glucose:null,
      insulin:null,metabolic_acidosis:null,sodium_value:null,potassium_value:null,
      ionized_calcium_value:null,osteopenia_suspected:null });
    setRenalData({ aki_stage:null,creatinine:null,urine_output_total:null,dialysis_crrt:null });
    setThermoData({ axillary_temperature:null });
    setVascData({ picc_in_situ:null,uvc_in_situ:null,uac_in_situ:null,peripheral_iv:null,
      peripheral_arterial:null,extravasation_injury:null,line_complication:null });
    setEyeData({ rop_screening_due:null,rop_screened:null,rop_detected:null,rop_stage:null,plus_disease:null,rop_treatment:null });
    setTailData({ location:null,survived_the_day:null });
    setIsSaved(false); setIsEditing(false);
    setSavedAt(null); setSavedBy(""); setSubmittedAt(null); setSubmittedBy("");
    setOverrideUntil(null);
    setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
  };

  const buildPayload = (now) => ({
    enrollment_id: enrollmentId, nicu_day: activeDay,
    ...metabData, ...renalData, ...thermoData, ...vascData, ...eyeData, ...tailData,
    submission_status: STATUS.DRAFT,
    saved_at: now,
    saved_by: user?.name || user?.username || "Nurse",
  });

  /* ── Save ── */
  const handleSave = async () => {
    if (!enrollmentId) return;
    if (!isFieldEditable) return; // future / locked-past / submitted (without override) — nothing to save
    const now = new Date().toISOString();
    try {
      const payload = buildPayload(now);
      isSaved
        ? await api.put(`/metab-renal-vasc-eye/${enrollmentId}/${activeDay}`, payload)
        : await api.post("/metab-renal-vasc-eye/", payload);
      markFormCompleted("metab_renal_vasc_eye");
      setIsSaved(true); setIsEditing(false);
      setSavedAt(now); setSavedBy(user?.name || user?.username || "Nurse");
      const newSt = completionPct===100 ? STATUS.COMPLETE : STATUS.DRAFT;
      setDayStatuses(prev => ({ ...prev, [activeDay]: newSt }));
      setDayMeta(prev => ({ ...prev, [activeDay]: { pct: completionPct, savedAt: now } }));
      if (!completedDays.includes(activeDay))
        setCompletedDays(prev => [...prev, activeDay]);
      setMessage("✅ Day " + activeDay + " saved successfully");
      setTimeout(() => setMessage(""), 3000);
    } catch (_) { setMessage("❌ Error saving — please try again"); }
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (!isSaved) await handleSave();
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
    await handleSave();
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
      setMetabData({
        lowest_glucose: d.lowest_glucose??null, hypoglycemia_episodes: d.hypoglycemia_episodes??null,
        hypoglycemia_rx: d.hypoglycemia_rx??null, highest_glucose: d.highest_glucose??null,
        insulin: d.insulin??null, metabolic_acidosis: d.metabolic_acidosis??null,
        sodium_value: d.sodium_value??null, potassium_value: d.potassium_value??null,
        ionized_calcium_value: d.ionized_calcium_value??null,
        osteopenia_suspected: d.osteopenia_suspected??null,
      });
      setRenalData({ aki_stage: d.aki_stage||null, creatinine: d.creatinine??null,
        urine_output_total: d.urine_output_total??null, dialysis_crrt: d.dialysis_crrt??null });
      setThermoData({ axillary_temperature: d.axillary_temperature??null });
      setVascData({ picc_in_situ: d.picc_in_situ??null, uvc_in_situ: d.uvc_in_situ??null,
        uac_in_situ: d.uac_in_situ??null, peripheral_iv: d.peripheral_iv??null,
        peripheral_arterial: d.peripheral_arterial??null, extravasation_injury: d.extravasation_injury??null,
        line_complication: d.line_complication??null });
      setEyeData({ rop_screening_due: d.rop_screening_due??null, rop_screened: d.rop_screened??null,
        rop_detected: d.rop_detected??null, rop_stage: d.rop_stage||null,
        plus_disease: d.plus_disease??null, rop_treatment: d.rop_treatment??null });
      setTailData({ location: d.location||null, survived_the_day: d.survived_the_day??null });
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
            <h2 className="rcn-patient-header-form-name">Metabolic / Renal / Vascular / Eye Daily Log</h2>
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
                <span className="rcn-pcard-label">
                  Gestation{patientInfo.gestationSource === "Form D NBS" ? " (NBS)" : ""}
                </span>
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
            <div className="rcn-day1-picker">
              <label className="rcn-day1-picker-label">
                Day 1 Date {day1DateLocked && <Lock size={11} style={{ verticalAlign: "-1px" }} />}
              </label>
              <input
                type="date"
                className="rcn-day1-picker-input"
                value={day1Date}
                readOnly={day1DateLocked}
                disabled={day1DateLocked}
                title={day1DateLocked
                  ? `Locked — daily data already exists for this baby${day1DateSetBy ? ` (set by ${day1DateSetBy})` : ""}`
                  : "Set once, from the baby's date of birth"}
                onChange={async e => {
                  if (day1DateLocked) return;
                  const v = e.target.value;
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
            <h2 className="rcn-summary-title">NICU Day {activeDay}</h2>
            <div className="rcn-summary-meta">
              <Clock size={13}/>
              <span>{isSaved?"Completed":"Not yet started"} — complete by 08:00 AM rounds</span>
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

            {/* ════ METABOLIC ════ */}
            <SectionCard iconEmoji="⚡" title="Metabolic Assessment"
              answered={metabAnswered} total={metabTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <NumRow label="Lowest Glucose (if <45 mg/dL)" value={metabData.lowest_glucose}
                  onChange={v=>setMetab("lowest_glucose",v)} disabled={!isFieldEditable} unit="mg/dL"/>
                <NumRow label="No. of Hypoglycemia Episodes" value={metabData.hypoglycemia_episodes}
                  onChange={v=>setMetab("hypoglycemia_episodes",v)} disabled={!isFieldEditable}/>
                <YNRow label="Hypoglycemia Rx" value={metabData.hypoglycemia_rx}
                  onChange={v=>setMetab("hypoglycemia_rx",v)} disabled={!isFieldEditable}/>
                <NumRow label="Highest Glucose (if >180 mg/dL)" value={metabData.highest_glucose}
                  onChange={v=>setMetab("highest_glucose",v)} disabled={!isFieldEditable} unit="mg/dL"/>
                <YNRow label="Hyperglycemia Rx (Insulin)" value={metabData.insulin}
                  onChange={v=>setMetab("insulin",v)} disabled={!isFieldEditable}/>
                <YNRow label="Metabolic Acidosis (pH <7.2)" value={metabData.metabolic_acidosis}
                  onChange={v=>setMetab("metabolic_acidosis",v)} disabled={!isFieldEditable}/>
                <NumRow label="Sodium Value (<135 or >142)" value={metabData.sodium_value}
                  onChange={v=>setMetab("sodium_value",v)} disabled={!isFieldEditable} unit="mmol/L"/>
                <NumRow label="Potassium Value (<3.5 or >6)" value={metabData.potassium_value}
                  onChange={v=>setMetab("potassium_value",v)} disabled={!isFieldEditable} unit="mmol/L"/>
                <NumRow label="Ionized Calcium Value (<0.9 or >1.2)" value={metabData.ionized_calcium_value}
                  onChange={v=>setMetab("ionized_calcium_value",v)} disabled={!isFieldEditable} unit="mmol/L"/>
                <YNRow label="Osteopenia Suspected" value={metabData.osteopenia_suspected}
                  onChange={v=>setMetab("osteopenia_suspected",v)} disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ RENAL ════ */}
            <SectionCard iconEmoji="💧" title="Renal Assessment"
              answered={renalAnswered} total={renalTotal} defaultOpen={true}>
              <div className="rcn-subsection" style={{marginTop:0}}>
                <div className="rcn-subsection-title">AKI (e.g. KDIGO Stage)</div>
                <StageCards
                  options={["Stage 1","Stage 2","Stage 3"]}
                  value={renalData.aki_stage}
                  onChange={v => isFieldEditable && setRenalData(p=>({...p,aki_stage:v}))}
                  disabled={!isFieldEditable}
                />
              </div>

              <div className="rcn-yn-list">
                <NumRow label="Serum Creatinine (mg/dL)" value={renalData.creatinine}
                  onChange={v=>setRenal("creatinine",v)} disabled={!isFieldEditable}
                  unit="mg/dL" placeholder="0.00"/>
                <NumRow label="Urine Output Total (8am–8am, mL/kg/hr)" value={renalData.urine_output_total}
                  onChange={v=>setRenal("urine_output_total",v)} disabled={!isFieldEditable}/>
                <YNRow label="Dialysis / CRRT" value={renalData.dialysis_crrt}
                  onChange={v=>setRenal("dialysis_crrt",v)} disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ THERMOREGULATION ════ */}
            <SectionCard iconEmoji="🌡️" title="Thermoregulation"
              answered={thermoAnswered} total={thermoTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <NumRow label="Axillary Temperature (<36.5 or >37.5)" value={thermoData.axillary_temperature}
                  onChange={v=>setThermo("axillary_temperature",v)} disabled={!isFieldEditable} unit="°C"/>
              </div>
            </SectionCard>

            {/* ════ VASCULAR ACCESS ════ */}
            <SectionCard iconEmoji="🩺" title="Vascular Access"
              answered={vascAnswered} total={vascTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="PICC In Situ"           value={vascData.picc_in_situ}         onChange={v=>setVasc("picc_in_situ",v)}         disabled={!isFieldEditable}/>
                <YNRow label="UVC In Situ"            value={vascData.uvc_in_situ}          onChange={v=>setVasc("uvc_in_situ",v)}          disabled={!isFieldEditable}/>
                <YNRow label="UAC In Situ"            value={vascData.uac_in_situ}          onChange={v=>setVasc("uac_in_situ",v)}          disabled={!isFieldEditable}/>
                <YNRow label="Peripheral IV"          value={vascData.peripheral_iv}        onChange={v=>setVasc("peripheral_iv",v)}        disabled={!isFieldEditable}/>
                <YNRow label="Peripheral Arterial"    value={vascData.peripheral_arterial}  onChange={v=>setVasc("peripheral_arterial",v)}  disabled={!isFieldEditable}/>
                <YNRow label="Extravasation Injury"   value={vascData.extravasation_injury} onChange={v=>setVasc("extravasation_injury",v)} disabled={!isFieldEditable}/>
                <YNRow label="Line Complication"      value={vascData.line_complication}    onChange={v=>setVasc("line_complication",v)}    disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ OPHTHALMOLOGY ════ */}
            <SectionCard iconEmoji="👁️" title="Ophthalmology (ROP)"
              answered={eyeAnswered} total={eyeTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="ROP Screening Due" value={eyeData.rop_screening_due}
                  onChange={v=>setEye("rop_screening_due",v)} disabled={!isFieldEditable}/>
                <YNRow label="ROP Screened"      value={eyeData.rop_screened}
                  onChange={v=>setEye("rop_screened",v)}      disabled={!isFieldEditable}/>
                <YNRow label="ROP Detected"      value={eyeData.rop_detected}
                  onChange={v => {
                    setEye("rop_detected", v);
                    if (v !== true)
                      setEyeData(p => ({ ...p, rop_stage:null, plus_disease:null, rop_treatment:null }));
                  }} disabled={!isFieldEditable}/>
              </div>

              {ropYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">ROP Stage</div>
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

            {/* ════ LOCATION & OUTCOME ════ */}
            <SectionCard iconEmoji="📍" title="Location & Outcome"
              answered={tailAnswered} total={tailTotal} defaultOpen={true}>
              <div className="rcn-subsection" style={{marginTop:0}}>
                <div className="rcn-subsection-title">Location</div>
                <PillSingle
                  options={["DR","NICU","Step-down/Nursery","KMC-N","Other"]}
                  value={tailData.location}
                  onChange={v => setTail("location", v)}
                  disabled={!isFieldEditable}
                />
              </div>
              <div className="rcn-yn-list">
                <YNRow label="Survived the Day" value={tailData.survived_the_day}
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
          onClick={() => navigate(`/infect-gi-hema-log/${enrollmentId}`)}>
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
          <div className="rcn-locked-badge"><Lock size={13}/> Day {activeDay} Locked</div>
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
    </>
  );
}
