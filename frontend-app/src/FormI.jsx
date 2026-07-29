import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./ScreeningForm.css";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import {
  Wind, Skull, CalendarClock, CalendarCheck, CalendarRange, ClipboardList,
} from "lucide-react";

/* ─── YesNoToggle — same animated sliding-segment component used across
       Form H / Form A / ScreeningForm.jsx, kept local for consistency ─── */
function YesNoToggle({ label, name, value, onChange, onBlur, required = false, disabled = false }) {
  const fire = (val) => {
    if (disabled) return;
    onChange({ target: { name, value: val, type: "select-one" } });
  };
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

const getStatusClass = (value) => {
  if (!value) return "empty";
  if (value === "Yes" || value === true) return "yes";
  if (value === "No" || value === false) return "no";
  return "empty";
};
const getStatusIcon = (value) => {
  if (!value) return "—";
  if (value === "Yes" || value === true) return "✔";
  if (value === "No" || value === false) return "✖";
  return "—";
};

const boolToYesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "");
const yesNoToBool = (v) => (v === "Yes" ? true : v === "No" ? false : null);

const FIELD = { className: "field-num" };

export default function FormI() {
  const navigate = useNavigate();
  const { enrollmentId } = useParams();
  const { patientData } = usePatient() || {};
  const { markFormCompleted } = useFormProgress();

  const [openSection, setOpenSection] = useState("i1");
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [formData, setFormData] = useState({
    enrollment_id: enrollmentId || "",
    baby_uid: "",
    gestation_weeks: "",
    birth_weight: "",
    dob: "",

    // I.1 Resuscitation Outcomes
    ventilation_required: "",
    switched_100_o2: "",
    resus_chest_compressions: "",
    intubation_during_resus: "",
    time_to_spontaneous_breathing: "",
    hie_grade: "",

    // I.2 Post-natal post-resuscitation Outcomes
    resp_support_72h: "",
    sepsis_eos: "",
    sepsis_los: "",
    culture_positive_sepsis: "",
    culture_positive_body_fluid: "",
    mortality_7_days: "",
    mortality_7d_cause: "",
    mortality_7d_date: "",
    mortality_7d_time: "",
    mortality_7d_age_hrs: "",
    mortality_28_days: "",
    mortality_28d_cause: "",
    mortality_28d_date: "",
    mortality_28d_time: "",
    mortality_28d_age_days: "",

    // I.3 Assessment at 36 weeks PMA
    encounter36_method: "",
    encounter36_other: "",
    death36: "",
    death36_cause: "",
    death36_date: "",
    death36_time: "",
    death36_age_days: "",
    bpd36_jensen_grade: "",
    bpd36_jensen_date: "",
    bpd36_nichd_radiographic: "",
    bpd36_nichd_fio2: "",
    bpd36_nichd_flow: "",
    bpd36_nichd_grade: "",
    bpd36_nichd_date: "",
    nec36_stage: "",
    nec36_surgery: "",
    nec36_date: "",
    ivh36_grade3: "",
    ivh36_date: "",
    cpvl36_grade2: "",
    cpvl36_date: "",
    rop36: "",
    rop36_treated: "",
    rop36_date: "",

    // I.4 Assessment at 40 weeks PMA
    encounter40_method: "",
    encounter40_other: "",
    death40: "",
    death40_cause: "",
    death40_date: "",
    death40_time: "",
    death40_age_days: "",
    nec40_stage: "",
    nec40_surgery: "",
    nec40_date: "",
    ivh40_grade3: "",
    ivh40_date: "",
    cpvl40_grade2: "",
    cpvl40_date: "",
    rop40: "",
    rop40_treated: "",
    rop40_date: "",
    abnormal_mri_tea: "",

    // I.5 Assessment at 44 weeks PMA
    encounter44_method: "",
    encounter44_other: "",
    death44: "",
    death44_cause: "",
    death44_date: "",
    death44_time: "",
    death44_age_days: "",
    nec44_stage: "",
    nec44_surgery: "",
    nec44_date: "",
    ivh44_grade3: "",
    ivh44_date: "",
    cpvl44_grade2: "",
    cpvl44_date: "",
    rop44_assessed: "",
    rop44_treated: "",
    rop44_date: "",

    // I.6 Overall
    mv_days: "",
    niv_days: "",
    cpap_days: "",
    hfnc_days: "",
    nippv_days: "",
    sepsis_overall: "",
    sepsis_overall_episodes: "",
    mortality_in_hospital: "",
    mortality_hospital_cause: "",
    mortality_hospital_date: "",
    mortality_hospital_time: "",
    mortality_hospital_age_days: "",
    mortality_after_discharge: "",
    mortality_after_discharge_cause: "",
    mortality_after_discharge_date: "",
    mortality_after_discharge_time: "",
    mortality_after_discharge_age_days: "",

    // Completion
    completed_by: "",
    designation: "",
    completion_date: "",
  });

  /* ── Load context (screening / birth resuscitation) + any existing
         Form I record for this enrollment, so revisiting the form never
         loses previously entered data. ── */
  useEffect(() => {
    const fetchData = async () => {
      let screeningData = {};
      try {
        const res = await api.get(`/screenings/by-enrollment/${enrollmentId}`);
        screeningData = res.data || {};
      } catch { /* no screening found yet */ }

      let birthData = {};
      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        birthData = res.data || {};
      } catch { /* no birth data found yet */ }

      let existing = {};
      try {
        const res = await api.get(`/study-outcomes/${enrollmentId}`);
        const rows = res.data || [];
        if (rows.length) existing = rows[rows.length - 1];
      } catch { /* no Form I record yet */ }

      setFormData((prev) => ({
        ...prev,
        enrollment_id: enrollmentId || "",
        baby_uid: birthData?.baby_uid || existing?.baby_uid || "",
        gestation_weeks: birthData?.gestation_weeks || screeningData?.gestation_weeks || existing?.gestation_weeks || "",
        birth_weight: birthData?.birth_weight || existing?.birth_weight || "",
        dob: birthData?.date_of_birth || "",
        ...(existing.id ? {
          ventilation_required: boolToYesNo(existing.ventilation_required),
          switched_100_o2: boolToYesNo(existing.switched_100_o2),
          resus_chest_compressions: boolToYesNo(existing.resus_chest_compressions),
          intubation_during_resus: boolToYesNo(existing.intubation_during_resus),
          time_to_spontaneous_breathing: existing.time_to_spontaneous_breathing ?? "",
          hie_grade: existing.hie_grade || "",

          resp_support_72h: boolToYesNo(existing.resp_support_72h),
          sepsis_eos: boolToYesNo(existing.sepsis_eos),
          sepsis_los: boolToYesNo(existing.sepsis_los),
          culture_positive_sepsis: boolToYesNo(existing.culture_positive_sepsis),
          culture_positive_body_fluid: existing.culture_positive_body_fluid || "",
          mortality_7_days: boolToYesNo(existing.mortality_7_days),
          mortality_7d_cause: existing.mortality_7d_cause || "",
          mortality_7d_date: existing.mortality_7d_date || "",
          mortality_7d_time: existing.mortality_7d_time || "",
          mortality_7d_age_hrs: existing.mortality_7d_age_hrs ?? "",
          mortality_28_days: boolToYesNo(existing.mortality_28_days),
          mortality_28d_cause: existing.mortality_28d_cause || "",
          mortality_28d_date: existing.mortality_28d_date || "",
          mortality_28d_time: existing.mortality_28d_time || "",
          mortality_28d_age_days: existing.mortality_28d_age_days ?? "",

          encounter36_method: existing.encounter36_method || "",
          encounter36_other: existing.encounter36_other || "",
          death36: boolToYesNo(existing.death36),
          death36_cause: existing.death36_cause || "",
          death36_date: existing.death36_date || "",
          death36_time: existing.death36_time || "",
          death36_age_days: existing.death36_age_days ?? "",
          bpd36_jensen_grade: existing.bpd36_jensen_grade || "",
          bpd36_jensen_date: existing.bpd36_jensen_date || "",
          bpd36_nichd_radiographic: boolToYesNo(existing.bpd36_nichd_radiographic),
          bpd36_nichd_fio2: existing.bpd36_nichd_fio2 ?? "",
          bpd36_nichd_flow: existing.bpd36_nichd_flow ?? "",
          bpd36_nichd_grade: existing.bpd36_nichd_grade || "",
          bpd36_nichd_date: existing.bpd36_nichd_date || "",
          nec36_stage: boolToYesNo(existing.nec36_stage),
          nec36_surgery: boolToYesNo(existing.nec36_surgery),
          nec36_date: existing.nec36_date || "",
          ivh36_grade3: boolToYesNo(existing.ivh36_grade3),
          ivh36_date: existing.ivh36_date || "",
          cpvl36_grade2: boolToYesNo(existing.cpvl36_grade2),
          cpvl36_date: existing.cpvl36_date || "",
          rop36: boolToYesNo(existing.rop36),
          rop36_treated: boolToYesNo(existing.rop36_treated),
          rop36_date: existing.rop36_date || "",

          encounter40_method: existing.encounter40_method || "",
          encounter40_other: existing.encounter40_other || "",
          death40: boolToYesNo(existing.death40),
          death40_cause: existing.death40_cause || "",
          death40_date: existing.death40_date || "",
          death40_time: existing.death40_time || "",
          death40_age_days: existing.death40_age_days ?? "",
          nec40_stage: boolToYesNo(existing.nec40_stage),
          nec40_surgery: boolToYesNo(existing.nec40_surgery),
          nec40_date: existing.nec40_date || "",
          ivh40_grade3: boolToYesNo(existing.ivh40_grade3),
          ivh40_date: existing.ivh40_date || "",
          cpvl40_grade2: boolToYesNo(existing.cpvl40_grade2),
          cpvl40_date: existing.cpvl40_date || "",
          rop40: boolToYesNo(existing.rop40),
          rop40_treated: boolToYesNo(existing.rop40_treated),
          rop40_date: existing.rop40_date || "",
          abnormal_mri_tea: existing.abnormal_mri_tea || "",

          encounter44_method: existing.encounter44_method || "",
          encounter44_other: existing.encounter44_other || "",
          death44: boolToYesNo(existing.death44),
          death44_cause: existing.death44_cause || "",
          death44_date: existing.death44_date || "",
          death44_time: existing.death44_time || "",
          death44_age_days: existing.death44_age_days ?? "",
          nec44_stage: boolToYesNo(existing.nec44_stage),
          nec44_surgery: boolToYesNo(existing.nec44_surgery),
          nec44_date: existing.nec44_date || "",
          ivh44_grade3: boolToYesNo(existing.ivh44_grade3),
          ivh44_date: existing.ivh44_date || "",
          cpvl44_grade2: boolToYesNo(existing.cpvl44_grade2),
          cpvl44_date: existing.cpvl44_date || "",
          rop44_assessed: boolToYesNo(existing.rop44_assessed),
          rop44_treated: boolToYesNo(existing.rop44_treated),
          rop44_date: existing.rop44_date || "",

          mv_days: existing.mv_days ?? "",
          niv_days: existing.niv_days ?? "",
          cpap_days: existing.cpap_days ?? "",
          hfnc_days: existing.hfnc_days ?? "",
          nippv_days: existing.nippv_days ?? "",
          sepsis_overall: boolToYesNo(existing.sepsis_overall),
          sepsis_overall_episodes: existing.sepsis_overall_episodes ?? "",
          mortality_in_hospital: boolToYesNo(existing.mortality_in_hospital),
          mortality_hospital_cause: existing.mortality_hospital_cause || "",
          mortality_hospital_date: existing.mortality_hospital_date || "",
          mortality_hospital_time: existing.mortality_hospital_time || "",
          mortality_hospital_age_days: existing.mortality_hospital_age_days ?? "",
          mortality_after_discharge: boolToYesNo(existing.mortality_after_discharge),
          mortality_after_discharge_cause: existing.mortality_after_discharge_cause || "",
          mortality_after_discharge_date: existing.mortality_after_discharge_date || "",
          mortality_after_discharge_time: existing.mortality_after_discharge_time || "",
          mortality_after_discharge_age_days: existing.mortality_after_discharge_age_days ?? "",

          completed_by: existing.completed_by || "",
          designation: existing.designation || "",
          completion_date: existing.completion_date || "",
        } : {}),
      }));
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  };

  /* ── Age-at-death auto-calc from DOB, mirrors the pattern already used
         elsewhere in this form for each of the five death timepoints ── */
  const calcAge = (dob, when, unit) => {
    if (!dob || !when) return "";
    const birth = new Date(dob);
    const at = new Date(when);
    if (isNaN(birth) || isNaN(at)) return "";
    const diffMs = at.getTime() - birth.getTime();
    if (diffMs < 0) return "";
    return unit === "hrs"
      ? Math.round(diffMs / (1000 * 60 * 60))
      : Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    if (!formData.dob || !formData.mortality_7d_date) return;
    setFormData((p) => ({ ...p, mortality_7d_age_hrs: calcAge(p.dob, p.mortality_7d_date, "hrs") }));
  }, [formData.mortality_7d_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.mortality_28d_date) return;
    setFormData((p) => ({ ...p, mortality_28d_age_days: calcAge(p.dob, p.mortality_28d_date, "days") }));
  }, [formData.mortality_28d_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.death36_date) return;
    setFormData((p) => ({ ...p, death36_age_days: calcAge(p.dob, p.death36_date, "days") }));
  }, [formData.death36_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.death40_date) return;
    setFormData((p) => ({ ...p, death40_age_days: calcAge(p.dob, p.death40_date, "days") }));
  }, [formData.death40_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.death44_date) return;
    setFormData((p) => ({ ...p, death44_age_days: calcAge(p.dob, p.death44_date, "days") }));
  }, [formData.death44_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.mortality_hospital_date) return;
    setFormData((p) => ({ ...p, mortality_hospital_age_days: calcAge(p.dob, p.mortality_hospital_date, "days") }));
  }, [formData.mortality_hospital_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.mortality_after_discharge_date) return;
    setFormData((p) => ({ ...p, mortality_after_discharge_age_days: calcAge(p.dob, p.mortality_after_discharge_date, "days") }));
  }, [formData.mortality_after_discharge_date, formData.dob]);

  /* ── Section summaries for collapsed accordion headers ── */
  const summary36 = () => {
    if (formData.death36 === "Yes") return "Death recorded";
    const parts = [];
    if (formData.bpd36_jensen_grade) parts.push(formData.bpd36_jensen_grade);
    if (formData.nec36_stage === "Yes") parts.push("NEC");
    if (formData.rop36 === "Yes") parts.push("ROP");
    return parts.length ? parts.join(" • ") : "Not filled";
  };
  const summary40 = () => {
    if (formData.death40 === "Yes") return "Death recorded";
    const parts = [];
    if (formData.nec40_stage === "Yes") parts.push("NEC");
    if (formData.rop40 === "Yes") parts.push("ROP");
    if (formData.abnormal_mri_tea) parts.push(`MRI: ${formData.abnormal_mri_tea}`);
    return parts.length ? parts.join(" • ") : "Not filled";
  };
  const summary44 = () => {
    if (formData.death44 === "Yes") return "Death recorded";
    const parts = [];
    if (formData.nec44_stage === "Yes") parts.push("NEC");
    if (formData.rop44_assessed === "Yes") parts.push("ROP");
    return parts.length ? parts.join(" • ") : "Not filled";
  };

  const buildPayload = () => ({
    enrollment_id: formData.enrollment_id,
    baby_uid: formData.baby_uid || null,
    gestation_weeks: formData.gestation_weeks || null,
    birth_weight: formData.birth_weight || null,

    ventilation_required: yesNoToBool(formData.ventilation_required),
    switched_100_o2: yesNoToBool(formData.switched_100_o2),
    resus_chest_compressions: yesNoToBool(formData.resus_chest_compressions),
    intubation_during_resus: yesNoToBool(formData.intubation_during_resus),
    time_to_spontaneous_breathing: formData.time_to_spontaneous_breathing || null,
    hie_grade: formData.hie_grade || null,

    resp_support_72h: yesNoToBool(formData.resp_support_72h),
    sepsis_eos: yesNoToBool(formData.sepsis_eos),
    sepsis_los: yesNoToBool(formData.sepsis_los),
    culture_positive_sepsis: yesNoToBool(formData.culture_positive_sepsis),
    culture_positive_body_fluid: formData.culture_positive_body_fluid || null,
    mortality_7_days: yesNoToBool(formData.mortality_7_days),
    mortality_7d_cause: formData.mortality_7d_cause || null,
    mortality_7d_date: formData.mortality_7d_date || null,
    mortality_7d_time: formData.mortality_7d_time || null,
    mortality_7d_age_hrs: formData.mortality_7d_age_hrs || null,
    mortality_28_days: yesNoToBool(formData.mortality_28_days),
    mortality_28d_cause: formData.mortality_28d_cause || null,
    mortality_28d_date: formData.mortality_28d_date || null,
    mortality_28d_time: formData.mortality_28d_time || null,
    mortality_28d_age_days: formData.mortality_28d_age_days || null,

    encounter36_method: formData.encounter36_method || null,
    encounter36_other: formData.encounter36_other || null,
    death36: yesNoToBool(formData.death36),
    death36_cause: formData.death36_cause || null,
    death36_date: formData.death36_date || null,
    death36_time: formData.death36_time || null,
    death36_age_days: formData.death36_age_days || null,
    bpd36_jensen_grade: formData.bpd36_jensen_grade || null,
    bpd36_jensen_date: formData.bpd36_jensen_date || null,
    bpd36_nichd_radiographic: yesNoToBool(formData.bpd36_nichd_radiographic),
    bpd36_nichd_fio2: formData.bpd36_nichd_fio2 || null,
    bpd36_nichd_flow: formData.bpd36_nichd_flow || null,
    bpd36_nichd_grade: formData.bpd36_nichd_grade || null,
    bpd36_nichd_date: formData.bpd36_nichd_date || null,
    nec36_stage: yesNoToBool(formData.nec36_stage),
    nec36_surgery: yesNoToBool(formData.nec36_surgery),
    nec36_date: formData.nec36_date || null,
    ivh36_grade3: yesNoToBool(formData.ivh36_grade3),
    ivh36_date: formData.ivh36_date || null,
    cpvl36_grade2: yesNoToBool(formData.cpvl36_grade2),
    cpvl36_date: formData.cpvl36_date || null,
    rop36: yesNoToBool(formData.rop36),
    rop36_treated: yesNoToBool(formData.rop36_treated),
    rop36_date: formData.rop36_date || null,

    encounter40_method: formData.encounter40_method || null,
    encounter40_other: formData.encounter40_other || null,
    death40: yesNoToBool(formData.death40),
    death40_cause: formData.death40_cause || null,
    death40_date: formData.death40_date || null,
    death40_time: formData.death40_time || null,
    death40_age_days: formData.death40_age_days || null,
    nec40_stage: yesNoToBool(formData.nec40_stage),
    nec40_surgery: yesNoToBool(formData.nec40_surgery),
    nec40_date: formData.nec40_date || null,
    ivh40_grade3: yesNoToBool(formData.ivh40_grade3),
    ivh40_date: formData.ivh40_date || null,
    cpvl40_grade2: yesNoToBool(formData.cpvl40_grade2),
    cpvl40_date: formData.cpvl40_date || null,
    rop40: yesNoToBool(formData.rop40),
    rop40_treated: yesNoToBool(formData.rop40_treated),
    rop40_date: formData.rop40_date || null,
    abnormal_mri_tea: formData.abnormal_mri_tea || null,

    encounter44_method: formData.encounter44_method || null,
    encounter44_other: formData.encounter44_other || null,
    death44: yesNoToBool(formData.death44),
    death44_cause: formData.death44_cause || null,
    death44_date: formData.death44_date || null,
    death44_time: formData.death44_time || null,
    death44_age_days: formData.death44_age_days || null,
    nec44_stage: yesNoToBool(formData.nec44_stage),
    nec44_surgery: yesNoToBool(formData.nec44_surgery),
    nec44_date: formData.nec44_date || null,
    ivh44_grade3: yesNoToBool(formData.ivh44_grade3),
    ivh44_date: formData.ivh44_date || null,
    cpvl44_grade2: yesNoToBool(formData.cpvl44_grade2),
    cpvl44_date: formData.cpvl44_date || null,
    rop44_assessed: yesNoToBool(formData.rop44_assessed),
    rop44_treated: yesNoToBool(formData.rop44_treated),
    rop44_date: formData.rop44_date || null,

    mv_days: formData.mv_days || null,
    niv_days: formData.niv_days || null,
    cpap_days: formData.cpap_days || null,
    hfnc_days: formData.hfnc_days || null,
    nippv_days: formData.nippv_days || null,
    sepsis_overall: yesNoToBool(formData.sepsis_overall),
    sepsis_overall_episodes: formData.sepsis_overall_episodes || null,
    mortality_in_hospital: yesNoToBool(formData.mortality_in_hospital),
    mortality_hospital_cause: formData.mortality_hospital_cause || null,
    mortality_hospital_date: formData.mortality_hospital_date || null,
    mortality_hospital_time: formData.mortality_hospital_time || null,
    mortality_hospital_age_days: formData.mortality_hospital_age_days || null,
    mortality_after_discharge: yesNoToBool(formData.mortality_after_discharge),
    mortality_after_discharge_cause: formData.mortality_after_discharge_cause || null,
    mortality_after_discharge_date: formData.mortality_after_discharge_date || null,
    mortality_after_discharge_time: formData.mortality_after_discharge_time || null,
    mortality_after_discharge_age_days: formData.mortality_after_discharge_age_days || null,

    completed_by: formData.completed_by || null,
    designation: formData.designation || null,
    completion_date: formData.completion_date || null,
  });

  const saveFormI = async () => {
    try {
      await api.post("/study-outcomes/", buildPayload());
      markFormCompleted("form_i");
      setIsSaved(true);
      setSaveMessage("✅ Saved");
    } catch (err) {
      console.error("❌ BACKEND ERROR:", err.response?.data);
      setSaveMessage("❌ Save failed — see console");
    } finally {
      setTimeout(() => setSaveMessage(""), 3000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/study-outcomes/", buildPayload());
      markFormCompleted("form_i");
      alert("✅ Form I submitted successfully");
      navigate(`/form-j/${formData.enrollment_id}`);
    } catch (err) {
      console.error(err.response?.data || err);
      alert("❌ Error submitting Form I");
    }
  };

  const handleNavBack = () => {
    navigate(`/form-h/${formData.enrollment_id}`, { state: { enrollmentId: formData.enrollment_id } });
  };
  const handleNavNext = () => {
    navigate(`/form-j/${formData.enrollment_id}`, { state: { enrollmentId: formData.enrollment_id } });
  };

  /* ── Small reusable date/time/text controls ── */
  const DateField = ({ label, num, name, required }) => (
    <div className="form-group">
      <label>{num && <span className={FIELD.className}>{num}.</span>} {label}{required && <span className="required">*</span>}</label>
      <DatePicker
        selected={formData[name] ? parseDateOnly(formData[name]) : null}
        onChange={(date) => setFormData((p) => ({ ...p, [name]: date ? toDateOnlyValue(date) : "" }))}
        dateFormat="dd/MM/yyyy"
        placeholderText="dd/mm/yyyy"
      />
    </div>
  );
  const TimeField = ({ label, num, name }) => (
    <div className="form-group">
      <label>{num && <span className={FIELD.className}>{num}.</span>} {label}</label>
      <input type="time" name={name} value={formData[name] || ""} onChange={handleChange} />
    </div>
  );
  const TextField = ({ label, num, name, placeholder }) => (
    <div className="form-group">
      <label>{num && <span className={FIELD.className}>{num}.</span>} {label}</label>
      <input type="text" name={name} value={formData[name] || ""} onChange={handleChange} placeholder={placeholder} />
    </div>
  );
  const NumField = ({ label, num, name, unit, placeholder }) => (
    <div className="form-group">
      <label>{num && <span className={FIELD.className}>{num}.</span>} {label}{unit ? ` (${unit})` : ""}</label>
      <input type="number" step="any" name={name} value={formData[name] || ""} onChange={handleChange} placeholder={placeholder} />
    </div>
  );
  const SelectField = ({ label, num, name, options, required }) => (
    <div className="form-group">
      <label>{num && <span className={FIELD.className}>{num}.</span>} {label}{required && <span className="required">*</span>}</label>
      <select name={name} value={formData[name] || ""} onChange={handleChange}>
        <option value="">-- Select --</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  /* Reusable "death at timepoint" block: Yes/No + cause + date + time + age.
     boolName = the Yes/No field; fieldPrefix = prefix for _cause/_date/_time/_age
     (these differ for the 7d/28d/hospital timepoints, e.g. boolName
     "mortality_7_days" but fieldPrefix "mortality_7d"). */
  const DeathBlock = ({ boolName, fieldPrefix, nums, ageLabel }) => (
    <>
      <div className="form-group">
        <YesNoToggle
          label={`${nums[0]}. Death recorded`}
          name={boolName}
          value={formData[boolName]}
          onChange={handleChange}
        />
      </div>
      {formData[boolName] === "Yes" && (
        <div className="form-row">
          <TextField label="Cause of death" num={nums[1]} name={`${fieldPrefix}_cause`} placeholder="Enter cause" />
          <DateField label="Date of death" num={nums[2]} name={`${fieldPrefix}_date`} />
          <TimeField label="Time of death" num={nums[3]} name={`${fieldPrefix}_time`} />
          <div className="form-group">
            <label><span className={FIELD.className}>{nums[4]}.</span> Age at death ({ageLabel})</label>
            <input type="text" value={formData[`${fieldPrefix}_age_hrs`] ?? formData[`${fieldPrefix}_age_days`] ?? ""} readOnly />
          </div>
        </div>
      )}
    </>
  );

  /* Reusable "brain injury at timepoint" block: IVH ≥ III + date, cPVL ≥ II + date */
  const BrainInjuryBlock = ({ prefix, numIvh, numIvhDate, numCpvlDate }) => (
    <div className="form-row">
      <div className="form-group">
        <YesNoToggle label={`${numIvh}a. IVH Grade ≥ III (Papile)`} name={`ivh${prefix}_grade3`} value={formData[`ivh${prefix}_grade3`]} onChange={handleChange} />
      </div>
      {formData[`ivh${prefix}_grade3`] === "Yes" && (
        <DateField label="Date of diagnosis (IVH)" num={numIvhDate} name={`ivh${prefix}_date`} />
      )}
      <div className="form-group">
        <YesNoToggle label={`${numIvh}b. cPVL Grade ≥ II (De Vries)`} name={`cpvl${prefix}_grade2`} value={formData[`cpvl${prefix}_grade2`]} onChange={handleChange} />
      </div>
      {formData[`cpvl${prefix}_grade2`] === "Yes" && (
        <DateField label="Date of diagnosis (cPVL)" num={numCpvlDate} name={`cpvl${prefix}_date`} />
      )}
    </div>
  );

  /* Reusable "NEC at timepoint" block */
  const NecBlock = ({ prefix, numStage, numSurgery, numDate }) => (
    <div className="form-row">
      <div className="form-group">
        <YesNoToggle label={`${numStage}. NEC — Stage ≥ IIA`} name={`nec${prefix}_stage`} value={formData[`nec${prefix}_stage`]} onChange={handleChange} />
      </div>
      {formData[`nec${prefix}_stage`] === "Yes" && (
        <>
          <div className="form-group">
            <YesNoToggle label={`${numSurgery}. Surgical intervention required`} name={`nec${prefix}_surgery`} value={formData[`nec${prefix}_surgery`]} onChange={handleChange} />
          </div>
          <DateField label="Date of diagnosis" num={numDate} name={`nec${prefix}_date`} />
        </>
      )}
    </div>
  );

  /* Reusable "ROP at timepoint" block */
  const RopBlock = ({ presentName, treatedName, dateName, numPresent, numTreated, numDate }) => (
    <div className="form-row">
      <div className="form-group">
        <YesNoToggle label={`${numPresent}. ROP (ICROP 3rd Edition)`} name={presentName} value={formData[presentName]} onChange={handleChange} />
      </div>
      {formData[presentName] === "Yes" && (
        <>
          <div className="form-group">
            <YesNoToggle label={`${numTreated}. Treated`} name={treatedName} value={formData[treatedName]} onChange={handleChange} />
          </div>
          <DateField label="Date of diagnosis" num={numDate} name={dateName} />
        </>
      )}
    </div>
  );

  /* Reusable "Method of encounter" block */
  const EncounterBlock = ({ methodName, otherName, numMethod, numOther }) => (
    <div className="form-row">
      <SelectField label="Method of encounter" num={numMethod} name={methodName} options={["Direct", "Telephonic"]} required />
      {formData[methodName] === "Telephonic" && (
        <SelectField label="If telephonic" num={numOther} name={otherName} options={["Attendant", "Treating physician", "Others"]} />
      )}
    </div>
  );

  return (
    <>
      <form className="screening-form" onSubmit={handleSubmit}>

        <div className="form-a-header">
          <div className="form-a-header-main">
            <h2>Form I — Study Outcome Assessment</h2>
          </div>
        </div>

        {/* ================= IDENTIFICATION ================= */}
        <div className="form-section soft-blue">
          <h3>IDENTIFICATION</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Enrollment ID</label>
              <input name="enrollment_id" value={formData.enrollment_id || ""} readOnly />
            </div>
            <div className="form-group">
              <label>Baby UID</label>
              <input name="baby_uid" value={formData.baby_uid || ""} readOnly />
            </div>
            <div className="form-group">
              <label>Gestation (weeks)</label>
              <input name="gestation_weeks" value={formData.gestation_weeks || ""} readOnly />
            </div>
          </div>
        </div>

        {/* ================= I.1 RESUSCITATION OUTCOMES ================= */}
        <div className="form-section soft-blue">
          <h3><Wind size={17} className="sec-icon" /> <span className="sec-num">I.1</span> Resuscitation Outcomes</h3>

          <div className="card">
            <div className="card-header-row" onClick={() => setOpenSection(openSection === "i1" ? null : "i1")}>
              <span>Delivery Room Resuscitation</span>
              <div className="right-section">
                <span className={`summary ${getStatusClass(formData.ventilation_required)}`}>
                  <span className="icon">{getStatusIcon(formData.ventilation_required)}</span>
                  {formData.hie_grade || "Not filled"}
                </span>
              </div>
              <span className="arrow">{openSection === "i1" ? "▲" : "▼"}</span>
            </div>

            {openSection === "i1" && (
              <div className="card-body">
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label="1. Ventilation (PPV) required" name="ventilation_required" value={formData.ventilation_required} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <YesNoToggle label="2. Switched to 100% O2" name="switched_100_o2" value={formData.switched_100_o2} onChange={handleChange} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label="3. Required chest compressions" name="resus_chest_compressions" value={formData.resus_chest_compressions} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <YesNoToggle label="4. Intubation for resuscitation (any reason)" name="intubation_during_resus" value={formData.intubation_during_resus} onChange={handleChange} required />
                  </div>
                </div>
                <div className="form-row">
                  <NumField label="5. Time to spontaneous respiratory efforts" num={null} name="time_to_spontaneous_breathing" unit="sec" />
                  <SelectField label="6. HIE (Levene's)" num={null} name="hie_grade" options={["None", "Mild", "Moderate", "Severe"]} required />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================= I.2 POST-NATAL POST-RESUSCITATION OUTCOMES ================= */}
        <div className="form-section soft-blue">
          <h3><ClipboardList size={17} className="sec-icon" /> <span className="sec-num">I.2</span> Post-natal Post-resuscitation Outcomes</h3>

          <div className="card">
            <div className="card-header-row" onClick={() => setOpenSection(openSection === "i2" ? null : "i2")}>
              <span>Respiratory Support &amp; Sepsis (0.5–72h)</span>
              <div className="right-section">
                <span className={`summary ${getStatusClass(formData.resp_support_72h)}`}>
                  <span className="icon">{getStatusIcon(formData.resp_support_72h)}</span>
                  Resp support
                </span>
              </div>
              <span className="arrow">{openSection === "i2" ? "▲" : "▼"}</span>
            </div>
            {openSection === "i2" && (
              <div className="card-body">
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label="7. Resp support (0.5–72h, more than supplemental O2)" name="resp_support_72h" value={formData.resp_support_72h} onChange={handleChange} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label="8. Sepsis (EOS) — onset in first 72 hours" name="sepsis_eos" value={formData.sepsis_eos} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <YesNoToggle label="9. Sepsis (LOS) — onset after Day 3" name="sepsis_los" value={formData.sepsis_los} onChange={handleChange} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label="10. Culture positive sepsis" name="culture_positive_sepsis" value={formData.culture_positive_sepsis} onChange={handleChange} />
                  </div>
                  {formData.culture_positive_sepsis === "Yes" && (
                    <TextField label="Body fluid" num="11" name="culture_positive_body_fluid" placeholder="e.g. Blood, CSF" />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header-row" onClick={() => setOpenSection(openSection === "i2mort" ? null : "i2mort")}>
              <span>All-cause Mortality ≤ 7 &amp; ≤ 28 Days</span>
              <div className="right-section">
                <span className={`summary ${getStatusClass(formData.mortality_7_days || formData.mortality_28_days)}`}>
                  <span className="icon">{getStatusIcon(formData.mortality_7_days || formData.mortality_28_days)}</span>
                  {formData.mortality_7_days === "Yes" || formData.mortality_28_days === "Yes" ? "Death recorded" : "Not filled"}
                </span>
              </div>
              <span className="arrow">{openSection === "i2mort" ? "▲" : "▼"}</span>
            </div>
            {openSection === "i2mort" && (
              <div className="card-body">
                <h4 style={{ margin: "4px 0" }}>All-cause mortality ≤ 7 days</h4>
                <DeathBlock boolName="mortality_7_days" fieldPrefix="mortality_7d" nums={[12, 13, 14, 15, 16]} ageLabel="hrs" />

                <h4 style={{ margin: "16px 0 4px" }}>All-cause mortality ≤ 28 days</h4>
                <DeathBlock boolName="mortality_28_days" fieldPrefix="mortality_28d" nums={[17, 18, 19, 20, 21]} ageLabel="days" />
              </div>
            )}
          </div>
        </div>

        {/* ================= I.3 ASSESSMENT AT 36 WEEKS PMA ================= */}
        <div className="form-section soft-blue">
          <h3><CalendarClock size={17} className="sec-icon" /> <span className="sec-num">I.3</span> Assessment at 36 Weeks PMA</h3>

          <div className="card">
            <div className="card-header-row" onClick={() => setOpenSection(openSection === "i3" ? null : "i3")}>
              <span>36-Week Outcomes</span>
              <div className="right-section">
                <span className={`summary ${getStatusClass(formData.death36)}`}>
                  <span className="icon">{getStatusIcon(formData.death36)}</span>
                  {summary36()}
                </span>
              </div>
              <span className="arrow">{openSection === "i3" ? "▲" : "▼"}</span>
            </div>
            {openSection === "i3" && (
              <div className="card-body">
                <EncounterBlock methodName="encounter36_method" otherName="encounter36_other" numMethod={22} numOther={23} />

                <h4 style={{ margin: "12px 0 4px" }}>Death by 36 weeks PMA</h4>
                <DeathBlock boolName="death36" fieldPrefix="death36" nums={[24, 25, 26, 27, 28]} ageLabel="days" />

                <h4 style={{ margin: "16px 0 4px" }}>29. BPD at 36 weeks PMA — Jensen (primary)</h4>
                <div className="form-row">
                  <SelectField label="Grade" num={null} name="bpd36_jensen_grade"
                    options={["No BPD (Room air)", "Grade 1 (NC ≤ 2 L/min)", "Grade 2 (NC > 2 L/min or CPAP/NIPPV)", "Grade 3 (Invasive mechanical ventilation)"]} />
                  <DateField label="Date of diagnosis" num={30} name="bpd36_jensen_date" />
                </div>

                <h4 style={{ margin: "16px 0 4px" }}>31. BPD at 36 weeks PMA — NICHD</h4>
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label="a) Radiographic parenchymal lung disease" name="bpd36_nichd_radiographic" value={formData.bpd36_nichd_radiographic} onChange={handleChange} />
                  </div>
                  <NumField label="b) FiO2 at 36 weeks" name="bpd36_nichd_fio2" unit="%" />
                  <NumField label="c) Flow rate" name="bpd36_nichd_flow" unit="L/min" />
                </div>
                <div className="form-row">
                  <SelectField label="Grade" num={null} name="bpd36_nichd_grade"
                    options={["No BPD (Room air)", "Grade 1", "Grade 2", "Grade 3"]} />
                  <DateField label="32. Date of diagnosis" num={null} name="bpd36_nichd_date" />
                </div>

                <h4 style={{ margin: "16px 0 4px" }}>33. NEC — Modified Bell's Staging</h4>
                <NecBlock prefix="36" numStage={33} numSurgery={34} numDate={35} />

                <h4 style={{ margin: "16px 0 4px" }}>36. Brain injury</h4>
                <BrainInjuryBlock prefix="36" numIvh={36} numIvhDate={37} numCpvlDate={38} />

                <h4 style={{ margin: "16px 0 4px" }}>39. ROP — ICROP 3rd Edition</h4>
                <RopBlock presentName="rop36" treatedName="rop36_treated" dateName="rop36_date" numPresent={39} numTreated={40} numDate={41} />
              </div>
            )}
          </div>
        </div>

        {/* ================= I.4 ASSESSMENT AT 40 WEEKS PMA ================= */}
        <div className="form-section soft-blue">
          <h3><CalendarCheck size={17} className="sec-icon" /> <span className="sec-num">I.4</span> Assessment at 40 Weeks PMA</h3>

          <div className="card">
            <div className="card-header-row" onClick={() => setOpenSection(openSection === "i4" ? null : "i4")}>
              <span>40-Week Outcomes</span>
              <div className="right-section">
                <span className={`summary ${getStatusClass(formData.death40)}`}>
                  <span className="icon">{getStatusIcon(formData.death40)}</span>
                  {summary40()}
                </span>
              </div>
              <span className="arrow">{openSection === "i4" ? "▲" : "▼"}</span>
            </div>
            {openSection === "i4" && (
              <div className="card-body">
                <EncounterBlock methodName="encounter40_method" otherName="encounter40_other" numMethod={42} numOther={43} />

                <h4 style={{ margin: "12px 0 4px" }}>Death between 36 and 40 weeks PMA</h4>
                <DeathBlock boolName="death40" fieldPrefix="death40" nums={[44, 45, 46, 47, 48]} ageLabel="days" />

                <h4 style={{ margin: "16px 0 4px" }}>49. NEC — Modified Bell's Staging</h4>
                <NecBlock prefix="40" numStage={49} numSurgery={50} numDate={51} />

                <h4 style={{ margin: "16px 0 4px" }}>52. Brain injury</h4>
                <BrainInjuryBlock prefix="40" numIvh={52} numIvhDate={53} numCpvlDate={54} />

                <h4 style={{ margin: "16px 0 4px" }}>55. ROP — ICROP 3rd Edition</h4>
                <RopBlock presentName="rop40" treatedName="rop40_treated" dateName="rop40_date" numPresent={55} numTreated={56} numDate={57} />

                <div className="form-row">
                  <SelectField label="58. Abnormal MRI Brain at TEA (40 ± 2w PMA)" num={null} name="abnormal_mri_tea" options={["Yes", "No", "Not done"]} />
                </div>
                <p style={{ fontSize: "13px", color: "#555" }}>Check MRI form for more details.</p>
              </div>
            )}
          </div>
        </div>

        {/* ================= I.5 ASSESSMENT AT 44 WEEKS PMA ================= */}
        <div className="form-section soft-blue">
          <h3><CalendarRange size={17} className="sec-icon" /> <span className="sec-num">I.5</span> Assessment at 44 Weeks PMA</h3>

          <div className="card">
            <div className="card-header-row" onClick={() => setOpenSection(openSection === "i5" ? null : "i5")}>
              <span>44-Week Outcomes</span>
              <div className="right-section">
                <span className={`summary ${getStatusClass(formData.death44)}`}>
                  <span className="icon">{getStatusIcon(formData.death44)}</span>
                  {summary44()}
                </span>
              </div>
              <span className="arrow">{openSection === "i5" ? "▲" : "▼"}</span>
            </div>
            {openSection === "i5" && (
              <div className="card-body">
                <EncounterBlock methodName="encounter44_method" otherName="encounter44_other" numMethod={59} numOther={60} />

                <h4 style={{ margin: "12px 0 4px" }}>Death between 40 and 44 weeks PMA</h4>
                <DeathBlock boolName="death44" fieldPrefix="death44" nums={[61, 62, 63, 64, 65]} ageLabel="days" />

                <h4 style={{ margin: "16px 0 4px" }}>66. NEC — Modified Bell's Staging</h4>
                <NecBlock prefix="44" numStage={66} numSurgery={67} numDate={68} />

                <h4 style={{ margin: "16px 0 4px" }}>69. Brain injury</h4>
                <BrainInjuryBlock prefix="44" numIvh={69} numIvhDate={70} numCpvlDate={71} />

                <h4 style={{ margin: "16px 0 4px" }}>72. ROP — ICROP 3rd Edition</h4>
                <RopBlock presentName="rop44_assessed" treatedName="rop44_treated" dateName="rop44_date" numPresent={72} numTreated={73} numDate={74} />
              </div>
            )}
          </div>
        </div>

        {/* ================= I.6 OVERALL ================= */}
        <div className="form-section soft-blue">
          <h3><Skull size={17} className="sec-icon" /> <span className="sec-num">I.6</span> Overall</h3>

          <div className="card">
            <div className="card-header-row" onClick={() => setOpenSection(openSection === "i6" ? null : "i6")}>
              <span>Cumulative Respiratory Support, Sepsis &amp; Mortality</span>
              <div className="right-section">
                <span className={`summary ${getStatusClass(formData.mortality_in_hospital || formData.mortality_after_discharge)}`}>
                  <span className="icon">{getStatusIcon(formData.mortality_in_hospital || formData.mortality_after_discharge)}</span>
                  Overall
                </span>
              </div>
              <span className="arrow">{openSection === "i6" ? "▲" : "▼"}</span>
            </div>
            {openSection === "i6" && (
              <div className="card-body">
                <h4 style={{ margin: "4px 0" }}>75. Duration of respiratory support (cumulative, days)</h4>
                <div className="form-row">
                  <NumField label="a) Invasive mechanical ventilation" name="mv_days" unit="days" />
                  <NumField label="b) Non-invasive ventilation" name="niv_days" unit="days" />
                  <NumField label="c) CPAP" name="cpap_days" unit="days" />
                </div>
                <div className="form-row">
                  <NumField label="d) HFNC" name="hfnc_days" unit="days" />
                  <NumField label="e) NIPPV" name="nippv_days" unit="days" />
                </div>

                <h4 style={{ margin: "16px 0 4px" }}>76. Sepsis (overall, any type)</h4>
                <div className="form-row">
                  <div className="form-group">
                    <YesNoToggle label="76. Sepsis (overall)" name="sepsis_overall" value={formData.sepsis_overall} onChange={handleChange} />
                  </div>
                  {formData.sepsis_overall === "Yes" && (
                    <NumField label="Number of episodes" num={77} name="sepsis_overall_episodes" />
                  )}
                </div>

                <h4 style={{ margin: "16px 0 4px" }}>All-cause mortality during hospital stay</h4>
                <DeathBlock boolName="mortality_in_hospital" fieldPrefix="mortality_hospital" nums={[78, 79, 80, 81, 82]} ageLabel="days" />

                <h4 style={{ margin: "16px 0 4px" }}>All-cause mortality after discharge</h4>
                <DeathBlock boolName="mortality_after_discharge" fieldPrefix="mortality_after_discharge" nums={[83, 84, 85, 86, 87]} ageLabel="days" />
              </div>
            )}
          </div>
        </div>

        {/* ================= COMPLETION ================= */}
        <div className="form-section soft-blue">
          <h3>COMPLETION</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Completed by</label>
              <input name="completed_by" value={formData.completed_by || ""} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Designation</label>
              <input name="designation" value={formData.designation || ""} onChange={handleChange} />
            </div>
            <DateField label="Completion date" num={null} name="completion_date" />
          </div>
        </div>

        <button className="submit-btn" type="submit">Save Form I</button>
      </form>

      {saveMessage && (
        <div className={`form-message${saveMessage.startsWith("✅") ? " msg-success" : " msg-error"}`}>
          {saveMessage}
        </div>
      )}

      <FormNavBar
        onBack={handleNavBack}
        onSave={saveFormI}
        onNext={handleNavNext}
        backLabel="Neonatal Morbidities"
        nextLabel="Composite Outcome"
        step={9} totalSteps={17}
        isSaved={isSaved}
      />
    </>
  );
}
