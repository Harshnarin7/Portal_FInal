import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/Tables.css";
import "./styles/SAE.css";
import { useFormProgress } from "./context/FormProgressContext";
import FormLayout from "./components/FormLayout";
import { usePatient } from "./context/PatientContext";

export default function FormY_SAE() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const [formData, setFormData] = useState({
    study_id: "",
    enrollment_id: "",
    report_type: "",
    report_date: "",

    diagnosis: "",
    onset_datetime: "",
    end_datetime: "",
    ongoing: false,

    seriousness: [],
    severity: "",
    causality: "",
    action_taken: "",
    outcome: "",
    date_of_death: "",

    narrative: "",

    reporter_name: "",
    reporter_designation: "",
    reporter_contact: "",
    reporter_date: "",
    reporter_signature: "",

    investigator_name: "",
    investigator_signature: "",
    investigator_date: "",
    site: "",
  });

  /* Auto-fill enrollment */
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
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleMultiCheck = (value) => {
    setFormData(p => ({
      ...p,
      seriousness: p.seriousness.includes(value)
        ? p.seriousness.filter(v => v !== value)
        : [...p.seriousness, value],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    await api.post("/sae-report/", formData);
    markFormCompleted("form_y_sae");
    alert("✅ SAE Report submitted successfully");
    markFormCompleted("form-y-sae");
    navigate("/adverse-events", {
  state: { enrollmentId: formData.enrollment_id }
});
  };

  return (
    
    

    <form className="screening-form" onSubmit={handleSubmit}>
       <div className="form-a-header">
  <div className="form-a-header-main"><h2>Form Y — Serious Adverse Event (SAE)</h2>
</div></div>
      {/* I. Event Identification */}
      <div className="form-section soft-blue">
        <h3>I. Event Identification</h3>

        <div className="form-grid-3">
          <div className="form-group">
            <label>Study ID</label>
            <input name="study_id" onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Enrollment ID</label>
            <input value={formData.enrollment_id} readOnly />
          </div>

          <div className="form-group">
            <label>Report Type</label>
            <select name="report_type" onChange={handleChange}>
              <option value=""></option>
              <option>Initial</option>
              <option>Follow-up</option>
              <option>Final</option>
            </select>
          </div>

          <div className="form-group">
            <label>Date of Report</label>
            <input type="date" name="report_date" onChange={handleChange} />
          </div>
        </div>
      </div>

      {/* II. Event Description */}
      <div className="form-section soft-yellow">
        <h3>II. Event Description</h3>

        <div className="form-group">
          <label>Diagnosis / Event Term</label>
          <input name="diagnosis" onChange={handleChange} />
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label>Onset Date & Time</label>
            <input
              type="datetime-local"
              name="onset_datetime"
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>End Date & Time</label>
            <input
              type="datetime-local"
              name="end_datetime"
              onChange={handleChange}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                name="ongoing"
                onChange={handleChange}
              />{" "}
              Ongoing
            </label>
          </div>
        </div>
      </div>

      {/* III. Seriousness */}
      <div className="form-section soft-green">
        <h3>III. Seriousness Criteria</h3>

        {[
          "Death",
          "Life-threatening",
          "Hospitalization",
          "Persistent disability",
          "Congenital anomaly",
          "Other medically important event",
        ].map(item => (
          <label key={item} className="checkbox-line">
            <input
              type="checkbox"
              checked={formData.seriousness.includes(item)}
              onChange={() => handleMultiCheck(item)}
            />
            {item}
          </label>
        ))}
      </div>


      <div className="form-section soft-blue">
  <h3>IV. Severity</h3>
  <div className="form-group">
    <select name="severity" onChange={handleChange}>
      <option value=""></option>
      <option>Mild (Transient)</option>
      <option>Moderate (Interferes with activity)</option>
      <option>Severe (Incapacitating)</option>
    </select>
  </div>
</div>

<div className="form-section soft-green">
  <h3>V. Causality (Relationship to Oxygen Intervention)</h3>
  <div className="form-group">
  <select name="causality" onChange={handleChange}>
    <option value=""></option>
    <option>Not Related</option>
    <option>Unlikely</option>
    <option>Possible</option>
    <option>Probable</option>
    <option>Definite</option>
  </select>
  </div>
</div>

<div className="form-section soft-yellow">
  <h3>VI. Action Taken</h3>
  <div className="form-group">
  <select name="action_taken" onChange={handleChange}>
    <option value=""></option>
    <option>None</option>
    <option>Intervention Withdrawn</option>
    <option>Interrupted</option>
    <option>Dose Modified</option>
    <option>N/A</option>
  </select>
  </div>
</div>

<div className="form-section soft-blue">
  <h3>VII. Outcome</h3>
  <div className="form-group">
  <select name="outcome" onChange={handleChange}>
    <option value=""></option>
    <option>Resolved</option>
    <option>Resolving</option>
    <option>Not Resolved</option>
    <option>Resolved with Sequelae</option>
    <option>Fatal</option>
  </select>
  </div>

  {formData.outcome === "Fatal" && (
    <div className="form-group">
      <label>Date of Death</label>
      <input
        type="date"
        name="date_of_death"
        onChange={handleChange}
      />
    </div>
  )}
  
</div>



      

      {/* VIII. Narrative */}
      <div className="form-section soft-yellow">
        <h3>VIII. Narrative</h3>
        <div className="form-group">
        <textarea
          rows="5"
          name="narrative"
          onChange={handleChange}
        />
        </div>
      </div>

      <div className="form-section soft-blue">
  <h3>IX. Reporter Information</h3>
  <div className="form-group">  
  <div className="form-grid-3">
    <input name="reporter_name" placeholder="Reported By" onChange={handleChange} />
    <input name="reporter_designation" placeholder="Designation" onChange={handleChange} />
    <input name="reporter_contact" placeholder="Contact No" onChange={handleChange} />
    <input type="date" name="reporter_date" onChange={handleChange} />
    <input name="reporter_signature" placeholder="Signature" onChange={handleChange} />
  </div>
  </div>
</div>


<div className="form-section soft-green">
  <h3>X. Investigator Verification</h3>
  <div className="form-group">
  
  <div className="form-grid-3">
    <input name="investigator_name" placeholder="Investigator Name" onChange={handleChange} />
    <input name="investigator_signature" placeholder="Signature" onChange={handleChange} />
    <input type="date" name="investigator_date" onChange={handleChange} />
    <input name="site" placeholder="Site" onChange={handleChange} />
  </div>
  </div>
</div>
      

      <button className="submit-btn">Submit SAE Report</button>
    </form>
    
  );
}
