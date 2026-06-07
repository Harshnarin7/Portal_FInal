import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/Tables.css";
import "./styles/SAE.css";
import { usePatient } from "./context/PatientContext";

import FormLayout from "./components/FormLayout";
import { useFormProgress } from "./context/FormProgressContext";
export default function SeriousAdverseEventsList() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const [formData, setFormData] = useState({
    enrollment_id: "",
    rows: [],
    completed_by: "",
    designation: "",
    completion_date: "",
  });

  useEffect(() => {
  const id =
    patientData?.enrollment_id ||
    location.state?.enrollmentId ||
    localStorage.getItem("enrollment_id") ||
    "";

  setFormData((p) => ({
    ...p,
    enrollment_id: id,
  }));
}, [patientData, location.state]);

  useEffect(() => {
    if (location.state?.enrollmentId) {
      setFormData(p => ({ ...p, enrollment_id: location.state.enrollmentId }));
    }
  }, [location.state]);

  const addRow = () => {
    setFormData(p => ({
      ...p,
      rows: [
        ...p.rows,
        {
          sae: "",
          definition_no: "",
          start_date: "",
          notification_24h: "",
          end_date: "",
          notify_initial: "",
          notify_10d: "",
          notify_resolution: "",
        },
      ],
    }));
  };

  const updateRow = (i, field, value) => {
    const rows = [...formData.rows];
    rows[i][field] = value;
    setFormData(p => ({ ...p, rows }));
  };

  const removeRow = (i) => {
    const rows = [...formData.rows];
    rows.splice(i, 1);
    setFormData(p => ({ ...p, rows }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    await api.post("/sae-list/", formData);
   markFormCompleted("sae_list");
    alert("✅ SAE List saved");
   markFormCompleted("sae-list");
    navigate("/dashboard");
  };

  return (
     
    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main"><h2>
        Helper Form — Serious Adverse Events (Listing)
      </h2>
      </div>
      </div>

      {/* Identification */}
      <div className="form-section soft-blue">
        <div className="form-group">
          <label>Enrollment ID</label>
          <input value={formData.enrollment_id} readOnly />
        </div>
      </div>

      {/* Table */}
      <div className="form-section soft-green">
        <h3>List of Serious Adverse Events</h3>

        <div className="ae-table-container">
          <table className="ae-table">
            <thead>
              <tr>
                <th>#</th>
                <th>SAE</th>
                <th>Definition No</th>
                <th>Start Date</th>
                <th>24-h Notification</th>
                <th>End Date</th>
                <th>Initial</th>
                <th>10 Days</th>
                <th>Resolution</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formData.rows.map((row, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      value={row.sae}
                      onChange={e =>
                        updateRow(i, "sae", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.definition_no}
                      onChange={e =>
                        updateRow(i, "definition_no", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.start_date}
                      onChange={e =>
                        updateRow(i, "start_date", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.notification_24h}
                      onChange={e =>
                        updateRow(i, "notification_24h", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.end_date}
                      onChange={e =>
                        updateRow(i, "end_date", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.notify_initial}
                      onChange={e =>
                        updateRow(i, "notify_initial", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.notify_10d}
                      onChange={e =>
                        updateRow(i, "notify_10d", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.notify_resolution}
                      onChange={e =>
                        updateRow(i, "notify_resolution", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={addRow}>
          + Add SAE
        </button>
      </div>

      {/* Completion */}
      <div className="form-section soft-blue">
        <div className="form-grid-3">
            <div className="form-group">
          <input
            placeholder="Name"
            value={formData.completed_by}
            onChange={e =>
              setFormData(p => ({ ...p, completed_by: e.target.value }))
            }
          />
          <input
            placeholder="Designation"
            value={formData.designation}
            onChange={e =>
              setFormData(p => ({ ...p, designation: e.target.value }))
            }
          />
          <input
            type="date"
            value={formData.completion_date}
            onChange={e =>
              setFormData(p => ({ ...p, completion_date: e.target.value }))
            }
          />
          </div>
        </div>
      </div>

      <button className="submit-btn">
        Save SAE List
      </button>
    </form>
    
  );
}
