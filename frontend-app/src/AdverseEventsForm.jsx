import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/Tables.css";
import "./styles/SAE.css";
import FormLayout from "./components/FormLayout";
import { usePatient } from "./context/PatientContext";

import { useFormProgress } from "./context/FormProgressContext";
export default function AdverseEventsForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const [hasAE, setHasAE] = useState("");
  const [formData, setFormData] = useState({
    enrollment_id: "",
    mother_name: "",
    baby_uid: "",
    maternal_uid: "",
    events: [],
    completed_by: "",
    designation: "",
    completion_date: "",
  });
  useEffect(() => {
  if (!patientData && !location.state) return;

  const id =
    patientData?.enrollment_id ||
    location.state?.enrollmentId ||
    localStorage.getItem("enrollment_id") ||
    "";

  const gestationFormatted =
    patientData?.gestation_weeks && patientData?.gestation_days
      ? `${patientData.gestation_weeks} weeks ${patientData.gestation_days} days`
      : "";

  setFormData((p) => ({
    ...p,
    enrollment_id: id,
    mother_name: patientData?.mother_name || "",
    baby_uid: patientData?.baby_uid || "",
    maternal_uid: patientData?.maternal_uid || "",
    gestation: gestationFormatted,
    dob: patientData?.dob || ""
  }));
}, [patientData, location.state]);
  /* Auto-fill enrollment */
  useEffect(() => {
    if (location.state?.enrollmentId) {
      setFormData(p => ({ ...p, enrollment_id: location.state.enrollmentId }));
    }
  }, [location.state]);

  const addRow = () => {
    setFormData(p => ({
      ...p,
      events: [
        ...p.events,
        {
          description: "",
          definition_no: "",
          start_date: "",
          end_date: "",
          severity_desc: "",
          grade: "",
          converted_to_sae: "",
        },
      ],
    }));
  };

  const updateRow = (index, field, value) => {
    const updated = [...formData.events];
    updated[index][field] = value;
    setFormData(p => ({ ...p, events: updated }));
  };

  const removeRow = (index) => {
    const updated = [...formData.events];
    updated.splice(index, 1);
    setFormData(p => ({ ...p, events: updated }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      has_adverse_event: hasAE === "Yes",
    };

    await api.post("/adverse-events/", payload);
    markFormCompleted("adverse_events");
    alert("✅ Adverse Events form saved");
    markFormCompleted("adverse-events");
    navigate("/sae-list");

  };

  return (
    
    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main"><h2>
        Helper Form — Adverse Events (INC AE Scale v1.0)
      </h2>
      </div>
      </div>

      {/* Identification */}
      <div className="form-section soft-blue">
        <div className="form-grid-4">
          <div className="form-group">
            <label>Enrollment ID</label>
            <input value={formData.enrollment_id} readOnly />
          </div>
          <div className="form-group">
            <label>Mother’s Name</label>
            <input
              value={formData.mother_name}
              onChange={(e) =>
                setFormData(p => ({ ...p, mother_name: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>Baby UID</label>
            <input
              value={formData.baby_uid}
              onChange={(e) =>
                setFormData(p => ({ ...p, baby_uid: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>Maternal UID</label>
            <input
              value={formData.maternal_uid}
              onChange={(e) =>
                setFormData(p => ({ ...p, maternal_uid: e.target.value }))
              }
            />
          </div>
        </div>
      </div>

      {/* AE yes/no */}
      <div className="form-section soft-yellow">
        
        
        <div className="form-group">
        <label>
          Was any adverse event reported?
        </label>
        <select value={hasAE} onChange={(e) => setHasAE(e.target.value)}>
          <option value=""></option>
          <option>Yes</option>
          <option>No</option>
        </select>
        </div>
      </div>

      {/* Event table */}
      {hasAE === "Yes" && (
        <div className="form-section soft-green ae-section">
  <h3>List of Adverse Events</h3>

  <div className="ae-table-container">
    <table className="ae-table">
        
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Definition No</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Severity (description)</th>
                <th>Grade (1–5)</th>
                <th>Converted to SAE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formData.events.map((row, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    <input
                      value={row.description}
                      onChange={(e) =>
                        updateRow(idx, "description", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.definition_no}
                      onChange={(e) =>
                        updateRow(idx, "definition_no", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.start_date}
                      onChange={(e) =>
                        updateRow(idx, "start_date", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.end_date}
                      onChange={(e) =>
                        updateRow(idx, "end_date", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.severity_desc}
                      onChange={(e) =>
                        updateRow(idx, "severity_desc", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.grade}
                      onChange={(e) =>
                        updateRow(idx, "grade", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={row.converted_to_sae}
                      onChange={(e) =>
                        updateRow(idx, "converted_to_sae", e.target.value)
                      }
                    >
                      <option value=""></option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" onClick={addRow}>
            + Add Event
          </button>
          </div>
        
        </div>
      )}

      {/* Completion */}
      <div className="form-section soft-blue">
        <div className="form-group">
        <div className="form-grid-3">
          <input
            placeholder="Name of person filling this form"
            value={formData.completed_by}
            onChange={(e) =>
              setFormData(p => ({ ...p, completed_by: e.target.value }))
            }
          />
          <input
            placeholder="Designation"
            value={formData.designation}
            onChange={(e) =>
              setFormData(p => ({ ...p, designation: e.target.value }))
            }
          />
          <input
            type="date"
            value={formData.completion_date}
            onChange={(e) =>
              setFormData(p => ({ ...p, completion_date: e.target.value }))
            }
          />
          </div>
        </div>
      </div>

      <button className="submit-btn">Save Adverse Events</button>
    </form>
    
  );
}
