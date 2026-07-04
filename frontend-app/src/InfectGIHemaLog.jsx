import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
// ✅ Reuses RespCVNeuro.css — same design system, same class names
import "./styles/RespCVNeuro.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  CheckCircle, AlertTriangle, X, Clock,
  Lock, Shield, FileCheck, Copy,
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   CONSTANTS — same pattern as RespCVNeuroLog
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
   SHARED SUB-COMPONENTS (identical to RespCVNeuroLog)
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

  /* ── UI state ── */
  const [activeDay, setActiveDay]         = useState(1);
  const [totalDays, setTotalDays]         = useState(14);
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

  /* ── Patient info ── */
  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    babyUid: "", gestationalAge: "",
    admissionDate: "", dischargeDate: "", status: "In NICU",
  });

  /* ════════════════════════════════════════════════
     SECTION 1 — INFECTION
  ════════════════════════════════════════════════ */
  const [infData, setInfData] = useState({
    sepsis_suspected:        null,
    blood_culture_sent:      null,
    blood_culture_positive:  null,
    eos:                     null,
    los:                     null,
    antibiotics:             null,
    antibiotic_day:          null,
    lp_done:                 null,
    csf_culture_positive:    null,
    clabsi:                  null,
    vap:                     null,
  });

  /* ════════════════════════════════════════════════
     SECTION 2 — GASTROINTESTINAL
  ════════════════════════════════════════════════ */
  const [giData, setGiData] = useState({
    npo:                     null,
    enteral_feeds_started:   null,
    feed_volume:             null,   // numeric ml/kg/day
    full_feeds:              null,
    parenteral_nutrition:    null,
    probiotic:               null,
    feed_intolerance:        null,
    nec_suspected:           null,
    nec_confirmed_stage:     null,   // text — conditional
    nec_surgery:             null,   // conditional
  });

  /* ════════════════════════════════════════════════
     SECTION 3 — HEMATOLOGY
  ════════════════════════════════════════════════ */
  const [hemaData, setHemaData] = useState({
    jaundice:                null,
    phototherapy:            null,   // conditional on jaundice
    peak_tsb:                null,   // numeric mg/dL
    exchange_transfusion:    null,
    prbc_transfusion:        null,
    platelet_transfusion:    null,
    ffp_cryo:                null,
  });

  /* ── Derived visibility flags ── */
  const sepsisYes = infData.sepsis_suspected === true;
  const necYes    = giData.nec_suspected     === true;
  const jaundiceYes = hemaData.jaundice      === true;

  const isSubmitted     = (dayStatuses[activeDay] || STATUS.EMPTY) === STATUS.SUBMITTED;
  const isFieldEditable = !isSubmitted && (!isSaved || isEditing);

  /* ══════════════════════════════════════════════
     PROGRESS CALCULATION
     Hidden/conditional fields excluded from total
  ══════════════════════════════════════════════ */

  // Infection base: 6 always visible
  const INF_BASE    = ["sepsis_suspected","antibiotics","antibiotic_day","lp_done","csf_culture_positive","clabsi","vap"];
  const INF_SEPSIS  = ["blood_culture_sent","blood_culture_positive","eos","los"];

  const infTotal    = INF_BASE.length + (sepsisYes ? INF_SEPSIS.length : 0);
  const infAnswered = Math.min(
    INF_BASE.filter(k => infData[k] !== null).length
    + (sepsisYes ? INF_SEPSIS.filter(k => infData[k] !== null).length : 0),
    infTotal
  );

  // GI base: 8 always visible
  const GI_BASE  = ["npo","enteral_feeds_started","feed_volume","full_feeds","parenteral_nutrition","probiotic","feed_intolerance","nec_suspected"];
  const GI_NEC   = ["nec_confirmed_stage","nec_surgery"];

  const giTotal    = GI_BASE.length + (necYes ? GI_NEC.length : 0);
  const giAnswered = Math.min(
    GI_BASE.filter(k => giData[k] !== null && giData[k] !== "").length
    + (necYes ? GI_NEC.filter(k => giData[k] !== null && giData[k] !== "").length : 0),
    giTotal
  );

  // Hematology base: 6 always visible
  const HEMA_BASE    = ["jaundice","peak_tsb","exchange_transfusion","prbc_transfusion","platelet_transfusion","ffp_cryo"];
  const HEMA_JAUNDICE= ["phototherapy"];

  const hemaTotal    = HEMA_BASE.length + (jaundiceYes ? HEMA_JAUNDICE.length : 0);
  const hemaAnswered = Math.min(
    HEMA_BASE.filter(k => hemaData[k] !== null && hemaData[k] !== "").length
    + (jaundiceYes ? HEMA_JAUNDICE.filter(k => hemaData[k] !== null).length : 0),
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
      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = res?.data || {};
        const ga = b.gestation_weeks && b.gestation_days
          ? `${b.gestation_weeks}+${b.gestation_days} wks` : "";
        const admitDate = b.date_of_birth ? new Date(b.date_of_birth) : null;
        const today = new Date();
        const dayNum = admitDate ? Math.max(1, Math.floor((today - admitDate) / 86400000) + 1) : 1;
        let dischDay = null;
        if (b.discharge_date) {
          const dd = new Date(b.discharge_date);
          dischDay = admitDate ? Math.max(1, Math.floor((dd - admitDate) / 86400000) + 1) : null;
          setDischargeDay(dischDay);
        }
        setPatientInfo(prev => ({
          ...prev, enrollmentId,
          babyUid: b.baby_uid || "", gestationalAge: ga,
          admissionDate: b.date_of_birth || "",
          dischargeDate: b.discharge_date || "",
          status: b.discharge_date ? "Discharged" : "In NICU",
        }));
        setActiveDay(dayNum);
        setTotalDays(dischDay || Math.max(14, dayNum + 3));
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
            eos:                     d.eos                     ?? null,
            los:                     d.los                     ?? null,
            antibiotics:             d.antibiotics             ?? null,
            antibiotic_day:          d.antibiotic_day          ?? null,
            lp_done:                 d.lp_done                 ?? null,
            csf_culture_positive:    d.csf_culture_positive    ?? null,
            clabsi:                  d.clabsi                  ?? null,
            vap:                     d.vap                     ?? null,
          });
          setGiData({
            npo:                   d.npo                   ?? null,
            enteral_feeds_started: d.enteral_feeds_started ?? null,
            feed_volume:           d.feed_volume           ?? null,
            full_feeds:            d.full_feeds            ?? null,
            parenteral_nutrition:  d.parenteral_nutrition  ?? null,
            probiotic:             d.probiotic             ?? null,
            feed_intolerance:      d.feed_intolerance      ?? null,
            nec_suspected:         d.nec_suspected         ?? null,
            nec_confirmed_stage:   d.nec_confirmed_stage   ?? null,
            nec_surgery:           d.nec_surgery           ?? null,
          });
          setHemaData({
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
      eos: null, los: null, antibiotics: null, antibiotic_day: null,
      lp_done: null, csf_culture_positive: null, clabsi: null, vap: null });
    setGiData({ npo: null, enteral_feeds_started: null, feed_volume: null, full_feeds: null,
      parenteral_nutrition: null, probiotic: null, feed_intolerance: null,
      nec_suspected: null, nec_confirmed_stage: null, nec_surgery: null });
    setHemaData({ jaundice: null, phototherapy: null, peak_tsb: null,
      exchange_transfusion: null, prbc_transfusion: null,
      platelet_transfusion: null, ffp_cryo: null });
    setIsSaved(false); setIsEditing(false);
    setSavedAt(null); setSavedBy(""); setSubmittedAt(null); setSubmittedBy("");
    setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
  };

  const getPayload = () => ({
    enrollment_id: enrollmentId, nicu_day: activeDay,
    ...infData, ...giData, ...hemaData,
    submission_status: STATUS.DRAFT,
    saved_at: new Date().toISOString(),
    saved_by: user?.name || user?.username || "Nurse",
  });

  /* ── Save ── */
  const handleSave = async () => {
    if (!enrollmentId || isSubmitted) return;
    const now = new Date().toISOString();
    const payload = { ...getPayload(), saved_at: now };
    try {
      isSaved
        ? await api.put(`/infect-gi-hema/${enrollmentId}/${activeDay}`, payload)
        : await api.post("/infect-gi-hema/", payload);
      markFormCompleted("infect_gi_hema");
      setIsSaved(true); setIsEditing(false);
      setSavedAt(now); setSavedBy(user?.name || user?.username || "Nurse");
      const isLate = new Date(now).getHours() >= 8 && completionPct < 100;
      const newSt  = completionPct === 100 ? STATUS.COMPLETE : isLate ? STATUS.LATE : STATUS.DRAFT;
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
        eos: d.eos ?? null, los: d.los ?? null,
        antibiotics: d.antibiotics ?? null, antibiotic_day: d.antibiotic_day ?? null,
        lp_done: d.lp_done ?? null, csf_culture_positive: d.csf_culture_positive ?? null,
        clabsi: d.clabsi ?? null, vap: d.vap ?? null });
      setGiData({ npo: d.npo ?? null, enteral_feeds_started: d.enteral_feeds_started ?? null,
        feed_volume: d.feed_volume ?? null, full_feeds: d.full_feeds ?? null,
        parenteral_nutrition: d.parenteral_nutrition ?? null, probiotic: d.probiotic ?? null,
        feed_intolerance: d.feed_intolerance ?? null, nec_suspected: d.nec_suspected ?? null,
        nec_confirmed_stage: d.nec_confirmed_stage ?? null, nec_surgery: d.nec_surgery ?? null });
      setHemaData({ jaundice: d.jaundice ?? null, phototherapy: d.phototherapy ?? null,
        peak_tsb: d.peak_tsb ?? null, exchange_transfusion: d.exchange_transfusion ?? null,
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

  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const handleDischarge = async () => {
    setShowDischargeConfirm(false);
    try {
      await api.patch(`/enrollment/${enrollmentId}/discharge`, {
        discharge_date: new Date().toISOString().split("T")[0],
        discharge_day: activeDay,
      });
      setDischargeDay(activeDay);
      setPatientInfo(prev => ({ ...prev, status: "Discharged" }));
      setMessage("✅ Patient marked as discharged from Day " + activeDay);
      setTimeout(() => setMessage(""), 4000);
    } catch (_) { setMessage("❌ Could not record discharge"); }
  };

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

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

        {/* ── Patient Context Bar ── */}
        <div className="rcn-context-bar">
          <div className="rcn-context-trial">
            <div className="rcn-context-trial-icon">⊕</div>
            <div className="rcn-context-trial-info">
              <span className="rcn-context-trial-name">PORTAL TRIAL</span>
              <span className="rcn-context-trial-sub">Helper Form 3</span>
            </div>
          </div>
          <div className="rcn-context-fields">
            <div className="rcn-context-field">
              <span className="rcn-context-field-label">Enrolment ID</span>
              <span className="rcn-context-field-value">{patientInfo.enrollmentId || "—"}</span>
            </div>
            {patientInfo.babyUid && (
              <div className="rcn-context-field">
                <span className="rcn-context-field-label">Baby UID</span>
                <span className="rcn-context-field-value">{patientInfo.babyUid}</span>
              </div>
            )}
            {patientInfo.gestationalAge && (
              <div className="rcn-context-field">
                <span className="rcn-context-field-label">Gestational Age</span>
                <span className="rcn-context-field-value">{patientInfo.gestationalAge}</span>
              </div>
            )}
            <div className="rcn-context-field">
              <span className="rcn-context-field-label">NICU Day</span>
              <span className="rcn-context-field-value">Day {activeDay}</span>
            </div>
            <div className="rcn-context-field rcn-context-field--last">
              <span className="rcn-context-field-label">Status</span>
              <div className="rcn-status-badge">
                <span className="rcn-status-dot" style={{
                  background: patientInfo.status === "Discharged" ? "#94A3B8" : "#10B981",
                  boxShadow: patientInfo.status === "Discharged" ? "0 0 5px #94A3B8" : "0 0 5px #10B981",
                }} />
                <span>{patientInfo.status}</span>
              </div>
            </div>
          </div>
          {isSaved && !isSubmitted && (
            <button type="button"
              className={`rcn-edit-btn${isEditing ? " rcn-edit-btn--active" : ""}`}
              onClick={() => setIsEditing(p => !p)} style={{ flexShrink: 0 }}>
              {isEditing ? "✓ Done" : "Edit"}
            </button>
          )}
        </div>

        {/* ── Day Timeline ── */}
        <div className="rcn-timeline-wrap">
          <span className="rcn-timeline-label">Days</span>
          <div className="rcn-timeline">
            {days.map(d => {
              const isActive    = d === activeDay;
              const isFuture    = d > activeDay;
              const isDischarge = dischargeDay && d > dischargeDay;
              const st          = dayStatuses[d] || STATUS.EMPTY;
              const cfg         = DAY_STATUS_CONFIG[st] || DAY_STATUS_CONFIG[STATUS.EMPTY];
              const meta        = dayMeta[d] || {};
              return (
                <button key={d} type="button"
                  className={["rcn-day",
                    isActive    ? "rcn-day--active"    : "",
                    isFuture    ? "rcn-day--future"    : "",
                    isDischarge ? "rcn-day--discharged": "",
                    `rcn-day--${st}`,
                  ].filter(Boolean).join(" ")}
                  onClick={() => !isFuture && !isDischarge && setActiveDay(d)}
                  title={isDischarge ? `Day ${d} — Discharged` : `Day ${d} · ${cfg.label}${meta.pct ? ` · ${meta.pct}%` : ""}`}
                  style={!isActive && !isFuture && !isDischarge ? { borderColor: cfg.color + "66" } : {}}
                >
                  <span className="rcn-day-d">D</span>
                  <span className="rcn-day-num">{d}</span>
                  <span className="rcn-day-dot" style={!isActive ? { background: cfg.dot } : {}} />
                  <span className="rcn-day-date">
                    {isDischarge ? "🏠" : (() => {
                      if (!patientInfo.admissionDate) return "";
                      const base = new Date(patientInfo.admissionDate);
                      base.setDate(base.getDate() + d - 1);
                      return base.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                    })()}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rcn-timeline-legend">
            {LEGEND_ITEMS.map(item => (
              <span key={item.label} className="rcn-legend-item">
                <span className="rcn-legend-dot" style={{ background: item.dot }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Daily Summary Card ── */}
        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">NICU Day {activeDay}</h2>
            <div className="rcn-summary-meta">
              <Clock size={13} />
              <span>{isSaved ? "Completed" : "Not yet started"} — complete by 08:00 AM rounds</span>
            </div>
            {!isSubmitted && activeDay > 1 && (
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
                  <span>Day {dischargeDay} was the last NICU day.</span>
                </div>
              </div>
            )}

            {/* Submitted banner */}
            {isSubmitted && (
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
                  <span>Fill all fields to unlock Submit</span>
                </div>
                <span className="rcn-status-banner-badge">{totalFields - totalAnswered} remaining</span>
              </div>
            )}

            {/* ════ INFECTION ════ */}
            <SectionCard iconEmoji="🦠" title="Infection Assessment"
              answered={infAnswered} total={infTotal} defaultOpen={true}>

              <div className="rcn-field-group">
                <label className="rcn-field-label">Sepsis</label>
                <div className="rcn-yn-list">
                  <YNRow label="Sepsis Suspected" value={infData.sepsis_suspected}
                    onChange={v => {
                      setInf("sepsis_suspected", v);
                      if (v !== true) {
                        setInfData(p => ({ ...p, blood_culture_sent: null,
                          blood_culture_positive: null, eos: null, los: null }));
                      }
                    }} disabled={!isFieldEditable} />
                </div>
              </div>

              {sepsisYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">If Sepsis Suspected</div>
                  <div className="rcn-yn-list">
                    <CultureStatusRow sent={infData.blood_culture_sent} positive={infData.blood_culture_positive}
                      onChange={({ sent, positive }) => setInfData(p => ({ ...p, blood_culture_sent: sent, blood_culture_positive: positive }))}
                      disabled={!isFieldEditable} />
                    <YNRow label="EOS (≤72h)"             value={infData.eos}                    onChange={v => setInf("eos", v)}                    disabled={!isFieldEditable} />
                    <YNRow label="LOS (>72h)"             value={infData.los}                    onChange={v => setInf("los", v)}                    disabled={!isFieldEditable} />
                  </div>
                </div>
              )}

              <div className="rcn-field-group">
                <label className="rcn-field-label">Treatment &amp; Monitoring</label>
                <div className="rcn-yn-list">
                  <YNRow label="Antibiotics"          value={infData.antibiotics}          onChange={v => setInf("antibiotics", v)}          disabled={!isFieldEditable} />
                  <YNRow label="Antibiotic Day"        value={infData.antibiotic_day}       onChange={v => setInf("antibiotic_day", v)}       disabled={!isFieldEditable} />
                  <YNRow label="LP Done"               value={infData.lp_done}              onChange={v => setInf("lp_done", v)}              disabled={!isFieldEditable} />
                  <YNRow label="CSF Culture Positive"  value={infData.csf_culture_positive} onChange={v => setInf("csf_culture_positive", v)} disabled={!isFieldEditable} />
                  <YNRow label="CLABSI"                value={infData.clabsi}               onChange={v => setInf("clabsi", v)}               disabled={!isFieldEditable} />
                  <YNRow label="VAP"                   value={infData.vap}                  onChange={v => setInf("vap", v)}                  disabled={!isFieldEditable} />
                </div>
              </div>
            </SectionCard>

            {/* ════ GASTROINTESTINAL ════ */}
            <SectionCard iconEmoji="🍽️" title="Gastrointestinal Assessment"
              answered={giAnswered} total={giTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <YNRow label="NPO"                   value={giData.npo}                   onChange={v => setGi("npo", v)}                   disabled={!isFieldEditable} />
                <YNRow label="Enteral Feeds Started"  value={giData.enteral_feeds_started} onChange={v => setGi("enteral_feeds_started", v)} disabled={!isFieldEditable} />
                <NumRow label="Feed Volume (ml/kg/day)" value={giData.feed_volume}         onChange={v => setGi("feed_volume", v)}           disabled={!isFieldEditable} unit="ml/kg" placeholder="0" />
                <YNRow label="Full Feeds (150 ml/kg)"  value={giData.full_feeds}           onChange={v => setGi("full_feeds", v)}            disabled={!isFieldEditable} />
                <YNRow label="Parenteral Nutrition"    value={giData.parenteral_nutrition} onChange={v => setGi("parenteral_nutrition", v)}  disabled={!isFieldEditable} />
                <YNRow label="Probiotic"               value={giData.probiotic}            onChange={v => setGi("probiotic", v)}             disabled={!isFieldEditable} />
                <YNRow label="Feed Intolerance"        value={giData.feed_intolerance}     onChange={v => setGi("feed_intolerance", v)}      disabled={!isFieldEditable} />
                <YNRow label="NEC Suspected"           value={giData.nec_suspected}
                  onChange={v => {
                    setGi("nec_suspected", v);
                    if (v !== true)
                      setGiData(p => ({ ...p, nec_confirmed_stage: null, nec_surgery: null }));
                  }} disabled={!isFieldEditable} />
              </div>

              {necYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">If NEC Suspected</div>
                  <div className="rcn-yn-list">
                    <TextRow label="NEC Confirmed Stage" value={giData.nec_confirmed_stage} onChange={v => setGi("nec_confirmed_stage", v)} disabled={!isFieldEditable} placeholder="Stage I / II / III" />
                    <YNRow label="NEC Surgery"           value={giData.nec_surgery}         onChange={v => setGi("nec_surgery", v)}         disabled={!isFieldEditable} />
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ════ HEMATOLOGY ════ */}
            <SectionCard iconEmoji="🩸" title="Hematology Assessment"
              answered={hemaAnswered} total={hemaTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <YNRow label="Jaundice" value={hemaData.jaundice}
                  onChange={v => {
                    setHema("jaundice", v);
                    if (v !== true) setHemaData(p => ({ ...p, phototherapy: null }));
                  }} disabled={!isFieldEditable} />
              </div>

              {jaundiceYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">If Jaundice</div>
                  <div className="rcn-yn-list">
                    <YNRow label="Phototherapy" value={hemaData.phototherapy}
                      onChange={v => setHema("phototherapy", v)} disabled={!isFieldEditable} />
                  </div>
                </div>
              )}

              <div className="rcn-yn-list" style={{ marginTop: jaundiceYes ? 0 : 0 }}>
                <NumRow label="Peak TSB (mg/dL)"     value={hemaData.peak_tsb}            onChange={v => setHema("peak_tsb", v)}            disabled={!isFieldEditable} unit="mg/dL" placeholder="0.0" />
                <YNRow label="Exchange Transfusion"   value={hemaData.exchange_transfusion} onChange={v => setHema("exchange_transfusion", v)} disabled={!isFieldEditable} />
                <YNRow label="PRBC Transfusion"       value={hemaData.prbc_transfusion}    onChange={v => setHema("prbc_transfusion", v)}    disabled={!isFieldEditable} />
                <YNRow label="Platelet Transfusion"   value={hemaData.platelet_transfusion} onChange={v => setHema("platelet_transfusion", v)} disabled={!isFieldEditable} />
                <YNRow label="FFP / Cryo Transfusion" value={hemaData.ffp_cryo}            onChange={v => setHema("ffp_cryo", v)}            disabled={!isFieldEditable} />
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

      {/* ── Sticky Footer ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/vs6-1/${enrollmentId}`)}>
          <ArrowLeft size={15} /> Resp-CV-Neuro
        </button>

        {!isSubmitted && (
          <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSave}>
            <Save size={15} /> Save
          </button>
        )}

        {!isSubmitted && (
          <button type="button" className="btn btn-submit-day"
            onClick={() => canSubmit && setShowModal(true)}
            disabled={!canSubmit}
            title={completionPct < 100 ? `Fill all fields (${completionPct}% done)` : "Submit and lock this day"}>
            <Shield size={15} />
            {canSubmit ? `Submit Day ${activeDay}` : `Submit (${completionPct}%)`}
          </button>
        )}

        {isSubmitted && (
          <div className="rcn-locked-badge"><Lock size={13} /> Day {activeDay} Locked</div>
        )}

        {!dischargeDay && (
          showDischargeConfirm ? (
            <div className="rcn-discharge-confirm">
              <span>Discharge after Day {activeDay}?</span>
              <button type="button" className="rcn-discharge-yes" onClick={handleDischarge}>Yes</button>
              <button type="button" className="rcn-discharge-no" onClick={() => setShowDischargeConfirm(false)}>No</button>
            </div>
          ) : (
            <button type="button" className="btn rcn-btn-discharge"
              onClick={() => setShowDischargeConfirm(true)}>
              🏠 Discharge
            </button>
          )
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
          onClick={() => navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`)}>
          Next Form <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
