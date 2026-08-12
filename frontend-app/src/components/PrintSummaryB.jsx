// PrintSummaryB.jsx — Form B Birth & Resuscitation print report
// Portal outside #root (same pattern as Form A PrintSummary).
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import "./PrintSummary.css";

const v = (x) => (x != null && String(x).trim() !== "" ? String(x).trim() : "—");

const fmtDate = (x) => {
  if (!x) return "—";
  try {
    return new Date(x).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return String(x); }
};

const fmtDT = (x) => {
  if (!x) return "—";
  try {
    return new Date(x).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return String(x); }
};

const yn = (x) => (x === "Yes" || x === "No" ? x : v(x));

const R = ({ label, value }) => (
  <tr>
    <td className="pr-td-label">{label}</td>
    <td className="pr-td-value">{v(value)}</td>
  </tr>
);

const E = ({ label, value }) => (
  <tr>
    <td className="pr-exc-label">{label}</td>
    <td className={`pr-exc-yn ${value === "Yes" ? "pr-exc-yes" : value === "No" ? "pr-exc-no" : ""}`}>
      {value === "Yes" ? "YES" : value === "No" ? "NO" : "—"}
    </td>
  </tr>
);

function PrintReportB({ formData = {} }) {
  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const motherName = [formData.mother_name_first, formData.mother_name_surname]
    .filter(Boolean).join(" ") || null;

  const gaScreen = (formData.gestation_weeks != null && formData.gestation_weeks !== "")
    ? `${formData.gestation_weeks}w ${formData.gestation_days ?? 0}d`
    : null;
  const gaRand = (formData.gestation_rand_weeks != null && formData.gestation_rand_weeks !== "")
    ? `${formData.gestation_rand_weeks}w ${formData.gestation_rand_days ?? 0}d`
    : null;

  const indications = Array.isArray(formData.indication_for_delivery)
    ? formData.indication_for_delivery.join(", ")
    : formData.indication_for_delivery;

  const deliveryDetail = (() => {
    if (formData.delivery_mode === "Vaginal") {
      return formData.vaginal_delivery_type
        ? `Vaginal — ${formData.vaginal_delivery_type}`
        : "Vaginal";
    }
    if (formData.delivery_mode === "LSCS") {
      return formData.lscs_type ? `LSCS — ${formData.lscs_type}` : "LSCS";
    }
    return formData.delivery_mode;
  })();

  const outcome = (() => {
    if (formData.required_resuscitation === "No") return "NO PPV — FORMS A–C ONLY";
    if (formData.randomised === "Yes") return "RANDOMISED";
    if (formData.randomised === "No") return "NOT RANDOMISED";
    if (formData.required_resuscitation === "Yes") return "PPV REQUIRED";
    return "IN PROGRESS";
  })();
  const outcomeKey = outcome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");

  return (
    <div className="pr-root">
      <div className="pr-header">
        <div className="pr-header-left">
          <div className="pr-study-title">PORTAL Trial</div>
          <div className="pr-study-full">
            Providing initial Oxygen for delivery Room resuscitATion of
            preteRm infants using targeted Low oxygen versus air
          </div>
          <div className="pr-study-meta">
            ICMR Funded · Multi-site RCT · PGIMER Chandigarh
          </div>
        </div>
        <div className="pr-header-right">
          <div className="pr-doc-label">Birth &amp; Resuscitation — Form B</div>
          <table className="pr-meta-table">
            <tbody>
              <tr>
                <td className="pr-meta-key">Enrollment ID</td>
                <td className="pr-meta-val pr-meta-id">
                  {formData.enrollment_id || "Not assigned"}
                </td>
              </tr>
              <tr>
                <td className="pr-meta-key">Screening ID</td>
                <td className="pr-meta-val">{v(formData.screening_id)}</td>
              </tr>
              <tr>
                <td className="pr-meta-key">Print Date</td>
                <td className="pr-meta-val">{today}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="pr-rule" />

      <div className={`pr-outcome pr-outcome-${outcomeKey}`}>
        <span className="pr-outcome-label">Form B Status</span>
        <span className="pr-outcome-value">{outcome}</span>
      </div>

      <div className="pr-body">
        <div className="pr-col">
          <div className="pr-section">
            <div className="pr-section-hd">B1 · Identification</div>
            <table className="pr-table"><tbody>
              <R label="Screening ID" value={formData.screening_id} />
              <R label="Enrollment ID" value={formData.enrollment_id} />
              <R label="Mother's Name" value={motherName} />
              <R label="Maternal UID" value={formData.maternal_uid} />
              <R label="Baby UID" value={formData.baby_uid} />
              <R label="Baby Admission No." value={formData.baby_admission_no} />
              <R label="Baby Annual No." value={formData.baby_annual_no} />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">B2 · Birth Details</div>
            <table className="pr-table"><tbody>
              <R label="Date of Birth" value={fmtDate(formData.date_of_birth)} />
              <R label="Time of Birth" value={formData.time_of_birth} />
              <R label="GA at Screening" value={gaScreen} />
              <R label="GA at Randomisation" value={gaRand} />
              <R label="Birth Weight (g)" value={formData.birth_weight} />
              <R label="Intrauterine Centile" value={formData.intrauterine_centile} />
              <R label="Gender" value={formData.gender} />
              <R label="Delivery Mode" value={deliveryDetail} />
              <R label="Indication for Delivery" value={indications} />
              {formData.indication_for_delivery_other && (
                <R label="Indication — Other" value={formData.indication_for_delivery_other} />
              )}
              <R label="Maternal Complication" value={formData.maternal_complication} />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">B3 · Initial Assessment</div>
            <table className="pr-exc-table">
              <thead>
                <tr>
                  <th className="pr-exc-th-label">Finding</th>
                  <th className="pr-exc-th-yn">Yes / No</th>
                </tr>
              </thead>
              <tbody>
                <E label="Poor Respiratory Effort" value={formData.poor_resp_efforts} />
                <E label="Poor Muscle Tone" value={formData.poor_muscle_tone} />
                <E label="HR &lt; 100" value={formData.hr_below_100} />
                <E label="Initial Steps Done" value={formData.initial_steps} />
                <E label="Requires Ventilation (PPV)" value={formData.required_resuscitation} />
              </tbody>
            </table>
          </div>
        </div>

        <div className="pr-col">
          <div className="pr-section">
            <div className="pr-section-hd">Randomisation</div>
            <table className="pr-table"><tbody>
              <R label="Randomised" value={yn(formData.randomised)} />
              <R label="Randomisation Date" value={fmtDate(formData.randomisation_date)} />
              <R label="Strata" value={formData.strata} />
              {formData.randomised === "No" && (
                <R label="Reason Not Randomised" value={formData.enrollment_reason_not_randomized} />
              )}
              {formData.enrollment_reason_not_randomized_other && (
                <R label="Reason — Other" value={formData.enrollment_reason_not_randomized_other} />
              )}
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">B4 · Resuscitation</div>
            <table className="pr-table"><tbody>
              <R label="PPV Device" value={formData.device_ppv} />
              <R label="Interface Used" value={formData.interface_used} />
              <R label="PPV Duration" value={formData.ppv_duration} />
              <R label="SIB with PEEP" value={yn(formData.sib_peep_with)} />
              {formData.sib_peep_with === "Yes" && (
                <R label="SIB PEEP (cmH₂O)" value={formData.sib_peep_cmh2o} />
              )}
              <R label="T-piece PIP" value={formData.tpiece_pip} />
              <R label="T-piece PEEP" value={formData.tpiece_peep} />
              <R label="T-piece Flow" value={formData.tpiece_flow} />
              <R label="Endotracheal Intubation" value={yn(formData.intubation)} />
              <R label="Chest Compressions" value={yn(formData.chest_compression)} />
              {formData.chest_compression === "Yes" && (
                <R label="CC Duration" value={formData.cc_duration} />
              )}
              <R label="Epinephrine" value={yn(formData.adrenaline)} />
              {formData.adrenaline === "Yes" && (
                <>
                  <R label="Epinephrine Dilution" value={formData.adrenaline_dilution} />
                  <R label="Epinephrine Route" value={formData.adrenaline_route} />
                  <R label="Epinephrine Doses" value={formData.med_doses} />
                  <R label="Cumulative Epinephrine" value={formData.adrenaline_cumulative} />
                </>
              )}
              <R label="Fluid Bolus" value={yn(formData.fluid_bolus)} />
              {formData.fluid_bolus === "Yes" && (
                <>
                  <R label="Fluid Bolus Doses" value={formData.fluid_bolus_doses} />
                  <R label="Cumulative Fluid Bolus" value={formData.fluid_bolus_cumulative} />
                </>
              )}
              <R label="Placental Transfusion" value={yn(formData.placental_transfusion)} />
              <R label="Transfusion Method" value={formData.transfusion_method} />
              <R label="Cord Clamp Time" value={formData.cord_clamp_timestamp || formData.cord_clamp_time} />
              <R label="Time to Respiration" value={formData.time_to_respiration} />
              <R label="SpO₂ at 5 min" value={formData.spo2_5min} />
              <R label="Time to SpO₂ 80%" value={formData.time_to_spo2_80} />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">B6 · Cord Blood &amp; Exit</div>
            <table className="pr-table"><tbody>
              <R label="Cord Blood Done" value={yn(formData.cord_blood_done)} />
              <R label="Within 1 Hour" value={yn(formData.cord_blood_within_1hr)} />
              <R label="Cord Blood Source" value={formData.cord_blood_source} />
              <R label="Cord pH" value={formData.cord_ph} />
              <R label="Cord SBE" value={formData.cord_sbe} />
              <R label="Cord PCO₂" value={formData.cord_pco2} />
              <R label="Resuscitation Failure" value={yn(formData.resus_failure)} />
              <R label="SpO₂ Exit Trial Gas" value={formData.spo2_exit_trial_gas} />
              <R label="Total Resus Time" value={formData.total_resus_time} />
              <R label="Reason Exit Trial Gas" value={formData.reason_exit_trial_gas} />
              {formData.reason_exit_trial_gas_other && (
                <R label="Exit Reason — Other" value={formData.reason_exit_trial_gas_other} />
              )}
              <R label="Blender Stopped" value={yn(formData.blender_stopped)} />
              {formData.blender_stopped_description && (
                <R label="Blender Stopped — Detail" value={formData.blender_stopped_description} />
              )}
            </tbody></table>
          </div>
        </div>
      </div>

      <div className="pr-sig-area">
        <div className="pr-sig-block">
          <div className="pr-sig-line" />
          <div className="pr-sig-cap">Prepared By — Name &amp; Signature</div>
        </div>
        <div className="pr-sig-block">
          <div className="pr-sig-line" />
          <div className="pr-sig-cap">Date</div>
        </div>
        <div className="pr-sig-block">
          <div className="pr-sig-line" />
          <div className="pr-sig-cap">Investigator / Delegate — Signature</div>
        </div>
      </div>

      <div className="pr-footer">
        <span>PORTAL Trial · Form B · CRF v1.25</span>
        <span>CONFIDENTIAL — Authorised study personnel only</span>
        <span>
          ID: {formData.enrollment_id || formData.screening_id || "—"} · Printed: {today}
        </span>
      </div>
    </div>
  );
}

function ensurePrintPortal() {
  let portalEl = document.getElementById("print-portal");
  if (!portalEl) {
    portalEl = document.createElement("div");
    portalEl.id = "print-portal";
    document.body.appendChild(portalEl);
  }
  return portalEl;
}

export default function PrintSummaryB({ formData }) {
  useEffect(() => {
    document.body.classList.add("has-print-summary");
    return () => document.body.classList.remove("has-print-summary");
  }, []);

  return ReactDOM.createPortal(
    <PrintReportB formData={formData} />,
    ensurePrintPortal()
  );
}
