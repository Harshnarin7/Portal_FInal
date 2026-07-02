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
import {
  ArrowLeft, ArrowRight, Save, Home, User, Baby,
  Heart, Activity, BarChart2, Droplets, AlertTriangle, Shuffle,
} from "lucide-react";

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
  const autoSaveTimer   = useRef(null);
  const isInitialRender = useRef(true);
  const isFieldEditable = !isSaved || isEditing;

  const BLANK = {
    /* B1 */
    screening_id:"", enrollment_id:"",
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
    maternal_complication:"",
    /* B3 */
    poor_resp_efforts:"", poor_muscle_tone:"", hr_above_100:"",
    initial_steps:"", required_resuscitation:"",
    randomised:"", randomisation_date:"", strata:"",
    enrollment_reason_not_randomized:"",
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
    fluid_bolus:"",
    placental_transfusion:"", transfusion_method:"",
    cord_clamp_timestamp:"", cord_clamp_time:"",
    time_to_respiration:"", spo2_5min:"", time_to_spo2_80:"",
    /* B7 */
    cord_blood_done:"", cord_blood_within_1hr:"", cord_blood_source:"",
    cord_ph:"", cord_sbe:"", cord_pco2:"",
    resus_failure:"",
    spo2_exit_trial_gas:"", total_resus_time:"",
    reason_exit_trial_gas:"", reason_exit_trial_gas_other:"",
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

  /* ── Gestation at randomization (auto-calc from screening GA + DOB) ── */
  useEffect(() => {
    if (!formData.date_of_birth || !formData.gestation_weeks) return;
    // Days since screening (approximate — screening date not always stored)
    // Use birth date vs today's date to compute offset from screening GA
    const screeningGA = Number(formData.gestation_weeks) * 7 + Number(formData.gestation_days || 0);
    // We don't have exact screening date, so randomization GA ≈ screening GA for now
    // When screening_datetime is available, calculate: randGA = screeningGA + daysBetween
    const randW = Math.floor(screeningGA / 7);
    const randD = screeningGA % 7;
    set({ gestation_rand_weeks: randW, gestation_rand_days: randD });
  }, [formData.date_of_birth, formData.gestation_weeks, formData.gestation_days]); // eslint-disable-line

  /* ── Sync chest_compression to intervention table ── */
  useEffect(() => {
    const v = formData.chest_compression;
    if (v==="Yes"||v==="No"||v==="")
      setFormData(p => ({...p, interventions:{...p.interventions,
        chest_compression:{"1":v,"5":v,"10":v,"15":v,"20":v}}}));
  }, [formData.chest_compression]);

  /* ── Online/offline ── */
  useEffect(() => {
    const on=()=>setIsOnline(true), off=()=>setIsOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return ()=>{window.removeEventListener("online",on); window.removeEventListener("offline",off);};
  }, []);

  /* ── beforeunload ── */
  useEffect(() => {
    const h=e=>{if(!isDirty)return;e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",h);
    return ()=>window.removeEventListener("beforeunload",h);
  }, [isDirty]);

  /* ── Mark dirty ── */
  useEffect(()=>{
    if(!isFormBLoaded)return;
    if(isInitialRender.current){isInitialRender.current=false;return;}
    setIsDirty(true);
  },[formData]); // eslint-disable-line

  /* ── Relative time ── */
  const relT = d => {
    if(!d) return null;
    const s=Math.floor((Date.now()-d.getTime())/1000);
    if(s<10)return"just now";if(s<60)return`${s}s ago`;
    if(s<3600)return`${Math.floor(s/60)}m ago`;return`${Math.floor(s/3600)}h ago`;
  };

  /* ── Apgar colour ── */
  const apgarCls = v => {
    if(!v&&v!==0)return""; const n=Number(v);
    if(n<=3)return"apgar-red"; if(n<=6)return"apgar-yellow"; return"apgar-green";
  };

  const handleIntv = (type,time,val) =>
    setFormData(p=>({...p,interventions:{...p.interventions,[type]:{...p.interventions[type],[time]:val}}}));

  /* ── Build payload ── */
  const buildPayload = useCallback(() => ({
    screening_id:        formData.screening_id,
    enrollment_id:       formData.enrollment_id,
    mother_name_first:   formData.mother_name_first,
    mother_name_surname: formData.mother_name_surname,
    maternal_uid:        formData.maternal_uid,
    contact_mother:      formData.contact_mother,
    contact_husband:     formData.contact_husband,
    baby_uid:            formData.baby_uid || null,
    baby_admission_no:   formData.baby_admission_no || null,
    gestation_weeks:     num(formData.gestation_weeks),
    gestation_days:      num(formData.gestation_days),
    birth_weight:        num(formData.birth_weight),
    date_of_birth:       formData.date_of_birth
      ? new Date(formData.date_of_birth).toISOString().split("T")[0] : null,
    time_of_birth:       formData.time_of_birth || null,
    gender:              formData.gender,
    indication_for_delivery: formData.indication_for_delivery==="Other"
      ? formData.indication_for_delivery_other : formData.indication_for_delivery,
    delivery_mode:       formData.delivery_mode,
    labor_type:          formData.labor_type,
    maternal_complication: formData.maternal_complication || null,
    poor_resp_efforts:   yn(formData.poor_resp_efforts),
    poor_muscle_tone:    yn(formData.poor_muscle_tone),
    initial_steps:       yn(formData.initial_steps),
    required_resuscitation: yn(formData.required_resuscitation),
    ppv_required:        yn(formData.ppv_required),
    device_ppv:          formData.device_ppv || null,
    intubation:          yn(formData.intubation),
    chest_compression:   yn(formData.chest_compression),
    ppv_duration:        num(formData.ppv_duration),
    cc_duration:         num(formData.cc_duration),
    adrenaline:          yn(formData.adrenaline),
    med_doses:           num(formData.med_doses),
    fluid_bolus:         yn(formData.fluid_bolus),
    placental_transfusion: yn(formData.placental_transfusion),
    transfusion_method:  formData.transfusion_method || null,
    cord_clamp_time:     num(formData.cord_clamp_time),
    time_to_respiration: num(formData.time_to_respiration),
    spo2_5min:           num(formData.spo2_5min),
    time_to_spo2_80:     num(formData.time_to_spo2_80),
    randomised:          yn(formData.randomised),
    randomisation_date:  formData.randomisation_date
      ? new Date(formData.randomisation_date).toISOString().split("T")[0] : null,
    enrollment_reason_not_randomized: formData.enrollment_reason_not_randomized || null,
    resus_failure:       yn(formData.resus_failure),
    fio2_exit:           num(formData.fio2_exit),
    spo2_exit_trial_gas: num(formData.spo2_exit_trial_gas),
    total_resus_time:    num(formData.total_resus_time),
    reason_exit_trial_gas: formData.reason_exit_trial_gas==="Other"
      ? formData.reason_exit_trial_gas_other : formData.reason_exit_trial_gas,
    interventions:       formData.interventions,
  }), [formData]);

  /* ── Validate ── */
  const validate = () => {
    const m = [];
    const add = (label,field) => m.push({label,fieldName:field});
    if(!formData.baby_uid)           add("B1. Baby UID",              "baby_uid");
    if(!formData.date_of_birth)      add("B2. Date of Birth",         "date_of_birth");
    if(!formData.time_of_birth)      add("B2. Time of Birth",         "time_of_birth");
    if(!formData.birth_weight)       add("B2. Birth Weight",          "birth_weight");
    if(!formData.gender)             add("B2. Gender",                "gender");
    if(!formData.required_resuscitation) add("B3. Resuscitation beyond initial steps?", "required_resuscitation");
    if(formData.required_resuscitation==="Yes"){
      if(!formData.randomised)       add("B3. Randomised?",           "randomised");
      if(formData.randomised==="Yes"){
        if(!formData.enrollment_id)  add("B3. Enrollment ID",         "enrollment_id");
        if(!formData.randomisation_date) add("B3. Randomization Date","randomisation_date");
      }
      if(formData.randomised==="No" && !formData.enrollment_reason_not_randomized)
        add("B3. Reason Not Randomized","enrollment_reason_not_randomized");
    }
    return m;
  };

  const scrollToFirstError = missing => {
    if(!missing?.length) return;
    const el = document.querySelector(`[name="${missing[0].fieldName}"], #${missing[0].fieldName}`);
    if(el){el.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>el.focus?.(),400);}
  };

  /* ── Save ── */
  const saveForm = useCallback(async () => {
    setMessage("");
    const missing = validate();
    if(missing.length>0){setMissingFields(missing);setShowMissingModal(true);return false;}
    const payload = buildPayload();
    try {
      const res = isFormBLoaded
        ? await api.put(`/birth-resuscitation/${payload.enrollment_id}`, payload)
        : await api.post("/birth-resuscitation/", payload);
      setIsFormBLoaded(true);
      localStorage.setItem("current_enrollment_id", payload.enrollment_id);
      localStorage.setItem("current_screening_id",  payload.screening_id);
      window.dispatchEvent(new Event("storage"));
      setMessage("✅ Form B saved successfully");
      setIsSaved(true); setIsEditing(false);
      setLastSaved(new Date()); setIsDirty(false);
      markFormCompleted("form_b");
      updatePatientData({
        enrollment_id:  payload.enrollment_id,
        gestation:      `${formData.gestation_weeks}+${formData.gestation_days}`,
        mother_name:    `${formData.mother_name_first} ${formData.mother_name_surname}`,
        birth_weight:   formData.birth_weight,
        dob:            formData.date_of_birth,
        baby_uid:       formData.baby_uid,
      });
      setTimeout(()=>setMessage(""),3000);
      return true;
    } catch(err) {
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(e=>`${e.loc?.slice(-1)[0]} — ${e.msg}`).join("; ")
        : typeof detail==="string" ? detail : err.message;
      setMessage(`❌ Save failed: ${msg}`);
      return false;
    }
  }, [formData, isFormBLoaded, buildPayload, markFormCompleted, updatePatientData]); // eslint-disable-line

  /* ── Auto-save ── */
  const autoSave = useCallback(async () => {
    if(!formData.screening_id||!navigator.onLine) return;
    setAutoSaveStatus("saving");
    try {
      const p = buildPayload();
      if(isFormBLoaded) await api.put(`/birth-resuscitation/${p.enrollment_id}`,p);
      else { await api.post("/birth-resuscitation/",p); setIsFormBLoaded(true); }
      setAutoSaveStatus("saved"); setLastSaved(new Date()); setIsDirty(false);
      setTimeout(()=>setAutoSaveStatus("idle"),2500);
    } catch { setAutoSaveStatus("error"); setTimeout(()=>setAutoSaveStatus("idle"),3000); }
  }, [formData,buildPayload,isFormBLoaded]);

  useEffect(()=>{
    if(!isFormBLoaded) return;
    clearInterval(autoSaveTimer.current);
    autoSaveTimer.current=setInterval(autoSave,10000);
    return ()=>clearInterval(autoSaveTimer.current);
  },[autoSave,isFormBLoaded]);

  /* ── Next ── */
  const handleNext = async () => {
    const ok = await saveForm();
    if(!ok) return;
    const eid = localStorage.getItem("current_enrollment_id");
    const key = `completedForms_${eid}`;
    const ex  = JSON.parse(localStorage.getItem(key)||"[]");
    if(!ex.includes("form_b")) localStorage.setItem(key,JSON.stringify([...ex,"form_b"]));
    navigate(`/form-c/${eid}`);
  };

  /* ── Load data ── */
  useEffect(()=>{
    const eid=localStorage.getItem("current_enrollment_id");
    if(!eid||eid==="null") return;
    api.get(`/birth-resuscitation/${eid}`)
      .then(r=>{
        const d=r.data;
        setFormData(p=>({...p,...d,
          poor_resp_efforts: d.poor_resp_efforts===true?"Yes":d.poor_resp_efforts===false?"No":"",
          poor_muscle_tone:  d.poor_muscle_tone===true?"Yes":d.poor_muscle_tone===false?"No":"",
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
        }));
        setIsFormBLoaded(true); setIsSaved(true);
      }).catch(()=>{});
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
          maternal_uid:        pii.maternal_uid||"",
          mother_name_first:   pii.mother_first_name||"",
          mother_name_surname: pii.mother_surname||"",
          gestation_weeks:     d.gestation_weeks||"",
          gestation_days:      d.gestation_days||"",
          contact_mother:  pii.mother_contact||pii.contact_mother||"",
          contact_husband: pii.husband_contact||pii.contact_husband||"",
        });
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
          You are offline — changes will auto-save when connection returns.
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
                    <label>Screening ID</label>
                    <input value={formData.screening_id} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>Maternal UID</label>
                    <input value={formData.maternal_uid} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>Mother's First Name</label>
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
                          setErrors(p=>({...p,baby_uid:e.target.value.length===12?"":"Must be exactly 12 digits"}));
                        }
                      }}/>
                    {errors.baby_uid&&<div className="field-error">{errors.baby_uid}</div>}
                  </div>
                  <div className="form-group">
                    <label>6. Baby Admission No.</label>
                    <input name="baby_admission_no" value={formData.baby_admission_no||""}
                      onChange={handleChange} placeholder="Optional" readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>7. Baby Annual No. <span className="field-note">(REDCap)</span></label>
                    <input name="baby_annual_no" value={formData.baby_annual_no||""}
                      onChange={handleChange} placeholder="Annual number" readOnly={!isFieldEditable}/>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Contact — Mother</label>
                    <input value={formData.contact_mother||""} readOnly className="readonly-input" placeholder="From Form A"/>
                  </div>
                  <div className="form-group">
                    <label>Contact — Husband</label>
                    <input value={formData.contact_husband||""} readOnly className="readonly-input" placeholder="From Form A"/>
                  </div>
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
                    <label>11. Gestation at screening (auto)</label>
                    <input readOnly className="readonly-input"
                      value={formData.gestation_weeks ? `${formData.gestation_weeks}w ${formData.gestation_days||0}d` : "—"} placeholder="From Form A"/>
                  </div>
                  <div className="form-group">
                    <label>12. Gestation at randomization (auto)</label>
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
                    <label>8. Date of Birth<span className="required">*</span></label>
                    <DatePicker
                      selected={formData.date_of_birth?new Date(formData.date_of_birth):null}
                      onChange={d=>set({date_of_birth:d?d.toISOString().split("T")[0]:""})}
                      dateFormat="dd-MM-yyyy" placeholderText="dd-MM-yyyy"
                      readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>9. Time of Birth<span className="required">*</span></label>
                    <input type="time" name="time_of_birth"
                      value={formData.time_of_birth||""} step="60"
                      onChange={handleChange} readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>10. Gender<span className="required">*</span></label>
                    <select name="gender" value={formData.gender}
                      disabled={!isFieldEditable} onChange={handleChange}>
                      <option value="">-- Select --</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Ambiguous">Ambiguous</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>14. Intrauterine Growth Status (centile)</label>
                    <input type="text" name="intrauterine_centile"
                      value={formData.intrauterine_centile||""}
                      onChange={handleChange} placeholder="e.g. 3rd, 10th"
                      readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>15. Delivery Mode</label>
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
                      <label>16. Vaginal Delivery Type</label>
                      <select name="vaginal_delivery_type" value={formData.vaginal_delivery_type||""}
                        disabled={!isFieldEditable} onChange={handleChange}>
                        <option value="">-- Select --</option>
                        <option value="Spontaneous">Spontaneous</option>
                        <option value="Augmented">Augmented</option>
                        <option value="Induced">Induced</option>
                      </select>
                    </>)}
                    {formData.delivery_mode==="LSCS" && (<>
                      <label>17. LSCS Type</label>
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
                  <label>18. Indication for Delivery <span className="field-note">(select all that apply)</span></label>
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
                  {(formData.indication_for_delivery||[]).includes("Other") && (
                    <input type="text" name="indication_for_delivery_other"
                      value={formData.indication_for_delivery_other||""}
                      onChange={handleChange} placeholder="Specify other indication"
                      readOnly={!isFieldEditable} style={{marginTop:8}}/>
                  )}
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Maternal Complication (if any)</label>
                    <input name="maternal_complication"
                      value={formData.maternal_complication||""}
                      onChange={handleChange} placeholder="e.g. PIH, GDM, None"
                      readOnly={!isFieldEditable}/>
                  </div>
                  <div/>
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

                <YesNoToggle label="19. Poor / Absent Respiratory Effort"
                  name="poor_resp_efforts" value={formData.poor_resp_efforts}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label="20. Limp / Poor Muscle Tone"
                  name="poor_muscle_tone" value={formData.poor_muscle_tone}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label="21. Heart Rate > 100"
                  name="hr_above_100" value={formData.hr_above_100||""}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label="22. Initial Steps Required (Warm, Dry, Stimulate, Suction)"
                  name="initial_steps" value={formData.initial_steps}
                  onChange={handleChange} disabled={!isFieldEditable}/>
                <YesNoToggle label="23. Resuscitation Beyond Initial Steps Required"
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
                            selected={formData.randomisation_date?new Date(formData.randomisation_date):null}
                            onChange={d=>set({randomisation_date:d?d.toISOString().split("T")[0]:""})}
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
                          <label>27. Strata</label>
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
                            <option value="Team absent">Trial team absent</option>
                            <option value="Non-trial location">Non-trial location / OT</option>
                            <option value="Missed — too rapid delivery">Missed — too rapid delivery</option>
                            <option value="Multiple gestation">Multiple gestation</option>
                            <option value="Withdrew consent">Withdrew consent</option>
                            <option value="Equipment failure">Equipment failure</option>
                            <option value="Other">Other</option>
                          </select>
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
                  <YesNoToggle label="29. PPV (Positive Pressure Ventilation) Required"
                    name="ppv_required" value={formData.ppv_required}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({device_ppv:"",sib_peep_with:"",sib_peep_cmh2o:"",tpiece_pip:"",tpiece_peep:"",tpiece_flow:"",interface_used:"",ppv_duration:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.ppv_required==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>Device used</label>
                          <select name="device_ppv" value={formData.device_ppv||""}
                            disabled={!isFieldEditable}
                            onChange={e=>{handleChange(e);set({sib_peep_with:"",sib_peep_cmh2o:"",tpiece_pip:"",tpiece_peep:"",tpiece_flow:""});}}>
                            <option value="">-- Select --</option>
                            <option value="T-piece">T-piece resuscitator</option>
                            <option value="Self-inflating bag">Self-inflating bag (SIB)</option>
                            <option value="Both">Both</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>30. Interface</label>
                          <select name="interface_used" value={formData.interface_used||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Mask">Face Mask</option>
                            <option value="LMA">LMA</option>
                            <option value="Mask + LMA">Mask + LMA</option>
                            <option value="Endotracheal tube">Endotracheal tube</option>
                          </select>
                        </div>
                      </div>
                      {(formData.device_ppv==="Self-inflating bag"||formData.device_ppv==="Both") && (
                        <div className="followup-box">
                          <div className="form-grid-3">
                            <div className="form-group">
                              <label>29a. SIB — With PEEP valve?</label>
                              <select name="sib_peep_with" value={formData.sib_peep_with||""}
                                disabled={!isFieldEditable} onChange={handleChange}>
                                <option value="">-- Select --</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </div>
                            {formData.sib_peep_with==="Yes" && (
                              <div className="form-group">
                                <label>PEEP value (cmH₂O)</label>
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
                              <label>29b. T-piece PIP (cmH₂O)</label>
                              <input type="text" name="tpiece_pip" value={formData.tpiece_pip||""}
                                inputMode="numeric" maxLength={3} placeholder="cmH₂O" readOnly={!isFieldEditable}
                                onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_pip:e.target.value});}}/>
                            </div>
                            <div className="form-group">
                              <label>PEEP (cmH₂O)</label>
                              <input type="text" name="tpiece_peep" value={formData.tpiece_peep||""}
                                inputMode="numeric" maxLength={3} placeholder="cmH₂O" readOnly={!isFieldEditable}
                                onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_peep:e.target.value});}}/>
                            </div>
                            <div className="form-group">
                              <label>Flow Rate (L/min)</label>
                              <input type="text" name="tpiece_flow" value={formData.tpiece_flow||""}
                                inputMode="numeric" maxLength={3} placeholder="L/min" readOnly={!isFieldEditable}
                                onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({tpiece_flow:e.target.value});}}/>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>31. Duration of PPV (sec) <span className="field-note">from PORTAL timer</span></label>
                          <input type="text" name="ppv_duration" value={formData.ppv_duration||""}
                            inputMode="numeric" maxLength={4} placeholder="seconds" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))set({ppv_duration:e.target.value});}}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 32. Intubation */}
                  <YesNoToggle label="32. Endotracheal Intubation"
                    name="intubation" value={formData.intubation}
                    onChange={handleChange} disabled={!isFieldEditable}/>

                  {/* 33–34. Chest compressions */}
                  <YesNoToggle label="33. Chest Compressions"
                    name="chest_compression" value={formData.chest_compression}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({cc_duration:""}); }}
                    disabled={!isFieldEditable}/>
                  {formData.chest_compression==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>34. Duration of CC (sec) <span className="field-note">from PORTAL timer</span></label>
                          <input type="text" name="cc_duration" value={formData.cc_duration||""}
                            inputMode="numeric" maxLength={4} placeholder="seconds" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))set({cc_duration:e.target.value});}}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 35–40. Epinephrine */}
                  <YesNoToggle label="35. Epinephrine (Adrenaline)"
                    name="adrenaline" value={formData.adrenaline}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({adrenaline_dilution:"",adrenaline_route:"",med_doses:"",adrenaline_cumulative:""}); }}
                    disabled={!isFieldEditable}/>
                  {formData.adrenaline==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-3">
                        <div className="form-group">
                          <label>36. Dilution</label>
                          <select name="adrenaline_dilution" value={formData.adrenaline_dilution||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="1:10000">1:10,000</option>
                            <option value="1:1000">1:1,000</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>37. Route</label>
                          <select name="adrenaline_route" value={formData.adrenaline_route||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Umbilical vein">Umbilical vein</option>
                            <option value="Peripheral vein">Peripheral vein</option>
                            <option value="Intratracheal">Intratracheal</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>39. Number of doses</label>
                          <input type="text" name="med_doses" value={formData.med_doses||""}
                            inputMode="numeric" maxLength={2} placeholder="doses" readOnly={!isFieldEditable}
                            onChange={e=>{if(/^\d{0,2}$/.test(e.target.value))set({med_doses:e.target.value});}}/>
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>40. Cumulative dose (ml/mg)</label>
                          <input type="text" name="adrenaline_cumulative" value={formData.adrenaline_cumulative||""}
                            placeholder="ml/mg" readOnly={!isFieldEditable} onChange={handleChange}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 38. Fluid bolus */}
                  <YesNoToggle label="38. Fluid Bolus"
                    name="fluid_bolus" value={formData.fluid_bolus}
                    onChange={handleChange} disabled={!isFieldEditable}/>

                  {/* 41–44. Placental transfusion */}
                  <YesNoToggle label="41. Placental Transfusion"
                    name="placental_transfusion" value={formData.placental_transfusion}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({transfusion_method:"",cord_clamp_time:"",cord_clamp_timestamp:""});}}
                    disabled={!isFieldEditable}/>
                  {formData.placental_transfusion==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>42. Method</label>
                          <select name="transfusion_method" value={formData.transfusion_method||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Deferred clamping">Deferred cord clamping (DCC)</option>
                            <option value="Intact cord milking">Intact cord milking (ICM)</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>43. Cord clamped at (HH:MM:SS)</label>
                          <input type="text" name="cord_clamp_timestamp" value={formData.cord_clamp_timestamp||""}
                            placeholder="HH:MM:SS" readOnly={!isFieldEditable}
                            onChange={e=>set({cord_clamp_timestamp:e.target.value.replace(/[^0-9:]/g,"")})}/>
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>44. Cord clamping time from birth (sec) <span className="field-note">auto filled</span></label>
                          <input type="text" name="cord_clamp_time" value={formData.cord_clamp_time||""}
                            inputMode="numeric" maxLength={3} placeholder="0–300 sec" readOnly={!isFieldEditable}
                            className={errors.cord_clamp_time?"input-error":""}
                            onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v)){set({cord_clamp_time:v});setErrors(p=>({...p,cord_clamp_time:Number(v)>300?"Must be ≤ 300 sec":""}));}}}/> 
                          {errors.cord_clamp_time&&<div className="field-error">{errors.cord_clamp_time}</div>}
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* Timings */}
                  <div className="form-grid-3" style={{marginTop:16}}>
                    <div className="form-group">
                      <label>45. Time to Spontaneous Respiratory Efforts (MM:SS)</label>
                      <input type="text" name="time_to_respiration"
                        value={formData.time_to_respiration||""}
                        inputMode="numeric" maxLength={3} placeholder="0–600"
                        readOnly={!isFieldEditable}
                        onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({time_to_respiration:e.target.value});}}/>
                    </div>
                    <div className="form-group">
                      <label>46. SpO₂ at 5 min (%) <span className="field-note">cross-verify with oximeter</span></label>
                      <input type="text" name="spo2_5min" value={formData.spo2_5min||""}
                        inputMode="numeric" maxLength={3} placeholder="0–100"
                        readOnly={!isFieldEditable}
                        onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v)&&(v===""||Number(v)<=100))set({spo2_5min:v});}}/>
                    </div>
                    <div className="form-group">
                      <label>47. Time to SpO₂ &gt; 80% (sec) <span className="field-note">cross-verify with oximeter</span></label>
                      <input type="text" name="time_to_spo2_80" value={formData.time_to_spo2_80||""}
                        inputMode="numeric" maxLength={3} placeholder="0–600"
                        readOnly={!isFieldEditable}
                        onChange={e=>{if(/^\d{0,3}$/.test(e.target.value))set({time_to_spo2_80:e.target.value});}}/>
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
                          {key:"oxygen",         label:"Oxygen"},
                          {key:"ventilation",     label:"PPV / Ventilation"},
                          {key:"chest_compression",label:"Chest Compressions"},
                          {key:"intubation",      label:"Intubation"},
                          {key:"medication",      label:"Medication"},
                          {key:"fluid_bolus",     label:"Fluid Bolus"},
                          {key:"cpap",            label:"CPAP"},
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
                            borderBottom:"1px solid #fde68a",whiteSpace:"nowrap"}}>Apgar Score</td>
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
                    <h3>B7 · Cord Blood &amp; Resuscitation Exit</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* 56. Cord Blood */}
                  <YesNoToggle label="56. Cord Blood Analysis Done"
                    name="cord_blood_done" value={formData.cord_blood_done||""}
                    onChange={e=>{handleChange(e);if(e.target.value==="No")set({cord_blood_within_1hr:"",cord_blood_source:"",cord_ph:"",cord_sbe:"",cord_pco2:""});}}
                    disabled={!isFieldEditable}/>

                  {formData.cord_blood_done==="No" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>57. Within 1 hour of birth — sample taken?</label>
                          <select name="cord_blood_within_1hr" value={formData.cord_blood_within_1hr||""}
                            disabled={!isFieldEditable} onChange={handleChange}>
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {formData.cord_blood_done==="Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>58. Source</label>
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
                          <label>59. pH</label>
                          <input type="text" name="cord_ph" value={formData.cord_ph||""}
                            placeholder="6.8-7.8" readOnly={!isFieldEditable}
                            className={errors.cord_ph?"input-error":""}
                            onChange={e=>{const v=e.target.value;if(/^\d*\.?\d{0,2}$/.test(v)){set({cord_ph:v});setErrors(p=>({...p,cord_ph:v&&(Number(v)<6.8||Number(v)>7.8)?"pH must be 6.8-7.8":""}));}}}/>
                          {errors.cord_ph&&<div className="field-error">{errors.cord_ph}</div>}
                        </div>
                        <div className="form-group">
                          <label>SBE</label>
                          <input type="text" name="cord_sbe" value={formData.cord_sbe||""}
                            placeholder="-30 to +30" readOnly={!isFieldEditable}
                            onChange={e=>{const v=e.target.value;if(/^-?\d*\.?\d{0,1}$/.test(v))set({cord_sbe:v});}}/>
                        </div>
                        <div className="form-group">
                          <label>pCO2 (mmHg)</label>
                          <input type="text" name="cord_pco2" value={formData.cord_pco2||""}
                            placeholder="10-100" inputMode="numeric" readOnly={!isFieldEditable}
                            onChange={e=>{const v=e.target.value;if(/^\d{0,3}$/.test(v))set({cord_pco2:v});}}/>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 60. Resuscitation Failure */}
                  <YesNoToggle label="60. Resuscitation Failure"
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
                      <label>63. Reason for Resuscitation Exit</label>
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
                          onChange={handleChange} placeholder="Specify"
                          readOnly={!isFieldEditable} style={{marginTop:8}}/>
                      )}
                    </div>
                    <div/>
                  </div>

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
    </>
  );
}
