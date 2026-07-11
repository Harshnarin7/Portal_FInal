import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/FormA.css";
import "./styles/FormD.css";
import SegmentedToggle from "./components/SegmentedToggle";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import NotesBox from "./components/NotesBox";
import { relativeTime, toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import {
  ArrowLeft, ArrowRight, Save, Home,
  User, Baby, Wind, Droplets, CheckSquare,
  CheckCircle, AlertTriangle, XCircle, AlertCircle,
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   VALIDATION ENGINE
══════════════════════════════════════════════════════ */

const RULES = {
  // required toggles (Golden Hour)
  ga_method:             { required: true, type: "toggle" },
  gestation_weeks:       { required: true, type: "number",
    validate: v => {
      const n = Number(v);
      if (!v && v !== 0) return "Required";
      if (n < 18 || n > 42) return "Weeks must be 18-42";
      return null;
    } },
  gestation_days:        { required: true, type: "number",
    validate: v => {
      const n = Number(v);
      if (v === "" || v === null || v === undefined) return "Required";
      if (n < 0 || n > 6) return "Days must be 0-6";
      return null;
    } },
  gender:                { required: true, type: "toggle" },
  growth_status:         { required: true, type: "toggle" },
  sga_centile:           { required: (fd) => fd.growth_status === "SGA", type: "toggle" },
  plastic_wrap:          { required: true, type: "toggle" },
  et_intubation:         { required: true, type: "toggle" },
  labored_breathing:     { required: true, type: "toggle" },
  remained_intubated:    { required: (fd) => fd.et_intubation === "Yes", type: "toggle" },

  // Surfactant
  surfactant_required:   { required: true, type: "toggle" },
  surfactant_indication: { required: (fd) => fd.surfactant_required === "Yes", type: "toggle" },
  surfactant_method:     { required: (fd) => fd.surfactant_required === "Yes", type: "toggle" },
  premedication_given:   { required: (fd) => fd.surfactant_method === "InSurE", type: "toggle" },
  premedication_drugs:   { required: (fd) => fd.premedication_given === "Yes", type: "pill" },
  premedication_other:   { required: (fd) => fd.premedication_drugs?.includes("Others"), type: "text",
    validate: v => /^[A-Za-z\s]+$/.test(v) ? null : "Only alphabets allowed" },
  surfactant_brand:      { required: (fd) => fd.surfactant_required === "Yes", type: "pill" },
  surfactant_brand_other:{ required: (fd) => fd.surfactant_brand === "Other", type: "text",
    validate: v => /^[A-Za-z\s]+$/.test(v) ? null : "Only alphabets allowed" },
  surfactant_dose: {
    required: (fd) => fd.surfactant_required === "Yes", type: "number",
    validate: v => {
      const n = Number(v);
      if (!v) return "Required";
      if (n <= 0) return "Dose must be greater than 0";
      if (n < 50) return { msg: "Below recommended range (50–200 mg/kg)", level: "warn" };
      if (n > 200) return { msg: "Above recommended range (50–200 mg/kg)", level: "warn" };
      return null;
    },
  },
  cpap_cm: {
    required: (fd) => fd.surfactant_required === "Yes", type: "number",
    validate: v => {
      const n = Number(v);
      if (!v) return "Required";
      if (n > 20) return "Maximum value is 20 cmH₂O";
      if (n < 4)  return { msg: "Low MAP — typical range 4–12 cmH₂O", level: "warn" };
      if (n > 12) return { msg: "High MAP — typical range 4–12 cmH₂O", level: "warn" };
      return null;
    },
  },
  fio2_percent: {
    required: (fd) => fd.surfactant_required === "Yes", type: "number",
    validate: v => {
      if (!v && v !== 0) return "Required";
      const n = Number(v);
      if (n < 0 || n > 100) return "Value must be between 0 and 100";
      return null;
    },
  },
  adverse_effects:  { required: (fd) => fd.surfactant_required === "Yes", type: "toggle" },
  adverse_type:     { required: (fd) => fd.adverse_effects === "Yes", type: "pill" },
  adverse_type_other:{ required: (fd) => fd.adverse_type === "Other", type: "text",
    validate: v => /^[A-Za-z\s]+$/.test(v) ? null : "Only alphabets allowed" },

  // LISA — catheter type now has 3 options per CRF: Infant feeding tube / LISA catheter / Other
  lisa_catheter_type: { required: (fd) => fd.surfactant_method === "LISA", type: "toggle" },
  device_assistance:  { required: (fd) => fd.surfactant_method === "LISA", type: "toggle" },
  device_type:        { required: (fd) => fd.device_assistance === "Yes", type: "toggle" },
  device_type_other:  { required: (fd) => fd.device_type === "Other", type: "text",
    validate: v => /^[A-Za-z\s]+$/.test(v) ? null : "Only alphabets allowed" },

  // Respiratory
  early_cpap:            { required: true, type: "toggle" },
  humidified_gas:        { required: true, type: "toggle" },
  intubation_after_resus:{ required: true, type: "toggle" },
  max_fio2_1hr: {
    required: true, type: "number",
    validate: v => {
      if (!v && v !== 0) return "Required";
      const n = Number(v);
      if (n < 0 || n > 100) return "Value must be between 0 and 100";
      return null;
    },
  },

  // Caffeine — loading dose required, maintenance optional
  caffeine_loading: { required: true, type: "toggle" },
  caffeine_loading_abs: {
    required: (fd) => fd.caffeine_loading === "Yes", type: "number",
    validate: v => {
      if (!v) return "Required";
      const n = Number(v);
      if (n <= 0) return "Dose must be greater than 0";
      if (n > 1000) return { msg: "Dose seems very high — please verify", level: "warn" };
      return null;
    },
  },
  caffeine_maint_abs: {
    required: (fd) => fd.caffeine_loading === "Yes", type: "number",
    validate: v => {
      if (!v) return null;
      const n = Number(v);
      if (n <= 0) return "Dose must be greater than 0";
      if (n > 1000) return { msg: "Dose seems very high — please verify", level: "warn" };
      return null;
    },
  },
  caffeine_date: {
    required: (fd) => fd.caffeine_loading === "Yes", type: "date",
    validate: v => {
      if (!v) return null;
      if (new Date(v) > new Date()) return "Future date not allowed";
      return null;
    },
  },

  // KMC
  immediate_kmc: { required: true, type: "toggle" },

  date: {
    required: true, type: "date",
    validate: v => {
      if (!v) return null;
      if (new Date(v) > new Date()) return "Future date not allowed";
      return null;
    },
  },

  // Completion
  completed_by: { required: true, type: "select" },
};

/* Returns: null | { level: "error"|"warn"|"ok", msg: string } */
function validateField(name, value, formData) {
  const rule = RULES[name];
  if (!rule) return null;

  const isRequired = typeof rule.required === "function"
    ? rule.required(formData) : rule.required;

  // Not applicable
  if (!isRequired && (value === "" || value === null || value === undefined)) return null;

  // Required check
  if (isRequired && (value === "" || value === null || value === undefined)) {
    if (rule.type === "toggle" || rule.type === "pill")
      return { level: "error", msg: "Please select an option" };
    return { level: "error", msg: "Required" };
  }

  // Custom validate
  if (rule.validate && value !== "" && value !== null) {
    const result = rule.validate(value, formData);
    if (!result) return { level: "ok", msg: "" };
    if (typeof result === "string") return { level: "error", msg: result };
    return { level: result.level, msg: result.msg };
  }

  return { level: "ok", msg: "" };
}

function validateForm(formData) {
  const errs = {};
  for (const name of Object.keys(RULES)) {
    const result = validateField(name, formData[name], formData);
    if (result && result.level === "error") errs[name] = result.msg;
  }
  return errs;
}

/* ── Status-aware field wrapper ── */
function FieldWrap({ name, formData, touched, children, label, required }) {
  const result = touched[name] ? validateField(name, formData[name], formData) : null;
  const level  = result?.level;
  let wrapClass = "fv-wrap";
  if (level === "ok")    wrapClass += " fv-ok";
  if (level === "warn")  wrapClass += " fv-warn";
  if (level === "error") wrapClass += " fv-error";

  return (
    <div className={`form-group ${wrapClass}`}>
      {label && (
        <label>
          {label}
          {required && <span className="required"> *</span>}
          {level === "ok"    && <CheckCircle   size={12} className="fv-icon fv-icon-ok"   />}
          {level === "warn"  && <AlertTriangle size={12} className="fv-icon fv-icon-warn" />}
          {level === "error" && <XCircle       size={12} className="fv-icon fv-icon-err"  />}
        </label>
      )}
      {children}
      {result?.msg && (
        <div className={`fv-msg fv-msg-${level}`}>{result.msg}</div>
      )}
    </div>
  );
}

const UnitInput = ({ name, value, onChange, onBlur, readOnly, unit, error, warn, className="" }) => {
  /* Spinner buttons are ~28px wide on most browsers.
     Add enough right padding so the unit label never overlaps them. */
  const unitWidth = unit === "cmH₂O" ? 72 : unit === "mg/kg" ? 64 : unit === "mg" ? 42 : 40;
  return (
    <div style={{ position: "relative" }}>
      <input type="number" name={name} value={value || ""} readOnly={readOnly}
        onChange={onChange} onBlur={onBlur}
        className={`emr-input${error ? " fv-input-error" : warn ? " fv-input-warn" : value ? " fv-input-ok" : ""} ${className}`}
        style={{ paddingRight: unitWidth }} />
      <span style={{
        position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)",
        fontSize: 11, color: "#94a3b8", fontWeight: 600, pointerEvents: "none",
        userSelect: "none",
      }}>{unit}</span>
    </div>
  );
};

const deriveGrowthStatus = (centile) => {
  if (centile === "" || centile === null || centile === undefined) return { growth_status: "", sga_centile: "" };
  const n = Number(centile);
  if (Number.isNaN(n)) return { growth_status: "", sga_centile: "" };
  if (n < 3) return { growth_status: "SGA", sga_centile: "<3rd" };
  if (n < 10) return { growth_status: "SGA", sga_centile: "<10th" };
  if (n > 90) return { growth_status: "LGA", sga_centile: "" };
  return { growth_status: "AGA", sga_centile: "" };
};

const toggleListValue = (value, item) => {
  const current = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const next = current.includes(item)
    ? current.filter(v => v !== item)
    : [...current, item];
  return next.join(", ");
};

const totalGestationDays = (weeks, days) => {
  if (weeks === "" || weeks === null || weeks === undefined) return null;
  if (days === "" || days === null || days === undefined) return null;
  const w = Number(weeks);
  const d = Number(days);
  if (Number.isNaN(w) || Number.isNaN(d)) return null;
  return w * 7 + d;
};

export default function FormD() {
  const { enrollmentId } = useParams();
  const location  = useLocation();
  const navigate  = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { updatePatientData } = usePatient();

  const [isSaved,   setIsSaved]   = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message,   setMessage]   = useState("");
  const [touched,   setTouched]   = useState({});
  const [submitErrors, setSubmitErrors] = useState([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle");
  const [lastSaved,      setLastSaved]      = useState(null);
  const [isDirty,        setIsDirty]        = useState(false);
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const autoSaveTimer  = useRef(null);
  const firstErrRef = useRef(null);

  const isFieldEditable = true; // Form D is always editable

  const [formData, setFormData] = useState({
    enrollment_id: "", gestation_weeks: "", gestation_days: "",
    original_gestation_weeks: "", original_gestation_days: "",
    annual_number: "", baby_name: "", baby_uid: "", birth_weight: "", site_name: "",
    ga_method: "", gender: "", growth_status: "", sga_centile: "",
    plastic_wrap: "", remained_intubated: "", et_intubation: "", labored_breathing: "",
    surfactant_required: "", surfactant_brand_other: "", surfactant_indication: "",
    cpap_cm: "", fio2_percent: "", surfactant_method: "",
    premedication_given: "", premedication_drugs: "", premedication_other: "",
    lisa_catheter: "", device_assistance: "", device_type: "",
    surfactant_brand: "", surfactant_dose: "", adverse_effects: "",
    adverse_type: "", adverse_type_other: "", mode_of_support: [],
    early_cpap: "", humidified_gas: "", max_fio2_1hr: "",
    caffeine: "", caffeine_dose: "", intubation_after_resus: "",
    immediate_kmc: "", device_type_other: "",
    caffeine_loading: "", caffeine_loading_abs: "", caffeine_maint_abs: "",
    caffeine_date: "", caffeine_time: "",
    completed_by: "", designation: "", date: "",
  });

  const touch = (name) => setTouched(p => ({ ...p, [name]: true }));

  /* ── handleChange: mark touched, update state ── */
  const handleChange = (e) => {
    const { name, value } = e.target;
    touch(name);
    setFormData(prev => {
      let updated = { ...prev, [name]: value };
      if (name === "et_intubation" && value === "No") updated.remained_intubated = "";
      return updated;
    });
  };

  const handleToggle = (name, value) => {
    touch(name);
    setFormData(prev => {
      let updated = { ...prev, [name]: value };
      if (name === "et_intubation" && value === "No") updated.remained_intubated = "";
      if (name === "surfactant_method" && value !== "InSurE") {
        updated.premedication_given = "";
        updated.premedication_drugs = "";
        updated.premedication_other = "";
      }
      if (name === "premedication_given" && value !== "Yes") {
        updated.premedication_drugs = "";
        updated.premedication_other = "";
      }
      if (name === "caffeine_loading" && value !== "Yes") {
        updated.caffeine_loading_abs = "";
        updated.caffeine_maint_abs = "";
        updated.caffeine_date = "";
        updated.caffeine_time = "";
      }
      return updated;
    });
  };

  const yesNoToBool = (v) => {
    if (v === "Yes") return true;
    if (v === "No")  return false;
    return null;
  };

  const handleModeChange = (mode) => {
    setFormData(prev => ({
      ...prev,
      mode_of_support: prev.mode_of_support?.includes(mode)
        ? prev.mode_of_support.filter(i => i !== mode)
        : [...(prev.mode_of_support || []), mode],
    }));
  };

  const num = (v) => (v === "" || v === undefined) ? null : Number(v);

  /* ── Phase 1: load Form B identification + PII name
     Phase 2: load saved postnatal-day1 record and restore ALL fields ── */
  useEffect(() => {
    if (!enrollmentId) return;

    // Reset immediately: without this, switching to a patient with no
    // Form D record yet keeps isRecordSaved=true from whichever patient
    // was viewed previously, which makes autosave/save fire PUT instead
    // of POST and the backend 404s.
    setIsRecordSaved(false);

    const loadData = async () => {
      try {
        // ── Form B: identification fields (readonly) ──
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = res?.data || {};
        let motherName = "";
        const screeningId = b?.screening_id || localStorage.getItem("current_screening_id");
        let siteName = "";
        if (screeningId) {
          try {
            const piiRes = await api.get(`/pii/screening/${screeningId}`);
            const pii = piiRes.data || {};
            const first = pii.mother_first_name || pii.mother_name_first || "";
            const last  = pii.mother_surname    || pii.mother_name_surname || "";
            motherName  = `${first} ${last}`.trim();
          } catch (_) {}
          try {
            const siteRes = await api.get(`/screenings/by-screening-id/${screeningId}`);
            siteName = siteRes.data?.site_name || "";
          } catch (_) {}
        }
        if (!motherName)
          motherName = `${b?.mother_name_first || ""} ${b?.mother_name_surname || ""}`.trim();
        const growth = deriveGrowthStatus(b?.intrauterine_centile);

        // Set identification fields from Form B first
        setFormData(prev => ({
          ...prev,
          enrollment_id:   b?.enrollment_id || enrollmentId,
          annual_number:   b?.baby_annual_no || prev.annual_number,
          gestation_weeks: b?.gestation_weeks || "",
          gestation_days:  b?.gestation_days  || "",
          original_gestation_weeks: b?.original_gestation_weeks ?? b?.gestation_weeks ?? "",
          original_gestation_days:  b?.original_gestation_days  ?? b?.gestation_days  ?? "",
          birth_weight:    b?.birth_weight    || "",
          baby_uid:        b?.baby_uid        || "",
          gender:          b?.gender || prev.gender,
          growth_status:   growth.growth_status || prev.growth_status,
          sga_centile:     growth.sga_centile || prev.sga_centile,
          baby_name:       motherName ? `Baby of ${motherName}` : "",
          site_name:       siteName,
        }));
      } catch (err) { console.log("❌ No Form B data found", err); }

      // ── Form D: load saved postnatal-day1 record ──
      try {
        const dRes = await api.get(`/postnatal-day1/${enrollmentId}`);
        const d = dRes?.data || {};

        /* Helper: DB stores booleans as true/false, UI toggles expect "Yes"/"No" */
        const fromBool = (v) => v === true ? "Yes" : v === false ? "No" : "";

        /* mode_of_support is saved as "CPAP, IMV" string — restore as array */
        const modeArray = d.mode_of_support
          ? d.mode_of_support.split(",").map(s => s.trim()).filter(Boolean)
          : [];

        setFormData(prev => ({
          ...prev,
          // ── Identification (from Form B already set, but override if present) ──
          annual_number:   d.annual_number   || prev.annual_number,
          baby_name:       d.baby_name       || prev.baby_name,
          gestation_weeks: d.gestation_weeks != null ? String(d.gestation_weeks) : prev.gestation_weeks,
          gestation_days:  d.gestation_days  != null ? String(d.gestation_days)  : prev.gestation_days,
          ga_method:       d.ga_method       || prev.ga_method,
          gender:          d.gender          || prev.gender,
          growth_status:   d.growth_status   || prev.growth_status,
          sga_centile:     d.sga_centile     || prev.sga_centile,

          // ── Golden Hour ── (bool → "Yes"/"No")
          plastic_wrap:       fromBool(d.plastic_wrap),
          et_intubation:      fromBool(d.et_intubation),
          remained_intubated: fromBool(d.remained_intubated),
          labored_breathing:  fromBool(d.labored_breathing),

          // ── Surfactant ──
          surfactant_required:   fromBool(d.surfactant_required),
          surfactant_indication: d.surfactant_indication || "",
          cpap_cm:               d.cpap_cm       != null ? String(d.cpap_cm)       : "",
          fio2_percent:          d.fio2_percent  != null ? String(d.fio2_percent)  : "",
          surfactant_method:     d.surfactant_method    || "",
          surfactant_brand:      d.surfactant_brand     || "",
          surfactant_brand_other:d.surfactant_brand_other || "",
          surfactant_dose:       d.surfactant_dose != null ? String(d.surfactant_dose) : "",
          mode_of_support:       modeArray,
          premedication_given:   fromBool(d.premedication_given),
          premedication_drugs:   d.premedication_drugs || "",
          premedication_other:   d.premedication_other || "",

          // ── LISA ──
          lisa_catheter: d.lisa_catheter || "",
          lisa_catheter_type: d.lisa_catheter_type || "",
          device_assistance:  fromBool(d.device_assistance),
          // device_type was saved as the final resolved value; restore it
          device_type:        d.device_type || "",
          device_type_other:  d.device_type_other || "",

          // ── Adverse Effects ──
          adverse_effects:    fromBool(d.adverse_effects),
          adverse_type:       d.adverse_type       || "",
          adverse_type_other: d.adverse_type_other || "",

          // ── Early Respiratory Support ──
          early_cpap:             fromBool(d.early_cpap),
          humidified_gas:         fromBool(d.humidified_gas),
          max_fio2_1hr:           d.max_fio2_1hr != null ? String(d.max_fio2_1hr) : "",
          intubation_after_resus: fromBool(d.intubation_after_resus),
          immediate_kmc:          fromBool(d.immediate_kmc),

          // ── Caffeine ──
          caffeine:            fromBool(d.caffeine),
          caffeine_dose:       d.caffeine_dose != null ? String(d.caffeine_dose) : "",
          caffeine_loading:    fromBool(d.caffeine_loading),
          caffeine_loading_abs:d.caffeine_loading_abs != null ? String(d.caffeine_loading_abs) : "",
          caffeine_maint_abs:  d.caffeine_maint_abs  != null ? String(d.caffeine_maint_abs)  : "",
          caffeine_date:       d.caffeine_date || "",
          caffeine_time:       d.caffeine_time || "",

          // ── Completion ──
          completed_by: d.completed_by || "",
          designation:  d.designation  || "",
          date:         d.completion_date || "",
        }));

        setIsRecordSaved(true);
        // Do NOT set isSaved(true) here — form stays editable until user explicitly saves
      } catch (err) {
        // 404 = no saved record yet — that's fine, form starts blank
        if (err?.response?.status !== 404)
          console.log("❌ Error loading Form D data", err);
      }
    };
    loadData();
  }, [enrollmentId]);

  useEffect(() => {
    if (formData.enrollment_id) return;
    const id = location.state?.enrollmentId || localStorage.getItem("current_enrollment_id");
    if (!id) return;
    api.get(`/birth-resuscitation/${id}`).then(res => {
      const b = res.data || {};
      setFormData(prev => ({
        ...prev, enrollment_id: id,
        dob: b?.date_of_birth || "",
        gestation: b?.gestation_weeks && b?.gestation_days
          ? `${b.gestation_weeks} weeks ${b.gestation_days} days` : "",
      }));
    });
  }, []);

  /* ── Online / Offline ── */
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  /* ── beforeunload ── */
  useEffect(() => {
    const h = e => { if (!isDirty) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  /* ── Relative time helper ── */
  const relT = relativeTime;

  // Track whether a DB record exists (for PUT vs POST) separately from form lock
  const [isRecordSaved, setIsRecordSaved] = useState(false);

  /* ── Auto-save every 10s ── */
  const autoSave = useCallback(async () => {
    if (!formData.enrollment_id || !navigator.onLine) return;
    setAutoSaveStatus("saving");
    try {
      const payload = buildAutoPayload();
      if (isRecordSaved) {
        await api.put(`/postnatal-day1/${formData.enrollment_id}`, payload);
      } else {
        await api.post("/postnatal-day1/", payload);
        setIsRecordSaved(true);
      }
      setAutoSaveStatus("saved");
      setLastSaved(new Date()); setIsDirty(false);
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
    } catch {
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
  }, [formData, isRecordSaved]); // eslint-disable-line

  useEffect(() => {
    clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(autoSave, 10000);
    return () => clearInterval(autoSaveTimer.current);
  }, [autoSave]);

  /* ── Save for Later (skip validation, never locks form) ── */
  const saveForLater = async () => {
    setMessage("");
    try {
      const payload = buildAutoPayload();
      if (isRecordSaved) {
        await api.put(`/postnatal-day1/${formData.enrollment_id}`, payload);
      } else {
        await api.post("/postnatal-day1/", payload);
        setIsRecordSaved(true);
      }
      setLastSaved(new Date()); setIsDirty(false);
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
      setMessage("💾 Draft saved — return any time to complete");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage("❌ Draft save failed — " + (err?.response?.data?.detail || err.message));
    }
  };

  /* ── Payload builder (shared by save, auto-save, save-for-later) ── */
  const buildAutoPayload = useCallback(() => ({
    enrollment_id:      formData.enrollment_id,
    gestation_weeks:    num(formData.gestation_weeks),
    gestation_days:     num(formData.gestation_days),
    annual_number:      formData.annual_number,
    baby_name:          formData.baby_name,
    baby_uid:           formData.baby_uid,
    birth_weight:       num(formData.birth_weight),
    ga_method:          formData.ga_method || null,
    gender:             formData.gender || null,
    growth_status:      formData.growth_status || null,
    sga_centile:        formData.sga_centile || null,
    plastic_wrap:       yesNoToBool(formData.plastic_wrap),
    remained_intubated: yesNoToBool(formData.remained_intubated),
    et_intubation:      yesNoToBool(formData.et_intubation),
    labored_breathing:  yesNoToBool(formData.labored_breathing),
    surfactant_required:   yesNoToBool(formData.surfactant_required),
    surfactant_indication: formData.surfactant_indication,
    cpap_cm:     num(formData.cpap_cm),
    fio2_percent: num(formData.fio2_percent),
    surfactant_method: formData.surfactant_method,
    premedication_given: yesNoToBool(formData.premedication_given),
    premedication_drugs: formData.premedication_drugs,
    premedication_other: formData.premedication_other,
    surfactant_brand:  formData.surfactant_brand,
    surfactant_dose:   num(formData.surfactant_dose),
    adverse_effects:   yesNoToBool(formData.adverse_effects),
    adverse_type:      formData.adverse_type,
    early_cpap:        yesNoToBool(formData.early_cpap),
    humidified_gas:    yesNoToBool(formData.humidified_gas),
    max_fio2_1hr:      num(formData.max_fio2_1hr),
    surfactant_brand_other: formData.surfactant_brand_other,
    lisa_catheter: formData.lisa_catheter,
    lisa_catheter_type: formData.lisa_catheter_type,
    device_assistance:  yesNoToBool(formData.device_assistance),
    device_type: formData.device_type === "Other" ? formData.device_type_other : formData.device_type,
    adverse_type_other:  formData.adverse_type_other,
    mode_of_support:     formData.mode_of_support.join(", "),
    caffeine:            yesNoToBool(formData.caffeine),
    caffeine_dose:       num(formData.caffeine_dose),
    caffeine_loading:    yesNoToBool(formData.caffeine_loading),
    caffeine_loading_abs: num(formData.caffeine_loading_abs),
    caffeine_maint_abs:   num(formData.caffeine_maint_abs),
    caffeine_date:        formData.caffeine_date || null,
    caffeine_time:        formData.caffeine_time || null,
    intubation_after_resus: yesNoToBool(formData.intubation_after_resus),
    immediate_kmc:          yesNoToBool(formData.immediate_kmc),
    completed_by:  formData.completed_by,
    designation:   formData.designation,
    completion_date: formData.date || null,
  }), [formData]); // eslint-disable-line

  /* ── Save logic: unchanged payload ── */
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!formData.enrollment_id) {
      setMessage("❌ Enrollment ID missing. Cannot save form.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Touch all fields to show all errors
    const allTouched = Object.fromEntries(Object.keys(RULES).map(k => [k, true]));
    setTouched(allTouched);

    // Validate
    const errs = validateForm(formData);
    const errList = Object.entries(errs).map(([k, msg]) => ({ field: k, msg }));
    if (errList.length > 0) {
      setSubmitErrors(errList);
      setTimeout(() => {
        if (firstErrRef.current)
          firstErrRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);
      return;
    }
    setSubmitErrors([]);

    const payload = {
      enrollment_id:      formData.enrollment_id,
      gestation_weeks:    num(formData.gestation_weeks),
      gestation_days:     num(formData.gestation_days),
      annual_number:      formData.annual_number,
      baby_name:          formData.baby_name,
      baby_uid:           formData.baby_uid,
      birth_weight:       num(formData.birth_weight),
      ga_method:          formData.ga_method || null,
      gender:             formData.gender || null,
      growth_status:      formData.growth_status || null,
      sga_centile:        formData.sga_centile || null,
      plastic_wrap:       yesNoToBool(formData.plastic_wrap),
      remained_intubated: yesNoToBool(formData.remained_intubated),
      et_intubation:      yesNoToBool(formData.et_intubation),
      labored_breathing:  yesNoToBool(formData.labored_breathing),
      surfactant_required:   yesNoToBool(formData.surfactant_required),
      surfactant_indication: formData.surfactant_indication,
      cpap_cm:     num(formData.cpap_cm),
      fio2_percent: num(formData.fio2_percent),
      surfactant_method: formData.surfactant_method,
      premedication_given: yesNoToBool(formData.premedication_given),
      premedication_drugs: formData.premedication_drugs,
      premedication_other: formData.premedication_other,
      surfactant_brand:  formData.surfactant_brand,
      surfactant_dose:   num(formData.surfactant_dose),
      adverse_effects:   yesNoToBool(formData.adverse_effects),
      adverse_type:      formData.adverse_type,
      early_cpap:        yesNoToBool(formData.early_cpap),
      humidified_gas:    yesNoToBool(formData.humidified_gas),
      max_fio2_1hr:      num(formData.max_fio2_1hr),
      surfactant_brand_other: formData.surfactant_brand_other,
      lisa_catheter: formData.lisa_catheter,
      lisa_catheter_type: formData.lisa_catheter_type,
      device_assistance:  yesNoToBool(formData.device_assistance),
      device_type: formData.device_type === "Other" ? formData.device_type_other : formData.device_type,
      adverse_type_other:  formData.adverse_type_other,
      mode_of_support:     formData.mode_of_support.join(", "),
      caffeine:            yesNoToBool(formData.caffeine),
      caffeine_dose:       num(formData.caffeine_dose),
      caffeine_loading:    yesNoToBool(formData.caffeine_loading),
      caffeine_loading_abs: num(formData.caffeine_loading_abs),
      caffeine_maint_abs:   num(formData.caffeine_maint_abs),
      caffeine_date:        formData.caffeine_date || null,
      caffeine_time:        formData.caffeine_time || null,
      intubation_after_resus: yesNoToBool(formData.intubation_after_resus),
      immediate_kmc:          yesNoToBool(formData.immediate_kmc),
      completed_by:  formData.completed_by,
      designation:   formData.designation,
      completion_date: formData.date || null,
    };
    try {
      if (isRecordSaved) {
        await api.put(`/postnatal-day1/${formData.enrollment_id}`, payload);
      } else {
        await api.post("/postnatal-day1/", payload);
        setIsRecordSaved(true);
      }
      const originalGa = totalGestationDays(formData.original_gestation_weeks, formData.original_gestation_days);
      const enteredGa = totalGestationDays(formData.gestation_weeks, formData.gestation_days);
      const useNbsGa = formData.ga_method === "NBS"
        && originalGa !== null
        && enteredGa !== null
        && Math.abs(enteredGa - originalGa) > 14;
      updatePatientData({
        completed_by: formData.completed_by,
        designation: formData.designation,
        gestation_weeks: useNbsGa ? formData.gestation_weeks : (formData.original_gestation_weeks || formData.gestation_weeks),
        gestation_days: useNbsGa ? formData.gestation_days : (formData.original_gestation_days || formData.gestation_days),
        gestation_source: useNbsGa ? "Form D NBS" : "Form B",
      });
      markFormCompleted("form_d");
      setMessage("✅ Form D saved successfully");
      setIsSaved(true); setIsEditing(false);
      setLastSaved(new Date()); setIsDirty(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("FormD save error:", err.response?.data || err);
      setMessage("❌ Error submitting Form D: " + (err?.response?.data?.detail || err.message));
    }
  };

  const handleNext = async () => {
    await handleSubmit({ preventDefault: () => {} });
    // Only navigate if no validation errors remain
    const errs = validateForm(formData);
    if (Object.keys(errs).length === 0) {
      navigate(`/form-e/${formData.enrollment_id}`);
    }
  };

  const nurses = [
    "Geetika", "Navkiran Kaur", "Priyanka Thakur", "Seemran Kaur",
    "Tanvi Saini", "Yashvi Jolly", "Mannat Guliani", "Shalini Dhiman",
  ];
  const getDesignation = (name) => {
    if (name === "Mannat Guliani") return "Project Research Scientist III (Medical)";
    if (name === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
    return name ? "Project Nurse III" : "";
  };
  const handleCompletedByChange = (e) => {
    const name = e.target.value;
    touch("completed_by");
    setFormData(prev => ({ ...prev, completed_by: name, designation: getDesignation(name) }));
  };

  // Shorthand for getting validation result for a field
  const vr = (name) => touched[name] ? validateField(name, formData[name], formData) : null;
  const isRequired = (name) => {
    const rule = RULES[name];
    if (!rule) return false;
    return typeof rule.required === "function" ? rule.required(formData) : rule.required;
  };

  // Compute overall form validity for save button state
  const formErrors = validateForm(formData);
  const hasErrors  = Object.keys(formErrors).length > 0;

  const FIELD_LABELS = {
    plastic_wrap: "Plastic Wrap", et_intubation: "ET Intubation",
    ga_method: "Gestational Age By", gender: "Gender",
    growth_status: "Intra-uterine Growth Status", sga_centile: "SGA Centile",
    labored_breathing: "Labored Breathing", remained_intubated: "Remained Intubated",
    surfactant_required: "Surfactant Administered", surfactant_indication: "Surfactant Indication",
    surfactant_method: "Surfactant Method", surfactant_brand: "Surfactant Brand",
    premedication_given: "Premedication Given",
    premedication_drugs: "Premedication Drugs",
    premedication_other: "Premedication Other",
    surfactant_brand_other: "Brand Name", surfactant_dose: "Surfactant Dose",
    cpap_cm: "MAP", fio2_percent: "FiO₂ at Administration",
    adverse_effects: "Adverse Effects", adverse_type: "Adverse Effect Type",
    adverse_type_other: "Adverse Effect — Specify",
    lisa_catheter_type: "LISA Catheter Type", device_assistance: "Device Assistance",
    device_type: "Device Type", device_type_other: "Device Type — Specify",
    early_cpap: "Early / DR-CPAP", humidified_gas: "Humidified Gas",
    intubation_after_resus: "Intubation After Resuscitation",
    max_fio2_1hr: "Maximum FiO₂ in First Hour",
    caffeine_loading: "Loading Dose of Caffeine",
    caffeine_loading_abs: "Caffeine Loading Dose",
    caffeine_maint_abs: "Caffeine Maintenance Dose",
    caffeine_date: "Caffeine Administration Date",
    immediate_kmc: "Immediate KMC",
    completed_by: "Completed By",
    date: "Completion Date",
  };

  /* ════════════════ RENDER ════════════════ */
  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
          </svg>
          You are offline — changes will auto-save when connection returns.
        </div>
      )}

      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode Active — changes will be saved when you click Save
        </div>
      )}

      {/* ── Error Summary (on save attempt) ── */}
      {submitErrors.length > 0 && (
        <div className="fv-summary" ref={firstErrRef}>
          <div className="fv-summary__title">
            <AlertCircle size={16} /> Please correct the following issues:
          </div>
          <ul className="fv-summary__list">
            {submitErrors.map(({ field, msg }) => (
              <li key={field}>
                <strong>{FIELD_LABELS[field] || field}:</strong> {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="screening-form"
        onSubmit={handleSubmit}
      >
        <fieldset>
          <div className="form-inner">

            {/* HEADER */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={12} /> FORM D</div>
                <h2 className="form-main-title">Postnatal Day 1</h2>
                <p className="form-main-subtitle">Day 1 of Postnatal Life — Early Clinical Assessment</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && <button type="button" className="btn-print-form" onClick={() => window.print()}>🖨️ Print</button>}
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

            {/* ═══ CARD 1 — IDENTIFICATION ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><User size={18} className="section-header-icon" /><h3>D1 · Identification</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>1. Enrollment ID</label>
                    <input value={formData.enrollment_id || "—"} readOnly className="readonly-input" />
                  </div>
                  {formData.site_name === "PGIMER" && (
                    <div className="form-group">
                      <label>2. Annual Number <span className="field-note">(auto)</span></label>
                      <input value={formData.annual_number || ""} readOnly className="readonly-input" />
                    </div>
                  )}
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>3. Baby's UID <span className="field-note">(auto)</span></label>
                    <input value={formData.baby_uid || ""} readOnly className="readonly-input" />
                  </div>
                  <div className="form-group">
                    <label>4. Birth Weight</label>
                    <div style={{ position:"relative" }}>
                      <input value={formData.birth_weight || ""} readOnly className="readonly-input" style={{ paddingRight:52 }} />
                      <span style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#64748b",fontWeight:600 }}>grams</span>
                    </div>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>5. Gestational Age by</label>
                    <SegmentedToggle name="ga_method" value={formData.ga_method}
                      options={["USG","LMP","NBS"]}
                      onChange={(n,v) => { touch(n); setFormData(p => ({ ...p, [n]: v })); }}
                      disabled={!isFieldEditable}/>
                    <div className="form-grid-2" style={{ marginTop: 8 }}>
                      <FieldWrap name="gestation_weeks"
                        formData={formData} touched={touched}
                        label="Weeks" required={isRequired("gestation_weeks")}>
                        <input type="number" name="gestation_weeks" value={formData.gestation_weeks || ""}
                          min="18" max="42" readOnly={!isFieldEditable}
                          className={`emr-input${vr("gestation_weeks")?.level === "error" ? " fv-input-error" : vr("gestation_weeks")?.level === "ok" ? " fv-input-ok" : ""}`}
                          onChange={e => {
                            touch("gestation_weeks");
                            const v = e.target.value;
                            if (v === "" || (/^\d{0,2}$/.test(v) && Number(v) <= 42)) {
                              setFormData(p => ({ ...p, gestation_weeks: v }));
                            }
                          }} />
                      </FieldWrap>
                      <FieldWrap name="gestation_days"
                        formData={formData} touched={touched}
                        label="Days" required={isRequired("gestation_days")}>
                        <input type="number" name="gestation_days" value={formData.gestation_days || ""}
                          min="0" max="6" readOnly={!isFieldEditable}
                          className={`emr-input${vr("gestation_days")?.level === "error" ? " fv-input-error" : vr("gestation_days")?.level === "ok" ? " fv-input-ok" : ""}`}
                          onChange={e => {
                            touch("gestation_days");
                            const v = e.target.value;
                            if (v === "" || (/^\d$/.test(v) && Number(v) <= 6)) {
                              setFormData(p => ({ ...p, gestation_days: v }));
                            }
                          }} />
                      </FieldWrap>
                    </div>
                    {formData.ga_method === "NBS" && (() => {
                      const original = totalGestationDays(formData.original_gestation_weeks, formData.original_gestation_days);
                      const entered = totalGestationDays(formData.gestation_weeks, formData.gestation_days);
                      if (original === null || entered === null || Math.abs(entered - original) <= 14) return null;
                      return (
                        <div className="fv-msg fv-msg-warn" style={{ marginTop: 8 }}>
                          Difference is more than 2 weeks from previous GA. This NBS GA will auto-fill subsequent forms.
                        </div>
                      );
                    })()}
                  </div>
                  <div className="form-group">
                    <label>6. Gender</label>
                    <SegmentedToggle name="gender" value={formData.gender}
                      options={["Male","Female","DSD"]}
                      onChange={(n,v) => { touch(n); setFormData(p => ({ ...p, [n]: v })); }}
                      disabled={!isFieldEditable}/>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>7. Intra-uterine Growth Status</label>
                    <SegmentedToggle name="growth_status" value={formData.growth_status}
                      options={["SGA","AGA","LGA"]}
                      onChange={(n,v) => { touch(n); setFormData(p => ({ ...p, growth_status: v, sga_centile: v !== "SGA" ? "" : formData.sga_centile })); }}
                      disabled={!isFieldEditable}/>
                  </div>
                  {formData.growth_status === "SGA" && (
                    <div className="form-group">
                      <label>8. If SGA</label>
                      <SegmentedToggle name="sga_centile" value={formData.sga_centile}
                        options={[{label:"< 10th centile", value:"<10th"},{label:"< 3rd centile", value:"<3rd"}]}
                        onChange={(n,v) => { touch(n); setFormData(p => ({ ...p, [n]: v })); }}
                        disabled={!isFieldEditable}/>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ═══ CARD 2 — GOLDEN HOUR ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><Baby size={18} className="section-header-icon" /><h3>D2 · Golden Hour</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <FieldWrap name="plastic_wrap"
                    formData={formData} touched={touched}
                    label="9. Plastic wrap / bag at birth" required={isRequired("plastic_wrap")}>
                    <SegmentedToggle name="plastic_wrap" value={formData.plastic_wrap}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} />
                  </FieldWrap>
                  <FieldWrap name="et_intubation"
                    formData={formData} touched={touched}
                    label="10. ET intubation for resuscitation" required={isRequired("et_intubation")}>
                    <SegmentedToggle name="et_intubation" value={formData.et_intubation}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} />
                  </FieldWrap>
                </div>
                <div className="form-grid-2">
                  {formData.et_intubation === "Yes" && (
                    <FieldWrap name="remained_intubated"
                    formData={formData} touched={touched}
                      label="11. Remained intubated after resuscitation" required={isRequired("remained_intubated")}>
                      <SegmentedToggle name="remained_intubated" value={formData.remained_intubated}
                        options={["Yes","No"]} onChange={handleToggle}
                        disabled={!isFieldEditable} />
                    </FieldWrap>
                  )}
                  <FieldWrap name="labored_breathing"
                    formData={formData} touched={touched}
                    label="12. Labored breathing after resuscitation" required={isRequired("labored_breathing")}>
                    <SegmentedToggle name="labored_breathing" value={formData.labored_breathing}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} />
                  </FieldWrap>
                </div>
              </div>
            </div>

            {/* ═══ CARD 3 — SURFACTANT ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><Droplets size={18} className="section-header-icon" /><h3>D3 · Surfactant Administration</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <FieldWrap name="surfactant_required"
                    formData={formData} touched={touched}
                    label="13. Surfactant Administered" required>
                    <SegmentedToggle name="surfactant_required" value={formData.surfactant_required}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} />
                  </FieldWrap>
                  <div />
                </div>

                {formData.surfactant_required === "Yes" && (
                  <div className="followup-box">

                    {/* ── Row 1: Indication ── */}
                    <div className="obstetric-subcard">
                      <div className="obstetric-subcard__title">Indication</div>
                      <FieldWrap name="surfactant_indication"
                    formData={formData} touched={touched}
                        label="14. Indication for surfactant" required={isRequired("surfactant_indication")}>
                        <SegmentedToggle name="surfactant_indication" value={formData.surfactant_indication}
                          options={[
                            { label: "FiO₂ & pressure based", value: "FiO2 & pressure based" },
                            { label: "LUS based",              value: "LUS based" },
                            { label: "Both",                   value: "Both" },
                          ]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </FieldWrap>
                    </div>

                    {/* ── Row 2: Pressure + FiO₂ (side by side like CRF) ── */}
                    <div className="obstetric-subcard">
                      <div className="obstetric-subcard__title">Administration Parameters</div>
                      <div className="form-grid-2">
                        <FieldWrap name="cpap_cm"
                    formData={formData} touched={touched}
                          label="15. Pressure (MAP/CPAP)" required={isRequired("cpap_cm")}>
                          <UnitInput name="cpap_cm" value={formData.cpap_cm} unit="cmH₂O"
                            readOnly={!isFieldEditable}
                            error={vr("cpap_cm")?.level === "error"}
                            warn={vr("cpap_cm")?.level === "warn"}
                            onChange={e => {
                              touch("cpap_cm");
                              const v = e.target.value;
                              if (v === "" || (/^\d+$/.test(v) && Number(v) <= 20))
                                setFormData(p => ({ ...p, cpap_cm: v }));
                            }}
                            onBlur={e => {
                              touch("cpap_cm");
                              let v = Number(e.target.value);
                              if (v > 20) v = 20; if (v < 0) v = 0;
                              setFormData(p => ({ ...p, cpap_cm: v }));
                            }} />
                        </FieldWrap>
                        <FieldWrap name="fio2_percent"
                    formData={formData} touched={touched}
                          label="16. FiO₂ at administration" required={isRequired("fio2_percent")}>
                          <UnitInput name="fio2_percent" value={formData.fio2_percent} unit="%"
                            readOnly={!isFieldEditable}
                            error={vr("fio2_percent")?.level === "error"}
                            warn={vr("fio2_percent")?.level === "warn"}
                            onChange={e => {
                              touch("fio2_percent");
                              const v = e.target.value;
                              if (v === "" || (/^\d+$/.test(v) && Number(v) <= 100))
                                setFormData(p => ({ ...p, fio2_percent: v }));
                            }}
                            onBlur={e => {
                              touch("fio2_percent");
                              let v = Number(e.target.value);
                              if (v > 100) v = 100; if (v < 0) v = 0;
                              setFormData(p => ({ ...p, fio2_percent: v }));
                            }} />
                        </FieldWrap>
                      </div>
                    </div>

                    {/* ── Row 3: Brand + Dose (side by side like CRF) ── */}
                    <div className="obstetric-subcard">
                      <div className="obstetric-subcard__title">Surfactant Details</div>
                      <div className="form-grid-2">
                        <FieldWrap name="surfactant_brand"
                    formData={formData} touched={touched}
                          label="17. Brand" required={isRequired("surfactant_brand")}>
                          <div className="rx-horizontal-group">
                            {["Survanta","Curosurf","Neosurf","Other"].map(brand => (
                              <button key={brand} type="button"
                                className={`rx-horizontal-btn${formData.surfactant_brand === brand ? " active" : ""}`}
                                onClick={() => { if (!isFieldEditable) return; touch("surfactant_brand"); setFormData(p => ({ ...p, surfactant_brand: brand })); }}
                                disabled={!isFieldEditable}>{brand}</button>
                            ))}
                          </div>
                          {formData.surfactant_brand === "Other" && (
                            <div style={{ marginTop:8 }}>
                              <FieldWrap name="surfactant_brand_other"
                    formData={formData} touched={touched}
                                label="Specify brand" required={isRequired("surfactant_brand_other")}>
                                <input type="text" name="surfactant_brand_other"
                                  value={formData.surfactant_brand_other || ""}
                                  readOnly={!isFieldEditable}
                                  className={`emr-input${vr("surfactant_brand_other")?.level === "error" ? " fv-input-error" : vr("surfactant_brand_other")?.level === "ok" ? " fv-input-ok" : ""}`}
                                  onChange={e => { touch("surfactant_brand_other"); const v = e.target.value; if (/^[A-Za-z\s]*$/.test(v)) setFormData(p => ({ ...p, surfactant_brand_other: v })); }}
                                  placeholder="Enter brand name" />
                              </FieldWrap>
                            </div>
                          )}
                        </FieldWrap>
                        <FieldWrap name="surfactant_dose"
                    formData={formData} touched={touched}
                          label="18. Dose" required={isRequired("surfactant_dose")}>
                          <UnitInput name="surfactant_dose" value={formData.surfactant_dose} unit="mg/kg"
                            readOnly={!isFieldEditable}
                            error={vr("surfactant_dose")?.level === "error"}
                            warn={vr("surfactant_dose")?.level === "warn"}
                            onChange={e => { touch("surfactant_dose"); handleChange(e); }} />
                        </FieldWrap>
                      </div>
                    </div>

                    {/* ── Row 4: Method of administration ── */}
                    <div className="obstetric-subcard">
                      <div className="obstetric-subcard__title">Method of Administration</div>
                      <FieldWrap name="surfactant_method"
                    formData={formData} touched={touched}
                        label="19. Method of administration" required={isRequired("surfactant_method")}>
                        <SegmentedToggle name="surfactant_method" value={formData.surfactant_method}
                          options={["InSurE","LISA","Remained intubated"]}
                          onChange={handleToggle} disabled={!isFieldEditable} />
                      </FieldWrap>
                    </div>

                    {/* ── Row 5: If LISA — Catheter type (from CRF: Infant feeding tube / LISA catheter / Other) ── */}
                    {formData.surfactant_method === "InSurE" && (
                      <div className="obstetric-subcard">
                        <div className="obstetric-subcard__title">InSurE Premedication</div>
                        <FieldWrap name="premedication_given"
                    formData={formData} touched={touched}
                          label="20. If InSurE, premedication given" required={isRequired("premedication_given")}>
                          <SegmentedToggle name="premedication_given" value={formData.premedication_given}
                            options={["Yes","No"]}
                            onChange={handleToggle} disabled={!isFieldEditable} />
                        </FieldWrap>
                        {formData.premedication_given === "Yes" && (
                          <div style={{ marginTop:12 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:"#475569", marginBottom:8 }}>
                              21. Drugs used <span style={{ fontSize:11, fontWeight:400, color:"#94a3b8" }}>(select all that apply)</span>
                              {isRequired("premedication_drugs") && <span className="required"> *</span>}
                            </div>
                            <div className="rx-horizontal-group" style={{ flexWrap:"wrap", gap: 8 }}>
                              {["Atropine","Morphine","Others"].map(drug => {
                                const selected = formData.premedication_drugs?.split(",").map(s => s.trim()).includes(drug);
                                return (
                                  <button key={drug} type="button"
                                    className={`rx-horizontal-btn${selected ? " active" : ""}`}
                                    onClick={() => {
                                      if (!isFieldEditable) return;
                                      touch("premedication_drugs");
                                      setFormData(p => ({ ...p, premedication_drugs: toggleListValue(p.premedication_drugs, drug) }));
                                    }}
                                    disabled={!isFieldEditable}>{drug}</button>
                                );
                              })}
                            </div>
                            {touched.premedication_drugs && vr("premedication_drugs")?.level === "error" && (
                              <div className="fv-msg fv-msg-error">{vr("premedication_drugs").msg}</div>
                            )}
                            {formData.premedication_drugs?.split(",").map(s => s.trim()).includes("Others") && (
                              <div style={{ marginTop:10 }}>
                                <FieldWrap name="premedication_other"
                    formData={formData} touched={touched}
                                  label="Specify other drug" required={isRequired("premedication_other")}>
                                  <input type="text" name="premedication_other"
                                    value={formData.premedication_other || ""}
                                    readOnly={!isFieldEditable}
                                    className={`emr-input${vr("premedication_other")?.level === "error" ? " fv-input-error" : vr("premedication_other")?.level === "ok" ? " fv-input-ok" : ""}`}
                                    onChange={e => { touch("premedication_other"); const v = e.target.value; if (/^[A-Za-z\s]*$/.test(v)) setFormData(p => ({ ...p, premedication_other: v })); }}
                                    placeholder="Enter other drug" />
                                </FieldWrap>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {formData.surfactant_method === "LISA" && (
                      <div className="obstetric-subcard">
                        <div className="obstetric-subcard__title">LISA Details</div>
                        <FieldWrap name="lisa_catheter_type"
                    formData={formData} touched={touched}
                          label="22. If LISA — Catheter type" required={isRequired("lisa_catheter_type")}>
                          <SegmentedToggle name="lisa_catheter_type" value={formData.lisa_catheter_type}
                            options={["Infant feeding tube","LISA catheter","Other"]}
                            onChange={handleToggle} disabled={!isFieldEditable} />
                        </FieldWrap>

                        {/* ── Row 6: Device assistance + Type (FOL / VL / Magill / Other) ── */}
                        <div style={{ marginTop:14 }}>
                          <FieldWrap name="device_assistance"
                    formData={formData} touched={touched}
                            label="23. Device assistance" required={isRequired("device_assistance")}>
                            <SegmentedToggle name="device_assistance" value={formData.device_assistance}
                              options={["Yes","No"]}
                              onChange={handleToggle} disabled={!isFieldEditable} />
                          </FieldWrap>
                          {formData.device_assistance === "Yes" && (
                            <div style={{ marginTop:10 }}>
                              <FieldWrap name="device_type"
                    formData={formData} touched={touched}
                                label="24. Type" required={isRequired("device_type")}>
                                <SegmentedToggle name="device_type" value={formData.device_type}
                                  options={["FOL","VL","Magill","Other"]}
                                  onChange={handleToggle} disabled={!isFieldEditable} />
                              </FieldWrap>
                              {formData.device_type === "Other" && (
                                <div style={{ marginTop:8 }}>
                                  <FieldWrap name="device_type_other"
                    formData={formData} touched={touched}
                                    label="Specify device type" required={isRequired("device_type_other")}>
                                    <input type="text" name="device_type_other"
                                      value={formData.device_type_other || ""}
                                      readOnly={!isFieldEditable}
                                      className={`emr-input${vr("device_type_other")?.level === "error" ? " fv-input-error" : vr("device_type_other")?.level === "ok" ? " fv-input-ok" : ""}`}
                                      onChange={e => { touch("device_type_other"); const v = e.target.value; if (/^[A-Za-z\s]*$/.test(v)) setFormData(p => ({ ...p, device_type_other: v })); }}
                                      placeholder="Enter device type" />
                                  </FieldWrap>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Row 7: Adverse Effects — matches CRF exactly ── */}
                    <div className="obstetric-subcard">
                      <div className="obstetric-subcard__title">Adverse Effects</div>
                      <FieldWrap name="adverse_effects"
                    formData={formData} touched={touched}
                        label="25. Adverse effects" required={isRequired("adverse_effects")}>
                        <SegmentedToggle name="adverse_effects" value={formData.adverse_effects}
                          options={["Yes","No"]} onChange={handleToggle}
                          disabled={!isFieldEditable} />
                      </FieldWrap>
                      {formData.adverse_effects === "Yes" && (
                        <div style={{ marginTop:12 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"#475569", marginBottom:8 }}>
                            26. Type <span style={{ fontSize:11, fontWeight:400, color:"#94a3b8" }}>(select all that apply)</span>
                            {isRequired("adverse_type") && <span className="required"> *</span>}
                          </div>
                          {/* CRF adverse types: Bradycardia, Desaturation, Regurgitation of surfactant,
                              Asymmetric surfactant instillation, Other */}
                          <div className="rx-horizontal-group" style={{ flexWrap:"wrap", gap: 8 }}>
                            {[
                              "Bradycardia",
                              "Desaturation",
                              "Regurgitation of surfactant",
                              "Asymmetric surfactant instillation",
                              "Other",
                            ].map(type => (
                              <button key={type} type="button"
                                className={`rx-horizontal-btn${formData.adverse_type === type ? " active" : ""}`}
                                style={{ whiteSpace: "normal", textAlign: "center", minWidth: 80, height: "auto", minHeight: 36, lineHeight: 1.3, padding: "6px 14px" }}
                                onClick={() => { if (!isFieldEditable) return; touch("adverse_type"); setFormData(p => ({ ...p, adverse_type: type })); }}
                                disabled={!isFieldEditable}>{type}</button>
                            ))}
                          </div>
                          {touched.adverse_type && vr("adverse_type")?.level === "error" && (
                            <div className="fv-msg fv-msg-error">{vr("adverse_type").msg}</div>
                          )}
                          {formData.adverse_type === "Other" && (
                            <div style={{ marginTop:10 }}>
                              <FieldWrap name="adverse_type_other"
                    formData={formData} touched={touched}
                                label="Specify adverse effect" required={isRequired("adverse_type_other")}>
                                <input type="text" name="adverse_type_other"
                                  value={formData.adverse_type_other || ""}
                                  readOnly={!isFieldEditable}
                                  className={`emr-input${vr("adverse_type_other")?.level === "error" ? " fv-input-error" : vr("adverse_type_other")?.level === "ok" ? " fv-input-ok" : ""}`}
                                  onChange={e => { touch("adverse_type_other"); const v = e.target.value; if (/^[A-Za-z\s]*$/.test(v)) setFormData(p => ({ ...p, adverse_type_other: v })); }}
                                  placeholder="Enter adverse effect" />
                              </FieldWrap>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>

            {/* ═══ CARD 4 — EARLY RESPIRATORY SUPPORT ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><Wind size={18} className="section-header-icon" /><h3>D4 · Early Respiratory Support</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <FieldWrap name="early_cpap"
                    formData={formData} touched={touched}
                    label="27. Early / DR-CPAP" required>
                    <SegmentedToggle name="early_cpap" value={formData.early_cpap}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} />
                  </FieldWrap>
                  <FieldWrap name="humidified_gas"
                    formData={formData} touched={touched}
                    label="28. Humidified gas with CPAP" required>
                    <SegmentedToggle name="humidified_gas" value={formData.humidified_gas}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} />
                  </FieldWrap>
                </div>
                <div className="form-grid-2">
                  <FieldWrap name="max_fio2_1hr"
                    formData={formData} touched={touched}
                    label="29. Maximum FiO₂ in first hour after stopping Trial Blender" required>
                    <UnitInput name="max_fio2_1hr" value={formData.max_fio2_1hr} unit="%"
                      readOnly={!isFieldEditable}
                      error={vr("max_fio2_1hr")?.level === "error"}
                      warn={vr("max_fio2_1hr")?.level === "warn"}
                      onChange={e => {
                        touch("max_fio2_1hr");
                        const v = e.target.value;
                        if (v === "" || (/^\d+$/.test(v) && Number(v) <= 100))
                          setFormData(p => ({ ...p, max_fio2_1hr: v }));
                      }}
                      onBlur={e => {
                        touch("max_fio2_1hr");
                        let v = Number(e.target.value);
                        if (v > 100) v = 100; if (v < 0) v = 0;
                        setFormData(p => ({ ...p, max_fio2_1hr: v }));
                      }} />
                  </FieldWrap>
                  <FieldWrap name="intubation_after_resus"
                    formData={formData} touched={touched}
                    label="30. Required intubation after resuscitation" required>
                    <SegmentedToggle name="intubation_after_resus" value={formData.intubation_after_resus}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} />
                  </FieldWrap>
                </div>

                {/* Caffeine Card */}
                <div className="obstetric-subcard" style={{ marginTop:16 }}>
                  <div className="obstetric-subcard__title">Caffeine Therapy</div>
                  <div className="form-grid-2">
                    <FieldWrap name="caffeine_loading"
                    formData={formData} touched={touched}
                      label="31. Loading Dose of Caffeine" required>
                      <SegmentedToggle name="caffeine_loading" value={formData.caffeine_loading}
                        options={["Yes","No"]} onChange={handleToggle}
                        disabled={!isFieldEditable} />
                    </FieldWrap>
                    <div />
                  </div>
                  {formData.caffeine_loading === "Yes" && (
                    <>
                    <div className="form-grid-2" style={{ marginTop:12 }}>
                      <FieldWrap name="caffeine_loading_abs"
                    formData={formData} touched={touched}
                        label="31. Absolute Loading Dose (mg)" required={isRequired("caffeine_loading_abs")}>
                        <UnitInput name="caffeine_loading_abs" value={formData.caffeine_loading_abs} unit="mg"
                          readOnly={!isFieldEditable}
                          error={vr("caffeine_loading_abs")?.level === "error"}
                          warn={vr("caffeine_loading_abs")?.level === "warn"}
                          onChange={e => { touch("caffeine_loading_abs"); handleChange(e); }} />
                      </FieldWrap>
                      <div className="form-group">
                        <label>32. Loading Dose <span className="auto-tag">AUTO</span></label>
                        <div style={{ position:"relative" }}>
                          <input value={
                              formData.caffeine_loading_abs && formData.birth_weight
                                ? (formData.caffeine_loading_abs / (formData.birth_weight / 1000)).toFixed(2) : ""
                            } readOnly className="readonly-input" style={{ paddingRight:52 }} />
                          <span style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#94a3b8",fontWeight:600 }}>mg/kg</span>
                        </div>
                      </div>
                    </div>
                    <div className="form-grid-2" style={{ marginTop:12 }}>
                      <FieldWrap name="caffeine_date"
                    formData={formData} touched={touched} label="33. Date of Administration" required={isRequired("caffeine_date")}>
                        <DatePicker
                          selected={formData.caffeine_date ? parseDateOnly(formData.caffeine_date) : null}
                          onChange={date => {
                            touch("caffeine_date");
                            setFormData(p => ({ ...p, caffeine_date: date ? toDateOnlyValue(date) : "" }));
                          }}
                          maxDate={new Date()}
                          dateFormat="dd-MM-yyyy" placeholderText="Select date"
                          readOnly={!isFieldEditable} />
                      </FieldWrap>
                      <div className="form-group">
                        <label>Administration Time</label>
                        <input type="time" name="caffeine_time"
                          value={formData.caffeine_time || ""}
                          onChange={handleChange} readOnly={!isFieldEditable}
                          className="emr-input" />
                      </div>
                    </div>
                    </>
                  )}
                  {formData.caffeine_loading === "Yes" && (
                  <div style={{ borderTop:"1px solid #e2e8f0", marginTop:16, paddingTop:16 }}>
                    <div style={{ fontSize:11,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",color:"#94a3b8",marginBottom:12 }}>
                      Maintenance Dose
                    </div>
                    <div className="form-grid-2">
                      <FieldWrap name="caffeine_maint_abs"
                    formData={formData} touched={touched}
                        label="34. If loading dose is given, maintenance dose of caffeine: absolute dose" required={isRequired("caffeine_maint_abs")}>
                        <UnitInput name="caffeine_maint_abs" value={formData.caffeine_maint_abs} unit="mg"
                          readOnly={!isFieldEditable}
                          error={vr("caffeine_maint_abs")?.level === "error"}
                          warn={vr("caffeine_maint_abs")?.level === "warn"}
                          onChange={e => { touch("caffeine_maint_abs"); handleChange(e); }} />
                      </FieldWrap>
                      <div className="form-group">
                        <label>35. Maintenance Dose <span className="auto-tag">AUTO</span></label>
                        <div style={{ position:"relative" }}>
                          <input value={
                              formData.caffeine_maint_abs && formData.birth_weight
                                ? (formData.caffeine_maint_abs / (formData.birth_weight / 1000)).toFixed(2) : ""
                            } readOnly className="readonly-input" style={{ paddingRight:52 }} />
                          <span style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#94a3b8",fontWeight:600 }}>mg/kg</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
                {/* Field 35 — Immediate KMC */}
                <div className="obstetric-subcard" style={{ marginTop:16 }}>
                  <div className="obstetric-subcard__title">Kangaroo Mother Care</div>
                  <div className="form-grid-2">
                    <FieldWrap name="immediate_kmc"
                    formData={formData} touched={touched}
                      label="36. Immediate KMC" required={true}>
                      <SegmentedToggle name="immediate_kmc" value={formData.immediate_kmc}
                        options={["Yes","No"]} onChange={handleToggle}
                        disabled={!isFieldEditable} />
                    </FieldWrap>
                    <div/>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ CARD 5 — COMPLETION ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><CheckSquare size={18} className="section-header-icon" /><h3>Completion Details</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <FieldWrap name="completed_by"
                    formData={formData} touched={touched}
                    label="Completed by" required>
                    <select name="completed_by" value={formData.completed_by || ""}
                      onChange={handleCompletedByChange} disabled={!isFieldEditable}
                      className={`emr-select${vr("completed_by")?.level === "error" ? " fv-input-error" : vr("completed_by")?.level === "ok" ? " fv-input-ok" : ""}`}
                      required>
                      <option value="">-- Select Nurse --</option>
                      {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </FieldWrap>
                  <div className="form-group">
                    <label>Designation</label>
                    <input name="designation" value={formData.designation || ""}
                      readOnly className="readonly-input" placeholder="Auto-filled" />
                  </div>
                </div>
                <div className="form-grid-2">
                  <FieldWrap name="date"
                    formData={formData} touched={touched} label="Date (DD/MM/YY)" required={isRequired("date")}>
                    <DatePicker
                      selected={formData.date ? parseDateOnly(formData.date) : null}
                      onChange={date => {
                        touch("date");
                        setFormData(p => ({ ...p, date: date ? toDateOnlyValue(date) : "" }));
                      }}
                      maxDate={new Date()}
                      dateFormat="dd-MM-yyyy" placeholderText="Select date"
                      readOnly={!isFieldEditable} />
                  </FieldWrap>
                  <div />
                </div>
              </div>
            </div>

            <NotesBox formKey={`form_d_${formData.enrollment_id || "new"}`}/>

            {message && (
              <div className={`form-message${message.startsWith("✅") ? " form-message--success" : " form-message--error"}`}>
                {message}
              </div>
            )}
          </div>
        </fieldset>
      </form>

      {/* STICKY FOOTER */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Maternal Details
        </button>
        <button type="button"
          className={`btn btn-save btn-outline-blue${hasErrors && Object.keys(touched).length > 0 ? " btn-disabled-hint" : ""}`}
          onClick={handleSubmit}
          title={hasErrors ? "Complete required fields to save" : "Save form"}>
          <Save size={15} /> Save
        </button>
        <button type="button" className="btn btn-draft" onClick={saveForLater}>
          <Save size={15} /> Save for Later
        </button>

        {/* Auto-save indicator */}
        <div className="autosave-indicator">
          {lastSaved && autoSaveStatus === "idle" && (
            <span className="last-saved-txt">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Saved {relT(lastSaved)}
            </span>
          )}
          {isDirty && autoSaveStatus === "idle" && !lastSaved && (
            <span className="unsaved-dot-pill"><span className="unsaved-dot"/>Unsaved changes</span>
          )}
          {autoSaveStatus === "saving" && (
            <span className="autosave-pill autosave-pill--saving">
              <span className="autosave-dot autosave-dot--spin"/>Auto-saving…
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="autosave-pill autosave-pill--saved">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Auto-saved
            </span>
          )}
          {autoSaveStatus === "error" && (
            <span className="autosave-pill autosave-pill--error">Auto-save failed</span>
          )}
        </div>
        <div className="footer-step-indicator">
          <span className="step-text">STEP 4 OF 17</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment" />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleNext} disabled={!isSaved}>
          NICU Admission <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
