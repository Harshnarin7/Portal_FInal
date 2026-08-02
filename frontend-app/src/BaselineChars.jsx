// BaselineChars.jsx — Section 4: Baseline Characteristics / Potential Confounders
import React, { useEffect, useState } from "react";
import api from "./api/axios";
import "./ClinicalQuality.css";

function fmtPct(val) {
  if (!val || val.n === null || val.n === undefined) return "—";
  if (val.pct === null || val.pct === undefined) return `${val.n}`;
  return `${val.n} (${val.pct}%)`;
}

function fmtPctOfDenom(val) {
  if (!val || val.n === null || val.n === undefined) return "—";
  const d = val.denominator;
  if (!d) return "—";
  if (val.pct === null || val.pct === undefined) return `${val.n}/${d}`;
  return `${val.n}/${d} (${val.pct}%)`;
}

function fmtMedianIQR(val, unit = "") {
  if (!val || val.median === null || val.median === undefined) return "—";
  const u = unit ? ` ${unit}` : "";
  if (val.p25 != null && val.p75 != null) return `${val.median} (${val.p25}–${val.p75})${u}`;
  return `${val.median}${u}`;
}

function PanelTable({ title, sites, overall, bySite = {}, metrics, denomKey = "n" }) {
  return (
    <div className="cq-panel">
      <div className="cq-panel-title">{title}</div>
      <div className="cq-table-wrap">
        <table className="cq-table">
          <thead>
            <tr>
              <th className="cq-metric-col">Metric</th>
              <th>
                Overall<br />
                <span className="cq-n">n={overall?.[denomKey] ?? "—"}</span>
              </th>
              {sites.map(s => (
                <th key={s}>
                  {s}<br />
                  <span className="cq-n">n={bySite[s]?.[denomKey] ?? 0}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key}>
                <td className="cq-metric-label">{m.label}</td>
                <td className="cq-val">{m.format(overall?.[m.key])}</td>
                {sites.map(s => (
                  <td key={s} className="cq-val">{m.format(bySite[s]?.[m.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BaselineChars() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/dashboard/baseline")
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.detail || "Failed to load"); setLoading(false); });
  }, []);

  if (loading) return <div className="cq-state">Loading baseline characteristics…</div>;
  if (error)   return <div className="cq-state cq-error">{error}</div>;
  if (!data)   return null;

  const sites = Object.keys(data.infant?.by_site || {});

  const infantMetrics = [
    { key: "ga_weeks",       label: "Gestational age — median (IQR) weeks", format: v => fmtMedianIQR(v, "wk") },
    { key: "birth_weight_g", label: "Birth weight — median (IQR) g",        format: v => fmtMedianIQR(v, "g") },
    { key: "male",           label: "Male sex",                              format: fmtPct },
    { key: "dsd",            label: "DSD / ambiguous genitalia",             format: fmtPct },
    { key: "sga",            label: "SGA (centile < 10th)",                  format: fmtPctOfDenom },
    { key: "vaginal",        label: "Vaginal delivery",                      format: fmtPct },
    { key: "lscs",           label: "Caesarean section (LSCS)",             format: fmtPct },
  ];

  const antenatalMetrics = [
    { key: "steroids",          label: "Any antenatal steroids",                          format: fmtPct },
    { key: "complete_steroids", label: "Complete steroid course (≥2 doses of betamethasone / 4 doses of dexamethasone)", format: fmtPctOfDenom },
    { key: "mgso4",             label: "Antenatal MgSO₄",                                format: fmtPct },
    { key: "hdp",               label: "Hypertensive disorder of pregnancy (HDP)",        format: fmtPct },
    { key: "pprom",             label: "Preterm PROM",                                    format: fmtPct },
    { key: "fgr",               label: "Fetal growth restriction (FGR)",                  format: fmtPct },
    { key: "multiple",          label: "Multiple gestation",                              format: fmtPct },
  ];

  return (
    <div className="cq-root">
      <PanelTable
        title="PANEL 1 — INFANT BASELINE CHARACTERISTICS"
        sites={sites}
        overall={data.infant.overall}
        bySite={data.infant.by_site}
        metrics={infantMetrics}
        denomKey="n"
      />
      <PanelTable
        title="PANEL 2 — MATERNAL / ANTENATAL EXPOSURES"
        sites={sites}
        overall={data.antenatal.overall}
        bySite={data.antenatal.by_site}
        metrics={antenatalMetrics}
        denomKey="n"
      />
      <div className="cq-timestamp">Data as of {new Date(data.generated_at).toLocaleString()}</div>
    </div>
  );
}
