import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "./api/axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useParams, useNavigate } from "react-router-dom";
import "./styles/global.css";
import "./styles/FormA.css";
import PrintSummary from "./components/PrintSummary";
import NotesBox from "./components/NotesBox";
import {
  ArrowLeft, ArrowRight, Save, Home,
  Calendar, User, FileText, ShieldAlert, CheckSquare, Info,
} from "lucide-react";
import { useFormProgress } from "./context/FormProgressContext";

/* ─── Helpers ─────────────────────────────────────────────── */
function formatDateToDDMMYYYY(date) {
  if (!date) return "";
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
}
const toDateTimeLocalValue = d => {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ─── YesNoToggle (with disabled support) ─────────────────── */
function YesNoToggle({ label, name, value, onChange, disabled = false }) {
  const fire = (val) => {
    if (disabled) return;
    onChange({ target: { name, value: val } });
  };
  return (
    <div className={`yes-no-toggle${disabled ? " yn-disabled" : ""}`}>
      <span className="yes-no-label">{label}</span>
      <div className="yes-no-buttons">
        <button type="button"
          className={`yn-btn yn-yes${value === "Yes" ? " yn-active-yes" : ""}`}
          onClick={() => fire("Yes")} disabled={disabled}>YES</button>
        <button type="button"
          className={`yn-btn yn-no${value === "No" ? " yn-active-no" : ""}`}
          onClick={() => fire("No")} disabled={disabled}>NO</button>
      </div>
    </div>
  );
}

/* ─── MultiCheckbox ("select all that apply") ─────────────── */
function MultiCheckbox({ options, selected = [], onChange, otherValue = "", onOtherChange, disabled = false, dataField }) {
  const toggle = (opt) => {
    if (disabled) return;
    const next = selected.includes(opt)
      ? selected.filter(x => x !== opt)
      : [...selected, opt];
    onChange(next);
  };
  return (
    <div className="multi-checkbox-group" data-field={dataField}>
      {options.map(opt => (
        <label key={opt} className={`multi-check-item${disabled ? " disabled" : ""}${selected.includes(opt) ? " checked" : ""}`}>
          <input type="checkbox" checked={selected.includes(opt)}
            onChange={() => toggle(opt)} disabled={disabled} />
          <span>{opt}</span>
        </label>
      ))}
      {selected.includes("Other") && (
        <div className="multi-check-other-row">
          <input className="multi-check-other-input"
            placeholder="Please specify…"
            value={otherValue}
            onChange={e => onOtherChange && onOtherChange(e.target.value)}
            disabled={disabled} />
        </div>
      )}
    </div>
  );
}

/* ─── Blank form state ────────────────────────────────────── */
const BLANK_FORM = {
  screening_id:"", screening_datetime:"",
  site_name:"", site_id:"", screened_by:"",
  /* A1 Gestation */
  gestation_known:"", gestation_method:"",
  best_ga_weeks:"", best_ga_days:"",
  ga_source:"", lmp_date:"", edd_date:"",
  auto_ga_weeks:"", auto_ga_days:"",
  /* A3 Maternal */
  mother_first_name:"", mother_surname:"",
  husband_first_name:"", husband_surname:"",
  maternal_uid:"", hospital_admission_number:"",
  mother_contact:"", husband_contact:"",
  /* A4 Exclusions */
  exclusion_anomaly:"", exclusion_anomaly_details:"",
  fetal_hydrops:"", fetal_hydrops_type:"",
  decision_forego_resus:"",
  decision_forego_resus_reasons:[],
  decision_forego_resus_reason_other:"",
  insufficient_time:"", insufficient_time_reason:"",
  iufd:"",
  /* A5 Consent */
  consent_given:"", video_pis_shown:"",
  relationship_to_participant:"", relationship_other:"",
  consent_taken_by:"", consent_datetime:"",
  reason_for_consent_refusal_list:[],
  reason_for_consent_refusal_other:"",
  reason_not_approached_list:[],
  reason_not_approached_other:"",
  /* internal */
  consent_form_version:"v1.0", consent_language:"English",
};

const FOREGO_REASONS         = ["Periviable","Socio-economic","Major CMF","Other"];
const REFUSAL_REASONS        = ["Fear of adverse effects","Family pressure","Not known","Other"];
const NOT_APPROACHED_REASONS = ["Nurse on leave","Parent not available","Missed screening","Other"];

/* ════════════════════════════════════════════
   SCREENING FORM — CRF v1.22
════════════════════════════════════════════ */
export default function ScreeningForm() {
  const navigate = useNavigate();
  const { markFormCompleted, resetProgress } = useFormProgress();
  const { screeningId } = useParams();

  const [errors,           setErrors]           = useState({});
  const [isSaved,          setIsSaved]          = useState(false);
  const [isEditing,        setIsEditing]        = useState(false);
  const [isInitialLoad,    setIsInitialLoad]    = useState(true);
  const [nurses,           setNurses]           = useState([]);
  const [message,          setMessage]          = useState("");
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingFields,    setMissingFields]    = useState([]);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentMessage,   setConsentMessage]   = useState("");
  const [showDraftModal,   setShowDraftModal]   = useState(false);
  const [dataLoaded,       setDataLoaded]       = useState(false);
  const [autoSaveStatus,   setAutoSaveStatus]   = useState("idle");
  const [lastSaved,        setLastSaved]        = useState(null);   // Date object
  const [isDirty,          setIsDirty]          = useState(false);  // unsaved changes
  const [isOnline,         setIsOnline]         = useState(navigator.onLine);
  const [offlineQueue,     setOfflineQueue]     = useState(false);  // pending save while offline
  const [duplicateWarn,    setDuplicateWarn]    = useState("");     // duplicate check warning
  const [fieldTouched,     setFieldTouched]     = useState({});     // which fields user has interacted with
  const autoSaveTimer  = useRef(null);
  const lastSavedTimer = useRef(null);  // for "X mins ago" refresh

  const SITE_ID_MAP = {
    "PGIMER":  "01",
    "GMCH":    "02",
    "IOG":     "03",
    "AFMC":    "04",
    "GMCH-A":  "05",
    "AMC":     "06",
  };

  /* Display label → internal value mapping */
  const SITE_DISPLAY = {
    "PGIMER":  "PGIMER Chandigarh",
    "GMCH":    "GMCH Chandigarh",
    "IOG":     "IOG Chennai",
    "AFMC":    "AFMC Pune",
    "GMCH-A":  "GMCH Aurangabad",
    "AMC":     "AMC Dibrugarh",
  };
  const isFieldEditable = !isSaved || isEditing;
  const today = new Date(); today.setHours(23,59,59,999);

  const [formData, setFormData] = useState({
    ...BLANK_FORM, screening_datetime: toDateTimeLocalValue(new Date()),
  });
  const formDataRef    = useRef(formData);
  const screeningIdRef = useRef(screeningId);
  formDataRef.current = formData;
  screeningIdRef.current = screeningId;

  /* ─── Load ── */
  useEffect(() => {
    if (screeningId && screeningId !== "undefined" && screeningId !== "null") {
      loadScreeningData(screeningId); return;
    }
    const storedId = localStorage.getItem("current_screening_id");
    if (storedId && storedId !== "undefined" && storedId !== "null") {
      navigate(`/form-a/${storedId}`, { replace: true }); return;
    }
    setFormData({ ...BLANK_FORM, screening_datetime: toDateTimeLocalValue(new Date()) });
    setIsSaved(false); setIsEditing(false); setDataLoaded(true);
    resetProgress();
  }, [screeningId]); // eslint-disable-line

  const loadScreeningData = useCallback(async (id) => {
    try {
      const res = await api.get(`/screenings/by-screening-id/${id}`);
      const d = res.data;
      let pii = {};
      try { const r = await api.get(`/pii/screening/${id}`); pii = r.data || {}; }
      catch {
        const eid = d.enrollment_id || localStorage.getItem("current_enrollment_id");
        if (eid && eid !== "undefined" && eid !== "null") {
          try { const r2 = await api.get(`/pii/enrollment/${eid}`); pii = r2.data || {}; } catch {}
        }
      }

      const forgoList  = (d.decision_forego_resuscitation_reason || d.decision_forego_resus_reason || "")
        ? (d.decision_forego_resuscitation_reason || d.decision_forego_resus_reason).split(",").map(s=>s.trim()).filter(Boolean) : [];
      const refuseList = d.reason_for_consent_refusal
        ? d.reason_for_consent_refusal.split(",").map(s=>s.trim()).filter(Boolean) : [];
      const notApprList = d.reason_not_approached
        ? d.reason_not_approached.split(",").map(s=>s.trim()).filter(Boolean) : [];

      setFormData(() => ({
        ...BLANK_FORM, ...d,
        mother_first_name:         pii.mother_first_name         || d.mother_first_name         || "",
        mother_surname:            pii.mother_surname            || d.mother_surname            || "",
        husband_first_name:        pii.husband_first_name        || d.husband_first_name        || "",
        husband_surname:           pii.husband_surname           || d.husband_surname           || "",
        maternal_uid:              pii.maternal_uid              || d.maternal_uid              || "",
        hospital_admission_number: pii.hospital_admission_number || d.hospital_admission_number || "",
        mother_contact:            pii.mother_contact            || d.mother_contact            || "",
        husband_contact:           pii.husband_contact           || d.husband_contact           || "",
        gestation_known:    d.gestation_weeks ? "Yes" : (d.lmp_date || d.expected_delivery_date ? "No" : ""),
        best_ga_weeks:      d.gestation_weeks || "",
        best_ga_days:       d.gestation_days  || "",
        gestation_method:   d.gestation_method || "",
        ga_source:          d.gestation_weeks ? "" : d.lmp_date ? "LMP" : d.expected_delivery_date ? "EDD" : "",
        edd_date:           d.expected_delivery_date || "",
        lmp_date:           d.lmp_date || "",
        /* A4 exclusion fields — inline ternary avoids const-in-object error.
           (d.exclusion_present != null) means record was saved before → unanswered = "No".
           If never saved → "" so toggles show as unanswered.                              */
        exclusion_anomaly:     d.exclusion_reasons?.includes("Structural anomaly")   ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        exclusion_anomaly_details: d.exclusion_anomaly_details || d.major_structural_anomalies_if_yes || "",
        fetal_hydrops:         d.exclusion_reasons?.includes("Fetal hydrops")        ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        fetal_hydrops_type:    d.fetal_hydrops_type || d.fetal_hydrops || "",
        decision_forego_resus: d.exclusion_reasons?.includes("Forego resuscitation") ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        decision_forego_resus_reasons: forgoList,
        decision_forego_resus_reason_other: forgoList.includes("Other")
          ? (d.decision_forego_resuscitation_reason_other || d.decision_forego_resus_reason_other || "") : "",
        insufficient_time:     d.exclusion_reasons?.includes("Insufficient time")    ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        insufficient_time_reason: d.insufficient_time_reason || d.reason_for_insufficient_time || "",
        iufd:                  d.exclusion_reasons?.includes("IUFD")                 ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        consent_given:            d.consent_given              || "",
        consent_taken_by:         d.consent_taken_by           || "",
        consent_datetime:         d.consent_datetime ? String(d.consent_datetime).slice(0,16) : "",
        consent_form_version:     d.consent_form_version       || "v1.0",
        consent_language:         d.consent_language           || "English",
        relationship_to_participant: d.relationship_to_participant || "",
        relationship_other:       d.relationship_other         || "",
        reason_for_consent_refusal_list:  refuseList,
        reason_for_consent_refusal_other: refuseList.includes("Other") ? (d.reason_for_consent_refusal_other||"") : "",
        reason_not_approached_list:       notApprList,
        reason_not_approached_other:      notApprList.includes("Other") ? (d.reason_not_approached_other||"") : "",
        video_pis_shown:          d.video_pis_shown            || "",
      }));

      if (d.screening_id)  localStorage.setItem("current_screening_id",  d.screening_id);
      if (d.enrollment_id) localStorage.setItem("current_enrollment_id", d.enrollment_id);

      /* If A4 exclusions not fully answered, load in editing mode so nurse can continue */
      const exclusionAnswered = (label) =>
        d.exclusion_reasons?.includes(label) || d.exclusion_present != null;
      const a4Complete  = [
        "Structural anomaly", "Fetal hydrops", "Forego resuscitation", "Insufficient time", "IUFD",
      ].every(exclusionAnswered);
      const consentDone = !!d.consent_given;
      const videosDone  = !!d.video_pis_shown;
      const fullyDone   = a4Complete && consentDone && videosDone;

      setIsSaved(true);
      setIsEditing(!fullyDone); // stay editable if any required field not yet filled
      setIsInitialLoad(false);
      setDataLoaded(true);
    } catch (err) {
      if (err?.response?.status !== 404) setMessage("⚠️ Could not load saved data.");
      setDataLoaded(true);
    }
  }, []); // eslint-disable-line


  /* ─── Online / Offline detection ── */
  useEffect(() => {
    const goOnline  = () => {
      setIsOnline(true);
      // If we had a queued save, trigger it now
      setOfflineQueue(prev => { if (prev) { autoSave(); } return false; });
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []); // eslint-disable-line

  /* ─── Unsaved changes — warn on tab close / navigate away ── */
  useEffect(() => {
    const handler = e => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* ─── Mark form dirty only after user edits (not on initial load) ── */
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (!dataLoaded) return;
    if (isInitialRender.current) { isInitialRender.current = false; return; }
    setIsDirty(true);
  }, [formData]); // eslint-disable-line

  /* ─── Refresh "last saved X mins ago" every 30 seconds ── */
  useEffect(() => {
    lastSavedTimer.current = setInterval(() => {
      // force re-render to update the relative time string
      setLastSaved(prev => prev ? new Date(prev) : prev);
    }, 30000);
    return () => clearInterval(lastSavedTimer.current);
  }, []);

  /* ─── Duplicate check: same mother name + site ── */
  useEffect(() => {
    if (!formData.mother_first_name || !formData.site_name || !dataLoaded) return;
    const tid = setTimeout(async () => {
      try {
        const res = await api.get("/screenings/?limit=500");
        const existing = res.data.filter(e =>
          e.id !== formData.id &&
          e.site_name === formData.site_name &&
          (e.mother_first_name || "").toLowerCase() === formData.mother_first_name.toLowerCase()
        );
        if (existing.length > 0) {
          setDuplicateWarn(
            `⚠️ A participant named "${formData.mother_first_name}" already exists at ${formData.site_name} (${existing[0].screening_id}). Please verify this is not a duplicate.`
          );
        } else {
          setDuplicateWarn("");
        }
      } catch {}
    }, 800);
    return () => clearTimeout(tid);
  }, [formData.mother_first_name, formData.site_name, dataLoaded]); // eslint-disable-line

  /* ─── Nurse dropdown ── */
  useEffect(() => {
    if (!formData.site_name) { setNurses([]); return; }
    api.get(`/sites/${formData.site_name}/screeners`)
      .then(r => setNurses(r.data)).catch(() => setNurses([]));
  }, [formData.site_name]);

  /* ─── LMP → EDD auto-calc ── */
  useEffect(() => {
    if (!formData.lmp_date || !dataLoaded) return;
    if (formData.edd_date) return;
    const edd = new Date(formData.lmp_date);
    edd.setDate(edd.getDate() + 280);
    setFormData(p => ({ ...p, edd_date: edd.toISOString().split("T")[0] }));
  }, [formData.lmp_date, dataLoaded]); // eslint-disable-line

  /* ─── EDD → GA auto-calc (only when gestation_known=No) ── */
  useEffect(() => {
    if (!formData.edd_date || !dataLoaded || formData.gestation_known === "Yes") return;
    const diff = Math.floor(280 - (new Date(formData.edd_date) - new Date()) / 86400000);
    setFormData(p => ({ ...p, auto_ga_weeks: Math.max(0, Math.floor(diff/7)), auto_ga_days: Math.max(0, diff%7) }));
  }, [formData.edd_date, formData.gestation_known, dataLoaded]); // eslint-disable-line

  /* ─── Derived flags ── */
  const getEligibilityStatus = () => {
    let weeks = null, days = 0;
    if (formData.gestation_known === "Yes") {
      if (!formData.best_ga_weeks) return null;
      weeks = Number(formData.best_ga_weeks); days = Number(formData.best_ga_days||0);
    } else if (formData.gestation_known === "No" && formData.ga_source !== "Neither" && formData.edd_date) {
      if (formData.auto_ga_weeks === "" || formData.auto_ga_weeks === null) return null;
      weeks = Number(formData.auto_ga_weeks); days = Number(formData.auto_ga_days||0);
    }
    if (weeks === null || isNaN(weeks)) return null;
    const t = weeks * 7 + days;
    if (t < 24*7) return "low";
    if (t > 31*7+6) return "high";
    return "eligible";
  };
  const eligibilityStatus     = getEligibilityStatus();
  const gaNotDeterminable     = formData.gestation_known === "No" && formData.ga_source === "Neither";
  const isNotEligible         = eligibilityStatus === "high" || eligibilityStatus === "low";
  const endParticipation      = gaNotDeterminable || isNotEligible;
  const gestationPathComplete = formData.gestation_known === "Yes" ||
    (formData.gestation_known === "No" && !!formData.edd_date && formData.ga_source !== "Neither");
  const anyExclusionYes = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
    .some(k => formData[k] === "Yes");
  const allExclusionAnswered = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
    .every(k => formData[k] === "Yes" || formData[k] === "No");
  const displayWeeks = formData.gestation_known === "Yes" ? formData.best_ga_weeks : formData.auto_ga_weeks;
  const displayDays  = formData.gestation_known === "Yes" ? (formData.best_ga_days||0) : (formData.auto_ga_days||0);

  /* ─── Field-level change handler ── */
  const set = (patch) => setFormData(p => ({ ...p, ...patch }));

  const handleChange = e => {
    const { name, value } = e.target;
    const newErrors = { ...errors };

    /* Name fields: letters only */
    if (["screened_by","mother_first_name","mother_surname","husband_first_name","husband_surname"].includes(name)) {
      set({ [name]: value.replace(/[^a-zA-Z ]/g, "") }); return;
    }
    if (name === "site_name")          { set({ site_name:value, site_id:SITE_ID_MAP[value]||"", screened_by:"" }); return; }
    if (name === "gestation_known")    { set({ gestation_known:value, ga_source:"", lmp_date:"", edd_date:"", auto_ga_weeks:"", auto_ga_days:"", best_ga_weeks:"", best_ga_days:"", gestation_method:"" }); return; }
    if (name === "ga_source")          { set({ ga_source:value, lmp_date:"", edd_date:"", auto_ga_weeks:"", auto_ga_days:"" }); return; }
    if (name === "gestation_method")   { set({ gestation_method:value, lmp_date:"", edd_date:"" }); return; }
    if (name === "exclusion_anomaly")  { set({ exclusion_anomaly:value, exclusion_anomaly_details: value==="Yes" ? formData.exclusion_anomaly_details : "" }); return; }
    if (name === "fetal_hydrops")      { set({ fetal_hydrops:value, fetal_hydrops_type: value==="Yes" ? formData.fetal_hydrops_type : "" }); return; }
    if (name === "decision_forego_resus") { set({ decision_forego_resus:value, decision_forego_resus_reasons: value==="Yes" ? formData.decision_forego_resus_reasons : [] }); return; }
    if (name === "insufficient_time")  { set({ insufficient_time:value, insufficient_time_reason: value==="Yes" ? formData.insufficient_time_reason : "" }); return; }
    if (name === "consent_given") {
      if (!isInitialLoad && formData.consent_given !== value) {
        set({ consent_given:value, consent_taken_by:"", consent_datetime:"", relationship_to_participant:"", relationship_other:"", reason_for_consent_refusal_list:[], reason_for_consent_refusal_other:"", reason_not_approached_list:[], reason_not_approached_other:"" });
      } else { set({ consent_given:value }); }
      return;
    }
    if (name === "maternal_uid") {
      // PGIMER: numeric only (10 digits mandatory)
      // Dibrugarh: alphanumeric serial/year
      // GMCH/IOG: autofilled from maternal UID
      set({ maternal_uid: value.replace(/[^a-zA-Z0-9/]/g, "") });
      return;
    }
    if (name === "hospital_admission_number") {
      // Site-specific: Aurangabad=11 digits, Dibrugarh=serial/year, GMCH Chd=9-11 digits, IOG=4-6 digits
      const v = value.replace(/[^a-zA-Z0-9/]/g, "");
      if (v.length <= 15) set({ hospital_admission_number: v });
      return;
    }

    /* GA range validation */
    if (name === "best_ga_weeks") {
      const n = parseInt(value);
      newErrors.best_ga_weeks = value && (n < 10 || n > 45) ? "Must be 10–45 weeks" : "";
      setErrors(newErrors);
    }
    if (name === "best_ga_days") {
      const n = parseInt(value);
      newErrors.best_ga_days = value && (n < 0 || n > 6) ? "Must be 0–6 days" : "";
      setErrors(newErrors);
    }

    set({ [name]: value });
  };

  const handleContact = (e, field) => {
    const v = e.target.value.replace(/\D/g, "");
    set({ [field]: v });
    setFieldTouched(p => ({ ...p, [field]: true }));
    let err = "";
    if (v.length > 0 && v.length !== 10)       err = "Must be exactly 10 digits";
    else if (v.length === 10 && !/^[6-9]/.test(v)) err = "Indian mobile must start with 6, 7, 8, or 9";
    setErrors(p => ({ ...p, [field]: err }));
  };

  /* ─── Inline field validation on blur ── */
  const handleBlur = (e) => {
    const { name, value } = e.target;
    setFieldTouched(p => ({ ...p, [name]: true }));
    const newErrors = { ...errors };
    if (name === "best_ga_weeks") {
      const n = parseInt(value);
      newErrors.best_ga_weeks = value && (n < 10 || n > 45) ? "Must be between 10 and 45 weeks" : "";
    }
    if (name === "best_ga_days") {
      const n = parseInt(value);
      newErrors.best_ga_days = value && (n < 0 || n > 6) ? "Must be between 0 and 6 days" : "";
    }
    if (name === "mother_contact" || name === "husband_contact") {
      if (value && value.length !== 10)          newErrors[name] = "Must be exactly 10 digits";
      else if (value && !/^[6-9]/.test(value))   newErrors[name] = "Indian mobile must start with 6, 7, 8, or 9";
      else                                        newErrors[name] = "";
    }
    if (name === "mother_first_name" && !value.trim()) newErrors.mother_first_name = "Required";
    if (name === "husband_first_name" && !value.trim()) newErrors.husband_first_name = "Required";
    if (name === "maternal_uid" && !value.trim())       newErrors.maternal_uid = "Required";
    setErrors(newErrors);
  };

  /* ─── Relative time helper ── */
  const relativeTime = (date) => {
    if (!date) return null;
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 10)  return "just now";
    if (diff < 60)  return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return `${Math.floor(diff/3600)}h ago`;
  };

  /* ─── Validation ── */
  const validate = () => {
    const m = [];
    const add = (label, fieldName) => m.push({ label, fieldName });

    if (!formData.screening_datetime)    add("Screening Date & Time (A2)",        "screening_datetime");
    if (!formData.site_name)             add("Site (A2)",                          "site_name");
    if (!formData.screened_by)           add("Screened By (A2)",                   "screened_by");
    if (!formData.mother_first_name)     add("Mother's First Name (A3)",           "mother_first_name");
    if (!formData.husband_first_name)    add("Husband's First Name (A3)",          "husband_first_name");
    if (!formData.maternal_uid)          add("Maternal UID / CR Number (A3)",      "maternal_uid");
    if (!formData.mother_contact)        add("Mother's Mobile Number (A3)",        "mother_contact");
    else if (formData.mother_contact.length !== 10) add("Mother's Mobile — must be 10 digits (A3)", "mother_contact");
    if (!formData.husband_contact)       add("Husband's Mobile Number (A3)",       "husband_contact");
    else if (formData.husband_contact.length !== 10) add("Husband's Mobile — must be 10 digits (A3)", "husband_contact");
    if (!formData.gestation_known)       add("Gestation known? (A1)",              "gestation_known");
    if (formData.gestation_known === "Yes") {
      if (!formData.best_ga_weeks)       add("Best estimate GA — weeks (A1)",      "best_ga_weeks");
      if (formData.best_ga_days === "")  add("Best estimate GA — days (A1)",       "best_ga_days");
      if (!formData.gestation_method)    add("Method of gestation assessment (A1)","gestation_method");
      if (formData.gestation_method === "LMP" && !formData.lmp_date) add("LMP date (A1)", "lmp_date");
    }
    if (formData.gestation_known === "No") {
      if (!formData.ga_source)           add("Known source — LMP / EDD / Neither (A1)", "ga_source");
      if (formData.ga_source === "LMP" && !formData.lmp_date) add("LMP Date (A1)", "lmp_date");
      if (formData.ga_source === "EDD" && !formData.edd_date) add("EDD (A1)",       "edd_date");
    }
    if (!formData.exclusion_anomaly)     add("Structural Anomaly? (A4)",           "exclusion_anomaly");
    else if (formData.exclusion_anomaly === "Yes" && !formData.exclusion_anomaly_details)
      add("Specify structural anomaly (A4)",                                        "exclusion_anomaly_details");
    if (!formData.fetal_hydrops)         add("Fetal Hydrops? (A4)",                "fetal_hydrops");
    else if (formData.fetal_hydrops === "Yes" && !formData.fetal_hydrops_type)
      add("Fetal hydrops type (A4)",                                                "fetal_hydrops_type");
    if (!formData.decision_forego_resus) add("Decision to forego resuscitation? (A4)", "decision_forego_resus");
    else if (formData.decision_forego_resus === "Yes" && formData.decision_forego_resus_reasons.length === 0)
      add("Reason to forego resuscitation — select at least one (A4)",             "decision_forego_resus");
    if (!formData.insufficient_time)     add("Insufficient time for consent? (A4)","insufficient_time");
    else if (formData.insufficient_time === "Yes" && !formData.insufficient_time_reason)
      add("Specify reason for insufficient time (A4)",                             "insufficient_time_reason");
    if (!formData.iufd)                  add("IUFD? (A4)",                         "iufd");

    /* Recompute exclusion flag inside validate to avoid stale closure */
    const hasExclusion = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
      .some(k => formData[k] === "Yes");

    if (!hasExclusion) {
      if (!formData.consent_given)       add("Consent (A5)",                       "consent_given");
      if (formData.consent_given === "Yes" || formData.consent_given === "No" || formData.consent_given === "Trial run") {
        if (!formData.relationship_to_participant) add("Consent obtained from (A5)", "relationship_to_participant");
        if (!formData.consent_taken_by)            add("Consent obtained by nurse (A5)", "consent_taken_by");
      }
      if (formData.consent_given === "No" && formData.reason_for_consent_refusal_list.length === 0)
        add("Reason for consent refusal — select at least one (A5)",               "reason_for_consent_refusal_list");
      if (formData.consent_given === "Not approached" && formData.reason_not_approached_list.length === 0)
        add("Reason not approached — select at least one (A5)",                    "reason_not_approached_list");
      /* Video PIS required whenever any consent value is selected */
      if (formData.consent_given && !formData.video_pis_shown)
        add("Video PIS shown? (A5)",                                               "video_pis_shown");
    }
    return m;
  };

  /* ─── Scroll to first error field ── */
  const scrollToFirstError = (missing) => {
    if (!missing || missing.length === 0) return;
    const fieldName = missing[0].fieldName;
    const el = document.querySelector(
      `[name="${fieldName}"], #${fieldName}, [data-field="${fieldName}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.focus?.(), 400);
    }
  };

  /* ─── Shared payload builder (used by saveForm, saveDraft, autoSave) ── */
  const buildPayloadFrom = (fd, useDraftFallbacks, exclYes) => {
    const exclusionParts = [];
    if (fd.exclusion_anomaly     === "Yes") exclusionParts.push("Structural anomaly");
    if (fd.fetal_hydrops         === "Yes") exclusionParts.push("Fetal hydrops");
    if (fd.decision_forego_resus === "Yes") exclusionParts.push("Forego resuscitation");
    if (fd.insufficient_time     === "Yes") exclusionParts.push("Insufficient time");
    if (fd.iufd                  === "Yes") exclusionParts.push("IUFD");

    return {
      screening_id:              fd.screening_id    || undefined,
      screening_datetime:        fd.screening_datetime || (useDraftFallbacks ? new Date().toISOString() : null),
      site_name:                 fd.site_name        || (useDraftFallbacks ? "DRAFT" : null),
      site_id:                   fd.site_id          || (useDraftFallbacks ? "00"    : null),
      screened_by:               fd.screened_by      || (useDraftFallbacks ? "DRAFT" : null),
      mother_first_name:         fd.mother_first_name || (useDraftFallbacks ? "DRAFT" : fd.mother_first_name),
      mother_surname:            fd.mother_surname   || null,
      husband_first_name:        fd.husband_first_name || (useDraftFallbacks ? "DRAFT" : fd.husband_first_name),
      husband_surname:           fd.husband_surname  || null,
      maternal_uid:              fd.maternal_uid     || null,
      hospital_admission_number: fd.hospital_admission_number || null,
      mother_contact:            fd.mother_contact   || null,
      husband_contact:           fd.husband_contact  || null,
      gestation_weeks:           useDraftFallbacks
        ? (parseInt(fd.gestation_known === "Yes" ? fd.best_ga_weeks : fd.auto_ga_weeks) || 0)
        : (fd.gestation_known === "Yes" ? parseInt(fd.best_ga_weeks)||null : parseInt(fd.auto_ga_weeks)||null),
      gestation_days:            fd.gestation_known === "Yes"
        ? parseInt(fd.best_ga_days)||0 : parseInt(fd.auto_ga_days)||0,
      gestation_method:          fd.gestation_method || null,
      lmp_date:                  fd.lmp_date         || null,
      expected_delivery_date:    fd.edd_date ? new Date(fd.edd_date).toISOString().split("T")[0] : null,
      exclusion_present:         exclYes,
      exclusion_reasons:         exclusionParts.join(", ") || null,
      major_structural_anomalies_if_yes: fd.exclusion_anomaly === "Yes" ? (fd.exclusion_anomaly_details || null) : null,
      fetal_hydrops:             fd.fetal_hydrops === "Yes" ? (fd.fetal_hydrops_type || null) : null,
      decision_forego_resuscitation_reason: fd.decision_forego_resus === "Yes" && fd.decision_forego_resus_reasons.length > 0
        ? fd.decision_forego_resus_reasons.join(", ") : null,
      decision_forego_resuscitation_reason_other: fd.decision_forego_resus_reason_other || null,
      reason_for_insufficient_time: fd.insufficient_time === "Yes" ? (fd.insufficient_time_reason || null) : null,
      consent_given:             fd.consent_given     || null,
      consent_taken_by:          fd.consent_taken_by  || null,
      consent_datetime:          fd.consent_datetime   || null,
      consent_form_version:      fd.consent_form_version || null,
      consent_language:          fd.consent_language   || null,
      relationship_to_participant: fd.relationship_to_participant || null,
      relationship_other:        fd.relationship_other || null,
      reason_for_consent_refusal: fd.reason_for_consent_refusal_list.length > 0
        ? fd.reason_for_consent_refusal_list.join(", ") : null,
      reason_for_consent_refusal_other: fd.reason_for_consent_refusal_other || null,
      reason_not_approached:     fd.reason_not_approached_list.length > 0
        ? fd.reason_not_approached_list.join(", ") : null,
      reason_not_approached_other: fd.reason_not_approached_other || null,
      video_pis_shown:           fd.video_pis_shown  || null,
    };
  };

  const buildPayload = useCallback(
    (useDraftFallbacks = false) => buildPayloadFrom(formData, useDraftFallbacks, anyExclusionYes),
    [formData, anyExclusionYes]
  );

  /* ─── Auto-save every 10 seconds (silent, no modals, no validation) ── */
  const autoSave = useCallback(async () => {
    const fd = formDataRef.current;
    const exclYes = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
      .some(k => fd[k] === "Yes");

    const storedId = localStorage.getItem("current_screening_id");
    const sid = screeningIdRef.current;
    const existingId = (sid && sid !== "undefined") ? sid
      : (storedId && storedId !== "undefined" && storedId !== "null") ? storedId : null;

    /* Don't create a new DB row until the nurse has picked a site */
    if (!existingId && !fd.site_name) return;

    if (!navigator.onLine) {
      setOfflineQueue(true);
      return;
    }

    setAutoSaveStatus("saving");
    try {
      const payload = buildPayloadFrom(fd, true, exclYes);

      const res = existingId
        ? await api.put(`/screenings/${existingId}`, payload)
        : await api.post("/screenings/", payload);

      const newSid = res.data.screening_id;
      const eid = res.data.enrollment_id;
      if (newSid) localStorage.setItem("current_screening_id", newSid);
      if (eid) localStorage.setItem("current_enrollment_id", eid);
      window.dispatchEvent(new Event("storage"));

      setAutoSaveStatus("saved");
      setLastSaved(new Date());
      setIsDirty(false);
      setOfflineQueue(false);
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
    } catch {
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
  }, []);

  /* ─── Start 10-second interval once form is loaded (stable — not reset on keystroke) ── */
  useEffect(() => {
    if (!dataLoaded) return;
    autoSaveTimer.current = setInterval(autoSave, 10000);
    return () => clearInterval(autoSaveTimer.current);
  }, [autoSave, dataLoaded]);

  /* ─── Save ── */
  const saveForm = async () => {
    const missing = validate();
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowMissingModal(true);
      return; // show modal, don't attempt save yet
    }

    const payload = buildPayload(false);

    try {
      const storedId = localStorage.getItem("current_screening_id");
      const existingId = (screeningId && screeningId !== "undefined") ? screeningId
        : (storedId && storedId !== "undefined" && storedId !== "null") ? storedId : null;

      const res = existingId
        ? await api.put(`/screenings/${existingId}`, payload)
        : await api.post("/screenings/", payload);

      const sid = res.data.screening_id;
      const eid = res.data.enrollment_id;
      localStorage.setItem("current_screening_id", sid);
      if (eid) localStorage.setItem("current_enrollment_id", eid);
      window.dispatchEvent(new Event("storage"));

      setMessage("✅ Form A saved successfully");
      setIsSaved(true); setIsEditing(false);
      setLastSaved(new Date());
      setIsDirty(false);
      window.scrollTo({ top:0, behavior:"smooth" });
      setTimeout(() => setMessage(""), 4000);
      if (!screeningId && sid) navigate(`/form-a/${sid}`, { replace: true });
      return true;
    } catch (err) {
      setMessage(`❌ Save failed: ${err?.response?.data?.detail || err.message}`);
      window.scrollTo({ top:0, behavior:"smooth" });
      return false;
    }
  };

  /* ─── Save Draft — no validation, saves whatever is filled ── */
  const saveDraft = async () => {
    const payload = buildPayload(true);

    try {
      const storedId   = localStorage.getItem("current_screening_id");
      const existingId = (screeningId && screeningId !== "undefined") ? screeningId
        : (storedId && storedId !== "undefined" && storedId !== "null") ? storedId : null;

      const res = existingId
        ? await api.put(`/screenings/${existingId}`, payload)
        : await api.post("/screenings/", payload);

      const sid = res.data.screening_id;
      const eid = res.data.enrollment_id;
      localStorage.setItem("current_screening_id", sid);
      if (eid) localStorage.setItem("current_enrollment_id", eid);
      window.dispatchEvent(new Event("storage"));

      setShowDraftModal(true);
    } catch (err) {
      /* Parse FastAPI 422 validation errors into readable text */
      const detail = err?.response?.data?.detail;
      let msg = "Draft save failed.";
      if (Array.isArray(detail)) {
        msg = "Draft save failed: " + detail
          .map(e => `${e.loc?.slice(-1)[0] || "field"} — ${e.msg}`)
          .join("; ");
      } else if (typeof detail === "string") {
        msg = `Draft save failed: ${detail}`;
      } else if (err.message) {
        msg = `Draft save failed: ${err.message}`;
      }
      setMessage(`❌ ${msg}`);
      window.scrollTo({ top:0, behavior:"smooth" });
    }
  };

  const handleNext = async () => {
    const ok = await saveForm();
    if (!ok) return;
    if (formData.consent_given !== "Yes" && formData.consent_given !== "Trial run") {
      localStorage.setItem("enrollment_locked","true");
      window.dispatchEvent(new Event("storage"));
      const why = { No:"consent was refused.", "Not approached":"consent was not taken." };
      setConsentMessage(`Screening completed. Participant cannot be enrolled because ${why[formData.consent_given]||"of consent status."}`);
      setShowConsentModal(true);
      return;
    }
    localStorage.removeItem("enrollment_locked");
    window.dispatchEvent(new Event("storage"));
    markFormCompleted("form_a");
    navigate(`/form-b/${localStorage.getItem("current_screening_id")}`);
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <>
      {/* ── OFFLINE BANNER ── */}
      {!isOnline && (
        <div className="offline-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
          </svg>
          You are offline. Changes will be saved automatically when your connection returns.
          {offlineQueue && <strong> · Save queued.</strong>}
        </div>
      )}

      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing mode — unsaved changes will be lost if you navigate away
        </div>
      )}

      <form className={`screening-form${isSaved && !isEditing ? " readonly" : ""}`}
        onSubmit={e => e.preventDefault()}>
        <fieldset>
          <div className="form-inner">

            {/* ── PAGE HEADER ── */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={12}/> FORM A</div>
                <h2 className="form-main-title">Screening Form</h2>
                <p className="form-main-subtitle">Eligibility Assessment · Fill for all pregnant women &lt;32 weeks gestation at admission</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && <button type="button" className="btn-print-form" onClick={() => window.print()}>🖨️ Print</button>}
                {isSaved && (
                  <button type="button"
                    className={`btn-edit-form-header${isEditing ? " editing-active" : ""}`}
                    onClick={() => setIsEditing(p => !p)}>
                    {isEditing ? "✓ Done Editing" : "✎ Edit Form"}
                  </button>
                )}
                <div className="screening-id-badge">
                  <span className="id-label">Screening ID</span>
                  <span className="id-val">{formData.screening_id || "—"}</span>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════
                A1 — GESTATION ASSESSMENT
            ══════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Calendar size={15} className="section-header-icon"/>
                  <h3>A1 · Gestation Assessment</h3>
                </div>
                {eligibilityStatus === "eligible" && <span className="badge-eligible">✓ Eligible</span>}
                {(eligibilityStatus === "high" || eligibilityStatus === "low") && <span className="badge-not-eligible">✗ Not Eligible</span>}
              </div>
              <div className="form-section-body">

                {/* Row 1: Gestation known? — half width */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>1. Gestation in weeks clearly mentioned?<span className="required">*</span></label>
                    <select name="gestation_known" value={formData.gestation_known} onChange={handleChange} disabled={!isFieldEditable}>
                      <option value="">-- Select --</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  {/* right cell intentionally empty — keeps dropdown at half width */}
                  <div/>
                </div>

                {/* ── Path A: Gestation KNOWN ── */}
                {formData.gestation_known === "Yes" && (<>
                  {/* Row 2: GA weeks + days + method */}
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>2a. Best estimate GA — Weeks<span className="required">*</span></label>
                      <input type="number" name="best_ga_weeks" value={formData.best_ga_weeks}
                        onChange={handleChange} min="10" max="45" placeholder="e.g. 28"
                        disabled={!isFieldEditable}
                        className={errors.best_ga_weeks ? "input-error" : ""}/>
                      {errors.best_ga_weeks && <div className="field-error">{errors.best_ga_weeks}</div>}
                    </div>
                    <div className="form-group">
                      <label>2b. Best estimate GA — Days<span className="required">*</span></label>
                      <input type="number" name="best_ga_days" value={formData.best_ga_days}
                        onChange={handleChange} min="0" max="6" placeholder="0–6"
                        disabled={!isFieldEditable}
                        className={errors.best_ga_days ? "input-error" : ""}/>
                      {errors.best_ga_days && <div className="field-error">{errors.best_ga_days}</div>}
                    </div>
                    <div className="form-group">
                      <label>3. Method of gestation assessment<span className="required">*</span></label>
                      <select name="gestation_method" value={formData.gestation_method} onChange={handleChange} disabled={!isFieldEditable}>
                        <option value="">-- Select --</option>
                        <option value="LMP">LMP</option>
                        <option value="Early USG">Early USG (&lt;24 weeks)</option>
                        <option value="Fundal Height">Fundal height</option>
                        <option value="Unknown">Method not known</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3 (method=LMP): LMP date + auto EDD */}
                  {formData.gestation_method === "LMP" && (
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>3a. LMP Date<span className="required">*</span></label>
                        <DatePicker
                          selected={formData.lmp_date ? new Date(formData.lmp_date) : null}
                          onChange={d => set({ lmp_date: d ? d.toISOString().split("T")[0] : "", edd_date:"" })}
                          dateFormat="dd-MM-yyyy" placeholderText="Select LMP date"
                          maxDate={today}
                          readOnly={!isFieldEditable}/>
                      </div>
                      <div className="form-group">
                        <label>4. Expected Delivery Date <span className="field-note">(auto-calculated from LMP)</span></label>
                        <input value={formData.edd_date ? formatDateToDDMMYYYY(formData.edd_date) : ""}
                          readOnly className="readonly-input" placeholder="—"/>
                      </div>
                      <div/>
                    </div>
                  )}

                  {/* Row 3 (method≠LMP): optional EDD entry */}
                  {formData.gestation_method && formData.gestation_method !== "LMP" && (
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>4. Expected Delivery Date <span className="field-note">(optional)</span></label>
                        <DatePicker
                          selected={formData.edd_date ? new Date(formData.edd_date) : null}
                          onChange={d => set({ edd_date: d ? d.toISOString().split("T")[0] : "" })}
                          dateFormat="dd-MM-yyyy" placeholderText="dd-MM-yyyy"
                          readOnly={!isFieldEditable}/>
                      </div>
                      <div/><div/>
                    </div>
                  )}
                </>)}

                {/* ── Path B: Gestation NOT known ── */}
                {formData.gestation_known === "No" && (<>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>5. If No, is any of the following known?<span className="required">*</span></label>
                      <select name="ga_source" value={formData.ga_source||""} onChange={handleChange} disabled={!isFieldEditable}>
                        <option value="">-- Select --</option>
                        <option value="LMP">LMP</option>
                        <option value="EDD">EDD</option>
                        <option value="Neither">Neither known</option>
                      </select>
                    </div>
                    <div/>
                  </div>

                  {formData.ga_source === "LMP" && (
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>6. If LMP known, LMP:<span className="required">*</span></label>
                        <DatePicker
                          selected={formData.lmp_date ? new Date(formData.lmp_date) : null}
                          onChange={d => set({ lmp_date: d ? d.toISOString().split("T")[0] : "", edd_date:"" })}
                          dateFormat="dd-MM-yyyy" placeholderText="Select LMP date"
                          maxDate={today}
                          readOnly={!isFieldEditable}/>
                      </div>
                      <div className="form-group">
                        <label>EDD <span className="field-note">(auto-calculated from LMP)</span></label>
                        <input value={formData.edd_date ? formatDateToDDMMYYYY(formData.edd_date) : ""}
                          readOnly className="readonly-input" placeholder="—"/>
                      </div>
                      <div/>
                    </div>
                  )}

                  {formData.ga_source === "EDD" && (
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>7. If LMP not known, EDD:<span className="required">*</span></label>
                        <DatePicker
                          selected={formData.edd_date ? new Date(formData.edd_date) : null}
                          onChange={d => set({ edd_date: d ? d.toISOString().split("T")[0] : "" })}
                          dateFormat="dd-MM-yyyy" placeholderText="Select EDD"
                          readOnly={!isFieldEditable}/>
                      </div>
                      <div/><div/>
                    </div>
                  )}
                </>)}

                {/* GA result banner + alerts */}
                {displayWeeks !== "" && displayWeeks !== null && !gaNotDeterminable && (
                  <div className="gestation-info-banner">
                    <Info size={15} className="banner-info-icon"/>
                    <span className="banner-text">
                      8. Calculated gestational age: <strong>{displayWeeks}w {displayDays}d</strong> —
                      participant is <strong>{eligibilityStatus === "eligible" ? "eligible" : "not eligible"}</strong> for the study.
                    </span>
                  </div>
                )}
                {gaNotDeterminable && <div className="alert-danger">❌ Gestational age cannot be determined — end participation.</div>}
                {eligibilityStatus === "high" && <div className="alert-danger">❌ Gestational age ≥32 weeks — cannot proceed.</div>}
                {eligibilityStatus === "low"  && <div className="alert-danger">❌ Gestational age &lt;24 weeks — not eligible for study.</div>}

              </div>
            </div>

            {/* Rest of form — only shown once gestation path complete + eligible */}
            {gestationPathComplete && !endParticipation && (<>

              {/* ══════════════════════════════════════
                  A2 — IDENTIFICATION
              ══════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <FileText size={15} className="section-header-icon"/>
                    <h3>A2 · Identification</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* Row 1: Screening ID | Site | Site ID */}
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>9. Screening ID</label>
                      <input type="text" name="screening_id" value={formData.screening_id||""}
                        placeholder="01-0001" maxLength={7} readOnly={!isFieldEditable}
                        onChange={e => {
                          if (!isFieldEditable) return;
                          let v = e.target.value.replace(/[^0-9-]/g,"");
                          if (v.length === 2 && !v.includes("-")) v += "-";
                          const pts = v.split("-");
                          if (pts.length > 2 || pts[0].length > 2 || (pts[1]&&pts[1].length > 4)) return;
                          set({ screening_id: v });
                        }}/>
                    </div>
                    <div className="form-group">
                      <label>10. Site<span className="required">*</span></label>
                      <select name="site_name" value={formData.site_name||""} onChange={handleChange} disabled={!isFieldEditable}>
                        <option value="">-- Select Site --</option>
                        <option value="PGIMER">PGIMER Chandigarh</option>
                        <option value="GMCH">GMCH Chandigarh</option>
                        <option value="IOG">IOG Chennai</option>
                        <option value="AFMC">AFMC Pune</option>
                        <option value="GMCH-A">GMCH Aurangabad</option>
                        <option value="AMC">AMC Dibrugarh</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>11. Site ID</label>
                      <input value={formData.site_id||""} readOnly className="readonly-input"/>
                    </div>
                  </div>

                  {/* Row 2: Screening Date & Time | Screened By */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>12. Screening Date &amp; Time<span className="required">*</span></label>
                      <DatePicker
                        selected={formData.screening_datetime ? new Date(formData.screening_datetime) : null}
                        onChange={d => set({ screening_datetime: d ? d.toISOString() : "" })}
                        showTimeSelect timeFormat="HH:mm" timeIntervals={1}
                        dateFormat="dd-MM-yyyy · HH:mm"
                        maxDate={today}
                        placeholderText="Select date and time"
                        readOnly={!isFieldEditable}/>
                    </div>
                    <div className="form-group">
                      <label>13. Screened by (First name)<span className="required">*</span></label>
                      <select name="screened_by" value={formData.screened_by||""} onChange={handleChange}
                        disabled={!isFieldEditable || !formData.site_name}>
                        <option value="">{formData.site_name ? "-- Select Nurse --" : "Select Site first"}</option>
                        {formData.screened_by && !nurses.includes(formData.screened_by) &&
                          <option value={formData.screened_by}>{formData.screened_by}</option>}
                        {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>

                </div>
              </div>

              {/* ══════════════════════════════════════
                  A3 — MATERNAL IDENTIFICATION
              ══════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <User size={15} className="section-header-icon"/>
                    <h3>A3 · Maternal Identification</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* Duplicate participant warning */}
                  {duplicateWarn && (
                    <div className="duplicate-warn">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      {duplicateWarn}
                    </div>
                  )}

                  {/* Row 1: Mother first + surname */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>14a. Mother's First Name<span className="required">*</span></label>
                      <input name="mother_first_name" value={formData.mother_first_name||""}
                        onChange={handleChange} onBlur={handleBlur}
                        placeholder="First name only" disabled={!isFieldEditable}
                        className={fieldTouched.mother_first_name && errors.mother_first_name ? "input-error" : ""}/>
                      {fieldTouched.mother_first_name && errors.mother_first_name && <div className="field-error">{errors.mother_first_name}</div>}
                    </div>
                    <div className="form-group">
                      <label>14b. Mother's Surname</label>
                      <input name="mother_surname" value={formData.mother_surname||""}
                        onChange={handleChange} placeholder="Surname" disabled={!isFieldEditable}/>
                    </div>
                  </div>

                  {/* Row 2: Husband first + surname */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>15a. Husband's First Name<span className="required">*</span></label>
                      <input name="husband_first_name" value={formData.husband_first_name||""}
                        onChange={handleChange} onBlur={handleBlur}
                        placeholder="First name only" disabled={!isFieldEditable}
                        className={fieldTouched.husband_first_name && errors.husband_first_name ? "input-error" : ""}/>
                      {fieldTouched.husband_first_name && errors.husband_first_name && <div className="field-error">{errors.husband_first_name}</div>}
                    </div>
                    <div className="form-group">
                      <label>15b. Husband's Surname</label>
                      <input name="husband_surname" value={formData.husband_surname||""}
                        onChange={handleChange} placeholder="Surname" disabled={!isFieldEditable}/>
                    </div>
                  </div>

                  {/* Row 3: Maternal UID + Hospital admission */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>16. Maternal UID (CR number)<span className="required">*</span></label>
                      <input name="maternal_uid" value={formData.maternal_uid||""}
                        onChange={handleChange}
                        maxLength={15}
                        inputMode={formData.site_name === "PGIMER" ? "numeric" : "text"}
                        placeholder={
                          formData.site_name === "PGIMER" ? "10-digit CR number" :
                          formData.site_name === "AMC"      ? "Serial number/Year" :
                          formData.site_name === "GMCH"    ? "CR number" :
                          formData.site_name === "IOG"         ? "CR number (auto from UID)" :
                          "CR / UID number"
                        }
                        disabled={!isFieldEditable}/>
                    </div>
                    <div className="form-group">
                      <label>17. Hospital Admission Number</label>
                      <input name="hospital_admission_number" value={formData.hospital_admission_number||""}
                        maxLength={15}
                        inputMode={["PGIMER","GMCH-A","GMCH","IOG"].includes(formData.site_name) ? "numeric" : "text"}
                        placeholder={
                          formData.site_name === "GMCH-A"   ? "11-digit admission number" :
                          formData.site_name === "AMC"      ? "Serial number/Year" :
                          formData.site_name === "GMCH"    ? "9–11 digit number" :
                          formData.site_name === "IOG"         ? "4–6 digit MRD number" :
                          formData.site_name === "PGIMER"  ? "10-digit admission number" :
                          "Admission / MRD number"
                        }
                        disabled={!isFieldEditable}
                        onChange={e => {
                          if (!isFieldEditable) return;
                          const v = e.target.value.replace(/[^a-zA-Z0-9/]/g, "");
                          if (v.length <= 15) set({ hospital_admission_number: v });
                        }}/>
                    </div>
                  </div>

                  {/* Row 4: Mother mobile + Husband mobile */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>18a. Mobile Number — Mother<span className="required">*</span></label>
                      <input type="text" name="mother_contact" value={formData.mother_contact||""}
                        maxLength={10} inputMode="numeric" placeholder="10-digit mobile"
                        disabled={!isFieldEditable}
                        onChange={e => { if(!isFieldEditable)return; handleContact(e,"mother_contact"); }}
                        className={errors.mother_contact ? "input-error" : ""}/>
                      {errors.mother_contact && <div className="field-error">{errors.mother_contact}</div>}
                    </div>
                    <div className="form-group">
                      <label>18b. Mobile Number — Husband<span className="required">*</span></label>
                      <input type="text" name="husband_contact" value={formData.husband_contact||""}
                        maxLength={10} inputMode="numeric" placeholder="10-digit mobile"
                        disabled={!isFieldEditable}
                        onChange={e => { if(!isFieldEditable)return; handleContact(e,"husband_contact"); }}
                        className={errors.husband_contact ? "input-error" : ""}/>
                      {errors.husband_contact && <div className="field-error">{errors.husband_contact}</div>}
                    </div>
                  </div>

                </div>
              </div>

              {/* ══════════════════════════════════════
                  A4 — EXCLUSION CRITERIA
              ══════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <ShieldAlert size={15} className="section-header-icon"/>
                    <h3>A4 · Exclusion Criteria</h3>
                  </div>
                  {anyExclusionYes && <span className="badge-not-eligible">Exclusion Present — End Participation</span>}
                  {allExclusionAnswered && !anyExclusionYes && <span className="badge-eligible">All Clear — Proceed to Consent</span>}
                </div>
                <div className="form-section-body">

                  {/* 1. Structural anomaly */}
                  <YesNoToggle label="19. Major structural anomalies or genetic abnormality (suspected/proven)"
                    name="exclusion_anomaly" value={formData.exclusion_anomaly} onChange={handleChange} disabled={!isFieldEditable}/>
                  {formData.exclusion_anomaly === "Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>19a. If yes, specify structural anomaly<span className="required">*</span></label>
                          <input name="exclusion_anomaly_details" value={formData.exclusion_anomaly_details||""}
                            onChange={handleChange} placeholder="Describe the anomaly" disabled={!isFieldEditable}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 2. Fetal Hydrops */}
                  <YesNoToggle label="20. Fetal Hydrops"
                    name="fetal_hydrops" value={formData.fetal_hydrops} onChange={handleChange} disabled={!isFieldEditable}/>
                  {formData.fetal_hydrops === "Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>21. If yes, select fetal hydrops type<span className="required">*</span></label>
                          <select name="fetal_hydrops_type" value={formData.fetal_hydrops_type||""} onChange={handleChange} disabled={!isFieldEditable}>
                            <option value="">-- Select type --</option>
                            <option>Immune</option>
                            <option>Non-immune</option>
                            <option>Unclear</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 3. Decision to forego resuscitation */}
                  <YesNoToggle label="22. Decision to forego resuscitation"
                    name="decision_forego_resus" value={formData.decision_forego_resus} onChange={handleChange} disabled={!isFieldEditable}/>
                  {formData.decision_forego_resus === "Yes" && (
                    <div className="followup-box">
                      <label className="followup-label">23. If yes, reason (select all that apply)<span className="required">*</span></label>
                        <MultiCheckbox
                          options={FOREGO_REASONS}
                          dataField="decision_forego_resus"
                          selected={formData.decision_forego_resus_reasons}
                        onChange={val => set({ decision_forego_resus_reasons: val })}
                        otherValue={formData.decision_forego_resus_reason_other}
                        onOtherChange={val => set({ decision_forego_resus_reason_other: val })}
                        disabled={!isFieldEditable}/>
                    </div>
                  )}

                  {/* 4. Insufficient time */}
                  <YesNoToggle label="24. Insufficient time for consent / randomization before birth"
                    name="insufficient_time" value={formData.insufficient_time} onChange={handleChange} disabled={!isFieldEditable}/>
                  {formData.insufficient_time === "Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>25. If yes, specify reason<span className="required">*</span></label>
                          <input name="insufficient_time_reason" value={formData.insufficient_time_reason||""}
                            onChange={handleChange} placeholder="Reason for insufficient time" disabled={!isFieldEditable}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 5. IUFD */}
                  <YesNoToggle label="26. Intrauterine Fetal Death (IUFD)"
                    name="iufd" value={formData.iufd} onChange={handleChange} disabled={!isFieldEditable}/>

                  {anyExclusionYes && (
                    <div className="alert-danger" style={{marginTop:16}}>
                      ❌ Exclusion criteria present — participant is not fit for consent. End participation.
                    </div>
                  )}

                </div>
              </div>

              {/* ══════════════════════════════════════
                  A5 — PROCEED FOR CONSENT
                  Shown only when no exclusion OR editing existing record
              ══════════════════════════════════════ */}
              {(!anyExclusionYes || formData.consent_given) && (
                <div className="form-section card-section">
                  <div className="form-section-header">
                    <div className="section-title-left">
                      <CheckSquare size={15} className="section-header-icon"/>
                      <h3>A5 · Consent</h3>
                    </div>
                  </div>
                  <div className="form-section-body">

                    {/* 27. Consent — half width */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>27. Consent<span className="required">*</span></label>
                        <select name="consent_given" value={formData.consent_given||""} onChange={handleChange} disabled={!isFieldEditable}>
                          <option value="">-- Select --</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="Trial run">Trial run</option>
                          <option value="Not approached">Not approached</option>
                        </select>
                      </div>
                      <div/>
                    </div>

                    {/* 28 + 31: Obtained from | Obtained by nurse — shown for Yes / No / Trial run */}
                    {(formData.consent_given === "Yes" || formData.consent_given === "No" || formData.consent_given === "Trial run") && (<>

                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>28. Consent obtained from<span className="required">*</span></label>
                          <select name="relationship_to_participant"
                            value={formData.relationship_to_participant||""} onChange={handleChange} disabled={!isFieldEditable}>
                            <option value="">-- Select --</option>
                            <option value="Mother">Mother</option>
                            <option value="Husband">Husband</option>
                            <option value="Other">Other</option>
                          </select>
                          {formData.relationship_to_participant === "Other" && (
                            <input name="relationship_other" value={formData.relationship_other||""}
                              onChange={handleChange} placeholder="e.g. Father, Guardian"
                              disabled={!isFieldEditable}
                              style={{marginTop:8}}/>
                          )}
                        </div>
                        <div className="form-group">
                          <label>31. Consent obtained by (nurse)<span className="required">*</span></label>
                          <select name="consent_taken_by" value={formData.consent_taken_by||""}
                            onChange={handleChange} disabled={!isFieldEditable || !formData.site_name}>
                            <option value="">{formData.site_name ? "-- Select Nurse --" : "Select Site first"}</option>
                            {formData.consent_taken_by && !nurses.includes(formData.consent_taken_by) &&
                              <option value={formData.consent_taken_by}>{formData.consent_taken_by}</option>}
                            {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>

                    </>)}

                    {/* 29. Reason for refusal (if No) */}
                    {formData.consent_given === "No" && (
                      <div className="followup-box">
                        <label className="followup-label">29. If no, reason for consent refusal (select all that apply)<span className="required">*</span></label>
                        <MultiCheckbox
                          options={REFUSAL_REASONS}
                          dataField="reason_for_consent_refusal_list"
                          selected={formData.reason_for_consent_refusal_list}
                          onChange={val => set({ reason_for_consent_refusal_list: val })}
                          otherValue={formData.reason_for_consent_refusal_other}
                          onOtherChange={val => set({ reason_for_consent_refusal_other: val })}
                          disabled={!isFieldEditable}/>
                      </div>
                    )}

                    {/* 30. Reason not approached (if Not approached) */}
                    {formData.consent_given === "Not approached" && (
                      <div className="followup-box">
                        <label className="followup-label">30. If not approached, reason (select all that apply)<span className="required">*</span></label>
                        <MultiCheckbox
                          options={NOT_APPROACHED_REASONS}
                          dataField="reason_not_approached_list"
                          selected={formData.reason_not_approached_list}
                          onChange={val => set({ reason_not_approached_list: val })}
                          otherValue={formData.reason_not_approached_other}
                          onOtherChange={val => set({ reason_not_approached_other: val })}
                          disabled={!isFieldEditable}/>
                      </div>
                    )}

                    {/* 32. Video PIS shown — always shown whenever consent_given has any value */}
                    {formData.consent_given && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>32. Video PIS shown?<span className="required">*</span></label>
                          <select name="video_pis_shown" value={formData.video_pis_shown||""} onChange={handleChange} disabled={!isFieldEditable}>
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    )}

                  </div>
                </div>
              )}

            </>)}

            {/* ── NOTES BOX ── */}
            <NotesBox formKey={`form_a_${formData.screening_id || "new"}`} />

            {message && <div className={`form-message${message.startsWith("✅") ? " msg-success" : message.startsWith("⚠️") ? " msg-warn" : " msg-error"}`}>{message}</div>}

          </div>
        </fieldset>
      </form>

      {/* ── STICKY NAVIGATION BAR ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={15}/> Dashboard
        </button>
        <button type="button" className="btn btn-save" onClick={saveForm}>
          <Save size={15}/> Save
        </button>
        <button type="button" className="btn btn-draft" onClick={saveDraft}>
          <Save size={15}/> Save for Later
        </button>

        {/* Auto-save status indicator */}
        <div className="autosave-indicator">
          {/* Last saved timestamp */}
          {lastSaved && autoSaveStatus === "idle" && (
            <span className="last-saved-txt">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Saved {relativeTime(lastSaved)}
            </span>
          )}
          {/* Unsaved changes dot */}
          {isDirty && autoSaveStatus === "idle" && !lastSaved && (
            <span className="unsaved-dot-pill">
              <span className="unsaved-dot"/>
              Unsaved changes
            </span>
          )}
          {autoSaveStatus === "saving" && (
            <span className="autosave-pill autosave-pill--saving">
              <span className="autosave-dot autosave-dot--spin"/>
              Auto-saving…
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="autosave-pill autosave-pill--saved">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Auto-saved
            </span>
          )}
          {autoSaveStatus === "error" && (
            <span className="autosave-pill autosave-pill--error">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Auto-save failed
            </span>
          )}
        </div>

        <div className="footer-step-indicator">
          <span className="step-text">STEP 1 OF 17</span>
          <div className="step-progress-line">
            <div className="progress-segment active"/>
            <div className="progress-segment"/>
            <div className="progress-segment"/>
            <div className="progress-segment"/>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleNext} disabled={!isSaved}>
          Birth &amp; Resuscitation <ArrowRight size={15}/>
        </button>
      </div>

      {/* ── Missing fields modal — modern redesign ── */}
      {showMissingModal && (
        <div className="modal-overlay" onClick={() => setShowMissingModal(false)}>
          <div className="mf-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="mf-modal-header">
              <div className="mf-modal-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div className="mf-modal-text">
                <h3 className="mf-modal-title">Required fields missing</h3>
                <p className="mf-modal-sub">{missingFields.length} field{missingFields.length !== 1 ? "s" : ""} need attention before saving</p>
              </div>
              <button className="mf-modal-close" onClick={() => setShowMissingModal(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Field list */}
            <div className="mf-modal-list">
              {missingFields.map((f, i) => (
                <div key={i} className="mf-modal-item">
                  <span className="mf-modal-num">{i + 1}</span>
                  <span className="mf-modal-label">{f.label}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mf-modal-footer">
              <button className="mf-btn-secondary"
                onClick={() => setShowMissingModal(false)}>
                Dismiss
              </button>
              <button className="mf-btn-primary"
                onClick={() => {
                  setShowMissingModal(false);
                  setTimeout(() => scrollToFirstError(missingFields), 100);
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Go to first error
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Consent outcome modal */}
      {showConsentModal && (
        <div className="consent-overlay">
          <div className="consent-modal">
            <h2>Screening Completed</h2>
            <p>{consentMessage}</p>
            <button className="consent-btn" onClick={() => { setShowConsentModal(false); navigate("/dashboard"); }}>
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Draft saved modal */}
      {showDraftModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-icon">💾</div>
            <div className="modal-title">Draft Saved</div>
            <div className="modal-subtext">
              Your progress has been saved. You can return to this form any time to complete it.
            </div>
            <div style={{display:"flex", gap:"10px", marginTop:"16px"}}>
              <button className="modal-btn" style={{background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0"}}
                onClick={() => { setShowDraftModal(false); setIsSaved(true); }}>
                Keep Editing
              </button>
              <button className="modal-btn"
                onClick={() => { setShowDraftModal(false); navigate("/dashboard"); }}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
