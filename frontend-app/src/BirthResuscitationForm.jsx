import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import { usePatient } from "./context/PatientContext";
import { useParams,useNavigate } from "react-router-dom";

import { useFormProgress } from "./context/FormProgressContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";


import FormLayout from "./components/FormLayout";
const thStyle = {
  padding: "10px",
  fontWeight: 600,
  fontSize: "0.9rem",
  textAlign: "center",
  borderBottom: "1px solid #dde4ff",
};

const rowLabelStyle = {
  padding: "10px",
  fontWeight: 600,
  textTransform: "capitalize",
  borderBottom: "1px solid #f0f0f0",
};

const cellStyle = {
  padding: "8px",
  textAlign: "center",
  borderBottom: "1px solid #f0f0f0",
};

const selectStyle = {
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid #ccd6ff",
  backgroundColor: "#fff",
};




export default function BirthResuscitationForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { screeningId } = useParams();
  const { updatePatientData } = usePatient();
  const [errors, setErrors] = useState({});
  const [isSaved, setIsSaved] = useState(false);
const [isEditing, setIsEditing] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
const [showMissingModal, setShowMissingModal] = useState(false);
const isReadOnly = isSaved && !isEditing;

const [isFormBLoaded, setIsFormBLoaded] = useState(false);

  const [formData, setFormData] = useState({
    screening_id: "",
    enrollment_id: "",
    mother_name_first: "",
    mother_name_surname: "",

    date_of_birth: "",
  time_of_birth: "",

    maternal_uid: "",
    contact_mother: "",
    contact_husband: "",
    gestation_weeks: "",
    gestation_days: "",
    birth_weight: "",
    indication_for_delivery: "",
    maternal_complication: "",
    delivery_mode: "",
    labor_type: "",
    gender: "",

    poor_resp_efforts: "",
    poor_muscle_tone: "",
    initial_steps: "",
    required_resuscitation: "",

    ppv_required: "",
    device_ppv: "",
    intubation: "",
    chest_compression: "",
    ppv_duration: "",
    cc_duration: "",

    adrenaline: "",
    med_doses: "",
    fluid_bolus: "",
    placental_transfusion: "",
    transfusion_method: "",
    cord_clamp_time: "",
    time_to_respiration: "",
    time_to_spo2_80: "",
    spo2_5min: "",

    randomised: "",
    randomisation_date: "",
    resus_failure: "",
    fio2_exit: "",
    reason_exit_trial_gas: "",
    
reason_exit_trial_gas_other: "",
    spo2_exit_trial_gas: "",
    total_resus_time: "",

    interventions: {
      oxygen: {},
      ppv: {},
      chest_compression: {},
      intubation: {},
      medication: {},
      fluid_bolus: {},
      cpap: {},
    },
  });

  const [message, setMessage] = useState("");
  const endParticipation =
  formData.required_resuscitation === "No";

  const getMissingFields = () => {
  const missing = [];

  if (!formData.baby_uid) missing.push("Baby UID");
  if (!formData.birth_weight) missing.push("Birth Weight");
  if (!formData.date_of_birth) missing.push("Date of Birth");
  if (!formData.time_of_birth) missing.push("Time of Birth");
  if (!formData.gender) missing.push("Gender");

  if (formData.required_resuscitation === "Yes") {
    if (!formData.randomised) missing.push("Randomized");

    if (formData.randomised === "Yes") {
      if (!formData.enrollment_id) missing.push("Enrollment ID");
      if (!formData.randomisation_date)
        missing.push("Randomization Date");
    }

    if (formData.randomised === "No") {
      if (!formData.enrollment_reason_not_randomized)
        missing.push("Reason Not Randomized");
    }
  }

  return missing;
};

  
  const saveForm = async () => {
  setMessage("");
  const missing = getMissingFields();

if (missing.length > 0) {
  setMissingFields(missing);

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });

  setShowMissingModal(true);
  return false;
}

  // ✅ BASIC VALIDATIONS (same as submitForm)
  if (formData.baby_uid && !/^\d{1,12}$/.test(formData.baby_uid)) {
    setMessage("❌ Baby UID must be numeric and up to 12 digits.");
    return false;
  }

  if (!/^\d{10}$/.test(formData.contact_mother || "")) {
    setMessage("❌ Mother contact must be exactly 10 digits.");
    return false;
  }

  if (!/^\d{10}$/.test(formData.contact_husband || "")) {
    setMessage("❌ Father contact must be exactly 10 digits.");
    return false;
  }

  if (formData.required_resuscitation === "Yes") {
    const pattern = /^[A-Za-z0-9]+-[ABCD]-\d{3}$/;

    if (!pattern.test(formData.enrollment_id)) {
      setMessage("❌ Enrollment ID format: SITECODE-A/B/C/D-001");
      return false;
    }
  }

  // ✅ PAYLOAD (SAME AS YOUR submitForm)
  const payload = {
    screening_id: formData.screening_id,
    enrollment_id: formData.enrollment_id,

    mother_name_first: formData.mother_name_first,
    mother_name_surname: formData.mother_name_surname,

    maternal_uid: formData.maternal_uid,
    contact_mother: formData.contact_mother,
    contact_husband: formData.contact_husband,

    gestation_weeks: Number(formData.gestation_weeks) || 0,
    gestation_days: Number(formData.gestation_days) || 0,

    birth_weight: Number(formData.birth_weight) || 0,
    baby_uid: formData.baby_uid,

    date_of_birth: formData.date_of_birth
      ? new Date(formData.date_of_birth).toISOString().split("T")[0]
      : null,

    time_of_birth: formData.time_of_birth || null,

    indication_for_delivery: formData.indication_for_delivery,
    maternal_complication: formData.maternal_complication,
    delivery_mode: formData.delivery_mode,
    labor_type: formData.labor_type,
    gender: formData.gender,

    poor_resp_efforts: formData.poor_resp_efforts === "Yes",
    poor_muscle_tone: formData.poor_muscle_tone === "Yes",
    initial_steps: formData.initial_steps === "Yes",
    required_resuscitation: formData.required_resuscitation === "Yes",

    ppv_required: formData.ppv_required === "Yes",
    device_ppv: formData.device_ppv,
    intubation: formData.intubation === "Yes",
    chest_compression: formData.chest_compression === "Yes",

    ppv_duration: Number(formData.ppv_duration) || 0,
    cc_duration: Number(formData.cc_duration) || 0,

    adrenaline: formData.adrenaline === "Yes",
    med_doses: Number(formData.med_doses) || 0,
    fluid_bolus: formData.fluid_bolus === "Yes",

    placental_transfusion: formData.placental_transfusion === "Yes",
    transfusion_method: formData.transfusion_method,

    cord_clamp_time: Number(formData.cord_clamp_time) || 0,
    time_to_respiration: Number(formData.time_to_respiration) || 0,
    time_to_spo2_80: Number(formData.time_to_spo2_80) || 0,
    spo2_5min: Number(formData.spo2_5min) || 0,

    randomised: formData.randomised === "Yes",

    randomisation_date: formData.randomisation_date
      ? new Date(formData.randomisation_date).toISOString().split("T")[0]
      : null,

    resus_failure: formData.resus_failure === "Yes",

    fio2_exit: Number(formData.fio2_exit) || 0,

    reason_exit_trial_gas:
      formData.reason_exit_trial_gas === "Other"
        ? formData.reason_exit_trial_gas_other
        : formData.reason_exit_trial_gas,

    spo2_exit_trial_gas: Number(formData.spo2_exit_trial_gas) || 0,
    total_resus_time: Number(formData.total_resus_time) || 0,

    interventions: formData.interventions,
  };

  try {
    if (
  formData.required_resuscitation === "Yes" &&
  formData.randomised === "Yes" &&
  !formData.enrollment_id
) {
  setMessage("❌ Enrollment ID required for randomized cases");
  return false;
}
   let res;

console.log("🚀 PAYLOAD:", payload);

if (isFormBLoaded) {
  // ✅ UPDATE
  res = await api.put(
    `/birth-resuscitation/${payload.enrollment_id}`,
    payload
  );
} else {
  // ✅ CREATE FIRST
  res = await api.post(
    `/birth-resuscitation/`,
    payload
  );
}

// ✅ SUCCESS
console.log("✅ SAVED:", res.data);
setIsFormBLoaded(true);

localStorage.setItem(
  "current_enrollment_id",
  payload.enrollment_id
);

localStorage.setItem(
  "current_screening_id",
  payload.screening_id
);

setMessage("✅ Form B saved successfully");
setIsSaved(true);
setIsEditing(false);
markFormCompleted("form_b");

window.scrollTo({ top: 0, behavior: "smooth" });

setTimeout(() => setMessage(""), 3000);

return true;

  } catch (err) {
    console.error(err);
    setMessage("❌ Save failed");

    window.scrollTo({ top: 0, behavior: "smooth" });

    setIsSaved(false);
    return false;
  }
};

const handleNext = async () => {
  const success = await saveForm();
  if (!success) return;

  const enrollmentId = localStorage.getItem("current_enrollment_id");

  // 🔥 FORCE SAVE IN LOCALSTORAGE (FIX SIDEBAR)
  const key = `completedForms_${enrollmentId}`;
  const existing = JSON.parse(localStorage.getItem(key) || "[]");

  if (!existing.includes("form_b")) {
    localStorage.setItem(
      key,
      JSON.stringify([...existing, "form_b"])
    );
  }

  // ✅ NOW NAVIGATE
  navigate(`/form-c/${enrollmentId}`);
};
useEffect(() => {
  const enrollmentId = localStorage.getItem("current_enrollment_id");

 if (!enrollmentId || enrollmentId === "null") return;

  const fetchFormB = async () => {
    try {
      const res = await api.get(`/birth-resuscitation/${enrollmentId}`);

      console.log("✅ Form B fetched:", res.data);

      setFormData(prev => ({
        ...prev,
        ...res.data
      }));

      setIsFormBLoaded(true);
    } catch (err) {
      console.log("No existing Form B");
    }
  };

  fetchFormB();
}, []);
useEffect(() => {
  const fetchScreening = async () => {
    try {
      const res = await api.get(`/screenings/by-screening-id/${screeningId}`);
      const screening = res.data || {};
      let pii = {};
      try {
        const piiRes = await api.get(`/pii/screening/${screeningId}`);
        pii = piiRes.data || {};
      } catch (_) {
        /* PII may be restricted for some roles */
      }

      setFormData(prev => ({
  ...prev,
  screening_id: screening.screening_id,
  maternal_uid: pii.maternal_uid || "",
  mother_name_first: pii.mother_first_name || "",
  mother_name_surname: pii.mother_surname || "",
  gestation_weeks: screening.gestation_weeks,
  gestation_days: screening.gestation_days,
  contact_mother: pii.mother_contact || pii.contact_mother || "",
  contact_husband: pii.husband_contact || pii.contact_husband || "",
}));

    } catch (error) {
      console.error("Error fetching screening:", error);
    }
  };

  if (screeningId) {
    fetchScreening();
  }
}, [screeningId]);

useEffect(() => {
  const val = formData.chest_compression;

  // Only run if value exists (Yes / No / "")
  if (val === "Yes" || val === "No" || val === "") {
    setFormData(prev => ({
      ...prev,
      interventions: {
        ...prev.interventions,
        chest_compression: {
          "1": val,
          "5": val,
          "10": val,
          "15": val,
          "20": val
        }
      }
    }));
  }
}, [formData.chest_compression]);

  /* ---------- helpers ---------- */
  const yn = (v) => (v === "Yes" ? true : false);
  const num = (v) => (v === "" ? 0 : Number(v));

  const handleChange = (e) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleInterventionChange = (type, time, value) =>
    setFormData((p) => ({
      ...p,
      interventions: {
        ...p.interventions,
        [type]: { ...p.interventions[type], [time]: value },
      },
    }));

  /* ---------- submit ---------- */
  const submitForm = async (e) => {
    e.preventDefault();
    setMessage("");

    // Baby UID validation (max 12 digits)
if (formData.baby_uid && !/^\d{1,12}$/.test(formData.baby_uid)) {
  setMessage("❌ Baby UID must be numeric and up to 12 digits.");
  return;
}

// Contact numbers must be exactly 10 digits
if (!/^\d{10}$/.test(formData.contact_mother || "")) {
  setMessage("❌ Mother contact must be exactly 10 digits.");
  return;
}

if (!/^\d{10}$/.test(formData.contact_husband || "")) {
  setMessage("❌ Father contact must be exactly 10 digits.");
  return;
}

if (formData.required_resuscitation === "Yes") {
  const enrollmentPattern = /^[A-Za-z0-9]+-[ABCD]-\d{3}$/;

  if (!enrollmentPattern.test(formData.enrollment_id)) {
    setMessage(
      "❌ Enrollment ID must follow format: SITECODE-A/B/C/D-001"
    );
    return;
  }
}

    const payload = {
      screening_id: formData.screening_id,
      enrollment_id: formData.enrollment_id,
      mother_name_first: formData.mother_name_first,
      mother_name_surname: formData.mother_name_surname,
      maternal_uid: formData.maternal_uid,
      contact_mother: formData.contact_mother,
      contact_husband: formData.contact_husband,
      gestation_weeks: num(formData.gestation_weeks),
      gestation_days: num(formData.gestation_days),
      birth_weight: num(formData.birth_weight),
      baby_uid: formData.baby_uid,
      date_of_birth: formData.date_of_birth
    ? formData.date_of_birth.toISOString().split("T")[0]
    : null,
      time_of_birth: formData.time_of_birth || null,

      indication_for_delivery: formData.indication_for_delivery,
      maternal_complication: formData.maternal_complication,
      delivery_mode: formData.delivery_mode,
      labor_type: formData.labor_type,
      gender: formData.gender,

      poor_resp_efforts: yn(formData.poor_resp_efforts),
      poor_muscle_tone: yn(formData.poor_muscle_tone),
      initial_steps: yn(formData.initial_steps),
      required_resuscitation: yn(formData.required_resuscitation),

      ppv_required: yn(formData.ppv_required),
      device_ppv: formData.device_ppv,
      intubation: yn(formData.intubation),
      chest_compression: yn(formData.chest_compression),

      ppv_duration: num(formData.ppv_duration),
      cc_duration: num(formData.cc_duration),

      adrenaline: yn(formData.adrenaline),
      med_doses: num(formData.med_doses),
      fluid_bolus: yn(formData.fluid_bolus),

      placental_transfusion: yn(formData.placental_transfusion),
      transfusion_method: formData.transfusion_method,

      cord_clamp_time: num(formData.cord_clamp_time),
      time_to_respiration: num(formData.time_to_respiration),
      time_to_spo2_80: num(formData.time_to_spo2_80),
      spo2_5min: num(formData.spo2_5min),

      randomised: yn(formData.randomised),
      randomisation_date: formData.randomisation_date,

      resus_failure: yn(formData.resus_failure),
      fio2_exit: num(formData.fio2_exit),
      reason_exit_trial_gas:
  formData.reason_exit_trial_gas === "Other"
    ? formData.reason_exit_trial_gas_other
    : formData.reason_exit_trial_gas,
      spo2_exit_trial_gas: num(formData.spo2_exit_trial_gas),
      total_resus_time: num(formData.total_resus_time),
    };

    try {
      console.log("DOB sending:", formData.date_of_birth);
console.log("TIME sending:", formData.time_of_birth);
  const res = await api.post(
    "/birth-resuscitation/",
    payload,
    { headers: { "Content-Type": "application/json" } }
  );
  localStorage.setItem("current_enrollment_id", formData.enrollment_id);
 updatePatientData({
  enrollment_id: formData.enrollment_id,
  gestation: `${formData.gestation_weeks}+${formData.gestation_days}`,
  mother_name: `${formData.mother_name_first} ${formData.mother_name_surname}`,
  gestation_weeks: formData.gestation_weeks,
  gestation_days: formData.gestation_days,
  birth_weight: formData.birth_weight,
  dob: formData.date_of_birth,
  baby_uid: formData.baby_uid
});
   markFormCompleted("form_b");
  setMessage("✅ Form B submitted successfully!");
  
  // 🔴 THIS WAS MISSING
  navigate(`/form-c/${formData.enrollment_id}`);


} catch (err) {
  console.error("Form B error:", err.response?.data || err);
  setMessage("❌ Error submitting Form B.");
}

  };

  const yesNo = (
    <>
      <option value="">-- Select --</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </>
  );

  const times = ["1", "5", "10", "15", "20"];
  const handleBabyUIDChange = (e) => {
  const value = e.target.value;

  // allow only digits up to 12
  if (/^\d{0,12}$/.test(value)) {
    setFormData({
      ...formData,
      baby_uid: value
    });

    // ✅ LIVE VALIDATION
    setErrors(prev => ({
      ...prev,
      baby_uid:
        value.length === 12
          ? ""
          : "Baby UID must be exactly 12 digits"
    }));
  }
};
const handlePrevious = () => {
  navigate(`/form-a/${screeningId}`);
};

const getApgarColor = (value) => {
  if (value === "" || value === undefined) return "";

  const v = Number(value);

  if (v <= 3) return "apgar-red";      // severe
  if (v <= 6) return "apgar-yellow";   // moderate
  return "apgar-green";                // normal
};

  return (
    <>
    <form className="screening-form" onSubmit={submitForm}>
     <div className="form-a-header">
  <div className="form-a-header-main"> <h2>Form B — Birth & Resuscitation</h2>
  <span className="form-a-subtitle">
      (Complete for all consented subjects)
    </span>
   
  </div>
  </div>
  
  
     {/* ================= IDENTIFICATION ================= */}
<div className="form-section soft-blue">
  <h3>Identification</h3>

  <div className="form-row">
    <div className="form-group">
      <label>Screening ID</label>
      <input value={formData.screening_id} readOnly />
    </div>

    <div className="form-group">
      <label>Maternal UID</label>
      <input
        name="maternal_uid"
        value={formData.maternal_uid}
        readOnly
        onChange={handleChange}
      />
    </div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>Mother's First Name</label>
      <input
        name="mother_name_first"
        value={formData.mother_name_first}
        readOnly
        onChange={handleChange}
      />
    </div>

    <div className="form-group">
      <label>Baby UID<span className="required">*</span></label>
      <input
  type="text"
  name="baby_uid"
  value={formData.baby_uid || ""}
  
  maxLength={12}
  inputMode="numeric"
  onChange={handleBabyUIDChange}
/>{errors.baby_uid && (
  <div className="field-error">{errors.baby_uid}</div>
)}
    </div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>Contact (Mother) <span className="required">*</span></label>
      <input
  type="text"
  name="contact_mother"
  value={formData.contact_mother || ""}readOnly
  maxLength={10}
  inputMode="numeric"
  pattern="\d{10}"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,10}$/.test(value)) {
      setFormData({
        ...formData,
        contact_mother: value
      });
    }
  }}
  required
/>
    </div>

    <div className="form-group">
      <label>Contact (Husband) <span className="required">*</span></label>
      <input
  type="text"
  name="contact_husband"
  value={formData.contact_husband || ""}readOnly
  maxLength={10}
  inputMode="numeric"
  pattern="\d{10}"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,10}$/.test(value)) {
      setFormData({
        ...formData,
        contact_husband: value
      });
    }
  }}
  required
/>
    </div>
  </div>

  <div className="form-group">
    <label>Baby Admission No (if applicable)</label>
    <input
      name="baby_admission_no"
      value={formData.baby_admission_no}
      onChange={handleChange}
      placeholder="Optional"
    />
  </div>
</div>


      {/* ================= BIRTH DETAILS ================= */}
<div className="form-section soft-blue">
  <h3>Birth Details</h3>

  {/* Gestation + Birth weight */}
<div className="form-row">
  <div className="form-group">
    <label>Gestation (Weeks)</label>
    <input
      type="number"
      name="gestation_weeks"
      value={formData.gestation_weeks}
      readOnly
      onChange={handleChange}
      placeholder="Weeks"
    />
  </div>

  <div className="form-group">
    <label>Gestation (Days)</label>
    <input
      type="number"
      name="gestation_days"
      value={formData.gestation_days}
      readOnly
      onChange={handleChange}
      placeholder="Days"
    />
  </div>

  <div className="form-group">
    <label>Birth Weight (grams)<span className="required">*</span></label>
    <input
  type="text"
  name="birth_weight"
  value={formData.birth_weight || ""}
  required
  inputMode="numeric"
  maxLength={4}
  placeholder="300 – 6000 g"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ allow only digits
    if (/^\d{0,4}$/.test(value)) {
      setFormData({
        ...formData,
        birth_weight: value
      });

      // ✅ LIVE VALIDATION
      setErrors(prev => ({
        ...prev,
        birth_weight:
          value === ""
            ? "Required"
            : Number(value) < 300
            ? "Must be ≥ 300 g"
            : Number(value) > 6000
            ? "Must be ≤ 6000 g"
            : ""
      }));
    }
  }}
/>

{errors.birth_weight && (
  <div className="field-error">{errors.birth_weight}</div>
)}

  </div>
</div>

{/* Date & Time of Birth */}
<div className="form-row">
  <div className="form-group">
    <label>Date of Birth<span className="required">*</span></label>
    <DatePicker
  selected={
    formData.date_of_birth
      ? new Date(formData.date_of_birth)
      : null
  }
  onChange={(date) =>
    setFormData(prev => ({
      ...prev,
      date_of_birth: date
        ? date.toISOString().split("T")[0]
        : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
/>
  </div>

  <div className="form-group">
    <label>Time of Birth<span className="required">*</span></label>
    <input
  type="time"
  name="time_of_birth"
  value={formData.time_of_birth || ""}
  onChange={handleChange}
  required
  step="60"   // ✅ ensures HH:mm only
  lang="en-GB" // 🔥 forces 24-hour format
/>
  </div>
  <div className="form-group">
      <label>Gender<span className="required">*</span></label>
      <select
        name="gender"
        value={formData.gender}
        disabled={isReadOnly}
        onChange={handleChange}required
      >
        <option value="">-- Select --</option>
        <option value="Female">Female</option>
        <option value="Male">Male</option>
        <option value="Ambiguous">Ambiguous</option>
      </select>
    </div>
</div>

  {/* Indication + Delivery */}
  <div className="form-row">
    <div className="form-group">
      <label>Indication for Delivery</label>
      <select
        name="indication_for_delivery"
        value={formData.indication_for_delivery}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="pPROM">pPROM</option>
        <option value="PTL">PTL</option>
        <option value="Maternal">Maternal</option>
        <option value="Doppler abnormal">Doppler abnormal</option>
        <option value="Other">Other</option>
      </select>
      {formData.indication_for_delivery === "Other" && (
  <div className="form-group">
    
    <label>Specify Other</label>
    <input
      type="text"
      name="indication_for_delivery_other"
      value={formData.indication_for_delivery_other || ""}
      onChange={handleChange}
      placeholder="Enter details"
    />
  </div>
)}
    </div>

    <div className="form-group">
      <label>Delivery Mode</label>
      <select
        name="delivery_mode"
        value={formData.delivery_mode}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Vaginal">Vaginal</option>
        <option value="Emergency LSCS">Emergency LSCS</option>
        <option value="Elective LSCS">Elective LSCS</option>
      </select>
    </div>
    <div className="form-group">
      <label>Labor</label>
      <select
        name="labor_type"
        value={formData.labor_type}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Spontaneous">Spontaneous</option>
        <option value="Induced">Induced</option>
        <option value="None">None</option>
      </select>
    </div>
  </div>

  {/* Labor + Gender */}
  
</div>


      {/* ================= CONDITION AT BIRTH & RANDOMIZATION ================= */}
<div className="form-section soft-blue">
  <h3>Condition at Birth & Randomization</h3>

  {/* Respiratory effort + Muscle tone */}
  <div className="form-row">
    <div className="form-group">
      <label>Respiratory Effort</label>
      <select
        name="poor_resp_efforts"
        value={formData.poor_resp_efforts}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Absent/Poor</option>
        <option value="No">Normal</option>
      </select>
    </div>

    <div className="form-group">
      <label>Muscle Tone</label>
      <select
        name="poor_muscle_tone"
        value={formData.poor_muscle_tone}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Limp/Poor</option>
        <option value="No">Normal</option>
      </select>
    </div>
  </div>

  {/* Initial steps + Resuscitation required */}
  <div className="form-row">
    <div className="form-group">
      <label>Initial Steps</label>
      <select
        name="initial_steps"
        value={formData.initial_steps}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Required</option>
        <option value="No">Not Required</option>
      </select>
    </div>

    <div className="form-group">
  <label>Required Resuscitation Beyond Initial Steps<span className="required">*</span></label>

  <select
    name="required_resuscitation"
    value={formData.required_resuscitation}
    onChange={handleChange}
  >
    <option value="">-- Select --</option>
    <option value="Yes">Required</option>
    <option value="No">Not Requried</option>
  </select>

  

  {formData.required_resuscitation === "No" && (
    <div
      style={{
        marginTop: "12px",
        padding: "12px 14px",
        borderRadius: "8px",
        backgroundColor: "#fee2e2",
        border: "1px solid #fecaca",
        color: "#7f1d1d",
        fontWeight: 600,
        lineHeight: "1.4",
      }}
    >
      ❗ Resuscitation beyond initial steps not required.  
      Participation ends here. Please submit Form B.
    </div>
  )}
</div>

</div>




  {/* Show RANDOMIZATION only if resuscitation required = Yes */}
  {formData.required_resuscitation === "Yes" && (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Randomized<span className="required">*</span></label>
          <select
            name="randomised"
            value={formData.randomised}
            onChange={handleChange}required
          >
            <option value="">-- Select --</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
        {formData.randomised === "Yes" && (
        <div className="form-group">
          <label>Randomization Date</label>
          <DatePicker
  selected={
    formData.randomisation_date
      ? new Date(formData.randomisation_date)
      : null
  }
  onChange={(date) =>
    setFormData(prev => ({
      ...prev,
      randomisation_date: date
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
/>
        </div>)}

        {formData.randomised === "Yes" && (
  <div className="form-group">
    <label>Enrollment ID<span className="required">*</span></label>
    <input
      type="text"
      name="enrollment_id"
      value={formData.enrollment_id}
      onChange={handleChange}
      placeholder="SITE-A-001"
      pattern="^[A-Za-z0-9]+-[ABCD]-\d{3}$"
      required
    />
  </div>
)}
      </div>

      {/* Reason NOT randomized */}
      {formData.randomised === "No" && (
        <div className="form-group">
          <label>Reason Not Randomized</label>
          <select
            name="enrollment_reason_not_randomized"
            value={formData.enrollment_reason_not_randomized}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="GA ≥ 32 weeks">GA ≥ 32 weeks</option>
            <option value="Trial Nurse could not reach">Team absent</option>
            <option value="Non-trial location">Non-trial location</option>
            <option value="Missed">Missed</option>
            <option value="Multiple">Multiple</option>
            <option value="Withdrew">Withdrew</option>
            <option value="Other">Other</option>
          </select>
        </div>
      )}
    </>
  )}
</div>

{!endParticipation && formData.randomised !== "No" && (
  <div>


{/* ================= RESUSCITATION DETAILS ================= */}
<div className="form-section soft-blue">
  <h3>Resuscitation Details</h3>

  <div className="form-row">
    <div className="form-group">
      <label>Ventilation Required</label>
      <select
        name="ppv_required"
        value={formData.ppv_required}
        onChange={(e) => {
          handleChange(e);

          // reset dependent fields if No
          if (e.target.value === "No") {
            setFormData((prev) => ({
              ...prev,
              device_ppv: "",
              sib_peep: "",
              interface: "",
              ppv_duration: ""
            }));
          }
        }}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  </div>

  {/* SHOW ONLY IF YES */}
  {formData.ppv_required === "Yes" && (
    <>
      {/* Device */}
      <div className="form-row">
        <div className="form-group">
          <label>Device</label>
          <select
            name="device_ppv"
            value={formData.device_ppv}
            onChange={(e) => {
              handleChange(e);

              // reset sib_peep if not SIB
              if (
                e.target.value !== "Self-inflating bag" &&
                e.target.value !== "Both"
              ) {
                setFormData((prev) => ({
                  ...prev,
                  sib_peep: ""
                }));
              }
            }}
          >
            <option value="">-- Select --</option>
            <option value="T-piece">T-piece</option>
            <option value="Self-inflating bag">Self-inflating bag</option>
            <option value="Both">Both</option>
          </select>
        </div>

        {/* Interface */}
        <div className="form-group">
          <label>Interface</label>
          <select
            name="interface"
            value={formData.interface}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="Mask">Mask</option>
            <option value="LMA">LMA</option>
          </select>
        </div>
      </div>

      {/* SIB PEEP → only if SIB or BOTH */}
      {(formData.device_ppv === "Self-inflating bag" ||
        formData.device_ppv === "Both") && (
        <div className="form-row">
          <div className="form-group">
            <label>If SIB: With PEEP valve</label>
            <select
              name="sib_peep"
              value={formData.sib_peep}
              onChange={handleChange}
            >
              <option value="">-- Select --</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="form-row">
        <div className="form-group">
          <label>Duration of Ventilation (sec)</label>
          <input
            type="text"
            name="ppv_duration"
            value={formData.ppv_duration || ""}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => {
              const value = e.target.value;
              if (/^\d{0,4}$/.test(value)) {
                setFormData({
                  ...formData,
                  ppv_duration: value
                });
              }
            }}
            placeholder="seconds"
          />
        </div>
      </div>
    </>
  )}

  {/* Intubation (separate, always visible) */}
  <div className="form-row">
    <div className="form-group">
      <label>Endotracheal Intubation</label>
      <select
        name="intubation"
        value={formData.intubation}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  </div>

  {/* Chest compressions */}
 <div className="form-row">
    <div className="form-group">
      <label>Chest Compressions Required</label>
      <select
        name="chest_compression"
        value={formData.chest_compression}
        onChange={(e) => {
          handleChange(e);

          // reset dependent fields if No
          if (e.target.value === "No") {
            setFormData((prev) => ({
              ...prev,
              cc_duration: ""
            }));
          }
        }}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  </div>

  {/* SHOW ONLY IF YES */}
  {formData.chest_compression === "Yes" && (
    <div className="form-row">
      <div className="form-group">
        <label>Duration of Chest Compressions (sec)</label>
        <input
          type="text"
          name="cc_duration"
          value={formData.cc_duration || ""}
          inputMode="numeric"
          maxLength={4}
          onChange={(e) => {
            const value = e.target.value;

            // only digits (max 4)
            if (/^\d{0,4}$/.test(value)) {
              setFormData({
                ...formData,
                cc_duration: value
              });
            }
          }}
          placeholder="seconds"
        />
      </div>
    </div>
  )}

  {/* Epinephrine */}
   {/* Required */}
  <div className="form-row">
    <div className="form-group">
      <label>Epinephrine Given</label>
      <select
        name="adrenaline"
        value={formData.adrenaline}
        onChange={(e) => {
          handleChange(e);

          // reset if No
          if (e.target.value === "No") {
            setFormData((prev) => ({
              ...prev,
              med_doses: ""
            }));
          }
        }}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  </div>

  {/* SHOW ONLY IF YES */}
  {formData.adrenaline === "Yes" && (
    <div className="form-row">
      <div className="form-group">
        <label>No. of Doses</label>
        <input
          type="text"
          name="med_doses"
          value={formData.med_doses || ""}
          inputMode="numeric"
          maxLength={2}
          onChange={(e) => {
            const value = e.target.value;

            // only digits (max 2)
            if (/^\d{0,2}$/.test(value)) {
              setFormData({
                ...formData,
                med_doses: value
              });
            }
          }}
          placeholder="doses"
        />
      </div>
    </div>
  )}

  {/* Fluid + Placental */}
  
    <div className="form-group">
      <label>Fluid Bolus</label>
      <select
        name="fluid_bolus"
        value={formData.fluid_bolus}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>

     {/* Required */}
  <div className="form-row">
    <div className="form-group">
      <label>Placental Transfusion</label>
      <select
        name="placental_transfusion"
        value={formData.placental_transfusion}
        onChange={(e) => {
          handleChange(e);

          // reset dependent fields if No
          if (e.target.value === "No") {
            setFormData((prev) => ({
              ...prev,
              transfusion_method: "",
              cord_clamp_time: ""
            }));
          }
        }}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  </div>

  {/* SHOW ONLY IF YES */}
  {formData.placental_transfusion === "Yes" && (
    <>
      {/* Method */}
      <div className="form-row">
        <div className="form-group">
          <label>Method</label>
          <select
            name="transfusion_method"
            value={formData.transfusion_method}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="Deferred clamping">Deferred clamping</option>
            <option value="Intact cord milking">Intact cord milking</option>
          </select>
        </div>
      </div>

      {/* Cord clamp time */}
      <div className="form-row">
        <div className="form-group">
          <label>Cord Clamping Time (sec)</label>
          <input
  type="text"
  name="cord_clamp_time"
  value={formData.cord_clamp_time || ""}
  inputMode="numeric"
  maxLength={3}
  placeholder="0 – 300 sec"
  onChange={(e) => {
    const value = e.target.value;

    // allow only digits up to 3 digits
    if (/^\d{0,3}$/.test(value)) {
      setFormData({
        ...formData,
        cord_clamp_time: value
      });

      // ✅ LIVE VALIDATION
      setErrors(prev => ({
        ...prev,
        cord_clamp_time:
          value === ""
            ? "Required"
            : Number(value) > 300
            ? "Must be ≤ 300 seconds"
            : ""
      }));
    }
  }}
/>{errors.cord_clamp_time && (
  <div className="field-error">{errors.cord_clamp_time}</div>
)}
        </div>
      </div>
    </>
  )}
  

  
  

  {/* SpO2 + respiration */}
  <div className="form-row">
    <div className="form-group">
      <label>Time to Regular Respiration (sec)</label>
      <input
  type="text"
  name="time_to_respiration"
  value={formData.time_to_respiration || ""}
  inputMode="numeric"
  maxLength={3}
  placeholder="0 – 600 sec"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,3}$/.test(value)) {
      setFormData({
        ...formData,
        time_to_respiration: value
      });

      setErrors(prev => ({
        ...prev,
        time_to_respiration:
          value === ""
            ? "Required"
            : Number(value) > 600
            ? "Must be ≤ 600 sec"
            : ""
      }));
    }
  }}
/>

{errors.time_to_respiration && (
  <div className="field-error">{errors.time_to_respiration}</div>
)}
    </div>

    <div className="form-group">
      <label>SpO₂ at 5 minutes (%)</label>
      <input
  type="text"
  name="spo2_5min"
  value={formData.spo2_5min || ""}
  inputMode="numeric"
  maxLength={3}
  placeholder="0 – 100 %"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,3}$/.test(value)) {
      setFormData({
        ...formData,
        spo2_5min: value
      });

      setErrors(prev => ({
        ...prev,
        spo2_5min:
          value === ""
            ? "Required"
            : Number(value) > 100
            ? "Must be ≤ 100%"
            : ""
      }));
    }
  }}
/>

{errors.spo2_5min && (
  <div className="field-error">{errors.spo2_5min}</div>
)}
    </div>

    <div className="form-group">
  <label>Time to SpO₂ &gt; 80% (sec)</label>
  <input
  type="text"
  name="time_to_spo2_80"
  value={formData.time_to_spo2_80 || ""}
  inputMode="numeric"
  maxLength={3}
  placeholder="0 – 600 sec"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,3}$/.test(value)) {
      setFormData({
        ...formData,
        time_to_spo2_80: value
      });

      setErrors(prev => ({
        ...prev,
        time_to_spo2_80:
          value === ""
            ? "Required"
            : Number(value) > 600
            ? "Must be ≤ 600 sec"
            : ""
      }));
    }
  }}
/>

{errors.time_to_spo2_80 && (
  <div className="field-error">{errors.time_to_spo2_80}</div>
)}
</div>

    
  </div>
</div>

{/* ================= INTERVENTION TABLE ================= */}
<div
  className="form-section soft-blue"
  style={{
    padding: "20px",
    borderRadius: "14px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  }}
>
  <h3 style={{ marginBottom: "14px" }}>
    Resuscitation Interventions (Minute-wise)
  </h3>

  <div style={{ overflowX: "auto" }}>
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      <thead>
        <tr style={{ backgroundColor: "#eef4ff" }}>
          <th style={thStyle}>Intervention</th>
          {["1", "5", "10", "15", "20"].map((t) => (
            <th key={t} style={thStyle}>{t} min</th>
          ))}
        </tr>
      </thead>

      <tbody>
        {[
          "oxygen",
          "ventilation",
          "chest_compression",
          "intubation",
          "medication",
          "fluid_bolus",
          "cpap",
        ].map((type) => (
          <tr key={type}>
            <td style={rowLabelStyle}>
              {type.replace("_", " ")}
            </td>

            {["1", "5", "10", "15", "20"].map((t) => (
              <td key={t} style={cellStyle}>
                <select
  value={formData.interventions[type]?.[t] || ""}
  onChange={(e) =>
    handleInterventionChange(type, t, e.target.value)
  }
  disabled={
    type === "chest_compression" &&
    formData.chest_compression === "No"
  }
>
                  <option value="">—</option>
                  <option value="Yes">Y</option>
                  <option value="No">N</option>
                </select>
              </td>
            ))}
          </tr>
        ))}

        {/* ===== APGAR SCORE ===== */}
        <tr style={{ backgroundColor: "#fafbff" }}>
          <td style={{ ...rowLabelStyle, fontWeight: 700 }}>
            Apgar score
          </td>

          {["1", "5", "10", "15", "20"].map((t) => (
            <td key={t} style={cellStyle}>
              <input
  type="text"
  inputMode="numeric"
  maxLength={2}
  placeholder="0–10"
  value={formData.interventions.apgar?.[t] || ""}
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,2}$/.test(value)) {
      if (value === "" || Number(value) <= 10) {
        handleInterventionChange("apgar", t, value);
      }
    }
  }}
  className={getApgarColor(formData.interventions.apgar?.[t])}
  style={{
    width: "60px",
    padding: "6px",
    borderRadius: "6px",
    textAlign: "center",
  }}
/>
            </td>
          ))}
        </tr>
        <tr>
  <td style={{ ...rowLabelStyle, fontWeight: 600 }}>
    Trend
  </td>

  {["1", "5", "10", "15", "20"].map((t, i, arr) => {
    const current = Number(formData.interventions.apgar?.[t] || 0);
    const prev = Number(formData.interventions.apgar?.[arr[i - 1]] || 0);

    let symbol = "•";

    if (i !== 0 && current) {
      if (current > prev) symbol = "⬆️";
      else if (current < prev) symbol = "⬇️";
      else symbol = "➡️";
    }

    return (
      <td key={t} style={{ ...cellStyle, fontSize: "16px" }}>
        {symbol}
      </td>
    );
  })}
</tr>
      </tbody>
    </table>
  </div>
</div>


{/* ================= CORD BLOOD & RESUSCITATION EXIT ================= */}
<div className="form-section soft-blue">
  <h3>Cord Blood & Resuscitation Exit</h3>

  {/* Cord Blood Analysis */}
  <div className="form-row">
    <div className="form-group">
      <label>Cord Blood Analysis</label>
      <select
        name="cord_blood_done"
        value={formData.cord_blood_done}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  </div>

  {/* Cord Blood Values */}
  {formData.cord_blood_done === "Yes" && (
    <div className="form-row">
      <div className="form-group">
        <label>pH</label>
        <input
  type="text"
  name="cord_ph"
  value={formData.cord_ph || ""}
  placeholder="6.8 – 7.8"
  onChange={(e) => {
    const value = e.target.value;

    // allow decimal (max 2 digits after .)
    if (/^\d*\.?\d{0,2}$/.test(value)) {
      setFormData({
        ...formData,
        cord_ph: value
      });

      setErrors(prev => ({
        ...prev,
        cord_ph:
          value === ""
            ? ""
            : Number(value) < 6.8 || Number(value) > 7.8
            ? "pH must be between 6.8 – 7.8"
            : ""
      }));
    }
  }}
/>

{errors.cord_ph && (
  <div className="field-error">{errors.cord_ph}</div>
)}
      </div>

      <div className="form-group">
        <label>Base Excess (BE)</label>
        <input
  type="text"
  name="cord_be"
  value={formData.cord_be || ""}
  placeholder="-30 to +30"
  onChange={(e) => {
    const value = e.target.value;

    // allow negative + decimal
    if (/^-?\d*\.?\d{0,1}$/.test(value)) {
      setFormData({
        ...formData,
        cord_be: value
      });

      setErrors(prev => ({
        ...prev,
        cord_be:
          value === ""
            ? ""
            : Number(value) < -30 || Number(value) > 30
            ? "BE must be between -30 to +30"
            : ""
      }));
    }
  }}
/>

{errors.cord_be && (
  <div className="field-error">{errors.cord_be}</div>
)}
      </div>

      <div className="form-group">
        <label>pCO₂</label>
        <input
  type="text"
  name="cord_pco2"
  value={formData.cord_pco2 || ""}
  placeholder="10 – 100 mmHg"
  inputMode="numeric"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,3}$/.test(value)) {
      setFormData({
        ...formData,
        cord_pco2: value
      });

      setErrors(prev => ({
        ...prev,
        cord_pco2:
          value === ""
            ? ""
            : Number(value) < 10 || Number(value) > 100
            ? "pCO₂ must be between 10–100"
            : ""
      }));
    }
  }}
/>

{errors.cord_pco2 && (
  <div className="field-error">{errors.cord_pco2}</div>
)}
      </div>
    </div>
  )}

  {/* Resuscitation Exit */}
  <div className="form-row">
    <div className="form-group">
      <label>Resuscitation Failure</label>
      <select
        name="resus_failure"
        value={formData.resus_failure}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>

    <div className="form-group">
      <label>FiO₂ at Exit from trial gas(%)</label>
      <input
      type="text"
      name="fio2_exit"
      value={formData.fio2_exit || ""}
      inputMode="numeric"
      maxLength={3}
      onChange={(e) => {
        const value = e.target.value;

        // allow only numbers 0–100
        if (/^\d{0,3}$/.test(value)) {
          if (value === "" || Number(value) <= 100) {
            setFormData({
              ...formData,
              fio2_exit: value
            });
          }
        }
      }}
      placeholder="0–100"
    />
    </div>
  </div>

  

  {/* SpO2 & Total Time */}
  <div className="form-row">
    <div className="form-group">
      <label>SpO₂ at Exit from trial gas(%)</label>
      <input
      type="text"
      name="spo2_exit_trial_gas"
      value={formData.spo2_exit_trial_gas || ""}
      inputMode="numeric"
      maxLength={3}
      onChange={(e) => {
        const value = e.target.value;

        // allow only numbers 0–100
        if (/^\d{0,3}$/.test(value)) {
          if (value === "" || Number(value) <= 100) {
            setFormData({
              ...formData,
              spo2_exit_trial_gas: value
            });
          }
        }
      }}
      placeholder="0–100"
    />
    </div>
    <div className="form-group">
  <label>Total Time (min)</label>
  <input
    type="text"
    name="total_resus_time"
    value={formData.total_resus_time || ""}
    inputMode="numeric"
    maxLength={3}
    onChange={(e) => {
      const value = e.target.value;

      // allow only numbers (0–999)
      if (/^\d{0,3}$/.test(value)) {
        setFormData({
          ...formData,
          total_resus_time: value
        });
      }
    }}
    placeholder="minutes"
  />
</div>

   
  </div>
  <div className="form-row">
  <div className="form-group">
    <label>Reason for Exit</label>
    <select
      name="reason_exit_trial_gas"
      value={formData.reason_exit_trial_gas || ""}
      onChange={handleChange}
    >
      <option value="">-- Select --</option>
      <option value="Responded to trial gas">
        Responded to trial gas
      </option>
      <option value="Required override to 100% O2 or CC">
        Required override to 100% O₂ or CC
      </option>
      <option value="Other">Other</option>
    </select>
  </div>

  {/* ✅ SHOW ONLY IF OTHER */}
  {formData.reason_exit_trial_gas === "Other" && (
    <div className="form-group">
      <label>Specify Other</label>
      <input
        type="text"
        name="reason_exit_trial_gas_other"
        value={formData.reason_exit_trial_gas_other || ""}
        onChange={handleChange}
        placeholder="Enter reason"
      />
    </div>
  )}
</div>
</div>

</div>
)}


     <div className="form-navigation">

  {/* ✅ PREVIOUS BUTTON */}
  <button
    type="button"
    className="btn btn-secondary"
    onClick={handlePrevious}
  >
    ← Previous
  </button>

  {/* SAVE */}
  <button
    type="button"
    className="btn btn-save"
    onClick={saveForm}
  >
    Save
  </button>

  {/* NEXT */}
  <button
    type="button"
    className="btn btn-primary"
    onClick={handleNext}
    disabled={!isSaved}
  >
    Next →
  </button>

  {/* EDIT */}
  {isSaved && (
    <button
      type="button"
      className="edit-btn"
      onClick={() => setIsEditing(prev => !prev)}
    >
      {isEditing ? "✅ Done" : "✏️ Edit"}
    </button>
  )}

</div>
      {message && <p className="form-message">{message}</p>}
    </form>

    {showMissingModal && (
  <div className="modal-overlay">
    <div className="modal-box">
      <h3>⚠️ Missing Required Fields</h3>

      <ul>
        {missingFields.map((field, index) => (
          <li key={index}>{field}</li>
        ))}
      </ul>

      <button onClick={() => setShowMissingModal(false)}>
        OK
      </button>
    </div>
  </div>
)}
    </>
  );
}
