import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/Tables.css";
import FormLayout from "./components/FormLayout";
import { usePatient } from "./context/PatientContext";

import { useFormProgress } from "./context/FormProgressContext";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const SECTIONS = [
  {
    title: "INFECTION",
    fields: [
      "Sepsis suspected",
      "Blood culture sent",
      "Blood culture positive",
      "EOS (≤72h)",
      "LOS (>72h)",
      "Antibiotics",
      "Antibiotic day",
      "LP done",
      "CSF culture positive",
      "CLABSI",
      "VAP",
    ],
  },
  {
    title: "GASTROINTESTINAL",
    fields: [
      "NPO",
      "Enteral feeds started",
      "Feed volume (ml/kg/d)",
      "Full feeds (150 ml/kg)",
      "Parenteral nutrition",
      "Probiotic",
      "Feed intolerance",
      "NEC suspected",
      "NEC confirmed (stage)",
      "NEC surgery",
      "Cholestasis",
    ],
  },
  {
    title: "HEMATOLOGY",
    fields: [
      "Jaundice",
      "Phototherapy",
      "Peak TSB (mg/dL)",
      "Exchange transfusion",
      "PRBC transfusion",
      "Platelet transfusion",
      "FFP / Cryo transfusion",
    ],
  },
];

const BINARY_FIELDS = [
  "Sepsis suspected",
  "Blood culture sent",
  "Blood culture positive",
  "EOS (≤72h)",
  "LOS (>72h)",
  "Antibiotics",
  "Antibiotic day",
  "LP done",
  "CSF culture positive",
  "CLABSI",
  "VAP",
  "NPO",
  "Enteral feeds started",
  "Full feeds (150 ml/kg)",
  "Parenteral nutrition",
  "Probiotic",
  "Feed intolerance",
  "NEC suspected",
  "NEC surgery",
  "Cholestasis",
  "Jaundice",
  "Phototherapy",
  "Exchange transfusion",
  "PRBC transfusion",
  "Platelet transfusion",
  "FFP / Cryo transfusion"
];

const isBinaryField = (label) => BINARY_FIELDS.includes(label);

export default function InfectGIHemaLog() {

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

  const [dates, setDates] = useState(Array(31).fill(""));

  /* Autofill patient info */
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

  /* Initialize rows */
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

  /* Update table cell */
  const updateCell = (rowIndex, day, value) => {

    const updated = [...formData.rows];
    updated[rowIndex].values[day] = value;

    /* Sepsis dependency */
    if (updated[rowIndex].parameter === "Sepsis suspected" && value === "No") {

      const dependent = [
        "Blood culture sent",
        "Blood culture positive",
        "EOS (≤72h)",
        "LOS (>72h)"
      ];

      dependent.forEach(param => {
        const idx = updated.findIndex(r => r.parameter === param);
        if (idx !== -1) updated[idx].values[day] = "";
      });

    }

    /* Jaundice dependency */
    if (updated[rowIndex].parameter === "Jaundice" && value === "No") {

      const photoRowIndex = updated.findIndex(
        r => r.parameter === "Phototherapy"
      );

      if (photoRowIndex !== -1) {
        updated[photoRowIndex].values[day] = "No";
      }

    }

    setFormData(p => ({ ...p, rows: updated }));

  };

  /* Submit */
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

    await api.post("/infect-gi-hema-log/", payload);

    markFormCompleted("infect_gi_hema");

    alert("✅ Infect-GI-Hema log saved");

    

    navigate(`/metab-renal-vasc-eye-log/${formData.enrollment_id}`);

  };

  return (

    

      <form className="screening-form" onSubmit={handleSubmit}>

        <div className="form-a-header">
          <div className="form-a-header-main">
            <h2>Helper Form 3 — Infect / GI / Hema Daily Log</h2>
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
                    <td colSpan={32}>{section.title}</td>
                  </tr>

                  {formData.rows
                    .filter(r => r.section === section.title)
                    .map((row, idx) => (

                      <tr key={idx}>

                        <td className="param-col">{row.parameter}</td>

                        {DAYS.map(day => {

                          const sepsisRow = formData.rows.find(
                            r => r.parameter === "Sepsis suspected"
                          );

                          const jaundiceRow = formData.rows.find(
                            r => r.parameter === "Jaundice"
                          );

                          return (

                            <td key={day}>

                              {row.parameter === "Feed volume (ml/kg/d)" ||
                               row.parameter === "Peak TSB (mg/dL)" ? (

                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  value={row.values[day]}
                                  onChange={(e) =>
                                    updateCell(
                                      formData.rows.indexOf(row),
                                      day,
                                      e.target.value
                                    )
                                  }
                                />

                              ) : isBinaryField(row.parameter) ? (

                                <select
                                  disabled={
                                    (
                                      [
                                        "Blood culture sent",
                                        "Blood culture positive",
                                        "EOS (≤72h)",
                                        "LOS (>72h)"
                                      ].includes(row.parameter)
                                      && sepsisRow?.values[day] !== "Yes"
                                    ) ||
                                    (
                                      row.parameter === "Phototherapy"
                                      && jaundiceRow?.values[day] === "No"
                                    )
                                  }
                                  value={row.values[day]}
                                  onChange={(e) =>
                                    updateCell(
                                      formData.rows.indexOf(row),
                                      day,
                                      e.target.value
                                    )
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
                                    updateCell(
                                      formData.rows.indexOf(row),
                                      day,
                                      e.target.value
                                    )
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
          Save Infect-GI-Hema Log
        </button>

      </form>

    

  );

}