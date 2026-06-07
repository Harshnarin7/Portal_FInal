import React, { useState, useEffect } from "react";
import { useParams,useLocation, useNavigate } from "react-router-dom";
import "./ScreeningForm.css";
import { usePatient } from "./context/PatientContext";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import FormLayout from "./components/FormLayout";
import { useFormProgress } from "./context/FormProgressContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function FormD() {
   const { enrollmentId } = useParams(); 
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { updatePatientData } = usePatient();
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    // IDENTIFICATION
    enrollment_id: "",
    gestation_weeks: "",
    gestation_days: "",
    annual_number: "",
    baby_name: "",
    baby_uid: "",
    birth_weight: "",

    // GOLDEN HOUR
    plastic_wrap: "",
    remained_intubated: "",
    et_intubation: "",
    labored_breathing: "",

    // SURFACTANT
    surfactant_required: "",
    surfactant_brand_other: "",
    surfactant_indication: "",
    cpap_cm: "",
    fio2_percent: "",
    surfactant_method: "",
    lisa_catheter: "",
    device_assistance: "",
    device_type: "",
    surfactant_brand: "",
    surfactant_dose: "",
    adverse_effects: "",
    adverse_type: "",
    adverse_type_other: "",
    mode_of_support: [],

    // EARLY RESPIRATORY SUPPORT
    early_cpap: "",
    humidified_gas: "",
    max_fio2_1hr: "",
    caffeine: "",
    caffeine_dose: "",
    intubation_after_resus: "",
    immediate_kmc: "",
    device_type_other: "",
    caffeine_loading: "",
caffeine_loading_abs: "",
caffeine_maint_abs: "",
caffeine_date: "",
caffeine_time: "",

    // COMPLETION
    completed_by: "",
    designation: "",
    
    date: "",
  });

 

  const handleChange = (e) => {
  const { name, value } = e.target;

  setFormData((prev) => {
    let updated = { ...prev, [name]: value };

    // 🔥 EXISTING LOGIC (KEEP)
    if (name === "et_intubation" && value === "No") {
      updated.remained_intubated = "";
    }

    return updated;
  });

  // 🔥 VALIDATION PART (NEW)
  setErrors((prev) => {
    let errorMsg = "";

    if (name === "caffeine_loading_abs" || name === "caffeine_maint_abs") {
      if (value === "") {
        errorMsg = "This field is required";
      } else if (Number(value) <= 0) {
        errorMsg = "Dose must be greater than 0";
      } else if (Number(value) > 1000) {
        errorMsg = "Dose seems too high";
      }
    }

   if (name === "surfactant_dose") {
  if (value === "") {
    errorMsg = "This field is required";
  } else if (Number(value) <= 0) {
    errorMsg = "Dose must be greater than 0";
  } else if (Number(value) < 50 || Number(value) > 200) {
    errorMsg = "⚠ Outside recommended range (50–200 mg/kg)";
  }
}

    return {
      ...prev,
      [name]: errorMsg,
    };
  });
};
  const yesNoToBool = (v) => {
  if (v === "Yes") return true;
  if (v === "No") return false;
  return null;
};

const handleModeChange = (e) => {
  const { value, checked } = e.target;

  setFormData(prev => {
    let updated = prev.mode_of_support || [];

    if (checked) {
      updated = [...updated, value];
    } else {
      updated = updated.filter(item => item !== value);
    }

    return {
      ...prev,
      mode_of_support: updated
    };
  });
};

const num = (v) => {
  if (v === "" || v === undefined) return null;
  return Number(v);
};

useEffect(() => {
  const fetchData = async () => {
    if (!enrollmentId) return;

    try {
      const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
      const b = res?.data || {};

      console.log("🔥 Form B Data:", b);

      const motherName = `${b?.mother_name_first || ""} ${b?.mother_name_surname || ""}`.trim();

      setFormData(prev => ({
        ...prev,

        enrollment_id: b?.enrollment_id || enrollmentId,

        gestation_weeks: b?.gestation_weeks || "",
        gestation_days: b?.gestation_days || "",
        birth_weight: b?.birth_weight || "",
        baby_uid: b?.baby_uid || "",

        baby_name: motherName ? `Baby of ${motherName}` : ""
      }));

    } catch (err) {
      console.log("❌ No Form B data found", err);
    }
  };

  fetchData();
}, [enrollmentId]);


useEffect(() => {
  if (formData.enrollment_id) return;

  const id =
    location.state?.enrollmentId ||
    localStorage.getItem("current_enrollment_id");

  if (!id) return;

  api.get(`/birth-resuscitation/${id}`)
    .then(res => {
      const b = res.data || {};

      setFormData(prev => ({
        ...prev,
        enrollment_id: id,
        dob: b?.date_of_birth || "",
        gestation:
          b?.gestation_weeks && b?.gestation_days
            ? `${b.gestation_weeks} weeks ${b.gestation_days} days`
            : ""
      }));
    });
}, []);
 

  const handleSubmit = async (e) => {
  e.preventDefault();

  const payload = {
    enrollment_id: formData.enrollment_id,

    gestation_weeks: num(formData.gestation_weeks),
    gestation_days: num(formData.gestation_days),

    annual_number: formData.annual_number,
    baby_name: formData.baby_name,
    baby_uid: formData.baby_uid,
    birth_weight: num(formData.birth_weight),

    plastic_wrap: yesNoToBool(formData.plastic_wrap),
    remained_intubated: yesNoToBool(formData.remained_intubated),
    et_intubation: yesNoToBool(formData.et_intubation),
    labored_breathing: yesNoToBool(formData.labored_breathing),

    surfactant_required: yesNoToBool(formData.surfactant_required),
    surfactant_indication: formData.surfactant_indication,
    cpap_cm: num(formData.cpap_cm),
    fio2_percent: num(formData.fio2_percent),
    surfactant_method: formData.surfactant_method,

    surfactant_brand: formData.surfactant_brand,
    surfactant_dose: num(formData.surfactant_dose),
    adverse_effects: yesNoToBool(formData.adverse_effects),
    adverse_type: formData.adverse_type,

    early_cpap: yesNoToBool(formData.early_cpap),
    humidified_gas: yesNoToBool(formData.humidified_gas),
    max_fio2_1hr: num(formData.max_fio2_1hr),
    surfactant_brand_other: formData.surfactant_brand_other,
lisa_catheter_type: formData.lisa_catheter_type,
device_assistance: yesNoToBool(formData.device_assistance),
device_type:
  formData.device_type === "Other"
    ? formData.device_type_other
    : formData.device_type,
adverse_type_other: formData.adverse_type_other,
mode_of_support: formData.mode_of_support.join(", "),

    caffeine: yesNoToBool(formData.caffeine),
    caffeine_dose: num(formData.caffeine_dose),
    caffeine_loading: yesNoToBool(formData.caffeine_loading),
caffeine_loading_abs: num(formData.caffeine_loading_abs),
caffeine_maint_abs: num(formData.caffeine_maint_abs),
caffeine_date: formData.caffeine_date || null,
caffeine_time: formData.caffeine_time || null,

    intubation_after_resus: yesNoToBool(formData.intubation_after_resus),
    immediate_kmc: yesNoToBool(formData.immediate_kmc),

    completed_by: formData.completed_by,
    designation: formData.designation,
    
    completion_date: formData.date || null,
  };

  try {
    await api.post("/postnatal-day1/", payload);
    updatePatientData({
  completed_by: formData.completed_by,
  designation: formData.designation
});
    markFormCompleted("form_d");
    alert("✅ Form D submitted successfully!");
   
    navigate(`/form-e/${formData.enrollment_id}`);
  } catch (err) {
    console.error(err.response?.data || err);
    alert("❌ Error submitting Form D");
  }
};

const gestationalAgeDisplay =
  formData.gestation_weeks && formData.gestation_days
    ? `${formData.gestation_weeks} weeks and ${formData.gestation_days} days`
    : "";

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
    
    <form className="screening-form form-d-container" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main"><h2>
        Form D — Day 1 of Postnatal Life
      </h2></div></div>



      {/* ================= IDENTIFICATION ================= */}
<div className="form-section soft-blue">
  <h3>Identification</h3>

  <div className="form-row">
    <div className="form-group">
      <label>Enrollment ID</label>
      <input
  name="enrollment_id"
  value={formData.enrollment_id}
  readOnly
/>

    </div>

    <div className="form-group">
  <label>Gestational Age</label>
  <input
    value={gestationalAgeDisplay}
    readOnly
  />
</div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>Annual Number (REDCap)</label>
      <input
        name="annual_number"
        value={formData.annual_number || ""}
        onChange={handleChange}
        placeholder="Optional"
      />
    </div>

    <div className="form-group">
      <label>Baby of (Mother's Name)<span className="required">*</span></label>
      <input
  type="text"
  name="baby_name"
  value={formData.baby_name || ""}readOnly
  
  onChange={(e) => {
    const value = e.target.value;

    // Allow only alphabets and spaces
    if (/^[A-Za-z\s]*$/.test(value)) {
      setFormData({
        ...formData,
        baby_name: value,
      });
    }
  }}
  
  required
/>
    </div>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>Baby's UID</label>
      <input
  type="text"
  name="baby_uid"
  value={formData.baby_uid || ""}
  inputMode="numeric"
  maxLength={12}
  placeholder="Enter Baby UID (max 12 digits)"
  onChange={(e) => {
    const value = e.target.value;

    // Allow only digits up to 12
    if (/^\d{0,12}$/.test(value)) {
      setFormData({
        ...formData,
        baby_uid: value,
      });
    }
  }}
  readOnly
  
/>
    </div>

    <div className="form-group">
      <label>Birth Weight (grams)<span className="required">*</span></label>
      <input
  type="number"
  name="birth_weight"
  value={formData.birth_weight || ""} readOnly
  min="300"
  max="6000"
  placeholder="300 - 6000 grams"
  onChange={(e) => {
    const value = e.target.value;

    // Allow only numbers
    if (/^\d*$/.test(value)) {
      setFormData({
        ...formData,
        birth_weight: value,
      });
    }
  }}
  required
/>
    </div>
  </div>
</div>


{/* ================= GOLDEN HOUR ================= */}
<div className="form-section soft-blue">
  <h3>Golden Hour (First Hour of Life)</h3>

  <div className="form-row">
    <div className="form-group">
      <label>Plastic wrap / bag at birth<span className="required">*</span></label>
      <select
        name="plastic_wrap"
        value={formData.plastic_wrap || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
    

    <div className="form-group">
      <label>ET intubation for resuscitation<span className="required">*</span></label>
      <select
        name="et_intubation"
        value={formData.et_intubation || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
    
  </div>

  <div className="form-row">
    {formData.et_intubation === "Yes" && (
    <div className="form-group">
      <label>Remained intubated after resuscitation<span className="required">*</span></label>
      <select
        name="remained_intubated"
        value={formData.remained_intubated || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
    )}

    <div className="form-group">
      <label>Labored breathing after resuscitation<span className="required">*</span></label>
      <select
        name="labored_breathing"
        value={formData.labored_breathing || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
  </div>
</div>

{/* ================= SURFACTANT ADMINISTRATION ================= */}
<div className="form-section soft-blue">
  <h3>Surfactant Administration</h3>

  <div className="pn-adverse-card">

  <div className="form-group">
    <label>Surfactant Administered<span className="required">*</span></label>
    <select
      name="surfactant_required"
      value={formData.surfactant_required || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {/* IF SURFACTANT REQUIRED = YES */}
  {formData.surfactant_required === "Yes" && (
    <>
      <div className="form-group">
        <label>Indication<span className="required">*</span></label>
        <select
          name="surfactant_indication"
          value={formData.surfactant_indication || ""}
          onChange={handleChange}
          required
        >
          <option value="">-- Select --</option>
          <option>FiO2 & pressure based</option>
          <option>LUS based</option>
          <option>Both</option>
        </select>
      </div>

      <div className="form-group">
  <label className="form-label">Mode</label>

  <div className="mode-container">
    {["CPAP", "IMV", "NIMV"].map((mode) => (
      <label key={mode} className="mode-option">
        <input
          type="checkbox"
          value={mode}
          checked={formData.mode_of_support?.includes(mode)}
          onChange={handleModeChange}
        />
        <span>{mode}</span>
      </label>
    ))}
  </div>
</div>

      <div className="form-row">
        <div className="form-group">
          <label>MAP (cmH₂O)<span className="required">*</span></label>
          <input
  type="number"
  name="cpap_cm"
  value={formData.cpap_cm || ""}
  min="0"
  max="20"
  step="1"
  placeholder="0 - 20"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty
    if (value === "") {
      setFormData({ ...formData, cpap_cm: "" });
      return;
    }

    // ✅ Allow only digits
    if (!/^\d+$/.test(value)) return;

    const numValue = Number(value);

    // 🚫 Block out of range
    if (numValue < 0 || numValue > 20) return;

    setFormData({
      ...formData,
      cpap_cm: value, // keep string while typing
    });
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    // ✅ Clamp final value
    if (value > 20) value = 20;
    if (value < 0) value = 0;

    setFormData({
      ...formData,
      cpap_cm: value,
    });
  }}
  required
/>
        </div>

        <div className="form-group">
          <label>FiO₂ at administration (%)<span className="required">*</span></label>
          <input
  type="number"
  name="fio2_percent"
  value={formData.fio2_percent || ""}
  min="0"
  max="100"
  step="1"
  placeholder="0 - 100"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (user deleting)
    if (value === "") {
      setFormData({ ...formData, fio2_percent: "" });
      return;
    }

    // ✅ Allow typing numbers freely first
    if (!/^\d+$/.test(value)) return;

    const numValue = Number(value);

    // ✅ Only block if OUTSIDE range
    if (numValue < 0 || numValue > 100) return;

    setFormData({
      ...formData,
      fio2_percent: value, // keep as string while typing
    });
  }}
  onBlur={(e) => {
    // ✅ Final cleanup after typing
    let value = Number(e.target.value);

    if (value > 100) value = 100;
    if (value < 0) value = 0;

    setFormData({
      ...formData,
      fio2_percent: value,
    });
  }}
  required
/>
        </div>
      </div>

      <div className="form-group">
        <label>Method<span className="required">*</span></label>
        <select
          name="surfactant_method"
          value={formData.surfactant_method || ""}
          onChange={handleChange}
          required
        >
          <option value="">-- Select --</option>
          <option>InSurE</option>
          <option>LISA</option>
          <option>Remained intubated</option>
        </select>
      </div>

      {/* LISA DETAILS */}
      {formData.surfactant_method === "LISA" && (
        <>
          <div className="form-group">
            <label>Catheter type<span className="required">*</span></label>
            <select
              name="lisa_catheter_type"
              value={formData.lisa_catheter_type || ""}
              onChange={handleChange}
              required
            >
              <option value="">-- Select --</option>
              <option>Feeding tube</option>
              <option>LISA catheter</option>
            </select>
          </div>

          <div className="form-group">
            <label>Device assistance<span className="required">*</span></label>
            <select
              name="device_assistance"
              value={formData.device_assistance || ""}
              onChange={handleChange}
              required
            >
              <option value="">-- Select --</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </div>

          {formData.device_assistance === "Yes" && (
            <div className="form-group">
              <label>Device type<span className="required">*</span></label>
              <select
                name="device_type"
                value={formData.device_type || ""}
                onChange={handleChange}
                required
              >
                <option value="">-- Select --</option>
                <option>FOL</option>
                <option>VL</option>
                <option>Magill</option>
                <option>Other</option>
              </select>
              {formData.device_type === "Other" && (
  <div className="form-group" style={{ marginTop: "10px" }}>
    <label>Specify Device Type<span className="required">*</span></label>
    <input
      type="text"
      name="device_type_other"
      value={formData.device_type_other || ""}
      onChange={(e) => {
        const value = e.target.value;

        // ✅ ONLY TEXT VALIDATION
        if (/^[A-Za-z\s]*$/.test(value)) {
          setFormData(prev => ({
            ...prev,
            device_type_other: value
          }));
        }
      }}
      placeholder="Enter device type"
      required
    />
  </div>
)}
            </div>
          )}
        </>
      )}

      
        <div className="form-group">
          <label>Brand<span className="required">*</span></label>
          <select
            name="surfactant_brand"
            value={formData.surfactant_brand || ""}
            onChange={handleChange}
            required
          >
            <option value="">-- Select --</option>
            <option>Survanta</option>
            <option>Curosurf</option>
            <option>Neosurf</option>
            <option>Other</option>
          </select>
          <div style={{ marginTop: "20px" }}>
          {formData.surfactant_brand === "Other" && (
  <div className="form-group">
    <label>Specify Brand<span className="required">*</span></label>
    <input
      type="text"
      name="surfactant_brand_other"
      value={formData.surfactant_brand_other || ""}
      onChange={(e) => {
        const value = e.target.value;

        // ✅ allow only alphabets + spaces
        if (/^[A-Za-z\s]*$/.test(value)) {
          setFormData({
            ...formData,
            surfactant_brand_other: value
          });
        }
      }}
      placeholder="Enter brand name"
      required
    />
  </div>
)}</div>
        </div>

        <div className="form-group">
          <label>Dose (mg/kg)<span className="required">*</span></label>
          <input
  type="number"
  name="surfactant_dose"
  value={formData.surfactant_dose || ""}
  onChange={handleChange}
  className={errors.surfactant_dose ? "error-input" : ""}
/>

{errors.surfactant_dose && (
  <div className="error-text">{errors.surfactant_dose}</div>
)}
        </div>
      

      <div className="form-group">
        <label>Adverse effects<span className="required">*</span></label>
        <select
          name="adverse_effects"
          value={formData.adverse_effects || ""}
          onChange={handleChange}
          required
        >
          <option value="">-- Select --</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </div>

      {formData.adverse_effects === "Yes" && (
        <div className="form-group">
          <label>Type<span className="required">*</span></label>
          <select
            name="adverse_type"
            value={formData.adverse_type || ""}
            onChange={handleChange}
            required
          >
            <option value="">-- Select --</option>
            <option>Bradycardia</option>
            <option>Desaturation</option>
            <option>Regurgitation</option>
            <option>Other</option>
          </select>
           <div style={{ marginTop: "20px" }}>
          {formData.adverse_type === "Other" && (
  <div className="form-group">
    <label>Specify Adverse Effect<span className="required">*</span></label>
    <input
      type="text"
      name="adverse_type_other"
      value={formData.adverse_type_other || ""}
      onChange={(e) => {
        const value = e.target.value;

        // ✅ allow only alphabets + spaces
        if (/^[A-Za-z\s]*$/.test(value)) {
          setFormData({
            ...formData,
            adverse_type_other: value
          });
        }
      }}
      placeholder="Enter adverse effect"
      required
    />
  </div>
)}</div>
        </div>
      )}
    </>
  )}
</div></div>
{/* ================= EARLY RESPIRATORY SUPPORT ================= */}
<div className="form-section soft-blue">
  <h3>Early Respiratory Support</h3>

  {/* Row 1 */}
  <div className="form-row">
    <div className="form-group">
      <label>Early / DR-CPAP<span className="required">*</span></label>
      <select
        name="early_cpap"
        value={formData.early_cpap || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    <div className="form-group">
      <label>Humidified gas with CPAP<span className="required">*</span></label>
      <select
        name="humidified_gas"
        value={formData.humidified_gas || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
  </div>

  {/* Row 2 */}
  <div className="form-row">
    <div className="form-group">
      <label>Maximum FiO₂ in first hour (%)<span className="required">*</span></label>
      <input
  type="number"
  name="max_fio2_1hr"
  value={formData.max_fio2_1hr || ""}
  min="0"
  max="100"
  placeholder="0 - 100"
  onChange={(e) => {
    const value = e.target.value;

    // ✅ Allow empty (user deleting)
    if (value === "") {
      setFormData({ ...formData, max_fio2_1hr: "" });
      return;
    }

    // ✅ Allow only digits
    if (!/^\d+$/.test(value)) return;

    const numValue = Number(value);

    // 🚫 Block out-of-range values
    if (numValue < 0 || numValue > 100) return;

    setFormData({
      ...formData,
      max_fio2_1hr: value,
    });
  }}
  onBlur={(e) => {
    let value = Number(e.target.value);

    // ✅ Clamp final value
    if (value > 100) value = 100;
    if (value < 0) value = 0;

    setFormData({
      ...formData,
      max_fio2_1hr: value,
    });
  }}
  required
/>
    </div>

    <div className="form-group">
      <label>Required intubation after resuscitation<span className="required">*</span></label>
      <select
        name="intubation_after_resus"
        value={formData.intubation_after_resus || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
  </div>

  {/* ================= LOADING DOSE ================= */}
  <div className="form-group">
    <label>Loading dose of Caffeine<span className="required">*</span></label>
    <select
      name="caffeine_loading"
      value={formData.caffeine_loading || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.caffeine_loading === "Yes" && (
    <div className="followup-box">
      <div className="form-row">
        <div className="form-group">
          <label>Absolute Dose (mg)<span className="required">*</span></label>
          <input
  type="number"
  name="caffeine_loading_abs"
  value={formData.caffeine_loading_abs || ""}
  onChange={handleChange}
  className={errors.caffeine_loading_abs ? "error-input" : ""}
/>

{errors.caffeine_loading_abs && (
  <div className="error-text">{errors.caffeine_loading_abs}</div>
)}
        </div>

        <div className="form-group">
          <label>Dose (mg/kg)</label>
          <input
            value={
              formData.caffeine_loading_abs && formData.birth_weight
                ? (formData.caffeine_loading_abs / (formData.birth_weight / 1000)).toFixed(2)
                : ""
            }
            readOnly
          />
        </div>
      </div>
    </div>
  )}

  {/* ================= MAINTENANCE DOSE (SUBSECTION) ================= */}
  <div className="sub-section">
    <h4>Maintenance Dose of Caffeine</h4>

    <div className="form-row">
      <div className="form-group">
        <label>Absolute Dose (mg)</label>
        <input
  type="number"
  name="caffeine_maint_abs"
  value={formData.caffeine_maint_abs || ""}
  onChange={handleChange}
  className={errors.caffeine_maint_abs ? "error-input" : ""}
/>

{errors.caffeine_maint_abs && (
  <div className="error-text">{errors.caffeine_maint_abs}</div>
)}
      </div>

      <div className="form-group">
        <label>Dose (mg/kg)</label>
        <input
          value={
            formData.caffeine_maint_abs && formData.birth_weight
              ? (formData.caffeine_maint_abs / (formData.birth_weight / 1000)).toFixed(2)
              : ""
          }
          readOnly
        />
      </div>
    </div>

    <div className="form-row">
      <div className="form-group">
        <label>Date</label>
        <DatePicker
          selected={
            formData.caffeine_date
              ? new Date(formData.caffeine_date)
              : null
          }
          onChange={(date) =>
            setFormData((prev) => ({
              ...prev,
              caffeine_date: date
                ? date.toISOString().split("T")[0]
                : ""
            }))
          }
          dateFormat="dd-MM-yyyy"
          placeholderText="Select date"
        />
      </div>

      <div className="form-group">
        <label>Time</label>
        <input
          type="time"
          name="caffeine_time"
          value={formData.caffeine_time || ""}
          onChange={handleChange}
        />
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
      <DatePicker
  selected={
    formData.date ? new Date(formData.date) : null
  }
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      date: date
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

      {/* STEP 2 will start here */}

      <button className="submit-btn" type="submit">
        Save Form D
      </button>
    </form>
    
  );
}
