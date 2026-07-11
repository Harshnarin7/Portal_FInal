import React, { useState, useEffect, useCallback } from "react";
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
  FileCheck, Copy,
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
  // Submit button is visible to everyone — no role restriction
  // It only appears when day is saved AND all fields are 100% complete

  /* ── UI state ── */
  const [activeDay, setActiveDay]       = useState(1);
  const [totalDays, setTotalDays]       = useState(14);
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

  /* ── Patient info ── */
  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    babyUid: "",
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
  const isFieldEditable  = !isSubmitted && (!isSaved || isEditing);

  /* ── Load patient info ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = res?.data || {};
        const ga = b.gestation_weeks && b.gestation_days
          ? `${b.gestation_weeks}+${b.gestation_days} wks` : "";

        // Calculate current NICU day
        const admitDate = b.date_of_birth ? new Date(b.date_of_birth) : null;
        const today     = new Date();
        const dayNum    = admitDate
          ? Math.max(1, Math.floor((today - admitDate) / 86400000) + 1)
          : 1;

        // Calculate discharge day if discharged
        let dischDay = null;
        if (b.discharge_date) {
          const dd = new Date(b.discharge_date);
          dischDay = admitDate
            ? Math.max(1, Math.floor((dd - admitDate) / 86400000) + 1)
            : null;
          setDischargeDay(dischDay);
        }

        const maxDay = dischDay || Math.max(14, dayNum + 3);

        setPatientInfo(prev => ({
          ...prev,
          enrollmentId,
          babyUid:        b.baby_uid       || "",
          gestationalAge: ga,
          admissionDate:  b.date_of_birth  || "",
          dischargeDate:  b.discharge_date || "",
          status:         b.discharge_date ? "Discharged" : "In NICU",
        }));
        setActiveDay(dayNum);
        setTotalDays(maxDay);
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
  const respTotal    = 22; // items 1-22
  const respAnswered = Math.min(
    (respiratorySupport !== null ? 1 : 0)          // 1
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
    if (isSubmitted) return; // locked
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
      if (isSaved) {
        await api.put(`/resp-cv-neuro/${enrollmentId}/${activeDay}`, payload);
      } else {
        await api.post("/resp-cv-neuro/", payload);
      }
      markFormCompleted("vs6_1");
      setIsSaved(true);
      setIsEditing(false);
      setSavedAt(now);
      setSavedBy(user?.name || user?.username || "Nurse");
      // Set status: COMPLETE if 100%, PARTIAL/DRAFT otherwise
      // LATE if saved after 08:00 of that day
      const saveHour = new Date(now).getHours();
      const isLate   = saveHour >= 8 && completionPct < 100;
      const newSt    = completionPct === 100
        ? STATUS.COMPLETE
        : isLate ? STATUS.LATE : STATUS.DRAFT;
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

        {/* ══ PATIENT CONTEXT BAR ══ */}
        <div className="rcn-context-bar">
          <div className="rcn-context-trial">
            <div className="rcn-context-trial-icon">⊕</div>
            <div className="rcn-context-trial-info">
              <span className="rcn-context-trial-name">PORTAL TRIAL</span>
              <span className="rcn-context-trial-sub">Helper Form 2</span>
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
                  boxShadow: patientInfo.status === "Discharged"
                    ? "0 0 5px #94A3B8" : "0 0 5px #10B981"
                }} />
                <span>{patientInfo.status}</span>
              </div>
            </div>
          </div>
          {isSaved && !isSubmitted && (
            <button
              type="button"
              className={`rcn-edit-btn${isEditing ? " rcn-edit-btn--active" : ""}`}
              onClick={() => setIsEditing(p => !p)}
              style={{ flexShrink: 0 }}
            >
              {isEditing ? "✓ Done" : "Edit"}
            </button>
          )}
        </div>

        {/* ══ DAY TIMELINE ══ */}
        <div className="rcn-timeline-wrap">
          <span className="rcn-timeline-label">Days</span>
          <div className="rcn-timeline">
            {days.map(d => {
              const isActive      = d === activeDay;
              const isFuture      = d > activeDay;
              const isDischarge   = dischargeDay && d > dischargeDay;
              const st            = dayStatuses[d] || STATUS.EMPTY;
              const cfg           = DAY_STATUS_CONFIG[st] || DAY_STATUS_CONFIG[STATUS.EMPTY];
              const meta          = dayMeta[d] || {};
              return (
                <button
                  key={d}
                  type="button"
                  className={[
                    "rcn-day",
                    isActive    ? "rcn-day--active"    : "",
                    isFuture    ? "rcn-day--future"    : "",
                    isDischarge ? "rcn-day--discharged": "",
                    `rcn-day--${st}`,
                  ].filter(Boolean).join(" ")}
                  onClick={() => !isFuture && !isDischarge && setActiveDay(d)}
                  title={isDischarge
                    ? `Day ${d} — Patient discharged`
                    : `Day ${d} · ${cfg.label}${meta.pct ? ` · ${meta.pct}%` : ""}`}
                  style={!isActive && !isFuture && !isDischarge
                    ? { borderColor: cfg.color + "66" } : {}}
                >
                  <span className="rcn-day-d">D</span>
                  <span className="rcn-day-num">{d}</span>
                  <span
                    className="rcn-day-dot"
                    style={!isActive ? { background: cfg.dot } : {}}
                  />
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

          {/* ── Status legend ── */}
          <div className="rcn-timeline-legend">
            {LEGEND_ITEMS.map(item => (
              <span key={item.label} className="rcn-legend-item">
                <span className="rcn-legend-dot" style={{ background: item.dot }} />
                {item.label}
              </span>
            ))}
          </div>
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
            {!isSubmitted && activeDay > 1 && (
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

      {/* ══ STICKY FOOTER ══ */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/fio2-auc/${enrollmentId}`)}>
          <ArrowLeft size={15} /> FiO₂ AUC
        </button>

        {/* Save — always visible unless submitted */}
        {!isSubmitted && (
          <button type="button" className="btn btn-save btn-outline-blue"
            onClick={handleSave}>
            <Save size={15} /> Save
          </button>
        )}

        {/* Submit — visible when 100% complete */}
        {!isSubmitted && (
          <button
            type="button"
            className="btn btn-submit-day"
            onClick={() => canSubmit && setShowModal(true)}
            disabled={!canSubmit}
            title={completionPct < 100 ? `Fill all fields (${completionPct}% done)` : "Submit and lock this day"}
          >
            <Shield size={15} />
            {canSubmit ? `Submit Day ${activeDay}` : `Submit (${completionPct}%)`}
          </button>
        )}

        {/* Discharge button — only when not already discharged */}
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

        {/* Locked indicator */}
        {isSubmitted && (
          <div className="rcn-locked-badge">
            <Lock size={13} /> Day {activeDay} Locked
          </div>
        )}

        <div className="footer-step-indicator">
          <span className="step-text">HELPER 2 OF 4</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment" />
            <div className="progress-segment" />
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={completionPct === 0}>
          Next Form <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
