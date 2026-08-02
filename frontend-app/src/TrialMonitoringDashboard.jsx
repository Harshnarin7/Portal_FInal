// TrialMonitoringDashboard.jsx — PORTAL Trial Monitoring Dashboard
// Section 1: CONSORT Participant Flow Table
// Section 2: Data Quality Indicators

import React, { useEffect, useState, useCallback } from "react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./TrialMonitoringDashboard.css";
import DataQuality from "./DataQuality";
import ClinicalQuality from "./ClinicalQuality";
import BaselineChars from "./BaselineChars";
import SafetyEvents from "./SafetyEvents";
import EnrollmentForecast from "./EnrollmentForecast";

const ROW_TYPE_CLASS = {
  awaiting: "tmd-row-awaiting",
  ltfu: "tmd-row-ltfu",
  died: "tmd-row-died",
};

function Row({ row, sites, depth = 0 }) {
  const rowClass = ROW_TYPE_CLASS[row.row_type] || "";
  return (
    <>
      <tr className={`tmd-row tmd-depth-${depth} ${rowClass}`}>
        <td className="tmd-label-cell" style={{ paddingLeft: 14 + depth * 18 }}>
          {depth > 0 && <span className="tmd-dash">—</span>}
          {row.label}
        </td>
        <td className="tmd-num tmd-overall">{row.overall}</td>
        {sites.map((site) => (
          <td key={site} className="tmd-num">{row.by_site?.[site] ?? 0}</td>
        ))}
      </tr>
      {(row.sub_rows || []).map((sub, i) => (
        <Row key={`${row.label}-sub-${i}`} row={sub} sites={sites} depth={depth + 1} />
      ))}
      {(row.ltfu_reasons || []).map((sub, i) => (
        <Row key={`${row.label}-reason-${i}`} row={{ ...sub, label: `Reason: ${sub.label}` }} sites={sites} depth={depth + 1} />
      ))}
    </>
  );
}

const SECTIONS = [
  { key: "consort",          label: "Section 1 — CONSORT Flow" },
  { key: "data-quality",     label: "Section 2 — Data Quality" },
  { key: "clinical-quality", label: "Section 3 — Clinical Quality" },
  { key: "baseline",         label: "Section 4 — Baseline Chars" },
  { key: "safety",           label: "Section 5 — Safety & AEs" },
  { key: "enrollment-forecast", label: "Section 6 — Enrolment Forecast" },
];

export default function TrialMonitoringDashboard() {
  const { user } = useAuth();
  const isSuperadmin = (user?.role || "").toLowerCase() === "superadmin";
  const [activeSection, setActiveSection] = useState("consort");

  const [consortData, setConsortData] = useState(null);
  const [consortLoading, setConsortLoading] = useState(true);
  const [consortError, setConsortError] = useState(null);

  const loadConsort = useCallback(async () => {
    setConsortLoading(true);
    setConsortError(null);
    try {
      const res = await api.get("/dashboard/consort");
      setConsortData(res.data);
    } catch (err) {
      setConsortError(err.response?.data?.detail || "Failed to load CONSORT flow data");
    } finally {
      setConsortLoading(false);
    }
  }, []);

  useEffect(() => { loadConsort(); }, [loadConsort]);

  const downloadCsv = async () => {
    try {
      const res = await api.get("/dashboard/consort?format=csv", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "consort_flow.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("CSV export failed.");
    }
  };

  return (
    <div className="tmd-root">
      <div className="tmd-topbar">
        <div>
          <div className="tmd-title">Trial Monitoring Dashboard</div>
          <div className="tmd-section-tabs">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                className={`tmd-tab ${activeSection === s.key ? "tmd-tab-active" : ""}`}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {isSuperadmin && consortData && activeSection === "consort" && (
          <button className="tmd-csv-btn" onClick={downloadCsv}>Download CSV</button>
        )}
      </div>

      {activeSection === "consort" && (
        <div className="tmd-card">
          {consortLoading && <div className="tmd-state">Loading CONSORT flow…</div>}
          {consortError && <div className="tmd-state tmd-error">{consortError}</div>}

          {!consortLoading && !consortError && consortData && (
            <>
              <table className="tmd-table">
                <thead>
                  <tr>
                    <th className="tmd-label-cell">Label</th>
                    <th className="tmd-num">Overall</th>
                    {consortData.sites.map((site) => (
                      <th key={site} className="tmd-num">{site}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consortData.rows.map((row) => (
                    <Row key={row.box} row={row} sites={consortData.sites} />
                  ))}
                </tbody>
              </table>

              {(consortData.footnotes || []).map((note, i) => (
                <div key={i} className="tmd-footnote">* {note}</div>
              ))}

              <div className="tmd-timestamp">
                Data as of {new Date(consortData.generated_at).toLocaleString()}
              </div>
            </>
          )}
        </div>
      )}

      {activeSection === "data-quality" && (
        <div className="tmd-card">
          <DataQuality />
        </div>
      )}

      {activeSection === "clinical-quality" && (
        <div className="tmd-card">
          <ClinicalQuality />
        </div>
      )}

      {activeSection === "baseline" && (
        <div className="tmd-card">
          <BaselineChars />
        </div>
      )}

      {activeSection === "safety" && (
        <div className="tmd-card">
          <SafetyEvents />
        </div>
      )}

      {activeSection === "enrollment-forecast" && (
        <div className="tmd-card">
          <EnrollmentForecast />
        </div>
      )}
    </div>
  );
}
