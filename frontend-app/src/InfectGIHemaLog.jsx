import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { toDateOnlyValue } from "./utils/datetime";
// ✅ Reuses RespCVNeuro.css — same design system, same class names
import "./styles/RespCVNeuro.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  CheckCircle, AlertTriangle, X, Clock,
  Lock, Shield, FileCheck, Copy, Edit,
  AlertOctagon, History, Unlock,
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   CONSTANTS — identical to Helper Form 2
══════════════════════════════════════════════════════ */

const STATUS = {
  EMPTY:     "empty",
  DRAFT:     "draft",
  PARTIAL:   "partial",
  COMPLETE:  "complete",
  SUBMITTED: "submitted",
  LATE:      "late",
};

const DAY_STATUS_CONFIG = {
  [STATUS.EMPTY]:    { label: "Not started", color: "#CBD5E1", dot: "#CBD5E1" },
  [STATUS.DRAFT]:    { label: "Partial",     color: "#F59E0B", dot: "#F59E0B" },
  [STATUS.PARTIAL]:  { label: "Partial",     color: "#F59E0B", dot: "#F59E0B" },
  [STATUS.COMPLETE]: { label: "Complete",    color: "#10B981", dot: "#10B981" },
  [STATUS.SUBMITTED]:{ label: "Submitted",   color: "#0F4C81", dot: "#0F4C81" },
  [STATUS.LATE]:     { label: "Late",        color: "#EF4444", dot: "#EF4444" },
};

const LEGEND_ITEMS = [
  { label: "Not started", dot: "#CBD5E1" },
  { label: "Partial",     dot: "#F59E0B" },
  { label: "Complete",    dot: "#10B981" },
  { label: "Submitted",   dot: "#0F4C81" },
  { label: "Late",        dot: "#EF4444" },
];

/* ══════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS (identical to Helper Form 2)
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
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
      </svg>
      <span className="rcn-ring-text">{percent}%</span>
    </div>
  );
}

function YNRow({ label, value, onChange, disabled, hidden }) {
  if (hidden) return null;
  return (
    <div className="rcn-yn-row">
      <span className="rcn-yn-label">{label}</span>
      <div className="rcn-yn">
        <button type="button"
          className={`rcn-yn-btn rcn-yn-yes${value === true ? " rcn-yn-active-yes" : ""}`}
          onClick={() => !disabled && onChange(value === true ? null : true)}
          disabled={disabled}
        >Yes</button>
        <button type="button"
          className={`rcn-yn-btn rcn-yn-no${value === false ? " rcn-yn-active-no" : ""}`}
          onClick={() => !disabled && onChange(value === false ? null : false)}
          disabled={disabled}
        >No</button>
      </div>
    </div>
  );
}

function NumRow({ label, value, onChange, disabled, unit, placeholder = "0" }) {
  return (
    <div className="rcn-yn-row">
      <span className="rcn-yn-label">{label}</span>
      <div className="rcn-num-input" style={{ width: 140 }}>
        <input
          type="number" min="0" step="0.1"
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

function CultureStatusRow({ sent, positive, onChange, disabled }) {
  const value = sent !== true ? "" : positive === true ? "Positive" : positive === false ? "Negative" : "Awaited";
  return (
    <div className="rcn-yn-row">
      <label className="rcn-yn-label" htmlFor="blood-culture-status">Blood Culture Result</label>
      <select id="blood-culture-status" className="rcn-status-select" value={value}
        disabled={disabled}
        onChange={e => {
          const next = e.target.value;
          onChange({
            sent: next !== "",
            positive: next === "Positive" ? true : next === "Negative" ? false : null,
          });
        }}>
        <option value="">Select result</option>
        <option value="Positive">Positive</option>
        <option value="Negative">Negative</option>
        <option value="Awaited">Awaited</option>
      </select>
      <span className="rcn-field-sub">Awaited results remain editable on the original NICU day.</span>
    </div>
  );
}

function TextRow({ label, value, onChange, disabled, placeholder = "Enter value" }) {
  return (
    <div className="rcn-yn-row">
      <span className="rcn-yn-label">{label}</span>
      <input
        type="text"
        className="rcn-num-input"
        style={{ width: 140, fontSize: 14, padding: "8px 12px", fontWeight: 600 }}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={e => !disabled && onChange(e.target.value)}
        readOnly={disabled}
      />
    </div>
  );
}

/* Multi-select pills (for feed type: PDHM, EBM, FM) */
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

function SectionCard({ iconEmoji, title, answered, total, children, defaultOpen = true }) {
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
          <button className="rcn-modal-close" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="rcn-modal-body">
          <div className="rcn-modal-checklist">
            <div className={`rcn-modal-check ${completionPct === 100 ? "rcn-modal-check--ok" : "rcn-modal-check--warn"}`}>
              {completionPct === 100 ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
              <span>{completionPct === 100 ? "All fields completed (100%)" : `${completionPct}% complete — some fields unanswered`}</span>
            </div>
            <div className="rcn-modal-check rcn-modal-check--ok">
              <CheckCircle size={15} /><span>Nurse data entry saved</span>
            </div>
            <div className="rcn-modal-check rcn-modal-check--info">
              <Lock size={15} /><span>After submission, nurses cannot edit this day</span>
            </div>
          </div>
          {completionPct < 100 && (
            <div className="rcn-modal-warning">
              <AlertTriangle size={14} />
              <span>Submitting with incomplete data. Ensure missing fields are clinically not applicable before proceeding.</span>
            </div>
          )}
        </div>
        <div className="rcn-modal-footer">
          <button className="rcn-modal-btn rcn-modal-btn--cancel" onClick={onCancel} type="button" disabled={submitting}>Cancel</button>
          <button className="rcn-modal-btn rcn-modal-btn--submit" onClick={onConfirm} type="button" disabled={submitting}>
            {submitting ? "Submitting…" : <><Shield size={14} /> Confirm &amp; Submit</>}
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
          <div className="rcn-modal-icon" style={{ background: "#EFF6FF", color: "#0F4C81" }}>
            <Copy size={22} />
          </div>
          <div>
            <h3 className="rcn-modal-title">Copy from Previous Day</h3>
            <p className="rcn-modal-subtitle">Pre-fill Day {activeDay} with data from an earlier day</p>
          </div>
          <button className="rcn-modal-close" onClick={onCancel} type="button"><X size={18} /></button>
        </div>
        <div className="rcn-modal-body">
          <p className="rcn-copy-hint">Select the day to copy from:</p>
          <div className="rcn-copy-day-grid">
            {availableDays.map(d => (
              <button key={d} type="button"
                className={`rcn-copy-day-btn${selected === d ? " rcn-copy-day-btn--on" : ""}`}
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
            <Copy size={14} /> Copy Day {selected || "—"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function InfectGIHemaLog() {
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
    enrollmentId ? (localStorage.getItem(`igh_day1_${enrollmentId}`) || "") : ""
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
  const [overrideUntil, setOverrideUntil]          = useState(null); // active day's override expiry

  /* ── Patient info ── */
  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    babyUid: "",
    babyName: "",
    motherName: "",
    gestationalAge: "",
    gestationSource: "",
    admissionDate: "",
    dischargeDate: "",
    status: "In NICU",
  });

  /* ════════════════════════════════════════════════
     SECTION 1 — INFECTION (Fields 1-9)
  ════════════════════════════════════════════════ */
  const [infData, setInfData] = useState({
    sepsis_suspected:        null,  // 1
    blood_culture_sent:      null,  // 2
    blood_culture_positive:  null,  // 3 (Blood culture result)
    antibiotics:             null,  // 4
    lp_done:                 null,  // 5
    meningitis:              null,  // 6 (Y/N)
    meningitis_type:         null,  // 7 (Probable/Proven - conditional on meningitis=Yes)
    clabsi:                  null,  // 8
    vap:                     null,  // 9
  });

  /* ════════════════════════════════════════════════
     SECTION 2 — GASTROINTESTINAL (Fields 10-22)
  ════════════════════════════════════════════════ */
  const [giData, setGiData] = useState({
    npo:                     null,  // 10
    men:                     null,  // 11 (Minimal Enteral Nutrition)
    enteral_feeds_received:  null,  // 12 (renamed from enteral_feeds_started)
    feed_type:               [],    // 13 (PDHM, EBM, FM - multi-select)
    cumulative_feed_volume:  null,  // 14 (ml - numeric)
    feed_volume:             null,  // 15 (ml/kg/d - auto calculated)
    iv_fluids:               null,  // 16
    parenteral_nutrition:    null,  // 17
    probiotic:               null,  // 18
    feed_intolerance:        null,  // 19
    nec_suspected:           null,  // 20
    nec_confirmed_stage:     null,  // 21 (text — conditional on nec_suspected=Yes)
    cholestasis:             null,  // 22
  });

  /* ════════════════════════════════════════════════
     SECTION 3 — HEMATOLOGY (Fields 23-30)
  ════════════════════════════════════════════════ */
  const [hemaData, setHemaData] = useState({
    hb_value:                null,  // 23 (Hb value - numeric)
    jaundice:                null,  // 24
    phototherapy:            null,  // 25 (conditional on jaundice=Yes)
    peak_tsb:                null,  // 26 (mg/dL - numeric)
    exchange_transfusion:    null,  // 27
    prbc_transfusion:        null,  // 28
    platelet_transfusion:    null,  // 29
    ffp_cryo:                null,  // 30 (FFP/Cryo transfusion)
  });

  /* ── Derived visibility flags ── */
  const sepsisYes    = infData.sepsis_suspected === true;
  const meningitisYes = infData.meningitis === true;
  const necYes       = giData.nec_suspected === true;
  const jaundiceYes  = hemaData.jaundice === true;

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
  const IGH_LATE_GRACE_HOUR = 8;
  const isLateGraceActiveDay =
    todayNicuDay != null && activeDay === todayNicuDay - 1 &&
    new Date().getHours() < IGH_LATE_GRACE_HOUR;
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

  /* ══════════════════════════════════════════════
     PROGRESS CALCULATION
     Hidden/conditional fields excluded from total
  ══════════════════════════════════════════════ */

  // Helper to check if value is answered
  const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

  // Infection: 6 base + 3 conditional (sepsis) + 1 conditional (meningitis)
  // Fields 1-9: sepsis_suspected, blood_culture_sent, blood_culture_positive, antibiotics, lp_done, meningitis, meningitis_type, clabsi, vap
  const INF_BASE    = ["sepsis_suspected","antibiotics","lp_done","meningitis","clabsi","vap"];
  const INF_SEPSIS  = ["blood_culture_sent","blood_culture_positive"];
  const INF_MENING  = ["meningitis_type"];

  const infTotal    = INF_BASE.length + (sepsisYes ? INF_SEPSIS.length : 0) + (meningitisYes ? INF_MENING.length : 0);
  const infAnswered = Math.min(
    INF_BASE.filter(k => ans(infData[k])).length
    + (sepsisYes ? INF_SEPSIS.filter(k => ans(infData[k])).length : 0)
    + (meningitisYes ? INF_MENING.filter(k => ans(infData[k])).length : 0),
    infTotal
  );

  // GI: 12 base + 1 conditional (NEC)
  // Fields 10-22: npo, men, enteral_feeds_received, feed_type, cumulative_feed_volume, feed_volume, iv_fluids, parenteral_nutrition, probiotic, feed_intolerance, nec_suspected, nec_confirmed_stage, cholestasis
  const GI_BASE  = ["npo","men","enteral_feeds_received","feed_type","cumulative_feed_volume","feed_volume","iv_fluids","parenteral_nutrition","probiotic","feed_intolerance","nec_suspected","cholestasis"];
  const GI_NEC   = ["nec_confirmed_stage"];

  const giTotal    = GI_BASE.length + (necYes ? GI_NEC.length : 0);
  const giAnswered = Math.min(
    GI_BASE.filter(k => ans(giData[k])).length
    + (necYes ? GI_NEC.filter(k => ans(giData[k])).length : 0),
    giTotal
  );

  // Hematology: 7 base + 1 conditional (jaundice)
  // Fields 23-30: hb_value, jaundice, phototherapy, peak_tsb, exchange_transfusion, prbc_transfusion, platelet_transfusion, ffp_cryo
  const HEMA_BASE    = ["hb_value","jaundice","peak_tsb","exchange_transfusion","prbc_transfusion","platelet_transfusion","ffp_cryo"];
  const HEMA_JAUNDICE= ["phototherapy"];

  const hemaTotal    = HEMA_BASE.length + (jaundiceYes ? HEMA_JAUNDICE.length : 0);
  const hemaAnswered = Math.min(
    HEMA_BASE.filter(k => ans(hemaData[k])).length
    + (jaundiceYes ? HEMA_JAUNDICE.filter(k => ans(hemaData[k])).length : 0),
    hemaTotal
  );

  const totalAnswered = infAnswered + giAnswered + hemaAnswered;
  const totalFields   = infTotal + giTotal + hemaTotal;
  const completionPct = totalFields > 0
    ? Math.min(100, Math.round((totalAnswered / totalFields) * 100))
    : 0;
  const canSubmit = completionPct === 100 && !isSubmitted;

  /* ── Setters ── */
  const setInf  = (k, v) => isFieldEditable && setInfData(p => ({ ...p, [k]: v }));
  const setGi   = (k, v) => isFieldEditable && setGiData(p => ({ ...p, [k]: v }));
  const setHema = (k, v) => isFieldEditable && setHemaData(p => ({ ...p, [k]: v }));

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
          localStorage.setItem(`igh_day1_${enrollmentId}`, d1.day1_date);
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

      // Load summary
      try {
        const summRes = await api.get(`/infect-gi-hema/${enrollmentId}/summary`);
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

  /* ── Load saved day data ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const loadDay = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/infect-gi-hema/${enrollmentId}/${activeDay}`);
        const d = res?.data || {};
        if (d && Object.keys(d).length > 0) {
          setInfData({
            sepsis_suspected:        d.sepsis_suspected        ?? null,
            blood_culture_sent:      d.blood_culture_sent      ?? null,
            blood_culture_positive:  d.blood_culture_positive  ?? null,
            antibiotics:             d.antibiotics             ?? null,
            lp_done:                 d.lp_done                 ?? null,
            meningitis:              d.meningitis              ?? null,
            meningitis_type:         d.meningitis_type         ?? null,
            clabsi:                  d.clabsi                  ?? null,
            vap:                     d.vap                     ?? null,
          });
          setGiData({
            npo:                     d.npo                     ?? null,
            men:                     d.men                     ?? null,
            enteral_feeds_received:  d.enteral_feeds_received  ?? null,
            feed_type:               d.feed_type
              ? (Array.isArray(d.feed_type) ? d.feed_type
                : d.feed_type.split(",").map(s=>s.trim()).filter(Boolean))
              : [],
            cumulative_feed_volume:  d.cumulative_feed_volume  ?? null,
            feed_volume:             d.feed_volume             ?? null,
            iv_fluids:               d.iv_fluids               ?? null,
            parenteral_nutrition:    d.parenteral_nutrition    ?? null,
            probiotic:               d.probiotic               ?? null,
            feed_intolerance:        d.feed_intolerance        ?? null,
            nec_suspected:           d.nec_suspected           ?? null,
            nec_confirmed_stage:     d.nec_confirmed_stage     ?? null,
            cholestasis:             d.cholestasis             ?? null,
          });
          setHemaData({
            hb_value:             d.hb_value             ?? null,
            jaundice:             d.jaundice             ?? null,
            phototherapy:         d.phototherapy         ?? null,
            peak_tsb:             d.peak_tsb             ?? null,
            exchange_transfusion: d.exchange_transfusion ?? null,
            prbc_transfusion:     d.prbc_transfusion     ?? null,
            platelet_transfusion: d.platelet_transfusion ?? null,
            ffp_cryo:             d.ffp_cryo             ?? null,
          });
          const st = d.submission_status || STATUS.DRAFT;
          setDayStatuses(prev => ({ ...prev, [activeDay]: st }));
          setSavedAt(d.saved_at || null);
          setSavedBy(d.saved_by || "");
          setSubmittedAt(d.submitted_at || null);
          setSubmittedBy(d.submitted_by || "");
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
    setInfData({ sepsis_suspected: null, blood_culture_sent: null, blood_culture_positive: null,
      antibiotics: null, lp_done: null, meningitis: null, meningitis_type: null,
      clabsi: null, vap: null });
    setGiData({ npo: null, men: null, enteral_feeds_received: null, feed_type: [],
      cumulative_feed_volume: null, feed_volume: null, iv_fluids: null,
      parenteral_nutrition: null, probiotic: null, feed_intolerance: null,
      nec_suspected: null, nec_confirmed_stage: null, cholestasis: null });
    setHemaData({ hb_value: null, jaundice: null, phototherapy: null, peak_tsb: null,
      exchange_transfusion: null, prbc_transfusion: null,
      platelet_transfusion: null, ffp_cryo: null });
    setIsSaved(false); setIsEditing(false);
    setSavedAt(null); setSavedBy(""); setSubmittedAt(null); setSubmittedBy("");
    setOverrideUntil(null);
    setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
  };

  const getPayload = () => ({
    enrollment_id: enrollmentId, nicu_day: activeDay,
    ...infData,
    ...giData,
    feed_type: giData.feed_type.join(","), // Convert array to comma-separated string
    ...hemaData,
    submission_status: STATUS.DRAFT,
    saved_at: new Date().toISOString(),
    saved_by: user?.name || user?.username || "Nurse",
  });

  /* ── Save ── */
  const handleSave = async () => {
    if (!enrollmentId) return;
    if (!isFieldEditable) return; // future / locked-past / submitted (without override) — nothing to save
    const now = new Date().toISOString();
    const payload = { ...getPayload(), saved_at: now };
    try {
      isSaved
        ? await api.put(`/infect-gi-hema/${enrollmentId}/${activeDay}`, payload)
        : await api.post("/infect-gi-hema/", payload);
      markFormCompleted("infect_gi_hema");
      setIsSaved(true); setIsEditing(false);
      setSavedAt(now); setSavedBy(user?.name || user?.username || "Nurse");
      const newSt = completionPct === 100 ? STATUS.COMPLETE : STATUS.DRAFT;
      setDayStatuses(prev => ({ ...prev, [activeDay]: newSt }));
      setDayMeta(prev => ({ ...prev, [activeDay]: { pct: completionPct, savedAt: now } }));
      if (!completedDays.includes(activeDay))
        setCompletedDays(prev => [...prev, activeDay]);
      setMessage("✅ Day " + activeDay + " saved successfully");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage("❌ Error saving — please try again");
    }
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (!isSaved) await handleSave();
      const now = new Date().toISOString();
      await api.patch(`/infect-gi-hema/${enrollmentId}/${activeDay}/submit`, {
        submission_status: STATUS.SUBMITTED,
        submitted_at: now,
        submitted_by: user?.name || user?.username || "Site User",
      });
      setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.SUBMITTED }));
      setSubmittedAt(now); setSubmittedBy(user?.name || user?.username || "Site User");
      setShowModal(false);
      setMessage("🔒 Day " + activeDay + " submitted and locked");
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      setMessage("❌ Submission failed — please try again");
      setShowModal(false);
    } finally { setSubmitting(false); }
  };

  /* ── Next Form (save before navigate) ── */
  const handleNext = async () => {
    await handleSave();
    navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`);
  };

  /* ── Copy from day ── */
  const handleCopyFromDay = async (sourceDay) => {
    setShowCopyModal(false); setLoading(true);
    try {
      const res = await api.get(`/infect-gi-hema/${enrollmentId}/${sourceDay}`);
      const d = res?.data || {};
      if (!d || Object.keys(d).length === 0) {
        setMessage(`⚠️ No data found for Day ${sourceDay}`);
        setTimeout(() => setMessage(""), 3000);
        return;
      }
      setInfData({ sepsis_suspected: d.sepsis_suspected ?? null,
        blood_culture_sent: d.blood_culture_sent ?? null,
        blood_culture_positive: d.blood_culture_positive ?? null,
        antibiotics: d.antibiotics ?? null, lp_done: d.lp_done ?? null,
        meningitis: d.meningitis ?? null, meningitis_type: d.meningitis_type ?? null,
        clabsi: d.clabsi ?? null, vap: d.vap ?? null });
      setGiData({ npo: d.npo ?? null, men: d.men ?? null,
        enteral_feeds_received: d.enteral_feeds_received ?? null,
        feed_type: d.feed_type
          ? (Array.isArray(d.feed_type) ? d.feed_type
            : d.feed_type.split(",").map(s=>s.trim()).filter(Boolean))
          : [],
        cumulative_feed_volume: d.cumulative_feed_volume ?? null,
        feed_volume: d.feed_volume ?? null, iv_fluids: d.iv_fluids ?? null,
        parenteral_nutrition: d.parenteral_nutrition ?? null, probiotic: d.probiotic ?? null,
        feed_intolerance: d.feed_intolerance ?? null, nec_suspected: d.nec_suspected ?? null,
        nec_confirmed_stage: d.nec_confirmed_stage ?? null, cholestasis: d.cholestasis ?? null });
      setHemaData({ hb_value: d.hb_value ?? null, jaundice: d.jaundice ?? null,
        phototherapy: d.phototherapy ?? null, peak_tsb: d.peak_tsb ?? null,
        exchange_transfusion: d.exchange_transfusion ?? null,
        prbc_transfusion: d.prbc_transfusion ?? null, platelet_transfusion: d.platelet_transfusion ?? null,
        ffp_cryo: d.ffp_cryo ?? null });
      setIsSaved(false);
      setMessage(`📋 Copied from Day ${sourceDay} — review and save`);
      setTimeout(() => setMessage(""), 4000);
    } catch (_) {
      setMessage(`❌ Could not load Day ${sourceDay} data`);
      setTimeout(() => setMessage(""), 3000);
    } finally { setLoading(false); }
  };

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  // Past days with genuinely no data at all — surfaced as a "missed" warning.
  const missedDays = days.filter(d =>
    todayNicuDay != null && d < todayNicuDay &&
    (dayStatuses[d] || STATUS.EMPTY) === STATUS.EMPTY
  );

  /* ════════════════════ RENDER ════════════════════ */
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
            <div className="rcn-patient-header-badge">HELPER FORM 3</div>
            <h2 className="rcn-patient-header-form-name">Infection / GI / Hematology Daily Log</h2>
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
                  if (enrollmentId) localStorage.setItem(`igh_day1_${enrollmentId}`, v);
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

          {/* ── Status legend ── */}
          <div className="rcn-timeline-legend">
            {LEGEND_ITEMS.map(item => (
              <span key={item.label} className="rcn-legend-item">
                <span className="rcn-legend-dot" style={{ background: item.dot }} />
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

        {/* ── Daily Summary Card ── */}
        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">NICU Day {activeDay}</h2>
            <div className="rcn-summary-meta">
              <Clock size={13} />
              <span>{isSaved ? "Completed" : "Not yet started"} — complete by 08:00 AM rounds</span>
            </div>
            {!isSubmitted && !isFutureActiveDay && !isPastActiveDay && activeDay > 1 && (
              <button type="button" className="rcn-copy-btn"
                onClick={() => {
                  const available = Object.keys(dayStatuses).map(Number)
                    .filter(d => d < activeDay && dayStatuses[d] !== STATUS.EMPTY);
                  setCopySourceDay(available); setShowCopyModal(true);
                }}>
                <Copy size={13} /> Copy from previous day
              </button>
            )}
          </div>
          <div className="rcn-summary-right">
            <div className="rcn-summary-sections">
              {[
                { emoji: "🦠", label: "Infection",        done: infAnswered,  total: infTotal  },
                { emoji: "🍽️", label: "Gastrointestinal", done: giAnswered,   total: giTotal   },
                { emoji: "🩸", label: "Hematology",       done: hemaAnswered, total: hemaTotal },
              ].map(s => (
                <div className="rcn-summary-section" key={s.label}>
                  <span className="rcn-summary-section-emoji">{s.emoji}</span>
                  <span className="rcn-summary-section-name">{s.label}</span>
                  <span className="rcn-summary-section-count">
                    {s.done}<span className="rcn-summary-section-total">/{s.total}</span>
                  </span>
                  <div className="rcn-summary-section-bar">
                    <div className="rcn-summary-section-bar-fill"
                      style={{ width: `${s.total > 0 ? (s.done / s.total) * 100 : 0}%` }} />
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

            {/* Discharge banner */}
            {dischargeDay && activeDay > dischargeDay && (
              <div className="rcn-status-banner rcn-status-banner--discharged">
                <span style={{ fontSize: 18 }}>🏠</span>
                <div className="rcn-status-banner-text">
                  <strong>Patient Discharged</strong>
                  <span>Day {dischargeDay} was the last NICU day. Data entry beyond this point is locked.</span>
                </div>
              </div>
            )}

            {/* Submitted banner */}
            {currentDayStatusSubmitted(dayStatuses, activeDay) && (
              <div className="rcn-status-banner rcn-status-banner--submitted">
                <Lock size={15} />
                <div className="rcn-status-banner-text">
                  <strong>Day {activeDay} Submitted &amp; Locked</strong>
                  <span>Submitted by {submittedBy || "Site User"}{submittedAt ? ` · ${new Date(submittedAt).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}` : ""}</span>
                </div>
              </div>
            )}

            {/* Incomplete prompt */}
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

            {/* ════ INFECTION (Fields 1-9) ════ */}
            <SectionCard iconEmoji="🦠" title="Infection Assessment"
              answered={infAnswered} total={infTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <YNRow label="1. Sepsis Suspected" value={infData.sepsis_suspected}
                  onChange={v => {
                    setInf("sepsis_suspected", v);
                    if (v !== true) {
                      setInfData(p => ({ ...p, blood_culture_sent: null,
                        blood_culture_positive: null }));
                    }
                  }} disabled={!isFieldEditable} />
              </div>

              {sepsisYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">2-3. If Sepsis Suspected</div>
                  <div className="rcn-yn-list">
                    <YNRow label="2. Blood Culture Sent" value={infData.blood_culture_sent}
                      onChange={v => setInf("blood_culture_sent", v)} disabled={!isFieldEditable} />
                    <YNRow label="3. Blood Culture Positive" value={infData.blood_culture_positive}
                      onChange={v => setInf("blood_culture_positive", v)} disabled={!isFieldEditable} />
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <YNRow label="4. Antibiotics"          value={infData.antibiotics}    onChange={v => setInf("antibiotics", v)}    disabled={!isFieldEditable} />
                <YNRow label="5. LP Done"              value={infData.lp_done}        onChange={v => setInf("lp_done", v)}        disabled={!isFieldEditable} />
                <YNRow label="6. Meningitis (Y/N)"     value={infData.meningitis}
                  onChange={v => {
                    setInf("meningitis", v);
                    if (v !== true) {
                      setInfData(p => ({ ...p, meningitis_type: null }));
                    }
                  }} disabled={!isFieldEditable} />
              </div>

              {meningitisYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">7. If Meningitis</div>
                  <div className="rcn-yn-list">
                    <div className="rcn-yn-row">
                      <span className="rcn-yn-label">Meningitis Type</span>
                      <select
                        className="rcn-status-select"
                        value={infData.meningitis_type || ""}
                        disabled={!isFieldEditable}
                        onChange={e => setInf("meningitis_type", e.target.value || null)}
                      >
                        <option value="">Select type</option>
                        <option value="Probable">Probable</option>
                        <option value="Proven">Proven</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <YNRow label="8. CLABSI"                value={infData.clabsi}               onChange={v => setInf("clabsi", v)}               disabled={!isFieldEditable} />
                <YNRow label="9. VAP"                   value={infData.vap}                  onChange={v => setInf("vap", v)}                  disabled={!isFieldEditable} />
              </div>
            </SectionCard>

            {/* ════ GASTROINTESTINAL (Fields 10-22) ════ */}
            <SectionCard iconEmoji="🍽️" title="Gastrointestinal Assessment"
              answered={giAnswered} total={giTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <YNRow label="10. NPO" value={giData.npo} onChange={v => setGi("npo", v)} disabled={!isFieldEditable} />
                <YNRow label="11. MEN (Minimal Enteral Nutrition)" value={giData.men} onChange={v => setGi("men", v)} disabled={!isFieldEditable} />
                <YNRow label="12. Enteral Feeds Received" value={giData.enteral_feeds_received} onChange={v => setGi("enteral_feeds_received", v)} disabled={!isFieldEditable} />
              </div>

              <div className="rcn-subsection" style={{marginTop:16}}>
                <div className="rcn-subsection-title">13. Feed Type <span style={{fontSize:11,fontWeight:500,color:"#94A3B8"}}>(select all that apply)</span></div>
                <PillMulti
                  options={["PDHM","EBM","FM"]}
                  value={giData.feed_type}
                  onChange={v => isFieldEditable && setGiData(p => ({ ...p, feed_type: v }))}
                  disabled={!isFieldEditable}
                />
              </div>

              <div className="rcn-yn-list" style={{marginTop:16}}>
                <NumRow label="14. Cumulative Feed Volume (ml)" value={giData.cumulative_feed_volume} onChange={v => setGi("cumulative_feed_volume", v)} disabled={!isFieldEditable} unit="ml" placeholder="0" />
                <NumRow label="15. Feed Volume (ml/kg/d)" value={giData.feed_volume} onChange={v => setGi("feed_volume", v)} disabled={!isFieldEditable} unit="ml/kg/d" placeholder="0" />
                <YNRow label="16. IV Fluids" value={giData.iv_fluids} onChange={v => setGi("iv_fluids", v)} disabled={!isFieldEditable} />
                <YNRow label="17. Parenteral Nutrition" value={giData.parenteral_nutrition} onChange={v => setGi("parenteral_nutrition", v)} disabled={!isFieldEditable} />
                <YNRow label="18. Probiotic" value={giData.probiotic} onChange={v => setGi("probiotic", v)} disabled={!isFieldEditable} />
                <YNRow label="19. Feed Intolerance" value={giData.feed_intolerance} onChange={v => setGi("feed_intolerance", v)} disabled={!isFieldEditable} />
                <YNRow label="20. NEC Suspected" value={giData.nec_suspected}
                  onChange={v => {
                    setGi("nec_suspected", v);
                    if (v !== true)
                      setGiData(p => ({ ...p, nec_confirmed_stage: null }));
                  }} disabled={!isFieldEditable} />
              </div>

              {necYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">21. If NEC Suspected</div>
                  <div className="rcn-yn-list">
                    <div className="rcn-yn-row">
                      <span className="rcn-yn-label">NEC Confirmed Stage</span>
                      <select
                        className="rcn-status-select"
                        value={giData.nec_confirmed_stage || ""}
                        disabled={!isFieldEditable}
                        onChange={e => setGi("nec_confirmed_stage", e.target.value || null)}
                      >
                        <option value="">Select stage</option>
                        <option value="Stage I">Stage I</option>
                        <option value="Stage II">Stage II</option>
                        <option value="Stage III">Stage III</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <YNRow label="22. Cholestasis" value={giData.cholestasis} onChange={v => setGi("cholestasis", v)} disabled={!isFieldEditable} />
              </div>
            </SectionCard>

            {/* ════ HEMATOLOGY (Fields 23-30) ════ */}
            <SectionCard iconEmoji="🩸" title="Hematology Assessment"
              answered={hemaAnswered} total={hemaTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <NumRow label="23. Hb Value (g/dL)" value={hemaData.hb_value} onChange={v => setHema("hb_value", v)} disabled={!isFieldEditable} unit="g/dL" placeholder="0.0" />
                <YNRow label="24. Jaundice" value={hemaData.jaundice}
                  onChange={v => {
                    setHema("jaundice", v);
                    if (v !== true) setHemaData(p => ({ ...p, phototherapy: null }));
                  }} disabled={!isFieldEditable} />
              </div>

              {jaundiceYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">25. If Jaundice</div>
                  <div className="rcn-yn-list">
                    <YNRow label="Phototherapy" value={hemaData.phototherapy}
                      onChange={v => setHema("phototherapy", v)} disabled={!isFieldEditable} />
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <NumRow label="26. Peak TSB (mg/dL)" value={hemaData.peak_tsb} onChange={v => setHema("peak_tsb", v)} disabled={!isFieldEditable} unit="mg/dL" placeholder="0.0" />
                <YNRow label="27. Exchange Transfusion" value={hemaData.exchange_transfusion} onChange={v => setHema("exchange_transfusion", v)} disabled={!isFieldEditable} />
                <YNRow label="28. PRBC Transfusion" value={hemaData.prbc_transfusion} onChange={v => setHema("prbc_transfusion", v)} disabled={!isFieldEditable} />
                <YNRow label="29. Platelet Transfusion" value={hemaData.platelet_transfusion} onChange={v => setHema("platelet_transfusion", v)} disabled={!isFieldEditable} />
                <YNRow label="30. FFP / Cryo Transfusion" value={hemaData.ffp_cryo} onChange={v => setHema("ffp_cryo", v)} disabled={!isFieldEditable} />
              </div>
            </SectionCard>

          </div>
        )}

        {message && (
          <div className={`form-message${message.startsWith("✅") || message.startsWith("🔒") ? " form-message--success" : " form-message--error"}`}>
            {message}
          </div>
        )}

      </div>{/* end rcn-page */}

      {/* Modals */}
      {showCopyModal && (
        <CopyDayModal activeDay={activeDay} availableDays={copySourceDay}
          onConfirm={handleCopyFromDay} onCancel={() => setShowCopyModal(false)} />
      )}
      {showModal && (
        <SubmitModal day={activeDay} completionPct={completionPct}
          onConfirm={handleSubmit} onCancel={() => setShowModal(false)} submitting={submitting} />
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
                      `/infect-gi-hema/${enrollmentId}/${activeDay}/override-unlock`,
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

      {/* ══ STICKY FOOTER ══ */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/vs6-1/${enrollmentId}`)}>
          <ArrowLeft size={15} /> Resp-CV-Neuro
        </button>

        {/* Save — always visible when editing */}
        {isFieldEditable && (
          <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSave}>
            <Save size={15} /> Save
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
          <div className="rcn-locked-badge">
            <Lock size={13} /> Day {activeDay} Locked
          </div>
        ) : isFutureActiveDay ? (
          <div className="rcn-locked-badge" title="Data can only be entered on the day's own calendar date">
            <Lock size={13} /> Day {activeDay} Not Available Yet
          </div>
        ) : isPastActiveDay && isLateGraceActiveDay ? (
          canSubmit ? (
            <button type="button" className="btn btn-submit-day" onClick={() => setShowModal(true)}
              title="Submit and lock this day">
              <Shield size={15} /> Submit Day {activeDay} (Late)
            </button>
          ) : (
            <button type="button" className="btn btn-draft" onClick={handleSave}
              title={`Grace window open until ${IGH_LATE_GRACE_HOUR}:00 AM`}>
              <Save size={15} /> Save (Late Entry)
            </button>
          )
        ) : isPastActiveDay ? (
          <>
            <div className="rcn-locked-badge" title="This day's window has passed — view only">
              <Lock size={13} /> Day {activeDay} Locked (Past Day)
            </div>
            {isSuperadmin && (
              <button
                type="button"
                className="rcn-override-btn"
                onClick={() => setShowOverrideModal(true)}
                title="Reopen this day temporarily for a correction"
              >
                <Unlock size={13} /> Override &amp; Unlock
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
            <Shield size={15} /> Submit Day {activeDay}
          </button>
        ) : (
          <button type="button" className="btn btn-draft"
            onClick={handleSave}>
            <Save size={15} /> Save for Later
          </button>
        )}

        <div className="footer-step-indicator">
          <span className="step-text">HELPER 3 OF 4</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment" />
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Next Form <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}

// small helper kept local so the "Submitted" banner logic matches Form 2's currentDayStatus check
function currentDayStatusSubmitted(dayStatuses, activeDay) {
  return (dayStatuses[activeDay] || "empty") === "submitted";
}
