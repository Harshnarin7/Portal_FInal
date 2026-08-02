// DataQuality.jsx — Section 2 of Trial Monitoring Dashboard
// Data Quality Indicators: completion matrix, daily log status,
// timeliness, action list, site activity

import React, { useEffect, useState, useCallback } from "react";
import api from "./api/axios";
import "./DataQuality.css";

const PCT_CLASS = (pct) => {
  if (pct === null || pct === undefined) return "dq-pct-na";
  if (pct >= 90) return "dq-pct-green";
  if (pct >= 70) return "dq-pct-amber";
  return "dq-pct-red";
};

const STATUS_COLORS = {
  empty:     "#4a4a6a",
  draft:     "#7b6fa0",
  complete:  "#2a7a5a",
  submitted: "#1a9a6a",
  late:      "#b85a2a",
};

function PctBadge({ pct }) {
  if (pct === null || pct === undefined) return <span className="dq-badge dq-pct-na">—</span>;
  return <span className={`dq-badge ${PCT_CLASS(pct)}`}>{pct}%</span>;
}

function Section({ title, children }) {
  return (
    <div className="dq-section">
      <div className="dq-section-title">{title}</div>
      {children}
    </div>
  );
}

function CompletionMatrix({ data, sites }) {
  const { forms, overall, by_site } = data;
  return (
    <div className="dq-scroll-x">
      <table className="dq-table">
        <thead>
          <tr>
            <th className="dq-th-label">Form</th>
            <th className="dq-th-num">Overall</th>
            {sites.map(s => <th key={s} className="dq-th-num">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {forms.map(f => (
            <tr key={f.key} className="dq-tr">
              <td className="dq-td-label">{f.label}</td>
              <td className="dq-td-num">
                <PctBadge pct={overall[f.key]?.pct} />
                <span className="dq-sub">{overall[f.key]?.n}/{overall.total}</span>
              </td>
              {sites.map(s => {
                const sd = by_site[s]?.[f.key];
                return (
                  <td key={s} className="dq-td-num">
                    <PctBadge pct={sd?.pct} />
                    <span className="dq-sub">{sd?.n}/{by_site[s]?.total ?? 0}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBar({ statusObj }) {
  const STATUSES = ["submitted", "complete", "draft", "late", "empty"];
  const total = Object.values(statusObj).reduce((a, b) => a + b, 0);
  if (total === 0) return <span className="dq-na">No entries</span>;
  return (
    <div className="dq-bar-wrap" title={Object.entries(statusObj).map(([k,v]) => `${k}: ${v}`).join(', ')}>
      {STATUSES.map(st => {
        const n = statusObj[st] || 0;
        const w = total ? (n / total) * 100 : 0;
        return w > 0 ? (
          <div
            key={st}
            className="dq-bar-seg"
            style={{ width: `${w}%`, background: STATUS_COLORS[st] }}
            title={`${st}: ${n}`}
          />
        ) : null;
      })}
    </div>
  );
}

function DailyLogStatus({ data, sites }) {
  const STATUSES = ["submitted", "complete", "draft", "late", "empty"];
  return (
    <div>
      <div className="dq-legend">
        {STATUSES.map(st => (
          <span key={st} className="dq-legend-item">
            <span className="dq-legend-dot" style={{ background: STATUS_COLORS[st] }} />
            {st}
          </span>
        ))}
      </div>
      {data.map(tbl => (
        <div key={tbl.table} className="dq-log-row">
          <div className="dq-log-label">{tbl.label}</div>
          <div className="dq-log-bars">
            <div className="dq-log-site-row">
              <span className="dq-site-name">Overall</span>
              <StatusBar statusObj={tbl.overall} />
              <span className="dq-bar-total">{Object.values(tbl.overall).reduce((a,b)=>a+b,0)}</span>
            </div>
            {sites.map(s => (
              <div key={s} className="dq-log-site-row">
                <span className="dq-site-name">{s}</span>
                <StatusBar statusObj={tbl.by_site[s] || {}} />
                <span className="dq-bar-total">{Object.values(tbl.by_site[s] || {}).reduce((a,b)=>a+b,0)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Timeliness({ data, sites }) {
  return (
    <div className="dq-scroll-x">
      <table className="dq-table">
        <thead>
          <tr>
            <th className="dq-th-label">Form / Log</th>
            <th className="dq-th-num">Overall median (IQR)</th>
            {sites.map(s => <th key={s} className="dq-th-num">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.label} className="dq-tr">
              <td className="dq-td-label">{row.label}</td>
              <td className="dq-td-num">
                {row.overall.median !== null
                  ? <>{row.overall.median}h <span className="dq-sub">({row.overall.q1}–{row.overall.q3}) n={row.overall.n}</span></>
                  : <span className="dq-na">—</span>
                }
              </td>
              {sites.map(s => {
                const sd = row.by_site[s];
                return (
                  <td key={s} className="dq-td-num">
                    {sd && sd.median !== null
                      ? <>{sd.median}h <span className="dq-sub">n={sd.n}</span></>
                      : <span className="dq-na">—</span>
                    }
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dq-footnote">* Lag = hours from clinical event date to data entry. Form B: birth → entry. Daily logs: expected day date → saved_at.</p>
    </div>
  );
}

function ActionList({ data, sites }) {
  const hasIssues = data.some(a => a.overall > 0);
  if (!hasIssues) {
    return <div className="dq-all-clear">✓ No outstanding data gaps detected</div>;
  }
  return (
    <div>
      {data.map(item => (
        item.overall > 0 && (
          <div key={item.key} className="dq-action-item">
            <div className="dq-action-label">
              <span className="dq-action-count">{item.overall}</span>
              {item.label}
            </div>
            <div className="dq-action-sites">
              {sites.filter(s => item.by_site[s] > 0).map(s => (
                <span key={s} className="dq-site-chip">
                  {s}: {item.by_site[s]}
                </span>
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  );
}

function SiteActivity({ data, sites }) {
  const { last_entry, inactive_flags, week_labels, weekly_counts } = data;
  return (
    <div className="dq-scroll-x">
      <table className="dq-table">
        <thead>
          <tr>
            <th className="dq-th-label">Site</th>
            <th className="dq-th-num">Last Entry</th>
            <th className="dq-th-num">Status</th>
            {week_labels.map((w, i) => (
              <th key={w} className="dq-th-num">Wk {i + 1}<br/><span className="dq-sub">{w}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sites.map(s => (
            <tr key={s} className="dq-tr">
              <td className="dq-td-label">{s}</td>
              <td className="dq-td-num">{last_entry[s] || <span className="dq-na">—</span>}</td>
              <td className="dq-td-num">
                {inactive_flags[s]
                  ? <span className="dq-badge dq-pct-red">Inactive</span>
                  : <span className="dq-badge dq-pct-green">Active</span>
                }
              </td>
              {(weekly_counts[s] || []).map((n, i) => (
                <td key={i} className="dq-td-num">{n || 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dq-footnote">* Sites with no entry in ≥14 days are flagged Inactive.</p>
    </div>
  );
}

export default function DataQuality() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/dashboard/data-quality");
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load data quality indicators");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="tmd-state">Loading data quality indicators…</div>;
  if (error)   return <div className="tmd-state tmd-error">{error}</div>;
  if (!data)   return null;

  const { sites, completion_matrix, daily_log_status, timeliness, action_list, site_activity } = data;

  return (
    <div className="dq-root">
      <Section title="Panel 1 — Form Completion Matrix">
        <CompletionMatrix data={completion_matrix} sites={sites} />
      </Section>

      <Section title="Panel 2 — Daily Log Submission Status">
        <DailyLogStatus data={daily_log_status} sites={sites} />
      </Section>

      <Section title="Panel 3 — Data Entry Timeliness">
        <Timeliness data={timeliness} sites={sites} />
      </Section>

      <Section title="Panel 4 — Action List (Outstanding Gaps)">
        <ActionList data={action_list} sites={sites} />
      </Section>

      <Section title="Panel 5 — Site Activity (last 4 weeks)">
        <SiteActivity data={site_activity} sites={sites} />
      </Section>

      <div className="tmd-timestamp">Data as of {new Date(data.generated_at).toLocaleString()}</div>
    </div>
  );
}
