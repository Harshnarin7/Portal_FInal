import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
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
   STATUS CONSTANTS — identical to Forms 2 & 3
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
   SHARED SUB-COMPONENTS — identical to Forms 2 & 3
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

/* Grade/Stage selection cards — same pattern as IVH Grade in Form 2 */
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

  /* ── UI state ── */
  const [activeDay, setActiveDay]         = useState(1);
  const [totalDays, setTotalDays]         = useState(14);
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
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);

  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    babyUid:"", gestationalAge:"", admissionDate:"", status:"In NICU",
  });

  /* ═══════════════════════════════════════
     SECTION STATES
  ═══════════════════════════════════════ */

  // ⚡ METABOLIC
  const [metabData, setMetabData] = useState({
    hypoglycemia:          null,
    hypoglycemia_rx:       null,
    hyperglycemia:         null,
    insulin:               null,
    metabolic_acidosis:    null,
    dyselectrolytemia:     null,
    dyselectrolytemia_type:[], // multi-select: ["Na","K","Ca"]
    osteopenia_suspected:  null,
  });

  // 💧 RENAL
  const [renalData, setRenalData] = useState({
    aki_suspected:         null,
    aki_kdigo_stage:       null, // "Stage 1/2/3"
    creatinine:            null, // numeric mg/dL
    urine_output_low:      null,
    dialysis_crrt:         null,
  });

  // 🌡️ THERMOREGULATION
  const [thermoData, setThermoData] = useState({
    hypothermia:           null,
    hyperthermia:          null,
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
  const dyselectYes = metabData.dyselectrolytemia === true;
  const akiYes      = renalData.aki_suspected     === true;
  const ropYes      = eyeData.rop_detected        === true;

  const isSubmitted     = (dayStatuses[activeDay] || STATUS.EMPTY) === STATUS.SUBMITTED;
  const isFieldEditable = !isSubmitted && (!isSaved || isEditing);

  /* ═══════════════════════════════════════
     PROGRESS — hidden fields excluded
  ═══════════════════════════════════════ */
  const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

  // Metabolic: 7 base + 1 conditional
  const METAB_BASE   = ["hypoglycemia","hypoglycemia_rx","hyperglycemia","insulin","metabolic_acidosis","dyselectrolytemia","osteopenia_suspected"];
  const METAB_DYSELE = ["dyselectrolytemia_type"];
  const metabTotal   = METAB_BASE.length + (dyselectYes ? METAB_DYSELE.length : 0);
  const metabAnswered= Math.min(
    METAB_BASE.filter(k => ans(metabData[k])).length
    + (dyselectYes ? (ans(metabData.dyselectrolytemia_type) ? 1 : 0) : 0),
    metabTotal
  );

  // Renal: 4 base + 1 conditional
  const RENAL_BASE  = ["aki_suspected","creatinine","urine_output_low","dialysis_crrt"];
  const RENAL_AKI   = ["aki_kdigo_stage"];
  const renalTotal  = RENAL_BASE.length + (akiYes ? RENAL_AKI.length : 0);
  const renalAnswered = Math.min(
    RENAL_BASE.filter(k => ans(renalData[k])).length
    + (akiYes ? (ans(renalData.aki_kdigo_stage) ? 1 : 0) : 0),
    renalTotal
  );

  // Thermoregulation: 2 fields always
  const THERMO_KEYS    = ["hypothermia","hyperthermia"];
  const thermoTotal    = THERMO_KEYS.length;
  const thermoAnswered = Math.min(THERMO_KEYS.filter(k => ans(thermoData[k])).length, thermoTotal);

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

  const totalAnswered = metabAnswered + renalAnswered + thermoAnswered + vascAnswered + eyeAnswered;
  const totalFields   = metabTotal + renalTotal + thermoTotal + vascTotal + eyeTotal;
  const completionPct = totalFields > 0 ? Math.min(100, Math.round((totalAnswered / totalFields) * 100)) : 0;
  const canSubmit     = completionPct === 100 && !isSubmitted;

  /* ── Setters ── */
  const setMetab = (k, v) => isFieldEditable && setMetabData(p => ({ ...p, [k]: v }));
  const setRenal = (k, v) => isFieldEditable && setRenalData(p => ({ ...p, [k]: v }));
  const setThermo= (k, v) => isFieldEditable && setThermoData(p => ({ ...p, [k]: v }));
  const setVasc  = (k, v) => isFieldEditable && setVascData(p => ({ ...p, [k]: v }));
  const setEye   = (k, v) => isFieldEditable && setEyeData(p => ({ ...p, [k]: v }));

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
        const today     = new Date();
        const dayNum    = admitDate ? Math.max(1, Math.floor((today - admitDate) / 86400000) + 1) : 1;
        let dischDay    = null;
        if (b.discharge_date) {
          const dd = new Date(b.discharge_date);
          dischDay = admitDate ? Math.max(1, Math.floor((dd - admitDate) / 86400000) + 1) : null;
          setDischargeDay(dischDay);
        }
        setPatientInfo(prev => ({
          ...prev, enrollmentId,
          babyUid: b.baby_uid || "", gestationalAge: ga,
          admissionDate: b.date_of_birth || "",
          status: b.discharge_date ? "Discharged" : "In NICU",
        }));
        setActiveDay(dayNum);
        setTotalDays(dischDay || Math.max(14, dayNum + 3));
      } catch (_) {}
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
            hypoglycemia:           d.hypoglycemia           ?? null,
            hypoglycemia_rx:        d.hypoglycemia_rx        ?? null,
            hyperglycemia:          d.hyperglycemia          ?? null,
            insulin:                d.insulin                ?? null,
            metabolic_acidosis:     d.metabolic_acidosis     ?? null,
            dyselectrolytemia:      d.dyselectrolytemia      ?? null,
            dyselectrolytemia_type: d.dyselectrolytemia_type
              ? (Array.isArray(d.dyselectrolytemia_type) ? d.dyselectrolytemia_type
                : d.dyselectrolytemia_type.split(",").map(s=>s.trim()).filter(Boolean))
              : [],
            osteopenia_suspected:   d.osteopenia_suspected   ?? null,
          });
          setRenalData({
            aki_suspected:          d.aki_suspected    ?? null,
            aki_kdigo_stage:        d.aki_kdigo_stage  || null,
            creatinine:             d.creatinine       ?? null,
            urine_output_low:       d.urine_output_low ?? null,
            dialysis_crrt:          d.dialysis_crrt    ?? null,
          });
          setThermoData({
            hypothermia: d.hypothermia ?? null,
            hyperthermia:d.hyperthermia ?? null,
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
          const st = d.submission_status || STATUS.DRAFT;
          setDayStatuses(prev => ({ ...prev, [activeDay]: st }));
          setSavedAt(d.saved_at||null); setSavedBy(d.saved_by||"");
          setSubmittedAt(d.submitted_at||null); setSubmittedBy(d.submitted_by||"");
          setIsSaved(true); setIsEditing(false);
        } else { resetFormState(); }
      } catch (err) {
        if (err?.response?.status === 404) resetFormState();
      } finally { setLoading(false); }
    };
    loadDay();
  }, [enrollmentId, activeDay]);

  const resetFormState = () => {
    setMetabData({ hypoglycemia:null,hypoglycemia_rx:null,hyperglycemia:null,insulin:null,
      metabolic_acidosis:null,dyselectrolytemia:null,dyselectrolytemia_type:[],osteopenia_suspected:null });
    setRenalData({ aki_suspected:null,aki_kdigo_stage:null,creatinine:null,urine_output_low:null,dialysis_crrt:null });
    setThermoData({ hypothermia:null,hyperthermia:null });
    setVascData({ picc_in_situ:null,uvc_in_situ:null,uac_in_situ:null,peripheral_iv:null,
      peripheral_arterial:null,extravasation_injury:null,line_complication:null });
    setEyeData({ rop_screening_due:null,rop_screened:null,rop_detected:null,rop_stage:null,plus_disease:null,rop_treatment:null });
    setIsSaved(false); setIsEditing(false);
    setSavedAt(null); setSavedBy(""); setSubmittedAt(null); setSubmittedBy("");
    setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
  };

  const buildPayload = (now) => ({
    enrollment_id: enrollmentId, nicu_day: activeDay,
    ...metabData,
    dyselectrolytemia_type: metabData.dyselectrolytemia_type.join(","),
    ...renalData, ...thermoData, ...vascData, ...eyeData,
    submission_status: STATUS.DRAFT,
    saved_at: now,
    saved_by: user?.name || user?.username || "Nurse",
  });

  /* ── Save ── */
  const handleSave = async () => {
    if (!enrollmentId || isSubmitted) return;
    const now = new Date().toISOString();
    try {
      const payload = buildPayload(now);
      isSaved
        ? await api.put(`/metab-renal-vasc-eye/${enrollmentId}/${activeDay}`, payload)
        : await api.post("/metab-renal-vasc-eye/", payload);
      markFormCompleted("metab_renal_vasc_eye");
      setIsSaved(true); setIsEditing(false);
      setSavedAt(now); setSavedBy(user?.name || user?.username || "Nurse");
      const isLate = new Date(now).getHours() >= 8 && completionPct < 100;
      const newSt  = completionPct===100 ? STATUS.COMPLETE : isLate ? STATUS.LATE : STATUS.DRAFT;
      setDayStatuses(prev => ({ ...prev, [activeDay]: newSt }));
      setDayMeta(prev => ({ ...prev, [activeDay]: { pct: completionPct, savedAt: now } }));
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
    navigate(`/form-h/${enrollmentId}`);
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
        hypoglycemia: d.hypoglycemia??null, hypoglycemia_rx: d.hypoglycemia_rx??null,
        hyperglycemia: d.hyperglycemia??null, insulin: d.insulin??null,
        metabolic_acidosis: d.metabolic_acidosis??null, dyselectrolytemia: d.dyselectrolytemia??null,
        dyselectrolytemia_type: d.dyselectrolytemia_type
          ? (Array.isArray(d.dyselectrolytemia_type) ? d.dyselectrolytemia_type
            : d.dyselectrolytemia_type.split(",").map(s=>s.trim()).filter(Boolean)) : [],
        osteopenia_suspected: d.osteopenia_suspected??null,
      });
      setRenalData({ aki_suspected: d.aki_suspected??null, aki_kdigo_stage: d.aki_kdigo_stage||null,
        creatinine: d.creatinine??null, urine_output_low: d.urine_output_low??null, dialysis_crrt: d.dialysis_crrt??null });
      setThermoData({ hypothermia: d.hypothermia??null, hyperthermia: d.hyperthermia??null });
      setVascData({ picc_in_situ: d.picc_in_situ??null, uvc_in_situ: d.uvc_in_situ??null,
        uac_in_situ: d.uac_in_situ??null, peripheral_iv: d.peripheral_iv??null,
        peripheral_arterial: d.peripheral_arterial??null, extravasation_injury: d.extravasation_injury??null,
        line_complication: d.line_complication??null });
      setEyeData({ rop_screening_due: d.rop_screening_due??null, rop_screened: d.rop_screened??null,
        rop_detected: d.rop_detected??null, rop_stage: d.rop_stage||null,
        plus_disease: d.plus_disease??null, rop_treatment: d.rop_treatment??null });
      setIsSaved(false);
      setMessage(`📋 Copied from Day ${sourceDay} — review and save`);
      setTimeout(() => setMessage(""), 4000);
    } catch (_) {
      setMessage(`❌ Could not load Day ${sourceDay}`);
      setTimeout(() => setMessage(""), 3000);
    } finally { setLoading(false); }
  };

  const handleDischarge = async () => {
    setShowDischargeConfirm(false);
    try {
      await api.patch(`/enrollment/${enrollmentId}/discharge`, {
        discharge_date: new Date().toISOString().split("T")[0],
        discharge_day: activeDay,
      });
      setDischargeDay(activeDay);
      setPatientInfo(prev => ({ ...prev, status:"Discharged" }));
      setMessage("✅ Patient marked as discharged from Day " + activeDay);
      setTimeout(() => setMessage(""), 4000);
    } catch (_) { setMessage("❌ Could not record discharge"); }
  };

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

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

        {/* ── Patient Context Bar ── */}
        <div className="rcn-context-bar">
          <div className="rcn-context-trial">
            <div className="rcn-context-trial-icon">⊕</div>
            <div className="rcn-context-trial-info">
              <span className="rcn-context-trial-name">PORTAL TRIAL</span>
              <span className="rcn-context-trial-sub">Helper Form 4</span>
            </div>
          </div>
          <div className="rcn-context-fields">
            <div className="rcn-context-field">
              <span className="rcn-context-field-label">Enrolment ID</span>
              <span className="rcn-context-field-value">{patientInfo.enrollmentId||"—"}</span>
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
                  background: patientInfo.status==="Discharged" ? "#94A3B8" : "#10B981",
                  boxShadow:  patientInfo.status==="Discharged" ? "0 0 5px #94A3B8" : "0 0 5px #10B981",
                }}/>
                <span>{patientInfo.status}</span>
              </div>
            </div>
          </div>
          {isSaved && !isSubmitted && (
            <button type="button"
              className={`rcn-edit-btn${isEditing?" rcn-edit-btn--active":""}`}
              onClick={() => setIsEditing(p=>!p)} style={{ flexShrink:0 }}>
              {isEditing ? "✓ Done" : "Edit"}
            </button>
          )}
        </div>

        {/* ── Day Timeline ── */}
        <div className="rcn-timeline-wrap">
          <span className="rcn-timeline-label">Days</span>
          <div className="rcn-timeline">
            {days.map(d => {
              const isActive    = d===activeDay;
              const isFuture    = d>activeDay;
              const isDischarge = dischargeDay && d>dischargeDay;
              const st  = dayStatuses[d]||STATUS.EMPTY;
              const cfg = DAY_STATUS_CONFIG[st]||DAY_STATUS_CONFIG[STATUS.EMPTY];
              const meta= dayMeta[d]||{};
              return (
                <button key={d} type="button"
                  className={["rcn-day",isActive?"rcn-day--active":"",isFuture?"rcn-day--future":"",
                    isDischarge?"rcn-day--discharged":"",`rcn-day--${st}`].filter(Boolean).join(" ")}
                  onClick={() => !isFuture && !isDischarge && setActiveDay(d)}
                  title={isDischarge?`Day ${d} — Discharged`:`Day ${d} · ${cfg.label}${meta.pct?` · ${meta.pct}%`:""}`}
                  style={!isActive&&!isFuture&&!isDischarge?{borderColor:cfg.color+"66"}:{}}>
                  <span className="rcn-day-d">D</span>
                  <span className="rcn-day-num">{d}</span>
                  <span className="rcn-day-dot" style={!isActive?{background:cfg.dot}:{}}/>
                  <span className="rcn-day-date">
                    {isDischarge ? "🏠" : (() => {
                      if (!patientInfo.admissionDate) return "";
                      const base = new Date(patientInfo.admissionDate);
                      base.setDate(base.getDate() + d - 1);
                      return base.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
                    })()}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rcn-timeline-legend">
            {LEGEND_ITEMS.map(item => (
              <span key={item.label} className="rcn-legend-item">
                <span className="rcn-legend-dot" style={{ background:item.dot }}/>
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Summary Card ── */}
        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">NICU Day {activeDay}</h2>
            <div className="rcn-summary-meta">
              <Clock size={13}/>
              <span>{isSaved?"Completed":"Not yet started"} — complete by 08:00 AM rounds</span>
            </div>
            {!isSubmitted && activeDay > 1 && (
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

            {/* Banners */}
            {dischargeDay && activeDay > dischargeDay && (
              <div className="rcn-status-banner rcn-status-banner--discharged">
                <span style={{fontSize:18}}>🏠</span>
                <div className="rcn-status-banner-text">
                  <strong>Patient Discharged</strong>
                  <span>Day {dischargeDay} was the last NICU day.</span>
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
                  <span>Fill all fields to unlock Submit</span>
                </div>
                <span className="rcn-status-banner-badge">{totalFields-totalAnswered} remaining</span>
              </div>
            )}

            {/* ════ METABOLIC ════ */}
            <SectionCard iconEmoji="⚡" title="Metabolic Assessment"
              answered={metabAnswered} total={metabTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="Hypoglycemia (<45 mg/dL)"    value={metabData.hypoglycemia}       onChange={v=>setMetab("hypoglycemia",v)}       disabled={!isFieldEditable}/>
                <YNRow label="Hypoglycemia Rx"              value={metabData.hypoglycemia_rx}    onChange={v=>setMetab("hypoglycemia_rx",v)}    disabled={!isFieldEditable}/>
                <YNRow label="Hyperglycemia (>180 mg/dL)"  value={metabData.hyperglycemia}      onChange={v=>setMetab("hyperglycemia",v)}      disabled={!isFieldEditable}/>
                <YNRow label="Insulin"                      value={metabData.insulin}            onChange={v=>setMetab("insulin",v)}            disabled={!isFieldEditable}/>
                <YNRow label="Metabolic Acidosis (pH <7.2)" value={metabData.metabolic_acidosis} onChange={v=>setMetab("metabolic_acidosis",v)} disabled={!isFieldEditable}/>
                <YNRow label="Dyselectrolytemia"            value={metabData.dyselectrolytemia}
                  onChange={v => {
                    setMetab("dyselectrolytemia", v);
                    if (v !== true) setMetabData(p => ({ ...p, dyselectrolytemia_type: [] }));
                  }} disabled={!isFieldEditable}/>
              </div>

              {dyselectYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">Dyselectrolytemia Type <span style={{fontSize:11,fontWeight:500,color:"#94A3B8"}}>(select all that apply)</span></div>
                  <PillMulti
                    options={["Na","K","Ca"]}
                    value={metabData.dyselectrolytemia_type}
                    onChange={v => isFieldEditable && setMetabData(p => ({ ...p, dyselectrolytemia_type: v }))}
                    disabled={!isFieldEditable}
                  />
                </div>
              )}

              <div className="rcn-yn-list" style={{marginTop:0}}>
                <YNRow label="Osteopenia Suspected" value={metabData.osteopenia_suspected}
                  onChange={v=>setMetab("osteopenia_suspected",v)} disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ RENAL ════ */}
            <SectionCard iconEmoji="💧" title="Renal Assessment"
              answered={renalAnswered} total={renalTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="AKI Suspected" value={renalData.aki_suspected}
                  onChange={v => {
                    setRenal("aki_suspected", v);
                    if (v !== true) setRenalData(p => ({ ...p, aki_kdigo_stage: null }));
                  }} disabled={!isFieldEditable}/>
              </div>

              {akiYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">AKI KDIGO Stage</div>
                  <StageCards
                    options={["Stage 1","Stage 2","Stage 3"]}
                    value={renalData.aki_kdigo_stage}
                    onChange={v => isFieldEditable && setRenalData(p=>({...p,aki_kdigo_stage:v}))}
                    disabled={!isFieldEditable}
                  />
                </div>
              )}

              <div className="rcn-yn-list">
                <NumRow label="Creatinine (mg/dL)" value={renalData.creatinine}
                  onChange={v=>setRenal("creatinine",v)} disabled={!isFieldEditable}
                  unit="mg/dL" placeholder="0.00"/>
                <YNRow label="Urine Output <1 ml/kg/hr" value={renalData.urine_output_low}
                  onChange={v=>setRenal("urine_output_low",v)} disabled={!isFieldEditable}/>
                <YNRow label="Dialysis / CRRT" value={renalData.dialysis_crrt}
                  onChange={v=>setRenal("dialysis_crrt",v)} disabled={!isFieldEditable}/>
              </div>
            </SectionCard>

            {/* ════ THERMOREGULATION ════ */}
            <SectionCard iconEmoji="🌡️" title="Thermoregulation"
              answered={thermoAnswered} total={thermoTotal} defaultOpen={true}>
              <div className="rcn-yn-list">
                <YNRow label="Hypothermia (<36°C)"    value={thermoData.hypothermia}  onChange={v=>setThermo("hypothermia",v)}  disabled={!isFieldEditable}/>
                <YNRow label="Hyperthermia (>37.5°C)" value={thermoData.hyperthermia} onChange={v=>setThermo("hyperthermia",v)} disabled={!isFieldEditable}/>
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

      {/* ── Sticky Footer ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/infect-gi-hema-log/${enrollmentId}`)}>
          <ArrowLeft size={15}/> Infect-GI-Hema
        </button>

        {!isSubmitted && (
          <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSave}>
            <Save size={15}/> Save
          </button>
        )}

        {!isSubmitted && (
          <button type="button" className="btn btn-submit-day"
            onClick={() => canSubmit && setShowModal(true)}
            disabled={!canSubmit}
            title={completionPct<100?`Fill all fields (${completionPct}% done)`:"Submit and lock this day"}>
            <Shield size={15}/>
            {canSubmit ? `Submit Day ${activeDay}` : `Submit (${completionPct}%)`}
          </button>
        )}

        {isSubmitted && (
          <div className="rcn-locked-badge"><Lock size={13}/> Day {activeDay} Locked</div>
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
              onClick={() => setShowDischargeConfirm(true)}>🏠 Discharge</button>
          )
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
          Form H <ArrowRight size={15}/>
        </button>
      </div>
    </>
  );
}