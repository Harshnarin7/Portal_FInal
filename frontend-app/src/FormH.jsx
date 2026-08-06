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
import { Plus, Trash2, Brain, Wind, Utensils, Activity, HeartPulse, Droplets, Eye, Thermometer, Syringe, Bug, ClipboardList, Home } from "lucide-react";
import FormNavBar from "./components/FormNavBar";

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
  const { markFormCompleted } = useFormProgress();
  const [errors, setErrors] = useState({});
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const { enrollmentId } = useParams();
const [touched, setTouched] = useState({});
const [openSection, setOpenSection] = useState("ivh"); // default open
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
cpap_days:"",
nippv_used:"",
nippv_days:"",
hfnc_used: "",          // NEW
hfnc_days: "", 
imv_used:"",
imv_days:"",
nasal_cannula_used: "",      // NEW
nasal_cannula_days: "",
oxygen_exposure:"",
postnatal_steroids:"",
steroid_drug:"",
steroid_drug_other:"",
age_steroid:"",
steroid_dose:"",
steroid_indication:"",
steroid_indication_other:"",

// PVL
pvl_present: "",
pvl_side: "",
pvl_grade: "",
pvl_date: "",

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
eeg_result: "",
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

lactobacillus:"",
bifidobacterium:"",

cholestasis:"",
tpn_associated:"",
max_direct_bilirubin:"",

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
if (name.startsWith("rop_method_")) {
  validateROP("rop_method_group", val, updatedForm);
}

if (name.startsWith("rop_stage")) {
  validateROP("rop_stage_group", val, updatedForm);
}

if (name.startsWith("rop_zone")) {
  validateROP("rop_zone_group", val, updatedForm);
}

if (name.startsWith("rop_") && 
   (name.includes("laser") || name.includes("vegf") || name.includes("vitrectomy") || name.includes("other"))) {
  validateROP("rop_treatment_group", val, updatedForm);
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
    updatedForm.line_comp_infection = false;
  }

  if (
    (name === "line_comp_thrombosis" ||
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
  if (name.startsWith("rop_method_")) {
    validateROP("rop_method_group", val, updatedForm);
  }

  if (name.startsWith("rop_stage")) {
    validateROP("rop_stage_group", val, updatedForm);
  }

  if (name.startsWith("rop_zone")) {
    validateROP("rop_zone_group", val, updatedForm);
  }

  if (name.startsWith("rop_") && name.includes("other")) {
    validateROP("rop_treatment_group", val, updatedForm);
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

          return {
            ...prev,
            ...existing,
            ivh_side: side, ivh_grade_right, ivh_grade_left, ivh_date_right, ivh_date_left,
            ivh_age_days_right, ivh_age_days_left,
            // map backend booleans back to the Yes/No selects the UI uses
            ivh_present: existing.ivh === true ? "Yes" : existing.ivh === false ? "No" : prev.ivh_present,
            pvl_present: existing.pvl === true ? "Yes" : existing.pvl === false ? "No" : prev.pvl_present,
            ventriculomegaly_present:
              existing.ventriculomegaly === true ? "Yes" :
              existing.ventriculomegaly === false ? "No" : prev.ventriculomegaly_present,
            infections: Array.isArray(existing.infections) ? existing.infections : (prev.infections || []),
            enrollment_id: enrollmentId,
          };
        });
      } catch (err) {
        // No saved Form H yet for this enrollment — start blank, this is expected for a new form.
        console.log("No existing Form H record yet for this enrollment.");
      }
    };

    loadExistingFormH();
  }, [enrollmentId]);

  const yesNoToBool = (v) => {
  if (v === "Yes") return true;
  if (v === "No") return false;
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
        updatedForm.line_comp_thrombosis ||
        updatedForm.line_comp_infection;

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


const fetchResp = async () => {
  if (!enrollmentId) return;

  // 1) Get summary (keep existing)
  const res = await api.get(`/respiratory-summary/${enrollmentId}`);
  const data = res.data;

  // 2) Get raw logs for IMV calculation
  const logRes = await api.get(`/respiratory-log/${enrollmentId}`);
  const logs = logRes.data || [];

  // 3) Calculate IMV from frontend (robust)
  const normalize = (v) =>
    (v || "").toString().toUpperCase().replace(/\s+/g, "_");

  const imvDays = logs.filter((l) =>
    ["IMV", "SIMV", "HFOV"].includes(normalize(l.support_mode))
  ).length;

  // 4) Set form data
  setFormData((prev) => ({
    ...prev,

    // CPAP
    cpap: data.cpap_days > 0 ? "Yes" : "No",
    cpap_days: data.cpap_days,

    // NIPPV
    nippv: data.nippv_days > 0 ? "Yes" : "No",
    nippv_days: data.nippv_days,

    // HFNC
    hfnc: data.hfnc_days > 0 ? "Yes" : "No",
    hfnc_days: data.hfnc_days,

    // Nasal Cannula
    nasal_cannula: data.nasal_cannula_days > 0 ? "Yes" : "No",
    nasal_cannula_days: data.nasal_cannula_days,

    // ✅ OVERRIDE IMV (frontend-calculated)
    invasive_ventilation: imvDays > 0 ? "Yes" : "No",
    invasive_ventilation_days: imvDays,
    steroid_age_days: data.steroid_age_days || "",
    postnatal_steroids: data.steroid_age_days ? "Yes" : "No",
    pulmonary_hemorrhage: data.pulmonary_hemorrhage || "No",
    pulmonary_hypertension: data.pulmonary_hypertension || "No",
    pneumothorax: data.pneumothorax || "No",
    chest_drain: data.chest_drain || "No",
    extubation_failure:
    data.extubation_failure || "No",

    extubation_failure_episodes:
    data.extubation_failure_episodes || 0,
  }));
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

    // ---------------- HYPOGLYCEMIA ----------------
    case "hypoglycemia_lowest":
      if (updatedForm.hypoglycemia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 200) error = "0–200 mg/dL";
      }
      break;

    // ---------------- HYPERGLYCEMIA ----------------
    case "hyperglycemia_highest":
      if (updatedForm.hyperglycemia === "Yes") {
        if (!value) error = "Required";
        else if (!isNumber(value)) error = "Only numbers";
        else if (value < 0 || value > 500) error = "0–500 mg/dL";
      }
      break;

    // ---------------- DYSELECTROLYTEMIA ----------------
    case "dyselectro_group":
      if (updatedForm.dyselectrolytemia === "Yes") {
        const anyChecked =
          updatedForm.dyselectro_na ||
          updatedForm.dyselectro_k ||
          updatedForm.dyselectro_ca;

        if (!anyChecked) error = "Select at least one";
      }
      break;

    // ---------------- OSTEOPENIA ----------------
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

  setErrors(prev => ({
    ...prev,
    [name]: error,
    dyselectro_group: error
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

    // ---------------- SCREENING ----------------
    case "rop_first_screen_date":
      if (updatedForm.rop_screened === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "rop_method_group":
      if (updatedForm.rop_screened === "Yes") {
        const any =
          updatedForm.rop_method_ido ||
          updatedForm.rop_method_retcam;

        if (!any) error = "Select at least one method";
      }
      break;

    // ---------------- DIAGNOSIS ----------------
    case "rop_diagnosis_date":
      if (updatedForm.rop === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "rop_stage_group":
      if (updatedForm.rop === "Yes") {
        const any =
          updatedForm.rop_stage1 ||
          updatedForm.rop_stage2 ||
          updatedForm.rop_stage3 ||
          updatedForm.rop_stage4 ||
          updatedForm.rop_stage5;

        if (!any) error = "Select at least one stage";
      }
      break;

    case "rop_plus":
      if (updatedForm.rop === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "rop_zone_group":
      if (updatedForm.rop === "Yes") {
        const any =
          updatedForm.rop_zone1 ||
          updatedForm.rop_zone2 ||
          updatedForm.rop_zone3;

        if (!any) error = "Select at least one zone";
      }
      break;

    case "rop_treatment":
      if (updatedForm.rop === "Yes" && !value) {
        error = "Required";
      }
      break;

    // ---------------- TREATMENT ----------------
    case "rop_treatment_group":
      if (updatedForm.rop_treatment === "Yes") {
        const any =
          updatedForm.rop_laser ||
          updatedForm.rop_anti_vegf ||
          updatedForm.rop_vitrectomy ||
          updatedForm.rop_other;

        if (!any) error = "Select at least one treatment";
      }
      break;

    case "rop_other_text":
      if (updatedForm.rop_other && !value) {
        error = "Required";
      }
      break;

    // ---------------- BILATERAL ----------------
    case "rop_bilateral":
      if (updatedForm.rop === "Yes" && !value) {
        error = "Required";
      }
      break;

    case "rop_comment":
      if (updatedForm.rop_bilateral === "Yes" && !value) {
        error = "Required";
      }
      break;

    default:
      break;
  }

  setErrors(prev => ({
    ...prev,
    [name]: error,
    rop_method_group: error,
    rop_stage_group: error,
    rop_zone_group: error,
    rop_treatment_group: error
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

    // ---------------- LIGATION ----------------
    case "pda_ligation_age":
      if (updatedForm.pda_ligation === "Yes") {
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
  fetchResp();
}, [enrollmentId]);

useEffect(() => {

  const handleUpdate = () => {
    console.log("🔥 Form H updating...");
    fetchResp();
  };

  window.addEventListener("respiratoryUpdated", handleUpdate);

  return () => {
    window.removeEventListener("respiratoryUpdated", handleUpdate);
  };

}, []);

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
      steroid_indication: "",
      steroid_indication_other: ""
    }));

    setErrors(prev => ({
      ...prev,
      steroid_drug: "",
      steroid_drug_other: "",
      age_steroid: "",
      steroid_dose: "",
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
  if (formData.rop_screened === "No") {
    setFormData(prev => ({
      ...prev,
      rop_first_screen_date: "",
      rop_method_ido: false,
      rop_method_retcam: false
    }));
  }
}, [formData.rop_screened]);

useEffect(() => {
  if (formData.rop === "No") {
    setFormData(prev => ({
      ...prev,
      rop_diagnosis_date: "",
      rop_stage1: false,
      rop_stage2: false,
      rop_stage3: false,
      rop_stage4: false,
      rop_stage5: false,
      rop_zone1: false,
      rop_zone2: false,
      rop_zone3: false,
      rop_treatment: "",
      rop_bilateral: "",
      rop_comment: ""
    }));
  }
}, [formData.rop]);

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
    setFormData(prev => ({ ...prev, hypoglycemia_lowest: "" }));
  }
}, [formData.hypoglycemia]);

useEffect(() => {
  if (formData.hyperglycemia === "No") {
    setFormData(prev => ({ ...prev, hyperglycemia_highest: "" }));
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

useEffect(() => {

  const fetchResp = async () => {
    if (!enrollmentId) return;

    try {
      const res = await api.get(`/respiratory-summary/${enrollmentId}`);
      const data = res.data;

      setFormData(prev => ({
        ...prev,

       cpap: data.cpap_days > 0 ? "Yes" : "No",
cpap_days: data.cpap_days,

        nippv: data.nippv,
        nippv_days: data.nippv_days,

        invasive_ventilation: data.imv,
        invasive_ventilation_days: data.imv_days
      }));

    } catch (err) {
      console.log("Error fetching respiratory data", err);
    }
  };

  fetchResp();

}, [enrollmentId]);



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
      ventriculomegaly: yesNoToBool(formData.ventriculomegaly_present),
      seizures: yesNoToBool(formData.seizures),
      bpd: yesNoToBool(formData.bpd),
      postnatal_steroids: yesNoToBool(formData.postnatal_steroids),
      feed_intolerance: yesNoToBool(formData.feed_intolerance),
      nec: yesNoToBool(formData.nec),
      hs_pda: yesNoToBool(formData.hs_pda),
      shock: yesNoToBool(formData.shock),
      hypotension: yesNoToBool(formData.hypotension),
      // structural_heart_disease is intentionally left as the raw "Yes"/"No"/""
      // string from formData (via the ...formData spread above) — the backend
      // schema stores it as a string, not a boolean, so it tolerates "" for an
      // unanswered field (see FormH_redesign_notes.md, "why VARCHAR not BOOLEAN").

      sepsis: anySepsisAnswered ? anySepsisYes : yesNoToBool(formData.sepsis),
      sepsis_episodes: num(formData.sepsis_episodes),

      total_los_days: num(formData.total_los_days),
      nicu_days: num(formData.nicu_days),
      discharge_weight: num(formData.discharge_weight),

      infections: infectionsList,
    };
  };

  // "Save" on the bottom nav bar — saves without leaving the page.
  const saveFormH = async () => {
    try {
      await api.post("/neonatal-morbidities/", buildPayload());
      markFormCompleted("form_h");
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
  const handleNavBack = () => {
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

    try {
      await api.post("/neonatal-morbidities/", buildPayload());
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
      parts.push(`L${formData.ivh_grade_left}/R${formData.ivh_grade_right}`);
    } else if (formData.ivh_grade_right) {
      parts.push(`R${formData.ivh_grade_right}`);
    } else if (formData.ivh_grade_left) {
      parts.push(`L${formData.ivh_grade_left}`);
    }
  } else if (formData.ivh_side === "Right" && formData.ivh_grade_right) {
    parts.push(`R${formData.ivh_grade_right}`);
  } else if (formData.ivh_side === "Left" && formData.ivh_grade_left) {
    parts.push(`L${formData.ivh_grade_left}`);
  }

  // PVHI / PHH / Shunt
  if (formData.pvhi === "Yes") parts.push("PVHI");
  if (formData.phh === "Yes") parts.push("PHH");
  if (formData.vp_shunt === "Yes") parts.push("Shunt");

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
  if (formData.pn === "No") return "No PN";
  if (formData.pn === "Yes") {
    return formData.pn_days
      ? `${formData.pn_days} days`
      : "PN Given";
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


const getPDASummary = () => {
  if (!formData.hs_pda) return "Not filled";
  if (formData.hs_pda === "No") return "No";

  let summary = "Yes";

  // diagnosis
  if (formData.pda_echo) summary = "Echo";
  else if (formData.pda_clinical) summary = "Clinical";
  else if (formData.pda_both) summary = "Clinical + Echo";

  // treatment
  if (formData.pda_medical_rx === "Yes") summary += " • Medical";
  if (formData.pda_ligation === "Yes") summary += " • Ligation";

  return summary;
};

const getShockSummary = () => {
  if (!formData.shock && !formData.hypotension) return "Not filled";

  let parts = [];

  if (formData.shock === "Yes") parts.push("Shock");
  if (formData.hypotension === "Yes") parts.push("Hypotension");

  if (formData.inotropes === "Yes") {
    parts.push(`Inotropes (${formData.inotrope_duration || "?"}d)`);
  }

  if (formData.fluid_bolus === "Yes") {
    parts.push(`Bolus x${formData.fluid_bolus_number || "?"}`);
  }

  return parts.length ? parts.join(" • ") : "No";
};

// ================= INFECTION (H10) — dynamic, repeatable episodes =================
// Replaces the old single flat sepsis_* fields with formData.infections[],
// so a patient can have any number of infection episodes recorded
// independently (add / remove without touching any other entry's data).

const emptyInfection = () => ({
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
});

const addInfection = () => {
  setFormData(prev => ({
    ...prev,
    infections: [...(prev.infections || []), emptyInfection()],
  }));
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
      if (entry.sepsis_screen) {
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
        const any = entry.staph_aureus || entry.staph_hemolyticus || entry.staph_epidermidis || entry.gp_other;
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
    entry = { ...entry, sepsis_clinical: false, sepsis_screen: false, sepsis_culture: false };
  }
  if (name === "sepsis_screen" && !rawValue) {
    entry = { ...entry, screen_crp: false, screen_pct: false, screen_other: false, screen_other_text: "" };
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
  if (name.startsWith("screen_")) validateInfectionField(index, "screen_group", rawValue, entry);
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
  if (entry.sepsis_clinical) parts.push("Clinical");
  if (entry.sepsis_screen) parts.push("Screen+");
  if (entry.sepsis_culture) parts.push("Culture+");
  if (entry.gram_positive) parts.push("G+");
  if (entry.gram_negative) parts.push("G-");
  if (entry.fungus) parts.push("Fungal");
  if (entry.clabsi === "Yes") parts.push("CLABSI");
  if (entry.vap === "Yes") parts.push("VAP");
  if (entry.mdr === "Yes") parts.push("MDR");
  if (entry.xdr === "Yes") parts.push("XDR");

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
      parts.push(`FFP x${formData.ffp_number || 1}`);
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

  let parts = ["Yes"];

  if (formData.lowest_hb) parts.push(`${formData.lowest_hb}`);
  if (formData.anemia_etiology) parts.push(formData.anemia_etiology);

  return parts.join(" • ");
};

const getJaundiceSummary = () => {
  if (!formData.jaundice_type) return "Not filled";

  if (formData.jaundice_type === "Unconjugated") {
    let parts = ["Unconj"];

    if (formData.peak_tsb) parts.push(`${formData.peak_tsb} mg/dL`);
    if (formData.phototherapy === "Yes") parts.push("Photo");
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

  // ROP YES
  let parts = ["ROP"];

  // Stage
  if (formData.rop_stage3) parts.push("Stage 3");
  else if (formData.rop_stage2) parts.push("Stage 2");
  else if (formData.rop_stage1) parts.push("Stage 1");
  else if (formData.rop_stage4) parts.push("Stage 4");
  else if (formData.rop_stage5) parts.push("Stage 5");

  // Plus disease
  if (formData.rop_plus === "Yes") parts.push("+");

  // Zone
  if (formData.rop_zone1) parts.push("Zone I");
  else if (formData.rop_zone2) parts.push("Zone II");
  else if (formData.rop_zone3) parts.push("Zone III");

  // Treatment
  if (formData.rop_treatment === "Yes") {
    if (formData.rop_laser) parts.push("Laser");
    if (formData.rop_anti_vegf) parts.push("Anti-VEGF");
    if (formData.rop_vitrectomy) parts.push("Surgery");
  }

  return parts.join(" • ");
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
    parts.push(`${formData.aki_peak_creatinine} mg/dL`);
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

  let parts = ["Hyper"];

  if (formData.hyperthermia_temp) {
    parts.push(`${formData.hyperthermia_temp}°C`);
  }

  if (formData.hyperthermia_location_dr) parts.push("DR");
  else if (formData.hyperthermia_location_nicu) parts.push("NICU");

  if (formData.hyperthermia_equipment) parts.push("Equipment");

  return parts.join(" • ");
};


const getHypoSummary = () => {
  if (!formData.hypothermia) return "Not filled";
  if (formData.hypothermia === "No") return "No";

  let parts = ["Hypo"];

  // Severity priority
  if (formData.hypothermia_severe) parts.push("Severe");
  else if (formData.hypothermia_moderate) parts.push("Moderate");
  else if (formData.hypothermia_mild) parts.push("Mild");

  // Temp
  if (formData.hypothermia_lowest_temp) {
    parts.push(`${formData.hypothermia_lowest_temp}°C`);
  }

  // Location
  if (formData.hypothermia_location_dr) parts.push("DR");
  else if (formData.hypothermia_location_nicu) parts.push("NICU");

  // Etiology
  if (formData.hypothermia_sepsis) parts.push("Sepsis");

  return parts.join(" • ");
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

    if (formData.peripheral_venous === "Yes") parts.push("Venous");
    if (formData.peripheral_arterial === "Yes") parts.push("Arterial");

    if (formData.arterial_radial) parts.push("Radial");
    if (formData.arterial_posterior_tibial) parts.push("PT");

    if (formData.extravasation === "Yes") parts.push("Extravasation");

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

    if (formData.line_comp_thrombosis) parts.push("Thrombosis");
    if (formData.line_comp_infection) parts.push("Infection");

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
<div className="form-section soft-blue">

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

        <div className="form-group">
          <YesNoToggle label="1. Any IVH Diagnosed" name="ivh_present" value={formData.ivh_present} onChange={handleChange} onBlur={handleBlur} required />
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

        <div className="form-group">
          <YesNoToggle label="PVL diagnosed" name="pvl_present" value={formData.pvl_present} onChange={handleChange} onBlur={handleBlur} required />
          {touched.pvl_present && errors.pvl_present && <div className="error-text">{errors.pvl_present}</div>}
        </div>

        {formData.pvl_present === "Yes" && (
          <>
            {/* ---------------- SIDE + GRADE ---------------- */}
<div className="form-row">

  {/* SIDE */}
  <div className="form-group">
    <label>Side<span className="required">*</span></label>
    <select
      name="pvl_side"
      value={formData.pvl_side || ""}
      onChange={handleChange}
    >
      <option value="">-- Select --</option>
      <option>Right</option>
      <option>Left</option>
      <option>Both</option>
    </select>
  </div>

  {/* GRADE */}
  {formData.pvl_side === "Both" ? (
    <>
      <div className="form-group">
        <label><span className="field-num">5.</span> Left Grade<span className="required">*</span></label>
        <select
          name="pvl_grade_left"
          value={formData.pvl_grade_left || ""}
          onChange={handleChange}
        >
          <option value="">-- Select --</option>
          <option value="1">Grade 1 (Flare)</option>
          <option value="2">Grade 2 (Localized cysts)</option>
          <option value="3">Grade 3 (Extensive cysts)</option>
          <option value="4">Grade 4 (Subcortical)</option>
        </select>
      </div>

      <div className="form-group">
        <label><span className="field-num">34.</span> Right Grade<span className="required">*</span></label>
        <select
          name="pvl_grade_right"
          value={formData.pvl_grade_right || ""}
          onChange={handleChange}
        >
          <option value="">-- Select --</option>
          <option value="1">Grade 1 (Flare)</option>
          <option value="2">Grade 2 (Localized cysts)</option>
          <option value="3">Grade 3 (Extensive cysts)</option>
          <option value="4">Grade 4 (Subcortical)</option>
        </select>
      </div>
    </>
  ) : (
    <div className="form-group">
      <label>Grade<span className="required">*</span></label>
      <select
        name="pvl_grade"
        value={formData.pvl_grade || ""}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option value="1">Grade 1 (Flare)</option>
          <option value="2">Grade 2 (Localized cysts)</option>
          <option value="3">Grade 3 (Extensive cysts)</option>
          <option value="4">Grade 4 (Subcortical)</option>
      </select>
    </div>
  )}

</div>

{/* ---------------- DATE ---------------- */}
<div className="form-row">

  {formData.pvl_side === "Both" ? (
    <>
      <div className="form-group">
        <label>Left Date<span className="required">*</span></label>
        <DatePicker
  selected={formData.pvl_date_left ? parseDateOnly(formData.pvl_date_left) : null}
  onChange={(date) =>
    setFormData(prev => ({
      ...prev,
      pvl_date_left: date ? toDateOnlyValue(date) : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Left date"
/>
      </div>

      <div className="form-group">
        <label>Right Date<span className="required">*</span></label>
        <DatePicker
  selected={formData.pvl_date_right ? parseDateOnly(formData.pvl_date_right) : null}
  onChange={(date) =>
    setFormData(prev => ({
      ...prev,
      pvl_date_right: date ? toDateOnlyValue(date) : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Right date"
/>
      </div>
    </>
  ) : (
    <div className="form-group">
      <label>Date<span className="required">*</span></label>
      <DatePicker
  selected={formData.pvl_date ? parseDateOnly(formData.pvl_date) : null}
  onChange={(date) =>
    setFormData(prev => ({
      ...prev,
      pvl_date: date ? toDateOnlyValue(date) : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
/>
    </div>
  )}

</div>
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

      {/* Present */}
      <div className="form-group">
        <YesNoToggle label="Ventriculomegaly" name="ventriculomegaly_present" value={formData.ventriculomegaly_present} onChange={handleChange} onBlur={handleBlur} required />

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
              <label>Severity</label>
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
                VI max (mm) <span className="required">*</span>
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
                Anterior Horn Width (mm) 
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
                TOD max (mm) 
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
                Anterior Cerebral Artery Resistive Index (ACA RI)
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
                Middle Cerebral Artery Resistive Index (MCA RI)
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
        ? formData.aeds_required === "Yes"
          ? "Yes • AED"
          : "Yes"
        : formData.seizures || "Not filled"}
    </span>
</div>
    <span className="arrow">{openSection === "seizure" ? "▲" : "▼"}</span>
  
</div>

    {openSection === "seizure" && (
      <div className="card-body">

        <div className="form-group">
          <YesNoToggle label="Seizures" name="seizures" value={formData.seizures} onChange={handleChange} required />
        </div>

        {formData.seizures === "Yes" && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label>Date<span className="required">*</span></label>
                <DatePicker
  selected={formData.seizure_date ? parseDateOnly(formData.seizure_date) : null}
  onChange={(date) =>
    setFormData(prev => ({
      ...prev,
      seizure_date: date ? toDateOnlyValue(date) : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
  className="date-picker-input"
/>
              </div>

              <div className="form-group">
                <label>Type<span className="required">*</span></label>
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
                <label>EEG</label>
                <select name="eeg" value={formData.eeg || ""} onChange={handleChange}>
                  <option value="">-- Select --</option>
                  <option>Not done</option>
                  <option>Normal</option>
                  <option>Abnormal</option>
                </select>
              </div>

              <div className="form-group">
                <YesNoToggle label="AED Required" name="aeds_required" value={formData.aeds_required} onChange={handleChange} />
              </div>
              {formData.aeds_required === "Yes" && (
    <div className="form-group">
      <label>No. of AED<span className="required">*</span></label>
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
  )}
              
            </div>
           {formData.aeds_required === "Yes" && (
  <>

    {/* WHICH AED */}
    <div className="form-group">
      <label>Which AED<span className="required">*</span></label>

      <div className="checkbox-group">
        {[
          "Phenytoin",
          "Phenobarbital",
          "Midazolam",
          "Lorazepam",
          "Pyridoxine",
          "Other"
        ].map((drug) => (
          <label key={drug} className="checkbox-item">
            <input
              type="checkbox"
              checked={formData.aed_type?.includes(drug)}
              onChange={() => {
                const selected = formData.aed_type || [];

                if (selected.includes(drug)) {
                  setFormData(prev => ({
                    ...prev,
                    aed_type: selected.filter(d => d !== drug)
                  }));
                } else {
                  setFormData(prev => ({
                    ...prev,
                    aed_type: [...selected, drug]
                  }));
                }
              }}
            />
            {drug}
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

  </>
)}
{formData.aeds_required === "Yes" && (
  <div className="form-row">

    {/* ETIOLOGY */}
    <div className="form-group">
      <label>Etiology<span className="required">*</span></label>
      <select
        name="etiology"
        value={formData.etiology || ""}
        onChange={handleChange}
      >
        <option value="">-- Select --</option>
        <option>Asphyxia</option>
        <option>Low Na</option>
        <option>Low Ca</option>
        <option>Low K</option>
        <option>Hypoglycemia</option>
        <option>Intracranial bleed / hemorrhage</option>
        <option>Meningitis</option>
        <option>Other</option>
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
)}
          </>
        )}
      </div>
    )}
  </div>

</div>



{/* ================= RESPIRATORY ================= */}
<div className="form-section soft-blue">
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
        Type of Respiratory Support (36 weeks PMA) <span className="required">*</span>
      </label>

      <select
        name="bpd_support_36w"
        value={formData.bpd_support_36w || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="None">None</option>
        <option value="NC ≤ 2L">NC ≤ 2L</option>
        <option value="NC > 2L / CPAP">NC &gt; 2L / CPAP</option>
        <option value="Mechanical ventilation">Mechanical ventilation</option>
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
        <option value="No BPD">No BPD</option>
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

<div className="form-row">

  {/* Oxygen Days */}
  <div className="form-group">
    <label>Oxygen Days</label>

    <input
      type="number"
      name="oxygen_days"
      value={formData.oxygen_days || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="365"
      step="1"
      placeholder="0–365"
    />

    {touched.oxygen_days && errors.oxygen_days && (
      <div className="error-text">{errors.oxygen_days}</div>
    )}
  </div>

  {/* Vent Days */}
  <div className="form-group">
    <label>Ventilation Days</label>

    <input
      type="number"
      name="vent_days"
      value={formData.vent_days || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="365"
      step="1"
      placeholder="0–365"
    />

    {touched.vent_days && errors.vent_days && (
      <div className="error-text">{errors.vent_days}</div>
    )}
  </div>

  {/* CPAP Days */}
  <div className="form-group">
    <label>CPAP Days</label>

    <input
      type="number"
      name="cpap_days"
      value={formData.cpap_days || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="365"
      step="1"
      placeholder="0–365"
    />

    {touched.cpap_days && errors.cpap_days && (
      <div className="error-text">{errors.cpap_days}</div>
    )}
  </div>
</div>
</div>
    )}
  </div>
   {/* ================= RESPIRATORY SUPPORT ================= */}


  {/* ================= RESP SUPPORT ================= */}
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

  {/* CPAP */}
  <div className="form-row">
    <div className="form-group">
      <label>CPAP<span className="required">*</span></label>
      <select value={formData.cpap || ""} disabled>
  <option value="">-- Select --</option>
  <option value="Yes">Yes</option>
  <option value="No">No</option>
</select>
    </div>

    {formData.cpap === "Yes" && (
      <div className="form-group">
  <label>Days</label>
  <input
    type="number"
    value={formData.cpap_days || ""}
    disabled
    placeholder="0–365"
  />
</div>
    )}
  </div>

  {/* NIPPV */}
  <div className="form-row">
    <div className="form-group">
      <label>NIPPV<span className="required">*</span></label>
      <select value={formData.nippv || ""} disabled>
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    {formData.nippv === "Yes" && (
      <div className="form-group">
        <label>Days</label>
        <input
  type="number"
  name="nippv_days"
  value={formData.nippv_days || ""}
  placeholder="0–365"
  min="0"
  max="365"
  step="1"
  onChange={(e) => {
    const value = e.target.value;

    if (value === "") {
      setFormData({ ...formData, nippv_days: "" });
      return;
    }

    if (!/^\d+$/.test(value)) return;

    const num = Number(value);
    if (num < 0 || num > 365) return;

    setFormData({
      ...formData,
      nippv_days: value
    });
  }}
  onBlur={(e) => {
    let num = Number(e.target.value);

    if (num > 365) num = 365;
    if (num < 0) num = 0;

    setFormData({
      ...formData,
      nippv_days: num
    });
  }}
/>
      </div>
    )}
  </div>

  <div className="form-row">
  <div className="form-group">
    <label>HFNC<span className="required">*</span></label>
    <select value={formData.hfnc || ""} disabled>
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.hfnc === "Yes" && (
    <div className="form-group">
      <label>Days</label>
      <input
        type="number"
        name="hfnc_days"
        value={formData.hfnc_days || ""}
        placeholder="0–365"
        min="0"
        max="365"
        step="1"
        onChange={(e) => {
          const value = e.target.value;

          if (value === "") {
            setFormData({ ...formData, hfnc_days: "" });
            return;
          }

          if (!/^\d+$/.test(value)) return;

          const num = Number(value);
          if (num < 0 || num > 365) return;

          setFormData({
            ...formData,
            hfnc_days: value
          });
        }}
        onBlur={(e) => {
          let num = Number(e.target.value);

          if (num > 365) num = 365;
          if (num < 0) num = 0;

          setFormData({
            ...formData,
            hfnc_days: num
          });
        }}
      />
    </div>
  )}
</div>

  {/* Mechanical Ventilation */}
  <div className="form-row">
    <div className="form-group">
      <label><span className="field-num">47.</span> Invasive Mechanical Ventilation<span className="required">*</span></label>
      <select value={formData.invasive_ventilation || ""} disabled>
        <option value="">-- Select --</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>

    {formData.invasive_ventilation === "Yes" && (
      <div className="form-group">
        <label>Days</label>
        <input
  type="number"
  name="imv_days"
  value={formData.imv_days || ""}
  placeholder="0–365"
  min="0"
  max="365"
  step="1"
  onChange={(e) => {
    const value = e.target.value;

    if (value === "") {
      setFormData({ ...formData, imv_days: "" });
      return;
    }

    if (!/^\d+$/.test(value)) return;

    const num = Number(value);
    if (num < 0 || num > 365) return;

    setFormData({
      ...formData,
      imv_days: value
    });
  }}
  onBlur={(e) => {
    let num = Number(e.target.value);

    if (num > 365) num = 365;
    if (num < 0) num = 0;

    setFormData({
      ...formData,
      imv_days: num
    });
  }}
/>
      </div>
    )}
  </div>

<div className="form-row">
  <div className="form-group">
    <label>Nasal Cannula<span className="required">*</span></label>
    <select value={formData.nasal_cannula || ""} disabled>
      <option value="">-- Select --</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.nasal_cannula === "Yes" && (
    <div className="form-group">
      <label>Days</label>
      <input
        type="number"
        name="nasal_cannula_days"
        value={formData.nasal_cannula_days || ""}
        placeholder="0–365"
        min="0"
        max="365"
        step="1"
        onChange={(e) => {
          const value = e.target.value;

          if (value === "") {
            setFormData({ ...formData, nasal_cannula_days: "" });
            return;
          }

          if (!/^\d+$/.test(value)) return;

          const num = Number(value);
          if (num < 0 || num > 365) return;

          setFormData({
            ...formData,
            nasal_cannula_days: value
          });
        }}
        onBlur={(e) => {
          let num = Number(e.target.value);

          if (num > 365) num = 365;
          if (num < 0) num = 0;

          setFormData({
            ...formData,
            nasal_cannula_days: num
          });
        }}
      />
    </div>
  )}
</div>
  {/* Oxygen exposure */}
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

    // ✅ allow empty
    if (value === "") {
      setFormData({ ...formData, oxygen_exposure: "" });
      return;
    }

    // ✅ allow only digits
    if (!/^\d+$/.test(value)) return;

    const num = Number(value);

    // 🚫 block out of range
    if (num < 0 || num > 10000) return;

    setFormData({
      ...formData,
      oxygen_exposure: value
    });
  }}
  onBlur={(e) => {
    let num = Number(e.target.value);

    // ✅ clamp value safely
    if (num > 10000) num = 10000;
    if (num < 0) num = 0;

    setFormData({
      ...formData,
      oxygen_exposure: num
    });
  }}
/>
  </div>
  </div>
    )}
  </div>

   {/* ================= STEROIDS ================= */}
  <div className="card">
    <div className="card-header-row" onClick={() => setOpenSection(openSection === "steroids" ? null : "steroids")}>
      <span>Postnatal Steroids</span>
      <span className={`summary ${getRespStatusClass(formData.postnatal_steroids)}`}>
  <span className="icon">{getRespIcon(formData.postnatal_steroids)}</span>

  {formData.postnatal_steroids || "Not filled"}
</span>
      <span className="arrow">{openSection === "steroids" ? "▲" : "▼"}</span>
    </div>

    {openSection === "steroids" && (
      <div className="card-body">

<div className="form-row">
  <div className="form-group">
    <YesNoToggle label="50. Postnatal Steroids" name="postnatal_steroids" value={formData.postnatal_steroids} onChange={handleChange} required />

    {touched.postnatal_steroids && errors.postnatal_steroids && (
      <div className="error-text">{errors.postnatal_steroids}</div>
    )}
  </div>
</div>

{/* Steroid Details */}
{formData.postnatal_steroids === "Yes" && (
  <>
    <div className="form-row">

      {/* Drug */}
      <div className="form-group">
        <label>
          Drug <span className="required">*</span>
        </label>

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

      {/* Other Drug */}
      {formData.steroid_drug === "Other" && (
        <div className="form-group">
          <label>
            Other Drug <span className="required">*</span>
          </label>

          <input
            type="text"
            name="steroid_drug_other"
            value={formData.steroid_drug_other || ""}
            onChange={(e) => {
              let value = e.target.value;

              // allow only text
              if (/^[A-Za-z\s]*$/.test(value)) {
                setFormData({
                  ...formData,
                  steroid_drug_other: value
                });

                validateRespSupport("steroid_drug_other", value, {
                  ...formData,
                  steroid_drug_other: value
                });
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
    </div>

    <div className="form-row">

      {/* Age */}
      <div className="form-group">
        <label><span className="field-num">51.</span> 
          Age at Steroid (days) <span className="required">*</span>
        </label>

        <input
    type="number"
    value={formData.steroid_age_days || ""}
    disabled
  />

        {touched.age_steroid && errors.age_steroid && (
          <div className="error-text">{errors.age_steroid}</div>
        )}
      </div>

      {/* Dose */}
      <div className="form-group">
        <label><span className="field-num">201.</span> 
          Cumulative Dose (mg/kg) <span className="required">*</span>
        </label>

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

            if (value === "") {
              setFormData({ ...formData, steroid_dose: "" });
              return;
            }

            if (!/^\d*\.?\d*$/.test(value)) return;

            const num = Number(value);
            if (num < 0 || num > 300) return;

            setFormData({
              ...formData,
              steroid_dose: value
            });
          }}
          onBlur={handleBlur}
        />

        {touched.steroid_dose && errors.steroid_dose && (
          <div className="error-text">{errors.steroid_dose}</div>
        )}
      </div>
    </div>

    <div className="form-row">

      {/* Indication */}
      <div className="form-group">
        <label>
          Indication <span className="required">*</span>
        </label>

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

      {/* Other Indication */}
      {formData.steroid_indication === "Other" && (
        <div className="form-group">
          <label>
            Specify Other <span className="required">*</span>
          </label>

          <input
            type="text"
            name="steroid_indication_other"
            value={formData.steroid_indication_other || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          />

          {touched.steroid_indication_other &&
            errors.steroid_indication_other && (
              <div className="error-text">
                {errors.steroid_indication_other}
              </div>
            )}
        </div>
      )}
    </div>
  </>
)}</div>

)}
  </div>
  {/* ================= OTHER RESP ================= */}
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


{/* Pulmonary Hemorrhage */}
<div className="form-group">
  <label><span className="field-num">56.</span> 
    Pulmonary Hemorrhage <span className="required">*</span>
  </label>

  <select
    name="pulmonary_hemorrhage"
    value={formData.pulmonary_hemorrhage || ""}
    onChange={handleChange}
    onBlur={handleBlur}
    disabled
  >
    <option value="">-- Select --</option>
    <option value="Yes">Yes</option>
    <option value="No">No</option>
  </select>

  {touched.pulmonary_hemorrhage && errors.pulmonary_hemorrhage && (
    <div className="error-text">{errors.pulmonary_hemorrhage}</div>
  )}
</div>

{/* Pneumothorax */}
<div className="form-group">
  <label>
    Pneumothorax <span className="required">*</span>
  </label>

  <select
  name="pneumothorax"
  value={formData.pneumothorax || ""}
  onChange={handleChange}
  disabled
>
    <option value="">-- Select --</option>
    <option value="Yes">Yes</option>
    <option value="No">No</option>
  </select>

  {touched.pneumothorax && errors.pneumothorax && (
    <div className="error-text">{errors.pneumothorax}</div>
  )}
</div>

{/* Conditional section */}
{formData.pneumothorax === "Yes" && (
  <div className="followup-box">

    {/* Side */}
    <div className="form-group">
      <label>
        Side <span className="required">*</span>
      </label>

      <select
        name="pneumothorax_side"
        value={formData.pneumothorax_side || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="Right">Right</option>
        <option value="Left">Left</option>
        <option value="Both">Both</option>
      </select>

      {touched.pneumothorax_side && errors.pneumothorax_side && (
        <div className="error-text">{errors.pneumothorax_side}</div>
      )}
    </div>

    {/* Chest Drain */}
    <div className="form-group">
      <label><span className="field-num">59.</span> 
        Chest drain <span className="required">*</span>
      </label>

      <select
  name="chest_drain"
  value={formData.chest_drain || ""}
  onChange={handleChange}
  disabled
>
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>

      {touched.chest_drain && errors.chest_drain && (
        <div className="error-text">{errors.chest_drain}</div>
      )}
    </div>
  </div>
)}

{/* Pulmonary Hypertension */}
<div className="form-group">
  <label>
    Pulmonary Hypertension <span className="required">*</span>
  </label>

  <select
  name="pulmonary_hypertension"
  value={formData.pulmonary_hypertension || ""}
  onChange={handleChange} disabled
>
    <option value="">-- Select --</option>
    <option value="Yes">Yes</option>
    <option value="No">No</option>
  </select>

  {touched.pulmonary_htn && errors.pulmonary_htn && (
    <div className="error-text">{errors.pulmonary_htn}</div>
  )}
</div></div>
    )}
  </div>
 {/* ================= RX ================= */}
  <div className="card">
    <div className="card-header-row" onClick={() => setOpenSection(openSection === "rx" ? null : "rx")}>
      <span>Rx</span>
      <span className="summary">
  {formData.rx_sildenafil || formData.rx_ino
    ? "Treatment Given"
    : "Not filled"}
</span>
      <span className="arrow">{openSection === "rx" ? "▲" : "▼"}</span>
    </div>

    {openSection === "rx" && (
      <div className="card-body">

<div className="rx-card">

  <p className="rx-subtitle">
    Select treatment given
  </p>

  <div className="rx-grid">

    <label className="rx-option">
      <input
        type="checkbox"
        name="rx_sildenafil"
        checked={formData.rx_sildenafil || false}
        onChange={handleChange}
      />
      <span>Sildenafil</span>
    </label>

    <label className="rx-option">
      <input
        type="checkbox"
        name="rx_ino"
        checked={formData.rx_ino || false}
        onChange={handleChange}
      />
      <span>iNO</span>
    </label>
      <label className="rx-option">
    <input
      type="checkbox"
      name="rx_vaso"
      checked={formData.rx_vaso || false}
      onChange={handleChange}
    />
    <span>Vasopressin</span>
  </label>

  {/* 🔥 NEW */}
  <label className="rx-option">
    <input
      type="checkbox"
      name="rx_miliri"
      checked={formData.rx_miliri || false}
      onChange={handleChange}
    />
    <span>Milrinone</span>
  </label>

    <label className="rx-option">
      <input
        type="checkbox"
        name="rx_other"
        checked={formData.rx_other || false}
        onChange={handleChange}
      />
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
)}</div>
    )}
  </div>

 {/* ================= EXTUBATION ================= */}
  <div className="card">
    <div className="card-header-row" onClick={() => setOpenSection(openSection === "extubation" ? null : "extubation")}>
      <span>Extubation Failure</span>
      <span className={`summary ${getRespStatusClass(formData.extubation_failure)}`}>
  <span className="icon">{getRespIcon(formData.extubation_failure)}</span>

  {formData.extubation_failure || "Not filled"}
</span>
      <span className="arrow">{openSection === "extubation" ? "▲" : "▼"}</span>
    </div>

    {openSection === "extubation" && (
      <div className="card-body">

<div className="form-row">
  
  <div className="form-group">
    <YesNoToggle label="62. Extubation Failure" name="extubation_failure" value={formData.extubation_failure} onChange={handleChange} />
  </div>

  <div className="form-group">
    <label>Episodes</label>
    <input
      type="number"
      name="extubation_episodes"
      value={formData.extubation_episodes || ""}
      onChange={handleChange}
      placeholder="Number of episodes"
      disabled={formData.extubation_failure !== "Yes"}
    />
  </div>

</div></div>
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

<div className="form-row">

  {/* Apnea */}
  <div className="form-group">
    <YesNoToggle label="Apnea of Prematurity" name="apnea" value={formData.apnea} onChange={handleChange} onBlur={handleBlur} required />

    {touched.apnea && errors.apnea && (
      <div className="error-text">{errors.apnea}</div>
    )}
  </div>

  {/* Onset Age */}
  {formData.apnea === "Yes" && (
    <div className="form-group">
      <label>
        Age at onset (days) <span className="required">*</span>
      </label>

      <input
        type="number"
        name="apnea_onset_age"
        value={formData.apnea_onset_age || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="60"
        step="1"
        placeholder="0–60"
      />

      {touched.apnea_onset_age && errors.apnea_onset_age && (
        <div className="error-text">{errors.apnea_onset_age}</div>
      )}
    </div>
  )}
</div>

<div className="form-row">

  {/* Caffeine */}
  <div className="form-group">
    <YesNoToggle label="Caffeine used" name="caffeine_used" value={formData.caffeine_used} onChange={handleChange} onBlur={handleBlur} required />

    {touched.caffeine_used && errors.caffeine_used && (
      <div className="error-text">{errors.caffeine_used}</div>
    )}
  </div>

  {/* Duration */}
  {formData.caffeine_used === "Yes" && (
    <div className="form-group">
      <label>
        Caffeine duration (days) <span className="required">*</span>
      </label>

      <input
        type="number"
        name="caffeine_duration"
        value={formData.caffeine_duration || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="60"
        step="1"
        placeholder="0–60"
      />

      {touched.caffeine_duration && errors.caffeine_duration && (
        <div className="error-text">{errors.caffeine_duration}</div>
      )}
    </div>
  )}
</div> </div>
    )}
  </div>
   

  


</div>



{/* ================= GASTROINTESTINAL ================= */}
<div className="form-section soft-blue">
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

  <div className="form-row">
    <div className="form-group">
      <YesNoToggle label="68. Feed Intolerance" name="feed_intolerance" value={formData.feed_intolerance} onChange={handleChange} />
    </div>
  </div>

  {formData.feed_intolerance === "Yes" && (
    <div className="fi-card">
      <p className="fi-subtitle">If 'Yes', specify:</p>

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
      </div>
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

<div className="form-group">
  <YesNoToggle label="NEC Diagnosed" name="nec" value={formData.nec} onChange={handleChange} onBlur={handleBlur} required />

  {touched.nec && errors.nec && (
    <div className="error-text">{errors.nec}</div>
  )}
</div>

{formData.nec === "Yes" && (
  <>
    <div className="form-group">
      <label>
        Stage <span className="required">*</span>
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
          Date of diagnosis <span className="required">*</span>
        </label>

        <input
          type="date"
          name="nec_date"
          value={formData.nec_date || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />

        {touched.nec_date && errors.nec_date && (
          <div className="error-text">{errors.nec_date}</div>
        )}
      </div>

      <div className="form-group">
        <label>
          Age at diagnosis (days) <span className="required">*</span>
        </label>

        <input
          type="number"
          name="nec_age_days"
          value={formData.nec_age_days || ""}
          placeholder="0–120"
          onChange={handleChange}
          onBlur={handleBlur}
        />

        {touched.nec_age_days && errors.nec_age_days && (
          <div className="error-text">{errors.nec_age_days}</div>
        )}
      </div>
    </div>

    <div className="form-group">
      <YesNoToggle label="Surgery required" name="nec_surgery" value={formData.nec_surgery} onChange={handleChange} onBlur={handleBlur} required />

      {touched.nec_surgery && errors.nec_surgery && (
        <div className="error-text">{errors.nec_surgery}</div>
      )}
    </div>

    {formData.nec_surgery === "Yes" && (
      <>
        <div className="form-group">
          <label>
            Type of surgery <span className="required">*</span>
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

        <div className="form-row">
          <div className="form-group">
            <YesNoToggle label="Resection" name="nec_resection" value={formData.nec_resection} onChange={handleChange} onBlur={handleBlur} required />

            {touched.nec_resection && errors.nec_resection && (
              <div className="error-text">{errors.nec_resection}</div>
            )}
          </div>

          {formData.nec_resection === "Yes" && (
            <div className="form-group">
              <label>
                Resection Length (cm) <span className="required">*</span>
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
          <YesNoToggle label="Stoma" name="nec_stoma" value={formData.nec_stoma} onChange={handleChange} onBlur={handleBlur} required />

          {touched.nec_stoma && errors.nec_stoma && (
            <div className="error-text">{errors.nec_stoma}</div>
          )}
        </div>
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
    <span>Feeding & Nutrition</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.pn)}`}>
        <span className="icon">{getStatusIcon(formData.pn)}</span>
        {getFeedingSummary()}
      </span></div>
      <span className="arrow">{openSection === "feeding" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "feeding" && (
    <div className="card-body">

{/* ---------------- BASIC FIELDS ---------------- */}
<div className="form-row">
  <div className="form-group">
    <label><span className="field-num">150.</span> Age at 1st enteral feed (days)</label>
    <input
      type="number"
      name="age_first_feed"
      value={formData.age_first_feed || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="60"
    />
    {errors.age_first_feed && <div className="error-text">{errors.age_first_feed}</div>}
  </div>

  <div className="form-group">
    <label><span className="field-num">151.</span> Age at full feeds (days)</label>
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
    <label><span className="field-num">152.</span> PDHM (days)</label>
    <input
      type="number"
      name="pdhm_days"
      value={formData.pdhm_days || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="365"
    />
    {errors.pdhm_days && <div className="error-text">{errors.pdhm_days}</div>}
  </div>

  <div className="form-group">
    <label>EBM (days)</label>
    <input
      type="number"
      name="ebm_days"
      value={formData.ebm_days || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="365"
    />
    {errors.ebm_days && <div className="error-text">{errors.ebm_days}</div>}
  </div>

  <div className="form-group">
    <label>Formula milk (days)</label>
    <input
      type="number"
      name="fm_days"
      value={formData.fm_days || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="0"
      max="365"
    />
    {errors.fm_days && <div className="error-text">{errors.fm_days}</div>}
  </div>
</div>

{/* ---------------- PN ---------------- */}
<div className="form-group">
  <YesNoToggle label="Parenteral Nutrition (PN)" name="pn" value={formData.pn} onChange={handleChange} onBlur={handleBlur} required />
  {errors.pn && <div className="error-text">{errors.pn}</div>}
</div>

{formData.pn === "Yes" && (
  <>
    <div className="form-group">
      <label>Total PN days</label>
      <input
        type="number"
        name="pn_days"
        value={formData.pn_days || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="365"
      />
      {errors.pn_days && <div className="error-text">{errors.pn_days}</div>}
    </div>

    {/* ---------------- PN ADVERSE ---------------- */}
    <div className="pn-adverse-card">
      <YesNoToggle label="157. Adverse Effects of PN" name="pn_adverse" value={formData.pn_adverse} onChange={handleChange} />

      {formData.pn_adverse === "Yes" && (
        <>
          <div className="adverse-title">Select adverse effects *</div>

          <div className="pn-checkbox-grid">
            <label><input type="checkbox" name="pn_cholestasis" checked={formData.pn_cholestasis || false} onChange={handleChange}/> Cholestasis</label>
            <label><input type="checkbox" name="pn_electrolyte" checked={formData.pn_electrolyte || false} onChange={handleChange}/> Electrolyte imbalance</label>
            <label><input type="checkbox" name="pn_acidosis" checked={formData.pn_acidosis || false} onChange={handleChange}/> Acidosis</label>
            <label><input type="checkbox" name="pn_hypercapnia" checked={formData.pn_hypercapnia || false} onChange={handleChange}/> Hypercapnia</label>
            <label><input type="checkbox" name="pn_other" checked={formData.pn_other || false} onChange={handleChange}/> Other</label>
          </div>

          {/* ✅ STEP 3 ERROR */}
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
      <YesNoToggle label="Probiotic" name="probiotic" value={formData.probiotic} onChange={handleChange} required />

      {formData.probiotic === "Yes" && (
        <>
          <div className="adverse-title">Select strain type *</div>

          <div className="pn-checkbox-grid">
            <label><input type="checkbox" name="strain_mono" checked={formData.strain_mono || false} onChange={handleChange}/> Mono</label>
            <label><input type="checkbox" name="strain_bi" checked={formData.strain_bi || false} onChange={handleChange}/> Bi</label>
            <label><input type="checkbox" name="strain_multi" checked={formData.strain_multi || false} onChange={handleChange}/> Multi</label>
          </div>

          {/* ✅ STEP 3 ERROR */}
          {errors.strain_group && (
            <div className="error-text">{errors.strain_group}</div>
          )}
        </>
      )}
    </div>

    {/* ---------------- CHOLESTASIS ---------------- */}
    <div className="form-group">
      <YesNoToggle label="Cholestasis" name="cholestasis" value={formData.cholestasis} onChange={handleChange} onBlur={handleBlur} required />

      {errors.cholestasis && (
        <div className="error-text">{errors.cholestasis}</div>
      )}
    </div>

    {formData.cholestasis === "Yes" && (
      <div className="form-row">
        <div className="form-group">
          <YesNoToggle label="164. TPN Associated" name="tpn_associated" value={formData.tpn_associated} onChange={handleChange} />
        </div>

        <div className="form-group">
          <label><span className="field-num">165.</span> Max Direct Bilirubin</label>
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
<div className="form-section soft-blue">
  <h3><Activity size={17} className="sec-icon" /> <span className="sec-num">H4</span> METABOLIC</h3>
  <div className="pn-adverse-card">
  <h4>Metabolic Disturbances</h4>
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "hypo" ? null : "hypo")}
  >
    <span>Hypoglycemia</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.hypoglycemia)}`}>
        <span className="icon">{getStatusIcon(formData.hypoglycemia)}</span>

        {formData.hypoglycemia === "Yes"
          ? formData.hypoglycemia_lowest
            ? `${formData.hypoglycemia_lowest} mg/dL`
            : "Yes"
          : formData.hypoglycemia || "Not filled"}
      </span>
</div>
      <span className="arrow">{openSection === "hypo" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "hypo" && (
    <div className="card-body">
{/* ---------------- HYPOGLYCEMIA ---------------- */}
<div className="form-row">
  <div className="form-group">
    <YesNoToggle label="Hypoglycemia (required treatment)" name="hypoglycemia" value={formData.hypoglycemia} onChange={handleChange} onBlur={handleBlur} required />

    {errors.hypoglycemia && (
      <div className="error-text">{errors.hypoglycemia}</div>
    )}
  </div>

  {formData.hypoglycemia === "Yes" && (
    <div className="form-group">
      <label>
        Lowest glucose (mg/dL) <span className="required">*</span>
      </label>

      <input
        type="number"
        name="hypoglycemia_lowest"
        value={formData.hypoglycemia_lowest || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="200"
        placeholder="0–200"
      />

      {errors.hypoglycemia_lowest && (
        <div className="error-text">{errors.hypoglycemia_lowest}</div>
      )}
    </div>
  )}
</div>
   </div>
  )}
</div>


{/* ---------------- HYPERGLYCEMIA ---------------- */}

<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "hyper" ? null : "hyper")}
  >
    <span>Hyperglycemia</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.hyperglycemia)}`}>
        <span className="icon">{getStatusIcon(formData.hyperglycemia)}</span>

        {formData.hyperglycemia === "Yes"
          ? formData.hyperglycemia_highest
            ? `${formData.hyperglycemia_highest} mg/dL`
            : "Yes"
          : formData.hyperglycemia || "Not filled"}
      </span>
</div>
      <span className="arrow">{openSection === "hyper" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "hyper" && (
    <div className="card-body">
<div className="form-row">
  <div className="form-group">
    <YesNoToggle label="Hyperglycemia (required insulin)" name="hyperglycemia" value={formData.hyperglycemia} onChange={handleChange} onBlur={handleBlur} required />

    {errors.hyperglycemia && (
      <div className="error-text">{errors.hyperglycemia}</div>
    )}
  </div>

  {formData.hyperglycemia === "Yes" && (
    <div className="form-group">
      <label>
        Highest glucose (mg/dL) <span className="required">*</span>
      </label>

      <input
        type="number"
        name="hyperglycemia_highest"
        value={formData.hyperglycemia_highest || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="500"
        placeholder="0–500"
      />

      {errors.hyperglycemia_highest && (
        <div className="error-text">{errors.hyperglycemia_highest}</div>
      )}
    </div>
  )}
</div>
</div>
  )}
</div>
{/* ---------------- METABOLIC ACIDOSIS ---------------- */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "acid" ? null : "acid")}
  >
    <span>Metabolic Acidosis</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.metabolic_acidosis)}`}>
        <span className="icon">{getStatusIcon(formData.metabolic_acidosis)}</span>
        {formData.metabolic_acidosis || "Not filled"}
      </span>
</div>
      <span className="arrow">{openSection === "acid" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "acid" && (
    <div className="card-body">
<div className="form-group">
  <YesNoToggle label="174. Metabolic Acidosis (pH &lt; 7.2)" name="metabolic_acidosis" value={formData.metabolic_acidosis} onChange={handleChange} onBlur={handleBlur} required />

  {errors.metabolic_acidosis && (
    <div className="error-text">{errors.metabolic_acidosis}</div>
  )}
</div>
</div>
  )}
</div>
{/* ---------------- DYSELECTROLYTEMIA ---------------- */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "dys" ? null : "dys")}
  >
    <span>Dyselectrolytemia</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.dyselectrolytemia)}`}>
        <span className="icon">{getStatusIcon(formData.dyselectrolytemia)}</span>
        {getDyselectroSummary()}
      </span>
</div>
      <span className="arrow">{openSection === "dys" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "dys" && (
    <div className="card-body">
<div className="pn-adverse-card">

  <div className="form-group">
    <YesNoToggle label="Dyselectrolytemia" name="dyselectrolytemia" value={formData.dyselectrolytemia} onChange={handleChange} onBlur={handleBlur} required />

    {errors.dyselectrolytemia && (
      <div className="error-text">{errors.dyselectrolytemia}</div>
    )}
  </div>

  {formData.dyselectrolytemia === "Yes" && (
    <>
      <div className="adverse-title">
        Select electrolyte abnormality <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="dyselectro_na"
            checked={formData.dyselectro_na || false}
            onChange={handleChange}
          />
          Sodium abnormality
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="dyselectro_k"
            checked={formData.dyselectro_k || false}
            onChange={handleChange}
          />
          Potassium abnormality
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="dyselectro_ca"
            checked={formData.dyselectro_ca || false}
            onChange={handleChange}
          />
          Calcium abnormality
        </label>

      </div>

      {/* ✅ GROUP ERROR */}
      {errors.dyselectro_group && (
        <div className="error-text">{errors.dyselectro_group}</div>
      )}
    </>
  )}
</div>
</div>
  )}
</div>

{/* ---------------- OSTEOPENIA ---------------- */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "osteo" ? null : "osteo")}
  >
    <span>Osteopenia</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.osteopenia)}`}>
        <span className="icon">{getStatusIcon(formData.osteopenia)}</span>

        {formData.osteopenia === "Yes"
          ? formData.alp_peak
            ? `ALP ${formData.alp_peak}`
            : "Yes"
          : formData.osteopenia || "Not filled"}
      </span>
</div>
      <span className="arrow">{openSection === "osteo" ? "▲" : "▼"}</span>
    
  </div>

  {openSection === "osteo" && (
    <div className="card-body">
<div className="form-group">
  <YesNoToggle label="Osteopenia" name="osteopenia" value={formData.osteopenia} onChange={handleChange} onBlur={handleBlur} required />

  {errors.osteopenia && (
    <div className="error-text">{errors.osteopenia}</div>
  )}
</div>

{formData.osteopenia === "Yes" && (
  <div className="form-row">

    <div className="form-group">
      <label>
        Alkaline Phosphatase Peak (IU/L) <span className="required">*</span>
      </label>

      <input
        type="number"
        name="alp_peak"
        value={formData.alp_peak || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="5000"
        placeholder="0–5000"
      />

      {errors.alp_peak && (
        <div className="error-text">{errors.alp_peak}</div>
      )}
    </div>

    <div className="form-group">
      <label>
        Lowest calcium <span className="required">*</span>
      </label>

      <input
        type="number"
        step="0.1"
        name="lowest_calcium"
        value={formData.lowest_calcium || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="15"
        placeholder="0–15"
      />

      {errors.lowest_calcium && (
        <div className="error-text">{errors.lowest_calcium}</div>
      )}
    </div>

    <div className="form-group">
      <label>
        Lowest phosphorus <span className="required">*</span>
      </label>

      <input
        type="number"
        step="0.1"
        name="lowest_phosphorus"
        value={formData.lowest_phosphorus || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        min="0"
        max="15"
        placeholder="0–15"
      />

      {errors.lowest_phosphorus && (
        <div className="error-text">{errors.lowest_phosphorus}</div>
      )}
    </div>

  </div>
)}
</div>
    )}
  </div>
</div>
</div>

{/* ================= PDA ================= */}
<div className="form-section soft-blue">

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
            <label>Specify <span className="required">*</span></label>
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

<div className="pn-adverse-card">

  {/* HS-PDA */}
  <div className="form-group">
    <YesNoToggle label="HS-PDA" name="hs_pda" value={formData.hs_pda} onChange={handleChange} onBlur={handleBlur} required />

    {errors.hs_pda && (
      <div className="error-text">{errors.hs_pda}</div>
    )}
  </div>

  {formData.hs_pda === "Yes" && (
    <>

      {/* ---------------- DIAGNOSIS ---------------- */}
      <div className="adverse-title">
        Diagnosed by <span className="required">*</span>
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

      {/* ✅ GROUP ERROR */}
      {errors.pda_diagnosis_group && (
        <div className="error-text">{errors.pda_diagnosis_group}</div>
      )}

      {/* ---------------- CLINICAL FEATURES ---------------- */}
      {formData.pda_clinical && (
        <>
          <div className="adverse-title">Clinical Features</div>

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
              Other
            </label>

          </div>

          {formData.pda_other_feature && (
            <div className="form-group">
              <label>Specify Other <span className="required">*</span></label>

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
          <div className="adverse-title">Echo Details</div>

          <div className="form-row">

            <div className="form-group">
              <label>TDD</label>
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
              <label><span className="field-num">192.</span> Ductal peak velocity</label>
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
            Pattern <span className="required">*</span>
          </div>

          <div className="pn-checkbox-grid">

            <label><input type="checkbox" name="pda_pattern_growing" checked={formData.pda_pattern_growing || false} onChange={handleChange}/> Growing</label>
            <label><input type="checkbox" name="pda_pattern_pulsatile" checked={formData.pda_pattern_pulsatile || false} onChange={handleChange}/> Pulsatile</label>
            <label><input type="checkbox" name="pda_pattern_none" checked={formData.pda_pattern_none || false} onChange={handleChange}/> None</label>

          </div>

          {errors.pda_pattern_group && (
            <div className="error-text">{errors.pda_pattern_group}</div>
          )}

          <div className="form-row">

            <div className="form-group">
              <label><span className="field-num">194.</span> Shunt across PDA <span className="required">*</span></label>
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
              <label>LA : Ao</label>
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
              <YesNoToggle label="196. Systemic steal" name="pda_systemic_steal" value={formData.pda_systemic_steal} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label><span className="field-num">197.</span> LPA velocity</label>
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
        <YesNoToggle label="Medical Rx" name="pda_medical_rx" value={formData.pda_medical_rx} onChange={handleChange} />
      </div>

      {formData.pda_medical_rx === "Yes" && (
        <>
          <div className="adverse-title">
            Agent <span className="required">*</span>
          </div>

          <div className="pn-checkbox-grid">
            <label><input type="checkbox" name="pda_indo" checked={formData.pda_indo || false} onChange={handleChange}/> Indo</label>
            <label><input type="checkbox" name="pda_ibu" checked={formData.pda_ibu || false} onChange={handleChange}/> Ibu</label>
            <label><input type="checkbox" name="pda_pcm" checked={formData.pda_pcm || false} onChange={handleChange}/> PCM</label>
          </div>

          {errors.pda_medical_group && (
            <div className="error-text">{errors.pda_medical_group}</div>
          )}

          <div className="form-group">
            <label>Courses</label>
            <input
              type="number"
              name="pda_courses"
              value={formData.pda_courses || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              min="0"
              max="10"
            />
            {errors.pda_courses && <div className="error-text">{errors.pda_courses}</div>}
          </div>
        </>
      )}

      {/* ---------------- LIGATION ---------------- */}
      <div className="form-row">

        <div className="form-group">
          <YesNoToggle label="Ligation" name="pda_ligation" value={formData.pda_ligation} onChange={handleChange} />
        </div>

        {formData.pda_ligation === "Yes" && (
          <div className="form-group">
            <label>
              Age (days) <span className="required">*</span>
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

<div className="pn-adverse-card">

  <div className="form-row">

    {/* Shock */}
    <div className="form-group">
      <YesNoToggle label="Shock" name="shock" value={formData.shock} onChange={handleChange} onBlur={handleBlur} required />
      {errors.shock && <div className="error-text">{errors.shock}</div>}
    </div>

    {/* Hypotension */}
    <div className="form-group">
      <YesNoToggle label="Hypotension" name="hypotension" value={formData.hypotension} onChange={handleChange} onBlur={handleBlur} required />
      {errors.hypotension && (
        <div className="error-text">{errors.hypotension}</div>
      )}
    </div>

  </div>

  {/* Hypotension Type */}
  {formData.hypotension === "Yes" && (
    <>
      <div className="adverse-title">
        Hypotension Type <span className="required">*</span>
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

      {/* ✅ GROUP ERROR */}
      {errors.hypotension_group && (
        <div className="error-text">{errors.hypotension_group}</div>
      )}
    </>
  )}

  {/* BP Values */}
  <div style={{ marginTop: "20px" }}>
    <div className="adverse-title">
      Record the lowest BP during hospital course
    </div>

    <div className="form-row">

      <div className="form-group">
        <label><span className="field-num">207.</span> SBP (mmHg)</label>
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
        <label><span className="field-num">208.</span> DBP (mmHg)</label>
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
        <label><span className="field-num">209.</span> MAP (mmHg)</label>
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
      <YesNoToggle label="210. Required Fluid Bolus" name="fluid_bolus" value={formData.fluid_bolus} onChange={handleChange} onBlur={handleBlur} required />
      {errors.fluid_bolus && (
        <div className="error-text">{errors.fluid_bolus}</div>
      )}
    </div>

    {formData.fluid_bolus === "Yes" && (
      <div className="form-group">
        <label>No. of Boluses <span className="required">*</span></label>
        <input
          type="number"
          name="fluid_bolus_number"
          value={formData.fluid_bolus_number || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="10"
        />
        {errors.fluid_bolus_number && (
          <div className="error-text">{errors.fluid_bolus_number}</div>
        )}
      </div>
    )}

  </div>

  {/* Inotropes */}
  <div className="form-group">
    <YesNoToggle label="Inotropes Required" name="inotropes" value={formData.inotropes} onChange={handleChange} onBlur={handleBlur} required />
    {errors.inotropes && (
      <div className="error-text">{errors.inotropes}</div>
    )}
  </div>

  {formData.inotropes === "Yes" && (
    <>
      <div className="adverse-title">
        Inotrope Agents <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label><input type="checkbox" name="inotrope_dopa" checked={formData.inotrope_dopa || false} onChange={handleChange}/> Dopa</label>
        <label><input type="checkbox" name="inotrope_dobu" checked={formData.inotrope_dobu || false} onChange={handleChange}/> Dobu</label>
        <label><input type="checkbox" name="inotrope_adr" checked={formData.inotrope_adr || false} onChange={handleChange}/> Adr</label>
        <label><input type="checkbox" name="inotrope_nadr" checked={formData.inotrope_nadr || false} onChange={handleChange}/> NAdr</label>
        <label><input type="checkbox" name="inotrope_milri" checked={formData.inotrope_milri || false} onChange={handleChange}/> Milri</label>
        <label><input type="checkbox" name="inotrope_vaso" checked={formData.inotrope_vaso || false} onChange={handleChange}/> Vaso</label>

      </div>

      {/* ✅ GROUP ERROR */}
      {errors.inotrope_group && (
        <div className="error-text">{errors.inotrope_group}</div>
      )}

      <div style={{ marginTop: "20px" }}>
        <div className="form-row">

          <div className="form-group">
            <label>Duration (days) <span className="required">*</span></label>
            <input
              type="number"
              name="inotrope_duration"
              value={formData.inotrope_duration || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              min="0"
              max="60"
            />
            {errors.inotrope_duration && (
              <div className="error-text">{errors.inotrope_duration}</div>
            )}
          </div>

          <div className="form-group">
            <label><span className="field-num">71.</span> VIS Score <span className="required">*</span></label>
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
    <YesNoToggle label="Hydrocortisone for BP" name="hydrocortisone_bp" value={formData.hydrocortisone_bp} onChange={handleChange} onBlur={handleBlur} required />
    {errors.hydrocortisone_bp && (
      <div className="error-text">{errors.hydrocortisone_bp}</div>
    )}
  </div>

  {formData.hydrocortisone_bp === "Yes" && (
    <>
      <div className="adverse-title">
        Timing <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label><input type="checkbox" name="hc_first_drug" checked={formData.hc_first_drug || false} onChange={handleChange}/> First drug</label>
        <label><input type="checkbox" name="hc_after_first" checked={formData.hc_after_first || false} onChange={handleChange}/> After first</label>
        <label><input type="checkbox" name="hc_after_second" checked={formData.hc_after_second || false} onChange={handleChange}/> After second</label>

      </div>

      {/* ✅ GROUP ERROR */}
      {errors.hc_group && (
        <div className="error-text">{errors.hc_group}</div>
      )}
    </>
  )}

</div>

</div>
  )}
</div></div>

{/* ================= HEMATOLOGY ================= */}
<div className="form-section soft-blue">

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
  

    {/* Jaundice */}
    
     <h4>Jaundice / Hyperbilirubinemia</h4>

{/* ---------------- TYPE ---------------- */}
<div className="form-group">
  <label>Type <span className="required">*</span></label>
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
        <label>Onset date <span className="required">*</span></label>
        <input
          type="date"
          name="jaundice_onset"
          value={formData.jaundice_onset || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.jaundice_onset && (
          <div className="error-text">{errors.jaundice_onset}</div>
        )}
      </div>

      <div className="form-group">
        <label><span className="field-num">77.</span> Passive date</label>
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
        <label><span className="field-num">78.</span> Peak TSB (mg/dL) <span className="required">*</span></label>
        <input
          type="number"
          name="peak_tsb"
          value={formData.peak_tsb || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="50"
        />
        {errors.peak_tsb && (
          <div className="error-text">{errors.peak_tsb}</div>
        )}
      </div>

      <div className="form-group">
        <YesNoToggle label="BIND" name="bind" value={formData.bind} onChange={handleChange} onBlur={handleBlur} required />
        {errors.bind && <div className="error-text">{errors.bind}</div>}
      </div>

    </div>

    <div className="form-row">

      <div className="form-group">
        <YesNoToggle label="Phototherapy" name="phototherapy" value={formData.phototherapy} onChange={handleChange} onBlur={handleBlur} required />
        {errors.phototherapy && (
          <div className="error-text">{errors.phototherapy}</div>
        )}
      </div>

      <div className="form-group">
        <YesNoToggle label="DVET" name="dvet" value={formData.dvet} onChange={handleChange} onBlur={handleBlur} required />
        {errors.dvet && <div className="error-text">{errors.dvet}</div>}
      </div>

    </div>

    {formData.dvet === "Yes" && (
      <div className="form-group">
        <label>Number of DVET <span className="required">*</span></label>
        <input
          type="number"
          name="dvet_number"
          value={formData.dvet_number || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="1"
          max="10"
        />
        {errors.dvet_number && (
          <div className="error-text">{errors.dvet_number}</div>
        )}
      </div>
    )}

    <div className="form-group">
      <YesNoToggle label="IVIG" name="ivig" value={formData.ivig} onChange={handleChange} onBlur={handleBlur} required />
      {errors.ivig && <div className="error-text">{errors.ivig}</div>}
    </div>

    <div className="form-group">
    <label>Etiology <span className="required">*</span></label>

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
    <label>Etiology <span className="required">*</span></label>

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
</div>
  )}
</div>
{/* ---------------- ANEMIA ---------------- */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "anemia" ? null : "anemia")}
  >
    <span>Anemia</span>

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
  <YesNoToggle label="Anemia" name="anemia" value={formData.anemia} onChange={handleChange} onBlur={handleBlur} required />
  {errors.anemia && <div className="error-text">{errors.anemia}</div>}
</div>

{formData.anemia === "Yes" && (
  <>
    <div className="form-row">

      <div className="form-group">
        <label>Age at onset (days) <span className="required">*</span></label>
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
        <label><span className="field-num">88.</span> Lowest Hb / Hct <span className="required">*</span></label>
        <input
          type="number"
          name="lowest_hb"
          value={formData.lowest_hb || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="0"
          max="25"
        />
        {errors.lowest_hb && (
          <div className="error-text">{errors.lowest_hb}</div>
        )}
      </div>

    </div>

    <div className="form-group">
      <label>Symptoms <span className="required">*</span></label>
      <select
        name="anemia_chf"
        value={formData.anemia_chf || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <option value="">-- Select --</option>
        <option value="Yes">Asymptomatic</option>
        <option value="No">Congestive Heart Failure</option>
      </select>
      {errors.anemia_chf && (
        <div className="error-text">{errors.anemia_chf}</div>
      )}
    </div>

    <div className="form-group">
      <label>Etiology <span className="required">*</span></label>
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
    
     <h4>Transfusions</h4>

{/* ---------------- PRBC ---------------- */}
<div className="form-group">
  <YesNoToggle label="PRBC" name="prbc" value={formData.prbc} onChange={handleChange} onBlur={handleBlur} required />
  {errors.prbc && <div className="error-text">{errors.prbc}</div>}
</div>

{formData.prbc === "Yes" && (
  <>
    <div className="form-row">

      <div className="form-group">
        <label><span className="field-num">97.</span> Number of Transfusions <span className="required">*</span></label>
        <input
          type="number"
          name="prbc_number"
          value={formData.prbc_number || ""}
          onChange={handleChange}
          onBlur={handleBlur}
          min="1"
          max="50"
        />
        {errors.prbc_number && (
          <div className="error-text">{errors.prbc_number}</div>
        )}
      </div>

      <div className="form-group">
        <label><span className="field-num">93.</span> Cumulative volume (ml/kg) <span className="required">*</span></label>
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
        <YesNoToggle label="98. CMV screened" name="cmv_screened" value={formData.cmv_screened} onChange={handleChange} onBlur={handleBlur} required />
        {errors.cmv_screened && (
          <div className="error-text">{errors.cmv_screened}</div>
        )}
      </div>

      <div className="form-group">
        <YesNoToggle label="Irradiated" name="irradiated" value={formData.irradiated} onChange={handleChange} onBlur={handleBlur} required />
        {errors.irradiated && (
          <div className="error-text">{errors.irradiated}</div>
        )}
      </div>

    </div>
  </>
)}

{/* ---------------- PLATELETS ---------------- */}
<div className="form-group">
  <YesNoToggle label="Platelets" name="platelets" value={formData.platelets} onChange={handleChange} onBlur={handleBlur} required />
  {errors.platelets && (
    <div className="error-text">{errors.platelets}</div>
  )}
</div>

{formData.platelets === "Yes" && (
  <div className="form-group">
    <label>Number <span className="required">*</span></label>
    <input
      type="number"
      name="platelet_number"
      value={formData.platelet_number || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="1"
      max="50"
    />
    {errors.platelet_number && (
      <div className="error-text">{errors.platelet_number}</div>
    )}
  </div>
)}

{/* ---------------- FFP / CRYO ---------------- */}
<div className="form-group">
  <YesNoToggle label="96. FFP / Cryo" name="ffp_cryo" value={formData.ffp_cryo} onChange={handleChange} onBlur={handleBlur} required />
  {errors.ffp_cryo && (
    <div className="error-text">{errors.ffp_cryo}</div>
  )}
</div>

{formData.ffp_cryo === "Yes" && (
  <div className="form-group">
    <label>Number <span className="required">*</span></label>
    <input
      type="number"
      name="ffp_number"
      value={formData.ffp_number || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      min="1"
      max="50"
    />
    {errors.ffp_number && (
      <div className="error-text">{errors.ffp_number}</div>
    )}
  </div>
)}
  </div>


  )}
</div></div>


{/* ================= OPHTHALMOLOGY ================= */}
<div className="form-section soft-blue">

<h3><Eye size={17} className="sec-icon" /> <span className="sec-num">H7</span> OPHTHALMOLOGY</h3>

<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "rop" ? null : "rop")}
  >
    <span><span className="sec-num sub">H7.1</span> Retinopathy of Prematurity (ROP)</span>

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

<h4>Retinopathy of Prematurity (ROP)</h4>

{/* ---------------- SCREENING ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="Screened" name="rop_screened" value={formData.rop_screened} onChange={handleChange} onBlur={handleBlur} required />
    {errors.rop_screened && (
      <div className="error-text">{errors.rop_screened}</div>
    )}
  </div>

  {formData.rop_screened === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">109.</span> Date of First Screening <span className="required">*</span></label>
      <input
        type="date"
        name="rop_first_screen_date"
        value={formData.rop_first_screen_date || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.rop_first_screen_date && (
        <div className="error-text">{errors.rop_first_screen_date}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- METHOD ---------------- */}
{formData.rop_screened === "Yes" && (
  <div className="pn-adverse-card">

    <div className="adverse-title">
      Method <span className="required">*</span>
    </div>

    <div className="pn-checkbox-grid">

      <label>
        <input
          type="checkbox"
          name="rop_method_ido"
          checked={formData.rop_method_ido || false}
          onChange={handleChange}
        />
        IDO
      </label>

      <label>
        <input
          type="checkbox"
          name="rop_method_retcam"
          checked={formData.rop_method_retcam || false}
          onChange={handleChange}
        />
        RETCAM
      </label>

    </div>

    {errors.rop_method_group && (
      <div className="error-text">{errors.rop_method_group}</div>
    )}

  </div>
)}

{/* ---------------- ROP DIAGNOSIS ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="110. ROP Diagnosed" name="rop" value={formData.rop} onChange={handleChange} onBlur={handleBlur} required />
    {errors.rop && (
      <div className="error-text">{errors.rop}</div>
    )}
  </div>

  {formData.rop === "Yes" && (
    <div className="form-group">
      <label><span className="field-num">111.</span> Date of Diagnosis <span className="required">*</span></label>
      <input
        type="date"
        name="rop_diagnosis_date"
        value={formData.rop_diagnosis_date || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.rop_diagnosis_date && (
        <div className="error-text">{errors.rop_diagnosis_date}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- IF ROP YES ---------------- */}
{formData.rop === "Yes" && (
  <>

    {/* STAGE */}
    <div className="pn-adverse-card">
      <div className="adverse-title">
        Stage <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">
        <label><input type="checkbox" name="rop_stage1" checked={formData.rop_stage1 || false} onChange={handleChange}/> Stage 1</label>
        <label><input type="checkbox" name="rop_stage2" checked={formData.rop_stage2 || false} onChange={handleChange}/> Stage 2</label>
        <label><input type="checkbox" name="rop_stage3" checked={formData.rop_stage3 || false} onChange={handleChange}/> Stage 3</label>
        <label><input type="checkbox" name="rop_stage4" checked={formData.rop_stage4 || false} onChange={handleChange}/> Stage 4</label>
        <label><input type="checkbox" name="rop_stage5" checked={formData.rop_stage5 || false} onChange={handleChange}/> Stage 5</label>
      </div>

      {errors.rop_stage_group && (
        <div className="error-text">{errors.rop_stage_group}</div>
      )}
    </div>

    {/* PLUS */}
    <div className="form-group">
      <YesNoToggle label="Plus Disease" name="rop_plus" value={formData.rop_plus} onChange={handleChange} onBlur={handleBlur} required />
      {errors.rop_plus && (
        <div className="error-text">{errors.rop_plus}</div>
      )}
    </div>

    {/* A-ROP (AGGRESSIVE ROP) */}
    <div className="form-group">
      <YesNoToggle label="122. A-ROP (Aggressive ROP)" name="rop_arop" value={formData.rop_arop} onChange={handleChange} onBlur={handleBlur} required />
      {errors.rop_arop && (
        <div className="error-text">{errors.rop_arop}</div>
      )}
    </div>

    {/* ZONE */}
    <div className="pn-adverse-card">
      <div className="adverse-title">
        Zone <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">
        <label><input type="checkbox" name="rop_zone1" checked={formData.rop_zone1 || false} onChange={handleChange}/> Zone I</label>
        <label><input type="checkbox" name="rop_zone2" checked={formData.rop_zone2 || false} onChange={handleChange}/> Zone II</label>
        <label><input type="checkbox" name="rop_zone3" checked={formData.rop_zone3 || false} onChange={handleChange}/> Zone III</label>
      </div>

      {errors.rop_zone_group && (
        <div className="error-text">{errors.rop_zone_group}</div>
      )}
    </div>

    {/* TREATMENT */}
    <div className="form-group">
      <YesNoToggle label="Treatment Required" name="rop_treatment" value={formData.rop_treatment} onChange={handleChange} onBlur={handleBlur} required />
      {errors.rop_treatment && (
        <div className="error-text">{errors.rop_treatment}</div>
      )}
    </div>

    {formData.rop_treatment === "Yes" && (
      <div className="pn-adverse-card">

        <div className="adverse-title">
          Treatment Type <span className="required">*</span>
        </div>

        <div className="pn-checkbox-grid">
          <label><input type="checkbox" name="rop_laser" checked={formData.rop_laser || false} onChange={handleChange}/> Laser</label>
          <label><input type="checkbox" name="rop_anti_vegf" checked={formData.rop_anti_vegf || false} onChange={handleChange}/> Anti-VEGF</label>
          <label><input type="checkbox" name="rop_vitrectomy" checked={formData.rop_vitrectomy || false} onChange={handleChange}/> Vitrectomy</label>
          <label><input type="checkbox" name="rop_other" checked={formData.rop_other || false} onChange={handleChange}/> Other</label>
        </div>

        {errors.rop_treatment_group && (
          <div className="error-text">{errors.rop_treatment_group}</div>
        )}

        {formData.rop_other && (
          <div className="form-group">
            <label>Specify Other <span className="required">*</span></label>
            <input
              name="rop_other_text"
              value={formData.rop_other_text || ""}
              onChange={handleChange}
              onBlur={handleBlur}
            />
            {errors.rop_other_text && (
              <div className="error-text">{errors.rop_other_text}</div>
            )}
          </div>
        )}
      </div>
    )}

    {/* BILATERAL */}
    <div className="form-group">
      <YesNoToggle label="Bilateral Rx" name="rop_bilateral" value={formData.rop_bilateral} onChange={handleChange} onBlur={handleBlur} required />
      {errors.rop_bilateral && (
        <div className="error-text">{errors.rop_bilateral}</div>
      )}
    </div>

    {formData.rop_bilateral === "Yes" && (
      <div className="form-group">
        <label>Comment <span className="required">*</span></label>
        <input
          name="rop_comment"
          value={formData.rop_comment || ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {errors.rop_comment && (
          <div className="error-text">{errors.rop_comment}</div>
        )}
      </div>
    )}

  </>
)}

</div> 
  )}
</div></div>
{/* ================= RENAL ================= */}
<div className="form-section soft-blue">

<h3><Droplets size={17} className="sec-icon" /> <span className="sec-num">H8</span> RENAL</h3>
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "aki" ? null : "aki")}
  >
    <span><span className="sec-num sub">H8.1</span> Acute Kidney Injury (AKI)</span>

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
    <YesNoToggle label="AKI" name="aki" value={formData.aki} onChange={handleChange} onBlur={handleBlur} required />
    {errors.aki && <div className="error-text">{errors.aki}</div>}
  </div>

  {formData.aki === "Yes" && (
    <div className="form-group">
      <label>Date <span className="required">*</span></label>
      <input
        type="date"
        name="aki_date"
        value={formData.aki_date || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
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
        Stage (KDIGO) <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="aki_stage1"
            checked={formData.aki_stage1 || false}
            onChange={handleChange}
          />
          Stage 1
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="aki_stage2"
            checked={formData.aki_stage2 || false}
            onChange={handleChange}
          />
          Stage 2
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            name="aki_stage3"
            checked={formData.aki_stage3 || false}
            onChange={handleChange}
          />
          Stage 3
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
          <label><span className="field-num">103.</span> Peak Creatinine (mg/dL) <span className="required">*</span></label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="20"
            name="aki_peak_creatinine"
            value={formData.aki_peak_creatinine || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          {errors.aki_peak_creatinine && (
            <div className="error-text">{errors.aki_peak_creatinine}</div>
          )}
        </div>

        <div className="form-group">
          <YesNoToggle label="Oliguria" name="aki_oliguria" value={formData.aki_oliguria} onChange={handleChange} onBlur={handleBlur} required />
          {errors.aki_oliguria && (
            <div className="error-text">{errors.aki_oliguria}</div>
          )}
        </div>

      </div>
    </div>

    {/* ---------------- DIALYSIS ---------------- */}
    <div className="form-row">

      <div className="form-group">
        <YesNoToggle label="105. Dialysis / CRRT" name="aki_dialysis" value={formData.aki_dialysis} onChange={handleChange} onBlur={handleBlur} required />
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
{/* ================= THERMOREGULATION ================= */}
<div className="form-section soft-blue">

<h3><Thermometer size={17} className="sec-icon" /> <span className="sec-num">H9</span> THERMOREGULATION</h3>

<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "hypo" ? null : "hypo")}
  >
    <span>Hypothermia</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.hypothermia)}`}>
        <span className="icon">{getStatusIcon(formData.hypothermia)}</span>
        {getHypoSummary()}
      </span>
</div>
      <span className="arrow">
        {openSection === "hypo" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "hypo" && (
    <div className="card-body">

{/* ================= Hypothermia ================= */}
<h4>Hypothermia (&lt;36°C)</h4>

<div className="form-row">
  <div className="form-group">
    <YesNoToggle label="Hypothermia" name="hypothermia" value={formData.hypothermia} onChange={handleChange} onBlur={handleBlur} required />
    {errors.hypothermia && <div className="error-text">{errors.hypothermia}</div>}
  </div>
</div>

{formData.hypothermia === "Yes" && (
  <>
    {/* -------- Severity -------- */}
    <div className="pn-adverse-card">
      <div className="adverse-title">
        Severity <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">
        <label><input type="checkbox" name="hypothermia_mild" checked={formData.hypothermia_mild || false} onChange={handleChange}/> Mild</label>
        <label><input type="checkbox" name="hypothermia_moderate" checked={formData.hypothermia_moderate || false} onChange={handleChange}/> Moderate</label>
        <label><input type="checkbox" name="hypothermia_severe" checked={formData.hypothermia_severe || false} onChange={handleChange}/> Severe</label>
      </div>

      {errors.hypothermia_severity_group && (
        <div className="error-text">{errors.hypothermia_severity_group}</div>
      )}
    </div>

    {/* -------- Lowest Temp -------- */}
    <div className="form-group" style={{ marginTop: "20px" }}>
      <label>Lowest Temperature (°C) <span className="required">*</span></label>
      <input
        type="number"
        step="0.1"
        min="20"
        max="40"
        name="hypothermia_lowest_temp"
        value={formData.hypothermia_lowest_temp || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.hypothermia_lowest_temp && (
        <div className="error-text">{errors.hypothermia_lowest_temp}</div>
      )}
    </div>

    {/* -------- Location -------- */}
    <div className="pn-adverse-card">
      <div className="adverse-title">
        Location <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">
        <label><input type="checkbox" name="hypothermia_location_dr" checked={formData.hypothermia_location_dr || false} onChange={handleChange}/> Delivery Room</label>
        <label><input type="checkbox" name="hypothermia_location_transport" checked={formData.hypothermia_location_transport || false} onChange={handleChange}/> Transport</label>
        <label><input type="checkbox" name="hypothermia_location_nicu" checked={formData.hypothermia_location_nicu || false} onChange={handleChange}/> NICU</label>
      </div>

      {errors.hypothermia_location_group && (
        <div className="error-text">{errors.hypothermia_location_group}</div>
      )}
    </div>

    {/* -------- Etiology -------- */}
    <div className="pn-adverse-card">
      <div className="adverse-title">
        Etiology <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">
        <label><input type="checkbox" name="hypothermia_sepsis" checked={formData.hypothermia_sepsis || false} onChange={handleChange}/> Sepsis</label>
        <label><input type="checkbox" name="hypothermia_environment" checked={formData.hypothermia_environment || false} onChange={handleChange}/> Environment</label>
        <label><input type="checkbox" name="hypothermia_immaturity" checked={formData.hypothermia_immaturity || false} onChange={handleChange}/> Immaturity</label>
        <label><input type="checkbox" name="hypothermia_ivh" checked={formData.hypothermia_ivh || false} onChange={handleChange}/> IVH</label>
        <label><input type="checkbox" name="hypothermia_other" checked={formData.hypothermia_other || false} onChange={handleChange}/> Other</label>
      </div>

      {errors.hypothermia_etiology_group && (
        <div className="error-text">{errors.hypothermia_etiology_group}</div>
      )}

      {formData.hypothermia_other && (
        <div className="form-group">
          <label>Specify Other <span className="required">*</span></label>
          <input
            name="hypothermia_other_text"
            value={formData.hypothermia_other_text || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          {errors.hypothermia_other_text && (
            <div className="error-text">{errors.hypothermia_other_text}</div>
          )}
        </div>
      )}
    </div>
  </>
)}
</div>
  )}
</div>
{/* ================= HYPERTHERMIA ================= */}
<div className="card">
  <div
    className="card-header-row"
    onClick={() => setOpenSection(openSection === "hyper" ? null : "hyper")}
  >
    <span>Hyperthermia</span>

    <div className="right-section">
      <span className={`summary ${getStatusClass(formData.hyperthermia)}`}>
        <span className="icon">{getStatusIcon(formData.hyperthermia)}</span>
        {getHyperSummary()}
      </span>
</div>
      <span className="arrow">
        {openSection === "hyper" ? "▲" : "▼"}
      </span>
    
  </div>

  {openSection === "hyper" && (
    <div className="card-body">
<h4 style={{ marginTop: "25px" }}>Hyperthermia (&gt;37.5°C)</h4>

<div className="form-row">
  <div className="form-group">
    <YesNoToggle label="Hyperthermia" name="hyperthermia" value={formData.hyperthermia} onChange={handleChange} onBlur={handleBlur} required />
    {errors.hyperthermia && (
      <div className="error-text">{errors.hyperthermia}</div>
    )}
  </div>

  {formData.hyperthermia === "Yes" && (
    <div className="form-group">
      <label>Temperature (°C) <span className="required">*</span></label>
      <input
        type="number"
        step="0.1"
        min="35"
        max="42"
        name="hyperthermia_temp"
        value={formData.hyperthermia_temp || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.hyperthermia_temp && (
        <div className="error-text">{errors.hyperthermia_temp}</div>
      )}
    </div>
  )}
</div>

{formData.hyperthermia === "Yes" && (
  <>
    {/* Location */}
    <div className="pn-adverse-card">
      <div className="adverse-title">
        Location <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">
        <label><input type="checkbox" name="hyperthermia_location_dr" checked={formData.hyperthermia_location_dr || false} onChange={handleChange}/> Delivery Room</label>
        <label><input type="checkbox" name="hyperthermia_location_transport" checked={formData.hyperthermia_location_transport || false} onChange={handleChange}/> Transport</label>
        <label><input type="checkbox" name="hyperthermia_location_nicu" checked={formData.hyperthermia_location_nicu || false} onChange={handleChange}/> NICU</label>
      </div>

      {errors.hyperthermia_location_group && (
        <div className="error-text">{errors.hyperthermia_location_group}</div>
      )}
    </div>

    {/* Etiology */}
    <div className="pn-adverse-card">
      <div className="adverse-title">
        Etiology <span className="required">*</span>
      </div>

      <div className="pn-checkbox-grid">
        <label><input type="checkbox" name="hyperthermia_clothing" checked={formData.hyperthermia_clothing || false} onChange={handleChange}/> Clothing</label>
        <label><input type="checkbox" name="hyperthermia_wrap" checked={formData.hyperthermia_wrap || false} onChange={handleChange}/> Wrap</label>
        <label><input type="checkbox" name="hyperthermia_equipment" checked={formData.hyperthermia_equipment || false} onChange={handleChange}/> Equipment malfunction</label>
        <label><input type="checkbox" name="hyperthermia_probe" checked={formData.hyperthermia_probe || false} onChange={handleChange}/> Probe accident</label>
        <label><input type="checkbox" name="hyperthermia_other" checked={formData.hyperthermia_other || false} onChange={handleChange}/> Other</label>
      </div>

      {errors.hyperthermia_etiology_group && (
        <div className="error-text">{errors.hyperthermia_etiology_group}</div>
      )}

      {formData.hyperthermia_other && (
        <div className="form-group">
          <label>Specify Other <span className="required">*</span></label>
          <input
            name="hyperthermia_other_text"
            value={formData.hyperthermia_other_text || ""}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          {errors.hyperthermia_other_text && (
            <div className="error-text">{errors.hyperthermia_other_text}</div>
          )}
        </div>
      )}
    </div>
  </>
)}

</div> 
  )}
</div></div>

{/* ================= VASCULAR ACCESS ================= */}
<div className="form-section soft-blue">

<h3><Syringe size={17} className="sec-icon" /> <span className="sec-num">H10</span> VASCULAR ACCESS</h3>
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
    <YesNoToggle label="PICC" name="picc" value={formData.picc} onChange={handleChange} onBlur={handleBlur} required />
    {errors.picc && <div className="error-text">{errors.picc}</div>}
  </div>

  {formData.picc === "Yes" && (
    <div className="form-group">
      <label>Duration (days) <span className="required">*</span></label>
      <input
        type="number"
        min="0"
        max="60"
        name="picc_days"
        value={formData.picc_days || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.picc_days && (
        <div className="error-text">{errors.picc_days}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- UVC ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="UVC" name="uvc" value={formData.uvc} onChange={handleChange} onBlur={handleBlur} required />
    {errors.uvc && <div className="error-text">{errors.uvc}</div>}
  </div>

  {formData.uvc === "Yes" && (
    <div className="form-group">
      <label>Duration (days) <span className="required">*</span></label>
      <input
        type="number"
        min="0"
        max="60"
        name="uvc_days"
        value={formData.uvc_days || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.uvc_days && (
        <div className="error-text">{errors.uvc_days}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- UAC ---------------- */}
<div className="form-row">

  <div className="form-group">
    <YesNoToggle label="UAC" name="uac" value={formData.uac} onChange={handleChange} onBlur={handleBlur} required />
    {errors.uac && <div className="error-text">{errors.uac}</div>}
  </div>

  {formData.uac === "Yes" && (
    <div className="form-group">
      <label>Duration (days) <span className="required">*</span></label>
      <input
        type="number"
        min="0"
        max="60"
        name="uac_days"
        value={formData.uac_days || ""}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.uac_days && (
        <div className="error-text">{errors.uac_days}</div>
      )}
    </div>
  )}

</div>

{/* ---------------- COMPLICATIONS ---------------- */}
<div className="pn-adverse-card">

  <div className="adverse-title">
    Complications <span className="required">*</span>
  </div>

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
        name="line_comp_thrombosis"
        checked={formData.line_comp_thrombosis || false}
        onChange={handleChange}
      />
      Thrombosis
    </label>

    <label className="checkbox-item">
      <input
        type="checkbox"
        name="line_comp_infection"
        checked={formData.line_comp_infection || false}
        onChange={handleChange}
      />
      Infection
    </label>

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
    <YesNoToggle label="233. Peripheral Venous" name="peripheral_venous" value={formData.peripheral_venous} onChange={handleChange} onBlur={handleBlur} required />
    {errors.peripheral_venous && (
      <div className="error-text">{errors.peripheral_venous}</div>
    )}
  </div>

  <div className="form-group">
    <YesNoToggle label="234. Peripheral Arterial" name="peripheral_arterial" value={formData.peripheral_arterial} onChange={handleChange} onBlur={handleBlur} required />
    {errors.peripheral_arterial && (
      <div className="error-text">{errors.peripheral_arterial}</div>
    )}
  </div>

</div>

{/* ---------------- ARTERIAL SITE ---------------- */}
{formData.peripheral_arterial === "Yes" && (
  <div className="pn-adverse-card">

    <div className="adverse-title">
      Arterial Site <span className="required">*</span>
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
        Posterior Tibial
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
      <YesNoToggle label="214. Extravasation Injury" name="extravasation" value={formData.extravasation} onChange={handleChange} onBlur={handleBlur} required />
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
{/* ================= INFECTION ================= */}
<div className="form-section soft-blue">

  <h3><Bug size={17} className="sec-icon" /> <span className="sec-num">H11</span> INFECTION</h3>

  <div className="infection-section-summary">{getInfectionSectionSummary()}</div>

  {(formData.infections || []).length === 0 && (
    <div className="infection-empty-state">
      No infection episodes recorded yet. Use "+ Add Infection" below if this baby had a sepsis / VAP episode.
    </div>
  )}

  {(formData.infections || []).map((entry, idx) => (
    <div className="card infection-entry-card" key={idx}>
      <div
        className="card-header-row"
        onClick={() => setOpenSection(openSection === `infection-${idx}` ? null : `infection-${idx}`)}
      >
        <span>Infection Episode {idx + 1}</span>

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

            {/* ---------------- SEPSIS ---------------- */}
            <div className="form-group">
              <YesNoToggle label="Sepsis" name="sepsis" value={entry.sepsis}
                onChange={(e) => handleInfectionChange(idx, "sepsis", e.target.value)} required />
              {errors.infectionErrors?.[idx]?.sepsis && (
                <div className="error-text">{errors.infectionErrors[idx].sepsis}</div>
              )}
            </div>

            {entry.sepsis === "Yes" && (
              <>
                <div className="adverse-title">Type <span className="required">*</span></div>
                <div className="pn-checkbox-grid">
                  <label>
                    <input type="checkbox" checked={entry.sepsis_clinical || false}
                      onChange={(e) => handleInfectionChange(idx, "sepsis_clinical", e.target.checked)} />
                    Clinical
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
                    <label>Age at onset (hours)</label>
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
                    <label><span className="field-num">220.</span> Age at blood culture sent (hours)</label>
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
                    <label><span className="field-num">238.</span> Age at blood culture sent (days)</label>
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

                {/* ---------------- SCREEN ---------------- */}
                {entry.sepsis_screen && (
                  <>
                    <div className="adverse-title">Screen Positive <span className="required">*</span></div>
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
                    <div className="adverse-title">Culture Source <span className="required">*</span></div>
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
                    <div className="adverse-title">Organism Type <span className="required">*</span></div>
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
                    <div className="adverse-title">Gram Positive <span className="required">*</span></div>
                    <div className="pn-checkbox-grid">
                      <label><input type="checkbox" checked={entry.staph_aureus || false} onChange={(e) => handleInfectionChange(idx, "staph_aureus", e.target.checked)} /> Staph aureus</label>
                      <label><input type="checkbox" checked={entry.staph_hemolyticus || false} onChange={(e) => handleInfectionChange(idx, "staph_hemolyticus", e.target.checked)} /> Staph hemolyticus</label>
                      <label><input type="checkbox" checked={entry.staph_epidermidis || false} onChange={(e) => handleInfectionChange(idx, "staph_epidermidis", e.target.checked)} /> Staph epidermidis</label>
                      <label><input type="checkbox" checked={entry.gp_other || false} onChange={(e) => handleInfectionChange(idx, "gp_other", e.target.checked)} /> Other</label>
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
                    <div className="adverse-title">Gram Negative <span className="required">*</span></div>
                    <div className="pn-checkbox-grid">
                      <label><input type="checkbox" checked={entry.acinetobacter || false} onChange={(e) => handleInfectionChange(idx, "acinetobacter", e.target.checked)} /> Acinetobacter</label>
                      <label><input type="checkbox" checked={entry.ecoli || false} onChange={(e) => handleInfectionChange(idx, "ecoli", e.target.checked)} /> E coli</label>
                      <label><input type="checkbox" checked={entry.klebsiella || false} onChange={(e) => handleInfectionChange(idx, "klebsiella", e.target.checked)} /> Klebsiella</label>
                      <label><input type="checkbox" checked={entry.serratia || false} onChange={(e) => handleInfectionChange(idx, "serratia", e.target.checked)} /> Serratia</label>
                      <label><input type="checkbox" checked={entry.pseudomonas || false} onChange={(e) => handleInfectionChange(idx, "pseudomonas", e.target.checked)} /> Pseudomonas</label>
                      <label><input type="checkbox" checked={entry.gn_other || false} onChange={(e) => handleInfectionChange(idx, "gn_other", e.target.checked)} /> Other</label>
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
                    <YesNoToggle label="MDR (multi-drug resistant)" name="mdr" value={entry.mdr}
                      onChange={(e) => handleInfectionChange(idx, "mdr", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <YesNoToggle label="XDR (extensively drug resistant)" name="xdr" value={entry.xdr}
                      onChange={(e) => handleInfectionChange(idx, "xdr", e.target.value)} />
                  </div>
                </div>

                {/* ---------------- FOCUS OF INFECTION ---------------- */}
                <div className="adverse-title">Focus of the Infection</div>
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
                    <YesNoToggle label="CLABSI" name="clabsi" value={entry.clabsi}
                      onChange={(e) => handleInfectionChange(idx, "clabsi", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <YesNoToggle label="VAP" name="vap" value={entry.vap}
                      onChange={(e) => handleInfectionChange(idx, "vap", e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  ))}

  <button type="button" className="infection-add-btn" onClick={addInfection}>
    <Plus size={16} /> Add Infection
  </button>

  {/* ---------------- CUMULATIVE TOTALS (whole hospital course) ---------------- */}
  <div className="card">
    <div className="card-body">
      <div className="form-row">
        <div className="form-group">
          <label><span className="field-num">249.</span> Total number of episodes of sepsis</label>
          <input
            type="number"
            name="sepsis_episodes"
            value={formData.sepsis_episodes || ""}
            onChange={handleChange}
            onBlur={handleBlur}
            min="0"
            max="20"
          />
          {errors.sepsis_episodes && (
            <div className="error-text">{errors.sepsis_episodes}</div>
          )}
        </div>

        <div className="form-group">
          <label><span className="field-num">250.</span> Total number of episodes of VAP</label>
          <input
            type="number"
            name="vap_episodes"
            value={formData.vap_episodes || ""}
            onChange={handleChange}
            onBlur={handleBlur}
            min="0"
            max="20"
          />
          {errors.vap_episodes && (
            <div className="error-text">{errors.vap_episodes}</div>
          )}
        </div>
      </div>
    </div>
  </div>

</div>

{/* ================= HOSPITAL COURSE SUMMARY ================= */}
<div className="form-section summary-section">

  <h3><ClipboardList size={17} className="sec-icon" /> <span className="sec-num">H12</span> HOSPITAL COURSE SUMMARY</h3>

  {/* ================= Duration Metrics ================= */}
  <div className="summary-card">

    <div className="summary-title">Hospital Stay Metrics</div>

    <div className="summary-grid">

      <div className="form-group">
        <label>Total LOS (days) </label>
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
        <label><span className="field-num">262.</span> NICU Days </label>
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
        <label>O₂ Days</label>
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
        <label>Ventilator Days</label>
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
        <label><span className="field-num">253.</span> CPAP Days</label>
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
        <label>PN Days</label>
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
        <label><span className="field-num">255.</span> Age at Full Feeds (days)</label>
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
        <label>Discharge Weight (g)</label>
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
        <label>Discharge Head Circumference (cm)</label>
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
        <label><span className="field-num">258.</span> Discharge Date </label>
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

    <div className="summary-title">Outcome</div>

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

      <div className="summary-title">Back Referral Hospital</div>

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
<div className="form-section soft-blue">
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
