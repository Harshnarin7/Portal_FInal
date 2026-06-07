import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/Tables.css";
import { usePatient } from "./context/PatientContext";
import FormLayout from "./components/FormLayout";

import { useFormProgress } from "./context/FormProgressContext";
import { useParams } from "react-router-dom";


const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const SECTIONS = [
  {
    title: "RESPIRATORY",
    fields: [
      "Respiratory support",
      "Mode",
      "FiO2 (%)",
      "Supplemental O2 (any)",
      "Surfactant given",
      "Caffeine",
      "Apnea episodes",
      "Desaturations",
      "Extubation attempted",
      "Extubation failure (<72h)",
      "Pulmonary hemorrhage",
      "Pneumothorax",
      "Chest drain in situ",
      "Pulmonary HTN (PPHN)",
      "Postnatal steroids",
    ],
  },
  {
    title: "CARDIOVASCULAR",
    fields: [
      "PDA suspected/confirmed",
      "Echo done",
      "HS-PDA",
      "PDA medical Rx",
      "PDA ligation",
      "Shock",
      "Inotropes",
      "Inotrope type",
    ],
  },
  {
    title: "NEUROLOGICAL",
    fields: [
      "Cranial USG done",
      "IVH (any grade)",
      "IVH grade (1/2/3/4)",
      "PVL suspected",
      "cPVL confirmed",
      "Ventriculomegaly",
      "Seizures (clinical)",
      "Seizures (EEG confirmed)",
      "AEDs given",
      "Non-IVH ICH",
      "Meningitis suspected",
    ],
  },
];

const BINARY_FIELDS = [
  "Respiratory support",
  "Supplemental O2 (any)",
  "Surfactant given",
  "Caffeine",
  "Apnea episodes",
  "Desaturations",
  "Extubation attempted",
  "Extubation failure (<72h)",
  "Pulmonary hemorrhage",
  "Pneumothorax",
  "Chest drain in situ",
  "Pulmonary HTN (PPHN)",
  "Postnatal steroids",
  "PDA suspected/confirmed",
  "Echo done",
  "HS-PDA",
  "PDA medical Rx",
  "PDA ligation",
  "Shock",
  "Inotropes",
  "Cranial USG done",
  "IVH (any grade)",
  "PVL suspected",
  "cPVL confirmed",
  "Ventriculomegaly",
  "Seizures (clinical)",
  "Seizures (EEG confirmed)",
  "AEDs given",
  "Non-IVH ICH",
  "Meningitis suspected",
];

const isBinaryField = (label) => BINARY_FIELDS.includes(label);

export default function RespCVNeuroLog() {

  const location = useLocation();
  const navigate = useNavigate();
 const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();
  const { enrollmentId } = useParams();

  const [formData, setFormData] = useState({
    enrollment_id: "",
    gestation: "",
    mother_name: "",
    baby_uid: "",
    rows: [],
  });
  const [dates, setDates] = useState(Array(31).fill(""));

  useEffect(() => {

    const rows = [];

    SECTIONS.forEach(section => {

      section.fields.forEach(field => {

        const values = {};
        DAYS.forEach(d => (values[d] = ""));

        rows.push({
          section: section.title,
          parameter: field,
          values
        });

      });

    });

    setFormData(p => ({ ...p, rows }));

  }, []);

  useEffect(() => {
  const fetchData = async () => {
    if (!enrollmentId) return;

    try {
      const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
      const b = res?.data || {};

      const gestationFormatted =
        b?.gestation_weeks && b?.gestation_days
          ? `${b.gestation_weeks} weeks ${b.gestation_days} days`
          : "";

      const motherName = `${b?.mother_name_first || ""} ${b?.mother_name_surname || ""}`.trim();

      setFormData(prev => ({
        ...prev,
        enrollment_id: b?.enrollment_id || enrollmentId,
        gestation: gestationFormatted,
        mother_name: motherName,
        baby_uid: b?.baby_uid || ""
      }));

    } catch (err) {
      console.log("❌ Error fetching data", err);
    }
  };

  fetchData();
}, [enrollmentId]);

  const updateCell = (rowIndex, day, value) => {

  const updated = [...formData.rows];
  updated[rowIndex].values[day] = value;

  // Respiratory support logic
  if (updated[rowIndex].parameter === "Respiratory support" && value === "No") {

    const modeRowIndex = updated.findIndex(r => r.parameter === "Mode");

    if (modeRowIndex !== -1) {
      updated[modeRowIndex].values[day] = "";
    }

  }

  // IVH logic
  if (updated[rowIndex].parameter === "IVH (any grade)" && value === "No") {

    const gradeRowIndex = updated.findIndex(
      r => r.parameter === "IVH grade (1/2/3/4)"
    );

    if (gradeRowIndex !== -1) {
      updated[gradeRowIndex].values[day] = "";
    }

  }

  setFormData(prev => ({ ...prev, rows: updated }));

};

  const handleSubmit = async (e) => {

    e.preventDefault();
const payload = {
  enrollment_id: formData.enrollment_id,
  gestation: formData.gestation,
  mother_name: formData.mother_name,
  daily_log: formData.rows,
};
    

    try {
      
      await api.post("/resp-cv-neuro-log/", payload);
   // 🔥 prepare logs array
const logs = [];
let steroidDay = null;

formData.rows.forEach((row) => {

  // 🔥 FIX: use includes instead of exact match
  if (row.parameter?.toLowerCase().includes("steroid")) {

    Object.entries(row.values).forEach(([day, value]) => {

      if ((value === "Yes" || value === "Y") && steroidDay === null) {
        steroidDay = Number(day);
      }

    });
  }
});
const steroidUsed = steroidDay !== null ? "Yes" : "No";

setFormData(prev => ({
  ...prev,
  postnatal_steroids: steroidUsed
}));
console.log("🔥 FINAL steroidDay:", steroidDay);
console.log("🔥 FINAL logs:", logs);

let pulmonaryHemorrhage = "No";

formData.rows.forEach((row) => {
  if (row.parameter?.toLowerCase().includes("pulmonary hemorrhage")) {

    Object.values(row.values).forEach((value) => {
      if (value === "Yes" || value === "Y") {
        pulmonaryHemorrhage = "Yes";
      }
    });

  }
});

let pulmonaryHypertension = "No";

formData.rows.forEach((row) => {
  const name = row.parameter?.toLowerCase();

  if (
    name?.includes("pulmonary hypertension") ||
    name?.includes("pulmonary htn") ||
    name?.includes("pphn")
  ) {
    Object.values(row.values).forEach((value) => {
      if (["yes", "y"].includes(value?.toLowerCase())) {
        pulmonaryHypertension = "Yes";
      }
    });
  }
});

let pneumothorax = "No";

formData.rows.forEach((row) => {
  const name = row.parameter?.toLowerCase();

  if (name?.includes("pneumothorax")) {

    Object.values(row.values).forEach((value) => {
      if (["yes", "y"].includes(value?.toLowerCase())) {
        pneumothorax = "Yes";
      }
    });

  }
});

let chestDrain = "No";

formData.rows.forEach((row) => {
  const name = row.parameter?.toLowerCase().trim();

  if (
    name === "chest drain in situ" ||
    name.includes("chest drain")
  ) {

    Object.values(row.values).forEach((value) => {
      if (
        value?.toLowerCase?.() === "yes" ||
        value?.toLowerCase?.() === "y"
      ) {
        chestDrain = "Yes";
      }
    });

  }
});

console.log("🔥 chestDrain =", chestDrain);

formData.rows.forEach((row) => {
  if (row.parameter === "Mode") {
    Object.entries(row.values).forEach(([day, value]) => {
      if (value) {
        const dateStr = dates[day - 1];

        if (dateStr) {
          const [dd, mm] = dateStr.split("/");

          logs.push({
  date: `2026-${mm}-${dd}`,
  support_mode:
    value === "SIMV" || value === "HFOV"
      ? "IMV"
      : value.toUpperCase().replace(" ", "_")
});
        }
      }
    });
  }

  if (
  row.parameter?.toLowerCase().includes("extubation failure")
) {

  Object.entries(row.values).forEach(([day, value]) => {

    if (
      value?.toLowerCase?.() === "yes" ||
      value?.toLowerCase?.() === "y"
    ) {

      const dateStr = dates[day - 1];

      if (dateStr) {

        const [dd, mm] = dateStr.split("/");

        logs.push({
          date: `2026-${mm}-${dd}`,
          support_mode: "EXTUBATION_FAILURE"
        });

      }

    }

  });

}
});

// 🔥 send all at once (replace old data)
await api.post("/respiratory-log-bulk", {
  enrollment_id: formData.enrollment_id,
  logs
  
  
});
await api.post("/steroid-data", {
  enrollment_id: formData.enrollment_id,
  steroid_age_days: steroidDay,
  steroid_used: steroidUsed,
  pulmonary_hemorrhage: pulmonaryHemorrhage,
  pulmonary_hypertension: pulmonaryHypertension,
  pneumothorax: pneumothorax,
  chest_drain: chestDrain 
});
console.log("Steroid Day sending:", steroidDay);
      window.dispatchEvent(new Event("respiratoryUpdated"));

      markFormCompleted("vs6_1");

      alert("✅ VS6.1 saved successfully");

      markFormCompleted("vs6-1");

     navigate(`/infect-gi-hema-log/${formData.enrollment_id}`);

    } catch (err) {

      console.error(err.response?.data);
      alert(JSON.stringify(err.response?.data, null, 2));

    }

  };

  return (

    

      <form className="screening-form" onSubmit={handleSubmit}>

        <div className="form-a-header">
          <div className="form-a-header-main">
          <h2>Helper Form 2 — Resp / CV / Neuro Daily Log</h2>
        </div></div>

        <div className="form-section soft-blue">

          <h3>Identification</h3>

          <div className="form-grid-4">

            <div className="form-group">
              <label>Enrollment ID</label>
              <input value={formData.enrollment_id} readOnly />
            </div>

            <div className="form-group">
              <label>Gestation</label>
              <input value={formData.gestation} readOnly />
            </div>

            <div className="form-group">
              <label>Mother’s Name</label>
              <input value={formData.mother_name} readOnly />
            </div>

            <div className="form-group">
              <label>Baby UID</label>
              <input value={formData.baby_uid} readOnly />
            </div>

          </div>

        </div>

        <div className="form-instruction">
  <p>
    <strong>Instruction:</strong> Y = Yes, N = No, or enter value where applicable.
    Complete at the end of 24 hours (8 am).
  </p>
</div>

        <div className="vs-table-wrapper">

          <table className="vs-table">

           <thead>
  <tr>
    <th className="param-col">Parameter</th>
    {DAYS.map(d => (
      <th key={d}>D{d}</th>
    ))}
  </tr>

  <tr className="date-row">
    <th>Date (dd/mm)</th>
    {DAYS.map(day => (
      <th key={day}>
       <input
  type="text"
  placeholder="dd/mm"
  maxLength="5"
  className="date-input"
  value={dates[day - 1]}
  onChange={(e) => {
  let value = e.target.value.replace(/\D/g, "");

  if (value.length >= 3) {
    value = value.slice(0, 2) + "/" + value.slice(2, 4);
  }

  const newDates = [...dates];
  newDates[day - 1] = value;

  // 🔥 AUTO-FILL if first day entered
  if (day === 1 && value.length === 5) {
    const [dd, mm] = value.split("/");

    const startDate = new Date(`2025-${mm}-${dd}`); // year doesn't matter

    if (!isNaN(startDate)) {
      for (let i = 0; i < 31; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);

        const newDay = String(d.getDate()).padStart(2, "0");
        const newMonth = String(d.getMonth() + 1).padStart(2, "0");

        newDates[i] = `${newDay}/${newMonth}`;
      }
    }
  }

  setDates(newDates);
}}
/>
      </th>
    ))}
  </tr>
</thead>

            <tbody>

              {SECTIONS.map(section => (

                <React.Fragment key={section.title}>

                  <tr className="section-row">
                    <td colSpan={32}>{section.title}</td>
                  </tr>

                  {formData.rows
                    .map((row, index) => ({ ...row, index }))
                    .filter(r => r.section === section.title)
                    .map(row => (

                      <tr key={row.index}>

                        <td className="param-col">{row.parameter}</td>

                        {DAYS.map(day => {

                          const respSupportRow = formData.rows.find(
                            r => r.parameter === "Respiratory support"
                          );

                          const ivhRow = formData.rows.find(
  r => r.parameter === "IVH (any grade)"
);

                          return (

                            <td key={day}>

                              {row.parameter === "Mode" ? (

                                <select
                                  disabled={respSupportRow?.values[day] !== "Yes"}
                                  value={row.values[day]}
                                  onChange={(e) =>
                                    updateCell(row.index, day, e.target.value)
                                  }
                                >
                                  <option value=""></option>
                                  <option value="CPAP">CPAP</option>
                                  <option value="HFNC">HFNC</option>
                                  <option value="NIPPV">NIPPV</option>
                                  <option value="SIMV">SIMV</option>
                                  <option value="HFOV">HFOV</option>
                                  <option value="NASAL_CANNULA">NC</option>
                                </select>

                              ) : row.parameter === "Inotrope type" ? (

  <select
    value={row.values[day]}
    onChange={(e) =>
      updateCell(row.index, day, e.target.value)
    }
  >
    <option value=""></option>
    <option value="D">D</option>
    <option value="Db">Db</option>
    <option value="A">A</option>
    <option value="NA">NA</option>
    <option value="M">M</option>
    <option value="V">V</option>
  </select>

)  : row.parameter === "IVH grade (1/2/3/4)" ? (

  <select
    disabled={ivhRow?.values[day] !== "Yes"}
    value={row.values[day]}
    onChange={(e) =>
      updateCell(row.index, day, e.target.value)
    }
  >
    <option value=""></option>
    <option value="1">Grade 1</option>
    <option value="2">Grade 2</option>
    <option value="3">Grade 3</option>
    <option value="4">Grade 4</option>
  </select>

)
                               : row.parameter === "FiO2 (%)" ? (

                                <input
  type="number"
  min="0"
  max="100"
  value={row.values[day]}
  onChange={(e) => {
    const val = e.target.value;

    if (val === "" || (Number(val) >= 0 && Number(val) <= 100)) {
      updateCell(row.index, day, val);
    }
  }}
/>

                              ) : isBinaryField(row.parameter) ? (

                                <select
                                  value={row.values[day]}
                                  onChange={(e) =>
                                    updateCell(row.index, day, e.target.value)
                                  }
                                >
                                  <option value=""></option>
                                  <option value="Yes">Yes</option>
                                  <option value="No">No</option>
                                </select>

                              ) : (

                                <input
                                  value={row.values[day]}
                                  onChange={(e) =>
                                    updateCell(row.index, day, e.target.value)
                                  }
                                />

                              )}

                            </td>

                          );

                        })}

                      </tr>

                    ))}

                </React.Fragment>

              ))}

            </tbody>

          </table>

        </div>

        <button className="submit-btn" type="submit">
          Save VS6.1 Log
        </button>

      </form>

    

  );

}