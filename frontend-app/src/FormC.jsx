import React, { useState, useEffect } from "react";
import { useParams,useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import FormLayout from "./components/FormLayout";

import { useFormProgress } from "./context/FormProgressContext";
import { usePatient } from "./context/PatientContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

export default function FormC() {
  
  const navigate = useNavigate();
  const { enrollmentId } = useParams();
  const { markFormCompleted } = useFormProgress();
  const location = useLocation();
  const { patientData } = usePatient();

// ✅ check if editing
const isEditMode = location.state?.fromEdit === true;
  

  

  const [formData, setFormData] = useState({
    enrollment_id: "",
    mother_name: "",
    mother_age: "",
    maternal_uid: "",
    contact_mother: "",
    contact_husband: "",
    address: "",
    // OBSTETRIC HISTORY
gravida: "",
parity: "",
abortions: "",
live: "",
still: "",
booked: "",
anc_visits: "",
multiple: "No",
lmp: "",
edd: "",
conception: "",
artificial_type: "",
antenatal_steroids: "",
steroid_drug: "",
steroid_doses: "",
lddi_hours: "",
antenatal_mgso4: "",
steroid_date: "",
state: "",
gestation_at_steroids: "",
mgso4_date: "",
mgso4_gestation_weeks: "",
mgso4_gestation_days: "",
// MATERNAL MEDICAL DISORDERS
chronic_hypertension: false,
hepatitis: false,
heart_disease: false,
renal_disease: false,
vdrl_positive: false,
seizure_disorder: false,
asthma: false,
hiv: false,
hypothyroidism: false,
hyperthyroidism: false,
tb: false,
malaria: false,
severe_anemia: false,

no_known_medical_disorder: true,
other_medical_checkbox: false,
other_medical_disorder: "",
doppler_other: "",
  hdp: "",
  hdp_type: "",

  gdm: "",
  gdm_rx: [],

  liquor: "",

  fgr: "",
  fgr_centile: "",
  doppler: "",

  obstetric_other: "",

  placental_abnormality: "",
  placental_type: "",
  placental_other: "",

  retroplacental_collection: "",

  aph: "",
  aph_type: "",
  aph_other: "",
  isoimmunization: "",
    pprom: "",
  pprom_duration: "",
  preterm_labor: "",

  triple_i: "",

  maternal_fever: "",
  fetal_tachycardia: "",
  maternal_tlc_high: "",
  foul_smelling_liquor: "",
  maternal_uti: "",
  maternal_diarrhea: "",

    msl: "",
  non_reactive_nst: "",
  reduced_fm: "",
  prolonged_labor: "",

  cord_accident: "",
  cord_accident_type: "",

  fetal_bradycardia: "",
  fetal_tachycardia_intrapartum: "",

  duration_rom: "",
  

  uterotonic: "",
  uterotonic_timing: "",




  });

 useEffect(() => {
  const fetchData = async () => {
    try {
      if (!enrollmentId) return;

      const screeningId = localStorage.getItem("current_screening_id");

      let formAData = null;
      let formCData = null;

      // 🔥 GET FORM A DATA + PII
      if (screeningId) {
        const resA = await api.get(`/screenings/${screeningId}`);
        formAData = resA.data;
        try {
          const piiRes = await api.get(`/pii/screening/${screeningId}`);
          formAData = { ...formAData, ...piiRes.data };
        } catch (_) {
          /* PII may be restricted */
        }
      }

      // 🔥 GET FORM C DATA (EDIT MODE)
      if (isEditMode) {
        const resC = await api.get(`/maternal-details/${enrollmentId}`);
        formCData = resC.data;
      }

      // 🔥 FINAL MERGE (IMPORTANT)
      setFormData((prev) => ({
        ...prev,
        enrollment_id: enrollmentId,
        // ✅ Autofill fields
     mother_name: `${formAData?.mother_first_name || ""} ${formAData?.mother_surname || ""}`.trim(),

maternal_uid: formAData?.maternal_uid || "",

contact_mother:
  formAData?.contact_mother || formAData?.mother_contact || "",

contact_husband:
  formAData?.contact_husband || formAData?.husband_contact || "",
    
  gdm_rx: formCData?.gdm_rx
  ? formCData.gdm_rx.split(", ").map(s => s.trim())
  : [],
        // ✅ LMP
        lmp: formCData?.lmp
  ? new Date(formCData.lmp)
  : formAData?.lmp_date
  ? new Date(formAData.lmp_date)
  : null,

        // ✅ EDD (from Form A expected_delivery_date)
        edd: formCData?.edd
          ? new Date(formCData.edd)
          : formAData?.expected_delivery_date
          ? new Date(formAData.expected_delivery_date)
          : null,
      }));

      

    } catch (err) {
      console.log("Error loading Form C:", err);
    }
  };

  fetchData();
}, [enrollmentId, isEditMode]);
// ✅ ADD THIS HERE 👇
useEffect(() => {
  if (patientData?.dob) {
    setFormData(prev => ({
      ...prev,
      dob: patientData.dob
    }));
  }
}, [patientData]);

useEffect(() => {
  if (!formData.mgso4_date || !formData.edd) return;

  const mg = new Date(formData.mgso4_date);
  const eddDate = formData.edd; // ✅ DON'T wrap again

  if (!(mg instanceof Date) || !(eddDate instanceof Date)) return;

  if (isNaN(mg.getTime()) || isNaN(eddDate.getTime())) return;

  const diffDays = Math.floor(
    (eddDate.getTime() - mg.getTime()) / (1000 * 60 * 60 * 24)
  );

  const totalEDDGA = 280;
  const adminGA = totalEDDGA - diffDays;

  if (adminGA < 0) return;

  const weeks = Math.floor(adminGA / 7);
  const days = adminGA % 7;

  setFormData((prev) => ({
    ...prev,
    mgso4_gestation_weeks: weeks,
    mgso4_gestation_days: days,
  }));
}, [formData.mgso4_date, formData.edd]);
useEffect(() => {
  if (formData.no_known_medical_disorder) {
    setFormData(prev => ({
      ...prev,
      chronic_hypertension: false,
      hepatitis: false,
      heart_disease: false,
      renal_disease: false,
      vdrl_positive: false,
      seizure_disorder: false,
      asthma: false,
      hypothyroidism: false,
      hyperthyroidism: false,
      tb: false,
      malaria: false,
      hiv: false,
      severe_anemia: false,
      other_medical_checkbox: false,
      other_medical_disorder: ""
    }));
  }
}, [formData.no_known_medical_disorder]);

useEffect(() => {
  if (!isEditMode) {
    setFormData(prev => ({
      ...prev,
      enrollment_id: enrollmentId, // keep ID only
    }));
  }
}, [enrollmentId]);

if (!enrollmentId) {
  return (
    <div style={{
      padding: "40px",
      color: "red",
      fontSize: "18px",
      fontWeight: "600"
    }}>
      ❌ Enrollment ID missing.<br />
      Please open Form C from Dashboard or Form B.
    </div>
  );
}

const handleGdmRxChange = (value) => {
  setFormData((prev) => {
    const exists = prev.gdm_rx.includes(value);

    return {
      ...prev,
      gdm_rx: exists
        ? prev.gdm_rx.filter((v) => v !== value) // remove
        : [...prev.gdm_rx, value],               // add
    };
  });
};

  const handleChange = (e) => {
  const { name, value, type, checked } = e.target;

  setFormData((prev) => {
    let updated = {
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    };

    // 🔥 If any disorder is selected → uncheck "No Known"
    if (
      name !== "no_known_medical_disorder" &&
      type === "checkbox" &&
      checked === true
    ) {
      updated.no_known_medical_disorder = false;
    }

    return updated;
  });
};

const yesNoToBool = (v) => {
  if (v === "Yes") return true;
  if (v === "No") return false;
  return null;
};

const num = (v) => {
  if (v === "" || v === undefined) return null;
  return Number(v);
};


const handleSubmit = async (e) => {
  e.preventDefault();
  // Validate medical disorders
const medicalFields = [
  formData.chronic_hypertension,
  formData.hepatitis,
  formData.heart_disease,
  formData.renal_disease,
  formData.vdrl_positive,
  formData.seizure_disorder,
  formData.asthma,
  formData.hypothyroidism,
  formData.hyperthyroidism,
  formData.tb,
  formData.malaria,
  formData.hiv,
  formData.severe_anemia,
  formData.other_medical_checkbox
];

if (
  !formData.no_known_medical_disorder &&
  !medicalFields.some(Boolean)
) {
  alert("Please select at least one medical disorder OR choose 'No Known Medical Disorder'");
  return;
}

  const payload = {
    enrollment_id: formData.enrollment_id,
    mother_name: formData.mother_name,
    mother_age: num(formData.mother_age),
    maternal_uid: formData.maternal_uid,
    contact_mother: formData.contact_mother,
    contact_husband: formData.contact_husband,
    address: formData.address,

    gravida: num(formData.gravida),
    parity: num(formData.parity),
    abortions: num(formData.abortions),
    live: num(formData.live),
    still: num(formData.still),
    booked: yesNoToBool(formData.booked),
    anc_visits: num(formData.anc_visits),
    multiple: formData.multiple,

    lmp: formData.lmp
  ? formData.lmp.toISOString().split("T")[0]
  : null,

edd: formData.edd
  ? formData.edd.toISOString().split("T")[0]
  : null,
    conception: formData.conception,
    artificial_type: formData.artificial_type,

    antenatal_steroids: yesNoToBool(formData.antenatal_steroids),
    steroid_date: formData.steroid_date || null,
    steroid_drug: formData.steroid_drug,
    steroid_doses: num(formData.steroid_doses),
    lddi_hours: num(formData.lddi_hours),
    antenatal_mgso4: yesNoToBool(formData.antenatal_mgso4),
    gestation_at_steroids: num(formData.gestation_at_steroids),
    antenatal_mgso4: yesNoToBool(formData.antenatal_mgso4),
    mgso4_date: formData.mgso4_date
  ? new Date(formData.mgso4_date).toISOString().split("T")[0]
  : null,
    mgso4_gestation_weeks: num(formData.mgso4_gestation_weeks),
    mgso4_gestation_days: num(formData.mgso4_gestation_days),

    chronic_hypertension: formData.chronic_hypertension,
    hepatitis: formData.hepatitis,
    heart_disease: formData.heart_disease,
    renal_disease: formData.renal_disease,
    vdrl_positive: formData.vdrl_positive,
    seizure_disorder: formData.seizure_disorder,
    asthma: formData.asthma,
    hiv: formData.hiv,
    hypothyroidism: formData.hypothyroidism,
hyperthyroidism: formData.hyperthyroidism,
    tb: formData.tb,
    malaria: formData.malaria,
    severe_anemia: formData.severe_anemia,
    other_medical_disorder: formData.other_medical_disorder,

    hdp: yesNoToBool(formData.hdp),
    hdp_type: formData.hdp_type,
    gdm: yesNoToBool(formData.gdm),
    gdm_rx: formData.gdm_rx.join(", "),
    liquor: formData.liquor,
    fgr: yesNoToBool(formData.fgr),
    fgr_centile: formData.fgr_centile,
    doppler: formData.doppler,
    doppler_other: formData.doppler_other,

    placental_abnormality: yesNoToBool(formData.placental_abnormality),
    placental_type: formData.placental_type,
    placental_other: formData.placental_other,
    retroplacental_collection: yesNoToBool(formData.retroplacental_collection),

    aph: yesNoToBool(formData.aph),
    aph_type: formData.aph_type,
    aph_other: formData.aph_other,
    isoimmunization: formData.isoimmunization || null,

    pprom: yesNoToBool(formData.pprom),
    pprom_duration: num(formData.pprom_duration),
    preterm_labor: yesNoToBool(formData.preterm_labor),
    triple_i: yesNoToBool(formData.triple_i),

    maternal_fever: yesNoToBool(formData.maternal_fever),
    fetal_tachycardia: yesNoToBool(formData.fetal_tachycardia),
    maternal_tlc_high: yesNoToBool(formData.maternal_tlc_high),
    foul_smelling_liquor: yesNoToBool(formData.foul_smelling_liquor),
    maternal_uti: yesNoToBool(formData.maternal_uti),
    maternal_diarrhea: yesNoToBool(formData.maternal_diarrhea),

    msl: yesNoToBool(formData.msl),
    non_reactive_nst: yesNoToBool(formData.non_reactive_nst),
    reduced_fm: yesNoToBool(formData.reduced_fm),
    prolonged_labor: yesNoToBool(formData.prolonged_labor),

    cord_accident: yesNoToBool(formData.cord_accident),
    cord_accident_type: formData.cord_accident_type,

    fetal_bradycardia: yesNoToBool(formData.fetal_bradycardia),
    fetal_tachycardia_intrapartum: yesNoToBool(formData.fetal_tachycardia_intrapartum),

    duration_rom: num(formData.duration_rom),
    

    uterotonic: yesNoToBool(formData.uterotonic),
    uterotonic_timing: formData.uterotonic_timing,
  };

  try {
    await api.post("/maternal-details/", payload);
    
    alert("✅ Form C submitted successfully!");
     markFormCompleted("form_c");
 
  
  navigate(`/form-d/${formData.enrollment_id}`);

  } catch (err) {
    console.error(err.response?.data || err);
    alert("❌ Error submitting Form C");
  }
};


{!enrollmentId && (
  <div style={{ color: "red", padding: "20px" }}>
    ❌ Enrollment ID missing
  </div>
)}

  return (

     
    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main">
      <h2>
        Form C — Maternal Details
      </h2>
      <span className="form-a-subtitle">
      (Complete for randomized subjects only)
    </span></div>
      </div>
      

      {/* ================= IDENTIFICATION ================= */}
      <div className="form-section soft-blue">
        <h3>Identification</h3>

        <div className="form-row">
          <div className="form-group">
            <label>Enrollment ID</label>
            <input value={formData.enrollment_id || ""} readOnly />
          </div>

          <div className="form-group">
            <label>Mother's Name</label>
            <input
              name="mother_name"
              value={formData.mother_name || ""} readOnly
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">

  <div className="form-group">
    <label>Mother Age<span className="required">*</span></label>
    <input
      type="number"
      name="mother_age"
      value={formData.mother_age || ""}
      onChange={handleChange}
      required
      min="0"
      max="99"
      onInput={(e) => {
        if (e.target.value.length > 2) {
          e.target.value = e.target.value.slice(0, 2);
        }
      }}
    />
  </div>

  <div className="form-group">
    <label>Maternal UID</label>
    <input
      name="maternal_uid"
      value={formData.maternal_uid || ""}
      readOnly
    />
  </div>

</div>

        <div className="form-row">
          <div className="form-group">
            <label>Contact (Mother)</label>
            <input
              name="contact_mother"
              value={formData.contact_mother || ""} readOnly
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Contact (Husband)</label>
            <input
              name="contact_husband"
              value={formData.contact_husband || ""} readOnly
              onChange={handleChange}
              required
            />
          </div>
        </div>

        
  <div className="address-card">
  <div className="address-header">
    📍 Patient Address
    <span className="address-sub">Enter complete residential details</span>
  </div>

  <div className="address-body">

    {/* LINE 1 */}
    <div className="address-row">
      <div className="address-field wide">
        <label>House No / Street<span>*</span></label>
        <input
          name="house"
          value={formData.house || ""}
          onChange={handleChange}
          placeholder="e.g. H.No 221, Sector 68"
          required
        />
      </div>
    </div>

    {/* LINE 2 */}
    <div className="address-row">
      <div className="address-field">
        <label>City / Tehsil<span>*</span></label>
        <input
          name="city"
          value={formData.city || ""}
          onChange={handleChange}
          placeholder="Mohali"
          required
        />
      </div>

      <div className="address-field">
        <label>District<span>*</span></label>
        <input
          name="district"
          value={formData.district || ""}
          onChange={handleChange}
          placeholder="SAS Nagar"
          required
        />
      </div>
    </div>

    {/* LINE 3 */}
    <div className="address-row">
      <div className="address-field">
        <label>State<span>*</span></label>
        <select
  name="state"
  value={formData.state || ""}
  onChange={handleChange}
  required
>
  <option value="">--Select State--</option>

  {STATES.map((state) => (
    <option key={state} value={state}>
      {state}
    </option>
  ))}

</select>
      </div>

      <div className="address-field">
        <label>PIN Code<span>*</span></label>
        <input
          name="pincode"
          value={formData.pincode || ""}
          onChange={(e) => {
            let value = e.target.value.replace(/\D/g, "");
            if (value.length <= 6) {
              setFormData(prev => ({ ...prev, pincode: value }));
            }
          }}
          placeholder="160062"
          required
        />
      </div>
    </div>

    {/* LINE 4 */}
    <div className="address-row">
      <div className="address-field wide">
        <label>Nearest Landmark</label>
        <input
          name="landmark"
          value={formData.landmark || ""}
          onChange={handleChange}
          placeholder="Near Gurudwara / School / Hospital"
        />
      </div>
    </div>

    {/* PREVIEW */}
    {(formData.house || formData.city) && (
      <div className="address-preview">
        <strong>Preview:</strong><br />
        {formData.house}, {formData.city}, {formData.district},<br />
        {formData.state} - {formData.pincode}
      </div>
    )}

  </div>
</div>
  

      </div>

      {/* ================= OBSTETRIC HISTORY ================= */}
<div className="form-section soft-blue">
  <h3>Obstetric History</h3>

  {/* Gravida & Parity */}
  <div className="form-row">
    <div className="form-group">
      <label>Gravida<span className="required">*</span></label>
      <input
  type="text"
  name="gravida"
  value={formData.gravida || ""}
  required
  inputMode="numeric"
  placeholder="1–15"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,2}$/.test(value)) {
      if (value === "" || (Number(value) >= 1 && Number(value) <= 15)) {
        setFormData({ ...formData, gravida: value });
      }
    }
  }}
/>
    </div>

    <div className="form-group">
      <label>Parity<span className="required">*</span></label>
      <input
  type="text"
  name="parity"
  value={formData.parity || ""}
  required
  inputMode="numeric"
  placeholder="0–15"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,2}$/.test(value)) {
      if (value === "" || Number(value) <= 15) {
        setFormData({ ...formData, parity: value });
      }
    }
  }}
/>
    </div>
  </div>

  {/* Abortions, Live, Still */}
  <div className="form-row">
    <div className="form-group">
      <label>Abortions<span className="required">*</span></label>
      <input
  type="text"
  name="abortions"
  value={formData.abortions || ""}
  required
  inputMode="numeric"
  placeholder="0–15"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,2}$/.test(value)) {
      if (value === "" || Number(value) <= 15) {
        setFormData({ ...formData, abortions: value });
      }
    }
  }}
/>
    </div>

    <div className="form-group">
      <label>Live<span className="required">*</span></label>
      <input
  type="text"
  name="live"
  value={formData.live || ""}
  required
  inputMode="numeric"
  placeholder="0–15"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,2}$/.test(value)) {
      if (value === "" || Number(value) <= 15) {
        setFormData({ ...formData, live: value });
      }
    }
  }}
/>
    </div>

    <div className="form-group">
      <label>Still<span className="required">*</span></label>
      <input
  type="text"
  name="still"
  value={formData.still || ""}
  required
  inputMode="numeric"
  placeholder="0–10"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,2}$/.test(value)) {
      if (value === "" || Number(value) <= 10) {
        setFormData({ ...formData, still: value });
      }
    }
  }}
/>
    </div>
  </div>

  {/* Booked & ANC Visits */}
  <div className="form-row">
    <div className="form-group">
      <label>Booking Status<span className="required">*</span></label>
      <select
        name="booked"
        value={formData.booked || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Booked</option>
        <option>Unbooked</option>
      </select>
    </div>

    <div className="form-group">
      <label>ANC Visits<span className="required">*</span></label>
      <input
  type="text"
  name="anc_visits"
  value={formData.anc_visits || ""}
  required
  inputMode="numeric"
  placeholder="0–20"
  onChange={(e) => {
    const value = e.target.value;

    if (/^\d{0,2}$/.test(value)) {
      if (value === "" || Number(value) <= 20) {
        setFormData({ ...formData, anc_visits: value });
      }
    }
  }}
/>
    </div>
  </div>


  <div className="form-group">
    <label>Multiple Pregnancy<span className="required">*</span></label>
    <select name="multiple" value={formData.multiple || ""} onChange={handleChange} required>
      <option value="">-- Select --</option>
      <option>No</option>
      <option>Twin</option>
      <option>Triplet</option>
      <option>Quad</option>
    </select>
  </div>

  <div className="form-row">
    <div className="form-group">
      <label>LMP</label>
      <DatePicker
  selected={formData.lmp}readOnly
  onChange={(date) =>
    setFormData({ ...formData, lmp: date })
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
  className="form-input"
/>
    </div>

    <div className="form-group">
      <label>EDD</label>
      <DatePicker
  selected={formData.edd}readOnly
  onChange={(date) =>
    setFormData({ ...formData, edd: date })
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
  className="form-input"
/>
    </div>
  </div>

 <div className="form-group">
  <label>Conception<span className="required">*</span></label>
  <select
    name="conception"
    value={formData.conception || ""}
    onChange={handleChange}
    required
  >
    <option value="">-- Select --</option>
    <option value="Spontaneous">Spontaneous</option>
    <option value="Artificial">Assisted Reproductive Techniques</option>
  </select>
</div>

{formData.conception === "Artificial" && (
  <div className="followup-box">
    <div className="form-group">
      <label>If Assisted Reproductive Techniques<span className="required">*</span></label>
      <select
        name="artificial_type"
        value={formData.artificial_type || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option value="IVF">IVF</option>
        <option value="ICSI">ICSI</option>
        <option value="Other">Other</option>
      </select>
    </div>

    {/* Show textbox only if Other selected */}
    {formData.artificial_type === "Other" && (
      <div className="form-group">
        <label>Please Specify<span className="required">*</span></label>
        <input
  type="text"
  name="artificial_other"
  value={formData.artificial_other || ""}
  onChange={(e) => {
    let value = e.target.value;

    // 🔥 allow only alphabets + space
    value = value.replace(/[^a-zA-Z ]/g, "");

    setFormData((prev) => ({
      ...prev,
      artificial_other: value,
    }));
  }}
  required
  placeholder="Enter details"
/>
      </div>
    )}
  </div>
)}

  <div className="form-group">
    <label>Antenatal Steroids<span className="required">*</span></label>
    <select
      name="antenatal_steroids"
      value={formData.antenatal_steroids || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.antenatal_steroids === "Yes" && (
    <>
    <div className="followup-box">
      <div className="form-row">
        <div className="form-group">
          <label>Drug<span className="required">*</span></label>
          <select
            name="steroid_drug"
            value={formData.steroid_drug || ""}
            onChange={handleChange}
            required
          >
            <option value="">-- Select --</option>
            <option>Betamethasone</option>
            <option>Dexamethasone</option>
          </select>
        </div>

        <div className="form-group">
          <label>Doses<span className="required">*</span></label>
          <select
            name="steroid_doses"
            value={formData.steroid_doses || ""}
            onChange={handleChange}
            required
          >
            <option value="">-- Select --</option>
            <option>1</option>
            <option>2</option>
            <option>3</option>
            <option>4</option>
          </select>
        </div>
        <div className="form-group">
  <label>LDDI (hrs)<span className="required">*</span></label>
  <input
    type="number"
    name="lddi_hours"
    value={formData.lddi_hours || ""}
    onChange={handleChange}
    required
    min="0"
    max="99"
    onInput={(e) => {
      const value = e.target.value.replace(/\D/g, "");
      e.target.value = value.slice(0, 2);
    }}
    placeholder="0-99"
  />
</div>

      </div>
      </div>
      </>
  )}

      <div className="form-row">
  <div className="form-group">
    <label>Antenatal MgSO₄<span className="required">*</span></label>
    <select
      name="antenatal_mgso4"
      value={formData.antenatal_mgso4 || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  </div>
</div>

{formData.antenatal_mgso4 === "Yes" && (
  <div className="followup-box">
    <div className="form-row">
      <div className="form-group">
        <label>Date of Administration<span className="required">*</span></label>
        <DatePicker
  selected={
    formData.mgso4_date
      ? new Date(formData.mgso4_date)
      : null
  }
  onChange={(date) =>
    setFormData({ ...formData, mgso4_date: date })
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
  className="form-input"
/>
      </div>
    </div>

    <div className="form-row">
      <div className="form-group">
        <label>Gestation at Administration<span className="required">*</span></label>

        <div style={{ display: "flex", gap: "10px" }}>
          
          {/* Weeks */}
          <input
            type="number"
            name="mgso4_gestation_weeks"
            value={formData.mgso4_gestation_weeks || ""}readOnly
            onChange={handleChange}
            required
            min="0"
            max="42"
            onInput={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              e.target.value = value.slice(0, 2);
            }}
            placeholder="Weeks"
            style={{ width: "120px" }}
          />

          <span style={{ alignSelf: "center" }}>weeks</span>

          {/* Days */}
          <input
            type="number"
            name="mgso4_gestation_days"
            value={formData.mgso4_gestation_days || ""}
            onChange={handleChange} readOnly
            required
            min="0"
            max="6"
            onInput={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              e.target.value = value.slice(0, 1);
            }}
            placeholder="Days"
            style={{ width: "120px" }}
          />

          <span style={{ alignSelf: "center" }}>days</span>

        </div>
      </div>
    </div>
  </div>
)}
</div>

{/* ================= MATERNAL MEDICAL DISORDERS ================= */}
<div className="form-section soft-blue">
  <h3>Maternal Medical Disorders<span className="required">*</span></h3>

  <div className="checkbox-grid">

  <label>
    <input
      type="checkbox"
      name="no_known_medical_disorder"
      checked={formData.no_known_medical_disorder}
      onChange={handleChange}
    />
    No Known Medical Disorder
  </label>

  <label>
    <input type="checkbox" name="chronic_hypertension"
      checked={formData.chronic_hypertension}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Chronic Hypertension
  </label>

  <label>
    <input type="checkbox" name="hepatitis"
      checked={formData.hepatitis}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Hepatitis
  </label>

  <label>
    <input type="checkbox" name="heart_disease"
      checked={formData.heart_disease}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Heart disease
  </label>

  <label>
    <input type="checkbox" name="renal_disease"
      checked={formData.renal_disease}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Renal disease
  </label>

  <label>
    <input type="checkbox" name="vdrl_positive"
      checked={formData.vdrl_positive}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    VDRL +
  </label>

  <label>
    <input type="checkbox" name="seizure_disorder"
      checked={formData.seizure_disorder}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Seizure disorder
  </label>

  <label>
    <input type="checkbox" name="asthma"
      checked={formData.asthma}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Asthma
  </label>

  <label>
    <input type="checkbox" name="hypothyroidism"
      checked={formData.hypothyroidism}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Hypothyroidism
  </label>

  <label>
    <input type="checkbox" name="hyperthyroidism"
      checked={formData.hyperthyroidism}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Hyperthyroidism
  </label>

  <label>
    <input type="checkbox" name="severe_anemia"
      checked={formData.severe_anemia}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Severe anemia (Hb &lt; 8)
  </label>

  <label>
    <input type="checkbox" name="tb"
      checked={formData.tb}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Tuberculosis
  </label>

  <label>
    <input type="checkbox" name="malaria"
      checked={formData.malaria}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Malaria
  </label>

  <label>
    <input type="checkbox" name="hiv"
      checked={formData.hiv}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    HIV
  </label>

  <label>
    <input type="checkbox" name="other_medical_checkbox"
      checked={formData.other_medical_checkbox}
      onChange={handleChange}
      disabled={formData.no_known_medical_disorder}
    />
    Other
  </label>

</div>
  {/* Show textbox only if Other is checked */}
  {formData.other_medical_checkbox && (
    <div className="form-group" style={{ marginTop: "12px" }}>
      <label>Please Specify</label>
      <input
        name="other_medical_disorder"
        value={formData.other_medical_disorder || ""}
        onChange={handleChange}
        required
        placeholder="Specify other medical disorder"
      />
    </div>
  )}
</div>

{/* ================= OBSTETRIC PROBLEMS ================= */}
<div className="form-section soft-blue">
  <h3>Obstetric Problems</h3>

  {/* HDP */}
  
    <div className="form-group">
      <label>
Hypertensive Disorders of Pregnancy<span className="required">*</span></label>
      <select name="hdp" value={formData.hdp || ""} onChange={handleChange} required>
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    {formData.hdp === "Yes" && (
      <div className="followup-box">
      <div className="form-group">
        <label>Type<span className="required">*</span></label>
        <select
          name="hdp_type"
          value={formData.hdp_type || ""}
          onChange={handleChange}
          required
        >
          <option value="">-- Select --</option>
          <option>Gest HTN</option>
          <option>PE</option>
          <option>Severe PE</option>
          <option>Eclampsia</option>
        </select>
      </div>
      </div>
    )}
  

  {/* GDM */}
 
    <div className="form-group">
      <label>Gestational Diabetes Mellitus<span className="required">*</span></label>
      <select name="gdm" value={formData.gdm || ""} onChange={handleChange} required>
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    {formData.gdm === "Yes" && (
      <div className="followup-box">
      <div className="form-group">
        <div className="rx-container">
  <label className="rx-label">Rx *</label>
  <p className="rx-sub">Select all that apply</p>

  <div className="rx-grid">

    {[
      { label: "MNT", value: "MNT", icon: "🥗" },
      { label: "Oral Hypoglycemics", value: "Oral", icon: "💊" },
      { label: "Insulin", value: "Insulin", icon: "💉" },
      
    ].map((item) => (
      <div
        key={item.value}
        className={`rx-card ${
          formData.gdm_rx.includes(item.value) ? "active" : ""
        }`}
        onClick={() => handleGdmRxChange(item.value)}
      >
        <div className="rx-checkbox">
          {formData.gdm_rx.includes(item.value) && "✔"}
        </div>

        <div className="rx-icon">{item.icon}</div>

        <div className="rx-text">{item.label}</div>
      </div>
    ))}

  </div>

  <div className="rx-note">
    ℹ️ You can select more than one option
  </div>
</div>
      </div>
      </div>
    )}
  

  {/* Liquor */}
  <div className="form-group">
    <label>Liquor<span className="required">*</span></label>
    <select name="liquor" value={formData.liquor || ""} onChange={handleChange} required>
      <option value="">-- Select --</option>
      <option>Normal</option>
      <option>Oligohydramnios</option>
      <option>Polyhydramnios</option>
    </select>
  </div>

  {/* FGR */}
  {/* FGR */}
<div className="form-row">
  <div className="form-group">
    <label>Fetal Growth Restriction<span className="required">*</span></label>
    <select
      name="fgr"
      value={formData.fgr || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  </div>

  {formData.fgr === "Yes" && (
    <div className="form-group">
      <label>FGR Centile</label>
      <input
        type="number"
        name="fgr_centile"
        value={formData.fgr_centile || ""}
        onChange={handleChange}
        
        min="1"
        max="100"
        onInput={(e) => {
          const value = e.target.value.replace(/\D/g, "");
          e.target.value = value.slice(0, 3);
        }}
        placeholder="1-100"
      />
    </div>
  )}
</div>

{/* Doppler — Separate Field */}
{/* Doppler — Separate Field */}
<div className="form-group">
  <label>Doppler<span className="required">*</span></label>
  <select
    name="doppler"
    value={formData.doppler || ""}
    onChange={handleChange}
    required
  >
    <option value="">-- Select --</option>
    <option value="Normal">Normal</option>
    <option value="AEDF">AEDF</option>
    <option value="REDF">REDF</option>
    <option value="Other Abnormal">Other Abnormal</option>
  </select>
</div>

{/* Show textbox if Other Abnormal selected */}
{formData.doppler === "Other Abnormal" && (
  <div className="followup-box">
  <div className="form-group">
    <label>Please Specify Abnormality<span className="required">*</span></label>
    <input
      type="text"
      name="doppler_other"
      value={formData.doppler_other || ""}
      onChange={handleChange}
      required
      placeholder="Specify abnormal Doppler finding"
    />
  </div>
  </div>
)}

  
  {/* Placental Abnormality */}
  <div className="form-row">
    <div className="form-group">
      <label>Placental Abnormality<span className="required">*</span></label>
      <select
        name="placental_abnormality"
        value={formData.placental_abnormality || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    {formData.placental_abnormality === "Yes" && (
      <>
        <div className="form-group">
          <label>Type<span className="required">*</span></label>
          <select
            name="placental_type"
            value={formData.placental_type || ""}
            onChange={handleChange}
            required
          >
            <option value="">-- Select --</option>
            <option>Previa</option>
            <option>Accreta</option>
            <option>Others</option>
          </select>
        </div>

        {formData.placental_type === "Others" && (
          <div className="form-group">
            <label>Specify<span className="required">*</span></label>
            <input
              name="placental_other"
              value={formData.placental_other || ""}
              onChange={handleChange}
              required
            />
          </div>
        )}
      </>
    )}
  </div>

  {/* Retroplacental Collection */}
  <div className="form-group">
    <label>Retroplacental Collection<span className="required">*</span></label>
    <select
      name="retroplacental_collection"
      value={formData.retroplacental_collection || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {/* APH */}
  {/* APH */}
<div className="form-row">
  <div className="form-group">
    <label>APH<span className="required">*</span></label>
    <select
      name="aph"
      value={formData.aph || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  </div>

  {formData.aph === "Yes" && (
    <div className="form-group">
      <label>Type<span className="required">*</span></label>
      <select
        name="aph_type"
        value={formData.aph_type || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        
        <option value="Placental Abruption">Abruption</option>
        <option value="Vasa Previa">Previa</option>
        <option value="Other">Other</option>
      </select>
    </div>
  )}
</div>

{/* Show textbox only if Other selected */}
{formData.aph === "Yes" && formData.aph_type === "Other" && (
  <div className="followup-box">
  <div className="form-group">
    <label>Please Specify<span className="required">*</span></label>
    <input
      type="text"
      name="aph_other"
      value={formData.aph_other || ""}
      onChange={handleChange}
      required
      placeholder="Specify APH type"
    />
    </div>
  </div>
)}
<div className="form-group">
  <label>
    Isoimmunization <span className="required">*</span>
  </label>

  <select
    name="isoimmunization"
    value={formData.isoimmunization || ""}
    onChange={handleChange}
    required
  >
    <option value="">-- Select --</option>
    <option value="Yes">Yes</option>
    <option value="No">No</option>
  </select>
</div>
</div>


{/* ================= EVIDENCE OF INFECTION ================= */}
<div className="form-section soft-blue">
  <h3>Evidence of Infection</h3>

  {/* pPROM */}
  {/* pPROM */}
<div className="form-row">
  <div className="form-group">
    <label>pPROM<span className="required">*</span></label>
    <select
      name="pprom"
      value={formData.pprom || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.pprom === "Yes" && (
    <div className="form-group">
      <label>Duration (hrs)<span className="required">*</span></label>
      <input
        type="number"
        name="pprom_duration"
        value={formData.pprom_duration || ""}
        onChange={handleChange}
        required
        min="0"
        max="99"
        placeholder="Hours"
        onInput={(e) => {
          if (e.target.value.length > 2) {
            e.target.value = e.target.value.slice(0, 2);
          }
        }}
      />
    </div>
  )}
</div>

  {/* Preterm labor */}
  <div className="form-group">
    <label>Preterm Labor<span className="required">*</span></label>
    <select
      name="preterm_labor"
      value={formData.preterm_labor || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {/* Triple I */}
  <div className="form-group">
    <label>
      Intrauterine Inflammation / Infection (Triple “I”)<span className="required">*</span>
    </label>
    <select
      name="triple_i"
      value={formData.triple_i || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {/* Infection markers */}
  <div className="form-row">
    <div className="form-group">
      <label>
        Maternal fever (≥39℃ or 38–39℃ twice)<span className="required">*</span>
      </label>
      <select
        name="maternal_fever"
        value={formData.maternal_fever || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    <div className="form-group">
      <label>Baseline fetal tachycardia (&gt;160 bpm)<span className="required">*</span></label>
      <select
        name="fetal_tachycardia"
        value={formData.fetal_tachycardia || ""}
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
    <div className="form-group">
      <label>Maternal TLC &gt; 15000 / mm³<span className="required">*</span></label>
      <select
        name="maternal_tlc_high"
        value={formData.maternal_tlc_high || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    <div className="form-group">
      <label>Foul-smelling liquor<span className="required">*</span></label>
      <select
        name="foul_smelling_liquor"
        value={formData.foul_smelling_liquor || ""}
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
    <div className="form-group">
      <label>Maternal UTI<span className="required">*</span></label>
      <select
        name="maternal_uti"
        value={formData.maternal_uti || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    <div className="form-group">
      <label>Maternal Diarrhea<span className="required">*</span></label>
      <select
        name="maternal_diarrhea"
        value={formData.maternal_diarrhea || ""}
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

{/* ================= INTRAPARTUM EVENTS ================= */}
<div className="form-section soft-blue">
  <h3>Intrapartum Events</h3>

  <div className="form-row">
    <div className="form-group">
      <label>MSL<span className="required">*</span></label>
      <select name="msl" value={formData.msl || ""} onChange={handleChange} required>
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    <div className="form-group">
      <label>Non-reactive NST<span className="required">*</span></label>
      <select
        name="non_reactive_nst"
        value={formData.non_reactive_nst || ""}
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
    <div className="form-group">
      <label>Reduced fetal movements<span className="required">*</span></label>
      <select
        name="reduced_fm"
        value={formData.reduced_fm || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    <div className="form-group">
      <label>Prolonged labor<span className="required">*</span></label>
      <select
        name="prolonged_labor"
        value={formData.prolonged_labor || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
  </div>

  {/* Cord accident */}
  <div className="form-group">
    <label>Cord accident<span className="required">*</span></label>
    <select
      name="cord_accident"
      value={formData.cord_accident || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.cord_accident === "Yes" && (
    <div className="followup-box">
    <div className="form-group">
      <label>Type of cord accident<span className="required">*</span></label>
      <select
        name="cord_accident_type"
        value={formData.cord_accident_type || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Cord around neck</option>
        <option>True cord knot</option>
        <option>Cord prolapse</option>
      </select>
    </div>
    </div>
  )}

  <div className="form-row">
    <div className="form-group">
      <label>Fetal bradycardia (&lt;110 bpm)<span className="required">*</span></label>
      <select
        name="fetal_bradycardia"
        value={formData.fetal_bradycardia || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    <div className="form-group">
      <label>Fetal tachycardia (&gt;160 bpm)<span className="required">*</span></label>
      <select
        name="fetal_tachycardia_intrapartum"
        value={formData.fetal_tachycardia_intrapartum || ""}
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
    <div className="form-group">
  <label>Duration of ROM (hrs)<span className="required">*</span></label>
  <input
    type="number"
    name="duration_rom"
    value={formData.duration_rom || ""}
    onChange={handleChange}
    required
    min="0"
    max="99"
    placeholder="0-99 (Hours)"
    onInput={(e) => {
      if (e.target.value.length > 2) {
        e.target.value = e.target.value.slice(0, 2);
      }
    }}
  />
</div>

    
  </div>

  {/* Uterotonic */}
  <div className="form-group">
    <label>Uterotonic given<span className="required">*</span></label>
    <select
      name="uterotonic"
      value={formData.uterotonic || ""}
      onChange={handleChange}
      required
    >
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.uterotonic === "Yes" && (
    <div className="followup-box">
    <div className="form-group">
      <label>Timing of uterotonic<span className="required">*</span></label>
      <select
        name="uterotonic_timing"
        value={formData.uterotonic_timing || ""}
        onChange={handleChange}
        required
      >
        <option value="">-- Select --</option>
        <option>Before cord clamp</option>
        <option>After cord clamp</option>
      </select>
    </div>
    </div>
  )}
</div>

<button className="submit-btn" type="submit">
  Submit Form C
</button>



    </form>
    
  );
}
