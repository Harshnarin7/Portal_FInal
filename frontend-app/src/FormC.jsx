import React, { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
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

/* ── Segmented toggle ── */
function Toggle({ name, value, options, onChange, disabled, error }) {
  const isActive = (opt) => {
    const v = typeof opt === "object" ? opt.value : opt;
    if (value === v) return true;
    if (v === "Yes"  && value === true)  return true;
    if (v === "No"   && value === false) return true;
    return String(value) === String(v);
  };
  const isWide = options.length > 3;
  return (
    <>
      <div className={`emr-toggle-group${isWide ? " wide-toggle" : ""}${disabled ? " disabled" : ""}${error ? " toggle-error" : ""}`}>
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
      {error && <div className="field-error">{error}</div>}
    </>
  );
}

/* ── FieldError helper ── */
const FieldError = ({ msg }) => msg ? <div className="field-error">{msg}</div> : null;

export default function FormC() {
  const navigate = useNavigate();
  const { enrollmentId } = useParams();
  const { markFormCompleted } = useFormProgress();
  const location = useLocation();
  const { patientData } = usePatient();
  const isEditMode = location.state?.fromEdit === true;

  const [isSaved,      setIsSaved]      = useState(false);
  const [isEditing,    setIsEditing]    = useState(false);
  const [message,      setMessage]      = useState("");
  const [isFormCLoaded, setIsFormCLoaded] = useState(false); // true = record exists in DB → use PUT

  /* ── Validation errors state ── */
  const [errors, setErrors] = useState({});
  /* ── Track which fields have been interacted with ── */
  const [touched, setTouched] = useState({});

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

  /* ════════════════════════════════════════════
     useEFFECTS — all unchanged
  ════════════════════════════════════════════ */

  useEffect(() => {
    const parts = [formData.house, formData.city, formData.district, formData.state, formData.pincode];
    const computed = parts.filter(Boolean).join(", ");
    if (computed) setFormData(prev => ({ ...prev, address: computed }));
  }, [formData.house, formData.city, formData.district, formData.state, formData.pincode]);

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

        // Always load Form A / PII data for readonly identification fields
        if (screeningId) {
          const resA = await api.get(`/screenings/${screeningId}`);
          formAData = resA.data;
          try {
            const piiRes = await api.get(`/pii/screening/${screeningId}`);
            formAData = { ...formAData, ...piiRes.data };
          } catch (_) {}
        }

        // Always attempt to load existing Form C data (covers back-navigation from Form D)
        try {
          const resC = await api.get(`/maternal-details/${enrollmentId}`);
          if (resC.data) {
            formCData = resC.data;
            setIsFormCLoaded(true); // record exists → use PUT on next save
          }
        } catch (_) {
          // 404 = no record yet, that's fine
          setIsFormCLoaded(false);
        }

        // Safe bool→string converter with correct null fallback per toggle options
        const fromBool = (val, nullVal = "") => {
          if (val === true)  return "Yes";
          if (val === false) return "No";
          return nullVal; // null/undefined → caller-specified fallback
        };

        // Signal to the no_known_medical_disorder useEffect not to clear disorders on this render
        if (formCData) disordersLoadedFromDb.current = true;

        setFormData(prev => ({
          ...prev,
          enrollment_id:   enrollmentId,
          mother_name:     `${formAData?.mother_first_name || ""} ${formAData?.mother_surname || ""}`.trim(),
          maternal_uid:    formAData?.maternal_uid || "",
          contact_mother:  formAData?.contact_mother  || formAData?.mother_contact  || "",
          contact_husband: formAData?.contact_husband || formAData?.husband_contact || "",

          ...(formCData ? {
            // ── Card 1 ──
            mother_age: formCData.mother_age ?? prev.mother_age,

            // ── Card 2: Address (individual fields from participant_pii via GET) ──
            house:         formCData.house         ?? prev.house,
            city:          formCData.city          ?? prev.city,
            district:      formCData.district      ?? prev.district,
            state:         formCData.state         ?? prev.state,
            pincode:       formCData.pincode        ?? prev.pincode,
            landmark:      formCData.landmark       ?? prev.landmark,
            email_address: formCData.email_address  ?? prev.email_address,

            // ── Card 3: Obstetric History ──
            gravida:         formCData.gravida    ?? prev.gravida,
            parity:          formCData.parity     ?? prev.parity,
            abortions:       formCData.abortions  ?? prev.abortions,
            live:            formCData.live        ?? prev.live,
            still:           formCData.still       ?? prev.still,
            booked:          formCData.booked ?? prev.booked,  // stored as "Booked"/"Unbooked"/"Not known"
            anc_visits:      formCData.anc_visits  ?? prev.anc_visits,
            multiple:        formCData.multiple    ?? prev.multiple,
            conception:      formCData.conception  ?? prev.conception,
            artificial_type: formCData.artificial_type  ?? prev.artificial_type,
            artificial_other:formCData.artificial_other ?? prev.artificial_other, // FIX: was missing

        // ── Card 4: Antenatal Treatment — String columns, load directly ──
            antenatal_steroids: formCData.antenatal_steroids ?? prev.antenatal_steroids,
            steroid_drug:       formCData.steroid_drug    ?? prev.steroid_drug,
            steroid_doses:      formCData.steroid_doses   != null ? String(formCData.steroid_doses) : prev.steroid_doses,
            steroid_courses:    formCData.steroid_courses != null ? String(formCData.steroid_courses) : prev.steroid_courses,
            lddi_known:         formCData.lddi_known ?? (
              formCData.lddi_hours != null ? "Known" : prev.lddi_known
            ),
            lddi_hours:         formCData.lddi_hours ?? prev.lddi_hours,
            antenatal_mgso4:    formCData.antenatal_mgso4 ?? prev.antenatal_mgso4,
            mgso4_gestation_weeks: formCData.mgso4_gestation_weeks ?? prev.mgso4_gestation_weeks,
            mgso4_gestation_days:  formCData.mgso4_gestation_days  ?? prev.mgso4_gestation_days,

            // ── Card 5: Medical Disorders (bool columns, load directly) ──
            chronic_hypertension: formCData.chronic_hypertension ?? false,
            hepatitis:            formCData.hepatitis        ?? false,
            heart_disease:        formCData.heart_disease    ?? false,
            renal_disease:        formCData.renal_disease    ?? false,
            vdrl_positive:        formCData.vdrl_positive    ?? false,
            seizure_disorder:     formCData.seizure_disorder ?? false,
            asthma:               formCData.asthma           ?? false,
            hiv:                  formCData.hiv              ?? false,
            hypothyroidism:       formCData.thyroid          ?? false, // backend merged field
            hyperthyroidism:      false,                               // FIX: was missing; backend merged, so load false
            tb:                   formCData.tb               ?? false,
            malaria:              formCData.malaria          ?? false,
            severe_anemia:        formCData.severe_anemia    ?? false,
            other_medical_disorder:  formCData.other_medical_disorder ?? prev.other_medical_disorder,
            other_medical_checkbox:  !!formCData.other_medical_disorder, // FIX: was missing — derive from field presence
            no_known_medical_disorder: !(              // computed last so useEffect doesn't clobber
              formCData.chronic_hypertension || formCData.hepatitis ||
              formCData.heart_disease || formCData.renal_disease ||
              formCData.vdrl_positive || formCData.seizure_disorder ||
              formCData.asthma || formCData.hiv || formCData.thyroid ||
              formCData.tb || formCData.malaria || formCData.severe_anemia ||
              formCData.other_medical_disorder
            ),

            // ── Card 6: Obstetric Problems — String columns, load directly ──
            hdp:      formCData.hdp      ?? prev.hdp,
            hdp_type: formCData.hdp_type ?? prev.hdp_type,
            gdm:      formCData.gdm      ?? prev.gdm,
            gdm_rx:   formCData.gdm_rx ? formCData.gdm_rx.split(", ").map(s => s.trim()) : prev.gdm_rx,
            liquor:   formCData.liquor ?? prev.liquor,
            fgr:      formCData.fgr    ?? prev.fgr,
            fgr_centile:   formCData.fgr_centile   ?? prev.fgr_centile,
            doppler:       formCData.doppler        ?? prev.doppler,
            doppler_other: formCData.doppler_other  ?? prev.doppler_other,
            placental_abnormality:     formCData.placental_abnormality     ?? prev.placental_abnormality,
            placental_type:            formCData.placental_type  ?? prev.placental_type,
            placental_other:           formCData.placental_other ?? prev.placental_other,
            retroplacental_collection: formCData.retroplacental_collection ?? prev.retroplacental_collection,
            aph:      formCData.aph      ?? prev.aph,
            aph_type: formCData.aph_type ?? prev.aph_type,
            aph_other:formCData.aph_other ?? prev.aph_other,
            isoimmunization: formCData.isoimmunization ?? prev.isoimmunization,

            // ── Card 7: Evidence of Infection — String columns, load directly ──
            pprom:          formCData.pprom          ?? prev.pprom,
            pprom_duration: formCData.pprom_duration ?? prev.pprom_duration,
            preterm_labor:  formCData.preterm_labor  ?? prev.preterm_labor,
            triple_i:       formCData.triple_i       ?? prev.triple_i,
            maternal_fever:                formCData.maternal_fever                ?? prev.maternal_fever,
            fetal_tachycardia:             formCData.fetal_tachycardia             ?? prev.fetal_tachycardia,
            maternal_tlc_high:             formCData.maternal_tlc_high             ?? prev.maternal_tlc_high,
            maternal_tachycardia:          formCData.maternal_tachycardia          ?? prev.maternal_tachycardia,
            maternal_abdominal_tenderness: formCData.maternal_abdominal_tenderness ?? prev.maternal_abdominal_tenderness,
            foul_smelling_liquor:          formCData.foul_smelling_liquor          ?? prev.foul_smelling_liquor,
            maternal_uti:                  formCData.maternal_uti                  ?? prev.maternal_uti,
            maternal_diarrhea:             formCData.maternal_diarrhea             ?? prev.maternal_diarrhea,

            // ── Card 8: Intrapartum Events — String columns, load directly ──
            msl:              formCData.msl              ?? prev.msl,
            non_reactive_nst: formCData.non_reactive_nst ?? prev.non_reactive_nst,
            reduced_fm:       formCData.reduced_fm       ?? prev.reduced_fm,
            prolonged_labor:  formCData.prolonged_labor  ?? prev.prolonged_labor,
            cord_accident:      formCData.cord_accident      ?? prev.cord_accident,
            cord_accident_type: formCData.cord_accident_type ?? prev.cord_accident_type,
            fetal_bradycardia:             formCData.fetal_bradycardia             ?? prev.fetal_bradycardia,
            fetal_tachycardia_intrapartum: formCData.fetal_tachycardia_intrapartum ?? prev.fetal_tachycardia_intrapartum,
            duration_rom:    formCData.duration_rom    ?? prev.duration_rom,
            uterotonic:      formCData.uterotonic      ?? prev.uterotonic,
            uterotonic_timing: formCData.uterotonic_timing ?? prev.uterotonic_timing,
          } : {}),

          // Dates handled outside the formCData spread to ensure Date objects
          lmp:       formCData?.lmp       ? new Date(formCData.lmp)
                   : formAData?.lmp_date  ? new Date(formAData.lmp_date)
                   : prev.lmp || null,
          edd:       formCData?.edd                   ? new Date(formCData.edd)
                   : formAData?.expected_delivery_date ? new Date(formAData.expected_delivery_date)
                   : prev.edd || null,
          mgso4_date: formCData?.mgso4_date ? new Date(formCData.mgso4_date) : prev.mgso4_date || "",
        }));

        if (formCData || isEditMode) setIsSaved(true);
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

  // Guard flag: prevents the no_known_medical_disorder useEffect from
  // wiping disorder checkboxes right after fetchData populates them.
  const disordersLoadedFromDb = React.useRef(false);

  useEffect(() => {
    // Skip the clear-all if we just loaded data from DB (fetchData sets this flag)
    if (disordersLoadedFromDb.current) {
      disordersLoadedFromDb.current = false;
      return;
    }
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

  /* ════════════════════════════════════════════
     HANDLERS — all unchanged
  ════════════════════════════════════════════ */
  /* ════════════════════════════════════════════
     LIVE FIELD VALIDATOR
     Called on every change/blur — returns the
     error string for a single field (or "").
  ════════════════════════════════════════════ */
  const validateField = (name, value, data) => {
    const d = { ...data, [name]: value };

    switch (name) {
      // ── Card 1 ──
      case "mother_age":
        if (value === "" || value === null || value === undefined) return "Mother's age is required";
        if (Number(value) < 15 || Number(value) > 55) return "Age must be between 15 and 55 years";
        return "";

      // ── Card 2 ──
      case "house":
        return value?.trim() ? "" : "House / Street is required";
      case "city":
        return value?.trim() ? "" : "Village / City is required";
      case "state":
        return value ? "" : "State is required";
      case "pincode":
        if (!value) return "";
        return /^\d{6}$/.test(value) ? "" : "PIN code must be exactly 6 digits";
      case "email_address":
        if (!value) return "";
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "" : "Enter a valid email address";

      // ── Card 3 ──
      case "gravida":
        if (value === "") return "Gravida is required";
        if (Number(value) < 1) return "Gravida must be at least 1";
        return "";
      case "parity":
        if (value === "") return "Parity is required";
        if (d.gravida !== "" && Number(value) >= Number(d.gravida)) return "Parity must be less than Gravida";
        return "";
      case "abortions":
        return value === "" ? "Abortions is required" : "";
      case "live":
        if (value === "") return "Live births is required";
        if (d.parity !== "" && Number(value) > Number(d.parity)) return "Live births cannot exceed Parity";
        return "";
      case "still":
        if (value === "") return "Still births is required";
        if (d.parity !== "" && Number(value) > Number(d.parity)) return "Still births cannot exceed Parity";
        return "";
      case "booked":
        return value ? "" : "Booking status is required";
      case "anc_visits":
        return (value === "" || value === null || value === undefined) ? "ANC visits is required" : "";
      case "conception":
        return value ? "" : "Conception method is required";
      case "artificial_type":
        return (d.conception === "Artificial" && !value) ? "Assisted method type is required" : "";
      case "artificial_other":
        return (d.artificial_type === "Other" && !value?.trim()) ? "Please specify the ART method" : "";

      // ── Card 4 ──
      case "antenatal_steroids":
        return value ? "" : "Antenatal steroids field is required";
      case "steroid_drug":
        return (d.antenatal_steroids === "Yes" && !value) ? "Steroid drug is required" : "";
      case "steroid_doses":
        return (d.antenatal_steroids === "Yes" && !value) ? "Number of doses is required" : "";
      case "steroid_courses":
        return (d.antenatal_steroids === "Yes" && !value) ? "Number of courses is required" : "";
      case "lddi_known":
        return (d.antenatal_steroids === "Yes" && !value) ? "LDDI status is required" : "";
      case "lddi_hours":
        if (d.lddi_known !== "Known") return "";
        if (value === "" || value === null || value === undefined) return "LDDI hours is required";
        if (Number(value) < 0 || Number(value) > 99) return "LDDI must be 0–99 hours";
        return "";
      case "antenatal_mgso4":
        return value ? "" : "Antenatal MgSO₄ field is required";
      case "mgso4_date":
        return (d.antenatal_mgso4 === "Yes" && !value) ? "Date of MgSO₄ administration is required" : "";

      // ── Card 5 ──
      case "other_medical_disorder":
        return (d.other_medical_checkbox && !value?.trim()) ? "Please specify the medical disorder" : "";

      // ── Card 6 ──
      case "hdp":
        return value ? "" : "HDP is required";
      case "hdp_type":
        return (d.hdp === "Yes" && !value) ? "HDP type is required" : "";
      case "gdm":
        return value ? "" : "GDM is required";
      case "gdm_rx":
        return (d.gdm === "Yes" && (!value || value.length === 0)) ? "At least one Rx treatment must be selected" : "";
      case "liquor":
        return value ? "" : "Liquor status is required";
      case "fgr":
        return value ? "" : "FGR is required";
      case "fgr_centile":
        if (d.fgr !== "Yes") return "";
        if (value === "" || value === undefined) return "Centile is required";
        if (Number(value) < 1 || Number(value) > 100) return "Centile must be 1–100";
        return "";
      case "doppler":
        return value ? "" : "Doppler findings are required";
      case "doppler_other":
        return (d.doppler === "Other" && !value?.trim()) ? "Please specify the Doppler finding" : "";
      case "placental_abnormality":
        return value ? "" : "Placental abnormality is required";
      case "placental_type":
        return (d.placental_abnormality === "Yes" && !value) ? "Placental abnormality type is required" : "";
      case "placental_other":
        return ((d.placental_type === "Others" || d.placental_type === "Other") && !value?.trim())
          ? "Please specify the placental abnormality" : "";
      case "retroplacental_collection":
        return value ? "" : "Retroplacental collection is required";
      case "isoimmunization":
        return value ? "" : "Isoimmunization is required";
      case "aph":
        return value ? "" : "APH is required";
      case "aph_type":
        return (d.aph === "Yes" && !value) ? "APH type is required" : "";
      case "aph_other":
        return (d.aph_type === "Other" && !value?.trim()) ? "Please specify the APH type" : "";

      // ── Card 7 ──
      case "pprom":
        return value ? "" : "pPROM is required";
      case "pprom_duration":
        if (d.pprom !== "Yes") return "";
        if (value === "" || value === null || value === undefined) return "Duration of pPROM is required";
        if (Number(value) < 0 || Number(value) > 99) return "Duration must be 0–99 hours";
        return "";
      case "preterm_labor":
        return value ? "" : "Preterm labor is required";
      case "triple_i":
        return value ? "" : "Triple I is required";
      case "maternal_fever":
        return value ? "" : "Maternal fever is required";
      case "fetal_tachycardia":
        return value ? "" : "Baseline fetal tachycardia is required";
      case "maternal_tlc_high":
        return value ? "" : "Maternal TLC is required";
      case "maternal_tachycardia":
        return value ? "" : "Maternal tachycardia is required";
      case "maternal_abdominal_tenderness":
        return value ? "" : "Abdominal tenderness is required";
      case "foul_smelling_liquor":
        return value ? "" : "Foul-smelling liquor is required";
      case "maternal_uti":
        return value ? "" : "Maternal UTI is required";
      case "maternal_diarrhea":
        return value ? "" : "Maternal diarrhea is required";

      // ── Card 8 ──
      case "msl":
        return value ? "" : "MSL is required";
      case "non_reactive_nst":
        return value ? "" : "Non-reactive NST is required";
      case "reduced_fm":
        return value ? "" : "Reduced fetal movements is required";
      case "fetal_bradycardia":
        return value ? "" : "Fetal bradycardia is required";
      case "fetal_tachycardia_intrapartum":
        return value ? "" : "Fetal tachycardia (intrapartum) is required";
      case "prolonged_labor":
        return value ? "" : "Prolonged labor is required";
      case "duration_rom":
        if (value === "" || value === null || value === undefined) return "Duration of ROM is required";
        if (Number(value) < 0 || Number(value) > 99) return "Duration must be 0–99 hours";
        return "";
      case "cord_accident":
        return value ? "" : "Cord accident is required";
      case "cord_accident_type":
        return (d.cord_accident === "Yes" && !value) ? "Type of cord accident is required" : "";
      case "uterotonic":
        return value ? "" : "Uterotonic is required";
      case "uterotonic_timing":
        return (d.uterotonic === "Yes" && !value) ? "Uterotonic timing is required" : "";

      default:
        return "";
    }
  };

  const touchField = (name) =>
    setTouched(prev => ({ ...prev, [name]: true }));

  const handleGdmRxChange = (value) => {
    const newRx = formData.gdm_rx.includes(value)
      ? formData.gdm_rx.filter(v => v !== value)
      : [...formData.gdm_rx, value];
    setFormData(prev => ({ ...prev, gdm_rx: newRx }));
    // live validate gdm_rx
    const err = (formData.gdm === "Yes" && newRx.length === 0)
      ? "At least one Rx treatment must be selected" : "";
    setErrors(prev => ({ ...prev, gdm_rx: err }));
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
    // live validate
    touchField(name);
    const err = validateField(name, newValue, formData);
    setErrors(prev => ({ ...prev, [name]: err }));
  };

  const handleToggle = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    touchField(name);
    const err = validateField(name, value, formData);
    setErrors(prev => ({ ...prev, [name]: err }));
  };

  /* Blur handler — shows error when user leaves a field without changing it */
  const handleBlur = (e) => {
    const { name, value } = e.target;
    touchField(name);
    const err = validateField(name, value, formData);
    setErrors(prev => ({ ...prev, [name]: err }));
  };

  const yesNoToBool = (v) => {
    if (v === "Yes" || v === true) return true;
    if (v === "No"  || v === false) return false;
    return null;
  };
  const num = (v) => (v === "" || v === undefined) ? null : Number(v);

  /* ════════════════════════════════════════════
     VALIDATION
  ════════════════════════════════════════════ */
  const validate = (data = formData) => {
    const e = {};

    // ── Card 1: Maternal Identification ──
    if (!data.mother_age || data.mother_age === "") {
      e.mother_age = "Mother's age is required";
    } else if (Number(data.mother_age) < 15 || Number(data.mother_age) > 55) {
      e.mother_age = "Age must be between 15 and 55 years";
    }

    // ── Card 2: Address & Contact ──
    if (!data.house?.trim()) e.house = "House / Street is required";
    if (!data.city?.trim())  e.city  = "Village / City is required";
    if (!data.state)         e.state = "State is required";
    if (data.pincode && !/^\d{6}$/.test(data.pincode))
      e.pincode = "PIN code must be exactly 6 digits";
    if (data.email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_address))
      e.email_address = "Enter a valid email address";

    // ── Card 3: Obstetric History ──
    ["gravida","parity","abortions","live","still"].forEach(f => {
      if (data[f] === "" || data[f] === undefined || data[f] === null)
        e[f] = `${f.charAt(0).toUpperCase() + f.slice(1)} is required`;
    });
    if (data.gravida !== "" && Number(data.gravida) < 1)
      e.gravida = "Gravida must be at least 1";
    if (data.parity !== "" && data.gravida !== "" &&
        Number(data.parity) >= Number(data.gravida))
      e.parity = "Parity must be less than Gravida";
    if (data.live !== "" && data.parity !== "" &&
        Number(data.live) > Number(data.parity))
      e.live = "Live births cannot exceed Parity";
    if (data.still !== "" && data.parity !== "" &&
        Number(data.still) > Number(data.parity))
      e.still = "Still births cannot exceed Parity";

    if (!data.booked)    e.booked    = "Booking status is required";
    if (data.anc_visits === "" || data.anc_visits === null || data.anc_visits === undefined)
      e.anc_visits = "ANC visits is required";
    if (!data.multiple)  e.multiple  = "Multiple pregnancy status is required";
    if (data.multiple !== "No" && !data.multiple)
      e.multiple = "Multiplicity type is required";
    if (!data.conception) e.conception = "Conception method is required";
    if (data.conception === "Artificial") {
      if (!data.artificial_type) e.artificial_type = "Assisted method type is required";
      if (data.artificial_type === "Other" && !data.artificial_other?.trim())
        e.artificial_other = "Please specify the ART method";
    }

    // ── Card 4: Antenatal Treatment ──
    if (!data.antenatal_steroids) e.antenatal_steroids = "Antenatal steroids field is required";
    if (data.antenatal_steroids === "Yes") {
      if (!data.steroid_drug)    e.steroid_drug    = "Steroid drug is required";
      if (!data.steroid_doses)   e.steroid_doses   = "Number of doses is required";
      if (!data.steroid_courses) e.steroid_courses = "Number of courses is required";
      if (!data.lddi_known)      e.lddi_known      = "LDDI status is required";
      if (data.lddi_known === "Known") {
        if (data.lddi_hours === "" || data.lddi_hours === null || data.lddi_hours === undefined)
          e.lddi_hours = "LDDI hours is required";
        else if (Number(data.lddi_hours) < 0 || Number(data.lddi_hours) > 99)
          e.lddi_hours = "LDDI must be between 0 and 99 hours";
      }
    }
    if (!data.antenatal_mgso4) e.antenatal_mgso4 = "Antenatal MgSO₄ field is required";
    if (data.antenatal_mgso4 === "Yes") {
      if (!data.mgso4_date) e.mgso4_date = "Date of MgSO₄ administration is required";
    }

    // ── Card 5: Maternal Medical Disorders ──
    const anyDisorder = [
      data.chronic_hypertension, data.hepatitis, data.heart_disease,
      data.renal_disease, data.vdrl_positive, data.seizure_disorder,
      data.asthma, data.hypothyroidism, data.hyperthyroidism,
      data.tb, data.malaria, data.hiv, data.severe_anemia,
      data.other_medical_checkbox,
    ].some(Boolean);
    if (!data.no_known_medical_disorder && !anyDisorder)
      e.medical_disorders = "Select at least one disorder or 'No Known Medical Disorder'";
    if (data.other_medical_checkbox && !data.other_medical_disorder?.trim())
      e.other_medical_disorder = "Please specify the medical disorder";

    // ── Card 6: Obstetric Problems ──
    if (!data.hdp) e.hdp = "HDP is required";
    if (data.hdp === "Yes" && !data.hdp_type) e.hdp_type = "HDP type is required";
    if (!data.gdm) e.gdm = "GDM is required";
    if (data.gdm === "Yes" && data.gdm_rx.length === 0)
      e.gdm_rx = "At least one Rx treatment must be selected";
    if (!data.liquor) e.liquor = "Liquor status is required";
    if (!data.fgr) e.fgr = "FGR is required";
    if (data.fgr === "Yes") {
      if (data.fgr_centile === "" || data.fgr_centile === undefined)
        e.fgr_centile = "Centile is required when FGR is Yes";
      else if (Number(data.fgr_centile) < 1 || Number(data.fgr_centile) > 100)
        e.fgr_centile = "Centile must be between 1 and 100";
    }
    if (!data.doppler) e.doppler = "Doppler findings are required";
    if (data.doppler === "Other" && !data.doppler_other?.trim())
      e.doppler_other = "Please specify the Doppler finding";
    if (!data.placental_abnormality) e.placental_abnormality = "Placental abnormality is required";
    if (data.placental_abnormality === "Yes") {
      if (!data.placental_type) e.placental_type = "Placental abnormality type is required";
      if ((data.placental_type === "Others" || data.placental_type === "Other") &&
          !data.placental_other?.trim())
        e.placental_other = "Please specify the placental abnormality";
    }
    if (!data.retroplacental_collection) e.retroplacental_collection = "Retroplacental collection is required";
    if (!data.isoimmunization) e.isoimmunization = "Isoimmunization is required";
    if (!data.aph) e.aph = "APH is required";
    if (data.aph === "Yes") {
      if (!data.aph_type) e.aph_type = "APH type is required";
      if (data.aph_type === "Other" && !data.aph_other?.trim())
        e.aph_other = "Please specify the APH type";
    }

    // ── Card 7: Evidence of Infection ──
    if (!data.pprom) e.pprom = "pPROM is required";
    if (data.pprom === "Yes") {
      if (data.pprom_duration === "" || data.pprom_duration === null || data.pprom_duration === undefined)
        e.pprom_duration = "Duration of pPROM is required";
      else if (Number(data.pprom_duration) < 0 || Number(data.pprom_duration) > 99)
        e.pprom_duration = "Duration must be between 0 and 99 hours";
    }
    if (!data.preterm_labor) e.preterm_labor = "Preterm labor is required";
    if (!data.triple_i) e.triple_i = "Triple I is required";
    if (!data.maternal_fever) e.maternal_fever = "Maternal fever is required";
    if (!data.fetal_tachycardia) e.fetal_tachycardia = "Baseline fetal tachycardia is required";
    if (!data.maternal_tlc_high) e.maternal_tlc_high = "Maternal TLC is required";
    if (!data.maternal_tachycardia) e.maternal_tachycardia = "Maternal tachycardia is required";
    if (!data.maternal_abdominal_tenderness) e.maternal_abdominal_tenderness = "Abdominal tenderness is required";
    if (!data.foul_smelling_liquor) e.foul_smelling_liquor = "Foul-smelling liquor is required";
    if (!data.maternal_uti) e.maternal_uti = "Maternal UTI is required";
    if (!data.maternal_diarrhea) e.maternal_diarrhea = "Maternal diarrhea is required";

    // ── Card 8: Intrapartum Events ──
    if (!data.msl) e.msl = "MSL is required";
    if (!data.non_reactive_nst) e.non_reactive_nst = "Non-reactive NST is required";
    if (!data.reduced_fm) e.reduced_fm = "Reduced fetal movements is required";
    if (!data.fetal_bradycardia) e.fetal_bradycardia = "Fetal bradycardia is required";
    if (!data.fetal_tachycardia_intrapartum)
      e.fetal_tachycardia_intrapartum = "Fetal tachycardia (intrapartum) is required";
    if (!data.prolonged_labor) e.prolonged_labor = "Prolonged labor is required";
    if (data.duration_rom === "" || data.duration_rom === null || data.duration_rom === undefined)
      e.duration_rom = "Duration of ROM is required";
    else if (Number(data.duration_rom) < 0 || Number(data.duration_rom) > 99)
      e.duration_rom = "Duration must be between 0 and 99 hours";
    if (!data.cord_accident) e.cord_accident = "Cord accident is required";
    if (data.cord_accident === "Yes" && !data.cord_accident_type)
      e.cord_accident_type = "Type of cord accident is required";
    if (!data.uterotonic) e.uterotonic = "Uterotonic is required";
    if (data.uterotonic === "Yes" && !data.uterotonic_timing)
      e.uterotonic_timing = "Uterotonic timing is required";

    return e;
  };

  /* ── Missing-field summary for modal ── */
  const getMissingSummary = (errs) => Object.values(errs).filter(Boolean);

  /* ── Convert "Yes"→true, "No"→false, anything else→null ── */
  const toBool = (v) => {
    if (v === "Yes" || v === true)  return true;
    if (v === "No"  || v === false) return false;
    return null;   // "Not known", "Not done", "" → null (Optional[bool] accepts null)
  };
  const toInt  = (v) => (v === "" || v === null || v === undefined) ? null : parseInt(v, 10);

  const buildPayload = () => ({
    // ── Identification ──
    enrollment_id:   formData.enrollment_id   || null,
    mother_name:     formData.mother_name     || null,
    mother_age:      toInt(formData.mother_age),
    maternal_uid:    formData.maternal_uid    || null,
    contact_mother:  formData.contact_mother  || null,
    contact_husband: formData.contact_husband || null,
    address:         formData.address         || null,
    // Individual address fields — stored in participant_pii for lossless round-trip
    house:           formData.house           || null,
    city:            formData.city            || null,
    district:        formData.district        || null,
    state:           formData.state           || null,
    pincode:         formData.pincode         || null,
    landmark:        formData.landmark        || null,
    email_address:   formData.email_address   || null,

    // ── Obstetric History — all String columns ──
    gravida:    formData.gravida    || null,
    parity:     formData.parity     || null,
    abortions:  formData.abortions  || null,
    live:       formData.live       || null,
    still:      formData.still      || null,
    anc_visits: formData.anc_visits || null,
    booked:     formData.booked     || null,  // "Booked"/"Unbooked"/"Not known"
    multiple:   formData.multiple   || null,

    lmp: formData.lmp ? formData.lmp.toISOString().split("T")[0] : null,
    edd: formData.edd ? formData.edd.toISOString().split("T")[0] : null,
    conception:       formData.conception       || null,
    artificial_type:  formData.artificial_type  || null,
    artificial_other: formData.artificial_other || null,

    // ── Antenatal Treatment — String columns ──
    antenatal_steroids:    formData.antenatal_steroids    || null,
    steroid_date:          formData.steroid_date          || null,
    steroid_drug:          formData.steroid_drug          || null,
    steroid_doses:         formData.steroid_doses         || null,
    steroid_courses:       formData.steroid_courses       || null,
    lddi_known:            formData.lddi_known            || null,
    lddi_hours:            formData.lddi_hours            || null,
    antenatal_mgso4:       formData.antenatal_mgso4       || null,
    gestation_at_steroids: formData.gestation_at_steroids || null,
    mgso4_date: formData.mgso4_date
      ? new Date(formData.mgso4_date).toISOString().split("T")[0] : null,
    mgso4_gestation_weeks: toInt(formData.mgso4_gestation_weeks),
    mgso4_gestation_days:  toInt(formData.mgso4_gestation_days),

    // ── Medical Disorders — Boolean columns ──
    chronic_hypertension: formData.chronic_hypertension || false,
    hepatitis:            formData.hepatitis            || false,
    heart_disease:        formData.heart_disease        || false,
    renal_disease:        formData.renal_disease        || false,
    vdrl_positive:        formData.vdrl_positive        || false,
    seizure_disorder:     formData.seizure_disorder     || false,
    asthma:               formData.asthma               || false,
    hiv:                  formData.hiv                  || false,
    thyroid:              (formData.hypothyroidism || formData.hyperthyroidism) || false,
    tb:                   formData.tb                   || false,
    malaria:              formData.malaria              || false,
    severe_anemia:        formData.severe_anemia        || false,
    other_medical_disorder: formData.other_medical_disorder || null,

    // ── Obstetric Problems — String columns ──
    hdp:      formData.hdp      || null,
    hdp_type: formData.hdp_type || null,
    gdm:      formData.gdm      || null,
    gdm_rx:   formData.gdm_rx.join(", ") || null,
    liquor:   formData.liquor   || null,
    fgr:      formData.fgr      || null,
    fgr_centile:               formData.fgr_centile    || null,
    doppler:                   formData.doppler        || null,
    doppler_other:             formData.doppler_other  || null,
    placental_abnormality:     formData.placental_abnormality     || null,
    placental_type:            formData.placental_type            || null,
    placental_other:           formData.placental_other           || null,
    retroplacental_collection: formData.retroplacental_collection || null,
    aph:      formData.aph      || null,
    aph_type: formData.aph_type || null,
    aph_other:formData.aph_other|| null,
    isoimmunization: formData.isoimmunization || null,

    // ── Evidence of Infection — String columns ──
    pprom:          formData.pprom          || null,
    pprom_duration: formData.pprom_duration || null,
    preterm_labor:  formData.preterm_labor  || null,
    triple_i:       formData.triple_i       || null,
    maternal_fever:                formData.maternal_fever                || null,
    fetal_tachycardia:             formData.fetal_tachycardia             || null,
    maternal_tlc_high:             formData.maternal_tlc_high             || null,
    maternal_tachycardia:          formData.maternal_tachycardia          || null,
    maternal_abdominal_tenderness: formData.maternal_abdominal_tenderness || null,
    foul_smelling_liquor:          formData.foul_smelling_liquor          || null,
    maternal_uti:                  formData.maternal_uti                  || null,
    maternal_diarrhea:             formData.maternal_diarrhea             || null,

    // ── Intrapartum Events — String columns ──
    msl:              formData.msl              || null,
    non_reactive_nst: formData.non_reactive_nst || null,
    reduced_fm:       formData.reduced_fm       || null,
    prolonged_labor:  formData.prolonged_labor  || null,
    cord_accident:      formData.cord_accident      || null,
    cord_accident_type: formData.cord_accident_type || null,
    fetal_bradycardia:             formData.fetal_bradycardia             || null,
    fetal_tachycardia_intrapartum: formData.fetal_tachycardia_intrapartum || null,
    duration_rom:    formData.duration_rom    || null,
    uterotonic:      formData.uterotonic      || null,
    uterotonic_timing: formData.uterotonic_timing || null,
  });

  const saveForm = async () => {
    setMessage("");
    const errs = validate();
    setErrors(errs);
    // Mark every field as touched so all errors appear at once
    const allFields = Object.keys(errs).concat([
      "mother_age","house","city","state","pincode","email_address",
      "gravida","parity","abortions","live","still","booked","anc_visits",
      "conception","artificial_type","artificial_other",
      "antenatal_steroids","steroid_drug","steroid_doses","steroid_courses",
      "lddi_known","lddi_hours","antenatal_mgso4","mgso4_date",
      "medical_disorders","other_medical_disorder",
      "hdp","hdp_type","gdm","gdm_rx","liquor","fgr","fgr_centile",
      "doppler","doppler_other","placental_abnormality","placental_type",
      "placental_other","retroplacental_collection","isoimmunization",
      "aph","aph_type","aph_other",
      "pprom","pprom_duration","preterm_labor","triple_i","maternal_fever",
      "fetal_tachycardia","maternal_tlc_high","maternal_tachycardia",
      "maternal_abdominal_tenderness","foul_smelling_liquor","maternal_uti","maternal_diarrhea",
      "msl","non_reactive_nst","reduced_fm","fetal_bradycardia",
      "fetal_tachycardia_intrapartum","prolonged_labor","duration_rom",
      "cord_accident","cord_accident_type","uterotonic","uterotonic_timing",
    ]);
    setTouched(allFields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));

    if (Object.keys(errs).length > 0) {
      setMessage(`❌ Please fix ${Object.keys(errs).length} error(s) before saving`);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      console.error(err.response?.data || err);
      setMessage("❌ Save failed. Please try again.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setTouched(Object.keys(errs).reduce((acc, f) => ({ ...acc, [f]: true }), {}));
    if (Object.keys(errs).length > 0) {
      setMessage(`❌ Please fix ${Object.keys(errs).length} error(s)`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      if (isFormCLoaded) {
        await api.put(`/maternal-details/${formData.enrollment_id}`, buildPayload());
      } else {
        await api.post("/maternal-details/", buildPayload());
        setIsFormCLoaded(true);
      }
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

  /* show error only for touched fields */
  const E = (field) => touched[field] ? errors[field] : "";

  /* ── Card completion badges: count errors in touched fields only ── */
  const cardTouchedErrors = {
    c1: ["mother_age"].filter(f => touched[f] && errors[f]).length,
    c2: ["house","city","state","pincode","email_address"].filter(f => touched[f] && errors[f]).length,
    c3: ["gravida","parity","abortions","live","still","booked","anc_visits","conception","multiple","artificial_type","artificial_other"].filter(f => touched[f] && errors[f]).length,
    c4: ["antenatal_steroids","steroid_drug","steroid_doses","steroid_courses","lddi_known","lddi_hours","antenatal_mgso4","mgso4_date"].filter(f => touched[f] && errors[f]).length,
    c5: ["medical_disorders","other_medical_disorder"].filter(f => touched[f] && errors[f]).length,
    c6: ["hdp","hdp_type","gdm","gdm_rx","liquor","fgr","fgr_centile","doppler","doppler_other","placental_abnormality","placental_type","placental_other","retroplacental_collection","isoimmunization","aph","aph_type","aph_other"].filter(f => touched[f] && errors[f]).length,
    c7: ["pprom","pprom_duration","preterm_labor","triple_i","maternal_fever","fetal_tachycardia","maternal_tlc_high","maternal_tachycardia","maternal_abdominal_tenderness","foul_smelling_liquor","maternal_uti","maternal_diarrhea"].filter(f => touched[f] && errors[f]).length,
    c8: ["msl","non_reactive_nst","reduced_fm","fetal_bradycardia","fetal_tachycardia_intrapartum","prolonged_labor","duration_rom","cord_accident","cord_accident_type","uterotonic","uterotonic_timing"].filter(f => touched[f] && errors[f]).length,
  };

  const totalTouchedErrors = Object.values(cardTouchedErrors).reduce((a, b) => a + b, 0);

  return (
    <>
      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode Active — changes will be saved when you click Save
        </div>
      )}

      {/* ── Validation summary banner ── */}
      {totalTouchedErrors > 0  && (
        <div className="validation-summary-banner">
          <span className="validation-summary-icon">⚠️</span>
          <span><strong>{totalTouchedErrors} field{totalTouchedErrors > 1 ? "s" : ""} need{totalTouchedErrors === 1 ? "s" : ""} attention</strong> — scroll down to review and fix errors</span>
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
                <p className="form-main-subtitle">Maternal and Obstetric Information</p>
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
            <div className={`form-section card-section${cardTouchedErrors.c1 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <User size={18} className="section-header-icon" />
                  <h3>Maternal Identification</h3>
                </div>
                {cardTouchedErrors.c1 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c1} error{cardTouchedErrors.c1 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Enrollment ID</label>
                    <input value={formData.enrollment_id || ""} readOnly className="readonly-input" />
                  </div>
                  <div className="form-group">
                    <label>Mother's Age (years) <span className="required">*</span></label>
                    <input
                      type="number" name="mother_age" value={formData.mother_age || ""}
                      onChange={handleChange} onBlur={handleBlur} min="15" max="55"
                      readOnly={!isFieldEditable}
                      className={E("mother_age") ? "input-error" : ""}
                      onInput={ev => { if (ev.target.value.length > 2) ev.target.value = ev.target.value.slice(0,2); }}
                    />
                    <FieldError msg={E("mother_age")} />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 2 — ADDRESS & CONTACT DETAILS
            ═══════════════════════════════════════════ */}
            <div className={`form-section card-section${cardTouchedErrors.c2 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <User size={18} className="section-header-icon" />
                  <h3>Address &amp; Contact Details</h3>
                </div>
                {cardTouchedErrors.c2 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c2} error{cardTouchedErrors.c2 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">
                <div className="emr-address-section">
                  <div className="emr-address-title">Residential Address</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>House No. / Flat / Street <span className="required">*</span></label>
                      <input name="house" value={formData.house || ""} onChange={handleChange} onBlur={handleBlur}
                        readOnly={!isFieldEditable}
                        className={`emr-input${E("house") ? " input-error" : ""}`} />
                      <FieldError msg={E("house")} />
                    </div>
                    <div className="form-group">
                      <label>Village / City / Tehsil <span className="required">*</span></label>
                      <input name="city" value={formData.city || ""} onChange={handleChange} onBlur={handleBlur}
                        readOnly={!isFieldEditable}
                        className={`emr-input${E("city") ? " input-error" : ""}`} />
                      <FieldError msg={E("city")} />
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
                      <select name="state" value={formData.state || ""} onChange={handleChange} onBlur={handleBlur}
                        disabled={!isFieldEditable}
                        className={`emr-select${E("state") ? " input-error" : ""}`}>
                        <option value="">-- Select --</option>
                        {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <FieldError msg={E("state")} />
                    </div>
                    <div className="form-group">
                      <label>PIN Code</label>
                      <input name="pincode" value={formData.pincode || ""}
                        readOnly={!isFieldEditable}
                        className={`emr-input${E("pincode") ? " input-error" : ""}`}
                        onBlur={handleBlur}
                        onChange={ev => {
                          const v = ev.target.value.replace(/\D/g,"");
                          if (v.length <= 6) {
                            setFormData(p => ({ ...p, pincode: v }));
                            touchField("pincode");
                            setErrors(p => ({ ...p, pincode: validateField("pincode", v, formData) }));
                          }
                        }} />
                      <FieldError msg={E("pincode")} />
                    </div>
                  </div>
                  <div className="form-grid-1">
                    <div className="form-group">
                      <label>Nearest Landmark</label>
                      <input name="landmark" value={formData.landmark || ""} onChange={handleChange}
                        readOnly={!isFieldEditable} className="emr-input" />
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>Email Address</label>
                      <input type="email" name="email_address" value={formData.email_address || ""}
                        onChange={handleChange} onBlur={handleBlur} placeholder="patient@email.com"
                        readOnly={!isFieldEditable}
                        className={`emr-input${E("email_address") ? " input-error" : ""}`} />
                      <FieldError msg={E("email_address")} />
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
            <div className={`form-section card-section${cardTouchedErrors.c3 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <Heart size={18} className="section-header-icon" />
                  <h3>Obstetric History</h3>
                </div>
                {cardTouchedErrors.c3 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c3} error{cardTouchedErrors.c3 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">
                {/* GPAL */}
                <div className="form-grid-5">
                  {[
                    { name:"gravida",  label:"Gravida",    min:1, max:15 },
                    { name:"parity",   label:"Parity",     min:0, max:15 },
                    { name:"abortions",label:"Abortions",  min:0, max:15 },
                    { name:"live",     label:"Live Births",min:0, max:15 },
                    { name:"still",    label:"Still Births",min:0, max:10 },
                  ].map(({ name, label, min, max }) => (
                    <div className="form-group" key={name}>
                      <label>{label} <span className="required">*</span></label>
                      <input type="text" name={name} value={formData[name] || ""}
                        required inputMode="numeric" placeholder={`${min}–${max}`}
                        readOnly={!isFieldEditable}
                        className={`emr-input${E(name) ? " input-error" : ""}`}
                        onBlur={handleBlur}
                        onChange={ev => {
                          const v = ev.target.value;
                          if (/^\d{0,2}$/.test(v) && (v===""||Number(v)<=max)) {
                            setFormData(p => ({ ...p, [name]: v }));
                            touchField(name);
                            setErrors(p => ({ ...p, [name]: validateField(name, v, { ...formData, [name]: v }) }));
                          }
                        }} />
                      <FieldError msg={E(name)} />
                    </div>
                  ))}
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Booking Status <span className="required">*</span></label>
                    <Toggle name="booked" value={formData.booked}
                      options={["Booked","Unbooked","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("booked")} />
                  </div>
                  <div className="form-group">
                    <label>ANC Visits <span className="required">*</span></label>
                    <input type="text" name="anc_visits" value={formData.anc_visits || ""}
                      required inputMode="numeric" placeholder="0–20"
                      readOnly={!isFieldEditable}
                      className={`emr-input${E("anc_visits") ? " input-error" : ""}`}
                      onChange={ev => {
                        const v = ev.target.value;
                        if (/^\d{0,2}$/.test(v) && (v===""||Number(v)<=20)) {
                          setFormData(p => ({ ...p, anc_visits: v }));
                          touchField("anc_visits");
                          setErrors(p => ({ ...p, anc_visits: validateField("anc_visits", v, formData) }));
                        }
                      }}
                      onBlur={handleBlur} />
                    <FieldError msg={E("anc_visits")} />
                  </div>
                  <div className="form-group">
                    <label>Pregnancy Supervision <span className="auto-tag">(AUTO)</span></label>
                    <input name="pregnancy_supervision" value={formData.pregnancy_supervision || ""}
                      readOnly className="readonly-input emr-input"
                      placeholder="Calculated from ANC visits" />
                  </div>
                </div>

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
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("multiple")} />
                    </div>
                  )}
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>LMP <span className="auto-tag">FROM FORM A</span></label>
                    <DatePicker selected={formData.lmp} readOnly
                      onChange={date => setFormData(p => ({ ...p, lmp: date }))}
                      dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY" className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>EDD <span className="auto-tag">FROM FORM A</span></label>
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
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("conception")} />
                  </div>
                </div>

                {formData.conception === "Artificial" && (
                  <div className="followup-box">
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Assisted Method Type <span className="required">*</span></label>
                        <Toggle name="artificial_type" value={formData.artificial_type}
                          options={["IVF","ICSI","Other"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("artificial_type")} />
                      </div>
                      <div />
                    </div>
                    {formData.artificial_type === "Other" && (
                      <div className="emr-specify-panel">
                        <div className="form-group">
                          <label>Specify ART Details <span className="required">*</span></label>
                          <input type="text" name="artificial_other"
                            value={formData.artificial_other || ""}
                            onChange={ev => {
                              const v = ev.target.value.replace(/[^a-zA-Z ]/g,"");
                              setFormData(p => ({ ...p, artificial_other: v }));
                              touchField("artificial_other");
                              setErrors(p => ({ ...p, artificial_other: validateField("artificial_other", v, formData) }));
                            }}
                            onBlur={handleBlur}
                            placeholder="Describe technique..."
                            readOnly={!isFieldEditable}
                            className={`emr-input${E("artificial_other") ? " input-error" : ""}`} />
                          <FieldError msg={E("artificial_other")} />
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
            <div className={`form-section card-section${cardTouchedErrors.c4 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <Shield size={18} className="section-header-icon" />
                  <h3>Antenatal Treatment</h3>
                </div>
                {cardTouchedErrors.c4 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c4} error{cardTouchedErrors.c4 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Antenatal Steroids <span className="required">*</span></label>
                    <Toggle name="antenatal_steroids" value={formData.antenatal_steroids}
                      options={["Yes","No","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("antenatal_steroids")} />
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
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("steroid_drug")} />
                      </div>
                      <div className="form-group">
                        <label>Doses <span className="required">*</span></label>
                        <Toggle name="steroid_doses" value={String(formData.steroid_doses)}
                          options={[{label:"1",value:"1"},{label:"2",value:"2"},{label:"3",value:"3"},{label:"4",value:"4"}]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("steroid_doses")} />
                      </div>
                      <div className="form-group">
                        <label>Number of Courses <span className="required">*</span></label>
                        <Toggle name="steroid_courses" value={String(formData.steroid_courses)}
                          options={[{label:"1",value:"1"},{label:"2",value:"2"},{label:"3",value:"3"},{label:"4",value:"4"}]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("steroid_courses")} />
                      </div>
                    </div>
                    <div className="form-grid-2" style={{ marginTop:12 }}>
                      <div className="form-group">
                        <label>LDDI Status <span className="required">*</span></label>
                        <Toggle name="lddi_known" value={formData.lddi_known}
                          options={["Known","Not known"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("lddi_known")} />
                      </div>
                      {formData.lddi_known === "Known" && (
                        <div className="form-group">
                          <label>LDDI (hrs) <span className="required">*</span></label>
                          <input type="number" name="lddi_hours" value={formData.lddi_hours || ""}
                            onChange={handleChange} onBlur={handleBlur} min="0" max="99" placeholder="0–99 hours"
                            readOnly={!isFieldEditable}
                            className={`emr-input${E("lddi_hours") ? " input-error" : ""}`}
                            onInput={ev => { const v=ev.target.value.replace(/\D/g,""); ev.target.value=v.slice(0,2); }} />
                          <FieldError msg={E("lddi_hours")} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="form-grid-2" style={{ marginTop:8 }}>
                  <div className="form-group">
                    <label>Antenatal MgSO₄ <span className="required">*</span></label>
                    <Toggle name="antenatal_mgso4" value={formData.antenatal_mgso4}
                      options={["Yes","No","Not known"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("antenatal_mgso4")} />
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
                          onChange={date => {
                            setFormData(p => ({ ...p, mgso4_date: date }));
                            touchField("mgso4_date");
                            setErrors(p => ({ ...p, mgso4_date: validateField("mgso4_date", date, formData) }));
                          }}
                          dateFormat="dd-MM-yyyy" placeholderText="DD-MM-YYYY"
                          className={`form-input${E("mgso4_date") ? " input-error" : ""}`}
                          readOnly={!isFieldEditable} />
                        <FieldError msg={E("mgso4_date")} />
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
            <div className={`form-section card-section${cardTouchedErrors.c5 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <Shield size={18} className="section-header-icon" />
                  <h3>Maternal Medical Disorders <span className="required">*</span></h3>
                </div>
                {cardTouchedErrors.c5 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c5} error{cardTouchedErrors.c5 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">
                {E("medical_disorders") && (
                  <div className="alert-danger" style={{ marginBottom:12 }}>
                    ⚠️ {E("medical_disorders")}
                  </div>
                )}
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
                          onChange={ev => {
                            handleChange(ev);
                            // live-validate the medical_disorders group
                            touchField("medical_disorders");
                            const willBeChecked = ev.target.checked;
                            // If checking any real disorder, clear error; if unchecking all, show error
                            setTimeout(() => {
                              setErrors(p => {
                                const anyNow = [
                                  "chronic_hypertension","hepatitis","heart_disease","renal_disease",
                                  "vdrl_positive","seizure_disorder","asthma","hypothyroidism",
                                  "hyperthyroidism","tb","malaria","hiv","severe_anemia","other_medical_checkbox",
                                ].some(f => f === name ? willBeChecked : formData[f]);
                                const noKnown = name === "no_known_medical_disorder" ? willBeChecked : formData.no_known_medical_disorder;
                                return { ...p, medical_disorders: (!noKnown && !anyNow) ? "Select at least one disorder or 'No Known Medical Disorder'" : "" };
                              });
                            }, 0);
                          }}
                          disabled={disabled} style={{ display:"none" }} />
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
                        onChange={handleChange} onBlur={handleBlur} placeholder="Specify details..."
                        readOnly={!isFieldEditable}
                        className={`emr-input${E("other_medical_disorder") ? " input-error" : ""}`} />
                      <FieldError msg={E("other_medical_disorder")} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 6 — OBSTETRIC PROBLEMS
            ═══════════════════════════════════════════ */}
            <div className={`form-section card-section${cardTouchedErrors.c6 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <Activity size={18} className="section-header-icon" />
                  <h3>Obstetric Problems</h3>
                </div>
                {cardTouchedErrors.c6 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c6} error{cardTouchedErrors.c6 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">

                {/* HDP */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">HDP</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>HDP <span className="required">*</span></label>
                      <Toggle name="hdp" value={formData.hdp}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("hdp")} />
                    </div>
                    {formData.hdp === "Yes" && (
                      <div className="form-group">
                        <label>Type <span className="required">*</span></label>
                        <Toggle name="hdp_type" value={formData.hdp_type}
                          options={["Gest HTN","PE","Severe PE","Eclampsia"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("hdp_type")} />
                      </div>
                    )}
                  </div>
                </div>

                {/* GDM */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">GDM</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>GDM <span className="required">*</span></label>
                      <Toggle name="gdm" value={formData.gdm}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("gdm")} />
                    </div>
                    <div className="form-group">
                      <label>Liquor <span className="required">*</span></label>
                      <Toggle name="liquor" value={formData.liquor}
                        options={["Normal","Absent/Oligo","Poly","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("liquor")} />
                    </div>
                  </div>
                  {formData.gdm === "Yes" && (
                    <div className="followup-box">
                      <div className="rx-container-modern">
                        <label className="rx-label-modern">
                          Rx Treatment <span className="required">*</span>
                        </label>
                        <div className="rx-note">ℹ️ Multiple options can be selected</div>
                        <div className="rx-horizontal-group">
                          {[
                            { label:"MNT", value:"MNT" },
                            { label:"Insulin", value:"Insulin" },
                            { label:"Oral Anti-Diabetic Drugs", value:"Oral" },
                          ].map(item => (
                            <button key={item.value} type="button"
                              className={`rx-horizontal-btn${formData.gdm_rx.includes(item.value) ? " active" : ""}`}
                              onClick={() => isFieldEditable && handleGdmRxChange(item.value)}>
                              {item.label}
                            </button>
                          ))}
                        </div>
                        {E("gdm_rx") && <div className="field-error" style={{ marginTop:6 }}>{E("gdm_rx")}</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* FGR */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">FGR</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>FGR <span className="required">*</span></label>
                      <Toggle name="fgr" value={formData.fgr}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("fgr")} />
                    </div>
                    {formData.fgr === "Yes" && (
                      <div className="form-group">
                        <label>Centile <span className="required">*</span></label>
                        <input type="number" name="fgr_centile" value={formData.fgr_centile || ""}
                          onChange={handleChange} onBlur={handleBlur} min="1" max="100" placeholder="1–100"
                          readOnly={!isFieldEditable}
                          className={`emr-input${E("fgr_centile") ? " input-error" : ""}`}
                          onInput={ev => { const v=ev.target.value.replace(/\D/g,""); ev.target.value=v.slice(0,3); }} />
                        <FieldError msg={E("fgr_centile")} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Doppler */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Doppler</div>
                  <div className="form-group">
                    <label>Doppler Findings <span className="required">*</span></label>
                    <Toggle name="doppler" value={formData.doppler}
                      options={["Normal","AEDF","REDF","Not done","Not known","Other"]}
                      onChange={handleToggle} disabled={!isFieldEditable} error={E("doppler")} />
                  </div>
                  {formData.doppler === "Other" && (
                    <div className="emr-specify-panel">
                      <div className="form-group">
                        <label>Specify Doppler Finding <span className="required">*</span></label>
                        <input type="text" name="doppler_other" value={formData.doppler_other || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe findings..."
                          readOnly={!isFieldEditable}
                          className={`emr-input${E("doppler_other") ? " input-error" : ""}`} />
                        <FieldError msg={E("doppler_other")} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Placental Abnormalities */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Placental Abnormalities</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Placental Abnormality <span className="required">*</span></label>
                      <Toggle name="placental_abnormality" value={formData.placental_abnormality}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("placental_abnormality")} />
                    </div>
                    {formData.placental_abnormality === "Yes" && (
                      <div className="form-group">
                        <label>Abnormality Type <span className="required">*</span></label>
                        <Toggle name="placental_type" value={formData.placental_type}
                          options={["Previa","Accreta","Others"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("placental_type")} />
                      </div>
                    )}
                  </div>
                  {formData.placental_abnormality === "Yes" &&
                    (formData.placental_type === "Others" || formData.placental_type === "Other") && (
                    <div className="emr-specify-panel">
                      <div className="form-group">
                        <label>Specify <span className="required">*</span></label>
                        <input name="placental_other" value={formData.placental_other || ""}
                          onChange={handleChange} onBlur={handleBlur} readOnly={!isFieldEditable}
                          className={`emr-input${E("placental_other") ? " input-error" : ""}`} />
                        <FieldError msg={E("placental_other")} />
                      </div>
                    </div>
                  )}
                  <div className="form-grid-2" style={{ marginTop:12 }}>
                    <div className="form-group">
                      <label>Retroplacental Collection <span className="required">*</span></label>
                      <Toggle name="retroplacental_collection" value={formData.retroplacental_collection}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("retroplacental_collection")} />
                    </div>
                    <div className="form-group">
                      <label>Isoimmunization <span className="required">*</span></label>
                      <Toggle name="isoimmunization" value={formData.isoimmunization}
                        options={["Yes","No"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("isoimmunization")} />
                    </div>
                  </div>
                </div>

                {/* APH */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">APH</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>APH <span className="required">*</span></label>
                      <Toggle name="aph" value={formData.aph}
                        options={["Yes","No","Not known"]}
                        onChange={handleToggle} disabled={!isFieldEditable} error={E("aph")} />
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
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("aph_type")} />
                      </div>
                    )}
                  </div>
                  {formData.aph === "Yes" && formData.aph_type === "Other" && (
                    <div className="emr-specify-panel">
                      <div className="form-group">
                        <label>Specify APH Type <span className="required">*</span></label>
                        <input type="text" name="aph_other" value={formData.aph_other || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe..."
                          readOnly={!isFieldEditable}
                          className={`emr-input${E("aph_other") ? " input-error" : ""}`} />
                        <FieldError msg={E("aph_other")} />
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 7 — EVIDENCE OF INFECTION
            ═══════════════════════════════════════════ */}
            <div className={`form-section card-section${cardTouchedErrors.c7 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <AlertTriangle size={18} className="section-header-icon" />
                  <h3>Evidence of Infection</h3>
                </div>
                {cardTouchedErrors.c7 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c7} error{cardTouchedErrors.c7 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>pPROM <span className="required">*</span></label>
                    <div className="infection-control-wrapper">
                      <Toggle name="pprom" value={formData.pprom}
                        options={["Yes","No"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("pprom")} />
                      {formData.pprom === "Yes" && (
                        <div style={{ marginTop:8 }}>
                          <input type="number" name="pprom_duration" value={formData.pprom_duration || ""}
                            onChange={handleChange} onBlur={handleBlur} min="0" max="99" placeholder="Duration (hrs)"
                            readOnly={!isFieldEditable}
                            className={`emr-input${E("pprom_duration") ? " input-error" : ""}`} />
                          <FieldError msg={E("pprom_duration")} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Preterm Labor <span className="required">*</span></label>
                    <Toggle name="preterm_labor" value={formData.preterm_labor}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("preterm_labor")} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Triple "I" (Intrauterine Inflammation/Infection) <span className="required">*</span></label>
                    <Toggle name="triple_i" value={formData.triple_i}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("triple_i")} />
                  </div>
                  <div className="form-group">
                    <label>Maternal Fever (≥39℃ or 38–39℃ on 2 occasions) <span className="required">*</span></label>
                    <Toggle name="maternal_fever" value={formData.maternal_fever}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_fever")} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Baseline Fetal Tachycardia (&gt;160 bpm) <span className="required">*</span></label>
                    <Toggle name="fetal_tachycardia" value={formData.fetal_tachycardia}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("fetal_tachycardia")} />
                  </div>
                  <div className="form-group">
                    <label>Maternal TLC &gt;15000 per mm³ <span className="required">*</span></label>
                    <Toggle name="maternal_tlc_high" value={formData.maternal_tlc_high}
                      options={["Yes","No","Not done"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_tlc_high")} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Maternal Tachycardia <span className="required">*</span></label>
                    <Toggle name="maternal_tachycardia" value={formData.maternal_tachycardia}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_tachycardia")} />
                  </div>
                  <div className="form-group">
                    <label>Maternal Abdominal Tenderness <span className="required">*</span></label>
                    <Toggle name="maternal_abdominal_tenderness" value={formData.maternal_abdominal_tenderness}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_abdominal_tenderness")} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Foul-Smelling Liquor <span className="required">*</span></label>
                    <Toggle name="foul_smelling_liquor" value={formData.foul_smelling_liquor}
                      options={["Yes","No","Not known"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("foul_smelling_liquor")} />
                  </div>
                  <div className="form-group">
                    <label>Maternal UTI <span className="required">*</span></label>
                    <Toggle name="maternal_uti" value={formData.maternal_uti}
                      options={["Yes","No","Not known"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_uti")} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Maternal Diarrhea <span className="required">*</span></label>
                    <Toggle name="maternal_diarrhea" value={formData.maternal_diarrhea}
                      options={["Yes","No","Not known"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={E("maternal_diarrhea")} />
                  </div>
                  <div />
                </div>

              </div>
            </div>

            {/* ═══════════════════════════════════════════
                CARD 8 — INTRAPARTUM EVENTS
            ═══════════════════════════════════════════ */}
            <div className={`form-section card-section${cardTouchedErrors.c8 > 0  ? " card-has-errors" : ""}`}>
              <div className="form-section-header">
                <div className="section-title-left">
                  <Zap size={18} className="section-header-icon" />
                  <h3>Intrapartum Events</h3>
                </div>
                {cardTouchedErrors.c8 > 0  && (
                  <span className="card-error-badge">{cardTouchedErrors.c8} error{cardTouchedErrors.c8 > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="form-section-body">

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Fetal Monitoring</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>MSL <span className="required">*</span></label>
                      <Toggle name="msl" value={formData.msl}
                        options={["Yes","No"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("msl")} />
                    </div>
                    <div className="form-group">
                      <label>Non-reactive NST <span className="required">*</span></label>
                      <Toggle name="non_reactive_nst" value={formData.non_reactive_nst}
                        options={["Yes","No","Not done"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("non_reactive_nst")} />
                    </div>
                  </div>
                  <div className="form-grid-2" style={{ marginTop:12 }}>
                    <div className="form-group">
                      <label>Reduced Fetal Movements <span className="required">*</span></label>
                      <Toggle name="reduced_fm" value={formData.reduced_fm}
                        options={["Yes","No","Not done"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("reduced_fm")} />
                    </div>
                    <div className="form-group">
                      <label>Fetal Bradycardia (&lt;110 bpm) <span className="required">*</span></label>
                      <Toggle name="fetal_bradycardia" value={formData.fetal_bradycardia}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("fetal_bradycardia")} />
                    </div>
                  </div>
                  <div className="form-grid-2" style={{ marginTop:12 }}>
                    <div className="form-group">
                      <label>Fetal Tachycardia (&gt;160 bpm) <span className="required">*</span></label>
                      <Toggle name="fetal_tachycardia_intrapartum" value={formData.fetal_tachycardia_intrapartum}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("fetal_tachycardia_intrapartum")} />
                    </div>
                    <div />
                  </div>
                </div>

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Labor &amp; ROM Metrics</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Prolonged Labor <span className="required">*</span></label>
                      <Toggle name="prolonged_labor" value={formData.prolonged_labor}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("prolonged_labor")} />
                    </div>
                    <div className="form-group">
                      <label>Duration of ROM (hrs) <span className="required">*</span></label>
                      <input type="number" name="duration_rom" value={formData.duration_rom || ""}
                        onChange={handleChange} onBlur={handleBlur} min="0" max="99" placeholder="0–99"
                        readOnly={!isFieldEditable}
                        className={`emr-input${E("duration_rom") ? " input-error" : ""}`}
                        onInput={ev => { if (ev.target.value.length>2) ev.target.value=ev.target.value.slice(0,2); }} />
                      <FieldError msg={E("duration_rom")} />
                    </div>
                  </div>
                </div>

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Cord Occurrences</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Cord Accident <span className="required">*</span></label>
                      <Toggle name="cord_accident" value={formData.cord_accident}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("cord_accident")} />
                    </div>
                    {formData.cord_accident === "Yes" && (
                      <div className="form-group">
                        <label>Type of Cord Accident <span className="required">*</span></label>
                        <Toggle name="cord_accident_type" value={formData.cord_accident_type}
                          options={["Cord around neck","True cord knot","Cord prolapse"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("cord_accident_type")} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Intrapartum Pharmacology</div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Uterotonic Given <span className="required">*</span></label>
                      <Toggle name="uterotonic" value={formData.uterotonic}
                        options={["Yes","No","Not known"]} onChange={handleToggle}
                        disabled={!isFieldEditable} error={E("uterotonic")} />
                    </div>
                    {formData.uterotonic === "Yes" && (
                      <div className="form-group">
                        <label>Timing of Uterotonic <span className="required">*</span></label>
                        <Toggle name="uterotonic_timing" value={formData.uterotonic_timing}
                          options={["Before cord clamp","After cord clamp"]}
                          onChange={handleToggle} disabled={!isFieldEditable} error={E("uterotonic_timing")} />
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

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
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={handlePrevious}>
          <ArrowLeft size={15} /> Birth &amp; Resuscitation
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
          Postnatal Day 1 <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
