import React, { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./ScreeningForm.css";
import "./styles/FormC.css";
import { useFormProgress } from "./context/FormProgressContext";
import { usePatient } from "./context/PatientContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  ArrowLeft, ArrowRight, Save, Home,
  User, Heart, Activity, Shield, AlertTriangle, Zap,
} from "lucide-react";

const STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand",
  "Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur",
  "Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
  "Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

/* ── Segmented toggle (EMR-style with Auto-Scaling Separators) ── */
function Toggle({ name, value, options, onChange, disabled }) {
  const isActive = (opt) => {
    const v = typeof opt === "object" ? opt.value : opt;
    if (value === v) return true;
    if (v === "Yes"  && value === true)  return true;
    if (v === "No"   && value === false) return true;
    return String(value) === String(v);
  };
  
  // Intelligent scaling: Apply wide-toggle for categorical questions with > 3 options
  const isWide = options.length > 3;

  return (
    <div className={`emr-toggle-group${isWide ? " wide-toggle" : ""}${disabled ? " disabled" : ""}`}>
      {options.map(opt => {
        const v = typeof opt === "object" ? opt.value : opt;
        const l = typeof opt === "object" ? opt.label : opt;
        const active = isActive(opt);
        const sv = String(v).toLowerCase();
        let cls = "emr-toggle-btn";
        if (active) {
          cls += " selected";
          if (sv === "yes" || v === true)  cls += " yes-active";
          else if (sv === "no" || v === false) cls += " no-active";
          else cls += " other-active";
        }
        return (
          <button key={String(v)} type="button" disabled={disabled} className={cls}
            onClick={() => !disabled && onChange(name, v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export default function FormC() {
  const navigate = useNavigate();
  const { enrollmentId } = useParams();
  const { markFormCompleted } = useFormProgress();
  const location = useLocation();
  const { patientData } = usePatient();
  const isEditMode = location.state?.fromEdit === true;

  const [isSaved,   setIsSaved]   = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message,   setMessage]   = useState("");

  const isFieldEditable = !isSaved || isEditing;

  const [formData, setFormData] = useState({
    enrollment_id: "",
    mother_name: "",
    mother_age: "",
    maternal_uid: "",
    contact_mother: "",
    contact_husband: "",
    email_address: "",
    address: "",
    house: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    landmark: "",
    // OBSTETRIC HISTORY
    gravida: "", parity: "", abortions: "", live: "", still: "",
    booked: "",
    anc_visits: "",
    pregnancy_supervision: "",
    multiple: "No",
    lmp: "", edd: "",
    conception: "", artificial_type: "", artificial_other: "",
    antenatal_steroids: "",
    steroid_drug: "", steroid_doses: "",
    lddi_known: "",
    lddi_hours: "",
    steroid_courses: "",
    antenatal_mgso4: "",
    steroid_date: "",
    gestation_at_steroids: "",
    mgso4_date: "", mgso4_gestation_weeks: "", mgso4_gestation_days: "",
    // MATERNAL MEDICAL DISORDERS
    chronic_hypertension: false, hepatitis: false, heart_disease: false,
    renal_disease: false, vdrl_positive: false, seizure_disorder: false,
    asthma: false, hiv: false, hypothyroidism: false, hyperthyroidism: false,
    tb: false, malaria: false, severe_anemia: false,
    no_known_medical_disorder: true,
    other_medical_checkbox: false, other_medical_disorder: "",
    // OBSTETRIC PROBLEMS
    hdp: "", hdp_type: "",
    gdm: "", gdm_rx: [],
    liquor: "",
    fgr: "", fgr_centile: "",
    doppler: "", doppler_other: "",
    placental_abnormality: "", placental_type: "", placental_other: "",
    retroplacental_collection: "",
    aph: "", aph_type: "", aph_other: "",
    isoimmunization: "",
    // EVIDENCE OF INFECTION
    pprom: "", pprom_duration: "",
    preterm_labor: "",
    triple_i: "",
    maternal_fever: "",
    fetal_tachycardia: "",
    maternal_tlc_high: "",
    foul_smelling_liquor: "",
    maternal_uti: "",
    maternal_diarrhea: "",
    maternal_tachycardia: "",
    maternal_abdominal_tenderness: "",
    // INTRAPARTUM EVENTS
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
    obstetric_other: "",
  });

  // Auto-build address string
  useEffect(() => {
    const parts = [formData.house, formData.city, formData.district, formData.state, formData.pincode];
    const computed = parts.filter(Boolean).join(", ");
    if (computed) setFormData(prev => ({ ...prev, address: computed }));
  }, [formData.house, formData.city, formData.district, formData.state, formData.pincode]);

  // Auto-fill pregnancy supervision from ANC visits
  useEffect(() => {
    const v = Number(formData.anc_visits);
    if (formData.anc_visits === "" || isNaN(v)) {
      setFormData(prev => ({ ...prev, pregnancy_supervision: "" }));
    } else if (v === 0) {
      setFormData(prev => ({ ...prev, pregnancy_supervision: "Unsupervised" }));
    } else if (v < 4) {
      setFormData(prev => ({ ...prev, pregnancy_supervision: "Inadequately supervised" }));
    } else {
      setFormData(prev => ({ ...prev, pregnancy_supervision: "Supervised" }));
    }
  }, [formData.anc_visits]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!enrollmentId) return;
        const screeningId = localStorage.getItem("current_screening_id");
        let formAData = null;
        let formCData = null;
        if (screeningId) {
          const resA = await api.get(`/screenings/${screeningId}`);
          formAData = resA.data;
          try {
            const piiRes = await api.get(`/pii/screening/${screeningId}`);
            formAData = { ...formAData, ...piiRes.data };
          } catch (_) {}
        }
        if (isEditMode) {
          const resC = await api.get(`/maternal-details/${enrollmentId}`);
          formCData = resC.data;
        }
        setFormData(prev => ({
          ...prev,
          enrollment_id:   enrollmentId,
          mother_name:     `${formAData?.mother_first_name || ""} ${formAData?.mother_surname || ""}`.trim(),
          maternal_uid:    formAData?.maternal_uid || "",
          contact_mother:  formAData?.contact_mother  || formAData?.mother_contact  || "",
          contact_husband: formAData?.contact_husband || formAData?.husband_contact || "",
          gdm_rx: formCData?.gdm_rx
            ? formCData.gdm_rx.split(", ").map(s => s.trim()) : [],
          lmp: formCData?.lmp ? new Date(formCData.lmp)
             : formAData?.lmp_date ? new Date(formAData.lmp_date) : null,
          edd: formCData?.edd ? new Date(formCData.edd)
             : formAData?.expected_delivery_date ? new Date(formAData.expected_delivery_date) : null,
        }));
        if (isEditMode) setIsSaved(true);
      } catch (err) { console.log("Error loading Form C:", err); }
    };
    fetchData();
  }, [enrollmentId, isEditMode]);

  useEffect(() => {
    if (patientData?.dob) setFormData(prev => ({ ...prev, dob: patientData.dob }));
  }, [patientData]);

  useEffect(() => {
    if (!formData.mgso4_date || !formData.edd) return;
    const mg = new Date(formData.mgso4_date);
    const eddDate = formData.edd;
    if (!(mg instanceof Date) || !(eddDate instanceof Date)) return;
    if (isNaN(mg.getTime()) || isNaN(eddDate.getTime())) return;
    const diffDays = Math.floor((eddDate.getTime() - mg.getTime()) / (1000 * 60 * 60 * 24));
    const adminGA  = 280 - diffDays;
    if (adminGA < 0) return;
    setFormData(prev => ({
      ...prev,
      mgso4_gestation_weeks: Math.floor(adminGA / 7),
      mgso4_gestation_days:  adminGA % 7,
    }));
  }, [formData.mgso4_date, formData.edd]);

  useEffect(() => {
    if (formData.no_known_medical_disorder) {
      setFormData(prev => ({
        ...prev,
        chronic_hypertension: false, hepatitis: false, heart_disease: false,
        renal_disease: false, vdrl_positive: false, seizure_disorder: false,
        asthma: false, hypothyroidism: false, hyperthyroidism: false,
        tb: false, malaria: false, hiv: false, severe_anemia: false,
        other_medical_checkbox: false, other_medical_disorder: "",
      }));
    }
  }, [formData.no_known_medical_disorder]);

  useEffect(() => {
    if (!isEditMode) setFormData(prev => ({ ...prev, enrollment_id: enrollmentId }));
  }, [enrollmentId]);

  if (!enrollmentId) {
    return (
      <div style={{ padding: 40, color: "red", fontSize: 18, fontWeight: 600 }}>
        ❌ Enrollment ID missing. Please open Form C from Dashboard or Form B.
      </div>
    );
  }

  const handleGdmRxChange = (value) => {
    setFormData(prev => ({
      ...prev,
      gdm_rx: prev.gdm_rx.includes(value)
        ? prev.gdm_rx.filter(v => v !== value)
        : [...prev.gdm_rx, value],
    }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name !== "no_known_medical_disorder" && type === "checkbox" && checked)
        updated.no_known_medical_disorder = false;
      return updated;
    });
  };

  const handleToggle = (name, value) => {
    handleChange({ target: { name, value, type: "text", checked: false } });
  };

  const yesNoToBool = (v) => {
    if (v === "Yes" || v === true) return true;
    if (v === "No"  || v === false) return false;
    return null;
  };
  const num = (v) => (v === "" || v === undefined) ? null : Number(v);

  const buildPayload = () => ({
    enrollment_id: formData.enrollment_id,
    mother_name: formData.mother_name, mother_age: num(formData.mother_age),
    maternal_uid: formData.maternal_uid,
    contact_mother: formData.contact_mother, contact_husband: formData.contact_husband,
    address: formData.address,
    gravida: num(formData.gravida), parity: num(formData.parity),
    abortions: num(formData.abortions), live: num(formData.live), still: num(formData.still),
    booked: formData.booked, anc_visits: num(formData.anc_visits),
    multiple: formData.multiple,
    lmp: formData.lmp ? formData.lmp.toISOString().split("T")[0] : null,
    edd: formData.edd ? formData.edd.toISOString().split("T")[0] : null,
    conception: formData.conception, artificial_type: formData.artificial_type,
    antenatal_steroids: yesNoToBool(formData.antenatal_steroids),
    steroid_date: formData.steroid_date || null, steroid_drug: formData.steroid_drug,
    steroid_doses: num(formData.steroid_doses), lddi_hours: num(formData.lddi_hours),
    antenatal_mgso4: yesNoToBool(formData.antenatal_mgso4),
    gestation_at_steroids: num(formData.gestation_at_steroids),
    mgso4_date: formData.mgso4_date ? new Date(formData.mgso4_date).toISOString().split("T")[0] : null,
    mgso4_gestation_weeks: num(formData.mgso4_gestation_weeks),
    mgso4_gestation_days:  num(formData.mgso4_gestation_days),
    chronic_hypertension: formData.chronic_hypertension, hepatitis: formData.hepatitis,
    heart_disease: formData.heart_disease, renal_disease: formData.renal_disease,
    vdrl_positive: formData.vdrl_positive, seizure_disorder: formData.seizure_disorder,
    asthma: formData.asthma, hiv: formData.hiv, hypothyroidism: formData.hypothyroidism,
    hyperthyroidism: formData.hyperthyroidism, tb: formData.tb, malaria: formData.malaria,
    severe_anemia: formData.severe_anemia, other_medical_disorder: formData.other_medical_disorder,
    hdp: yesNoToBool(formData.hdp), hdp_type: formData.hdp_type,
    gdm: yesNoToBool(formData.gdm), gdm_rx: formData.gdm_rx.join(", "),
    liquor: formData.liquor, fgr: yesNoToBool(formData.fgr), fgr_centile: formData.fgr_centile,
    doppler: formData.doppler, doppler_other: formData.doppler_other,
    placental_abnormality: yesNoToBool(formData.placental_abnormality),
    placental_type: formData.placental_type, placental_other: formData.placental_other,
    retroplacental_collection: yesNoToBool(formData.retroplacental_collection),
    aph: yesNoToBool(formData.aph), aph_type: formData.aph_type, aph_other: formData.aph_other,
    isoimmunization: formData.isoimmunization || null,
    pprom: yesNoToBool(formData.pprom), pprom_duration: num(formData.pprom_duration),
    preterm_labor: yesNoToBool(formData.preterm_labor), triple_i: yesNoToBool(formData.triple_i),
    maternal_fever: yesNoToBool(formData.maternal_fever),
    fetal_tachycardia: yesNoToBool(formData.fetal_tachycardia),
    maternal_tlc_high: yesNoToBool(formData.maternal_tlc_high),
    foul_smelling_liquor: yesNoToBool(formData.foul_smelling_liquor),
    maternal_uti: yesNoToBool(formData.maternal_uti),
    maternal_diarrhea: yesNoToBool(formData.maternal_diarrhea),
    msl: yesNoToBool(formData.msl), non_reactive_nst: yesNoToBool(formData.non_reactive_nst),
    reduced_fm: yesNoToBool(formData.reduced_fm), prolonged_labor: yesNoToBool(formData.prolonged_labor),
    cord_accident: yesNoToBool(formData.cord_accident),
    cord_accident_type: formData.cord_accident_type,
    fetal_bradycardia: yesNoToBool(formData.fetal_bradycardia),
    fetal_tachycardia_intrapartum: yesNoToBool(formData.fetal_tachycardia_intrapartum),
    duration_rom: num(formData.duration_rom),
    uterotonic: yesNoToBool(formData.uterotonic),
    uterotonic_timing: formData.uterotonic_timing,
    // Additional CRF fields
    email_address: formData.email_address,
    pregnancy_supervision: formData.pregnancy_supervision,
    lddi_known: yesNoToBool(formData.lddi_known),
    steroid_courses: num(formData.steroid_courses),
    maternal_tachycardia: yesNoToBool(formData.maternal_tachycardia),
    maternal_abdominal_tenderness: yesNoToBool(formData.maternal_abdominal_tenderness),
  });

  const validateMedical = () => {
    const fields = [
      formData.chronic_hypertension, formData.hepatitis, formData.heart_disease,
      formData.renal_disease, formData.vdrl_positive, formData.seizure_disorder,
      formData.asthma, formData.hypothyroidism, formData.hyperthyroidism,
      formData.tb, formData.malaria, formData.hiv, formData.severe_anemia,
      formData.other_medical_checkbox,
    ];
    if (!formData.no_known_medical_disorder && !fields.some(Boolean)) {
      setMessage("❌ Please select at least one medical disorder OR choose 'No Known Medical Disorder'");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
    return true;
  };

  const saveForm = async () => {
    setMessage("");
    if (!validateMedical()) return false;
    try {
      await api.post("/maternal-details/", buildPayload());
      setMessage("✅ Form C saved successfully");
      setIsSaved(true); setIsEditing(false);
      markFormCompleted("form_c");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      console.error(err.response?.data || err);
      setMessage("❌ Save failed");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!validateMedical()) return;
    try {
      await api.post("/maternal-details/", buildPayload());
      alert("✅ Form C submitted successfully!");
      markFormCompleted("form_c");
      navigate(`/form-d/${formData.enrollment_id}`);
    } catch (err) {
      console.error(err.response?.data || err);
      alert("❌ Error submitting Form C");
    }
  };

  const handleNext     = async () => { const ok = await saveForm(); if (ok) navigate(`/form-d/${formData.enrollment_id}`); };
  const handlePrevious = () => navigate(-1);

  return (
    <>
      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode Active — changes will be saved when you click Save
        </div>
      )}

      <form
        className={`screening-form${isSaved && !isEditing ? " readonly" : ""}${isSaved && isEditing ? " editing-mode" : ""}`}
        onSubmit={handleSubmit}
      >
        <fieldset>
          <div className="form-inner">

            {/* ═══════════════ HEADER ═══════════════ */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={12} /> FORM C</div>
                <h2 className="form-main-title">Maternal Details</h2>
                <p className="form-main-subtitle font-normal text-sm color-slate">Maternal and Obstetric Information</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && (
                  <button type="button" className="btn-print-form"
                    onClick={() => window.print()}>🖨️ Print</button>
                )}
                {isSaved && (
                  <button type="button"
                    className={`btn-edit-form-header${isEditing ? " editing-active" : ""}`}
                    onClick={() => setIsEditing(p => !p)}>
                    {isEditing ? "✓ Done Editing" : "Edit Form"}
                  </button>
                )}
                <div className="screening-id-badge">
                  <span className="id-label">Enrollment ID</span>
                  <span className="id-val">{formData.enrollment_id || "—"}</span>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 1 — MATERNAL IDENTIFICATION
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <User size={18} className="section-header-icon" />
                  <h3>Maternal Identification</h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Enrollment ID</label>
                    <input value={formData.enrollment_id || ""} readOnly className="readonly-input" />
                  </div>
                  <div className="form-group">
                    <label>Mother's Name</label>
                    <input value={formData.mother_name || ""} readOnly className="readonly-input" />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Mother's Age (years) <span className="required">*</span></label>
                    <input type="number" name="mother_age" value={formData.mother_age || ""}
                      onChange={handleChange} required min="0" max="99"
                      readOnly={!isFieldEditable}
                      onInput={e => { if (e.target.value.length > 2) e.target.value = e.target.value.slice(0,2); }} />
                  </div>
                  <div className="form-group">
                    <label>Maternal UID (CR Number)</label>
                    <input value={formData.maternal_uid || ""} readOnly className="readonly-input" />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 2 — ADDRESS & CONTACT DETAILS
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <User size={18} className="section-header-icon" />
                  <h3>Address &amp; Contact Details</h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                 
                </div>

                

                {/* Address Section */}
                <div className="emr-address-section">
                  <div className="emr-address-title">Residential Address</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>House No. / Flat / Street <span className="required">*</span></label>
                      <input name="house" value={formData.house || ""} onChange={handleChange}
                        required readOnly={!isFieldEditable} className="emr-input" />
                    </div>
                    <div className="form-group">
                      <label>Village / City / Tehsil <span className="required">*</span></label>
                      <input name="city" value={formData.city || ""} onChange={handleChange}
                        required readOnly={!isFieldEditable} className="emr-input" />
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>District</label>
                      <input name="district" value={formData.district || ""} onChange={handleChange}
                        readOnly={!isFieldEditable} className="emr-input" />
                    </div>
                    <div className="form-group">
                      <label>State <span className="required">*</span></label>
                      <select name="state" value={formData.state || ""} onChange={handleChange}
                        required disabled={!isFieldEditable} className="emr-select">
                        <option value="">-- Select --</option>
                        {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>PIN Code</label>
                      <input name="pincode" value={formData.pincode || ""}
                        readOnly={!isFieldEditable} className="emr-input"
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g,"");
                          if (v.length <= 6) setFormData(p => ({ ...p, pincode: v }));
                        }} />
                    </div>
                  </div>
                  <div className="form-grid-1">
                    <div className="form-group">
                      <label>Nearest Landmark</label>
                      <input name="landmark" value={formData.landmark || ""} onChange={handleChange}
                        readOnly={!isFieldEditable} className="emr-input" />
                    </div></div>
                    <div className="form-grid-3">
                    <div className="form-group">

                  <label>Email Address</label>
                  <input type="email" name="email_address" value={formData.email_address || ""}
                    onChange={handleChange} placeholder="patient@email.com"
                    readOnly={!isFieldEditable} className="emr-input" />
                </div>
                 <div className="form-group">
                    <label>Mother Mobile No. (M)</label>
                    <input value={formData.contact_mother || ""} readOnly className="readonly-input" />
                  </div>
                  <div className="form-group">
                    <label>Husband Mobile No. (H)</label>
                    <input value={formData.contact_husband || ""} readOnly className="readonly-input" />
                  </div>
                  </div>
                  {formData.address && (
                    <div className="emr-address-preview">
                      <span className="preview-tag">System Format:</span> {formData.address}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 3 — OBSTETRIC HISTORY
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Heart size={18} className="section-header-icon" />
                  <h3>Obstetric History</h3>
                </div>
              </div>
              <div className="form-section-body">
                {/* GPAL 5-column grid */}
                <div className="form-grid-5">
                  {[
                    { name:"gravida",  label:"Gravida",   min:1, max:15 },
                    { name:"parity",   label:"Parity",    min:0, max:15 },
                    { name:"abortions",label:"Abortions", min:0, max:15 },
                    { name:"live",     label:"Live Births",min:0, max:15 },
                    { name:"still",    label:"Still Births",min:0, max:10 },
                  ].map(({ name, label, min, max }) => (
                    <div className="form-group" key={name}>
                      <label>{label} <span className="required">*</span></label>
                      <input type="text" name={name} value={formData[name] || ""}
                        required inputMode="numeric" placeholder={`${min}–${max}`}
                        readOnly={!isFieldEditable}
                        onChange={e => {
                          const v = e.target.value;
                          if (/^\d{0,2}$/.test(v) && (v===""||Number(v)<=max))
                            setFormData(p => ({ ...p, [name]: v }));
                        }} className="emr-input" />
                    </div>
                  ))}
                </div>

                {/* Booking / ANC / Supervision Row */}
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Booking Status <span className="required">*</span></label>
                    <Toggle name="booked" value={formData.booked}
                      options={["Booked","Unbooked","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div className="form-group">
                    <label>ANC Visits <span className="required">*</span></label>
                    <input type="text" name="anc_visits" value={formData.anc_visits || ""}
                      required inputMode="numeric" placeholder="0–20"
                      readOnly={!isFieldEditable}
                      onChange={e => {
                        const v = e.target.value;
                        if (/^\d{0,2}$/.test(v) && (v===""||Number(v)<=20))
                          setFormData(p => ({ ...p, anc_visits: v }));
                      }} className="emr-input" />
                  </div>
                  <div className="form-group">
                    <label>Pregnancy Supervision Status <span className="auto-tag">AUTO</span></label>
                    <input name="pregnancy_supervision" value={formData.pregnancy_supervision || ""}
                      readOnly className="readonly-input emr-input"
                      placeholder="Calculated from ANC visits" />
                  </div>
                </div>

                {/* Multiple pregnancy nested block */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Multiple Pregnancy <span className="required">*</span></label>
                    <Toggle name="multiple_yn"
                      value={formData.multiple === "No" ? "No" : "Yes"}
                      options={["Yes","No"]}
                      onChange={(_, val) => {
                        if (val === "No") handleToggle("multiple","No");
                        else if (formData.multiple === "No") handleToggle("multiple","Twin");
                      }}
                      disabled={!isFieldEditable} />
                  </div>
                  {formData.multiple !== "No" && (
                    <div className="form-group">
                      <label>Multiplicity Type <span className="required">*</span></label>
                      <Toggle name="multiple" value={formData.multiple}
                        options={["Twin","Triplet","Quad","Other"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                  )}
                </div>

                {/* LMP / EDD / Conception */}
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>LMP <span className="auto-tag"></span></label>
                    <DatePicker selected={formData.lmp} readOnly
                      onChange={date => setFormData(p => ({ ...p, lmp: date }))}
                      dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY" className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>EDD <span className="auto-tag"></span></label>
                    <DatePicker selected={formData.edd} readOnly
                      onChange={date => setFormData(p => ({ ...p, edd: date }))}
                      dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY" className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>Conception Type <span className="required">*</span></label>
                    <Toggle name="conception" value={formData.conception}
                      options={[
                        { label:"Spontaneous", value:"Spontaneous" },
                        { label:"Assisted Method", value:"Artificial" },
                      ]}
                      onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                </div>

                {formData.conception === "Artificial" && (
                  <div className="followup-box">
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Assisted Method Type <span className="required">*</span></label>
                        <Toggle name="artificial_type" value={formData.artificial_type}
                          options={["IVF","ICSI","Other"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                      <div />
                    </div>
                    {formData.artificial_type === "Other" && (
                      <div className="emr-specify-panel">
                        <div className="form-group">
                          <label>Specify ART Details <span className="required">*</span></label>
                          <input type="text" name="artificial_other"
                            value={formData.artificial_other || ""}
                            onChange={e => setFormData(p => ({
                              ...p, artificial_other: e.target.value.replace(/[^a-zA-Z ]/g,""),
                            }))}
                            required placeholder="Describe technique..."
                            readOnly={!isFieldEditable} className="emr-input" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 4 — ANTENATAL TREATMENT
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Shield size={18} className="section-header-icon" />
                  <h3>Antenatal Treatment</h3>
                </div>
              </div>
              <div className="form-section-body">
                {/* Antenatal Steroids */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Antenatal Steroids <span className="required">*</span></label>
                    <Toggle name="antenatal_steroids" value={formData.antenatal_steroids}
                      options={["Yes","No","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div />
                </div>

                {formData.antenatal_steroids === "Yes" && (
                  <div className="followup-box">
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>Drug <span className="required">*</span></label>
                        <Toggle name="steroid_drug" value={formData.steroid_drug}
                          options={["Betamethasone","Dexamethasone"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                      <div className="form-group">
                        <label>Doses <span className="required">*</span></label>
                        <Toggle name="steroid_doses" value={String(formData.steroid_doses)}
                          options={[{label:"1",value:"1"},{label:"2",value:"2"},{label:"3",value:"3"},{label:"4",value:"4"}]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                      <div className="form-group">
                        <label>Number of Courses <span className="required">*</span></label>
                        <Toggle name="steroid_courses" value={String(formData.steroid_courses)}
                          options={[{label:"1",value:"1"},{label:"2",value:"2"},{label:"3",value:"3"},{label:"4",value:"4"}]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                    </div>
                    <div className="form-grid-2" style={{ marginTop:12 }}>
                      <div className="form-group">
                        <label>LDDI Status <span className="required">*</span></label>
                        <Toggle name="lddi_known" value={formData.lddi_known}
                          options={["Known","Not known"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                      {formData.lddi_known === "Known" && (
                        <div className="form-group">
                          <label>LDDI (hrs) <span className="required">*</span></label>
                          <input type="number" name="lddi_hours" value={formData.lddi_hours || ""}
                            onChange={handleChange} required min="0" max="99" placeholder="Hours"
                            readOnly={!isFieldEditable} className="emr-input"
                            onInput={e => { const v=e.target.value.replace(/\D/g,""); e.target.value=v.slice(0,2); }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Antenatal MgSO4 */}
                <div className="form-grid-2" style={{ marginTop:8 }}>
                  <div className="form-group">
                    <label>Antenatal MgSO₄ <span className="required">*</span></label>
                    <Toggle name="antenatal_mgso4" value={formData.antenatal_mgso4}
                      options={["Yes","No","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div />
                </div>

                {formData.antenatal_mgso4 === "Yes" && (
                  <div className="followup-box">
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Date of Administration <span className="required">*</span></label>
                        <DatePicker
                          selected={formData.mgso4_date ? new Date(formData.mgso4_date) : null}
                          onChange={date => setFormData(p => ({ ...p, mgso4_date: date }))}
                          dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY" className="form-input"
                          readOnly={!isFieldEditable} />
                      </div>
                      <div className="form-group">
                        <label>Gestation at Administration <span className="auto-tag">AUTO</span></label>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <input type="number" name="mgso4_gestation_weeks"
                            value={formData.mgso4_gestation_weeks || ""} readOnly
                            onChange={handleChange} min="0" max="42" placeholder="Wks"
                            className="emr-input" style={{ width:90 }} />
                          <span style={{ color:"#6b7280", fontSize:13 }}>wks</span>
                          <input type="number" name="mgso4_gestation_days"
                            value={formData.mgso4_gestation_days || ""} readOnly
                            onChange={handleChange} min="0" max="6" placeholder="Days"
                            className="emr-input" style={{ width:75 }} />
                          <span style={{ color:"#6b7280", fontSize:13 }}>days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 5 — MATERNAL MEDICAL DISORDERS
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Shield size={18} className="section-header-icon" />
                  <h3>Maternal Medical Disorders <span className="required">*</span></h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="disorder-card-grid">
                  {[
                    { name:"no_known_medical_disorder", label:"No Known Medical Disorder", always:true },
                    { name:"chronic_hypertension",  label:"Chronic Hypertension" },
                    { name:"hepatitis",             label:"Hepatitis" },
                    { name:"heart_disease",         label:"Heart Disease" },
                    { name:"renal_disease",         label:"Renal Disease" },
                    { name:"vdrl_positive",         label:"VDRL +" },
                    { name:"seizure_disorder",      label:"Seizure Disorder" },
                    { name:"asthma",                label:"Asthma" },
                    { name:"hypothyroidism",        label:"Hypothyroidism" },
                    { name:"hyperthyroidism",       label:"Hyperthyroidism" },
                    { name:"severe_anemia",         label:"Severe Anemia (Hb < 8)" },
                    { name:"tb",                    label:"Tuberculosis" },
                    { name:"malaria",               label:"Malaria" },
                    { name:"hiv",                   label:"HIV" },
                    { name:"other_medical_checkbox",label:"Other" },
                  ].map(({ name, label, always }) => {
                    const disabled = (!always && formData.no_known_medical_disorder) || !isFieldEditable;
                    return (
                      <label key={name}
                        className={`disorder-card${formData[name] ? " disorder-card--selected" : ""}${disabled ? " disorder-card--disabled" : ""}`}>
                        <input type="checkbox" name={name} checked={!!formData[name]}
                          onChange={handleChange} disabled={disabled} style={{ display:"none" }} />
                        <span className="disorder-card__check">{formData[name] ? "✓" : ""}</span>
                        <span className="disorder-card__label">{label}</span>
                      </label>
                    );
                  })}
                </div>
                {formData.other_medical_checkbox && (
                  <div className="emr-specify-panel">
                    <div className="form-group">
                      <label>Specify Other Medical Disorder <span className="required">*</span></label>
                      <input name="other_medical_disorder" value={formData.other_medical_disorder || ""}
                        onChange={handleChange} required placeholder="Specify details..."
                        readOnly={!isFieldEditable} className="emr-input" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 6 — OBSTETRIC PROBLEMS
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Activity size={18} className="section-header-icon" />
                  <h3>Obstetric Problems</h3>
                </div>
              </div>
              <div className="form-section-body">
                {/* HDP Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">HDP</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>HDP <span className="required">*</span></label>
                      <Toggle name="hdp" value={formData.hdp}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    {formData.hdp === "Yes" && (
                      <div className="form-group">
                        <label>Type <span className="required">*</span></label>
                        <Toggle name="hdp_type" value={formData.hdp_type}
                          options={["Gest HTN","PE","Severe PE","Eclampsia"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                    )}
                  </div>
                </div>

                {/* GDM Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">GDM</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>GDM <span className="required">*</span></label>
                      <Toggle name="gdm" value={formData.gdm}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    <div className="form-group">
                      <label>Liquor <span className="required">*</span></label>
                      <Toggle name="liquor" value={formData.liquor}
                        options={["Normal","Absent/Oligo","Poly","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                  </div>
                  {formData.gdm === "Yes" && (
                    <div className="followup-box">
                      <div className="rx-container-modern">
  <label className="rx-label-modern">
    Rx Treatment <span className="required">*</span>
  </label>

  <div className="rx-note">
    ℹ️ Multiple options can be selected
  </div>

  <div className="rx-horizontal-group">
    {[
      { label: "MNT", value: "MNT" },
      { label: "Insulin", value: "Insulin" },
      { label: "Oral Anti-Diabetic Drugs", value: "Oral" },
    ].map(item => (
      <button
        key={item.value}
        type="button"
        className={`rx-horizontal-btn ${
          formData.gdm_rx.includes(item.value) ? "active" : ""
        }`}
        onClick={() =>
          isFieldEditable && handleGdmRxChange(item.value)
        }
      >
        {item.label}
      </button>
    ))}
  </div>
</div>
                    </div>
                  )}
                </div>

                {/* FGR Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">FGR</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>FGR <span className="required">*</span></label>
                      <Toggle name="fgr" value={formData.fgr}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    {formData.fgr === "Yes" && (
                      <div className="form-group">
                        <label>Centile</label>
                        <input type="number" name="fgr_centile" value={formData.fgr_centile || ""}
                          onChange={handleChange} min="1" max="100" placeholder="1-100"
                          readOnly={!isFieldEditable} className="emr-input"
                          onInput={e => { const v=e.target.value.replace(/\D/g,""); e.target.value=v.slice(0,3); }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Doppler Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Doppler</div>
                  <div className="form-group">
                    <label>Doppler Findings <span className="required">*</span></label>
                    <Toggle name="doppler" value={formData.doppler}
                      options={["Normal","AEDF","REDF","Not done","Not known","Other"]}
                      onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  {formData.doppler === "Other" && (
                    <div className="emr-specify-panel">
                      <div className="form-group">
                        <label>Specify Doppler Finding <span className="required">*</span></label>
                        <input type="text" name="doppler_other" value={formData.doppler_other || ""}
                          onChange={handleChange} required placeholder="Describe findings..."
                          readOnly={!isFieldEditable} className="emr-input" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Placental Abnormalities Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Placental Abnormalities</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Placental Abnormality <span className="required">*</span></label>
                      <Toggle name="placental_abnormality" value={formData.placental_abnormality}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    {formData.placental_abnormality === "Yes" && (
                      <div className="form-group">
                        <label>Abnormality Type <span className="required">*</span></label>
                        <Toggle name="placental_type" value={formData.placental_type}
                          options={["Previa","Accreta","Others"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                    )}
                  </div>
                  {formData.placental_abnormality === "Yes" &&
                    (formData.placental_type === "Others" || formData.placental_type === "Other") && (
                    <div className="emr-specify-panel">
                      <div className="form-group">
                        <label>Specify <span className="required">*</span></label>
                        <input name="placental_other" value={formData.placental_other || ""}
                          onChange={handleChange} required readOnly={!isFieldEditable} className="emr-input" />
                      </div>
                    </div>
                  )}
                  <div className="form-grid-2" style={{ marginTop:12 }}>
                    <div className="form-group">
                      <label>Retroplacental Collection <span className="required">*</span></label>
                      <Toggle name="retroplacental_collection" value={formData.retroplacental_collection}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    <div className="form-group">
                      <label>Isoimmunization <span className="required">*</span></label>
                      <Toggle name="isoimmunization" value={formData.isoimmunization}
                        options={["Yes","No"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                  </div>
                </div>

                {/* APH Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">APH</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>APH <span className="required">*</span></label>
                      <Toggle name="aph" value={formData.aph}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    {formData.aph === "Yes" && (
                      <div className="form-group">
                        <label>APH Type <span className="required">*</span></label>
                        <Toggle name="aph_type" value={formData.aph_type}
                          options={[
                            { label:"Abruption", value:"Placental Abruption" },
                            { label:"Previa",    value:"Vasa Previa" },
                            { label:"Other",     value:"Other" },
                          ]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                    )}
                  </div>
                  {formData.aph === "Yes" && formData.aph_type === "Other" && (
                    <div className="emr-specify-panel">
                      <div className="form-group">
                        <label>Specify APH Type <span className="required">*</span></label>
                        <input type="text" name="aph_other" value={formData.aph_other || ""}
                          onChange={handleChange} required placeholder="Describe..."
                          readOnly={!isFieldEditable} className="emr-input" />
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 7 — EVIDENCE OF INFECTION
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <AlertTriangle size={18} className="section-header-icon" />
                  <h3>Evidence of Infection</h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>pPROM <span className="required">*</span></label>
                    <div className="infection-control-wrapper">
                      <Toggle name="pprom" value={formData.pprom} options={["Yes","No"]} onChange={handleToggle} disabled={!isFieldEditable} />
                      {formData.pprom === "Yes" && (
                        <input type="number" name="pprom_duration" value={formData.pprom_duration || ""}
                          onChange={handleChange} required min="0" max="99" placeholder="Duration (hrs)"
                          readOnly={!isFieldEditable} className="emr-input inline-duration-input" />
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Preterm Labor <span className="required">*</span></label>
                    <Toggle name="preterm_labor" value={formData.preterm_labor} options={["Yes","No"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Triple "I" (Intrauterine Inflammation/Infection) <span className="required">*</span></label>
                    <Toggle name="triple_i" value={formData.triple_i} options={["Yes","No"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div className="form-group">
                    <label>Maternal Fever (≥39℃ or 38–39℃ on 2 occasions) <span className="required">*</span></label>
                    <Toggle name="maternal_fever" value={formData.maternal_fever} options={["Yes","No"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Baseline Fetal Tachycardia (&gt;160 bpm) <span className="required">*</span></label>
                    <Toggle name="fetal_tachycardia" value={formData.fetal_tachycardia} options={["Yes","No"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div className="form-group">
                    <label>Maternal TLC &gt;15000 per mm³ <span className="required">*</span></label>
                    <Toggle name="maternal_tlc_high" value={formData.maternal_tlc_high} options={["Yes","No","Not done"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Maternal Tachycardia <span className="required">*</span></label>
                    <Toggle name="maternal_tachycardia" value={formData.maternal_tachycardia} options={["Yes","No"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div className="form-group">
                    <label>Maternal Abdominal Tenderness <span className="required">*</span></label>
                    <Toggle name="maternal_abdominal_tenderness" value={formData.maternal_abdominal_tenderness} options={["Yes","No"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Foul-Smelling Liquor <span className="required">*</span></label>
                    <Toggle name="foul_smelling_liquor" value={formData.foul_smelling_liquor} options={["Yes","No","Not known"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div className="form-group">
                    <label>Maternal UTI <span className="required">*</span></label>
                    <Toggle name="maternal_uti" value={formData.maternal_uti} options={["Yes","No","Not known"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Maternal Diarrhea <span className="required">*</span></label>
                    <Toggle name="maternal_diarrhea" value={formData.maternal_diarrhea} options={["Yes","No","Not known"]} onChange={handleToggle} disabled={!isFieldEditable} />
                  </div>
                  <div />
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 8 — INTRAPARTUM EVENTS
            ═══════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Zap size={18} className="section-header-icon" />
                  <h3>Intrapartum Events</h3>
                </div>
              </div>
              <div className="form-section-body">
                {/* Fetal Monitoring Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Fetal Monitoring</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>MSL <span className="required">*</span></label>
                      <Toggle name="msl" value={formData.msl}
                        options={["Yes","No"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    <div className="form-group">
                      <label>Non-reactive NST <span className="required">*</span></label>
                      <Toggle name="non_reactive_nst" value={formData.non_reactive_nst}
                        options={["Yes","No","Not done"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                  </div>
                  <div className="form-grid-2" style={{ marginTop:12 }}>
                    <div className="form-group">
                      <label>Reduced Fetal Movements <span className="required">*</span></label>
                      <Toggle name="reduced_fm" value={formData.reduced_fm}
                        options={["Yes","No","Not done"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    <div className="form-group">
                      <label>Fetal Bradycardia (&lt;110 bpm) <span className="required">*</span></label>
                      <Toggle name="fetal_bradycardia" value={formData.fetal_bradycardia}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                  </div>
                  <div className="form-grid-2" style={{ marginTop:12 }}>
                    <div className="form-group">
                      <label>Fetal Tachycardia (&gt;160 bpm) <span className="required">*</span></label>
                      <Toggle name="fetal_tachycardia_intrapartum" value={formData.fetal_tachycardia_intrapartum}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    <div />
                  </div>
                </div>

                {/* Labor & ROM Metrics Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Labor &amp; ROM Metrics</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Prolonged Labor <span className="required">*</span></label>
                      <Toggle name="prolonged_labor" value={formData.prolonged_labor}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    <div className="form-group">
                      <label>Duration of ROM (hrs) <span className="required">*</span></label>
                      <input type="number" name="duration_rom" value={formData.duration_rom || ""}
                        onChange={handleChange} required min="0" max="99" placeholder="0-99"
                        readOnly={!isFieldEditable} className="emr-input"
                        onInput={e => { if (e.target.value.length>2) e.target.value=e.target.value.slice(0,2); }} />
                    </div>
                  </div>
                </div>

                {/* Cord Occurrences Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Cord Occurrences</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Cord Accident <span className="required">*</span></label>
                      <Toggle name="cord_accident" value={formData.cord_accident}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    {formData.cord_accident === "Yes" && (
                      <div className="form-group">
                        <label>Type of Cord Accident <span className="required">*</span></label>
                        <Toggle name="cord_accident_type" value={formData.cord_accident_type}
                          options={["Cord around neck","True cord knot","Cord prolapse"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Intrapartum Pharmacology Subcard */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Intrapartum Pharmacology</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Uterotonic Given <span className="required">*</span></label>
                      <Toggle name="uterotonic" value={formData.uterotonic}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} />
                    </div>
                    {formData.uterotonic === "Yes" && (
                      <div className="form-group">
                        <label>Timing of Uterotonic <span className="required">*</span></label>
                        <Toggle name="uterotonic_timing" value={formData.uterotonic_timing}
                          options={["Before cord clamp","After cord clamp"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {message && <p className="form-message">{message}</p>}

          </div>
        </fieldset>
      </form>

      {/* STICKY FOOTER */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={handlePrevious}>
          <ArrowLeft size={15} /> Previous
        </button>
        <button type="button" className="btn btn-save btn-outline-blue"
          onClick={saveForm}>
          <Save size={15} /> Save
        </button>
        <div className="footer-step-indicator">
          <span className="step-text">STEP 3 OF 17</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment" />
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Next <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}