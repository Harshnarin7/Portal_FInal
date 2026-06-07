import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/Tables.css";
import FormLayout from "./components/FormLayout";
import { usePatient } from "./context/PatientContext";

import { useFormProgress } from "./context/FormProgressContext";

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

const SECTIONS = [
  {
    title: "METABOLIC",
    fields: [
      "Hypoglycemia (<45 mg/dL)",
      "Hypoglycemia Rx",
      "Hyperglycemia (>180)",
      "Insulin",
      "Metabolic acidosis (pH<7.2)",
      "Dyselectrolytemia",
      "Dyselectrolytemia type (Na/K/Ca)",
      "Osteopenia suspected",
    ],
  },
  {
    title: "RENAL",
    fields: [
      "AKI suspected",
      "AKI (KDIGO stage)",
      "Creatinine (mg/dL)",
      "Urine output <1 ml/kg/h",
      "Dialysis / CRRT",
    ],
  },
  {
    title: "THERMOREGULATION",
    fields: [
      "Hypothermia (<36°C)",
      "Hyperthermia (>37.5°C)",
    ],
  },
  {
    title: "VASCULAR ACCESS",
    fields: [
      "PICC in situ",
      "UVC in situ",
      "UAC in situ",
      "Peripheral IV",
      "Peripheral arterial",
      "Extravasation injury",
      "Line complication",
    ],
  },
  {
    title: "OPHTHALMOLOGY",
    fields: [
      "ROP screening due",
      "ROP screened",
      "ROP detected",
      "ROP stage (1–5)",
      "Plus disease",
      "ROP treatment",
    ],
  },
];

const BINARY_KEYWORDS = [
  "hypo",
  "hyper",
  "rx",
  "insulin",
  "acidosis",
  "suspected",
  "dyselectrolytemia",
  "dialysis",
  "hypothermia",
  "hyperthermia",
  "urine",
  "in situ",
  "peripheral",
  "extravasation",
  "complication",
  "screening",
  "screened",
  "detected",
  "plus",
  "treatment",
];

const isBinaryField = (label) =>
  BINARY_KEYWORDS.some(k =>
    label.toLowerCase().includes(k)
  );

export default function MetabRenalVascEyeLog() {

  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const [formData, setFormData] = useState({
    enrollment_id: "",
    gestation: "",
    mother_name: "",
    baby_uid: "",
    rows: [],
  });

  const [dates, setDates] = useState(Array(30).fill(""));

  useEffect(() => {
  if (!patientData) return;

  const gestationFormatted =
  patientData.gestation_weeks !== null &&
  patientData.gestation_days !== null
    ? `${patientData.gestation_weeks} weeks ${patientData.gestation_days} days`
    : "";

  setFormData(prev => ({
    ...prev,
    enrollment_id: patientData.enrollment_id || "",
    gestation: gestationFormatted,
    mother_name: patientData.mother_name || "",
    baby_uid: patientData.baby_uid || ""
  }));
}, [patientData]);

  useEffect(() => {

    const rows = [];

    SECTIONS.forEach(section => {

      section.fields.forEach(field => {

        const values = {};
        DAYS.forEach(d => values[d] = "");

        rows.push({
          section: section.title,
          parameter: field,
          values
        });

      });

    });

    setFormData(p => ({ ...p, rows }));

  }, []);

  const updateCell = (rowIndex, day, value) => {

    const updated = [...formData.rows];
    updated[rowIndex].values[day] = value;

    /* Dyselectrolytemia dependency */

    if (updated[rowIndex].parameter === "Dyselectrolytemia" && value === "No") {

      const typeRowIndex = updated.findIndex(
        r => r.parameter === "Dyselectrolytemia type (Na/K/Ca)"
      );

      if (typeRowIndex !== -1) {
        updated[typeRowIndex].values[day] = "";
      }

    }

    if (updated[rowIndex].parameter === "ROP detected" && value === "No") {

  const stageIndex = updated.findIndex(
    r => r.parameter === "ROP stage (1–5)"
  );

  if (stageIndex !== -1) {
    updated[stageIndex].values[day] = "";
  }

}

    setFormData(p => ({ ...p, rows: updated }));

  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    const payload = {
      enrollment_id: formData.enrollment_id,
      gestation: formData.gestation,
      mother_name: formData.mother_name,
      baby_uid: formData.baby_uid,
      dates: dates,
      daily_log: formData.rows,
    };

    await api.post("/metab-renal-vasc-eye-log/", payload);

    markFormCompleted("metab_renal_vasc_eye");

    alert("✅ Metab–Renal–Vasc–Eye log saved");

    markFormCompleted("metab-renal-vasc-eye");

    navigate("/form-y-sae", {
      state: { enrollmentId: formData.enrollment_id }
    });

  };

  return (

    

      <form className="screening-form" onSubmit={handleSubmit}>

        <div className="form-a-header">
          <div className="form-a-header-main">
            <h2>Helper Form 4 — Metabolic / Renal / Vascular / Eye</h2>
          </div>
        </div>

        <div className="form-section soft-blue">

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
                  <th key={d} className="day-col">D{d}</th>
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

  // 🔥 AUTO-FILL FULL MONTH IF D1 ENTERED
  if (day === 1 && value.length === 5) {
    const [dd, mm] = value.split("/");

    const startDate = new Date(`2025-${mm}-${dd}`);

    if (!isNaN(startDate)) {
      for (let i = 0; i < 30; i++) {
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
                    <td colSpan={31}>{section.title}</td>
                  </tr>

                  {formData.rows
                    .filter(r => r.section === section.title)
                    .map((row, idx) => (

                      <tr key={idx}>

                        <td className="param-col">{row.parameter}</td>

                        {DAYS.map(day => {

                          const dyselectRow = formData.rows.find(
                            r => r.parameter === "Dyselectrolytemia"
                          );

                          const ropDetectedRow = formData.rows.find(
    r => r.parameter === "ROP detected"
  );

                          return (

                            <td key={day}>

{row.parameter === "Dyselectrolytemia type (Na/K/Ca)" ? (

<select
disabled={dyselectRow?.values[day] !== "Yes"}
value={row.values[day]}
onChange={(e)=>
updateCell(formData.rows.indexOf(row),day,e.target.value)
}
>
<option value=""></option>
<option value="Na">Na</option>
<option value="K">K</option>
<option value="Ca">Ca</option>
</select>

) : row.parameter === "Creatinine (mg/dL)" ? (

<input
type="number"
step="0.01"
min="0"
value={row.values[day]}
onChange={(e)=>
updateCell(formData.rows.indexOf(row),day,e.target.value)
}
/>

) : row.parameter === "ROP stage (1–5)" ? (

<select
disabled={ropDetectedRow?.values[day] !== "Yes"}
value={row.values[day]}
onChange={(e)=>
updateCell(
formData.rows.indexOf(row),
day,
e.target.value
)
}
>
<option value=""></option>
<option value="1">1</option>
<option value="2">2</option>
<option value="3">3</option>
<option value="4">4</option>
<option value="5">5</option>
</select>

) : isBinaryField(row.parameter) ? (

<select
value={row.values[day]}
onChange={(e)=>
updateCell(formData.rows.indexOf(row),day,e.target.value)
}
>
<option value=""></option>
<option value="Yes">Yes</option>
<option value="No">No</option>
</select>

) : (

<input
value={row.values[day]}
onChange={(e)=>
updateCell(formData.rows.indexOf(row),day,e.target.value)
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
          Save Metab–Renal–Vasc–Eye Log
        </button>

      </form>

    

  );

}