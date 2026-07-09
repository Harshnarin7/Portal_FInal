import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/Tables.css";
import "./styles/FormI.css";
import { usePatient } from "./context/PatientContext";
import FormLayout from "./components/FormLayout";

import { useFormProgress } from "./context/FormProgressContext";
import { toDateOnlyValue } from "./utils/datetime";
export default function FormI() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const [formData, setFormData] = useState({
    enrollment_id: "",
    gestation_days: "",
gestation_at_birth: "",
    gestation_weeks: "",
    birth_weight: "",
    dob: "",

   

    screenings: Array.from({ length: 12 }, (_, i) => ({
      screening_no: i + 1,
      date: "",
      dol: "",
      pma: "",
      re_stage: "",
      re_zone: "",
      le_stage: "",
      le_zone: "",
      plus_status: "",
      next_review: "",
      signature: "",
    })),

    worst_stage: "",
    worst_zone: "",
    plus_disease: "",
    a_rop: "",

    treatment_required: "",
    treatment_type: [],
    anti_vegf_agent: "",
    treatment_re_date: "",
    treatment_le_date: "",
    bilateral_treatment: "",
    pma_at_treatment: "",

    outcome: "",
    outcome_other_text: "",
    final_screening_date: "",
    pma_discharge: "",
    rop_treatment_composite: "",

    completed_by: "",
    designation: "",
    
    completion_date: "",
  });

  /* ================= LOAD ENROLLMENT ID ================= */
  useEffect(() => {
  const id =
    patientData?.enrollment_id ||
    location.state?.enrollmentId ||
    localStorage.getItem("current_enrollment_id") ||
    localStorage.getItem("enrollment_id") ||
    "";

  setFormData((p) => ({
    ...p,
    enrollment_id: id,
  }));
  if (id && (!patientData?.gestation_weeks || !patientData?.gestation_days)) {
    api.get(`/birth-resuscitation/${id}`).then(res => {
      const b = res.data || {};
      const weeks = b.gestation_weeks ?? "";
      const days = b.gestation_days ?? "";
      setFormData(p => ({
        ...p,
        dob: b.date_of_birth || p.dob,
        birth_weight: b.birth_weight || p.birth_weight,
        gestation_weeks: weeks,
        gestation_days: days,
        gestation_at_birth: weeks !== "" && days !== "" ? `${weeks} weeks ${days} days` : p.gestation_at_birth,
      }));
    }).catch(() => {});
  }
}, [patientData, location.state]);

  useEffect(() => {
  if (!patientData) return;

  const weeks = patientData.gestation_weeks || "";
  const days = patientData.gestation_days || "";

  const gestationFormatted =
    weeks !== "" && days !== ""
      ? `${weeks} weeks ${days} days`
      : "";

  setFormData((prev) => ({
    ...prev,
    dob: patientData.dob || "",
    gestation_weeks: weeks,
    gestation_days: days,
    gestation_at_birth: gestationFormatted,
    birth_weight: patientData.birth_weight || "",
  }));
}, [patientData]);




  /* ================= HANDLERS ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(p => ({ ...p, [name]: value }));
  };
  const gestationalAgeDisplay = formData.gestation_at_birth || "";
  const handleScreeningChange = (index, field, value) => {

  const updated = [...formData.screenings];

  updated[index][field] = value;

  if (field === "date") {
    const { dol, pma } = calculateDOLandPMA(
      formData.dob,
      value,
      formData.gestation_weeks,
      formData.gestation_days
    );

    updated[index].dol = dol;
    updated[index].pma = pma;
  }

  setFormData(prev => ({
    ...prev,
    screenings: updated
  }));
};
  
  const calculateDOLandPMA = (dob, screeningDate, gaWeeks, gaDays) => {
  if (!dob || !screeningDate) {
    return { dol: "", pma: "" };
  }

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
    pma: `${pmaWeeks}w ${pmaRemainingDays}d`
  };
};

const calculatePMA = (dob, eventDate, gaWeeks, gaDays) => {
  if (!dob || !eventDate) return "";

  const dobDate = new Date(dob + "T00:00:00");
  const event = new Date(eventDate + "T00:00:00");

  if (isNaN(dobDate) || isNaN(event)) return "";

  const diffDays = Math.floor((event - dobDate) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "";

  const birthDays =
    (Number(gaWeeks) || 0) * 7 + (Number(gaDays) || 0);

  const totalDays = birthDays + diffDays;

  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;

  return `${weeks}w ${days}d`;
};

useEffect(() => {
  if (
    formData.treatment_re_date ||
    formData.treatment_le_date
  ) {
    const date =
      formData.treatment_re_date || formData.treatment_le_date;

    const pma = calculatePMA(
      formData.dob,
      date,
      formData.gestation_weeks,
      formData.gestation_days
    );

    setFormData(prev => ({
      ...prev,
      pma_at_treatment: pma
    }));
  }
}, [
  formData.treatment_re_date,
  formData.treatment_le_date,
  formData.dob,
  formData.gestation_weeks,
  formData.gestation_days
]);

useEffect(() => {
  if (formData.final_screening_date) {
    const pma = calculatePMA(
      formData.dob,
      formData.final_screening_date,
      formData.gestation_weeks,
      formData.gestation_days
    );

    setFormData(prev => ({
      ...prev,
      pma_discharge: pma
    }));
  }
}, [
  formData.final_screening_date,
  formData.dob,
  formData.gestation_weeks,
  formData.gestation_days
]);
const handleCheckbox = (field, value) => {
  setFormData(prev => ({
    ...prev,
    [field]: prev[field].includes(value)
      ? prev[field].filter(v => v !== value)
      : [...prev[field], value]
  }));
};   

const nurses = [
  "Geetika",
        "Navkiran Kaur",
        "Priyanka Thakur",
        "Seemran Kaur",
        "Tanvi Saini",
        "Yashvi Jolly",
        "Mannat Guliani",
        "Shalini Dhiman"
];

const getDesignation = (name) => {
  if (name === "Mannat Guliani") {
    return "Project Research Scientist III (Medical)";
  }
  if (name === "Shalini Dhiman") {
    return "Project Research Scientist III (Non-Medical)";
  }
  return name ? "Project Nurse III" : "";
};

const handleCompletedByChange = (e) => {
  const name = e.target.value;

  setFormData((prev) => ({
    ...prev,
    completed_by: name,
    designation: getDesignation(name)
  }));
};
/* ================= SUBMIT ================= */
const handleSubmit = async (e) => {
  e.preventDefault();

  // ---------- helpers ----------
  const clean = (v) => (v === "" || v === undefined ? null : v);

  const yesNoToBool = (v) => {
    if (v === "Yes") return true;
    if (v === "No") return false;
    return null;
  };

  const num = (v) => {
    if (v === "" || v === undefined || v === null) return null;
    return Number(v);
  };

  // ---------- build payload ----------
  const payload = {
    enrollment_id: formData.enrollment_id,

    gestation_weeks: num(formData.gestation_weeks),
    birth_weight: num(formData.birth_weight),
    dob: clean(formData.dob),

    risk_factors: formData.risk_factors || [],

    screenings: (formData.screenings || [])
  .filter(
    (s) =>
      s.date ||
      s.re_stage ||
      s.le_stage ||
      s.re_zone ||
      s.le_zone ||
      s.plus_status
  )
  .map((s) => ({
    screening_no: s.screening_no,
    date: clean(s.date),
    dol: num(s.dol),
    pma: clean(s.pma),
    re_stage: clean(s.re_stage),
    re_zone: clean(s.re_zone),
    le_stage: clean(s.le_stage),
    le_zone: clean(s.le_zone),
    plus_status: clean(s.plus_status),
    next_review: clean(s.next_review),
    signature: clean(s.signature),
  })),

    worst_stage: clean(formData.worst_stage),
    worst_zone: clean(formData.worst_zone),
    plus_disease: yesNoToBool(formData.plus_disease),
    a_rop: yesNoToBool(formData.a_rop),

    treatment_required: yesNoToBool(formData.treatment_required),
    treatment_type: formData.treatment_type || [],
    anti_vegf_agent: clean(formData.anti_vegf_agent),
    treatment_re_date: clean(formData.treatment_re_date),
    treatment_le_date: clean(formData.treatment_le_date),
    bilateral_treatment: yesNoToBool(formData.bilateral_treatment),
    pma_at_treatment: clean(formData.pma_at_treatment),

    outcome: clean(formData.outcome),
    final_screening_date: clean(formData.final_screening_date),
    pma_discharge: clean(formData.pma_discharge),
    rop_treatment_composite: yesNoToBool(formData.rop_treatment_composite),

    completed_by: clean(formData.completed_by),
    designation: clean(formData.designation),
    signature: clean(formData.completed_by),
    
    completion_date: clean(formData.completion_date),
  };

  // ---------- submit ----------
  try {
    await api.post("/rop-screening/", payload);
   markFormCompleted("form_i");
    alert("✅ Form I submitted successfully");
   markFormCompleted("form_i");
    navigate(`/fio2-auc/${formData.enrollment_id}`);
  } catch (err) {
    console.error("❌ Form I submission error:", err.response?.data);
    alert(
      "Error submitting Form I:\n" +
      JSON.stringify(err.response?.data, null, 2)
    );
  }
};


  return (
    
    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main"><h2>
        Form J — Retinopathy of Prematurity (ROP) Screening Record
      </h2>
      <span className="form-a-subtitle">
      (Based on RBSK/NNF India &amp; ICROP 3rd Edition Guidelines)
    </span></div></div>

      {/* ================= IDENTIFICATION ================= */}
      <div className="form-section soft-blue">
        <h3>IDENTIFICATION</h3>

        <div className="form-row">
          <div className="form-group">
            <label>Enrollment ID</label>
            <input name="enrollment_id" value={formData.enrollment_id} readOnly />
          </div>
          <div className="form-group">
            <label>Date of Birth</label>
            <input
  type="date"
  name="dob"
  value={formData.dob}readOnly
  onChange={handleChange}
  max={toDateOnlyValue(new Date())}
/>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
  <label>Gestation Age</label>
  <input
    type="text"
    value={gestationalAgeDisplay}
    readOnly
  />
</div>
          <div className="form-group">
            <label>Birth Weight (g)</label>
            <input type="number" name="birth_weight" value={formData.birth_weight} onChange={handleChange}readOnly/>
          </div>
        </div>
      </div>

     <div className="rop-guideline-wrapper">

  <div className="rop-guideline-card">

    <h4>Eligibility (RBSK / NNF India)</h4>

    <ul>
      <li>GA ≤34 weeks OR BW ≤2000 g</li>
      <li>34–36 weeks / 1750–2000 g with risk factors</li>
    </ul>

    <p className="guideline-sub">
      <strong>Risk factors:</strong> O₂ therapy, sepsis, IVH, RDS,
      transfusions, poor weight gain
    </p>

  </div>


  <div className="rop-guideline-card">

    <h4>First Screening</h4>

    <ul>
      <li>GA &lt;28 weeks: at 2–3 weeks of life</li>
      <li>GA ≥28 weeks: at 4 weeks / 30 days of life</li>
    </ul>

    <p>OR 31 weeks PMA, whichever is later</p>

    <p className="guideline-sub">
      <strong>Never later than 30 days of life</strong>
    </p>

  </div>

</div>

      {/* ================= ROP SCREENING VISITS ================= */}
<h3 className="section-title">ROP Screening</h3>

<div className="rop-panel">
  <div className="rop-scroll">
    <table className="rop-table">
      <thead>
  <tr>
    <th rowSpan="2" className="th-neutral">#</th>
    <th rowSpan="2" className="th-neutral">Date</th>
    <th rowSpan="2" className="th-neutral">DOL</th>
    <th rowSpan="2" className="th-neutral">PMA</th>

    <th colSpan="2" className="th-re">Right Eye</th>
    <th colSpan="2" className="th-le">Left Eye</th>

    <th rowSpan="2" className="th-warning">Plus / A-ROP</th>
    <th rowSpan="2" className="th-info">Next Review</th>
    <th rowSpan="2" className="th-neutral">Sign</th>
  </tr>

  <tr>
    <th className="th-re-sub">Stage</th>
    <th className="th-re-sub">Zone</th>
    <th className="th-le-sub">Stage</th>
    <th className="th-le-sub">Zone</th>
  </tr>
</thead>


      <tbody>
        {formData.screenings.map((s, i) => (
          <tr key={i}>
            <td>{s.screening_no}</td>
            <td><input type="date" value={s.date} onChange={e => handleScreeningChange(i,"date",e.target.value)} /></td>
            <td><input className="xs" value={s.dol} onChange={e => handleScreeningChange(i,"dol",e.target.value)}readOnly /></td>
            <td><input className="xs" value={s.pma} onChange={e => handleScreeningChange(i,"pma",e.target.value)} readOnly/></td>

            <td><select className="xs" value={s.re_stage} onChange={e => handleScreeningChange(i,"re_stage",e.target.value)}>
              <option></option><option>0</option><option>1</option><option>2</option><option>3</option><option>4A</option><option>4B</option><option>5</option>
            </select></td>

            <td><select className="xs" value={s.re_zone} onChange={e => handleScreeningChange(i,"re_zone",e.target.value)}>
              <option></option><option>I</option><option>II</option><option>III</option>
            </select></td>

            <td><select className="xs" value={s.le_stage} onChange={e => handleScreeningChange(i,"le_stage",e.target.value)}>
              <option></option><option>0</option><option>1</option><option>2</option><option>3</option><option>4A</option><option>4B</option><option>5</option>
            </select></td>

            <td><select className="xs" value={s.le_zone} onChange={e => handleScreeningChange(i,"le_zone",e.target.value)}>
              <option></option><option>I</option><option>II</option><option>III</option>
            </select></td>

            <td>
              <select className="sm" value={s.plus_status} onChange={e => handleScreeningChange(i,"plus_status",e.target.value)}>
                <option></option>
                <option>None</option>
                <option>Plus</option>
                <option>A-ROP</option>
              </select>
            </td>

            <td><input className="sm" value={s.next_review} onChange={e => handleScreeningChange(i,"next_review",e.target.value)} /></td>
            <td><input className="sm" value={s.signature} onChange={e => handleScreeningChange(i,"signature",e.target.value)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

<div className="icrop-section">

  <div className="icrop-header">
    ICROP 3rd Edition Classification (2021)
  </div>

  <div className="icrop-grid">

    {/* STAGES */}
    <div className="icrop-card">
      <h4>Stages</h4>
      <p><b>0:</b> Immature vascularization, no ROP</p>
      <p><b>1:</b> Demarcation line</p>
      <p><b>2:</b> Ridge</p>
      <p><b>3:</b> Ridge with extra retinal tissue</p>
      <p><b>4:</b> Partial retinal detachment (4A: fovea attached, 4B: fovea detached)</p>
      <p><b>5:</b> Total retinal detachment</p>
    </div>

    {/* ZONES */}
    <div className="icrop-card">
      <h4>Zones</h4>
      <p><b>Zone I:</b> Circle centered on disc, radius = 2× disc-fovea distance</p>
      <p><b>Zone II:</b> From edge of Zone I to ora serrata nasally</p>
      <p><b>Zone III:</b> Residual temporal crescent</p>

      <p><b>Plus Disease:</b> ≥2 quadrants of vascular tortuosity/dilatation</p>

      <p><b>A-ROP:</b> Aggressive ROP (formerly AP-ROP)</p>
    </div>

    {/* FOLLOW UP */}
    <div className="icrop-card icrop-follow">
      <h4>Follow-up Schedule (Based on Findings)</h4>

      <ul>
        <li>Immature retina / No ROP: 2 weeks</li>
        <li>Stage 1 or 2 in Zone III: 2 weeks</li>
        <li>Stage 1 in Zone II: 1–2 weeks</li>
        <li>Stage 2 in Zone II / Stage 1–2 in Zone I: 1 week or less</li>
        <li>Stage 3 / Plus disease / A-ROP: Treatment within 48–72 hours</li>
        <li>Continue screening until retina fully vascularized OR Zone III reached without prior Zone I/II ROP OR 45 weeks PMA</li>
      </ul>
    </div>

  </div>

</div>


  {/* ================= TREATMENT & OUTCOME SUMMARY ================= */}
  <div style={{ marginTop: "20px" }}>

<div className="form-section soft-yellow">
  <h3>Treatment & Outcome Summary</h3>

 <div className="pn-adverse-card rop-summary-card">

<div className="rop-summary-top">

{/* WORST STAGE */}
<div className="rop-stage-block">

<label className="summary-title">Worst ROP Stage</label>

<div className="stage-pill-group">

{["None","1","2","3","4A","4B","5"].map(stage => (

<label
key={stage}
className={`stage-pill ${formData.worst_stage === stage ? "active" : ""}`}
>

<input
type="radio"
name="worst_stage"
value={stage}
checked={formData.worst_stage === stage}
onChange={handleChange}
/>

{stage}

</label>

))}

</div>

</div>


{/* PLUS DISEASE */}

<div className="rop-dropdown">

<label>Plus Disease</label>

<select
name="plus_disease"
value={formData.plus_disease}
onChange={handleChange}
>

<option value="">Select</option>
<option>Yes</option>
<option>No</option>

</select>

</div>


{/* AROP */}

<div className="rop-dropdown">

<label>A-ROP</label>

<select
name="a_rop"
value={formData.a_rop}
onChange={handleChange}
>

<option value="">Select</option>
<option>Yes</option>
<option>No</option>

</select>

</div>

</div>

</div>


  {/* Worst Zone */}
  {formData.worst_stage !== "None" && (
    <div className="pn-adverse-card">

      <h4>Worst Zone</h4>

      <div className="pn-checkbox-grid">
        {["Zone I","Zone II","Zone III"].map(zone => (
          <label className="checkbox-item" key={zone}>
            <input
              type="radio"
              name="worst_zone"
              value={zone}
              checked={formData.worst_zone === zone}
              onChange={handleChange}
            />
            {zone}
          </label>
        ))}
      </div>

    </div>
  )}


  {/* Treatment Required */}
  <div className="pn-adverse-card">
    <div className="form-group">

      <label>Treatment Required</label>

      <select
        name="treatment_required"
        value={formData.treatment_required}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>

    </div>
  </div>


  {/* Treatment Details */}
  {formData.treatment_required === "Yes" && (
    <div className="pn-adverse-card">

      <div className="form-row">

        <div className="form-group">
          <label>Treatment Date (RE)</label>
          <input
  type="date"
  name="treatment_re_date"
  value={formData.treatment_re_date}
  onChange={handleChange}
  max={toDateOnlyValue(new Date())}
/>
        </div>

        <div className="form-group">
          <label>Treatment Date (LE)</label>
         <input
  type="date"
  name="treatment_le_date"
  value={formData.treatment_le_date}
  onChange={handleChange}
  max={toDateOnlyValue(new Date())}
/>
        </div>

      </div>


      <h4>Treatment Type</h4>

      <div className="pn-checkbox-grid">

        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={formData.treatment_type.includes("Laser")}
            onChange={() => handleCheckbox("treatment_type","Laser")}
          />
          Laser photocoagulation
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={formData.treatment_type.includes("Anti-VEGF")}
            onChange={() => handleCheckbox("treatment_type","Anti-VEGF")}
          />
          Anti-VEGF
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={formData.treatment_type.includes("Vitrectomy")}
            onChange={() => handleCheckbox("treatment_type","Vitrectomy")}
          />
          Vitrectomy
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={formData.treatment_type.includes("Combination")}
            onChange={() => handleCheckbox("treatment_type","Combination")}
          />
          Combination
        </label>

      </div>


      {formData.treatment_type.includes("Anti-VEGF") && (
        <div className="form-group other-specify">
          <label>Agent</label>
          <input
  name="anti_vegf_agent"
  value={formData.anti_vegf_agent}
  placeholder="e.g. Bevacizumab"
  pattern="[A-Za-z\s]+"
  title="Only letters allowed"
  onChange={(e) => {
    const value = e.target.value;

    // allow only letters and spaces
    if (/^[A-Za-z\s]*$/.test(value)) {
      setFormData(prev => ({
        ...prev,
        anti_vegf_agent: value
      }));
    }
  }}
/>
        </div>
      )}

      <div style={{ marginTop: "20px" }}>
      <div className="form-row">

        <div className="form-group">
          <label>Bilateral Treatment</label>
          <select
            name="bilateral_treatment"
            value={formData.bilateral_treatment}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </div>

        <div className="form-group">
          <label>PMA at Treatment</label>
          <input
  name="pma_at_treatment"
  value={formData.pma_at_treatment || ""}
  readOnly
/>
        </div>

      </div>

    </div></div>
  )}


  {/* Outcome */}
  <div className="pn-adverse-card">

    <div className="form-group">

      <label>Outcome</label>

      <select
        name="outcome"
        value={formData.outcome}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option>Regressed</option>
        <option>Regressing</option>
        <option>Progressed</option>
        <option>Retinal detachment</option>
        <option>Other</option>
      </select>

    </div>


    {formData.outcome === "Other" && (
      <div className="form-group other-specify">
        <label>Specify Outcome</label>
        <input
  name="outcome_other_text"
  value={formData.outcome_other_text}
  onChange={(e) => {
    const value = e.target.value;

    // allow only letters and spaces
    if (/^[A-Za-z\s]*$/.test(value)) {
      setFormData(prev => ({
        ...prev,
        outcome_other_text: value
      }));
    }
  }}
  placeholder="Specify outcome"
/>
      </div>
    )}

  </div>


  {/* Final Screening */}
  <div className="pn-adverse-card">

    <div className="form-row">

      <div className="form-group">
        <label>Final Screening Date</label>
        <input
  type="date"
  name="final_screening_date"
  value={formData.final_screening_date}
  onChange={handleChange}
  max={toDateOnlyValue(new Date())}
/>
      </div>

      <div className="form-group">
        <label>PMA at Discharge</label>
        <input
  name="pma_discharge"
  value={formData.pma_discharge || ""}
  readOnly
/>
      </div>

    </div>

  </div>


  {/* Composite Outcome */}
  <div className="pn-adverse-card">

    <div className="form-group">

      <label>ROP requiring treatment (Composite Outcome)</label>

      <select
        name="rop_treatment_composite"
        value={formData.rop_treatment_composite}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>

    </div>

  </div>
</div>
</div>

      {/* ================= COMPLETION ================= */}
      <div style={{ marginTop: "20px" }}>
      <div className="form-section soft-blue">
  <h3>Completion Details</h3>

  <div className="form-row">
    <div className="form-group">
      <label>Completed by<span className="required">*</span></label>
      <select
        name="completed_by"
        value={formData.completed_by || ""}
        onChange={handleCompletedByChange}
        required
      >
        <option value="">-- Select Nurse --</option>
        {nurses.map((nurse) => (
          <option key={nurse} value={nurse}>
            {nurse}
          </option>
        ))}
      </select>
    </div>

    <div className="form-group">
      <label>Designation<span className="required">*</span></label>
      <input
        name="designation"
        value={formData.designation || ""}
        readOnly
        placeholder="Auto-filled"
      />
    </div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>Date</label>
      <input
        type="date"
        name="completion_date"
        value={formData.completion_date || ""}
        onChange={handleChange}
      />
    </div>
  </div>
</div></div>

      <button className="submit-btn" type="submit">
        Save & Continue
      </button>
    </form>
    
  );
}
