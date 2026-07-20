import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormA.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import NotesBox from "./components/NotesBox";
import { relativeTime, toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import {
  ArrowLeft, ArrowRight, Save, Home, User, Baby,
  Heart, Activity, BarChart2, Droplets, AlertTriangle, Shuffle,
} from "lucide-react";

/* ── Safe localStorage helpers ──
   localStorage.setItem coerces its value with String(), so
   localStorage.setItem(key, undefined) silently stores the literal
   string "undefined" — which then reads back as truthy and causes
   requests like PUT /birth-resuscitation/undefined. These helpers
   guard against writing a non-value and against trusting a
   previously-corrupted "undefined"/"null" string on read. */
const getStoredId = (key) => {
  const v = localStorage.getItem(key);
  return v && v !== "undefined" && v !== "null" ? v : null;
};
const setStoredId = (key, value) => {
  if (value !== undefined && value !== null) localStorage.setItem(key, value);
};

/* ── Inline SVG icon ── */
const Ic = ({ d, s = 15 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);

/* ── Yes/No toggle identical to Form A ── */
function YesNoToggle({ label, name, value, onChange, disabled = false }) {
  const fire = v => { if (!disabled) onChange({ target: { name, value: v } }); };
  return (
    <div className={`yes-no-toggle${disabled ? " yn-disabled" : ""}`}>
      <span className="yes-no-label">{label}</span>
      <div className="yes-no-buttons">
        <button type="button" className={`yn-btn${value==="Yes"?" yn-active-yes":""}`}
          onClick={() => fire("Yes")} disabled={disabled}>YES</button>
        <button type="button" className={`yn-btn${value==="No"?" yn-active-no":""}`}
          onClick={() => fire("No")} disabled={disabled}>NO</button>
      </div>
    </div>
  );
}

/* ── Intervention select cell ── */
function IntvCell({ value, disabled, onChange }) {
  return (
    <select value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)}
      style={{ width:54, padding:"4px 2px", fontSize:11, borderRadius:5,
               border:"1px solid #e5e7eb", textAlign:"center", fontFamily:"inherit" }}>
      <option value="">—</option>
      <option value="Yes">Y</option>
      <option value="No">N</option>
      <option value="NR">NR</option>
    </select>
  );
}

export default function BirthResuscitationForm() {
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { screeningId } = useParams();
  const { updatePatientData } = usePatient();

  /* ── State ── */
  const [errors,           setErrors]           = useState({});
  const [isSaved,          setIsSaved]          = useState(false);
  const [isEditing,        setIsEditing]        = useState(false);
  const [isFormBLoaded,    setIsFormBLoaded]    = useState(false);
  const [message,          setMessage]          = useState("");
  const [missingFields,    setMissingFields]    = useState([]);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [autoSaveStatus,   setAutoSaveStatus]   = useState("idle");
  const [lastSaved,        setLastSaved]        = useState(null);
  const [isDirty,          setIsDirty]          = useState(false);
  const [isOnline,         setIsOnline]         = useState(navigator.onLine);
  const [offlineQueue,    setOfflineQueue]     = useState(false);
  const [showDraftModal,  setShowDraftModal]   = useState(false);
  const [siteName,        setSiteName]          = useState("");
  const autoSaveTimer   = useRef(null);
  const lastSavedTimer = useRef(null);
  const isInitialRender = useRef(true);
  const formDataRef = useRef(null);
  const buildPayloadRef = useRef(null);
  const isFormBLoadedRef = useRef(false);
  const autoSaveRef = useRef(null);
  const offlineQueueRef = useRef(false);
  const isFieldEditable = !isSaved || isEditing;
  const isPgiSite = siteName === "PGIMER";
  const requiredMark = <span className="required">*</span>;
  const BABY_ADMISSION_RULES = {
    PGIMER: { label: "6. Baby Admission No.", placeholder: "10-digit admission number", min: 10, max: 10, required: true },
    "GMCH-A": { label: "6. MRD Number for Baby", placeholder: "4-6 digit MRD number", min: 4, max: 6 },
    AMC: { label: "6. Baby Admission No. (NICU only)", placeholder: "11-digit admission number if NICU admitted", min: 11, max: 11 },
    GMCH: { label: "6. Baby Admission No.", placeholder: "9-11 digit number", min: 9, max: 11 },
    IOG: { label: "6. Baby MRD No. (same as UID)", placeholder: "Auto-filled from Baby UID, 4-6 digits", min: 4, max: 6 },
  };
  const babyAdmissionRule = BABY_ADMISSION_RULES[siteName] || {
    label: "6. Baby Admission No.",
    placeholder: "Optional",
    min: 0,
    max: 15,
  };
  const babyAdmissionLabel = babyAdmissionRule.required
    ? <>{babyAdmissionRule.label}{requiredMark}</>
    : babyAdmissionRule.label;

  const BLANK = {
    /* B1 */
    screening_id:"", enrollment_id:"", screening_datetime:"",
    mother_name_first:"", mother_name_surname:"", maternal_uid:"",
    contact_mother:"", contact_husband:"",
    baby_uid:"", baby_admission_no:"", baby_annual_no:"",
    /* B2 */
    date_of_birth:"", time_of_birth:"",
    gestation_weeks:"", gestation_days:"",
    gestation_rand_weeks:"", gestation_rand_days:"",  // auto-calc from DOB
    birth_weight:"", intrauterine_centile:"", gender:"",
    delivery_mode:"", vaginal_delivery_type:"", lscs_type:"",
    indication_for_delivery:[], indication_for_delivery_other:"",
    indication_edf_detail:"", fetal_indication_detail:"", obstetric_indication_detail:"",
    maternal_complication:"",
    /* B3 */
    poor_resp_efforts:"", poor_muscle_tone:"", hr_above_100:"",
    initial_steps:"", required_resuscitation:"",
    randomised:"", randomisation_date:"", strata:"",
    enrollment_reason_not_randomized:"", enrollment_reason_not_randomized_other:"",
    /* B4 */
    ppv_required:"",
    // SIB fields
    sib_peep_with:"", sib_peep_cmh2o:"",
    // T-piece fields
    tpiece_pip:"", tpiece_peep:"", tpiece_flow:"",
    interface_used:"", ppv_duration:"", device_ppv:"",
    intubation:"",
    chest_compression:"", cc_duration:"",
    adrenaline:"", adrenaline_dilution:"", adrenaline_route:"",
    med_doses:"", adrenaline_cumulative:"",
    fluid_bolus:"", fluid_bolus_doses:"", fluid_bolus_cumulative:"",
    placental_transfusion:"", transfusion_method:"",
    cord_clamp_timestamp:"", cord_clamp_time:"",
    time_to_respiration:"", respiration_days:"", respiration_hours:"",
    spo2_5min:"", time_to_spo2_80:"",
    /* B7 */
    cord_blood_done:"", cord_blood_within_1hr:"", cord_blood_source:"",
    cord_ph:"", cord_sbe:"", cord_pco2:"",
    resus_failure:"",
    spo2_exit_trial_gas:"", total_resus_time:"",
    reason_exit_trial_gas:"", reason_exit_trial_gas_other:"",
    blender_stopped:"", blender_stopped_description:"",
    /* intervention table */
    interventions:{
      oxygen:{}, ventilation:{}, chest_compression:{},
      intubation:{}, medication:{}, fluid_bolus:{}, cpap:{}, apgar:{},
    },
  };
  const [formData, setFormData] = useState(BLANK);
  const set = patch => setFormData(p => ({ ...p, ...patch }));
  const handleChange = e => set({ [e.target.name]: e.target.value });

  const endParticipation = formData.required_resuscitation === "No";
  const times = ["1","5","10","15","20"];
  const yn  = v => v === "Yes";
  const num = v => v === "" ? 0 : Number(v);
  const optionalNum = v => v === "" || v === null || v === undefined ? null : Number(v);
  const durationToSeconds = value => {
    if (value === "" || value === null || value === undefined) return null;
    const match = String(value).match(/^(\d{1,3}):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };

  useEffect(() => {
    if (siteName === "IOG" && formData.baby_admission_no !== formData.baby_uid) {
      set({ baby_admission_no: formData.baby_uid || "" });
    }
  }, [siteName, formData.baby_uid, formData.baby_admission_no]); // eslint-disable-line
  const secondsToDuration = value => {
    if (value === "" || value === null || value === undefined) return "";
    const total = Number(value);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  /* ── Gestation at randomization (screening GA + elapsed calendar days) ── */
  useEffect(() => {
    if (!formData.date_of_birth || !formData.screening_datetime || !formData.gestation_weeks) return;
    const screeningGA = Number(formData.gestation_weeks) * 7 + Number(formData.gestation_days || 0);
    const screeningDay = new Date(formData.screening_datetime);
    const birthDay = new Date(`${formData.date_of_birth}T00:00:00`);
    screeningDay.setHours(0, 0, 0, 0);
    birthDay.setHours(0, 0, 0, 0);
    const elapsedDays = Math.max(0, Math.round((birthDay - screeningDay) / 86400000));
    const randomisationGA = screeningGA + elapsedDays;
    const randW = Math.floor(randomisationGA / 7);
    const randD = randomisationGA % 7;
    set({ gestation_rand_weeks: randW, gestation_rand_days: randD });
  }, [formData.date_of_birth, formData.screening_datetime, formData.gestation_weeks, formData.gestation_days]); // eslint-disable-line

  /* ── Cord-clamping time in seconds from birth ── */
  useEffect(() => {
    const toSeconds = value => {
      const parts = String(value || "").split(":").map(Number);
      if (parts.length < 2 || parts.some(Number.isNaN)) return null;
      const [hours, minutes, seconds = 0] = parts;
      if (hours > 23 || minutes > 59 || seconds > 59) return null;
      return hours * 3600 + minutes * 60 + seconds;
    };
    const birth = toSeconds(formData.time_of_birth);
    const clamp = toSeconds(formData.cord_clamp_timestamp);
    if (birth === null || clamp === null) return;
    let elapsed = clamp - birth;
    if (elapsed < 0) elapsed += 86400;
    set({ cord_clamp_time: elapsed });
    setErrors(p => ({...p, cord_clamp_time: elapsed > 300 ? "Must be ≤ 300 sec" : ""}));
  }, [formData.time_of_birth, formData.cord_clamp_timestamp]); // eslint-disable-line

  /* ── Sync chest_compression to intervention table ── */
  useEffect(() => {
    const v = formData.chest_compression;
    if (v==="Yes"||v==="No"||v==="")
      setFormData(p => ({...p, interventions:{...p.interventions,
        chest_compression:{"1":v,"5":v,"10":v,"15":v,"20":v}}}));
  }, [formData.chest_compression]);

  /* ── Online / Offline detection ── */
  useEffect(() => {
    const goOnline  = () => {
      setIsOnline(true);
      // If we had a queued save, flush it now (autoSave read via ref to
      // avoid a temporal-dead-zone reference to the const defined below).
      if (offlineQueueRef.current) {
        setOfflineQueue(false);
        autoSaveRef.current?.();
      }
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  /* ── Unsaved changes — warn on tab close / navigate away ── */
  useEffect(() => {
    const handler = e => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* ── Mark form dirty only after user edits (not on initial load) ── */
  useEffect(() => {
    if (!isFormBLoaded) return;
    if (isInitialRender.current) { isInitialRender.current = false; return; }
    setIsDirty(true);
  }, [formData]); // eslint-disable-line

  /* ── Refresh "last saved X mins ago" every 30 seconds ── */
  useEffect(() => {
    lastSavedTimer.current = setInterval(() => {
      // force re-render to update the relative time string
      setLastSaved(prev => prev ? new Date(prev) : prev);
    }, 30000);
    return () => clearInterval(lastSavedTimer.current);
  }, []);

  /* ── Relative time ── */
  const relT = relativeTime;

  /* ── Apgar colour ── */
  const apgarCls = v => {
    if(!v&&v!==0)return""; const n=Number(v);
    if(n<=3)return"apgar-red"; if(n<=6)return"apgar-yellow"; return"apgar-green";
  };

  const handleIntv = (type,time,val) =>
    setFormData(p=>({...p,interventions:{...p.interventions,[type]:{...p.interventions[type],[time]:val}}}));

   /* ── Shared payload builder (used by saveForm, saveDraft, autoSave) ──
      Drafts and auto-saves are just unvalidated saves: empty fields are sent
      as null (all columns are nullable) rather than fabricated sentinel
      values, so partially-filled forms persist without corrupting clinical
      data or tripping the backend range validators. */
  const buildPayloadFrom = useCallback((fd) => {
    return {
      screening_id:        fd.screening_id || null,
      enrollment_id:       fd.enrollment_id || null,
      mother_name_first:   fd.mother_name_first || null,
      mother_name_surname: fd.mother_name_surname || null,
      maternal_uid:        fd.maternal_uid || null,
      contact_mother:      fd.contact_mother || null,
      contact_husband:     fd.contact_husband || null,
      baby_uid:            fd.baby_uid || null,
      baby_admission_no:   fd.baby_admission_no || null,
      baby_annual_no:      fd.baby_annual_no || null,
      gestation_weeks:     optionalNum(fd.gestation_weeks),
      gestation_days:      optionalNum(fd.gestation_days),
      gestation_rand_weeks: optionalNum(fd.gestation_rand_weeks),
      gestation_rand_days: optionalNum(fd.gestation_rand_days),
      birth_weight:        optionalNum(fd.birth_weight),
      intrauterine_centile: fd.intrauterine_centile || null,
      date_of_birth:       fd.date_of_birth
        ? String(fd.date_of_birth).slice(0, 10) : null,
      time_of_birth:       fd.time_of_birth || null,
      gender:              fd.gender || null,
      indication_for_delivery: (fd.indication_for_delivery || []).join(", ") || null,
      indication_for_delivery_other: fd.indication_for_delivery_other || null,
      indication_edf_detail: fd.indication_edf_detail || null,
      fetal_indication_detail: fd.fetal_indication_detail || null,
      obstetric_indication_detail: fd.obstetric_indication_detail || null,
      delivery_mode:       fd.delivery_mode || null,
      vaginal_delivery_type: fd.vaginal_delivery_type || null,
      lscs_type:           fd.lscs_type || null,
      maternal_complication: fd.maternal_complication || null,
      poor_resp_efforts:   yn(fd.poor_resp_efforts),
      poor_muscle_tone:    yn(fd.poor_muscle_tone),
      hr_above_100:        yn(fd.hr_above_100),
      initial_steps:       yn(fd.initial_steps),
      required_resuscitation: yn(fd.required_resuscitation),
      ppv_required:        yn(fd.ppv_required),
      device_ppv:          fd.device_ppv || null,
      sib_peep_with:       fd.sib_peep_with || null,
      sib_peep_cmh2o:      optionalNum(fd.sib_peep_cmh2o),
      tpiece_pip:          optionalNum(fd.tpiece_pip),
      tpiece_peep:         optionalNum(fd.tpiece_peep),
      tpiece_flow:         optionalNum(fd.tpiece_flow),
      interface_used:      fd.interface_used || null,
      intubation:          yn(fd.intubation),
      chest_compression:   yn(fd.chest_compression),
      ppv_duration:        optionalNum(fd.ppv_duration),
      cc_duration:         optionalNum(fd.cc_duration),
      adrenaline:          yn(fd.adrenaline),
      adrenaline_dilution: fd.adrenaline_dilution || null,
      adrenaline_route:    fd.adrenaline_route || null,
      med_doses:           optionalNum(fd.med_doses),
      adrenaline_cumulative: optionalNum(fd.adrenaline_cumulative),
      fluid_bolus:         yn(fd.fluid_bolus),
      fluid_bolus_doses:   optionalNum(fd.fluid_bolus_doses),
      fluid_bolus_cumulative: optionalNum(fd.fluid_bolus_cumulative),
      placental_transfusion: yn(fd.placental_transfusion),
      transfusion_method:  fd.transfusion_method || null,
      cord_clamp_timestamp: fd.cord_clamp_timestamp || null,
      cord_clamp_time:     optionalNum(fd.cord_clamp_time),
      time_to_respiration: durationToSeconds(fd.time_to_respiration),
      respiration_days:   optionalNum(fd.respiration_days),
      respiration_hours:  optionalNum(fd.respiration_hours),
      spo2_5min:           optionalNum(fd.spo2_5min),
      time_to_spo2_80:     durationToSeconds(fd.time_to_spo2_80),
      randomised:          yn(fd.randomised),
      strata:              fd.strata || null,
      randomisation_date:  fd.randomisation_date
        ? String(fd.randomisation_date).slice(0, 10) : null,
      enrollment_reason_not_randomized: fd.enrollment_reason_not_randomized || null,
      enrollment_reason_not_randomized_other: fd.enrollment_reason_not_randomized_other || null,
      resus_failure:       yn(fd.resus_failure),
      cord_blood_done:     yn(fd.cord_blood_done),
      cord_blood_within_1hr: yn(fd.cord_blood_within_1hr),
      cord_blood_source:   fd.cord_blood_source || null,
      cord_ph:             optionalNum(fd.cord_ph),
      cord_sbe:            optionalNum(fd.cord_sbe),
      cord_pco2:           optionalNum(fd.cord_pco2),
      spo2_exit_trial_gas: optionalNum(fd.spo2_exit_trial_gas),
      total_resus_time:    optionalNum(fd.total_resus_time),
      reason_exit_trial_gas: fd.reason_exit_trial_gas==="Other"
        ? fd.reason_exit_trial_gas_other : fd.reason_exit_trial_gas,
      blender_stopped:     yn(fd.blender_stopped),
      blender_stopped_description: fd.blender_stopped_description || null,
      interventions:       fd.interventions || {},
    };
  }, []);

  const buildPayload = useCallback(
    () => buildPayloadFrom(formData),
    [formData, buildPayloadFrom]
  );

  formDataRef.current = formData;
  buildPayloadRef.current = buildPayload;
  isFormBLoadedRef.current = isFormBLoaded;
  offlineQueueRef.current = offlineQueue;

  /* ── Validate ── */
  const validate = () => {
    const m = [];
    const add = (label,field) => m.push({label,fieldName:field});
    if(!formData.baby_uid)           add("B1. Baby UID",              "baby_uid");
    if(babyAdmissionRule.required && !formData.baby_admission_no)
      add("B1. Baby Admission No.", "baby_admission_no");
    if(formData.baby_admission_no && !new RegExp(`^\\d{${babyAdmissionRule.min},${babyAdmissionRule.max}}$`).test(formData.baby_admission_no))
      add(`B1. ${babyAdmissionRule.label.replace(/^6\\.\\s*/, "")} must be ${babyAdmissionRule.min === babyAdmissionRule.max ? `${babyAdmissionRule.max}` : `${babyAdmissionRule.min}-${babyAdmissionRule.max}`} digits`, "baby_admission_no");
    if(!formData.date_of_birth)      add("B2. Date of Birth",         "date_of_birth");
    if(!formData.time_of_birth)      add("B2. Time of Birth",         "time_of_birth");
    if(!formData.birth_weight)       add("B2. Birth Weight",          "birth_weight");
    if(formData.birth_weight && (Number(formData.birth_weight)<300 || Number(formData.birth_weight)>6000))
      add("B2. Birth Weight must be 300–6000 g", "birth_weight");
    if(formData.date_of_birth && new Date(`${formData.date_of_birth}T00:00:00`) > new Date())
      add("B2. Date of Birth cannot be in the future", "date_of_birth");
    if(!formData.gender)             add("B2. Gender",                "gender");
    if(formData.intrauterine_centile!=="" && (Number(formData.intrauterine_centile)<0 || Number(formData.intrauterine_centile)>100))
      add("B2. Intrauterine centile must be 0–100", "intrauterine_centile");
    if(!formData.delivery_mode)      add("B2. Delivery Mode",         "delivery_mode");
    if(formData.delivery_mode==="Vaginal" && !formData.vaginal_delivery_type)
      add("B2. Vaginal Delivery Type", "vaginal_delivery_type");
    if(formData.delivery_mode==="LSCS" && !formData.lscs_type)
      add("B2. LSCS Type", "lscs_type");
    if(!(formData.indication_for_delivery||[]).length)
      add("B2. Indication for Delivery", "indication_for_delivery");
    if((formData.indication_for_delivery||[]).includes("Absent/Reversed EDF") && !formData.indication_edf_detail)
      add("B2. Absent/Reversed EDF Details", "indication_edf_detail");
    if((formData.indication_for_delivery||[]).includes("Fetal indication") && !formData.fetal_indication_detail)
      add("B2. Fetal Indication Details", "fetal_indication_detail");
    if((formData.indication_for_delivery||[]).includes("Obstetric indication") && !formData.obstetric_indication_detail)
      add("B2. Obstetric Indication Details", "obstetric_indication_detail");
    if((formData.indication_for_delivery||[]).includes("Other") && !formData.indication_for_delivery_other)
      add("B2. Other Delivery Indication", "indication_for_delivery_other");
    if(!formData.poor_resp_efforts)  add("B3. Respiratory Effort",    "poor_resp_efforts");
    if(!formData.poor_muscle_tone)   add("B3. Muscle Tone",           "poor_muscle_tone");
    if(!formData.hr_above_100)       add("B3. Heart Rate >100",       "hr_above_100");
    if(!formData.initial_steps)      add("B3. Initial Steps",         "initial_steps");
    if(!formData.required_resuscitation) add("B3. Resuscitation beyond initial steps?", "required_resuscitation");
    if(formData.required_resuscitation==="Yes"){
      if(!formData.randomised)       add("B3. Randomised?",           "randomised");
      if(formData.randomised==="Yes"){
        if(!formData.enrollment_id)  add("B3. Enrollment ID",         "enrollment_id");
        if(!formData.randomisation_date) add("B3. Randomization Date","randomisation_date");
        if(!formData.strata)        add("B3. Strata",                 "strata");
      }
      if(formData.randomised==="No" && !formData.enrollment_reason_not_randomized)
        add("B3. Reason Not Randomized","enrollment_reason_not_randomized");
      if(formData.randomised==="No" && formData.enrollment_reason_not_randomized==="Other" && !formData.enrollment_reason_not_randomized_other)
        add("B3. Other Reason Not Randomized", "enrollment_reason_not_randomized_other");
      if(formData.randomised!=="No"){
      if(!formData.ppv_required)    add("B4. PPV",                    "ppv_required");
      if(formData.ppv_required==="Yes" && !formData.device_ppv)
        add("B4. PPV Device", "device_ppv");
      if(formData.ppv_required==="Yes" && !formData.interface_used)
        add("B4. PPV Interface", "interface_used");
      if(formData.ppv_required==="Yes" && !formData.ppv_duration)
        add("B4. PPV Duration", "ppv_duration");
      if(formData.ppv_required==="Yes" && ["Self-inflating bag","Both"].includes(formData.device_ppv) && !formData.sib_peep_with)
        add("B4. SIB PEEP Valve", "sib_peep_with");
      if(formData.sib_peep_with==="Yes" && !formData.sib_peep_cmh2o)
        add("B4. SIB PEEP Value", "sib_peep_cmh2o");
      if(formData.ppv_required==="Yes" && ["T-piece","Both"].includes(formData.device_ppv)){
        if(!formData.tpiece_pip) add("B4. T-piece PIP", "tpiece_pip");
        if(!formData.tpiece_peep) add("B4. T-piece PEEP", "tpiece_peep");
        if(!formData.tpiece_flow) add("B4. T-piece Flow", "tpiece_flow");
      }
      if(!formData.intubation)      add("B4. Endotracheal Intubation", "intubation");
      if(!formData.chest_compression) add("B4. Chest Compressions",  "chest_compression");
      if(formData.chest_compression==="Yes" && !formData.cc_duration)
        add("B4. Duration of Chest Compressions", "cc_duration");
      if(!formData.adrenaline)      add("B4. Epinephrine",            "adrenaline");
      if(formData.adrenaline==="Yes" && !formData.adrenaline_dilution)
        add("B4. Epinephrine Dilution", "adrenaline_dilution");
      if(formData.adrenaline==="Yes" && !formData.adrenaline_route)
        add("B4. Epinephrine Route", "adrenaline_route");
      if(formData.adrenaline==="Yes" && !formData.med_doses)
        add("B4. Epinephrine Doses", "med_doses");
      if(formData.adrenaline==="Yes" && !formData.adrenaline_cumulative)
        add("B4. Epinephrine Cumulative Dose", "adrenaline_cumulative");
      if(!formData.fluid_bolus)     add("B4. Fluid Bolus",            "fluid_bolus");
      if(formData.fluid_bolus==="Yes" && !formData.fluid_bolus_doses)
        add("B4. Fluid Bolus Doses", "fluid_bolus_doses");
      if(formData.fluid_bolus==="Yes" && !formData.fluid_bolus_cumulative)
        add("B4. Fluid Bolus Cumulative Volume/Dose", "fluid_bolus_cumulative");
      if(!formData.placental_transfusion) add("B4. Placental Transfusion", "placental_transfusion");
      if(formData.placental_transfusion==="Yes" && !formData.transfusion_method)
        add("B4. Placental Transfusion Method", "transfusion_method");
      if(formData.placental_transfusion==="Yes" && !formData.cord_clamp_timestamp)
        add("B4. Cord Clamp Timestamp", "cord_clamp_timestamp");
      if(formData.time_to_respiration && durationToSeconds(formData.time_to_respiration)===null)
        add("B4. Time to Respiratory Efforts must be MM:SS", "time_to_respiration");
      if(formData.time_to_spo2_80 && durationToSeconds(formData.time_to_spo2_80)===null)
        add("B4. Time to SpO2 >80% must be MM:SS", "time_to_spo2_80");
      if(!formData.cord_blood_done) add("B6. Cord Blood Analysis",     "cord_blood_done");
      if(formData.cord_blood_done==="No" && !formData.cord_blood_within_1hr)
        add("B6. Sample Within 1 Hour", "cord_blood_within_1hr");
      if(formData.cord_blood_done==="Yes" || formData.cord_blood_within_1hr==="Yes"){
        if(!formData.cord_blood_source) add("B6. Cord Blood Source", "cord_blood_source");
        if(formData.cord_ph==="") add("B6. Cord Blood pH", "cord_ph");
        if(formData.cord_sbe==="") add("B6. Cord Blood SBE", "cord_sbe");
        if(formData.cord_pco2==="") add("B6. Cord Blood pCO2", "cord_pco2");
      }
      if(!formData.resus_failure)   add("B6. Resuscitation Failure",  "resus_failure");
      if(!formData.reason_exit_trial_gas) add("B6. Reason for Exit",  "reason_exit_trial_gas");
      if(formData.reason_exit_trial_gas==="Other" && !formData.reason_exit_trial_gas_other)
        add("B6. Other Exit Reason", "reason_exit_trial_gas_other");
      if(!formData.blender_stopped) add("B6. PORTAL Blender Status",  "blender_stopped");
      if(formData.blender_stopped==="Yes" && !formData.blender_stopped_description)
        add("B6. Blender Stop Description", "blender_stopped_description");
      }
    }
    return m;
  };

  const scrollToFirstError = missing => {
    if(!missing?.length) return;
    const el = document.querySelector(`[name="${missing[0].fieldName}"], #${missing[0].fieldName}`);
    if(el){el.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>el.focus?.(),400);}
  };

  /* ── Save ── */
  const saveForm = async () => {
    setMessage("");
    const missing = validate();
    if(missing.length>0){setMissingFields(missing);setShowMissingModal(true);return false;}
    const payload = buildPayload();
    try {
      const existingId = getStoredId("current_enrollment_id");

      const res = existingId
        ? await api.put(`/birth-resuscitation/${existingId}`, payload)
        : await api.post("/birth-resuscitation/", payload);

      const eid = res.data.enrollment_id;
      const sid = res.data.screening_id;
      setStoredId("current_enrollment_id", eid);
      if (sid) setStoredId("current_screening_id", sid);
      window.dispatchEvent(new Event("storage"));

      setIsFormBLoaded(true);
      setMessage("✅ Form B saved successfully");
      setIsSaved(true); setIsEditing(false);
      setLastSaved(new Date()); setIsDirty(false);
      markFormCompleted("form_b");
      updatePatientData({
        enrollment_id:  eid,
        gestation:      `${formData.gestation_weeks}+${formData.gestation_days}`,
        mother_name:    `${formData.mother_name_first} ${formData.mother_name_surname}`,
        birth_weight:   formData.birth_weight,
        dob:            formData.date_of_birth,
        baby_uid:       formData.baby_uid,
      });
      setTimeout(()=>setMessage(""),3000);
      return true;
    } catch(err) {
      console.error("Birth resuscitation form save error:", err);
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(e=>`${e.loc?.slice(-1)[0]} — ${e.msg}`).join("; ")
        : typeof detail==="string" ? detail : err.message;
      setMessage(`❌ Save failed: ${msg}`);
      return false;
    }
  };

  /* ── Save Draft — no validation, saves whatever is filled ── */
  const saveDraft = async () => {
    const payload = buildPayload();

    try {
      const existingId = getStoredId("current_enrollment_id");

      const res = existingId
        ? await api.put(`/birth-resuscitation/${existingId}`, payload)
        : await api.post("/birth-resuscitation/", payload);

      const eid = res.data.enrollment_id;
      const sid = res.data.screening_id;
      setStoredId("current_enrollment_id", eid);
      if (sid) setStoredId("current_screening_id", sid);
      window.dispatchEvent(new Event("storage"));

      setShowDraftModal(true);
    } catch (err) {
      /* Parse FastAPI 422 validation errors into readable text */
      console.error("Birth resuscitation draft save error:", err);
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
    }
  };

  /* ── Auto-save every 10 seconds (silent, no modals, no validation) ── */
  const autoSave = useCallback(async () => {
    const fd = formDataRef.current;
    const existingId = getStoredId("current_enrollment_id");

    /* Don't create a new DB row until both baby_uid AND enrollment_id are entered */
    if (!existingId && (!fd.baby_uid || !fd.enrollment_id)) return;

    if (!navigator.onLine) {
      setOfflineQueue(true);
      return;
    }

    setAutoSaveStatus("saving");
    try {
      const payload = buildPayloadFrom(fd);

      const res = existingId
        ? await api.put(`/birth-resuscitation/${existingId}`, payload)
        : await api.post("/birth-resuscitation/", payload);

      const newEid = res.data.enrollment_id;
      const sid = res.data.screening_id;
      setStoredId("current_enrollment_id", newEid);
      if (sid) setStoredId("current_screening_id", sid);
      window.dispatchEvent(new Event("storage"));

      setAutoSaveStatus("saved");
      setLastSaved(new Date());
      setIsDirty(false);
      setOfflineQueue(false);
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Birth resuscitation auto-save error:", err.message);
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
  }, [buildPayloadFrom]);

  autoSaveRef.current = autoSave;

  /* ── Start 10-second interval once form is loaded (stable — not reset on keystroke) ── */
  useEffect(() => {
    if (!isFormBLoaded) return;
    clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(autoSave, 10000);
    return () => clearInterval(autoSaveTimer.current);
  }, [autoSave, isFormBLoaded]);

  /* ── Next ── */
  const handleNext = async () => {
    const ok = await saveForm();
    if(!ok) return;
    const eid = getStoredId("current_enrollment_id");
    if(!eid) { setMessage("❌ Enrollment ID not saved — please re-enter and save before proceeding"); return; }
    const key = `completedForms_${eid}`;
    const ex  = JSON.parse(localStorage.getItem(key)||"[]");
    if(!ex.includes("form_b")) localStorage.setItem(key,JSON.stringify([...ex,"form_b"]));
    navigate(`/form-c/${eid}`);
  };

  /* ── Load data ── */
  useEffect(()=>{
    const eid=getStoredId("current_enrollment_id");
    if(!eid) return;
    api.get(`/birth-resuscitation/${eid}`)
      .then(r=>{
        const d=r.data;
        setFormData(p=>({...p,...d,
          poor_resp_efforts: d.poor_resp_efforts===true?"Yes":d.poor_resp_efforts===false?"No":"",
          poor_muscle_tone:  d.poor_muscle_tone===true?"Yes":d.poor_muscle_tone===false?"No":"",
          hr_above_100:      d.hr_above_100===true?"Yes":d.hr_above_100===false?"No":"",
          initial_steps:     d.initial_steps===true?"Yes":d.initial_steps===false?"No":"",
          required_resuscitation: d.required_resuscitation===true?"Yes":d.required_resuscitation===false?"No":"",
          ppv_required:      d.ppv_required===true?"Yes":d.ppv_required===false?"No":"",
          intubation:        d.intubation===true?"Yes":d.intubation===false?"No":"",
          chest_compression: d.chest_compression===true?"Yes":d.chest_compression===false?"No":"",
          adrenaline:        d.adrenaline===true?"Yes":d.adrenaline===false?"No":"",
          fluid_bolus:       d.fluid_bolus===true?"Yes":d.fluid_bolus===false?"No":"",
          placental_transfusion: d.placental_transfusion===true?"Yes":d.placental_transfusion===false?"No":"",
          randomised:        d.randomised===true?"Yes":d.randomised===false?"No":"",
          resus_failure:     d.resus_failure===true?"Yes":d.resus_failure===false?"No":"",
          cord_blood_done:   d.cord_blood_done===true?"Yes":d.cord_blood_done===false?"No":"",
          cord_blood_within_1hr: d.cord_blood_within_1hr===true?"Yes":d.cord_blood_within_1hr===false?"No":"",
          interventions:     d.interventions || p.interventions,
          indication_for_delivery: typeof d.indication_for_delivery==="string"
            ? d.indication_for_delivery.split(",").map(v=>v.trim()).filter(Boolean)
            : (d.indication_for_delivery || []),
          blender_stopped:   d.blender_stopped===true?"Yes":d.blender_stopped===false?"No":"",
          time_to_respiration: secondsToDuration(d.time_to_respiration),
          time_to_spo2_80:     secondsToDuration(d.time_to_spo2_80),
        }));
        setIsFormBLoaded(true); setIsSaved(true);
      }).catch(err => {
        if (err?.response?.status !== 404) {
          setMessage("⚠️ Could not load saved Form B data — please refresh the page.");
        }
      });
  },[]);

  useEffect(()=>{
    if(!screeningId) return;
    const fetch=async()=>{
      try {
        const r=await api.get(`/screenings/by-screening-id/${screeningId}`);
        const d=r.data||{};
        let pii={};
        try{const p2=await api.get(`/pii/screening/${screeningId}`);pii=p2.data||{};}catch(_){}
        set({
          screening_id:        d.screening_id||"",
          site_name:           d.site_name||"",
          maternal_uid:        pii.maternal_uid||"",
          mother_name_first:   pii.mother_first_name||"",
          mother_name_surname: pii.mother_surname||"",
          gestation_weeks:     d.gestation_weeks||"",
          gestation_days:      d.gestation_days||"",
          screening_datetime: d.screening_datetime||"",
          contact_mother:  pii.mother_contact||pii.contact_mother||"",
          contact_husband: pii.husband_contact||pii.contact_husband||"",
        });
        setSiteName(d.site_name || "");
      }catch(e){console.error(e);}
    };
    fetch();
  },[screeningId]); // eslint-disable-line

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */
  return (
    <>
      {/* Offline */}
      {!isOnline && (
        <div className="offline-banner">
          <Ic d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" s={14}/>
          You are offline. Changes will be saved automatically when your connection returns.
          {offlineQueue && <strong> · Save queued.</strong>}
        </div>
      )}
      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot"/>
          Editing mode — unsaved changes will be lost if you navigate away
        </div>
      )}

      <form className={`screening-form${isSaved&&!isEditing?" readonly":""}`} onSubmit={e=>e.preventDefault()}>
        <fieldset>
          <div className="form-inner">

            {/* ── PAGE HEADER ── */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={12}/> FORM B</div>
                <h2 className="form-main-title">Birth &amp; Resuscitation</h2>
                <p className="form-main-subtitle">Complete for all consented PORTAL Trial participants · CRF v1.22</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && (
                  <button type="button" className="btn-print-form" onClick={()=>window.print()}>
                    <Ic d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" s={13}/> Print
                  </button>
                )}
                {isSaved && (
                  <button type="button"
                    className={`btn-edit-form-header${isEditing?" editing-active":""}`}
                    onClick={()=>setIsEditing(p=>!p)}>
                    {isEditing?"✓ Done Editing":"Edit Form"}
                  </button>
                )}
                <div className="screening-id-badge">
                  <span className="id-label">Enrollment ID</span>
                  <span className="id-val">{formData.enrollment_id||"—"}</span>
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════
                B1 — IDENTIFICATION
            ════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <User size={15} className="section-header-icon"/>
                  <h3>B1 · Identification</h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>1. Screening ID</label>
                    <input value={formData.screening_id} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>2. Maternal UID</label>
                    <input value={formData.maternal_uid} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>3. Mother's First Name</label>
                    <input value={formData.mother_name_first} readOnly className="readonly-input"/>
                  </div>
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>4. Baby UID<span className="required">*</span></label>
                    <input name="baby_uid" value={formData.baby_uid||""}
                      maxLength={12} inputMode="numeric" placeholder="Up to 12 digits"
                      readOnly={!isFieldEditable}
                      className={errors.baby_uid?"input-error":""}
                      onChange={e=>{
                        if(/^\d{0,12}$/.test(e.target.value)){
                          set({baby_uid:e.target.value});
                          setErrors(p=>({...p,baby_uid:""}));
                        }
                      }}/>
                    {errors.baby_uid&&<div className="field-error">{errors.baby_uid}</div>}
                  </div>
                  <div className="form-group">
                    <label>5. Mobile No. — Mother</label>
                    <input value={formData.contact_mother||""} readOnly className="readonly-input" placeholder="From Form A"/>
                  </div>
                  <div className="form-group">
                    <label>5. Mobile No. — Husband</label>
                    <input value={formData.contact_husband||""} readOnly className="readonly-input" placeholder="From Form A"/>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>{babyAdmissionLabel}</label>
                    <input name="baby_admission_no" value={formData.baby_admission_no||""}
                      maxLength={babyAdmissionRule.max} inputMode="numeric"
                      onChange={e=>{
                        const v = e.target.value;
                        if (/^\d*$/.test(v)) set({ baby_admission_no: v });
                      }}
                      placeholder={babyAdmissionRule.placeholder} readOnly={!isFieldEditable || siteName === "IOG"}/>
                  </div>
                  {isPgiSite && (
                    <div className="form-group">
                      <label>7. Baby Annual No. <span className="field-note">(REDCap)</span></label>
                      <input name="baby_annual_no" value={formData.baby_annual_no||""}
                        onChange={handleChange} placeholder="Annual number" readOnly={!isFieldEditable}/>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════
                B2 — BIRTH DETAILS
            ════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Baby size={15} className="section-header-icon"/>
                  <h3>B2 · Birth Details</h3>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>8. Date of Birth<span className="required">*</span></label>
                    <DatePicker
                      selected={formData.date_of_birth?parseDateOnly(formData.date_of_birth):null}
                      onChange={d=>set({date_of_birth:d?toDateOnlyValue(d):""})}
                      maxDate={new Date()}
                      dateFormat="dd-MM-yyyy" placeholderText="dd-MM-yyyy"
                      readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>9. Time of Birth<span className="required">*</span></label>
                    <input type="time" name="time_of_birth"
                      value={formData.time_of_birth||""} step="1"
                      onChange={handleChange} readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>10. Gender<span className="required">*</span></label>
                    <select name="gender" value={formData.gender}
                      disabled={!isFieldEditable} onChange={handleChange}>
                      <option value="">-- Select --</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="DSD">DSD</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>11. Gestation at Screening (auto)</label>
                    <input readOnly className="readonly-input"
                      value={formData.gestation_weeks ? `${formData.gestation_weeks}w ${formData.gestation_days||0}d` : "—"} placeholder="From Form A"/>
                  </div>
                  <div className="form-group">
                    <label>12. Gestation at Randomization (auto from Form A and DOB)</label>
                    <input readOnly className="readonly-input"
                      value={formData.gestation_rand_weeks !== "" ? `${formData.gestation_rand_weeks}w ${formData.gestation_rand_days||0}d` : "—"}
                      placeholder="Auto from DOB"/>
                  </div>
                  <div className="form-group">
                    <label>13. Birth Weight (g)<span className="required">*</span></label>
                    <input type="text" name="birth_weight" value={formData.birth_weight||""}
                      inputMode="numeric" maxLength={4} placeholder="300–6000 g"
                      readOnly={!isFieldEditable}
                      className={errors.birth_weight?"input-error":""}
                      onChange={e=>{
                        if(/^\d{0,4}$/.test(e.target.value)){
                          set({birth_weight:e.target.value});
                          setErrors(p=>({...p,birth_weight:
                            e.target.value===""?"Required":
                            Number(e.target.value)<300?"Must be ≥ 300 g":
                            Number(e.target.value)>6000?"Must be ≤ 6000 g":""}));
                        }
                      }}/>
                    {errors.birth_weight&&<div className="field-error">{errors.birth_weight}</div>}
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>14. Intrauterine Growth Status (centile)</label>
                    <input type="text" name="intrauterine_centile"
                      value={formData.intrauterine_centile||""}
                      inputMode="decimal" placeholder="0–100"
                      onChange={e=>{const v=e.target.value;if(/^\d{0,3}(\.\d{0,2})?$/.test(v)&&(v===""||Number(v)<=100))set({intrauterine_centile:v});}}
                      readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>15. Delivery Mode{requiredMark}</label>
                    <select name="delivery_mode" value={formData.delivery_mode}
                      disabled={!isFieldEditable}
                      onChange={e=>{ handleChange(e); set({vaginal_delivery_type:"",lscs_type:""}); }}>
                      <option value="">-- Select --</option>
                      <option value="Vaginal">Vaginal</option>
                      <option value="LSCS">LSCS</option>
                    </select>
                  </div>
                  <div className="form-group">
                    {formData.delivery_mode==="Vaginal" && (<>
                      <label>16. Vaginal Delivery Type{requiredMark}</label>
                      <select name="vaginal_delivery_type" value={formData.vaginal_delivery_type||""}
                        disabled={!isFieldEditable} onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Spontaneous">Spontaneous</option>
                        <option value="Augmented">Augmented</option>
                        <option value="Induced">Induced</option>
                      </select>
                    </>)}
                    {formData.delivery_mode==="LSCS" && (<>
                      <label>17. LSCS Type{requiredMark}</label>
                      <select name="lscs_type" value={formData.lscs_type||""}
                        disabled={!isFieldEditable} onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Emergency">Emergency</option>
                        <option value="Elective">Elective</option>
                      </select>
                    </>)}
                  </div>
                </div>

                {/* Field 18: Indication — multi-select per CRF */}
                <div className="form-group">
                  <label>18. Indication for Delivery{requiredMark} <span className="field-note">(select all that apply)</span></label>
                  <div className="multi-checkbox-group">
                    {["pPROM","PTL","Absent/Reversed EDF","Fetal indication","Obstetric indication","Other"].map(opt => (
                      <label key={opt} className={`multi-check-item${!isFieldEditable?" disabled":""}${(formData.indication_for_delivery||[]).includes(opt)?" checked":""}`}>
                        <input type="checkbox"
                          checked={(formData.indication_for_delivery||[]).includes(opt)}
                          disabled={!isFieldEditable}
                          onChange={()=>{
                            const cur = formData.indication_for_delivery||[];
                            const next = cur.includes(opt) ? cur.filter(x=>x!==opt) : [...cur,opt];
                            set({indication_for_delivery:next});
                          }}/>
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                  {(formData.indication_for_delivery||[]).includes("Absent/Reversed EDF") && (
                    <input type="text" name="indication_edf_detail" value={formData.indication_edf_detail||""}
                      onChange={handleChange} placeholder="Specify Absent/Reversed EDF details *"
                      readOnly={!isFieldEditable} style={{marginTop:8}}/>
                  )}
                  {(formData.indication_for_delivery||[]).includes("Fetal indication") && (
                    <input type="text" name="fetal_indication_detail" value={formData.fetal_indication_detail||""}
                      onChange={handleChange} placeholder="Specify fetal indication *"
                      readOnly={!isFieldEditable} style={{marginTop:8}}/>
                  )}
                  {(formData.indication_for_delivery||[]).includes("Obstetric indication") && (
                    <input type="text" name="obstetric_indication_detail" value={formData.obstetric_indication_detail||""}
                      onChange={handleChange} placeholder="Specify obstetric indication *"
                      readOnly={!isFieldEditable} style={{marginTop:8}}/>
                  )}
                  {(formData.indication_for_delivery||[]).includes("Other") && (
                    <input type="text" name="indication_for_delivery_other"
                      value={formData.indication_for_delivery_other||""}
                      onChange={handleChange} placeholder="Specify other indication *"
                      readOnly={!isFieldEditable} style={{marginTop:8}}/>
                  )}
                </div>

              </div>
            </div>

            {/* ════════════════════════════════════════
                B3 — CONDITION AT BIRTH & RANDOMIZATION
            ════════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Heart size={15} className="section-header-icon"/>
                  <h3>B3 · Condition at Birth &amp; Randomization</h3>
                </div>
              </div>
              <div className="form-section-body">

                <YesNoToggle label={<>19. Respiratory Effort — Absent/Poor? (No = Normal){requiredMark}</>}
                  name="poor_resp_efforts" value={formData.poor_resp_efforts}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label={<>20. Muscle Tone — Limp/Poor? (No = Normal){requiredMark}</>}
                  name="poor_muscle_tone" value={formData.poor_muscle_tone}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label={<>21. Heart Rate &gt; 100{requiredMark}</>}
                  name="hr_above_100" value={formData.hr_above_100||""}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label={<>22. Initial Steps Required (Warm, Dry, Stimulate, Suction){requiredMark}</>}
                  name="initial_steps" value={formData.initial_steps}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label={<>23. Resuscitation Beyond Initial Steps Required{requiredMark}</>}
                  name="required_resuscitation" value={formData.required_resuscitation}
                  onChange={e=>{
                    handleChange(e);
                    if(e.target.value==="No"){
                      localStorage.setItem("enrollment_locked","true");
                      window.dispatchEvent(new Event("storage"));
                    }
                  }}
                  disabled={!isFieldEditable}/>

                {formData.required_resuscitation==="No" && (
                  <div className="alert-danger">
                    <AlertTriangle size={16}/>
                    Resuscitation beyond initial steps not required — participation ends here.
                    Save Form B and submit. No further forms required.
                  </div>
                )}

                {formData.required_resuscitation==="Yes" && (
                  <div className="followup-box">
                    <span className="followup-label">Randomization details</span>
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>24. Randomised?<span className="required">*</span></label>
                        <select name="randomised" value={formData.randomised}
                          disabled={!isFieldEditable} onChange={handleChange}>
                          <option value="">-- Select --</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>
                      {formData.randomised==="Yes" && (<>
                        <div className="form-group">
                          <label>25. Randomization Date<span className="required">*</span></label>
                          <DatePicker
                            selected={formData.randomisation_date?parseDateOnly(formData.randomisation_date):null}
                            onChange={d=>set({randomisation_date:d?toDateOnlyValue(d):""})}
                            maxDate={new Date()}
                            dateFormat="dd-MM-yyyy" placeholderText="dd-MM-yyyy"
                            readOnly={!isFieldEditable}/>
                        </div>
                        <div className="form-group">
                          <label>26. Enrollment ID<span className="required">*</span></label>
                          <input name="enrollment_id" value={formData.enrollment_id||""}
                            onChange={handleChange} placeholder="e.g. PGI-A-001"
                            readOnly={!isFieldEditable}/>
                        </div>
                      </>)}
                    </div>
                    {formData.randomised==="Yes" && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>27. Strata{requiredMark}</label>
                          <select name="strata" value={formData.strata||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="< 28 weeks">&lt; 28 weeks</option>
                            <option value="≥ 28 – 31 weeks">≥ 28 – 31 weeks</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    )}
                    {formData.randomised==="No" && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>28. Reason Not Randomized<span className="required">*</span></label>
                          <select name="enrollment_reason_not_randomized"
                            value={formData.enrollment_reason_not_randomized||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="GA ≥ 32 weeks">GA ≥ 32 weeks</option>
                            <option value="Trial nurse could not reach">Trial nurse could not reach</option>
                            <option value="Non-trial location">Non-trial location</option>
                            <option value="Missed delivery">Missed delivery</option>
                            <option value="Multiple deliveries">Multiple deliveries</option>
                            <option value="Consent withdrawn">Consent withdrawn</option>
                            <option value="Other">Other</option>
                          </select>
                          {formData.enrollment_reason_not_randomized==="Other" && (
                            <input type="text" name="enrollment_reason_not_randomized_other"
                              value={formData.enrollment_reason_not_randomized_other||""}
                              onChange={handleChange} placeholder="Specify other reason *"
                              readOnly={!isFieldEditable} style={{marginTop:8}}/>
                          )}
                        </div>
                        <div/>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Conditional sections only when resuscitation given and not "No" */}
            {!endParticipation && formData.randomised!=="No" && (<>

              {/* ════════════════════════════════════════
                  B4 — RESUSCITATION INTERVENTIONS
              ════════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <Activity size={15} className="section-header-icon"/>
                    <h3>B4 · Resuscitation Interventions</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* 29. PPV */}
                  <YesNoToggle label={<>29. PPV (Positive Pressure Ventilation) Required{requiredMark}</>}
                    name="ppv_required" value={formData.ppv_required}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({device_ppv:"",sib_peep_with:"",sib_peep_cmh2o:"",tpiece_pip:"",tpiece_peep:"",tpiece_flow:"",interface_used:"",ppv_duration:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.ppv_required==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>Device used{requiredMark}</label>
                          <select name="device_ppv" value={formData.device_ppv||""}
                            disabled={!isFieldEditable}
                            onChange={e=>{handleChange(e);set({sib_peep_with:"",sib_peep_cmh2o:"",tpiece_pip:"",tpiece_peep:"",tpiece_flow:""});}}>
                            <option value="">-- Select --</option>
                            <option value="T-piece">T-piece resuscitator</option>
                            <option value="Self-inflating bag">Self-inflating bag (SIB)</option>
                            <option value="Both">Both</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                      {(formData.device_ppv==="Self-inflating bag"||formData.device_ppv==="Both") && (
                        <div className="followup-box">
                          <div className="form-grid-3">
                            <div className="form-group">
                              <label>29a. SIB — With PEEP valve?{requiredMark}</label>
                              <select name="sib_peep_with" value={formData.sib_peep_with||""}
                                disabled={!isFieldEditable} onChange={handleChange}>
                                <option value="">-- Select --</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </div>
                            {formData.sib_peep_with==="Yes" && (
                              <div className="form-group">
                                <label>PEEP value (cmH₂O){requiredMark}</label>
                                <input type="text" name="sib_peep_cmh2o" value={formData.sib_peep_cmh2o||""}
                                  inputMode="numeric" maxLength={3} placeholder="cmH₂O" readOnly={!isFieldEditable}
                                  onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({sib_peep_cmh2o:e.target.value});}}/>
                              </div>
                            )}
                            <div/>
                          </div>
                        </div>
                      )}
                      {(formData.device_ppv==="T-piece"||formData.device_ppv==="Both") && (
                        <div className="followup-box">
                          <div className="form-grid-3">
                            <div className="form-group">
                              <label>29b. T-piece PIP (cmH₂O){requiredMark}</label>
                              <input type="text" name="tpiece_pip" value={formData.tpiece_pip||""}
                                inputMode="numeric" maxLength={3} placeholder="cmH₂O" readOnly={!isFieldEditable}
                                onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_pip:e.target.value});}}/>
                            </div>
                            <div className="form-group">
                              <label>PEEP (cmH₂O){requiredMark}</label>
                              <input type="text" name="tpiece_peep" value={formData.tpiece_peep||""}
                                inputMode="numeric" maxLength={3} placeholder="cmH₂O" readOnly={!isFieldEditable}
                                onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_peep:e.target.value});}}/>
                            </div>
                            <div className="form-group">
                              <label>Flow Rate (L/min){requiredMark}</label>
                              <input type="text" name="tpiece_flow" value={formData.tpiece_flow||""}
                                inputMode="numeric" maxLength={3} placeholder="L/min" readOnly={!isFieldEditable}
                                onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_flow:e.target.value});}}/>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>30. Interface{requiredMark}</label>
                          <select name="interface_used" value={formData.interface_used||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Mask">Mask</option>
                            <option value="LMA">LMA</option>
                            <option value="Mask + LMA">Mask + LMA</option>
                            <option value="Endotracheal tube">Endotracheal tube</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>31. Duration of PPV (sec){requiredMark} <span className="field-note">from PORTAL timer</span></label>
                          <input type="text" name="ppv_duration" value={formData.ppv_duration||""}
                            inputMode="numeric" maxLength={4} placeholder="seconds" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))set({ppv_duration:e.target.value});}}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 32. Intubation */}
                  <YesNoToggle label={<>32. Endotracheal Intubation{requiredMark}</>}
                    name="intubation" value={formData.intubation}
                    onChange={handleChange} disabled={!isFieldEditable}/>

                  {/* 33–34. Chest compressions */}
                  <YesNoToggle label={<>33. Chest Compressions{requiredMark}</>}
                    name="chest_compression" value={formData.chest_compression}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({cc_duration:""}); }}
                    disabled={!isFieldEditable}/>
                  {formData.chest_compression==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>34. Duration of CC (sec){requiredMark} <span className="field-note">from PORTAL timer</span></label>
                          <input type="text" name="cc_duration" value={formData.cc_duration||""}
                            inputMode="numeric" maxLength={4} placeholder="seconds" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))set({cc_duration:e.target.value});}}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 35–37. Epinephrine */}
                  <YesNoToggle label={<>35. Epinephrine (Adrenaline){requiredMark}</>}
                    name="adrenaline" value={formData.adrenaline}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({adrenaline_dilution:"",adrenaline_route:"",med_doses:"",adrenaline_cumulative:""}); }}
                    disabled={!isFieldEditable}/>
                  {formData.adrenaline==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>36. Dilution{requiredMark}</label>
                          <select name="adrenaline_dilution" value={formData.adrenaline_dilution||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="1:10000">1:10,000</option>
                            <option value="1:1000">1:1,000</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>37. Route{requiredMark}</label>
                          <select name="adrenaline_route" value={formData.adrenaline_route||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Umbilical vein">Umbilical vein</option>
                            <option value="Peripheral vein">Peripheral vein</option>
                            <option value="Intratracheal">Intratracheal</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>39. Number of Doses{requiredMark}</label>
                          <input type="text" name="med_doses" value={formData.med_doses||""}
                            inputMode="numeric" maxLength={2} placeholder="doses" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,2}$/.test(e.target.value))set({med_doses:e.target.value});}}/>
                        </div>
                        <div className="form-group">
                          <label>40. Cumulative Dose (ml/mg){requiredMark}</label>
                          <input type="text" name="adrenaline_cumulative" value={formData.adrenaline_cumulative||""}
                            inputMode="decimal" placeholder="ml/mg" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d*\.?\d{0,2}$/.test(e.target.value))set({adrenaline_cumulative:e.target.value});}}/>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 41–43. Fluid bolus */}
                  <YesNoToggle label={<>41. Fluid Bolus{requiredMark}</>}
                    name="fluid_bolus" value={formData.fluid_bolus}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({fluid_bolus_doses:"",fluid_bolus_cumulative:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.fluid_bolus==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>42. Number of Doses{requiredMark}</label>
                          <input type="text" name="fluid_bolus_doses" value={formData.fluid_bolus_doses||""}
                            inputMode="numeric" maxLength={2} placeholder="doses" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,2}$/.test(e.target.value))set({fluid_bolus_doses:e.target.value});}}/>
                        </div>
                        <div className="form-group">
                          <label>43. Cumulative Volume/Dose (ml/mg){requiredMark}</label>
                          <input type="text" name="fluid_bolus_cumulative" value={formData.fluid_bolus_cumulative||""}
                            inputMode="decimal" placeholder="ml/mg" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d*\.?\d{0,2}$/.test(e.target.value))set({fluid_bolus_cumulative:e.target.value});}}/>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 44–47. Placental transfusion */}
                  <YesNoToggle label={<>44. Placental Transfusion{requiredMark}</>}
                    name="placental_transfusion" value={formData.placental_transfusion}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({transfusion_method:"",cord_clamp_time:"",cord_clamp_timestamp:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.placental_transfusion==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>45. Method{requiredMark}</label>
                          <select name="transfusion_method" value={formData.transfusion_method||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Deferred clamping">Deferred cord clamping (DCC)</option>
                            <option value="Intact cord milking">Intact cord milking (ICM)</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>46. Cord clamped at (HH:MM:SS){requiredMark}</label>
                          <input type="time" step="1" name="cord_clamp_timestamp" value={formData.cord_clamp_timestamp||""}
                            readOnly={!isFieldEditable} onChange={handleChange}/>
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>47. Cord clamping time from birth (sec) <span className="field-note">auto-filled or enter directly</span></label>
                          <input type="text" name="cord_clamp_time" value={formData.cord_clamp_time||""}
                            inputMode="numeric" maxLength={3} placeholder="0–300" readOnly={!isFieldEditable}
                            className={errors.cord_clamp_time?"input-error":""}
                            onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v)&&(v===""||Number(v)<=300))set({cord_clamp_time:v});}}/>
                          {errors.cord_clamp_time&&<div className="field-error">{errors.cord_clamp_time}</div>}
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* Timings */}
                  <div className="form-grid-3" style={{marginTop:16}}>
                    <div className="form-group">
                      <label>48. Time to Spontaneous Respiratory Efforts (MM:SS)</label>
                      <input type="text" name="time_to_respiration"
                        value={formData.time_to_respiration||""}
                        inputMode="numeric" maxLength={6} placeholder="MM:SS"
                        readOnly={!isFieldEditable}
                        onChange={e=>{const v=e.target.value;if(/^\d{0,3}:?[0-5]?\d?$/.test(v))set({time_to_respiration:v});}}/>
                    </div>
                    <div className="form-group">
                      <label>48. If Longer — Days</label>
                      <input type="text" name="respiration_days" value={formData.respiration_days||""}
                        inputMode="numeric" maxLength={3} placeholder="days" readOnly={!isFieldEditable}
                        onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({respiration_days:e.target.value});}}/>
                    </div>
                    <div className="form-group">
                      <label>48. If Longer — Hours</label>
                      <input type="text" name="respiration_hours" value={formData.respiration_hours||""}
                        inputMode="numeric" maxLength={2} placeholder="0–23" readOnly={!isFieldEditable}
                        onChange={e=>{const v=e.target.value;if(/^\d{0,2}$/.test(v)&&(v===""||Number(v)<=23))set({respiration_hours:v});}}/>
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>49. SpO₂ at 5 min (%) <span className="field-note">cross-verify with pulse oximeter</span></label>
                      <input type="text" name="spo2_5min" value={formData.spo2_5min||""}
                        inputMode="numeric" maxLength={3} placeholder="0–100"
                        readOnly={!isFieldEditable}
                        onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v)&&(v===""||Number(v)<=100))set({spo2_5min:v});}}/>
                    </div>
                    <div className="form-group">
                      <label>50. Time to SpO₂ &gt; 80% (MM:SS) <span className="field-note">cross-verify with pulse oximeter</span></label>
                      <input type="text" name="time_to_spo2_80" value={formData.time_to_spo2_80||""}
                        inputMode="numeric" maxLength={6} placeholder="MM:SS"
                        readOnly={!isFieldEditable}
                        onChange={e=>{const v=e.target.value;if(/^\d{0,3}:?[0-5]?\d?$/.test(v))set({time_to_spo2_80:v});}}/>
                    </div>
                  </div>

                </div>
              </div>

              {/* ════════════════════════════════════════
                  B5 — MINUTE-WISE INTERVENTION TABLE
              ════════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <BarChart2 size={15} className="section-header-icon"/>
                    <h3>B5 · Minute-wise Intervention Summary</h3>
                  </div>
                </div>
                <div className="form-section-body" style={{padding:"14px 0 4px"}}>
                  <div style={{overflowX:"auto",padding:"0 20px"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
                      <thead>
                        <tr style={{background:"#f0f9ff"}}>
                          <th style={{padding:"10px 14px",fontSize:11,fontWeight:700,textTransform:"uppercase",
                            letterSpacing:".06em",color:"#0369a1",textAlign:"left",
                            borderBottom:"2px solid #bae6fd",whiteSpace:"nowrap"}}>Intervention</th>
                          {times.map(t=>(
                            <th key={t} style={{padding:"10px 10px",fontSize:11,fontWeight:700,
                              textTransform:"uppercase",letterSpacing:".06em",color:"#0369a1",
                              textAlign:"center",borderBottom:"2px solid #bae6fd",whiteSpace:"nowrap"}}>
                              {t} min</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {key:"oxygen",         label:"51. Oxygen"},
                          {key:"ventilation",     label:"52. Ventilation"},
                          {key:"chest_compression",label:"53. Chest Compression"},
                          {key:"intubation",      label:"54. Intubation"},
                          {key:"medication",      label:"55. Medication"},
                          {key:"fluid_bolus",     label:"53. Fluid Bolus"},
                          {key:"cpap",            label:"54. CPAP"},
                        ].map((row,ri)=>(
                          <tr key={row.key} style={{background:ri%2===0?"#fff":"#f9fafb"}}>
                            <td style={{padding:"9px 14px",fontSize:12,fontWeight:600,color:"#374151",
                              borderBottom:"1px solid #f3f4f6",whiteSpace:"nowrap"}}>{row.label}</td>
                            {times.map(t=>(
                              <td key={t} style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #f3f4f6"}}>
                                <IntvCell
                                  value={formData.interventions[row.key]?.[t]}
                                  disabled={!isFieldEditable||(row.key==="chest_compression"&&formData.chest_compression==="No")}
                                  onChange={v=>handleIntv(row.key,t,v)}/>
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* Apgar row */}
                        <tr style={{background:"#fffbeb"}}>
                          <td style={{padding:"9px 14px",fontSize:12,fontWeight:700,color:"#92400e",
                            borderBottom:"1px solid #fde68a",whiteSpace:"nowrap"}}>55. Apgar Score</td>
                          {times.map(t=>(
                            <td key={t} style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #fde68a"}}>
                              <input type="text" inputMode="numeric" maxLength={2} placeholder="0–10"
                                value={formData.interventions.apgar?.[t]||""}
                                readOnly={!isFieldEditable}
                                onChange={e=>{const v=e.target.value;if(/^\d{0,2}$/.test(v)&&(v===""||Number(v)<=10))handleIntv("apgar",t,v);}}
                                className={apgarCls(formData.interventions.apgar?.[t])}
                                style={{width:52,padding:"5px 4px",borderRadius:5,
                                  border:"1px solid #fde68a",textAlign:"center",fontSize:12,fontWeight:700}}/>
                            </td>
                          ))}
                        </tr>
                        {/* Trend */}
                        <tr style={{background:"#fffbeb"}}>
                          <td style={{padding:"6px 14px",fontSize:11,fontWeight:600,color:"#92400e",
                            borderBottom:"1px solid #fde68a"}}>Trend</td>
                          {times.map((t,i,arr)=>{
                            const cur=Number(formData.interventions.apgar?.[t]||0);
                            const prev=Number(formData.interventions.apgar?.[arr[i-1]]||0);
                            let sym="•";
                            if(i!==0&&cur){if(cur>prev)sym="⬆️";else if(cur<prev)sym="⬇️";else sym="➡️";}
                            return<td key={t} style={{textAlign:"center",fontSize:15,borderBottom:"1px solid #fde68a"}}>{sym}</td>;
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ════════════════════════════════════════
                  B6 — CORD BLOOD & RESUSCITATION EXIT
              ════════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <Droplets size={15} className="section-header-icon"/>
                    <h3>B6 · Cord Blood &amp; Resuscitation Exit</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* 56. Cord Blood */}
                  <YesNoToggle label={<>56. Cord Blood Analysis Done{requiredMark}</>}
                    name="cord_blood_done" value={formData.cord_blood_done||""}
                    onChange={e=>{handleChange(e);if(e.target.value==="Yes")set({cord_blood_within_1hr:""});else set({cord_blood_within_1hr:"",cord_blood_source:"",cord_ph:"",cord_sbe:"",cord_pco2:""});}}
                    disabled={!isFieldEditable}/>

                  {formData.cord_blood_done==="No" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>57. Within 1 hour of birth — sample taken?{requiredMark}</label>
                          <select name="cord_blood_within_1hr" value={formData.cord_blood_within_1hr||""}
                            disabled={!isFieldEditable}
                            onChange={e=>{handleChange(e);if(e.target.value==="No")set({cord_blood_source:"",cord_ph:"",cord_sbe:"",cord_pco2:""});}}>
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {(formData.cord_blood_done==="Yes" || formData.cord_blood_within_1hr==="Yes") && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>58. Source{requiredMark}</label>
                          <select name="cord_blood_source" value={formData.cord_blood_source||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Capillary">Capillary</option>
                            <option value="Venous">Venous</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                      <div className="form-grid-3">
                        <div className="form-group">
                          <label>59. pH{requiredMark}</label>
                          <input type="text" name="cord_ph" value={formData.cord_ph||""}
                            placeholder="6.8-7.8" readOnly={!isFieldEditable}
                            className={errors.cord_ph?"input-error":""}
                            onChange={e=>{const v=e.target.value;if(/^\d*\.?\d{0,2}$/.test(v)){set({cord_ph:v});setErrors(p=>({...p,cord_ph:v&&(Number(v)<6.8||Number(v)>7.8)?"pH must be 6.8-7.8":""}));}}}/>
                          {errors.cord_ph&&<div className="field-error">{errors.cord_ph}</div>}
                        </div>
                        <div className="form-group">
                          <label>59. SBE{requiredMark}</label>
                          <input type="text" name="cord_sbe" value={formData.cord_sbe||""}
                            placeholder="-30 to +30" readOnly={!isFieldEditable}
                            onChange={e=>{const v=e.target.value;if(/^-?\d*\.?\d{0,1}$/.test(v)&&(v===""||v==="-"||(Number(v)>=-30&&Number(v)<=30)))set({cord_sbe:v});}}/>
                        </div>
                        <div className="form-group">
                          <label>59. pCO2 (mmHg){requiredMark}</label>
                          <input type="text" name="cord_pco2" value={formData.cord_pco2||""}
                            placeholder="10-100" inputMode="numeric" readOnly={!isFieldEditable}
                            onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v)&&(v===""||Number(v)<=200))set({cord_pco2:v});}}/>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 60. Resuscitation Failure */}
                  <YesNoToggle label={<>60. Resuscitation Failure{requiredMark}</>}
                    name="resus_failure" value={formData.resus_failure}
                    onChange={handleChange} disabled={!isFieldEditable}/>

                  <div className="form-grid-2" style={{marginTop:14}}>
                    <div className="form-group">
                      <label>61. SpO2 at exit from trial gas (%) <span className="field-note">cross-verify with oximeter</span></label>
                      <input type="text" name="spo2_exit_trial_gas" value={formData.spo2_exit_trial_gas||""}
                        inputMode="numeric" maxLength={3} placeholder="0-100"
                        readOnly={!isFieldEditable}
                        onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v)&&(v===""||Number(v)<=100))set({spo2_exit_trial_gas:v});}}/>
                    </div>
                    <div className="form-group">
                      <label>62. Total Resuscitation Time (min) <span className="field-note">from PORTAL timer</span></label>
                      <input type="text" name="total_resus_time" value={formData.total_resus_time||""}
                        inputMode="numeric" maxLength={3} placeholder="minutes"
                        readOnly={!isFieldEditable}
                        onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({total_resus_time:e.target.value});}}/>
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>63. Reason for Resuscitation Exit{requiredMark}</label>
                      <select name="reason_exit_trial_gas"
                        value={formData.reason_exit_trial_gas||""}
                        disabled={!isFieldEditable} onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Responded to resuscitation">Responded to resuscitation</option>
                        <option value="Required override to 100% O2 or CC">Required override to 100% O2 or CC</option>
                        <option value="Other">Other</option>
                      </select>
                      {formData.reason_exit_trial_gas==="Other" && (
                        <input type="text" name="reason_exit_trial_gas_other"
                          value={formData.reason_exit_trial_gas_other||""}
                          onChange={handleChange} placeholder="Specify *"
                          readOnly={!isFieldEditable} style={{marginTop:8}}/>
                      )}
                    </div>
                    <div/>
                  </div>

                  <YesNoToggle label={<>64. Did the PORTAL Blender Stop Suddenly During Use?{requiredMark}</>}
                    name="blender_stopped" value={formData.blender_stopped}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({blender_stopped_description:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.blender_stopped==="Yes" && (
                    <div className="followup-box">
                      <div className="form-group">
                        <label>64. If Yes, Describe{requiredMark}</label>
                        <textarea name="blender_stopped_description"
                          value={formData.blender_stopped_description||""}
                          maxLength={1000} rows={3} readOnly={!isFieldEditable}
                          onChange={handleChange} placeholder="Describe what happened"/>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </>)}

            {/* Notes */}
            <NotesBox formKey={`form_b_${formData.screening_id||"new"}`}/>

            {message && (
              <div className={`form-message${message.startsWith("✅")?" msg-success":" msg-error"}`}>
                {message}
              </div>
            )}

          </div>
        </fieldset>
      </form>

      {/* ── NAV BAR ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary"
          onClick={()=>navigate(`/form-a/${screeningId}`)}>
          <ArrowLeft size={15}/> Screening
        </button>
        <button type="button" className="btn btn-save" onClick={saveForm}>
          <Save size={15}/> Save
        </button>
        <button type="button" className="btn btn-draft" onClick={saveDraft}>
          <Save size={15}/> Save for Later
        </button>

        {/* Auto-save indicator */}
        <div className="autosave-indicator">
          {lastSaved && autoSaveStatus==="idle" && (
            <span className="last-saved-txt">
              <Ic d="M20 6L9 17l-5-5" s={11}/> Saved {relT(lastSaved)}
            </span>
          )}
          {isDirty && autoSaveStatus==="idle" && !lastSaved && (
            <span className="unsaved-dot-pill"><span className="unsaved-dot"/>Unsaved changes</span>
          )}
          {autoSaveStatus==="saving" && (
            <span className="autosave-pill autosave-pill--saving">
              <span className="autosave-dot autosave-dot--spin"/>Auto-saving…
            </span>
          )}
          {autoSaveStatus==="saved" && (
            <span className="autosave-pill autosave-pill--saved">
              <Ic d="M20 6L9 17l-5-5" s={11}/> Auto-saved
            </span>
          )}
          {autoSaveStatus==="error" && (
            <span className="autosave-pill autosave-pill--error">Auto-save failed</span>
          )}
        </div>

        <div className="footer-step-indicator">
          <span className="step-text">STEP 2 OF 17</span>
          <div className="step-progress-line">
            <div className="progress-segment active"/>
            <div className="progress-segment active"/>
            <div className="progress-segment"/>
            <div className="progress-segment"/>
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Maternal Details <ArrowRight size={15}/>
        </button>
      </div>

      {/* ── Missing fields modal ── */}
      {showMissingModal && (
        <div className="modal-overlay" onClick={()=>setShowMissingModal(false)}>
          <div className="mf-modal" onClick={e=>e.stopPropagation()}>
            <div className="mf-modal-header">
              <div className="mf-modal-icon-wrap">
                <AlertTriangle size={20} color="#f59e0b"/>
              </div>
              <div className="mf-modal-text">
                <h3 className="mf-modal-title">Required fields missing</h3>
                <p className="mf-modal-sub">
                  {missingFields.length} field{missingFields.length!==1?"s":""} need attention before saving
                </p>
              </div>
              <button className="mf-modal-close" onClick={()=>setShowMissingModal(false)}>
                <Ic d="M18 6L6 18M6 6l12 12" s={16}/>
              </button>
            </div>
            <div className="mf-modal-list">
              {missingFields.map((f,i)=>(
                <div key={i} className="mf-modal-item">
                  <span className="mf-modal-num">{i+1}</span>
                  <span className="mf-modal-label">{f.label}</span>
                </div>
              ))}
            </div>
            <div className="mf-modal-footer">
              <button className="mf-btn-secondary" onClick={()=>setShowMissingModal(false)}>Dismiss</button>
              <button className="mf-btn-primary"
                onClick={()=>{setShowMissingModal(false);setTimeout(()=>scrollToFirstError(missingFields),100);}}>
                <Ic d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01" s={13}/>
                Go to first error
              </button>
            </div>
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
