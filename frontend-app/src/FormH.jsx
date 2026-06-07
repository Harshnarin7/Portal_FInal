import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/Tables.css";

import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import FormLayout from "./components/FormLayout";

export default function FormH() {
  const location = useLocation();
  const navigate = useNavigate();
  const { patientData } = usePatient();
  const { markFormCompleted } = useFormProgress();
  const gestationalAgeDisplay =
  patientData.gestation_weeks !== undefined
    ? `${patientData.gestation_weeks} weeks ${patientData.gestation_days || 0} days`
    : "";

  const [formData, setFormData] = useState({
    enrollment_id: "",
    gestation_weeks: "",
    birth_weight: "",
    dob: "",

    // ================= DETAILED FINDINGS =================
worst_ivh_grade: "",
ivh_side: "",
ivh_date: "",
ivh_dol: "",
ivh_pma: "",

phvd: "",
phvd_date: "",

vp_shunt: "",
vp_shunt_date: "",

cpvl_grade: "",
cpvl_side: "",
cpvl_date: "",
cpvl_dol: "",
cpvl_pma: "",

other_findings: "",

brain_injury_composite: "",

// ================= COMPLETION =================
completed_by: "",
designation: "",
completion_date: "",
other_finding_other: false,
other_finding_other_text: "",



    scans: [
      { timing: "Day 3", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "Day 7", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "Day 14", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "Day 21", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "Day 28", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "36 wks PMA", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "40 wks PMA", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "Other", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "Other", date: "", dol: "", pma: "", findings: "", signature: "" },
      { timing: "Other", date: "", dol: "", pma: "", findings: "", signature: "" },
    ],
  });

  useEffect(() => {
  const storedId = localStorage.getItem("enrollment_id");

  if (location.state?.enrollmentId) {
    setFormData(p => ({ ...p, enrollment_id: location.state.enrollmentId }));
  } else if (storedId) {
    setFormData(p => ({ ...p, enrollment_id: storedId }));
  }
}, [location.state]);

useEffect(() => {
  if (!patientData) return;

  setFormData(prev => ({
    ...prev,
    enrollment_id: patientData.enrollment_id || "",
    gestation_weeks: patientData.gestation_weeks || "",
    gestation_days: patientData.gestation_days || "",
    birth_weight: patientData.birth_weight || "",
    dob: patientData.dob || ""
  }));
}, [patientData]);

useEffect(() => {

  const ivhSevere =
    formData.worst_ivh_grade === "Grade 3" ||
    formData.worst_ivh_grade === "Grade 4";

  const cpvlSevere =
    formData.cpvl_grade === "Grade 2" ||
    formData.cpvl_grade === "Grade 3" ||
    formData.cpvl_grade === "Grade 4";

  if (ivhSevere || cpvlSevere) {
    setFormData(prev => ({
      ...prev,
      brain_injury_composite: "Yes"
    }));
  } else {
    setFormData(prev => ({
      ...prev,
      brain_injury_composite: "No"
    }));
  }

}, [formData.worst_ivh_grade, formData.cpvl_grade]);

  const handleChange = (e) => {
  const { name, value, type, checked } = e.target;

  setFormData(prev => ({
    ...prev,
    [name]: type === "checkbox" ? checked : value
  }));
};
  
 const handleScanChange = (scanRow, field, value) => {

  const updated = formData.scans.map(scan => {

    if (scan === scanRow) {

      const newScan = { ...scan, [field]: value };

      if (field === "date") {
        const { dol, pma } = calculateDOLandPMA(
          formData.dob,
          value,
          formData.gestation_weeks,
          formData.gestation_days
        );

        newScan.dol = dol;
        newScan.pma = pma;
      }

      return newScan;
    }

    return scan;
  });

  setFormData(prev => ({
    ...prev,
    scans: updated
  }));
};
  const yesNoToBool = (v) => {
  if (v === "Yes") return true;
  if (v === "No") return false;
  return null;
};
const calculateDOLandPMA = (dob, scanDate, gaWeeks, gaDays) => {
  if (!dob || !scanDate) {
    return { dol: "", pma: "" };
  }

  const dobDate = new Date(dob);
  const scan = new Date(scanDate);

  const diffTime = scan - dobDate;
  const dol = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const weeks = Number(gaWeeks) || 0;
  const days = Number(gaDays) || 0;

  const gaBirthDays = weeks * 7 + days;

  const pmaDays = gaBirthDays + dol;

  const pmaWeeks = Math.floor(pmaDays / 7);
  const pmaRemainingDays = pmaDays % 7;

  const pma = `${pmaWeeks}w ${pmaRemainingDays}d`;

  return {
    dol: dol >= 0 ? dol : "",
    pma
  };
};

const sortedScans = [...formData.scans].sort((a, b) => {
  if (!a.date) return 1;
  if (!b.date) return -1;
  return new Date(a.date) - new Date(b.date);
});

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

const num = (v) => {
  if (v === "" || v === undefined) return null;
  return Number(v);
};

  const handleSubmit = async (e) => {
  e.preventDefault();

  const payload = {
    enrollment_id: formData.enrollment_id,
    gestation_weeks: num(formData.gestation_weeks),
    birth_weight: num(formData.birth_weight),
    dob: formData.dob || null,

    scans: formData.scans.map((s) => ({
      timing: s.timing,
      date: s.date || null,
      dol: s.dol ? Number(s.dol) : null,
      pma: s.pma || null,
      findings: s.findings || null,
      signature: s.signature || null,
    })),

    worst_ivh_grade: formData.worst_ivh_grade || null,
    ivh_side: formData.ivh_side || null,
    ivh_date: formData.ivh_date || null,
    ivh_dol: num(formData.ivh_dol),
    ivh_pma: formData.ivh_pma || null,

    phvd: yesNoToBool(formData.phvd),
    phvd_date: formData.phvd_date || null,

    vp_shunt: yesNoToBool(formData.vp_shunt),
    vp_shunt_date: formData.vp_shunt_date || null,

    cpvl_grade: formData.cpvl_grade || null,
    cpvl_side: formData.cpvl_side || null,
    cpvl_date: formData.cpvl_date || null,
    cpvl_dol: num(formData.cpvl_dol),
    cpvl_pma: formData.cpvl_pma || null,

    other_findings: formData.other_findings || null,
    brain_injury_composite: yesNoToBool(formData.brain_injury_composite),

    completed_by: formData.completed_by || null,
    designation: formData.designation || null,
    completion_date: formData.completion_date || null,
  };

  await api.post("/cranial-ultrasound/", payload);
  markFormCompleted("form_h");
  alert("✅ Form H submitted successfully");
  markFormCompleted("form_h");
 navigate(`/form-i/${formData.enrollment_id}`);
};




    return (
      
    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main"><h2>
        Form I — Cranial Ultrasonography Screening Record
      </h2>
      <span className="form-a-subtitle">
      (IVH and PVL Surveillance)
    </span>
      </div></div>

      {/* ================= IDENTIFICATION ================= */}
      <div className="form-section soft-blue">
        <h3>Identification</h3>

        <div className="form-row">
          <div className="form-group">
            <label>Enrollment ID</label>
            <input value={formData.enrollment_id || ""} readOnly />
          </div>

          <div className="form-group">
            <label>Gestation Age</label>
            <input
  type="text"
  value={gestationalAgeDisplay}
  readOnly
/>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Birth Weight (g)</label>
            <input
              type="number"
              name="birth_weight"
              value={formData.birth_weight || ""}
              onChange={handleChange} readOnly
            />
          </div>

          <div className="form-group">
            <label>Date of Birth</label>
            <input
              type="date"
              name="dob"
              value={formData.dob || ""}
              onChange={handleChange} readOnly
            />
          </div>
        </div>
      </div>

      {/* ================= SCAN SCHEDULE ================= */}
      <div className="form-section soft-green">
        <h3>Cranial Ultrasound Schedule</h3>

        <table className="usg-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Timing</th>
              <th>Date</th>
              <th>DOL</th>
              <th>PMA</th>
              <th>Findings & Grading</th>
              <th>Name</th>
            </tr>
          </thead>

          <tbody>
            {sortedScans.map((scan, index) => (
              <tr key={scan.timing + scan.date}>
                <td>{index + 1}</td>
                <td>{scan.timing}</td>

                <td>
                  <input
                    type="date"
                    value={scan.date || ""}
                    onChange={(e) =>
                      handleScanChange(scan, "date", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
  value={scan.dol || ""}
  readOnly
/>
                </td>

                <td>
                  <input
  value={scan.pma || ""}
  readOnly
/>
                </td>

                <td>
                  <input
                    value={scan.findings || ""}
                    onChange={(e) =>
                      handleScanChange(scan, "findings", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    value={scan.signature || ""}
                    onChange={(e) =>
                      handleScanChange(scan, "signature", e.target.value)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="usg-instructions">

  <div className="instruction-left">
    <div className="instruction-box">
      <h4>IVH GRADING (Papile Classification)</h4>
      <p>Grade 1: Germinal matrix hemorrhage, minimal IVH (&lt;10% ventricular area)</p>
      <p>Grade 2: IVH filling &lt;50% of ventricle</p>
      <p>Grade 3: IVH filling ≥50% of ventricle (may have ventricular dilatation)</p>
      <p>Grade 4: Parenchymal involvement / Periventricular hemorrhagic infarction (PVHI)</p>
    </div>

    <div className="instruction-box">
      <h4>cPVL GRADING (De Vries Classification)</h4>
      <p>Grade 1: Transient periventricular densities (flares) seen &gt;7 days</p>
      <p>Grade 2: Localized cysts beside external angle of lateral ventricle</p>
      <p>Grade 3: Extensive cysts in frontoparietal and occipital periventricular white matter</p>
      <p>Grade 4: Extensive cysts in subcortical white matter</p>
    </div>
  </div>

  <div className="instruction-right">
    <div className="instruction-box green">
      <h4>Schedule: &lt;28 wks and/or &lt;1000g</h4>
      <p>1st: Day 1-3</p>
      <p>2nd: Day 4-7</p>
      <p>3rd: Day 10-14</p>
      <p>4th: Day 21 (if unstable)</p>
      <p>5th: Day 28</p>
      <p>6th: 36 weeks PMA</p>
      <p>7th: 40 weeks PMA</p>
  
      <h4>Schedule: 28-31 weeks</h4>
      <p>1st: Day 4-7 (or optional Day 1-3)</p>
      <p>2nd: Day 10-14</p>
      <p>3rd: Day 28 (or if unwell)</p>
      <p>Last: 40 weeks PMA</p>
      <p><i>Additional scans if clinically indicated</i></p>
    </div>
  </div>

</div>

    {/* ================= DETAILED FINDINGS & SUMMARY ================= */}
<div className="form-section soft-yellow">

<h3>DETAILED FINDINGS & SUMMARY</h3>

{/* IVH */}
<div className="pn-adverse-card">

<div className="pn-adverse-card">

<h4>Worst IVH Grade</h4>

<div className="pn-checkbox-grid">

<label className="checkbox-item">
<input
type="radio"
name="worst_ivh_grade"
value="None"
checked={formData.worst_ivh_grade === "None"}
onChange={handleChange}
/>
None
</label>

<label className="checkbox-item">
<input
type="radio"
name="worst_ivh_grade"
value="Grade 1"
checked={formData.worst_ivh_grade === "Grade 1"}
onChange={handleChange}
/>
Grade 1
</label>

<label className="checkbox-item">
<input
type="radio"
name="worst_ivh_grade"
value="Grade 2"
checked={formData.worst_ivh_grade === "Grade 2"}
onChange={handleChange}
/>
Grade 2
</label>

<label className="checkbox-item">
<input
type="radio"
name="worst_ivh_grade"
value="Grade 3"
checked={formData.worst_ivh_grade === "Grade 3"}
onChange={handleChange}
/>
Grade 3
</label>

<label className="checkbox-item">
<input
type="radio"
name="worst_ivh_grade"
value="Grade 4"
checked={formData.worst_ivh_grade === "Grade 4"}
onChange={handleChange}
/>
Grade 4
</label>

</div>
</div>


{/* Side */}

<div className="pn-adverse-card">

<h4>Side</h4>

<div className="pn-checkbox-grid">

<label className="checkbox-item">
<input
type="radio"
name="ivh_side"
value="Right"
checked={formData.ivh_side === "Right"}
onChange={handleChange}
/>
Right
</label>

<label className="checkbox-item">
<input
type="radio"
name="ivh_side"
value="Left"
checked={formData.ivh_side === "Left"}
onChange={handleChange}
/>
Left
</label>

<label className="checkbox-item">
<input
type="radio"
name="ivh_side"
value="Bilateral"
checked={formData.ivh_side === "Bilateral"}
onChange={handleChange}
/>
Bilateral
</label>

</div>
</div>


{/* Date / DOL / PMA */}
<div style={{ marginTop: "20px" }}>
<div className="form-row">

<div className="form-group">
<label>Date of worst IVH</label>
<input
  type="date"
  name="ivh_date"
  value={formData.ivh_date || ""}
  onChange={(e) => {

    const value = e.target.value;

    const { dol, pma } = calculateDOLandPMA(
      formData.dob,
      value,
      formData.gestation_weeks,
      formData.gestation_days
    );

    setFormData(prev => ({
      ...prev,
      ivh_date: value,
      ivh_dol: dol,
      ivh_pma: pma
    }));
  }}
/>
</div>

<div className="form-group">
<label>Day of Life</label>
<input name="ivh_dol" value={formData.ivh_dol || ""} onChange={handleChange}readOnly/>
</div>

<div className="form-group">
<label>PMA (weeks)</label>
<input name="ivh_pma" value={formData.ivh_pma || ""} onChange={handleChange}readOnly/>
</div>

</div>

</div>
</div>

{/* PHVD */}
<div className="pn-adverse-card">

<div className="form-row">

<div className="form-group">
<label>Post-hemorrhagic ventricular dilatation (PHVD)</label>
<select name="phvd" value={formData.phvd || ""} onChange={handleChange}>
<option value="">-- Select --</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

<div className="form-group">
<label>Date</label>
<input type="date" name="phvd_date" value={formData.phvd_date || ""} onChange={handleChange}/>
</div>

</div>

</div>


{/* VP SHUNT */}
<div className="pn-adverse-card">

<div className="form-row">

<div className="form-group">
<label>VP Shunt / Reservoir required</label>
<select name="vp_shunt" value={formData.vp_shunt || ""} onChange={handleChange}>
<option value="">-- Select --</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

<div className="form-group">
<label>Date</label>
<input type="date" name="vp_shunt_date" value={formData.vp_shunt_date || ""} onChange={handleChange}/>
</div>

</div>

</div>


{/* cPVL */}
<div className="pn-adverse-card">
<div className="pn-adverse-card">

<h4>cPVL Grade</h4>

<div className="pn-checkbox-grid">

<label className="checkbox-item">
<input
type="radio"
name="cpvl_grade"
value="None"
checked={formData.cpvl_grade === "None"}
onChange={handleChange}
/>
None
</label>

<label className="checkbox-item">
<input
type="radio"
name="cpvl_grade"
value="Grade 1"
checked={formData.cpvl_grade === "Grade 1"}
onChange={handleChange}
/>
Grade 1
</label>

<label className="checkbox-item">
<input
type="radio"
name="cpvl_grade"
value="Grade 2"
checked={formData.cpvl_grade === "Grade 2"}
onChange={handleChange}
/>
Grade 2
</label>

<label className="checkbox-item">
<input
type="radio"
name="cpvl_grade"
value="Grade 3"
checked={formData.cpvl_grade === "Grade 3"}
onChange={handleChange}
/>
Grade 3
</label>

<label className="checkbox-item">
<input
type="radio"
name="cpvl_grade"
value="Grade 4"
checked={formData.cpvl_grade === "Grade 4"}
onChange={handleChange}
/>
Grade 4
</label>

</div>

</div>
<div className="pn-adverse-card">

<h4>Side</h4>

<div className="pn-checkbox-grid">

<label className="checkbox-item">
<input
type="radio"
name="cpvl_side"
value="Right"
checked={formData.cpvl_side === "Right"}
onChange={handleChange}
/>
Right
</label>

<label className="checkbox-item">
<input
type="radio"
name="cpvl_side"
value="Left"
checked={formData.cpvl_side === "Left"}
onChange={handleChange}
/>
Left
</label>

<label className="checkbox-item">
<input
type="radio"
name="cpvl_side"
value="Bilateral"
checked={formData.cpvl_side === "Bilateral"}
onChange={handleChange}
/>
Bilateral
</label>

</div>

</div>

<div style={{ marginTop: "20px" }}>

<div className="form-row">

<div className="form-group">
<label>Date of cPVL Diagnosis</label>
<input
type="date"
name="cpvl_date"
value={formData.cpvl_date || ""}
onChange={(e) => {

const value = e.target.value;

const { dol, pma } = calculateDOLandPMA(
formData.dob,
value,
formData.gestation_weeks,
formData.gestation_days
);

setFormData(prev => ({
...prev,
cpvl_date: value,
cpvl_dol: dol,
cpvl_pma: pma
}));

}}
/>
</div>

<div className="form-group">
<label>Day of Life</label>
<input
name="cpvl_dol"
value={formData.cpvl_dol || ""}
readOnly
/>
</div>

<div className="form-group">
<label>PMA</label>
<input
name="cpvl_pma"
value={formData.cpvl_pma || ""}
readOnly
/>
</div>

</div>

</div>

</div>
{/* Other Findings */}
<div className="pn-adverse-card">

<h4>Other Findings</h4>

<div className="pn-checkbox-grid">

<label className="checkbox-item">
<input
type="checkbox"
name="ventriculomegaly"
checked={formData.ventriculomegaly || false}
onChange={handleChange}
/>
Ventriculomegaly
</label>

<label className="checkbox-item">
<input
type="checkbox"
name="subependymal_cyst"
checked={formData.subependymal_cyst || false}
onChange={handleChange}
/>
Subependymal cyst
</label>

<label className="checkbox-item">
<input
type="checkbox"
name="choroid_cyst"
checked={formData.choroid_cyst || false}
onChange={handleChange}
/>
Choroid plexus cyst
</label>

<label className="checkbox-item">
<input
type="checkbox"
name="cerebellar_hemorrhage"
checked={formData.cerebellar_hemorrhage || false}
onChange={handleChange}
/>
Cerebellar hemorrhage
</label>

<label className="checkbox-item">
<input
type="checkbox"
name="subdural_hemorrhage"
checked={formData.subdural_hemorrhage || false}
onChange={handleChange}
/>
Subdural hemorrhage
</label>

<label className="checkbox-item">
<input
type="checkbox"
name="other_finding_other"
checked={formData.other_finding_other || false}
onChange={handleChange}
/>
Other
</label>

</div>

{formData.other_finding_other && (

<div className="form-group other-specify">

<label>Specify Other</label>

<input
name="other_finding_other_text"
value={formData.other_finding_other_text || ""}
onChange={handleChange}
/>

</div>

)}

</div>


{/* Composite Outcome */}
<div className="pn-adverse-card">

<div className="form-group">

<label>Brain Injury for Composite Outcome</label>

<input
value={formData.brain_injury_composite || ""}
readOnly
/>


<p style={{fontSize:"13px", marginTop:"6px"}}>
(IVH ≥ 3 and/or cPVL ≥ 2)
</p>

</div>

</div>

</div>
 {/* ================= COMPLETION DETAILS ================= */}
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
</div>
 <button className="submit-btn" type="submit">
  Save & Continue
</button>
    </form>
    
    
  );
}


