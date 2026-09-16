// Per-enrollment form completeness (dashboard completeness-by-enrollment API)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import api from "./api/axios";
import { siteShortCode } from "./utils/siteNames";

const pctColor = (pct) => {
  if (pct === null || pct === undefined) return "dq-pct-na";
  if (pct >= 90) return "dq-pct-green";
  if (pct >= 70) return "dq-pct-amber";
  return "dq-pct-red";
};

function FormFlag({ done }) {
  return done ? (
    <span className="dq-enr-flag dq-enr-flag--yes" title="Present">
      <Check size={14} strokeWidth={2.5} />
    </span>
  ) : (
    <span className="dq-enr-flag dq-enr-flag--no" title="Missing">
      <X size={14} strokeWidth={2.5} />
    </span>
  );
}

export default function EnrollmentCompletenessTable() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enrollmentFilter, setEnrollmentFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/dashboard/completeness-by-enrollment");
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load enrollment completeness");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const forms = data?.forms ?? [];
  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const eQ = enrollmentFilter.trim().toLowerCase();
    const sQ = siteFilter.trim().toLowerCase();
    return list.filter((r) => {
      if (eQ && !(r.enrollment_id || "").toLowerCase().includes(eQ)) return false;
      if (sQ && !(r.site_name || "").toLowerCase().includes(sQ)) return false;
      return true;
    });
  }, [data, enrollmentFilter, siteFilter]);

  const openPatient = (enrollmentId) => {
    if (!enrollmentId) return;
    navigate(`/form-c/${enrollmentId}`);
  };

  if (loading) return <div className="tmd-state">Loading enrollment completeness…</div>;
  if (error) return <div className="tmd-state tmd-error">{error}</div>;
  if (!data) return null;

  return (
    <div className="dq-enr-wrap">
      <div className="dq-enr-filters">
        <label className="dq-enr-filter">
          <span>Enrollment ID</span>
          <input
            type="search"
            className="dq-enr-input"
            placeholder="Filter…"
            value={enrollmentFilter}
            onChange={(e) => setEnrollmentFilter(e.target.value)}
          />
        </label>
        <label className="dq-enr-filter">
          <span>Site</span>
          <input
            type="search"
            className="dq-enr-input"
            placeholder="Filter…"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
          />
        </label>
        <span className="dq-enr-count">
          {rows.length} of {data.rows?.length ?? 0} enrollments
        </span>
      </div>
      <p className="dq-footnote">
        Sorted least complete first. Click a row to open Form C for that patient.
      </p>
      <div className="dq-scroll-x">
        <table className="dq-table dq-enr-table">
          <thead>
            <tr>
              <th className="dq-th-label">Enrollment ID</th>
              <th className="dq-th-num">Site</th>
              {forms.map((f) => (
                <th key={f.key} className="dq-th-num dq-enr-th-form" title={f.label}>
                  {f.label.replace(/^Form [A-Z] — /, "").replace(/ Logs$/, "")}
                </th>
              ))}
              <th className="dq-th-num">Complete</th>
              <th className="dq-th-num">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={forms.length + 4} className="dq-td-label dq-na">
                  No enrollments match your filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.enrollment_id}
                  className="dq-tr dq-enr-row"
                  onClick={() => openPatient(r.enrollment_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPatient(r.enrollment_id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <td className="dq-td-label dq-enr-id">{r.enrollment_id}</td>
                  <td className="dq-td-num">{siteShortCode(r.site_name)}</td>
                  {forms.map((f) => (
                    <td key={f.key} className="dq-td-num">
                      <FormFlag done={!!r[f.key]} />
                    </td>
                  ))}
                  <td className="dq-td-num">
                    {r.completed_count}/{r.total_count}
                  </td>
                  <td className="dq-td-num">
                    <span className={`dq-badge ${pctColor(r.completeness_pct)}`}>
                      {r.completeness_pct}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
