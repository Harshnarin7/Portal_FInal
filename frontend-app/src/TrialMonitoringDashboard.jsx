// TrialMonitoringDashboard.jsx — PORTAL Trial Monitoring Dashboard
// Section 1: CONSORT Participant Flow Table
// (Section 2 — Data Quality Indicators — is a separate, later addition.)

import React, { useEffect, useState, useCallback } from "react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./TrialMonitoringDashboard.css";

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

export default function TrialMonitoringDashboard() {
  const { user } = useAuth();
  const isSuperadmin = (user?.role || "").toLowerCase() === "superadmin";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/dashboard/consort");
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load CONSORT flow data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
          <div className="tmd-subtitle">Section 1 — CONSORT Participant Flow</div>
        </div>
        {isSuperadmin && data && (
          <button className="tmd-csv-btn" onClick={downloadCsv}>Download CSV</button>
        )}
      </div>

      <div className="tmd-card">
        {loading && <div className="tmd-state">Loading CONSORT flow…</div>}
        {error && <div className="tmd-state tmd-error">{error}</div>}

        {!loading && !error && data && (
          <>
            <table className="tmd-table">
              <thead>
                <tr>
                  <th className="tmd-label-cell">Label</th>
                  <th className="tmd-num">Overall</th>
                  {data.sites.map((site) => (
                    <th key={site} className="tmd-num">{site}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <Row key={row.box} row={row} sites={data.sites} />
                ))}
              </tbody>
            </table>

            {(data.footnotes || []).map((note, i) => (
              <div key={i} className="tmd-footnote">* {note}</div>
            ))}

            <div className="tmd-timestamp">
              Data as of {new Date(data.generated_at).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
