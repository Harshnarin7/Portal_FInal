import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./ScreeningForm.css";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/Tables.css";
import "./styles/FormG.css";
import { usePatient } from "./context/PatientContext";
import FormLayout from "./components/FormLayout";
import { useFormProgress } from "./context/FormProgressContext";
import { useParams } from "react-router-dom";

export default function FormG() {
  const location = useLocation();
  const navigate = useNavigate();
  const { patientData, setPatientData } = usePatient() || {};
  const { markFormCompleted } = useFormProgress();
  const { enrollmentId } = useParams();
   console.log("URL param enrollmentId:", enrollmentId);
  console.log("patientData:", patientData);
  

  const [formData, setFormData] = useState({
    enrollment_id: "",
    baby_uid: "",
    gestation_weeks: "",
    gestation_days: "",
    birth_weight: "",
    mortality_hospital_time: "",
    mortality_hospital_date: "",
    mortality_post_discharge_date: "",
mortality_post_discharge_time: "",
dob: "",


    // ================= MORTALITY OUTCOMES =================
mortality_hospital: "",
mortality_hospital_age: "",
mortality_7_days_date: "",
mortality_7_days_time: "",

mortality_28_days_date: "",
mortality_28_days_time: "",

mortality_post_discharge: "",
mortality_post_discharge_age: "",

mortality_7_days: "",
mortality_7_days_age: "",

mortality_28_days: "",
mortality_28_days_age: "",

// ================= MAJOR MORBIDITIES =================
bpd_jensen: "",
bpd_nichd: "",

abnormal_mri: "",

rop_44w: "",
rop_age_diagnosis: "",
rop_treated: "",

nec_40w: "",
nec_stage: "",
nec_surgical: "",

brain_injury_40w: "",
ivh_grade_3_or_more: "",
cpvl_grade_2_or_more: "",

// ================= DR & RESUSCITATION OUTCOMES =================




time_to_spontaneous_breathing: "",

fio2_min_0: "",
fio2_min_1: "",
fio2_min_2: "",
fio2_min_3: "",
fio2_min_4: "",
fio2_min_5: "",
fio2_min_6: "",
fio2_min_7: "",
fio2_min_8: "",
fio2_min_9: "",
fio2_min_10: "",



hie_severity: "",

// RESUSCITATION & EARLY OUTCOMES
switched_100_o2: "",
cc_epi_volume: "",
ventilation_required: "",
intubation_during_resus: "",

hie_grade: "",

resp_support_72h: "",
mv_days: "",
cpap_days: "",
niv_days: "",
hfnc_days: "",
// SEPSIS OUTCOMES
sepsis_eos_72h: "",
sepsis_overall: "",
rop_age_days: "",


// COMPLETION DETAILS
completed_by: "",
designation: "",

completion_date: "",




    // remaining fields will be added section by section
  });

  const gestationalAgeDisplay =
  formData.gestation_weeks
    ? `${formData.gestation_weeks} weeks ${formData.gestation_days || 0} days`
    : "";

useEffect(() => {
  const fetchData = async () => {
    try {
      const screeningId = localStorage.getItem("current_screening_id");
      const enrollmentId = localStorage.getItem("current_enrollment_id");

      console.log("Screening ID:", screeningId);
      console.log("Enrollment ID:", enrollmentId);

      // ✅ SCREENING DATA (FIXED)
      let screeningData = {};
      try {
        const res = await api.get(
          `/screenings/by-screening-id/${screeningId}`
        );
        screeningData = res.data || {};
        console.log("SCREENING:", screeningData);
      } catch (err) {
        console.warn("No screening found");
      }

      let birthData = {};

try {
const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
  birthData = res.data || {};
  console.log("BIRTH:", birthData);
  
} catch (err) {
  console.warn("No birth data found");
}

      // ✅ FINAL SET DATA
      setFormData(prev => ({
  ...prev,
  enrollment_id: enrollmentId || "",
  baby_uid: birthData?.baby_uid || "",
  gestation_weeks: birthData?.gestation_weeks || screeningData?.gestation_weeks || "",
  gestation_days: birthData?.gestation_days || screeningData?.gestation_days || "",
  birth_weight: birthData?.birth_weight || "",
  dob: birthData?.date_of_birth || "",
}));
    } catch (err) {
      console.error("Error loading Form G:", err);
    }
  };

  fetchData();
}, []);

  




  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({
      ...p,
      [name]: value,
    }));
  };

  const calculateAgeAtDeath = (dob, deathDate) => {
  if (!dob || !deathDate) return "";

  const birth = new Date(dob);
  const death = new Date(deathDate);

  if (isNaN(birth) || isNaN(death)) return "";

  const diff = death.getTime() - birth.getTime();

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  return days >= 0 ? days : "";
};

useEffect(() => {

  console.log("DOB:", formData.dob);
  console.log("Death Date:", formData.mortality_hospital_date);

  if (!formData.mortality_hospital_date || !formData.dob) return;

  const age = calculateAgeAtDeath(
    formData.dob,
    formData.mortality_hospital_date
  );

  setFormData(prev => ({
    ...prev,
    mortality_hospital_age: age
  }));

}, [formData.mortality_hospital_date, formData.dob]);

useEffect(() => {

  if (!formData.mortality_post_discharge_date || !formData.dob) return;

  const age = calculateAgeAtDeath(
    formData.dob,
    formData.mortality_post_discharge_date
  );

  setFormData(prev => ({
    ...prev,
    mortality_post_discharge_age: age
  }));

}, [formData.mortality_post_discharge_date, formData.dob]);

useEffect(() => {

  if (!formData.mortality_7_days_date || !formData.dob) return;

  const age = calculateAgeAtDeath(
    formData.dob,
    formData.mortality_7_days_date
  );

  setFormData(prev => ({
    ...prev,
    mortality_7_days_age: age
  }));

}, [formData.mortality_7_days_date, formData.dob]);

useEffect(() => {

  if (!formData.mortality_28_days_date || !formData.dob) return;

  const age = calculateAgeAtDeath(
    formData.dob,
    formData.mortality_28_days_date
  );

  setFormData(prev => ({
    ...prev,
    mortality_28_days_age: age
  }));

}, [formData.mortality_28_days_date, formData.dob]);

useEffect(() => {

  if (!formData.rop_age_diagnosis || !formData.dob) return;

  const age = calculateAgeAtDeath(
    formData.dob,
    formData.rop_age_diagnosis
  );

  setFormData(prev => ({
    ...prev,
    rop_age_days: age
  }));

}, [formData.rop_age_diagnosis, formData.dob]);

  const yesNoToBool = (v) =>
  v === "Yes" ? true : v === "No" ? false : null;
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
  const handleSubmit = async (e) => {
  e.preventDefault();

  const payload = {
  enrollment_id: formData.enrollment_id,
  baby_uid: formData.baby_uid,
  gestation_weeks: formData.gestation_weeks || null,
  birth_weight: formData.birth_weight || null,

  mortality_hospital: yesNoToBool(formData.mortality_hospital),
  mortality_post_discharge: yesNoToBool(formData.mortality_post_discharge),
  mortality_7_days: yesNoToBool(formData.mortality_7_days),
  mortality_28_days: yesNoToBool(formData.mortality_28_days),

  bpd_jensen: yesNoToBool(formData.bpd_jensen),
  bpd_nichd: yesNoToBool(formData.bpd_nichd),
  abnormal_mri: yesNoToBool(formData.abnormal_mri),

  rop: yesNoToBool(formData.rop_44w),
  nec_stage_2_or_more: yesNoToBool(formData.nec_40w),
  brain_injury: yesNoToBool(formData.brain_injury_40w),

  switched_to_100_o2: yesNoToBool(formData.switched_100_o2),
  cc_epi_volume: yesNoToBool(formData.cc_epi_volume),
  ventilation_required: yesNoToBool(formData.ventilation_required),
  intubation_during_resus: yesNoToBool(formData.intubation_during_resus),

  completed_by: formData.completed_by || null,
  designation: formData.designation || null,
  
  completion_date: formData.completion_date || null,
};


  try {
    await api.post("/study-outcomes/", payload);
    markFormCompleted("form_g");

    alert("✅ Form G submitted successfully");
    

    navigate(`/form-j/${formData.enrollment_id}`);
  } catch (err) {
    console.error(err.response?.data || err);
    alert("❌ Error submitting Form G");
  }
};
  return (
    
      <div className="formg-page">
    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main"><h2>
        Form G — Study Outcomes Assessment
      </h2></div></div>

      {/* ================= IDENTIFICATION ================= */}
      <div className="form-section soft-blue">
        <h3>Identification</h3>

        <div className="form-row">
          <div className="form-group">
            <label>Enrollment ID</label>
            <input
              value={formData.enrollment_id || ""}
              readOnly
            />
          </div>

          <div className="form-group">
            <label>Baby UID</label>
            <input
              name="baby_uid"
              value={formData.baby_uid || ""}
              onChange={handleChange}readOnly
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Gestational Age</label>
            <input
  type="text"
  value={gestationalAgeDisplay}
  readOnly
/>
          </div>

          <div className="form-group">
            <label>Birth Weight (grams)</label>
            <input
              type="number"
              name="birth_weight"
              value={formData.birth_weight || ""}
              onChange={handleChange}readOnly
            />
          </div>
        </div>
      </div>

     <div className="form-section soft-blue">
  <h3>STUDY OUTCOMES ASSESSMENT</h3>

  <div className="outcome-table">

    {/* Header */}
    <div className="outcome-header">
      <div>Outcome</div>
      <div>Definition</div>
      <div>Result</div>
      <div>Additional Information</div>
    </div>

    <div className="outcome-row">
  <div className="outcome-title">
    Switched to 100% O₂
  </div>

  <div className="outcome-definition">
    Per NRP criteria
  </div>

  <div>
    <select
      name="switched_100_o2"
      value={formData.switched_100_o2 || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div></div>
</div>

<div className="outcome-row">
  <div className="outcome-title">
    CC / Epi / Volume
  </div>

  <div className="outcome-definition">
    Per NRP criteria
  </div>

  <div>
    <select
      name="cc_epi_volume"
      value={formData.cc_epi_volume || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div></div>
</div>

<div className="outcome-row">
  <div className="outcome-title">
    Ventilation required
  </div>

  <div className="outcome-definition">
    Per NRP criteria
  </div>

  <div>
    <select
      name="ventilation_required"
      value={formData.ventilation_required || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div></div>
</div>

<div className="outcome-row">

  <div className="outcome-title">
    Time to spontaneous breathing
  </div>

  <div className="outcome-definition">
    Unassisted breathing
  </div>

  <div className="result-span" style={{display:"flex",gap:"10px"}}>

    <input
      type="number"
      name="time_to_spontaneous_breathing_value"
      placeholder="Enter time"
      value={formData.time_to_spontaneous_breathing_value || ""}
      onChange={handleChange}
      style={{width:"120px"}}
    />

    <select
      name="time_to_spontaneous_breathing_unit"
      value={formData.time_to_spontaneous_breathing_unit || ""}
      onChange={handleChange}
      style={{width:"120px"}}
    >
      <option value="">Unit</option>
      <option value="seconds">Seconds</option>
      <option value="minutes">Minutes</option>
    </select>

  </div>

</div>

<div className="outcome-row">

  <div className="outcome-title">
    FiO₂ (0–10 min)
  </div>

  <div className="outcome-definition">
    Each minute
  </div>

  <div className="result-span">
    {[0,1,2,3,4,5,6,7,8,9,10].map((min)=>(
  
  <div key={min} style={{position:"relative",display:"inline-block"}}>

    <input
      type="number"
      min="0"
      max="100"
      name={`fio2_min_${min}`}
      value={formData[`fio2_min_${min}`] || ""}
      onChange={handleChange}
      placeholder={`${min}'`}
      style={{
        width:"70px",
        paddingRight:"18px"
      }}
    />

    <span
      style={{
        position:"absolute",
        right:"6px",
        top:"50%",
        transform:"translateY(-50%)",
        pointerEvents:"none",
        fontSize:"12px",
        color:"#555"
      }}
    >
      %
    </span>

  </div>

))}
  </div>

</div>

<div className="outcome-row">
  <div className="outcome-title">
    Intubation during resus
  </div>

  <div className="outcome-definition">
    Any reason
  </div>

  <div>
    <select
      name="intubation_during_resus"
      value={formData.intubation_during_resus || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div></div>
</div>


<div className="outcome-row">
  <div className="outcome-title">
    HIE (Levene's)
  </div>

  <div className="outcome-definition">
    Mod / severe HIE
  </div>

  <div>
    <select
      name="hie_grade"
      value={formData.hie_grade || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>None</option>
      <option>Mild</option>
      <option>Moderate</option>
      <option>Severe</option>
    </select>
  </div>

  <div></div>
</div>


<div className="outcome-row">
  <div className="outcome-title">
    Respiratory support (0.5-72h)
  </div>

  <div className="outcome-definition">
    CPAP / NIMV / IMV / HFV
  </div>

  <div>
    <select
      name="resp_support_72h"
      value={formData.resp_support_72h || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div></div>
</div>

<div className="outcome-row">

  <div className="outcome-title">
    Duration respiratory support
  </div>

  <div className="outcome-definition">
    Cumulative days
  </div>

  <div className="result-span">

    <input
  type="number"
  min="0"
  step="1"
  name="mv_days"
  placeholder="MV days"
  value={formData.mv_days || ""}
  onChange={handleChange}
  style={{width:"110px"}}
/>

<input
  type="number"
  min="0"
  step="1"
  name="cpap_days"
  placeholder="CPAP days"
  value={formData.cpap_days || ""}
  onChange={handleChange}
  style={{width:"110px"}}
/>

<input
  type="number"
  min="0"
  step="1"
  name="niv_days"
  placeholder="NIV days"
  value={formData.niv_days || ""}
  onChange={handleChange}
  style={{width:"110px"}}
/>

<input
  type="number"
  min="0"
  step="1"
  name="hfnc_days"
  placeholder="HFNC days"
  value={formData.hfnc_days || ""}
  onChange={handleChange}
  style={{width:"110px"}}
/>

  </div>

</div>

<div className="outcome-row">
  <div className="outcome-title">
    Sepsis ≤72h (EOS)
  </div>

  <div className="outcome-definition">
    Culture + or clinical
  </div>

  <div>
    <select
      name="sepsis_eos_72h"
      value={formData.sepsis_eos_72h || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div></div>
</div>


<div className="outcome-row">

  <div className="outcome-title">
    All-cause mortality ≤ 7 days
  </div>

  <div className="outcome-definition">
    Death due to any cause from birth till completion of D7 of age
  </div>

  <div>
    <select
      name="mortality_7_days"
      value={formData.mortality_7_days || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div className="mortality-fields">

<div style={{display:"flex",gap:"10px",marginBottom:"8px"}}>

<div style={{display:"flex",flexDirection:"column"}}>
<label style={{fontSize:"12px",fontWeight:"600"}}>Date of death</label>

<input
  type="date"
  name="mortality_7_days_date"
  value={formData.mortality_7_days_date || ""}
  onChange={handleChange}
  disabled={formData.mortality_7_days !== "Yes"}
/>

</div>

<div style={{display:"flex",flexDirection:"column"}}>
<label style={{fontSize:"12px",fontWeight:"600"}}>Time of death</label>

<input
  type="time"
  name="mortality_7_days_time"
  value={formData.mortality_7_days_time || ""}
  onChange={handleChange}
  disabled={formData.mortality_7_days !== "Yes"}
/>

</div>

</div>


<div style={{display:"flex",flexDirection:"column",width:"140px"}}>

<label style={{fontSize:"12px",fontWeight:"600",marginBottom:"4px"}}>
Age at death
</label>

<input
  name="mortality_7_days_age"
  value={formData.mortality_7_days_age || ""}
  readOnly
/>

</div>

</div>

</div>

<div className="outcome-row">

  <div className="outcome-title">
    All-cause mortality ≤ 28 days
  </div>

  <div className="outcome-definition">
    Death due to any cause from birth till completion of D28 of age
  </div>

  <div>
    <select
      name="mortality_28_days"
      value={formData.mortality_28_days || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div className="mortality-fields">

<div style={{display:"flex",gap:"10px",marginBottom:"8px"}}>

<div style={{display:"flex",flexDirection:"column"}}>
<label style={{fontSize:"12px",fontWeight:"600"}}>Date of death</label>

<input
  type="date"
  name="mortality_28_days_date"
  value={formData.mortality_28_days_date || ""}
  onChange={handleChange}
  disabled={formData.mortality_28_days !== "Yes"}
/>

</div>

<div style={{display:"flex",flexDirection:"column"}}>
<label style={{fontSize:"12px",fontWeight:"600"}}>Time of death</label>

<input
  type="time"
  name="mortality_28_days_time"
  value={formData.mortality_28_days_time || ""}
  onChange={handleChange}
  disabled={formData.mortality_28_days !== "Yes"}
/>

</div>

</div>


<div style={{display:"flex",flexDirection:"column",width:"140px"}}>

<label style={{fontSize:"12px",fontWeight:"600",marginBottom:"4px"}}>
Age at death
</label>

<input
  name="mortality_28_days_age"
  value={formData.mortality_28_days_age || ""}
  readOnly
/>

</div>

</div>

</div>

 {/* Row 3 */}
    <div className="outcome-row">
      <div className="outcome-title">
        BPD at 36 weeks PMA (Jensen)
      </div>

      <div className="outcome-definition">
        BPD as assessed at 36 weeks PMA completion as per Jensen's criteria (2019)
      </div>

      <div>
        <select
          name="bpd_jensen"
          value={formData.bpd_jensen || ""}
          onChange={handleChange}
        >
          <option value="">--</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </div>

      <div>
        Check composite outcome form
      </div>
    </div>

    {/* Row 4 */}
    <div className="outcome-row">
      <div className="outcome-title">
        BPD at 36 weeks PMA (NICHD)
      </div>

      <div className="outcome-definition">
        BPD assessed at 36 weeks PMA as per NICHD criteria (2018)
      </div>

      <div>
        <select
          name="bpd_nichd"
          value={formData.bpd_nichd || ""}
          onChange={handleChange}
        >
          <option value="">--</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </div>

      <div>
        Check composite outcome form
      </div>
    </div>


    <div className="outcome-row">
  <div className="outcome-title">
    NEC ≤ 40 weeks
  </div>

  <div className="outcome-definition">
    Modified Bell's Staging (Stage ≥ IIA)
  </div>

  <div>
    <select
      name="nec_40w"
      value={formData.nec_40w || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div>
    <select
      name="nec_surgical"
      value={formData.nec_surgical || ""}
      onChange={handleChange}
      disabled={formData.nec_40w !== "Yes"}
    >
      <option value="">Surgical?</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>
</div>
<div className="outcome-row">
  <div className="outcome-title">
    Brain injury ≤ 40 weeks
  </div>

  <div className="outcome-definition">
    Papile Classification for IVH, De Vries Classification for cPVL
  </div>

  <div>
    --
  </div>

  <div style={{display:"flex",gap:"12px"}}>
    <label>
      IVH Grade ≥3
      <select
        name="ivh_grade_3_or_more"
        value={formData.ivh_grade_3_or_more || ""}
        onChange={handleChange}
      >
        <option value="">--</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </label>

    <label>
      cPVL Grade ≥2
      <select
        name="cpvl_grade_2_or_more"
        value={formData.cpvl_grade_2_or_more || ""}
        onChange={handleChange}
      >
        <option value="">--</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </label>
  </div>
</div>

 <div className="outcome-row">
      <div className="outcome-title">
        Abnormal MRI Brain at TEA
      </div>

      <div className="outcome-definition">
        Abnormal MRI brain at 40 ± 2 weeks PMA
      </div>

      <div>
        <select
          name="abnormal_mri"
          value={formData.abnormal_mri || ""}
          onChange={handleChange}
        >
          <option value="">--</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </div>

      <div>
        Check MRI form for more details
      </div>
    </div>


        {/* Row 5 */}
   

<div className="outcome-row">
  <div className="outcome-title">
    ROP ≤ 44 weeks
  </div>

  <div className="outcome-definition">
    ICROP 3rd Edition
  </div>

  <div>
    <select
      name="rop_44w"
      value={formData.rop_44w || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div className="mortality-fields">

    {/* Row 1 */}
    <div style={{display:"flex",gap:"10px",marginBottom:"8px"}}>

      <div style={{display:"flex",flexDirection:"column"}}>
        <label style={{fontSize:"12px",fontWeight:"600"}}>
          Date of diagnosis
        </label>

        <input
          type="date"
          name="rop_age_diagnosis"
          value={formData.rop_age_diagnosis || ""}
          onChange={handleChange}
          disabled={formData.rop_44w !== "Yes"}
        />
      </div>

      <div style={{display:"flex",flexDirection:"column"}}>
        <label style={{fontSize:"12px",fontWeight:"600"}}>
          Age at diagnosis
        </label>

        <input
          name="rop_age_days"
          value={formData.rop_age_days || ""}
          readOnly
        />
      </div>

    </div>

    {/* Row 2 */}
    <div style={{display:"flex",flexDirection:"column",width:"140px"}}>

      <label style={{fontSize:"12px",fontWeight:"600",marginBottom:"4px"}}>
        Treated
      </label>

      <select
        name="rop_treated"
        value={formData.rop_treated || ""}
        onChange={handleChange}
        disabled={formData.rop_44w !== "Yes"}
      >
        <option value="">--</option>
        <option>Yes</option>
        <option>No</option>
      </select>

    </div>

  </div>
</div>

<div className="outcome-row">
  <div className="outcome-title">
    Sepsis (overall)
  </div>

  <div className="outcome-definition">
    Culture + or clinical
  </div>

  <div>
    <select
      name="sepsis_overall"
      value={formData.sepsis_overall || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div></div>
</div>

    {/* Row 1 */}
    <div className="outcome-row">

  <div className="outcome-title">
    All-cause mortality during hospital stay
  </div>

  <div className="outcome-definition">
    Death due to any cause occurring from birth and before discharge
  </div>

  <div>
    <select
      name="mortality_hospital"
      value={formData.mortality_hospital || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div className="mortality-fields">

{/* Row 1 labels */}
<div style={{display:"flex",gap:"10px",fontSize:"12px",fontWeight:"600",marginBottom:"4px"}}>
  <div style={{width:"140px"}}>Date of death</div>
  <div style={{width:"120px"}}>Time of death</div>
</div>

{/* Row 1 inputs */}
<div style={{display:"flex",gap:"10px",marginBottom:"8px"}}>

<input
  type="date"
  name="mortality_hospital_date"
  value={formData.mortality_hospital_date || ""}
  onChange={handleChange}
  disabled={formData.mortality_hospital !== "Yes"}
/>

<input
  type="time"
  name="mortality_hospital_time"
  value={formData.mortality_hospital_time || ""}
  onChange={handleChange}
  disabled={formData.mortality_hospital !== "Yes"}
/>

</div>

{/* Age label + field */}
<div style={{display:"flex",flexDirection:"column",width:"140px"}}>

  <label style={{fontSize:"12px",fontWeight:"600",marginBottom:"4px"}}>
    Age at death
  </label>

  <input
    name="mortality_hospital_age"
    value={formData.mortality_hospital_age || ""}
    readOnly
    style={{width:"140px"}}
  />

</div>

</div>

</div>

    {/* Row 2 */}
    <div className="outcome-row">

  <div className="outcome-title">
    All-cause mortality after discharge
  </div>

  <div className="outcome-definition">
    Death due to any cause occurring after discharge from hospital
   </div>

  <div>
    <select
      name="mortality_post_discharge"
      value={formData.mortality_post_discharge || ""}
      onChange={handleChange}
    >
      <option value="">--</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  <div className="mortality-fields">

<div style={{display:"flex",gap:"10px",marginBottom:"8px"}}>

<div style={{display:"flex",flexDirection:"column"}}>
<label style={{fontSize:"12px",fontWeight:"600"}}>Date of death</label>

<input
  type="date"
  name="mortality_post_discharge_date"
  value={formData.mortality_post_discharge_date || ""}
  onChange={handleChange}
  disabled={formData.mortality_post_discharge !== "Yes"}
/>

</div>

<div style={{display:"flex",flexDirection:"column"}}>
<label style={{fontSize:"12px",fontWeight:"600"}}>Time of death</label>

<input
  type="time"
  name="mortality_post_discharge_time"
  value={formData.mortality_post_discharge_time || ""}
  onChange={handleChange}
  disabled={formData.mortality_post_discharge !== "Yes"}
/>

</div>

</div>


<div style={{display:"flex",flexDirection:"column",width:"140px"}}>

<label style={{fontSize:"12px",fontWeight:"600",marginBottom:"4px"}}>
Age at death
</label>

<input
  name="mortality_post_discharge_age"
  value={formData.mortality_post_discharge_age || ""}
  readOnly
/>

</div>

</div>

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
    </form></div>
    
  );
}
