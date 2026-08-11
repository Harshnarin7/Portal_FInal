import React, { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/FormG.css";
import { usePatient } from "./context/PatientContext";
import {
  Eye, Info, Calendar, FileText, ShieldAlert, CheckSquare,
  ArrowLeft, ArrowRight, Save,
} from "lucide-react";

import { useFormProgress } from "./context/FormProgressContext";
import { toDateOnlyValue } from "./utils/datetime";

/* ══════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════ */
const STAGES = ["None", "1", "2", "3", "4A", "4B", "5"];
const ZONES = ["I", "II", "III"];
const METHODS = ["IDO", "RetCam", "Other"];
const TREATMENT_TYPES = [
  { key: "Laser", label: "Laser photocoagulation" },
  { key: "Anti-VEGF", label: "Anti-VEGF with Agent" },
  { key: "Vitrectomy", label: "Vitrectomy" },
  { key: "Combination", label: "Combination" },
];

const NURSES = [
  "Geetika", "Navkiran Kaur", "Priyanka Thakur", "Seemran Kaur",
  "Tanvi Saini", "Yashvi Jolly", "Mannat Guliani", "Shalini Dhiman",
];
const getDesignation = (name) => {
  if (name === "Mannat Guliani") return "Project Research Scientist III (Medical)";
  if (name === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
  return name ? "Project Nurse III" : "";
};

const emptyScreening = (i) => ({
  screening_no: i + 1,
  date: "",
  dol: "",
  pma: "",
  method: "",
  re_stage: "",
  re_zone: "",
  le_stage: "",
  le_zone: "",
  plus_status: "",
  next_review: "",
  signature: "",
});

/* ══════════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════════ */
const yesNoToBool = (v) => (v === "Yes" ? true : v === "No" ? false : null);
const boolToYesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "");
const clean = (v) => (v === "" || v === undefined ? null : v);
const num = (v) => (v === "" || v === undefined || v === null ? null : Number(v));

function calculateDOLandPMA(dob, screeningDate, gaWeeks, gaDays) {
  if (!dob || !screeningDate) return { dol: "", pma: "" };
  const dobDate = new Date(dob);
  const screenDate = new Date(screeningDate);
  const diffTime = screenDate - dobDate;
  const dol = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weeks = Number(gaWeeks) || 0;
  const days = Number(gaDays) || 0;
  const gaBirthDays = weeks * 7 + days;
  const pmaDays = gaBirthDays + dol;
  const pmaWeeks = Math.floor(pmaDays / 7);
  const pmaRemainingDays = pmaDays % 7;
  return {
    dol: dol >= 0 ? dol : "",
    pma: `${pmaWeeks}w ${pmaRemainingDays}d`,
  };
}

function calculatePMA(dob, eventDate, gaWeeks, gaDays) {
  if (!dob || !eventDate) return "";
  const dobDate = new Date(dob + "T00:00:00");
  const event = new Date(eventDate + "T00:00:00");
  if (isNaN(dobDate) || isNaN(event)) return "";
  const diffDays = Math.floor((event - dobDate) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "";
  const birthDays = (Number(gaWeeks) || 0) * 7 + (Number(gaDays) || 0);
  const totalDays = birthDays + diffDays;
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return `${weeks}w ${days}d`;
}

/* ══════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════ */
function YNToggle({ label, value, onChange, disabled = false, required = false }) {
  return (
    <div className="rop-field-row">
      <span className="rop-field-label">
        {label}{required && <span className="rop-req"> *</span>}
      </span>
      <div className="rop-yn">
        <button type="button" className={`rop-yn-btn${value === "Yes" ? " is-yes" : ""}`}
          onClick={() => !disabled && onChange(value === "Yes" ? "" : "Yes")} disabled={disabled}>Yes</button>
        <button type="button" className={`rop-yn-btn${value === "No" ? " is-no" : ""}`}
          onClick={() => !disabled && onChange(value === "No" ? "" : "No")} disabled={disabled}>No</button>
      </div>
    </div>
  );
}

function StagePills({ value, onChange }) {
  return (
    <div className="rop-stage-pills">
      {STAGES.map((s) => (
        <button
          key={s} type="button"
          className={`rop-stage-pill${s === "None" ? " rop-stage-pill--none" : ""}${["4A", "4B", "5"].includes(s) ? " rop-stage-pill--severe" : ""}${value === s ? " is-on" : ""}`}
          onClick={() => onChange(s)}
        >{s}</button>
      ))}
    </div>
  );
}

function ZonePills({ value, onChange }) {
  return (
    <div className="rop-zone-pills">
      {ZONES.map((z) => (
        <button key={z} type="button"
          className={`rop-zone-pill${value === z ? " is-on" : ""}`}
          onClick={() => onChange(z)}
        >Zone {z}</button>
      ))}
    </div>
  );
}

/* ── Peer eye-summary panel (RIGHT 1-8 / LEFT 9-16) — always visible ── */
function EyePanel({
  side, offset, formData, onField, onCheckbox,
  stageField, plusField, aropField, zoneField,
  reqField, dateField, pmaField, typeField, agentField,
}) {
  const treatmentRequired = formData[reqField] === "Yes";
  const typeList = formData[typeField] || [];

  return (
    <div className={`rop-eye-panel rop-eye-panel--${side.toLowerCase()}`}>
      <span className={`rop-eye-badge rop-eye-badge--${side.toLowerCase()}`}>{side}</span>

      <div className="rop-field-block">
        <span className="rop-field-label">{offset + 1}. Max ROP</span>
        <StagePills value={formData[stageField]} onChange={(v) => onField(stageField, v)} />
      </div>

      <YNToggle label={`${offset + 2}. Plus Disease`} value={formData[plusField]} onChange={(v) => onField(plusField, v)} />
      <YNToggle label={`${offset + 3}. A-ROP`} value={formData[aropField]} onChange={(v) => onField(aropField, v)} />

      <div className="rop-field-block">
        <span className="rop-field-label">{offset + 4}. Max Zone</span>
        <ZonePills value={formData[zoneField]} onChange={(v) => onField(zoneField, v)} />
      </div>

      <YNToggle label={`${offset + 5}. Treatment Required`} value={formData[reqField]} onChange={(v) => onField(reqField, v)} />

      {treatmentRequired && (
        <div className="rop-treatment-block">
          <div className="rop-treatment-row2">
            <div className="rop-field">
              <label className="rop-label">{offset + 6}. Treatment Date</label>
              <input type="date" className="rop-input" value={formData[dateField] || ""}
                onChange={(e) => onField(dateField, e.target.value)}
                max={toDateOnlyValue(new Date())} />
            </div>
            <div className="rop-field">
              <label className="rop-label">{offset + 7}. PMA at Treatment <span className="rop-auto-tag">AUTO</span></label>
              <input className="rop-input" value={formData[pmaField] || ""} readOnly placeholder="—" />
            </div>
          </div>

          <div className="rop-field-block">
            <span className="rop-field-label">{offset + 8}. Treatment Type</span>
            <div className="rop-checkbox-grid">
              {TREATMENT_TYPES.map(({ key, label }) => (
                <label key={key} className={`rop-checkbox-item${typeList.includes(key) ? " rop-checkbox-item--on" : ""}`}>
                  <input type="checkbox" checked={typeList.includes(key)} onChange={() => onCheckbox(typeField, key)} />
                  {label}
                </label>
              ))}
            </div>
            {typeList.includes("Anti-VEGF") && (
              <div className="rop-field" style={{ marginTop: 4 }}>
                <label className="rop-label">Anti-VEGF Agent</label>
                <input
                  className="rop-input"
                  value={formData[agentField] || ""}
                  placeholder="e.g. Bevacizumab"
                  pattern="[A-Za-z\s]+"
                  title="Only letters allowed"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^[A-Za-z\s]*$/.test(v)) onField(agentField, v);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function FormG() {
  const { enrollmentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const [message, setMessage] = useState("");

  const [formData, setFormData] = useState({
    enrollment_id: "",
    gestation_weeks: "",
    gestation_days: "",
    gestation_at_birth: "",
    birth_weight: "",
    dob: "",

    screenings: Array.from({ length: 12 }, (_, i) => emptyScreening(i)),

    // RIGHT EYE (CRF items 1-8)
    worst_stage: "",
    worst_zone: "",
    plus_disease: "",
    a_rop: "",
    treatment_required: "",
    treatment_re_date: "",
    pma_at_treatment_re: "",
    treatment_type: [],
    anti_vegf_agent: "",

    // LEFT EYE (CRF items 9-16) — independent of RIGHT
    worst_stage_le: "",
    worst_zone_le: "",
    plus_disease_le: "",
    a_rop_le: "",
    treatment_required_le: "",
    treatment_le_date: "",
    pma_at_treatment_le: "",
    treatment_type_le: [],
    anti_vegf_agent_le: "",

    // COMMON (CRF items 17-20)
    outcome: "",
    outcome_other_text: "",
    rop_treatment_composite: "",
    final_screening_date: "",
    pma_discharge: "",

    completed_by: "",
    designation: "",
    completion_date: "",
  });

  /* ================= LOAD ENROLLMENT ID + HEADER (Form B) ================= */
  useEffect(() => {
    const id =
      enrollmentId ||
      patientData?.enrollment_id ||
      location.state?.enrollmentId ||
      localStorage.getItem("current_enrollment_id") ||
      localStorage.getItem("enrollment_id") ||
      "";

    setFormData((p) => ({ ...p, enrollment_id: id }));

    if (id) {
      api.get(`/birth-resuscitation/${id}`).then((res) => {
        const b = res.data || {};
        const weeks = b.gestation_weeks ?? "";
        const days = b.gestation_days ?? "";
        setFormData((p) => ({
          ...p,
          dob: b.date_of_birth || p.dob,
          birth_weight: b.birth_weight ?? p.birth_weight,
          gestation_weeks: weeks,
          gestation_days: days,
          gestation_at_birth: weeks !== "" && days !== "" ? `${weeks} weeks ${days} days` : p.gestation_at_birth,
        }));
      }).catch(() => {});
    }
  }, [enrollmentId, patientData, location.state]);

  /* ================= LOAD EXISTING ROP RECORD ================= */
  useEffect(() => {
    if (!formData.enrollment_id) return;
    api.get(`/rop-screening/${formData.enrollment_id}`).then((res) => {
      const d = res.data || {};

      const loadedScreenings = Array.from({ length: 12 }, (_, i) => {
        const src = (d.screenings || []).find((s) => Number(s.screening_no) === i + 1) || (d.screenings || [])[i];
        if (!src) return emptyScreening(i);
        return {
          screening_no: i + 1,
          date: src.date || "",
          dol: src.dol ?? "",
          pma: src.pma || "",
          method: src.method || "",
          re_stage: src.re_stage || "",
          re_zone: src.re_zone || "",
          le_stage: src.le_stage || "",
          le_zone: src.le_zone || "",
          plus_status: src.plus_status || "",
          next_review: src.next_review || "",
          signature: src.signature || "",
        };
      });

      setFormData((p) => ({
        ...p,
        screenings: loadedScreenings,

        worst_stage: d.worst_stage || "",
        worst_zone: d.worst_zone || "",
        plus_disease: boolToYesNo(d.plus_disease),
        a_rop: boolToYesNo(d.a_rop),
        treatment_required: boolToYesNo(d.treatment_required),
        treatment_re_date: d.treatment_re_date || "",
        pma_at_treatment_re: d.pma_at_treatment_re || "",
        treatment_type: Array.isArray(d.treatment_type) ? d.treatment_type : [],
        anti_vegf_agent: d.anti_vegf_agent || "",

        worst_stage_le: d.worst_stage_le || "",
        worst_zone_le: d.worst_zone_le || "",
        plus_disease_le: boolToYesNo(d.plus_disease_le),
        a_rop_le: boolToYesNo(d.a_rop_le),
        treatment_required_le: boolToYesNo(d.treatment_required_le),
        treatment_le_date: d.treatment_le_date || "",
        pma_at_treatment_le: d.pma_at_treatment_le || "",
        treatment_type_le: Array.isArray(d.treatment_type_le) ? d.treatment_type_le : [],
        anti_vegf_agent_le: d.anti_vegf_agent_le || "",

        outcome: d.outcome || "",
        outcome_other_text: d.outcome_other_text || "",
        rop_treatment_composite: boolToYesNo(d.rop_treatment_composite),
        final_screening_date: d.final_screening_date || "",
        pma_discharge: d.pma_discharge || "",

        completed_by: d.completed_by || "",
        designation: d.designation || "",
        completion_date: d.completion_date || "",
      }));
    }).catch((err) => {
      if (err?.response?.status !== 404) {
        console.error("Failed to load ROP screening record:", err);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.enrollment_id]);

  /* ================= HANDLERS ================= */
  const setField = (name, value) => setFormData((p) => ({ ...p, [name]: value }));
  const handleChange = (e) => setField(e.target.name, e.target.value);

  const handleScreeningChange = (index, field, value) => {
    const updated = [...formData.screenings];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "date") {
      const { dol, pma } = calculateDOLandPMA(formData.dob, value, formData.gestation_weeks, formData.gestation_days);
      updated[index].dol = dol;
      updated[index].pma = pma;
    }
    setFormData((prev) => ({ ...prev, screenings: updated }));
  };

  const handleCheckbox = (field, value) => {
    setFormData((prev) => {
      const currentArray = prev[field] || [];
      return {
        ...prev,
        [field]: currentArray.includes(value)
          ? currentArray.filter((v) => v !== value)
          : [...currentArray, value],
      };
    });
  };

  const handleCompletedByChange = (e) => {
    const name = e.target.value;
    setFormData((prev) => ({ ...prev, completed_by: name, designation: getDesignation(name) }));
  };

  /* ================= AUTO PMA-AT-TREATMENT (per eye) ================= */
  useEffect(() => {
    if (!formData.treatment_re_date) return;
    const pma = calculatePMA(formData.dob, formData.treatment_re_date, formData.gestation_weeks, formData.gestation_days);
    setFormData((prev) => (prev.pma_at_treatment_re === pma ? prev : { ...prev, pma_at_treatment_re: pma }));
  }, [formData.treatment_re_date, formData.dob, formData.gestation_weeks, formData.gestation_days]);

  useEffect(() => {
    if (!formData.treatment_le_date) return;
    const pma = calculatePMA(formData.dob, formData.treatment_le_date, formData.gestation_weeks, formData.gestation_days);
    setFormData((prev) => (prev.pma_at_treatment_le === pma ? prev : { ...prev, pma_at_treatment_le: pma }));
  }, [formData.treatment_le_date, formData.dob, formData.gestation_weeks, formData.gestation_days]);

  useEffect(() => {
    if (!formData.final_screening_date) return;
    const pma = calculatePMA(formData.dob, formData.final_screening_date, formData.gestation_weeks, formData.gestation_days);
    setFormData((prev) => (prev.pma_discharge === pma ? prev : { ...prev, pma_discharge: pma }));
  }, [formData.final_screening_date, formData.dob, formData.gestation_weeks, formData.gestation_days]);

  /* ================= AUTO-CALC COMPOSITE (item 18) ================= */
  const eitherEyeTreated = formData.treatment_required === "Yes" || formData.treatment_required_le === "Yes";
  const compositeValue = eitherEyeTreated ? "Yes" : formData.rop_treatment_composite;

  useEffect(() => {
    if (eitherEyeTreated && formData.rop_treatment_composite !== "Yes") {
      setField("rop_treatment_composite", "Yes");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eitherEyeTreated]);

  /* ================= SUBMIT ================= */
  const buildPayload = () => ({
    enrollment_id: formData.enrollment_id,
    gestation_weeks: num(formData.gestation_weeks),
    birth_weight: num(formData.birth_weight),
    dob: clean(formData.dob),

    risk_factors: [],

    screenings: (formData.screenings || [])
      .filter((s) => s.date || s.re_stage || s.le_stage || s.re_zone || s.le_zone || s.plus_status || s.method)
      .map((s) => ({
        screening_no: s.screening_no,
        date: clean(s.date),
        dol: num(s.dol),
        pma: clean(s.pma),
        method: clean(s.method),
        re_stage: clean(s.re_stage),
        re_zone: clean(s.re_zone),
        le_stage: clean(s.le_stage),
        le_zone: clean(s.le_zone),
        plus_status: clean(s.plus_status),
        next_review: clean(s.next_review),
        signature: clean(s.signature),
      })),

    // RIGHT EYE
    worst_stage: clean(formData.worst_stage),
    worst_zone: clean(formData.worst_zone),
    plus_disease: yesNoToBool(formData.plus_disease),
    a_rop: yesNoToBool(formData.a_rop),
    treatment_required: yesNoToBool(formData.treatment_required),
    treatment_type: formData.treatment_type || [],
    anti_vegf_agent: clean(formData.anti_vegf_agent),
    treatment_re_date: clean(formData.treatment_re_date),
    pma_at_treatment_re: clean(formData.pma_at_treatment_re),

    // LEFT EYE — always sent, independent of RIGHT
    worst_stage_le: clean(formData.worst_stage_le),
    worst_zone_le: clean(formData.worst_zone_le),
    plus_disease_le: yesNoToBool(formData.plus_disease_le),
    a_rop_le: yesNoToBool(formData.a_rop_le),
    treatment_required_le: yesNoToBool(formData.treatment_required_le),
    treatment_type_le: formData.treatment_type_le || [],
    anti_vegf_agent_le: clean(formData.anti_vegf_agent_le),
    treatment_le_date: clean(formData.treatment_le_date),
    pma_at_treatment_le: clean(formData.pma_at_treatment_le),

    // COMMON
    outcome: clean(formData.outcome),
    outcome_other_text: clean(formData.outcome_other_text),
    rop_treatment_composite: yesNoToBool(compositeValue),
    final_screening_date: clean(formData.final_screening_date),
    pma_discharge: clean(formData.pma_discharge),

    completed_by: clean(formData.completed_by),
    designation: clean(formData.designation),
    signature: clean(formData.completed_by),
    completion_date: clean(formData.completion_date),
  });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      await api.post("/rop-screening/", buildPayload());
      markFormCompleted("form_g");
      setMessage("Form G saved successfully.");
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      console.error("Form G submission error:", err.response?.data);
      const detail = err?.response?.data?.detail || "Unknown error";
      setMessage(`Error saving Form G: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
      return false;
    }
  };

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div className="rop-page">

      {/* ══ PATIENT CONTEXT BAR ══ */}
      <div className="rop-context-bar">
        <div className="rop-context-trial">
          <div className="rop-context-trial-icon"><Eye size={17} /></div>
          <div className="rop-context-trial-info">
            <span className="rop-context-name">PORTAL Trial</span>
            <span className="rop-context-sub">Form G — ROP Screening</span>
          </div>
        </div>
        <div className="rop-context-fields">
          {[
            { label: "Enrolment ID", value: formData.enrollment_id || "—" },
            { label: "Gestation", value: formData.gestation_weeks !== "" ? `${formData.gestation_weeks} wks ${formData.gestation_days || 0} days` : "—" },
            { label: "Birth Weight", value: formData.birth_weight !== "" ? `${formData.birth_weight} g` : "—" },
            { label: "DOB", value: formData.dob || "—" },
          ].map((f, i, arr) => (
            <div key={f.label} className={`rop-context-field${i === arr.length - 1 ? " rop-context-field--last" : ""}`}>
              <span className="rop-context-field-label">{f.label}</span>
              <span className="rop-context-field-value">{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rop-body">
        <form onSubmit={handleSubmit}>

          {/* ═══ ELIGIBILITY & SCREENING GUIDELINES ═══ */}
          <div className="rop-card">
            <div className="rop-card-header">
              <div className="rop-card-header-left">
                <div className="rop-card-icon"><Info size={17} /></div>
                <div>
                  <h3 className="rop-card-title">Eligibility &amp; Screening Guidelines</h3>
                  <p className="rop-card-sub">RBSK / NNF India &amp; ICROP 3rd Edition</p>
                </div>
              </div>
            </div>
            <div className="rop-guideline-grid">
              <div className="rop-guideline-card">
                <h4>Eligibility (RBSK / NNF India)</h4>
                <ul>
                  <li>GA ≤34 weeks OR BW ≤2000 g</li>
                  <li>34–36 weeks / 1750–2000 g with risk factors</li>
                </ul>
                <p className="rop-guideline-sub">
                  <strong>Risk factors:</strong> O₂ therapy, sepsis, IVH, RDS, transfusions, poor weight gain
                </p>
              </div>
              <div className="rop-guideline-card">
                <h4>First Screening</h4>
                <ul>
                  <li>GA &lt;28 weeks: at 2–3 weeks of life</li>
                  <li>GA ≥28 weeks: at 4 weeks / 30 days of life</li>
                </ul>
                <p>OR 31 weeks PMA, whichever is later</p>
                <p className="rop-guideline-sub"><strong>Never later than 30 days of life</strong></p>
              </div>
            </div>
          </div>

          {/* ═══ G1. ROP SCREENING RECORD ═══ */}
          <div className="rop-card">
            <div className="rop-card-header">
              <div className="rop-card-header-left">
                <div className="rop-card-icon"><Calendar size={17} /></div>
                <div>
                  <h3 className="rop-card-title">G1. ROP Screening Record</h3>
                  <p className="rop-card-sub">Up to 12 screening visits with bilateral eye findings</p>
                </div>
              </div>
            </div>

            <div className="rop-table-wrap">
              <table className="rop-table">
                <colgroup>
                  <col className="rop-col-num" />
                  <col className="rop-col-date" />
                  <col className="rop-col-dol" />
                  <col className="rop-col-pma" />
                  <col className="rop-col-method" />
                  <col className="rop-col-stage" />
                  <col className="rop-col-zone" />
                  <col className="rop-col-stage" />
                  <col className="rop-col-zone" />
                  <col className="rop-col-plus" />
                  <col className="rop-col-review" />
                  <col className="rop-col-name" />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan="2">#</th>
                    <th rowSpan="2">Date</th>
                    <th rowSpan="2">DOL</th>
                    <th rowSpan="2">PMA</th>
                    <th rowSpan="2">Method</th>
                    <th colSpan="2" className="rop-th-re">Right Eye</th>
                    <th colSpan="2" className="rop-th-le">Left Eye</th>
                    <th rowSpan="2">Plus/AP</th>
                    <th rowSpan="2">Next Review</th>
                    <th rowSpan="2">Name</th>
                  </tr>
                  <tr>
                    <th className="rop-th-re">Stage</th>
                    <th className="rop-th-re">Zone</th>
                    <th className="rop-th-le">Stage</th>
                    <th className="rop-th-le">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.screenings.map((s, i) => (
                    <tr key={i}>
                      <td className="rop-table-num">{s.screening_no}</td>
                      <td>
                        <input
                          type="date"
                          className="rop-in-date"
                          value={s.date}
                          onChange={(e) => handleScreeningChange(i, "date", e.target.value)}
                        />
                      </td>
                      <td><input className="rop-in-xs" value={s.dol} readOnly tabIndex={-1} /></td>
                      <td><input className="rop-in-xs" value={s.pma} readOnly tabIndex={-1} /></td>
                      <td>
                        <select
                          className="rop-in-select"
                          value={s.method || ""}
                          onChange={(e) => handleScreeningChange(i, "method", e.target.value)}
                        >
                          <option value="">—</option>
                          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="rop-in-select"
                          value={s.re_stage || ""}
                          onChange={(e) => handleScreeningChange(i, "re_stage", e.target.value)}
                        >
                          <option value="">—</option>
                          {["0", "1", "2", "3", "4A", "4B", "5"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="rop-in-select"
                          value={s.re_zone || ""}
                          onChange={(e) => handleScreeningChange(i, "re_zone", e.target.value)}
                        >
                          <option value="">—</option>
                          {ZONES.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="rop-in-select"
                          value={s.le_stage || ""}
                          onChange={(e) => handleScreeningChange(i, "le_stage", e.target.value)}
                        >
                          <option value="">—</option>
                          {["0", "1", "2", "3", "4A", "4B", "5"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="rop-in-select"
                          value={s.le_zone || ""}
                          onChange={(e) => handleScreeningChange(i, "le_zone", e.target.value)}
                        >
                          <option value="">—</option>
                          {ZONES.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="rop-in-select"
                          value={s.plus_status || ""}
                          onChange={(e) => handleScreeningChange(i, "plus_status", e.target.value)}
                        >
                          <option value="">—</option>
                          <option value="None">None</option>
                          <option value="Plus">Plus</option>
                          <option value="A-ROP">A-ROP</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="rop-in-text"
                          value={s.next_review || ""}
                          placeholder="e.g. 1 week"
                          onChange={(e) => handleScreeningChange(i, "next_review", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="rop-in-text"
                          value={s.signature || ""}
                          placeholder="Examiner"
                          onChange={(e) => handleScreeningChange(i, "signature", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rop-table-hint">Scroll horizontally if needed to see all columns</div>
          </div>

          {/* ═══ ICROP CLASSIFICATION & FOLLOW-UP ═══ */}
          <div className="rop-card">
            <div className="rop-card-header">
              <div className="rop-card-header-left">
                <div className="rop-card-icon"><FileText size={17} /></div>
                <div>
                  <h3 className="rop-card-title">ICROP 3rd Edition Classification (2021)</h3>
                  <p className="rop-card-sub">Stages, Zones, Plus Disease &amp; Follow-up Schedule</p>
                </div>
              </div>
            </div>
            <div className="rop-icrop-grid">
              <div className="rop-icrop-card">
                <h5>Stages</h5>
                <p><b>0:</b> Immature vascularization, no ROP</p>
                <p><b>1:</b> Demarcation line</p>
                <p><b>2:</b> Ridge</p>
                <p><b>3:</b> Ridge with extra-retinal tissue</p>
                <p><b>4:</b> Partial retinal detachment (4A: fovea attached, 4B: fovea detached)</p>
                <p><b>5:</b> Total retinal detachment</p>
              </div>
              <div className="rop-icrop-card">
                <h5>Zones &amp; Plus Disease</h5>
                <p><b>Zone I:</b> Circle centered on disc, radius = 2× disc-fovea distance</p>
                <p><b>Zone II:</b> From edge of Zone I to ora serrata nasally</p>
                <p><b>Zone III:</b> Residual temporal crescent</p>
                <p><b>Plus:</b> ≥2 quadrants of vascular tortuosity/dilatation</p>
                <p><b>A-ROP:</b> Aggressive ROP (formerly AP-ROP)</p>
              </div>
              <div className="rop-icrop-card rop-icrop-card--follow">
                <h5>Follow-up Schedule</h5>
                <ul>
                  <li>Immature retina / No ROP: 2 weeks</li>
                  <li>Stage 1–2 in Zone III: 2 weeks</li>
                  <li>Stage 1 in Zone II: 1–2 weeks</li>
                  <li>Stage 2 in Zone II / Stage 1–2 in Zone I: ≤1 week</li>
                  <li>Stage 3 / Plus / A-ROP: Treat within 48–72 hrs</li>
                  <li>Continue until fully vascularized, Zone III w/o prior ROP, or 45 wks PMA</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ═══ G2. TREATMENT & OUTCOME SUMMARY ═══ */}
          <div className="rop-card">
            <div className="rop-card-header">
              <div className="rop-card-header-left">
                <div className="rop-card-icon"><ShieldAlert size={17} /></div>
                <div>
                  <h3 className="rop-card-title">G2. Treatment &amp; Outcome Summary</h3>
                  <p className="rop-card-sub">Right (items 1-8) and Left (items 9-16) recorded independently</p>
                </div>
              </div>
            </div>

            <div className="rop-eye-grid">
              <EyePanel
                side="RIGHT" offset={0} formData={formData} onField={setField} onCheckbox={handleCheckbox}
                stageField="worst_stage" plusField="plus_disease" aropField="a_rop" zoneField="worst_zone"
                reqField="treatment_required" dateField="treatment_re_date" pmaField="pma_at_treatment_re"
                typeField="treatment_type" agentField="anti_vegf_agent"
              />
              <EyePanel
                side="LEFT" offset={8} formData={formData} onField={setField} onCheckbox={handleCheckbox}
                stageField="worst_stage_le" plusField="plus_disease_le" aropField="a_rop_le" zoneField="worst_zone_le"
                reqField="treatment_required_le" dateField="treatment_le_date" pmaField="pma_at_treatment_le"
                typeField="treatment_type_le" agentField="anti_vegf_agent_le"
              />
            </div>

            <div className="rop-summary-row">
              {/* 17. Outcome */}
              <div className="rop-summary-item">
                <div className="rop-field">
                  <label className="rop-label">17. Outcome</label>
                  <select className="rop-select" name="outcome" value={formData.outcome} onChange={handleChange}>
                    <option value="">-- Select --</option>
                    <option>Regressed</option>
                    <option>Regressing</option>
                    <option>Progressed</option>
                    <option>Retinal detachment</option>
                    <option>Other</option>
                  </select>
                </div>
                {formData.outcome === "Other" && (
                  <div className="rop-field" style={{ marginTop: 10 }}>
                    <label className="rop-label">Specify Outcome</label>
                    <input
                      className="rop-input"
                      value={formData.outcome_other_text}
                      onChange={(e) => setField("outcome_other_text", e.target.value)}
                      placeholder="Specify outcome"
                    />
                  </div>
                )}
              </div>

              {/* 19 & 20. Final Screening */}
              <div className="rop-summary-item">
                <div className="rop-row2">
                  <div className="rop-field">
                    <label className="rop-label">19. Final Screening Date</label>
                    <input type="date" className="rop-input" name="final_screening_date"
                      value={formData.final_screening_date} onChange={handleChange}
                      max={toDateOnlyValue(new Date())} />
                  </div>
                  <div className="rop-field">
                    <label className="rop-label">20. PMA at Discharge from Screening <span className="rop-auto-tag">AUTO</span></label>
                    <input className="rop-input" value={formData.pma_discharge || ""} readOnly placeholder="weeks" />
                  </div>
                </div>
              </div>
            </div>

            {/* 18. Composite Outcome */}
            <div className="rop-composite-card">
              <div className="rop-composite-left">
                <ShieldAlert size={20} className="rop-composite-icon" />
                <div>
                  <h4 className="rop-composite-title">18. ROP Requiring Treatment (Composite Outcome)</h4>
                  <p className="rop-composite-desc">
                    {eitherEyeTreated
                      ? "Auto-calculated: Yes — treatment required in at least one eye"
                      : "Set manually if no treatment recorded above"}
                  </p>
                </div>
              </div>
              {eitherEyeTreated ? (
                <span className={`rop-composite-badge rop-composite-badge--yes`}>Yes</span>
              ) : (
                <div className="rop-yn">
                  <button type="button" className={`rop-yn-btn${formData.rop_treatment_composite === "Yes" ? " is-yes" : ""}`}
                    onClick={() => setField("rop_treatment_composite", formData.rop_treatment_composite === "Yes" ? "" : "Yes")}>Yes</button>
                  <button type="button" className={`rop-yn-btn${formData.rop_treatment_composite === "No" ? " is-no" : ""}`}
                    onClick={() => setField("rop_treatment_composite", formData.rop_treatment_composite === "No" ? "" : "No")}>No</button>
                </div>
              )}
            </div>
          </div>

          {/* ═══ COMPLETION ═══ */}
          <div className="rop-card">
            <div className="rop-card-header">
              <div className="rop-card-header-left">
                <div className="rop-card-icon"><CheckSquare size={17} /></div>
                <div>
                  <h3 className="rop-card-title">Form Completion</h3>
                  <p className="rop-card-sub">Verification and signature</p>
                </div>
              </div>
            </div>
            <div className="rop-completion-grid">
              <div className="rop-field">
                <label className="rop-label">Completed By <span className="rop-req">*</span></label>
                <select className="rop-select" name="completed_by" value={formData.completed_by || ""} onChange={handleCompletedByChange} required>
                  <option value="">Select…</option>
                  {NURSES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="rop-field">
                <label className="rop-label">Designation</label>
                <input className="rop-input" value={formData.designation || ""} readOnly placeholder="Auto-filled" />
              </div>
              <div className="rop-field">
                <label className="rop-label">Date</label>
                <input type="date" className="rop-input" name="completion_date" value={formData.completion_date || ""} onChange={handleChange} />
              </div>
            </div>
          </div>

          {message && (
            <div className={`rop-message${message.startsWith("Form G saved") ? " rop-message--success" : " rop-message--error"}`}>
              {message}
            </div>
          )}
        </form>
      </div>

      {/* ══ STICKY FOOTER NAVIGATION BAR ══ */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/form-f/${formData.enrollment_id}`)}>
          <ArrowLeft size={15} /> Form F
        </button>

        <button type="button" className="btn btn-save btn-outline-blue"
          onClick={(e) => { e.preventDefault(); handleSubmit(e); }}>
          <Save size={15} /> Save
        </button>

        <button type="button" className="btn btn-draft"
          onClick={async (e) => {
            e.preventDefault();
            await handleSubmit(e);
            navigate("/dashboard");
          }}>
          <Save size={15} /> Save for Later
        </button>

        <div className="footer-step-indicator">
          <span className="step-text">FORM G — ROP SCREENING</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
          </div>
        </div>

        <button type="button" className="btn btn-primary"
          onClick={async (e) => {
            e.preventDefault();
            await handleSubmit(e);
            navigate(`/form-h/${formData.enrollment_id}`);
          }}>
          Form H <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
