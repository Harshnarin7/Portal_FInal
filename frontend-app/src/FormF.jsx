import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import {
  ArrowLeft, ArrowRight, Save,
  AlertTriangle, X, Lock,
  Plus, Trash2, Pencil, FileText, Check,
  Info, Activity, ClipboardList, Brain, CalendarDays
} from "lucide-react";
import "./styles/FormF.css";
import NotesBox from "./components/NotesBox";

/* ══════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════ */
const GRADES = ["None", "I", "II", "III", "IV"];
const getGradeNum = g => ({ None: 0, I: 1, II: 2, III: 3, IV: 4 }[g] ?? 0);
const STATUS = { EMPTY: "empty", DRAFT: "draft", COMPLETE: "complete", SUBMITTED: "submitted" };
const MAX_SCANS = 10;

const NURSES = ["Geetika", "Navkiran Kaur", "Priyanka Thakur", "Seemran Kaur",
  "Tanvi Saini", "Yashvi Jolly", "Mannat Guliani", "Shalini Dhiman"];
const getDesignation = (name) => {
  if (name === "Mannat Guliani") return "Project Research Scientist III (Medical)";
  if (name === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
  return name ? "Project Nurse III" : "";
};

// CRF-exact schedules — Scan 6 (36wk) added for lt28
const SCHEDULES = {
  lt28: {
    label: "< 28 wks or < 1000 g",
    steps: [
      { label: "Scan 1", sub: "Day 1–3",              dolMin: 1,   dolMax: 3,   pmaWk: null },
      { label: "Scan 2", sub: "Day 4–7",              dolMin: 4,   dolMax: 7,   pmaWk: null },
      { label: "Scan 3", sub: "Day 10–14",            dolMin: 10,  dolMax: 14,  pmaWk: null },
      { label: "Scan 4", sub: "Day 21 (if unstable)", dolMin: 19,  dolMax: 23,  pmaWk: null },
      { label: "Scan 5", sub: "Day 28",               dolMin: 26,  dolMax: 30,  pmaWk: null },
      { label: "Scan 6", sub: "36 wks PMA",           dolMin: null, dolMax: null, pmaWk: 36 },
      { label: "Final",  sub: "40 wks PMA",           dolMin: null, dolMax: null, pmaWk: 40 },
    ],
  },
  w28_31: {
    label: "28–31 wks",
    steps: [
      { label: "Scan 1", sub: "Day 4–7 (opt. 1–3)", dolMin: 1,  dolMax: 7,   pmaWk: null },
      { label: "Scan 2", sub: "Day 10–14",           dolMin: 10, dolMax: 14,  pmaWk: null },
      { label: "Scan 3", sub: "Day 28 (or unwell)",  dolMin: 25, dolMax: 32,  pmaWk: null },
      { label: "Final",  sub: "40 wks PMA",          dolMin: null, dolMax: null, pmaWk: 40 },
    ],
  },
};

/* ══════════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════════ */

/** DOL = scanDate - dob + 1 (1-indexed) */
function calcDOL(scanDateStr, dobStr) {
  if (!scanDateStr || !dobStr) return null;
  const scan = new Date(scanDateStr);
  const dob  = new Date(dobStr);
  if (isNaN(scan) || isNaN(dob)) return null;
  const diff = Math.floor((scan - dob) / 86400000);
  return diff + 1;
}

/** PMA = GA at birth + chronological age in days */
function calcPMA(gaWeeks, gaDays, dol) {
  if (!gaWeeks || dol === null) return null;
  const totalDaysGA  = (gaWeeks * 7) + (gaDays || 0);
  const totalDaysPMA = totalDaysGA + (dol - 1);
  const pmaW = Math.floor(totalDaysPMA / 7);
  const pmaD = totalDaysPMA % 7;
  return { weeks: pmaW, days: pmaD, label: `${pmaW}+${pmaD} wks` };
}

function formatPMA(pmaObj) {
  if (!pmaObj) return "—";
  return `${pmaObj.weeks}+${pmaObj.days} wks`;
}

/** Format date string → DD/MM/YY */
function formatDateDMY(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) {
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${String(parts[0]).slice(-2)}`;
    }
    return dateStr;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/** Which protocol window does a DOL fall into? */
function guessProtocolWindow(dol, scheduleKey) {
  if (!dol || !scheduleKey) return null;
  const steps = SCHEDULES[scheduleKey]?.steps || [];
  return steps.find(s => s.dolMin && dol >= s.dolMin && dol <= s.dolMax) || null;
}

/* ══════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════ */

/* ── Grade pill selector — segmented control (None–IV) ── */
function GradePills({ label, value, onChange, disabled }) {
  return (
    <div className="cu-grade-wrap">
      <span className="cu-grade-label">{label}</span>
      <div className="cu-seg" role="group" aria-label={label}>
        {GRADES.map(g => {
          const on = value === g;
          return (
            <button
              key={g}
              type="button"
              className={`cu-seg-btn cu-seg-btn--${g.toLowerCase()}${on ? " is-on" : ""}`}
              aria-pressed={on}
              onClick={() => !disabled && onChange(g)}
              disabled={disabled}
            >{g === "None" ? "None" : g}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Yes / No segmented toggle ── */
function YNSegment({ value, onChange, disabled }) {
  return (
    <div className="cu-yn">
      <button type="button" className={`cu-yn-btn${value === true ? " cu-yn-yes" : ""}`}
        onClick={() => !disabled && onChange(value === true ? null : true)} disabled={disabled}>Yes</button>
      <button type="button" className={`cu-yn-btn${value === false ? " cu-yn-no" : ""}`}
        onClick={() => !disabled && onChange(value === false ? null : false)} disabled={disabled}>No</button>
    </div>
  );
}

/* ── Scan Form Modal — bilateral grading entry ── */
function ScanFormModal({ scan, scanNumber, dob, gaWeeks, gaDays, scheduleKey, onSave, onCancel }) {
  const [form, setForm] = useState(scan || {
    scanDate: "", sonographer: "",
    ivhGradeRight: "None", ivhGradeLeft: "None",
    cpvlGradeRight: "None", cpvlGradeLeft: "None",
    findings: "",
  });
  const [dateError, setDateError] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const dol = useMemo(() => calcDOL(form.scanDate, dob), [form.scanDate, dob]);
  const pma = useMemo(() => calcPMA(gaWeeks, gaDays, dol), [gaWeeks, gaDays, dol]);
  const win = useMemo(() => guessProtocolWindow(dol, scheduleKey), [dol, scheduleKey]);

  const highGrade =
    getGradeNum(form.ivhGradeRight) >= 3 || getGradeNum(form.ivhGradeLeft) >= 3 ||
    getGradeNum(form.cpvlGradeRight) >= 2 || getGradeNum(form.cpvlGradeLeft) >= 2;

  const handleSave = () => {
    if (!form.scanDate) {
      setDateError("Scan date is required");
      return;
    }
    setDateError("");
    onSave({ ...form, dol, pma: formatPMA(pma) });
  };

  return (
    <div className="cu-modal-overlay" onClick={onCancel}>
      <div className="cu-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">

        <div className="cu-modal-header">
          <div className="cu-modal-icon"><FileText size={18} /></div>
          <div className="cu-modal-header-text">
            <h3 className="cu-modal-title">{scan ? `Edit Scan #${scanNumber}` : `New Scan #${scanNumber}`}</h3>
            <p className="cu-modal-sub">
              {win ? `Protocol: ${win.label} · ${win.sub}` : "Cranial ultrasound · IVH & cPVL grading"}
            </p>
          </div>
          <button type="button" className="cu-modal-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="cu-modal-body">

          {/* Identification row */}
          <div className="cu-modal-row2">
            <div className="cu-field">
              <label className="cu-label">Scan Date <span className="cu-req">*</span></label>
              <input
                type="date"
                className={`cu-input${dateError ? " cu-input--error" : ""}`}
                value={form.scanDate}
                onChange={e => { set("scanDate", e.target.value); setDateError(""); }}
              />
              {dateError && <span className="cu-field-error">{dateError}</span>}
            </div>
            <div className="cu-field">
              <label className="cu-label">Sonographer / Name</label>
              <input
                type="text"
                className="cu-input"
                placeholder="Name of examiner"
                value={form.sonographer}
                onChange={e => set("sonographer", e.target.value)}
              />
            </div>
          </div>

          {/* Always-visible DOL / PMA (CRF columns) */}
          <div className="cu-modal-row2">
            <div className="cu-field">
              <label className="cu-label">DOL <span className="cu-auto-tag">AUTO</span></label>
              <div className="cu-readonly">
                {dol != null ? `Day ${dol}` : (form.scanDate ? "—" : "Select scan date")}
              </div>
            </div>
            <div className="cu-field">
              <label className="cu-label">PMA <span className="cu-auto-tag">AUTO</span></label>
              <div className="cu-readonly">
                {pma ? formatPMA(pma) : (form.scanDate ? "—" : "Select scan date")}
              </div>
            </div>
          </div>

          <div className="cu-divider-label"><span>Bilateral grading</span></div>

          <div className="cu-grade-columns">
            <div className="cu-grade-col cu-grade-col--right">
              <span className="cu-side-badge cu-side-badge--right">Right</span>
              <GradePills label="IVH grade" value={form.ivhGradeRight} onChange={v => set("ivhGradeRight", v)} />
              <div className="cu-grade-col-sep" />
              <GradePills label="cPVL grade" value={form.cpvlGradeRight} onChange={v => set("cpvlGradeRight", v)} />
            </div>
            <div className="cu-grade-col cu-grade-col--left">
              <span className="cu-side-badge cu-side-badge--left">Left</span>
              <GradePills label="IVH grade" value={form.ivhGradeLeft} onChange={v => set("ivhGradeLeft", v)} />
              <div className="cu-grade-col-sep" />
              <GradePills label="cPVL grade" value={form.cpvlGradeLeft} onChange={v => set("cpvlGradeLeft", v)} />
            </div>
          </div>

          <p className="cu-grade-hint">Select one grade per side. Papile (IVH) · De Vries (cPVL). Default is None.</p>

          {highGrade && (
            <div className="cu-alert cu-alert--warn">
              <AlertTriangle size={14} />
              <span>High-grade finding — Brain Injury for Composite Outcome (item 8) will be <strong>Yes</strong>.</span>
            </div>
          )}

          <div className="cu-field">
            <label className="cu-label">Findings / Notes</label>
            <textarea
              rows={3}
              className="cu-textarea"
              placeholder="Key findings for this scan (echogenicity, ventricular size, cysts…)"
              value={form.findings}
              onChange={e => set("findings", e.target.value)}
            />
          </div>
        </div>

        <div className="cu-modal-footer">
          <button type="button" className="cu-btn cu-btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="cu-btn cu-btn--primary" onClick={handleSave}>
            <Check size={15} /> {scan ? "Update Scan" : "Save Scan"}
          </button>
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */

export default function FormF() {
  const { enrollmentId } = useParams();
  const navigate   = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { user }   = useAuth();

  const [loading, setLoading]         = useState(false);
  const [isSaved, setIsSaved]         = useState(false);
  const [isEditing, setIsEditing]     = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [message, setMessage]         = useState("");

  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    gaWeeks: null, gaDays: null,
    birthWeight: null, // number, used for schedule logic
    dob: "",
  });

  const [scanEntries, setScanEntries] = useState([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [editingScan, setEditingScan] = useState(null);
  const [scheduleKey, setScheduleKey] = useState(null);

  const [complications, setComplications] = useState({
    phvd: null, phvdDate: "", vpShunt: null, vpShuntDate: "",
  });
  const setComp = (k, v) => setComplications(p => ({ ...p, [k]: v }));

  const [otherFindings, setOtherFindings] = useState({
    ventriculomegaly: false, subependymalCyst: false,
    choroidPlexusCyst: false, cerebellarHemorrhage: false,
    subduralHemorrhage: false, otherFinding: false, otherText: "",
  });
  const setFinding = (k, v) => setOtherFindings(p => ({ ...p, [k]: v }));

  const [completion, setCompletion] = useState({
    completedBy: "", designation: "", completionDate: "",
  });
  const setCompletionField = (k, v) => setCompletion(p => ({ ...p, [k]: v }));
  const handleCompletedByChange = (e) => {
    const name = e.target.value;
    setCompletion(p => ({ ...p, completedBy: name, designation: getDesignation(name) }));
  };

  const isFieldEditable = !isSubmitted && (!isSaved || isEditing);

  /* ── Load ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
      setLoading(true);
      let gaW = null, gaD = null, bw = null, dob = "";
      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = res?.data || {};
        gaW = b.gestation_weeks ?? null;
        gaD = b.gestation_days ?? null;
        bw  = b.birth_weight != null ? Number(b.birth_weight) : null;
        dob = b.date_of_birth || "";
        setPatientInfo({ enrollmentId, gaWeeks: gaW, gaDays: gaD, birthWeight: bw, dob });
        if (gaW !== null) {
          setScheduleKey((gaW < 28 || (bw !== null && bw < 1000)) ? "lt28" : "w28_31");
        }
      } catch (_) {}
      try {
        const res = await api.get(`/form-h/${enrollmentId}`);
        const fh = res?.data || {};
        if (fh && Object.keys(fh).length > 0) {
          const entries = Array.isArray(fh.scan_entries) ? fh.scan_entries : [];
          setScanEntries(entries.slice(0, MAX_SCANS).map((s, i) => ({
            ...s,
            _id: s._id || (Date.now() + i),
            scanNumber: s.scanNumber || (i + 1),
          })));
          setComplications({
            phvd: fh.phvd ?? null,
            phvdDate: fh.phvd_diagnosis_date || "",
            vpShunt: fh.vp_shunt ?? null,
            vpShuntDate: fh.vp_shunt_insertion_date || "",
          });
          setOtherFindings({
            ventriculomegaly: fh.ventriculomegaly || false,
            subependymalCyst: fh.subependymal_cyst || false,
            choroidPlexusCyst: fh.choroid_plexus_cyst || false,
            cerebellarHemorrhage: fh.cerebellar_hemorrhage || false,
            subduralHemorrhage: fh.subdural_hemorrhage || false,
            otherFinding: fh.other_finding || false,
            otherText: fh.other_finding_text || "",
          });
          setCompletion({
            completedBy: fh.completed_by || "",
            designation: fh.designation || "",
            completionDate: fh.completion_date || "",
          });
          if (fh.schedule_key) setScheduleKey(fh.schedule_key);
          setIsSubmitted(fh.submission_status === STATUS.SUBMITTED);
          setIsSaved(true);
        }
      } catch (err) {
        if (err?.response?.status !== 404) setMessage("Failed to load form data.");
      } finally { setLoading(false); }
    };
    load();
  }, [enrollmentId]);

  /* ── Auto-enriched scan entries (DOL + PMA from date) ── */
  const enrichedScans = useMemo(() =>
    scanEntries.map(s => {
      const dolFromDate = calcDOL(s.scanDate, patientInfo.dob);
      const dol = dolFromDate ?? (s.dol !== undefined && s.dol !== null ? Number(s.dol) : null);
      const pma = calcPMA(patientInfo.gaWeeks, patientInfo.gaDays, dol);
      return { ...s, dolCalc: dol, pmaCalc: pma };
    }),
    [scanEntries, patientInfo.dob, patientInfo.gaWeeks, patientInfo.gaDays]
  );

  /* ── Auto-calculations ── */
  const calcMax = (field) => {
    let max = { grade: "None", date: "—", dol: "—", pma: "—" }, maxV = -1;
    enrichedScans.forEach(e => {
      const g = e[field];
      const v = getGradeNum(g);
      if (v > maxV) {
        maxV = v;
        max = {
          grade: g || "None",
          date: formatDateDMY(e.scanDate) || "—",
          dol: e.dolCalc ? `Day ${e.dolCalc}` : "—",
          pma: formatPMA(e.pmaCalc),
        };
      }
    });
    return max;
  };

  const maxRIVH  = calcMax("ivhGradeRight");
  const maxLIVH  = calcMax("ivhGradeLeft");
  const maxRCPVL = calcMax("cpvlGradeRight");
  const maxLCPVL = calcMax("cpvlGradeLeft");

  const brainInjury = enrichedScans.some(e =>
    getGradeNum(e.ivhGradeRight) >= 3 || getGradeNum(e.ivhGradeLeft) >= 3 ||
    getGradeNum(e.cpvlGradeRight) >= 2 || getGradeNum(e.cpvlGradeLeft) >= 2
  );

  /* ── Schedule step status (compact reference) ── */
  const stepStatus = (step) => {
    if (step.pmaWk !== null) {
      return enrichedScans.some(e => {
        if (e.pmaCalc && Math.abs(e.pmaCalc.weeks - step.pmaWk) <= 1) return true;
        if (e.pma) { const p = parseInt(e.pma); if (!isNaN(p) && Math.abs(p - step.pmaWk) <= 1) return true; }
        return false;
      });
    }
    return enrichedScans.some(e => {
      const d = e.dolCalc ?? (e.dol !== undefined && e.dol !== null ? Number(e.dol) : NaN);
      return !isNaN(d) && d >= step.dolMin && d <= step.dolMax;
    });
  };

  /* ── SCAN CRUD ── */
  const handleSaveScan = (form) => {
    let list;
    if (editingScan !== null) {
      list = scanEntries.map(s => s._id === editingScan ? { ...form, _id: editingScan } : s);
    } else {
      if (scanEntries.length >= MAX_SCANS) { alert(`Maximum of ${MAX_SCANS} scans reached.`); return; }
      const newId = Date.now() + Math.floor(Math.random() * 1000);
      list = [...scanEntries, { ...form, _id: newId }];
    }
    const sorted = list
      .sort((a, b) => new Date(a.scanDate) - new Date(b.scanDate))
      .slice(0, MAX_SCANS)
      .map((s, i) => ({ ...s, scanNumber: i + 1 }));
    setScanEntries(sorted);
    setShowScanModal(false);
    setEditingScan(null);
    setIsSaved(false);
  };

  const handleDeleteScan = (_id) => {
    if (!isFieldEditable) return;
    if (!window.confirm("Delete this scan entry?")) return;
    const filtered = scanEntries.filter(s => s._id !== _id);
    setScanEntries(filtered.sort((a, b) => new Date(a.scanDate) - new Date(b.scanDate)).map((s, i) => ({ ...s, scanNumber: i + 1 })));
  };

  /* ── Save / Submit ── */
  const buildPayload = (now) => ({
    enrollment_id: enrollmentId,
    scan_entries: scanEntries.map(({ dolCalc, pmaCalc, ...rest }) => rest),
    phvd: complications.phvd,
    phvd_diagnosis_date: complications.phvdDate,
    vp_shunt: complications.vpShunt,
    vp_shunt_insertion_date: complications.vpShuntDate,
    ventriculomegaly: otherFindings.ventriculomegaly,
    subependymal_cyst: otherFindings.subependymalCyst,
    choroid_plexus_cyst: otherFindings.choroidPlexusCyst,
    cerebellar_hemorrhage: otherFindings.cerebellarHemorrhage,
    subdural_hemorrhage: otherFindings.subduralHemorrhage,
    other_finding: otherFindings.otherFinding,
    other_finding_text: otherFindings.otherText,
    brain_injury_composite: brainInjury,
    schedule_key: scheduleKey,
    completed_by: completion.completedBy,
    designation: completion.designation,
    completion_date: completion.completionDate,
    submission_status: STATUS.DRAFT,
    saved_at: now,
    saved_by: user?.name || user?.username || "Site Staff",
  });

  const handleSaveDraft = async () => {
    if (!enrollmentId || isSubmitted) return;
    const now = new Date().toISOString();
    try {
      const payload = buildPayload(now);
      isSaved
        ? await api.put(`/form-h/${enrollmentId}`, payload)
        : await api.post("/form-h/", payload);
      markFormCompleted("form_h");
      setIsSaved(true); setIsEditing(false);
      setMessage("Form F saved successfully.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Unknown error";
      setMessage(`Error saving: ${detail}`);
    }
  };

  const handleNext = async () => {
    try {
      if (!isSubmitted) {
        const now = new Date().toISOString();
        const payload = buildPayload(now);
        isSaved
          ? await api.put(`/form-h/${enrollmentId}`, payload)
          : await api.post("/form-h/", payload);
        markFormCompleted("form_h");
        setIsSaved(true);
      }
    } catch (_) {
      setMessage("Error saving before navigation.");
      return;
    }
    navigate(`/form-g/${enrollmentId}`);
  };

  const schedule = scheduleKey ? SCHEDULES[scheduleKey] : null;

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <>
      {isSaved && isEditing && (
        <div className="cu-editing-banner">
          <span className="cu-editing-dot" />
          Editing mode active — changes will be saved when you click Save.
        </div>
      )}

      <div className="cu-page">

        {/* ══ PATIENT CONTEXT BAR ══ */}
        <div className="cu-context-bar">
          <div className="cu-context-trial">
            <div className="cu-context-trial-icon"><Brain size={17} /></div>
            <div className="cu-context-trial-info">
              <span className="cu-context-name">PORTAL Trial</span>
              <span className="cu-context-sub">Form F — Cranial Ultrasound</span>
            </div>
          </div>
          <div className="cu-context-fields">
            {[
              { label: "Enrolment ID", value: patientInfo.enrollmentId || "—" },
              { label: "Gestation", value: (patientInfo.gaWeeks != null) ? `${patientInfo.gaWeeks} wks ${patientInfo.gaDays ?? 0} days` : "—" },
              { label: "Birth Weight", value: patientInfo.birthWeight != null ? `${patientInfo.birthWeight} g` : "—" },
              { label: "DOB", value: formatDateDMY(patientInfo.dob) },
            ].map((f, i, arr) => (
              <div key={f.label} className={`cu-context-field${i === arr.length - 1 ? " cu-context-field--last" : ""}`}>
                <span className="cu-context-field-label">{f.label}</span>
                <span className="cu-context-field-value">{f.value}</span>
              </div>
            ))}
          </div>
          {isSaved && !isSubmitted && (
            <button type="button"
              className={`cu-edit-btn${isEditing ? " cu-edit-btn--active" : ""}`}
              onClick={() => setIsEditing(p => !p)}>
              {isEditing ? "Done" : "Edit"}
            </button>
          )}
          {isSubmitted && (
            <div className="cu-locked-pill"><Lock size={12} /> Locked</div>
          )}
        </div>

        <div className="cu-body">

          {/* ══ F1. SCREENING RECORD ══ */}
          <div className="cu-card">
            <div className="cu-card-header">
              <div className="cu-card-header-left">
                <div className="cu-card-icon"><Activity size={17} /></div>
                <h3 className="cu-card-title">F1. Ultrasound Screening Record</h3>
              </div>
              {isFieldEditable && (
                <button type="button" className="cu-btn-add"
                  disabled={scanEntries.length >= MAX_SCANS}
                  onClick={() => { setEditingScan(null); setShowScanModal(true); }}>
                  <Plus size={13} /> Add Scan {scanEntries.length >= MAX_SCANS ? "(Max 10)" : ""}
                </button>
              )}
            </div>

            {enrichedScans.length === 0 ? (
              <div className="cu-empty">
                <Activity size={22} className="cu-empty-icon" />
                <p>No cranial ultrasound scans recorded yet.</p>
                {isFieldEditable && (
                  <button type="button" className="cu-btn cu-btn--primary"
                    onClick={() => { setEditingScan(null); setShowScanModal(true); }}>
                    <Plus size={14} /> Record First Scan
                  </button>
                )}
              </div>
            ) : (
              <div className="cu-table-wrap">
                <table className="cu-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>DOL</th>
                      <th>PMA</th>
                      <th>Findings</th>
                      <th>Grading</th>
                      <th>Name</th>
                      {isFieldEditable && <th className="cu-table-actions-head">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedScans.map(scan => {
                      const hasHigh = getGradeNum(scan.ivhGradeRight) >= 3 || getGradeNum(scan.ivhGradeLeft) >= 3 ||
                        getGradeNum(scan.cpvlGradeRight) >= 2 || getGradeNum(scan.cpvlGradeLeft) >= 2;
                      const openEdit = () => { if (isFieldEditable) { setEditingScan(scan._id); setShowScanModal(true); } };
                      return (
                        <tr key={scan._id}
                          className={`cu-table-row${hasHigh ? " cu-table-row--alert" : ""}${isFieldEditable ? " cu-table-row--clickable" : ""}`}
                          onClick={openEdit}>
                          <td className="cu-table-num">{scan.scanNumber}</td>
                          <td>{formatDateDMY(scan.scanDate)}</td>
                          <td className="cu-auto-value">{scan.dolCalc ? `D${scan.dolCalc}` : "—"}</td>
                          <td className="cu-auto-value">{formatPMA(scan.pmaCalc)}</td>
                          <td className="cu-table-findings" title={scan.findings || ""}>{scan.findings || "—"}</td>
                          <td>
                            <div className="cu-table-grades">
                              <span className={`cu-mini-grade cu-mini-grade--${getGradeNum(scan.ivhGradeRight) >= getGradeNum(scan.ivhGradeLeft) ? String(scan.ivhGradeRight||"None").toLowerCase() : String(scan.ivhGradeLeft||"None").toLowerCase()}`}>
                                IVH R:{scan.ivhGradeRight || "—"} L:{scan.ivhGradeLeft || "—"}
                              </span>
                              <span className={`cu-mini-grade cu-mini-grade--${getGradeNum(scan.cpvlGradeRight) >= getGradeNum(scan.cpvlGradeLeft) ? String(scan.cpvlGradeRight||"None").toLowerCase() : String(scan.cpvlGradeLeft||"None").toLowerCase()}`}>
                                cPVL R:{scan.cpvlGradeRight || "—"} L:{scan.cpvlGradeLeft || "—"}
                              </span>
                            </div>
                          </td>
                          <td>{scan.sonographer || "—"}</td>
                          {isFieldEditable && (
                            <td className="cu-table-actions" onClick={e => e.stopPropagation()}>
                              <button type="button" className="cu-icon-btn cu-icon-btn--edit" onClick={openEdit}>
                                <Pencil size={14} />
                              </button>
                              <button type="button" className="cu-icon-btn cu-icon-btn--delete" onClick={() => handleDeleteScan(scan._id)}>
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Schedule reference + grading legends (compact) ── */}
            <div className="cu-f1-refs">
              <div className="cu-ref-subcard">
                <div className="cu-ref-subcard-header">
                  <CalendarDays size={13} />
                  <span>Surveillance Schedule Reference</span>
                  <div className="cu-schedule-tabs">
                    {Object.entries(SCHEDULES).map(([key, sch]) => (
                      <button key={key} type="button"
                        className={`cu-schedule-tab${scheduleKey === key ? " cu-schedule-tab--active" : ""}`}
                        onClick={() => setScheduleKey(key)}>{sch.label}</button>
                    ))}
                  </div>
                </div>
                {schedule && (
                  <div className="cu-sched-chip-row">
                    {schedule.steps.map((step, i) => {
                      const done = stepStatus(step);
                      return (
                        <span key={i} className={`cu-sched-chip${done ? " cu-sched-chip--done" : ""}`}>
                          {done && <Check size={10} />}
                          {step.label} · {step.sub}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="cu-ref-note"><Info size={11} /> Auto-selected: {(patientInfo.gaWeeks != null && (patientInfo.gaWeeks < 28 || (patientInfo.birthWeight != null && patientInfo.birthWeight < 1000))) ? "< 28 wks or < 1000 g" : "28–31 wks"} protocol.</div>
              </div>

              <div className="cu-legend-grid">
                <div className="cu-legend-card">
                  <h5 className="cu-legend-title">IVH Grading — Papile</h5>
                  {[
                    ["I", "Germinal matrix hemorrhage (<10% ventricular area)"],
                    ["II", "IVH filling <50% of ventricle"],
                    ["III", "IVH filling ≥50% of ventricle ± dilatation"],
                    ["IV", "Parenchymal involvement / PVHI"],
                  ].map(([g, d]) => (
                    <div key={g} className={`cu-legend-row${(g === "III" || g === "IV") ? " cu-legend-row--high" : ""}`}>
                      <span className={`cu-legend-grade cu-legend-grade--${g.toLowerCase()}`}>Grade {g}</span>
                      <span className="cu-legend-desc">{d}</span>
                    </div>
                  ))}
                </div>
                <div className="cu-legend-card">
                  <h5 className="cu-legend-title">cPVL Grading — De Vries</h5>
                  {[
                    ["I", "Transient periventricular flares >7 days"],
                    ["II", "Localized cysts beside external angle of lateral ventricle"],
                    ["III", "Extensive fronto-parietal / occipital periventricular cysts"],
                    ["IV", "Extensive cysts in subcortical white matter"],
                  ].map(([g, d]) => (
                    <div key={g} className={`cu-legend-row${g !== "I" ? " cu-legend-row--high" : ""}`}>
                      <span className={`cu-legend-grade cu-legend-grade--${g.toLowerCase()}`}>Grade {g}</span>
                      <span className="cu-legend-desc">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ══ F2. DETAILED FINDINGS & SUMMARY ══ */}
          <h3 className="cu-section-heading">F2. Detailed Findings &amp; Summary</h3>

          <div className="cu-f2-grid">
            {/* 1 & 2 — Max IVH */}
            {[
              { num: 1, side: "Right", data: maxRIVH },
              { num: 2, side: "Left",  data: maxLIVH },
            ].map(({ num, side, data }) => (
              <div key={side} className="cu-side-panel">
                <span className={`cu-side-badge cu-side-badge--${side.toLowerCase()}`}>{side}</span>
                <div className="cu-panel-item-label">{num}. Max IVH Grade</div>
                <div className={`cu-max-grade cu-max-grade--${data.grade.toLowerCase()}`}>{data.grade}</div>
                <div className="cu-meta-row"><span>{num}a. Date</span><span>{data.date}</span></div>
                <div className="cu-meta-row"><span>{num}b. DOL</span><span className="cu-auto-value">{data.dol}</span></div>
                <div className="cu-meta-row"><span>{num}c. PMA</span><span className="cu-auto-value">{data.pma}</span></div>
              </div>
            ))}

            {/* 3 & 4 — Max cPVL */}
            {[
              { num: 3, side: "Right", data: maxRCPVL },
              { num: 4, side: "Left",  data: maxLCPVL },
            ].map(({ num, side, data }) => (
              <div key={side + "cpvl"} className="cu-side-panel">
                <span className={`cu-side-badge cu-side-badge--${side.toLowerCase()}`}>{side}</span>
                <div className="cu-panel-item-label">{num}. Max cPVL Grade</div>
                <div className={`cu-max-grade cu-max-grade--${data.grade.toLowerCase()}`}>{data.grade}</div>
                <div className="cu-meta-row"><span>Date</span><span>{data.date}</span></div>
                <div className="cu-meta-row"><span>DOL</span><span className="cu-auto-value">{data.dol}</span></div>
                <div className="cu-meta-row"><span>PMA</span><span className="cu-auto-value">{data.pma}</span></div>
              </div>
            ))}
          </div>

          {/* 5 & 6 — Complications */}
          <div className="cu-card">
            <div className="cu-card-header">
              <div className="cu-card-header-left">
                <div className="cu-card-icon"><AlertTriangle size={17} /></div>
                <h3 className="cu-card-title">Post-Hemorrhagic Complications</h3>
              </div>
            </div>
            <div className="cu-complications">
              <div className="cu-complication-item">
                <div className="cu-complication-row">
                  <div className="cu-complication-info">
                    <div className="cu-complication-title">5. Post-Hemorrhagic Ventricular Dilatation (PHVD)</div>
                  </div>
                  <YNSegment value={complications.phvd}
                    onChange={v => { setComp("phvd", v); if (v !== true) setComp("phvdDate", ""); }}
                    disabled={!isFieldEditable} />
                </div>
                {complications.phvd === true && (
                  <div className="cu-complication-nested">
                    <label className="cu-label">5a. Date</label>
                    <input type="date" className="cu-input cu-input--sm"
                      value={complications.phvdDate}
                      onChange={e => setComp("phvdDate", e.target.value)}
                      disabled={!isFieldEditable} />
                  </div>
                )}
              </div>
              <div className="cu-complication-item">
                <div className="cu-complication-row">
                  <div className="cu-complication-info">
                    <div className="cu-complication-title">6. VP Shunt / Reservoir Required</div>
                  </div>
                  <YNSegment value={complications.vpShunt}
                    onChange={v => { setComp("vpShunt", v); if (v !== true) setComp("vpShuntDate", ""); }}
                    disabled={!isFieldEditable} />
                </div>
                {complications.vpShunt === true && (
                  <div className="cu-complication-nested">
                    <label className="cu-label">6a. Date</label>
                    <input type="date" className="cu-input cu-input--sm"
                      value={complications.vpShuntDate}
                      onChange={e => setComp("vpShuntDate", e.target.value)}
                      disabled={!isFieldEditable} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 7 — Other findings */}
          <div className="cu-card">
            <div className="cu-card-header">
              <div className="cu-card-header-left">
                <div className="cu-card-icon"><FileText size={17} /></div>
                <h3 className="cu-card-title">7. Other Ultrasound Findings</h3>
              </div>
            </div>
            <div className="cu-findings-grid">
              {[
                { k: "ventriculomegaly", l: "Ventriculomegaly" },
                { k: "subependymalCyst", l: "Subependymal Cyst" },
                { k: "choroidPlexusCyst", l: "Choroid Plexus Cyst" },
                { k: "cerebellarHemorrhage", l: "Cerebellar Hemorrhage" },
                { k: "subduralHemorrhage", l: "Subdural Hemorrhage" },
                { k: "otherFinding", l: "Other Finding" },
              ].map(({ k, l }) => (
                <label key={k} className={`cu-finding-check${otherFindings[k] ? " cu-finding-check--on" : ""}`}>
                  <input type="checkbox" checked={otherFindings[k]}
                    onChange={e => isFieldEditable && setFinding(k, e.target.checked)}
                    disabled={!isFieldEditable} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
            {otherFindings.otherFinding && (
              <div className="cu-field" style={{ padding: "0 22px 18px" }}>
                <label className="cu-label">Describe Other Finding</label>
                <textarea rows={3} className="cu-textarea"
                  placeholder="e.g. Porencephalic cyst, Hydrocephalus, Cerebral atrophy…"
                  value={otherFindings.otherText}
                  onChange={e => isFieldEditable && setFinding("otherText", e.target.value)}
                  disabled={!isFieldEditable} />
              </div>
            )}
          </div>

          {/* 8 — Brain Injury Composite */}
          <div className="cu-brain-card">
            <div className="cu-brain-left">
              <Brain size={20} className="cu-brain-icon" />
              <div>
                <h4 className="cu-brain-title">8. Brain Injury for Composite Outcome</h4>
                <p className="cu-brain-desc">Auto-calculated: IVH ≥ III and/or cPVL ≥ II</p>
              </div>
            </div>
            <span className={`cu-brain-badge${brainInjury ? " cu-brain-badge--positive" : " cu-brain-badge--negative"}`}>
              {brainInjury ? "Yes" : "No"}
            </span>
          </div>

          {/* ══ COMPLETION FOOTER ══ */}
          <div className="cu-card">
            <div className="cu-card-header">
              <div className="cu-card-header-left">
                <div className="cu-card-icon"><ClipboardList size={17} /></div>
                <h3 className="cu-card-title">Form Completion</h3>
              </div>
            </div>
            <div className="cu-completion-grid">
              <div className="cu-field">
                <label className="cu-label">Completed By</label>
                <select className="cu-input" value={completion.completedBy}
                  onChange={handleCompletedByChange} disabled={!isFieldEditable}>
                  <option value="">Select…</option>
                  {NURSES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="cu-field">
                <label className="cu-label">Designation</label>
                <input type="text" className="cu-input" value={completion.designation}
                  readOnly disabled />
              </div>
              <div className="cu-field">
                <label className="cu-label">Date</label>
                <input type="date" className="cu-input" value={completion.completionDate}
                  onChange={e => setCompletionField("completionDate", e.target.value)}
                  disabled={!isFieldEditable} />
              </div>
            </div>
          </div>

          <NotesBox formKey={`form_f_${enrollmentId || "new"}`} />

          {message && (
            <div className={`cu-message${message.startsWith("Form F saved") ? " cu-message--success" : " cu-message--error"}`}>
              {message}
            </div>
          )}
        </div>{/* end cu-body */}

      </div>{/* end cu-page */}

      {/* Modals */}
      {showScanModal && (
        <ScanFormModal
          scan={editingScan ? scanEntries.find(s => s._id === editingScan) : null}
          scanNumber={editingScan ? scanEntries.find(s => s._id === editingScan)?.scanNumber : scanEntries.length + 1}
          dob={patientInfo.dob}
          gaWeeks={patientInfo.gaWeeks}
          gaDays={patientInfo.gaDays}
          scheduleKey={scheduleKey}
          onSave={handleSaveScan}
          onCancel={() => { setShowScanModal(false); setEditingScan(null); }}
        />
      )}

      {/* ══ STICKY FOOTER ══ */}
      <div className="form-navigation">

        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`)}>
          <ArrowLeft size={15} /> Metab Helper Form
        </button>

        {!isSubmitted && (
          <button type="button" className="btn btn-save btn-outline-blue"
            onClick={handleSaveDraft}>
            <Save size={15} /> Save
          </button>
        )}

        {!isSubmitted && (
          <button type="button" className="btn btn-draft"
            onClick={async () => {
              await handleSaveDraft();
              setMessage("Draft saved — return any time to complete");
            }}>
            <Save size={15} /> Save for Later
          </button>
        )}

        {isSubmitted && (
          <div className="rcn-locked-badge"><Lock size={13} /> Form Locked</div>
        )}

        <div className="footer-step-indicator">
          <span className="step-text">STEP 6 OF 17</span>
          <div className="step-progress-line">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="progress-segment active" />
            ))}
          </div>
        </div>

        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Form G <ArrowRight size={15} />
        </button>

      </div>
    </>
  );
}
