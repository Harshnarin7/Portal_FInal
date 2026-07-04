import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/FormJ.css";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import FormLayout from "./components/FormLayout";
import { usePatient } from "./context/PatientContext";

import { useFormProgress } from "./context/FormProgressContext";

export default function FormJ() {

const location = useLocation();
const navigate = useNavigate();
const { markFormCompleted } = useFormProgress();
const { patientData } = usePatient();
const [errors, setErrors] = useState({});

const [activeTab, setActiveTab] = useState("36");

const steps = ["36","40","44","mri","final"];

const nextStep = () => {
  const index = steps.indexOf(activeTab);
  if(index < steps.length - 1){
    setActiveTab(steps[index+1]);
  }
};

const prevStep = () => {
  const index = steps.indexOf(activeTab);
  if(index > 0){
    setActiveTab(steps[index-1]);
  }
};

const [formData,setFormData] = useState({

enrollment_id:"",
gestation_at_birth:"",
dob:"",

assess_36_date:"",
assess_36_method:"",
death_before_36:"",
death_36_cause:"",
resp_support_36: "",
nichd_resp_category_36: "",
nichd_subtype_36: "",
bpd_jensen: "",
composite_36: "",
composite_36_component: "",

nicu_radiographic: "",
fio2_36: "",
flow_rate_36: "",
resp_support_nichd: "",
bpd_nichd: "",

rop_any:"",
rop_stage:"",
rop_zone:"",
rop_treatment_other: "",
new_rop:"",

mri_subset:"",
overall_mri:"",
mri_date:"",
mri_pma_weeks:"",
mri_pma_days:"",
mri_scanner:"",
mri_sedation:"",
mri_sedation_agent:"",

mri_dwi:false,
mri_t1:false,
mri_t2:false,
mri_swi:false,
mri_dti:false,

mri_radiologist:"",
mri_report_date:"",

completed_by:"",
designation:""

});

const isDeadAt36 = formData.death_before_36 === "Yes";
const isDeadAt40 = formData.death_36_40 === "Yes";
const isDeadAt44 = formData.death_40_44 === "Yes";
const isMRIEnabled =
  formData.mri_subset === "Yes" &&
  formData.death_before_36 !== "Yes";
useEffect(() => {
  const id =
  patientData?.enrollment_id ||
  location.state?.enrollmentId ||
  localStorage.getItem("current_enrollment_id") ||
  "";

  setFormData((p) => ({
    ...p,
    enrollment_id: id
  }));
}, [patientData, location.state]);
useEffect(() => {
  if (!formData.enrollment_id) return;

  api.get(`/birth-resuscitation/${formData.enrollment_id}`)
    .then(res => {
      const data = res.data;

      const hasGestation = data.gestation_weeks != null || data.gestation_days != null;
      setFormData(prev => ({
        ...prev,
        dob: data.date_of_birth || "",
        gestation_at_birth: hasGestation
          ? `${data.gestation_weeks ?? 0} weeks ${data.gestation_days ?? 0} days`
          : prev.gestation_at_birth
      }));
    })
    .catch(err => {
      console.log("Form B data not found", err);
    });

}, [formData.enrollment_id]);
useEffect(() => {
  if (!patientData) return;

  const gestationFormatted =
  patientData.gestation_weeks != null &&
  patientData.gestation_days != null
    ? `${patientData.gestation_weeks} weeks ${patientData.gestation_days} days`
    : "";

  setFormData((p) => ({
    ...p,
    dob: patientData.dob || "",
    gestation_at_birth: gestationFormatted
  }));
}, [patientData]);
useEffect(()=>{
if(location.state?.enrollmentId){
setFormData(p=>({
...p,
enrollment_id:location.state.enrollmentId
}))
}
},[location.state])

useEffect(()=>{

if(!formData.enrollment_id) return;

api.get(`/composite-outcome/${formData.enrollment_id}`)
.then(res=>{
if(res.data.length>0){
setFormData(p=>({...p,...res.data[0]}))
}
})
.catch(()=>{})

},[formData.enrollment_id])

const calculatePMAFromDates = (dob, assessDate, gestation) => {
  if (!dob || !assessDate || !gestation) return { weeks: "", days: "" };

  // Extract GA
  const match = gestation.match(/\d+/g);
  const birthWeeks = parseInt(match?.[0] || 0);
  const birthDays = parseInt(match?.[1] || 0);

  // Convert GA to days
  const gestationDays = birthWeeks * 7 + birthDays;

  // Postnatal age
  const d1 = new Date(dob);
  const d2 = new Date(assessDate);

  const postnatalDays = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));

  if (postnatalDays < 0) return { weeks: "", days: "" };

  // Total PMA
  const totalDays = gestationDays + postnatalDays;

  return {
    weeks: Math.floor(totalDays / 7),
    days: totalDays % 7
  };
};

useEffect(() => {

if (formData.death_before_36 === "Yes") {

setFormData(prev => ({
...prev,
composite_36: "Yes",
composite_36_component: "Death"
}));

}

else if (formData.bpd_jensen === "Grade1") {

setFormData(prev => ({
...prev,
composite_36: "Yes",
composite_36_component: "BPD Grade 1"
}));

}

else if (formData.bpd_jensen === "Grade2") {

setFormData(prev => ({
...prev,
composite_36: "Yes",
composite_36_component: "BPD Grade 2"
}));

}

else if (formData.bpd_jensen === "Grade3") {

setFormData(prev => ({
...prev,
composite_36: "Yes",
composite_36_component: "BPD Grade 3"
}));

}

else {

setFormData(prev => ({
...prev,
composite_36: "No",
composite_36_component: ""
}));

}

}, [formData.death_before_36, formData.bpd_jensen]);

useEffect(() => {

if (
formData.death_36_40 === "Yes" ||
formData.rop_rx === "Yes" ||
formData.nec_stage_iia === "Yes" ||
formData.ivh_grade_3 === "Yes" ||
formData.cpvl_grade_2 === "Yes"
) {

setFormData(p => ({
...p,
composite_40: "Yes"
}));

} else {

setFormData(p => ({
...p,
composite_40: "No"
}));

}

}, [
formData.death_36_40,
formData.rop_rx,
formData.nec_stage_iia,
formData.ivh_grade_3,
formData.cpvl_grade_2
]);


useEffect(() => {

if (formData.ivh_grade === "Grade 3" || formData.ivh_grade === "Grade 4") {

setFormData(prev => ({
...prev,
ivh_grade_3: "Yes"
}));

}

else if (formData.ivh_grade === "Grade 1" || formData.ivh_grade === "Grade 2") {

setFormData(prev => ({
...prev,
ivh_grade_3: "No"
}));

}

}, [formData.ivh_grade]);

useEffect(() => {

if (
formData.cpvl_grade === "Grade 2" ||
formData.cpvl_grade === "Grade 3" ||
formData.cpvl_grade === "Grade 4"
) {

setFormData(prev => ({
...prev,
cpvl_grade_2: "Yes"
}));

}

else if (formData.cpvl_grade === "Grade 1") {

setFormData(prev => ({
...prev,
cpvl_grade_2: "No"
}));

}

}, [formData.cpvl_grade]);

useEffect(() => {

if (
formData.nec_stage === "IIA" ||
formData.nec_stage === "IIB" ||
formData.nec_stage === "IIIA" ||
formData.nec_stage === "IIIB"
) {

setFormData(prev => ({
...prev,
nec_stage_iia: "Yes"
}));

}

else if (
formData.nec_stage === "IA" ||
formData.nec_stage === "IB"
) {

setFormData(prev => ({
...prev,
nec_stage_iia: "No"
}));

}

}, [formData.nec_stage]);
useEffect(() => {

if (formData.rop_treatment === "Yes") {

setFormData(prev => ({
...prev,
rop_rx: "Yes"
}));

}

else if (formData.rop_treatment === "No") {

setFormData(prev => ({
...prev,
rop_rx: "No"
}));

}

}, [formData.rop_treatment]);
useEffect(() => {

if (formData.death_36_40 === "Yes") {

setFormData(prev => ({
...prev,
rop_any: "",
rop_stage: "",
rop_zone: "",
rop_plus: "",
a_rop: "",
rop_treatment: "",
rop_rx: "",

nec_dx: "",
nec_stage: "",
nec_stage_iia: "",

ivh_dx: "",
ivh_grade: "",
ivh_grade_3: "",

cpvl_dx: "",
cpvl_grade: "",
cpvl_grade_2: ""
}));

}

}, [formData.death_36_40]);
useEffect(() => {

  let composite = "No";

  if (formData.death_40_44 === "Yes") {
    composite = "Yes";
  }

  if (formData.rop_additional_treatment === "Yes") {
    composite = "Yes";
  }

  if (
    formData.new_nec_stage === "IIA" ||
    formData.new_nec_stage === "IIB" ||
    formData.new_nec_stage === "IIIA" ||
    formData.new_nec_stage === "IIIB"
  ) {
    composite = "Yes";
  }

  if (
    formData.new_ivh_grade === "Grade 3" ||
    formData.new_ivh_grade === "Grade 4"
  ) {
    composite = "Yes";
  }

  if (
    formData.new_cpvl_grade === "Gr 2 (Localized cysts)" ||
    formData.new_cpvl_grade === "Gr 3 (Extensive PVL cysts)" ||
    formData.new_cpvl_grade === "Gr 4 (Subcortical cysts)"
  ) {
    composite = "Yes";
  }

  setFormData(prev => ({
    ...prev,
    composite_44: composite
  }));

}, [
  formData.death_40_44,
  formData.rop_additional_treatment,
  formData.new_nec_stage,
  formData.new_ivh_grade,
  formData.new_cpvl_grade
]);

useEffect(() => {
  if (formData.death_40_44 === "Yes") {
    setFormData(prev => ({
      ...prev,

      // 🔥 CLEAR ROP
      new_rop: "",
      new_rop_stage: "",
      new_rop_plus: "",
      rop_additional_treatment: "",
      rop_additional_type: "",

      // 🔥 CLEAR NEC
      new_nec: "",
      new_nec_stage: "",

      // 🔥 CLEAR IVH
      new_ivh: "",
      new_ivh_grade: "",

      // 🔥 CLEAR cPVL
      new_cpvl: "",
      new_cpvl_grade: ""
    }));
  }
}, [formData.death_40_44]);

useEffect(() => {

  let composite = "No"
  let components = []

  if (formData.death_40_44 === "Yes") {
    composite = "Yes"
    components.push("Death")
  }

  if (formData.rop_additional_treatment === "Yes") {
    composite = "Yes"
    components.push("ROP-Rx")
  }

  if (
    formData.new_nec_stage === "IIA" ||
    formData.new_nec_stage === "IIB" ||
    formData.new_nec_stage === "IIIA" ||
    formData.new_nec_stage === "IIIB"
  ) {
    composite = "Yes"
    components.push("NEC ≥ IIA")
  }

  if (
    formData.new_ivh_grade === "Grade 3" ||
    formData.new_ivh_grade === "Grade 4"
  ) {
    composite = "Yes"
    components.push("IVH ≥ 3")
  }

  if (
    formData.new_cpvl_grade === "Gr 2 (Localized cysts)" ||
    formData.new_cpvl_grade === "Gr 3 (Extensive PVL cysts)" ||
    formData.new_cpvl_grade === "Gr 4 (Subcortical cysts)"
  ) {
    composite = "Yes"
    components.push("cPVL ≥ 2")
  }

  setFormData(prev => ({
    ...prev,
    composite_44: composite,
    composite_44_components: components.join(", ")
  }))

}, [
  formData.death_40_44,
  formData.rop_additional_treatment,
  formData.new_nec_stage,
  formData.new_ivh_grade,
  formData.new_cpvl_grade
])

useEffect(() => {

let abnormal = false;

if (
formData.bgt_abnormal === "Yes" ||
formData.plic_abnormal === "Yes" ||
formData.atrophy === "Yes" ||
formData.wm_abnormal === "Yes" ||
formData.cc_abnormal === "Yes" ||
formData.cerebellum_abnormal === "Yes" ||
formData.hemorrhage === "Yes"
){
abnormal = true;
}

setFormData(prev => ({
...prev,
overall_mri: abnormal ? "Abnormal" : "Normal"
}));

}, [
formData.bgt_abnormal,
formData.plic_abnormal,
formData.atrophy,
formData.wm_abnormal,
formData.cc_abnormal,
formData.cerebellum_abnormal,
formData.hemorrhage
]);

useEffect(() => {

let summary = [];

if(formData.bgt_abnormal === "Yes") summary.push("BGT abnormality");

if(formData.plic_abnormal === "Yes") summary.push("PLIC abnormality");

if(formData.atrophy === "Yes") summary.push("Atrophy");

if(formData.wm_abnormal === "Yes") summary.push("White matter injury");

if(formData.cc_abnormal === "Yes") summary.push("Corpus callosum abnormality");

if(formData.cerebellum_abnormal === "Yes") summary.push("Cerebellar abnormality");

if(formData.hemorrhage === "Yes") summary.push("Hemorrhage");

setFormData(prev => ({
...prev,
mri_summary: summary.join(", ")
}));

}, [
formData.bgt_abnormal,
formData.plic_abnormal,
formData.atrophy,
formData.wm_abnormal,
formData.cc_abnormal,
formData.cerebellum_abnormal,
formData.hemorrhage
]);

useEffect(() => {

if(formData.mri_subset === "No"){

setFormData(prev => ({
...prev,

// acquisition
mri_date:"",
mri_pma_weeks:"",
mri_pma_days:"",
mri_scanner:"",
mri_sedation:"",
mri_sedation_agent:"",

// sequences
mri_dwi:false,
mri_t1:false,
mri_t2:false,
mri_swi:false,
mri_dti:false,

// findings
myelination:"",
bgt_abnormal:"",
bgt_type:"",
bgt_site:"",
plic_abnormal:"",
plic_type:"",
atrophy:"",
atrophy_type:"",
wm_abnormal:"",
wm_location:"",
wm_type:"",
cc_abnormal:"",
cc_type:"",
cerebellum_abnormal:"",
cerebellum_type:"",
hemorrhage:"",
hemorrhage_location:"",

// output
overall_mri:"",
mri_summary:""

}));

}

},[formData.mri_subset]);
useEffect(() => {

if(formData.mri_date && !formData.mri_report_date){
setFormData(prev => ({
...prev,
mri_report_date: formData.mri_date
}));
}

},[formData.mri_date]);

useEffect(() => {
  if (!formData.assess_36_date || !formData.dob || !formData.gestation_at_birth) return;

  const { weeks, days } = calculatePMAFromDates(
    formData.dob,
    formData.assess_36_date,
    formData.gestation_at_birth
  );

  setFormData(prev => ({
    ...prev,
    actual_pma_36_weeks: weeks,
    actual_pma_36_days: days
  }));

}, [formData.assess_36_date, formData.dob, formData.gestation_at_birth]);

useEffect(() => {
  if (!formData.assess_40_date || !formData.dob || !formData.gestation_at_birth) return;

  const { weeks, days } = calculatePMAFromDates(
    formData.dob,
    formData.assess_40_date,
    formData.gestation_at_birth
  );

  setFormData(prev => ({
    ...prev,
    actual_pma_40_weeks: weeks,
    actual_pma_40_days: days
  }));

}, [formData.assess_40_date, formData.dob, formData.gestation_at_birth]);

useEffect(() => {
  if (!formData.assess_44_date || !formData.dob || !formData.gestation_at_birth) return;

  const { weeks, days } = calculatePMAFromDates(
    formData.dob,
    formData.assess_44_date,
    formData.gestation_at_birth
  );

  setFormData(prev => ({
    ...prev,
    actual_pma_44_weeks: weeks,
    actual_pma_44_days: days
  }));

}, [formData.assess_44_date, formData.dob, formData.gestation_at_birth]);

useEffect(() => {
  if (!formData.death_36_date || !formData.dob) return;

  const dob = new Date(formData.dob);
  const death = new Date(formData.death_36_date);

  const diffDays = Math.floor((death - dob) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return;

  setFormData(prev => ({
    ...prev,
    death_36_age_days: diffDays
  }));

}, [formData.death_36_date, formData.dob]);

useEffect(() => {
  if (!formData.death_40_date || !formData.dob) return;

  const dob = new Date(formData.dob);
  const death = new Date(formData.death_40_date);

  const diffDays = Math.floor((death - dob) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return;

  setFormData(prev => ({
    ...prev,
    death_40_age_days: diffDays
  }));

}, [formData.death_40_date, formData.dob]);


useEffect(() => {
  if (!formData.death_44_date || !formData.dob) return;

  const dob = new Date(formData.dob);
  const death = new Date(formData.death_44_date);

  const diffDays = Math.floor((death - dob) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return;

  setFormData(prev => ({
    ...prev,
    death_44_age_days: diffDays
  }));

}, [formData.death_44_date, formData.dob]);

useEffect(() => {
  if (!formData.mri_date || !formData.dob) return;

  const dob = new Date(formData.dob);
  const mriDate = new Date(formData.mri_date);

  const diffDays = Math.floor((mriDate - dob) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return;

  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;

  setFormData(prev => ({
    ...prev,
    mri_pma_weeks: weeks,
    mri_pma_days: days
  }));

}, [formData.mri_date, formData.dob]);
const handleChange = (e) => {
  const { name, value } = e.target;

  setFormData((prev) => ({
    ...prev,
    [name]: value
  }));

  const error = validate(name, value);

  setErrors((prev) => ({
    ...prev,
    [name]: error
  }));
};

const validate = (name, value) => {
  let error = "";

  if (name === "mri_report_date") {
  if (formData.mri_subset === "Yes") {

    if (!value) {
      error = "Report date is required";
    } 
    else if (formData.mri_date && new Date(value) < new Date(formData.mri_date)) {
      error = "Cannot be before MRI date";
    } 
    else if (new Date(value) > new Date()) {
      error = "Cannot be in future";
    }
  }
}

  if (name === "mri_radiologist") {
  // Only validate when MRI is selected
  if (formData.mri_subset === "Yes") {

    if (!value) {
      error = "Radiologist name is required";
    } else if (!/^[a-zA-Z\s.]+$/.test(value)) {
      error = "Only alphabets allowed";
    } else if (value.trim().length < 3) {
      error = "Minimum 3 characters required";
    }
  }
}

  // DATE VALIDATION
  if (name.includes("date") && formData.dob) {
    if (new Date(value) < new Date(formData.dob)) {
      error = "Cannot be before DOB";
    }
  }

  // FiO2 RANGE
  if (name === "fio2_36") {
    if (value && (value < 0 || value > 100)) {
      error = "Must be between 0–100";
    }
  }

  // REQUIRED CONDITIONS
  if (name === "death_36_cause" && formData.death_before_36 === "Yes" && !value) {
    error = "Required";
  }

  if (name === "rop_treatment_type" && formData.rop_treatment === "Yes" && !value) {
    error = "Select treatment type";
  }

  if (name === "mri_sedation_agent" && formData.mri_sedation === "Yes" && !value) {
    error = "Required";
  }

  return error;
};
useEffect(() => {
  const fio2 = Number(formData.fio2_36);
  const flow = Number(formData.flow_rate_36);

  if (!fio2) return;

  let category = "";
  let subtype = "";

  // 🟢 Room Air
  if (fio2 === 21 && (!flow || flow === 0)) {
    category = "No BPD";
    subtype = "room_air";
  }

  // 🔴 Grade 3
  else if (fio2 >= 30) {
    category = "Grade 3";
    subtype = "grade3";
  }

  // 🟡 Grade 2
  else if (flow >= 3 && fio2 >= 22 && fio2 <= 29) {
    category = "Grade 2";
    subtype = "grade2";
  }

  // 🔵 Grade 1 — LOW FLOW (<1L)
  else if (flow < 1 && fio2 >= 22 && fio2 <= 29) {
    category = "Grade 1";
    subtype = "grade1_low";
  }

  // 🔵 Grade 1 — MID FLOW (FIXED ✅)
  else if (flow >= 1 && flow < 3 && (fio2 === 21 || (fio2 >= 22 && fio2 <= 29))) {
    category = "Grade 1";
    subtype = "grade1_mid";
  }

  setFormData(prev => ({
    ...prev,
    nichd_resp_category_36: category,
    nichd_subtype_36: subtype,
    bpd_nichd: category
  }));

}, [formData.fio2_36, formData.flow_rate_36]);

useEffect(() => {
  if (formData.death_before_36 === "Yes") {
    setFormData(prev => ({
      ...prev,

      // CLEAR 40
      assess_40_date: "",
      assess_40_method: "",
      death_36_40: "",
      death_40_date: "",
      death_40_cause: "",
      rop_any: "",
      nec_dx: "",
      ivh_dx: "",
      cpvl_dx: "",

      // CLEAR 44
      assess_44_date: "",
      assess_44_method: "",
      death_40_44: "",
      death_44_date: "",
      death_44_cause: "",
      new_rop: "",
      new_nec: "",
      new_ivh: "",
      new_cpvl: ""
    }));
  }
}, [formData.death_before_36]);

useEffect(() => {
  if (formData.death_36_40 === "Yes") {
    setFormData(prev => ({
      ...prev,

      // CLEAR 44
      assess_44_date: "",
      assess_44_method: "",
      death_40_44: "",
      death_44_date: "",
      death_44_cause: "",
      new_rop: "",
      new_nec: "",
      new_ivh: "",
      new_cpvl: ""
    }));
  }
}, [formData.death_36_40]);
useEffect(() => {
  if (formData.death_before_36 === "Yes") {
    setFormData(prev => ({
      ...prev,

      // 🔥 CLEAR BPD
      resp_support_36: "",
      bpd_jensen: "",
      nichd_resp_category_36: "",
      nichd_subtype_36: "",
      bpd_nichd: "",

      fio2_36: "",
      flow_rate_36: ""
    }));
  }
}, [formData.death_before_36]);
useEffect(() => {
  if (formData.death_before_36 === "Yes") {
    setFormData(prev => ({
      ...prev,

      // 🔥 CLEAR MRI
      mri_subset: "",
      mri_date: "",
      mri_pma_weeks: "",
      mri_pma_days: "",
      mri_scanner: "",
      mri_sedation: "",
      mri_sedation_agent: "",

      mri_dwi: false,
      mri_t1: false,
      mri_t2: false,
      mri_swi: false,
      mri_dti: false,

      mri_radiologist: "",
      mri_report_date: "",

      overall_mri: "",
      mri_summary: ""
    }));
  }
}, [formData.death_before_36]);

const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    if (!formData.enrollment_id) {
      alert("Enrollment ID missing");
      return;
    }

    const payload = {
      enrollment_id: formData.enrollment_id,
      composite_36: formData.composite_36,
      composite_36_component: formData.composite_36_component,
      composite_40: formData.composite_40,
      composite_44: formData.composite_44,
      composite_44_components: formData.composite_44_components,
      overall_mri: formData.overall_mri
    };

    console.log(payload);

    await api.post("/composite-outcome/", payload);

    markFormCompleted("form_j");

    alert("Form J submitted successfully");

    navigate(`/form-g/${formData.enrollment_id}`);

  } catch (err) {
    console.log(err.response?.data); // 🔥 VERY IMPORTANT
    alert("Error saving Form J");
  }
};

const getAssessmentWindow = (targetWeeks) => {
  if (!formData.dob || !formData.gestation_at_birth) return {};

  const match = formData.gestation_at_birth.match(/(\d+)\s*weeks?\s*(\d+)\s*days?/i);

  if (!match) return {};

  const birthWeeks = parseInt(match[1]);
  const birthDays = parseInt(match[2]);

  const dob = new Date(formData.dob);

  // ✅ Convert everything to days
  const gestationDaysTotal = birthWeeks * 7 + birthDays;
  const targetDays = targetWeeks * 7;

  const daysToAdd = targetDays - gestationDaysTotal;

  const expectedDate = new Date(dob);
  expectedDate.setDate(expectedDate.getDate() + daysToAdd);

  const minDate = new Date(expectedDate);
  minDate.setDate(minDate.getDate() - 5);

  const maxDate = new Date(expectedDate);
  maxDate.setDate(maxDate.getDate() + 10);

  return { minDate, maxDate, expectedDate };
};

const assess36Window = getAssessmentWindow(36);

  // (optional)
  const assess40Window = getAssessmentWindow(40);
  const assess44Window = getAssessmentWindow(44);

  const getDateClass = (dateValue, window) => {
  if (!dateValue || !window?.minDate || !window?.maxDate) return "";

  const selected = new Date(dateValue);

  if (selected >= window.minDate && selected <= window.maxDate) {
    return "valid-input";
  }

  return "warning-input";
};

const formatDate = (date) => {
  if (!date) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const assess36RangeText =
  assess36Window.minDate && assess36Window.maxDate
    ? `Valid range: ${formatDate(assess36Window.minDate)} – ${formatDate(assess36Window.maxDate)}`
    : "";
const assess40RangeText =
  assess40Window.minDate && assess40Window.maxDate
    ? `Valid range: ${formatDate(assess40Window.minDate)} – ${formatDate(assess40Window.maxDate)}`
    : "";

const assess44RangeText =
  assess44Window.minDate && assess44Window.maxDate
    ? `Valid range: ${formatDate(assess44Window.minDate)} – ${formatDate(assess44Window.maxDate)}`
    : "";


const CustomDateInput = React.forwardRef(({ value, onClick, title, className }, ref) => (
  <input
    ref={ref}
    value={value || ""}
    onClick={onClick}
    readOnly
    title={title} // ✅ tooltip works here
    className={className}
    placeholder="DD-MM-YYYY"
  />
));
return(



<form className="screening-form" onSubmit={handleSubmit}>

<div className="form-a-header">
<div className="form-a-header-main">
<h2>Form J — Composite Outcome Assessment</h2>
</div>
</div>

{/* TABS */}

<div className="form-tabs">

<button type="button"
className={activeTab==="36"?"tab active":"tab"}
onClick={()=>setActiveTab("36")}>
36 Weeks
</button>

<button
type="button"
className={activeTab==="40"?"tab active":"tab"}
onClick={()=> !isDeadAt36 && setActiveTab("40")}
disabled={isDeadAt36}
>
40 Weeks
</button>

<button
type="button"
className={activeTab==="44"?"tab active":"tab"}
onClick={()=> !(isDeadAt36 || isDeadAt40) && setActiveTab("44")}
disabled={isDeadAt36 || isDeadAt40}
>
44 Weeks
</button>

<button
type="button"
className={activeTab==="mri"?"tab active":"tab"}
onClick={()=>  setActiveTab("mri")}

>
MRI
</button>

<button type="button"
className={activeTab==="final"?"tab active":"tab"}
onClick={()=>setActiveTab("final")}>
Final
</button>

</div>

{/* IDENTIFICATION */}

<div className="form-section soft-blue">

<h3>Identification</h3>

<div className="form-row">

<div className="form-group">
<label>Enrollment ID</label>
<input value={formData.enrollment_id} readOnly/>
</div>

<div className="form-group">
<label>Gestation at Birth</label>
<input name="gestation_at_birth"
value={formData.gestation_at_birth}
onChange={handleChange} readOnly/>
</div>

<div className="form-group">
<label>Date of Birth</label>
<DatePicker
  selected={formData.dob ? new Date(formData.dob) : null}
  onChange={() => {}}
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
  readOnly
/>
</div>

</div>

</div>

{/* 36 WEEKS */}

{activeTab==="36" &&(

<div className="form-section soft-green">

<h3>Assessment at 36 Weeks PMA</h3>

<div className="sub-section modern-card">

<h4>Assessment Details</h4>



<div className="form-group">
  <label>Date of Assessment<span className="required">*</span></label>

  <DatePicker
    selected={
      formData.assess_36_date
        ? new Date(formData.assess_36_date)
        : null
    }
    onChange={(date) => {
      setFormData((prev) => ({
        ...prev,
        assess_36_date: date
          ? date.toISOString().split("T")[0]
          : ""
      }));
    }}
    dateFormat="dd-MM-yyyy"
    placeholderText="DD-MM-YYYY"
    className={
      !formData.assess_36_date
        ? ""
        : getDateClass(formData.assess_36_date, assess36Window)
    }
  />

  {/* ✅ RANGE */}
  {assess36RangeText && (
    <div className="range-text">
      {assess36RangeText}
    </div>
  )}

  {/* 📅 EXPECTED */}
  {assess36Window.expectedDate && (
    <div className="expected-box">
      📅 Expected:
      <strong>
        {assess36Window.expectedDate.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        })}
      </strong>
    </div>
  )}

  {/* ⚠ WARNING */}
  {formData.assess_36_date &&
    assess36Window.minDate &&
    assess36Window.maxDate &&
    (() => {
      const selected = new Date(formData.assess_36_date);

      if (
        selected < assess36Window.minDate ||
        selected > assess36Window.maxDate
      ) {
        return (
          <div className="warning-box-lite">
            ⚠ Outside expected 36-week window
          </div>
        );
      }
    })()}
</div>

<div className="form-group">
<label>Method<span className="required">*</span></label>

<select
name="assess_36_method"
value={formData.assess_36_method}
onChange={handleChange}
className={errors.assess_36_method ? "input-error" : ""}
>
<option value="">Select</option>
<option>Physical</option>
<option>Telephonic</option>
</select>

{errors.assess_36_method && (
  <span className="error-text">{errors.assess_36_method}</span>
)}
</div>



<div className="form-group">

<label>Actual PMA</label>

<div className="pma-input">

<input
type="number"
name="actual_pma_36_weeks"
value={formData.actual_pma_36_weeks}
readOnly

/>

<span>weeks</span>

<input
type="number"
name="actual_pma_36_days"
value={formData.actual_pma_36_days}
readOnly

/>

<span>days</span>

</div>

</div>

</div>

<div className="sub-section">

<h4>A. Death</h4>

<div className="form-group">
<label>Death before 36 weeks PMA<span className="required">*</span></label>

<select
name="death_before_36"
value={formData.death_before_36}
onChange={handleChange}
className={errors.death_before_36 ? "input-error" : ""}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>

{errors.death_before_36 && (
  <span className="error-text">{errors.death_before_36}</span>
)}
</div>
{formData.death_before_36 === "Yes" && (

<div className="form-row">

<div className="form-group">
<label>Date of Death {formData.death_before_36 === "Yes" && <span className="required">*</span>}</label>

<DatePicker
  selected={formData.death_36_date ? new Date(formData.death_36_date) : null}
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      death_36_date: date ? date.toISOString().split("T")[0] : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
/>

{errors.death_36_date && (
  <span className="error-text">{errors.death_36_date}</span>
)}
</div>

<div className="form-group">
<label>Age at Death (days)</label>
<input
name="death_36_age_days"
value={formData.death_36_age_days}
readOnly
/>
</div>

</div>

)}

{formData.death_before_36 === "Yes" && (

<div className="form-group">
<label>Cause of Death {formData.death_before_36 === "Yes" && <span className="required">*</span>}</label>

<input
name="death_36_cause"
value={formData.death_36_cause}
onChange={handleChange}
className={errors.death_36_cause ? "input-error" : ""}
placeholder="Enter cause of death"
/>

{errors.death_36_cause && (
  <span className="error-text">{errors.death_36_cause}</span>
)}
</div>

)}

</div>

<div className={`sub-section ${isDeadAt36 ? "disabled-section" : ""}`}>
<h4>B. Bronchopulmonary Dysplasia (BPD)</h4>

{isDeadAt36 && (
  <div className="warning-box">
    BPD cannot be assessed as the infant died before 36 weeks.
  </div>
)}

<div className="bpd-section">

<div className="bpd-card">

<h5>JENSEN 2019 CRITERIA (Primary)</h5>

<p className="criteria-note">
(Based on respiratory support at 36 weeks PMA, regardless of FiO₂)
</p>

<label className="criteria-label">
Respiratory support at 36 wks PMA:
</label>

<div className="jensen-options">

<div
className={`jensen-card ${formData.resp_support_36==="room_air"?"selected":""}`}
onClick={() => {
  if (isDeadAt36) return; // 🚫 BLOCK CLICK

  setFormData({
    ...formData,
    resp_support_36: "room_air",
    bpd_jensen: "No"
  });
}}
>
<div className="jensen-title">Room air</div>
<div className="jensen-sub">No BPD</div>
</div>

<div
className={`jensen-card ${formData.resp_support_36==="nc_le_2"?"selected":""}`}
onClick={() =>
setFormData({
...formData,
resp_support_36: "nc_le_2",
bpd_jensen: "Grade1"
})
}
>
<div className="jensen-title">Nasal cannula ≤ 2 L/min</div>
<div className="jensen-sub">Grade 1</div>
</div>

<div
className={`jensen-card ${formData.resp_support_36==="nc_gt_2"?"selected":""}`}
onClick={() =>
setFormData({
...formData,
resp_support_36: "nc_gt_2",
bpd_jensen: "Grade2"
})
}
>
<div className="jensen-title">NC &gt; 2 L/min or CPAP / NIPPV</div>
<div className="jensen-sub">Grade 2</div>
</div>

<div
className={`jensen-card ${formData.resp_support_36==="ventilator"?"selected":""}`}
onClick={() =>
setFormData({
...formData,
resp_support_36: "ventilator",
bpd_jensen: "Grade3"
})
}
>
<div className="jensen-title">Invasive mechanical ventilation</div>
<div className="jensen-sub">Grade 3</div>
</div>

</div>
<div style={{ marginTop: "20px" }}>
<div className="bpd-wrapper">

<label className="criteria-label">BPD (Jensen)</label>

<div className="bpd-result">
{formData.bpd_jensen || "Not determined"}
</div>

</div>
</div></div>



<div className="bpd-card">

<h5>NICHD 2018 CRITERIA (Secondary)</h5>

<p className="criteria-note">
(Requires radiographic confirmation + respiratory support/FiO₂ ≥ 3 consecutive days)
</p>

<div className="form-row">

<div className="form-group">
<label>Radiographic Parenchymal Lung Disease</label>
<select
name="nicu_radiographic"
value={formData.nicu_radiographic}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

<div className="form-group">
  <label>FiO₂ at 36 wks (%)</label>

  <input
    type="number"
    name="fio2_36"
    value={formData.fio2_36}
    onChange={handleChange}
  />

  {errors.fio2_36 && (
    <span className="error-text">{errors.fio2_36}</span>
  )}
</div>

<div className="form-group">
<label>Flow Rate (L/min)</label>
<input
type="number"
name="flow_rate_36"
value={formData.flow_rate_36}
onChange={handleChange}
/>
</div>

</div>

<label className="criteria-label">
Respiratory category
</label>

<div className="jensen-options">

<div className="jensen-card disabled">
  <div className={`card ${formData.nichd_subtype_36 === "room_air" ? "selected" : ""}`}>
    <h4>Room air</h4>
    <p>No BPD</p>
  </div>
</div>

<div className="jensen-card disabled">
  <div className={`card ${formData.nichd_subtype_36 === "grade1_low" ? "selected" : ""}`}>
    <h4>NC &lt;1L + FiO₂ 0.22–0.29</h4>
    <p>Grade 1</p>
  </div>
</div>

<div className="jensen-card disabled">
  <div className={`card ${formData.nichd_subtype_36 === "grade1_mid" ? "selected" : ""}`}>
    <h4>NC 1–&lt;3L OR NIV + FiO₂ 0.21</h4>
    <p>Grade 1</p>
  </div>
</div>

<div className="jensen-card disabled">
  <div className={`card ${formData.nichd_subtype_36 === "grade2" ? "selected" : ""}`}>
    <h4>NC ≥3L or NIV + FiO₂ 0.22–0.29</h4>
    <p>Grade 2</p>
  </div>
</div>

<div className="jensen-card disabled">
  <div className={`card ${formData.nichd_subtype_36 === "grade3" ? "selected" : ""}`}>
    <h4>NIV + FiO₂ ≥0.30 or IMV</h4>
    <p>Grade 3</p>
  </div>
</div>

</div>
<div style={{ marginTop: "20px" }}>
<div className="bpd-wrapper">

<label className="criteria-label">BPD (NICHD)</label>

<div className="bpd-result">
{formData.bpd_nichd || "Not determined"}
</div></div>

</div>

</div>

</div>

</div>

<div className="sub-section">

<div className="composite-card">

<h4>36-Week Primary Composite Outcome (Death or BPD)</h4>

<div className="bpd-wrapper">

<label>Death or BPD (Jensen) at 36 weeks</label>

<div className="bpd-result">
{formData.composite_36 || "Not determined"}
</div>

</div>

{formData.composite_36 === "Yes" && (

<div className="bpd-wrapper">

<label>Component</label>

<div className="bpd-result">
{formData.composite_36_component}
</div>

</div>

)}

</div>

</div>

</div>

)}

{/* 40 WEEKS */}

{/* 40 WEEKS */}

{activeTab==="40" &&(

<div className={`form-section soft-green ${isDeadAt36 ? "disabled-section" : ""}`}>

<h3>Assessment at 40 Weeks PMA</h3>
{isDeadAt36 && (
  <div className="warning-box">
    Patient expired before 36 weeks. 40-week assessment is disabled.
  </div>
)}

{/* Assessment Details */}

<div className="sub-section">

<h4>Assessment Details</h4>



<div className="form-group">
<label>Date of Assessment <span className="required">*</span></label>

<DatePicker
  selected={
    formData.assess_40_date
      ? new Date(formData.assess_40_date)
      : null
  }
  onChange={(date) => {
    setFormData((prev) => ({
      ...prev,
      assess_40_date: date
        ? date.toISOString().split("T")[0]
        : ""
    }));
  }}
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
  className={
    !formData.assess_40_date
      ? ""
      : getDateClass(formData.assess_40_date, assess40Window)
  }
/>

{/* ✅ RANGE */}
{assess40RangeText && (
  <div className="range-text">
    {assess40RangeText}
  </div>
)}

{/* 📅 EXPECTED */}
{assess40Window.expectedDate && (
  <div className="expected-box">
    📅 Expected:
    <strong>
      {assess40Window.expectedDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })}
    </strong>
  </div>
)}

{/* ⚠ WARNING */}
{formData.assess_40_date &&
  assess40Window.minDate &&
  assess40Window.maxDate &&
  (() => {
    const selected = new Date(formData.assess_40_date);

    if (
      selected < assess40Window.minDate ||
      selected > assess40Window.maxDate
    ) {
      return (
        <div className="warning-box-lite">
          ⚠ Outside expected 40-week window
        </div>
      );
    }
  })()}

{errors.assess_40_date && (
  <span className="error-text">{errors.assess_40_date}</span>
)}
</div>

<div className="form-group">
<label>Method<span className="required">*</span></label>
<select
name="assess_40_method"
value={formData.assess_40_method}
onChange={handleChange}
>
<option value="">Select</option>
<option>Physical</option>
<option>Telephonic</option>
</select>
</div>



<div className="form-group">

<label>Actual PMA</label>

<div className="pma-input">

<input
type="number"
name="actual_pma_40_weeks"
value={formData.actual_pma_40_weeks}
readOnly
/>

<span>weeks</span>

<input
type="number"
name="actual_pma_40_days"
value={formData.actual_pma_40_days}
readOnly
/>

<span>days</span>

</div>

</div>

</div>


{/* A. Death */}

<div className="sub-section">

<h4>A. Death (between 36-40 weeks)</h4>

<div className="bpd-card">

<div className="form-group">
<label>Death between 36-40 weeks PMA<span className="required">*</span></label>

<select
name="death_36_40"
value={formData.death_36_40}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>

</div>

{formData.death_36_40==="Yes" &&(

<>

<div className="form-row">

<div className="form-group">
<label>
Date of Death {formData.death_before_40 === "Yes" && <span className="required">*</span>}
</label>

<DatePicker
  selected={formData.death_40_date ? new Date(formData.death_40_date) : null}
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      death_40_date: date ? date.toISOString().split("T")[0] : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
/>

{errors.death_40_date && (
  <span className="error-text">{errors.death_40_date}</span>
)}
</div>

<div className="form-group">
<label>Age at Death (days)</label>
<input
name="death_40_age_days"
value={formData.death_40_age_days}
readOnly
/>
</div>

</div>

<div className="form-group">
<label>Cause of Death<span className="required">*</span></label>
<input
name="death_40_cause"
value={formData.death_40_cause}
onChange={handleChange}
/>
</div>

</>

)}

</div>

</div>


{/* B. ROP */}

<div className={`sub-section ${isDeadAt40 ? "disabled-section" : ""}`}>
<h4>B. Retinopathy of Prematurity (ROP) - ICROP 3rd Edition</h4>

{isDeadAt40 && (
  <div className="warning-box">
    ROP cannot be assessed because the infant died before 40 weeks.
  </div>
)}

<div className="rop-section two-column">

<div className="bpd-card">

<h5>ROP Screening & Diagnosis</h5>

<div className="form-group">
<label>ROP Screening Completed</label>

<select
name="rop_screened"
value={formData.rop_screened}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
<option>N/A</option>
</select>

</div>

<div className="form-group">
<label>Any ROP Diagnosed</label>

<select
name="rop_any"
value={formData.rop_any}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>

</div>


{formData.rop_any === "Yes" &&(

<>

<div className="form-group">
<label>Highest Stage</label>

<select
name="rop_stage"
value={formData.rop_stage}
onChange={handleChange}
>
<option value="">Select</option>
<option>1</option>
<option>2</option>
<option>3</option>
<option>4</option>
<option>5</option>
</select>

</div>

<div className="form-group">
<label>Zone</label>

<select
name="rop_zone"
value={formData.rop_zone}
onChange={handleChange}
>
<option value="">Select</option>
<option>I</option>
<option>II</option>
<option>III</option>
</select>

</div>

<div className="form-group">
<label>Plus Disease</label>

<select
name="rop_plus"
value={formData.rop_plus}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

<div className="form-group">
<label>A-ROP (Aggressive ROP)</label>

<select
name="a_rop"
value={formData.a_rop}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

</>

)}

</div>


<div className="bpd-card">

<h5>ROP Treatment</h5>

<div className="form-group">

<label>Treatment Required</label>

<select
name="rop_treatment"
value={formData.rop_treatment}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>

</div>


{formData.rop_treatment === "Yes" &&(

<>

<div className="form-group">

<label>Type</label>

<select
name="rop_treatment_type"
value={formData.rop_treatment_type}
onChange={handleChange}
>
<option value="">Select</option>
<option>Laser</option>
<option>Anti-VEGF</option>
<option>Vitrectomy</option>
<option>Combination</option>
<option>Other</option>
</select>

{formData.rop_treatment_type === "Other" && (

<input
type="text"
name="rop_treatment_other"
placeholder="Specify"
value={formData.rop_treatment_other}
onChange={(e)=>{

const value = e.target.value;

if(/^[a-zA-Z\s]*$/.test(value)){   // only alphabets
setFormData({
...formData,
rop_treatment_other:value
})
}

}}
/>

)}

</div>

<div className="form-group">
<label>Bilateral Treatment</label>

<select
name="rop_bilateral"
value={formData.rop_bilateral}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

</>

)}

<div className="form-group">

<label><strong>ROP requiring treatment</strong></label>

<select
name="rop_rx"
value={formData.rop_rx}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>

</div>

</div>

</div>

</div>


{/* C. NEC */}

<div className={`sub-section ${isDeadAt40 ? "disabled-section" : ""}`}>

<h4>C. Necrotizing Enterocolitis (NEC) - Modified Bell's Staging</h4>

<div className="bpd-section">

<div className="bpd-card">

<div className="form-group">
<label>NEC Diagnosed</label>
<select
name="nec_dx"
value={formData.nec_dx}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.nec_dx === "Yes" && (

<>

<div className="form-group">
<label>Date of Diagnosis</label>
<input
type="date"
name="nec_date"
value={formData.nec_date}
onChange={handleChange}
/>
</div>

<div className="form-group">
<label>Stage</label>
<select
name="nec_stage"
value={formData.nec_stage}
onChange={handleChange}
>
<option value="">Select</option>
<option>IA</option>
<option>IB</option>
<option>IIA</option>
<option>IIB</option>
<option>IIIA</option>
<option>IIIB</option>
</select>
</div>

<div className="form-group">
<label>Surgery Required</label>
<select
name="nec_surgery"
value={formData.nec_surgery}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

</>

)}

</div>

{formData.nec_dx === "Yes" && (
<div className="bpd-card">

<div className="form-group">
<label>Type</label>
<select name="nec_type" value={formData.nec_type} onChange={handleChange}>
<option value="">Select</option>
<option>Peritoneal drain</option>
<option>Laparotomy</option>
</select>
</div>

<div className="form-group">
<label>Stoma Created</label>
<select name="nec_stoma" value={formData.nec_stoma} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

<div className="form-group">
<label>NEC Stage ≥ IIA</label>
<select name="nec_stage_iia" value={formData.nec_stage_iia} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

</div>
)}

</div>

</div>


{/* D. Brain Injury */}

<div className={`sub-section ${isDeadAt40 ? "disabled-section" : ""}`}>

<h4>D. Brain Injury (IVH & cPVL on Cranial USG)</h4>

<div className="bpd-section">

<div className="bpd-card">

<h5>IVH (Papile Classification)</h5>

<div className="form-group">
<label>IVH Diagnosed</label>
<select name="ivh_dx" value={formData.ivh_dx} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.ivh_dx === "Yes" && (

<>
<div className="form-group">
<label>Worst Grade</label>
<select
name="ivh_grade"
value={formData.ivh_grade}
onChange={handleChange}
>
<option value="">Select</option>
<option value="Grade 1">Gr 1 (GMH, minimal IVH &lt;10%)</option>
<option value="Grade 2">Gr 2 (IVH &lt;50% ventricle)</option>
<option value="Grade 3">Gr 3 (IVH ≥50% ventricle)</option>
<option value="Grade 4">Gr 4 (Parenchymal involvement / PVHI)</option>
</select>
</div>


<div className="form-group">
<label>Side</label>
<select name="ivh_side" value={formData.ivh_side} onChange={handleChange}>
<option value="">Select</option>
<option>Right</option>
<option>Left</option>
<option>Bilateral</option>
</select>
</div>
<div className="form-group">
<label>IVH Grade ≥ 3</label>
<select
name="ivh_grade_3"
value={formData.ivh_grade_3}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>
</>

)}

</div>


<div className="bpd-card">

<h5>cPVL (De Vries Classification)</h5>

<div className="form-group">
<label>cPVL Diagnosed</label>
<select name="cpvl_dx" value={formData.cpvl_dx} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.cpvl_dx === "Yes" && (

<>
<div className="form-group">
<label>Grade</label>
<select
name="cpvl_grade"
value={formData.cpvl_grade}
onChange={handleChange}
>
<option value="">Select</option>
<option value="Grade 1">Gr 1 (Transient flares &gt; 7 days)</option>
<option value="Grade 2">Gr 2 (Localized cysts)</option>
<option value="Grade 3">Gr 3 (Extensive FPO cysts)</option>
<option value="Grade 4">Gr 4 (Subcortical WM cysts)</option>
</select>
</div>

<div className="form-group">
<label>Side</label>
<select name="cpvl_side" value={formData.cpvl_side} onChange={handleChange}>
<option value="">Select</option>
<option>Right</option>
<option>Left</option>
<option>Bilateral</option>
</select>
</div>
<div className="form-group">
<label>cPVL Grade ≥ 2</label>
<select
name="cpvl_grade_2"
value={formData.cpvl_grade_2}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>
</>

)}

</div>

</div>

</div>

{/* 40 WEEK COMPOSITE OUTCOME */}

<div className="sub-section">

<div className="composite-card">

<h4>40-Week Composite Outcome</h4>

<div className="bpd-wrapper">

<label>
Death or ROP (Rx) or NEC ≥ IIA or Brain Injury (IVH ≥ 3 / cPVL ≥ 2)
</label>

<div className="bpd-result">
{formData.composite_40 || "Not determined"}
</div>

</div>


{formData.composite_40 === "Yes" && (

<div className="bpd-wrapper">

<label>Components</label>

<div className="bpd-result">

{[
formData.death_36_40 === "Yes" && "Death",
formData.rop_rx === "Yes" && "ROP-Rx",
formData.nec_stage_iia === "Yes" && "NEC ≥ IIA",
formData.ivh_grade_3 === "Yes" && "IVH ≥ 3",
formData.cpvl_grade_2 === "Yes" && "cPVL ≥ 2"
]
.filter(Boolean)
.join(", ")}

</div>

</div>

)}

</div>

</div>

</div>

)}

{/* 44 WEEKS */}

{activeTab === "44" && (

<div className={`form-section soft-green ${(isDeadAt36 || isDeadAt40) ? "disabled-section" : ""}`}>

<h3>Assessment at 44 Weeks PMA</h3>
{isDeadAt36 && (
  <div className="warning-box">
    Patient expired before 36 weeks. 44-week assessment is disabled.
  </div>
)}

{isDeadAt40 && !isDeadAt36 && (
  <div className="warning-box">
    Patient expired between 36–40 weeks. 44-week assessment is disabled.
  </div>
)}

<div className="sub-section">
<h4>Assessment Details</h4>



<div className="form-group">
<label>Date of Assessment <span className="required">*</span></label>

<DatePicker
  selected={
    formData.assess_44_date
      ? new Date(formData.assess_44_date)
      : null
  }
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      assess_44_date: date
        ? date.toISOString().split("T")[0]
        : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
  className={
    !formData.assess_44_date
      ? ""
      : getDateClass(formData.assess_44_date, assess44Window)
  }
/>

{/* ✅ RANGE */}
{assess44RangeText && (
  <div className="range-text">
    {assess44RangeText}
  </div>
)}

{/* 📅 EXPECTED */}
{assess44Window.expectedDate && (
  <div className="expected-box">
    📅 Expected:
    <strong>
      {assess44Window.expectedDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })}
    </strong>
  </div>
)}

{/* ⚠ WARNING */}
{formData.assess_44_date &&
  assess44Window.minDate &&
  assess44Window.maxDate &&
  (() => {
    const selected = new Date(formData.assess_44_date);

    if (
      selected < assess44Window.minDate ||
      selected > assess44Window.maxDate
    ) {
      return (
        <div className="warning-box-lite">
          ⚠ Outside expected 44-week window
        </div>
      );
    }
  })()}

{errors.assess_44_date && (
  <span className="error-text">{errors.assess_44_date}</span>
)}
</div>

<div className="form-group">
<label>Method<span className="required">*</span></label>
<select
name="assess_44_method"
value={formData.assess_44_method}
onChange={handleChange}
>
<option value="">Select</option>
<option>Physical</option>
<option>Telephonic</option>
</select>
</div>



<div className="form-group">
<label>Actual PMA</label>

<div className="pma-input">

<input
type="number"
name="actual_pma_44_weeks"
value={formData.actual_pma_44_weeks}
readOnly
/>

<span>weeks</span>

<input
type="number"
name="actual_pma_44_days"
value={formData.actual_pma_44_days}
readOnly
/>

<span>days</span>

</div>
</div>
</div>


{/* A. Death */}

<div className="sub-section">

<h4>A. Death (between 40-44 weeks)</h4>

<div className="bpd-card">

<div className="form-group">

<label>Death between 40-44 weeks PMA<span className="required">*</span></label>

<select
name="death_40_44"
value={formData.death_40_44}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>

</div>

{formData.death_40_44 === "Yes" && (

<>

<div className="form-row">

<div className="form-group">
<label>
Date of Death {formData.death_before_44 === "Yes" }<span className="required">*</span>
</label>

<DatePicker
  selected={formData.death_44_date ? new Date(formData.death_44_date) : null}
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      death_44_date: date ? date.toISOString().split("T")[0] : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
/>

{errors.death_44_date && (
  <span className="error-text">{errors.death_44_date}</span>
)}
</div>

<div className="form-group">
<label>Age at Death (days)</label>
<input
name="death_44_age_days"
value={formData.death_44_age_days}
readOnly
/>
</div>

</div>

<div className="form-group">
<label>Cause of Death<span className="required">*</span></label>
<input
name="death_44_cause"
value={formData.death_44_cause}
onChange={handleChange}
/>
</div>

</>

)}

</div>
</div>


{/* B. ROP UPDATE */}

<div className={`sub-section ${isDeadAt44 ? "disabled-section" : ""}`}>
<h4>B. ROP & Other Updates (40-44 weeks)</h4>

{isDeadAt44 && (
  <div className="warning-box">
    ROP and other outcomes cannot be assessed because the infant died before 44 weeks
  </div>
)}

<div className="bpd-section">

<div className="bpd-card">

  <h5>ROP Update</h5>

  <div className="form-group">
    <label>New ROP Findings</label>
    <select name="new_rop" value={formData.new_rop} onChange={handleChange}>
      <option value="">Select</option>
      <option>Yes</option>
      <option>No</option>
      <option>N/A</option>
    </select>
  </div>

  {formData.new_rop === "Yes" && (
    <>
      <div className="form-group">
        <label>Stage</label>
        <select name="new_rop_stage" value={formData.new_rop_stage} onChange={handleChange}>
          <option value="">Select</option>
          <option>1</option>
          <option>2</option>
          <option>3</option>
          <option>4</option>
          <option>5</option>
        </select>
      </div>

      <div className="form-group">
        <label>Plus Disease</label>
        <select name="new_rop_plus" value={formData.new_rop_plus} onChange={handleChange}>
          <option value="">Select</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </div>

      <div className="form-group">
        <label>Additional Treatment</label>
        <select name="rop_additional_treatment" value={formData.rop_additional_treatment} onChange={handleChange}>
          <option value="">Select</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </div>

      {formData.rop_additional_treatment === "Yes" && (
        <div className="form-group">
          <label>Treatment Type</label>
          <select name="rop_additional_type" value={formData.rop_additional_type} onChange={handleChange}>
            <option value="">Select</option>
            <option>Laser</option>
            <option>Anti-VEGF</option>
            <option>Vitrectomy</option>
          </select>
        </div>
      )}
    </>
  )}

</div>


<div className="bpd-card">

  <h5>Other New Findings (40–44 wks)</h5>

  <div className="form-group">
    <label>New NEC</label>
    <select name="new_nec" value={formData.new_nec} onChange={handleChange}>
      <option value="">Select</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.new_nec === "Yes" && (
    <div className="form-group">
      <div className="followup-box">
      <label>Stage</label>
      <select name="new_nec_stage" value={formData.new_nec_stage} onChange={handleChange}>
        <option value="">Select</option>
        <option>IA</option>
        <option>IB</option>
        <option>IIA</option>
        <option>IIB</option>
        <option>IIIA</option>
        <option>IIIB</option>
      </select>
    </div>
    </div>
  )}

  <div className="form-group">
    <label>New / Worsening IVH</label>
    <select name="new_ivh" value={formData.new_ivh} onChange={handleChange}>
      <option value="">Select</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.new_ivh === "Yes" && (
    <div className="form-group">
      <div className="followup-box">
      <label>Grade</label>
      <select name="new_ivh_grade" value={formData.new_ivh_grade} onChange={handleChange}>
        <option value="">Select</option>
        <option>Grade 1</option>
        <option>Grade 2</option>
        <option>Grade 3</option>
        <option>Grade 4</option>
      </select>
    </div></div>
  )}

  <div className="form-group">
    <label>New cPVL</label>
    <select name="new_cpvl" value={formData.new_cpvl} onChange={handleChange}>
      <option value="">Select</option>
      <option>Yes</option>
      <option>No</option>
    </select>
  </div>

  {formData.new_cpvl === "Yes" && (
    <div className="form-group">
      <div className="followup-box">
      <label>Grade</label>
      <select name="new_cpvl_grade" value={formData.new_cpvl_grade} onChange={handleChange}>
        <option value="">Select</option>
        <option>Gr 1 (Transient flares &gt; 7 days)</option>
        <option>Gr 2 (Localized cysts)</option>
        <option>Gr 3 (Extensive FPO cysts)</option>
        <option>Gr 4 (Subcortical WM cysts)</option>
      </select>
    </div></div>
  )}

</div>

</div>
</div>


{/* 44 WEEK COMPOSITE OUTCOME */}

<div className="sub-section">

<div className="composite-card">

<h4>44-Week Composite Outcome</h4>

<div className="bpd-wrapper">

<label>
Death or BPD or ROP (Rx) or NEC ≥ IIA or Brain Injury at 44 weeks
</label>

<div className="bpd-result">
{formData.composite_44 || "Not determined"}
</div>

</div>
{formData.composite_44 === "Yes" && (
<div className="bpd-wrapper">

<label>Components</label>

<div className="bpd-result">
{formData.composite_44_components}
</div>

</div>
)}
<div className="form-note">
Note: BPD would have been diagnosed and classified at 36 weeks PMA; IVH, cPVL and NEC would have been diagnosed and classified at 40 weeks PMA.
</div>

</div>

</div>

</div>

)}

{/* MRI */}

{activeTab==="mri" &&(

<div className={`form-section soft-green ${isDeadAt36 ? "disabled-section" : ""}`}>

<h3>MRI Brain at 40 ± 2 Weeks PMA (25% Subset)</h3>

{isDeadAt36 && (
  <div className="warning-box">
    MRI cannot be performed because the infant died before 36 weeks
  </div>
)}

<div className="sub-section mri-section">

<h4 className="section-title">MRI Acquisition Details</h4>

{/* MRI Subset */}
<div className="form-group full-width">
<label>Selected for MRI subset<span className="required">*</span></label>
<select
name="mri_subset"
value={formData.mri_subset}
onChange={handleChange}
className="input-lg"
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.mri_subset === "Yes" && (
<>

{/* ROW 1 */}
<div className="form-row mri-grid">

<div className="form-group">
<label>
Date of MRI {formData.mri_subset === "Yes" && <span className="required">*</span>}
</label>

<DatePicker
  selected={formData.mri_date ? new Date(formData.mri_date) : null}
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      mri_date: date ? date.toISOString().split("T")[0] : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
/>

{errors.mri_date && (
  <span className="error-text">{errors.mri_date}</span>
)}
</div>

<div className="form-group">
<label>Actual PMA</label>
<div className="pma-input modern">
<input
type="number"
name="mri_pma_weeks"
value={formData.mri_pma_weeks}
onChange={handleChange}
placeholder="Weeks"
/>
<span>w</span>
<input
type="number"
name="mri_pma_days"
value={formData.mri_pma_days}
onChange={handleChange}
placeholder="Days"
/>
<span>d</span>
</div>
</div>

<div className="form-group">
<label>Scanner</label>
<select
name="mri_scanner"
value={formData.mri_scanner}
onChange={handleChange}
>
<option value="">Select</option>
<option>3T Philips</option>
<option>Equivalent 3T</option>
</select>
</div>

</div>

{/* ROW 2 */}
<div className="form-row mri-grid">

<div className="form-group">
<label>Sedation</label>
<select
name="mri_sedation"
value={formData.mri_sedation}
onChange={handleChange}
>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.mri_sedation === "Yes" && (
<div className="form-group">
<label>Sedation Agent</label>
<input
name="mri_sedation_agent"
value={formData.mri_sedation_agent}
onChange={handleChange}
placeholder="Enter drug name"
/>
</div>
)}

</div>

{/* SEQUENCES */}
<div className="form-group">

<label>Sequences</label>

<div className="sequence-cards">

{["DWI","3D T1","T2","SWI","DTI"].map((seq)=>(
<div
key={seq}
className={`seq-card ${
formData[`mri_${seq.toLowerCase().replace(" ","")}`] ? "active" : ""
}`}
onClick={()=>{
const key = `mri_${seq.toLowerCase().replace(" ","")}`;
setFormData({
...formData,
[key]: !formData[key]
});
}}
>
{seq}
</div>
))}

</div>

</div>

</>
)}

</div>


<div style={{ marginTop: "20px" }}>
  <h3>MRI FINDINGS</h3>
<div className="bpd-section">

{/* LEFT COLUMN */}
<div className="bpd-card">

<h5>Myelination</h5>

<div className="form-group">
<label>Status</label>
<select
name="myelination"
value={formData.myelination}
onChange={handleChange}
>
<option value="">Select</option>
<option>Appropriate for age</option>
<option>Delayed</option>
</select>
</div>

<h5>Basal Ganglia & Thalamus</h5>

<div className="form-group">
<label>Abnormality</label>
<select name="bgt_abnormal" value={formData.bgt_abnormal} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.bgt_abnormal === "Yes" && (
<>
<div className="form-group">
<label>Type</label>
<select name="bgt_type" value={formData.bgt_type} onChange={handleChange}>
<option value="">Select</option>
<option>T1 hyper</option>
<option>T2 hyper</option>
<option>DWI restriction</option>
</select>
</div>

<div className="form-group">
<label>Site</label>
<select name="bgt_site" value={formData.bgt_site} onChange={handleChange}>
<option value="">Select</option>
<option>Caudate</option>
<option>Putamen</option>
<option>Globus Pallidus</option>
<option>Thalamus</option>
</select>
</div>
</>
)}

<h5>PLIC (Post Limb Internal Capsule)</h5>

<div className="form-group">
<label>Abnormality</label>
<select name="plic_abnormal" value={formData.plic_abnormal} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.plic_abnormal === "Yes" && (
<div className="form-group">
<label>Type</label>
<select name="plic_type" value={formData.plic_type} onChange={handleChange}>
<option value="">Select</option>
<option>T2 hyperintensity</option>
<option>Signal reversal</option>
</select>
</div>
)}

<h5>Atrophy</h5>

<div className="form-group">
<label>Any Atrophy</label>
<select name="atrophy" value={formData.atrophy} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.atrophy === "Yes" && (
<div className="form-group">
<label>Type</label>
<select name="atrophy_type" value={formData.atrophy_type} onChange={handleChange}>
<option value="">Select</option>
<option>Cortical</option>
<option>Sulcal widening</option>
<option>Ventriculomegaly</option>
</select>
</div>
)}

</div>


{/* RIGHT COLUMN */}
<div className="bpd-card">

<h5>White Matter</h5>

<div className="form-group">
<label>Abnormality</label>
<select name="wm_abnormal" value={formData.wm_abnormal} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.wm_abnormal === "Yes" && (
<>
<div className="form-group">
<label>Location</label>
<select name="wm_location" value={formData.wm_location} onChange={handleChange}>
<option value="">Select</option>
<option>Periventricular</option>
<option>Deep WM</option>
</select>
</div>

<div className="form-group">
<label>Type</label>
<select name="wm_type" value={formData.wm_type} onChange={handleChange}>
<option value="">Select</option>
<option>Hyperintensity</option>
<option>Volume loss</option>
</select>
</div>
</>
)}

<h5>Corpus Callosum</h5>

<div className="form-group">
<label>Abnormality</label>
<select name="cc_abnormal" value={formData.cc_abnormal} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.cc_abnormal === "Yes" && (
<div className="form-group">
<label>Type</label>
<select name="cc_type" value={formData.cc_type} onChange={handleChange}>
<option value="">Select</option>
<option>Thinning</option>
<option>Signal abnormality</option>
</select>
</div>
)}

<h5>Cerebellum</h5>

<div className="form-group">
<label>Abnormality</label>
<select name="cerebellum_abnormal" value={formData.cerebellum_abnormal} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.cerebellum_abnormal === "Yes" && (
<div className="form-group">
<label>Type</label>
<select name="cerebellum_type" value={formData.cerebellum_type} onChange={handleChange}>
<option value="">Select</option>
<option>Signal changes</option>
<option>Atrophy</option>
</select>
</div>
)}

<h5>Hemorrhage (SWI)</h5>

<div className="form-group">
<label>Hemorrhage</label>
<select name="hemorrhage" value={formData.hemorrhage} onChange={handleChange}>
<option value="">Select</option>
<option>Yes</option>
<option>No</option>
</select>
</div>

{formData.hemorrhage === "Yes" && (
<div className="form-group">
<label>Location</label>
<input
name="hemorrhage_location"
value={formData.hemorrhage_location}
onChange={handleChange}
/>
</div>
)}

</div>

</div></div>

{/* OVERALL */}
<div className="sub-section">

<div className="composite-card">

<h4>Overall MRI</h4>

<div className="form-group">
<label>Result</label>
<div className="bpd-result">
{formData.overall_mri || "Not determined"}
</div>
</div>

<div className="form-group">
<label>Summary</label>
<div className="bpd-result">
{formData.mri_summary || "No abnormalities"}
</div>
</div>

</div>

</div>
<div className="sub-section">

<div className="composite-card">

<h4>Radiology Details</h4>

<div className="form-row">

<div className="form-group">
<label>
Site Radiologist {formData.mri_subset === "Yes" && <span className="required">*</span>}
</label>

<input
  type="text"
  name="mri_radiologist"
  value={formData.mri_radiologist}
  onChange={handleChange}
  className={errors.mri_radiologist ? "input-error" : ""}
  placeholder="Enter radiologist name"
/>

{errors.mri_radiologist && (
  <span className="error-text">{errors.mri_radiologist}</span>
)}
</div>

<div className="form-group">
<label>
MRI Report Date {formData.mri_subset === "Yes" && <span className="required">*</span>}
</label>

<DatePicker
  selected={formData.mri_report_date ? new Date(formData.mri_report_date) : null}
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      mri_report_date: date ? date.toISOString().split("T")[0] : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="DD-MM-YYYY"
/>

{errors.mri_report_date && (
  <span className="error-text">{errors.mri_report_date}</span>
)}
</div>

</div>

</div>

</div>

</div>

)}

{/* FINAL */}

{activeTab==="final" &&(

<div className="form-section soft-green">

<h3>Final Composite Outcome Summary</h3>

<div className="final-summary">

<div className="summary-card">

<div className="summary-item">
<div className="summary-title">
COMPOSITE OUTCOME 1: Death or BPD (Jensen 2019) at 36 weeks PMA:

</div>

<div className={`summary-badge ${formData.composite_36==="Yes"?"yes":"no"}`}>
{formData.composite_36 || "-"}
</div>
</div>


<div className="summary-item">
<div className="summary-title">
COMPOSITE OUTCOME 2: Death or BPD or ROP-R x or NEC or Brain Injury at 44 weeks:
</div>

<div className={`summary-badge ${formData.composite_44==="Yes"?"yes":"no"}`}>
{formData.composite_44 || "-"}
</div>
</div>


<div className="summary-item">
<div className="summary-title">
MRI BRAIN ABNORMALITY (25% subset):
</div>

<div className={`summary-badge ${
formData.overall_mri==="Abnormal"?"danger":"normal"
}`}>
{
formData.mri_subset==="No"
? "N/A"
: formData.overall_mri || "-"
}
</div>
</div>

</div>

</div>


{/* ASSESSED BY */}
<div className="sub-section">

<div className="form-row">

<div className="form-group">
<label>Assessed By</label>
<input
name="completed_by"
value={formData.completed_by}
onChange={handleChange}
/>
</div>

<div className="form-group">
<label>Designation</label>
<input
name="designation"
value={formData.designation}
onChange={handleChange}
/>
</div>

</div>

</div>

</div>

)}

{/* NAVIGATION */}

<div className="step-navigation">

<button
type="button"
className="nav-btn prev"
onClick={prevStep}
disabled={activeTab==="36"}>
Previous
</button>

{activeTab!=="final" ?(

<button
type="button"
className="nav-btn next"
onClick={nextStep}>
Next
</button>

):(

<button
type="submit"
className="nav-btn next"
>
Save & Continue
</button>

)}

</div>

</form>



)

}
