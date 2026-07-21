import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/FormA.css";
import "./styles/FormC1.css";
import { useFormProgress } from "./context/FormProgressContext";
import { usePatient } from "./context/PatientContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import NotesBox      from "./components/NotesBox";
import OfflineBanner from "./components/OfflineBanner";
import FormNavBar    from "./components/FormNavBar";
import FormModals    from "./components/FormModals";
import useFormSession from "./hooks/useFormSession";
import { Home, User, Heart, Activity, Shield, AlertTriangle, Zap } from "lucide-react";

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

/* ── Toggle component — matches YesNoToggle (Form A/B) exactly ── */
function Toggle({ name, value, options, onChange, disabled, error }) {
  const isActive = (opt) => {
    const v = typeof opt === "object" ? opt.value : opt;
    if (value === v) return true;
    if (v === "Yes" && value === true)  return true;
    if (v === "No"  && value === false) return true;
    return String(value) === String(v);
  };

  return (
    <>
      <div style={{ display: "block", lineHeight: 0 }}>
        <div className={`fc-toggle-group${disabled ? " fc-disabled" : ""}${error ? " fc-toggle-error" : ""}`}>
          {options.map((opt, idx) => {
            const v = typeof opt === "object" ? opt.value : opt;
            const l = typeof opt === "object" ? opt.label : opt;
            const active = isActive(opt);
            const sv = String(v).toLowerCase();
            let activeCls = "";
            if (active) {
              if (sv === "yes" || v === true)        activeCls = " fc-yes";
              else if (sv === "no" || v === false)   activeCls = " fc-no";
              else                                    activeCls = " fc-other";
            }
            return (
              <button
                key={String(v)}
                type="button"
                disabled={disabled}
                className={`fc-toggle-btn${active ? " fc-active" + activeCls : ""}${idx > 0 ? " fc-divider" : ""}`}
                onClick={() => !disabled && onChange(name, v)}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      {error && <div className="field-error">{error}</div>}
    </>
  );
}

const FieldError = ({ msg }) => msg ? <div className="field-error">{msg}</div> : null;

export default function FormC() {
  const navigate  = useNavigate();
  const { enrollmentId } = useParams();
  const { markFormCompleted } = useFormProgress();
  const location  = useLocation();
  const { patientData } = usePatient();
  const isEditMode = location.state?.fromEdit === true;

  /* ── State ── */
  const [isSaved,        setIsSaved]        = useState(false);
  const [isEditing,      setIsEditing]      = useState(false);
  const [message,        setMessage]        = useState("");
  const [isFormCLoaded,  setIsFormCLoaded]  = useState(false);
  const [errors,         setErrors]         = useState({});
  const [touched,        setTouched]        = useState({});
  // session state managed by useFormSession hook
  const disordersLoadedFromDb = useRef(false);
  const isFieldEditable = !isSaved || isEditing;

  const [formData, setFormData] = useState({
    enrollment_id: "",
    mother_name: "", mother_age: "", maternal_uid: "",
    contact_mother: "", contact_husband: "", email_address: "",
    address: "", house: "", city: "", district: "", state: "", pincode: "", landmark: "",
    // C2 Obstetric History
    gravida: "", parity: "", abortions: "", live: "", still: "",
    booked: "", anc_visits: "", pregnancy_supervision: "",
    multiple: "No", lmp: "", edd: "",
    conception: "", artificial_type: "", artificial_other: "",
    // C4 Antenatal Treatment
    antenatal_steroids: "", steroid_drug: "", steroid_doses: "",
    lddi_known: "", lddi_hours: "", steroid_courses: "",
    antenatal_mgso4: "",
    steroid_date: "", gestation_at_steroids: "",
    mgso4_date: "", mgso4_gestation_weeks: "", mgso4_gestation_days: "",
    // C3 Medical Disorders
    chronic_hypertension: false, hepatitis: false, heart_disease: false,
    renal_disease: false, vdrl_positive: false, seizure_disorder: false,
    asthma: false, hiv: false, hypothyroidism: false, hyperthyroidism: false,
    tb: false, malaria: false, severe_anemia: false,
    no_known_medical_disorder: true,
    other_medical_checkbox: false, other_medical_disorder: "",
    // C4 Obstetric Problems
    hdp: "", hdp_type: "",
    gdm: "", gdm_rx: [],
    liquor: "",
    fgr: "", fgr_centile: "",
    doppler: "", doppler_other: "",
    placental_abnormality: "", placental_type: "", placental_other: "",
    retroplacental_collection: "",
    aph: "", aph_type: "", aph_other: "",
    isoimmunization: "",
    // C5 Evidence of Infection
    pprom: "", pprom_duration: "", preterm_labor: "", triple_i: "",
    maternal_fever: "", fetal_tachycardia: "", maternal_tlc_high: "",
    foul_smelling_liquor: "", maternal_uti: "", maternal_diarrhea: "",
    maternal_tachycardia: "", maternal_abdominal_tenderness: "",
    // C6 Intrapartum Events
    msl: "", non_reactive_nst: "", reduced_fm: "",
    prolonged_labor: "", cord_accident: "", cord_accident_type: "",
    fetal_bradycardia: "", fetal_tachycardia_intrapartum: "",
    duration_rom: "", uterotonic: "", uterotonic_timing: "", obstetric_other: "",
  });

  const set = patch => setFormData(p => ({ ...p, ...patch }));

  /* ── useFormSession: auto-save, offline, beforeunload, modals ── */
  const session = useFormSession({
    formKey:      "form_c",
    isLoaded:     isFormCLoaded,
    recordId:     formData.enrollment_id,
    buildPayload: useCallback(() => buildPayload(), [formData, isFormCLoaded]), // eslint-disable-line
    endpoint:     "/maternal-details",
    enabled:      !!(formData.enrollment_id),
  });

  /* ── Auto-calc address ── */
  useEffect(() => {
    const parts = [formData.house, formData.city, formData.district, formData.state, formData.pincode];
    const computed = parts.filter(Boolean).join(", ");
    if (computed) set({ address: computed });
  }, [formData.house, formData.city, formData.district, formData.state, formData.pincode]);

  /* ── Auto-calc pregnancy supervision ── */
  useEffect(() => {
    const v = Number(formData.anc_visits);
    if (formData.anc_visits === "" || isNaN(v)) { set({ pregnancy_supervision: "" }); return; }
    if (v === 0)      set({ pregnancy_supervision: "Unsupervised" });
    else if (v < 4)   set({ pregnancy_supervision: "Inadequately supervised" });
    else              set({ pregnancy_supervision: "Supervised" });
  }, [formData.anc_visits]);

  /* ── Auto-calc MgSO4 gestation ── */
  useEffect(() => {
    if (!formData.mgso4_date || !formData.edd) return;
    const mg = new Date(formData.mgso4_date);
    const eddDate = formData.edd;
    if (!(mg instanceof Date) || !(eddDate instanceof Date)) return;
    if (isNaN(mg.getTime()) || isNaN(eddDate.getTime())) return;
    const diffDays = Math.floor((eddDate.getTime() - mg.getTime()) / (1000*60*60*24));
    const adminGA  = 280 - diffDays;
    if (adminGA < 0) return;
    set({ mgso4_gestation_weeks: Math.floor(adminGA/7), mgso4_gestation_days: adminGA%7 });
  }, [formData.mgso4_date, formData.edd]);

  /* ── Auto-calc Triple I from infection fields ── */
  useEffect(() => {
    const infectionFields = [
      formData.maternal_fever, formData.fetal_tachycardia,
      formData.maternal_tlc_high, formData.maternal_tachycardia,
      formData.maternal_abdominal_tenderness, formData.foul_smelling_liquor,
    ];
    const yesCount   = infectionFields.filter(v => v === "Yes").length;
    const allAnswered = infectionFields.every(v => v !== "");
    if (yesCount >= 2)  set({ triple_i: "Yes" });
    else if (allAnswered) set({ triple_i: "No" });
  }, [
    formData.maternal_fever, formData.fetal_tachycardia, formData.maternal_tlc_high,
    formData.maternal_tachycardia, formData.maternal_abdominal_tenderness, formData.foul_smelling_liquor
  ]); // eslint-disable-line

  /* ── No known disorders clears all ── */
  useEffect(() => {
    if (disordersLoadedFromDb.current) { disordersLoadedFromDb.current = false; return; }
    if (formData.no_known_medical_disorder) {
      set({
        chronic_hypertension:false, hepatitis:false, heart_disease:false,
        renal_disease:false, vdrl_positive:false, seizure_disorder:false,
        asthma:false, hypothyroidism:false, hyperthyroidism:false,
        tb:false, malaria:false, hiv:false, severe_anemia:false,
        other_medical_checkbox:false, other_medical_disorder:"",
      });
    }
  }, [formData.no_known_medical_disorder]);

  /* ── Fetch data ── */
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!enrollmentId) return;
        let formAData = null, formCData = null;
        // Look up THIS enrollment's own screening record (Form A) — not
        // whatever screening_id happens to be cached in localStorage from
        // the last screening you viewed elsewhere in the app. Using the
        // stale global value here was pulling a different patient's
        // Form A data into this Form C.
        try {
          const resA = await api.get(`/screenings/by-enrollment/${enrollmentId}`);
          formAData = resA.data;
          if (formAData?.screening_id) {
            try {
              const piiRes = await api.get(`/pii/screening/${formAData.screening_id}`);
              formAData = { ...formAData, ...piiRes.data };
            } catch (_) {}
          }
        } catch (_) {}
        try {
          const resC = await api.get(`/maternal-details/${enrollmentId}`);
          if (resC.data) { formCData = resC.data; setIsFormCLoaded(true); }
        } catch (_) { setIsFormCLoaded(false); }

        if (formCData) disordersLoadedFromDb.current = true;

        setFormData(prev => ({
          ...prev,
          enrollment_id:   enrollmentId,
          mother_name:     `${formAData?.mother_first_name || ""} ${formAData?.mother_surname || ""}`.trim(),
          maternal_uid:    formAData?.maternal_uid || "",
          contact_mother:  formAData?.contact_mother  || formAData?.mother_contact  || "",
          contact_husband: formAData?.contact_husband || formAData?.husband_contact || "",
          ...(formCData ? {
            mother_age: formCData.mother_age ?? prev.mother_age,
            house: formCData.house ?? prev.house, city: formCData.city ?? prev.city,
            district: formCData.district ?? prev.district, state: formCData.state ?? prev.state,
            pincode: formCData.pincode ?? prev.pincode, landmark: formCData.landmark ?? prev.landmark,
            email_address: formCData.email_address ?? prev.email_address,
            gravida: formCData.gravida ?? prev.gravida, parity: formCData.parity ?? prev.parity,
            abortions: formCData.abortions ?? prev.abortions, live: formCData.live ?? prev.live,
            still: formCData.still ?? prev.still, booked: formCData.booked ?? prev.booked,
            anc_visits: formCData.anc_visits ?? prev.anc_visits,
            multiple: formCData.multiple ?? prev.multiple,
            conception: formCData.conception ?? prev.conception,
            artificial_type: formCData.artificial_type ?? prev.artificial_type,
            artificial_other: formCData.artificial_other ?? prev.artificial_other,
            antenatal_steroids: formCData.antenatal_steroids ?? prev.antenatal_steroids,
            steroid_drug: formCData.steroid_drug ?? prev.steroid_drug,
            steroid_doses: formCData.steroid_doses != null ? String(formCData.steroid_doses) : prev.steroid_doses,
            steroid_courses: formCData.steroid_courses != null ? String(formCData.steroid_courses) : prev.steroid_courses,
            lddi_known: formCData.lddi_known ?? (formCData.lddi_hours != null ? "Known" : prev.lddi_known),
            lddi_hours: formCData.lddi_hours ?? prev.lddi_hours,
            antenatal_mgso4: formCData.antenatal_mgso4 ?? prev.antenatal_mgso4,
            mgso4_gestation_weeks: formCData.mgso4_gestation_weeks ?? prev.mgso4_gestation_weeks,
            mgso4_gestation_days: formCData.mgso4_gestation_days ?? prev.mgso4_gestation_days,
            chronic_hypertension: formCData.chronic_hypertension ?? false,
            hepatitis: formCData.hepatitis ?? false, heart_disease: formCData.heart_disease ?? false,
            renal_disease: formCData.renal_disease ?? false, vdrl_positive: formCData.vdrl_positive ?? false,
            seizure_disorder: formCData.seizure_disorder ?? false, asthma: formCData.asthma ?? false,
            hiv: formCData.hiv ?? false, hypothyroidism: formCData.thyroid ?? false,
            hyperthyroidism: false, tb: formCData.tb ?? false, malaria: formCData.malaria ?? false,
            severe_anemia: formCData.severe_anemia ?? false,
            other_medical_disorder: formCData.other_medical_disorder ?? prev.other_medical_disorder,
            other_medical_checkbox: !!formCData.other_medical_disorder,
            no_known_medical_disorder: !(
              formCData.chronic_hypertension || formCData.hepatitis || formCData.heart_disease ||
              formCData.renal_disease || formCData.vdrl_positive || formCData.seizure_disorder ||
              formCData.asthma || formCData.hiv || formCData.thyroid ||
              formCData.tb || formCData.malaria || formCData.severe_anemia || formCData.other_medical_disorder
            ),
            hdp: formCData.hdp ?? prev.hdp, hdp_type: formCData.hdp_type ?? prev.hdp_type,
            gdm: formCData.gdm ?? prev.gdm,
            gdm_rx: formCData.gdm_rx ? formCData.gdm_rx.split(", ").map(s => s.trim()) : prev.gdm_rx,
            liquor: formCData.liquor ?? prev.liquor, fgr: formCData.fgr ?? prev.fgr,
            fgr_centile: formCData.fgr_centile ?? prev.fgr_centile,
            doppler: formCData.doppler ?? prev.doppler, doppler_other: formCData.doppler_other ?? prev.doppler_other,
            placental_abnormality: formCData.placental_abnormality ?? prev.placental_abnormality,
            placental_type: formCData.placental_type ?? prev.placental_type,
            placental_other: formCData.placental_other ?? prev.placental_other,
            retroplacental_collection: formCData.retroplacental_collection ?? prev.retroplacental_collection,
            aph: formCData.aph ?? prev.aph, aph_type: formCData.aph_type ?? prev.aph_type,
            aph_other: formCData.aph_other ?? prev.aph_other,
            isoimmunization: formCData.isoimmunization ?? prev.isoimmunization,
            pprom: formCData.pprom ?? prev.pprom, pprom_duration: formCData.pprom_duration ?? prev.pprom_duration,
            preterm_labor: formCData.preterm_labor ?? prev.preterm_labor,
            triple_i: formCData.triple_i ?? prev.triple_i,
            maternal_fever: formCData.maternal_fever ?? prev.maternal_fever,
            fetal_tachycardia: formCData.fetal_tachycardia ?? prev.fetal_tachycardia,
            maternal_tlc_high: formCData.maternal_tlc_high ?? prev.maternal_tlc_high,
            maternal_tachycardia: formCData.maternal_tachycardia ?? prev.maternal_tachycardia,
            maternal_abdominal_tenderness: formCData.maternal_abdominal_tenderness ?? prev.maternal_abdominal_tenderness,
            foul_smelling_liquor: formCData.foul_smelling_liquor ?? prev.foul_smelling_liquor,
            maternal_uti: formCData.maternal_uti ?? prev.maternal_uti,
            maternal_diarrhea: formCData.maternal_diarrhea ?? prev.maternal_diarrhea,
            msl: formCData.msl ?? prev.msl, non_reactive_nst: formCData.non_reactive_nst ?? prev.non_reactive_nst,
            reduced_fm: formCData.reduced_fm ?? prev.reduced_fm,
            prolonged_labor: formCData.prolonged_labor ?? prev.prolonged_labor,
            cord_accident: formCData.cord_accident ?? prev.cord_accident,
            cord_accident_type: formCData.cord_accident_type ?? prev.cord_accident_type,
            fetal_bradycardia: formCData.fetal_bradycardia ?? prev.fetal_bradycardia,
            fetal_tachycardia_intrapartum: formCData.fetal_tachycardia_intrapartum ?? prev.fetal_tachycardia_intrapartum,
            duration_rom: formCData.duration_rom ?? prev.duration_rom,
            uterotonic: formCData.uterotonic ?? prev.uterotonic,
            uterotonic_timing: formCData.uterotonic_timing ?? prev.uterotonic_timing,
          } : {}),
          lmp: formCData?.lmp ? parseDateOnly(formCData.lmp) : formAData?.lmp_date ? parseDateOnly(formAData.lmp_date) : prev.lmp || null,
          edd: formCData?.edd ? parseDateOnly(formCData.edd) : formAData?.expected_delivery_date ? parseDateOnly(formAData.expected_delivery_date) : prev.edd || null,
          mgso4_date: formCData?.mgso4_date ? parseDateOnly(formCData.mgso4_date) : prev.mgso4_date || "",
        }));
        if (formCData || isEditMode) setIsSaved(true);
      } catch (err) { console.log("Error loading Form C:", err); }
    };
    fetchData();
  }, [enrollmentId, isEditMode]); // eslint-disable-line

  useEffect(() => {
    if (patientData?.dob) set({ dob: patientData.dob });
  }, [patientData]);

  useEffect(() => {
    if (!isEditMode) set({ enrollment_id: enrollmentId });
  }, [enrollmentId]); // eslint-disable-line

  /* ── Validation ── */
  const validateField = (name, value, data) => {
    const d = { ...data, [name]: value };
    switch (name) {
      case "mother_age": if (!value) return "Required"; if (Number(value)<15||Number(value)>55) return "Age must be 15–55"; return "";
      case "house": return value?.trim() ? "" : "House / Street required";
      case "city":  return value?.trim() ? "" : "Village / City required";
      case "state": return value ? "" : "State required";
      case "landmark": return value?.trim() ? "" : "Nearest landmark required";
      case "pincode": if (!value) return ""; return /^\d{6}$/.test(value) ? "" : "6-digit PIN";
      case "email_address": if (!value) return ""; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "" : "Invalid email";
      case "gravida": if (!value) return "Required"; if (Number(value)<1) return "Must be ≥ 1"; return "";
      case "parity": if (!value && value!=="0") return "Required"; if (data.gravida && Number(value)>Number(data.gravida)) return "Cannot exceed Gravida"; return "";
      case "abortions": return (value===""||value===undefined) ? "Required" : "";
      case "live": if (value===""||value===undefined) return "Required"; if (d.parity&&Number(value)>Number(d.parity)) return "Cannot exceed Parity"; return "";
      case "still": if (value===""||value===undefined) return "Required"; if (d.parity&&Number(value)>Number(d.parity)) return "Cannot exceed Parity"; return "";
      case "booked": return value ? "" : "Required";
      case "anc_visits": return (value===""||value===null) ? "Required" : "";
      case "conception": return value ? "" : "Required";
      case "artificial_type": return (d.conception==="Artificial"&&!value) ? "Required" : "";
      case "artificial_other": return (d.artificial_type==="Other"&&!value?.trim()) ? "Required" : "";
      case "antenatal_steroids": return value ? "" : "Required";
      case "steroid_drug": return (d.antenatal_steroids==="Yes"&&!value) ? "Required" : "";
      case "steroid_doses": return (d.antenatal_steroids==="Yes"&&!value) ? "Required" : "";
      case "steroid_courses": return (d.antenatal_steroids==="Yes"&&!value) ? "Required" : "";
      case "lddi_known": return (d.antenatal_steroids==="Yes"&&!value) ? "Required" : "";
      case "lddi_hours": if (d.lddi_known!=="Known") return ""; if (!value&&value!=="0") return "Required"; if (Number(value)<0||Number(value)>99) return "0–99 hours"; return "";
      case "antenatal_mgso4": return value ? "" : "Required";
      case "mgso4_date": return (d.antenatal_mgso4==="Yes"&&!value) ? "Required" : "";
      case "other_medical_disorder": return (d.other_medical_checkbox&&!value?.trim()) ? "Required" : "";
      case "hdp": return value ? "" : "Required";
      case "hdp_type": return (d.hdp==="Yes"&&!value) ? "Required" : "";
      case "gdm": return value ? "" : "Required";
      case "gdm_rx": return (d.gdm==="Yes"&&(!value||value.length===0)) ? "Select at least one" : "";
      case "liquor": return value ? "" : "Required";
      case "fgr": return value ? "" : "Required";
      case "fgr_centile": if (d.fgr!=="Yes") return ""; if (!value) return "Required"; if (Number(value)<1||Number(value)>100) return "1–100"; return "";
      case "doppler": return value ? "" : "Required";
      case "doppler_other": return (d.doppler==="Other"&&!value?.trim()) ? "Required" : "";
      case "placental_abnormality": return value ? "" : "Required";
      case "placental_type": return (d.placental_abnormality==="Yes"&&!value) ? "Required" : "";
      case "placental_other": return ((d.placental_type==="Others"||d.placental_type==="Other")&&!value?.trim()) ? "Required" : "";
      case "retroplacental_collection": return value ? "" : "Required";
      case "isoimmunization": return value ? "" : "Required";
      case "aph": return value ? "" : "Required";
      case "aph_type": return (d.aph==="Yes"&&!value) ? "Required" : "";
      case "aph_other": return (d.aph_type==="Other"&&!value?.trim()) ? "Required" : "";
      case "pprom": return value ? "" : "Required";
      case "pprom_duration": if (d.pprom!=="Yes") return ""; if (!value&&value!=="0") return "Required"; if (Number(value)<0||Number(value)>99) return "0–99 hrs"; return "";
      case "preterm_labor": return value ? "" : "Required";
      case "triple_i": return ""; // auto-calculated — never error
      case "maternal_fever": return value ? "" : "Required";
      case "fetal_tachycardia": return value ? "" : "Required";
      case "maternal_tlc_high": return value ? "" : "Required";
      case "maternal_tachycardia": return value ? "" : "Required";
      case "maternal_abdominal_tenderness": return value ? "" : "Required";
      case "foul_smelling_liquor": return value ? "" : "Required";
      case "maternal_uti": return value ? "" : "Required";
      case "maternal_diarrhea": return value ? "" : "Required";
      case "msl": return value ? "" : "Required";
      case "non_reactive_nst": return value ? "" : "Required";
      case "reduced_fm": return value ? "" : "Required";
      case "fetal_bradycardia": return value ? "" : "Required";
      case "fetal_tachycardia_intrapartum": return value ? "" : "Required";
      case "prolonged_labor": return value ? "" : "Required";
      case "duration_rom": if (d.pprom!=="Yes") return ""; if (!value&&value!=="0") return "Required"; if (Number(value)<0||Number(value)>99) return "0–99 hrs"; return "";
      case "cord_accident": return value ? "" : "Required";
      case "cord_accident_type": return (d.cord_accident==="Yes"&&!value) ? "Required" : "";
      case "uterotonic": return value ? "" : "Required";
      case "uterotonic_timing": return (d.uterotonic==="Yes"&&!value) ? "Required" : "";
      default: return "";
    }
  };

  const touchField = name => setTouched(p => ({ ...p, [name]: true }));

  const handleGdmRxChange = (value) => {
    const newRx = formData.gdm_rx.includes(value)
      ? formData.gdm_rx.filter(v => v !== value)
      : [...formData.gdm_rx, value];
    set({ gdm_rx: newRx });
    setErrors(p => ({ ...p, gdm_rx: (formData.gdm==="Yes"&&newRx.length===0) ? "Select at least one" : "" }));
    touchField("gdm_rx");
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === "checkbox" ? checked : value;
    setFormData(prev => {
      const updated = { ...prev, [name]: newValue };
      if (name !== "no_known_medical_disorder" && type === "checkbox" && checked)
        updated.no_known_medical_disorder = false;
      return updated;
    });
    touchField(name);
    setErrors(p => ({ ...p, [name]: validateField(name, newValue, formData) }));
  };

  const handleToggle = (name, value) => {
    set({ [name]: value });
    touchField(name);
    setErrors(p => ({ ...p, [name]: validateField(name, value, formData) }));
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    touchField(name);
    setErrors(p => ({ ...p, [name]: validateField(name, value, formData) }));
  };

  const E = field => touched[field] ? errors[field] : "";

  const toInt = v => (v===""||v===null||v===undefined) ? null : parseInt(v, 10);

  /* ── Validate all ── */
  const validate = (data = formData) => {
    const e = {};

    // C1 — Identification
    if (!data.mother_age||Number(data.mother_age)<15||Number(data.mother_age)>55) e.mother_age = "Age must be 15–55";
    if (!data.house?.trim()) e.house = "House / Street required";
    if (!data.city?.trim())  e.city  = "Village / City required";
    if (!data.state)         e.state = "State required";
    if (!data.landmark?.trim()) e.landmark = "Nearest landmark required";
    if (data.pincode && !/^\d{6}$/.test(data.pincode)) e.pincode = "6-digit PIN";
    if (data.email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_address)) e.email_address = "Invalid email";

    // C2 — Obstetric history (GPAL)
    ["gravida","parity","abortions","live","still"].forEach(f => {
      if (data[f]===""||data[f]===undefined||data[f]===null) e[f] = "Required";
    });
    if (data.gravida!==""&&Number(data.gravida)<1) e.gravida = "Must be ≥ 1";
    // parity can be 0 to gravida (current pregnancy counts in gravida)
    if (data.parity!==""&&data.gravida!==""&&Number(data.parity)>Number(data.gravida))
      e.parity = "Cannot exceed Gravida";

    if (!data.booked) e.booked = "Required";
    if (data.anc_visits===""||data.anc_visits===null) e.anc_visits = "Required";
    if (!data.conception) e.conception = "Required";
    if (data.conception==="Artificial") {
      if (!data.artificial_type) e.artificial_type = "Required";
      if (data.artificial_type==="Other"&&!data.artificial_other?.trim()) e.artificial_other = "Required";
    }

    // C2 — Antenatal treatment
    if (!data.antenatal_steroids) e.antenatal_steroids = "Required";
    if (data.antenatal_steroids==="Yes") {
      if (!data.steroid_drug)    e.steroid_drug    = "Required";
      if (!data.steroid_doses)   e.steroid_doses   = "Required";
      if (!data.steroid_courses) e.steroid_courses = "Required";
      if (!data.lddi_known)      e.lddi_known      = "Required";
      if (data.lddi_known==="Known"&&(data.lddi_hours===""||data.lddi_hours===null))
        e.lddi_hours = "Required";
    }
    if (!data.antenatal_mgso4) e.antenatal_mgso4 = "Required";
    if (data.antenatal_mgso4==="Yes"&&!data.mgso4_date) e.mgso4_date = "Required";

    // C3 — Medical disorders (at least one must be selected)
    const anyDisorder = ["chronic_hypertension","hepatitis","heart_disease","renal_disease",
      "vdrl_positive","seizure_disorder","asthma","hypothyroidism","hyperthyroidism",
      "tb","malaria","hiv","severe_anemia","other_medical_checkbox"].some(f => data[f]);
    if (!data.no_known_medical_disorder&&!anyDisorder) e.medical_disorders = "Select at least one disorder or tick 'No known disorder'";
    if (data.other_medical_checkbox&&!data.other_medical_disorder?.trim()) e.other_medical_disorder = "Required";

    // C4 — Obstetric problems
    if (!data.hdp) e.hdp = "Required";
    if (data.hdp==="Yes"&&!data.hdp_type) e.hdp_type = "Required";
    if (!data.gdm) e.gdm = "Required";
    if (data.gdm==="Yes"&&data.gdm_rx.length===0) e.gdm_rx = "Select at least one";
    if (!data.liquor) e.liquor = "Required";
    if (!data.fgr) e.fgr = "Required";
    if (data.fgr==="Yes"&&(!data.fgr_centile||Number(data.fgr_centile)<1||Number(data.fgr_centile)>100))
      e.fgr_centile = "Enter centile 1–100";
    if (!data.doppler) e.doppler = "Required";
    if (data.doppler==="Other"&&!data.doppler_other?.trim()) e.doppler_other = "Required";
    if (!data.placental_abnormality) e.placental_abnormality = "Required";
    if (data.placental_abnormality==="Yes") {
      if (!data.placental_type) e.placental_type = "Required";
      if ((data.placental_type==="Others"||data.placental_type==="Other")&&!data.placental_other?.trim())
        e.placental_other = "Required";
    }
    if (!data.retroplacental_collection) e.retroplacental_collection = "Required";
    if (!data.isoimmunization) e.isoimmunization = "Required";
    if (!data.aph) e.aph = "Required";
    if (data.aph==="Yes") {
      if (!data.aph_type) e.aph_type = "Required";
      if (data.aph_type==="Other"&&!data.aph_other?.trim()) e.aph_other = "Required";
    }

    // C5 — Evidence of infection
    if (!data.pprom) e.pprom = "Required";
    // Duration only required when pPROM = Yes
    if (data.pprom==="Yes"&&(data.pprom_duration===""||data.pprom_duration===null))
      e.pprom_duration = "Required";
    if (!data.preterm_labor) e.preterm_labor = "Required";
    // triple_i is AUTO-CALCULATED — never validate, never show error
    if (!data.maternal_fever)               e.maternal_fever               = "Required";
    if (!data.fetal_tachycardia)            e.fetal_tachycardia            = "Required";
    if (!data.maternal_tlc_high)            e.maternal_tlc_high            = "Required";
    if (!data.maternal_tachycardia)         e.maternal_tachycardia         = "Required";
    if (!data.maternal_abdominal_tenderness)e.maternal_abdominal_tenderness= "Required";
    if (!data.foul_smelling_liquor)         e.foul_smelling_liquor         = "Required";
    if (!data.maternal_uti)                 e.maternal_uti                 = "Required";
    if (!data.maternal_diarrhea)            e.maternal_diarrhea            = "Required";

    // C6 — Intrapartum events
    if (!data.msl) e.msl = "Required";
    if (!data.non_reactive_nst) e.non_reactive_nst = "Required";
    if (!data.reduced_fm) e.reduced_fm = "Required";
    if (!data.fetal_bradycardia) e.fetal_bradycardia = "Required";
    if (!data.fetal_tachycardia_intrapartum) e.fetal_tachycardia_intrapartum = "Required";
    if (!data.prolonged_labor) e.prolonged_labor = "Required";
    // duration_rom only required when pPROM = Yes (ROM = Rupture of Membranes)
    if (data.pprom==="Yes"&&(data.duration_rom===""||data.duration_rom===null))
      e.duration_rom = "Duration of ROM required when pPROM = Yes";
    if (!data.cord_accident) e.cord_accident = "Required";
    if (data.cord_accident==="Yes"&&!data.cord_accident_type) e.cord_accident_type = "Required";
    if (!data.uterotonic) e.uterotonic = "Required";
    if (data.uterotonic==="Yes"&&!data.uterotonic_timing) e.uterotonic_timing = "Required";

    return e;
  };

  /* ── Build payload ── */
  const buildPayload = useCallback(() => ({
    enrollment_id: formData.enrollment_id || null,
    mother_age: toInt(formData.mother_age),
    maternal_uid: formData.maternal_uid || null,
    contact_mother: formData.contact_mother || null,
    contact_husband: formData.contact_husband || null,
    address: formData.address || null,
    house: formData.house || null, city: formData.city || null,
    district: formData.district || null, state: formData.state || null,
    pincode: formData.pincode || null, landmark: formData.landmark || null,
    email_address: formData.email_address || null,
    gravida: formData.gravida || null, parity: formData.parity || null,
    abortions: formData.abortions || null, live: formData.live || null, still: formData.still || null,
    anc_visits: formData.anc_visits || null, booked: formData.booked || null,
    multiple: formData.multiple || null,
    lmp: formData.lmp ? toDateOnlyValue(formData.lmp) : null,
    edd: formData.edd ? toDateOnlyValue(formData.edd) : null,
    conception: formData.conception || null,
    artificial_type: formData.artificial_type || null,
    artificial_other: formData.artificial_other || null,
    antenatal_steroids: formData.antenatal_steroids || null,
    steroid_drug: formData.steroid_drug || null,
    steroid_doses: formData.steroid_doses || null,
    steroid_courses: formData.steroid_courses || null,
    lddi_known: formData.lddi_known || null,
    lddi_hours: formData.lddi_hours || null,
    antenatal_mgso4: formData.antenatal_mgso4 || null,
    gestation_at_steroids: formData.gestation_at_steroids || null,
    mgso4_date: formData.mgso4_date ? toDateOnlyValue(formData.mgso4_date) : null,
    mgso4_gestation_weeks: toInt(formData.mgso4_gestation_weeks),
    mgso4_gestation_days: toInt(formData.mgso4_gestation_days),
    chronic_hypertension: formData.chronic_hypertension||false,
    hepatitis: formData.hepatitis||false, heart_disease: formData.heart_disease||false,
    renal_disease: formData.renal_disease||false, vdrl_positive: formData.vdrl_positive||false,
    seizure_disorder: formData.seizure_disorder||false, asthma: formData.asthma||false,
    hiv: formData.hiv||false,
    thyroid: (formData.hypothyroidism||formData.hyperthyroidism)||false,
    tb: formData.tb||false, malaria: formData.malaria||false, severe_anemia: formData.severe_anemia||false,
    other_medical_disorder: formData.other_medical_disorder||null,
    hdp: formData.hdp||null, hdp_type: formData.hdp_type||null,
    gdm: formData.gdm||null, gdm_rx: formData.gdm_rx.join(", ")||null,
    liquor: formData.liquor||null, fgr: formData.fgr||null, fgr_centile: formData.fgr_centile||null,
    doppler: formData.doppler||null, doppler_other: formData.doppler_other||null,
    placental_abnormality: formData.placental_abnormality||null,
    placental_type: formData.placental_type||null, placental_other: formData.placental_other||null,
    retroplacental_collection: formData.retroplacental_collection||null,
    aph: formData.aph||null, aph_type: formData.aph_type||null, aph_other: formData.aph_other||null,
    isoimmunization: formData.isoimmunization||null,
    pprom: formData.pprom||null, pprom_duration: formData.pprom_duration||null,
    preterm_labor: formData.preterm_labor||null, triple_i: formData.triple_i||null,
    maternal_fever: formData.maternal_fever||null, fetal_tachycardia: formData.fetal_tachycardia||null,
    maternal_tlc_high: formData.maternal_tlc_high||null,
    maternal_tachycardia: formData.maternal_tachycardia||null,
    maternal_abdominal_tenderness: formData.maternal_abdominal_tenderness||null,
    foul_smelling_liquor: formData.foul_smelling_liquor||null,
    maternal_uti: formData.maternal_uti||null, maternal_diarrhea: formData.maternal_diarrhea||null,
    msl: formData.msl||null, non_reactive_nst: formData.non_reactive_nst||null,
    reduced_fm: formData.reduced_fm||null, prolonged_labor: formData.prolonged_labor||null,
    cord_accident: formData.cord_accident||null, cord_accident_type: formData.cord_accident_type||null,
    fetal_bradycardia: formData.fetal_bradycardia||null,
    fetal_tachycardia_intrapartum: formData.fetal_tachycardia_intrapartum||null,
    duration_rom: formData.duration_rom||null,
    uterotonic: formData.uterotonic||null, uterotonic_timing: formData.uterotonic_timing||null,
  }), [formData]); // eslint-disable-line

  /* ── Save form ── */
  const saveForm = useCallback(async () => {
    setMessage("");
    
    if (!formData.enrollment_id) {
      setMessage("❌ Enrollment ID missing. Cannot save form.");
      return false;
    }
    
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const allFields = Object.keys(errs);
      setTouched(allFields.reduce((a, f) => ({ ...a, [f]: true }), {}));
      const list = Object.entries(errs).map(([f, msg]) => ({ label: msg || f, fieldName: f }));
      session.showMissing(list);
      return false;
    }
    try {
      if (isFormCLoaded) {
        await api.put(`/maternal-details/${formData.enrollment_id}`, buildPayload());
      } else {
        await api.post("/maternal-details/", buildPayload());
        setIsFormCLoaded(true);
      }
      setMessage("✅ Form C saved successfully");
      setIsSaved(true); setIsEditing(false);
      markFormCompleted("form_c");
      window.scrollTo({ top:0, behavior:"smooth" });
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      console.error("FormC save error:", err);
      setMessage("❌ Save failed — " + (err?.response?.data?.detail || err.message));
      return false;
    }
  }, [formData, isFormCLoaded, buildPayload, markFormCompleted, session]); // eslint-disable-line

  const handleNext     = async () => { const ok = await saveForm(); if (ok) navigate(`/form-d/${formData.enrollment_id}`); };
  const handlePrevious = () => navigate(-1);

  const scrollToFirstError = (list) => {
    if (!list?.length) return;
    const el = document.querySelector(`[name="${list[0].fieldName}"], #${list[0].fieldName}`);
    if (el) { el.scrollIntoView({ behavior:"smooth", block:"center" }); setTimeout(() => el.focus?.(), 400); }
  };

  /* ── Card error counts ── */
  const ce = {
    c1: ["mother_age","house","city","state","landmark","pincode","email_address"].filter(f => touched[f]&&errors[f]).length,
    c2: ["house","city","state","pincode","email_address"].filter(f => touched[f]&&errors[f]).length,
    c3: ["gravida","parity","abortions","live","still","booked","anc_visits","conception","artificial_type"].filter(f => touched[f]&&errors[f]).length,
    c4: ["antenatal_steroids","steroid_drug","steroid_doses","steroid_courses","lddi_known","lddi_hours","antenatal_mgso4","mgso4_date"].filter(f => touched[f]&&errors[f]).length,
    c5: ["medical_disorders","other_medical_disorder"].filter(f => touched[f]&&errors[f]).length,
    c6: ["hdp","hdp_type","gdm","gdm_rx","liquor","fgr","fgr_centile","doppler","doppler_other","placental_abnormality","placental_type","placental_other","retroplacental_collection","isoimmunization","aph","aph_type","aph_other"].filter(f => touched[f]&&errors[f]).length,
    c7: ["pprom","pprom_duration","preterm_labor","maternal_fever","fetal_tachycardia","maternal_tlc_high","maternal_tachycardia","maternal_abdominal_tenderness","foul_smelling_liquor","maternal_uti","maternal_diarrhea"].filter(f => touched[f]&&errors[f]).length,
    c8: ["msl","non_reactive_nst","reduced_fm","fetal_bradycardia","fetal_tachycardia_intrapartum","prolonged_labor","duration_rom","cord_accident","cord_accident_type","uterotonic","uterotonic_timing"].filter(f => touched[f]&&errors[f]).length,
  };

  if (!enrollmentId) return (
    <div style={{ padding:40, color:"red", fontSize:18, fontWeight:600 }}>
      ❌ Enrollment ID missing. Please open Form C from Dashboard or Form B.
    </div>
  );

  /* ─────────────────────────────── RENDER ── */
  const SectionHeader = ({ label, num, icon: Icon, errCount }) => (
    <div className="form-section-header">
      <div className="section-title-left">
        <Icon size={15} className="section-header-icon"/>
        <h3>{label}</h3>
      </div>
      {errCount > 0 && (
        <span className="card-error-badge">{errCount} error{errCount>1?"s":""}</span>
      )}
    </div>
  );

  return (
    <>
      <OfflineBanner isOnline={session.isOnline} offlineQueue={session.offlineQueue} />

      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot"/>
          Editing mode — unsaved changes will be lost if you navigate away
        </div>
      )}

      <form className={`screening-form${isSaved&&!isEditing?" readonly":""}`}
        onSubmit={e => { e.preventDefault(); saveForm(); }}>
        <fieldset>
          <div className="form-inner">

            {/* ── HEADER ── */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={12}/> FORM C</div>
                <h2 className="form-main-title">Maternal Details</h2>
                <p className="form-main-subtitle">Fill for randomized subjects only</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && <button type="button" className="btn-print-form" onClick={() => window.print()}>🖨️ Print</button>}
                {isSaved && (
                  <button type="button"
                    className={`btn-edit-form-header${isEditing?" editing-active":""}`}
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

            {/* ══════════════════════════════════════
                C1 — IDENTIFICATION
            ══════════════════════════════════════ */}
            <div className={`form-section card-section${ce.c1>0?" card-has-errors":""}`}>
              <SectionHeader label="C1 · Identification" num="C1" icon={User} errCount={ce.c1}/>
              <div className="form-section-body">
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>1. Enrollment ID <span className="field-note">(auto)</span></label>
                    <input value={formData.enrollment_id||""} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>2. Mother's Age (years)<span className="required">*</span></label>
                    <input type="number" name="mother_age" value={formData.mother_age||""}
                      onChange={handleChange} onBlur={handleBlur} min="15" max="55"
                      readOnly={!isFieldEditable}
                      className={E("mother_age")?"input-error":""}
                      onInput={ev=>{ if(ev.target.value.length>2) ev.target.value=ev.target.value.slice(0,2); }}/>
                    <FieldError msg={E("mother_age")}/>
                  </div>
                </div>

                {/* 3. Address — site-specific format */}
                <div className="form-group" style={{marginBottom:4}}>
                  <label>3. Address<span className="required">*</span></label>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>House No. / Flat / C/O<span className="required">*</span></label>
                    <input name="house" value={formData.house||""} onChange={handleChange} onBlur={handleBlur}
                      placeholder="House No / Flat / C/O"
                      readOnly={!isFieldEditable} className={E("house")?"input-error":""}/>
                    <FieldError msg={E("house")}/>
                  </div>
                  <div className="form-group">
                    <label>Village / VPO / City / Tehsil<span className="required">*</span></label>
                    <input name="city" value={formData.city||""} onChange={handleChange} onBlur={handleBlur}
                      placeholder="Village / VPO / City / Tehsil"
                      readOnly={!isFieldEditable} className={E("city")?"input-error":""}/>
                    <FieldError msg={E("city")}/>
                  </div>
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Police Station / District <span className="field-note">(optional)</span></label>
                    <input name="district" value={formData.district||""} onChange={handleChange}
                      placeholder="Police Station / District"
                      readOnly={!isFieldEditable}/>
                  </div>
                  <div className="form-group">
                    <label>State<span className="required">*</span></label>
                    <select name="state" value={formData.state||""} onChange={handleChange} onBlur={handleBlur}
                      disabled={!isFieldEditable} className={E("state")?"input-error":""}>
                      <option value="">-- Select --</option>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <FieldError msg={E("state")}/>
                  </div>
                  <div className="form-group">
                    <label>PIN Code <span className="field-note">(optional)</span></label>
                    <input name="pincode" value={formData.pincode||""}
                      readOnly={!isFieldEditable} className={E("pincode")?"input-error":""}
                      placeholder="6-digit PIN" inputMode="numeric"
                      onBlur={handleBlur}
                      onChange={ev => {
                        const v = ev.target.value.replace(/\D/g,"");
                        if (v.length<=6) { set({pincode:v}); touchField("pincode"); setErrors(p=>({...p,pincode:validateField("pincode",v,formData)})); }
                      }}/>
                    <FieldError msg={E("pincode")}/>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Nearest Landmark<span className="required">*</span></label>
                    <input name="landmark" value={formData.landmark||""} onChange={handleChange} onBlur={handleBlur}
                      placeholder="Nearest landmark"
                      readOnly={!isFieldEditable} className={E("landmark")?"input-error":""}/>
                    <FieldError msg={E("landmark")}/>
                  </div>
                  <div className="form-group">
                    <label>4. Email Address <span className="field-note">(optional)</span></label>
                    <input type="email" name="email_address" value={formData.email_address||""}
                      onChange={handleChange} onBlur={handleBlur} placeholder="patient@email.com"
                      readOnly={!isFieldEditable} className={E("email_address")?"input-error":""}/>
                    <FieldError msg={E("email_address")}/>
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>5. Mobile (Mother) <span className="field-note">(auto)</span></label>
                    <input value={formData.contact_mother||""} readOnly className="readonly-input"/>
                  </div>
                  <div className="form-group">
                    <label>5. Mobile (Husband) <span className="field-note">(auto)</span></label>
                    <input value={formData.contact_husband||""} readOnly className="readonly-input"/>
                  </div>
                </div>
                {formData.address && (
                  <div style={{fontSize:11,color:"#6b7280",marginTop:6,padding:"6px 10px",background:"#f8faff",borderRadius:6}}>
                    <strong>Full address:</strong> {formData.address}
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════
                C2 — OBSTETRIC HISTORY
            ══════════════════════════════════════ */}
            <div className={`form-section card-section${ce.c3>0?" card-has-errors":""}`}>
              <SectionHeader label="C2 · Obstetric History" num="C2" icon={Heart} errCount={ce.c3}/>
              <div className="form-section-body">
                {/* 6–10: GPAL */}
                <div className="form-grid-5">
                  {[
                    {name:"gravida",  label:"6. Gravida",      min:1, max:15},
                    {name:"parity",   label:"7. Parity",       min:0, max:15},
                    {name:"abortions",label:"8. Abortions",    min:0, max:15},
                    {name:"live",     label:"9. Live Births",  min:0, max:15},
                    {name:"still",    label:"10. Still Births",min:0, max:10},
                  ].map(({name,label,min,max}) => (
                    <div className="form-group" key={name}>
                      <label>{label}<span className="required">*</span></label>
                      <input type="text" name={name} value={formData[name]||""} inputMode="numeric"
                        placeholder={`${min}–${max}`} readOnly={!isFieldEditable}
                        className={E(name)?"input-error":""}
                        onBlur={handleBlur}
                        onChange={ev => {
                          const v = ev.target.value;
                          if (/^\d{0,2}$/.test(v)&&(v===""||Number(v)<=max)) {
                            set({[name]:v}); touchField(name);
                            setErrors(p=>({...p,[name]:validateField(name,v,{...formData,[name]:v})}));
                          }
                        }}/>
                      <FieldError msg={E(name)}/>
                    </div>
                  ))}
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Booking Status<span className="required">*</span></label>
                    <Toggle name="booked" value={formData.booked}
                      options={["Booked","Unbooked","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("booked")}/>
                  </div>
                  <div className="form-group">
                    <label>11. ANC Visits<span className="required">*</span></label>
                    <input type="text" name="anc_visits" value={formData.anc_visits||""}
                      inputMode="numeric" placeholder="0–20" readOnly={!isFieldEditable}
                      className={E("anc_visits")?"input-error":""}
                      onChange={ev=>{ const v=ev.target.value; if(/^\d{0,2}$/.test(v)&&(v===""||Number(v)<=20)){set({anc_visits:v});touchField("anc_visits");setErrors(p=>({...p,anc_visits:validateField("anc_visits",v,formData)}));} }}
                      onBlur={handleBlur}/>
                    <FieldError msg={E("anc_visits")}/>
                  </div>
                  <div className="form-group">
                    <label>12. Pregnancy Supervision <span className="field-note">(auto)</span></label>
                    <input name="pregnancy_supervision" value={formData.pregnancy_supervision||""}
                      readOnly className="readonly-input" placeholder="Calculated from ANC visits"/>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>13. Multiple Pregnancy<span className="required">*</span></label>
                    <Toggle name="multiple_yn"
                      value={formData.multiple==="No" ? "No" : "Yes"}
                      options={["Yes","No"]}
                      onChange={(_,val) => {
                        if (val==="No") handleToggle("multiple","No");
                        else if (formData.multiple==="No") handleToggle("multiple","Twin");
                      }} disabled={!isFieldEditable}/>
                  </div>
                  {formData.multiple!=="No" && (
                    <div className="form-group">
                      <label>14. If yes, type<span className="required">*</span></label>
                      <Toggle name="multiple" value={formData.multiple}
                        options={["Twin","Triplet","Quad","Other"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("multiple")}/>
                    </div>
                  )}
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>15. LMP <span className="field-note">(auto from Form A)</span></label>
                    <DatePicker selected={formData.lmp} readOnly
                      onChange={date => set({lmp:date})}
                      dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY" className="form-input"/>
                  </div>
                  <div className="form-group">
                    <label>16. EDD <span className="field-note">(auto from Form A)</span></label>
                    <DatePicker selected={formData.edd} readOnly
                      onChange={date => set({edd:date})}
                      dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY" className="form-input"/>
                  </div>
                  <div className="form-group">
                    <label>17. Conception Type<span className="required">*</span></label>
                    <Toggle name="conception" value={formData.conception}
                      options={[{label:"Spontaneous",value:"Spontaneous"},{label:"Assisted",value:"Artificial"}]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("conception")}/>
                  </div>
                </div>

                {formData.conception==="Artificial" && (
                  <div className="followup-box">
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>18. If Assisted, method<span className="required">*</span></label>
                        <Toggle name="artificial_type" value={formData.artificial_type}
                          options={["IVF","ICSI","Other"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("artificial_type")}/>
                      </div>
                      {formData.artificial_type==="Other" && (
                        <div className="form-group">
                          <label>Specify<span className="required">*</span></label>
                          <input name="artificial_other" value={formData.artificial_other||""}
                            onChange={handleChange} onBlur={handleBlur}
                            placeholder="Describe technique..." readOnly={!isFieldEditable}
                            className={E("artificial_other")?"input-error":""}/>
                          <FieldError msg={E("artificial_other")}/>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════
                C2 cont. — ANTENATAL TREATMENT (19–27)
            ══════════════════════════════════════ */}
            <div className={`form-section card-section${ce.c4>0?" card-has-errors":""}`}>
              <SectionHeader label="C2 cont. · Antenatal Treatment" num="C2" icon={Shield} errCount={ce.c4}/>
              <div className="form-section-body">
                {/* 19–21: Steroids */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>19. Antenatal Steroids<span className="required">*</span></label>
                    <Toggle name="antenatal_steroids" value={formData.antenatal_steroids}
                      options={["Yes","No","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("antenatal_steroids")}/>
                  </div>
                  <div/>
                </div>

                {formData.antenatal_steroids==="Yes" && (
                  <div className="followup-box">
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>20. Drug<span className="required">*</span></label>
                        <Toggle name="steroid_drug" value={formData.steroid_drug}
                          options={["Betamethasone","Dexamethasone"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("steroid_drug")}/>
                      </div>
                      <div className="form-group">
                        <label>21. No. of Doses<span className="required">*</span></label>
                        <Toggle name="steroid_doses" value={String(formData.steroid_doses)}
                          options={["1","2","3","4"].map(v=>({label:v,value:v}))}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("steroid_doses")}/>
                      </div>
                    </div>
                    {/* 22–23: LDDI */}
                    <div className="form-grid-2" style={{marginTop:12}}>
                      <div className="form-group">
                        <label>22. LDDI<span className="required">*</span></label>
                        <Toggle name="lddi_known" value={formData.lddi_known}
                          options={["Known","Not known"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("lddi_known")}/>
                      </div>
                      {formData.lddi_known==="Known" && (
                        <div className="form-group">
                          <label>23. If known: hrs<span className="required">*</span></label>
                          <input type="number" name="lddi_hours" value={formData.lddi_hours||""}
                            onChange={handleChange} onBlur={handleBlur} min="0" max="99" placeholder="0–99 hrs"
                            readOnly={!isFieldEditable} className={E("lddi_hours")?"input-error":""}/>
                          <FieldError msg={E("lddi_hours")}/>
                        </div>
                      )}
                    </div>
                    {/* 24: Number of Courses */}
                    <div className="form-grid-2" style={{marginTop:12}}>
                      <div className="form-group">
                        <label>24. Number of Courses<span className="required">*</span></label>
                        <Toggle name="steroid_courses" value={String(formData.steroid_courses)}
                          options={["1","2","3","4"].map(v=>({label:v,value:v}))}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("steroid_courses")}/>
                      </div>
                      <div/>
                    </div>
                  </div>
                )}

                {/* 25–27: MgSO4 */}
                <div className="form-grid-2" style={{marginTop:8}}>
                  <div className="form-group">
                    <label>25. Antenatal MgSO₄<span className="required">*</span></label>
                    <Toggle name="antenatal_mgso4" value={formData.antenatal_mgso4}
                      options={["Yes","No","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("antenatal_mgso4")}/>
                  </div>
                  <div/>
                </div>

                {formData.antenatal_mgso4==="Yes" && (
                  <div className="followup-box">
                    <div className="form-grid-3">
                      <div className="form-group">
                        <label>26. Date of Administration<span className="required">*</span></label>
                        <DatePicker
                          selected={formData.mgso4_date ? new Date(formData.mgso4_date) : null}
                          onChange={date => { set({mgso4_date:date}); touchField("mgso4_date"); setErrors(p=>({...p,mgso4_date:validateField("mgso4_date",date,formData)})); }}
                          dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY"
                          className={E("mgso4_date")?"input-error":""}
                          readOnly={!isFieldEditable}/>
                        <FieldError msg={E("mgso4_date")}/>
                      </div>
                      <div className="form-group">
                        <label>27. Gestation at admin <span className="field-note">(auto)</span></label>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <input value={formData.mgso4_gestation_weeks||""} readOnly className="readonly-input" placeholder="wks" style={{width:70}}/>
                          <span style={{fontSize:12,color:"#6b7280"}}>wks</span>
                          <input value={formData.mgso4_gestation_days||""} readOnly className="readonly-input" placeholder="days" style={{width:60}}/>
                          <span style={{fontSize:12,color:"#6b7280"}}>days</span>
                        </div>
                      </div>
                      <div/>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════
                C3 — MATERNAL MEDICAL DISORDERS (28)
            ══════════════════════════════════════ */}
            <div className={`form-section card-section${ce.c5>0?" card-has-errors":""}`}>
              <SectionHeader label="C3 · Maternal Medical Disorders" num="C3" icon={Shield} errCount={ce.c5}/>
              <div className="form-section-body">
                <div className="form-group-label" style={{marginBottom:8,fontSize:13,fontWeight:600,color:"#374151"}}>
                  28. Any known medical disorder: <span className="required">*</span> <span style={{fontSize:11,fontWeight:400,color:"#6b7280"}}>(select all that apply)</span>
                </div>
                {E("medical_disorders") && (
                  <div className="alert-danger" style={{marginBottom:12}}>⚠️ {E("medical_disorders")}</div>
                )}
                <div className="disorder-card-grid">
                  {[
                    {name:"no_known_medical_disorder", label:"No Known Medical Disorder", always:true},
                    {name:"chronic_hypertension",  label:"Chronic Hypertension"},
                    {name:"hepatitis",             label:"Hepatitis"},
                    {name:"heart_disease",         label:"Heart Disease"},
                    {name:"renal_disease",         label:"Renal Disease"},
                    {name:"vdrl_positive",         label:"VDRL +"},
                    {name:"seizure_disorder",      label:"Seizure Disorder"},
                    {name:"asthma",                label:"Asthma"},
                    {name:"hypothyroidism",        label:"Hypothyroidism"},
                    {name:"hyperthyroidism",       label:"Hyperthyroidism"},
                    {name:"severe_anemia",         label:"Severe Anemia (Hb<8)"},
                    {name:"tb",                    label:"Tuberculosis"},
                    {name:"malaria",               label:"Malaria"},
                    {name:"hiv",                   label:"HIV"},
                    {name:"other_medical_checkbox",label:"Other"},
                  ].map(({name,label,always}) => {
                    const disabled = (!always&&formData.no_known_medical_disorder)||!isFieldEditable;
                    return (
                      <label key={name}
                        className={`disorder-card${formData[name]?" disorder-card--selected":""}${disabled?" disorder-card--disabled":""}`}>
                        <input type="checkbox" name={name} checked={!!formData[name]}
                          onChange={ev => {
                            handleChange(ev);
                            touchField("medical_disorders");
                            const willBeChecked = ev.target.checked;
                            setTimeout(() => {
                              setErrors(p => {
                                const anyNow = ["chronic_hypertension","hepatitis","heart_disease","renal_disease","vdrl_positive","seizure_disorder","asthma","hypothyroidism","hyperthyroidism","tb","malaria","hiv","severe_anemia","other_medical_checkbox"].some(f => f===name ? willBeChecked : formData[f]);
                                const noKnown = name==="no_known_medical_disorder" ? willBeChecked : formData.no_known_medical_disorder;
                                return {...p, medical_disorders: (!noKnown&&!anyNow) ? "Select at least one disorder" : ""};
                              });
                            }, 0);
                          }}
                          disabled={disabled} style={{display:"none"}}/>
                        <span className="disorder-card__check">{formData[name]?"✓":""}</span>
                        <span className="disorder-card__label">{label}</span>
                      </label>
                    );
                  })}
                </div>
                {formData.other_medical_checkbox && (
                  <div className="followup-box" style={{marginTop:12}}>
                    <div className="form-group">
                      <label>Specify other disorder<span className="required">*</span></label>
                      <input name="other_medical_disorder" value={formData.other_medical_disorder||""}
                        onChange={handleChange} onBlur={handleBlur} placeholder="Describe..."
                        readOnly={!isFieldEditable} className={E("other_medical_disorder")?"input-error":""}/>
                      <FieldError msg={E("other_medical_disorder")}/>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════
                C4 — OBSTETRIC PROBLEMS (29–42)
            ══════════════════════════════════════ */}
            <div className={`form-section card-section${ce.c6>0?" card-has-errors":""}`}>
              <SectionHeader label="C4 · Obstetric Problems" num="C4" icon={Activity} errCount={ce.c6}/>
              <div className="form-section-body">

                {/* 29–30: HDP */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">HDP (Hypertensive Disorders of Pregnancy)</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>29. HDP<span className="required">*</span></label>
                      <Toggle name="hdp" value={formData.hdp} options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("hdp")}/>
                    </div>
                    {formData.hdp==="Yes" && (
                      <div className="form-group">
                        <label>30. If yes, type<span className="required">*</span></label>
                        <Toggle name="hdp_type" value={formData.hdp_type}
                          options={["Gest HTN","PE","Severe PE","Eclampsia"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("hdp_type")}/>
                      </div>
                    )}
                  </div>
                </div>

                {/* 31–32: GDM */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">GDM / Liquor</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>31. GDM<span className="required">*</span></label>
                      <Toggle name="gdm" value={formData.gdm} options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("gdm")}/>
                    </div>
                    <div/>
                  </div>
                  {formData.gdm==="Yes" && (
                    <div className="followup-box">
                      <label className="followup-label">32. If yes, Rx <span className="required">*</span> <span style={{fontSize:11,fontWeight:400,color:"#6b7280"}}>(multiple allowed)</span></label>
                      <div className="rx-horizontal-group">
                        {[{label:"MNT",value:"MNT"},{label:"Insulin",value:"Insulin"},{label:"Oral Anti-Diabetic",value:"Oral"}].map(item => (
                          <button key={item.value} type="button"
                            className={`rx-horizontal-btn${formData.gdm_rx.includes(item.value)?" active":""}`}
                            onClick={() => isFieldEditable&&handleGdmRxChange(item.value)}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                      {E("gdm_rx")&&<div className="field-error">{E("gdm_rx")}</div>}
                    </div>
                  )}
                  <div className="form-grid-2" style={{marginTop:12}}>
                    <div className="form-group">
                      <label>33. Liquor<span className="required">*</span></label>
                      <Toggle name="liquor" value={formData.liquor}
                        options={["Normal","Absent/Oligo","Poly","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("liquor")}/>
                    </div>
                    <div/>
                  </div>
                </div>

                {/* 34–35: FGR */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">FGR</div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>34. FGR<span className="required">*</span></label>
                      <Toggle name="fgr" value={formData.fgr} options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("fgr")}/>
                    </div>
                    {formData.fgr==="Yes" && (
                      <div className="form-group">
                        <label>35. Centile<span className="required">*</span></label>
                        <input type="number" name="fgr_centile" value={formData.fgr_centile||""}
                          onChange={handleChange} onBlur={handleBlur} min="1" max="100" placeholder="1–100"
                          readOnly={!isFieldEditable} className={E("fgr_centile")?"input-error":""}/>
                        <FieldError msg={E("fgr_centile")}/>
                      </div>
                    )}
                    <div/>
                  </div>
                </div>

                {/* 36: Doppler */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Doppler</div>
                  <div className="form-group">
                    <label>36. Doppler<span className="required">*</span></label>
                    <Toggle name="doppler" value={formData.doppler}
                      options={["Normal","AEDF","REDF","Not done","Not known","Other"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("doppler")}/>
                  </div>
                  {formData.doppler==="Other" && (
                    <div className="followup-box">
                      <div className="form-group">
                        <label>Specify<span className="required">*</span></label>
                        <input name="doppler_other" value={formData.doppler_other||""}
                          onChange={handleChange} onBlur={handleBlur}
                          readOnly={!isFieldEditable} className={E("doppler_other")?"input-error":""}/>
                        <FieldError msg={E("doppler_other")}/>
                      </div>
                    </div>
                  )}
                </div>

                {/* 37–39: Placental */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Placental Abnormalities</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>37. Placental Abnormality<span className="required">*</span></label>
                      <Toggle name="placental_abnormality" value={formData.placental_abnormality}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("placental_abnormality")}/>
                    </div>
                    {formData.placental_abnormality==="Yes" && (
                      <div className="form-group">
                        <label>38. If yes, type<span className="required">*</span></label>
                        <Toggle name="placental_type" value={formData.placental_type}
                          options={["Previa","Accreta","Others"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("placental_type")}/>
                      </div>
                    )}
                  </div>
                  {formData.placental_abnormality==="Yes" && (formData.placental_type==="Others"||formData.placental_type==="Other") && (
                    <div className="followup-box">
                      <div className="form-group">
                        <label>Specify<span className="required">*</span></label>
                        <input name="placental_other" value={formData.placental_other||""}
                          onChange={handleChange} onBlur={handleBlur}
                          readOnly={!isFieldEditable} className={E("placental_other")?"input-error":""}/>
                        <FieldError msg={E("placental_other")}/>
                      </div>
                    </div>
                  )}
                  <div className="form-grid-2" style={{marginTop:12}}>
                    <div className="form-group">
                      <label>39. Retroplacental Collection<span className="required">*</span></label>
                      <Toggle name="retroplacental_collection" value={formData.retroplacental_collection}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("retroplacental_collection")}/>
                    </div>
                    <div/>
                  </div>
                </div>

                {/* 40–41: APH */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">APH</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>40. APH<span className="required">*</span></label>
                      <Toggle name="aph" value={formData.aph} options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("aph")}/>
                    </div>
                    {formData.aph==="Yes" && (
                      <div className="form-group">
                        <label>41. If yes, type<span className="required">*</span></label>
                        <Toggle name="aph_type" value={formData.aph_type}
                          options={[{label:"Abruption",value:"Placental Abruption"},{label:"Previa",value:"Vasa Previa"},{label:"Other",value:"Other"}]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("aph_type")}/>
                      </div>
                    )}
                  </div>
                  {formData.aph==="Yes"&&formData.aph_type==="Other" && (
                    <div className="followup-box">
                      <div className="form-group">
                        <label>Specify<span className="required">*</span></label>
                        <input name="aph_other" value={formData.aph_other||""}
                          onChange={handleChange} onBlur={handleBlur}
                          readOnly={!isFieldEditable} className={E("aph_other")?"input-error":""}/>
                        <FieldError msg={E("aph_other")}/>
                      </div>
                    </div>
                  )}
                </div>

                {/* 42: Isoimmunization */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Isoimmunization</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>42. Isoimmunization<span className="required">*</span></label>
                      <Toggle name="isoimmunization" value={formData.isoimmunization}
                        options={["Yes","No"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("isoimmunization")}/>
                    </div>
                    <div/>
                  </div>
                </div>

              </div>
            </div>

            {/* ══════════════════════════════════════
                C5 — EVIDENCE OF INFECTION (43–54)
            ══════════════════════════════════════ */}
            <div className={`form-section card-section${ce.c7>0?" card-has-errors":""}`}>
              <SectionHeader label="C5 · Evidence of Infection" num="C5" icon={AlertTriangle} errCount={ce.c7}/>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>43. pPROM<span className="required">*</span></label>
                    <Toggle name="pprom" value={formData.pprom} options={["Yes","No"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("pprom")}/>
                    {formData.pprom==="Yes" && (
                      <div style={{marginTop:8}}>
                        <label style={{fontSize:12,fontWeight:600,color:"#374151"}}>44. Duration (hrs)<span className="required">*</span></label>
                        <input type="number" name="pprom_duration" value={formData.pprom_duration||""}
                          onChange={handleChange} onBlur={handleBlur} min="0" max="99" placeholder="0–99 hrs"
                          readOnly={!isFieldEditable} className={E("pprom_duration")?"input-error":""}/>
                        <FieldError msg={E("pprom_duration")}/>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>45. Preterm Labor<span className="required">*</span></label>
                    <Toggle name="preterm_labor" value={formData.preterm_labor}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("preterm_labor")}/>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>46. Maternal Fever (≥39℃ or 38–39℃ ×2)<span className="required">*</span></label>
                    <Toggle name="maternal_fever" value={formData.maternal_fever}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_fever")}/>
                  </div>
                  <div className="form-group">
                    <label>47. Baseline Fetal Tachycardia (&gt;160 bpm)<span className="required">*</span></label>
                    <Toggle name="fetal_tachycardia" value={formData.fetal_tachycardia}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("fetal_tachycardia")}/>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>48. Maternal TLC &gt;15000/mm³<span className="required">*</span></label>
                    <Toggle name="maternal_tlc_high" value={formData.maternal_tlc_high}
                      options={["Yes","No","Not done"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_tlc_high")}/>
                  </div>
                  <div className="form-group">
                    <label>49. Maternal Tachycardia<span className="required">*</span></label>
                    <Toggle name="maternal_tachycardia" value={formData.maternal_tachycardia}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_tachycardia")}/>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>50. Maternal Abdominal Tenderness<span className="required">*</span></label>
                    <Toggle name="maternal_abdominal_tenderness" value={formData.maternal_abdominal_tenderness}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_abdominal_tenderness")}/>
                  </div>
                  {/* Field 51: Triple I — auto-calculated from fields 46-50, 52-54 */}
                  <div className="form-group">
                    <label>51. Triple "I" (Intra-uterine Inflammation/Infection) <span className="field-note">(auto filled)</span></label>
                    <input
                      value={
                        [formData.maternal_fever, formData.fetal_tachycardia,
                         formData.maternal_tlc_high, formData.maternal_tachycardia,
                         formData.maternal_abdominal_tenderness, formData.foul_smelling_liquor]
                          .filter(v => v === "Yes").length >= 2
                          ? "Yes" : (
                          [formData.maternal_fever, formData.fetal_tachycardia,
                           formData.maternal_tlc_high, formData.maternal_tachycardia,
                           formData.maternal_abdominal_tenderness, formData.foul_smelling_liquor]
                            .every(v => v !== "")
                          ? "No" : "")
                      }
                      readOnly className="readonly-input" placeholder="Auto-calculated"/>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>52. Foul-Smelling Liquor<span className="required">*</span></label>
                    <Toggle name="foul_smelling_liquor" value={formData.foul_smelling_liquor}
                      options={["Yes","No","Not known"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("foul_smelling_liquor")}/>
                  </div>
                  <div className="form-group">
                    <label>53. Maternal UTI<span className="required">*</span></label>
                    <Toggle name="maternal_uti" value={formData.maternal_uti}
                      options={["Yes","No","Not known"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_uti")}/>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>54. Maternal Diarrhea<span className="required">*</span></label>
                    <Toggle name="maternal_diarrhea" value={formData.maternal_diarrhea}
                      options={["Yes","No","Not known"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_diarrhea")}/>
                  </div>
                  <div/>
                </div>

              </div>
            </div>

            {/* ══════════════════════════════════════
                C6 — INTRAPARTUM EVENTS (55–63)
            ══════════════════════════════════════ */}
            <div className={`form-section card-section${ce.c8>0?" card-has-errors":""}`}>
              <SectionHeader label="C6 · Intrapartum Events" num="C6" icon={Zap} errCount={ce.c8}/>
              <div className="form-section-body">

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Fetal Monitoring &amp; Labor</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>55. MSL<span className="required">*</span></label>
                      <Toggle name="msl" value={formData.msl} options={["Yes","No"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("msl")}/>
                    </div>
                    <div className="form-group">
                      <label>56. Non-reactive NST<span className="required">*</span></label>
                      <Toggle name="non_reactive_nst" value={formData.non_reactive_nst}
                        options={["Yes","No","Not done"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("non_reactive_nst")}/>
                    </div>
                  </div>
                  <div className="form-grid-2" style={{marginTop:12}}>
                    <div className="form-group">
                      <label>57. Reduced Fetal Movements<span className="required">*</span></label>
                      <Toggle name="reduced_fm" value={formData.reduced_fm}
                        options={["Yes","No","Not done"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("reduced_fm")}/>
                    </div>
                    <div className="form-group">
                      <label>58. Prolonged Labor<span className="required">*</span></label>
                      <Toggle name="prolonged_labor" value={formData.prolonged_labor}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("prolonged_labor")}/>
                    </div>
                  </div>
                  <div className="form-grid-2" style={{marginTop:12}}>
                    <div className="form-group">
                      <label>Duration of ROM (hrs) <span className="field-note">(required if pPROM = Yes)</span></label>
                      <input type="number" name="duration_rom" value={formData.duration_rom||""}
                        onChange={handleChange} onBlur={handleBlur} min="0" max="99" placeholder="0–99"
                        readOnly={!isFieldEditable} className={E("duration_rom")?"input-error":""}
                        onInput={ev=>{ if(ev.target.value.length>2) ev.target.value=ev.target.value.slice(0,2); }}/>
                      <FieldError msg={E("duration_rom")}/>
                    </div>
                    <div/>
                  </div>
                </div>

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Cord</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>59. Cord Accident<span className="required">*</span></label>
                      <Toggle name="cord_accident" value={formData.cord_accident}
                        options={["Yes","No"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("cord_accident")}/>
                    </div>
                    {formData.cord_accident==="Yes" && (
                      <div className="form-group">
                        <label>60. If yes, type<span className="required">*</span></label>
                        <Toggle name="cord_accident_type" value={formData.cord_accident_type}
                          options={["Cord around neck","True cord knot","Cord prolapse"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("cord_accident_type")}/>
                      </div>
                    )}
                  </div>
                </div>

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Fetal Heart Rate</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>61. Fetal Bradycardia (&lt;110 bpm)<span className="required">*</span></label>
                      <Toggle name="fetal_bradycardia" value={formData.fetal_bradycardia}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("fetal_bradycardia")}/>
                    </div>
                    <div className="form-group">
                      <label>62. Fetal Tachycardia (&gt;160 bpm)<span className="required">*</span></label>
                      <Toggle name="fetal_tachycardia_intrapartum" value={formData.fetal_tachycardia_intrapartum}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("fetal_tachycardia_intrapartum")}/>
                    </div>
                  </div>
                </div>

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Intrapartum Pharmacology</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>63. Uterotonic<span className="required">*</span></label>
                      <Toggle name="uterotonic" value={formData.uterotonic}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("uterotonic")}/>
                    </div>
                    {formData.uterotonic==="Yes" && (
                      <div className="form-group">
                        <label>If yes, timing<span className="required">*</span></label>
                        <Toggle name="uterotonic_timing" value={formData.uterotonic_timing}
                          options={["Before cord clamp","After cord clamp"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("uterotonic_timing")}/>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Notes */}
            <NotesBox formKey={`form_c_${enrollmentId||"new"}`}/>

            {message && (
              <div className={`form-message${message.startsWith("✅")?" msg-success":" msg-error"}`}>{message}</div>
            )}

          </div>
        </fieldset>
      </form>

      {/* ── NAV BAR (shared component) ── */}
      <FormNavBar
        session={session}
        onBack={handlePrevious}
        onSave={saveForm}
        onSaveDraft={session.saveDraft}
        onNext={handleNext}
        backLabel="Birth & Resuscitation"
        nextLabel="Postnatal Day 1"
        step={3} totalSteps={17}
        isSaved={isSaved}
      />

      {/* ── MODALS (shared component) ── */}
      <FormModals
        session={session}
        onKeepEditing={() => session.setShowDraftModal(false)}
        onGoToDashboard={() => { session.setShowDraftModal(false); navigate("/dashboard"); }}
      />
    </>
  );
}
