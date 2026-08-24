import React, { useState, useEffect } from "react";
import { useLocation, useNavigate} from "react-router-dom";
import api from "./api/axios";
import { useFormProgress } from "./context/FormProgressContext";
import "./styles/global.css";
import "./styles/FormComponents.css";
import FormLayout from "./components/FormLayout";
import { usePatient } from "./context/PatientContext";
import { useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import { Plus, Trash2, Brain, Wind, Utensils, Activity, HeartPulse, Droplets, Eye, Thermometer, Syringe, Bug, ClipboardList, Home, CheckCircle2, Circle } from "lucide-react";
import FormNavBar from "./components/FormNavBar";

/* ─── FormH category map — powers the sticky jump-nav below the header.
   Keeping this outside the component avoids re-creating the array (and
   the icon element references) on every render. Each `key` matches the
   id given to its corresponding top-level <div className="form-section
   soft-blue"> section further down, and is used to show/hide that
   section via the "cat-hidden" class instead of unmounting it (so no
   form state is lost when switching tabs). ─── */
const FORMH_CATEGORIES = [
  { key: "neuro",     code: "H1",  label: "Neurological",    Icon: Brain },
  { key: "resp",      code: "H2",  label: "Respiratory",     Icon: Wind },
  { key: "gi",        code: "H3",  label: "Gastrointestinal", Icon: Utensils },
  { key: "metabolic", code: "H4",  label: "Metabolic",       Icon: Activity },
  { key: "cvs",       code: "H5",  label: "Cardiovascular",  Icon: HeartPulse },
  { key: "heme",      code: "H6",  label: "Hematology",      Icon: Droplets },
  { key: "renal",     code: "H7",  label: "Renal",           Icon: Droplets },
  { key: "eye",       code: "H8",  label: "Ophthalmology",   Icon: Eye },
  { key: "thermo",    code: "H9",  label: "Thermoregulation",Icon: Thermometer },
  { key: "vascular",  code: "H10", label: "Vascular Access", Icon: Syringe },
  { key: "infection", code: "H11", label: "Infection",       Icon: Bug },
  { key: "summary",   code: "H12", label: "Hospital Course", Icon: ClipboardList },
  { key: "completion",code: "",    label: "Review & Submit", Icon: CheckCircle2 },
];

/* ─── YesNoToggle — animated sliding segment (same component as Form A / ScreeningForm.jsx) ─── */
function YesNoToggle({ label, name, value, onChange, onBlur, required = false, disabled = false }) {
  const fire = (val) => {
    if (disabled) return;
    onChange({ target: { name, value: val, type: "select-one" } });
  };
  // 0 = neither selected yet (no slide position), 1 = Yes, 2 = No
  const pos = value === "Yes" ? 1 : value === "No" ? 2 : 0;
  return (
    <div className={`yes-no-toggle${disabled ? " yn-disabled" : ""}`}>
      <span className="yes-no-label">
        {label}
        {required && <span className="required">*</span>}
      </span>
      <div className={`yes-no-buttons yn-pos-${pos}`}>
        <div className="yn-thumb" aria-hidden="true" />
        <button type="button"
          className={`yn-btn yn-yes${value === "Yes" ? " yn-active" : ""}`}
          onClick={() => fire("Yes")}
          onBlur={onBlur ? () => onBlur({ target: { name, value } }) : undefined}
          disabled={disabled}>YES</button>
        <button type="button"
          className={`yn-btn yn-no${value === "No" ? " yn-active" : ""}`}
          onClick={() => fire("No")}
          onBlur={onBlur ? () => onBlur({ target: { name, value } }) : undefined}
          disabled={disabled}>NO</button>
      </div>
    </div>
  );
}

export default function FormH() {
  const location = useLocation();
  const navigate = useNavigate();
  const { patientData } = usePatient();
  const { markFormCompleted, unmarkFormCompleted } = useFormProgress();
  const [errors, setErrors] = useState({});
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const { enrollmentId } = useParams();
const [touched, setTouched] = useState({});
const [openSection, setOpenSection] = useState("ivh"); // default open

// Which organ-system tab is currently showing. All 13 sections still
// live in the DOM (so nothing in formData is ever unmounted/lost) —
// switching tabs just toggles a "cat-hidden" class, see FORMH_CATEGORIES.
const [activeCategory, setActiveCategory] = useState("neuro");
const jumpNavContentRef = React.useRef(null);
const goToCategory = (key) => {
  setActiveCategory(key);
  // Scroll the content area (not the whole page) back to the top of
  // the newly-shown section so switching tabs always feels like
  // landing on a fresh page rather than jumping mid-scroll.
  requestAnimationFrame(() => {
    jumpNavContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
};

// Vascular Access (H10.1/H10.2) auto-fill from the Metab/Renal/Vasc/Eye
// helper daily logs — see /neonatal-morbidities/vascular-access-prefill.
// vascularPrefill holds the raw aggregated response (used for the
// line-complication advisory note); vascularAutoFilled tracks which
// fields currently hold an unconfirmed auto-filled value so the UI can
// badge them — the badge (and the tracking) clears the moment the
// clinician edits that field.
const [vascularPrefill, setVascularPrefill] = useState(null);
const [vascularAutoFilled, setVascularAutoFilled] = useState({});
// Fields that are already answered in Form H but now disagree with what
// the daily logs currently show (e.g. Form H was answered before the
// daily logs had the relevant data, or the daily logs were corrected
// afterward). Recomputed on every fetch — including a plain page load —
// from the live comparison, not stored anywhere; a normal (non-force)
// refill deliberately leaves these fields untouched and only surfaces
// them here so the clinician can decide whether to Force Refill.
const [vascularStale, setVascularStale] = useState({});

// Metabolic Disturbances (H4.1) auto-fill — same pattern as Vascular
// Access above, from /neonatal-morbidities/metabolic-prefill.
const [metabolicPrefill, setMetabolicPrefill] = useState(null);
const [metabolicAutoFilled, setMetabolicAutoFilled] = useState({});
const [metabolicStale, setMetabolicStale] = useState({});

// Renal / AKI (H7.1) auto-fill — same pattern as Vascular Access above,
// from /neonatal-morbidities/renal-prefill.
const [renalPrefill, setRenalPrefill] = useState(null);
const [renalAutoFilled, setRenalAutoFilled] = useState({});
const [renalStale, setRenalStale] = useState({});

// Hematology (H6) auto-fill — same pattern as Vascular Access/Metabolic/
// Renal above, from /neonatal-morbidities/heme-prefill.
const [hemePrefill, setHemePrefill] = useState(null);
const [hemeAutoFilled, setHemeAutoFilled] = useState({});
const [hemeStale, setHemeStale] = useState({});

// Neurological (H1) auto-fill — same pattern as Vascular Access/Metabolic/
// Renal/Heme above, from /neonatal-morbidities/neuro-prefill.
const [neuroPrefill, setNeuroPrefill] = useState(null);
const [neuroAutoFilled, setNeuroAutoFilled] = useState({});
const [neuroStale, setNeuroStale] = useState({});

// Gastrointestinal (H3) auto-fill — same pattern as the other domains
// above, from /neonatal-morbidities/gi-prefill.
const [giPrefill, setGiPrefill] = useState(null);
const [giAutoFilled, setGiAutoFilled] = useState({});
const [giStale, setGiStale] = useState({});

// ROP + Thermoregulation (H8/H9) auto-fill — same pattern as the other
// domains above, from /neonatal-morbidities/rop-thermoreg-prefill.
const [ropThermoPrefill, setRopThermoPrefill] = useState(null);
const [ropThermoAutoFilled, setRopThermoAutoFilled] = useState({});
const [ropThermoStale, setRopThermoStale] = useState({});

// Cardiovascular (H5) auto-fill — same pattern as the other domains
// above, from /neonatal-morbidities/cv-prefill.
const [cvPrefill, setCvPrefill] = useState(null);
const [cvAutoFilled, setCvAutoFilled] = useState({});
const [cvStale, setCvStale] = useState({});

// Infection (H11) — detection-only, never fills a field directly. See
// fetchInfectionWindows below for why this domain is architecturally
// different from every other one above.
const [infectionWindows, setInfectionWindows] = useState([]);

// Respiratory (H2) auto-fill — same pattern as the other domains above,
// from /neonatal-morbidities/resp-prefill. BPD (H2.1) is deliberately
// not covered — see the backend endpoint docstring.
const [respPrefill, setRespPrefill] = useState(null);
const [respAutoFilled, setRespAutoFilled] = useState({});
const [respStale, setRespStale] = useState({});

// "Did not survive" prompt — see fetchSurvivalCheck below. Doesn't fill
// anything on its own; only offers to run every domain's existing Force
// Refill at once.
const [survivalAlert, setSurvivalAlert] = useState(null);
const [forceRefillingAll, setForceRefillingAll] = useState(false);
  const [formData, setFormData] = useState({
    // ================= IDENTIFICATION =================
    enrollment_id: "",
    // ================= INFECTION (H10) — dynamic, repeatable episodes =================
    infections: [],
    // ================= NEUROLOGICAL =================

// IVH
ivh_present: "",
ivh_side: "",
ivh_grade: "",
ivh_date: "",
ivh_age_days: "",
ivh_grade_left: "",
ivh_grade_right: "",
ivh_date_left: "",
ivh_date_right: "",
ivh_age_days_left: "",
ivh_age_days_right: "",
pvhi: "",
phh: "",
vp_shunt: "",
ivh_description: "",
ivh_description_left: "",
ivh_description_right: "",
aed_type: [],
aed_number: "",
aed_other: "",
etiology: "",
etiology_other: "",
cpap_used:"",
cpap: "",
cpap_days:"",
nippv_used:"",
nippv: "",
nippv_days:"",
hfnc_used: "",          // NEW
hfnc: "",
hfnc_days: "",
imv_used:"",
invasive_ventilation: "",
imv_days:"",
nasal_cannula_used: "",      // NEW
nasal_cannula: "",
nasal_cannula_days: "",
oxygen_exposure:"",
postnatal_steroids:"",
steroid_age_days: "",
steroid_drug:"",
steroid_drug_other:"",
age_steroid:"",
steroid_dose:"",
steroid_dose_2:"",
steroid_indication:"",
steroid_indication_other:"",
pulmonary_hemorrhage: "",
pulmonary_hypertension: "",
pneumothorax: "",
chest_drain: "",

// PVL
pvl_present: "",
pvl_side: "",
pvl_grade: "",
pvl_date: "",
pvl_grade_right: "",
pvl_date_right: "",
pvl_age_days_right: "",   // CRF #17
pvl_grade_left: "",
pvl_date_left: "",
pvl_age_days_left: "",    // CRF #20

// Ventriculomegaly
ventriculomegaly: "",
ventriculomegaly_severity: "",
vi_max: "",
ahw: "",
tod_max: "",
aca_ri: "",
mca_ri: "",

// Seizures
seizures: "",
seizure_date: "",
seizure_type: "",
eeg: "",
status_epilepticus: "",   // CRF #31
aeds_required: "",
aed_name: "",
seizure_etiology: "",



rx_sildenafil: false,
rx_ino: false,
rx_other: false,
rx_other_text: "",

extubation_failure: "",
extubation_episodes: "",

pn_cholestasis:false,
pn_electrolyte:false,
pn_acidosis:false,
pn_hypercapnia:false,
pn_other:false,
pn_other_text:"",

strain_mono:false,
strain_bi:false,
strain_multi:false,
strain_others:false,

fi_others:false,
fi_others_text:"",

lactobacillus:"",
bifidobacterium:"",

cholestasis:"",
tpn_associated:"",
max_direct_bilirubin:"",

// ---------------- METABOLIC (H4.1) — added fields ----------------
hypoglycemia_episodes: "",
hypoglycemia_rx: "",
hypoglycemia_rx_duration: "",
hyperglycemia_rx: "",
hyponatremia: false,
hyponatremia_status: "",
hyponatremia_symptoms: "",
hypernatremia: false,
hypernatremia_status: "",
hypernatremia_symptoms: "",
hypokalemia: false,
hypokalemia_status: "",
hypokalemia_symptoms: "",
hyperkalemia: false,
hyperkalemia_status: "",
hyperkalemia_symptoms: "",
hypocalcemia: false,
hypocalcemia_status: "",
hypocalcemia_symptoms: "",
hypercalcemia: false,
hypercalcemia_status: "",
hypercalcemia_symptoms: "",

// ---------------- OPHTHALMOLOGY / ROP (H8.1) — added fields ----------------
rop_method: "",
rop_side: "",
rop_stage_right: "", rop_plus_right: "", rop_zone_right: "", rop_arop_right: "", rop_treatment_right: "",
rop_laser_right: false, rop_anti_vegf_right: false, rop_vitrectomy_right: false, rop_other_right: false, rop_other_text_right: "",
rop_stage_left: "", rop_plus_left: "", rop_zone_left: "", rop_arop_left: "", rop_treatment_left: "",
rop_laser_left: false, rop_anti_vegf_left: false, rop_vitrectomy_left: false, rop_other_left: false, rop_other_text_left: "",

  });

  
  const handleChange = (e) => {
  const { name, value, type, checked } = e.target;

  const val = type === "checkbox" ? checked : value;

  const updatedForm = {
    ...formData,
    [name]: val
  };

  setFormData(updatedForm);

  // 🔥 Run IVH validation
  validateIVH(name, val, updatedForm);
  validatePVL(name, val, updatedForm);
  validateVM(name, val, updatedForm);
  validateSeizures(name, val, updatedForm);
  
  validateBPD(name, val, updatedForm);
  validateRespiratory(name, val, updatedForm);
  validateApnea(name, val, updatedForm);
  validateRespSupport(name, val, updatedForm);
  validateFeedIntolerance(name, val, updatedForm);
  validateTransfusion(name, val, updatedForm);
  validateTemp(name, val, updatedForm);

// group validations
if (name.startsWith("hypothermia_")) {
  validateTemp("hypothermia_severity_group", val, updatedForm);
  validateTemp("hypothermia_location_group", val, updatedForm);
  validateTemp("hypothermia_etiology_group", val, updatedForm);
}

if (name.startsWith("hyperthermia_")) {
  validateTemp("hyperthermia_location_group", val, updatedForm);
  validateTemp("hyperthermia_etiology_group", val, updatedForm);
}

if (name === "hypothermia_lowest_temp") {
  if (value === "" || (Number(value) >= 20 && Number(value) <= 40)) {
    updatedForm[name] = value;
  } else return;
}

if (name === "hyperthermia_temp") {
  if (value === "" || (Number(value) >= 35 && Number(value) <= 42)) {
    updatedForm[name] = value;
  } else return;
}
  validateAKI(name, val, updatedForm);

// group validation
if (name.startsWith("aki_stage")) {
  validateAKI("aki_stage_group", val, updatedForm);
}

if (name === "aki_peak_creatinine") {
  if (value === "" || (Number(value) >= 0 && Number(value) <= 20)) {
    updatedForm[name] = value;
  } else {
    return; // ❌ stop invalid input like 1112
  }
}

  validateROP(name, val, updatedForm);

// group validations
if (name.startsWith("rop_") && (name.includes("laser") || name.includes("vegf") || name.includes("vitrectomy") || name.includes("other")) && name.endsWith("_right")) {
  validateROP("rop_treatment_type_right_group", val, updatedForm);
}
if (name.startsWith("rop_") && (name.includes("laser") || name.includes("vegf") || name.includes("vitrectomy") || name.includes("other")) && name.endsWith("_left")) {
  validateROP("rop_treatment_type_left_group", val, updatedForm);
}
  validateNEC(name, val, updatedForm);

  // 🔥 re-check checkbox group
  if (name.startsWith("fi_")) {
    validateFeedIntolerance("fi_group", val, updatedForm);
  }

  validateFeeding(name, val, updatedForm);

  // group validations
  if (name.startsWith("pn_")) {
    validateFeeding("pn_adverse_group", val, updatedForm);
  }

  if (name.startsWith("strain_")) {
    validateFeeding("strain_group", val, updatedForm);
  }

  validateMetabolic(name, val, updatedForm);

  // 🔥 group validation for electrolytes
  if (name.startsWith("dyselectro_")) {
    validateMetabolic("dyselectro_group", val, updatedForm);
  }

  validatePDA(name, val, updatedForm);

// group validations
if (name.startsWith("pda_")) {
  validatePDA("pda_diagnosis_group", val, updatedForm);
  validatePDA("pda_pattern_group", val, updatedForm);
  validatePDA("pda_medical_group", val, updatedForm);
}

validateShock(name, val, updatedForm);

// group validations
if (name.startsWith("hypotension_")) {
  validateShock("hypotension_group", val, updatedForm);
}

if (name.startsWith("inotrope_")) {
  validateShock("inotrope_group", val, updatedForm);
}

if (name.startsWith("hc_")) {
  validateShock("hc_group", val, updatedForm);
}

// sepsis_episodes / vap_episodes are the only fields still validated here —
// per-episode Infection (H10) fields are validated via validateInfectionField().
validateSepsis(name, val);

validateJaundice(name, val, updatedForm);


  // Central line days
  if (["picc_days", "uvc_days", "uac_days"].includes(name)) {
    if (value === "" || (Number(value) >= 0 && Number(value) <= 60)) {
      updatedForm[name] = value;
    } else return;
  }

  // ================= 🔥 SPECIAL LOGIC =================

  // Complication "None" exclusive
  if (name === "line_comp_none" && checked) {
    updatedForm.line_comp_thrombosis = false;
    updatedForm.line_comp_phlebitis = false;
    updatedForm.line_comp_infection = false;
  }

  if (
    (name === "line_comp_thrombosis" ||
      name === "line_comp_phlebitis" ||
      name === "line_comp_infection") &&
    checked
  ) {
    updatedForm.line_comp_none = false;
  }

  // ================= SAVE =================
  setFormData(updatedForm);

  // ================= 🔥 VALIDATIONS =================

  // Call all validators (safe approach)
  validateAKI(name, val, updatedForm);
  validateROP(name, val, updatedForm);
  validateTemp(name, val, updatedForm);
  validateTransfusion(name, val, updatedForm);
  validateSummary(name, val, updatedForm);
  validateLines(name, val, updatedForm);

  // ================= 🔥 GROUP VALIDATIONS =================

  // AKI stage
  if (name.startsWith("aki_stage")) {
    validateAKI("aki_stage_group", val, updatedForm);
  }

  // ROP groups
  if (name.startsWith("rop_") && (name.includes("laser") || name.includes("vegf") || name.includes("vitrectomy") || name.includes("other")) && name.endsWith("_right")) {
    validateROP("rop_treatment_type_right_group", val, updatedForm);
  }
  if (name.startsWith("rop_") && (name.includes("laser") || name.includes("vegf") || name.includes("vitrectomy") || name.includes("other")) && name.endsWith("_left")) {
    validateROP("rop_treatment_type_left_group", val, updatedForm);
  }

  // Temp groups
  if (name.startsWith("hypothermia_")) {
    validateTemp("hypothermia_severity_group", val, updatedForm);
    validateTemp("hypothermia_location_group", val, updatedForm);
    validateTemp("hypothermia_etiology_group", val, updatedForm);
  }

  if (name.startsWith("hyperthermia_")) {
    validateTemp("hyperthermia_location_group", val, updatedForm);
    validateTemp("hyperthermia_etiology_group", val, updatedForm);
  }

  // Central lines
  if (name.startsWith("line_comp")) {
    validateLines("line_comp_group", val, updatedForm);
  }

  if (name.startsWith("arterial_")) {
    validateLines("arterial_site_group", val, updatedForm);
  }

  if (
  [
    "total_los",
    "nicu_days",
    "o2_days",
    "vent_days",
    "cpap_days"
  ].includes(name)
) {
  if (value === "" || (Number(value) >= 0 && Number(value) <= 365)) {
    updatedForm[name] = value;
  } else return;
}

if (name === "discharge_weight") {
  if (value === "" || (Number(value) >= 500 && Number(value) <= 6000)) {
    updatedForm[name] = value;
  } else return;
}

if (name === "discharge_hc") {
  if (value === "" || (Number(value) >= 20 && Number(value) <= 60)) {
    updatedForm[name] = value;
  } else return;
}
};


const handleBlur = (e) => {
  const { name, value } = e.target;

  setTouched(prev => ({
    ...prev,
    [name]: true
  }));

  validateIVH(name, value);
  validatePVL(name, value);
  validateVM(name, value);
  validateSeizures(name, value);
  
  validateBPD(name, value);
  validateRespiratory(name, value);
  validateApnea(name, value);
  validateRespSupport(name, value);
  validateNEC(name, value);
  validateJaundice(name, value);
  validateTransfusion(name, value);
  validateAKI(name, value);
  validateROP(name, value);
  validateLines(name, value);
  validateSummary(name, value);
  
};

useEffect(() => {
  if (!enrollmentId) return;

  setFormData(prev => ({
    ...prev,
    enrollment_id: enrollmentId
  }));
}, [enrollmentId]);

useEffect(() => {
  if (patientData?.enrollment_id) {
    setFormData((p) => ({
      ...p,
      enrollment_id: patientData.enrollment_id
    }));
  }
}, [patientData]);
  useEffect(() => {
    if (location.state?.enrollmentId) {
      setFormData((p) => ({
        ...p,
        enrollment_id: location.state.enrollmentId,
      }));
    }
  }, [location.state]);

  // ================= LOAD EXISTING FORM H (prevents data loss on revisit) =================
  useEffect(() => {
    if (!enrollmentId) return;

    const loadExistingFormH = async () => {
      try {
        const res = await api.get(`/neonatal-morbidities/${enrollmentId}`);
        const rows = Array.isArray(res.data) ? res.data : [res.data];
        // Prefer newest row (matches POST upsert which updates the latest
        // duplicate when any exist from the old always-insert bug).
        const existing = rows.length ? rows[rows.length - 1] : null;
        if (!existing) return;

        setFormData(prev => {
          // "Both" was the old value for the Side dropdown; the CRF calls
          // it "Bilateral" — normalise so old records still render correctly.
          const side = existing.ivh_side === "Both" ? "Bilateral" : existing.ivh_side;

          // Backward-compat: records saved before this form was split into
          // separate Right/Left grade-date-age blocks stored a single-side
          // IVH's grade/date/age in the shared ivh_grade/ivh_date/ivh_age_days
          // columns rather than the side-specific *_left/*_right ones. Migrate
          // them on load so that data isn't lost under the new always-split
          // fields (they're still saved back into *_left/*_right on next save).
          // Grades used to be stored as "1"-"4"; the CRF uses Roman numerals
          // ("I"-"IV"). Normalise old numeric grades so they still populate
          // the select correctly instead of appearing blank.
          const toRomanGrade = g => ({ "1":"I", "2":"II", "3":"III", "4":"IV" }[g] || g || "");

          const ivh_grade_right    = toRomanGrade(existing.ivh_grade_right    || (side === "Right" ? existing.ivh_grade    : null));
          const ivh_grade_left     = toRomanGrade(existing.ivh_grade_left     || (side === "Left"  ? existing.ivh_grade    : null));
          const ivh_date_right     = existing.ivh_date_right     || (side === "Right" ? existing.ivh_date     : null) || "";
          const ivh_date_left      = existing.ivh_date_left      || (side === "Left"  ? existing.ivh_date     : null) || "";
          const ivh_age_days_right = existing.ivh_age_days_right ?? (side === "Right" ? existing.ivh_age_days : null) ?? "";
          const ivh_age_days_left  = existing.ivh_age_days_left  ?? (side === "Left"  ? existing.ivh_age_days : null) ?? "";

          // Backward-compat: Method (#180) used to be two checkboxes
          // (IDO / RETCAM) rather than free text. Those old columns are
          // preserved untouched in the DB; if a record has them set but no
          // rop_method text yet, pre-fill the text field from them so the
          // information is still visible under the new field instead of
          // silently disappearing.
          let rop_method = existing.rop_method || "";
          if (!rop_method) {
            const legacyMethods = [];
            if (existing.rop_method_ido) legacyMethods.push("IDO");
            if (existing.rop_method_retcam) legacyMethods.push("RETCAM");
            if (legacyMethods.length) rop_method = legacyMethods.join(", ");
          }

          const yn = (v, fallback = "") => {
            if (v === true || v === "Yes" || v === "true") return "Yes";
            if (v === false || v === "No" || v === "false") return "No";
            return fallback;
          };

          const boolAsYesNo = {};
          [
            "seizures", "status_epilepticus", "bpd", "postnatal_steroids",
            "feed_intolerance", "nec", "hs_pda", "shock", "hypotension",
            "pvhi", "phh", "vp_shunt", "pulmonary_hemorrhage", "pneumothorax",
            "chest_drain", "apnea", "nec_surgery", "pn", "cholestasis", "inotropes",
            "pda_ligation",
          ].forEach((key) => {
            if (existing[key] === true || existing[key] === false || existing[key] === "Yes" || existing[key] === "No") {
              boolAsYesNo[key] = yn(existing[key]);
            }
          });

          return {
            ...prev,
            ...existing,
            ivh_side: side, ivh_grade_right, ivh_grade_left, ivh_date_right, ivh_date_left,
            ivh_age_days_right, ivh_age_days_left,
            rop_method,
            ...boolAsYesNo,
            // map backend booleans back to the Yes/No selects the UI uses
            ivh_present: yn(existing.ivh, prev.ivh_present),
            pvl_present: yn(existing.pvl, prev.pvl_present),
            ventriculomegaly_present: yn(existing.ventriculomegaly, prev.ventriculomegaly_present),
            // Prefer total_los (H12 #253); keep legacy total_los_days in sync
            total_los: existing.total_los ?? existing.total_los_days ?? prev.total_los ?? "",
            infections: (() => {
              const list = Array.isArray(existing.infections)
                ? existing.infections.map((ep) => ({ ...ep }))
                : [];
              // Legacy: totals lived only on the parent row — seed Infection 1
              // so #233/#234 aren't blank after reopen.
              if (list.length > 0) {
                if (
                  (list[0].total_sepsis_episodes === "" || list[0].total_sepsis_episodes == null) &&
                  existing.sepsis_episodes != null
                ) {
                  list[0].total_sepsis_episodes = existing.sepsis_episodes;
                }
                if (
                  (list[0].total_vap_episodes === "" || list[0].total_vap_episodes == null) &&
                  existing.vap_episodes != null
                ) {
                  list[0].total_vap_episodes = existing.vap_episodes;
                }
              }
              return list.length ? list : (prev.infections || []);
            })(),
            infection_flags_reviewed: Array.isArray(existing.infection_flags_reviewed)
              ? existing.infection_flags_reviewed
              : (prev.infection_flags_reviewed || []),
            enrollment_id: enrollmentId,
            _record_id: existing.id || null,
          };
        });
      } catch (err) {
        // No saved Form H yet for this enrollment — start blank, this is expected for a new form.
        console.log("No existing Form H record yet for this enrollment.");
      }
    };

    // Chained, not a separate effect: every prefill must only ever run
    // AFTER the real saved record has finished loading into formData, win
    // or lose. Two independent effects racing on the same fields is
    // exactly the bug fixed 2026-08-22 (dead fetchResp clobbering a
    // correctly loaded record) — don't reintroduce that shape. The nine
    // prefills below are independent of each other (disjoint fields), so
    // no need to sequence them relative to one another, only relative to
    // the record load. fetchInfectionWindows is detection-only (see its
    // own comment) but still chained the same way for consistency.
    loadExistingFormH().then(() => {
      fetchVascularAccessPrefill();
      fetchMetabolicPrefill();
      fetchRenalPrefill();
      fetchHemePrefill();
      fetchNeuroPrefill();
      fetchGiPrefill();
      fetchRopThermoPrefill();
      fetchCvPrefill();
      fetchInfectionWindows();
      fetchRespPrefill();
      fetchSurvivalCheck();
    });
  }, [enrollmentId]);

  const yesNoToBool = (v) => {
    if (v === "Yes" || v === true) return true;
    if (v === "No" || v === false) return false;
    return null;
  };

const validateIVH = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "ivh_present":
      if (!value) error = "Please select IVH status";
      break;

    case "ivh_side":
      if (updatedForm.ivh_present === "Yes" && !value) {
        error = "Side is required";
      }
      break;

    case "ivh_grade_right":
      if (updatedForm.ivh_present === "Yes"
        && (updatedForm.ivh_side === "Right" || updatedForm.ivh_side === "Bilateral")
        && !value) {
        error = "Right IVH grade is required";
      }
      break;

    case "ivh_grade_left":
      if (updatedForm.ivh_present === "Yes"
        && (updatedForm.ivh_side === "Left" || updatedForm.ivh_side === "Bilateral")
        && !value) {
        error = "Left IVH grade is required";
      }
      break;

    case "ivh_date_right":
      if (updatedForm.ivh_present === "Yes"
        && (updatedForm.ivh_side === "Right" || updatedForm.ivh_side === "Bilateral")
        && !value) {
        error = "Right IVH date is required";
      }
      break;

    case "ivh_date_left":
      if (updatedForm.ivh_present === "Yes"
        && (updatedForm.ivh_side === "Left" || updatedForm.ivh_side === "Bilateral")
        && !value) {
        error = "Left IVH date is required";
      }
      break;

    case "ivh_age_days_right":
      if (updatedForm.ivh_present === "Yes"
        && (updatedForm.ivh_side === "Right" || updatedForm.ivh_side === "Bilateral")) {
        if (value === "") {
          error = "Right IVH age is required";
        } else if (value < 0 || value > 120) {
          error = "Must be between 0–120 days";
        }
      }
      break;

    case "ivh_age_days_left":
      if (updatedForm.ivh_present === "Yes"
        && (updatedForm.ivh_side === "Left" || updatedForm.ivh_side === "Bilateral")) {
        if (value === "") {
          error = "Left IVH age is required";
        } else if (value < 0 || value > 120) {
          error = "Must be between 0–120 days";
        }
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validateSummary = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    // ---------------- STRUCTURAL HEART DISEASE (H5.1) ----------------
    case "structural_heart_disease":
      if (!value) error = "Required";
      break;

    case "structural_heart_disease_detail":
      if (updatedForm.structural_heart_disease === "Yes" && !value) {
        error = "Please specify";
      }
      break;

    // ---------------- REQUIRED ----------------
    case "outcome":
    case "discharge_date":
      if (!value) error = "Required";
      break;

    // ---------------- LOS ----------------
    // (total_los / nicu_days required-checks live in their dedicated
    // cases below so the range validation actually runs — previously
    // this fired first with a bare "break", making the detailed case
    // further down permanently unreachable.)
    case "total_los":
      if (!value) error = "Required";
      else if (!isNumber(value)) error = "Only numbers";
      else if (value < 0 || value > 365) error = "0–365 days";
      break;

    case "nicu_days":
      if (!value) error = "Required";
      else if (!isNumber(value)) error = "Only numbers";
      else if (value < 0 || value > 365) error = "0–365";
      else if (Number(value) > Number(updatedForm.total_los || 0)) {
        error = "Cannot exceed Total LOS";
      }
      break;

    case "o2_days":
    case "vent_days":
    case "cpap_days":
      if (value) {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 365) error = "0–365";
        else if (Number(value) > Number(updatedForm.total_los || 0)) {
          error = "Cannot exceed Total LOS";
        }
      }
      break;

    // ---------------- NUTRITION ----------------
    case "pn_days_summary":
      if (value) {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 100) error = "0–100";
      }
      break;

    case "age_full_feeds_summary":
      if (value) {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 60) error = "0–60";
      }
      break;

    // ---------------- DISCHARGE ----------------
    case "discharge_weight":
      if (value) {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 500 || value > 6000) error = "500–6000 g";
      }
      break;

    case "discharge_hc":
      if (value) {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 20 || value > 60) error = "20–60 cm";
      }
      break;

    // ---------------- BACK REFERRAL ----------------
    case "back_referral_hospital":
      if (updatedForm.outcome === "Back referred" && !value) {
        error = "Required";
      }
      break;

    case "back_referral_other":
      if (
        updatedForm.back_referral_hospital === "Other" &&
        !value
      ) {
        error = "Required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validateAKI = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    // ---------------- REQUIRED ----------------
    case "aki":
      if (!value) error = "Required";
      break;

    // ---------------- DATE ----------------
    case "aki_date":
      if (updatedForm.aki === "Yes" && !value) {
        error = "Required";
      }
      break;

    // ---------------- STAGE GROUP ----------------
    case "aki_stage_group":
      if (updatedForm.aki === "Yes") {
        const any =
          updatedForm.aki_stage1 ||
          updatedForm.aki_stage2 ||
          updatedForm.aki_stage3;

        if (!any) error = "Select at least one stage";
      }
      break;

    // ---------------- CREATININE ----------------
    case "aki_peak_creatinine":
  if (updatedForm.aki === "Yes") {
    if (!value) error = "Required";
    else if (isNaN(value)) error = "Only numbers";
    else if (Number(value) < 0 || Number(value) > 20) {
      error = "Value must be between 0–20 mg/dL";
    }
  }
  break;

    // ---------------- OLIGURIA ----------------
    case "aki_oliguria":
      if (updatedForm.aki === "Yes" && !value) {
        error = "Required";
      }
      break;

    // ---------------- DIALYSIS ----------------
    case "aki_dialysis":
      if (updatedForm.aki === "Yes" && !value) {
        error = "Required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error,
    
  }));
};


const validateLines = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d+$/.test(val);

  switch (name) {

    // ---------------- REQUIRED ----------------
    case "picc":
    case "uvc":
    case "uac":
    case "peripheral_venous":
    case "peripheral_arterial":
    case "extravasation":
      if (!value) error = "Required";
      break;

    // ---------------- PICC ----------------
    case "picc_days":
      if (updatedForm.picc === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 60) error = "0–60 days";
      }
      break;

    // ---------------- UVC ----------------
    case "uvc_days":
      if (updatedForm.uvc === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 60) error = "0–60 days";
      }
      break;

    // ---------------- UAC ----------------
    case "uac_days":
      if (updatedForm.uac === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 60) error = "0–60 days";
      }
      break;

    // ---------------- COMPLICATIONS ----------------
    case "line_comp_group":
      const anyComp =
        updatedForm.line_comp_none ||
        updatedForm.line_comp_phlebitis ||
        updatedForm.line_comp_infection ||
        updatedForm.line_comp_thrombosis;

      if (!anyComp) error = "Select at least one complication";
      break;

    // ---------------- ARTERIAL SITE ----------------
    case "arterial_site_group":
      if (updatedForm.peripheral_arterial === "Yes") {
        const anySite =
          updatedForm.arterial_radial ||
          updatedForm.arterial_posterior_tibial;

        if (!anySite) error = "Select at least one site";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validateTemp = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    // ---------------- REQUIRED ----------------
    case "hypothermia":
    case "hyperthermia":
      if (!value) error = "Required";
      break;

    // ---------------- HYPOTHERMIA ----------------
    case "hypothermia_severity_group":
      if (updatedForm.hypothermia === "Yes") {
        const any =
          updatedForm.hypothermia_mild ||
          updatedForm.hypothermia_moderate ||
          updatedForm.hypothermia_severe;

        if (!any) error = "Select at least one severity";
      }
      break;

    case "hypothermia_lowest_temp":
      if (updatedForm.hypothermia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 20 || value > 40) error = "20–40 °C";
      }
      break;

    case "hypothermia_location_group":
      if (updatedForm.hypothermia === "Yes") {
        const any =
          updatedForm.hypothermia_location_dr ||
          updatedForm.hypothermia_location_transport ||
          updatedForm.hypothermia_location_nicu;

        if (!any) error = "Select at least one location";
      }
      break;

    case "hypothermia_etiology_group":
      if (updatedForm.hypothermia === "Yes") {
        const any =
          updatedForm.hypothermia_sepsis ||
          updatedForm.hypothermia_environment ||
          updatedForm.hypothermia_immaturity ||
          updatedForm.hypothermia_ivh ||
          updatedForm.hypothermia_other;

        if (!any) error = "Select at least one etiology";
      }
      break;

    case "hypothermia_other_text":
      if (updatedForm.hypothermia_other && !value) {
        error = "Required";
      }
      break;

    // ---------------- HYPERTHERMIA ----------------
    case "hyperthermia_temp":
      if (updatedForm.hyperthermia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 35 || value > 42) error = "35–42 °C";
      }
      break;

    case "hyperthermia_location_group":
      if (updatedForm.hyperthermia === "Yes") {
        const any =
          updatedForm.hyperthermia_location_dr ||
          updatedForm.hyperthermia_location_transport ||
          updatedForm.hyperthermia_location_nicu;

        if (!any) error = "Select at least one location";
      }
      break;

    case "hyperthermia_etiology_group":
      if (updatedForm.hyperthermia === "Yes") {
        const any =
          updatedForm.hyperthermia_clothing ||
          updatedForm.hyperthermia_wrap ||
          updatedForm.hyperthermia_equipment ||
          updatedForm.hyperthermia_probe ||
          updatedForm.hyperthermia_environment ||
          updatedForm.hyperthermia_sepsis ||
          updatedForm.hyperthermia_other;

        if (!any) error = "Select at least one etiology";
      }
      break;

    case "hyperthermia_other_text":
      if (updatedForm.hyperthermia_other && !value) {
        error = "Required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validatePVL = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "pvl_present":
      if (!value) error = "Please select PVL status";
      break;

    case "pvl_grade":
      if (updatedForm.pvl_present === "Yes" && !value) {
        error = "PVL grade is required";
      }
      break;

    case "pvl_date":
      if (updatedForm.pvl_present === "Yes" && !value) {
        error = "PVL date is required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validateVM = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "ventriculomegaly_present":
      if (!value) error = "Please select status";
      break;

    case "vi_max":
      if (updatedForm.ventriculomegaly_present === "Yes") {
        if (value === "") error = "VI max is required";
        else if (value < 0 || value > 25) error = "0–25 mm only";
      }
      break;

    case "ahw":
      if (updatedForm.ventriculomegaly_present === "Yes") {
        if (value === "") error = "AHW is required";
        else if (value < 0 || value > 10) error = "0–10 mm only";
      }
      break;

    case "tod_max":
      if (updatedForm.ventriculomegaly_present === "Yes") {
        if (value === "") error = "TOD is required";
        else if (value < 0 || value > 40) error = "0–40 mm only";
      }
      break;

    case "aca_ri":
      if (updatedForm.ventriculomegaly_present === "Yes") {
        if (value === "") error = "ACA RI required";
        else if (value < 0.4 || value > 1) error = "0.4–1.0 only";
      }
      break;

    case "mca_ri":
      if (updatedForm.ventriculomegaly_present === "Yes") {
        if (value === "") error = "MCA RI required";
        else if (value < 0.4 || value > 1) error = "0.4–1.0 only";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};



const validateSepsis = (name, value) => {
  // Per-episode sepsis/infection validation now lives in validateInfectionField()
  // (see the dynamic Infection section, H10). This function only covers the two
  // cumulative, form-level totals that sit below the repeatable episode list.
  let error = "";
  const isNumber = (val) => /^\d+$/.test(val);

  switch (name) {
    case "sepsis_episodes":
    case "vap_episodes":
      if (value !== "") {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 20) error = "0\u201320";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};


const validateTransfusion = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    // ---------------- REQUIRED ----------------
    case "prbc":
    case "platelets":
    case "ffp_cryo":
      if (!value) error = "Required";
      break;

    // ---------------- PRBC ----------------
    case "prbc_number":
      if (updatedForm.prbc === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 1 || value > 50) error = "1–50";
      }
      break;

    case "prbc_volume":
      if (updatedForm.prbc === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 500) error = "0–500 ml/kg";
      }
      break;

    case "cmv_screened":
    case "irradiated":
      if (updatedForm.prbc === "Yes" && !value) {
        error = "Required";
      }
      break;

    // ---------------- PLATELETS ----------------
    case "platelet_number":
      if (updatedForm.platelets === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 1 || value > 50) error = "1–50";
      }
      break;

    // ---------------- FFP ----------------
    case "ffp_number":
      if (updatedForm.ffp_cryo === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 1 || value > 50) error = "1–50";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};


const validateRespSupport = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    // REQUIRED SELECTS
    case "cpap_used":
    case "nippv_used":
    case "imv_used":
    case "postnatal_steroids":
      if (!value) error = "Required";
      break;

    // DAYS VALIDATION
    case "cpap_days":
      if (updatedForm.cpap_used === "Yes") {
        if (!value) error = "Required";
        else if (!/^\d+$/.test(value)) error = "Only numbers";
        else if (value < 0 || value > 365) error = "0–365 only";
      }
      break;

    case "nippv_days":
      if (updatedForm.nippv_used === "Yes") {
        if (!value) error = "Required";
        else if (!/^\d+$/.test(value)) error = "Only numbers";
        else if (value < 0 || value > 365) error = "0–365 only";
      }
      break;

    case "imv_days":
      if (updatedForm.imv_used === "Yes") {
        if (!value) error = "Required";
        else if (!/^\d+$/.test(value)) error = "Only numbers";
        else if (value < 0 || value > 365) error = "0–365 only";
      }
      break;

    // OXYGEN EXPOSURE
    case "oxygen_exposure":
      if (value !== "") {
        const num = Number(value);
        if (isNaN(num)) error = "Must be number";
        else if (num < 0 || num > 10000) error = "0–10000";
      }
      break;

    // STEROID DRUG
    case "steroid_drug":
      if (updatedForm.postnatal_steroids === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "steroid_drug_other":
      if (
        updatedForm.postnatal_steroids === "Yes" &&
        updatedForm.steroid_drug === "Other"
      ) {
        if (!value) error = "Required";
        else if (!/^[A-Za-z\s]+$/.test(value)) error = "Only text allowed";
      }
      break;

    // AGE
    case "age_steroid":
      if (updatedForm.postnatal_steroids === "Yes") {
        if (!value) error = "Required";
        else if (!/^\d+$/.test(value)) error = "Only numbers";
        else if (value < 0 || value > 60) error = "0–60 days";
      }
      break;

    // DOSE
    case "steroid_dose":
      if (updatedForm.postnatal_steroids === "Yes") {
        if (!value) error = "Required";
        else if (value < 0 || value > 300) error = "0–300 mg/kg";
      }
      break;

    // INDICATION
    case "steroid_indication":
      if (updatedForm.postnatal_steroids === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "steroid_indication_other":
      if (
        updatedForm.postnatal_steroids === "Yes" &&
        updatedForm.steroid_indication === "Other"
      ) {
        if (!value) error = "Required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};



const validateFeeding = (name, value, updatedForm = formData) => {
  let error = "";

  const checkRange = (val, min, max) => {
    if (val === "") return "";
    if (!/^\d*\.?\d*$/.test(val)) return "Only numbers";
    if (val < min || val > max) return `${min}–${max}`;
    return "";
  };

  switch (name) {
    // ---------------- NUMERIC FIELDS ----------------
    case "age_first_feed":
      error = checkRange(value, 0, 60);
      break;

    case "age_full_feeds":
      error = checkRange(value, 0, 120);
      break;

    case "pdhm_days":
    case "ebm_days":
    case "fm_days":
      error = checkRange(value, 0, 365);
      break;

    // ---------------- PN ----------------
    case "pn":
      if (!value) error = "Required";
      break;

    case "pn_days":
      if (updatedForm.pn === "Yes") {
        if (!value) error = "Required";
        else error = checkRange(value, 0, 365);
      }
      break;

    // ---------------- PN ADVERSE ----------------
    case "pn_adverse_group":
      if (updatedForm.pn_adverse === "Yes") {
        const anyChecked =
          updatedForm.pn_cholestasis ||
          updatedForm.pn_electrolyte ||
          updatedForm.pn_acidosis ||
          updatedForm.pn_hypercapnia ||
          updatedForm.pn_other;

        if (!anyChecked) error = "Select at least one";
      }
      break;

    case "pn_other_text":
      if (updatedForm.pn_other) {
        if (!value) error = "Required";
        else if (!/^[A-Za-z\s]+$/.test(value)) error = "Only text";
      }
      break;

    // ---------------- PROBIOTIC ----------------
    case "probiotic":
      if (!value) error = "Required";
      break;

    case "strain_group":
      if (updatedForm.probiotic === "Yes") {
        const anyChecked =
          updatedForm.strain_mono ||
          updatedForm.strain_bi ||
          updatedForm.strain_multi;

        if (!anyChecked) error = "Select at least one";
      }
      break;

    // ---------------- CHOLESTASIS ----------------
    case "cholestasis":
      if (!value) error = "Required";
      break;

    case "tpn_associated":
      if (updatedForm.cholestasis === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "max_direct_bilirubin":
      if (updatedForm.cholestasis === "Yes") {
        if (!value) error = "Required";
        else error = checkRange(value, 0, 50);
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error,
    pn_adverse_group: error,
    strain_group: error
  }));
};


const validateApnea = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "apnea":
      if (!value) error = "Required";
      break;

    case "apnea_onset_age":
      if (updatedForm.apnea === "Yes") {
        if (!value) {
          error = "Required";
        } else if (!/^\d+$/.test(value)) {
          error = "Only numbers allowed";
        } else if (value < 0 || value > 60) {
          error = "Range: 0–60 days";
        }
      }
      break;

    case "caffeine_used":
      if (!value) error = "Required";
      break;

    case "caffeine_duration":
      if (updatedForm.caffeine_used === "Yes") {
        if (!value) {
          error = "Required";
        } else if (!/^\d+$/.test(value)) {
          error = "Only numbers allowed";
        } else if (value < 0 || value > 60) {
          error = "Range: 0–60 days";
        }
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};


const validateFeedIntolerance = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "feed_intolerance":
      if (!value) error = "Required";
      break;

    case "fi_group":
      if (updatedForm.feed_intolerance === "Yes") {
        const anyChecked =
          updatedForm.fi_abdominal_distension ||
          updatedForm.fi_prefeed_aspirates ||
          updatedForm.fi_altered_aspirates ||
          updatedForm.fi_sluggish_bowel;

        if (!anyChecked) {
          error = "Select at least one option";
        }
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    fi_group: error,
    [name]: error
  }));
};


const validateNEC = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "nec":
      if (!value) error = "Required";
      break;

    case "nec_stage":
      if (updatedForm.nec === "Yes" && !value) {
        error = "Stage required";
      }
      break;

    case "nec_date":
      if (updatedForm.nec === "Yes" && !value) {
        error = "Date required";
      }
      break;

    case "nec_age_days":
      if (updatedForm.nec === "Yes") {
        if (!value) error = "Required";
        else if (!/^\d+$/.test(value)) error = "Only numbers";
        else if (value < 0 || value > 120) error = "0–120 days";
      }
      break;

    case "nec_surgery":
      if (updatedForm.nec === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "nec_surgery_type":
      if (updatedForm.nec_surgery === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "nec_resection":
      if (updatedForm.nec_surgery === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "nec_resection_length":
      if (updatedForm.nec_resection === "Yes") {
        if (!value) error = "Required";
        else if (!/^\d+$/.test(value)) error = "Only numbers";
        else if (value < 0 || value > 200) error = "0–200 cm";
      }
      break;

    case "nec_stoma":
      if (updatedForm.nec_surgery === "Yes" && !value) {
        error = "Required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};


const validateShock = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    // ---------------- REQUIRED ----------------
    case "shock":
    case "hypotension":
    case "fluid_bolus":
    case "inotropes":
    case "hydrocortisone_bp":
      if (!value) error = "Required";
      break;

    // ---------------- HYPOTENSION TYPE ----------------
    case "hypotension_group":
      if (updatedForm.hypotension === "Yes") {
        const any =
          updatedForm.hypotension_systolic ||
          updatedForm.hypotension_diastolic ||
          updatedForm.hypotension_both;

        if (!any) error = "Select at least one";
      }
      break;

    // ---------------- BP VALUES ----------------
    case "sbp":
      if (value !== "") {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 120) error = "0–120 mmHg";
      }
      break;

    case "dbp":
      if (value !== "") {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 100) error = "0–100 mmHg";
      }
      break;

    case "map":
      if (value !== "") {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 120) error = "0–120 mmHg";
      }
      break;

    // ---------------- FLUID ----------------
    case "fluid_bolus_number":
      if (updatedForm.fluid_bolus === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 10) error = "0–10";
      }
      break;

    // ---------------- INOTROPE ----------------
    case "inotrope_group":
      if (updatedForm.inotropes === "Yes") {
        const any =
          updatedForm.inotrope_dopa ||
          updatedForm.inotrope_dobu ||
          updatedForm.inotrope_adr ||
          updatedForm.inotrope_nadr ||
          updatedForm.inotrope_milri ||
          updatedForm.inotrope_vaso;

        if (!any) error = "Select at least one agent";
      }
      break;

    case "inotrope_duration":
      if (updatedForm.inotropes === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 60) error = "0–60 days";
      }
      break;

    case "vis_score":
      if (updatedForm.inotropes === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 100) error = "0–100";
      }
      break;

    // ---------------- HYDROCORTISONE ----------------
    case "hc_group":
      if (updatedForm.hydrocortisone_bp === "Yes") {
        const any =
          updatedForm.hc_first_drug ||
          updatedForm.hc_after_first ||
          updatedForm.hc_after_second;

        if (!any) error = "Select at least one";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error,
    hypotension_group: error,
    inotrope_group: error,
    hc_group: error
  }));
};


// Human-readable names for the auto-fill "may be outdated" warning below —
// only needs entries for fields actually listed in a *_STALE_CHECK_FIELDS
// array (the day-count/date/numeric detail fields are deliberately never
// stale-checked, see the comment above each _STALE_CHECK_FIELDS list).
const PREFILL_FIELD_LABELS = {
  picc: "PICC", uvc: "UVC", uac: "UAC",
  peripheral_venous: "Peripheral Venous", peripheral_arterial: "Peripheral Arterial",
  extravasation: "Extravasation",
  hypoglycemia: "Hypoglycemia", hypoglycemia_rx: "Hypoglycemia Rx",
  hyperglycemia: "Hyperglycemia", hyperglycemia_rx: "Hyperglycemia Rx",
  metabolic_acidosis: "Metabolic Acidosis", dyselectrolytemia: "Dyselectrolytemia",
  dyselectro_na: "Na Abnormality", dyselectro_k: "K Abnormality", dyselectro_ca: "Ca Abnormality",
  hyponatremia: "Hyponatremia", hypernatremia: "Hypernatremia",
  hypokalemia: "Hypokalemia", hyperkalemia: "Hyperkalemia",
  hypocalcemia: "Hypocalcemia", hypercalcemia: "Hypercalcemia",
  osteopenia: "Osteopenia",
  aki: "AKI", aki_stage1: "AKI Stage 1", aki_stage2: "AKI Stage 2", aki_stage3: "AKI Stage 3",
  aki_dialysis: "Dialysis/CRRT",
  jaundice_intervention: "Jaundice", phototherapy: "Phototherapy",
  dvet: "Exchange Transfusion", prbc: "PRBC Transfusion",
  platelets: "Platelet Transfusion", ffp_cryo: "FFP/Cryo Transfusion",
  ivh_present: "IVH", pvl_present: "cPVL",
  ventriculomegaly_present: "Ventriculomegaly", seizures: "Seizures",
  feed_intolerance: "Feed Intolerance", nec: "NEC",
  pn: "PN", probiotic: "Probiotic", cholestasis: "Cholestasis",
  hypothermia: "Hypothermia", hyperthermia: "Hyperthermia",
  rop_screened: "ROP Screened", rop: "ROP Diagnosed",
  hs_pda: "HS-PDA", pda_medical_rx: "PDA Medical Rx", shock: "Shock",
  fluid_bolus: "Fluid Bolus", inotropes: "Vasoactives",
  inotrope_dopa: "Dopamine", inotrope_dobu: "Dobutamine",
  inotrope_adr: "Adrenaline", inotrope_nadr: "Noradrenaline",
  inotrope_milri: "Milrinone", inotrope_vaso: "Vasopressin",
  nasal_cannula: "Nasal Cannula", cpap: "CPAP", nippv: "NIPPV", hfnc: "HFNC",
  invasive_ventilation: "Invasive Ventilation", postnatal_steroids: "Postnatal Steroids",
  pulmonary_hemorrhage: "Pulmonary Hemorrhage", pneumothorax: "Pneumothorax",
  chest_drain: "Chest Drain", pulmonary_hypertension: "Pulmonary Hypertension",
  extubation_failure: "Extubation Failure", apnea: "Apnea", caffeine_used: "Caffeine",
};

// Vascular Access (H10.1/H10.2) auto-fill. Only ever fills a field that is
// currently empty — never overwrites a value the clinician (or a previous
// save) already put there. Safe to call more than once (e.g. the "Refill
// from daily logs" button): fields already filled or edited are untouched.
const VASCULAR_PREFILL_FIELDS = [
  "picc", "picc_days",
  "uvc", "uvc_days",
  "uac", "uac_days",
  "peripheral_venous",
  "peripheral_arterial",
  "extravasation",
];

// Only the Yes/No fields get checked for "does Form H's saved answer still
// match the daily logs" — day-count fields (picc_days etc.) are excluded
// on purpose: those grow every day a line stays in, so they'd "disagree"
// constantly for any still-admitted baby and the warning would lose all
// signal. A flipped Yes/No is a genuine fact to review; a bigger day count
// is just expected drift.
const VASCULAR_STALE_CHECK_FIELDS = [
  "picc", "uvc", "uac", "peripheral_venous", "peripheral_arterial", "extravasation",
];

const isBlank = (v) => v === "" || v === undefined || v === null;

// force: overwrite fields that already hold an answer, not just blank ones.
// Needed when Form H was answered before the day logs had the data yet —
// the normal empty-fields-only fill can never self-correct that (an
// already-answered field is never "blank" again), so it's a separate,
// explicit, opt-in action rather than something that happens automatically.
const fetchVascularAccessPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/vascular-access-prefill/${enrollmentId}`);
    const data = res.data;
    setVascularPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      VASCULAR_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && VASCULAR_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setVascularAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setVascularStale(stale);
  } catch (err) {
    console.log("Error fetching vascular access prefill", err);
  }
};

// A field stops being "auto-filled" the moment the clinician touches it —
// from then on it's an ordinary entered value, badge and all.
const clearVascularAutoFilled = (name) => {
  setVascularAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleVascularChange = (e) => {
  clearVascularAutoFilled(e.target.name);
  handleChange(e);
};

// Metabolic Disturbances (H4.1) auto-fill — same pattern as Vascular
// Access above. Includes both the Yes/No toggle fields (string "Yes"/"No")
// and the Type-checkbox / hypo-hyper checkbox fields (real booleans) —
// isBlank treats an unset value the same way for both, since every one of
// these NeonatalMorbidities columns is nullable with no default (verified
// against models.py before wiring this up).
const METABOLIC_PREFILL_FIELDS = [
  "hypoglycemia", "hypoglycemia_episodes", "hypoglycemia_lowest",
  "hypoglycemia_rx", "hypoglycemia_rx_duration",
  "hyperglycemia", "hyperglycemia_highest", "hyperglycemia_rx",
  "metabolic_acidosis",
  "dyselectrolytemia", "dyselectro_na", "dyselectro_k", "dyselectro_ca",
  "hyponatremia", "hypernatremia",
  "hypokalemia", "hyperkalemia",
  "hypocalcemia", "hypercalcemia",
  "osteopenia",
];

// Only the Yes/No + Type-checkbox fields get checked for staleness — the
// numeric detail fields (episode counts, lowest/highest readings, Rx
// duration) are excluded on purpose, same reasoning as
// VASCULAR_STALE_CHECK_FIELDS: those are expected to keep changing as more
// daily-log entries come in, so flagging them would be constant noise, not
// a signal that Form H's *answer* is now wrong.
const METABOLIC_STALE_CHECK_FIELDS = [
  "hypoglycemia", "hypoglycemia_rx", "hyperglycemia", "hyperglycemia_rx",
  "metabolic_acidosis", "dyselectrolytemia",
  "dyselectro_na", "dyselectro_k", "dyselectro_ca",
  "hyponatremia", "hypernatremia", "hypokalemia", "hyperkalemia",
  "hypocalcemia", "hypercalcemia", "osteopenia",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchMetabolicPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/metabolic-prefill/${enrollmentId}`);
    const data = res.data;
    setMetabolicPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      METABOLIC_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && METABOLIC_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setMetabolicAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setMetabolicStale(stale);
  } catch (err) {
    console.log("Error fetching metabolic prefill", err);
  }
};

const clearMetabolicAutoFilled = (name) => {
  setMetabolicAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleMetabolicChange = (e) => {
  clearMetabolicAutoFilled(e.target.name);
  handleChange(e);
};

// Renal / AKI (H7.1) auto-fill — same pattern as Vascular Access and
// Metabolic above. aki_oliguria is deliberately excluded: there's no
// reliable day-log source for it (see backend endpoint docstring), so it
// always stays manual and is never listed here.
const RENAL_PREFILL_FIELDS = [
  "aki", "aki_date",
  "aki_stage1", "aki_stage2", "aki_stage3",
  "aki_peak_creatinine",
  "aki_dialysis",
];

// Only the Yes/No + stage checkboxes get checked for staleness — aki_date
// and aki_peak_creatinine are excluded on purpose, same reasoning as
// VASCULAR_STALE_CHECK_FIELDS: peak creatinine only ever goes up as more
// readings come in, and the onset date is a one-time fact once set, so
// neither would be a meaningful "review this" signal the way a changed
// AKI status or stage is.
const RENAL_STALE_CHECK_FIELDS = [
  "aki", "aki_stage1", "aki_stage2", "aki_stage3", "aki_dialysis",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchRenalPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/renal-prefill/${enrollmentId}`);
    const data = res.data;
    setRenalPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      RENAL_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && RENAL_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setRenalAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setRenalStale(stale);
  } catch (err) {
    console.log("Error fetching renal prefill", err);
  }
};

const clearRenalAutoFilled = (name) => {
  setRenalAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleRenalChange = (e) => {
  clearRenalAutoFilled(e.target.name);
  handleChange(e);
};

// Hematology (H6) auto-fill — same pattern as Vascular Access/Metabolic/
// Renal above. jaundice_type, jaundice_passive, bind, ivig, the etiology
// selects, and everything under Anemia (including the anemia Yes/No itself
// — no single Hb cutoff is valid across every gestation/postnatal age) are
// deliberately excluded: no reliable day-log source, or a genuine clinical
// judgement call, see the backend endpoint docstring.
const HEME_PREFILL_FIELDS = [
  "jaundice_intervention", "jaundice_onset",
  "peak_tsb", "phototherapy",
  "dvet", "dvet_number",
  "lowest_hb",
  "prbc", "prbc_number",
  "platelets", "platelet_number",
  "ffp_cryo", "ffp_number",
];

// Only the Yes/No fields get checked for staleness — jaundice_onset,
// peak_tsb, lowest_hb and the *_number day-counts are excluded on purpose,
// same reasoning as the other domains: those keep drifting naturally as
// more daily-log entries come in, so flagging them would be noise, not a
// meaningful "review this" signal.
const HEME_STALE_CHECK_FIELDS = [
  "jaundice_intervention", "phototherapy", "dvet", "prbc", "platelets", "ffp_cryo",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchHemePrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/heme-prefill/${enrollmentId}`);
    const data = res.data;
    setHemePrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      HEME_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && HEME_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setHemeAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setHemeStale(stale);
  } catch (err) {
    console.log("Error fetching heme prefill", err);
  }
};

const clearHemeAutoFilled = (name) => {
  setHemeAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleHemeChange = (e) => {
  clearHemeAutoFilled(e.target.name);
  handleChange(e);
};

// Neurological (H1) auto-fill — same pattern as the other domains above.
// The day log only records flat booleans with no side and no grade, so
// only the top-level "was X ever present" Yes/No for IVH/cPVL/
// Ventriculomegaly/Seizures can be safely derived — everything that
// requires reading an actual scan or EEG trace (side, grade, per-side
// date/age, ventriculomegaly measurements, seizure type/EEG result/AEDs/
// etiology) stays manual, see the backend endpoint docstring.
const NEURO_PREFILL_FIELDS = [
  "ivh_present", "pvl_present", "ventriculomegaly_present",
  "seizures", "seizure_date",
];

// All 4 Yes/No fields get checked for staleness — seizure_date is
// excluded on purpose, same reasoning as the other domains' onset dates:
// it's a one-time fact once set, not something that keeps changing in a
// way that would make "disagrees" a meaningful signal.
const NEURO_STALE_CHECK_FIELDS = [
  "ivh_present", "pvl_present", "ventriculomegaly_present", "seizures",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchNeuroPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/neuro-prefill/${enrollmentId}`);
    const data = res.data;
    setNeuroPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      NEURO_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && NEURO_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setNeuroAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setNeuroStale(stale);
  } catch (err) {
    console.log("Error fetching neuro prefill", err);
  }
};

const clearNeuroAutoFilled = (name) => {
  setNeuroAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleNeuroChange = (e) => {
  clearNeuroAutoFilled(e.target.name);
  handleChange(e);
};

// Gastrointestinal (H3) auto-fill — same pattern as the other domains
// above. nec is driven by the day log's `nec_suspected` flag, the same
// "suspected drives the top-level Yes/No, clinician reviews/can uncheck"
// convention already used for Renal's AKI. nec_stage/surgery detail,
// age_full_feeds, PN adverse-effect breakdown, probiotic strain detail,
// tpn_associated, max_direct_bilirubin, and the feed-intolerance symptom
// checkboxes all have no day-log source and stay manual — see the
// backend endpoint docstring.
const GI_PREFILL_FIELDS = [
  "feed_intolerance",
  "nec", "nec_date", "nec_age_days",
  "age_first_feed",
  "pdhm_days", "ebm_days", "fm_days",
  "pn", "pn_days",
  "probiotic",
  "cholestasis",
];

// Only the 5 Yes/No fields get checked for staleness — nec_date/
// nec_age_days/age_first_feed/pdhm_days/ebm_days/fm_days/pn_days are
// excluded on purpose, same reasoning as every other domain: those keep
// drifting naturally as more daily-log entries come in, so flagging them
// would be noise, not a meaningful "review this" signal.
const GI_STALE_CHECK_FIELDS = [
  "feed_intolerance", "nec", "pn", "probiotic", "cholestasis",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchGiPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/gi-prefill/${enrollmentId}`);
    const data = res.data;
    setGiPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      GI_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && GI_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setGiAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setGiStale(stale);
  } catch (err) {
    console.log("Error fetching GI prefill", err);
  }
};

const clearGiAutoFilled = (name) => {
  setGiAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleGiChange = (e) => {
  clearGiAutoFilled(e.target.name);
  handleChange(e);
};

// ROP (H8) + Thermoregulation (H9) auto-fill — same pattern as the other
// domains above. Only the top-level any-day Yes/No + earliest-day-derived
// onset date are safe: the day log's rop_stage/plus_disease/rop_treatment
// are single flat fields with no left/right split, so per-eye detail
// can't be assigned without guessing a side — same reasoning as IVH/PVL
// in the Neuro domain. Severity/location/etiology checkboxes under
// Thermoregulation have no day-log source either, see the backend
// endpoint docstring.
const ROP_THERMO_PREFILL_FIELDS = [
  "hypothermia", "hypothermia_lowest_temp",
  "hyperthermia", "hyperthermia_temp",
  "rop_screened", "rop_first_screen_date",
  "rop", "rop_diagnosis_date",
];

// Only the 4 Yes/No fields get checked for staleness — the temperature
// extremes and onset dates are excluded on purpose, same reasoning as
// every other domain: those keep drifting or are one-time facts once
// set, not a meaningful "review this" signal.
const ROP_THERMO_STALE_CHECK_FIELDS = [
  "hypothermia", "hyperthermia", "rop_screened", "rop",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchRopThermoPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/rop-thermoreg-prefill/${enrollmentId}`);
    const data = res.data;
    setRopThermoPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      ROP_THERMO_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && ROP_THERMO_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setRopThermoAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setRopThermoStale(stale);
  } catch (err) {
    console.log("Error fetching ROP/thermoregulation prefill", err);
  }
};

const clearRopThermoAutoFilled = (name) => {
  setRopThermoAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleRopThermoChange = (e) => {
  clearRopThermoAutoFilled(e.target.name);
  handleChange(e);
};

// Cardiovascular (H5) auto-fill — same pattern as the other domains
// above. Structural Heart Disease has no day-log source at all so isn't
// represented here. Every PDA/hypotension/VIS-score clinical/echo detail
// field stays manual — see the backend endpoint docstring.
const CV_PREFILL_FIELDS = [
  "hs_pda", "pda_medical_rx",
  "shock",
  "fluid_bolus", "fluid_bolus_number",
  "inotropes", "inotrope_duration",
  "inotrope_dopa", "inotrope_dobu", "inotrope_adr",
  "inotrope_nadr", "inotrope_milri", "inotrope_vaso",
];

// The Yes/No fields plus the 6 individual drug checkboxes get checked for
// staleness (drug checkboxes are simple booleans, same as Metabolic's
// dyselectro_na/k/ca) — fluid_bolus_number/inotrope_duration are excluded
// on purpose, same reasoning as every other domain's day-count fields.
const CV_STALE_CHECK_FIELDS = [
  "hs_pda", "pda_medical_rx", "shock", "fluid_bolus", "inotropes",
  "inotrope_dopa", "inotrope_dobu", "inotrope_adr",
  "inotrope_nadr", "inotrope_milri", "inotrope_vaso",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchCvPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/cv-prefill/${enrollmentId}`);
    const data = res.data;
    setCvPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      CV_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && CV_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setCvAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setCvStale(stale);
  } catch (err) {
    console.log("Error fetching CV prefill", err);
  }
};

const clearCvAutoFilled = (name) => {
  setCvAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleCvChange = (e) => {
  clearCvAutoFilled(e.target.name);
  handleChange(e);
};

// Infection (H11) — detection-only. Unlike every domain above, this
// never fills a Form H field on its own: Form H's Infection section is a
// dynamic array of clinician-judged episodes, and the day log has no
// concept of an episode at all (only flat per-day flags), so deciding
// "how many episodes, where do they start/end" is a genuine clinical
// judgment call the PI confirmed can't be ruled. What IS safe: detecting
// which daily-log windows meet the PI-specified trigger rule (culture
// positive / screen positive / antibiotics >5 continuous days / meningitis
// / CLABSI / VAP) and surfacing them for review — see the backend
// endpoint's docstring for the full rule and priority order.
const fetchInfectionWindows = async () => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/infection-detect/${enrollmentId}`);
    const data = res.data;
    setInfectionWindows(data && data.has_data ? (data.windows || []) : []);
  } catch (err) {
    console.log("Error fetching infection windows", err);
  }
};

const isInfectionFlagReviewed = (signature) =>
  (formData.infection_flags_reviewed || []).includes(signature);

const toggleInfectionFlagReviewed = (signature) => {
  setFormData((prev) => {
    const current = prev.infection_flags_reviewed || [];
    const next = current.includes(signature)
      ? current.filter((s) => s !== signature)
      : [...current, signature];
    return { ...prev, infection_flags_reviewed: next };
  });
};

// Only fires from an explicit clinician click on a specific detected
// window — never automatically. Pre-fills the new entry's sepsis type /
// CLABSI / VAP flags from that one window (editable, not locked), same
// verify-before-saving discipline as every other domain's auto-fill.
// Deliberately does NOT pre-fill sepsis_onset_age: the day log only has
// day-granularity data, and inventing an hour-precision value from that
// would be a fabrication, not a derivation, for a field CRF explicitly
// asks for in hours.
const addInfectionFromWindow = (detectedWindow) => {
  const nextIdx = (formData.infections || []).length;
  const prefill = { ...emptyInfection(), sepsis: "Yes" };
  if (detectedWindow.suggested_type === "culture") prefill.sepsis_culture = true;
  else if (detectedWindow.suggested_type === "screen") prefill.sepsis_screen = true;
  else if (detectedWindow.suggested_type === "clinical") prefill.sepsis_clinical = true;
  if (detectedWindow.clabsi) prefill.clabsi = "Yes";
  if (detectedWindow.vap) prefill.vap = "Yes";
  setFormData((prev) => ({
    ...prev,
    infections: [...(prev.infections || []), prefill],
  }));
  toggleInfectionFlagReviewed(detectedWindow.signature);
  setOpenSection(`infection-${nextIdx}`);
};

// Gates the "Form H complete" tick (see saveFormH/handleSubmit below) —
// staff can always save partial progress, this only blocks the
// completed status while a detected trigger window hasn't been either
// reviewed or acted on.
const allInfectionFlagsReviewed = infectionWindows.every((w) => isInfectionFlagReviewed(w.signature));

// Respiratory (H2) auto-fill — same pattern as the other domains above.
// BPD (H2.1) has no entry here at all — see the backend endpoint
// docstring for why it needs its own dedicated design pass rather than
// being folded into this domain.
const RESP_PREFILL_FIELDS = [
  "oxygen_days",
  "nasal_cannula", "nasal_cannula_days",
  "cpap", "cpap_days",
  "nippv", "nippv_days",
  "hfnc", "hfnc_days",
  "invasive_ventilation", "imv_days",
  "postnatal_steroids",
  "pulmonary_hemorrhage",
  "pneumothorax",
  "chest_drain",
  "pulmonary_hypertension",
  "extubation_failure", "extubation_episodes",
  "apnea", "apnea_onset_age",
  "caffeine_used", "caffeine_duration",
];

// Only the Yes/No fields get checked for staleness — every *_days/
// *_episodes/*_age field is excluded on purpose, same reasoning as
// every other domain: those keep drifting naturally as more daily-log
// entries come in, so flagging them would be noise, not a meaningful
// "review this" signal.
const RESP_STALE_CHECK_FIELDS = [
  "nasal_cannula", "cpap", "nippv", "hfnc", "invasive_ventilation",
  "postnatal_steroids", "pulmonary_hemorrhage", "pneumothorax",
  "chest_drain", "pulmonary_hypertension", "extubation_failure",
  "apnea", "caffeine_used",
];

// force: see the comment on fetchVascularAccessPrefill above — overwrites
// already-answered fields instead of only blank ones.
const fetchRespPrefill = async ({ force = false } = {}) => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/resp-prefill/${enrollmentId}`);
    const data = res.data;
    setRespPrefill(data);
    if (!data || !data.has_data) return;

    const filled = {};
    const stale = {};
    setFormData((prev) => {
      const next = { ...prev };
      RESP_PREFILL_FIELDS.forEach((field) => {
        const value = data[field];
        if (isBlank(value)) return;
        const currentlyBlank = isBlank(prev[field]);
        const disagrees = !currentlyBlank
          && RESP_STALE_CHECK_FIELDS.includes(field)
          && String(prev[field]) !== String(value);
        if (currentlyBlank || (force && disagrees)) {
          next[field] = value;
          filled[field] = true;
        } else if (disagrees) {
          stale[field] = true;
        }
      });
      return next;
    });
    if (Object.keys(filled).length) {
      setRespAutoFilled((prev) => ({ ...prev, ...filled }));
    }
    setRespStale(stale);
  } catch (err) {
    console.log("Error fetching respiratory prefill", err);
  }
};

const clearRespAutoFilled = (name) => {
  setRespAutoFilled((prev) => {
    if (!prev[name]) return prev;
    const next = { ...prev };
    delete next[name];
    return next;
  });
};

const handleRespChange = (e) => {
  clearRespAutoFilled(e.target.name);
  handleChange(e);
};

// Shared confirm gate for the "Force refill" actions below — this is
// the one action in the auto-fill machinery that can genuinely destroy a
// clinician's entered answer (replacing it with a daily-log-derived value),
// so it always requires an explicit confirmation, unlike the empty-fields
// refill which is always safe to re-run.
const confirmForceRefill = (domainLabel, fetchFn) => {
  if (
    window.confirm(
      `Overwrite already-answered ${domainLabel} fields with the latest daily-log data?\n\n` +
      "This replaces existing answers, not just blank ones — use this only when Form H " +
      "was filled in before the daily logs had this data (or the daily logs were corrected " +
      "afterward). Any field you've entered manually and that now differs from the daily " +
      "logs will be overwritten."
    )
  ) {
    fetchFn({ force: true });
  }
};

// "Did not survive" prompt — checks the one day-log field
// (metab_renal_vasc_eye_day_logs.survived_the_day) that records this,
// and if any day was marked "No", offers a single button that runs
// every domain's existing Force Refill at once. This doesn't invent any
// new auto-fill logic — it's the same overwrite-aware mechanism used
// throughout, just triggered in bulk instead of one section at a time,
// because a field answered "No" early in the admission (before things
// got worse) never gets revisited by the normal only-fill-if-blank pass.
const fetchSurvivalCheck = async () => {
  if (!enrollmentId) return;
  try {
    const res = await api.get(`/neonatal-morbidities/survival-check/${enrollmentId}`);
    const data = res.data;
    setSurvivalAlert(data && data.did_not_survive ? data : null);
  } catch (err) {
    console.log("Error fetching survival check", err);
  }
};

const forceRefillAllDomains = async () => {
  if (
    !window.confirm(
      "Overwrite already-answered fields across every section (Neurological, " +
      "Respiratory, Gastrointestinal, Metabolic, Cardiovascular, Hematology, " +
      "Renal, Ophthalmology/Thermoregulation, Vascular Access) with the " +
      "latest daily-log data?\n\nThis replaces existing answers, not just " +
      "blank ones — use this to make sure the full picture from every day " +
      "of daily logs is reflected before finalizing this record."
    )
  ) {
    return;
  }
  setForceRefillingAll(true);
  try {
    await Promise.all([
      fetchVascularAccessPrefill({ force: true }),
      fetchMetabolicPrefill({ force: true }),
      fetchRenalPrefill({ force: true }),
      fetchHemePrefill({ force: true }),
      fetchNeuroPrefill({ force: true }),
      fetchGiPrefill({ force: true }),
      fetchRopThermoPrefill({ force: true }),
      fetchCvPrefill({ force: true }),
      fetchRespPrefill({ force: true }),
    ]);
  } finally {
    setForceRefillingAll(false);
  }
};

const validateMetabolic = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    // ---------------- REQUIRED SELECTS ----------------
    case "hypoglycemia":
    case "hyperglycemia":
    case "metabolic_acidosis":
    case "dyselectrolytemia":
    case "osteopenia":
      if (!value) error = "Required";
      break;

    // ---------------- HYPOGLYCEMIA (95-99) ----------------
    case "hypoglycemia_episodes":
      if (updatedForm.hypoglycemia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 50) error = "0–50 episodes";
      }
      break;

    case "hypoglycemia_lowest":
      if (updatedForm.hypoglycemia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 200) error = "0–200 mg/dL";
      }
      break;

    case "hypoglycemia_rx":
      if (updatedForm.hypoglycemia === "Yes" && !value) error = "Required";
      break;

    case "hypoglycemia_rx_duration":
      if (updatedForm.hypoglycemia === "Yes" && updatedForm.hypoglycemia_rx === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 60) error = "0–60 days";
      }
      break;

    // ---------------- HYPERGLYCEMIA (100-102) ----------------
    case "hyperglycemia_highest":
      if (updatedForm.hyperglycemia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 500) error = "0–500 mg/dL";
      }
      break;

    case "hyperglycemia_rx":
      if (updatedForm.hyperglycemia === "Yes" && !value) error = "Required";
      break;

    // ---------------- DYSELECTROLYTEMIA (104-111) ----------------
    case "dyselectro_group":
      if (updatedForm.dyselectrolytemia === "Yes") {
        const anyChecked =
          updatedForm.dyselectro_na ||
          updatedForm.dyselectro_k ||
          updatedForm.dyselectro_ca;

        if (!anyChecked) error = "Select at least one";
      }
      break;

    case "hyponatremia_status":
      if (updatedForm.dyselectro_na && updatedForm.hyponatremia && !value) error = "Required";
      break;
    case "hyponatremia_symptoms":
      if (updatedForm.dyselectro_na && updatedForm.hyponatremia && updatedForm.hyponatremia_status === "Symptomatic" && !value) error = "Required";
      break;

    case "hypernatremia_status":
      if (updatedForm.dyselectro_na && updatedForm.hypernatremia && !value) error = "Required";
      break;
    case "hypernatremia_symptoms":
      if (updatedForm.dyselectro_na && updatedForm.hypernatremia && updatedForm.hypernatremia_status === "Symptomatic" && !value) error = "Required";
      break;

    case "hypokalemia_status":
      if (updatedForm.dyselectro_k && updatedForm.hypokalemia && !value) error = "Required";
      break;
    case "hypokalemia_symptoms":
      if (updatedForm.dyselectro_k && updatedForm.hypokalemia && updatedForm.hypokalemia_status === "Symptomatic" && !value) error = "Required";
      break;

    case "hyperkalemia_status":
      if (updatedForm.dyselectro_k && updatedForm.hyperkalemia && !value) error = "Required";
      break;
    case "hyperkalemia_symptoms":
      if (updatedForm.dyselectro_k && updatedForm.hyperkalemia && updatedForm.hyperkalemia_status === "Symptomatic" && !value) error = "Required";
      break;

    case "hypocalcemia_status":
      if (updatedForm.dyselectro_ca && updatedForm.hypocalcemia && !value) error = "Required";
      break;
    case "hypocalcemia_symptoms":
      if (updatedForm.dyselectro_ca && updatedForm.hypocalcemia && updatedForm.hypocalcemia_status === "Symptomatic" && !value) error = "Required";
      break;

    case "hypercalcemia_status":
      if (updatedForm.dyselectro_ca && updatedForm.hypercalcemia && !value) error = "Required";
      break;
    case "hypercalcemia_symptoms":
      if (updatedForm.dyselectro_ca && updatedForm.hypercalcemia && updatedForm.hypercalcemia_status === "Symptomatic" && !value) error = "Required";
      break;

    // ---------------- OSTEOPENIA (112-115) ----------------
    case "alp_peak":
      if (updatedForm.osteopenia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 6000) error = "0–6000 IU/L";
      }
      break;

    case "lowest_calcium":
      if (updatedForm.osteopenia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 15) error = "0–15 mg/dL";
      }
      break;

    case "lowest_phosphorus":
      if (updatedForm.osteopenia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 15) error = "0–15 mg/dL";
      }
      break;

    default:
      break;
  }

  // NOTE: this used to unconditionally overwrite errors.dyselectro_group
  // with whatever field was JUST validated (e.g. validating alp_peak would
  // clobber the dyselectro_group error with alp_peak's error/blank state).
  // Only touch dyselectro_group when it's actually the field being validated.
  setErrors(prev => ({
    ...prev,
    [name]: error,
  }));
};


const validateROP = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {

    // ---------------- REQUIRED ----------------
    case "rop_screened":
    case "rop":
      if (!value) error = "Required";
      break;

    // ---------------- SCREENING (180-181) ----------------
    case "rop_method":
      if (updatedForm.rop_screened === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "rop_first_screen_date":
      if (updatedForm.rop_screened === "Yes" && !value) {
        error = "Required";
      }
      break;

    // ---------------- DIAGNOSIS (183-184) ----------------
    case "rop_diagnosis_date":
      if (updatedForm.rop === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "rop_side":
      if (updatedForm.rop === "Yes" && !value) {
        error = "Required";
      }
      break;

    // ---------------- RIGHT EYE (185-190) ----------------
    case "rop_stage_right":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Right" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_plus_right":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Right" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_zone_right":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Right" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_arop_right":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Right" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_treatment_right":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Right" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_treatment_type_right_group":
      if (updatedForm.rop_treatment_right === "Yes") {
        const any =
          updatedForm.rop_laser_right ||
          updatedForm.rop_anti_vegf_right ||
          updatedForm.rop_vitrectomy_right ||
          updatedForm.rop_other_right;
        if (!any) error = "Select at least one treatment type";
      }
      break;

    case "rop_other_text_right":
      if (updatedForm.rop_other_right && !value) {
        error = "Required";
      }
      break;

    // ---------------- LEFT EYE (191-196) ----------------
    case "rop_stage_left":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Left" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_plus_left":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Left" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_zone_left":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Left" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_arop_left":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Left" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_treatment_left":
      if (updatedForm.rop === "Yes"
        && (updatedForm.rop_side === "Left" || updatedForm.rop_side === "Bilateral")
        && !value) {
        error = "Required";
      }
      break;

    case "rop_treatment_type_left_group":
      if (updatedForm.rop_treatment_left === "Yes") {
        const any =
          updatedForm.rop_laser_left ||
          updatedForm.rop_anti_vegf_left ||
          updatedForm.rop_vitrectomy_left ||
          updatedForm.rop_other_left;
        if (!any) error = "Select at least one treatment type";
      }
      break;

    case "rop_other_text_left":
      if (updatedForm.rop_other_left && !value) {
        error = "Required";
      }
      break;

    default:
      break;
  }

  // NOTE: this used to unconditionally overwrite every rop_*_group error
  // with whatever field was JUST validated (the same bug fixed in
  // validateMetabolic's dyselectro_group). Only touch the field actually
  // being validated.
  setErrors(prev => ({
    ...prev,
    [name]: error,
  }));
};

const validateJaundice = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    // ---------------- REQUIRED ----------------
    case "jaundice_type":
    case "anemia":
      if (!value) error = "Required";
      break;

    // ---------------- UNCONJUGATED ----------------
    case "jaundice_onset":
      if (updatedForm.jaundice_type === "Unconjugated" && !value) {
        error = "Required";
      }
      break;

    case "peak_tsb":
      if (updatedForm.jaundice_type === "Unconjugated") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 50) error = "0–50 mg/dL";
      }
      break;

    case "bind":
    case "phototherapy":
    case "dvet":
    case "ivig":
      if (updatedForm.jaundice_type === "Unconjugated" && !value) {
        error = "Required";
      }
      break;

    case "dvet_number":
      if (updatedForm.dvet === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 1 || value > 10) error = "1–10";
      }
      break;

    case "unconj_etiology":
      if (updatedForm.jaundice_type === "Unconjugated") {
        if (!value) error = "Required";
        else if (!/^[A-Za-z\s]+$/.test(value)) error = "Only text";
      }
      break;

    // ---------------- CONJUGATED ----------------
    case "jaundice_etiology":
      if (updatedForm.jaundice_type === "Conjugated" && !value) {
        error = "Required";
      }
      break;

    case "jaundice_etiology_other":
      if (updatedForm.jaundice_etiology === "Others" && !value) {
        error = "Required";
      }
      break;

    // ---------------- ANEMIA ----------------
    case "anemia_onset":
      if (updatedForm.anemia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 365) error = "0–365 days";
      }
      break;

    case "lowest_hb":
      if (updatedForm.anemia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 25) error = "0–25";
      }
      break;

    case "anemia_chf":
    case "anemia_etiology":
      if (updatedForm.anemia === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "anemia_etiology_other":
      if (updatedForm.anemia_etiology === "Other" && !value) {
        error = "Required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};


const validatePDA = (name, value, updatedForm = formData) => {
  let error = "";

  const isNumber = (val) => /^\d*\.?\d*$/.test(val);

  switch (name) {

    case "hs_pda":
      if (!value) error = "Required";
      break;

    // ---------------- DIAGNOSIS ----------------
    case "pda_diagnosis_group":
      if (updatedForm.hs_pda === "Yes") {
        const any =
          updatedForm.pda_clinical ||
          updatedForm.pda_echo ||
          updatedForm.pda_both;

        if (!any) error = "Select at least one";
      }
      break;

    // ---------------- OTHER FEATURE ----------------
    case "pda_other_feature_text":
      if (updatedForm.pda_other_feature) {
        if (!value) error = "Required";
        else if (!/^[A-Za-z\s]+$/.test(value)) error = "Only text";
      }
      break;

    // ---------------- ECHO NUMERIC ----------------
    case "pda_tdd":
      if (value && (!isNumber(value) || value > 10)) {
        error = "0–10 mm";
      }
      break;

    case "pda_peak_velocity":
      if (value && (!isNumber(value) || value > 5)) {
        error = "0–5 m/s";
      }
      break;

    case "pda_la_ao":
      if (value && (!isNumber(value) || value > 5)) {
        error = "0–5";
      }
      break;

    case "pda_lpa_velocity":
      if (value && (!isNumber(value) || value > 300)) {
        error = "0–300 cm/s";
      }
      break;

    // ---------------- PATTERN ----------------
    case "pda_pattern_group":
      if (updatedForm.pda_echo) {
        const any =
          updatedForm.pda_pattern_growing ||
          updatedForm.pda_pattern_pulsatile ||
          updatedForm.pda_pattern_none;

        if (!any) error = "Select at least one";
      }
      break;

    case "pda_shunt":
      if (updatedForm.pda_echo && !value) {
        error = "Required";
      }
      break;

    // ---------------- MEDICAL ----------------
    case "pda_medical_group":
      if (updatedForm.pda_medical_rx === "Yes") {
        const any =
          updatedForm.pda_indo ||
          updatedForm.pda_ibu ||
          updatedForm.pda_pcm;

        if (!any) error = "Select at least one drug";
      }
      break;

    case "pda_courses":
      if (updatedForm.pda_medical_rx === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value) || value > 10) error = "0–10";
      }
      break;

    // ---------------- INTERVENTION RX ----------------
    case "pda_ligation_age":
      if (updatedForm.pda_intervention_rx === "Ligation") {
        if (!value) error = "Required";
        else if (!isNumber(value) || value > 120) error = "0–120 days";
      }
      break;

    case "pda_device_closure_age":
      if (updatedForm.pda_intervention_rx === "Device closure") {
        if (!value) error = "Required";
        else if (!isNumber(value) || value > 120) error = "0–120 days";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error,
    pda_diagnosis_group: error,
    pda_pattern_group: error,
    pda_medical_group: error
  }));
};


const validateSeizures = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "seizures":
      if (!value) error = "Please select seizure status";
      break;

    case "seizure_date":
      if (updatedForm.seizures === "Yes" && !value) {
        error = "Date is required";
      }
      break;

    case "seizure_type":
      if (updatedForm.seizures === "Yes" && !value) {
        error = "Type is required";
      }
      break;

    case "aed_name":
      if (updatedForm.aeds_required === "Yes" && !value) {
        error = "Enter AED name";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validateICH = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "non_ivh_ich":
      if (!value) error = "Please select status";
      break;

    case "ich_type":
      if (updatedForm.non_ivh_ich === "Yes" && !value) {
        error = "Type is required";
      }
      break;

    case "ich_type_other":
      if (
        updatedForm.non_ivh_ich === "Yes" &&
        updatedForm.ich_type === "Other"
      ) {
        if (!value) {
          error = "Please specify type";
        } else if (!/^[A-Za-z\s]+$/.test(value)) {
          error = "Only alphabets allowed";
        }
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validateMeningitis = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "meningitis":
      if (!value) error = "Please select status";
      break;

    case "meningitis_type":
      if (updatedForm.meningitis === "Yes" && !value) {
        error = "Type is required";
      }
      break;

    case "meningitis_date":
      if (updatedForm.meningitis === "Yes" && !value) {
        error = "Date is required";
      }
      break;

    case "csf_organism":
      if (
        updatedForm.meningitis === "Yes" &&
        updatedForm.csf_culture === "Positive"
      ) {
        if (!value) {
          error = "Organism required";
        } else if (!/^[A-Za-z\s]+$/.test(value)) {
          error = "Only alphabets allowed";
        }
      }
      break;

    case "csf_protein":
    case "csf_glucose":
    case "csf_cells":
      if (value !== "" && isNaN(value)) {
        error = "Must be a number";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};


useEffect(() => {
  if (formData.ventriculomegaly_present === "No") {
    setFormData(prev => ({
      ...prev,
      vi_max: "",
      ahw: "",
      tod_max: "",
      aca_ri: "",
      mca_ri: ""
    }));
  }
}, [formData.ventriculomegaly_present]);

useEffect(() => {
  if (formData.picc === "No") {
    setFormData(prev => ({ ...prev, picc_days: "" }));
  }
}, [formData.picc]);

useEffect(() => {
  if (formData.uvc === "No") {
    setFormData(prev => ({ ...prev, uvc_days: "" }));
  }
}, [formData.uvc]);

useEffect(() => {
  if (formData.uac === "No") {
    setFormData(prev => ({ ...prev, uac_days: "" }));
  }
}, [formData.uac]);

useEffect(() => {
  if (formData.seizures === "No") {
    setFormData(prev => ({
      ...prev,
      seizure_date: "",
      seizure_type: "",
      eeg: "",
      aeds_required: "",
      aed_name: "",
      seizure_etiology: ""
    }));

    setErrors(prev => ({
      ...prev,
      seizure_date: "",
      seizure_type: "",
      aed_name: ""
    }));
  }
}, [formData.seizures]);

useEffect(() => {
  if (formData.postnatal_steroids === "No") {
    setFormData(prev => ({
      ...prev,
      steroid_drug: "",
      steroid_drug_other: "",
      age_steroid: "",
      steroid_dose: "",
      steroid_dose_2: "",
      steroid_indication: "",
      steroid_indication_other: ""
    }));

    setErrors(prev => ({
      ...prev,
      steroid_drug: "",
      steroid_drug_other: "",
      age_steroid: "",
      steroid_dose: "",
      steroid_dose_2: "",
      steroid_indication: "",
      steroid_indication_other: ""
    }));
  }
}, [formData.postnatal_steroids]);

useEffect(() => {
  if (formData.aeds_required === "No") {
    setFormData(prev => ({
      ...prev,
      aed_name: "",
      seizure_etiology: ""
    }));

    setErrors(prev => ({
      ...prev,
      aed_name: ""
    }));
  }
}, [formData.aeds_required]);

useEffect(() => {
  if (formData.hs_pda === "No") {
    setFormData(prev => ({
      ...prev,
      pda_clinical: false,
      pda_echo: false,
      pda_both: false
    }));
  }
}, [formData.hs_pda]);
useEffect(() => {
  if (formData.aki === "No") {
    setFormData(prev => ({
      ...prev,
      aki_date: "",
      aki_stage1: false,
      aki_stage2: false,
      aki_stage3: false,
      aki_peak_creatinine: "",
      aki_oliguria: "",
      aki_dialysis: ""
    }));
  }
}, [formData.aki]);

useEffect(() => {
  if (formData.prbc === "No") {
    setFormData(prev => ({
      ...prev,
      prbc_number: "",
      prbc_volume: "",
      cmv_screened: "",
      irradiated: ""
    }));
  }
}, [formData.prbc]);

useEffect(() => {
  if (formData.platelets === "No") {
    setFormData(prev => ({
      ...prev,
      platelet_number: ""
    }));
  }
}, [formData.platelets]);

useEffect(() => {
  if (formData.ffp_cryo === "No") {
    setFormData(prev => ({
      ...prev,
      ffp_number: ""
    }));
  }
}, [formData.ffp_cryo]);

useEffect(() => {
  if (formData.nec === "No") {
    setFormData(prev => ({
      ...prev,
      nec_stage: "",
      nec_date: "",
      nec_age_days: "",
      nec_surgery: "",
      nec_surgery_type: "",
      nec_resection: "",
      nec_resection_length: "",
      nec_stoma: ""
    }));
  }
}, [formData.nec]);

useEffect(() => {
  if (formData.hypotension === "No") {
    setFormData(prev => ({
      ...prev,
      hypotension_systolic: false,
      hypotension_diastolic: false,
      hypotension_both: false
    }));
  }
}, [formData.hypotension]);

useEffect(() => {
  if (formData.inotropes === "No") {
    setFormData(prev => ({
      ...prev,
      inotrope_dopa: false,
      inotrope_dobu: false,
      inotrope_adr: false,
      inotrope_nadr: false,
      inotrope_milri: false,
      inotrope_vaso: false,
      inotrope_duration: "",
      vis_score: ""
    }));
  }
}, [formData.inotropes]);

useEffect(() => {
  if (formData.jaundice_type !== "Unconjugated") {
    setFormData(prev => ({
      ...prev,
      jaundice_onset: "",
      peak_tsb: "",
      bind: "",
      phototherapy: "",
      dvet: "",
      dvet_number: "",
      ivig: "",
      unconj_etiology: ""
    }));
  }
}, [formData.jaundice_type]);

useEffect(() => {
  if (formData.anemia === "No") {
    setFormData(prev => ({
      ...prev,
      anemia_onset: "",
      lowest_hb: "",
      anemia_chf: "",
      anemia_etiology: "",
      anemia_etiology_other: ""
    }));
  }
}, [formData.anemia]);

// (per-episode sepsis "No" resets are now handled inline in handleInfectionChange)

useEffect(() => {
  if (formData.hypoglycemia === "No") {
    setFormData(prev => ({
      ...prev,
      hypoglycemia_episodes: "",
      hypoglycemia_lowest: "",
      hypoglycemia_rx: "",
      hypoglycemia_rx_duration: "",
    }));
  }
}, [formData.hypoglycemia]);

useEffect(() => {
  if (formData.hypoglycemia_rx === "No") {
    setFormData(prev => ({ ...prev, hypoglycemia_rx_duration: "" }));
  }
}, [formData.hypoglycemia_rx]);

useEffect(() => {
  if (formData.hyperglycemia === "No") {
    setFormData(prev => ({ ...prev, hyperglycemia_highest: "", hyperglycemia_rx: "" }));
  }
}, [formData.hyperglycemia]);

useEffect(() => {
  if (formData.dyselectrolytemia === "No") {
    setFormData(prev => ({
      ...prev,
      dyselectro_na: false,
      dyselectro_k: false,
      dyselectro_ca: false
    }));
  }
}, [formData.dyselectrolytemia]);

// Unchecking a Type (Na/K/Ionized Ca) clears its Hypo/Hyper detail fields
// (106-111) so stale values from a previously-checked type aren't
// silently carried forward and submitted.
useEffect(() => {
  if (!formData.dyselectro_na) {
    setFormData(prev => ({
      ...prev,
      hyponatremia: false, hyponatremia_status: "", hyponatremia_symptoms: "",
      hypernatremia: false, hypernatremia_status: "", hypernatremia_symptoms: "",
    }));
  }
}, [formData.dyselectro_na]);

useEffect(() => {
  if (!formData.dyselectro_k) {
    setFormData(prev => ({
      ...prev,
      hypokalemia: false, hypokalemia_status: "", hypokalemia_symptoms: "",
      hyperkalemia: false, hyperkalemia_status: "", hyperkalemia_symptoms: "",
    }));
  }
}, [formData.dyselectro_k]);

useEffect(() => {
  if (!formData.dyselectro_ca) {
    setFormData(prev => ({
      ...prev,
      hypocalcemia: false, hypocalcemia_status: "", hypocalcemia_symptoms: "",
      hypercalcemia: false, hypercalcemia_status: "", hypercalcemia_symptoms: "",
    }));
  }
}, [formData.dyselectro_ca]);

// Unchecking a Hypo/Hyper checkbox, or switching its status away from
// Symptomatic, clears the now-inapplicable status/symptoms text.
useEffect(() => {
  if (!formData.hyponatremia) setFormData(prev => ({ ...prev, hyponatremia_status: "", hyponatremia_symptoms: "" }));
  else if (formData.hyponatremia_status !== "Symptomatic") setFormData(prev => ({ ...prev, hyponatremia_symptoms: "" }));
}, [formData.hyponatremia, formData.hyponatremia_status]);

useEffect(() => {
  if (!formData.hypernatremia) setFormData(prev => ({ ...prev, hypernatremia_status: "", hypernatremia_symptoms: "" }));
  else if (formData.hypernatremia_status !== "Symptomatic") setFormData(prev => ({ ...prev, hypernatremia_symptoms: "" }));
}, [formData.hypernatremia, formData.hypernatremia_status]);

useEffect(() => {
  if (!formData.hypokalemia) setFormData(prev => ({ ...prev, hypokalemia_status: "", hypokalemia_symptoms: "" }));
  else if (formData.hypokalemia_status !== "Symptomatic") setFormData(prev => ({ ...prev, hypokalemia_symptoms: "" }));
}, [formData.hypokalemia, formData.hypokalemia_status]);

useEffect(() => {
  if (!formData.hyperkalemia) setFormData(prev => ({ ...prev, hyperkalemia_status: "", hyperkalemia_symptoms: "" }));
  else if (formData.hyperkalemia_status !== "Symptomatic") setFormData(prev => ({ ...prev, hyperkalemia_symptoms: "" }));
}, [formData.hyperkalemia, formData.hyperkalemia_status]);

useEffect(() => {
  if (!formData.hypocalcemia) setFormData(prev => ({ ...prev, hypocalcemia_status: "", hypocalcemia_symptoms: "" }));
  else if (formData.hypocalcemia_status !== "Symptomatic") setFormData(prev => ({ ...prev, hypocalcemia_symptoms: "" }));
}, [formData.hypocalcemia, formData.hypocalcemia_status]);

useEffect(() => {
  if (!formData.hypercalcemia) setFormData(prev => ({ ...prev, hypercalcemia_status: "", hypercalcemia_symptoms: "" }));
  else if (formData.hypercalcemia_status !== "Symptomatic") setFormData(prev => ({ ...prev, hypercalcemia_symptoms: "" }));
}, [formData.hypercalcemia, formData.hypercalcemia_status]);

useEffect(() => {
  if (formData.osteopenia === "No") {
    setFormData(prev => ({
      ...prev,
      alp_peak: "",
      lowest_calcium: "",
      lowest_phosphorus: ""
    }));
  }
}, [formData.osteopenia]);

// ---------------- THERMOREGULATION (H9, fields 197-205) ----------------
// Toggling Hypothermia/Hyperthermia to "No" (or clearing the top-level
// checkbox that gates each free-text "Other" field) previously left every
// dependent field's data in formData — it just stopped being shown. That
// meant a clinician who set Hypothermia=Yes, filled in severity/location/
// etiology, then corrected it to No, would silently submit stale Yes-only
// data alongside a "No" answer. Clear dependents the same way the other
// H-sections do.
useEffect(() => {
  if (formData.hypothermia === "No") {
    setFormData(prev => ({
      ...prev,
      hypothermia_mild: false, hypothermia_moderate: false, hypothermia_severe: false,
      hypothermia_lowest_temp: "",
      hypothermia_location_dr: false, hypothermia_location_transport: false, hypothermia_location_nicu: false,
      hypothermia_sepsis: false, hypothermia_environment: false, hypothermia_immaturity: false,
      hypothermia_ivh: false, hypothermia_other: false, hypothermia_other_text: "",
    }));
  }
}, [formData.hypothermia]);

useEffect(() => {
  if (!formData.hypothermia_other) {
    setFormData(prev => ({ ...prev, hypothermia_other_text: "" }));
  }
}, [formData.hypothermia_other]);

useEffect(() => {
  if (formData.hyperthermia === "No") {
    setFormData(prev => ({
      ...prev,
      hyperthermia_temp: "",
      hyperthermia_location_dr: false, hyperthermia_location_transport: false, hyperthermia_location_nicu: false,
      hyperthermia_clothing: false, hyperthermia_wrap: false, hyperthermia_equipment: false,
      hyperthermia_probe: false, hyperthermia_environment: false, hyperthermia_sepsis: false,
      hyperthermia_other: false, hyperthermia_other_text: "",
    }));
  }
}, [formData.hyperthermia]);

useEffect(() => {
  if (!formData.hyperthermia_other) {
    setFormData(prev => ({ ...prev, hyperthermia_other_text: "" }));
  }
}, [formData.hyperthermia_other]);

// ---------------- OPHTHALMOLOGY / ROP (H8.1, fields 179-196) ----------------
// Right/Left eye data is now captured independently (like IVH's H1.1
// Right/Left split). Toggling the top-level answers to "No", or changing
// Side away from a given eye, previously left that eye's stage/plus/zone/
// treatment data sitting in formData and getting submitted regardless —
// clear it the same way the other H-sections do.
useEffect(() => {
  if (formData.rop_screened === "No") {
    setFormData(prev => ({ ...prev, rop_method: "", rop_first_screen_date: "" }));
  }
}, [formData.rop_screened]);

useEffect(() => {
  if (formData.rop === "No") {
    setFormData(prev => ({
      ...prev,
      rop_diagnosis_date: "", rop_side: "",
      rop_stage_right: "", rop_plus_right: "", rop_zone_right: "", rop_arop_right: "", rop_treatment_right: "",
      rop_laser_right: false, rop_anti_vegf_right: false, rop_vitrectomy_right: false, rop_other_right: false, rop_other_text_right: "",
      rop_stage_left: "", rop_plus_left: "", rop_zone_left: "", rop_arop_left: "", rop_treatment_left: "",
      rop_laser_left: false, rop_anti_vegf_left: false, rop_vitrectomy_left: false, rop_other_left: false, rop_other_text_left: "",
    }));
  }
}, [formData.rop]);

useEffect(() => {
  if (formData.rop_side !== "Right" && formData.rop_side !== "Bilateral") {
    setFormData(prev => ({
      ...prev,
      rop_stage_right: "", rop_plus_right: "", rop_zone_right: "", rop_arop_right: "", rop_treatment_right: "",
      rop_laser_right: false, rop_anti_vegf_right: false, rop_vitrectomy_right: false, rop_other_right: false, rop_other_text_right: "",
    }));
  }
}, [formData.rop_side]);

useEffect(() => {
  if (formData.rop_side !== "Left" && formData.rop_side !== "Bilateral") {
    setFormData(prev => ({
      ...prev,
      rop_stage_left: "", rop_plus_left: "", rop_zone_left: "", rop_arop_left: "", rop_treatment_left: "",
      rop_laser_left: false, rop_anti_vegf_left: false, rop_vitrectomy_left: false, rop_other_left: false, rop_other_text_left: "",
    }));
  }
}, [formData.rop_side]);

useEffect(() => {
  if (formData.rop_treatment_right === "No") {
    setFormData(prev => ({
      ...prev,
      rop_laser_right: false, rop_anti_vegf_right: false, rop_vitrectomy_right: false, rop_other_right: false, rop_other_text_right: "",
    }));
  }
}, [formData.rop_treatment_right]);

useEffect(() => {
  if (!formData.rop_other_right) {
    setFormData(prev => ({ ...prev, rop_other_text_right: "" }));
  }
}, [formData.rop_other_right]);

useEffect(() => {
  if (formData.rop_treatment_left === "No") {
    setFormData(prev => ({
      ...prev,
      rop_laser_left: false, rop_anti_vegf_left: false, rop_vitrectomy_left: false, rop_other_left: false, rop_other_text_left: "",
    }));
  }
}, [formData.rop_treatment_left]);

useEffect(() => {
  if (!formData.rop_other_left) {
    setFormData(prev => ({ ...prev, rop_other_text_left: "" }));
  }
}, [formData.rop_other_left]);

useEffect(() => {
  if (formData.non_ivh_ich === "No") {
    setFormData(prev => ({
      ...prev,
      ich_type: "",
      ich_type_other: ""
    }));

    setErrors(prev => ({
      ...prev,
      ich_type: "",
      ich_type_other: ""
    }));
  }
}, [formData.non_ivh_ich]);

useEffect(() => {
  if (formData.ich_type !== "Other") {
    setFormData(prev => ({
      ...prev,
      ich_type_other: ""
    }));

    setErrors(prev => ({
      ...prev,
      ich_type_other: ""
    }));
  }
}, [formData.ich_type]);

useEffect(() => {
  if (formData.meningitis === "No") {
    setFormData(prev => ({
      ...prev,
      meningitis_type: "",
      meningitis_date: "",
      csf_culture: "",
      csf_organism: "",
      csf_protein: "",
      csf_glucose: "",
      csf_cells: ""
    }));

    setErrors(prev => ({
      ...prev,
      meningitis_type: "",
      meningitis_date: "",
      csf_organism: ""
    }));
  }
}, [formData.meningitis]);
useEffect(() => {
  if (formData.apnea === "No") {
    setFormData(prev => ({
      ...prev,
      apnea_onset_age: ""
    }));

    setErrors(prev => ({
      ...prev,
      apnea_onset_age: ""
    }));
  }
}, [formData.apnea]);

useEffect(() => {
  if (formData.caffeine_used === "No") {
    setFormData(prev => ({
      ...prev,
      caffeine_duration: ""
    }));

    setErrors(prev => ({
      ...prev,
      caffeine_duration: ""
    }));
  }
}, [formData.caffeine_used]);

const validateBPD = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "bpd":
      if (!value) error = "Please select BPD status";
      break;

    case "bpd_support_36w":
      if (updatedForm.bpd === "Yes" && !value) {
        error = "Support type required";
      }
      break;

    case "bpd_grade":
      if (updatedForm.bpd === "Yes" && !value) {
        error = "Grade is required";
      }
      break;

    case "oxygen_days":
    case "vent_days":
    case "cpap_days":
      if (value !== "") {
        const num = Number(value);
        if (!/^\d+$/.test(value)) {
          error = "Only whole numbers allowed";
        } else if (num < 0 || num > 365) {
          error = "Range: 0–365 days";
        }
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

const validateRespiratory = (name, value, updatedForm = formData) => {
  let error = "";

  switch (name) {
    case "pulmonary_hemorrhage":
      if (!value) error = "Required";
      break;

    case "pneumothorax":
      if (!value) error = "Required";
      break;

    case "pneumothorax_side":
      if (updatedForm.pneumothorax === "Yes" && !value) {
        error = "Side required";
      }
      break;

    case "chest_drain":
      if (updatedForm.pneumothorax === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "pulmonary_htn":
      if (!value) error = "Required";
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error
  }));
};

useEffect(() => {
  if (formData.bpd === "No") {
    setFormData(prev => ({
      ...prev,
      bpd_support_36w: "",
      bpd_grade: ""
    }));

    setErrors(prev => ({
      ...prev,
      bpd_support_36w: "",
      bpd_grade: ""
    }));
  }
}, [formData.bpd]);
useEffect(() => {
  if (formData.pneumothorax === "No") {
    setFormData(prev => ({
      ...prev,
      pneumothorax_side: "",
      chest_drain: ""
    }));

    setErrors(prev => ({
      ...prev,
      pneumothorax_side: "",
      chest_drain: ""
    }));
  }
}, [formData.pneumothorax]);



const num = (v) => {
  if (v === "" || v === undefined) return null;
  return Number(v);
};


  // Builds the full API payload from the current formData snapshot. Shared by
  // both the bottom nav bar's "Save" button and the main form submit, so the
  // two can never drift apart.
  const buildPayload = () => {
    const infectionsList = formData.infections || [];
    const anySepsisAnswered = infectionsList.some(i => i.sepsis === "Yes" || i.sepsis === "No");
    const anySepsisYes = infectionsList.some(i => i.sepsis === "Yes");

    // NOTE: the full formData is spread into the payload first so that every
    // field the clinician entered is sent to the backend (previously only 5
    // fields were sent and everything else was silently discarded on submit).
    // The explicit keys below convert the UI's Yes/No strings into the
    // booleans/numbers the current backend schema expects, and normalise the
    // dynamic Infection episodes into the shape the API understands.
    return {
      ...formData,
      _record_id: undefined, // UI-only; never send to API

      ivh: yesNoToBool(formData.ivh_present),
      ivh_side: formData.ivh_side || null,
      // The CRF always captures Right and Left grade/date/age separately
      // (fields 3-5 and 6-8) — only send the side(s) actually selected so a
      // grade entered for one side never leaks into the other on save.
      ivh_grade_right: (formData.ivh_side === "Right" || formData.ivh_side === "Bilateral") ? (formData.ivh_grade_right || null) : null,
      ivh_grade_left:  (formData.ivh_side === "Left"  || formData.ivh_side === "Bilateral") ? (formData.ivh_grade_left  || null) : null,
      ivh_date_right:  (formData.ivh_side === "Right" || formData.ivh_side === "Bilateral") ? (formData.ivh_date_right  || null) : null,
      ivh_date_left:   (formData.ivh_side === "Left"  || formData.ivh_side === "Bilateral") ? (formData.ivh_date_left   || null) : null,
      ivh_age_days_right: (formData.ivh_side === "Right" || formData.ivh_side === "Bilateral") ? num(formData.ivh_age_days_right) : null,
      ivh_age_days_left:  (formData.ivh_side === "Left"  || formData.ivh_side === "Bilateral") ? num(formData.ivh_age_days_left)  : null,
      // Legacy "worst side" mirror fields — kept in sync so existing
      // dashboard queries (e.g. severe-IVH stats keyed off ivh_grade) still
      // work without changes. Bilateral picks whichever side graded worse.
      ivh_grade: (() => {
        const gnum = g => ({ I:1, II:2, III:3, IV:4 }[g] || 0);
        if (formData.ivh_side === "Bilateral") {
          return gnum(formData.ivh_grade_right) >= gnum(formData.ivh_grade_left)
            ? (formData.ivh_grade_right || formData.ivh_grade_left || null)
            : (formData.ivh_grade_left || null);
        }
        return formData.ivh_grade_right || formData.ivh_grade_left || null;
      })(),
      ivh_date: (() => {
        const gnum = g => ({ I:1, II:2, III:3, IV:4 }[g] || 0);
        if (formData.ivh_side === "Bilateral") {
          return gnum(formData.ivh_grade_right) >= gnum(formData.ivh_grade_left)
            ? (formData.ivh_date_right || formData.ivh_date_left || null)
            : (formData.ivh_date_left || null);
        }
        return formData.ivh_date_right || formData.ivh_date_left || null;
      })(),
      ivh_age_days: (() => {
        const gnum = g => ({ I:1, II:2, III:3, IV:4 }[g] || 0);
        if (formData.ivh_side === "Bilateral") {
          return num(gnum(formData.ivh_grade_right) >= gnum(formData.ivh_grade_left)
            ? (formData.ivh_age_days_right || formData.ivh_age_days_left)
            : formData.ivh_age_days_left);
        }
        return num(formData.ivh_age_days_right || formData.ivh_age_days_left);
      })(),

      pvl: yesNoToBool(formData.pvl_present),
      // Same side-conditional pattern as IVH above (fields 15-17 / 18-20) —
      // only send the side(s) actually selected so a grade entered for one
      // side never leaks into the other on save.
      pvl_grade_right: (formData.pvl_side === "Right" || formData.pvl_side === "Both") ? (formData.pvl_grade_right || null) : null,
      pvl_grade_left:  (formData.pvl_side === "Left"  || formData.pvl_side === "Both") ? (formData.pvl_grade_left  || null) : null,
      pvl_date_right:  (formData.pvl_side === "Right" || formData.pvl_side === "Both") ? (formData.pvl_date_right  || null) : null,
      pvl_date_left:   (formData.pvl_side === "Left"  || formData.pvl_side === "Both") ? (formData.pvl_date_left   || null) : null,
      pvl_age_days_right: (formData.pvl_side === "Right" || formData.pvl_side === "Both") ? num(formData.pvl_age_days_right) : null,
      pvl_age_days_left:  (formData.pvl_side === "Left"  || formData.pvl_side === "Both") ? num(formData.pvl_age_days_left)  : null,
      // Legacy "worst side" mirror fields, same convention as ivh_grade/
      // ivh_date above — keeps any existing dashboard queries keyed off the
      // old single pvl_grade/pvl_date columns still working.
      pvl_grade: (() => {
        const gnum = g => Number(g) || 0;
        if (formData.pvl_side === "Both") {
          return gnum(formData.pvl_grade_right) >= gnum(formData.pvl_grade_left)
            ? (formData.pvl_grade_right || formData.pvl_grade_left || null)
            : (formData.pvl_grade_left || null);
        }
        return formData.pvl_grade_right || formData.pvl_grade_left || null;
      })(),
      pvl_date: (() => {
        const gnum = g => Number(g) || 0;
        if (formData.pvl_side === "Both") {
          return gnum(formData.pvl_grade_right) >= gnum(formData.pvl_grade_left)
            ? (formData.pvl_date_right || formData.pvl_date_left || null)
            : (formData.pvl_date_left || null);
        }
        return formData.pvl_date_right || formData.pvl_date_left || null;
      })(),
      ventriculomegaly: yesNoToBool(formData.ventriculomegaly_present),
      seizures: yesNoToBool(formData.seizures),
      status_epilepticus: yesNoToBool(formData.status_epilepticus),
      bpd: yesNoToBool(formData.bpd),
      postnatal_steroids: yesNoToBool(formData.postnatal_steroids),
      feed_intolerance: yesNoToBool(formData.feed_intolerance),
      nec: yesNoToBool(formData.nec),
      hs_pda: yesNoToBool(formData.hs_pda),
      shock: yesNoToBool(formData.shock),
      hypotension: yesNoToBool(formData.hypotension),
      pvhi: yesNoToBool(formData.pvhi),
      phh: yesNoToBool(formData.phh),
      vp_shunt: yesNoToBool(formData.vp_shunt),
      pulmonary_hemorrhage: yesNoToBool(formData.pulmonary_hemorrhage),
      pneumothorax: yesNoToBool(formData.pneumothorax),
      chest_drain: yesNoToBool(formData.chest_drain),
      apnea: yesNoToBool(formData.apnea),
      nec_surgery: yesNoToBool(formData.nec_surgery),
      pn: yesNoToBool(formData.pn),
      cholestasis: yesNoToBool(formData.cholestasis),
      inotropes: yesNoToBool(formData.inotropes),
      pda_ligation: yesNoToBool(formData.pda_ligation),
      // structural_heart_disease is intentionally left as the raw "Yes"/"No"/""
      // string from formData (via the ...formData spread above) — the backend
      // schema stores it as a string, not a boolean, so it tolerates "" for an
      // unanswered field (see FormH_redesign_notes.md, "why VARCHAR not BOOLEAN").

      sepsis: anySepsisAnswered ? anySepsisYes : yesNoToBool(formData.sepsis),
      // Top-level totals mirror the first filled per-episode CRF totals
      // (#233–234 / #251–252) so dashboards still read sepsis_episodes/vap_episodes.
      sepsis_episodes: (() => {
        for (const ep of infectionsList) {
          if (ep?.total_sepsis_episodes !== "" && ep?.total_sepsis_episodes != null) {
            return num(ep.total_sepsis_episodes);
          }
        }
        return num(formData.sepsis_episodes);
      })(),
      vap_episodes: (() => {
        for (const ep of infectionsList) {
          if (ep?.total_vap_episodes !== "" && ep?.total_vap_episodes != null) {
            return num(ep.total_vap_episodes);
          }
        }
        return num(formData.vap_episodes);
      })(),

      total_los: num(formData.total_los),
      total_los_days: num(formData.total_los || formData.total_los_days),
      nicu_days: num(formData.nicu_days),
      discharge_weight: num(formData.discharge_weight),

      infections: infectionsList,
      infection_flags_reviewed: formData.infection_flags_reviewed || [],
    };
  };

  // "Save" on the bottom nav bar — saves without leaving the page.
  const saveFormH = async () => {
    try {
      const payload = buildPayload();
      if (formData._record_id) {
        await api.put(`/neonatal-morbidities/${enrollmentId}`, payload);
      } else {
        const res = await api.post("/neonatal-morbidities/", payload);
        if (res?.data?.id) {
          setFormData((prev) => ({ ...prev, _record_id: res.data.id }));
        }
      }
      // Detected infection trigger windows (see fetchInfectionWindows)
      // must be reviewed/addressed before Form H counts as complete —
      // this never blocks saving, only the "done" tick.
      if (allInfectionFlagsReviewed) {
        markFormCompleted("form_h");
      } else {
        unmarkFormCompleted("form_h");
      }
      setIsSaved(true);
      setSaveMessage("✅ Saved");
    } catch (err) {
      console.error("❌ BACKEND ERROR:", err.response?.data);
      setSaveMessage("❌ Save failed — see console");
      alert(JSON.stringify(err.response?.data, null, 2));
    } finally {
      setTimeout(() => setSaveMessage(""), 3000);
    }
  };

  // Bottom nav bar — Back to Form G (ROP Screening).
  const handleNavBack = async () => {
    try { await saveFormH(); } catch (err) { console.error("Save before back failed:", err); }
    navigate(`/form-g/${formData.enrollment_id}`, {
      state: { enrollmentId: formData.enrollment_id },
    });
  };

  // Bottom nav bar — Next to Form I (Study Outcome Assessment). Only enabled
  // once this form has been saved (isSaved), same convention as FormC.
  const handleNavNext = () => {
    navigate(`/form-i/${formData.enrollment_id}`, {
      state: { enrollmentId: formData.enrollment_id },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log("🚀 Form H submit clicked");

    // Submit represents a finalized, complete form — unlike Save, this
    // actually blocks until every detected infection trigger window has
    // been reviewed or acted on (Add Infection / Mark reviewed in the
    // H11 banner). Save above still works freely for partial progress.
    if (!allInfectionFlagsReviewed) {
      alert(
        "This form can't be submitted yet — the Infection section has "
        + `${infectionWindows.filter(w => !isInfectionFlagReviewed(w.signature)).length} `
        + "daily-log flag(s) not yet reviewed. Scroll to H11 Infection, "
        + "review each flagged item, and add an infection episode or mark "
        + "it reviewed before submitting."
      );
      return;
    }

    try {
      const payload = buildPayload();
      if (formData._record_id) {
        await api.put(`/neonatal-morbidities/${enrollmentId}`, payload);
      } else {
        const res = await api.post("/neonatal-morbidities/", payload);
        if (res?.data?.id) {
          setFormData((prev) => ({ ...prev, _record_id: res.data.id }));
        }
      }
      markFormCompleted("form_h");

      alert("✅ Form H submitted successfully");

      navigate(`/form-i/${formData.enrollment_id}`);

    } catch (err) {
      console.error("❌ BACKEND ERROR:", err.response?.data);
      alert(JSON.stringify(err.response?.data, null, 2));
    }
  };

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

const getIVHSummary = () => {
  if (!formData.ivh_present) return "Not filled";
  if (formData.ivh_present === "No") return "No";

  let parts = ["IVH"];

  // Side + Grade logic — grades are now always captured per-side
  // (Right in ivh_grade_right, Left in ivh_grade_left), regardless of
  // whether Side is Right, Left, or Bilateral.
  if (formData.ivh_side === "Bilateral") {
    if (formData.ivh_grade_left && formData.ivh_grade_right) {
      parts.push(`Right Grade ${formData.ivh_grade_right}, Left Grade ${formData.ivh_grade_left}`);
    } else if (formData.ivh_grade_right) {
      parts.push(`Right Grade ${formData.ivh_grade_right}`);
    } else if (formData.ivh_grade_left) {
      parts.push(`Left Grade ${formData.ivh_grade_left}`);
    }
  } else if (formData.ivh_side === "Right" && formData.ivh_grade_right) {
    parts.push(`Right Grade ${formData.ivh_grade_right}`);
  } else if (formData.ivh_side === "Left" && formData.ivh_grade_left) {
    parts.push(`Left Grade ${formData.ivh_grade_left}`);
  }

  // PVHI / PHH / Shunt
  if (formData.pvhi === "Yes") parts.push("PVHI");
  if (formData.phh === "Yes") parts.push("PHH");
  if (formData.vp_shunt === "Yes") parts.push("VP Shunt");

  return parts.join(" • ");
};

const getPVLSummary = () => {
  if (!formData.pvl_present) return "Not filled";
  if (formData.pvl_present === "No") return "No";

  return formData.pvl_grade
    ? `Grade ${formData.pvl_grade}`
    : "Yes";
};

const getVMSummary = () => {
  if (!formData.ventriculomegaly_present) return "Not filled";
  if (formData.ventriculomegaly_present === "No") return "No";

  return formData.ventriculomegaly_severity || "Yes";
};

const getSeizureSummary = () => {
  if (!formData.seizures) return "Not filled";
  if (formData.seizures === "No") return "No";

  let parts = ["Yes"];
  if (formData.aeds_required === "Yes") parts.push("AED");

  return parts.join(" • ");
};


const getStatusClass = (value) => {
  if (!value) return "empty";
  if (value === "Yes") return "yes";
  if (value === "No") return "no";
};
const getStatusIcon = (value) => {
  if (!value) return "—";
  if (value === "Yes") return "✔";
  if (value === "No") return "✖";
};

const getBPDSummary = () => {
  if (!formData.bpd) return "Not filled";
  if (formData.bpd === "No") return "No";

  let parts = [];
  if (formData.bpd_grade) parts.push(`Grade ${formData.bpd_grade}`);
  if (formData.bpd_support_36w) parts.push(formData.bpd_support_36w);

  return parts.length ? parts.join(" • ") : "Yes";
};

const getRespSupportSummary = () => {
  let parts = [];

  if (formData.cpap === "Yes") parts.push(`CPAP ${formData.cpap_days || 0}d`);
  if (formData.nippv_used === "Yes") parts.push(`NIPPV ${formData.nippv_days || 0}d`);
  if (formData.hfnc_used === "Yes") parts.push(`HFNC ${formData.hfnc_days || 0}d`);
  if (formData.imv_used === "Yes") parts.push(`IMV ${formData.imv_days || 0}d`);
  if (formData.nasal_cannula_used === "Yes") parts.push(`NC ${formData.nasal_cannula_days || 0}d`);

  return parts.length ? parts.join(" • ") : "Not filled";
};

const getOtherRespSummary = () => {
  let parts = [];

  if (formData.pulmonary_hemorrhage === "Yes") parts.push("Hemorrhage");
  if (formData.pneumothorax === "Yes") parts.push("Pneumothorax");
  if (formData.pulmonary_htn === "Yes") parts.push("PH");

  return parts.length ? parts.join(" • ") : "Not filled";
};
const getRespStatusClass = (val) => {
  if (!val) return "status-empty";
  if (val === "Yes") return "status-yes";
  if (val === "No") return "status-no";
  return "status-empty";
};

const getRespIcon = (val) => {
  if (val === "Yes") return "✔";
  if (val === "No") return "✖";
  return "—";
};

const hasYes =
  formData.pulmonary_hemorrhage === "Yes" ||
  formData.pneumothorax === "Yes";

const hasNo =
  formData.pulmonary_hemorrhage === "No" &&
  formData.pneumothorax === "No";

const normalize = (val) => (val || "").toString().trim().toLowerCase();

const respSupportValues = [
  normalize(formData?.cpap),
  normalize(formData?.nippv_used),
  normalize(formData?.hfnc_used),
  normalize(formData?.imv_used),
  normalize(formData?.nasal_cannula_used)
];

// Only valid entries
const validValues = respSupportValues.filter(v => v === "yes" || v === "no");

const hasRespYes = validValues.includes("yes");
const isComplete = validValues.length === respSupportValues.length;
const allRespNo = isComplete && validValues.every(v => v === "no");

let respSummary = {
  text: "Not filled",
  className: "status-empty",
  icon: "—"
};

if (hasRespYes) {
  respSummary = {
    text: "Yes",
    className: "status-yes",
    icon: "✔"
  };
} else if (allRespNo) {
  respSummary = {
    text: "No",
    className: "status-no",
    icon: "✖"
  };
} else if (validValues.length > 0 && !isComplete) {
  respSummary = {
    text: "Incomplete",
    className: "status-warning",
    icon: "⚠"
  };
}

const usedSupports = [
  normalize(formData.cpap) === "yes" && "CPAP",
  normalize(formData.nippv_used) === "yes" && "NIPPV",
  normalize(formData.hfnc_used) === "yes" && "HFNC",
  normalize(formData.imv_used) === "yes" && "IMV",
  normalize(formData.nasal_cannula_used) === "yes" && "Nasal Cannula"
].filter(Boolean);

const getFeedingSummary = () => {
  if (!formData.pn) return "Not filled";
  if (formData.pn === "No") return "No Parenteral Nutrition";
  if (formData.pn === "Yes") {
    return formData.pn_days
      ? `Parenteral Nutrition — ${formData.pn_days} days`
      : "Parenteral Nutrition Given";
  }
};

const getNecSummary = () => {
  if (!formData.nec) return "Not filled";
  if (formData.nec === "No") return "No";
  if (formData.nec === "Yes") {
    return formData.nec_stage
      ? `Stage ${formData.nec_stage}`
      : "Yes";
  }
};

const getDyselectroSummary = () => {
  if (!formData.dyselectrolytemia) return "Not filled";
  if (formData.dyselectrolytemia === "No") return "No";

  const list = [];
  if (formData.dyselectro_na) list.push("Na");
  if (formData.dyselectro_k) list.push("K");
  if (formData.dyselectro_ca) list.push("Ca");

  return list.length ? list.join(", ") : "Yes";
};

// Consolidated summary for the single H4.1 Metabolic Disturbances card
// (fields 95-115), mirroring getIVHSummary()'s style for H1.1.
const getMetabolicSummary = () => {
  const parts = [];
  if (formData.hypoglycemia === "Yes") parts.push(formData.hypoglycemia_lowest ? `Hypoglycemia (lowest ${formData.hypoglycemia_lowest} mg/dL)` : "Hypoglycemia");
  if (formData.hyperglycemia === "Yes") parts.push(formData.hyperglycemia_highest ? `Hyperglycemia (highest ${formData.hyperglycemia_highest} mg/dL)` : "Hyperglycemia");
  if (formData.metabolic_acidosis === "Yes") parts.push("Metabolic Acidosis");
  if (formData.dyselectrolytemia === "Yes") parts.push(`Dyselectrolytemia (${getDyselectroSummary()} abnormal)`);
  if (formData.osteopenia === "Yes") parts.push("Osteopenia");
  if (!parts.length) {
    if (!formData.hypoglycemia && !formData.hyperglycemia && !formData.metabolic_acidosis
      && !formData.dyselectrolytemia && !formData.osteopenia) return "Not filled";
    return "No abnormalities";
  }
  return parts.join(" • ");
};


const getPDASummary = () => {
  if (!formData.hs_pda) return "Not filled";
  if (formData.hs_pda === "No") return "No";

  let summary = "PDA";

  // diagnosis
  if (formData.pda_echo) summary += " • Diagnosed by Echo";
  else if (formData.pda_clinical) summary += " • Diagnosed Clinically";
  else if (formData.pda_both) summary += " • Diagnosed Clinically + Echo";

  // treatment
  if (formData.pda_medical_rx === "Yes") summary += " • Medical Treatment";
  if (formData.pda_intervention_rx === "Ligation") summary += " • Surgical Ligation";
  if (formData.pda_intervention_rx === "Device closure") summary += " • Device Closure";

  return summary;
};

const getShockSummary = () => {
  if (!formData.shock && !formData.hypotension) return "Not filled";

  let parts = [];

  if (formData.shock === "Yes") parts.push("Shock");
  if (formData.hypotension === "Yes") parts.push("Hypotension");

  if (formData.inotropes === "Yes") {
    parts.push(`Inotropes (${formData.inotrope_duration || "?"} days)`);
  }

  if (formData.fluid_bolus === "Yes") {
    parts.push(`Fluid Bolus x${formData.fluid_bolus_number || "?"}`);
  }

  return parts.length ? parts.join(" • ") : "No";
};

// ================= INFECTION (H11) — dynamic, repeatable episodes =================
// CRF prints Infection 1 (#217–234) and Infection 2 (#235–252). The app allows
// N episodes; field numbers = 217 + episodeIndex*18 + offset within the block.

/** @param {number} episodeIdx 0-based @param {number} offset 0–17 within episode (incl. totals) */
const infectionFieldNum = (episodeIdx, offset) => 217 + episodeIdx * 18 + offset;

const emptyInfection = () => ({
  sepsis_episode_number: "",
  vap_episode_number: "",
  sepsis: "",
  sepsis_clinical: false,
  sepsis_screen: false,
  sepsis_culture: false,
  sepsis_onset_age: "",
  blood_culture_age_hours: "",
  blood_culture_age_days: "",
  screen_crp: false,
  screen_pct: false,
  screen_other: false,
  screen_other_text: "",
  culture_blood: false,
  culture_csf: false,
  culture_urine: false,
  culture_other: false,
  culture_other_text: "",
  gram_positive: false,
  gram_negative: false,
  fungus: false,
  staph_aureus: false,
  staph_hemolyticus: false,
  staph_epidermidis: false,
  gp_other: false,
  gp_other_text: "",
  acinetobacter: false,
  ecoli: false,
  klebsiella: false,
  serratia: false,
  pseudomonas: false,
  gn_other: false,
  gn_other_text: "",
  mdr: "",
  xdr: "",
  focus_septicemia: false,
  focus_pneumonia: false,
  focus_meningitis: false,
  focus_bone_joint: false,
  focus_uti: false,
  focus_other: false,
  focus_other_text: "",
  clabsi: "",
  vap: "",
  // CRF #233–234 / #251–252 — totals are inside each Infection block
  total_sepsis_episodes: "",
  total_vap_episodes: "",
});

const addInfection = () => {
  const nextIdx = (formData.infections || []).length;
  setFormData((prev) => ({
    ...prev,
    infections: [...(prev.infections || []), emptyInfection()],
  }));
  setOpenSection(`infection-${nextIdx}`);
};

const removeInfection = (index) => {
  setFormData(prev => ({
    ...prev,
    infections: (prev.infections || []).filter((_, i) => i !== index),
  }));
  setErrors(prev => {
    const infectionErrors = Array.isArray(prev.infectionErrors) ? [...prev.infectionErrors] : [];
    infectionErrors.splice(index, 1);
    return { ...prev, infectionErrors };
  });
};

const validateInfectionField = (index, name, value, entry) => {
  let error = "";
  let groupField = null;
  const isNumber = (val) => /^\d+$/.test(val);

  switch (name) {
    case "sepsis":
      if (!value) error = "Required";
      break;

    case "sepsis_type_group":
      groupField = "sepsis_type_group";
      if (entry.sepsis === "Yes") {
        const any = entry.sepsis_clinical || entry.sepsis_screen || entry.sepsis_culture;
        if (!any) error = "Select at least one";
      }
      break;

    case "sepsis_onset_age":
    case "blood_culture_age_hours":
    case "blood_culture_age_days":
      if (value !== "") {
        if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 1000) error = "0–1000";
      }
      break;

    case "screen_group":
      groupField = "screen_group";
      if (entry.sepsis_screen || entry.sepsis_culture) {
        const any = entry.screen_crp || entry.screen_pct || entry.screen_other;
        if (!any) error = "Select at least one";
      }
      break;

    case "screen_other_text":
      if (entry.screen_other) {
        if (!value) error = "Required";
        else if (!/^[A-Za-z\s]+$/.test(value)) error = "Only text";
      }
      break;

    case "culture_group":
      groupField = "culture_group";
      if (entry.sepsis_culture) {
        const any = entry.culture_blood || entry.culture_csf || entry.culture_urine || entry.culture_other;
        if (!any) error = "Select at least one";
      }
      break;

    case "culture_other_text":
      if (entry.culture_other && !value) error = "Required";
      break;

    case "organism_group":
      groupField = "organism_group";
      if (entry.sepsis_culture) {
        const any = entry.gram_positive || entry.gram_negative || entry.fungus;
        if (!any) error = "Select at least one";
      }
      break;

    case "gp_group":
      groupField = "gp_group";
      if (entry.gram_positive) {
        const any = entry.staph_hemolyticus || entry.staph_epidermidis || entry.gp_other || entry.staph_aureus;
        if (!any) error = "Select at least one";
      }
      break;

    case "gp_other_text":
      if (entry.gp_other && !value) error = "Required";
      break;

    case "gn_group":
      groupField = "gn_group";
      if (entry.gram_negative) {
        const any = entry.acinetobacter || entry.ecoli || entry.klebsiella || entry.serratia || entry.pseudomonas || entry.gn_other;
        if (!any) error = "Select at least one";
      }
      break;

    case "gn_other_text":
      if (entry.gn_other && !value) error = "Required";
      break;

    case "focus_group":
      groupField = "focus_group";
      if (entry.sepsis === "Yes") {
        const any = entry.focus_septicemia || entry.focus_pneumonia || entry.focus_meningitis ||
                    entry.focus_bone_joint || entry.focus_uti || entry.focus_other;
        if (!any) error = "Select at least one";
      }
      break;

    case "focus_other_text":
      if (entry.focus_other && !value) error = "Required";
      break;

    default:
      break;
  }

  setErrors(prev => {
    const infectionErrors = Array.isArray(prev.infectionErrors) ? [...prev.infectionErrors] : [];
    const current = { ...(infectionErrors[index] || {}) };
    current[name] = error;
    if (groupField) current[groupField] = error;
    infectionErrors[index] = current;
    return { ...prev, infectionErrors };
  });
};

// Mirrors the file's existing handleChange convention: build the updated
// snapshot first, commit it with a single setFormData call, then validate
// off that same snapshot (never off stale state).
const handleInfectionChange = (index, name, rawValue) => {
  const currentInfections = formData.infections || [];
  let entry = { ...(currentInfections[index] || emptyInfection()), [name]: rawValue };

  // cascade resets so hidden/irrelevant sub-fields never linger with stale data
  if (name === "sepsis" && rawValue === "No") {
    entry = {
      ...entry,
      sepsis_clinical: false, sepsis_screen: false, sepsis_culture: false,
      screen_crp: false, screen_pct: false, screen_other: false, screen_other_text: "",
      culture_blood: false, culture_csf: false, culture_urine: false, culture_other: false, culture_other_text: "",
      gram_positive: false, gram_negative: false, fungus: false,
      staph_aureus: false, staph_hemolyticus: false, staph_epidermidis: false, gp_other: false, gp_other_text: "",
      acinetobacter: false, ecoli: false, klebsiella: false, serratia: false, pseudomonas: false, gn_other: false, gn_other_text: "",
      mdr: "", xdr: "",
      focus_septicemia: false, focus_pneumonia: false, focus_meningitis: false,
      focus_bone_joint: false, focus_uti: false, focus_other: false, focus_other_text: "",
      clabsi: "", vap: "",
    };
  }
  if (name === "sepsis_culture" && !rawValue) {
    entry = {
      ...entry,
      culture_blood: false, culture_csf: false, culture_urine: false, culture_other: false, culture_other_text: "",
      gram_positive: false, gram_negative: false, fungus: false,
      staph_aureus: false, staph_hemolyticus: false, staph_epidermidis: false, gp_other: false, gp_other_text: "",
      acinetobacter: false, ecoli: false, klebsiella: false, serratia: false, pseudomonas: false, gn_other: false, gn_other_text: "",
    };
  }
  // CRF: abnormal params apply when Screen+ OR Culture+ — clear only when both off
  if ((name === "sepsis_screen" || name === "sepsis_culture") && !entry.sepsis_screen && !entry.sepsis_culture) {
    entry = { ...entry, screen_crp: false, screen_pct: false, screen_other: false, screen_other_text: "" };
  }
  if (name === "gram_positive" && !rawValue) {
    entry = { ...entry, staph_aureus: false, staph_hemolyticus: false, staph_epidermidis: false, gp_other: false, gp_other_text: "" };
  }
  if (name === "gram_negative" && !rawValue) {
    entry = { ...entry, acinetobacter: false, ecoli: false, klebsiella: false, serratia: false, pseudomonas: false, gn_other: false, gn_other_text: "" };
  }
  if (name === "screen_other" && !rawValue) entry.screen_other_text = "";
  if (name === "culture_other" && !rawValue) entry.culture_other_text = "";
  if (name === "gp_other" && !rawValue) entry.gp_other_text = "";
  if (name === "gn_other" && !rawValue) entry.gn_other_text = "";
  if (name === "focus_other" && !rawValue) entry.focus_other_text = "";

  const updatedInfections = [...currentInfections];
  updatedInfections[index] = entry;
  setFormData(prev => ({ ...prev, infections: updatedInfections }));

  validateInfectionField(index, name, rawValue, entry);
  if (name.startsWith("sepsis_") || name === "sepsis") validateInfectionField(index, "sepsis_type_group", rawValue, entry);
  if (name.startsWith("screen_") || name === "sepsis_screen" || name === "sepsis_culture") {
    validateInfectionField(index, "screen_group", rawValue, entry);
  }
  if (name.startsWith("culture_")) validateInfectionField(index, "culture_group", rawValue, entry);
  if (name.startsWith("gram_") || name === "fungus") validateInfectionField(index, "organism_group", rawValue, entry);
  if (name.startsWith("staph_") || name.startsWith("gp_")) validateInfectionField(index, "gp_group", rawValue, entry);
  if (["acinetobacter", "ecoli", "klebsiella", "serratia", "pseudomonas"].includes(name) || name.startsWith("gn_")) {
    validateInfectionField(index, "gn_group", rawValue, entry);
  }
  if (name.startsWith("focus_")) validateInfectionField(index, "focus_group", rawValue, entry);
};

const getInfectionEntryStatus = (entry) => getStatusClass(entry.sepsis);
const getInfectionEntryIcon = (entry) => getStatusIcon(entry.sepsis);

const getInfectionEntrySummary = (entry) => {
  if (!entry.sepsis) return "Not filled";
  if (entry.sepsis === "No") return "No";

  let parts = [];
  if (entry.sepsis_clinical) parts.push("Clinical Sepsis");
  if (entry.sepsis_screen) parts.push("Screen Positive");
  if (entry.sepsis_culture) parts.push("Culture Positive");
  if (entry.gram_positive) parts.push("Gram Positive");
  if (entry.gram_negative) parts.push("Gram Negative");
  if (entry.fungus) parts.push("Fungal");
  if (entry.clabsi === "Yes") parts.push("CLABSI");
  if (entry.vap === "Yes") parts.push("VAP");
  if (entry.mdr === "Yes") parts.push("MDR Organism");
  if (entry.xdr === "Yes") parts.push("XDR Organism");

  return parts.length ? parts.join(" • ") : "Yes";
};

const getInfectionSectionSummary = () => {
  const list = formData.infections || [];
  if (!list.length) return "No episodes recorded";
  const confirmed = list.filter(i => i.sepsis === "Yes").length;
  return `${list.length} episode${list.length === 1 ? "" : "s"} recorded${confirmed ? ` • ${confirmed} confirmed` : ""}`;
};

const getTransfusionSummary = () => {
  const values = [
    formData.prbc,
    formData.platelets,
    formData.ffp_cryo
  ];

  const filled = values.filter(v => v === "Yes" || v === "No");

  const hasYes = filled.includes("Yes");
  const isComplete = filled.length === values.length;
  const allNo = isComplete && filled.every(v => v === "No");

  // ✅ NOT FILLED
  if (filled.length === 0) return "Not filled";

  // ✅ YES CASE
  if (hasYes) {
    let parts = [];

    if (formData.prbc === "Yes") {
      parts.push(`PRBC x${formData.prbc_number || 1}`);
    }

    if (formData.platelets === "Yes") {
      parts.push(`Platelets x${formData.platelet_number || 1}`);
    }

    if (formData.ffp_cryo === "Yes") {
      parts.push(`FFP/Cryo x${formData.ffp_number || 1}`);
    }

    return parts.join(" • ") || "Yes";
  }

  // ✅ ALL NO
  if (allNo) return "No";

  // ✅ PARTIAL
  return "Not filled";
};

const summary = getTransfusionSummary();

const getAnemiaSummary = () => {
  if (!formData.anemia) return "Not filled";
  if (formData.anemia === "No") return "No";

  let parts = ["Anemia"];

  if (formData.lowest_hb) parts.push(`Lowest Hb/Hct ${formData.lowest_hb}`);
  if (formData.anemia_etiology) parts.push(formData.anemia_etiology);

  return parts.join(" • ");
};

const getJaundiceSummary = () => {
  if (!formData.jaundice_type) return "Not filled";

  if (formData.jaundice_type === "Unconjugated") {
    let parts = ["Unconjugated"];

    if (formData.peak_tsb) parts.push(`Peak TSB ${formData.peak_tsb} mg/dL`);
    if (formData.phototherapy === "Yes") parts.push("Phototherapy");
    if (formData.dvet === "Yes") parts.push(`DVET x${formData.dvet_number || 1}`);
    if (formData.ivig === "Yes") parts.push("IVIG");

    return parts.join(" • ");
  }

  if (formData.jaundice_type === "Conjugated") {
    return formData.jaundice_etiology || "Conjugated";
  }
};

const getROPSummary = () => {
  if (!formData.rop_screened) return "Not filled";

  if (formData.rop_screened === "No") return "Not screened";

  if (!formData.rop) return "Screened";

  if (formData.rop === "No") return "No ROP";

  // ROP YES — summarise whichever eye(s) apply
  const eyeSummary = (side) => {
    const stage = formData[`rop_stage_${side}`];
    const plus = formData[`rop_plus_${side}`];
    const zone = formData[`rop_zone_${side}`];
    if (!stage && plus !== "Yes" && !zone) return null;
    const bits = [];
    if (stage) bits.push(`Stage ${stage}`);
    if (plus === "Yes") bits.push("Plus Disease");
    if (zone) bits.push(`Zone ${zone}`);
    return bits.join(" ");
  };

  const parts = ["ROP"];
  if (formData.rop_side === "Right" || formData.rop_side === "Bilateral") {
    const r = eyeSummary("right");
    if (r) parts.push(`R: ${r}`);
  }
  if (formData.rop_side === "Left" || formData.rop_side === "Bilateral") {
    const l = eyeSummary("left");
    if (l) parts.push(`L: ${l}`);
  }

  return parts.length > 1 ? parts.join(" • ") : "ROP";
};

const getAKISummary = () => {
  if (!formData.aki) return "Not filled";
  if (formData.aki === "No") return "No";

  let parts = ["AKI"];

  // Stage priority (highest first)
  if (formData.aki_stage3) parts.push("Stage 3");
  else if (formData.aki_stage2) parts.push("Stage 2");
  else if (formData.aki_stage1) parts.push("Stage 1");

  // Creatinine
  if (formData.aki_peak_creatinine) {
    parts.push(`Peak Creatinine ${formData.aki_peak_creatinine} mg/dL`);
  }

  // Oliguria
  if (formData.aki_oliguria === "Yes") {
    parts.push("Oliguria");
  }

  // Dialysis
  if (formData.aki_dialysis === "Yes") {
    parts.push("Dialysis");
  }

  return parts.join(" • ");
};


const getHyperSummary = () => {
  if (!formData.hyperthermia) return "Not filled";
  if (formData.hyperthermia === "No") return "No";

  let parts = ["Hyperthermia"];

  if (formData.hyperthermia_temp) {
    parts.push(`${formData.hyperthermia_temp}°C`);
  }

  if (formData.hyperthermia_location_dr) parts.push("Delivery Room");
  else if (formData.hyperthermia_location_nicu) parts.push("NICU");

  if (formData.hyperthermia_equipment) parts.push("Equipment-related");

  return parts.join(" • ");
};
const getHypoSummary = () => {
  if (!formData.hypothermia) return "Not filled";
  if (formData.hypothermia === "No") return "No";

  let parts = ["Hypothermia"];

  // Severity priority
  if (formData.hypothermia_severe) parts.push("Severe");
  else if (formData.hypothermia_moderate) parts.push("Moderate");
  else if (formData.hypothermia_mild) parts.push("Mild");

  // Temp
  if (formData.hypothermia_lowest_temp) {
    parts.push(`${formData.hypothermia_lowest_temp}°C`);
  }

  // Location
  if (formData.hypothermia_location_dr) parts.push("Delivery Room");
  else if (formData.hypothermia_location_nicu) parts.push("NICU");

  // Etiology
  if (formData.hypothermia_sepsis) parts.push("Sepsis-related");

  return parts.join(" • ");
};

// Consolidated summary for the single H9.1 Thermoregulation card
// (fields 197-205), mirroring getIVHSummary()/getMetabolicSummary()'s style.
const getThermoSummary = () => {
  if (!formData.hypothermia && !formData.hyperthermia) return "Not filled";

  const parts = [];
  if (formData.hypothermia === "Yes") parts.push(getHypoSummary());
  if (formData.hyperthermia === "Yes") parts.push(getHyperSummary());

  if (!parts.length) return "No";
  return parts.join("  |  ");
};

const getPeripheralSummary = () => {
  const values = [
    formData.peripheral_venous,
    formData.peripheral_arterial,
    formData.extravasation
  ];

  const filled = values.filter(v => v === "Yes" || v === "No");

  const hasYes = filled.includes("Yes");
  const isComplete = filled.length === values.length;
  const allNo = isComplete && filled.every(v => v === "No");

  if (filled.length === 0) return "Not filled";

  if (hasYes) {
    let parts = [];

    if (formData.peripheral_venous === "Yes") parts.push("Peripheral Venous");
    if (formData.peripheral_arterial === "Yes") parts.push("Peripheral Arterial");

    if (formData.arterial_radial) parts.push("Radial");
    if (formData.arterial_posterior_tibial) parts.push("Posterior Tibial");

    if (formData.extravasation === "Yes") parts.push("Extravasation Injury");

    return parts.join(" • ") || "Yes";
  }

  if (allNo) return "No";

  return "Incomplete";
};

const getCentralLineSummary = () => {
  const values = [
    formData.picc,
    formData.uvc,
    formData.uac
  ];

  const filled = values.filter(v => v === "Yes" || v === "No");

  const hasYes = filled.includes("Yes");
  const isComplete = filled.length === values.length;
  const allNo = isComplete && filled.every(v => v === "No");

  // ❗ NOT FILLED
  if (filled.length === 0) return "Not filled";

  // ❗ YES CASE
  if (hasYes) {
    const parts = [];

    if (formData.picc === "Yes") {
      parts.push(`PICC (${formData.picc_days || "?"}d)`);
    }

    if (formData.uvc === "Yes") {
      parts.push(`UVC (${formData.uvc_days || "?"}d)`);
    }

    if (formData.uac === "Yes") {
      parts.push(`UAC (${formData.uac_days || "?"}d)`);
    }

    if (formData.line_comp_none) parts.push("None");
    if (formData.line_comp_phlebitis) parts.push("Phlebitis");
    if (formData.line_comp_infection) parts.push("Local site infection");
    if (formData.line_comp_thrombosis) parts.push("Thrombosis");

    return parts.join(" • ") || "Yes";
  }

  // ❗ ALL NO
  if (allNo) return "No";

  // ❗ PARTIAL
  return "Incomplete";
};
const getCentralLineStatus = () => {
  const values = [
    formData.picc,
    formData.uvc,
    formData.uac
  ];

  const filled = values.filter(v => v === "Yes" || v === "No");

  if (filled.length === 0) return "Not filled";
  if (filled.includes("Yes")) return "Yes";
  if (filled.every(v => v === "No")) return "No";

  return "Not filled";
};
const getPeripheralStatus = () => {
  const values = [
    formData.peripheral_venous,
    formData.peripheral_arterial,
    formData.extravasation
  ];

  const filled = values.filter(v => v === "Yes" || v === "No");

  if (filled.length === 0) return "Not filled";
  if (filled.includes("Yes")) return "Yes";
  if (filled.every(v => v === "No")) return "No";

  return "Not filled";
};
// Lightweight "has this tab been started?" check for the jump-nav dots —
// intentionally just a handful of representative fields per organ system
// (the same ones each section already uses for its own card-header
// summary pill), not an exhaustive completeness check.
const hasVal = (v) => (Array.isArray(v) ? v.length > 0 : !!v);
const CATEGORY_MARKER_FIELDS = {
  neuro: ["ivh_present", "pvl_present", "ventriculomegaly_present", "seizures"],
  resp: ["bpd", "cpap_used", "nippv_used", "hfnc_used", "imv_used", "apnea"],
  gi: ["feed_intolerance", "nec", "pn"],
  metabolic: ["hypoglycemia", "hyperglycemia", "hyponatremia", "hypocalcemia"],
  cvs: ["structural_heart_disease", "hs_pda", "shock", "hypotension"],
  heme: ["anemia", "prbc", "platelets", "ffp_cryo"],
  renal: ["aki"],
  eye: ["rop", "rop_screened"],
  thermo: ["hyperthermia", "hypothermia"],
  vascular: ["picc", "peripheral_venous", "peripheral_arterial"],
  infection: ["infections"],
  summary: ["discharge_weight", "discharge_hc", "discharge_date"],
};
const categoryHasData = (key) =>
  (CATEGORY_MARKER_FIELDS[key] || []).some((f) => hasVal(formData[f]));

const centralStatus = getCentralLineStatus();
const centralSummary = getCentralLineSummary();
const peripheralSummary = getPeripheralSummary();
const peripheralStatus= getPeripheralStatus();
  return (
    <>
    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-header-action-row">
         <div className="form-header-title-area">
           <div className="form-breadcrumb"><Home size={12}/> FORM H</div>
           <h2 className="form-main-title">Neonatal Morbidities Assessment</h2>
           <p className="form-main-subtitle">Diagnosed morbidities and complications during NICU stay · Complete when diagnosed or at discharge</p>
         </div>
         <div className="form-header-meta-area">
           <div className="screening-id-badge">
             <span className="id-label">Enrollment ID</span>
             <span className="id-val">{formData.enrollment_id || "—"}</span>
           </div>
         </div>
       </div>

       {survivalAlert && (
         <div className="field-hint field-hint-warning" style={{ margin: "0 0 16px" }}>
           ⚠ Daily logs indicate this baby did not survive
           {survivalAlert.day ? ` (Day ${survivalAlert.day}${survivalAlert.date ? `, ${survivalAlert.date}` : ""})` : ""}.
           A field answered "No" earlier in the admission, before things got
           worse, won't be revisited by the normal auto-fill on its own —
           use the button below to pull in the fullest picture from every
           day of daily logs across every section before finalizing this record.
           {" "}
           <button
             type="button"
             className="link-button link-button-danger"
             onClick={forceRefillAllDomains}
             disabled={forceRefillingAll}
           >
             {forceRefillingAll ? "Refilling…" : "Force refill everything from daily logs"}
           </button>
         </div>
       )}

     {/* ================= CATEGORY JUMP-NAV =================
         Sticky pill row so any of Form H's 13 organ-system sections is
         one click away instead of a long scroll. Sections stay mounted;
         this only toggles which one is visible (see cat-hidden below). */}
     <div className="formh-jumpnav" role="tablist" aria-label="Form H sections">
       {FORMH_CATEGORIES.map(({ key, code, label, Icon }) => {
         const done = categoryHasData(key);
         return (
           <button
             key={key}
             type="button"
             role="tab"
             aria-selected={activeCategory === key}
             className={`formh-jumpnav-pill${activeCategory === key ? " active" : ""}${done ? " has-data" : ""}`}
             onClick={() => goToCategory(key)}
           >
             <Icon size={14} className="formh-jumpnav-icon" />
             {code && <span className="formh-jumpnav-code">{code}</span>}
             <span className="formh-jumpnav-label">{label}</span>
             {done
               ? <CheckCircle2 size={13} className="formh-jumpnav-status yes" />
               : <Circle size={8} className="formh-jumpnav-status empty" />}
           </button>
         );
       })}
     </div>
     <div ref={jumpNavContentRef} />

     {/* ================= IDENTIFICATION ================= */}
<div className="form-section soft-blue">
  <h3>IDENTIFICATION</h3>

  <div className="form-row">
    <div className="form-group">
      <label>Enrollment ID</label>
      <input
        name="enrollment_id"
        value={formData.enrollment_id || ""}
        readOnly
      />
    </div>
  </div>

  <p style={{ fontSize: "13px", color: "#555", marginTop: "6px" }}>
    Complete when diagnosed or at discharge (trigger: daily surveillance sheet)
  </p>
</div>

{/* ================= NEUROLOGICAL ================= */}
<div id="cat-neuro" className={`form-section soft-blue${activeCategory === "neuro" ? "" : " cat-hidden"}`}>

  <h3><Brain size={17} className="sec-icon" /> <span className="sec-num">H1</span> NEUROLOGICAL</h3>

  {/* ================= IVH ================= */}
  <div className="card">

    <div
      className="card-header-row"
      onClick={() => setOpenSection(openSection === "ivh" ? null : "ivh")}
    >

      <span><span className="sec-num sub">H1.1</span> Intraventricular Hemorrhage (IVH)</span>
      <div className="right-section">
      <span className={`summary ${getStatusClass(formData.ivh_present)}`}>
  <span className="icon">{getStatusIcon(formData.ivh_present)}</span>
  {getIVHSummary()}
</span></div>
      <span className="arrow">{openSection === "ivh" ? "▲" : "▼"}</span>
    </div>

    {openSection === "ivh" && (
      <div className="card-body">

{neuroPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({neuroPrefill.log_days_count} day{neuroPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchNeuroPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Neurological", fetchNeuroPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(neuroStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(neuroStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

        <div className="form-group">
          <YesNoToggle label="1. Any IVH Diagnosed" name="ivh_present" value={formData.ivh_present} onChange={handleNeuroChange} onBlur={handleBlur} required />
          {neuroAutoFilled.ivh_present && <span className="field-hint-auto-inline">from daily logs</span>}
          {touched.ivh_present && errors.ivh_present && <div className="error-text">{errors.ivh_present}</div>}
        </div>

        {formData.ivh_present === "Yes" && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label><span className="field-num">2.</span> Side<span className="required">*</span></label>
                <select
                  name="ivh_side"
                  value={formData.ivh_side || ""}
                  onChange={handleChange}
                  onBlur={handleBlur}
                >
                  <option value="">-- Select --</option>
                  <option value="Right">Right</option>
                  <option value="Left">Left</option>
                  <option value="Bilateral">Bilateral</option>
                </select>
                {touched.ivh_side && errors.ivh_side && <div className="error-text">{errors.ivh_side}</div>}
              </div>
            </div>

            {(formData.ivh_side === "Right" || formData.ivh_side === "Bilateral") && (
              <div className="form-row">
                <div className="form-group">
                  <label><span className="field-num">3.</span> Right: Max Grade<span className="required">*</span></label>
                  <select
                    name="ivh_grade_right"
                    value={formData.ivh_grade_right || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  >
                    <option value="">-- Select --</option>
                    <option value="I">I</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                    <option value="IV">IV</option>
                  </select>
                  {touched.ivh_grade_right && errors.ivh_grade_right && <div className="error-text">{errors.ivh_grade_right}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">4.</span> Date<span className="required">*</span></label>
                  <DatePicker
                    selected={formData.ivh_date_right ? parseDateOnly(formData.ivh_date_right) : null}
                    onChange={(date) => {
                      const v = date ? toDateOnlyValue(date) : "";
                      setFormData(prev => ({ ...prev, ivh_date_right: v }));
                      validateIVH("ivh_date_right", v, { ...formData, ivh_date_right: v });
                    }}
                    onBlur={() => { setTouched(prev => ({ ...prev, ivh_date_right: true })); validateIVH("ivh_date_right", formData.ivh_date_right); }}
                    dateFormat="dd-MM-yyyy"
                    placeholderText="Select date"
                  />
                  {touched.ivh_date_right && errors.ivh_date_right && <div className="error-text">{errors.ivh_date_right}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">5.</span> Age (days)<span className="required">*</span></label>
                  <input
                    type="number"
                    name="ivh_age_days_right"
                    value={formData.ivh_age_days_right || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  {touched.ivh_age_days_right && errors.ivh_age_days_right && <div className="error-text">{errors.ivh_age_days_right}</div>}
                </div>
              </div>
            )}

            {(formData.ivh_side === "Left" || formData.ivh_side === "Bilateral") && (
              <div className="form-row">
                <div className="form-group">
                  <label><span className="field-num">6.</span> Left: Max Grade<span className="required">*</span></label>
                  <select
                    name="ivh_grade_left"
                    value={formData.ivh_grade_left || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  >
                    <option value="">-- Select --</option>
                    <option value="I">I</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                    <option value="IV">IV</option>
                  </select>
                  {touched.ivh_grade_left && errors.ivh_grade_left && <div className="error-text">{errors.ivh_grade_left}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">7.</span> Date<span className="required">*</span></label>
                  <DatePicker
                    selected={formData.ivh_date_left ? parseDateOnly(formData.ivh_date_left) : null}
                    onChange={(date) => {
                      const v = date ? toDateOnlyValue(date) : "";
                      setFormData(prev => ({ ...prev, ivh_date_left: v }));
                      validateIVH("ivh_date_left", v, { ...formData, ivh_date_left: v });
                    }}
                    onBlur={() => { setTouched(prev => ({ ...prev, ivh_date_left: true })); validateIVH("ivh_date_left", formData.ivh_date_left); }}
                    dateFormat="dd-MM-yyyy"
                    placeholderText="Select date"
                  />
                  {touched.ivh_date_left && errors.ivh_date_left && <div className="error-text">{errors.ivh_date_left}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">8.</span> Age (days)<span className="required">*</span></label>
                  <input
                    type="number"
                    name="ivh_age_days_left"
                    value={formData.ivh_age_days_left || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  {touched.ivh_age_days_left && errors.ivh_age_days_left && <div className="error-text">{errors.ivh_age_days_left}</div>}
                </div>
              </div>
            )}

            <div className="form-group">
              <label><span className="field-num">9.</span> Description of IVH</label>
              <textarea
                name="ivh_description"
                value={formData.ivh_description || ""}
                onChange={handleChange}
                placeholder="Enter details (e.g. bleed extent, complications)"
                rows={2}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <YesNoToggle label="10. PVHI" name="pvhi" value={formData.pvhi} onChange={handleChange} />
              </div>

              <div className="form-group">
                <YesNoToggle label="11. PHH" name="phh" value={formData.phh} onChange={handleChange} />
              </div>

              <div className="form-group">
                <YesNoToggle label="12. VP Shunt" name="vp_shunt" value={formData.vp_shunt} onChange={handleChange} />
              </div>
            </div>
          </>
        )}
      </div>
    )}
  </div>

  {/* ================= PVL ================= */}
  <div className="card">
   <div
  className="card-header-row"
  onClick={() => setOpenSection(openSection === "pvl" ? null : "pvl")}
>
  <span><span className="sec-num sub">H1.2</span> Periventricular Leukomalacia (cPVL)</span>

  <div className="right-section">
    <span className={`summary ${getStatusClass(formData.pvl_present)}`}>
      <span className="icon">{getStatusIcon(formData.pvl_present)}</span>

      {formData.pvl_present === "Yes"
        ? formData.pvl_grade
          ? `Grade ${formData.pvl_grade}`
          : "Yes"
        : formData.pvl_present || "Not filled"}
    </span>
</div>
    <span className="arrow">{openSection === "pvl" ? "▲" : "▼"}</span>
  
</div>

    {openSection === "pvl" && (
      <div className="card-body">

{neuroPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({neuroPrefill.log_days_count} day{neuroPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchNeuroPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Neurological", fetchNeuroPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(neuroStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(neuroStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

        <div className="form-group">
          <YesNoToggle label="13. cPVL Diagnosed" name="pvl_present" value={formData.pvl_present} onChange={handleNeuroChange} onBlur={handleBlur} required />
          {neuroAutoFilled.pvl_present && <span className="field-hint-auto-inline">from daily logs</span>}
          {touched.pvl_present && errors.pvl_present && <div className="error-text">{errors.pvl_present}</div>}
        </div>

        {formData.pvl_present === "Yes" && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label><span className="field-num">14.</span> Side<span className="required">*</span></label>
                <select
                  name="pvl_side"
                  value={formData.pvl_side || ""}
                  onChange={handleChange}
                  onBlur={handleBlur}
                >
                  <option value="">-- Select --</option>
                  <option value="Right">Right</option>
                  <option value="Left">Left</option>
                  {/* value kept as "Both" for backward compatibility with
                      already-saved records — CRF label is "Bilateral" */}
                  <option value="Both">Bilateral</option>
                </select>
                {touched.pvl_side && errors.pvl_side && <div className="error-text">{errors.pvl_side}</div>}
              </div>
            </div>

            {(formData.pvl_side === "Right" || formData.pvl_side === "Both") && (
              <div className="form-row">
                <div className="form-group">
                  <label><span className="field-num">15.</span> If Right: Max Grade<span className="required">*</span></label>
                  <select
                    name="pvl_grade_right"
                    value={formData.pvl_grade_right || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  >
                    <option value="">-- Select --</option>
                    {/* values kept as 1-4 for backward compatibility with
                        already-saved records — CRF labels are Roman numerals */}
                    <option value="1">I (Flare)</option>
                    <option value="2">II (Localized cysts)</option>
                    <option value="3">III (Extensive cysts)</option>
                    <option value="4">IV (Subcortical)</option>
                  </select>
                  {touched.pvl_grade_right && errors.pvl_grade_right && <div className="error-text">{errors.pvl_grade_right}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">16.</span> Date<span className="required">*</span></label>
                  <DatePicker
                    selected={formData.pvl_date_right ? parseDateOnly(formData.pvl_date_right) : null}
                    onChange={(date) => {
                      const v = date ? toDateOnlyValue(date) : "";
                      setFormData(prev => ({ ...prev, pvl_date_right: v }));
                    }}
                    onBlur={() => setTouched(prev => ({ ...prev, pvl_date_right: true }))}
                    dateFormat="dd-MM-yyyy"
                    placeholderText="Select date"
                  />
                  {touched.pvl_date_right && errors.pvl_date_right && <div className="error-text">{errors.pvl_date_right}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">17.</span> Age (days)<span className="required">*</span></label>
                  <input
                    type="number"
                    name="pvl_age_days_right"
                    value={formData.pvl_age_days_right || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  {touched.pvl_age_days_right && errors.pvl_age_days_right && <div className="error-text">{errors.pvl_age_days_right}</div>}
                </div>
              </div>
            )}

            {(formData.pvl_side === "Left" || formData.pvl_side === "Both") && (
              <div className="form-row">
                <div className="form-group">
                  <label><span className="field-num">18.</span> If Left: Max Grade<span className="required">*</span></label>
                  <select
                    name="pvl_grade_left"
                    value={formData.pvl_grade_left || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  >
                    <option value="">-- Select --</option>
                    <option value="1">I (Flare)</option>
                    <option value="2">II (Localized cysts)</option>
                    <option value="3">III (Extensive cysts)</option>
                    <option value="4">IV (Subcortical)</option>
                  </select>
                  {touched.pvl_grade_left && errors.pvl_grade_left && <div className="error-text">{errors.pvl_grade_left}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">19.</span> Date<span className="required">*</span></label>
                  <DatePicker
                    selected={formData.pvl_date_left ? parseDateOnly(formData.pvl_date_left) : null}
                    onChange={(date) => {
                      const v = date ? toDateOnlyValue(date) : "";
                      setFormData(prev => ({ ...prev, pvl_date_left: v }));
                    }}
                    onBlur={() => setTouched(prev => ({ ...prev, pvl_date_left: true }))}
                    dateFormat="dd-MM-yyyy"
                    placeholderText="Select date"
                  />
                  {touched.pvl_date_left && errors.pvl_date_left && <div className="error-text">{errors.pvl_date_left}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">20.</span> Age (days)<span className="required">*</span></label>
                  <input
                    type="number"
                    name="pvl_age_days_left"
                    value={formData.pvl_age_days_left || ""}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  {touched.pvl_age_days_left && errors.pvl_age_days_left && <div className="error-text">{errors.pvl_age_days_left}</div>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )}
  </div>
  {/* ================= VENTRICULOMEGALY ================= */}
<div className="card">

  <div
  className="card-header-row"
  onClick={() => setOpenSection(openSection === "vm" ? null : "vm")}
>
  <span><span className="sec-num sub">H1.3</span> Ventriculomegaly</span>

  <span className={`summary centered ${getStatusClass(formData.ventriculomegaly_present)}`}>
    <span className="icon">
      {getStatusIcon(formData.ventriculomegaly_present)}
    </span>

    {formData.ventriculomegaly_present === "Yes"
      ? formData.ventriculomegaly_severity || "Yes"
      : formData.ventriculomegaly_present || "Not filled"}
  </span>

  <span className="arrow">
    {openSection === "vm" ? "▲" : "▼"}
  </span>
</div>

  {openSection === "vm" && (
    <div className="card-body">

{neuroPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({neuroPrefill.log_days_count} day{neuroPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchNeuroPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Neurological", fetchNeuroPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(neuroStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(neuroStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

      {/* Present */}
      <div className="form-group">
        <YesNoToggle label="21. Ventriculomegaly" name="ventriculomegaly_present" value={formData.ventriculomegaly_present} onChange={handleNeuroChange} onBlur={handleBlur} required />
        {neuroAutoFilled.ventriculomegaly_present && <span className="field-hint-auto-inline">from daily logs</span>}

        {touched.ventriculomegaly_present &&
          errors.ventriculomegaly_present && (
            <div className="error-text">
              {errors.ventriculomegaly_present}
            </div>
          )}
      </div>

      {/* CONDITIONAL */}
      {formData.ventriculomegaly_present === "Yes" && (
        <>
          <div className="form-row">

            <div className="form-group">
              <label><span className="field-num">22.</span> Severity</label>
              <select
                name="ventriculomegaly_severity"
                value={formData.ventriculomegaly_severity || ""}
                onChange={handleChange}
              >
                <option value="">-- Select --</option>
                <option value="Mild">Mild</option>
                <option value="Moderate">Moderate</option>
                <option value="Severe">Severe</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                <span className="field-num">23.</span> Maximum VI (mm) <span className="required">*</span>
              </label>
              <input
                type="number"
                name="vi_max"
                value={formData.vi_max || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="0–30"
              />
              {touched.vi_max && errors.vi_max && (
                <div className="error-text">{errors.vi_max}</div>
              )}
            </div>

          </div>

          <div className="form-row">

            <div className="form-group">
              <label>
                AHW (mm) <span style={{fontSize:10, fontWeight:400, color:"#9ca3af"}}>(part of #23)</span>
              </label>
              <input
                type="number"
                name="ahw"
                value={formData.ahw || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="0–10"
              />
              {touched.ahw && errors.ahw && (
                <div className="error-text">{errors.ahw}</div>
              )}
            </div>

            <div className="form-group">
              <label>
                <span className="field-num">24.</span> Maximum TOD (mm)
              </label>
              <input
                type="number"
                name="tod_max"
                value={formData.tod_max || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="0–40"
              />
              {touched.tod_max && errors.tod_max && (
                <div className="error-text">{errors.tod_max}</div>
              )}
            </div>

          </div>

          <div className="form-row">

            <div className="form-group">
              <label>
                <span className="field-num">25.</span> ACA RI
              </label>
              <input
                type="number"
                step="0.01"
                name="aca_ri"
                value={formData.aca_ri || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="0.2–2.0"
              />
              {touched.aca_ri && errors.aca_ri && (
                <div className="error-text">{errors.aca_ri}</div>
              )}
            </div>

            <div className="form-group">
              <label>
                <span className="field-num">26.</span> MCA RI
              </label>
              <input
                type="number"
                step="0.01"
                name="mca_ri"
                value={formData.mca_ri || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="0.4–1.0"
              />
              {touched.mca_ri && errors.mca_ri && (
                <div className="error-text">{errors.mca_ri}</div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )}
</div>

  {/* ================= SEIZURES ================= */}
  <div className="card">
    <div
  className="card-header-row"
  onClick={() => setOpenSection(openSection === "seizure" ? null : "seizure")}
>
  <span><span className="sec-num sub">H1.4</span> Seizures</span>

  <div className="right-section">
    <span className={`summary ${getStatusClass(formData.seizures)}`}>
      <span className="icon">{getStatusIcon(formData.seizures)}</span>

      {formData.seizures === "Yes"
        ? formData.status_epilepticus === "Yes"
          ? "Yes • Status Epilepticus"
          : "Yes"
        : formData.seizures || "Not filled"}
    </span>
</div>
    <span className="arrow">{openSection === "seizure" ? "▲" : "▼"}</span>
  
</div>

    {openSection === "seizure" && (
      <div className="card-body">

{neuroPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({neuroPrefill.log_days_count} day{neuroPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchNeuroPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Neurological", fetchNeuroPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(neuroStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(neuroStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

        <div className="form-group">
          <YesNoToggle label="27. Seizures" name="seizures" value={formData.seizures} onChange={handleNeuroChange} required />
          {neuroAutoFilled.seizures && <span className="field-hint-auto-inline">from daily logs</span>}
        </div>

        {formData.seizures === "Yes" && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label><span className="field-num">28.</span> Date<span className="required">*</span></label>
                <DatePicker
  selected={formData.seizure_date ? parseDateOnly(formData.seizure_date) : null}
  onChange={(date) => {
    clearNeuroAutoFilled("seizure_date");
    setFormData(prev => ({
      ...prev,
      seizure_date: date ? toDateOnlyValue(date) : ""
    }));
  }}
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
  className="date-picker-input"
/>
                {neuroAutoFilled.seizure_date && <span className="field-hint-auto-inline">from daily logs</span>}
              </div>

              <div className="form-group">
                <label><span className="field-num">29.</span> Type<span className="required">*</span></label>
                <select name="seizure_type" value={formData.seizure_type || ""} onChange={handleChange}>
                  <option value="">-- Select --</option>
                  <option>Subtle</option>
                  <option>Clonic</option>
                  <option>Tonic</option>
                  <option>Myoclonic</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label><span className="field-num">30.</span> EEG</label>
                <select name="eeg" value={formData.eeg || ""} onChange={handleChange}>
                  <option value="">-- Select --</option>
                  <option>Not done</option>
                  <option>Normal</option>
                  <option>Abnormal</option>
                </select>
              </div>

              <div className="form-group">
                <YesNoToggle label="31. Status Epilepticus" name="status_epilepticus" value={formData.status_epilepticus} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label><span className="field-num">32.</span> No. of AEDs</label>
                <select
                  name="aed_number"
                  value={formData.aed_number || ""}
                  onChange={handleChange}
                >
                  <option value="">-- Select --</option>
                  {[1,2,3,4,5,6].map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* WHICH AED */}
            <div className="form-group">
              <label><span className="field-num">33.</span> Which AED</label>

              <div className="checkbox-group">
                {[
                  { value: "Phenytoin",      label: "Phenytoin" },
                  // stored value kept as "Phenobarbital" for backward
                  // compatibility with already-saved records — CRF label is
                  // "Phenobarbitone"
                  { value: "Phenobarbital",  label: "Phenobarbitone" },
                  { value: "Levetiracetam",  label: "Levetiracetam" },
                  { value: "Midazolam",      label: "Midazolam" },
                  { value: "Lorazepam",      label: "Lorazepam" },
                  { value: "Pyridoxine",     label: "Pyridoxine" },
                  // stored value kept as "Other" for backward compatibility
                  { value: "Other",          label: "Others" },
                ].map(({ value, label }) => (
                  <label key={value} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={formData.aed_type?.includes(value)}
                      onChange={() => {
                        const selected = formData.aed_type || [];

                        if (selected.includes(value)) {
                          setFormData(prev => ({
                            ...prev,
                            aed_type: selected.filter(d => d !== value)
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            aed_type: [...selected, value]
                          }));
                        }
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* OTHER AED */}
            {formData.aed_type?.includes("Other") && (
              <div className="form-group">
                <label>Specify AED<span className="required">*</span></label>
                <input
                  type="text"
                  name="aed_other"
                  value={formData.aed_other || ""}
                  onChange={handleChange}
                  placeholder="Enter AED name"
                />
              </div>
            )}

            <div className="form-row">

              {/* ETIOLOGY */}
              <div className="form-group">
                <label><span className="field-num">34.</span> Etiology</label>
                <select
                  name="etiology"
                  value={formData.etiology || ""}
                  onChange={handleChange}
                >
                  <option value="">-- Select --</option>
                  <option value="Asphyxia">Asphyxia</option>
                  {/* stored values kept as "Low Na"/"Low Ca" for backward
                      compatibility with already-saved records — CRF labels
                      are "Hyponatremia"/"Hypocalcemia" */}
                  <option value="Low Na">Hyponatremia</option>
                  <option value="Low Ca">Hypocalcemia</option>
                  <option value="Low K">Hypokalemia</option>
                  <option value="Hypoglycemia">Hypoglycemia</option>
                  {/* stored value kept as "Intracranial bleed / hemorrhage"
                      for backward compatibility — CRF label is
                      "Intracranial hemorrhage" */}
                  <option value="Intracranial bleed / hemorrhage">Intracranial hemorrhage</option>
                  <option value="Meningitis">Meningitis</option>
                  <option value="Other">Others</option>
                </select>
              </div>

              {/* OTHER TEXT */}
              {formData.etiology === "Other" && (
                <div className="form-group">
                  <label>Specify Etiology<span className="required">*</span></label>
                  <input
                    type="text"
                    name="etiology_other"
                    value={formData.etiology_other || ""}
                    onChange={handleChange}
                    placeholder="Enter cause"
                  />
                </div>
              )}

            </div>
          </>
        )}
      </div>
    )}
  </div>

</div>



{/* ================= RESPIRATORY ================= */}
<div id="cat-resp" className={`form-section soft-blue${activeCategory === "resp" ? "" : " cat-hidden"}`}>
  <h3><Wind size={17} className="sec-icon" /> <span className="sec-num">H2</span> RESPIRATORY</h3>

 {/* ================= BPD ================= */}
  <div className="card">
    <div className="card-header-row" onClick={() => setOpenSection(openSection === "bpd" ? null : "bpd")}>
      <span><span className="sec-num sub">H2.1</span> Bronchopulmonary Dysplasia (BPD)</span>
<div className="right-section">
      <span className={`summary ${getRespStatusClass(formData.bpd)}`}>
  <span className="icon">{getRespIcon(formData.bpd)}</span>

  {!formData.bpd
    ? "Not filled"
    : formData.bpd === "Yes"
    ? formData.bpd_grade
      ? `Grade ${formData.bpd_grade}`
      : "Yes"
    : "No"}
</span></div>
      <span className="arrow">{openSection === "bpd" ? "▲" : "▼"}</span>
    </div>

    {openSection === "bpd" && (
      <div className="card-body">

{/* BPD */}
<div className="form-group">
  <YesNoToggle label="35. BPD Diagnosed" name="bpd" value={formData.bpd} onChange={handleChange} onBlur={handleBlur} required />

  {touched.bpd && errors.bpd && (
    <div className="error-text">{errors.bpd}</div>
  )}
</div>

{formData.bpd === "Yes" && (
  <>
    <div className="form-group">
      <label>
        <span className="field-num">36.</span> At 36 wks PMA <span className="required">*</span>
      </label>

      <select
        name="bpd_support_36w"
        value={formData.bpd_support_36w || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="NC ≤ 2L">NC ≤ 2L</option>
        <option value="NC > 2L / CPAP / NIPPV">NC &gt; 2L / CPAP / NIPPV</option>
        <option value="Invasive mechanical ventilation">Invasive mechanical ventilation</option>
      </select>

      {touched.bpd_support_36w && errors.bpd_support_36w && (
        <div className="error-text">{errors.bpd_support_36w}</div>
      )}
    </div>

    <div className="form-group">
      <label><span className="field-num">37.</span>
        Grade (Jensen) <span className="required">*</span>
      </label>

      <select
        name="bpd_grade"
        value={formData.bpd_grade || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
      </select>

      {touched.bpd_grade && errors.bpd_grade && (
        <div className="error-text">{errors.bpd_grade}</div>
      )}
    </div>
  </>
)}
</div>
    )}
  </div>

  {/* ================= RESPIRATORY SUPPORT (+ Postnatal Steroids) ================= */}
  <div className="card">
    <div className="card-header-row" onClick={() => setOpenSection(openSection === "support" ? null : "support")}>
      <span><span className="sec-num sub">H2.2</span> Respiratory Support</span>
      <span className={`summary ${respSummary.className}`}>
  <span className="icon">{respSummary.icon}</span>
  {respSummary.text}
</span>

      <span className="arrow">{openSection === "support" ? "▲" : "▼"}</span>
    </div>

    {openSection === "support" && (
      <div className="card-body">

{respPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({respPrefill.log_days_count} day{respPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchRespPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Respiratory", fetchRespPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(respStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(respStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

  {/* 38. O2 Days */}
  <div className="form-group">
    <label><span className="field-num">38.</span> O2 Days</label>
    <input
      type="number"
      name="oxygen_days"
      value={formData.oxygen_days || ""}
      onChange={handleRespChange}
      onBlur={handleBlur}
      min="0"
      max="365"
      step="1"
      placeholder="0–365"
    />
    {respAutoFilled.oxygen_days && <span className="field-hint-auto-inline">from daily logs</span>}
    {touched.oxygen_days && errors.oxygen_days && (
      <div className="error-text">{errors.oxygen_days}</div>
    )}
  </div>

  {/* 39/40. Nasal Cannula */}
  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="39. Nasal Cannula" name="nasal_cannula" value={formData.nasal_cannula} onChange={handleRespChange} onBlur={handleBlur} required />
      {respAutoFilled.nasal_cannula && <span className="field-hint-auto-inline">from daily logs</span>}
    </div>

    {formData.nasal_cannula === "Yes" && (
      <div className="form-group">
        <label><span className="field-num">40.</span> Days</label>
        <input
          type="number"
          name="nasal_cannula_days"
          value={formData.nasal_cannula_days || ""}
          placeholder="0–365"
          min="0"
          max="365"
          step="1"
          onChange={(e) => {
            clearRespAutoFilled("nasal_cannula_days");
            const value = e.target.value;
            if (value === "") { setFormData({ ...formData, nasal_cannula_days: "" }); return; }
            if (!/^\d+$/.test(value)) return;
            const num = Number(value);
            if (num < 0 || num > 365) return;
            setFormData({ ...formData, nasal_cannula_days: value });
          }}
          onBlur={(e) => {
            let num = Number(e.target.value);
            if (num > 365) num = 365;
            if (num < 0) num = 0;
            setFormData({ ...formData, nasal_cannula_days: num });
          }}
        />
        {respAutoFilled.nasal_cannula_days && <span className="field-hint-auto-inline">from daily logs</span>}
      </div>
    )}
  </div>

  {/* 41/42. CPAP */}
  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="41. CPAP" name="cpap" value={formData.cpap} onChange={handleRespChange} onBlur={handleBlur} required />
      {respAutoFilled.cpap && <span className="field-hint-auto-inline">from daily logs</span>}
    </div>

    {formData.cpap === "Yes" && (
      <div className="form-group">
        <label><span className="field-num">42.</span> Days</label>
        <input
          type="number"
          name="cpap_days"
          value={formData.cpap_days || ""}
          placeholder="0–365"
          min="0"
          max="365"
          step="1"
          onChange={(e) => {
            clearRespAutoFilled("cpap_days");
            const value = e.target.value;
            if (value === "") { setFormData({ ...formData, cpap_days: "" }); return; }
            if (!/^\d+$/.test(value)) return;
            const num = Number(value);
            if (num < 0 || num > 365) return;
            setFormData({ ...formData, cpap_days: value });
          }}
          onBlur={(e) => {
            let num = Number(e.target.value);
            if (num > 365) num = 365;
            if (num < 0) num = 0;
            setFormData({ ...formData, cpap_days: num });
          }}
        />
        {respAutoFilled.cpap_days && <span className="field-hint-auto-inline">from daily logs</span>}
      </div>
    )}
  </div>

  {/* 43/44. NIPPV */}
  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="43. NIPPV" name="nippv" value={formData.nippv} onChange={handleRespChange} onBlur={handleBlur} required />
      {respAutoFilled.nippv && <span className="field-hint-auto-inline">from daily logs</span>}
    </div>

    {formData.nippv === "Yes" && (
      <div className="form-group">
        <label><span className="field-num">44.</span> Days</label>
        <input
          type="number"
          name="nippv_days"
          value={formData.nippv_days || ""}
          placeholder="0–365"
          min="0"
          max="365"
          step="1"
          onChange={(e) => {
            clearRespAutoFilled("nippv_days");
            const value = e.target.value;
            if (value === "") { setFormData({ ...formData, nippv_days: "" }); return; }
            if (!/^\d+$/.test(value)) return;
            const num = Number(value);
            if (num < 0 || num > 365) return;
            setFormData({ ...formData, nippv_days: value });
          }}
          onBlur={(e) => {
            let num = Number(e.target.value);
            if (num > 365) num = 365;
            if (num < 0) num = 0;
            setFormData({ ...formData, nippv_days: num });
          }}
        />
        {respAutoFilled.nippv_days && <span className="field-hint-auto-inline">from daily logs</span>}
      </div>
    )}
  </div>

  {/* 45/46. HFNC */}
  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="45. HFNC" name="hfnc" value={formData.hfnc} onChange={handleRespChange} onBlur={handleBlur} required />
      {respAutoFilled.hfnc && <span className="field-hint-auto-inline">from daily logs</span>}
    </div>

    {formData.hfnc === "Yes" && (
      <div className="form-group">
        <label><span className="field-num">46.</span> Days</label>
        <input
          type="number"
          name="hfnc_days"
          value={formData.hfnc_days || ""}
          placeholder="0–365"
          min="0"
          max="365"
          step="1"
          onChange={(e) => {
            clearRespAutoFilled("hfnc_days");
            const value = e.target.value;
            if (value === "") { setFormData({ ...formData, hfnc_days: "" }); return; }
            if (!/^\d+$/.test(value)) return;
            const num = Number(value);
            if (num < 0 || num > 365) return;
            setFormData({ ...formData, hfnc_days: value });
          }}
          onBlur={(e) => {
            let num = Number(e.target.value);
            if (num > 365) num = 365;
            if (num < 0) num = 0;
            setFormData({ ...formData, hfnc_days: num });
          }}
        />
        {respAutoFilled.hfnc_days && <span className="field-hint-auto-inline">from daily logs</span>}
      </div>
    )}
  </div>

  {/* 47/48. Invasive mechanical ventilation */}
  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="47. Invasive Mechanical Ventilation" name="invasive_ventilation" value={formData.invasive_ventilation} onChange={handleRespChange} onBlur={handleBlur} required />
      {respAutoFilled.invasive_ventilation && <span className="field-hint-auto-inline">from daily logs</span>}
    </div>

    {formData.invasive_ventilation === "Yes" && (
      <div className="form-group">
        <label><span className="field-num">48.</span> Days</label>
        <input
          type="number"
          name="imv_days"
          value={formData.imv_days || ""}
          placeholder="0–365"
          min="0"
          max="365"
          step="1"
          onChange={(e) => {
            clearRespAutoFilled("imv_days");
            const value = e.target.value;
            if (value === "") { setFormData({ ...formData, imv_days: "" }); return; }
            if (!/^\d+$/.test(value)) return;
            const num = Number(value);
            if (num < 0 || num > 365) return;
            setFormData({ ...formData, imv_days: value });
          }}
          onBlur={(e) => {
            let num = Number(e.target.value);
            if (num > 365) num = 365;
            if (num < 0) num = 0;
            setFormData({ ...formData, imv_days: num });
          }}
        />
        {respAutoFilled.imv_days && <span className="field-hint-auto-inline">from daily logs</span>}
      </div>
    )}
  </div>

  {/* 49. Integrated oxygen exposure */}
  <div className="form-group">
    <label><span className="field-num">49.</span> Integrated Oxygen Exposure</label>
    <input
      type="number"
      name="oxygen_exposure"
      value={formData.oxygen_exposure || ""}
      placeholder="0–10000"
      min="0"
      max="10000"
      step="1"
      onChange={(e) => {
        const value = e.target.value;
        if (value === "") { setFormData({ ...formData, oxygen_exposure: "" }); return; }
        if (!/^\d+$/.test(value)) return;
        const num = Number(value);
        if (num < 0 || num > 10000) return;
        setFormData({ ...formData, oxygen_exposure: value });
      }}
      onBlur={(e) => {
        let num = Number(e.target.value);
        if (num > 10000) num = 10000;
        if (num < 0) num = 0;
        setFormData({ ...formData, oxygen_exposure: num });
      }}
    />
  </div>

  {/* 50. Postnatal steroids */}
  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="50. Postnatal Steroids" name="postnatal_steroids" value={formData.postnatal_steroids} onChange={handleRespChange} required />
      {respAutoFilled.postnatal_steroids && <span className="field-hint-auto-inline">from daily logs</span>}
      {touched.postnatal_steroids && errors.postnatal_steroids && (
        <div className="error-text">{errors.postnatal_steroids}</div>
      )}
    </div>
  </div>

  {formData.postnatal_steroids === "Yes" && (
    <>
      {/* 51. Age at steroid */}
      <div className="form-row">
        <div className="form-group">
          <label><span className="field-num">51.</span> Age at Steroid (days) <span className="required">*</span></label>
          <input
            type="number"
            name="steroid_age_days"
            value={formData.steroid_age_days || ""}
            placeholder="0–365"
            min="0"
            max="365"
            step="1"
            onChange={(e) => {
              const value = e.target.value;
              if (value === "") { setFormData({ ...formData, steroid_age_days: "" }); return; }
              if (!/^\d+$/.test(value)) return;
              const num = Number(value);
              if (num < 0 || num > 365) return;
              setFormData({ ...formData, steroid_age_days: value });
            }}
            onBlur={(e) => {
              let num = Number(e.target.value);
              if (num > 365) num = 365;
              if (num < 0) num = 0;
              setFormData({ ...formData, steroid_age_days: num });
              handleBlur(e);
            }}
          />
          {touched.steroid_age_days && errors.steroid_age_days && (
            <div className="error-text">{errors.steroid_age_days}</div>
          )}
        </div>

        {/* 52. Drug */}
        <div className="form-group">
          <label><span className="field-num">52.</span> Drug <span className="required">*</span></label>
          <select
            name="steroid_drug"
            value={formData.steroid_drug || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          >
            <option value="">-- Select --</option>
            <option value="Hydrocortisone">Hydrocortisone</option>
            <option value="Dexamethasone">Dexamethasone</option>
            <option value="Budesonide">Budesonide</option>
            <option value="Other">Other</option>
          </select>
          {touched.steroid_drug && errors.steroid_drug && (
            <div className="error-text">{errors.steroid_drug}</div>
          )}
        </div>
      </div>

      {formData.steroid_drug === "Other" && (
        <div className="form-group">
          <label>Other Drug <span className="required">*</span></label>
          <input
            type="text"
            name="steroid_drug_other"
            value={formData.steroid_drug_other || ""}
            onChange={(e) => {
              let value = e.target.value;
              if (/^[A-Za-z\s]*$/.test(value)) {
                setFormData({ ...formData, steroid_drug_other: value });
                validateRespSupport("steroid_drug_other", value, { ...formData, steroid_drug_other: value });
              }
            }}
            onBlur={handleBlur}
            placeholder="Enter drug name"
          />
          {touched.steroid_drug_other && errors.steroid_drug_other && (
            <div className="error-text">{errors.steroid_drug_other}</div>
          )}
        </div>
      )}

      {/* 53/54. Cumulative dose — 1st and 2nd drug */}
      <div className="form-row">
        <div className="form-group">
          <label><span className="field-num">53.</span> Cumulative Dose (mg/kg) — 1st drug <span className="required">*</span></label>
          <input
            type="number"
            name="steroid_dose"
            value={formData.steroid_dose || ""}
            placeholder="0–300"
            min="0"
            max="300"
            step="0.1"
            onChange={(e) => {
              const value = e.target.value;
              if (value === "") { setFormData({ ...formData, steroid_dose: "" }); return; }
              if (!/^\d*\.?\d*$/.test(value)) return;
              const num = Number(value);
              if (num < 0 || num > 300) return;
              setFormData({ ...formData, steroid_dose: value });
            }}
            onBlur={handleBlur}
          />
          {touched.steroid_dose && errors.steroid_dose && (
            <div className="error-text">{errors.steroid_dose}</div>
          )}
        </div>

        <div className="form-group">
          <label><span className="field-num">54.</span> Cumulative Dose (mg/kg) — 2nd drug</label>
          <input
            type="number"
            name="steroid_dose_2"
            value={formData.steroid_dose_2 || ""}
            placeholder="0–300 (if a second course/drug was given)"
            min="0"
            max="300"
            step="0.1"
            onChange={(e) => {
              const value = e.target.value;
              if (value === "") { setFormData({ ...formData, steroid_dose_2: "" }); return; }
              if (!/^\d*\.?\d*$/.test(value)) return;
              const num = Number(value);
              if (num < 0 || num > 300) return;
              setFormData({ ...formData, steroid_dose_2: value });
            }}
            onBlur={handleBlur}
          />
        </div>
      </div>

      {/* 55. Indication */}
      <div className="form-group">
        <label><span className="field-num">55.</span> Indication <span className="required">*</span></label>
        <select
          name="steroid_indication"
          value={formData.steroid_indication || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        >
          <option value="">-- Select --</option>
          <option value="Post-extubation">Post-extubation</option>
          <option value="Unable to extubate">Unable to extubate</option>
          <option value="BPD">BPD</option>
          <option value="Other">Other</option>
        </select>
        {touched.steroid_indication && errors.steroid_indication && (
          <div className="error-text">{errors.steroid_indication}</div>
        )}
      </div>

      {formData.steroid_indication === "Other" && (
        <div className="form-group">
          <label>Specify Other <span className="required">*</span></label>
          <input
            type="text"
            name="steroid_indication_other"
            value={formData.steroid_indication_other || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          {touched.steroid_indication_other && errors.steroid_indication_other && (
            <div className="error-text">{errors.steroid_indication_other}</div>
          )}
        </div>
      )}
    </>
  )}

</div>
    )}
  </div>

  {/* ================= OTHER RESPIRATORY (+ Rx + Extubation) ================= */}
  <div className="card">
    <div className="card-header-row" onClick={() => setOpenSection(openSection === "otherResp" ? null : "otherResp")}>
      <span><span className="sec-num sub">H2.3</span> Other Respiratory</span>

<span className={`summary ${
  hasYes ? "status-yes" : hasNo ? "status-no" : "status-empty"
}`}>
  <span className="icon">
    {hasYes ? "✔" : hasNo ? "✖" : "—"}
  </span>
  {hasYes ? "Yes" : hasNo ? "No" : "Not filled"}
</span>
      <span className="arrow">{openSection === "otherResp" ? "▲" : "▼"}</span>
    </div>

    {openSection === "otherResp" && (
      <div className="card-body">

{respPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({respPrefill.log_days_count} day{respPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchRespPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Respiratory", fetchRespPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(respStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(respStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

{/* 56. Pulmonary Hemorrhage */}
<div className="form-group">
  <YesNoToggle label="56. Pulmonary Hemorrhage" name="pulmonary_hemorrhage" value={formData.pulmonary_hemorrhage} onChange={handleRespChange} onBlur={handleBlur} required />
  {respAutoFilled.pulmonary_hemorrhage && <span className="field-hint-auto-inline">from daily logs</span>}
  {touched.pulmonary_hemorrhage && errors.pulmonary_hemorrhage && (
    <div className="error-text">{errors.pulmonary_hemorrhage}</div>
  )}
</div>

{/* 57. Pneumothorax */}
<div className="form-group">
  <YesNoToggle label="57. Pneumothorax" name="pneumothorax" value={formData.pneumothorax} onChange={handleRespChange} onBlur={handleBlur} required />
  {respAutoFilled.pneumothorax && <span className="field-hint-auto-inline">from daily logs</span>}
  {touched.pneumothorax && errors.pneumothorax && (
    <div className="error-text">{errors.pneumothorax}</div>
  )}
</div>

{formData.pneumothorax === "Yes" && (
  <div className="followup-box">
    {/* 58. Side */}
    <div className="form-group">
      <label><span className="field-num">58.</span> Side <span className="required">*</span></label>
      <select
        name="pneumothorax_side"
        value={formData.pneumothorax_side || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="Right">Right</option>
        <option value="Left">Left</option>
        <option value="Both">Bilateral</option>
      </select>
      {touched.pneumothorax_side && errors.pneumothorax_side && (
        <div className="error-text">{errors.pneumothorax_side}</div>
      )}
    </div>

    {/* 59. Chest drain */}
    <div className="form-group">
      <YesNoToggle label="59. Chest drain" name="chest_drain" value={formData.chest_drain} onChange={handleRespChange} onBlur={handleBlur} required />
      {respAutoFilled.chest_drain && <span className="field-hint-auto-inline">from daily logs</span>}
      {touched.chest_drain && errors.chest_drain && (
        <div className="error-text">{errors.chest_drain}</div>
      )}
    </div>
  </div>
)}

{/* 60. Pulmonary Hypertension */}
<div className="form-group">
  <YesNoToggle label="60. Pulmonary Hypertension" name="pulmonary_hypertension" value={formData.pulmonary_hypertension} onChange={handleRespChange} onBlur={handleBlur} required />
  {respAutoFilled.pulmonary_hypertension && <span className="field-hint-auto-inline">from daily logs</span>}
  {touched.pulmonary_hypertension && errors.pulmonary_hypertension && (
    <div className="error-text">{errors.pulmonary_hypertension}</div>
  )}
</div>

{/* 61. Rx */}
<div className="form-group">
  <label><span className="field-num">61.</span> Rx</label>
  <div className="rx-card">
    <p className="rx-subtitle">Select treatment given</p>
    <div className="rx-grid">
      <label className="rx-option">
        <input type="checkbox" name="rx_sildenafil" checked={formData.rx_sildenafil || false} onChange={handleChange} />
        <span>Sildenafil</span>
      </label>
      <label className="rx-option">
        <input type="checkbox" name="rx_ino" checked={formData.rx_ino || false} onChange={handleChange} />
        <span>iNO</span>
      </label>
      <label className="rx-option">
        <input type="checkbox" name="rx_miliri" checked={formData.rx_miliri || false} onChange={handleChange} />
        <span>Miliri</span>
      </label>
      <label className="rx-option">
        <input type="checkbox" name="rx_vaso" checked={formData.rx_vaso || false} onChange={handleChange} />
        <span>Vaso</span>
      </label>
      <label className="rx-option">
        <input type="checkbox" name="rx_other" checked={formData.rx_other || false} onChange={handleChange} />
        <span>Other</span>
      </label>
    </div>
  </div>

  {formData.rx_other && (
    <div className="form-group" style={{marginTop:"10px"}}>
      <label>Other (Specify)</label>
      <input
        name="rx_other_text"
        value={formData.rx_other_text || ""}
        onChange={handleChange}
        placeholder="Specify treatment"
      />
    </div>
  )}
</div>

{/* 62/63. Extubation Failure */}
<div className="form-row">
  <div className="form-group">
    <YesNoToggle label="62. Extubation Failure" name="extubation_failure" value={formData.extubation_failure} onChange={handleRespChange} />
    {respAutoFilled.extubation_failure && <span className="field-hint-auto-inline">from daily logs</span>}
  </div>

  {formData.extubation_failure === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">63.</span> Episodes</label>
      <input
        type="number"
        name="extubation_episodes"
        value={formData.extubation_episodes || ""}
        onChange={handleRespChange}
        placeholder="Number of episodes"
      />
      {respAutoFilled.extubation_episodes && <span className="field-hint-auto-inline">from daily logs</span>}
    </div>
  )}
</div>

</div>
    )}
  </div>

 {/* ================= APNEA ================= */}
  <div className="card">
    <div className="card-header-row" onClick={() => setOpenSection(openSection === "apnea" ? null : "apnea")}>
      <span><span className="sec-num sub">H2.4</span> Apnea of Prematurity</span>
      <span className={`summary ${getRespStatusClass(formData.apnea)}`}>
  <span className="icon">{getRespIcon(formData.apnea)}</span>
  {formData.apnea || "Not filled"}
</span>
      <span className="arrow">{openSection === "apnea" ? "▲" : "▼"}</span>
    </div>

    {openSection === "apnea" && (
      <div className="card-body">

{respPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({respPrefill.log_days_count} day{respPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchRespPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Respiratory", fetchRespPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(respStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(respStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

<div className="form-row">
  {/* 64. Apnea */}
  <div className="form-group">
    <YesNoToggle label="64. Apnea" name="apnea" value={formData.apnea} onChange={handleRespChange} onBlur={handleBlur} required />
    {respAutoFilled.apnea && <span className="field-hint-auto-inline">from daily logs</span>}
    {touched.apnea && errors.apnea && (
      <div className="error-text">{errors.apnea}</div>
    )}
  </div>

  {/* 65. Age at onset */}
  {formData.apnea === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">65.</span> Age at onset (days) <span className="required">*</span></label>
      <input
        type="number"
        name="apnea_onset_age"
        value={formData.apnea_onset_age || ""}
        onChange={handleRespChange}
        onBlur={handleBlur}
        min="0"
        max="60"
        step="1"
        placeholder="0–60"
      />
      {respAutoFilled.apnea_onset_age && <span className="field-hint-auto-inline">from daily logs</span>}
      {touched.apnea_onset_age && errors.apnea_onset_age && (
        <div className="error-text">{errors.apnea_onset_age}</div>
      )}
    </div>
  )}
</div>

<div className="form-row">
  {/* 66. Caffeine */}
  <div className="form-group">
    <YesNoToggle label="66. Caffeine" name="caffeine_used" value={formData.caffeine_used} onChange={handleRespChange} onBlur={handleBlur} required />
    {respAutoFilled.caffeine_used && <span className="field-hint-auto-inline">from daily logs</span>}
    {touched.caffeine_used && errors.caffeine_used && (
      <div className="error-text">{errors.caffeine_used}</div>
    )}
  </div>

  {/* 67. Days */}
  {formData.caffeine_used === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">67.</span> Days <span className="required">*</span></label>
      <input
        type="number"
        name="caffeine_duration"
        value={formData.caffeine_duration || ""}
        onChange={handleRespChange}
        onBlur={handleBlur}
        min="0"
        max="60"
        step="1"
        placeholder="0–60"
      />
      {respAutoFilled.caffeine_duration && <span className="field-hint-auto-inline">from daily logs</span>}
      {touched.caffeine_duration && errors.caffeine_duration && (
        <div className="error-text">{errors.caffeine_duration}</div>
      )}
    </div>
  )}
</div>
</div>
    )}
  </div>
</div>



{/* ================= GASTROINTESTINAL ================= */}
<div id="cat-gi" className={`form-section soft-blue${activeCategory === "gi" ? "" : " cat-hidden"}`}>
  <h3><Utensils size={17} className="sec-icon" /> <span className="sec-num">H3</span> GASTROINTESTINAL</h3>
  
  <div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "fi" ? null : "fi")}
  >
    <span>Feed Intolerance</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.feed_intolerance)}`}>
        <span className="icon">{getStatusIcon(formData.feed_intolerance)}</span>
        {formData.feed_intolerance || "Not filled"}
      </span></div>
      <span className="arrow">{openSection === "fi" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "fi" && (
    <div className="card-body">

{giPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({giPrefill.log_days_count} day{giPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchGiPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Gastrointestinal", fetchGiPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(giStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(giStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="68. Feed Intolerance" name="feed_intolerance" value={formData.feed_intolerance} onChange={handleGiChange} />
      {giAutoFilled.feed_intolerance && <span className="field-hint-auto-inline">from daily logs</span>}
      <div className="field-hint">Record First Event</div>
    </div>
  </div>

  {formData.feed_intolerance === "Yes" && (
    <div className="fi-card">
      <p className="fi-subtitle">69. If 'Yes', specify (select all that apply):</p>

      <div className="fi-grid">
        <label className="fi-option">
          <input
            type="checkbox"
            name="fi_abdominal_distension"
            checked={formData.fi_abdominal_distension || false}
            onChange={handleChange}
          />
          <span>Abdominal distension</span>
        </label>

        <label className="fi-option">
          <input
            type="checkbox"
            name="fi_prefeed_aspirates"
            checked={formData.fi_prefeed_aspirates || false}
            onChange={handleChange}
          />
          <span>Pre-feed aspirates</span>
        </label>

        <label className="fi-option">
          <input
            type="checkbox"
            name="fi_altered_aspirates"
            checked={formData.fi_altered_aspirates || false}
            onChange={handleChange}
          />
          <span>Altered aspirates</span>
        </label>

        <label className="fi-option">
          <input
            type="checkbox"
            name="fi_sluggish_bowel"
            checked={formData.fi_sluggish_bowel || false}
            onChange={handleChange}
          />
          <span>Sluggish / absent bowel sounds</span>
        </label>

        <label className="fi-option">
          <input
            type="checkbox"
            name="fi_others"
            checked={formData.fi_others || false}
            onChange={handleChange}
          />
          <span>Others</span>
        </label>
      </div>

      {formData.fi_others && (
        <div className="form-group" style={{marginTop:"10px"}}>
          <label>Specify Other</label>
          <input
            name="fi_others_text"
            value={formData.fi_others_text || ""}
            onChange={handleChange}
            placeholder="Specify"
          />
        </div>
      )}
    </div>
  )}
  </div>
  )}
</div>

  {/* NEC */}
  <div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "nec" ? null : "nec")}
  >
    <span><span className="sec-num sub">H3.1</span> Necrotizing Enterocolitis (NEC)</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.nec)}`}>
        <span className="icon">{getStatusIcon(formData.nec)}</span>
        {getNecSummary()}
      </span></div>
      <span className="arrow">{openSection === "nec" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "nec" && (
    <div className="card-body">

{giPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({giPrefill.log_days_count} day{giPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchGiPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Gastrointestinal", fetchGiPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(giStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(giStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

<div className="form-group">
  <YesNoToggle label="70. NEC" name="nec" value={formData.nec} onChange={handleGiChange} onBlur={handleBlur} required />
  {giAutoFilled.nec && <span className="field-hint-auto-inline">from daily logs</span>}

  {touched.nec && errors.nec && (
    <div className="error-text">{errors.nec}</div>
  )}
</div>

{formData.nec === "Yes" && (
  <>
    <div className="form-group">
      <label>
        <span className="field-num">71.</span> Max Stage <span className="required">*</span>
      </label>

      <select
        name="nec_stage"
        value={formData.nec_stage || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="IA">IA</option>
        <option value="IB">IB</option>
        <option value="IIA">IIA</option>
        <option value="IIB">IIB</option>
        <option value="IIIA">IIIA</option>
        <option value="IIIB">IIIB</option>
      </select>

      {touched.nec_stage && errors.nec_stage && (
        <div className="error-text">{errors.nec_stage}</div>
      )}
    </div>

    <div className="form-row">
      <div className="form-group">
        <label>
          <span className="field-num">72.</span> Date <span className="required">*</span>
        </label>

        <input
          type="date"
          name="nec_date"
          value={formData.nec_date || ""}
          onChange={handleGiChange}
          onBlur={handleBlur}
        />
        {giAutoFilled.nec_date && <span className="field-hint-auto-inline">from daily logs</span>}

        {touched.nec_date && errors.nec_date && (
          <div className="error-text">{errors.nec_date}</div>
        )}
      </div>

      <div className="form-group">
        <label>
          <span className="field-num">73.</span> Age (days) <span className="required">*</span>
        </label>

        <input
          type="number"
          name="nec_age_days"
          value={formData.nec_age_days || ""}
          placeholder="0–120"
          onChange={handleGiChange}
          onBlur={handleBlur}
        />
        {giAutoFilled.nec_age_days && <span className="field-hint-auto-inline">from daily logs</span>}

        {touched.nec_age_days && errors.nec_age_days && (
          <div className="error-text">{errors.nec_age_days}</div>
        )}
      </div>
    </div>

    <div className="form-group">
      <YesNoToggle label="74. Surgical intervention required" name="nec_surgery" value={formData.nec_surgery} onChange={handleChange} onBlur={handleBlur} required />

      {touched.nec_surgery && errors.nec_surgery && (
        <div className="error-text">{errors.nec_surgery}</div>
      )}
    </div>

    {formData.nec_surgery === "Yes" && (
      <>
        <div className="form-group">
          <label>
            <span className="field-num">75.</span> Type of surgical intervention <span className="required">*</span>
          </label>

          <select
            name="nec_surgery_type"
            value={formData.nec_surgery_type || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          >
            <option value="">-- Select --</option>
            <option value="Peritoneal drain">Peritoneal drain</option>
            <option value="Laparotomy">Laparotomy</option>
          </select>

          {touched.nec_surgery_type && errors.nec_surgery_type && (
            <div className="error-text">{errors.nec_surgery_type}</div>
          )}
        </div>

        {formData.nec_surgery_type === "Laparotomy" && (
          <>
            <div className="form-row">
              <div className="form-group">
                <YesNoToggle label="76. If Laparotomy, Resection" name="nec_resection" value={formData.nec_resection} onChange={handleChange} onBlur={handleBlur} required />

                {touched.nec_resection && errors.nec_resection && (
                  <div className="error-text">{errors.nec_resection}</div>
                )}
              </div>

              {formData.nec_resection === "Yes" && (
                <div className="form-group">
                  <label>
                    <span className="field-num">77.</span> Length (cm) <span className="required">*</span>
                  </label>

                  <input
                    type="number"
                    name="nec_resection_length"
                    value={formData.nec_resection_length || ""}
                    placeholder="0–200"
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />

                  {touched.nec_resection_length &&
                    errors.nec_resection_length && (
                      <div className="error-text">
                        {errors.nec_resection_length}
                      </div>
                    )}
                </div>
              )}
            </div>

            <div className="form-group">
              <YesNoToggle label="78. Stoma" name="nec_stoma" value={formData.nec_stoma} onChange={handleChange} onBlur={handleBlur} required />

              {touched.nec_stoma && errors.nec_stoma && (
                <div className="error-text">{errors.nec_stoma}</div>
              )}
            </div>
          </>
        )}
      </>
    )}
  </>
)}</div>
  )}
</div>
  {/* Feeding & Nutrition */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "feeding" ? null : "feeding")}
  >
    <span><span className="sec-num sub">H3.2</span> Feeding &amp; Nutrition</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.pn)}`}>
        <span className="icon">{getStatusIcon(formData.pn)}</span>
        {getFeedingSummary()}
      </span></div>
      <span className="arrow">{openSection === "feeding" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "feeding" && (
    <div className="card-body">

{giPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({giPrefill.log_days_count} day{giPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchGiPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Gastrointestinal", fetchGiPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(giStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(giStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

{/* ---------------- BASIC FIELDS ---------------- */}
<div className="form-row">
  <div className="form-group">
    <label><span className="field-num">79.</span> Age at 1st Enteral Feed (days)</label>
    <input
      type="number"
      name="age_first_feed"
      value={formData.age_first_feed || ""}
      onChange={handleGiChange}
      onBlur={handleBlur}
      min="0"
      max="60"
    />
    {giAutoFilled.age_first_feed && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.age_first_feed && <div className="error-text">{errors.age_first_feed}</div>}
  </div>

  <div className="form-group">
    <label><span className="field-num">80.</span> Age at Full Feeds (days)</label>
    <input
      type="number"
      name="age_full_feeds"
      value={formData.age_full_feeds || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="120"
    />
    {errors.age_full_feeds && <div className="error-text">{errors.age_full_feeds}</div>}
  </div>
</div>

<div className="form-row">
  <div className="form-group">
    <label><span className="field-num">81.</span> PDHM (days)</label>
    <input
      type="number"
      name="pdhm_days"
      value={formData.pdhm_days || ""}
      onChange={handleGiChange}
      onBlur={handleBlur}
      min="0"
      max="365"
    />
    {giAutoFilled.pdhm_days && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.pdhm_days && <div className="error-text">{errors.pdhm_days}</div>}
  </div>

  <div className="form-group">
    <label><span className="field-num">82.</span> EBM (days)</label>
    <input
      type="number"
      name="ebm_days"
      value={formData.ebm_days || ""}
      onChange={handleGiChange}
      onBlur={handleBlur}
      min="0"
      max="365"
    />
    {giAutoFilled.ebm_days && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.ebm_days && <div className="error-text">{errors.ebm_days}</div>}
  </div>

  <div className="form-group">
    <label><span className="field-num">83.</span> FM (days)</label>
    <input
      type="number"
      name="fm_days"
      value={formData.fm_days || ""}
      onChange={handleGiChange}
      onBlur={handleBlur}
      min="0"
      max="365"
    />
    {giAutoFilled.fm_days && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.fm_days && <div className="error-text">{errors.fm_days}</div>}
  </div>
</div>

{/* ---------------- PN ---------------- */}
<div className="form-group">
  <YesNoToggle label="84. PN" name="pn" value={formData.pn} onChange={handleGiChange} onBlur={handleBlur} required />
  {giAutoFilled.pn && <span className="field-hint-auto-inline">from daily logs</span>}
  {errors.pn && <div className="error-text">{errors.pn}</div>}
</div>

{formData.pn === "Yes" && (
  <>
    <div className="form-group">
      <label><span className="field-num">85.</span> Total PN Days</label>
      <input
        type="number"
        name="pn_days"
        value={formData.pn_days || ""}
        onChange={handleGiChange}
        onBlur={handleBlur}
        min="0"
        max="365"
      />
      {giAutoFilled.pn_days && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.pn_days && <div className="error-text">{errors.pn_days}</div>}
    </div>

    {/* ---------------- PN ADVERSE ---------------- */}
    <div className="pn-adverse-card">
      <YesNoToggle label="86. Adverse Effects of PN" name="pn_adverse" value={formData.pn_adverse} onChange={handleChange} />

      {formData.pn_adverse === "Yes" && (
        <>
          <div className="adverse-title">87. If 'Yes', specify *</div>

          <div className="pn-checkbox-grid">
            <label><input type="checkbox" name="pn_cholestasis" checked={formData.pn_cholestasis || false} onChange={handleChange}/> Cholestasis</label>
            <label><input type="checkbox" name="pn_electrolyte" checked={formData.pn_electrolyte || false} onChange={handleChange}/> Electrolyte imbalance</label>
            <label><input type="checkbox" name="pn_acidosis" checked={formData.pn_acidosis || false} onChange={handleChange}/> Acidosis</label>
            <label><input type="checkbox" name="pn_hypercapnia" checked={formData.pn_hypercapnia || false} onChange={handleChange}/> Hypercapnia</label>
            <label><input type="checkbox" name="pn_other" checked={formData.pn_other || false} onChange={handleChange}/> Other</label>
          </div>

          {errors.pn_adverse_group && (
            <div className="error-text">{errors.pn_adverse_group}</div>
          )}

          {formData.pn_other && (
            <input
              name="pn_other_text"
              value={formData.pn_other_text || ""}
              onChange={handleChange}
              placeholder="Specify other"
            />
          )}
        </>
      )}
    </div>

    {/* ---------------- PROBIOTIC ---------------- */}
    <div className="probiotic-card">
      <YesNoToggle label="88. Probiotic" name="probiotic" value={formData.probiotic} onChange={handleGiChange} required />
      {giAutoFilled.probiotic && <span className="field-hint-auto-inline">from daily logs</span>}

      {formData.probiotic === "Yes" && (
        <>
          <div className="adverse-title">89. Strains *</div>

          <div className="pn-checkbox-grid">
            <label><input type="checkbox" name="strain_mono" checked={formData.strain_mono || false} onChange={handleChange}/> Mono</label>
            <label><input type="checkbox" name="strain_bi" checked={formData.strain_bi || false} onChange={handleChange}/> Bi</label>
            <label><input type="checkbox" name="strain_multi" checked={formData.strain_multi || false} onChange={handleChange}/> Multi</label>
            <label><input type="checkbox" name="strain_others" checked={formData.strain_others || false} onChange={handleChange}/> Others</label>
          </div>

          {errors.strain_group && (
            <div className="error-text">{errors.strain_group}</div>
          )}

          <div className="form-row" style={{marginTop:"10px"}}>
            <div className="form-group">
              <YesNoToggle label="90. Lactobacillus" name="lactobacillus" value={formData.lactobacillus} onChange={handleChange} />
            </div>
            <div className="form-group">
              <YesNoToggle label="91. Bifidobacterium" name="bifidobacterium" value={formData.bifidobacterium} onChange={handleChange} />
            </div>
          </div>
        </>
      )}
    </div>

    {/* ---------------- CHOLESTASIS ---------------- */}
    <div className="form-group">
      <YesNoToggle label="92. Cholestasis" name="cholestasis" value={formData.cholestasis} onChange={handleGiChange} onBlur={handleBlur} required />
      {giAutoFilled.cholestasis && <span className="field-hint-auto-inline">from daily logs</span>}

      {errors.cholestasis && (
        <div className="error-text">{errors.cholestasis}</div>
      )}
    </div>

    {formData.cholestasis === "Yes" && (
      <div className="form-row">
        <div className="form-group">
          <YesNoToggle label="93. TPN Associated" name="tpn_associated" value={formData.tpn_associated} onChange={handleChange} />
        </div>

        <div className="form-group">
          <label><span className="field-num">94.</span> Max Direct Bilirubin (mg/dL)</label>
          <input
            type="number"
            name="max_direct_bilirubin"
            value={formData.max_direct_bilirubin || ""}
            onChange={handleChange}
            onBlur={handleBlur}
            min="0"
            max="50"
          />
          {errors.max_direct_bilirubin && (
            <div className="error-text">{errors.max_direct_bilirubin}</div>
          )}
        </div>
      </div>
    )}
  </>
)}

</div>

)}
  </div>
</div>

{/* ================= METABOLIC ================= */}
<div id="cat-metabolic" className={`form-section soft-blue${activeCategory === "metabolic" ? "" : " cat-hidden"}`}>
  <h3><Activity size={17} className="sec-icon" /> <span className="sec-num">H4</span> METABOLIC</h3>
  {metabolicPrefill?.has_data && (
    <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
      Daily logs available ({metabolicPrefill.log_days_count} day{metabolicPrefill.log_days_count === 1 ? "" : "s"} recorded).
      Empty fields below were filled from them automatically — verify before saving.
      {" "}
      <button type="button" className="link-button" onClick={() => fetchMetabolicPrefill()}>
        Refill empty fields from daily logs
      </button>
      {" · "}
      <button
        type="button"
        className="link-button link-button-danger"
        onClick={() => confirmForceRefill("Metabolic", fetchMetabolicPrefill)}
      >
        Force refill (overwrite existing answers)
      </button>
    </div>
  )}
  {Object.keys(metabolicStale).length > 0 && (
    <div className="field-hint field-hint-warning">
      ⚠ The daily logs now disagree with the saved answer for:{" "}
      {Object.keys(metabolicStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
      This can happen if Form H was answered before the daily logs had this
      data. Use "Force refill" above if the daily logs are correct.
    </div>
  )}

  {/* ================= METABOLIC DISTURBANCES ================= */}
  <div className="card">

    <div
      className="card-header-row"
      onClick={() => setOpenSection(openSection === "metabolic" ? null : "metabolic")}
    >
      <span><span className="sec-num sub">H4.1</span> Metabolic Disturbances</span>
      <div className="right-section">
        <span className={`summary ${getStatusClass(
          [formData.hypoglycemia, formData.hyperglycemia, formData.metabolic_acidosis, formData.dyselectrolytemia, formData.osteopenia].includes("Yes")
            ? "Yes"
            : [formData.hypoglycemia, formData.hyperglycemia, formData.metabolic_acidosis, formData.dyselectrolytemia, formData.osteopenia].some(v => v)
              ? "No"
              : ""
        )}`}>
          <span className="icon">{getMetabolicSummary() === "Not filled" ? "—" : (getMetabolicSummary() === "No abnormalities" ? "✖" : "✔")}</span>
          {getMetabolicSummary()}
        </span>
      </div>
      <span className="arrow">{openSection === "metabolic" ? "▲" : "▼"}</span>
    </div>

    {openSection === "metabolic" && (
      <div className="card-body">

        {/* ---------------- HYPOGLYCEMIA (95-99) ---------------- */}
        <div className="form-group">
          <YesNoToggle label="95. Hypoglycemia" name="hypoglycemia" value={formData.hypoglycemia} onChange={handleMetabolicChange} onBlur={handleBlur} required />
          {metabolicAutoFilled.hypoglycemia && <span className="field-hint-auto-inline">from daily logs</span>}
          {touched.hypoglycemia && errors.hypoglycemia && <div className="error-text">{errors.hypoglycemia}</div>}
        </div>

        {formData.hypoglycemia === "Yes" && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label><span className="field-num">96.</span> No. of episodes<span className="required">*</span></label>
                <input type="number" name="hypoglycemia_episodes" value={formData.hypoglycemia_episodes || ""}
                  onChange={handleMetabolicChange} onBlur={handleBlur} min="0" max="50" placeholder="0–50" />
                {metabolicAutoFilled.hypoglycemia_episodes && <span className="field-hint-auto-inline">from daily logs</span>}
                {touched.hypoglycemia_episodes && errors.hypoglycemia_episodes && <div className="error-text">{errors.hypoglycemia_episodes}</div>}
              </div>

              <div className="form-group">
                <label><span className="field-num">97.</span> Lowest value (mg/dL)<span className="required">*</span></label>
                <input type="number" name="hypoglycemia_lowest" value={formData.hypoglycemia_lowest || ""}
                  onChange={handleMetabolicChange} onBlur={handleBlur} min="0" max="200" placeholder="0–200" />
                {metabolicAutoFilled.hypoglycemia_lowest && <span className="field-hint-auto-inline">from daily logs</span>}
                {touched.hypoglycemia_lowest && errors.hypoglycemia_lowest && <div className="error-text">{errors.hypoglycemia_lowest}</div>}
              </div>

              <div className="form-group">
                <YesNoToggle label="98. Rx" name="hypoglycemia_rx" value={formData.hypoglycemia_rx} onChange={handleMetabolicChange} onBlur={handleBlur} required />
                {metabolicAutoFilled.hypoglycemia_rx && <span className="field-hint-auto-inline">from daily logs</span>}
                {touched.hypoglycemia_rx && errors.hypoglycemia_rx && <div className="error-text">{errors.hypoglycemia_rx}</div>}
              </div>
            </div>

            {formData.hypoglycemia_rx === "Yes" && (
              <div className="form-row">
                <div className="form-group">
                  <label><span className="field-num">99.</span> Duration of Rx (days)<span className="required">*</span></label>
                  <input type="number" name="hypoglycemia_rx_duration" value={formData.hypoglycemia_rx_duration || ""}
                    onChange={handleMetabolicChange} onBlur={handleBlur} min="0" max="60" placeholder="0–60" />
                  {metabolicAutoFilled.hypoglycemia_rx_duration && <span className="field-hint-auto-inline">from daily logs</span>}
                  {touched.hypoglycemia_rx_duration && errors.hypoglycemia_rx_duration && <div className="error-text">{errors.hypoglycemia_rx_duration}</div>}
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------- HYPERGLYCEMIA (100-102) ---------------- */}
        <div className="form-group">
          <YesNoToggle label="100. Hyperglycemia" name="hyperglycemia" value={formData.hyperglycemia} onChange={handleMetabolicChange} onBlur={handleBlur} required />
          {metabolicAutoFilled.hyperglycemia && <span className="field-hint-auto-inline">from daily logs</span>}
          {touched.hyperglycemia && errors.hyperglycemia && <div className="error-text">{errors.hyperglycemia}</div>}
        </div>

        {formData.hyperglycemia === "Yes" && (
          <div className="form-row">
            <div className="form-group">
              <label><span className="field-num">101.</span> Highest value (mg/dL)<span className="required">*</span></label>
              <input type="number" name="hyperglycemia_highest" value={formData.hyperglycemia_highest || ""}
                onChange={handleMetabolicChange} onBlur={handleBlur} min="0" max="500" placeholder="0–500" />
              {metabolicAutoFilled.hyperglycemia_highest && <span className="field-hint-auto-inline">from daily logs</span>}
              {touched.hyperglycemia_highest && errors.hyperglycemia_highest && <div className="error-text">{errors.hyperglycemia_highest}</div>}
            </div>

            <div className="form-group">
              <YesNoToggle label="102. Rx (insulin)" name="hyperglycemia_rx" value={formData.hyperglycemia_rx} onChange={handleMetabolicChange} onBlur={handleBlur} required />
              {metabolicAutoFilled.hyperglycemia_rx && <span className="field-hint-auto-inline">from daily logs</span>}
              {touched.hyperglycemia_rx && errors.hyperglycemia_rx && <div className="error-text">{errors.hyperglycemia_rx}</div>}
            </div>
          </div>
        )}

        {/* ---------------- METABOLIC ACIDOSIS (103) ---------------- */}
        <div className="form-group">
          <YesNoToggle label="103. Metabolic Acidosis (pH &lt; 7.2)" name="metabolic_acidosis" value={formData.metabolic_acidosis} onChange={handleMetabolicChange} onBlur={handleBlur} required />
          {metabolicAutoFilled.metabolic_acidosis && <span className="field-hint-auto-inline">from daily logs</span>}
          {touched.metabolic_acidosis && errors.metabolic_acidosis && <div className="error-text">{errors.metabolic_acidosis}</div>}
        </div>

        {/* ---------------- DYSELECTROLYTEMIA (104-111) ---------------- */}
        <div className="form-group">
          <YesNoToggle label="104. Dyselectrolytemia" name="dyselectrolytemia" value={formData.dyselectrolytemia} onChange={handleMetabolicChange} onBlur={handleBlur} required />
          {metabolicAutoFilled.dyselectrolytemia && <span className="field-hint-auto-inline">from daily logs</span>}
          {touched.dyselectrolytemia && errors.dyselectrolytemia && <div className="error-text">{errors.dyselectrolytemia}</div>}
        </div>

        {formData.dyselectrolytemia === "Yes" && (
          <>
            <div className="form-group">
              <div className="adverse-title"><span className="field-num">105.</span> Type<span className="required">*</span></div>
              <div className="pn-checkbox-grid">
                <label className="checkbox-item">
                  <input type="checkbox" name="dyselectro_na" checked={formData.dyselectro_na || false} onChange={handleMetabolicChange} />
                  Na abnormality
                  {metabolicAutoFilled.dyselectro_na && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                <label className="checkbox-item">
                  <input type="checkbox" name="dyselectro_k" checked={formData.dyselectro_k || false} onChange={handleMetabolicChange} />
                  K abnormality
                  {metabolicAutoFilled.dyselectro_k && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                <label className="checkbox-item">
                  <input type="checkbox" name="dyselectro_ca" checked={formData.dyselectro_ca || false} onChange={handleMetabolicChange} />
                  Ionized Ca abnormality
                  {metabolicAutoFilled.dyselectro_ca && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
              </div>
              {errors.dyselectro_group && <div className="error-text">{errors.dyselectro_group}</div>}
            </div>

            {formData.dyselectro_na && (
              <div className="pn-adverse-card">
                <div className="adverse-title">If Na</div>

                <label className="checkbox-item">
                  <input type="checkbox" name="hyponatremia" checked={formData.hyponatremia || false} onChange={handleMetabolicChange} />
                  <span className="field-num">106.</span> Hyponatremia
                  {metabolicAutoFilled.hyponatremia && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                {formData.hyponatremia && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Status<span className="required">*</span></label>
                      <select name="hyponatremia_status" value={formData.hyponatremia_status || ""} onChange={handleChange} onBlur={handleBlur}>
                        <option value="">-- Select --</option>
                        <option value="Symptomatic">Symptomatic</option>
                        <option value="Asymptomatic">Asymptomatic</option>
                      </select>
                      {touched.hyponatremia_status && errors.hyponatremia_status && <div className="error-text">{errors.hyponatremia_status}</div>}
                    </div>
                    {formData.hyponatremia_status === "Symptomatic" && (
                      <div className="form-group">
                        <label>If symptomatic<span className="required">*</span></label>
                        <input type="text" name="hyponatremia_symptoms" value={formData.hyponatremia_symptoms || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe symptoms" />
                        {touched.hyponatremia_symptoms && errors.hyponatremia_symptoms && <div className="error-text">{errors.hyponatremia_symptoms}</div>}
                      </div>
                    )}
                  </div>
                )}

                <label className="checkbox-item">
                  <input type="checkbox" name="hypernatremia" checked={formData.hypernatremia || false} onChange={handleMetabolicChange} />
                  <span className="field-num">107.</span> Hypernatremia
                  {metabolicAutoFilled.hypernatremia && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                {formData.hypernatremia && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Status<span className="required">*</span></label>
                      <select name="hypernatremia_status" value={formData.hypernatremia_status || ""} onChange={handleChange} onBlur={handleBlur}>
                        <option value="">-- Select --</option>
                        <option value="Symptomatic">Symptomatic</option>
                        <option value="Asymptomatic">Asymptomatic</option>
                      </select>
                      {touched.hypernatremia_status && errors.hypernatremia_status && <div className="error-text">{errors.hypernatremia_status}</div>}
                    </div>
                    {formData.hypernatremia_status === "Symptomatic" && (
                      <div className="form-group">
                        <label>If symptomatic<span className="required">*</span></label>
                        <input type="text" name="hypernatremia_symptoms" value={formData.hypernatremia_symptoms || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe symptoms" />
                        {touched.hypernatremia_symptoms && errors.hypernatremia_symptoms && <div className="error-text">{errors.hypernatremia_symptoms}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {formData.dyselectro_k && (
              <div className="pn-adverse-card">
                <div className="adverse-title">If K</div>

                <label className="checkbox-item">
                  <input type="checkbox" name="hypokalemia" checked={formData.hypokalemia || false} onChange={handleMetabolicChange} />
                  <span className="field-num">108.</span> Hypokalaemia
                  {metabolicAutoFilled.hypokalemia && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                {formData.hypokalemia && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Status<span className="required">*</span></label>
                      <select name="hypokalemia_status" value={formData.hypokalemia_status || ""} onChange={handleChange} onBlur={handleBlur}>
                        <option value="">-- Select --</option>
                        <option value="Symptomatic">Symptomatic</option>
                        <option value="Asymptomatic">Asymptomatic</option>
                      </select>
                      {touched.hypokalemia_status && errors.hypokalemia_status && <div className="error-text">{errors.hypokalemia_status}</div>}
                    </div>
                    {formData.hypokalemia_status === "Symptomatic" && (
                      <div className="form-group">
                        <label>If symptomatic<span className="required">*</span></label>
                        <input type="text" name="hypokalemia_symptoms" value={formData.hypokalemia_symptoms || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe symptoms" />
                        {touched.hypokalemia_symptoms && errors.hypokalemia_symptoms && <div className="error-text">{errors.hypokalemia_symptoms}</div>}
                      </div>
                    )}
                  </div>
                )}

                <label className="checkbox-item">
                  <input type="checkbox" name="hyperkalemia" checked={formData.hyperkalemia || false} onChange={handleMetabolicChange} />
                  <span className="field-num">109.</span> Hyperkalaemia
                  {metabolicAutoFilled.hyperkalemia && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                {formData.hyperkalemia && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Status<span className="required">*</span></label>
                      <select name="hyperkalemia_status" value={formData.hyperkalemia_status || ""} onChange={handleChange} onBlur={handleBlur}>
                        <option value="">-- Select --</option>
                        <option value="Symptomatic">Symptomatic</option>
                        <option value="Asymptomatic">Asymptomatic</option>
                      </select>
                      {touched.hyperkalemia_status && errors.hyperkalemia_status && <div className="error-text">{errors.hyperkalemia_status}</div>}
                    </div>
                    {formData.hyperkalemia_status === "Symptomatic" && (
                      <div className="form-group">
                        <label>If symptomatic<span className="required">*</span></label>
                        <input type="text" name="hyperkalemia_symptoms" value={formData.hyperkalemia_symptoms || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe symptoms" />
                        {touched.hyperkalemia_symptoms && errors.hyperkalemia_symptoms && <div className="error-text">{errors.hyperkalemia_symptoms}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {formData.dyselectro_ca && (
              <div className="pn-adverse-card">
                <div className="adverse-title">If Ionized Ca</div>

                <label className="checkbox-item">
                  <input type="checkbox" name="hypocalcemia" checked={formData.hypocalcemia || false} onChange={handleMetabolicChange} />
                  <span className="field-num">110.</span> Hypocalcemia
                  {metabolicAutoFilled.hypocalcemia && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                {formData.hypocalcemia && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Status<span className="required">*</span></label>
                      <select name="hypocalcemia_status" value={formData.hypocalcemia_status || ""} onChange={handleChange} onBlur={handleBlur}>
                        <option value="">-- Select --</option>
                        <option value="Symptomatic">Symptomatic</option>
                        <option value="Asymptomatic">Asymptomatic</option>
                      </select>
                      {touched.hypocalcemia_status && errors.hypocalcemia_status && <div className="error-text">{errors.hypocalcemia_status}</div>}
                    </div>
                    {formData.hypocalcemia_status === "Symptomatic" && (
                      <div className="form-group">
                        <label>If symptomatic<span className="required">*</span></label>
                        <input type="text" name="hypocalcemia_symptoms" value={formData.hypocalcemia_symptoms || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe symptoms" />
                        {touched.hypocalcemia_symptoms && errors.hypocalcemia_symptoms && <div className="error-text">{errors.hypocalcemia_symptoms}</div>}
                      </div>
                    )}
                  </div>
                )}

                <label className="checkbox-item">
                  <input type="checkbox" name="hypercalcemia" checked={formData.hypercalcemia || false} onChange={handleMetabolicChange} />
                  <span className="field-num">111.</span> Hypercalcemia
                  {metabolicAutoFilled.hypercalcemia && <span className="field-hint-auto-inline">from daily logs</span>}
                </label>
                {formData.hypercalcemia && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Status<span className="required">*</span></label>
                      <select name="hypercalcemia_status" value={formData.hypercalcemia_status || ""} onChange={handleChange} onBlur={handleBlur}>
                        <option value="">-- Select --</option>
                        <option value="Symptomatic">Symptomatic</option>
                        <option value="Asymptomatic">Asymptomatic</option>
                      </select>
                      {touched.hypercalcemia_status && errors.hypercalcemia_status && <div className="error-text">{errors.hypercalcemia_status}</div>}
                    </div>
                    {formData.hypercalcemia_status === "Symptomatic" && (
                      <div className="form-group">
                        <label>If symptomatic<span className="required">*</span></label>
                        <input type="text" name="hypercalcemia_symptoms" value={formData.hypercalcemia_symptoms || ""}
                          onChange={handleChange} onBlur={handleBlur} placeholder="Describe symptoms" />
                        {touched.hypercalcemia_symptoms && errors.hypercalcemia_symptoms && <div className="error-text">{errors.hypercalcemia_symptoms}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ---------------- OSTEOPENIA (112-115) ---------------- */}
        <div className="form-group">
          <YesNoToggle label="112. Osteopenia" name="osteopenia" value={formData.osteopenia} onChange={handleMetabolicChange} onBlur={handleBlur} required />
          {metabolicAutoFilled.osteopenia && <span className="field-hint-auto-inline">from daily logs</span>}
          {touched.osteopenia && errors.osteopenia && <div className="error-text">{errors.osteopenia}</div>}
        </div>

        {formData.osteopenia === "Yes" && (
          <div className="form-row">
            <div className="form-group">
              <label><span className="field-num">113.</span> ALP peak (IU/L)<span className="required">*</span></label>
              <input type="number" name="alp_peak" value={formData.alp_peak || ""}
                onChange={handleChange} onBlur={handleBlur} min="0" max="6000" placeholder="0–6000" />
              {touched.alp_peak && errors.alp_peak && <div className="error-text">{errors.alp_peak}</div>}
            </div>

            <div className="form-group">
              <label><span className="field-num">114.</span> Lowest Total Ca<span className="required">*</span></label>
              <input type="number" step="0.1" name="lowest_calcium" value={formData.lowest_calcium || ""}
                onChange={handleChange} onBlur={handleBlur} min="0" max="15" placeholder="0–15" />
              {touched.lowest_calcium && errors.lowest_calcium && <div className="error-text">{errors.lowest_calcium}</div>}
            </div>

            <div className="form-group">
              <label><span className="field-num">115.</span> Lowest P<span className="required">*</span></label>
              <input type="number" step="0.1" name="lowest_phosphorus" value={formData.lowest_phosphorus || ""}
                onChange={handleChange} onBlur={handleBlur} min="0" max="15" placeholder="0–15" />
              {touched.lowest_phosphorus && errors.lowest_phosphorus && <div className="error-text">{errors.lowest_phosphorus}</div>}
            </div>
          </div>
        )}

      </div>
    )}
  </div>
</div>

{/* ================= PDA ================= */}
<div id="cat-cvs" className={`form-section soft-blue${activeCategory === "cvs" ? "" : " cat-hidden"}`}>

  <h3><HeartPulse size={17} className="sec-icon" /> <span className="sec-num">H5</span> CARDIOVASCULAR</h3>

  {/* ================= STRUCTURAL HEART DISEASE ================= */}
  <div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "shd" ? null : "shd")}
  >
    <span><span className="sec-num sub">H5.1</span> Structural Heart Disease</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.structural_heart_disease)}`}>
        <span className="icon">{getStatusIcon(formData.structural_heart_disease)}</span>
        {formData.structural_heart_disease || "Not filled"}
      </span>
    </div>
    <span className="arrow">{openSection === "shd" ? "▲" : "▼"}</span>
  </div>

  {openSection === "shd" && (
    <div className="card-body">
      <div className="form-row">
        <div className="form-group">
          <YesNoToggle label="Structural Heart Disease" name="structural_heart_disease" value={formData.structural_heart_disease} onChange={handleChange} onBlur={handleBlur} required />
          {errors.structural_heart_disease && (
            <div className="error-text">{errors.structural_heart_disease}</div>
          )}
        </div>

        {formData.structural_heart_disease === "Yes" && (
          <div className="form-group">
            <label><span className="field-num">116.</span> If yes, specify <span className="required">*</span></label>
            <input
              name="structural_heart_disease_detail"
              value={formData.structural_heart_disease_detail || ""}
              onChange={handleChange}
              onBlur={handleBlur}
            />
            {errors.structural_heart_disease_detail && (
              <div className="error-text">{errors.structural_heart_disease_detail}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )}
  </div>

  <div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "pda" ? null : "pda")}
  >
    <span><span className="sec-num sub">H5.2</span> Patent Ductus Arteriosus (PDA)</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.hs_pda)}`}>
        <span className="icon">{getStatusIcon(formData.hs_pda)}</span>
        {getPDASummary()}
      </span>
     </div>
      <span className="arrow">{openSection === "pda" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "pda" && (
    <div className="card-body">

{cvPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({cvPrefill.log_days_count} day{cvPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchCvPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Cardiovascular", fetchCvPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(cvStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(cvStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

<div className="pn-adverse-card">

  {/* HS-PDA */}
  <div className="form-group">
    <YesNoToggle label="117. HS-PDA" name="hs_pda" value={formData.hs_pda} onChange={handleCvChange} onBlur={handleBlur} required />
    {cvAutoFilled.hs_pda && <span className="field-hint-auto-inline">from daily logs</span>}

    {errors.hs_pda && (
      <div className="error-text">{errors.hs_pda}</div>
    )}
  </div>

  {formData.hs_pda === "Yes" && (
    <>

      {/* ---------------- DIAGNOSIS ---------------- */}
      <div className="adverse-title">
        118. If 'Yes', diagnosed by <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="pda_clinical"
            checked={formData.pda_clinical || false}
            onChange={handleChange}
          />
          Clinical
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="pda_echo"
            checked={formData.pda_echo || false}
            onChange={handleChange}
          />
          Echo
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="pda_both"
            checked={formData.pda_both || false}
            onChange={handleChange}
          />
          Both
        </label>

      </div>

      {errors.pda_diagnosis_group && (
        <div className="error-text">{errors.pda_diagnosis_group}</div>
      )}

      {/* ---------------- CLINICAL FEATURES ---------------- */}
      {formData.pda_clinical && (
        <>
          <div className="adverse-title">119. If 'Clinical', features</div>

          <div className="pn-checkbox-grid">

            <label className="checkbox-item">
              <input type="checkbox" name="pda_murmur" checked={formData.pda_murmur || false} onChange={handleChange}/>
              Murmur
            </label>

            <label className="checkbox-item">
              <input type="checkbox" name="pda_hyperactive_precordium" checked={formData.pda_hyperactive_precordium || false} onChange={handleChange}/>
              Hyperactive precordium
            </label>

            <label className="checkbox-item">
              <input type="checkbox" name="pda_bounding_pulse" checked={formData.pda_bounding_pulse || false} onChange={handleChange}/>
              Bounding pulse
            </label>

            <label className="checkbox-item">
              <input type="checkbox" name="pda_wide_pp" checked={formData.pda_wide_pp || false} onChange={handleChange}/>
              Wide pulse pressure
            </label>

            <label className="checkbox-item">
              <input type="checkbox" name="pda_other_feature" checked={formData.pda_other_feature || false} onChange={handleChange}/>
              Others
            </label>

          </div>

          {formData.pda_other_feature && (
            <div className="form-group">
              <label>Specify Others <span className="required">*</span></label>

              <input
                name="pda_other_feature_text"
                value={formData.pda_other_feature_text || ""}
                onChange={handleChange}
                onBlur={handleBlur}
              />

              {errors.pda_other_feature_text && (
                <div className="error-text">{errors.pda_other_feature_text}</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------------- ECHO ---------------- */}
      {formData.pda_echo && (
        <>
          <div className="adverse-title">120. If 'Echo'</div>

          <div className="form-row">

            <div className="form-group">
              <label>TDD (mm)</label>
              <input
                type="number"
                name="pda_tdd"
                value={formData.pda_tdd || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                min="0"
                max="10"
              />
              {errors.pda_tdd && <div className="error-text">{errors.pda_tdd}</div>}
            </div>

            <div className="form-group">
              <label><span className="field-num">121.</span> Ductal peak velocity (m/sec)</label>
              <input
                type="number"
                step="0.1"
                name="pda_peak_velocity"
                value={formData.pda_peak_velocity || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                min="0"
                max="5"
              />
              {errors.pda_peak_velocity && <div className="error-text">{errors.pda_peak_velocity}</div>}
            </div>

          </div>

          {/* Pattern */}
          <div className="adverse-title">
            122. Pattern <span className="required">*</span>
          </div>

          <div className="pn-checkbox-grid">

            <label><input type="checkbox" name="pda_pattern_growing" checked={formData.pda_pattern_growing || false} onChange={handleChange}/> Growing</label>
            <label><input type="checkbox" name="pda_pattern_pulsatile" checked={formData.pda_pattern_pulsatile || false} onChange={handleChange}/> Pulsatile</label>
            <label><input type="checkbox" name="pda_pattern_none" checked={formData.pda_pattern_none || false} onChange={handleChange}/> Closing</label>

          </div>

          {errors.pda_pattern_group && (
            <div className="error-text">{errors.pda_pattern_group}</div>
          )}

          <div className="form-row">

            <div className="form-group">
              <label><span className="field-num">123.</span> Shunt across PDA <span className="required">*</span></label>
              <select
                name="pda_shunt"
                value={formData.pda_shunt || ""}
                onChange={handleChange}
                onBlur={handleBlur}
              >
                <option value="">-- Select --</option>
                <option value="L to R">L to R</option>
                <option value="Bidirectional">Bidirectional</option>
                <option value="R to L">R to L</option>
              </select>

              {errors.pda_shunt && (
                <div className="error-text">{errors.pda_shunt}</div>
              )}
            </div>

            <div className="form-group">
              <label><span className="field-num">124.</span> LA : Ao</label>
              <input
                type="number"
                step="0.1"
                name="pda_la_ao"
                value={formData.pda_la_ao || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                min="0"
                max="5"
              />
              {errors.pda_la_ao && <div className="error-text">{errors.pda_la_ao}</div>}
            </div>

          </div>

          <div className="form-row">

            <div className="form-group">
              <YesNoToggle label="125. Systemic steal" name="pda_systemic_steal" value={formData.pda_systemic_steal} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label><span className="field-num">126.</span> LPA doppler velocity (cm/s) <span className="field-hint">end-diastolic velocity</span></label>
              <input
                type="number"
                name="pda_lpa_velocity"
                value={formData.pda_lpa_velocity || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                min="0"
                max="300"
              />
              {errors.pda_lpa_velocity && <div className="error-text">{errors.pda_lpa_velocity}</div>}
            </div>

          </div>
        </>
      )}

      {/* ---------------- MEDICAL ---------------- */}
      <div className="form-group">
        <YesNoToggle label="127. Medical Rx" name="pda_medical_rx" value={formData.pda_medical_rx} onChange={handleCvChange} />
        {cvAutoFilled.pda_medical_rx && <span className="field-hint-auto-inline">from daily logs</span>}
      </div>

      {formData.pda_medical_rx === "Yes" && (
        <>
          <div className="adverse-title">
            128. Agent <span className="required">*</span>
          </div>

          <div className="pn-checkbox-grid">
            <label><input type="checkbox" name="pda_indo" checked={formData.pda_indo || false} onChange={handleChange}/> Indo</label>
            <label><input type="checkbox" name="pda_ibu" checked={formData.pda_ibu || false} onChange={handleChange}/> Ibu</label>
            <label><input type="checkbox" name="pda_pcm" checked={formData.pda_pcm || false} onChange={handleChange}/> PCM</label>
          </div>

          {errors.pda_medical_group && (
            <div className="error-text">{errors.pda_medical_group}</div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label><span className="field-num">129.</span> Courses</label>
              <select
                name="pda_courses"
                value={formData.pda_courses || ""}
                onChange={handleChange}
                onBlur={handleBlur}
              >
                <option value="">-- Select --</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
              {errors.pda_courses && <div className="error-text">{errors.pda_courses}</div>}
            </div>

            <div className="form-group">
              <label><span className="field-num">130.</span> Cumulative Dose (mg/kg)</label>
              <input
                type="number"
                step="0.1"
                name="pda_cumulative_dose"
                value={formData.pda_cumulative_dose || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                min="0"
                max="100"
              />
              {errors.pda_cumulative_dose && <div className="error-text">{errors.pda_cumulative_dose}</div>}
            </div>
          </div>
        </>
      )}

      {/* ---------------- INTERVENTION RX ---------------- */}
      <div className="form-group">
        <label><span className="field-num">131.</span> Intervention Rx</label>
        <select
          name="pda_intervention_rx"
          value={formData.pda_intervention_rx || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        >
          <option value="">-- Select --</option>
          <option value="Ligation">Ligation</option>
          <option value="Device closure">Device closure</option>
          <option value="None">None</option>
        </select>
        {errors.pda_intervention_rx && (
          <div className="error-text">{errors.pda_intervention_rx}</div>
        )}
      </div>

      <div className="form-row">

        {formData.pda_intervention_rx === "Ligation" && (
          <div className="form-group">
            <label>
              <span className="field-num">132.</span> If Ligation, Age (days) <span className="required">*</span>
            </label>

            <input
              type="number"
              name="pda_ligation_age"
              value={formData.pda_ligation_age || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              min="0"
              max="120"
            />

            {errors.pda_ligation_age && (
              <div className="error-text">{errors.pda_ligation_age}</div>
            )}
          </div>
        )}

        {formData.pda_intervention_rx === "Device closure" && (
          <div className="form-group">
            <label>
              <span className="field-num">133.</span> If Device closure, Age (days) <span className="required">*</span>
            </label>

            <input
              type="number"
              name="pda_device_closure_age"
              value={formData.pda_device_closure_age || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              min="0"
              max="120"
            />

            {errors.pda_device_closure_age && (
              <div className="error-text">{errors.pda_device_closure_age}</div>
            )}
          </div>
        )}

      </div>

    </>
  )}
</div></div>
  )}
</div>

<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "shock" ? null : "shock")}
  >
    <span><span className="sec-num sub">H5.3</span> Shock / Hypotension</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.shock || formData.hypotension)}`}>
        <span className="icon">
          {getStatusIcon(formData.shock || formData.hypotension)}
        </span>

        {getShockSummary()}
      </span>
     </div>
      <span className="arrow">{openSection === "shock" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "shock" && (
    <div className="card-body">

{cvPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({cvPrefill.log_days_count} day{cvPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchCvPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Cardiovascular", fetchCvPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(cvStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(cvStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

<div className="pn-adverse-card">

  <div className="form-row">

    {/* Shock */}
    <div className="form-group">
      <YesNoToggle label="134. Shock" name="shock" value={formData.shock} onChange={handleCvChange} onBlur={handleBlur} required />
      {cvAutoFilled.shock && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.shock && <div className="error-text">{errors.shock}</div>}
    </div>

    {/* Hypotension */}
    <div className="form-group">
      <YesNoToggle label="135. Hypotension" name="hypotension" value={formData.hypotension} onChange={handleChange} onBlur={handleBlur} required />
      {errors.hypotension && (
        <div className="error-text">{errors.hypotension}</div>
      )}
    </div>

  </div>

  {/* Hypotension Type */}
  {formData.hypotension === "Yes" && (
    <>
      <div className="adverse-title">
        If 'Hypotension', type <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="hypotension_systolic"
            checked={formData.hypotension_systolic || false}
            onChange={handleChange}
          />
          Systolic
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="hypotension_diastolic"
            checked={formData.hypotension_diastolic || false}
            onChange={handleChange}
          />
          Diastolic
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="hypotension_both"
            checked={formData.hypotension_both || false}
            onChange={handleChange}
          />
          Both
        </label>

      </div>

      {errors.hypotension_group && (
        <div className="error-text">{errors.hypotension_group}</div>
      )}
    </>
  )}

  {/* BP Values */}
  <div style={{ marginTop: "20px" }}>
    <div className="adverse-title">
      Record the lowest BP throughout the hospital stay
    </div>

    <div className="form-row">

      <div className="form-group">
        <label><span className="field-num">136.</span> SBP (mmHg)</label>
        <input
          type="number"
          name="sbp"
          value={formData.sbp || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="120"
        />
        {errors.sbp && <div className="error-text">{errors.sbp}</div>}
      </div>

      <div className="form-group">
        <label><span className="field-num">137.</span> DBP (mmHg)</label>
        <input
          type="number"
          name="dbp"
          value={formData.dbp || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="100"
        />
        {errors.dbp && <div className="error-text">{errors.dbp}</div>}
      </div>

      <div className="form-group">
        <label><span className="field-num">138.</span> MAP (mmHg)</label>
        <input
          type="number"
          name="map"
          value={formData.map || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="120"
        />
        {errors.map && <div className="error-text">{errors.map}</div>}
      </div>

    </div>
  </div>

  {/* Fluid Bolus */}
  <div className="form-row">

    <div className="form-group">
      <YesNoToggle label="139. Required fluid bolus" name="fluid_bolus" value={formData.fluid_bolus} onChange={handleCvChange} onBlur={handleBlur} required />
      {cvAutoFilled.fluid_bolus && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.fluid_bolus && (
        <div className="error-text">{errors.fluid_bolus}</div>
      )}
    </div>

    {formData.fluid_bolus === "Yes" && (
      <div className="form-group">
        <label><span className="field-num">140.</span> No. of courses <span className="required">*</span></label>
        <input
          type="number"
          name="fluid_bolus_number"
          value={formData.fluid_bolus_number || ""}
          onChange={handleCvChange}
          onBlur={handleBlur}
          min="0"
          max="10"
        />
        {cvAutoFilled.fluid_bolus_number && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.fluid_bolus_number && (
          <div className="error-text">{errors.fluid_bolus_number}</div>
        )}
      </div>
    )}

  </div>

  {/* Vasoactives */}
  <div className="form-group">
    <YesNoToggle label="141. Vasoactives required" name="inotropes" value={formData.inotropes} onChange={handleCvChange} onBlur={handleBlur} required />
    {cvAutoFilled.inotropes && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.inotropes && (
      <div className="error-text">{errors.inotropes}</div>
    )}
  </div>

  {formData.inotropes === "Yes" && (
    <>
      <div className="adverse-title">
        142. If yes (select all that apply) <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label><input type="checkbox" name="inotrope_dopa" checked={formData.inotrope_dopa || false} onChange={handleCvChange}/> Dopa{cvAutoFilled.inotrope_dopa && <span className="field-hint-auto-inline">from daily logs</span>}</label>
        <label><input type="checkbox" name="inotrope_dobu" checked={formData.inotrope_dobu || false} onChange={handleCvChange}/> Dobu{cvAutoFilled.inotrope_dobu && <span className="field-hint-auto-inline">from daily logs</span>}</label>
        <label><input type="checkbox" name="inotrope_adr" checked={formData.inotrope_adr || false} onChange={handleCvChange}/> Adr{cvAutoFilled.inotrope_adr && <span className="field-hint-auto-inline">from daily logs</span>}</label>
        <label><input type="checkbox" name="inotrope_nadr" checked={formData.inotrope_nadr || false} onChange={handleCvChange}/> NAdr{cvAutoFilled.inotrope_nadr && <span className="field-hint-auto-inline">from daily logs</span>}</label>
        <label><input type="checkbox" name="inotrope_milri" checked={formData.inotrope_milri || false} onChange={handleCvChange}/> Milri{cvAutoFilled.inotrope_milri && <span className="field-hint-auto-inline">from daily logs</span>}</label>
        <label><input type="checkbox" name="inotrope_vaso" checked={formData.inotrope_vaso || false} onChange={handleCvChange}/> Vaso{cvAutoFilled.inotrope_vaso && <span className="field-hint-auto-inline">from daily logs</span>}</label>

      </div>

      {errors.inotrope_group && (
        <div className="error-text">{errors.inotrope_group}</div>
      )}

      <div style={{ marginTop: "20px" }}>
        <div className="form-row">

          <div className="form-group">
            <label><span className="field-num">143.</span> Duration (days) <span className="required">*</span></label>
            <input
              type="number"
              name="inotrope_duration"
              value={formData.inotrope_duration || ""}
              onChange={handleCvChange}
              onBlur={handleBlur}
              min="0"
              max="60"
            />
            {cvAutoFilled.inotrope_duration && <span className="field-hint-auto-inline">from daily logs</span>}
            {errors.inotrope_duration && (
              <div className="error-text">{errors.inotrope_duration}</div>
            )}
          </div>

          <div className="form-group">
            <label><span className="field-num">144.</span> VIS score <span className="required">*</span></label>
            <input
              type="number"
              name="vis_score"
              value={formData.vis_score || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              min="0"
              max="100"
            />
            {errors.vis_score && (
              <div className="error-text">{errors.vis_score}</div>
            )}
          </div>

        </div>
      </div>
    </>
  )}

  {/* Hydrocortisone */}
  <div className="form-group">
    <YesNoToggle label="145. Hydrocortisone for BP" name="hydrocortisone_bp" value={formData.hydrocortisone_bp} onChange={handleChange} onBlur={handleBlur} required />
    {errors.hydrocortisone_bp && (
      <div className="error-text">{errors.hydrocortisone_bp}</div>
    )}
  </div>

  {formData.hydrocortisone_bp === "Yes" && (
    <>
      <div className="adverse-title">
        146. If 'Yes', timing <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label><input type="checkbox" name="hc_first_drug" checked={formData.hc_first_drug || false} onChange={handleChange}/> Started as first drug</label>
        <label><input type="checkbox" name="hc_after_first" checked={formData.hc_after_first || false} onChange={handleChange}/> After first vasoactive</label>
        <label><input type="checkbox" name="hc_after_second" checked={formData.hc_after_second || false} onChange={handleChange}/> After second vasoactive</label>

      </div>

      {errors.hc_group && (
        <div className="error-text">{errors.hc_group}</div>
      )}
    </>
  )}

</div>

</div>
  )}
</div>
</div>

{/* ================= HEMATOLOGY ================= */}
<div id="cat-heme" className={`form-section soft-blue${activeCategory === "heme" ? "" : " cat-hidden"}`}>

  <h3><Droplets size={17} className="sec-icon" /> <span className="sec-num">H6</span> HEMATOLOGY</h3>
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "jaundice" ? null : "jaundice")}
  >
    <span><span className="sec-num sub">H6.1</span> Jaundice / Hyperbilirubinemia</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.jaundice_type)}`}>
        <span className="icon">{getStatusIcon(formData.jaundice_type)}</span>
        {getJaundiceSummary()}
      </span>
</div>
      <span className="arrow">
        {openSection === "jaundice" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "jaundice" && (
    <div className="card-body">

{hemePrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({hemePrefill.log_days_count} day{hemePrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchHemePrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Hematology", fetchHemePrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(hemeStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(hemeStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

    {/* Jaundice */}

     <h4>Jaundice / Hyperbilirubinemia</h4>

{/* ---------------- REQUIRES INTERVENTION ---------------- */}
<div className="form-group">
  <YesNoToggle label="147. Jaundice requiring intervention" name="jaundice_intervention" value={formData.jaundice_intervention} onChange={handleHemeChange} onBlur={handleBlur} required />
  {hemeAutoFilled.jaundice_intervention && <span className="field-hint-auto-inline">from daily logs</span>}
  {errors.jaundice_intervention && (
    <div className="error-text">{errors.jaundice_intervention}</div>
  )}
</div>

{formData.jaundice_intervention === "Yes" && (
<>
{/* ---------------- TYPE ---------------- */}
<div className="form-group">
  <label><span className="field-num">148.</span> Type <span className="required">*</span></label>
  <select
    name="jaundice_type"
    value={formData.jaundice_type || ""}
    onChange={handleChange}
    onBlur={handleBlur}
  >
    <option value="">-- Select --</option>
    <option value="Conjugated">Conjugated</option>
    <option value="Unconjugated">Unconjugated</option>
  </select>
  {errors.jaundice_type && (
    <div className="error-text">{errors.jaundice_type}</div>
  )}
</div>

{/* ---------------- UNCONJUGATED ---------------- */}
{formData.jaundice_type === "Unconjugated" && (
  <>
    <div className="form-row">

      <div className="form-group">
        <label><span className="field-num">149.</span> Onset date <span className="required">*</span></label>
        <input
          type="date"
          name="jaundice_onset"
          value={formData.jaundice_onset || ""}
          onChange={handleHemeChange}
          onBlur={handleBlur}
        />
        {hemeAutoFilled.jaundice_onset && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.jaundice_onset && (
          <div className="error-text">{errors.jaundice_onset}</div>
        )}
      </div>

      <div className="form-group">
        <label><span className="field-num">150.</span> Passive date</label>
        <input
          type="date"
          name="jaundice_passive"
          value={formData.jaundice_passive || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>

    </div>

    <div className="form-row">

      <div className="form-group">
        <label><span className="field-num">151.</span> Peak TSB (mg/dL) <span className="required">*</span></label>
        <input
          type="number"
          name="peak_tsb"
          value={formData.peak_tsb || ""}
          onChange={handleHemeChange}
          onBlur={handleBlur}
          min="0"
          max="50"
        />
        {hemeAutoFilled.peak_tsb && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.peak_tsb && (
          <div className="error-text">{errors.peak_tsb}</div>
        )}
      </div>

      <div className="form-group">
        <YesNoToggle label="152. Phototherapy" name="phototherapy" value={formData.phototherapy} onChange={handleHemeChange} onBlur={handleBlur} required />
        {hemeAutoFilled.phototherapy && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.phototherapy && (
          <div className="error-text">{errors.phototherapy}</div>
        )}
      </div>

    </div>

    <div className="form-row">

      <div className="form-group">
        <YesNoToggle label="153. BIND" name="bind" value={formData.bind} onChange={handleChange} onBlur={handleBlur} required />
        {errors.bind && <div className="error-text">{errors.bind}</div>}
      </div>

      <div className="form-group">
        {/* stored field name kept as "dvet" for backward compatibility with
            already-saved records — CRF #154 label is "Exchange transfusion" */}
        <YesNoToggle label="154. Exchange transfusion" name="dvet" value={formData.dvet} onChange={handleHemeChange} onBlur={handleBlur} required />
        {hemeAutoFilled.dvet && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.dvet && <div className="error-text">{errors.dvet}</div>}
      </div>

    </div>

    {formData.dvet === "Yes" && (
      <div className="form-group">
        <label><span className="field-num">155.</span> Number of exchange transfusion <span className="required">*</span></label>
        <input
          type="number"
          name="dvet_number"
          value={formData.dvet_number || ""}
          onChange={handleHemeChange}
          onBlur={handleBlur}
          min="1"
          max="10"
        />
        {hemeAutoFilled.dvet_number && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.dvet_number && (
          <div className="error-text">{errors.dvet_number}</div>
        )}
      </div>
    )}

    <div className="form-group">
      <YesNoToggle label="156. IVIG" name="ivig" value={formData.ivig} onChange={handleChange} onBlur={handleBlur} required />
      {errors.ivig && <div className="error-text">{errors.ivig}</div>}
    </div>

    <div className="form-group">
    <label><span className="field-num">157.</span> Etiology <span className="required">*</span></label>

    <select
      name="jaundice_etiology"
      value={formData.jaundice_etiology || ""}
      onChange={handleChange}
      onBlur={handleBlur}
    >
      <option value="">-- Select --</option>
      <option value="Exaggeration">Exaggeration</option>
      <option value="Dehydration">Dehydration</option>
      <option value="Isoimmune">Isoimmune</option>
      <option value="Others">Others</option>
    </select>

    {errors.jaundice_etiology && (
      <div className="error-text">{errors.jaundice_etiology}</div>
    )}

    {formData.jaundice_etiology === "Others" && (
      <div style={{ marginTop: "10px" }}>
        <label>Specify Other <span className="required">*</span></label>
        <input
          name="jaundice_etiology_other"
          value={formData.jaundice_etiology_other || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.jaundice_etiology_other && (
          <div className="error-text">{errors.jaundice_etiology_other}</div>
        )}
      </div>
    )}
  </div>
  </>
)}

{/* ---------------- CONJUGATED ---------------- */}
{formData.jaundice_type === "Conjugated" && (
  <div className="form-group">
    <label><span className="field-num">158.</span> If conjugated, Etiology <span className="required">*</span></label>

    <select
      name="jaundice_etiology"
      value={formData.jaundice_etiology || ""}
      onChange={handleChange}
      onBlur={handleBlur}
    >
      <option value="">-- Select --</option>
      <option value="Hepatitis">Hepatitis</option>
      <option value="Biliary atresia">Biliary atresia</option>
      <option value="Cholestasis">Cholestasis</option>
      <option value="PNALD">PNALD</option>
      <option value="Others">Others</option>
    </select>

    {errors.jaundice_etiology && (
      <div className="error-text">{errors.jaundice_etiology}</div>
    )}

    {formData.jaundice_etiology === "Others" && (
      <div style={{ marginTop: "10px" }}>
        <label>Specify Other <span className="required">*</span></label>
        <input
          name="jaundice_etiology_other"
          value={formData.jaundice_etiology_other || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.jaundice_etiology_other && (
          <div className="error-text">{errors.jaundice_etiology_other}</div>
        )}
      </div>
    )}
  </div>
)}
</>
)}
</div>
  )}
</div>
{/* ---------------- ANEMIA (continues H6.1 numbering, #159-163) ---------------- */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "anemia" ? null : "anemia")}
  >
    <span>Anemia <span style={{fontSize:11, fontWeight:400, color:"#9ca3af"}}>(H6.1 continued)</span></span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.anemia)}`}>
        <span className="icon">{getStatusIcon(formData.anemia)}</span>
        {getAnemiaSummary()}
      </span>
</div>
      <span className="arrow">
        {openSection === "anemia" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "anemia" && (
    <div className="card-body">
<div className="form-group">
  <YesNoToggle label="159. Anemia" name="anemia" value={formData.anemia} onChange={handleChange} onBlur={handleBlur} required />
  {errors.anemia && <div className="error-text">{errors.anemia}</div>}
</div>

{formData.anemia === "Yes" && (
  <>
    <div className="form-row">

      <div className="form-group">
        <label><span className="field-num">160.</span> Age at onset (days) <span className="required">*</span></label>
        <input
          type="number"
          name="anemia_onset"
          value={formData.anemia_onset || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="365"
        />
        {errors.anemia_onset && (
          <div className="error-text">{errors.anemia_onset}</div>
        )}
      </div>

      <div className="form-group">
        <label><span className="field-num">161.</span> Lowest Hb / Hct <span className="required">*</span></label>
        <input
          type="number"
          name="lowest_hb"
          value={formData.lowest_hb || ""}
          onChange={handleHemeChange}
          onBlur={handleBlur}
          min="0"
          max="25"
        />
        {hemeAutoFilled.lowest_hb && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.lowest_hb && (
          <div className="error-text">{errors.lowest_hb}</div>
        )}
      </div>

    </div>

    <div className="form-group">
      <label><span className="field-num">162.</span> Etiology <span className="required">*</span></label>
      <select
        name="anemia_etiology"
        value={formData.anemia_etiology || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option>Isoimmune</option>
        <option>G6PD</option>
        <option>FMH</option>
        <option>Blood loss</option>
        <option>Sampling</option>
        <option>Sepsis</option>
        <option>Physiologic</option>
        <option>Other</option>
      </select>
      {errors.anemia_etiology && (
        <div className="error-text">{errors.anemia_etiology}</div>
      )}
    </div>

    {formData.anemia_etiology === "Other" && (
      <div className="form-group">
        <label>Specify Other <span className="required">*</span></label>
        <input
          name="anemia_etiology_other"
          value={formData.anemia_etiology_other || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.anemia_etiology_other && (
          <div className="error-text">{errors.anemia_etiology_other}</div>
        )}
      </div>
    )}

    <div className="form-group">
      <label><span className="field-num">163.</span> Symptoms <span className="required">*</span></label>
      <select
        name="anemia_symptoms"
        value={formData.anemia_symptoms || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="CHF">CHF</option>
        <option value="Asymptomatic">Asymptomatic</option>
        <option value="Others">Others</option>
      </select>
      {errors.anemia_symptoms && (
        <div className="error-text">{errors.anemia_symptoms}</div>
      )}
      {formData.anemia_symptoms === "Others" && (
        <div style={{ marginTop: "10px" }}>
          <label>Specify Other <span className="required">*</span></label>
          <input
            name="anemia_symptoms_other"
            value={formData.anemia_symptoms_other || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          />
        </div>
      )}
    </div>
  </>
)}

    </div>
  )}
</div>

    {/* Transfusions */}
    <div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "transfusion" ? null : "transfusion")}
  >
    <span><span className="sec-num sub">H6.2</span> Transfusions</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(summary)}`}>
  <span className="icon">{getStatusIcon(summary)}</span>
  {summary}
</span>
</div>
      <span className="arrow">
        {openSection === "transfusion" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "transfusion" && (
    <div className="card-body">

{hemePrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({hemePrefill.log_days_count} day{hemePrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchHemePrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Hematology", fetchHemePrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(hemeStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(hemeStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

     <h4>Transfusions</h4>

{/* ---------------- PRBC ---------------- */}
<div className="form-group">
  <YesNoToggle label="164. PRBC" name="prbc" value={formData.prbc} onChange={handleHemeChange} onBlur={handleBlur} required />
  {hemeAutoFilled.prbc && <span className="field-hint-auto-inline">from daily logs</span>}
  {errors.prbc && <div className="error-text">{errors.prbc}</div>}
</div>

{formData.prbc === "Yes" && (
  <>
    <div className="form-row">

      <div className="form-group">
        <label><span className="field-num">165.</span> Number of Transfusions <span className="required">*</span></label>
        <input
          type="number"
          name="prbc_number"
          value={formData.prbc_number || ""}
          onChange={handleHemeChange}
          onBlur={handleBlur}
          min="1"
          max="50"
        />
        {hemeAutoFilled.prbc_number && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.prbc_number && (
          <div className="error-text">{errors.prbc_number}</div>
        )}
      </div>

      <div className="form-group">
        <label><span className="field-num">166.</span> If PRBC, Cumulative volume (ml/kg) <span className="required">*</span></label>
        <input
          type="number"
          name="prbc_volume"
          value={formData.prbc_volume || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="500"
        />
        {errors.prbc_volume && (
          <div className="error-text">{errors.prbc_volume}</div>
        )}
      </div>

    </div>

    <div className="form-row">

      <div className="form-group">
        <YesNoToggle label="CMV screened (site)" name="cmv_screened" value={formData.cmv_screened} onChange={handleChange} onBlur={handleBlur} />
        {errors.cmv_screened && (
          <div className="error-text">{errors.cmv_screened}</div>
        )}
      </div>

    </div>
  </>
)}

{/* ---------------- PLATELETS ---------------- */}
<div className="form-group">
  <YesNoToggle label="167. Platelets" name="platelets" value={formData.platelets} onChange={handleHemeChange} onBlur={handleBlur} required />
  {hemeAutoFilled.platelets && <span className="field-hint-auto-inline">from daily logs</span>}
  {errors.platelets && (
    <div className="error-text">{errors.platelets}</div>
  )}
</div>

{formData.platelets === "Yes" && (
  <div className="form-group">
    <label><span className="field-num">168.</span> Number of transfusions <span className="required">*</span></label>
    <input
      type="number"
      name="platelet_number"
      value={formData.platelet_number || ""}
      onChange={handleHemeChange}
      onBlur={handleBlur}
      min="1"
      max="50"
    />
    {hemeAutoFilled.platelet_number && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.platelet_number && (
      <div className="error-text">{errors.platelet_number}</div>
    )}
  </div>
)}

{/* ---------------- FFP / CRYO ---------------- */}
<div className="form-group">
  <YesNoToggle label="169. FFP / Cryo" name="ffp_cryo" value={formData.ffp_cryo} onChange={handleHemeChange} onBlur={handleBlur} required />
  {hemeAutoFilled.ffp_cryo && <span className="field-hint-auto-inline">from daily logs</span>}
  {errors.ffp_cryo && (
    <div className="error-text">{errors.ffp_cryo}</div>
  )}
</div>

{formData.ffp_cryo === "Yes" && (
  <div className="form-group">
    <label><span className="field-num">170.</span> Number of transfusions <span className="required">*</span></label>
    <input
      type="number"
      name="ffp_number"
      value={formData.ffp_number || ""}
      onChange={handleHemeChange}
      onBlur={handleBlur}
      min="1"
      max="50"
    />
    {hemeAutoFilled.ffp_number && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.ffp_number && (
      <div className="error-text">{errors.ffp_number}</div>
    )}
  </div>
)}

{/* ---------------- LEUKOREDUCED / IRRADIATED ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="171. Leukoreduced" name="leukoreduced" value={formData.leukoreduced} onChange={handleChange} onBlur={handleBlur} required />
    {errors.leukoreduced && (
      <div className="error-text">{errors.leukoreduced}</div>
    )}
  </div>

  <div className="form-group">
    <YesNoToggle label="172. Irradiated" name="irradiated" value={formData.irradiated} onChange={handleChange} onBlur={handleBlur} required />
    {errors.irradiated && (
      <div className="error-text">{errors.irradiated}</div>
    )}
  </div>

</div>
  </div>


  )}
</div></div>


{/* ================= RENAL ================= */}
<div id="cat-renal" className={`form-section soft-blue${activeCategory === "renal" ? "" : " cat-hidden"}`}>

<h3><Droplets size={17} className="sec-icon" /> <span className="sec-num">H7</span> RENAL</h3>
{renalPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({renalPrefill.log_days_count} day{renalPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    Oliguria has no daily-log source and always needs manual entry.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchRenalPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button
      type="button"
      className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Renal", fetchRenalPrefill)}
    >
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(renalStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(renalStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "aki" ? null : "aki")}
  >
    <span><span className="sec-num sub">H7.1</span> Acute Kidney Injury (AKI)</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.aki)}`}>
        <span className="icon">{getStatusIcon(formData.aki)}</span>
        {getAKISummary()}
      </span>
</div>
      <span className="arrow">
        {openSection === "aki" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "aki" && (
    <div className="card-body">
<h4>Acute Kidney Injury (AKI)</h4>

{/* ---------------- AKI ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="173. AKI" name="aki" value={formData.aki} onChange={handleRenalChange} onBlur={handleBlur} required />
    {renalAutoFilled.aki && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.aki && <div className="error-text">{errors.aki}</div>}
  </div>

  {formData.aki === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">174.</span> Date <span className="required">*</span></label>
      <input
        type="date"
        name="aki_date"
        value={formData.aki_date || ""}
        onChange={handleRenalChange}
        onBlur={handleBlur}
      />
      {renalAutoFilled.aki_date && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.aki_date && (
        <div className="error-text">{errors.aki_date}</div>
      )}
    </div>
  )}

</div>

{formData.aki === "Yes" && (
  <>

    {/* ---------------- KDIGO STAGE ---------------- */}
    <div className="pn-adverse-card">

      <div className="adverse-title">
        175. Stage (KDIGO) <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="aki_stage1"
            checked={formData.aki_stage1 || false}
            onChange={handleRenalChange}
          />
          Stage 1
          {renalAutoFilled.aki_stage1 && <span className="field-hint-auto-inline">from daily logs</span>}
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="aki_stage2"
            checked={formData.aki_stage2 || false}
            onChange={handleRenalChange}
          />
          Stage 2
          {renalAutoFilled.aki_stage2 && <span className="field-hint-auto-inline">from daily logs</span>}
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="aki_stage3"
            checked={formData.aki_stage3 || false}
            onChange={handleRenalChange}
          />
          Stage 3
          {renalAutoFilled.aki_stage3 && <span className="field-hint-auto-inline">from daily logs</span>}
        </label>

      </div>

      {/* GROUP ERROR */}
      {errors.aki_stage_group && (
        <div className="error-text">{errors.aki_stage_group}</div>
      )}

    </div>

    {/* ---------------- CREATININE + OLIGURIA ---------------- */}
    <div style={{ marginTop: "20px" }}>
      <div className="form-row">

        <div className="form-group">
          <label><span className="field-num">176.</span> Peak Creatinine (mg/dL) <span className="required">*</span></label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="20"
            name="aki_peak_creatinine"
            value={formData.aki_peak_creatinine || ""}
            onChange={handleRenalChange}
            onBlur={handleBlur}
          />
          {renalAutoFilled.aki_peak_creatinine && <span className="field-hint-auto-inline">from daily logs</span>}
          {errors.aki_peak_creatinine && (
            <div className="error-text">{errors.aki_peak_creatinine}</div>
          )}
        </div>

        <div className="form-group">
          {/* No day-log source for oliguria — always manual, see the
              renal-prefill endpoint docstring for why. */}
          <YesNoToggle label="177. Oliguria" name="aki_oliguria" value={formData.aki_oliguria} onChange={handleChange} onBlur={handleBlur} required />
          {errors.aki_oliguria && (
            <div className="error-text">{errors.aki_oliguria}</div>
          )}
        </div>

      </div>
    </div>

    {/* ---------------- DIALYSIS ---------------- */}
    <div className="form-row">

      <div className="form-group">
        <YesNoToggle label="178. Dialysis / CRRT" name="aki_dialysis" value={formData.aki_dialysis} onChange={handleRenalChange} onBlur={handleBlur} required />
        {renalAutoFilled.aki_dialysis && <span className="field-hint-auto-inline">from daily logs</span>}
        {errors.aki_dialysis && (
          <div className="error-text">{errors.aki_dialysis}</div>
        )}
      </div>

    </div>

  </>
)}

</div>
 
  )}
</div></div>
{/* ================= OPHTHALMOLOGY ================= */}
<div id="cat-eye" className={`form-section soft-blue${activeCategory === "eye" ? "" : " cat-hidden"}`}>

<h3><Eye size={17} className="sec-icon" /> <span className="sec-num">H8</span> OPHTHALMOLOGY</h3>

<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "rop" ? null : "rop")}
  >
    <span><span className="sec-num sub">H8.1</span> Retinopathy of Prematurity (ROP)</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.rop || formData.rop_screened)}`}>
        <span className="icon">
          {getStatusIcon(formData.rop || formData.rop_screened)}
        </span>

        {getROPSummary()}
      </span>
    </div>
    <span className="arrow">
      {openSection === "rop" ? "▲" : "▼"}
    </span>
  </div>

  {openSection === "rop" && (
    <div className="card-body">

{ropThermoPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({ropThermoPrefill.log_days_count} day{ropThermoPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchRopThermoPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("ROP/Thermoregulation", fetchRopThermoPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(ropThermoStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(ropThermoStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

      {/* ---------------- SCREENING (179-181) ---------------- */}
      <div className="form-group">
        <YesNoToggle label="179. Screened" name="rop_screened" value={formData.rop_screened} onChange={handleRopThermoChange} onBlur={handleBlur} required />
        {ropThermoAutoFilled.rop_screened && <span className="field-hint-auto-inline">from daily logs</span>}
        {touched.rop_screened && errors.rop_screened && <div className="error-text">{errors.rop_screened}</div>}
      </div>

      {formData.rop_screened === "Yes" && (
        <div className="form-row">
          <div className="form-group">
            <label><span className="field-num">180.</span> Method<span className="required">*</span></label>
            <input
              name="rop_method"
              value={formData.rop_method || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="e.g. Indirect ophthalmoscopy, RetCam"
            />
            {touched.rop_method && errors.rop_method && <div className="error-text">{errors.rop_method}</div>}
          </div>

          <div className="form-group">
            <label><span className="field-num">181.</span> Date of First Screening<span className="required">*</span></label>
            <input
              type="date"
              name="rop_first_screen_date"
              value={formData.rop_first_screen_date || ""}
              onChange={handleRopThermoChange}
              onBlur={handleBlur}
            />
            {ropThermoAutoFilled.rop_first_screen_date && <span className="field-hint-auto-inline">from daily logs</span>}
            {touched.rop_first_screen_date && errors.rop_first_screen_date && <div className="error-text">{errors.rop_first_screen_date}</div>}
          </div>
        </div>
      )}

      {/* ---------------- DIAGNOSIS (182-184) ---------------- */}
      <div className="form-group">
        <YesNoToggle label="182. ROP Diagnosed" name="rop" value={formData.rop} onChange={handleRopThermoChange} onBlur={handleBlur} required />
        {ropThermoAutoFilled.rop && <span className="field-hint-auto-inline">from daily logs</span>}
        {touched.rop && errors.rop && <div className="error-text">{errors.rop}</div>}
      </div>

      {formData.rop === "Yes" && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label><span className="field-num">183.</span> Date of Diagnosis<span className="required">*</span></label>
              <input
                type="date"
                name="rop_diagnosis_date"
                value={formData.rop_diagnosis_date || ""}
                onChange={handleRopThermoChange}
                onBlur={handleBlur}
              />
              {ropThermoAutoFilled.rop_diagnosis_date && <span className="field-hint-auto-inline">from daily logs</span>}
              {touched.rop_diagnosis_date && errors.rop_diagnosis_date && <div className="error-text">{errors.rop_diagnosis_date}</div>}
            </div>

            <div className="form-group">
              <label><span className="field-num">184.</span> Side<span className="required">*</span></label>
              <select name="rop_side" value={formData.rop_side || ""} onChange={handleChange} onBlur={handleBlur}>
                <option value="">-- Select --</option>
                <option value="Right">Right</option>
                <option value="Left">Left</option>
                <option value="Bilateral">Bilateral</option>
              </select>
              {touched.rop_side && errors.rop_side && <div className="error-text">{errors.rop_side}</div>}
            </div>
          </div>

          {/* ---------------- RIGHT EYE (185-190) ---------------- */}
          {(formData.rop_side === "Right" || formData.rop_side === "Bilateral") && (
            <div className="pn-adverse-card">
              <div className="adverse-title">Right Eye</div>

              <div className="form-row">
                <div className="form-group">
                  <label><span className="field-num">185.</span> Max Stage<span className="required">*</span></label>
                  <select name="rop_stage_right" value={formData.rop_stage_right || ""} onChange={handleChange} onBlur={handleBlur}>
                    <option value="">-- Select --</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                  {touched.rop_stage_right && errors.rop_stage_right && <div className="error-text">{errors.rop_stage_right}</div>}
                </div>

                <div className="form-group">
                  <YesNoToggle label="186. Plus" name="rop_plus_right" value={formData.rop_plus_right} onChange={handleChange} onBlur={handleBlur} required />
                  {touched.rop_plus_right && errors.rop_plus_right && <div className="error-text">{errors.rop_plus_right}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">187.</span> Zone<span className="required">*</span></label>
                  <select name="rop_zone_right" value={formData.rop_zone_right || ""} onChange={handleChange} onBlur={handleBlur}>
                    <option value="">-- Select --</option>
                    <option value="I">I</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                  </select>
                  {touched.rop_zone_right && errors.rop_zone_right && <div className="error-text">{errors.rop_zone_right}</div>}
                </div>
              </div>

              <div className="form-group">
                <YesNoToggle label="188. A-ROP (Aggressive ROP)" name="rop_arop_right" value={formData.rop_arop_right} onChange={handleChange} onBlur={handleBlur} required />
                {touched.rop_arop_right && errors.rop_arop_right && <div className="error-text">{errors.rop_arop_right}</div>}
              </div>

              <div className="form-group">
                <YesNoToggle label="189. Treatment" name="rop_treatment_right" value={formData.rop_treatment_right} onChange={handleChange} onBlur={handleBlur} required />
                {touched.rop_treatment_right && errors.rop_treatment_right && <div className="error-text">{errors.rop_treatment_right}</div>}
              </div>

              {formData.rop_treatment_right === "Yes" && (
                <div className="form-group">
                  <div className="adverse-title"><span className="field-num">190.</span> Type<span className="required">*</span></div>
                  <div className="pn-checkbox-grid">
                    <label className="checkbox-item"><input type="checkbox" name="rop_laser_right" checked={formData.rop_laser_right || false} onChange={handleChange}/> Laser</label>
                    <label className="checkbox-item"><input type="checkbox" name="rop_anti_vegf_right" checked={formData.rop_anti_vegf_right || false} onChange={handleChange}/> Anti-VEGF</label>
                    <label className="checkbox-item"><input type="checkbox" name="rop_vitrectomy_right" checked={formData.rop_vitrectomy_right || false} onChange={handleChange}/> Vitrectomy</label>
                    <label className="checkbox-item"><input type="checkbox" name="rop_other_right" checked={formData.rop_other_right || false} onChange={handleChange}/> Other</label>
                  </div>
                  {errors.rop_treatment_type_right_group && <div className="error-text">{errors.rop_treatment_type_right_group}</div>}

                  {formData.rop_other_right && (
                    <div className="form-group" style={{marginTop: 12}}>
                      <label>Specify Other<span className="required">*</span></label>
                      <input
                        name="rop_other_text_right"
                        value={formData.rop_other_text_right || ""}
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                      {touched.rop_other_text_right && errors.rop_other_text_right && <div className="error-text">{errors.rop_other_text_right}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---------------- LEFT EYE (191-196) ---------------- */}
          {(formData.rop_side === "Left" || formData.rop_side === "Bilateral") && (
            <div className="pn-adverse-card">
              <div className="adverse-title">Left Eye</div>

              <div className="form-row">
                <div className="form-group">
                  <label><span className="field-num">191.</span> Max Stage<span className="required">*</span></label>
                  <select name="rop_stage_left" value={formData.rop_stage_left || ""} onChange={handleChange} onBlur={handleBlur}>
                    <option value="">-- Select --</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                  {touched.rop_stage_left && errors.rop_stage_left && <div className="error-text">{errors.rop_stage_left}</div>}
                </div>

                <div className="form-group">
                  <YesNoToggle label="192. Plus" name="rop_plus_left" value={formData.rop_plus_left} onChange={handleChange} onBlur={handleBlur} required />
                  {touched.rop_plus_left && errors.rop_plus_left && <div className="error-text">{errors.rop_plus_left}</div>}
                </div>

                <div className="form-group">
                  <label><span className="field-num">193.</span> Zone<span className="required">*</span></label>
                  <select name="rop_zone_left" value={formData.rop_zone_left || ""} onChange={handleChange} onBlur={handleBlur}>
                    <option value="">-- Select --</option>
                    <option value="I">I</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                  </select>
                  {touched.rop_zone_left && errors.rop_zone_left && <div className="error-text">{errors.rop_zone_left}</div>}
                </div>
              </div>

              <div className="form-group">
                <YesNoToggle label="194. A-ROP (Aggressive ROP)" name="rop_arop_left" value={formData.rop_arop_left} onChange={handleChange} onBlur={handleBlur} required />
                {touched.rop_arop_left && errors.rop_arop_left && <div className="error-text">{errors.rop_arop_left}</div>}
              </div>

              <div className="form-group">
                <YesNoToggle label="195. Treatment" name="rop_treatment_left" value={formData.rop_treatment_left} onChange={handleChange} onBlur={handleBlur} required />
                {touched.rop_treatment_left && errors.rop_treatment_left && <div className="error-text">{errors.rop_treatment_left}</div>}
              </div>

              {formData.rop_treatment_left === "Yes" && (
                <div className="form-group">
                  <div className="adverse-title"><span className="field-num">196.</span> Type<span className="required">*</span></div>
                  <div className="pn-checkbox-grid">
                    <label className="checkbox-item"><input type="checkbox" name="rop_laser_left" checked={formData.rop_laser_left || false} onChange={handleChange}/> Laser</label>
                    <label className="checkbox-item"><input type="checkbox" name="rop_anti_vegf_left" checked={formData.rop_anti_vegf_left || false} onChange={handleChange}/> Anti-VEGF</label>
                    <label className="checkbox-item"><input type="checkbox" name="rop_vitrectomy_left" checked={formData.rop_vitrectomy_left || false} onChange={handleChange}/> Vitrectomy</label>
                    <label className="checkbox-item"><input type="checkbox" name="rop_other_left" checked={formData.rop_other_left || false} onChange={handleChange}/> Other</label>
                  </div>
                  {errors.rop_treatment_type_left_group && <div className="error-text">{errors.rop_treatment_type_left_group}</div>}

                  {formData.rop_other_left && (
                    <div className="form-group" style={{marginTop: 12}}>
                      <label>Specify Other<span className="required">*</span></label>
                      <input
                        name="rop_other_text_left"
                        value={formData.rop_other_text_left || ""}
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                      {touched.rop_other_text_left && errors.rop_other_text_left && <div className="error-text">{errors.rop_other_text_left}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

    </div>
  )}
</div>
</div>
{/* ================= THERMOREGULATION ================= */}
<div id="cat-thermo" className={`form-section soft-blue${activeCategory === "thermo" ? "" : " cat-hidden"}`}>

<h3><Thermometer size={17} className="sec-icon" /> <span className="sec-num">H9</span> THERMOREGULATION</h3>

<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "thermo" ? null : "thermo")}
  >
    <span><span className="sec-num sub">H9.1</span> Thermoregulation</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(
        (formData.hypothermia === "Yes" || formData.hyperthermia === "Yes")
          ? "Yes"
          : (formData.hypothermia || formData.hyperthermia) ? "No" : ""
      )}`}>
        <span className="icon">{getThermoSummary() === "Not filled" ? "—" : (getThermoSummary() === "No" ? "✖" : "✔")}</span>
        {getThermoSummary()}
      </span>
    </div>
    <span className="arrow">{openSection === "thermo" ? "▲" : "▼"}</span>
  </div>

  {openSection === "thermo" && (
    <div className="card-body">

{ropThermoPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({ropThermoPrefill.log_days_count} day{ropThermoPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchRopThermoPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button type="button" className="link-button link-button-danger"
      onClick={() => confirmForceRefill("ROP/Thermoregulation", fetchRopThermoPrefill)}>
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(ropThermoStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(ropThermoStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}

      {/* ---------------- HYPOTHERMIA (197-201) ---------------- */}
      <div className="form-group">
        <YesNoToggle label="197. Hypothermia (&lt;36.5°C)" name="hypothermia" value={formData.hypothermia} onChange={handleRopThermoChange} onBlur={handleBlur} required />
        {ropThermoAutoFilled.hypothermia && <span className="field-hint-auto-inline">from daily logs</span>}
        {touched.hypothermia && errors.hypothermia && <div className="error-text">{errors.hypothermia}</div>}
      </div>

      {formData.hypothermia === "Yes" && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label><span className="field-num">198.</span> Lowest Temp (°C)<span className="required">*</span></label>
              <input
                type="number" step="0.1" min="20" max="40"
                name="hypothermia_lowest_temp"
                value={formData.hypothermia_lowest_temp || ""}
                onChange={handleRopThermoChange} onBlur={handleBlur}
                placeholder="20–40"
              />
              {ropThermoAutoFilled.hypothermia_lowest_temp && <span className="field-hint-auto-inline">from daily logs</span>}
              {touched.hypothermia_lowest_temp && errors.hypothermia_lowest_temp && <div className="error-text">{errors.hypothermia_lowest_temp}</div>}
            </div>
          </div>

          <div className="form-group">
            <div className="adverse-title"><span className="field-num">199.</span> Severity<span className="required">*</span></div>
            <div className="pn-checkbox-grid">
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_mild" checked={formData.hypothermia_mild || false} onChange={handleChange}/> Mild</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_moderate" checked={formData.hypothermia_moderate || false} onChange={handleChange}/> Moderate</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_severe" checked={formData.hypothermia_severe || false} onChange={handleChange}/> Severe</label>
            </div>
            {errors.hypothermia_severity_group && <div className="error-text">{errors.hypothermia_severity_group}</div>}
          </div>

          <div className="form-group">
            <div className="adverse-title"><span className="field-num">200.</span> Location<span className="required">*</span></div>
            <div className="pn-checkbox-grid">
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_location_dr" checked={formData.hypothermia_location_dr || false} onChange={handleChange}/> DR</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_location_transport" checked={formData.hypothermia_location_transport || false} onChange={handleChange}/> Transport</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_location_nicu" checked={formData.hypothermia_location_nicu || false} onChange={handleChange}/> NICU</label>
            </div>
            {errors.hypothermia_location_group && <div className="error-text">{errors.hypothermia_location_group}</div>}
          </div>

          <div className="form-group">
            <div className="adverse-title"><span className="field-num">201.</span> Etiology<span className="required">*</span> <span style={{fontSize:11,fontWeight:500,color:"#94a3b8"}}>(select all that apply)</span></div>
            <div className="pn-checkbox-grid">
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_sepsis" checked={formData.hypothermia_sepsis || false} onChange={handleChange}/> Sepsis</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_environment" checked={formData.hypothermia_environment || false} onChange={handleChange}/> Environment</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_immaturity" checked={formData.hypothermia_immaturity || false} onChange={handleChange}/> Immaturity</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_ivh" checked={formData.hypothermia_ivh || false} onChange={handleChange}/> IVH</label>
              <label className="checkbox-item"><input type="checkbox" name="hypothermia_other" checked={formData.hypothermia_other || false} onChange={handleChange}/> Other</label>
            </div>
            {errors.hypothermia_etiology_group && <div className="error-text">{errors.hypothermia_etiology_group}</div>}

            {formData.hypothermia_other && (
              <div className="form-group" style={{marginTop: 12}}>
                <label>Specify Other<span className="required">*</span></label>
                <input
                  name="hypothermia_other_text"
                  value={formData.hypothermia_other_text || ""}
                  onChange={handleChange} onBlur={handleBlur}
                />
                {touched.hypothermia_other_text && errors.hypothermia_other_text && <div className="error-text">{errors.hypothermia_other_text}</div>}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------- HYPERTHERMIA (202-205) ---------------- */}
      <div className="form-group">
        <YesNoToggle label="202. Hyperthermia (&gt;37.5°C)" name="hyperthermia" value={formData.hyperthermia} onChange={handleRopThermoChange} onBlur={handleBlur} required />
        {ropThermoAutoFilled.hyperthermia && <span className="field-hint-auto-inline">from daily logs</span>}
        {touched.hyperthermia && errors.hyperthermia && <div className="error-text">{errors.hyperthermia}</div>}
      </div>

      {formData.hyperthermia === "Yes" && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label><span className="field-num">203.</span> Highest Temp (°C)<span className="required">*</span></label>
              <input
                type="number" step="0.1" min="35" max="42"
                name="hyperthermia_temp"
                value={formData.hyperthermia_temp || ""}
                onChange={handleRopThermoChange} onBlur={handleBlur}
                placeholder="35–42"
              />
              {ropThermoAutoFilled.hyperthermia_temp && <span className="field-hint-auto-inline">from daily logs</span>}
              {touched.hyperthermia_temp && errors.hyperthermia_temp && <div className="error-text">{errors.hyperthermia_temp}</div>}
            </div>
          </div>

          <div className="form-group">
            <div className="adverse-title"><span className="field-num">204.</span> Location<span className="required">*</span></div>
            <div className="pn-checkbox-grid">
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_location_dr" checked={formData.hyperthermia_location_dr || false} onChange={handleChange}/> DR</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_location_transport" checked={formData.hyperthermia_location_transport || false} onChange={handleChange}/> Transport</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_location_nicu" checked={formData.hyperthermia_location_nicu || false} onChange={handleChange}/> NICU</label>
            </div>
            {errors.hyperthermia_location_group && <div className="error-text">{errors.hyperthermia_location_group}</div>}
          </div>

          <div className="form-group">
            <div className="adverse-title"><span className="field-num">205.</span> Etiology<span className="required">*</span> <span style={{fontSize:11,fontWeight:500,color:"#94a3b8"}}>(select all that apply)</span></div>
            <div className="pn-checkbox-grid">
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_clothing" checked={formData.hyperthermia_clothing || false} onChange={handleChange}/> Excessive clothing</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_wrap" checked={formData.hyperthermia_wrap || false} onChange={handleChange}/> Plastic wrap</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_equipment" checked={formData.hyperthermia_equipment || false} onChange={handleChange}/> Equipment malfunction</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_probe" checked={formData.hyperthermia_probe || false} onChange={handleChange}/> Probe misplacement</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_environment" checked={formData.hyperthermia_environment || false} onChange={handleChange}/> Environment</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_sepsis" checked={formData.hyperthermia_sepsis || false} onChange={handleChange}/> Sepsis</label>
              <label className="checkbox-item"><input type="checkbox" name="hyperthermia_other" checked={formData.hyperthermia_other || false} onChange={handleChange}/> Other</label>
            </div>
            {errors.hyperthermia_etiology_group && <div className="error-text">{errors.hyperthermia_etiology_group}</div>}

            {formData.hyperthermia_other && (
              <div className="form-group" style={{marginTop: 12}}>
                <label>Specify Other<span className="required">*</span></label>
                <input
                  name="hyperthermia_other_text"
                  value={formData.hyperthermia_other_text || ""}
                  onChange={handleChange} onBlur={handleBlur}
                />
                {touched.hyperthermia_other_text && errors.hyperthermia_other_text && <div className="error-text">{errors.hyperthermia_other_text}</div>}
              </div>
            )}
          </div>
        </>
      )}

    </div>
  )}
</div>
</div>

{/* ================= VASCULAR ACCESS ================= */}
<div id="cat-vascular" className={`form-section soft-blue${activeCategory === "vascular" ? "" : " cat-hidden"}`}>

<h3><Syringe size={17} className="sec-icon" /> <span className="sec-num">H10</span> VASCULAR ACCESS</h3>
{vascularPrefill?.has_data && (
  <div className="field-hint field-hint-auto" style={{ marginBottom: "10px" }}>
    Daily logs available ({vascularPrefill.log_days_count} day{vascularPrefill.log_days_count === 1 ? "" : "s"} recorded).
    Empty fields below were filled from them automatically — verify before saving.
    {" "}
    <button type="button" className="link-button" onClick={() => fetchVascularAccessPrefill()}>
      Refill empty fields from daily logs
    </button>
    {" · "}
    <button
      type="button"
      className="link-button link-button-danger"
      onClick={() => confirmForceRefill("Vascular Access", fetchVascularAccessPrefill)}
    >
      Force refill (overwrite existing answers)
    </button>
  </div>
)}
{Object.keys(vascularStale).length > 0 && (
  <div className="field-hint field-hint-warning">
    ⚠ The daily logs now disagree with the saved answer for:{" "}
    {Object.keys(vascularStale).map((f) => PREFILL_FIELD_LABELS[f] || f).join(", ")}.
    This can happen if Form H was answered before the daily logs had this
    data. Use "Force refill" above if the daily logs are correct.
  </div>
)}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "central" ? null : "central")}
  >
    <span><span className="sec-num sub">H10.1</span> Central Lines</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(centralStatus)}`}>
  <span className="icon">{getStatusIcon(centralStatus)}</span>

  {centralSummary === "No" || centralSummary === "Not filled"
    ? centralSummary
    : centralSummary}
</span>
</div>
      <span className="arrow">
        {openSection === "central" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "central" && (
    <div className="card-body">

<h4>Central Lines</h4>

{/* ---------------- PICC ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="206. PICC" name="picc" value={formData.picc} onChange={handleVascularChange} onBlur={handleBlur} required />
    {vascularAutoFilled.picc && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.picc && <div className="error-text">{errors.picc}</div>}
  </div>

  {formData.picc === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">207.</span> Duration (days) <span className="required">*</span></label>
      <input
        type="number"
        min="0"
        max="60"
        name="picc_days"
        value={formData.picc_days || ""}
        onChange={handleVascularChange}
        onBlur={handleBlur}
      />
      {vascularAutoFilled.picc_days && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.picc_days && (
        <div className="error-text">{errors.picc_days}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- UVC ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="208. UVC" name="uvc" value={formData.uvc} onChange={handleVascularChange} onBlur={handleBlur} required />
    {vascularAutoFilled.uvc && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.uvc && <div className="error-text">{errors.uvc}</div>}
  </div>

  {formData.uvc === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">209.</span> Duration (days) <span className="required">*</span></label>
      <input
        type="number"
        min="0"
        max="60"
        name="uvc_days"
        value={formData.uvc_days || ""}
        onChange={handleVascularChange}
        onBlur={handleBlur}
      />
      {vascularAutoFilled.uvc_days && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.uvc_days && (
        <div className="error-text">{errors.uvc_days}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- UAC ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="210. UAC" name="uac" value={formData.uac} onChange={handleVascularChange} onBlur={handleBlur} required />
    {vascularAutoFilled.uac && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.uac && <div className="error-text">{errors.uac}</div>}
  </div>

  {formData.uac === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">211.</span> Duration (days) <span className="required">*</span></label>
      <input
        type="number"
        min="0"
        max="60"
        name="uac_days"
        value={formData.uac_days || ""}
        onChange={handleVascularChange}
        onBlur={handleBlur}
      />
      {vascularAutoFilled.uac_days && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.uac_days && (
        <div className="error-text">{errors.uac_days}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- COMPLICATIONS ---------------- */}
<div className="pn-adverse-card">

  <div className="adverse-title">
    <span className="field-num">212.</span> Complications <span className="required">*</span>
  </div>

  {vascularPrefill?.line_complication_any &&
    !(formData.line_comp_none || formData.line_comp_phlebitis || formData.line_comp_infection || formData.line_comp_thrombosis) && (
      <div className="field-hint field-hint-auto">
        Daily logs record a line complication on at least one day, but the type isn't captured there — please specify below.
      </div>
    )}

  <div className="pn-checkbox-grid">

    <label className="checkbox-item">
      <input
        type="checkbox"
        name="line_comp_none"
        checked={formData.line_comp_none || false}
        onChange={handleChange}
      />
      None
    </label>

    <label className="checkbox-item">
      <input
        type="checkbox"
        name="line_comp_phlebitis"
        checked={formData.line_comp_phlebitis || false}
        onChange={handleChange}
      />
      Phlebitis
    </label>

    <label className="checkbox-item">
      <input
        type="checkbox"
        name="line_comp_infection"
        checked={formData.line_comp_infection || false}
        onChange={handleChange}
      />
      Local site infection
    </label>

    {/* Legacy option retained so older saved records still display */}
    {formData.line_comp_thrombosis && (
      <label className="checkbox-item">
        <input
          type="checkbox"
          name="line_comp_thrombosis"
          checked={formData.line_comp_thrombosis || false}
          onChange={handleChange}
        />
        Thrombosis (legacy)
      </label>
    )}

  </div>

  {errors.line_comp_group && (
    <div className="error-text">{errors.line_comp_group}</div>
  )}

</div> </div>
  )}
</div>

{/* ================= Peripheral Access ================= */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "peripheral" ? null : "peripheral")}
  >
    <span><span className="sec-num sub">H10.2</span> Peripheral Access</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(peripheralStatus)}`}>
  <span className="icon">{getStatusIcon(peripheralStatus)}</span>

  {peripheralSummary === "No" || peripheralSummary === "Not filled"
    ? peripheralSummary
    : peripheralSummary}
</span>
</div>
      <span className="arrow">
        {openSection === "peripheral" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "peripheral" && (
    <div className="card-body">
<h4 style={{ marginTop: "25px" }}>Peripheral Access</h4>

<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="213. Peripheral venous" name="peripheral_venous" value={formData.peripheral_venous} onChange={handleVascularChange} onBlur={handleBlur} required />
    {vascularAutoFilled.peripheral_venous && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.peripheral_venous && (
      <div className="error-text">{errors.peripheral_venous}</div>
    )}
  </div>

  <div className="form-group">
    <YesNoToggle label="214. Peripheral arterial" name="peripheral_arterial" value={formData.peripheral_arterial} onChange={handleVascularChange} onBlur={handleBlur} required />
    {vascularAutoFilled.peripheral_arterial && <span className="field-hint-auto-inline">from daily logs</span>}
    {errors.peripheral_arterial && (
      <div className="error-text">{errors.peripheral_arterial}</div>
    )}
  </div>

</div>

{/* ---------------- ARTERIAL SITE ---------------- */}
{formData.peripheral_arterial === "Yes" && (
  <div className="pn-adverse-card">

    <div className="adverse-title">
      <span className="field-num">215.</span> Site <span className="required">*</span>
    </div>

    <div className="pn-checkbox-grid">

      <label className="checkbox-item">
        <input
          type="checkbox"
          name="arterial_radial"
          checked={formData.arterial_radial || false}
          onChange={handleChange}
        />
        Radial
      </label>

      <label className="checkbox-item">
        <input
          type="checkbox"
          name="arterial_posterior_tibial"
          checked={formData.arterial_posterior_tibial || false}
          onChange={handleChange}
        />
        Posterior tibial
      </label>

    </div>

    {errors.arterial_site_group && (
      <div className="error-text">{errors.arterial_site_group}</div>
    )}

  </div>
)}

{/* ---------------- EXTRAVASATION ---------------- */}
<div style={{ marginTop: "20px" }}>
  <div className="form-row">

    <div className="form-group">
      <YesNoToggle label="216. Extravasation injury" name="extravasation" value={formData.extravasation} onChange={handleVascularChange} onBlur={handleBlur} required />
      {vascularAutoFilled.extravasation && <span className="field-hint-auto-inline">from daily logs</span>}
      {errors.extravasation && (
        <div className="error-text">{errors.extravasation}</div>
      )}
    </div>

  </div>
</div>

</div>
  )}
</div>
</div>
{/* ================= INFECTION (H11) — CRF allows multiple episodes ================= */}
<div id="cat-infection" className={`form-section soft-blue${activeCategory === "infection" ? "" : " cat-hidden"}`}>

  <div className="infection-sec-head">
    <h3><Bug size={17} className="sec-icon" /> <span className="sec-num">H11</span> INFECTION</h3>
    <button
      type="button"
      className="infection-add-btn infection-add-btn--header"
      onClick={addInfection}
      title="Add another infection episode"
      aria-label="Add another infection episode"
    >
      <Plus size={18} strokeWidth={2.5} />
      <span>Add Infection</span>
    </button>
  </div>

  <div className="infection-section-summary">{getInfectionSectionSummary()}</div>
  <p className="infection-section-hint">
    Infections can occur more than once. Use <strong>+</strong> to add Infection 1, 2, 3… (CRF H11).
  </p>

  {infectionWindows.length > 0 && (
    <div className="field-hint field-hint-warning" style={{ marginBottom: "12px" }}>
      ⚠ Daily logs show possible infection events not yet fully addressed here.
      This form can't be submitted until every item below is reviewed.
      <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
        {infectionWindows.map((w) => {
          const reviewed = isInfectionFlagReviewed(w.signature);
          const dayLabel = w.nicu_day_start === w.nicu_day_end
            ? `Day ${w.nicu_day_start}`
            : `Day ${w.nicu_day_start}–${w.nicu_day_end}`;
          return (
            <li key={w.signature} style={{ marginBottom: "6px", opacity: reviewed ? 0.6 : 1 }}>
              <label style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={() => toggleInfectionFlagReviewed(w.signature)}
                  style={{ marginRight: "6px" }}
                />
                <strong>{w.reason}</strong> — {dayLabel}
                {w.date_start && ` (${w.date_start}${w.date_end !== w.date_start ? ` – ${w.date_end}` : ""})`}
                {reviewed ? " — reviewed" : ""}
              </label>
              {!reviewed && (
                <>
                  {" "}
                  <button type="button" className="link-button" onClick={() => addInfectionFromWindow(w)}>
                    Add Infection for this
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  )}

  {(formData.infections || []).length === 0 && (
    <div className="infection-empty-state">
      <p>No infection episodes recorded yet.</p>
      <button type="button" className="infection-add-btn" onClick={addInfection}>
        <Plus size={18} strokeWidth={2.5} /> Add Infection
      </button>
    </div>
  )}

  {(formData.infections || []).map((entry, idx) => {
    const n = (offset) => infectionFieldNum(idx, offset);
    return (
    <div className="card infection-entry-card" key={idx}>
      <div
        className="card-header-row"
        onClick={() => setOpenSection(openSection === `infection-${idx}` ? null : `infection-${idx}`)}
      >
        <span>H11. Infection {idx + 1}</span>

        <div className="right-section">
          <span className={`summary ${getInfectionEntryStatus(entry)}`}>
            <span className="icon">{getInfectionEntryIcon(entry)}</span>
            {getInfectionEntrySummary(entry)}
          </span>
          <button
            type="button"
            className="infection-remove-btn"
            onClick={(e) => { e.stopPropagation(); removeInfection(idx); }}
            title="Remove this infection episode"
            aria-label={`Remove infection episode ${idx + 1}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <span className="arrow">{openSection === `infection-${idx}` ? "▲" : "▼"}</span>
      </div>

      {openSection === `infection-${idx}` && (
        <div className="card-body">
          <div className="pn-adverse-card">

            <div className="form-row">
              <div className="form-group">
                <label><span className="field-num">{n(0)}.</span> Sepsis Episode Number</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={entry.sepsis_episode_number || ""}
                  onChange={(e) => handleInfectionChange(idx, "sepsis_episode_number", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label><span className="field-num">{n(1)}.</span> VAP Episode Number</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={entry.vap_episode_number || ""}
                  onChange={(e) => handleInfectionChange(idx, "vap_episode_number", e.target.value)}
                />
              </div>
            </div>

            {/* ---------------- SEPSIS ---------------- */}
            <div className="form-group">
              <YesNoToggle label={`${n(2)}. Sepsis`} name="sepsis" value={entry.sepsis}
                onChange={(e) => handleInfectionChange(idx, "sepsis", e.target.value)} required />
              {errors.infectionErrors?.[idx]?.sepsis && (
                <div className="error-text">{errors.infectionErrors[idx].sepsis}</div>
              )}
            </div>

            {entry.sepsis === "Yes" && (
              <>
                <div className="adverse-title"><span className="field-num">{n(3)}.</span> Type <span className="required">*</span></div>
                <div className="pn-checkbox-grid">
                  <label>
                    <input type="checkbox" checked={entry.sepsis_clinical || false}
                      onChange={(e) => handleInfectionChange(idx, "sepsis_clinical", e.target.checked)} />
                    Clinical/Screen-
                  </label>
                  <label>
                    <input type="checkbox" checked={entry.sepsis_screen || false}
                      onChange={(e) => handleInfectionChange(idx, "sepsis_screen", e.target.checked)} />
                    Screen+
                  </label>
                  <label>
                    <input type="checkbox" checked={entry.sepsis_culture || false}
                      onChange={(e) => handleInfectionChange(idx, "sepsis_culture", e.target.checked)} />
                    Culture+
                  </label>
                </div>
                {errors.infectionErrors?.[idx]?.sepsis_type_group && (
                  <div className="error-text">{errors.infectionErrors[idx].sepsis_type_group}</div>
                )}

                {/* ---------------- AGE ---------------- */}
                <div className="form-row">
                  <div className="form-group">
                    <label><span className="field-num">{n(4)}.</span> Age at onset (hrs)</label>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={entry.sepsis_onset_age || ""}
                      onChange={(e) => handleInfectionChange(idx, "sepsis_onset_age", e.target.value)}
                    />
                    {errors.infectionErrors?.[idx]?.sepsis_onset_age && (
                      <div className="error-text">{errors.infectionErrors[idx].sepsis_onset_age}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label><span className="field-num">{n(5)}.</span> Age at blood culture sent (hrs)</label>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={entry.blood_culture_age_hours || ""}
                      onChange={(e) => handleInfectionChange(idx, "blood_culture_age_hours", e.target.value)}
                    />
                    {errors.infectionErrors?.[idx]?.blood_culture_age_hours && (
                      <div className="error-text">{errors.infectionErrors[idx].blood_culture_age_hours}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label><span className="field-num">{n(5)}.</span> Age at blood culture sent (days)</label>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={entry.blood_culture_age_days || ""}
                      onChange={(e) => handleInfectionChange(idx, "blood_culture_age_days", e.target.value)}
                    />
                    {errors.infectionErrors?.[idx]?.blood_culture_age_days && (
                      <div className="error-text">{errors.infectionErrors[idx].blood_culture_age_days}</div>
                    )}
                  </div>
                </div>

                {/* ---------------- SCREEN / abnormal params (CRF: if screen+/culture+) ---------------- */}
                {(entry.sepsis_screen || entry.sepsis_culture) && (
                  <>
                    <div className="adverse-title"><span className="field-num">{n(6)}.</span> If screen+/culture+ abnormal parameters <span className="required">*</span></div>
                    <div className="pn-checkbox-grid">
                      <label><input type="checkbox" checked={entry.screen_crp || false} onChange={(e) => handleInfectionChange(idx, "screen_crp", e.target.checked)} /> CRP</label>
                      <label><input type="checkbox" checked={entry.screen_pct || false} onChange={(e) => handleInfectionChange(idx, "screen_pct", e.target.checked)} /> PCT</label>
                      <label><input type="checkbox" checked={entry.screen_other || false} onChange={(e) => handleInfectionChange(idx, "screen_other", e.target.checked)} /> Other</label>
                    </div>
                    {errors.infectionErrors?.[idx]?.screen_group && (
                      <div className="error-text">{errors.infectionErrors[idx].screen_group}</div>
                    )}
                    {entry.screen_other && (
                      <div className="form-group">
                        <label>Specify Other <span className="required">*</span></label>
                        <input
                          value={entry.screen_other_text || ""}
                          onChange={(e) => handleInfectionChange(idx, "screen_other_text", e.target.value)}
                        />
                        {errors.infectionErrors?.[idx]?.screen_other_text && (
                          <div className="error-text">{errors.infectionErrors[idx].screen_other_text}</div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ---------------- CULTURE ---------------- */}
                {entry.sepsis_culture && (
                  <>
                    <div className="adverse-title"><span className="field-num">{n(7)}.</span> If culture+, source <span className="required">*</span></div>
                    <div className="pn-checkbox-grid">
                      <label><input type="checkbox" checked={entry.culture_blood || false} onChange={(e) => handleInfectionChange(idx, "culture_blood", e.target.checked)} /> Blood</label>
                      <label><input type="checkbox" checked={entry.culture_csf || false} onChange={(e) => handleInfectionChange(idx, "culture_csf", e.target.checked)} /> CSF</label>
                      <label><input type="checkbox" checked={entry.culture_urine || false} onChange={(e) => handleInfectionChange(idx, "culture_urine", e.target.checked)} /> Urine</label>
                      <label><input type="checkbox" checked={entry.culture_other || false} onChange={(e) => handleInfectionChange(idx, "culture_other", e.target.checked)} /> Other</label>
                    </div>
                    {errors.infectionErrors?.[idx]?.culture_group && (
                      <div className="error-text">{errors.infectionErrors[idx].culture_group}</div>
                    )}
                    {entry.culture_other && (
                      <div className="form-group">
                        <label>Specify Fluid <span className="required">*</span></label>
                        <input
                          value={entry.culture_other_text || ""}
                          onChange={(e) => handleInfectionChange(idx, "culture_other_text", e.target.value)}
                        />
                        {errors.infectionErrors?.[idx]?.culture_other_text && (
                          <div className="error-text">{errors.infectionErrors[idx].culture_other_text}</div>
                        )}
                      </div>
                    )}

                    {/* ---------------- ORGANISM ---------------- */}
                    <div className="adverse-title"><span className="field-num">{n(8)}.</span> If culture+, organism type <span className="required">*</span></div>
                    <div className="pn-checkbox-grid">
                      <label><input type="checkbox" checked={entry.gram_positive || false} onChange={(e) => handleInfectionChange(idx, "gram_positive", e.target.checked)} /> Gram Positive</label>
                      <label><input type="checkbox" checked={entry.gram_negative || false} onChange={(e) => handleInfectionChange(idx, "gram_negative", e.target.checked)} /> Gram Negative</label>
                      <label><input type="checkbox" checked={entry.fungus || false} onChange={(e) => handleInfectionChange(idx, "fungus", e.target.checked)} /> Fungus</label>
                    </div>
                    {errors.infectionErrors?.[idx]?.organism_group && (
                      <div className="error-text">{errors.infectionErrors[idx].organism_group}</div>
                    )}
                  </>
                )}

                {/* ---------------- GRAM POSITIVE ---------------- */}
                {entry.gram_positive && (
                  <>
                    <div className="adverse-title"><span className="field-num">{n(9)}.</span> If Gram Positive <span className="required">*</span></div>
                    <div className="pn-checkbox-grid">
                      <label><input type="checkbox" checked={entry.staph_hemolyticus || false} onChange={(e) => handleInfectionChange(idx, "staph_hemolyticus", e.target.checked)} /> Staphylococcus hemolyticus</label>
                      <label><input type="checkbox" checked={entry.staph_epidermidis || false} onChange={(e) => handleInfectionChange(idx, "staph_epidermidis", e.target.checked)} /> Staphylococcus epidermidis</label>
                      <label><input type="checkbox" checked={entry.gp_other || false} onChange={(e) => handleInfectionChange(idx, "gp_other", e.target.checked)} /> Others</label>
                      {entry.staph_aureus && (
                        <label><input type="checkbox" checked={entry.staph_aureus || false} onChange={(e) => handleInfectionChange(idx, "staph_aureus", e.target.checked)} /> Staph aureus (legacy)</label>
                      )}
                    </div>
                    {errors.infectionErrors?.[idx]?.gp_group && (
                      <div className="error-text">{errors.infectionErrors[idx].gp_group}</div>
                    )}
                    {entry.gp_other && (
                      <input
                        placeholder="Specify"
                        value={entry.gp_other_text || ""}
                        onChange={(e) => handleInfectionChange(idx, "gp_other_text", e.target.value)}
                      />
                    )}
                  </>
                )}

                {/* ---------------- GRAM NEGATIVE ---------------- */}
                {entry.gram_negative && (
                  <>
                    <div className="adverse-title"><span className="field-num">{n(10)}.</span> If Gram Negative <span className="required">*</span></div>
                    <div className="pn-checkbox-grid">
                      <label><input type="checkbox" checked={entry.acinetobacter || false} onChange={(e) => handleInfectionChange(idx, "acinetobacter", e.target.checked)} /> Acinetobacter</label>
                      <label><input type="checkbox" checked={entry.ecoli || false} onChange={(e) => handleInfectionChange(idx, "ecoli", e.target.checked)} /> E Coli</label>
                      <label><input type="checkbox" checked={entry.klebsiella || false} onChange={(e) => handleInfectionChange(idx, "klebsiella", e.target.checked)} /> Klebsiella</label>
                      <label><input type="checkbox" checked={entry.serratia || false} onChange={(e) => handleInfectionChange(idx, "serratia", e.target.checked)} /> Serratia</label>
                      <label><input type="checkbox" checked={entry.pseudomonas || false} onChange={(e) => handleInfectionChange(idx, "pseudomonas", e.target.checked)} /> Pseudomonas</label>
                      <label><input type="checkbox" checked={entry.gn_other || false} onChange={(e) => handleInfectionChange(idx, "gn_other", e.target.checked)} /> Others</label>
                    </div>
                    {errors.infectionErrors?.[idx]?.gn_group && (
                      <div className="error-text">{errors.infectionErrors[idx].gn_group}</div>
                    )}
                    {entry.gn_other && (
                      <input
                        placeholder="Specify"
                        value={entry.gn_other_text || ""}
                        onChange={(e) => handleInfectionChange(idx, "gn_other_text", e.target.value)}
                      />
                    )}
                  </>
                )}

                {/* ---------------- MDR / XDR ---------------- */}
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label={`${n(11)}. MDR`} name="mdr" value={entry.mdr}
                      onChange={(e) => handleInfectionChange(idx, "mdr", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <YesNoToggle label={`${n(12)}. XDR`} name="xdr" value={entry.xdr}
                      onChange={(e) => handleInfectionChange(idx, "xdr", e.target.value)} />
                  </div>
                </div>

                {/* ---------------- FOCUS OF INFECTION ---------------- */}
                <div className="adverse-title"><span className="field-num">{n(13)}.</span> Focus of the infection</div>
                <div className="pn-checkbox-grid">
                  <label><input type="checkbox" checked={entry.focus_septicemia || false} onChange={(e) => handleInfectionChange(idx, "focus_septicemia", e.target.checked)} /> Generalized septicemia</label>
                  <label><input type="checkbox" checked={entry.focus_pneumonia || false} onChange={(e) => handleInfectionChange(idx, "focus_pneumonia", e.target.checked)} /> Pneumonia</label>
                  <label><input type="checkbox" checked={entry.focus_meningitis || false} onChange={(e) => handleInfectionChange(idx, "focus_meningitis", e.target.checked)} /> Meningitis</label>
                  <label><input type="checkbox" checked={entry.focus_bone_joint || false} onChange={(e) => handleInfectionChange(idx, "focus_bone_joint", e.target.checked)} /> Bone and joint</label>
                  <label><input type="checkbox" checked={entry.focus_uti || false} onChange={(e) => handleInfectionChange(idx, "focus_uti", e.target.checked)} /> UTI</label>
                  <label><input type="checkbox" checked={entry.focus_other || false} onChange={(e) => handleInfectionChange(idx, "focus_other", e.target.checked)} /> Other</label>
                </div>
                {entry.focus_other && (
                  <input
                    placeholder="Specify"
                    value={entry.focus_other_text || ""}
                    onChange={(e) => handleInfectionChange(idx, "focus_other_text", e.target.value)}
                  />
                )}

                {/* ---------------- CLABSI / VAP ---------------- */}
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label={`${n(14)}. CLABSI`} name="clabsi" value={entry.clabsi}
                      onChange={(e) => handleInfectionChange(idx, "clabsi", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <YesNoToggle label={`${n(15)}. VAP`} name="vap" value={entry.vap}
                      onChange={(e) => handleInfectionChange(idx, "vap", e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* CRF: totals sit inside each Infection block (#233-234 / #251-252) */}
            <div className="form-row" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
              <div className="form-group">
                <label><span className="field-num">{n(16)}.</span> Total number of episodes of sepsis</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={entry.total_sepsis_episodes || ""}
                  onChange={(e) => handleInfectionChange(idx, "total_sepsis_episodes", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label><span className="field-num">{n(17)}.</span> Total number of episodes of VAP</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={entry.total_vap_episodes || ""}
                  onChange={(e) => handleInfectionChange(idx, "total_vap_episodes", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  })}

  {(formData.infections || []).length > 0 && (
    <button type="button" className="infection-add-btn" onClick={addInfection}>
      <Plus size={16} strokeWidth={2.5} /> Add another Infection
    </button>
  )}

</div>


{/* ================= HOSPITAL COURSE SUMMARY ================= */}
<div id="cat-summary" className={`form-section summary-section${activeCategory === "summary" ? "" : " cat-hidden"}`}>

  <h3><ClipboardList size={17} className="sec-icon" /> <span className="sec-num">H12</span> HOSPITAL COURSE SUMMARY</h3>

  {/* ================= Duration Metrics ================= */}
  <div className="summary-card">

    <div className="summary-title">Hospital Stay Metrics</div>

    <div className="summary-grid">

      <div className="form-group">
        <label><span className="field-num">253.</span> Total LOS (days)</label>
        <input
          type="number"
          name="total_los"
          value={formData.total_los || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.total_los && <div className="error-text">{errors.total_los}</div>}
      </div>

      <div className="form-group">
        <label><span className="field-num">254.</span> NICU Days</label>
        <input
          type="number"
          name="nicu_days"
          value={formData.nicu_days || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.nicu_days && <div className="error-text">{errors.nicu_days}</div>}
      </div>

      <div className="form-group">
        <label><span className="field-num">255.</span> O₂ Days</label>
        <input
          type="number"
          name="o2_days"
          value={formData.o2_days || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.o2_days && <div className="error-text">{errors.o2_days}</div>}
      </div>

      <div className="form-group">
        <label><span className="field-num">256.</span> Vent Days</label>
        <input
          type="number"
          name="vent_days"
          value={formData.vent_days || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.vent_days && <div className="error-text">{errors.vent_days}</div>}
      </div>

      <div className="form-group">
        <label><span className="field-num">257.</span> CPAP Days</label>
        <input
          type="number"
          name="cpap_days"
          value={formData.cpap_days || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.cpap_days && <div className="error-text">{errors.cpap_days}</div>}
      </div>

    </div>

  </div>

  {/* ================= Nutrition ================= */}
  <div className="summary-card">

    <div className="summary-title">Nutrition</div>

    <div className="summary-grid">

      <div className="form-group">
        <label><span className="field-num">258.</span> PN Days</label>
        <input
          type="number"
          name="pn_days_summary"
          value={formData.pn_days_summary || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.pn_days_summary && <div className="error-text">{errors.pn_days_summary}</div>}
      </div>

      <div className="form-group">
        <label><span className="field-num">259.</span> Age at Full Feeds (days)</label>
        <input
          type="number"
          name="age_full_feeds_summary"
          value={formData.age_full_feeds_summary || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.age_full_feeds_summary && (
          <div className="error-text">{errors.age_full_feeds_summary}</div>
        )}
      </div>

    </div>

  </div>

  {/* ================= Discharge Details ================= */}
  <div className="summary-card">

    <div className="summary-title">Discharge Details</div>

    <div className="summary-grid">

      <div className="form-group">
        <label><span className="field-num">260.</span> Discharge Weight (g)</label>
        <input
          type="number"
          name="discharge_weight"
          value={formData.discharge_weight || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.discharge_weight && (
          <div className="error-text">{errors.discharge_weight}</div>
        )}
      </div>

      <div className="form-group">
        <label><span className="field-num">261.</span> Discharge HC (cm)</label>
        <input
          type="number"
          step="0.1"
          name="discharge_hc"
          value={formData.discharge_hc || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.discharge_hc && (
          <div className="error-text">{errors.discharge_hc}</div>
        )}
      </div>

      <div className="form-group">
        <label><span className="field-num">262.</span> Discharge Date</label>
        <input
          type="date"
          name="discharge_date"
          value={formData.discharge_date || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.discharge_date && (
          <div className="error-text">{errors.discharge_date}</div>
        )}
      </div>

    </div>

  </div>

  {/* ================= Outcome ================= */}
  <div className="summary-card">

    <div className="summary-title"><span className="field-num">263.</span> Outcome</div>

    <div className="form-group">
      <select
        name="outcome"
        value={formData.outcome || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select Outcome --</option>
        <option value="Discharged">Discharged</option>
        <option value="Died">Died</option>
        <option value="Back referred">Back referred</option>
        <option value="Discharged home on request">Discharged home on request</option>
        <option value="Left Against Medical Advice">Left Against Medical Advice</option>
      </select>
      {errors.outcome && <div className="error-text">{errors.outcome}</div>}
    </div>

  </div>

  {/* ================= Back Referral ================= */}
  {formData.outcome === "Back referred" && (
    <div className="summary-card">

      <div className="summary-title"><span className="field-num">264.</span> If back-referred: Hospital/SNCU name</div>

      <div className="form-group">
        <select
          name="back_referral_hospital"
          value={formData.back_referral_hospital || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        >
          <option value="">-- Select Hospital / SNCU --</option>
          <option>GMCH Chandigarh</option>
          <option>Civil Hospital Mohali</option>
          <option>Civil Hospital Panchkula</option>
          <option>Civil Hospital Ludhiana</option>
          <option>District Hospital Ambala</option>
          <option>Other</option>
        </select>
        {errors.back_referral_hospital && (
          <div className="error-text">{errors.back_referral_hospital}</div>
        )}
      </div>

      {formData.back_referral_hospital === "Other" && (
        <div className="form-group">
          <label>Specify Hospital <span className="required">*</span></label>
          <input
            name="back_referral_other"
            value={formData.back_referral_other || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          {errors.back_referral_other && (
            <div className="error-text">{errors.back_referral_other}</div>
          )}
        </div>
      )}

    </div>
  )}

</div>

{/* ================= FORM COMPLETION ================= */}
<div id="cat-completion" className={`form-section soft-blue${activeCategory === "completion" ? "" : " cat-hidden"}`}>
  <h3>Form Completion</h3>

  <div className="form-row">

    {/* Completed By Dropdown */}
    <div className="form-group">
      <label>Form completed by <span className="required">*</span></label>
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

    {/* Designation Auto-fill */}
    <div className="form-group">
      <label>Designation <span className="required">*</span></label>
      <input
        name="designation"
        value={formData.designation || ""}
        readOnly
        placeholder="Auto-filled"
      />
    </div>

  </div>

  <div className="form-row">

    {/* Date */}
    <div className="form-group">
      <label>Date</label>
      <input
        type="date"
        name="completion_date"
        value={formData.completion_date || ""}
        onChange={handleChange}
      />
    </div>

  </div>
</div>



    </form>

    {saveMessage && (
      <div className={`form-message${saveMessage.startsWith("✅") ? " msg-success" : " msg-error"}`}>
        {saveMessage}
      </div>
    )}

    {/* ── NAV BAR (shared component, same as FormC) ── */}
    <FormNavBar
      onBack={handleNavBack}
      onSave={saveFormH}
      onNext={handleNavNext}
      backLabel="ROP Screening"
      nextLabel="Study Outcomes"
      step={8} totalSteps={17}
      isSaved={isSaved}
    />
    </>
  );
}
