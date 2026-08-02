// ClinicalQuality.jsx — Section 3: Neonatal Clinical Care Quality
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

function fmtMedian(val) {
  if (!val || val.median === null || val.median === undefined) return "—";
  if (val.p25 != null && val.p75 != null) return `${val.median} (${val.p25}–${val.p75}) s`;
  return `${val.median} s`;
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

export default function ClinicalQuality() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/dashboard/clinical-quality")
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.detail || "Failed to load"); setLoading(false); });
  }, []);

  if (loading) return <div className="cq-state">Loading clinical quality data…</div>;
  if (error)   return <div className="cq-state cq-error">{error}</div>;
  if (!data)   return null;

  const sites = Object.keys(data.delivery_room?.by_site || {});

  const drMetrics = [
    { key: "placental_transfusion", label: "Placental transfusion (DCC / Milking)", format: fmtPct },
    { key: "cord_clamp_time",       label: "Cord clamp time — median (IQR) s",     format: fmtMedian },
    { key: "hypothermia_dr",        label: "Hypothermia in DR (temp_dr < 36.5 °C)",format: fmtPctOfDenom },
    { key: "ppv",                   label: "PPV required",                          format: fmtPct },
    { key: "intubation",            label: "Intubation at birth",                   format: fmtPct },
    { key: "chest_compression",     label: "Chest compressions",                    format: fmtPct },
    { key: "adrenaline",            label: "Adrenaline administered",               format: fmtPct },
  ];

  const ghMetrics = [
    { key: "plastic_wrap",     label: "Plastic wrap used",                              format: fmtPct },
    { key: "hypothermia_nicu", label: "Hypothermia on NICU admission (axillary < 36.5 °C)", format: fmtPctOfDenom },
    { key: "early_cpap",       label: "Early CPAP",                                    format: fmtPct },
    { key: "surfactant",       label: "Surfactant required (Day 1)",                    format: fmtPct },
    { key: "caffeine",         label: "Caffeine started (Day 1)",                       format: fmtPct },
    { key: "immediate_kmc",    label: "Immediate KMC",                                  format: fmtPct },
  ];

  const respMetrics = [
    { key: "invasive_vent",   label: "Invasive ventilation (log-days)",        format: fmtPct },
    { key: "cpap",            label: "CPAP (log-days)",                        format: fmtPct },
    { key: "hfnc",            label: "HFNC (log-days)",                        format: fmtPct },
    { key: "room_air",        label: "Room air / no support (log-days)",       format: fmtPct },
    { key: "surfactant_days", label: "Surfactant dose given (log-days)",       format: fmtPct },
    { key: "caffeine_days",   label: "Caffeine (log-days)",                    format: fmtPct },
    { key: "pphn",            label: "PPHN (log-days)",                        format: fmtPct },
    { key: "pulm_hemorrhage", label: "Pulmonary hemorrhage (log-days)",        format: fmtPct },
    { key: "pneumothorax",    label: "Pneumothorax (log-days)",                format: fmtPct },
  ];

  const nutrMetrics = [
    { key: "enteral",           label: "Any enteral feeds (log-days)",   format: fmtPct },
    { key: "ebm",               label: "EBM (log-days)",                 format: fmtPct },
    { key: "pdhm",              label: "PDHM / DHM (log-days)",          format: fmtPct },
    { key: "pn",                label: "Parenteral nutrition (log-days)",format: fmtPct },
    { key: "nec_suspected",     label: "NEC suspected (log-days)",       format: fmtPct },
    { key: "nec_confirmed",     label: "NEC confirmed (log-days)",       format: fmtPct },
    { key: "jaundice_days",     label: "Jaundice (log-days)",            format: fmtPct },
    { key: "phototherapy_days", label: "Phototherapy (log-days)",        format: fmtPct },
  ];

  const infectMetrics = [
    { key: "sepsis_suspected",              label: "Sepsis suspected (log-days)",                    format: fmtPct },
    { key: "culture_sent_when_suspected",   label: "Blood culture sent when sepsis suspected",       format: fmtPctOfDenom },
    { key: "culture_positive",             label: "Culture positive rate",                          format: fmtPctOfDenom },
    { key: "antibiotic_days",              label: "Antibiotic days",                                format: fmtPct },
    { key: "clabsi",                       label: "CLABSI (log-days)",                              format: fmtPct },
    { key: "vap",                          label: "VAP (log-days)",                                 format: fmtPct },
  ];

  return (
    <div className="cq-root">
      <PanelTable title="PANEL 1 — DELIVERY ROOM PRACTICES"
        sites={sites} overall={data.delivery_room.overall} bySite={data.delivery_room.by_site}
        metrics={drMetrics} denomKey="n" />

      <PanelTable title="PANEL 2 — GOLDEN HOUR / NICU ADMISSION"
        sites={sites} overall={data.golden_hour.overall} bySite={data.golden_hour.by_site}
        metrics={ghMetrics} denomKey="n" />

      <PanelTable title="PANEL 3 — DAILY RESPIRATORY SUPPORT"
        sites={sites} overall={data.respiratory.overall} bySite={data.respiratory.by_site}
        metrics={respMetrics} denomKey="n_logs" />

      <PanelTable title="PANEL 4 — NUTRITION"
        sites={sites} overall={data.nutrition.overall} bySite={data.nutrition.by_site}
        metrics={nutrMetrics} denomKey="n_logs" />

      <PanelTable title="PANEL 5 — INFECTION / SEPSIS"
        sites={sites} overall={data.infection.overall} bySite={data.infection.by_site}
        metrics={infectMetrics} denomKey="n_logs" />

      <div className="cq-timestamp">Data as of {new Date(data.generated_at).toLocaleString()}</div>
    </div>
  );
}
