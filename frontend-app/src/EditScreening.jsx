import React, { useState, useEffect } from "react";

import { useParams, useNavigate } from "react-router-dom";
import "./ScreeningForm.css"; // reuse same CSS for consistent look
import api from "./api/axios";


function EditScreening() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    site_name: "",
    site_id: "",
    screened_by: "",
    mother_first_name: "",
    mother_surname: "",
    husband_first_name: "",
    husband_surname: "",
    maternal_uid: "",
    hospital_admission_number: "",
    gestation_weeks: "",
    gestation_days: "",
    gestation_method: "",
    expected_delivery_date: "",
    inclusion_gest_lt_32: false,
    anticipated_dr_resus: false,
    exclusion_present: false,
    exclusion_reasons: "",
    reason_for_insufficient_time: "",
    decision_forego_resuscitation_reason: "",
    other_decision_reason: "",
    major_structural_anomalies_if_yes: "",
    fetal_hydrops: "",
    final_decision: "",
    consent_given: "",
    reason_not_approached: "",
    other_reason: "",
  });

  const [message, setMessage] = useState("");
  const [gestationError, setGestationError] = useState("");
  const [gestationDaysError, setGestationDaysError] = useState("");

  const siteMapping = {
    PGIMER: "P-01",
    GMCH: "P-02",
    IOG: "P-03",
    CMC: "P-04",
    GMC: "P-05",
    AMC: "P-06",
  };

  useEffect(() => {
    async function fetchScreening() {
      try {
        const res = await api.get(`/screenings/${id}`);
        const clinical = res.data || {};
        let pii = {};
        try {
          const piiRes = await api.get(`/pii/screening/${clinical.screening_id || id}`);
          pii = piiRes.data || {};
        } catch (_) {
          /* PII access may be restricted */
        }
        setFormData({ ...clinical, ...pii });
      } catch (error) {
        console.error("Error fetching screening:", error);
        setMessage("❌ Failed to load screening data.");
      }
    }
    fetchScreening();
  }, [id]);

  const handleChange = (e) => {
    let { name, value, type, checked } = e.target;
    if (type === "checkbox") value = checked;

    // Allow only alphabets for name fields
    const nameFields = [
      "screened_by",
      "mother_first_name",
      "mother_surname",
      "husband_first_name",
      "husband_surname",
    ];
    if (nameFields.includes(name)) {
      value = value.replace(/[^a-zA-Z ]/g, "");
    }

    // Auto-set Site ID
    if (name === "site_name") {
      const siteId = siteMapping[value] || "";
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        site_id: siteId,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    // Validation for gestation weeks/days
    if (name === "gestation_weeks") {
      const num = Number(value);
      if (num < 20 || num > 50) {
        setGestationError("Value must be between 20 and 50 weeks");
      } else {
        setGestationError("");
      }
    }
    if (name === "gestation_days") {
      const num = Number(value);
      if (num < 0 || num > 6) {
        setGestationDaysError("Value must be between 0 and 6 days");
      } else {
        setGestationDaysError("");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!formData.mother_first_name) {
      setMessage("❌ Mother First Name is required.");
      return;
    }
    if (!formData.husband_first_name) {
      setMessage("❌ Husband First Name is required.");
      return;
    }

    // Clamp numeric ranges
    let gestWeeks = Number(formData.gestation_weeks);
    let gestDays = Number(formData.gestation_days);
    if (gestWeeks < 20) gestWeeks = 20;
    if (gestWeeks > 50) gestWeeks = 50;
    if (gestDays < 0) gestDays = 0;
    if (gestDays > 6) gestDays = 6;

    const payload = {
      ...formData,
      gestation_weeks: gestWeeks,
      gestation_days: gestDays,
      reason_not_approached:
        formData.reason_not_approached === "Other"
          ? formData.other_reason
          : formData.reason_not_approached,
    };

    try {
      const res = await api.put("/screenings/${id}", payload, {
        headers: { "Content-Type": "application/json" },
      });

      if (res.status === 200) {
        setMessage("✅ Screening updated successfully!");
        setTimeout(() => navigate("/entries"), 1200);
      }
    } catch (error) {
      console.error("Error updating screening:", error);
      setMessage("❌ Error updating screening. Please try again.");
    }
  };

  return (
    <form className="screening-form" onSubmit={handleSubmit}>
      <div className="form-a-header">
  <div className="form-a-header-main"><h2>Edit Screening Entry</h2>
</div></div>
      {/* ===== Site Information ===== */}
      <div className="form-section soft-blue">
        <h3>Site Information</h3>
        <div className="form-group">
          <label>Site Name</label>
          <select
            name="site_name"
            value={formData.site_name}
            onChange={handleChange}
            required
          >
            <option value="">-- Select Site --</option>
            {Object.keys(siteMapping).map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Site ID</label>
          <input type="text" value={formData.site_id} readOnly />
        </div>

        <div className="form-group">
          <label>Screened By</label>
          <input
            type="text"
            name="screened_by"
            value={formData.screened_by}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* ===== Mother & Husband Details ===== */}
      <div className="form-section soft-green">
        <h3>Maternal Identification Details</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Mother First Name *</label>
            <input
              type="text"
              name="mother_first_name"
              value={formData.mother_first_name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Mother Surname</label>
            <input
              type="text"
              name="mother_surname"
              value={formData.mother_surname}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Husband First Name *</label>
            <input
              type="text"
              name="husband_first_name"
              value={formData.husband_first_name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Husband Surname</label>
            <input
              type="text"
              name="husband_surname"
              value={formData.husband_surname}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Maternal UID</label>
          <input
            type="text"
            name="maternal_uid"
            value={formData.maternal_uid}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Hospital Admission Number</label>
          <input
            type="text"
            name="hospital_admission_number"
            value={formData.hospital_admission_number}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* ===== Eligibility Details ===== */}
      <div className="form-section soft-yellow">
        <h3>Screening Criteria for Inclusion</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Best Gestation Weeks</label>
            <input
              type="number"
              name="gestation_weeks"
              value={formData.gestation_weeks}
              onChange={handleChange}
              min={20}
              max={50}
            />
            {gestationError && <p className="error-text fancy-error">{gestationError}</p>}
          </div>
          <div className="form-group">
            <label>Best Gestation Days</label>
            <input
              type="number"
              name="gestation_days"
              value={formData.gestation_days}
              onChange={handleChange}
              min={0}
              max={6}
            />
            {gestationDaysError && <p className="error-text fancy-error">{gestationDaysError}</p>}
          </div>
        </div>

        <div className="form-group">
          <label>Method of Gestation Assessment</label>
          <select
            name="gestation_method"
            value={formData.gestation_method}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="LMP (most reliable)">LMP (most reliable)</option>
            <option value="Early USS (<20 wks)">Early USS (&lt;20 wks)</option>
            <option value="Late USS (≥20 wks)">Late USS (≥20 wks)</option>
            <option value="Clinical">Clinical</option>
          </select>
        </div>

        <div className="form-group">
          <label>Expected Delivery Date</label>
          <input
            type="date"
            name="expected_delivery_date"
            value={formData.expected_delivery_date || ""}
            onChange={handleChange}
          />
        </div>

        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              name="inclusion_gest_lt_32"
              checked={formData.inclusion_gest_lt_32}
              onChange={handleChange}
            />
            Gestational Age &lt; 32 Weeks
          </label>
          <label>
            <input
              type="checkbox"
              name="anticipated_dr_resus"
              checked={formData.anticipated_dr_resus}
              onChange={handleChange}
            />
            Anticipated DR Resuscitation
          </label>
        </div>
      </div>

      {/* ===== Exclusion Criteria ===== */}
      <div className="form-section soft-pink">
        <h3>Screening Criteria for Exclusion</h3>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              name="exclusion_present"
              checked={formData.exclusion_present}
              onChange={handleChange}
            />
            Exclusion Criteria Present
          </label>
        </div>

        <div className="form-group">
          <label>Exclusion Reasons</label>
          <textarea
            name="exclusion_reasons"
            value={formData.exclusion_reasons}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Reason for Insufficient Time</label>
          <input
            type="text"
            name="reason_for_insufficient_time"
            value={formData.reason_for_insufficient_time}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Decision to Forego Resuscitation</label>
          <select
            name="decision_forego_resuscitation_reason"
            value={formData.decision_forego_resuscitation_reason}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="Periviable">Periviable</option>
            <option value="Socio-economic">Socio-economic</option>
            <option value="CMF">CMF</option>
            <option value="Other">Other</option>
          </select>
          {formData.decision_forego_resuscitation_reason === "Other" && (
            <input
              type="text"
              name="other_decision_reason"
              placeholder="Specify other reason"
              value={formData.other_decision_reason || ""}
              onChange={handleChange}
            />
          )}
        </div>

        <div className="form-group">
          <label>Major Structural Anomalies (If Yes)</label>
          <input
            type="text"
            name="major_structural_anomalies_if_yes"
            value={formData.major_structural_anomalies_if_yes}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Fetal Hydrops</label>
          <select
            name="fetal_hydrops"
            value={formData.fetal_hydrops}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="Immune">Immune</option>
            <option value="Non-immune">Non-immune</option>
            <option value="Not known">Not known</option>
          </select>
        </div>
      </div>

      {/* ===== Final Decision ===== */}
      <div className="form-section soft-lavender">
        <h3>Final Decision</h3>
        <div className="form-group">
          <label>Final Decision</label>
          <select
            name="final_decision"
            value={formData.final_decision}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="ELIGIBLE">ELIGIBLE → Proceed for consent</option>
            <option value="NOT ELIGIBLE">
              NOT ELIGIBLE → End participation
            </option>
          </select>
        </div>

        <div className="form-group">
          <label>Consent Given</label>
          <select
            name="consent_given"
            value={formData.consent_given}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="Trial run">Trial run</option>
            <option value="Not approached for consent">
              Not approached for consent
            </option>
          </select>
        </div>

        {formData.consent_given === "Not approached for consent" && (
          <div className="form-group">
            <label>Reason Not Approached</label>
            <select
              name="reason_not_approached"
              value={formData.reason_not_approached}
              onChange={handleChange}
            >
              <option value="">-- Select --</option>
              <option value="Nurse on leave">Nurse on leave</option>
              <option value="Missed screening">Missed screening</option>
              <option value="Other">Other</option>
            </select>
            {formData.reason_not_approached === "Other" && (
              <input
                type="text"
                name="other_reason"
                placeholder="Specify reason"
                value={formData.other_reason}
                onChange={handleChange}
              />
            )}
          </div>
        )}
      </div>

      <button type="submit" className="submit-btn">
        Update Screening
      </button>

      {message && <p className="form-message">{message}</p>}
    </form>
  );
}

export default EditScreening;
