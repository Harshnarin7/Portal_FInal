// SafetyEvents.jsx — Section 5: Adverse Events, SAEs & Major Morbidities
import React, { useEffect, useState } from "react";
import api from "./api/axios";
import "./ClinicalQuality.css";

function fmtPct(val) {
  if (!val || val.n === null || val.n === undefined) return "—";
  if (val.pct === null || val.pct === undefined) return `${val.n}`;
  return `${val.n} (${val.pct}%)`;
}

function SaeSummary({ sites, overall, bySite }) {
  const metrics = [
    { key: "n_sae",      label: "Total SAEs reported" },
    { key: "n_mild",     label: "Mild severity" },
    { key: "n_moderate", label: "Moderate severity" },
    { key: "n_severe",   label: "Severe / life-threatening" },
    { key: "n_related",  label: "Possibly / probably / definitely related" },
    { key: "n_fatal",    label: "Fatal outcome" },
  ];
  return (
    <div className="cq-panel">
      <div className="cq-panel-title">PANEL 1 — SERIOUS ADVERSE EVENTS (SAEs)</div>
      <div className="cq-table-wrap">
        <table className="cq-table">
          <thead>
            <tr>
              <th className="cq-metric-col">Metric</th>
              <th>Overall</th>
              {sites.map(s => <th key={s}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key}>
                <td className="cq-metric-label">{m.label}</td>
                <td className="cq-val">{overall?.[m.key] ?? 0}</td>
                {sites.map(s => (
                  <td key={s} className="cq-val">{bySite[s]?.[m.key] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MortalityPanel({ sites, overall, bySite }) {
  const metrics = [
    { key: "in_hospital",     label: "In-hospital mortality" },
    { key: "at_7_days",       label: "Mortality by 7 days" },
    { key: "at_28_days",      label: "Mortality by 28 days" },
    { key: "after_discharge", label: "Post-discharge mortality" },
  ];
  return (
    <div className="cq-panel">
      <div className="cq-panel-title">PANEL 2 — MORTALITY</div>
      <div className="cq-table-wrap">
        <table className="cq-table">
          <thead>
            <tr>
              <th className="cq-metric-col">Metric</th>
              <th>
                Overall<br/>
                <span className="cq-n">n={overall?.n ?? "—"}</span>
              </th>
              {sites.map(s => (
                <th key={s}>
                  {s}<br/>
                  <span className="cq-n">n={bySite[s]?.n ?? 0}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key}>
                <td className="cq-metric-label">{m.label}</td>
                <td className="cq-val">{fmtPct(overall?.[m.key])}</td>
                {sites.map(s => (
                  <td key={s} className="cq-val">{fmtPct(bySite[s]?.[m.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MorbidityPanel({ sites, overall, bySite }) {
  const metrics = [
    { key: "ivh_any",    label: "IVH (any grade)" },
    { key: "ivh_severe", label: "Severe IVH (grade 3–4)" },
    { key: "nec_any",    label: "NEC (any)" },
    { key: "nec_2plus",  label: "NEC stage ≥ 2" },
    { key: "bpd",        label: "Bronchopulmonary dysplasia (BPD)" },
    { key: "rop_tx",     label: "ROP requiring treatment" },
    { key: "sepsis",     label: "Sepsis (any)" },
    { key: "pneumo",     label: "Pneumothorax" },
  ];
  return (
    <div className="cq-panel">
      <div className="cq-panel-title">PANEL 3 — MAJOR NEONATAL MORBIDITIES</div>
      <div className="cq-table-wrap">
        <table className="cq-table">
          <thead>
            <tr>
              <th className="cq-metric-col">Metric</th>
              <th>
                Overall<br/>
                <span className="cq-n">n={overall?.n ?? "—"}</span>
              </th>
              {sites.map(s => (
                <th key={s}>
                  {s}<br/>
                  <span className="cq-n">n={bySite[s]?.n ?? 0}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key}>
                <td className="cq-metric-label">{m.label}</td>
                <td className="cq-val">{fmtPct(overall?.[m.key])}</td>
                {sites.map(s => (
                  <td key={s} className="cq-val">{fmtPct(bySite[s]?.[m.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SafetyEvents() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/dashboard/safety")
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.detail || "Failed to load"); setLoading(false); });
  }, []);

  if (loading) return <div className="cq-state">Loading safety data…</div>;
  if (error)   return <div className="cq-state cq-error">{error}</div>;
  if (!data)   return null;

  const sites = data.sites || [];

  return (
    <div className="cq-root">
      <SaeSummary
        sites={sites}
        overall={data.sae?.overall}
        bySite={data.sae?.by_site || {}}
      />
      <MortalityPanel
        sites={sites}
        overall={data.mortality?.overall}
        bySite={data.mortality?.by_site || {}}
      />
      <MorbidityPanel
        sites={sites}
        overall={data.morbidity?.overall}
        bySite={data.morbidity?.by_site || {}}
      />
      <div className="cq-timestamp">Data as of {new Date(data.generated_at).toLocaleString()}</div>
    </div>
  );
}
