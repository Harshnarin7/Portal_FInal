import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { toDateOnlyValue } from "./utils/datetime";
import "./styles/RespCVNeuro.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  CheckCircle, AlertCircle, Clock,
  Lock, Send, Shield, AlertTriangle, X,
  FileCheck, Copy, History, Unlock, AlertOctagon, Edit,
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
];

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

function YNRow({ label, value, onChange, disabled }) {
  return (
    <div className="rcn-yn-row">
      <span className="rcn-yn-label">{label}</span>
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

/* ── Submit Confirmation Modal ── */
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
            <div className="rcn-modal-check rcn-modal-check--info">
              <Lock size={15} />
              <span>After submission, nurses cannot edit this day</span>
            </div>
          </div>
          {completionPct < 100 && (
            <div className="rcn-modal-warning">
              <AlertTriangle size={14} />
              <span>
                Submitting with incomplete data. Ensure missing fields are
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
          <button className="rcn-modal-btn rcn-modal-btn--submit"
            onClick={onConfirm} type="button" disabled={submitting}>
            {submitting
              ? "Submitting…"
              : <><Shield size={14} /> Confirm &amp; Submit</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Copy Day Modal ── */
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
          <button className="rcn-modal-close" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="rcn-modal-body">
          <p className="rcn-copy-hint">Select the day to copy from:</p>
          <div className="rcn-copy-day-grid">
            {availableDays.map(d => (
              <button
                key={d}
                type="button"
                className={`rcn-copy-day-btn${selected === d ? " rcn-copy-day-btn--on" : ""}`}
                onClick={() => setSelected(d)}
              >
                <span className="rcn-copy-day-num">Day {d}</span>
              </button>
            ))}
          </div>
          {availableDays.length === 0 && (
            <div className="rcn-copy-empty">No previous days with saved data found.</div>
          )}
        </div>
        <div className="rcn-modal-footer">
          <button className="rcn-modal-btn rcn-modal-btn--cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="rcn-modal-btn rcn-modal-btn--submit"
            style={{ background: selected ? "linear-gradient(135deg,#0F4C81,#1A5F9E)" : undefined }}
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            type="button"
          >
            <Copy size={14} /> Copy Day {selected || "—"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RespCVNeuroLog() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();
  const { user } = useAuth();
  const userRole    = user?.role || "site_user";
  const isSuperadmin = (userRole || "").toLowerCase() === "superadmin";
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
  const [loading, setLoading]             = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [savedAt, setSavedAt]             = useState(null);
  const [savedBy, setSavedBy]             = useState("");
  const [submittedAt, setSubmittedAt]     = useState(null);
  const [submittedBy, setSubmittedBy]     = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceDay, setCopySourceDay] = useState(null);

  /* ── Day 1 Date — backend-synced lock state ── */
  const [day1DateLockedRemote, setDay1DateLockedRemote] = useState(false);
  const [day1DateSetBy, setDay1DateSetBy]     = useState("");
  const [day1EditArmed, setDay1EditArmed]     = useState(false); // superadmin explicit unlock

  /* ── Audit trail ── */
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditEntries, setAuditEntries]     = useState([]);
  const [auditLoading, setAuditLoading]     = useState(false);

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
  const [mapCpap, setMapCpap]           = useState(""); // #4
  const [maxFio2, setMaxFio2]           = useState("");
  const [maxFlow, setMaxFlow]           = useState("");
  const [lowestPh, setLowestPh]         = useState(""); // #8
  const [pao2Range, setPao2Range]       = useState(""); // #9
  const [paco2Range, setPaco2Range]     = useState(""); // #10
  const [apneaCount, setApneaCount]             = useState(""); // #13
  const [desatCount, setDesatCount]             = useState(""); // #14
  const [severeDesatCount, setSevereDesatCount] = useState(""); // #15
  const [respEvents, setRespEvents]     = useState({
    supp_o2: null, surfactant: null, caffeine: null,
    extub_attempted: null, extub_failure: null,
    pulm_hemorrhage: null, pneumothorax: null, chest_drain: null,
    pphn: null, postnatal_steroids: null,
  });

  /* ── Cardiovascular state ── */
  const [cvData, setCvData] = useState({
    pda_suspected: null, echo_done: null, hs_pda: null,
    shock: null, vasoactive_support: null,
  });
  const [fluidBolus, setFluidBolus] = useState(""); // #29
  const [vasoactiveDrugs, setVasoactiveDrugs] = useState([]);

  /* ── Neurological state ── */
  const [neuroData, setNeuroData] = useState({
    cranial_usg: null, ivh: null, ivh_grade: null,
    pvl_suspected: null, cpvl_confirmed: null, ventriculomegaly: null,
    clinical_seizures: null, eeg_seizures: null, aeds_given: null,
    non_ivh_ich: null, meningitis_suspected: null,
  });

  const currentDayStatus = dayStatuses[activeDay] || STATUS.EMPTY;
  const isSubmitted      = currentDayStatus === STATUS.SUBMITTED;

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
  const RCN_LATE_GRACE_HOUR = 8;
  const isLateGraceActiveDay =
    todayNicuDay != null && activeDay === todayNicuDay - 1 &&
    new Date().getHours() < RCN_LATE_GRACE_HOUR;
  // Site-monitor override reopens an otherwise-locked day for a limited window.
  const isOverrideActiveDay =
    overrideUntil != null && new Date() < new Date(overrideUntil);

  const isFieldEditable  =
    (!isSubmitted || isOverrideActiveDay) &&
    (!isSaved || isEditing);

  // Day 1 Date drives every day's calendar label and the future/past
  // lock above, so once any daily data exists it must stop moving —
  // editing it after the fact would silently reshuffle which days are
  // "past" vs "future" and could unlock/relock the wrong records.
  const day1DateLockedLocal = completedDays.length > 0 ||
    Object.values(dayStatuses).some(st => st && st !== STATUS.EMPTY);
  const day1DateLocked = (day1DateLockedRemote || day1DateLockedLocal) && !day1EditArmed;

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
    const loadDay = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/resp-cv-neuro/${enrollmentId}/${activeDay}`);
        const d = res?.data || {};
        if (d && Object.keys(d).length > 0) {
          setWeightKg(d.weight_kg || "");
          setSupportModes(d.support_modes ? d.support_modes.split(",").map(s => s.trim()).filter(Boolean) : []);
          setRespiratorySupport(d.respiratory_support ?? null);
          setEndotrachealIntubation(d.endotracheal_intubation ?? null);
          setMapCpap(d.map_cpap != null ? String(d.map_cpap) : "");
          setMaxFio2(d.max_fio2 != null ? String(d.max_fio2) : "");
          setMaxFlow(d.max_flow != null ? String(d.max_flow) : "");
          setLowestPh(d.lowest_ph || "");
          setPao2Range(d.pao2_range || "");
          setPaco2Range(d.paco2_range || "");
          setApneaCount(d.apnea_count || "");
          setDesatCount(d.desaturation_count || "");
          setSevereDesatCount(d.severe_desaturation_count || "");
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
          });
          setFluidBolus(d.fluid_bolus || "");
          setVasoactiveDrugs(d.vasoactive_drugs ? d.vasoactive_drugs.split(",").map(s => s.trim()).filter(Boolean) : []);
          setNeuroData({
            cranial_usg:        d.cranial_usg        ?? null,
            ivh:                d.ivh                ?? null,
            ivh_grade:          d.ivh_grade          || null,
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
          setIsEditing(false);
          if (!completedDays.includes(activeDay))
            setCompletedDays(prev => [...prev, activeDay]);
        } else {
          resetFormState();
        }
      } catch (err) {
        if (err?.response?.status === 404) resetFormState();
      } finally {
        setLoading(false);
      }
    };
    loadDay();
  }, [enrollmentId, activeDay]);

  const resetFormState = () => {
    setWeightKg("");
    setSupportModes([]);
    setRespiratorySupport(null); setEndotrachealIntubation(null);
    setMapCpap(""); setMaxFio2(""); setMaxFlow("");
    setLowestPh(""); setPao2Range(""); setPaco2Range("");
    setApneaCount(""); setDesatCount(""); setSevereDesatCount("");
    setRespEvents({ supp_o2: null, surfactant: null, caffeine: null,
      extub_attempted: null, extub_failure: null,
      pulm_hemorrhage: null, pneumothorax: null, chest_drain: null,
      pphn: null, postnatal_steroids: null });
    setCvData({ pda_suspected: null, echo_done: null, hs_pda: null,
      pda_medical_rx: null, shock: null, vasoactive_support: null });
    setFluidBolus("");
    setVasoactiveDrugs([]);
    setNeuroData({ cranial_usg: null, ivh: null, ivh_grade: null,
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
    "supp_o2","surfactant","caffeine",
    "extub_attempted","extub_failure","pulm_hemorrhage","pneumothorax",
    "chest_drain","pphn","postnatal_steroids",
  ]; // items 7,11,12,16-22 = 10 keys
  const respEventsAnswered = RESP_EVENT_KEYS.filter(k => respEvents[k] !== null).length;
  const respTotal    = 23; // weight(2.1) + items 1-22
  const respAnswered = Math.min(
    (weightKg !== "" ? 1 : 0)                      // 2.1 weight
    + (respiratorySupport !== null ? 1 : 0)          // 1
    + (endotrachealIntubation !== null ? 1 : 0)    // 2
    + (supportModes.length > 0 ? 1 : 0)            // 3
    + (mapCpap !== "" ? 1 : 0)                     // 4
    + (maxFio2 !== "" ? 1 : 0)                     // 5
    + (maxFlow  !== "" ? 1 : 0)                    // 6
    + (lowestPh !== "" ? 1 : 0)                    // 8
    + (pao2Range !== "" ? 1 : 0)                   // 9
    + (paco2Range !== "" ? 1 : 0)                  // 10
    + (apneaCount !== "" ? 1 : 0)                  // 13
    + (desatCount !== "" ? 1 : 0)                  // 14
    + (severeDesatCount !== "" ? 1 : 0)            // 15
    + respEventsAnswered,                          // 7,11,12,16-22
    respTotal
  );

  // ── CARDIOVASCULAR (spec items 23-29) ────────────────────
  // Base always-visible: pda_suspected(23), echo_done(24), hs_pda(25), shock(26),
  //   vasoactive_support(27) = 5. fluid_bolus(29) always visible = 1.
  // Conditional: vasoactive_drugs(28) — only counts when vasoactive_support === true.
  const CV_KEYS = ["pda_suspected","echo_done","hs_pda","shock","vasoactive_support"];
  const vasoactiveVisible = cvData.vasoactive_support === true;
  const cvTotal    = vasoactiveVisible ? 7 : 6;
  const cvAnswered = Math.min(
    CV_KEYS.filter(k => cvData[k] !== null).length
    + (fluidBolus !== "" ? 1 : 0)
    + (vasoactiveVisible && vasoactiveDrugs.length > 0 ? 1 : 0),
    cvTotal
  );

  // ── NEUROLOGICAL (spec items 30-37) ──────────────────────
  // Base fields (always visible): cranial_usg(30), ivh(31), cpvl_confirmed(32),
  //   ventriculomegaly(33), clinical_seizures(34), eeg_seizures(35),
  //   aeds_given(36), non_ivh_ich(37) = 8 fields
  // Conditional: ivh_grade — only counts when ivh === true (+1 field)
  const NEURO_BASE_KEYS = [
    "cranial_usg","ivh","cpvl_confirmed","ventriculomegaly",
    "clinical_seizures","eeg_seizures","aeds_given","non_ivh_ich",
  ]; // exactly 8
  const ivhGradeVisible = neuroData.ivh === true;
  const neuroTotal    = ivhGradeVisible ? 9 : 8;
  const neuroAnswered = Math.min(
    NEURO_BASE_KEYS.filter(k => neuroData[k] !== null).length
    + (ivhGradeVisible && neuroData.ivh_grade ? 1 : 0),
    neuroTotal
  );

  // ── OVERALL ──────────────────────────────────────────────
  const totalAnswered = respAnswered + cvAnswered + neuroAnswered;
  const totalFields   = respTotal + cvTotal + neuroTotal;
  const completionPct = totalFields > 0
    ? Math.min(100, Math.round((totalAnswered / totalFields) * 100))
    : 0;
  const canSubmit = completionPct === 100 && !isSubmitted;

  /* ── Helpers ── */
  const toggleMode = (mode) => {
    if (!isFieldEditable) return;
    setSupportModes(prev =>
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    );
  };
  const toggleDrug = (drug) => {
    if (!isFieldEditable) return;
    setVasoactiveDrugs(prev =>
      prev.includes(drug) ? prev.filter(d => d !== drug) : [...prev, drug]
    );
  };
  const setResp   = (k, v) => isFieldEditable && setRespEvents(p => ({ ...p, [k]: v }));
  const setCv     = (k, v) => isFieldEditable && setCvData(p => ({ ...p, [k]: v }));
  const setNeuro  = (k, v) => isFieldEditable && setNeuroData(p => ({ ...p, [k]: v }));

  /* ── Save (Nurse) ── */
  const handleSave = async () => {
    if (!enrollmentId) return;
    if (!isFieldEditable) return; // future / locked-past / submitted (without override) — nothing to save
    const now = new Date().toISOString();
    const payload = {
      enrollment_id:       enrollmentId,
      nicu_day:            activeDay,
      weight_kg:           weightKg || null,
      support_modes:       supportModes.join(", "),
      respiratory_support: respiratorySupport,
      endotracheal_intubation: endotrachealIntubation,
      map_cpap:            mapCpap !== "" ? Number(mapCpap) : null,
      max_fio2:            maxFio2 !== "" ? Number(maxFio2) : null,
      max_flow:            maxFlow !== "" ? Number(maxFlow) : null,
      lowest_ph:           lowestPh || null,
      pao2_range:          pao2Range || null,
      paco2_range:         paco2Range || null,
      apnea_count:              apneaCount || null,
      desaturation_count:       desatCount || null,
      severe_desaturation_count: severeDesatCount || null,
      ...respEvents,
      ...cvData,
      fluid_bolus:         fluidBolus || null,
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
      markFormCompleted("vs6_1");
      setIsSaved(true);
      setIsEditing(false);
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
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err?.response?.data || err);
      setMessage("❌ Error saving — please try again");
    }
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Auto-save first if not already saved
      if (!isSaved) await handleSave();
      const now = new Date().toISOString();
      await api.patch(`/resp-cv-neuro/${enrollmentId}/${activeDay}/submit`, {
        submission_status: STATUS.SUBMITTED,
        submitted_at:      now,
        submitted_by:      user?.name || user?.username || "Site User",
      });
      setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.SUBMITTED }));
      setSubmittedAt(now);
      setSubmittedBy(user?.name || user?.username || "Site User");
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
    await handleSave();
    navigate(`/infect-gi-hema-log/${enrollmentId}`);
  };

  /* ── Copy from previous day ── */
  const handleCopyFromDay = async (sourceDay) => {
    setShowCopyModal(false);
    setLoading(true);
    try {
      const res = await api.get(`/resp-cv-neuro/${enrollmentId}/${sourceDay}`);
      const d = res?.data || {};
      if (!d || Object.keys(d).length === 0) {
        setMessage(`⚠️ No data found for Day ${sourceDay}`);
        setTimeout(() => setMessage(""), 3000);
        return;
      }
      // Copy all clinical fields — do NOT copy submission status or timestamps
      setWeightKg(d.weight_kg || "");
      setSupportModes(d.support_modes ? d.support_modes.split(",").map(s => s.trim()).filter(Boolean) : []);
      setRespiratorySupport(d.respiratory_support ?? null);
      setEndotrachealIntubation(d.endotracheal_intubation ?? null);
      setMapCpap(d.map_cpap != null ? String(d.map_cpap) : "");
      setMaxFio2(d.max_fio2 != null ? String(d.max_fio2) : "");
      setMaxFlow(d.max_flow != null ? String(d.max_flow) : "");
      setLowestPh(d.lowest_ph || "");
      setPao2Range(d.pao2_range || "");
      setPaco2Range(d.paco2_range || "");
      setApneaCount(d.apnea_count || "");
      setDesatCount(d.desaturation_count || "");
      setSevereDesatCount(d.severe_desaturation_count || "");
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
        pda_suspected:      d.pda_suspected      ?? null,
        echo_done:          d.echo_done          ?? null,
        hs_pda:             d.hs_pda             ?? null,
        pda_medical_rx:     d.pda_medical_rx     ?? null,
        shock:              d.shock              ?? null,
        vasoactive_support: d.vasoactive_support ?? null,
      });
      setFluidBolus(d.fluid_bolus || "");
      setVasoactiveDrugs(d.vasoactive_drugs
        ? d.vasoactive_drugs.split(",").map(s => s.trim()).filter(Boolean) : []);
      setNeuroData({
        cranial_usg:          d.cranial_usg          ?? null,
        ivh:                  d.ivh                  ?? null,
        ivh_grade:            d.ivh_grade            || null,
        pvl_suspected:        d.pvl_suspected        ?? null,
        cpvl_confirmed:       d.cpvl_confirmed       ?? null,
        ventriculomegaly:     d.ventriculomegaly     ?? null,
        clinical_seizures:    d.clinical_seizures    ?? null,
        eeg_seizures:         d.eeg_seizures         ?? null,
        aeds_given:           d.aeds_given           ?? null,
        non_ivh_ich:          d.non_ivh_ich          ?? null,
        meningitis_suspected: d.meningitis_suspected ?? null,
      });
      setIsSaved(false); // mark unsaved — user must save after copying
      setMessage(`📋 Copied from Day ${sourceDay} — review and save`);
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setMessage(`❌ Could not load Day ${sourceDay} data`);
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
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

        {/* ══ DAILY SUMMARY CARD ══ */}
        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">NICU Day {activeDay}</h2>
            <div className="rcn-summary-meta">
              <Clock size={13} />
              <span>
                {isSaved ? "Completed" : "Not yet started"} — complete by 08:00 AM rounds
              </span>
            </div>
            {/* Copy from previous day button */}
            {!isSubmitted && !isFutureActiveDay && !isPastActiveDay && activeDay > 1 && (
              <button
                type="button"
                className="rcn-copy-btn"
                onClick={() => {
                  const available = Object.keys(dayStatuses)
                    .map(Number)
                    .filter(d => d < activeDay && dayStatuses[d] !== STATUS.EMPTY);
                  setCopySourceDay(available);
                  setShowCopyModal(true);
                }}
              >
                <Copy size={13} /> Copy from previous day
              </button>
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
                className="rcn-text-input"
                value={weightKg}
                onChange={e => isFieldEditable && setWeightKg(e.target.value)}
                readOnly={!isFieldEditable}
              />
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
                  onChange={v => isFieldEditable && setRespiratorySupport(v)} disabled={!isFieldEditable} />
                <YNRow label="2. Endotracheally intubated" value={endotrachealIntubation}
                  onChange={v => isFieldEditable && setEndotrachealIntubation(v)} disabled={!isFieldEditable} />
              </div>

              {/* #3 Mode Pills */}
              <div className="rcn-field-group">
                <label className="rcn-field-label">
                  3. Mode
                  <span className="rcn-field-sub">NC, HFNC, CPAP, NIPPV, SIMV, A/C, PSV, HFOV — select all that apply</span>
                </label>
                <div className="rcn-pills">
                  {["NC","HFNC","CPAP","NIPPV","SIMV","AC","PSV","HFOV"].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      className={`rcn-pill${supportModes.includes(mode) ? " rcn-pill--on" : ""}`}
                      onClick={() => toggleMode(mode)}
                      disabled={!isFieldEditable}
                    >{mode}</button>
                  ))}
                </div>
              </div>

              {/* #4-6 MAP/CPAP, Max FiO2, Max Flow */}
              <div className="rcn-inputs-row rcn-inputs-row--3col">
                <div className="rcn-input-group">
                  <label className="rcn-field-label">4. MAP/CPAP</label>
                  <div className="rcn-num-input">
                    <input
                      type="number" placeholder="0"
                      value={mapCpap}
                      onChange={e => isFieldEditable && setMapCpap(e.target.value)}
                      readOnly={!isFieldEditable}
                    />
                    <span className="rcn-num-unit">cm H₂O</span>
                  </div>
                </div>
                <div className="rcn-input-group">
                  <label className="rcn-field-label">5. Max FiO₂</label>
                  <div className="rcn-num-input">
                    <input
                      type="number" placeholder="21"
                      value={maxFio2}
                      onChange={e => isFieldEditable && setMaxFio2(e.target.value)}
                      min="21" max="100"
                      readOnly={!isFieldEditable}
                    />
                    <span className="rcn-num-unit">%</span>
                  </div>
                </div>
                <div className="rcn-input-group">
                  <label className="rcn-field-label">6. Max Gas Flow</label>
                  <div className="rcn-num-input">
                    <input
                      type="number" placeholder="0"
                      value={maxFlow}
                      onChange={e => isFieldEditable && setMaxFlow(e.target.value)}
                      min="0"
                      readOnly={!isFieldEditable}
                    />
                    <span className="rcn-num-unit">L/min</span>
                  </div>
                </div>
              </div>

              {/* #7 Supplemental O2 */}
              <div className="rcn-yn-list">
                <YNRow label="7. Supplemental O₂ >21% (any)" value={respEvents.supp_o2}
                  onChange={v => setResp("supp_o2", v)} disabled={!isFieldEditable} />
              </div>

              {/* #8-10 Lowest pH, PaO2, PaCO2 */}
              <div className="rcn-inputs-row rcn-inputs-row--3col">
                <div className="rcn-input-group">
                  <label className="rcn-field-label">8. Lowest pH</label>
                  <input type="text" placeholder="e.g. 7.25" className="rcn-text-input"
                    value={lowestPh} onChange={e => isFieldEditable && setLowestPh(e.target.value)}
                    readOnly={!isFieldEditable} />
                </div>
                <div className="rcn-input-group">
                  <label className="rcn-field-label">9. PaO₂ (lowest–highest)</label>
                  <input type="text" placeholder="e.g. 45-72" className="rcn-text-input"
                    value={pao2Range} onChange={e => isFieldEditable && setPao2Range(e.target.value)}
                    readOnly={!isFieldEditable} />
                </div>
                <div className="rcn-input-group">
                  <label className="rcn-field-label">10. PaCO₂ (lowest–highest)</label>
                  <input type="text" placeholder="e.g. 35-55" className="rcn-text-input"
                    value={paco2Range} onChange={e => isFieldEditable && setPaco2Range(e.target.value)}
                    readOnly={!isFieldEditable} />
                </div>
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
                  <label className="rcn-field-label">13. No of Apnea episodes</label>
                  <input type="text" placeholder="e.g. 2" className="rcn-text-input"
                    value={apneaCount} onChange={e => isFieldEditable && setApneaCount(e.target.value)}
                    readOnly={!isFieldEditable} />
                </div>
                <div className="rcn-input-group">
                  <label className="rcn-field-label">14. No of Desaturations (&lt;91%)</label>
                  <input type="text" placeholder="e.g. 3" className="rcn-text-input"
                    value={desatCount} onChange={e => isFieldEditable && setDesatCount(e.target.value)}
                    readOnly={!isFieldEditable} />
                </div>
                <div className="rcn-input-group">
                  <label className="rcn-field-label">15. No of severe desaturations (&lt;80%)</label>
                  <input type="text" placeholder="e.g. 1" className="rcn-text-input"
                    value={severeDesatCount} onChange={e => isFieldEditable && setSevereDesatCount(e.target.value)}
                    readOnly={!isFieldEditable} />
                </div>
              </div>

              {/* #16-22 remaining respiratory events */}
              <div className="rcn-field-group">
                <div className="rcn-yn-list">
                  {[
                    { k: "extub_attempted",    l: "16. Extubation attempted" },
                    { k: "extub_failure",      l: "17. Extubation failure (<72h from extubation)" },
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

              <div className="rcn-field-group">
                <label className="rcn-field-label">29. Fluid bolus</label>
                <input type="text" placeholder="e.g. 10ml/kg NS" className="rcn-text-input"
                  value={fluidBolus} onChange={e => isFieldEditable && setFluidBolus(e.target.value)}
                  readOnly={!isFieldEditable} />
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
                {[
                  { k: "cranial_usg", l: "30. Cranial USG done" },
                  { k: "ivh",         l: "31. IVH (any grade)" },
                ].map(({ k, l }) => (
                  <YNRow key={k} label={l} value={neuroData[k]}
                    onChange={v => setNeuro(k, v)} disabled={!isFieldEditable} />
                ))}
              </div>

              {neuroData.ivh === true && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">IVH Grade</div>
                  <div className="rcn-grade-grid">
                    {["I","II","III","IV"].map(g => (
                      <div
                        key={g}
                        className={`rcn-grade-card${neuroData.ivh_grade === g ? " rcn-grade-card--on" : ""}${!isFieldEditable ? " rcn-grade-card--disabled" : ""}`}
                        onClick={() => isFieldEditable && setNeuro("ivh_grade", neuroData.ivh_grade === g ? null : g)}
                      >
                        <span className="rcn-grade-roman">{g}</span>
                        <span className="rcn-grade-label">Grade</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                {[
                  { k: "cpvl_confirmed",        l: "32. cPVL (any grade)" },
                  { k: "ventriculomegaly",      l: "33. Ventriculomegaly" },
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

      {/* ══ COPY MODAL ══ */}
      {showCopyModal && (
        <CopyDayModal
          activeDay={activeDay}
          availableDays={copySourceDay || []}
          onConfirm={handleCopyFromDay}
          onCancel={() => setShowCopyModal(false)}
        />
      )}

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
          onClick={() => navigate(`/fio2-auc/${enrollmentId}`)}>
          <ArrowLeft size={15} /> FiO₂ AUC
        </button>

        {/* Save — always visible when editing */}
        {isFieldEditable && (
          <button type="button" className="btn btn-save btn-outline-blue"
            onClick={handleSave}>
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

        {/* Save for Later (draft) / Submit (when complete) / Locked badge */}
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
              title={`Grace window open until ${RCN_LATE_GRACE_HOUR}:00 AM`}>
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
    </>
  );
}
