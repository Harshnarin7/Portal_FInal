import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import FormLayout from "./components/FormLayout";

import { useFormProgress } from "./context/FormProgressContext";
import { useParams } from "react-router-dom";
import { usePatient } from "./context/PatientContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function FormE() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { enrollmentId } = useParams();
  const [errors, setErrors] = useState({});
  
  const [formData, setFormData] = useState({
    enrollment_id: "",

    baby_uid: "",
    annual_number: "",
    baby_name: "",
    date_of_birth: "",

    admission_datetime: "",
    age_at_admission_hours: "",

    temp_skin: "",
    temp_axillary: "",
    transport_incubator: "",
    transport_mode: "",
    transport_mode_other: "",
    nicu_mode_other: "", 

    additional_heating: "",
    heating_type_other: "",
    heating_type: "",

    transport_adverse_event: "",
    adverse_event_type: "",
    tube_accident_type: "",

    transport_mode_resp: "",
    adverse_event_other: "",
    transport_cpap: "",
    transport_pip: "",
    transport_peep: "",
    transport_map: "",
    transport_fio2: "",

    nicu_mode_resp: "",
    nicu_cpap: "",
    nicu_pip: "",
    nicu_peep: "",
    nicu_map: "",
    nicu_fio2: "",

    completed_by: "",
    designation: "",
    completion_date: "",
  });
  const formatDateTime = (dt) => {
  if (!dt) return "";

  // already correct format
  if (dt.includes("T")) return dt;

  const date = new Date(dt);

  if (isNaN(date)) return "";

  return date.toISOString().slice(0, 16);
};
useEffect(() => {
  if (!enrollmentId) return;

  // 🔥 STEP 1: Fetch Form B (MAIN SOURCE)
  api.get(`/birth-resuscitation/${enrollmentId}`)
    .then(res => {
      const b = res?.data || {};

      const formatDOB = (dob) => {
        if (!dob) return "";
        if (dob.includes("-")) return dob;

        if (dob.includes("/")) {
          const [dd, mm, yyyy] = dob.split("/");
          return `${yyyy}-${mm}-${dd}`;
        }

        return "";
      };

      setFormData(prev => ({
        ...prev,
        enrollment_id: enrollmentId,
        baby_uid: b?.baby_uid || "",
        baby_name: b?.baby_name || "",
        annual_number: b?.annual_number || "",
        date_of_birth: formatDOB(b?.date_of_birth),
      }));
    });

  // 🔥 STEP 2: Fetch Form D (ONLY admission data)
  api.get(`/postnatal-day1/${enrollmentId}`)
    .then(res => {
      const d = res.data || {};

      setFormData(prev => ({
        ...prev,
        admission_datetime: formatDateTime(d.admission_datetime)
      }));
    });

}, [enrollmentId]);
useEffect(() => {
  if (!formData.date_of_birth || !formData.admission_datetime) return;

  // Fix DOB
  const birth = new Date(formData.date_of_birth + "T00:00:00");

  // 🔥 FIX: force correct parsing
  const admission = new Date(
    formData.admission_datetime.replace("T", " ")
  );

  console.log("DOB:", birth);
  console.log("Admission:", admission);

  if (isNaN(birth.getTime()) || isNaN(admission.getTime())) {
    console.log("❌ Invalid date");
    return;
  }

  const diffHours = Math.floor(
    (admission.getTime() - birth.getTime()) / (1000 * 60 * 60)
  );

  console.log("Hours:", diffHours);

  if (diffHours >= 0) {
    setFormData(prev => ({
      ...prev,
      age_at_admission_hours: diffHours
    }));
  }

}, [formData.date_of_birth, formData.admission_datetime]);
 const handleChange = (e) => {
  const { name, value } = e.target;

  let updatedValue = value;
  let errorMsg = "";

  // ✅ DATETIME FIX (KEEP)
  if (name === "admission_datetime" && value && value.includes("/")) {
    const date = new Date(value);
    if (!isNaN(date)) {
      updatedValue = date.toISOString().slice(0, 16);
    }
  }

  // ================= BASIC VALIDATIONS =================

  // 🔹 Temperature (30–40 °C)
  if (name === "temp_skin" || name === "temp_axillary") {
    if (value && (Number(value) < 30 || Number(value) > 40)) {
      errorMsg = "Must be between 30–40 °C";
    }
  }

  // 🔹 FiO2 (0–100)
  if (name === "transport_fio2" || name === "nicu_fio2") {
    if (value && (Number(value) < 0 || Number(value) > 100)) {
      errorMsg = "Must be between 0–100%";
    }
  }

  // 🔹 Age (0–99)
  if (name === "age_at_admission_hours") {
    if (value && Number(value) > 99) {
      errorMsg = "Must be between 0–99 hours";
    }
  }
  if (name === "adverse_event_other") {
  if (formData.adverse_event_type === "Other" && !value) {
    errorMsg = "Specify adverse event";
  } else if (value && !/^[A-Za-z\s]+$/.test(value)) {
    errorMsg = "Only letters are allowed";
  }
}

  // ================= REQUIRED FIELDS =================

  const requiredFields = [
    "admission_datetime",
    "temp_skin",
    "temp_axillary",
    "additional_heating",
    "transport_incubator",
    "transport_adverse_event",
    "transport_mode_resp",
    "nicu_mode_resp",
    "completed_by"
  ];

 // ================= REQUIRED =================
if (requiredFields.includes(name) && !value) {
  errorMsg = "This field is required";
}

// ================= TEMPERATURE =================
if (["temp_skin", "temp_axillary"].includes(name)) {
  if (value && (Number(value) < 30 || Number(value) > 40)) {
    errorMsg = "Must be between 30–40 °C";
  }
}

// ================= FiO2 =================
if (["transport_fio2", "nicu_fio2"].includes(name)) {
  if (value && (Number(value) < 0 || Number(value) > 100)) {
    errorMsg = "Must be between 0–100%";
  }
}

// ================= AGE =================
if (name === "age_at_admission_hours") {
  if (value && Number(value) > 99) {
    errorMsg = "Must be between 0–99 hours";
  }
}

if (name === "transport_mode_other") {
  if (formData.transport_mode_resp === "Other" && !value) {
    errorMsg = "Specify transport mode";
  } else if (value && !/^[A-Za-z\s]+$/.test(value)) {
    errorMsg = "Only letters are allowed";
  }
}

if (name === "transport_cpap") {
  if (!value) {
    errorMsg = "This field is required";
  } else if (Number(value) < 2 || Number(value) > 12) {
    errorMsg = "Range must be 2–12";
  }
}

if (name === "transport_mode") {
  if (formData.transport_incubator === "No" && !value) {
    errorMsg = "Transport mode is required";
  } else if (value && !/^[A-Za-z\s]+$/.test(value)) {
    errorMsg = "Only letters are allowed";
  }
}

// ================= NUMERIC RANGES =================
if (name === "transport_cpap" && value && (value < 2 || value > 12)) {
  errorMsg = "Range: 2–12";
}

if (name === "transport_pip" && value && (value < 10 || value > 40)) {
  errorMsg = "Range: 10–40";
}

if (name === "transport_peep" && value && (value < 2 || value > 10)) {
  errorMsg = "Range: 2–10";
}

if (name === "transport_map" && value && (value < 5 || value > 20)) {
  errorMsg = "Range: 5–20";
}

// NICU
if (name === "nicu_cpap" && value && (value < 2 || value > 12)) {
  errorMsg = "Range: 2–12";
}

if (name === "nicu_pip" && value && (value < 10 || value > 40)) {
  errorMsg = "Range: 10–40";
}

if (name === "nicu_peep" && value && (value < 2 || value > 10)) {
  errorMsg = "Range: 2–10";
}

if (name === "nicu_map" && value && (value < 5 || value > 20)) {
  errorMsg = "Range: 5–20";
}

// ================= CONDITIONAL =================

// Heating
if (name === "heating_type" && formData.additional_heating === "Yes" && !value) {
  errorMsg = "Select heating type";
}

if (name === "heating_type_other" && formData.heating_type === "Other" && !value) {
  errorMsg = "Specify heating method";
}

// Transport
if (name === "transport_mode" && formData.transport_incubator === "No" && !value) {
  errorMsg = "Specify transport mode";
}

if (name === "heating_type_other") {
  if (!value) {
    errorMsg = "Specify heating method";
  } else if (!/^[A-Za-z\s]+$/.test(value)) {
    errorMsg = "Only letters are allowed";
  }
}

// Adverse events
if (name === "adverse_event_type" && formData.transport_adverse_event === "Yes" && !value) {
  errorMsg = "Select adverse event";
}

if (name === "adverse_event_other" && formData.adverse_event_type === "Other" && !value) {
  errorMsg = "Specify adverse event";
}

if (name === "tube_accident_type" && formData.adverse_event_type === "Tube accident" && !value) {
  errorMsg = "Select tube accident type";
}

// Mode other
if (name === "transport_mode_other" && formData.transport_mode_resp === "Other" && !value) {
  errorMsg = "Specify mode";
}

if (name === "nicu_mode_other" && formData.nicu_mode_resp === "Other" && !value) {
  errorMsg = "Specify mode";
}

  // ================= UPDATE STATE =================

  setFormData((prev) => ({
    ...prev,
    [name]: updatedValue
  }));

  setErrors((prev) => ({
    ...prev,
    [name]: errorMsg
  }));
};

  const yesNoToBool = (v) => {
  if (v === "Yes") return true;
  if (v === "No") return false;
  return null;
};

const num = (v) => (v === "" ? null : Number(v));


  const handleSubmit = async (e) => {
  e.preventDefault();
  

  



if (
  formData.transport_fio2 &&
  (Number(formData.transport_fio2) < 0 ||
   Number(formData.transport_fio2) > 100)
) {
  alert("Transport FiO₂ must be between 0 and 100%");
  return;
}

if (
  formData.nicu_fio2 &&
  (Number(formData.nicu_fio2) < 0 ||
   Number(formData.nicu_fio2) > 100)
) {
  alert("NICU FiO₂ must be between 0 and 100%");
  return;
}

  const payload = {
    enrollment_id: formData.enrollment_id,
    baby_uid: formData.baby_uid,
    annual_number: formData.annual_number,
    baby_name: formData.baby_name,

    admission_datetime: formData.admission_datetime || null,
    age_at_admission_hours: num(formData.age_at_admission_hours),

    temp_skin: num(formData.temp_skin),
    temp_axillary: num(formData.temp_axillary),

    transport_incubator: yesNoToBool(formData.transport_incubator),
    transport_mode: formData.transport_mode,

    additional_heating: yesNoToBool(formData.additional_heating),
    heating_type:
  formData.heating_type === "Other"
    ? formData.heating_type_other
    : formData.heating_type,

    transport_adverse_event: yesNoToBool(formData.transport_adverse_event),
    adverse_event_type:
  formData.adverse_event_type === "Other"
    ? formData.adverse_event_other
    : formData.adverse_event_type,
    tube_accident_type: formData.tube_accident_type,

    transport_mode_resp:
  formData.transport_mode_resp === "Other"
    ? formData.transport_mode_other
    : formData.transport_mode_resp,

    transport_fio2: num(formData.transport_fio2),

    nicu_mode_resp:
  formData.nicu_mode_resp === "Other"
    ? formData.nicu_mode_other
    : formData.nicu_mode_resp,
    nicu_fio2: num(formData.nicu_fio2),

    completed_by: formData.completed_by,
    designation: formData.designation,
    completion_date: formData.completion_date || null,
  };

  try {
    await api.post("/nicu-admission/", payload);
    markFormCompleted("form_e");
    alert("✅ Form E submitted successfully");
   
    navigate(`/form-f/${enrollmentId}`);

  } catch (err) {
    console.error(err.response?.data || err);
    alert("❌ Error submitting Form E");
  }
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



  return (
    
    <form className="screening-form" onSubmit={handleSubmit}>
      <div className="form-a-header">
  <div className="form-a-header-main"> <h2 >Form E — NICU Admission</h2>
</div></div>
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
        onChange={handleChange}
        readOnly
      />
    </div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>Annual Number (REDCap)</label>
      <input
        name="annual_number"
        value={formData.annual_number || ""} readOnly
        onChange={handleChange}
      />
    </div>

    <div className="form-group">
      <label>Baby Name</label>
      <input
        name="baby_name"
        value={formData.baby_name || ""}
        onChange={handleChange}
        readOnly
      />
    </div>
  </div>
</div>


      {/* ================= NICU ADMISSION DETAILS ================= */}
<div className="form-section soft-blue">
  <h3>NICU Admission Details</h3>

  <div className="form-row">
    <div className="form-group">
      <label>Date & Time of NICU Admission<span className="required">*</span></label>
      <DatePicker
  selected={
    formData.admission_datetime
      ? new Date(formData.admission_datetime)
      : null
  }
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      admission_datetime: date ? date.toISOString() : ""
    }))
  }
  showTimeSelect
  timeFormat="HH:mm"
  timeIntervals={1}
  dateFormat="dd-MM-yyyy | HH:mm"
  placeholderText="Select date & time"
/>
    </div>

    <div className="form-group">
      <label>Age at admission (hours)<span className="required">*</span></label>
      <input
  type="text"
  name="age_at_admission_hours"
  value={formData.age_at_admission_hours || ""}
  readOnly
  placeholder="Auto-calculated"
  required
/>
    </div>
  </div>
</div>


      {/* ================= TEMPERATURE & TRANSPORT ================= */}
<div className="form-section soft-blue">
  <h3>NICU TRANSPORT DETAILS</h3>

  {/* Temperature */}
  <div className="form-row">
    <div className="form-group">
      <label>Skin Temperature (°C)<span className="required">*</span></label>
      <input
  type="number"
  step="0.1"
  name="temp_skin"
  placeholder="30–40 °C"
  value={formData.temp_skin || ""}
  onChange={handleChange}
  className={errors.temp_skin ? "error-input" : ""}
/>

{errors.temp_skin && (
  <div className="error-text">{errors.temp_skin}</div>
)}
    </div>

    <div className="form-group">
      <label>Axillary Temperature (°C)<span className="required">*</span></label>
      <input
  type="number"
  step="0.1"
  name="temp_axillary"
  placeholder="30–40 °C"
  value={formData.temp_axillary || ""}
  onChange={handleChange}
  className={errors.temp_axillary ? "error-input" : ""}
/>

{errors.temp_axillary && (
  <div className="error-text">{errors.temp_axillary}</div>
)}
    </div>
  </div>

  

  {/* Additional heating */}
  <div className="form-group">
    <label>Additional heating provided<span className="required">*</span></label>
    <select
      name="additional_heating"
      value={formData.additional_heating || ""}
      onChange={handleChange}
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.additional_heating === "Yes" && (
  <>

    <div className="followup-box">
    <div className="form-group">
      <label>Type<span className="required">*</span></label>
      <select
        name="heating_type"
        value={formData.heating_type || ""}
        onChange={(e) => {
          const value = e.target.value;
          setFormData(prev => ({
            ...prev,
            heating_type: value,
            heating_type_other: ""   // reset other when changing
          }));
        }}
        required
      >
        <option value="">-- Select --</option>
        <option value="Gel pack">Gel pack</option>
        <option value="PCM">PCM</option>
        <option value="Plastic wrap">Plastic wrap</option>
        <option value="Hat">Hat</option>
        <option value="Other">Other</option>
      </select>
    </div>
    </div>

   {formData.heating_type === "Other" && (
  <div className="followup-box">
    <div className="form-group">
      <label>
        Specify Other<span className="required">*</span>
      </label>

      <input
        type="text"
        name="heating_type_other"
        value={formData.heating_type_other || ""}
        onChange={(e) => {
          const value = e.target.value;

          // ✅ Allow only letters + space
          if (/^[A-Za-z\s]*$/.test(value)) {
            handleChange(e);
          }
        }}
        className={errors.heating_type_other ? "error-input" : ""}
        placeholder="e.g. Warm cloth, Heated mattress"
      />

      {errors.heating_type_other && (
        <div className="error-text">
          {errors.heating_type_other}
        </div>
      )}
    </div>
  </div>
)}
  </>
)}
{/* Transport incubator */}
  <div className="form-group">
    <label>Transport incubator used<span className="required">*</span></label>
    <select
      name="transport_incubator"
      value={formData.transport_incubator || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.transport_incubator === "No" && (
  <div className="followup-box">
    <div className="form-group">
      <label>
        If No, mode of transport<span className="required">*</span>
      </label>

      <input
        type="text"
        name="transport_mode"
        value={formData.transport_mode || ""}
        onChange={(e) => {
          const value = e.target.value;

          // ✅ Allow only letters + spaces
          if (/^[A-Za-z\s]*$/.test(value)) {
            handleChange(e);
          }
        }}
        onKeyDown={(e) => {
          // ✅ Block numbers & special chars
          if (
            !/[A-Za-z\s]/.test(e.key) &&
            e.key !== "Backspace" &&
            e.key !== "Tab"
          ) {
            e.preventDefault();
          }
        }}
        className={errors.transport_mode ? "error-input" : ""}
        placeholder="e.g. Ambulance, Kangaroo transport"
      />

      {errors.transport_mode && (
        <div className="error-text">
          {errors.transport_mode}
        </div>
      )}
    </div>
  </div>
)}
  {/* Transport adverse events */}
  <div className="form-group">
    <label>Adverse events during transport<span className="required">*</span></label>
    <select
      name="transport_adverse_event"
      value={formData.transport_adverse_event || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.transport_adverse_event === "Yes" && (
  <><div className="followup-box">
    <div className="form-group">
      <label>Type of adverse event<span className="required">*</span></label>
      <select
        name="adverse_event_type"
        value={formData.adverse_event_type || ""}
        onChange={(e) => {
          const value = e.target.value;
          setFormData(prev => ({
            ...prev,
            adverse_event_type: value,
            adverse_event_other: ""  // reset if changed
          }));
        }}
        required
      >
        <option value="">-- Select --</option>
        <option value="Apnea">Apnea</option>
        <option value="Bradycardia">Bradycardia</option>
        <option value="Tube accident">Tube accident</option>
        <option value="Other">Other</option>
      </select>
    </div>
    </div>

    {/* If Tube accident selected */}
    {formData.adverse_event_type === "Tube accident" && (
      <div className="followup-box">
      <div className="form-group">
        <label>Tube accident type<span className="required">*</span></label>
        <select
          name="tube_accident_type"
          value={formData.tube_accident_type || ""}
          onChange={handleChange}
          required
        >
          <option value="">-- Select --</option>
          <option value="Displacement">Displacement</option>
          <option value="Blockage">Blockage</option>
        </select>
      </div>
      </div>
    )}

    {/* If Other selected */}
{formData.adverse_event_type === "Other" && (
  <div className="followup-box">
    <div className="form-group">
      <label>
        Specify Other<span className="required">*</span>
      </label>

      <input
        type="text"
        name="adverse_event_other"
        value={formData.adverse_event_other || ""}
        onChange={(e) => {
          const value = e.target.value;

          // ✅ Allow only letters + spaces
          if (/^[A-Za-z\s]*$/.test(value)) {
            handleChange(e);
          }
        }}
        onKeyDown={(e) => {
          // ✅ Block numbers & special chars
          if (
            !/[A-Za-z\s]/.test(e.key) &&
            e.key !== "Backspace" &&
            e.key !== "Tab"
          ) {
            e.preventDefault();
          }
        }}
        className={errors.adverse_event_other ? "error-input" : ""}
        placeholder="e.g. Hypothermia, Apnea"
      />

      {errors.adverse_event_other && (
        <div className="error-text">
          {errors.adverse_event_other}
        </div>
      )}
    </div>
  </div>
)}
  </>
)}
</div>

      {/* ================= RESPIRATORY SUPPORT ================= */}
<div className="form-section soft-blue">
  <h3>Respiratory Support</h3>

  {/* -------- During Transport -------- */}
  <h4 style={{ marginTop: "10px" }}>During Transport</h4>

  <div className="form-group">
  <label>Mode<span className="required">*</span></label>
  <select
    name="transport_mode_resp"
    value={formData.transport_mode_resp || ""}
    onChange={(e) => {
      const value = e.target.value;
      setFormData(prev => ({
        ...prev,
        transport_mode_resp: value,
        transport_mode_other: ""   // reset if changed
      }));
    }}required
  >
    <option value="">-- Select --</option>
    <option value="Room air">Room air</option>
    <option value="CPAP">CPAP</option>
    <option value="NIPPV">NIPPV</option>
    <option value="IMV">IMV</option>
    <option value="HFO">HFO</option>
    <option value="Other">Other</option>
  </select>
</div>

{/* If Other selected */}
{formData.transport_mode_resp === "Other" && (
  <div className="followup-box">
    <div className="form-group">
      <label>
        Specify Other Mode<span className="required">*</span>
      </label>

      <input
        type="text"
        name="transport_mode_other"
        value={formData.transport_mode_other || ""}
        onChange={(e) => {
          const value = e.target.value;

          // ✅ Allow only letters + spaces
          if (/^[A-Za-z\s]*$/.test(value)) {
            handleChange(e);
          }
        }}
        onKeyDown={(e) => {
          // ✅ Block numbers & special characters
          if (
            !/[A-Za-z\s]/.test(e.key) &&
            e.key !== "Backspace" &&
            e.key !== "Tab"
          ) {
            e.preventDefault();
          }
        }}
        className={errors.transport_mode_other ? "error-input" : ""}
        placeholder="e.g. Nasal CPAP, Ventilator"
      />

      {errors.transport_mode_other && (
        <div className="error-text">
          {errors.transport_mode_other}
        </div>
      )}
    </div>
  </div>
)}

  <div className="form-row">
    <div className="form-group">
      <label>CPAP (cm H₂O)</label>
      <input
  type="number"
  name="transport_cpap"
  value={formData.transport_cpap || ""}
  placeholder="2–12"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (for editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Allow only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out of range
    if (num < 2 || num > 12) {
      handleChange({
        target: { name: "transport_cpap", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 12) value = 12;
    if (value < 2) value = 2;

    handleChange({
      target: { name: "transport_cpap", value }
    });
  }}
  className={errors.transport_cpap ? "error-input" : ""}
/>

{errors.transport_cpap && (
  <div className="error-text">{errors.transport_cpap}</div>
)}
    </div>

    <div className="form-group">
      <label>PIP (cm H₂O)</label>
      <input
  type="number"
  name="transport_pip"
  value={formData.transport_pip || ""}
  placeholder="10–40"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out-of-range typing
    if (num < 10 || num > 40) {
      handleChange({
        target: { name: "transport_pip", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 40) value = 40;
    if (value < 10) value = 10;

    handleChange({
      target: { name: "transport_pip", value }
    });
  }}
  className={errors.transport_pip ? "error-input" : ""}
/>

{errors.transport_pip && (
  <div className="error-text">{errors.transport_pip}</div>
)}
    </div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>PEEP (cm H₂O)</label>
      <input
  type="number"
  name="transport_peep"
  value={formData.transport_peep || ""}
  placeholder="2–10"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (for editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Allow only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out-of-range typing
    if (num < 2 || num > 10) {
      handleChange({
        target: { name: "transport_peep", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 10) value = 10;
    if (value < 2) value = 2;

    handleChange({
      target: { name: "transport_peep", value }
    });
  }}
  className={errors.transport_peep ? "error-input" : ""}
/>

{errors.transport_peep && (
  <div className="error-text">{errors.transport_peep}</div>
)}
    </div>

    <div className="form-group">
      <label>MAP (cm H₂O)</label>
      <input
  type="number"
  name="transport_map"
  value={formData.transport_map || ""}
  placeholder="5–20"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out-of-range typing
    if (num < 5 || num > 20) {
      handleChange({
        target: { name: "transport_map", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 20) value = 20;
    if (value < 5) value = 5;

    handleChange({
      target: { name: "transport_map", value }
    });
  }}
  className={errors.transport_map ? "error-input" : ""}
/>

{errors.transport_map && (
  <div className="error-text">{errors.transport_map}</div>
)}
    </div>
  </div>

  <div className="form-group">
    <label>FiO₂ (%)</label>
    <input
  type="number"
  name="transport_fio2"
  value={formData.transport_fio2 || ""}
  onChange={handleChange}
  className={errors.transport_fio2 ? "error-input" : ""}
/>

{errors.transport_fio2 && (
  <div className="error-text">{errors.transport_fio2}</div>
)}
  </div>

  {/* -------- In NICU -------- */}
  <h4 style={{ marginTop: "20px" }}>In NICU (after stabilization)</h4>

  <div className="form-group">
  <label>Mode<span className="required">*</span></label>
  <select
    name="nicu_mode_resp"
    value={formData.nicu_mode_resp || ""}
    onChange={(e) => {
      const value = e.target.value;
      setFormData(prev => ({
        ...prev,
        nicu_mode_resp: value,
        nicu_mode_other: ""
      }));
    }}required
  >
    <option value="">-- Select --</option>
    <option value="Room air">Room air</option>
    <option value="CPAP">CPAP</option>
    <option value="NIPPV">NIPPV</option>
    <option value="IMV">IMV</option>
    <option value="HFO">HFO</option>
    <option value="Other">Other</option>
  </select>
</div>

{/* If Other selected */}
{formData.nicu_mode_resp === "Other" && (
  <div className="followup-box">
    <div className="form-group">
      <label>
        Specify Other Mode<span className="required">*</span>
      </label>

      <input
        type="text"
        name="nicu_mode_other"
        value={formData.nicu_mode_other || ""}
        onChange={(e) => {
          const value = e.target.value;

          // ✅ Allow only letters + spaces
          if (/^[A-Za-z\s]*$/.test(value)) {
            handleChange(e);
          }
        }}
        onKeyDown={(e) => {
          // ✅ Block numbers & special characters
          if (
            !/[A-Za-z\s]/.test(e.key) &&
            e.key !== "Backspace" &&
            e.key !== "Tab"
          ) {
            e.preventDefault();
          }
        }}
        className={errors.nicu_mode_other ? "error-input" : ""}
        placeholder="e.g. High flow nasal cannula"
      />

      {errors.nicu_mode_other && (
        <div className="error-text">
          {errors.nicu_mode_other}
        </div>
      )}
    </div>
  </div>
)}

  <div className="form-row">
    <div className="form-group">
      <label>CPAP (cm H₂O)</label>
      <input
  type="number"
  name="nicu_cpap"
  value={formData.nicu_cpap || ""}
  placeholder="2–12"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out-of-range typing
    if (num < 2 || num > 12) {
      handleChange({
        target: { name: "nicu_cpap", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 12) value = 12;
    if (value < 2) value = 2;

    handleChange({
      target: { name: "nicu_cpap", value }
    });
  }}
  className={errors.nicu_cpap ? "error-input" : ""}
/>

{errors.nicu_cpap && (
  <div className="error-text">{errors.nicu_cpap}</div>
)}
    </div>

    <div className="form-group">
      <label>PIP (cm H₂O)</label>
     <input
  type="number"
  name="nicu_pip"
  value={formData.nicu_pip || ""}
  placeholder="10–40"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out-of-range typing
    if (num < 10 || num > 40) {
      handleChange({
        target: { name: "nicu_pip", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 40) value = 40;
    if (value < 10) value = 10;

    handleChange({
      target: { name: "nicu_pip", value }
    });
  }}
  className={errors.nicu_pip ? "error-input" : ""}
/>

{errors.nicu_pip && (
  <div className="error-text">{errors.nicu_pip}</div>
)}
    </div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>PEEP (cm H₂O)</label>
      <input
  type="number"
  name="nicu_peep"
  value={formData.nicu_peep || ""}
  placeholder="2–10"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out-of-range typing
    if (num < 2 || num > 10) {
      handleChange({
        target: { name: "nicu_peep", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 10) value = 10;
    if (value < 2) value = 2;

    handleChange({
      target: { name: "nicu_peep", value }
    });
  }}
  className={errors.nicu_peep ? "error-input" : ""}
/>

{errors.nicu_peep && (
  <div className="error-text">{errors.nicu_peep}</div>
)}
    </div>

    <div className="form-group">
      <label>MAP (cm H₂O)</label>
     <input
  type="number"
  name="nicu_map"
  value={formData.nicu_map || ""}
  placeholder="5–20"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (editing)
    if (value === "") {
      handleChange(e);
      return;
    }

    // ✅ Only integers
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 Block out-of-range typing
    if (num < 5 || num > 20) {
      handleChange({
        target: { name: "nicu_map", value }
      });
      return;
    }

    handleChange(e);
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    if (value > 20) value = 20;
    if (value < 5) value = 5;

    handleChange({
      target: { name: "nicu_map", value }
    });
  }}
  className={errors.nicu_map ? "error-input" : ""}
/>

{errors.nicu_map && (
  <div className="error-text">{errors.nicu_map}</div>
)}
    </div>
  </div>

  <div className="form-group">
    <label>FiO₂ (%)</label>
    <input
  type="number"
  name="nicu_fio2"
  value={formData.nicu_fio2 || ""}
  onChange={handleChange}
  className={errors.nicu_fio2 ? "error-input" : ""}
/>

{errors.nicu_fio2 && (
  <div className="error-text">{errors.nicu_fio2}</div>
)}
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
      <label>Date (DD/MM/YY)</label>
      <DatePicker
  selected={
    formData.completion_date
      ? new Date(formData.completion_date)
      : null
  }
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      completion_date: date
        ? date.toISOString().split("T")[0]
        : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
/>
    </div>
  </div>
</div>


      <button className="submit-btn" type="submit">
  Submit Form E
</button>
    </form>
    
  );
}
