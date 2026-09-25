// src/components/PrintSummary.jsx
// Uses ReactDOM.createPortal to render OUTSIDE #root
// so @media print can hide #root and show only this report.
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import "./PrintSummary.css";
import { formatDateTimeDisplay24 } from "../utils/datetime";

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

const fmtDT = (x) => formatDateTimeDisplay24(x);

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

function PrintReport({ formData = {}, preparedByName = "", piName = "" }) {
  const gaW = formData.best_ga_weeks;
  const gaD = formData.best_ga_days || 0;
  const gaStr = (gaW != null && gaW !== "")
    ? `${gaW} weeks ${gaD} days` : "—";

  /* Same rules as backend compute_screening_status() / ViewEntries badges */
  const outcome = (() => {
    const w = Number(gaW), d = Number(gaD);
    if (gaW == null || gaW === "") return "PENDING";
    const t = w * 7 + d;
    if (t < 25 * 7 || t > 31 * 7 + 6) return "NOT ELIGIBLE";
    const excl = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus",
      "insufficient_time","iufd"].some(k => formData[k] === "Yes");
    if (excl) return "SCREEN FAILURE";
    if (formData.consent_given === "Yes" || formData.consent_given === "Trial run")
      return "ELIGIBLE";
    if (formData.consent_given === "No" ||
        formData.consent_given === "Not approached") return "NOT ELIGIBLE";
    return "PENDING";
  })();

  const outcomeKey = outcome.toLowerCase().replace(/\s+/g, "-");

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const methodLabels = {
    LMP: "LMP (Last Menstrual Period)",
    "Early USG": "Early USG (<24w)",
    "Fundal Height": "Fundal height",
    Unknown: "Method not known",
  };

  return (
    <div className="pr-root">
      <div className="pr-header">
        <div className="pr-header-left">
          <div className="pr-study-title">PORTAL Trial</div>
          <div className="pr-study-full">
            Initial Oxygen for Delivery room Resuscitation of preterm
            neonates: a triple-arm, multi-site, randomized, controlled trial
          </div>
          <div className="pr-study-meta">
            ICMR Funded · Triple-Arm, Multi-Site RCT
          </div>
        </div>
        <div className="pr-header-right">
          <div className="pr-doc-label">Screening — Form A</div>
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

      <div className={`pr-outcome pr-outcome-${outcomeKey}`}>
        <span className="pr-outcome-label">Form A Status</span>
        <span className="pr-outcome-value">{outcome}</span>
      </div>

      <div className="pr-body">
        <div className="pr-col">
          <div className="pr-section">
            <div className="pr-section-hd">A1 · Inclusion</div>
            <table className="pr-table"><tbody>
              <R label="Best estimate of gestational age" value={gaStr} />
              <R label="Method of gestation assessment" value={methodLabels[formData.gestation_method] || formData.gestation_method} />
              {formData.lmp_date && <R label="LMP date" value={fmtDate(formData.lmp_date)} />}
              <R label="EDD" value={formData.edd_date ? fmtDate(formData.edd_date) : null} />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">A2 · Identification</div>
            <table className="pr-table"><tbody>
              <R label="Site" value={formData.site_name} />
              <R label="Site ID" value={formData.site_id} />
              <R label="Screening date and time" value={fmtDT(formData.screening_datetime)} />
              <R label="Screened by" value={formData.screened_by} />
            </tbody></table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">A3 · Maternal</div>
            <table className="pr-table"><tbody>
              <R label="Mother first name" value={formData.mother_first_name} />
              <R label="Mother surname" value={formData.mother_surname} />
              <R label="Husband first name" value={formData.husband_first_name} />
              <R label="Husband surname" value={formData.husband_surname} />
              <R label="Maternal UID" value={formData.maternal_uid} />
              <R label="Hospital admission number" value={formData.hospital_admission_number} />
              <R label="Mother mobile number" value={formData.mother_contact} />
              <R label="Husband mobile number" value={formData.husband_contact} />
            </tbody></table>
          </div>
        </div>

        <div className="pr-col">
          <div className="pr-section">
            <div className="pr-section-hd">A4 · Exclusion</div>
            <table className="pr-exc-table">
              <thead>
                <tr>
                  <th className="pr-exc-th-label">Finding</th>
                  <th className="pr-exc-th-yn">Yes / No</th>
                </tr>
              </thead>
              <tbody>
                <E label="Major structural anomaly / genetic abnormality" value={formData.exclusion_anomaly} />
                {formData.exclusion_anomaly === "Yes" && formData.exclusion_anomaly_details && (
                  <R label="If yes, specify" value={formData.exclusion_anomaly_details} />
                )}
                <E label="Fetal hydrops" value={formData.fetal_hydrops} />
                {formData.fetal_hydrops === "Yes" && formData.fetal_hydrops_type && (
                  <R label="If yes" value={formData.fetal_hydrops_type} />
                )}
                <E label="Decision to forego resuscitation" value={formData.decision_forego_resus} />
                {formData.decision_forego_resus === "Yes" && formData.decision_forego_resus_reason && (
                  <R label="If yes" value={formData.decision_forego_resus_reason} />
                )}
                <E label="Insufficient time for consent" value={formData.insufficient_time} />
                {formData.insufficient_time === "Yes" && formData.insufficient_time_reason && (
                  <R label="If yes, specify" value={formData.insufficient_time_reason} />
                )}
                <E label="IUFD" value={formData.iufd} />
              </tbody>
            </table>
          </div>

          <div className="pr-section">
            <div className="pr-section-hd">A5 · Consent</div>
            <table className="pr-table"><tbody>
              <R label="Consent" value={formData.consent_given} />
              <R label="Consent taken by" value={formData.consent_taken_by} />
              <R label="Relationship" value={formData.relationship_to_participant} />
              {formData.consent_given === "No" && (
                <R label="Refusal reason" value={formData.reason_for_consent_refusal} />
              )}
              {formData.consent_given === "Not approached" && (
                <R label="Not approached reason" value={formData.reason_not_approached} />
              )}
              {formData.consent_datetime && (
                <R label="Consent date and time" value={fmtDT(formData.consent_datetime)} />
              )}
              <R label="Video PIS shown" value={formData.video_pis_shown} />
              {formData.consent_signature_image && (
                <tr>
                  <td className="pr-td-label">Consent signature</td>
                  <td className="pr-td-value">
                    <img src={formData.consent_signature_image} alt="Consent signature" className="pr-signature-img" />
                    {formData.consent_signature_captured_at && (
                      <div className="pr-signature-caption">Signed {fmtDT(formData.consent_signature_captured_at)}</div>
                    )}
                  </td>
                </tr>
              )}
            </tbody></table>
          </div>
        </div>
      </div>

      {/* SIGNATURE — a blank gap is left above each line for the actual
          wet-ink signature; the printed name/date/PI name and role caption
          sit below the line as labels, so they never overlap the pen mark. */}
      <div className="pr-sig-area">
        <div className="pr-sig-block">
          <div className="pr-sig-space" />
          <div className="pr-sig-line" />
          <div className="pr-sig-name">{v(preparedByName)}</div>
          <div className="pr-sig-cap">Prepared By — Signature</div>
        </div>
        <div className="pr-sig-block pr-sig-block-date">
          <div className="pr-sig-space" />
          <div className="pr-sig-line" />
          <div className="pr-sig-name">
            {formData.consent_datetime ? fmtDate(formData.consent_datetime) : fmtDate(new Date())}
          </div>
          <div className="pr-sig-cap">Date</div>
        </div>
        <div className="pr-sig-block">
          <div className="pr-sig-space" />
          <div className="pr-sig-line" />
          <div className="pr-sig-name">{v(piName)}</div>
          <div className="pr-sig-cap">Principal Investigator — Signature</div>
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
export default function PrintSummary({ formData, preparedByName, piName }) {
  useEffect(() => {
    document.body.classList.add("has-print-summary");
    return () => document.body.classList.remove("has-print-summary");
  }, []);

  // Create/find the portal target on body
  let portalEl = document.getElementById("print-portal");
  if (!portalEl) {
    portalEl = document.createElement("div");
    portalEl.id = "print-portal";
    document.body.appendChild(portalEl);
  }

  return ReactDOM.createPortal(
    <PrintReport formData={formData} preparedByName={preparedByName} piName={piName} />,
    portalEl
  );
}
