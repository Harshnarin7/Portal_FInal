import React, { useState, useRef, useEffect } from "react";
import api from "./api/axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useParams, useNavigate } from "react-router-dom";
import "./styles/global.css";
import "./styles/FormA.css";
import YesNoToggle from "./components/YesNoToggle";
import {
  ArrowLeft, ArrowRight, Save, Home,
  Calendar, User, FileText, ShieldAlert, CheckSquare, Info,
} from "lucide-react";
import { useFormProgress } from "./context/FormProgressContext";

/* ── helpers ── */
function formatDateToDDMMYYYY(date) {
  if (!date) return "";
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
}
const toDateTimeLocalValue = d => {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ── EditableField ── */
const EditableField = ({ name, children, isSaved, isEditing, activeField, setActiveField }) => {
  const editable = !isSaved || (isEditing && activeField === name);
  const child = React.cloneElement(children, {
    readOnly: !editable,
    disabled: !editable && children.type === "select",
  });
  return (
    <div className="field-row">
      <div className="field-input">{child}</div>
      {isSaved && (
        <button type="button"
          className={`edit-icon${activeField === name ? " active" : ""}`}
          onClick={() => setActiveField(name)}>✏️</button>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════
   SCREENING FORM
════════════════════════════════════════════ */
function ScreeningForm() {
  const navigate = useNavigate();
  const { markFormCompleted, resetProgress } = useFormProgress();
  const { screeningId } = useParams();

  const [errors, setErrors]                     = useState({});
  const [isInitialLoad, setIsInitialLoad]       = useState(true);
  const [isSaved, setIsSaved]                   = useState(false);
  const [isEditing, setIsEditing]               = useState(false);
  const [activeField, setActiveField]           = useState(null);
  const [nurses, setNurses]                     = useState([]);
  const [message, setMessage]                   = useState("");
  const [showEndModal, setShowEndModal]         = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingFields, setMissingFields]       = useState([]);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentMessage, setConsentMessage]     = useState("");

  const editableProps = { isSaved, isEditing, activeField, setActiveField };
  const SITE_ID_MAP   = { PGIMER:"01", GMCH:"02", IOG:"03", AFMC:"04", "GMCH-A":"05", AMC:"06" };

  const [formData, setFormData] = useState({
    screening_datetime:"", site_name:"", site_id:"", screened_by:"",
    mother_first_name:"", mother_surname:"", husband_first_name:"", husband_surname:"",
    maternal_uid:"", hospital_admission_number:"", mother_contact:"", husband_contact:"",
    gestation_weeks:"", gestation_days:"", gestation_method:"",
    lmp_known:"", ga_source:"", lmp_date:"", expected_delivery_date:"",
    inclusion_gest_lt_32:false, anticipated_dr_resus:false,
    exclusion_present:false, exclusion_reasons:"", fetal_hydrops:"", final_decision:"",
    consent_given:"", consent_taken_by:"", consent_datetime:"",
    consent_form_version:"v1.0", consent_language:"English",
    consent_obtained_by_signature:"", reconsent_obtained:false,
    reconsent_datetime:"", reconsent_form_version:"",
    reason_not_approached:"", other_reason:"",
    gestation_known:"", best_ga_weeks:"", best_ga_days:"",
    edd_known:"", edd_date:"", auto_ga_weeks:"", auto_ga_days:"",
    ga_not_determinable:false, exclusion_anomaly:"", exclusion_anomaly_details:"",
    fetal_hydrops_type:"", iufd:"",
    decision_forego_resus:"", decision_forego_resus_reason:"",
    insufficient_time:"", insufficient_time_reason:"",
    relationship_to_participant:"", relationship_other:"",
  });

  /* ── effects (all unchanged) ── */
  useEffect(() => {
    setFormData(p => ({ ...p, screening_datetime: toDateTimeLocalValue(new Date()) }));
  }, []);

  useEffect(() => {
    if (!formData.site_name) { setNurses([]); return; }
    api.get(`/sites/${formData.site_name}/screeners`)
      .then(r => setNurses(r.data)).catch(() => setNurses([]));
  }, [formData.site_name]);

  useEffect(() => {
    if (!screeningId) {
      localStorage.removeItem("current_screening_id");
      localStorage.removeItem("current_enrollment_id");
      resetProgress();
    }
  }, [screeningId]);

  useEffect(() => { if (!isSaved) setActiveField(null); }, [isSaved]);

  useEffect(() => {
    if (!formData.lmp_date) return;
    const edd = new Date(formData.lmp_date);
    edd.setDate(edd.getDate() + 280);
    setFormData(p => ({ ...p, edd_date: edd.toISOString().split("T")[0], edd_known:"Yes" }));
  }, [formData.lmp_date]);

  useEffect(() => {
    if (!formData.edd_date) return;
    const diff = Math.floor(280 - (new Date(formData.edd_date) - new Date()) / 86400000);
    setFormData(p => ({ ...p, auto_ga_weeks: Math.floor(diff/7), auto_ga_days: diff%7, ga_not_determinable:false }));
  }, [formData.edd_date]);

  useEffect(() => {
    const id = screeningId || localStorage.getItem("current_screening_id");
    if (!id || id === "undefined" || id === "null") return;
    if (!screeningId) navigate(`/form-a/${id}`);
    api.get(`/screenings/by-screening-id/${id}`).then(res => {
      const d = res.data;
      setFormData(p => ({
        ...p, ...d,
        gestation_known: d.gestation_weeks ? "Yes" : "No",
        best_ga_weeks: d.gestation_weeks||"", best_ga_days: d.gestation_days||"",
        edd_known: d.expected_delivery_date ? "Yes" : "No",
        edd_date: d.expected_delivery_date||"",
        exclusion_anomaly:     d.exclusion_reasons?.includes("Structural anomaly")   ?"Yes":"No",
        fetal_hydrops:         d.exclusion_reasons?.includes("Fetal hydrops")        ?"Yes":"No",
        decision_forego_resus: d.exclusion_reasons?.includes("Forego resuscitation") ?"Yes":"No",
        insufficient_time:     d.exclusion_reasons?.includes("Insufficient time")    ?"Yes":"No",
        iufd:                  d.exclusion_reasons?.includes("IUFD")                 ?"Yes":"No",
        consent_given: d.consent_given||"",
        consent_taken_by: d.consent_taken_by||"",
        consent_datetime: d.consent_datetime ? String(d.consent_datetime).slice(0,16) : "",
        consent_form_version:  d.consent_form_version||"v1.0",
        consent_language:      d.consent_language||"English",
        consent_obtained_by_signature: d.consent_obtained_by_signature||"",
        reconsent_obtained: Boolean(d.reconsent_obtained),
        reconsent_datetime: d.reconsent_datetime ? String(d.reconsent_datetime).slice(0,16) : "",
        reconsent_form_version: d.reconsent_form_version||"",
        relationship_to_participant: d.relationship_to_participant||"",
        relationship_other: d.relationship_other||"",
        reason_for_consent_refusal: d.reason_for_consent_refusal||"",
        reason_for_consent_refusal_other: d.reason_for_consent_refusal_other||"",
        reason_not_approached: d.reason_not_approached||"",
        reason_not_approached_other: d.reason_not_approached_other||"",
      }));
      setIsSaved(true); setIsEditing(false); setActiveField(null); setIsInitialLoad(false);
    }).catch(() => {});
  }, [screeningId]);

  /* ── derived ── */
  const getEligibilityStatus = () => {
    let weeks = null, days = 0;
    if (formData.gestation_known === "Yes") {
      if (!formData.best_ga_weeks) return null;
      weeks = Number(formData.best_ga_weeks); days = Number(formData.best_ga_days||0);
    } else if (formData.gestation_known === "No" && formData.edd_known === "Yes") {
      if (formData.auto_ga_weeks === "" || formData.auto_ga_weeks === null) return null;
      weeks = Number(formData.auto_ga_weeks); days = Number(formData.auto_ga_days||0);
    }
    if (weeks === null || isNaN(weeks)) return null;
    const t = weeks * 7 + days;
    if (t < 25*7) return "low";
    if (t > 31*7+6) return "high";
    return "eligible";
  };

  const eligibilityStatus     = getEligibilityStatus();
  const isNotEligible         = eligibilityStatus === "low" || eligibilityStatus === "high";
  const gaNotDeterminable     = formData.gestation_known === "No" && formData.ga_source === "Neither";
  const endParticipation      = gaNotDeterminable || isNotEligible;
  const gestationPathComplete = formData.gestation_known === "Yes" || (formData.gestation_known === "No" && formData.edd_known === "Yes");
  const anyExclusionYes       = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"].some(k => formData[k] === "Yes");
  const displayWeeks          = formData.gestation_known === "Yes" ? formData.best_ga_weeks : formData.auto_ga_weeks;
  const displayDays           = formData.gestation_known === "Yes" ? (formData.best_ga_days||0) : (formData.auto_ga_days||0);

  /* ── handleChange ── */
  const handleChange = e => {
    let { name, value, type, checked } = e.target;
    if (type === "checkbox") value = checked;
    ["screened_by","mother_first_name","mother_surname","husband_first_name","husband_surname"]
      .includes(name) && (value = value.replace(/[^a-zA-Z ]/g, ""));
    if (name === "site_name")         { setFormData(p => ({ ...p, site_name:value, site_id:SITE_ID_MAP[value]||"", screened_by:"" })); return; }
    if (name === "gestation_known")   { setFormData(p => ({ ...p, gestation_known:value, ga_source:"", lmp_date:"", edd_date:"", auto_ga_weeks:"", auto_ga_days:"", best_ga_weeks:"", best_ga_days:"" })); return; }
    if (name === "ga_source")         { setFormData(p => ({ ...p, ga_source:value, lmp_date:"", edd_date:"", auto_ga_weeks:"", auto_ga_days:"" })); return; }
    if (name === "exclusion_anomaly") { setFormData(p => ({ ...p, exclusion_anomaly:value, exclusion_anomaly_details:value==="Yes"?p.exclusion_anomaly_details:"" })); return; }
    if (name === "fetal_hydrops")     { setFormData(p => ({ ...p, fetal_hydrops:value, fetal_hydrops_type:value==="Yes"?p.fetal_hydrops_type:"" })); return; }
    if (name === "decision_forego_resus")        { setFormData(p => ({ ...p, decision_forego_resus:value, decision_forego_resus_reason:value==="Yes"?p.decision_forego_resus_reason:"" })); return; }
    if (name === "decision_forego_resus_reason") { setFormData(p => ({ ...p, decision_forego_resus_reason:value, decision_forego_resus_reason_other:value==="Other"?p.decision_forego_resus_reason_other:"" })); return; }
    if (name === "insufficient_time") { setFormData(p => ({ ...p, insufficient_time:value, insufficient_time_reason:value==="Yes"?p.insufficient_time_reason:"" })); return; }
    if (name === "consent_given") {
      setFormData(p => {
        if (isInitialLoad || p.consent_given === value) return { ...p, consent_given:value };
        return { ...p, consent_given:value, consent_taken_by:"", relationship_to_participant:"", relationship_other:"",
          reason_for_consent_refusal:"", reason_for_consent_refusal_other:"", reason_not_approached:"", reason_not_approached_other:"" };
      }); return;
    }
    if (name === "reason_for_consent_refusal")  { setFormData(p => ({ ...p, reason_for_consent_refusal:value, reason_for_consent_refusal_other:value==="Other"?p.reason_for_consent_refusal_other:"" })); return; }
    if (name === "reason_not_approached")       { setFormData(p => ({ ...p, reason_not_approached:value, reason_not_approached_other:value==="Other"?p.reason_not_approached_other:"" })); return; }
    if (name === "relationship_to_participant") { setFormData(p => ({ ...p, relationship_to_participant:value, relationship_other:value==="Other"?p.relationship_other:"" })); return; }
    if (name === "maternal_uid") value = value.replace(/[^0-9]/g, "");
    setFormData(p => ({ ...p, [name]:value }));
  };

  const handleContactChange = (e, field) => {
    const value = e.target.value.replace(/\D/g, "");
    setFormData(p => ({ ...p, [field]:value }));
    setErrors(p => ({ ...p, [field]: value.length === 0 || value.length === 10 ? "" : "Must be 10 digits" }));
  };

  const getMissingFields = () => {
    const m = [];
    if (!formData.site_name)             m.push("Site");
    if (!formData.screened_by)           m.push("Screened By");
    if (!formData.mother_first_name)     m.push("Mother First Name");
    if (!formData.husband_first_name)    m.push("Husband First Name");
    if (!formData.maternal_uid)          m.push("Maternal UID");
    if (!formData.mother_contact)        m.push("Mother Mobile Number");
    if (!formData.husband_contact)       m.push("Husband Mobile Number");
    if (!formData.consent_given)         m.push("Consent");
    if (!formData.exclusion_anomaly)     m.push("Structural Anomaly");
    if (!formData.fetal_hydrops)         m.push("Fetal Hydrops");
    if (!formData.decision_forego_resus) m.push("Forego Resuscitation");
    if (!formData.insufficient_time)     m.push("Insufficient Time");
    if (!formData.iufd)                  m.push("IUFD");
    return m;
  };

  const saveForm = async () => {
    const missing = getMissingFields();
    if (missing.length > 0) {
      setMissingFields(missing);
      window.scrollTo({ top:0, behavior:"smooth" });
      setShowMissingModal(true);
    }
    const backendDate = formData.edd_date ? new Date(formData.edd_date).toISOString().split("T")[0] : null;
    const payload = {
      screening_id: formData.screening_id,
      screening_datetime: formData.screening_datetime,
      site_name: formData.site_name, site_id: formData.site_id, screened_by: formData.screened_by,
      mother_first_name: formData.mother_first_name, mother_surname: formData.mother_surname,
      husband_first_name: formData.husband_first_name, husband_surname: formData.husband_surname,
      maternal_uid: formData.maternal_uid, hospital_admission_number: formData.hospital_admission_number,
      mother_contact: formData.mother_contact||null, husband_contact: formData.husband_contact||null,
      gestation_weeks: formData.gestation_known==="Yes" ? parseInt(formData.best_ga_weeks)||0 : parseInt(formData.auto_ga_weeks)||0,
      gestation_days:  formData.gestation_known==="Yes" ? parseInt(formData.best_ga_days)||0  : parseInt(formData.auto_ga_days)||0,
      exclusion_present: anyExclusionYes,
      lmp_date: formData.lmp_date||null, expected_delivery_date: backendDate||null,
    };
    try {
      const storedId = localStorage.getItem("current_screening_id");
      const existingId = (screeningId && screeningId !== "undefined") ? screeningId
        : (storedId && storedId !== "undefined" && storedId !== "null") ? storedId : null;
      const res = existingId
        ? await api.put(`/screenings/${existingId}`, payload)
        : await api.post("/screenings/", payload);
      localStorage.setItem("current_screening_id", res.data.screening_id);
      localStorage.setItem("current_enrollment_id", res.data.enrollment_id);
      if (missing.length === 0) {
        setMessage("✅ Form saved successfully");
        setIsSaved(true); setIsEditing(false);
      } else {
        setMessage("⚠️ Saved (Incomplete)");
        setIsSaved(false);
      }
      setActiveField(null);
      window.scrollTo({ top:0, behavior:"smooth" });
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch {
      setMessage("❌ Save failed");
      window.scrollTo({ top:0, behavior:"smooth" });
      setIsSaved(false);
      return false;
    }
  };

  const handleNext = async () => {
    const success = await saveForm();
    if (!success) return;
    if (formData.consent_given !== "Yes") {
      localStorage.setItem("enrollment_locked", "true");
      window.dispatchEvent(new Event("storage"));
      const msgs = { No:"consent was refused.", "Not approached":"consent was not taken." };
      setConsentMessage(`Screening completed. Participant cannot be enrolled because ${msgs[formData.consent_given]||"of consent status."}`);
      setShowConsentModal(true);
      return;
    }
    markFormCompleted("form_a");
    localStorage.removeItem("enrollment_locked");
    window.dispatchEvent(new Event("storage"));
    navigate(`/form-b/${localStorage.getItem("current_screening_id")}`);
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <>
      <form className={`screening-form${isSaved ? " readonly" : ""}`}>
        <fieldset>
          <div className="form-inner">

            {/* ── HEADER ROW ── */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb">
                  <Home size={12} /> FORM A
                </div>
                <h2 className="form-main-title">Screening Form</h2>
                <p className="form-main-subtitle">
                  Eligibility Assessment for Pregnant Women &lt;32 weeks gestation
                </p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && (
                  <button type="button" className="btn-edit-form-header"
                    onClick={() => setIsEditing(p => !p)}>
                    ✏️ {isEditing ? "Done Editing" : "Edit Form"}
                  </button>
                )}
                <div className="screening-id-badge">
                  <span className="id-label">Screening ID</span>
                  <span className="id-val">{formData.screening_id || "—"}</span>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════
                CARD 1 — GESTATION ASSESSMENT
            ══════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Calendar size={18} className="section-header-icon" />
                  <h3>Gestation Assessment</h3>
                </div>
                {eligibilityStatus === "eligible" && <span className="badge-eligible">✓ ELIGIBLE</span>}
                {(eligibilityStatus === "high" || eligibilityStatus === "low") && <span className="badge-not-eligible">✗ NOT ELIGIBLE</span>}
              </div>
              <div className="form-section-body">

                {/* Row 1 — Gestation known */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Gestation in weeks clearly known?<span className="required">*</span></label>
                    <select name="gestation_known" value={formData.gestation_known} onChange={handleChange}>
                      <option value="">-- Select --</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  {/* spacer keeps grid aligned */}
                  <div />
                </div>

                {/* YES branch */}
                {formData.gestation_known === "Yes" && (
                  <>
                    {/* Row 2 — GA weeks + days */}
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>Best Estimate GA (Weeks)<span className="required">*</span></label>
                        <input type="number" name="best_ga_weeks" value={formData.best_ga_weeks}
                          onChange={handleChange} min="10" max="50" placeholder="e.g. 28" />
                      </div>
                      <div className="form-group">
                        <label>Best Estimate GA (Days)<span className="required">*</span></label>
                        <input type="number" name="best_ga_days" value={formData.best_ga_days}
                          onChange={handleChange} min="0" max="6" placeholder="0–6" />
                      </div>
                      <div className="form-group">
                        <label>EDD (Optional)</label>
                        <DatePicker
                          selected={formData.edd_date ? new Date(formData.edd_date) : null}
                          onChange={d => setFormData(p => ({ ...p, edd_date: d ? d.toISOString().split("T")[0] : "" }))}
                          dateFormat="dd-MM-yyyy" placeholderText="dd-----yyyy" />
                      </div>
                    </div>
                    {/* Row 3 — Method */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Method of Assessment<span className="required">*</span></label>
                        <select name="gestation_method" value={formData.gestation_method} onChange={handleChange}>
                          <option value="">-- Select --</option>
                          <option value="LMP">LMP</option>
                          <option value="Early USG">Early USG (&lt;24 weeks)</option>
                          <option value="Fundal Height">Fundal Height</option>
                          <option value="Unknown">Method not known</option>
                        </select>
                      </div>
                      <div />
                    </div>
                  </>
                )}

                {/* NO branch */}
                {formData.gestation_known === "No" && (
                  <>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>If No, is any of the following known?</label>
                        <select name="ga_source" value={formData.ga_source || ""} onChange={handleChange}>
                          <option value="">-- Select --</option>
                          <option value="LMP">LMP</option>
                          <option value="EDD">EDD</option>
                          <option value="Neither">Neither known</option>
                        </select>
                      </div>
                      <div />
                    </div>
                    {formData.ga_source === "LMP" && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>LMP Date</label>
                          <DatePicker
                            selected={formData.lmp_date ? new Date(formData.lmp_date) : null}
                            onChange={d => setFormData(p => ({ ...p, lmp_date: d ? d.toISOString().split("T")[0] : "" }))}
                            dateFormat="dd-MM-yyyy" placeholderText="Select date" />
                        </div>
                        {formData.edd_date && (
                          <div className="form-group">
                            <label>Expected Delivery Date (Auto-calculated)</label>
                            <input value={formatDateToDDMMYYYY(formData.edd_date)} readOnly className="readonly-input" />
                          </div>
                        )}
                      </div>
                    )}
                    {formData.ga_source === "EDD" && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>Expected Delivery Date</label>
                          <DatePicker
                            selected={formData.edd_date ? new Date(formData.edd_date) : null}
                            onChange={d => setFormData(p => ({ ...p, edd_date: d ? d.toISOString().split("T")[0] : "" }))}
                            dateFormat="dd-MM-yyyy" placeholderText="Select date" />
                        </div>
                        <div />
                      </div>
                    )}
                  </>
                )}

                {/* GA banner */}
                {displayWeeks !== "" && displayWeeks !== null && (
                  <div className="gestation-info-banner">
                    <Info size={16} className="banner-info-icon" />
                    <span className="banner-text">
                      Best calculated gestational age:{" "}
                      <strong>{displayWeeks} weeks {displayDays} days</strong>.{" "}
                      Participant is <strong>{eligibilityStatus === "eligible" ? "eligible" : "not eligible"}</strong> for the study.
                    </span>
                  </div>
                )}

                {formData.gestation_known === "No" && formData.ga_source === "Neither" && (
                  <div className="alert-danger">❌ Gestational age cannot be determined. End participation.</div>
                )}
                {eligibilityStatus === "high" && <div className="alert-danger">❌ Gestational age ≥32 weeks. Cannot proceed.</div>}
                {eligibilityStatus === "low"  && <div className="alert-danger">❌ Gestational age &lt;25 weeks. Not eligible.</div>}

              </div>
            </div>

            {/* ══ CONDITIONAL SECTIONS ══ */}
            {gestationPathComplete && !endParticipation && (
              <>

                {/* ══════════════════════════════════
                    CARD 2 — IDENTIFICATION
                ══════════════════════════════════ */}
                <div className="form-section card-section">
                  <div className="form-section-header">
                    <div className="section-title-left">
                      <FileText size={18} className="section-header-icon" />
                      <h3>Identification</h3>
                    </div>
                  </div>
                  <div className="form-section-body">

                    {/* Row 1 — Site + Site ID */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Site Name<span className="required">*</span></label>
                        <EditableField name="site_name" {...editableProps}>
                          <select name="site_name" value={formData.site_name || ""} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option>PGIMER</option><option>GMCH</option><option>IOG</option>
                            <option>AFMC</option><option>GMCH-A</option><option>AMC</option>
                          </select>
                        </EditableField>
                      </div>
                      <div className="form-group">
                        <label>Site ID</label>
                        <input value={formData.site_id || ""} readOnly className="readonly-input" />
                      </div>
                    </div>

                    {/* Row 2 — Date + Screened By */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Screening Date &amp; Time<span className="required">*</span></label>
                        <EditableField name="screening_datetime" {...editableProps}>
                          <DatePicker
                            selected={formData.screening_datetime ? new Date(formData.screening_datetime) : null}
                            onChange={d => setFormData(p => ({ ...p, screening_datetime: d ? d.toISOString() : "" }))}
                            showTimeSelect timeFormat="HH:mm" timeIntervals={1}
                            dateFormat="dd-MM-yyyy | HH:mm" />
                        </EditableField>
                      </div>
                      <div className="form-group">
                        <label>Screened By<span className="required">*</span></label>
                        <EditableField name="screened_by" {...editableProps}>
                          <select name="screened_by" value={formData.screened_by || ""} onChange={handleChange} disabled={!formData.site_name}>
                            <option value="">{formData.site_name ? "-- Select Nurse --" : "Select Site first"}</option>
                            {formData.screened_by && !nurses.includes(formData.screened_by) &&
                              <option value={formData.screened_by}>{formData.screened_by}</option>}
                            {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </EditableField>
                      </div>
                    </div>

                    {/* Row 3 — Screening ID alone */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Screening ID</label>
                        <input type="text" name="screening_id" value={formData.screening_id || ""}
                          placeholder="01-0001" maxLength={7}
                          onChange={e => {
                            let v = e.target.value.replace(/[^0-9-]/g, "");
                            if (v.length === 2 && !v.includes("-")) v += "-";
                            const pts = v.split("-");
                            if (pts.length > 2 || pts[0].length > 2 || (pts[1] && pts[1].length > 4)) return;
                            setFormData(p => ({ ...p, screening_id: v }));
                          }} />
                      </div>
                      <div />
                    </div>

                  </div>
                </div>

                {/* ══════════════════════════════════
                    CARD 3 — MATERNAL IDENTIFICATION
                ══════════════════════════════════ */}
                <div className="form-section card-section">
                  <div className="form-section-header">
                    <div className="section-title-left">
                      <User size={18} className="section-header-icon" />
                      <h3>Maternal Identification</h3>
                    </div>
                  </div>
                  <div className="form-section-body">

                    {/* Row 1 — Mother names */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Mother's First Name<span className="required">*</span></label>
                        <EditableField name="mother_first_name" {...editableProps}>
                          <input name="mother_first_name" value={formData.mother_first_name || ""} onChange={handleChange} />
                        </EditableField>
                      </div>
                      <div className="form-group">
                        <label>Mother's Surname</label>
                        <EditableField name="mother_surname" {...editableProps}>
                          <input name="mother_surname" value={formData.mother_surname || ""} onChange={handleChange} placeholder="Optional" />
                        </EditableField>
                      </div>
                    </div>

                    {/* Row 2 — Husband names */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Husband's First Name<span className="required">*</span></label>
                        <EditableField name="husband_first_name" {...editableProps}>
                          <input name="husband_first_name" value={formData.husband_first_name || ""} onChange={handleChange} />
                        </EditableField>
                      </div>
                      <div className="form-group">
                        <label>Husband's Surname</label>
                        <EditableField name="husband_surname" {...editableProps}>
                          <input name="husband_surname" value={formData.husband_surname || ""} onChange={handleChange} placeholder="Optional" />
                        </EditableField>
                      </div>
                    </div>

                    {/* Row 3 — UIDs */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Maternal UID (CR Number)<span className="required">*</span></label>
                        <EditableField name="maternal_uid" {...editableProps}>
                          <input name="maternal_uid" value={formData.maternal_uid || ""} onChange={handleChange} maxLength={12} inputMode="numeric" />
                        </EditableField>
                      </div>
                      <div className="form-group">
                        <label>Hospital Admission Number</label>
                        <EditableField name="hospital_admission_number" {...editableProps}>
                          <input name="hospital_admission_number" value={formData.hospital_admission_number || ""}
                            maxLength={15} inputMode="numeric" placeholder="Up to 15 digits"
                            onChange={e => {
                              const v = e.target.value.replace(/\D/g, "");
                              if (v.length > 15) return;
                              setFormData(p => ({ ...p, hospital_admission_number: v }));
                            }} />
                        </EditableField>
                      </div>
                    </div>

                    {/* Row 4 — Contacts  ← FIXED: form-grid-2 not form-row */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Contact (Mother)<span className="required">*</span></label>
                        <EditableField name="mother_contact" {...editableProps}>
                          <input type="text" name="mother_contact" value={formData.mother_contact || ""}
                            maxLength={10} inputMode="numeric"
                            onChange={e => handleContactChange(e, "mother_contact")} />
                        </EditableField>
                        {errors.mother_contact && <div className="field-error">{errors.mother_contact}</div>}
                      </div>
                      <div className="form-group">
                        <label>Contact (Husband)<span className="required">*</span></label>
                        <EditableField name="husband_contact" {...editableProps}>
                          <input type="text" name="husband_contact" value={formData.husband_contact || ""}
                            maxLength={10} inputMode="numeric"
                            onChange={e => handleContactChange(e, "husband_contact")} />
                        </EditableField>
                        {errors.husband_contact && <div className="field-error">{errors.husband_contact}</div>}
                      </div>
                    </div>

                  </div>
                </div>

                {/* ══════════════════════════════════
                    CARD 4 — EXCLUSION CRITERIA
                ══════════════════════════════════ */}
                {!endParticipation && (
                  <div className="form-section card-section">
                    <div className="form-section-header">
                      <div className="section-title-left">
                        <ShieldAlert size={18} className="section-header-icon" />
                        <h3>Exclusion Criteria</h3>
                      </div>
                    </div>
                    <div className="form-section-body">

                      <YesNoToggle
                        label="Major structural anomalies or genetic abnormality (suspected/proven)"
                        name="exclusion_anomaly"
                        value={formData.exclusion_anomaly}
                        onChange={handleChange}
                      />
                      {formData.exclusion_anomaly === "Yes" && (
                        <div className="followup-box">
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label>If yes, specify<span className="required">*</span></label>
                              <input name="exclusion_anomaly_details" value={formData.exclusion_anomaly_details}
                                onChange={handleChange} placeholder="Enter structural anomaly details" />
                            </div>
                            <div />
                          </div>
                        </div>
                      )}

                      <YesNoToggle
                        label="Fetal Hydrops"
                        name="fetal_hydrops"
                        value={formData.fetal_hydrops}
                        onChange={handleChange}
                      />
                      {formData.fetal_hydrops === "Yes" && (
                        <div className="followup-box">
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label>Type</label>
                              <select name="fetal_hydrops_type" value={formData.fetal_hydrops_type} onChange={handleChange}>
                                <option value="">-- Select --</option>
                                <option>Immune</option><option>Non-immune</option><option>Unclear</option>
                              </select>
                            </div>
                            <div />
                          </div>
                        </div>
                      )}

                      <YesNoToggle
                        label="Decision to forego resuscitation"
                        name="decision_forego_resus"
                        value={formData.decision_forego_resus}
                        onChange={handleChange}
                      />
                      {formData.decision_forego_resus === "Yes" && (
                        <div className="followup-box">
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label>Reason<span className="required">*</span></label>
                              <select name="decision_forego_resus_reason" value={formData.decision_forego_resus_reason} onChange={handleChange}>
                                <option value="">-- Select --</option>
                                <option>Periviable</option><option>Socio-economic</option>
                                <option>Major CMF</option><option>Other</option>
                              </select>
                            </div>
                            <div />
                          </div>
                          {formData.decision_forego_resus_reason === "Other" && (
                            <div className="form-grid-2" style={{ marginTop:12 }}>
                              <div className="form-group">
                                <label>Please specify<span className="required">*</span></label>
                                <input name="decision_forego_resus_reason_other"
                                  value={formData.decision_forego_resus_reason_other || ""}
                                  placeholder="Enter reason"
                                  onChange={e => {
                                    const v = e.target.value.replace(/[^a-zA-Z ]/g, "");
                                    setFormData(p => ({ ...p, decision_forego_resus_reason_other: v }));
                                  }} />
                              </div>
                              <div />
                            </div>
                          )}
                        </div>
                      )}

                      <YesNoToggle
                        label="Insufficient time for consent/randomization before birth"
                        name="insufficient_time"
                        value={formData.insufficient_time}
                        onChange={handleChange}
                      />
                      {formData.insufficient_time === "Yes" && (
                        <div className="followup-box">
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label>If yes, specify<span className="required">*</span></label>
                              <input name="insufficient_time_reason" value={formData.insufficient_time_reason}
                                onChange={handleChange} placeholder="Reason for insufficient time" />
                            </div>
                            <div />
                          </div>
                        </div>
                      )}

                      <YesNoToggle
                        label="Intrauterine Fetal Death (IUFD)"
                        name="iufd"
                        value={formData.iufd}
                        onChange={handleChange}
                      />

                    </div>
                  </div>
                )}

                {/* ══════════════════════════════════
                    CARD 5 — CONSENT
                ══════════════════════════════════ */}
                {((!endParticipation && !anyExclusionYes) || formData.consent_given) && (
                  <div className="form-section card-section">
                    <div className="form-section-header">
                      <div className="section-title-left">
                        <CheckSquare size={18} className="section-header-icon" />
                        <h3>Proceed for Consent</h3>
                      </div>
                    </div>
                    <div className="form-section-body">

                      {/* Row 1 — Consent */}
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>Consent<span className="required">*</span></label>
                          <select name="consent_given" value={formData.consent_given} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                            <option value="Not approached">Not approached</option>
                          </select>
                        </div>
                        <div />
                      </div>

                      {(formData.consent_given === "Yes" || formData.consent_given === "No") && (
                        <>
                          {/* Row 2 — Relationship + Consent Taken By */}
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label>Relationship to Participant<span className="required">*</span></label>
                              <select name="relationship_to_participant"
                                value={formData.relationship_to_participant || ""} onChange={handleChange}>
                                <option value="">-- Select --</option>
                                <option value="Mother">Pregnant Woman</option>
                                <option value="Father">Husband</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Consent Taken By<span className="required">*</span></label>
                              <select name="consent_taken_by" value={formData.consent_taken_by || ""}
                                onChange={handleChange} disabled={!formData.site_name}>
                                <option value="">{formData.site_name ? "-- Select Nurse --" : "Select Site first"}</option>
                                {formData.consent_taken_by && !nurses.includes(formData.consent_taken_by) &&
                                  <option value={formData.consent_taken_by}>{formData.consent_taken_by}</option>}
                                {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Relationship Other */}
                          {formData.relationship_to_participant === "Other" && (
                            <div className="form-grid-2">
                              <div className="form-group">
                                <label>Please specify</label>
                                <input name="relationship_other" value={formData.relationship_other || ""}
                                  onChange={handleChange} placeholder="Specify relationship" />
                              </div>
                              <div />
                            </div>
                          )}
                        </>
                      )}

                      {/* Consent = NO */}
                      {formData.consent_given === "No" && (
                        <div className="form-grid-2">
                          <div className="form-group">
                            <label>Reason for consent refusal<span className="required">*</span></label>
                            <select name="reason_for_consent_refusal"
                              value={formData.reason_for_consent_refusal || ""} onChange={handleChange}>
                              <option value="">-- Select --</option>
                              <option>Fear of adverse effects</option>
                              <option>Family pressure</option>
                              <option>Other</option>
                            </select>
                          </div>
                          {formData.reason_for_consent_refusal === "Other" ? (
                            <div className="form-group">
                              <label>Please specify</label>
                              <input name="reason_for_consent_refusal_other"
                                value={formData.reason_for_consent_refusal_other || ""}
                                onChange={handleChange} placeholder="Specify reason" />
                            </div>
                          ) : <div />}
                        </div>
                      )}

                      {/* Not approached */}
                      {formData.consent_given === "Not approached" && (
                        <div className="form-grid-2">
                          <div className="form-group">
                            <label>Reason not approached<span className="required">*</span></label>
                            <select name="reason_not_approached"
                              value={formData.reason_not_approached || ""} onChange={handleChange}>
                              <option value="">-- Select --</option>
                              <option>Nurse on leave</option>
                              <option>Parent not available</option>
                              <option>Missed screening</option>
                              <option>Other</option>
                            </select>
                          </div>
                          {formData.reason_not_approached === "Other" ? (
                            <div className="form-group">
                              <label>Please specify</label>
                              <input name="reason_not_approached_other"
                                value={formData.reason_not_approached_other || ""}
                                onChange={handleChange} placeholder="Specify reason" />
                            </div>
                          ) : <div />}
                        </div>
                      )}

                    </div>
                  </div>
                )}

              </>
            )}

            {message && <p className="form-message">{message}</p>}

            {showEndModal && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <h3>Screening Ended</h3>
                  <p>Gestational age cannot be determined. Screening has been ended.</p>
                  <button className="modal-btn" onClick={() => setShowEndModal(false)}>OK</button>
                </div>
              </div>
            )}

          </div>
        </fieldset>
      </form>

      {/* ── STICKY ACTION BAR ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={15} /> Dashboard
        </button>
        <button type="button" className="btn btn-save btn-outline-blue" onClick={saveForm}>
          <Save size={15} /> Save Draft
        </button>
        <div className="footer-step-indicator">
          <span className="step-text">STEP 1 OF 17</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment" />
            <div className="progress-segment" />
            <div className="progress-segment" />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleNext} disabled={!isSaved}>
          Enrollment &amp; Baseline <ArrowRight size={15} />
        </button>
      </div>

      {showMissingModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">⚠️ Incomplete Form</div>
            <div className="modal-subtext">Please complete all required fields</div>
            {missingFields.map((f, i) => <div key={i} className="modal-item">{f}</div>)}
            <button className="modal-btn" onClick={() => setShowMissingModal(false)}>Continue Editing</button>
          </div>
        </div>
      )}

      {showConsentModal && (
        <div className="consent-overlay">
          <div className="consent-modal">
            <h2>Screening Completed</h2>
            <p>{consentMessage}</p>
            <button className="consent-btn" onClick={() => setShowConsentModal(false)}>OK</button>
          </div>
        </div>
      )}
    </>
  );
}

export default ScreeningForm;
