// src/components/PrintSummary.jsx
// Uses ReactDOM.createPortal to render OUTSIDE #root
// so @media print can hide #root and show only this report.
import React from "react";
import ReactDOM from "react-dom";
import "./PrintSummary.css";

/* ── helpers ── */
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

const R = ({ label, value }) => (
  <tr>
    <td className="pr-td-label">{label}</td>
    <td className="pr-td-value">{v(value)}</td>
  </tr>
);

const E = ({ label, value }) => (
  <tr>
    <td className="pr-exc-label">{label}</td>
    <td className={`pr-exc-yn ${value === "Yes" ? "pr-exc-yes" : "pr-exc-no"}`}>
      {value === "Yes" ? "YES" : value === "No" ? "NO" : "—"}
    </td>
  </tr>
);

function PrintReport({ formData = {} }) {
  const gaW = formData.gestation_known === "Yes"
    ? formData.best_ga_weeks : formData.auto_ga_weeks;
  const gaD = formData.gestation_known === "Yes"
    ? (formData.best_ga_days || 0) : (formData.auto_ga_days || 0);
  const gaStr = (gaW != null && gaW !== "")
    ? `${gaW} weeks ${gaD} days` : "—";

  const outcome = (() => {
    if (formData.gestation_known === "No" && formData.ga_source === "Neither")
      return "SCREEN FAILURE";
    const w = Number(gaW), d = Number(gaD);
    if (gaW == null || gaW === "") return "PENDING";
    const t = w * 7 + d;
    if (t < 25 * 7 || t > 31 * 7 + 6) return "NOT ELIGIBLE";
    const excl = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus",
      "insufficient_time","iufd"].some(k => formData[k] === "Yes");
    if (excl) return "SCREEN FAILURE";
    if (formData.consent_given === "No" ||
        formData.consent_given === "Not approached") return "CONSENT REFUSED";
    if (formData.consent_given === "Yes") return "ELIGIBLE";
    return "PENDING";
  })();

  const outcomeKey = outcome.toLowerCase().replace(/\s+/g, "-");

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const methodLabels = {
    LMP: "LMP (Last Menstrual Period)",
    "Early USG": "Early USG (<24 weeks)",
    "Fundal Height": "Fundal Height",
    Unknown: "Method not known",
  };

  return (
    <div className="pr-root">

      {/* HEADER */}
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
          <div className="pr-doc-label">Screening Summary — Form A</div>
          <table className="pr-meta-table">
            <tbody>
              <tr>
                <td className="pr-meta-key">Screening ID</td>
                <td className="pr-meta-val pr-meta-id">
                  {formData.screening_id || "Not assigned"}
                </td>
              </tr>
              <tr>
                <td className="pr-meta-key">Site</td>
                <td className="pr-meta-val">{v(formData.site_name)}</td>
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

      {/* OUTCOME */}
      <div className={`pr-outcome pr-outcome-${outcomeKey}`}>
        <span className="pr-outcome-label">Screening Outcome</span>
        <span className="pr-outcome-value">{outcome}</span>
      </div>

      {/* BODY */}
      <div className="pr-body">

        {/* LEFT COL */}
        <div className="pr-col">
          <div className="pr-section">
            <div className="pr-section-hd">Maternal Information</div>
            <table className="pr-table"><tbody>
              <R label="Mother's Name"
                 value={[formData.mother_first_name, formData.mother_surname]
                   .filter(Boolean).join(" ") || null} />
              <R label="Husband's Name"
                 value={[formData.husband_first_name, formData.husband_surname]
                   .filter(Boolean).join(" ") || null} />
              <R label="Maternal UID (CR No.)"   value={formData.maternal_uid} />
              <R label="Hospital Admission No."  value={formData.hospital_admission_number} />
              <R label="Mother Contact"          value={formData.mother_contact} />
              <R label="Husband Contact"         value={formData.husband_contact} />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">Screening Information</div>
            <table className="pr-table"><tbody>
              <R label="Site"                  value={formData.site_name} />
              <R label="Site ID"               value={formData.site_id} />
              <R label="Screened By"           value={formData.screened_by} />
              <R label="Screening Date & Time" value={fmtDT(formData.screening_datetime)} />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">Consent Information</div>
            <table className="pr-table"><tbody>
              <R label="Consent Status"    value={formData.consent_given} />
              <R label="Consent Taken By" value={formData.consent_taken_by} />
              <R label="Relationship"     value={formData.relationship_to_participant} />
              {formData.consent_given === "No" && (
                <R label="Refusal Reason" value={formData.reason_for_consent_refusal} />
              )}
              {formData.consent_given === "Not approached" && (
                <R label="Not Approached Reason" value={formData.reason_not_approached} />
              )}
              {formData.consent_given === "Yes" && formData.consent_datetime && (
                <R label="Consent Date & Time" value={fmtDT(formData.consent_datetime)} />
              )}
            </tbody></table>
          </div>
        </div>

        {/* RIGHT COL */}
        <div className="pr-col">
          <div className="pr-section">
            <div className="pr-section-hd">Gestation Assessment</div>
            <table className="pr-table"><tbody>
              <R label="Gestation Known" value={formData.gestation_known} />
              {formData.gestation_known === "No" && (
                <R label="GA Source" value={formData.ga_source} />
              )}
              {formData.lmp_date && (
                <R label="LMP Date" value={fmtDate(formData.lmp_date)} />
              )}
              <R label="Best Estimate GA" value={gaStr} />
              <R label="EDD" value={formData.edd_date ? fmtDate(formData.edd_date) : null} />
              {formData.gestation_known === "Yes" && (
                <R label="Assessment Method"
                   value={methodLabels[formData.gestation_method] || formData.gestation_method} />
              )}
              <R label="GA Eligibility"
                 value={
                   gaW != null && gaW !== ""
                     ? (Number(gaW) * 7 + Number(gaD) >= 25 * 7 &&
                        Number(gaW) * 7 + Number(gaD) <= 31 * 7 + 6
                       ? "Within range (25w 0d – 31w 6d)"
                       : "Outside range (25w 0d – 31w 6d)")
                     : "Not calculated"
                 } />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">Exclusion Criteria</div>
            <table className="pr-exc-table">
              <thead>
                <tr>
                  <th className="pr-exc-th-label">Criterion</th>
                  <th className="pr-exc-th-yn">Present</th>
                </tr>
              </thead>
              <tbody>
                <E label="Major Structural Anomaly / Genetic" value={formData.exclusion_anomaly} />
                {formData.exclusion_anomaly === "Yes" && formData.exclusion_anomaly_details && (
                  <tr><td className="pr-exc-detail" colSpan={2}>↳ {formData.exclusion_anomaly_details}</td></tr>
                )}
                <E label="Fetal Hydrops" value={formData.fetal_hydrops} />
                {formData.fetal_hydrops === "Yes" && formData.fetal_hydrops_type && (
                  <tr><td className="pr-exc-detail" colSpan={2}>↳ Type: {formData.fetal_hydrops_type}</td></tr>
                )}
                <E label="Decision to Forego Resuscitation" value={formData.decision_forego_resus} />
                {formData.decision_forego_resus === "Yes" && formData.decision_forego_resus_reason && (
                  <tr><td className="pr-exc-detail" colSpan={2}>↳ Reason: {formData.decision_forego_resus_reason}</td></tr>
                )}
                <E label="Insufficient Time for Consent" value={formData.insufficient_time} />
                {formData.insufficient_time === "Yes" && formData.insufficient_time_reason && (
                  <tr><td className="pr-exc-detail" colSpan={2}>↳ {formData.insufficient_time_reason}</td></tr>
                )}
                <E label="Intrauterine Fetal Death (IUFD)" value={formData.iufd} />
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* SIGNATURE */}
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

      {/* FOOTER */}
      <div className="pr-footer">
        <span>PORTAL Trial · Form A · Version 1.0</span>
        <span>CONFIDENTIAL — Authorised study personnel only</span>
        <span>ID: {formData.screening_id || "—"} · Printed: {today}</span>
      </div>

    </div>
  );
}

/* ── Portal wrapper ──────────────────────────────────────────
   Mounts PrintReport into <div id="print-portal"> which lives
   DIRECTLY on <body>, OUTSIDE <div id="root">.
   This means @media print can safely hide #root without
   touching the report at all.
─────────────────────────────────────────────────────────── */
export default function PrintSummary({ formData }) {
  // Create/find the portal target on body
  let portalEl = document.getElementById("print-portal");
  if (!portalEl) {
    portalEl = document.createElement("div");
    portalEl.id = "print-portal";
    document.body.appendChild(portalEl);
  }

  return ReactDOM.createPortal(
    <PrintReport formData={formData} />,
    portalEl
  );
}
